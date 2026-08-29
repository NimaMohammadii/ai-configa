import { getContainer } from "@cloudflare/containers";
import { normalizeInstagramUrl } from "./mini-app/vexa-live/instagram-download.js";

const INSTAGRAM_WEBHOOK_PATH = "/api/instagram/webhook";
const INSTAGRAM_MEDIA_PATH = "/api/instagram/media";
const DEFAULT_GRAPH_VERSION = "v26.0";
const MEDIA_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const INSTAGRAM_DM_CONTAINER_PREFIX = "instagram-dm-";
const SHARE_ATTACHMENT_TYPES = new Set(["ig_reel", "reel", "ig_post", "post", "share"]);
const SHARE_ATTACHMENT_PRIORITY = new Map([
  ["ig_post", 5],
  ["ig_reel", 4],
  ["reel", 3],
  ["post", 2],
  ["share", 1],
]);

let instagramMessagingTablesReady = null;

export function isInstagramMessagingRequest(request) {
  const path = new URL(request.url).pathname;
  return path === INSTAGRAM_WEBHOOK_PATH || path === INSTAGRAM_MEDIA_PATH;
}

export async function handleInstagramMessagingRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === INSTAGRAM_WEBHOOK_PATH) {
    if (request.method === "GET") return verifyInstagramWebhook(url, env);
    if (request.method === "POST") return receiveInstagramWebhook(request, env, ctx);
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (url.pathname === INSTAGRAM_MEDIA_PATH) {
    if (request.method === "GET" || request.method === "HEAD") {
      return relayInstagramMedia(request, env);
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  return new Response("Not Found", { status: 404 });
}

function verifyInstagramWebhook(url, env) {
  const mode = String(url.searchParams.get("hub.mode") || "");
  const challenge = String(url.searchParams.get("hub.challenge") || "");
  const receivedToken = String(url.searchParams.get("hub.verify_token") || "");
  const expectedToken = String(env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "");

  if (
    mode === "subscribe" &&
    challenge &&
    expectedToken &&
    constantTimeStringEqual(receivedToken, expectedToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

async function receiveInstagramWebhook(request, env, ctx) {
  const rawBody = await request.arrayBuffer();
  const signature = String(request.headers.get("X-Hub-Signature-256") || "");
  const validSignature = await verifyMetaSignature(rawBody, signature, env.INSTAGRAM_APP_SECRET);
  if (!validSignature) return new Response("Invalid signature", { status: 401 });

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (String(payload?.object || "") !== "instagram") {
    return webhookAccepted();
  }

  const events = extractSharedMediaEvents(payload, new URL(request.url).origin);
  if (events.length) {
    const processing = Promise.allSettled(events.map((event) => processSharedMediaEvent(env, event)));
    if (ctx?.waitUntil) ctx.waitUntil(processing);
    else await processing;
  }

  return webhookAccepted();
}

function webhookAccepted() {
  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function extractSharedMediaEvents(payload, origin) {
  const events = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const igAccountId = cleanNumericId(entry?.id);
    if (!igAccountId) continue;

    for (const item of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const senderId = cleanNumericId(item?.sender?.id);
      const recipientId = cleanNumericId(item?.recipient?.id);
      const message = item?.message;
      const mid = cleanMessageId(message?.mid);
      if (
        !senderId ||
        !recipientId ||
        recipientId !== igAccountId ||
        senderId === igAccountId ||
        !mid ||
        message?.is_echo
      ) {
        continue;
      }

      const attachment = preferredShareAttachment(message?.attachments);
      if (!attachment) continue;
      const sourceUrl = normalizeInstagramUrl(attachment?.payload?.url);
      if (!sourceUrl) continue;

      const attachmentType = String(attachment.type || "").toLowerCase();
      events.push({
        mid,
        senderId,
        igAccountId,
        sourceUrl,
        attachmentType,
        origin,
      });
    }
  }
  return events;
}

function preferredShareAttachment(attachments) {
  let selected = null;
  let selectedPriority = 0;
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const type = String(attachment?.type || "").toLowerCase();
    if (!SHARE_ATTACHMENT_TYPES.has(type)) continue;
    if (!normalizeInstagramUrl(attachment?.payload?.url)) continue;
    const priority = SHARE_ATTACHMENT_PRIORITY.get(type) || 0;
    if (priority > selectedPriority) {
      selected = attachment;
      selectedPriority = priority;
    }
  }
  return selected;
}

async function processSharedMediaEvent(env, event) {
  if (!env.DB) throw new Error("Instagram messaging requires D1");
  if (!env.VEXA_INSTAGRAM) throw new Error("Instagram downloader is unavailable");
  const accessToken = String(env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("Instagram access token is not configured");

  await ensureInstagramMessagingTables(env);
  if (!(await claimInstagramMessage(env, event.mid))) return { ok: true, duplicate: true };

  try {
    const sourceUrl = normalizeInstagramUrl(event.sourceUrl);
    if (!sourceUrl) throw new Error("Instagram shared post URL is invalid");

    const container = getContainer(
      env.VEXA_INSTAGRAM,
      INSTAGRAM_DM_CONTAINER_PREFIX + safeContainerKey(event.igAccountId),
    );
    const catalog = await container.getInstagramCatalog(sourceUrl);
    const selected = preferredVideoOption(catalog?.options);
    if (!selected) throw new Error("Instagram did not expose a downloadable MP4 video");

    const token = randomToken(32);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + MEDIA_TOKEN_TTL_SECONDS;
    const fileName = safeFilename(selected.filename || "Vexa-Instagram.mp4");

    await env.DB.prepare(
      "INSERT INTO instagram_dm_media_tokens " +
      "(token, source_url, ig_account_id, format_id, media_type, file_name, created_at, expires_at) " +
      "VALUES (?, ?, ?, ?, 'video', ?, ?, ?)"
    ).bind(
      token,
      sourceUrl,
      event.igAccountId,
      String(selected.formatId),
      fileName,
      now,
      expiresAt,
    ).run();

    const mediaUrl = new URL(INSTAGRAM_MEDIA_PATH, event.origin);
    mediaUrl.searchParams.set("token", token);

    try {
      await sendInstagramMedia(env, event.igAccountId, event.senderId, "video", mediaUrl.toString());
    } catch (error) {
      console.warn("Instagram video reply failed; falling back to a download link", publicLog(error));
      mediaUrl.searchParams.set("download", "1");
      await sendInstagramText(
        env,
        event.igAccountId,
        event.senderId,
        "Video ready ↓\n" + mediaUrl.toString(),
      );
    }

    await markInstagramMessage(env, event.mid, "completed");
    return { ok: true, deliveredAs: "video" };
  } catch (error) {
    await markInstagramMessage(env, event.mid, "failed").catch(() => null);
    console.error("Instagram shared media processing failed", publicLog(error));
    await sendInstagramText(
      env,
      event.igAccountId,
      event.senderId,
      "Couldn’t prepare this video. Please try again.",
    ).catch(() => null);
    throw error;
  }
}

function preferredVideoOption(options) {
  const candidates = Array.isArray(options) ? options : [];
  for (const option of candidates) {
    if (
      String(option?.kind || "video") === "video" &&
      String(option?.formatId || "").trim() &&
      String(option?.filename || "").trim()
    ) return option;
  }
  return null;
}

async function sendInstagramMedia(env, igAccountId, recipientId, mediaType, mediaUrl) {
  return instagramSend(env, igAccountId, {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: mediaType,
        payload: { url: mediaUrl },
      },
    },
  });
}

async function sendInstagramText(env, igAccountId, recipientId, text) {
  return instagramSend(env, igAccountId, {
    recipient: { id: recipientId },
    message: { text: String(text || "").slice(0, 1000) },
  });
}

async function instagramSend(env, igAccountId, body) {
  const accessToken = String(env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("Instagram access token is not configured");
  const version = graphVersion(env.INSTAGRAM_GRAPH_VERSION);
  const endpoint = `https://graph.instagram.com/${version}/${encodeURIComponent(igAccountId)}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok || !data?.message_id) {
    const detail = String(data?.error?.message || text || "Instagram send failed").slice(0, 500);
    throw new Error(`Instagram send failed (${response.status}): ${detail}`);
  }
  return data;
}

async function relayInstagramMedia(request, env) {
  if (!env.DB || !env.VEXA_INSTAGRAM) return new Response("Unavailable", { status: 503 });
  const url = new URL(request.url);
  const token = cleanRelayToken(url.searchParams.get("token"));
  if (!token) return new Response("Not Found", { status: 404 });

  await ensureInstagramMessagingTables(env);
  const row = await env.DB.prepare(
    "SELECT source_url, ig_account_id, format_id, media_type, file_name, expires_at " +
    "FROM instagram_dm_media_tokens WHERE token = ?"
  ).bind(token).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    return new Response("Download link expired", { status: 410 });
  }

  const sourceUrl = normalizeInstagramUrl(row.source_url);
  const formatId = String(row.format_id || "").trim();
  if (!sourceUrl || !formatId || String(row.media_type || "") !== "video") {
    return new Response("Unavailable", { status: 410 });
  }

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
  if (url.searchParams.get("download") === "1") {
    headers.set("Content-Disposition", `attachment; filename="${safeFilename(row.file_name)}"`);
  }
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  try {
    const container = getContainer(
      env.VEXA_INSTAGRAM,
      INSTAGRAM_DM_CONTAINER_PREFIX + safeContainerKey(row.ig_account_id),
    );
    const stream = await container.streamInstagramVideo(sourceUrl, formatId);
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    console.error("Instagram DM delivery stream failed", publicLog(error));
    return new Response("Media is no longer available", { status: 502 });
  }
}

async function ensureInstagramMessagingTables(env) {
  if (!instagramMessagingTablesReady) {
    instagramMessagingTablesReady = (async () => {
      await Promise.all([
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS processed_instagram_dm_messages (" +
          "mid TEXT PRIMARY KEY, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
        ).run(),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS instagram_dm_media_tokens (" +
          "token TEXT PRIMARY KEY, source_url TEXT NOT NULL, ig_account_id TEXT NOT NULL DEFAULT '', " +
          "format_id TEXT NOT NULL DEFAULT '', media_type TEXT NOT NULL, file_name TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
        ).run(),
      ]);
      await addInstagramDmColumn(env, "ig_account_id", "TEXT NOT NULL DEFAULT ''");
      await addInstagramDmColumn(env, "format_id", "TEXT NOT NULL DEFAULT ''");
    })().catch((error) => {
      instagramMessagingTablesReady = null;
      throw error;
    });
  }
  await instagramMessagingTablesReady;

  const now = Math.floor(Date.now() / 1000);
  if (Math.random() < 0.02) {
    await Promise.all([
      env.DB.prepare("DELETE FROM instagram_dm_media_tokens WHERE expires_at < ?").bind(now).run(),
      env.DB.prepare(
        "DELETE FROM processed_instagram_dm_messages WHERE updated_at < ?"
      ).bind(now - 7 * 24 * 60 * 60).run(),
    ]).catch(() => null);
  }
}

async function addInstagramDmColumn(env, name, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE instagram_dm_media_tokens ADD COLUMN ${name} ${definition}`).run();
  } catch (error) {
    if (!/duplicate column name/i.test(String(error?.message || ""))) throw error;
  }
}

async function claimInstagramMessage(env, mid) {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "INSERT INTO processed_instagram_dm_messages (mid, status, created_at, updated_at) VALUES (?, 'processing', ?, ?) " +
    "ON CONFLICT(mid) DO UPDATE SET status = 'processing', updated_at = excluded.updated_at " +
    "WHERE processed_instagram_dm_messages.status = 'failed'"
  ).bind(mid, now, now).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function markInstagramMessage(env, mid, status) {
  await env.DB.prepare(
    "UPDATE processed_instagram_dm_messages SET status = ?, updated_at = ? WHERE mid = ?"
  ).bind(String(status), Math.floor(Date.now() / 1000), mid).run();
}

async function verifyMetaSignature(rawBody, headerValue, appSecretValue) {
  const appSecret = String(appSecretValue || "").trim();
  const signature = String(headerValue || "").trim();
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = hexToBytes(signature.slice(7));
  if (!expected) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, expected, rawBody);
}

function hexToBytes(value) {
  const hex = String(value || "");
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeStringEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function safeContainerKey(value) {
  const key = String(value || "default").replace(/[^A-Za-z0-9_-]/g, "");
  return (key || "default").slice(0, 80);
}

function cleanNumericId(value) {
  const id = String(value || "").trim();
  return /^\d{4,40}$/.test(id) ? id : "";
}

function cleanMessageId(value) {
  const id = String(value || "").trim();
  return id && id.length <= 700 ? id : "";
}

function cleanRelayToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{32,80}$/.test(token) ? token : "";
}

function graphVersion(value) {
  const version = String(value || "").trim();
  return /^v\d{1,2}\.\d$/u.test(version) ? version : DEFAULT_GRAPH_VERSION;
}

function randomToken(bytesLength) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeFilename(value) {
  const cleaned = String(value || "Vexa-Instagram").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "Vexa-Instagram";
}


function publicLog(error) {
  return String(error?.message || error || "Unknown error").replace(/\s+/g, " ").slice(0, 700);
}
