import { DurableObject } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";
import { authenticateMiniAppPayload } from "../auth.js";
import {
  getTelegramYouTubeOptions,
  normalizeBotMediaUrl,
} from "./youtube-download-exec.js";

const SESSION_PATH = "/mini-app/live/api/youtube-download/session";
const PROGRESS_PATH = "/mini-app/live/api/youtube-download/progress";
const SAVE_PATH = "/mini-app/live/api/youtube-download/save";
const DIRECT_DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";
export const DOWNLOAD_PROGRESS_RUNTIME_PATH = "/mini-app/vexa-live/download-progress.js";

const FILE_NAME = "Vexa-video.mp4";
const SESSION_TTL_SECONDS = 60 * 60;
const SAVE_STORAGE_PREFIX = "vexa-download-save/";
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 750;
let progressTableReady = null;

export class VexaDownloadProgressHub extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/socket") {
      if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("WebSocket Required", { status: 426 });
      }
      const session = cleanToken(url.searchParams.get("session"));
      if (!session) return new Response("Invalid session", { status: 400 });
      await ensureProgressTable(this.env);
      const row = await readProgressRow(this.env, session);
      if (!row || Number(row.expires_at || 0) <= Math.floor(Date.now() / 1000)) {
        return new Response("Download session expired", { status: 410 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      try { server.serializeAttachment({ session }); } catch (error) {}
      try { server.send(JSON.stringify(progressPayload(row))); } catch (error) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      const payload = await request.json().catch(() => ({}));
      const session = cleanToken(payload?.session);
      if (!session) return new Response("Invalid session", { status: 400 });
      const message = JSON.stringify({
        ok: true,
        totalBytes: positiveInteger(payload?.totalBytes),
        downloadedBytes: Math.max(0, Number(payload?.downloadedBytes || 0)),
        percent: Math.max(0, Math.min(100, Number(payload?.percent || 0))),
        status: String(payload?.status || "ready"),
        error: payload?.error ? String(payload.error) : "",
        saveReady: Boolean(payload?.saveReady),
        updatedAt: Number(payload?.updatedAt || 0),
      });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          const attachment = socket.deserializeAttachment?.();
          if (!attachment?.session || attachment.session === session) socket.send(message);
        } catch (error) {}
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Not Found", { status: 404 });
  }

  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}

export function isTrackedYouTubeDownloadRequest(request) {
  const url = new URL(request.url);
  if (
    url.pathname === SESSION_PATH ||
    url.pathname === PROGRESS_PATH ||
    url.pathname === SAVE_PATH ||
    url.pathname === DOWNLOAD_PROGRESS_RUNTIME_PATH
  ) {
    return true;
  }
  return url.pathname === DIRECT_DOWNLOAD_PATH && Boolean(cleanToken(url.searchParams.get("session")));
}

export async function handleTrackedYouTubeDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === DOWNLOAD_PROGRESS_RUNTIME_PATH) {
    return new Response(DOWNLOAD_PROGRESS_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && url.pathname === SESSION_PATH) {
    return createDownloadSession(request, env, ctx);
  }
  if (request.method === "GET" && url.pathname === PROGRESS_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      return openDownloadProgressSocket(request, env);
    }
    return readDownloadProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === SAVE_PATH) {
    return serveSavedDownload(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DIRECT_DOWNLOAD_PATH) {
    if (request.method === "HEAD") return directDownloadHead(request, env);
    return trackedDownload(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendDownloadProgressRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + DOWNLOAD_PROGRESS_RUNTIME_PATH + '?v=20260826-9"></script>';
  const html = source.includes(DOWNLOAD_PROGRESS_RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function createDownloadSession(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const downloadToken = cleanToken(payload.downloadToken);
  if (!downloadToken) return json({ error: "Download session is invalid" }, 400);

  const row = await env.DB.prepare(
    "SELECT user_id, source_url, expires_at FROM vexa_youtube_download_tokens WHERE token = ?"
  ).bind(downloadToken).first();

  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Download session expired. Prepare the video again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Download session does not belong to this user" }, 403);
  }

  const normalized = normalizeBotMediaUrl(row.source_url);
  if (!normalized?.url || !env.VEXA_MEDIA) {
    return json({ error: "Download source is unavailable" }, 503);
  }

  let prepared;
  try {
    prepared = await getTelegramYouTubeOptions(env, user.id, normalized.url);
  } catch (error) {
    console.error("Vexa download quality metadata failed", error?.stack || error);
    return json({ error: String(error?.message || "Could not inspect video qualities") }, 502);
  }

  const videos = Array.isArray(prepared?.options)
    ? prepared.options.filter((option) =>
        option?.kind === "video" &&
        /^v\d{2,4}$/u.test(String(option?.key || "")) &&
        positiveInteger(option?.sizeBytes) &&
        String(option?.selector || "").trim())
    : [];
  if (!videos.length) return json({ error: "Video quality is unavailable" }, 500);

  const requestedOptionKey = cleanOptionKey(payload.optionKey);
  if (!requestedOptionKey) {
    return json({
      ok: true,
      chooseQuality: true,
      title: String(prepared?.title || "Video"),
      options: videos.map((option) => ({
        key: String(option.key),
        label: String(option.label || (positiveInteger(option.height) ? positiveInteger(option.height) + "p" : option.key)),
        sizeBytes: positiveInteger(option.sizeBytes),
        width: positiveInteger(option.width),
        height: positiveInteger(option.height),
        duration: positiveNumber(option.duration),
      })),
    });
  }

  const selected = videos.find((option) => String(option.key || "") === requestedOptionKey) || null;
  if (!selected) return json({ error: "Selected video quality is unavailable" }, 409);

  const mediaInfo = {
    totalBytes: positiveInteger(selected.sizeBytes),
    title: String(prepared?.title || "Video"),
    strategyId: String(prepared?.strategyId || ""),
    formatId: String(selected.selector || ""),
    transport: String(selected.transport || ""),
    provider: String(prepared?.provider || "youtube"),
    duration: positiveNumber(selected.duration),
    optionKey: String(selected.key || ""),
  };
  const totalBytes = positiveInteger(mediaInfo.totalBytes);
  if (!totalBytes) return json({ error: "Video size is unavailable" }, 500);

  await ensureProgressTable(env);
  const session = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_progress " +
    "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at, " +
    "source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key, save_key) " +
    "VALUES (?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
  ).bind(
    session,
    downloadToken,
    String(user.id),
    totalBytes,
    now,
    now,
    now + SESSION_TTL_SECONDS,
    normalized.url,
    mediaInfo.strategyId,
    mediaInfo.formatId,
    mediaInfo.transport,
    mediaInfo.provider,
    mediaInfo.duration,
    mediaInfo.optionKey,
  ).run();

  ctx?.waitUntil?.(cleanupExpiredSavedDownloads(env, now).catch((error) => {
    console.warn("Vexa saved-download cleanup failed", error?.message || error);
  }));

  return json({
    ok: true,
    fileName: FILE_NAME,
    fileSize: totalBytes,
    title: String(mediaInfo.title || "Video"),
    optionKey: mediaInfo.optionKey,
    downloadUrl: DIRECT_DOWNLOAD_PATH + "?token=" + encodeURIComponent(downloadToken) + "&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    saveUrl: SAVE_PATH + "?token=" + encodeURIComponent(downloadToken) + "&session=" + encodeURIComponent(session),
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function openDownloadProgressSocket(request, env) {
  if (!env.VEXA_DOWNLOAD_PROGRESS) return json({ error: "Download progress is unavailable" }, 503);
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Download session is invalid" }, 400);
  await ensureProgressTable(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Download session expired" }, 410);
  const id = env.VEXA_DOWNLOAD_PROGRESS.idFromName(session);
  const stub = env.VEXA_DOWNLOAD_PROGRESS.get(id);
  const target = new URL("https://vexa-download-progress/socket");
  target.searchParams.set("session", session);
  return stub.fetch(new Request(target.href, request));
}

async function readDownloadProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Download session is invalid" }, 400);
  await ensureProgressTable(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Download session expired" }, 410);
  return json(progressPayload(row));
}

async function readProgressRow(env, session) {
  return env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, save_key, updated_at, expires_at FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();
}

function progressPayload(row) {
  const totalBytes = positiveInteger(row?.total_bytes);
  const downloadedBytes = Math.max(0, Number(row?.downloaded_bytes || 0));
  const status = String(row?.status || "ready");
  return {
    ok: true,
    totalBytes,
    downloadedBytes,
    percent: progressPercent(downloadedBytes, totalBytes, status),
    status,
    error: row?.error ? String(row.error) : "",
    saveReady: status === "completed" && Boolean(savedDownloadStorageKey(row?.save_key)),
    updatedAt: Number(row?.updated_at || 0),
  };
}

async function directDownloadHead(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const downloadToken = cleanToken(url.searchParams.get("token"));
  const checked = await validateTrackedSession(env, session, downloadToken);
  if (checked.response) return checked.response;
  const totalBytes = positiveInteger(checked.row.total_bytes);
  const headers = trackedDownloadHeaders();
  if (totalBytes) headers.set("Content-Length", String(totalBytes));
  return new Response(null, { status: 200, headers });
}

async function serveSavedDownload(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const downloadToken = cleanToken(url.searchParams.get("token"));
  const checked = await validateTrackedSession(env, session, downloadToken);
  if (checked.response) return checked.response;
  if (String(checked.row.status || "") !== "completed") {
    return json({ error: "Saved video is not ready yet" }, 409);
  }
  const key = savedDownloadStorageKey(checked.row.save_key);
  if (!key || !env.EXPLORE_MEDIA) return json({ error: "Saved video is unavailable" }, 404);

  if (request.method === "HEAD") {
    const head = await env.EXPLORE_MEDIA.head(key);
    if (!head) return json({ error: "Saved video is unavailable" }, 404);
    return new Response(null, { status: 200, headers: savedDownloadHeaders(head.size) });
  }

  const object = await env.EXPLORE_MEDIA.get(key);
  if (!object?.body) return json({ error: "Saved video is unavailable" }, 404);
  return new Response(object.body, {
    status: 200,
    headers: savedDownloadHeaders(object.size),
  });
}

async function trackedDownload(request, env, ctx) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const downloadToken = cleanToken(url.searchParams.get("token"));
  const checked = await validateTrackedSession(env, session, downloadToken);
  if (checked.response) return checked.response;

  const previousSaveKey = savedDownloadStorageKey(checked.row.save_key);
  if (previousSaveKey && env.EXPLORE_MEDIA) {
    await env.EXPLORE_MEDIA.delete(previousSaveKey).catch(() => null);
  }
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET save_key = NULL WHERE session = ?"
  ).bind(session).run().catch(() => null);

  let totalBytes = positiveInteger(checked.row.total_bytes);
  await writeProgress(env, session, 0, "preparing", "", totalBytes);

  let sourceStream = null;
  let responseSize = 0;
  try {
    const sourceUrl = String(checked.row.source_url || "");
    const strategyId = String(checked.row.strategy_id || "");
    const formatId = String(checked.row.format_id || "");
    const transport = String(checked.row.transport || "");
    const provider = String(checked.row.provider || "youtube");
    if (!sourceUrl || !strategyId || !formatId) {
      throw new Error("Prepared download state is unavailable");
    }

    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(checked.row.user_id));
    if (provider === "pornhub") {
      const prepared = await container.streamVideo(
        sourceUrl,
        strategyId,
        formatId,
        transport,
        0,
        true,
      );
      sourceStream = prepared?.stream || null;
      responseSize = positiveInteger(prepared?.sizeBytes);
      if (responseSize) {
        totalBytes = responseSize;
        await updateProgressTotal(env, session, responseSize).catch(() => null);
      }
    } else {
      sourceStream = await container.streamVideo(
        sourceUrl,
        strategyId,
        formatId,
        transport,
        0,
      );
    }
  } catch (error) {
    console.error("Vexa tracked media start failed", error?.stack || error);
    const message = publicDownloadError(error);
    await writeProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    return json({ error: message }, 502);
  }

  if (!sourceStream) {
    const message = "Could not start the video download";
    await writeProgress(env, session, 0, "failed", message, totalBytes);
    return json({ error: message }, 502);
  }

  const saveKey = env.EXPLORE_MEDIA ? savedDownloadKey(session) : "";
  let saveWriter = null;
  let savePromise = Promise.resolve(false);
  if (saveKey) {
    const saveStream = new TransformStream();
    saveWriter = saveStream.writable.getWriter();
    savePromise = env.EXPLORE_MEDIA.put(saveKey, saveStream.readable, {
      httpMetadata: {
        contentType: "video/mp4",
        cacheControl: "private, no-store",
      },
      customMetadata: {
        vexaDownloadSave: "1",
        expiresAt: String(checked.row.expires_at || ""),
      },
    }).then(async (object) => {
      if (!object) return false;
      await env.DB.prepare(
        "UPDATE vexa_youtube_download_progress SET save_key = ? WHERE session = ?"
      ).bind(saveKey, session).run();
      return true;
    }).catch(async (error) => {
      console.error("Vexa saved video archive failed", error?.stack || error);
      await env.EXPLORE_MEDIA.delete(saveKey).catch(() => null);
      return false;
    });
    ctx?.waitUntil?.(savePromise.then(() => null));
  }

  const reader = sourceStream.getReader();
  let downloaded = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();
  let publishChain = Promise.resolve();
  let persistChain = Promise.resolve();
  let finished = false;
  let started = false;

  const enqueueProgress = (bytes, status, error) => {
    const now = Math.floor(Date.now() / 1000);
    const safeBytes = Math.max(0, Number(bytes || 0));
    const safeStatus = String(status || "ready");
    const safeError = error ? String(error).slice(0, 500) : "";

    publishChain = publishChain
      .then(() => publishProgress(env, session, {
        totalBytes,
        downloadedBytes: safeBytes,
        status: safeStatus,
        error: safeError,
        saveReady: false,
        updatedAt: now,
      }))
      .catch(() => null);

    persistChain = persistChain
      .then(() => persistProgress(env, session, safeBytes, safeStatus, safeError, now))
      .catch(() => null);

    ctx?.waitUntil?.(Promise.all([publishChain, persistChain]));
  };

  const settleProgress = () => Promise.all([
    publishChain.catch(() => null),
    persistChain.catch(() => null),
  ]);

  const abortSaveArchive = async (reason) => {
    const writer = saveWriter;
    saveWriter = null;
    if (writer) {
      try { await writer.abort(reason); } catch (error) {}
    }
    await savePromise.catch(() => false);
    if (saveKey && env.EXPLORE_MEDIA) {
      await env.EXPLORE_MEDIA.delete(saveKey).catch(() => null);
    }
    await env.DB.prepare(
      "UPDATE vexa_youtube_download_progress SET save_key = NULL WHERE session = ?"
    ).bind(session).run().catch(() => null);
  };

  const finishSaveArchive = async () => {
    const writer = saveWriter;
    saveWriter = null;
    if (writer) {
      try {
        await writer.close();
      } catch (error) {
        console.error("Vexa saved video stream close failed", error?.stack || error);
      }
    }
    return Boolean(await savePromise.catch(() => false));
  };

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (finished) return;
          finished = true;
          await settleProgress();
          if (responseSize && downloaded !== responseSize) {
            const message = "Video download ended before the expected file size";
            await abortSaveArchive(message);
            await writeProgress(env, session, downloaded, "failed", message, totalBytes).catch(() => null);
            controller.error(new Error(message));
            return;
          }
          const saveReady = await finishSaveArchive();
          await completeProgress(env, session, downloaded, saveReady).catch(() => null);
          controller.close();
          return;
        }
        if (!next.value?.byteLength) return;
        if (saveWriter) {
          try {
            await saveWriter.write(next.value);
          } catch (error) {
            console.error("Vexa saved video stream failed", error?.stack || error);
            saveWriter = null;
          }
        }
        downloaded += next.value.byteLength;
        const nowMs = Date.now();
        if (!started || (downloaded - lastReportedBytes) >= PROGRESS_REPORT_BYTES || (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS) {
          started = true;
          lastReportedBytes = downloaded;
          lastReportedAt = nowMs;
          enqueueProgress(downloaded, "downloading", "");
        }
        controller.enqueue(next.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          await settleProgress();
          await abortSaveArchive(error?.message || "download_failed");
          await writeProgress(env, session, downloaded, "failed", publicDownloadError(error), totalBytes).catch(() => null);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (error) {}
      if (!finished) {
        finished = true;
        await settleProgress();
        await abortSaveArchive(reason || "download_cancelled");
        await writeProgress(env, session, downloaded, "cancelled", "Download was cancelled", totalBytes).catch(() => null);
      }
    },
  });

  let responseBody = body;
  if (responseSize) {
    const fixed = new FixedLengthStream(responseSize);
    const pipe = body.pipeTo(fixed.writable);
    ctx?.waitUntil?.(pipe.catch((error) => {
      console.error("Vexa fixed-length download stream failed", error?.stack || error);
    }));
    responseBody = fixed.readable;
  }

  return new Response(responseBody, {
    status: 200,
    headers: trackedDownloadHeaders(),
  });
}

async function validateTrackedSession(env, session, downloadToken) {
  if (!session || !downloadToken) return { response: json({ error: "Download link is invalid" }, 400) };
  await ensureProgressTable(env);
  const row = await env.DB.prepare(
    "SELECT playback_token, user_id, total_bytes, status, expires_at, source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key, save_key " +
    "FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now || String(row.playback_token || "") !== downloadToken) {
    return { response: json({ error: "Download session expired" }, 410) };
  }
  return { row };
}

function trackedDownloadHeaders() {
  return new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length",
  });
}

function savedDownloadHeaders(size) {
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length",
  });
  const length = positiveInteger(size);
  if (length) headers.set("Content-Length", String(length));
  return headers;
}

function savedDownloadKey(session) {
  const token = cleanToken(session);
  return token ? SAVE_STORAGE_PREFIX + token + ".mp4" : "";
}

function savedDownloadStorageKey(value) {
  const key = String(value || "");
  return key.startsWith(SAVE_STORAGE_PREFIX) && /^vexa-download-save\/[A-Za-z0-9_-]{40,160}\.mp4$/u.test(key)
    ? key
    : "";
}

async function cleanupExpiredSavedDownloads(env, now) {
  await ensureProgressTable(env);
  const expired = await env.DB.prepare(
    "SELECT save_key FROM vexa_youtube_download_progress WHERE expires_at < ? AND save_key IS NOT NULL LIMIT 25"
  ).bind(now).all();
  if (env.EXPLORE_MEDIA) {
    for (const row of expired?.results || []) {
      const key = savedDownloadStorageKey(row?.save_key);
      if (key) await env.EXPLORE_MEDIA.delete(key).catch(() => null);
    }
  }
  await env.DB.prepare(
    "DELETE FROM vexa_youtube_download_progress WHERE expires_at < ?"
  ).bind(now).run().catch(() => null);
}

async function updateProgressTotal(env, session, totalBytes) {
  const total = positiveInteger(totalBytes);
  if (!total) return;
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET total_bytes = ? WHERE session = ?"
  ).bind(total, session).run();
}

async function persistProgress(env, session, downloadedBytes, status, error, updatedAt) {
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "ready"),
    error ? String(error).slice(0, 500) : null,
    Number(updatedAt || Math.floor(Date.now() / 1000)),
    session,
  ).run();
}

async function writeProgress(env, session, downloadedBytes, status, error, totalBytes) {
  const now = Math.floor(Date.now() / 1000);
  const safeDownloaded = Math.max(0, Number(downloadedBytes || 0));
  const safeStatus = String(status || "ready");
  const safeError = error ? String(error).slice(0, 500) : "";
  await Promise.all([
    persistProgress(env, session, safeDownloaded, safeStatus, safeError, now),
    publishProgress(env, session, {
      totalBytes: positiveInteger(totalBytes),
      downloadedBytes: safeDownloaded,
      status: safeStatus,
      error: safeError,
      saveReady: false,
      updatedAt: now,
    }),
  ]);
}

async function completeProgress(env, session, downloadedBytes, saveReady = false) {
  const actualBytes = positiveInteger(downloadedBytes);
  const now = Math.floor(Date.now() / 1000);
  if (!actualBytes) {
    await writeProgress(env, session, 0, "failed", "Download ended before data was received", 0);
    return;
  }
  await Promise.all([
    env.DB.prepare(
      "UPDATE vexa_youtube_download_progress SET total_bytes = ?, downloaded_bytes = ?, status = 'completed', error = NULL, updated_at = ? WHERE session = ?"
    ).bind(actualBytes, actualBytes, now, session).run(),
    publishProgress(env, session, {
      totalBytes: actualBytes,
      downloadedBytes: actualBytes,
      status: "completed",
      error: "",
      saveReady: Boolean(saveReady),
      updatedAt: now,
    }),
  ]);
}

async function publishProgress(env, session, payload) {
  const totalBytes = positiveInteger(payload.totalBytes);
  if (!env.VEXA_DOWNLOAD_PROGRESS || !totalBytes) return;
  const downloadedBytes = Math.max(0, Number(payload.downloadedBytes || 0));
  const status = String(payload.status || "ready");
  const id = env.VEXA_DOWNLOAD_PROGRESS.idFromName(session);
  const stub = env.VEXA_DOWNLOAD_PROGRESS.get(id);
  const request = new Request("https://vexa-download-progress/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      totalBytes,
      downloadedBytes,
      percent: progressPercent(downloadedBytes, totalBytes, status),
      status,
      error: payload.error || "",
      saveReady: Boolean(payload.saveReady),
      updatedAt: Number(payload.updatedAt || 0),
    }),
  });
  await stub.fetch(request).catch(() => null);
}

function progressPercent(downloadedBytes, totalBytes, status) {
  if (String(status || "") === "completed") return 100;
  const total = positiveInteger(totalBytes);
  if (!total) return 0;
  const value = (Math.max(0, Number(downloadedBytes || 0)) / total) * 100;
  return Math.max(0, Math.min(99, Math.round(value * 10) / 10));
}

async function ensureProgressTable(env) {
  if (!progressTableReady) {
    progressTableReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_youtube_download_progress (" +
          "session TEXT PRIMARY KEY, " +
          "playback_token TEXT NOT NULL, " +
          "user_id TEXT NOT NULL, " +
          "total_bytes INTEGER NOT NULL, " +
          "downloaded_bytes INTEGER NOT NULL DEFAULT 0, " +
          "status TEXT NOT NULL DEFAULT 'ready', " +
          "error TEXT, " +
          "created_at INTEGER NOT NULL, " +
          "updated_at INTEGER NOT NULL, " +
          "expires_at INTEGER NOT NULL" +
        ")"
      ).run();

      const columns = [
        ["source_url", "TEXT"],
        ["strategy_id", "TEXT"],
        ["format_id", "TEXT"],
        ["transport", "TEXT"],
        ["provider", "TEXT"],
        ["duration_seconds", "REAL"],
        ["option_key", "TEXT"],
        ["save_key", "TEXT"],
      ];
      for (const [name, type] of columns) {
        try {
          await env.DB.prepare(
            "ALTER TABLE vexa_youtube_download_progress ADD COLUMN " + name + " " + type
          ).run();
        } catch (error) {
          if (!/duplicate column name/i.test(String(error?.message || error))) throw error;
        }
      }
    })().catch((error) => {
      progressTableReady = null;
      throw error;
    });
  }
  await progressTableReady;
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function cleanOptionKey(value) {
  const key = String(value || "").trim();
  return /^v\d{2,4}$/u.test(key) ? key : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicDownloadError(error) {
  const message = String(error?.message || "");
  if (/cancel|abort/i.test(message)) return "Download was cancelled";
  return "Video download failed before completion";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const DOWNLOAD_PROGRESS_RUNTIME_JS = String.raw`
(function () {
  'use strict';
  const PREPARE_URL='/mini-app/live/api/youtube-download/prepare';
  const SESSION_URL='/mini-app/live/api/youtube-download/session';
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const qualityNode=document.getElementById('vexaLiveQuality');
  let saveButton=null;
  let saveFile=null;
  let saveMode='';
  let saveLoadPromise=null;
  let saveLoadController=null;
  let sharing=false;
  let prepared=null;
  let preparingPromise=null;
  let lastSource='';
  let lastOptionKey='';
  let downloadToken='';
  let directMeta=null;
  let qualityOptions=[];
  let selectedOptionKey='';
  let busy=false;
  let progressSocket=null;
  let reconnectTimer=0;
  let reconnectAttempt=0;
  let displayedPercent=0;
  let percentAnimation=0;
  let telegramDownloadEventBound=false;

  function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch(error){}return window;}
  function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
  function initData(){return String(telegram()?.initData||'');}
  function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch(error){}}
  function mb(bytes){return(Math.max(0,Number(bytes||0))/1048576).toFixed(1);}
  function launchContext(){
    const host=hostWindow();
    try{
      const params=new URLSearchParams(host.location.search);
      if(params.get('vexaDownload')!=='1')return{source:'',optionKey:''};
      const source=String(params.get('vexaSource')||'').trim();
      if(!source||source.length>2048)return{source:'',optionKey:''};
      const url=new URL(source);
      if(url.protocol!=='https:')return{source:'',optionKey:''};
      const optionKey=/^v\d{2,4}$/.test(String(params.get('vexaOption')||''))?String(params.get('vexaOption')):'';
      return{source:url.href,optionKey:optionKey};
    }catch(error){return{source:'',optionKey:''};}
  }
  function promptSource(){const source=window.prompt('Enter video link');if(source===null)return'';return String(source||'').trim();}
  function setState(state,message,detail){
    if(root)root.dataset.state=String(state||'idle');
    if(statusNode)statusNode.textContent=String(message||'');
    if(detailNode)detailNode.textContent=String(detail||'');
  }
  function setButton(text,disabled){if(!button)return;button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function ensureSaveButton(){
    if(saveButton&&saveButton.isConnected)return saveButton;
    const parent=button?.parentElement;if(!parent)return null;
    const node=document.createElement('button');
    node.id='vexaLiveSave';node.className='vexa-live-download-action';node.type='button';node.textContent='Save';node.hidden=true;
    node.setAttribute('aria-label','Save downloaded video');
    node.addEventListener('click',onSaveClick);parent.appendChild(node);saveButton=node;return node;
  }
  function setSaveVisible(visible){const node=ensureSaveButton();if(node)node.hidden=!Boolean(visible);}
  function resetSaveState(){
    const controller=saveLoadController;saveLoadController=null;if(controller)try{controller.abort();}catch(error){}
    saveFile=null;saveMode='';saveLoadPromise=null;sharing=false;
    const node=ensureSaveButton();if(node){node.disabled=false;node.hidden=true;}
  }
  function canShareVideoFile(file){
    if(typeof navigator.share!=='function'||typeof navigator.canShare!=='function'||!file)return false;
    try{return navigator.canShare({files:[file]});}catch(error){return false;}
  }
  async function warmSaveAction(){
    if(!prepared?.saveUrl||saveMode||saveLoadPromise)return;
    const tg=telegram();
    let supportsFileShare=false;
    if(typeof File==='function'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'){
      try{supportsFileShare=canShareVideoFile(new File([new Uint8Array([0])],prepared.fileName||'Vexa-video.mp4',{type:'video/mp4'}));}catch(error){supportsFileShare=false;}
    }
    if(!supportsFileShare){
      if(tg?.downloadFile){saveMode='download';setSaveVisible(true);}
      return;
    }
    const controller=new AbortController();saveLoadController=controller;
    saveLoadPromise=(async function(){
      try{
        const response=await fetch(prepared.saveUrl,{method:'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(!response.ok)throw new Error('Saved video is unavailable');
        const blob=await response.blob();
        if(!blob.size)throw new Error('Saved video is empty');
        const file=new File([blob],prepared.fileName||'Vexa-video.mp4',{type:'video/mp4',lastModified:Date.now()});
        if(!canShareVideoFile(file))throw new Error('Video file sharing is unavailable');
        saveFile=file;saveMode='share';setSaveVisible(true);
      }catch(error){
        if(String(error?.name||'')==='AbortError')return;
        console.warn('Save file preparation failed',error?.message||error);
        if(telegram()?.downloadFile){saveMode='download';setSaveVisible(true);}
      }finally{if(saveLoadController===controller)saveLoadController=null;saveLoadPromise=null;}
    })();
    return saveLoadPromise;
  }
  async function onSaveClick(event){
    event?.preventDefault?.();event?.stopPropagation?.();
    if(!prepared?.saveUrl)return;
    haptic('light');
    if(saveMode==='share'&&saveFile&&canShareVideoFile(saveFile)){
      if(sharing)return;
      sharing=true;if(saveButton)saveButton.disabled=true;
      try{
        await navigator.share({files:[saveFile],title:String(prepared.title||prepared.fileName||'Video')});
      }catch(error){
        if(String(error?.name||'')!=='AbortError')console.warn('Native video share failed',error?.message||error);
      }finally{sharing=false;if(saveButton)saveButton.disabled=false;}
      return;
    }
    const tg=telegram();
    if(saveMode==='download'&&tg?.downloadFile){
      try{tg.downloadFile({url:prepared.saveUrl,file_name:prepared.fileName||'Vexa-video.mp4'},function(){});}catch(error){console.warn('Telegram save download failed',error?.message||error);}
    }
  }
  function setProgress(value,animate){
    const target=Math.max(0,Math.min(100,Number(value||0)));
    if(root)root.style.setProperty('--vexa-progress',String(target/100));
    if(track){track.setAttribute('aria-valuenow',String(Math.round(target)));}
    cancelAnimationFrame(percentAnimation);
    if(!animate){displayedPercent=target;if(percentNode)percentNode.textContent=Math.round(target)+'%';return;}
    const from=displayedPercent;
    const started=performance.now();
    const duration=Math.min(650,220+Math.abs(target-from)*12);
    const tick=function(now){
      const t=Math.min(1,(now-started)/Math.max(1,duration));
      const eased=1-Math.pow(1-t,3);
      displayedPercent=from+(target-from)*eased;
      if(percentNode)percentNode.textContent=Math.round(displayedPercent)+'%';
      if(t<1)percentAnimation=requestAnimationFrame(tick);
    };
    percentAnimation=requestAnimationFrame(tick);
  }
  function tokenFromDownloadUrl(value){try{const token=new URL(String(value||''),window.location.origin).searchParams.get('token')||'';return/^[A-Za-z0-9_-]{40,160}$/.test(token)?token:'';}catch(error){return'';}}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  function selectedQuality(){return qualityOptions.find(function(option){return option.key===selectedOptionKey;})||null;}
  function qualityDetail(option){if(!option)return'';return String(option.label||option.key)+' · '+mb(option.sizeBytes)+' MB';}
  function updateQualitySelection(){
    if(!qualityNode)return;
    for(const node of qualityNode.querySelectorAll('[data-quality-key]')){
      node.dataset.selected=node.dataset.qualityKey===selectedOptionKey?'1':'0';
      node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');
    }
  }
  function selectQuality(key,announce){
    const option=qualityOptions.find(function(item){return item.key===String(key||'');});
    if(!option||busy)return false;
    selectedOptionKey=option.key;lastOptionKey=option.key;prepared=null;closeProgressSocket();resetSaveState();setProgress(0,true);updateQualitySelection();
    if(announce!==false){setState('waiting','Ready to download',qualityDetail(option));haptic('light');}
    setButton('Download',false);return true;
  }
  function renderQualities(options,preferredKey){
    if(!qualityNode)return false;
    qualityOptions=Array.isArray(options)?options.filter(function(option){return option&&/^v\d{2,4}$/.test(String(option.key||''))&&Number(option.sizeBytes||0)>0;}):[];
    qualityNode.replaceChildren();
    if(!qualityOptions.length){qualityNode.dataset.ready='0';selectedOptionKey='';return false;}
    for(const option of qualityOptions){
      const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');
      const label=document.createElement('span');label.textContent=String(option.label||option.key);
      const size=document.createElement('small');size.textContent=mb(option.sizeBytes)+' MB';
      item.append(label,size);
      item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();selectQuality(option.key,true);});
      qualityNode.appendChild(item);
    }
    qualityNode.dataset.ready='1';
    const preferred=qualityOptions.some(function(option){return option.key===preferredKey;})?preferredKey:qualityOptions[0].key;
    return selectQuality(preferred,false);
  }
  function clearQualities(){qualityOptions=[];selectedOptionKey='';if(qualityNode){qualityNode.replaceChildren();qualityNode.dataset.ready='0';}}
  function closeProgressSocket(){
    clearTimeout(reconnectTimer);reconnectTimer=0;reconnectAttempt=0;
    const socket=progressSocket;progressSocket=null;
    if(socket)try{socket.close(1000,'done');}catch(error){}
  }
  function handleProgress(data){
    if(!data?.ok)return;
    const total=Number(data.totalBytes||prepared?.fileSize||0);
    const done=Math.max(0,Number(data.downloadedBytes||0));
    const pct=Math.max(0,Math.min(100,Number(data.percent||0)));
    const state=String(data.status||'ready');
    if(state==='completed'){
      busy=false;setProgress(100,true);setState('completed','Downloaded',mb(done||total)+' MB');setButton('Download again',false);closeProgressSocket();haptic('medium');
      if(data.saveReady)warmSaveAction();else resetSaveState();return;
    }
    if(state==='failed'||state==='cancelled'){
      busy=false;resetSaveState();setState('error',String(data.error||'Download failed'),done?mb(done)+' MB received':qualityDetail(selectedQuality()));setButton('Try again',false);closeProgressSocket();prepared=null;return;
    }
    if(state==='preparing'){
      resetSaveState();if(displayedPercent<=0)setProgress(0,false);setState('preparing','Preparing download','0.0 MB / '+mb(total)+' MB');return;
    }
    if(state==='downloading'){
      resetSaveState();setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Downloading',mb(done)+' MB / '+mb(total)+' MB');
    }
  }
  function connectProgress(progressUrl){
    closeProgressSocket();
    const target=String(progressUrl||'');
    if(!target)return;
    const socket=new WebSocket(wsUrl(target));progressSocket=socket;
    socket.addEventListener('open',function(){if(progressSocket!==socket)return;reconnectAttempt=0;});
    socket.addEventListener('message',function(event){if(progressSocket!==socket)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}handleProgress(data);});
    socket.addEventListener('close',function(){
      if(progressSocket===socket)progressSocket=null;
      if(!busy||!prepared?.progressUrl)return;
      if(reconnectAttempt>=6){setState('preparing','Preparing download','Progress connection interrupted');return;}
      const delay=Math.min(5000,450*Math.pow(2,reconnectAttempt++));
      reconnectTimer=setTimeout(function(){if(busy&&prepared?.progressUrl)connectProgress(prepared.progressUrl);},delay);
    });
    socket.addEventListener('error',function(){try{socket.close();}catch(error){}});
  }
  function cancelNativeDownloadState(){
    if(!busy)return;
    busy=false;closeProgressSocket();resetSaveState();setProgress(0,true);setState('waiting','Download cancelled',qualityDetail(selectedQuality())||mb(prepared?.fileSize||0)+' MB');setButton('Download',false);
  }
  function handleTelegramDownloadRequested(event){
    const state=String(event?.status||event||'').toLowerCase();
    if(state==='cancelled'){cancelNativeDownloadState();return;}
    if(state==='downloading'&&busy){setState('preparing','Starting download','0.0 MB / '+mb(prepared?.fileSize||0)+' MB');}
  }
  function bindTelegramDownloadEvent(){
    if(telegramDownloadEventBound)return;
    const tg=telegram();
    if(!tg?.onEvent)return;
    try{tg.onEvent('fileDownloadRequested',handleTelegramDownloadRequested);telegramDownloadEventBound=true;}catch(error){}
  }
  async function prepareSource(source,optionKey){
    const clean=String(source||'').trim();
    if(!clean)return false;
    if(preparingPromise)return preparingPromise;
    lastSource=clean;lastOptionKey=/^v\d{2,4}$/.test(String(optionKey||''))?String(optionKey):'';downloadToken='';directMeta=null;prepared=null;busy=false;closeProgressSocket();resetSaveState();clearQualities();setProgress(0,false);setState('preparing','Loading qualities','');setButton('Preparing…',true);haptic('light');
    preparingPromise=(async function(){
      try{
        const response=await fetch(PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:clean})});
        const direct=await response.json().catch(function(){return{};});
        if(!response.ok||!direct.downloadUrl)throw new Error(String(direct.error||'Could not prepare download'));
        const token=tokenFromDownloadUrl(direct.downloadUrl);
        if(!token)throw new Error('Download session is invalid');
        const qualityResponse=await fetch(SESSION_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:token})});
        const qualityData=await qualityResponse.json().catch(function(){return{};});
        if(!qualityResponse.ok||!Array.isArray(qualityData.options)||!qualityData.options.length)throw new Error(String(qualityData.error||'Could not load video qualities'));
        downloadToken=token;directMeta=direct;
        if(!renderQualities(qualityData.options,lastOptionKey))throw new Error('Video quality is unavailable');
        const option=selectedQuality();setProgress(0,false);setState('waiting','Choose quality',qualityDetail(option));setButton('Download',false);haptic('light');return true;
      }catch(error){
        downloadToken='';directMeta=null;prepared=null;clearQualities();resetSaveState();setState('error',String(error?.message||'Could not prepare download'),'');setButton('Try again',false);return false;
      }finally{preparingPromise=null;}
    })();
    return preparingPromise;
  }
  async function prepareSelectedDownload(){
    if(!downloadToken||!selectedOptionKey||preparingPromise)return false;
    const option=selectedQuality();resetSaveState();setState('preparing','Preparing '+String(option?.label||'quality'),qualityDetail(option));setButton('Preparing…',true);haptic('light');
    preparingPromise=(async function(){
      try{
        const sessionResponse=await fetch(SESSION_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedOptionKey})});
        const session=await sessionResponse.json().catch(function(){return{};});
        if(!sessionResponse.ok||!session.downloadUrl||!session.progressUrl||!session.saveUrl||!session.fileSize)throw new Error(String(session.error||'Could not prepare selected quality'));
        prepared={downloadUrl:new URL(String(session.downloadUrl),window.location.origin).href,progressUrl:new URL(String(session.progressUrl),window.location.origin).href,saveUrl:new URL(String(session.saveUrl),window.location.origin).href,fileName:String(session.fileName||directMeta?.fileName||'Vexa-video.mp4'),fileSize:Number(session.fileSize||0),title:String(session.title||directMeta?.title||'Video'),optionKey:String(session.optionKey||selectedOptionKey)};
        setProgress(0,false);setState('waiting','Ready to download',qualityDetail(option));setButton('Download',false);return true;
      }catch(error){prepared=null;resetSaveState();setState('error',String(error?.message||'Could not prepare selected quality'),qualityDetail(option));setButton('Try again',false);return false;}
      finally{preparingPromise=null;}
    })();
    return preparingPromise;
  }
  function requestDownload(){
    if(!prepared||busy)return;
    busy=true;resetSaveState();setProgress(0,false);setState('preparing','Waiting for Telegram','0.0 MB / '+mb(prepared.fileSize)+' MB');setButton('Downloading…',true);connectProgress(prepared.progressUrl);bindTelegramDownloadEvent();haptic('light');
    const tg=telegram();
    if(tg?.downloadFile){
      try{
        tg.downloadFile({url:prepared.downloadUrl,file_name:prepared.fileName},function(accepted){
          if(accepted===false){cancelNativeDownloadState();return;}
          setState('preparing','Starting download','0.0 MB / '+mb(prepared?.fileSize||0)+' MB');
        });
        return;
      }catch(error){console.warn('Telegram downloadFile failed',error?.message||error);}
    }
    try{
      const link=document.createElement('a');link.href=prepared.downloadUrl;link.download=prepared.fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setState('preparing','Starting download','0.0 MB / '+mb(prepared.fileSize)+' MB');
    }catch(error){busy=false;closeProgressSocket();resetSaveState();setState('error','Could not start download','');setButton('Try again',false);}
  }
  async function onButtonClick(event){
    event.preventDefault();event.stopPropagation();
    if(busy||button?.disabled)return;
    if(prepared){requestDownload();return;}
    if(downloadToken&&selectedOptionKey){const ready=await prepareSelectedDownload();if(ready)requestDownload();return;}
    const launch=launchContext();
    const source=lastSource||launch.source||promptSource();
    if(!source)return;
    await prepareSource(source,lastOptionKey||launch.optionKey);
  }
  ensureSaveButton();resetSaveState();bindTelegramDownloadEvent();
  button?.addEventListener('click',onButtonClick);
  const preset=launchContext();
  if(preset.source){lastSource=preset.source;lastOptionKey=preset.optionKey;prepareSource(preset.source,preset.optionKey);}else{setProgress(0,false);setState('idle','Ready when you are','');setButton('Download',false);}
})();
`;