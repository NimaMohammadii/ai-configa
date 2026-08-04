import { requireDb } from "../state.js";
import {
  buildTtsAudioFileName,
  ensureTtsHistoryTable,
  getNextTtsFileSequence,
} from "../tts-history.js";
import {
  AUDIO_LINK_TTL_SECONDS,
  AUDIO_PATH_PREFIX,
} from "./constants.js";
import { randomToken, sha256Hex } from "./crypto.js";
import { methodNotAllowed } from "./http.js";

const AUDIO_CONTENT_TYPE = "audio/mpeg";

export function isChatGptAudioRequest(request) {
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith(AUDIO_PATH_PREFIX);
}

export async function storeChatGptAudio(env, input) {
  requireDb(env);
  requireAudioBucket(env);
  await ensureTtsHistoryTable(env);

  const userId = String(input.userId);
  const historyId = crypto.randomUUID();
  const fileSequence = await getNextTtsFileSequence(env, userId);
  const filename = buildTtsAudioFileName(fileSequence);
  const storageKey = buildStorageKey(userId, historyId);
  const audio = toArrayBuffer(input.audio);

  await env.EXPLORE_MEDIA.put(storageKey, audio, {
    httpMetadata: {
      contentType: AUDIO_CONTENT_TYPE,
      cacheControl: "private, max-age=0, no-store",
      contentDisposition: `inline; filename="${filename}"`,
    },
    customMetadata: {
      kind: "chatgpt-tts-audio",
      userId,
      historyId,
    },
  });

  try {
    await env.DB.prepare(
      "INSERT INTO tts_history (" +
        "id, user_id, text, voice, language, credits, file_sequence, audio_base64, " +
        "file_id, file_type, telegram_message_id, source, audio_r2_key, audio_mime, " +
        "alignment_json, edit_revision, created_at" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, NULL, 'chatgpt', ?, ?, '', 0, CURRENT_TIMESTAMP)"
    ).bind(
      historyId,
      userId,
      String(input.text || ""),
      String(input.voice || ""),
      String(input.language || "en"),
      Number(input.credits || 0),
      fileSequence,
      storageKey,
      AUDIO_CONTENT_TYPE,
    ).run();

    const audioUrl = await createAudioLink(
      env,
      input.origin,
      userId,
      historyId,
    );

    return {
      historyId,
      fileSequence,
      filename,
      storageKey,
      audioUrl,
    };
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM tts_history WHERE id = ? AND user_id = ?"
    ).bind(historyId, userId).run().catch(() => null);

    await env.EXPLORE_MEDIA.delete(storageKey).catch(() => null);
    throw error;
  }
}

export async function createAudioLink(env, origin, userId, historyId) {
  requireDb(env);

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + AUDIO_LINK_TTL_SECONDS * 1000,
  );

  await env.DB.prepare(
    "DELETE FROM chatgpt_audio_links WHERE expires_at < ?"
  ).bind(createdAt.toISOString()).run().catch(() => null);

  await env.DB.prepare(
    "INSERT INTO chatgpt_audio_links (" +
      "token_hash, user_id, history_id, created_at, expires_at" +
    ") VALUES (?, ?, ?, ?, ?)"
  ).bind(
    tokenHash,
    String(userId),
    String(historyId),
    createdAt.toISOString(),
    expiresAt.toISOString(),
  ).run();

  return String(origin).replace(/\/$/, "") + AUDIO_PATH_PREFIX + token;
}

export async function handleChatGptAudioRequest(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  requireDb(env);
  requireAudioBucket(env);

  const pathname = new URL(request.url).pathname;
  const token = decodeURIComponent(pathname.slice(AUDIO_PATH_PREFIX.length));

  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) {
    return new Response("Not Found", { status: 404 });
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT l.expires_at, h.audio_r2_key, h.audio_mime, h.file_sequence " +
    "FROM chatgpt_audio_links l " +
    "JOIN tts_history h ON h.id = l.history_id AND h.user_id = l.user_id " +
    "WHERE l.token_hash = ?"
  ).bind(tokenHash).first();

  if (!row || isExpired(row.expires_at) || !row.audio_r2_key) {
    return new Response("Not Found", {
      status: 404,
      headers: noStoreCorsHeaders(),
    });
  }

  const range = request.headers.get("range");
  const object = request.method === "HEAD"
    ? await env.EXPLORE_MEDIA.head(String(row.audio_r2_key))
    : await env.EXPLORE_MEDIA.get(
        String(row.audio_r2_key),
        range ? { range: request.headers } : undefined,
      );

  if (!object) {
    return new Response("Not Found", {
      status: 404,
      headers: noStoreCorsHeaders(),
    });
  }

  const headers = noStoreCorsHeaders();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }

  const filename = buildTtsAudioFileName(Number(row.file_sequence || 1));
  headers.set("Content-Type", String(row.audio_mime || AUDIO_CONTENT_TYPE));
  headers.set("Content-Disposition", `inline; filename="${filename}"`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-Content-Type-Options", "nosniff");

  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }

  let status = 200;
  if (
    range &&
    object.range &&
    Number.isFinite(object.range.offset) &&
    Number.isFinite(object.range.length)
  ) {
    const start = object.range.offset;
    const length = object.range.length;
    headers.set(
      "Content-Range",
      `bytes ${start}-${start + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
    status = 206;
  } else if (Number.isFinite(object.size)) {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status,
    headers,
  });
}

export async function refundChatGptCredits(env, userId, amount, metadata = null) {
  requireDb(env);

  const credits = Number(amount || 0);
  if (!Number.isFinite(credits) || credits <= 0) {
    return;
  }

  const refundId = crypto.randomUUID();
  const metadataJson = JSON.stringify({
    ...(metadata || {}),
    refund: true,
  });

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ?"
    ).bind(credits, String(userId)),
    env.DB.prepare(
      "INSERT INTO credit_usage_log (" +
        "id, user_id, credits, reason, metadata, created_at" +
      ") VALUES (?, ?, ?, 'chatgpt_tts_refund', ?, CURRENT_TIMESTAMP)"
    ).bind(
      refundId,
      String(userId),
      -credits,
      metadataJson,
    ),
  ]);
}

function buildStorageKey(userId, historyId) {
  const safeUserId = encodeURIComponent(String(userId));
  return `chatgpt-audio/${safeUserId}/${historyId}.mp3`;
}

function requireAudioBucket(env) {
  if (!env.EXPLORE_MEDIA) {
    throw new Error("Audio storage is not configured.");
  }
}

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }

  throw new Error("Generated audio is invalid.");
}

function isExpired(value) {
  const timestamp = Date.parse(String(value || ""));
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function noStoreCorsHeaders() {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
}
