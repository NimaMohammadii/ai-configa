import { DurableObject } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";
import { authenticateMiniAppPayload } from "../auth.js";
import {
  getTelegramYouTubeOptions,
  normalizeBotMediaUrl,
} from "./youtube-download-exec.js";

const SESSION_PATH = "/mini-app/live/api/youtube-download/session";
const PROGRESS_PATH = "/mini-app/live/api/youtube-download/progress";
const DIRECT_DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";

const VIDEO_FILE_NAME = "Vexa-video.mp4";
const AUDIO_FILE_NAME = "Vexa-audio.m4a";
const SESSION_TTL_SECONDS = 60 * 60;
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
  if (url.pathname === SESSION_PATH || url.pathname === PROGRESS_PATH) return true;
  return url.pathname === DIRECT_DOWNLOAD_PATH && Boolean(cleanToken(url.searchParams.get("session")));
}

export async function handleTrackedYouTubeDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === SESSION_PATH) {
    return createDownloadSession(request, env, ctx);
  }
  if (request.method === "GET" && url.pathname === PROGRESS_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      return openDownloadProgressSocket(request, env);
    }
    return readDownloadProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DIRECT_DOWNLOAD_PATH) {
    if (request.method === "HEAD") return directDownloadHead(request, env);
    return trackedDownload(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
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

  const downloadOptions = Array.isArray(prepared?.options)
    ? prepared.options.filter((option) => {
        const key = String(option?.key || "");
        const validKind = (option?.kind === "video" && /^v\d{2,4}$/u.test(key)) ||
          (option?.kind === "audio" && key === "a");
        return validKind && positiveInteger(option?.sizeBytes) && String(option?.selector || "").trim();
      })
    : [];
  const videos = downloadOptions.filter((option) => option.kind === "video");
  if (!videos.length) return json({ error: "Video quality is unavailable" }, 500);

  const requestedOptionKey = cleanOptionKey(payload.optionKey);
  if (!requestedOptionKey) {
    return json({
      ok: true,
      chooseQuality: true,
      title: String(prepared?.title || "Video"),
      options: downloadOptions.map((option) => ({
        key: String(option.key),
        kind: String(option.kind || "video"),
        label: option.kind === "audio"
          ? "Audio"
          : String(option.label || (positiveInteger(option.height) ? positiveInteger(option.height) + "p" : option.key)),
        sizeBytes: positiveInteger(option.sizeBytes),
        width: positiveInteger(option.width),
        height: positiveInteger(option.height),
        duration: positiveNumber(option.duration),
      })),
    });
  }

  const selected = downloadOptions.find((option) => String(option.key || "") === requestedOptionKey) || null;
  if (!selected) return json({ error: "Selected download option is unavailable" }, 409);

  const mediaInfo = {
    totalBytes: positiveInteger(selected.sizeBytes),
    title: String(prepared?.title || "Video"),
    strategyId: String(prepared?.strategyId || ""),
    formatId: String(selected.selector || ""),
    transport: String(selected.transport || ""),
    provider: String(prepared?.provider || "youtube"),
    duration: positiveNumber(selected.duration),
    optionKey: String(selected.key || ""),
    kind: String(selected.kind || "video"),
    fileName: String(selected.filename || (selected.kind === "audio" ? AUDIO_FILE_NAME : VIDEO_FILE_NAME)),
  };
  const totalBytes = positiveInteger(mediaInfo.totalBytes);
  if (!totalBytes) return json({ error: "Media size is unavailable" }, 500);

  await ensureProgressTable(env);
  const session = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_progress " +
    "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at, " +
    "source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key) " +
    "VALUES (?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_youtube_download_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    fileName: mediaInfo.fileName,
    fileSize: totalBytes,
    title: String(mediaInfo.title || "Video"),
    optionKey: mediaInfo.optionKey,
    downloadUrl: DIRECT_DOWNLOAD_PATH + "?token=" + encodeURIComponent(downloadToken) + "&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
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
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at FROM vexa_youtube_download_progress WHERE session = ?"
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
  const headers = trackedDownloadHeaders(checked.row.option_key);
  if (totalBytes) headers.set("Content-Length", String(totalBytes));
  return new Response(null, { status: 200, headers });
}

async function trackedDownload(request, env, ctx) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const downloadToken = cleanToken(url.searchParams.get("token"));
  const checked = await validateTrackedSession(env, session, downloadToken);
  if (checked.response) return checked.response;

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
    const message = "Could not start the media download";
    await writeProgress(env, session, 0, "failed", message, totalBytes);
    return json({ error: message }, 502);
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

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (finished) return;
          finished = true;
          await settleProgress();
          if (responseSize && downloaded !== responseSize) {
            const message = "Media download ended before the expected file size";
            await writeProgress(env, session, downloaded, "failed", message, totalBytes).catch(() => null);
            controller.error(new Error(message));
            return;
          }
          await completeProgress(env, session, downloaded).catch(() => null);
          controller.close();
          return;
        }
        if (!next.value?.byteLength) return;
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
    headers: trackedDownloadHeaders(checked.row.option_key),
  });
}

async function validateTrackedSession(env, session, downloadToken) {
  if (!session || !downloadToken) return { response: json({ error: "Download link is invalid" }, 400) };
  await ensureProgressTable(env);
  const row = await env.DB.prepare(
    "SELECT playback_token, user_id, total_bytes, status, expires_at, source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key " +
    "FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now || String(row.playback_token || "") !== downloadToken) {
    return { response: json({ error: "Download session expired" }, 410) };
  }
  return { row };
}

function trackedDownloadHeaders(optionKey) {
  const audio = String(optionKey || "") === "a";
  const fileName = audio ? AUDIO_FILE_NAME : VIDEO_FILE_NAME;
  return new Headers({
    "Content-Type": audio ? "audio/mp4" : "video/mp4",
    "Content-Disposition": 'attachment; filename="' + fileName + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length",
  });
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
      updatedAt: now,
    }),
  ]);
}

async function completeProgress(env, session, downloadedBytes) {
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

export async function ensureVexaDownloadProgressTable(env) {
  await ensureProgressTable(env);
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
  return /^(?:a|v\d{2,4})$/u.test(key) ? key : "";
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
  return "Media download failed before completion";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
