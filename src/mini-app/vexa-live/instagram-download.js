import { DurableObject } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const PREPARE_PATH = "/mini-app/live/api/instagram/prepare";
const SESSION_PATH = "/mini-app/live/api/instagram/session";
const DOWNLOAD_PATH = "/mini-app/live/api/instagram/download";
const PROGRESS_PATH = "/mini-app/live/api/instagram/progress";
export const INSTAGRAM_RUNTIME_PATH = "/mini-app/vexa-live/instagram-download.js";

const TOKEN_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 60 * 60;
const METADATA_TIMEOUT_MS = 90_000;
const STREAM_START_TIMEOUT_MS = 90_000;
const PROCESS_SETTLE_TIMEOUT_MS = 2_000;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 750;
const INSTAGRAM_HOST_SUFFIX = "instagram.com";
const INSTAGRAM_FILE_PREFIX = "Vexa-Instagram-";
const YTDLP_ARGS = Object.freeze([
  "--ignore-config",
  "--no-playlist",
  "--force-ipv4",
  "--js-runtimes",
  "deno",
  "--socket-timeout",
  "15",
  "--retries",
  "2",
  "--fragment-retries",
  "2",
]);

let tablesReady = null;
let progressTableReady = null;

export class VexaInstagramContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async getInstagramCatalog(url) {
    const process = await this.execYtDlp([
      ...YTDLP_ARGS,
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      url,
    ]);
    const timer = setTimeout(() => {
      try { process.kill(); } catch (error) {}
    }, METADATA_TIMEOUT_MS);

    try {
      const output = await process.output();
      const decoder = new TextDecoder();
      const detail = decoder.decode(output.stderr).trim();
      if (output.exitCode !== 0) throw instagramError(detail || "metadata failed");
      const data = JSON.parse(decoder.decode(output.stdout));
      const catalog = await buildInstagramCatalog(data);
      if (!catalog.options.length) {
        throw new Error("Instagram did not expose a downloadable MP4 video");
      }
      return catalog;
    } catch (error) {
      if (isInstagramPublicError(error)) throw error;
      throw instagramError(error?.message || error);
    } finally {
      clearTimeout(timer);
    }
  }

  async streamInstagramVideo(url, formatId) {
    const selected = String(formatId || "").trim();
    if (!selected || selected.length > 120) throw new Error("Instagram video format is unavailable");
    const process = await this.execYtDlp([
      ...YTDLP_ARGS,
      "--quiet",
      "--no-warnings",
      "-f",
      selected,
      "-o",
      "-",
      url,
    ]);
    return this.streamProcess(process);
  }

  async streamProcess(process) {
    if (!process?.stdout) throw new Error("Could not start the Instagram download");
    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        readStreamPrefix(reader, 12),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Instagram stream did not start in time")),
            STREAM_START_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      stopProcessNow(process, reader, "stream_start_failed");
      const detail = await settleWithin(stderrPromise, PROCESS_SETTLE_TIMEOUT_MS, "");
      throw instagramError(detail || error?.message || error);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!first?.byteLength) {
      stopProcessNow(process, reader, "empty_stream");
      const detail = await processFailureDetail(process, stderrPromise);
      throw instagramError(detail || "empty stream");
    }
    if (!looksLikeMp4(first)) {
      stopProcessNow(process, reader, "invalid_mp4");
      throw new Error("Instagram returned an invalid MP4 stream");
    }

    let sentFirst = false;
    return new ReadableStream({
      async pull(controller) {
        if (!sentFirst) {
          sentFirst = true;
          controller.enqueue(first);
          return;
        }
        try {
          const next = await reader.read();
          if (next.done) {
            const exitCode = await settleWithin(process.exitCode.catch(() => -1), PROCESS_SETTLE_TIMEOUT_MS, -1);
            const detail = await settleWithin(stderrPromise, PROCESS_SETTLE_TIMEOUT_MS, "");
            if (exitCode !== 0) {
              controller.error(instagramError(detail || "download failed"));
              return;
            }
            controller.close();
            return;
          }
          if (next.value?.byteLength) controller.enqueue(next.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        stopProcessNow(process, reader, reason || "stream_cancelled");
        stderrPromise.catch(() => "");
      },
    });
  }

  async execYtDlp(args, options) {
    if (!this.ctx.container.running) await this.start();
    return this.ctx.container.exec(["yt-dlp", ...args], options);
  }
}

export class VexaInstagramProgressHub extends DurableObject {
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

export function isInstagramDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PREPARE_PATH ||
    path === SESSION_PATH ||
    path === DOWNLOAD_PATH ||
    path === PROGRESS_PATH ||
    path === INSTAGRAM_RUNTIME_PATH;
}

export async function handleInstagramDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === INSTAGRAM_RUNTIME_PATH) {
    return new Response(INSTAGRAM_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && url.pathname === PREPARE_PATH) {
    return prepareInstagram(request, env, ctx);
  }
  if (request.method === "POST" && url.pathname === SESSION_PATH) {
    return createInstagramSession(request, env, ctx);
  }
  if (request.method === "GET" && url.pathname === PROGRESS_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      return openInstagramProgressSocket(request, env);
    }
    return readInstagramProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DOWNLOAD_PATH) {
    if (request.method === "HEAD") return instagramDownloadHead(request, env);
    return trackedInstagramDownload(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendInstagramDownloadRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + INSTAGRAM_RUNTIME_PATH + '?v=20260827-progress-stall-fix-2"></script>';
  const html = source.includes(INSTAGRAM_RUNTIME_PATH)
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

async function prepareInstagram(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const sourceUrl = normalizeInstagramUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid Instagram Reel or video post link" }, 400);
  if (!env.VEXA_INSTAGRAM) return json({ error: "Instagram download is temporarily unavailable" }, 503);

  let catalog;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + safeContainerKey(user.id));
    catalog = await container.getInstagramCatalog(sourceUrl);
  } catch (error) {
    console.error("Vexa Instagram metadata failed", error?.stack || error);
    return json({ error: publicInstagramError(error) }, 502);
  }

  const options = sanitizeCatalogOptions(catalog?.options);
  if (!options.length) return json({ error: "Instagram did not expose a downloadable MP4 video" }, 422);

  await ensureInstagramTables(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  const title = String(catalog?.title || "Instagram video").slice(0, 500);
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_download_tokens " +
    "(token, user_id, source_url, title, catalog_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    token,
    String(user.id),
    sourceUrl,
    title,
    JSON.stringify(options),
    now,
    now + TOKEN_TTL_SECONDS,
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_instagram_download_tokens WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    downloadToken: token,
    title,
    options,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

async function createInstagramSession(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const token = cleanToken(payload.downloadToken);
  const optionKey = cleanOptionKey(payload.optionKey);
  if (!token || !optionKey) return json({ error: "Instagram download session is invalid" }, 400);

  await ensureInstagramTables(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, title, catalog_json, expires_at FROM vexa_instagram_download_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Instagram download session expired. Prepare the video again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Instagram download session does not belong to this user" }, 403);
  }

  const options = parseCatalog(row.catalog_json);
  const selected = options.find((option) => option.key === optionKey) || null;
  if (!selected) return json({ error: "Selected Instagram quality is unavailable" }, 409);

  const session = randomToken();
  const fileName = String(selected.filename || INSTAGRAM_FILE_PREFIX + selected.height + "p.mp4");
  const totalBytes = positiveInteger(selected.sizeBytes);
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_download_progress " +
    "(session, download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?)"
  ).bind(
    session,
    token,
    String(user.id),
    String(row.source_url),
    String(selected.formatId),
    selected.key,
    fileName,
    totalBytes,
    now,
    now,
    now + SESSION_TTL_SECONDS,
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_instagram_download_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    fileName,
    fileSize: totalBytes,
    title: String(row.title || "Instagram video"),
    optionKey: selected.key,
    downloadUrl: DOWNLOAD_PATH + "?token=" + encodeURIComponent(token) + "&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function instagramDownloadHead(request, env) {
  const checked = await validateInstagramSession(request, env);
  if (checked.response) return checked.response;
  return new Response(null, { status: 200, headers: instagramDownloadHeaders(checked.row.file_name) });
}

async function trackedInstagramDownload(request, env, ctx) {
  const checked = await validateInstagramSession(request, env);
  if (checked.response) return checked.response;
  const row = checked.row;
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  let totalBytes = positiveInteger(row.total_bytes);
  await writeInstagramProgress(env, session, 0, "preparing", "", totalBytes).catch(() => null);

  let sourceStream;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + safeContainerKey(row.user_id));
    sourceStream = await container.streamInstagramVideo(String(row.source_url), String(row.format_id));
  } catch (error) {
    const message = publicInstagramError(error);
    await writeInstagramProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    return json({ error: message }, 502);
  }
  if (!sourceStream) {
    const message = "Could not start the Instagram download";
    await writeInstagramProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
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
    publishChain = publishChain.then(() => publishInstagramProgress(env, session, {
      totalBytes,
      downloadedBytes: safeBytes,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    })).catch(() => null);
    persistChain = persistChain.then(() => persistInstagramProgress(
      env, session, safeBytes, safeStatus, safeError, now,
    )).catch(() => null);
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
          await completeInstagramProgress(env, session, downloaded).catch(() => null);
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
          await writeInstagramProgress(env, session, downloaded, "failed", publicInstagramError(error), totalBytes).catch(() => null);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (error) {}
      if (!finished) {
        finished = true;
        await settleProgress();
        await writeInstagramProgress(env, session, downloaded, "cancelled", "Download was cancelled", totalBytes).catch(() => null);
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: instagramDownloadHeaders(row.file_name),
  });
}

async function validateInstagramSession(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const token = cleanToken(url.searchParams.get("token"));
  if (!session || !token) return { response: json({ error: "Instagram download link is invalid" }, 400) };
  await ensureInstagramTables(env);
  const row = await env.DB.prepare(
    "SELECT download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, status, expires_at " +
    "FROM vexa_instagram_download_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now || String(row.download_token || "") !== token) {
    return { response: json({ error: "Instagram download session expired" }, 410) };
  }
  return { row };
}

async function openInstagramProgressSocket(request, env) {
  if (!env.VEXA_INSTAGRAM_PROGRESS) return json({ error: "Instagram progress is unavailable" }, 503);
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Instagram download session is invalid" }, 400);
  await ensureInstagramTables(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Instagram download session expired" }, 410);
  const id = env.VEXA_INSTAGRAM_PROGRESS.idFromName(session);
  const stub = env.VEXA_INSTAGRAM_PROGRESS.get(id);
  const target = new URL("https://vexa-instagram-progress/socket");
  target.searchParams.set("session", session);
  return stub.fetch(new Request(target.href, request));
}

async function readInstagramProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Instagram download session is invalid" }, 400);
  await ensureInstagramTables(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Instagram download session expired" }, 410);
  return json(progressPayload(row));
}

async function readProgressRow(env, session) {
  return env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at FROM vexa_instagram_download_progress WHERE session = ?"
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

async function persistInstagramProgress(env, session, downloadedBytes, status, error, updatedAt) {
  await env.DB.prepare(
    "UPDATE vexa_instagram_download_progress SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "ready"),
    error ? String(error).slice(0, 500) : null,
    Number(updatedAt || Math.floor(Date.now() / 1000)),
    session,
  ).run();
}

async function writeInstagramProgress(env, session, downloadedBytes, status, error, totalBytes) {
  const now = Math.floor(Date.now() / 1000);
  const safeDownloaded = Math.max(0, Number(downloadedBytes || 0));
  const safeStatus = String(status || "ready");
  const safeError = error ? String(error).slice(0, 500) : "";
  await Promise.all([
    persistInstagramProgress(env, session, safeDownloaded, safeStatus, safeError, now),
    publishInstagramProgress(env, session, {
      totalBytes: positiveInteger(totalBytes),
      downloadedBytes: safeDownloaded,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    }),
  ]);
}

async function completeInstagramProgress(env, session, downloadedBytes) {
  const actualBytes = positiveInteger(downloadedBytes);
  const now = Math.floor(Date.now() / 1000);
  if (!actualBytes) {
    await writeInstagramProgress(env, session, 0, "failed", "Download ended before data was received", 0);
    return;
  }
  await env.DB.prepare(
    "UPDATE vexa_instagram_download_progress SET total_bytes = ?, downloaded_bytes = ?, status = 'completed', error = NULL, updated_at = ? WHERE session = ?"
  ).bind(actualBytes, actualBytes, now, session).run();
  await publishInstagramProgress(env, session, {
    totalBytes: actualBytes,
    downloadedBytes: actualBytes,
    status: "completed",
    error: "",
    updatedAt: now,
  });
}

async function publishInstagramProgress(env, session, payload) {
  if (!env.VEXA_INSTAGRAM_PROGRESS) return;
  const totalBytes = positiveInteger(payload.totalBytes);
  if (!totalBytes) return;
  const id = env.VEXA_INSTAGRAM_PROGRESS.idFromName(session);
  const stub = env.VEXA_INSTAGRAM_PROGRESS.get(id);
  await stub.fetch(new Request("https://vexa-instagram-progress/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      totalBytes,
      downloadedBytes: Math.max(0, Number(payload.downloadedBytes || 0)),
      percent: progressPercent(payload.downloadedBytes, totalBytes, payload.status),
      status: String(payload.status || "ready"),
      error: payload.error || "",
      updatedAt: Number(payload.updatedAt || 0),
    }),
  })).catch(() => null);
}

function progressPercent(downloadedBytes, totalBytes, status) {
  if (String(status || "") === "completed") return 100;
  const total = positiveInteger(totalBytes);
  if (!total) return 0;
  const value = (Math.max(0, Number(downloadedBytes || 0)) / total) * 100;
  return Math.max(0, Math.min(99, Math.round(value * 10) / 10));
}

async function ensureInstagramTables(env) {
  if (!tablesReady) {
    tablesReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_instagram_download_tokens (" +
          "token TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_url TEXT NOT NULL, title TEXT, catalog_json TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_instagram_download_progress (" +
          "session TEXT PRIMARY KEY, download_token TEXT NOT NULL, user_id TEXT NOT NULL, source_url TEXT NOT NULL, " +
          "format_id TEXT NOT NULL, option_key TEXT NOT NULL, file_name TEXT NOT NULL, total_bytes INTEGER NOT NULL, " +
          "downloaded_bytes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ready', error TEXT, " +
          "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_vexa_instagram_progress_user_created ON vexa_instagram_download_progress (user_id, created_at DESC)"
      ).run();
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  await tablesReady;
}

async function ensureProgressTable(env) {
  if (!progressTableReady) {
    progressTableReady = ensureInstagramTables(env).catch((error) => {
      progressTableReady = null;
      throw error;
    });
  }
  await progressTableReady;
}

async function assertLiveAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    const error = new Error("Vexa Live is updating");
    error.status = 423;
    throw error;
  }
}

async function buildInstagramCatalog(data) {
  const media = firstInstagramVideo(data);
  const formats = Array.isArray(media?.formats) ? media.formats : [];
  const duration = positiveNumber(media?.duration || data?.duration);
  const byHeight = new Map();

  for (const format of formats) {
    if (!isInstagramMp4Format(format)) continue;
    const height = positiveInteger(format?.height || media?.height);
    const width = positiveInteger(format?.width || media?.width);
    const formatId = String(format?.format_id || "").trim();
    if (!height || !formatId) continue;
    let sizeBytes = formatSizeBytes(format, duration);
    if (!sizeBytes) sizeBytes = await remoteFormatSize(format?.url).catch(() => 0);
    if (!sizeBytes) sizeBytes = estimatedInstagramSize(height, duration);
    if (!sizeBytes) continue;

    const option = {
      key: "v" + height,
      kind: "video",
      width,
      height,
      duration,
      sizeBytes,
      formatId,
      filename: INSTAGRAM_FILE_PREFIX + height + "p.mp4",
      label: height + "p",
      score: instagramFormatScore(format),
    };
    const current = byHeight.get(height);
    if (!current || option.score > current.score) byHeight.set(height, option);
  }

  const options = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .slice(0, 7)
    .map(({ score, ...option }) => option);
  const title = String(media?.title || data?.title || "Instagram video").trim() || "Instagram video";
  return { title, options };
}

function firstInstagramVideo(data) {
  if (Array.isArray(data?.formats) && data.formats.length) return data;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.find((entry) => Array.isArray(entry?.formats) && entry.formats.length) || data;
}

function isInstagramMp4Format(format) {
  if (!format || format.has_drm) return false;
  const ext = String(format.ext || "").toLowerCase();
  const protocol = String(format.protocol || "").toLowerCase();
  const url = String(format.url || "");
  const vcodec = String(format.vcodec || "").toLowerCase();
  const acodec = String(format.acodec || "").toLowerCase();
  if (ext !== "mp4" || !/^https?:\/\//i.test(url)) return false;
  if (protocol && !protocol.startsWith("http")) return false;
  if (vcodec === "none") return false;
  if (acodec === "none") return false;
  return true;
}

function formatSizeBytes(format, duration) {
  const exact = positiveNumber(format?.filesize);
  if (exact) return Math.ceil(exact);
  const approximate = positiveNumber(format?.filesize_approx);
  if (approximate) return Math.ceil(approximate);
  const bitrate = positiveNumber(format?.tbr) || positiveNumber(format?.vbr);
  if (!bitrate || !duration) return 0;
  return Math.ceil(bitrate * 125 * duration * 1.05);
}

async function remoteFormatSize(value) {
  const url = String(value || "");
  if (!/^https?:\/\//i.test(url)) return 0;
  const headers = {
    "Referer": "https://www.instagram.com/",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  };
  const head = await fetch(url, { method: "HEAD", headers, redirect: "follow" }).catch(() => null);
  const headSize = positiveInteger(head?.headers?.get("Content-Length"));
  if (head?.ok && headSize) return headSize;
  const probe = await fetch(url, {
    method: "GET",
    headers: { ...headers, "Range": "bytes=0-0" },
    redirect: "follow",
  }).catch(() => null);
  const range = String(probe?.headers?.get("Content-Range") || "");
  try { await probe?.body?.cancel?.(); } catch (error) {}
  const match = range.match(/\/(\d+)$/u);
  return match ? positiveInteger(match[1]) : positiveInteger(probe?.headers?.get("Content-Length"));
}

function estimatedInstagramSize(height, duration) {
  if (!duration || !height) return 0;
  const kbps = Math.max(900, Math.min(8500, height * 4.5));
  return Math.ceil(kbps * 125 * duration * 1.08);
}

function instagramFormatScore(format) {
  return (positiveNumber(format?.fps) || 0) * 1000 +
    (positiveNumber(format?.tbr) || positiveNumber(format?.vbr) || 0);
}

function sanitizeCatalogOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => ({
    key: cleanOptionKey(option?.key),
    kind: "video",
    width: positiveInteger(option?.width),
    height: positiveInteger(option?.height),
    duration: positiveNumber(option?.duration),
    sizeBytes: positiveInteger(option?.sizeBytes),
    formatId: String(option?.formatId || "").slice(0, 120),
    filename: String(option?.filename || "").slice(0, 240),
    label: String(option?.label || "").slice(0, 80),
  })).filter((option) => option.key && option.height && option.sizeBytes && option.formatId && option.filename);
}

function parseCatalog(value) {
  try { return sanitizeCatalogOptions(JSON.parse(String(value || "[]"))); } catch (error) { return []; }
}

export function normalizeInstagramUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try { url = new URL(raw); } catch (error) { return ""; }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  const host = url.hostname.toLowerCase();
  if (!(host === INSTAGRAM_HOST_SUFFIX || host.endsWith("." + INSTAGRAM_HOST_SUFFIX))) return "";
  const path = url.pathname.replace(/\/+$/u, "");
  const share = path.match(/^\/share\/(reel|p)\/([A-Za-z0-9_-]+)$/u);
  const match = path.match(/^\/(?:[^/]+\/)?(p|tv|reels?)\/([A-Za-z0-9_-]+)$/u);
  if (!share && !match) return "";
  url.hostname = "www.instagram.com";
  url.pathname = share
    ? "/share/" + share[1] + "/" + share[2]
    : "/" + match[1] + "/" + match[2] + "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function instagramDownloadHeaders(fileName) {
  const name = sanitizeFileName(fileName) || "Vexa-Instagram-video.mp4";
  return new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + name + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
  });
}

function sanitizeFileName(value) {
  return String(value || "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
}

function instagramError(detail) {
  const raw = String(detail || "");
  if (/rate.?limit|too many requests|http error 429|exceeded the rate-limit/i.test(raw)) {
    return new Error("Instagram temporarily rate-limited the server");
  }
  if (/login required|log in|sign in|registered users|follow this account|private/i.test(raw)) {
    return new Error("This Instagram video requires additional access");
  }
  if (/not available|unavailable|removed|deleted|empty media response/i.test(raw)) {
    return new Error("This Instagram video is unavailable");
  }
  if (/no video|no formats|requested format is not available/i.test(raw)) {
    return new Error("Instagram did not expose a downloadable MP4 video");
  }
  if (/403|forbidden/i.test(raw)) {
    return new Error("Instagram blocked the Cloudflare download request");
  }
  if (/stream did not start/i.test(raw)) return new Error("Instagram stream did not start in time");
  if (/invalid mp4/i.test(raw)) return new Error("Instagram returned an invalid MP4 stream");
  console.error("Unclassified Instagram yt-dlp error", raw.slice(-4000));
  return new Error("Instagram download is temporarily unavailable");
}

function publicInstagramError(error) {
  const message = String(error?.message || "");
  return INSTAGRAM_PUBLIC_ERRORS.has(message)
    ? message
    : instagramError(message).message;
}

function isInstagramPublicError(error) {
  return INSTAGRAM_PUBLIC_ERRORS.has(String(error?.message || ""));
}

const INSTAGRAM_PUBLIC_ERRORS = new Set([
  "Instagram temporarily rate-limited the server",
  "This Instagram video requires additional access",
  "This Instagram video is unavailable",
  "Instagram did not expose a downloadable MP4 video",
  "Instagram blocked the Cloudflare download request",
  "Instagram stream did not start in time",
  "Instagram returned an invalid MP4 stream",
  "Instagram download is temporarily unavailable",
  "Could not start the Instagram download",
]);

async function collectText(stream, maxBytes) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      total += next.value.byteLength;
      if (total <= maxBytes) text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {}
  return text.trim();
}

async function readStreamPrefix(reader, minBytes) {
  const chunks = [];
  let total = 0;
  while (total < minBytes) {
    const next = await reader.read();
    if (next.done) break;
    if (!next.value?.byteLength) continue;
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  if (!total) return null;
  if (chunks.length === 1) return chunks[0];
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function stopProcessNow(process, reader, reason) {
  try { process.kill(9); } catch (error) {}
  try { reader?.cancel?.(reason)?.catch?.(() => null); } catch (error) {}
}

async function settleWithin(promise, timeoutMs, fallback) {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } catch (error) {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function processFailureDetail(process, stderrPromise) {
  const [exitCode, stderr] = await Promise.all([
    settleWithin(process.exitCode.catch(() => -1), PROCESS_SETTLE_TIMEOUT_MS, -1),
    settleWithin(stderrPromise.catch(() => ""), PROCESS_SETTLE_TIMEOUT_MS, ""),
  ]);
  return String(stderr || "").trim() || "yt-dlp exited with code " + String(exitCode);
}

function looksLikeMp4(chunk) {
  return chunk instanceof Uint8Array && chunk.byteLength >= 12 &&
    chunk[4] === 0x66 && chunk[5] === 0x74 && chunk[6] === 0x79 && chunk[7] === 0x70;
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const INSTAGRAM_RUNTIME_JS = String.raw`
(function () {
  'use strict';
  const PREPARE_URL='/mini-app/live/api/instagram/prepare';
  const SESSION_URL='/mini-app/live/api/instagram/session';
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const qualityNode=document.getElementById('vexaLiveQuality');
  const nativePrompt=window.prompt.bind(window);
  let instagramActive=false;
  let passthroughLocked=false;
  let passthroughSource='';
  let prepared=null;
  let preparingPromise=null;
  let downloadToken='';
  let sourceUrl='';
  let qualityOptions=[];
  let selectedOptionKey='';
  let busy=false;
  let progressSocket=null;
  let reconnectTimer=0;
  let reconnectAttempt=0;
  let displayedPercent=0;
  let percentAnimation=0;
  let telegramEventBound=false;

  function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch(error){}return window;}
  function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
  function initData(){return String(telegram()?.initData||'');}
  function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch(error){}}
  function mb(bytes){return(Math.max(0,Number(bytes||0))/1048576).toFixed(1);}
  function formatPercent(value){const number=Math.max(0,Math.min(100,Number(value||0)));if(number>=100)return'100%';const rounded=Math.round(number*10)/10;return(String(rounded).includes('.')?rounded.toFixed(1):String(rounded))+"%";}
  function normalizeInstagram(value){try{const url=new URL(String(value||'').trim());const host=url.hostname.toLowerCase();if(url.protocol!=='https:'||!(host==='instagram.com'||host.endsWith('.instagram.com')))return'';const path=url.pathname.replace(/\/+$/,'');if(!(/^\/(?:[^/]+\/)?(?:p|tv|reels?)\/[A-Za-z0-9_-]+$/.test(path)||/^\/share\/(?:reel|p)\/[A-Za-z0-9_-]+$/.test(path)))return'';return url.href;}catch(error){return'';}}
  function launchPreset(){const host=hostWindow();try{const params=new URLSearchParams(host.location.search);if(params.get('vexaDownload')!=='1')return{source:'',optionKey:''};const source=String(params.get('vexaSource')||'').trim();const optionKey=/^v\d{2,4}$/.test(String(params.get('vexaOption')||''))?String(params.get('vexaOption')):'';return{source,optionKey};}catch(error){return{source:'',optionKey:''};}}
  function stripInstagramPreset(){const host=hostWindow();try{const url=new URL(host.location.href);url.searchParams.delete('vexaDownload');url.searchParams.delete('vexaSource');url.searchParams.delete('vexaOption');host.history.replaceState(host.history.state,'',url.href);}catch(error){}}
  function setState(state,message,detail){if(root)root.dataset.state=String(state||'idle');if(statusNode)statusNode.textContent=String(message||'');if(detailNode)detailNode.textContent=String(detail||'');}
  function setButton(text,disabled){if(!button)return;button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function setProgress(value,animate){const target=Math.max(0,Math.min(100,Number(value||0)));if(root)root.style.setProperty('--vexa-progress',String(target/100));if(track)track.setAttribute('aria-valuenow',String(Math.round(target*10)/10));cancelAnimationFrame(percentAnimation);if(!animate){displayedPercent=target;if(percentNode)percentNode.textContent=formatPercent(target);return;}const from=displayedPercent;const started=performance.now();const duration=Math.min(650,220+Math.abs(target-from)*12);const tick=function(now){const t=Math.min(1,(now-started)/Math.max(1,duration));const eased=1-Math.pow(1-t,3);displayedPercent=from+(target-from)*eased;if(percentNode)percentNode.textContent=formatPercent(displayedPercent);if(t<1)percentAnimation=requestAnimationFrame(tick);};percentAnimation=requestAnimationFrame(tick);}
  function selectedQuality(){return qualityOptions.find(function(option){return option.key===selectedOptionKey;})||null;}
  function qualityDetail(option){if(!option)return'';return String(option.label||option.key)+' · '+mb(option.sizeBytes)+' MB';}
  function updateQualitySelection(){if(!qualityNode)return;for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedOptionKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}}
  function selectQuality(key,announce){const option=qualityOptions.find(function(item){return item.key===String(key||'');});if(!option||busy)return false;selectedOptionKey=option.key;prepared=null;closeProgressSocket();setProgress(0,true);updateQualitySelection();if(announce!==false){setState('waiting','Ready to download',qualityDetail(option));haptic('light');}setButton('Download',false);return true;}
  function renderQualities(options,preferredKey){if(!qualityNode)return false;qualityOptions=Array.isArray(options)?options.filter(function(option){return option&&/^v\d{2,4}$/.test(String(option.key||''))&&Number(option.sizeBytes||0)>0;}):[];qualityNode.replaceChildren();if(!qualityOptions.length){qualityNode.dataset.ready='0';selectedOptionKey='';return false;}for(const option of qualityOptions){const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');const label=document.createElement('span');label.textContent=String(option.label||option.key);const size=document.createElement('small');size.textContent=mb(option.sizeBytes)+' MB';item.append(label,size);item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();selectQuality(option.key,true);});qualityNode.appendChild(item);}qualityNode.dataset.ready='1';const preferred=qualityOptions.some(function(option){return option.key===preferredKey;})?preferredKey:'';const lowest=qualityOptions.slice().sort(function(a,b){return Number(a.height||99999)-Number(b.height||99999);})[0];return selectQuality(preferred||(lowest?.key||qualityOptions[0].key),false);}
  function clearQualities(){qualityOptions=[];selectedOptionKey='';if(qualityNode){qualityNode.replaceChildren();qualityNode.dataset.ready='0';}}
  function closeProgressSocket(resetAttempt){clearTimeout(reconnectTimer);reconnectTimer=0;if(resetAttempt!==false)reconnectAttempt=0;const socket=progressSocket;progressSocket=null;if(socket)try{socket.close(1000,'done');}catch(error){}}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  function handleProgress(data){if(!data?.ok)return;const total=Number(data.totalBytes||prepared?.fileSize||0);const done=Math.max(0,Number(data.downloadedBytes||0));const pct=Math.max(0,Math.min(100,Number(data.percent||0)));const state=String(data.status||'ready');if(state==='completed'){busy=false;setProgress(100,true);setState('completed','Downloaded',mb(done||total)+' MB');setButton('Download again',false);closeProgressSocket();haptic('medium');return;}if(state==='failed'||state==='cancelled'){busy=false;setState('error',String(data.error||'Download failed'),done?mb(done)+' MB received':qualityDetail(selectedQuality()));setButton('Try again',false);closeProgressSocket();prepared=null;return;}if(state==='staging'||state==='transcribing'||state==='translating'||state==='rendering'||state==='finalizing'){const label=state==='staging'?'Getting video':state==='transcribing'?'Creating subtitles':state==='translating'?'Translating subtitles':state==='rendering'?'Rendering subtitles':'Finishing video';setProgress(Math.max(displayedPercent,pct),true);setState('downloading',label,formatPercent(pct)+' · Keep the app open');return;}if(state==='preparing'){if(displayedPercent<=0)setProgress(0,false);setState('preparing','Preparing download','This may take a few minutes. Keep the app open.');return;}if(state==='downloading'){setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Downloading',mb(done)+' MB / '+mb(total)+' MB · Keep the app open');}}
  function connectProgress(progressUrl,reconnecting){clearTimeout(reconnectTimer);reconnectTimer=0;const previous=progressSocket;progressSocket=null;if(previous)try{previous.close(1000,'reconnect');}catch(error){}if(!reconnecting)reconnectAttempt=0;const target=String(progressUrl||'');if(!target)return;const socket=new WebSocket(wsUrl(target));progressSocket=socket;socket.addEventListener('open',function(){if(progressSocket!==socket)return;reconnectAttempt=0;});socket.addEventListener('message',function(event){if(progressSocket!==socket)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}handleProgress(data);});socket.addEventListener('close',function(){if(progressSocket===socket)progressSocket=null;if(!busy||!prepared?.progressUrl)return;const delay=Math.min(10000,500*Math.pow(2,Math.min(reconnectAttempt,5)));reconnectAttempt=Math.min(reconnectAttempt+1,6);reconnectTimer=setTimeout(function(){if(busy&&prepared?.progressUrl)connectProgress(prepared.progressUrl,true);},delay);});socket.addEventListener('error',function(){try{socket.close();}catch(error){}});}
  function cancelDownload(){if(!busy)return;busy=false;closeProgressSocket();setProgress(0,true);setState('waiting','Download cancelled',qualityDetail(selectedQuality()));setButton('Download',false);}
  function handleTelegramEvent(event){const state=String(event?.status||event||'').toLowerCase();if(state==='cancelled'){cancelDownload();return;}if(state==='downloading'&&busy&&displayedPercent<=0)setState('preparing','Starting download','This may take a few minutes. Keep the app open.');}
  function bindTelegramEvent(){if(telegramEventBound)return;const tg=telegram();if(!tg?.onEvent)return;try{tg.onEvent('fileDownloadRequested',handleTelegramEvent);telegramEventBound=true;}catch(error){}}
  async function prepareSource(source,preferredKey){if(preparingPromise)return preparingPromise;const clean=normalizeInstagram(source);if(!clean)return false;instagramActive=true;sourceUrl=clean;downloadToken='';prepared=null;busy=false;closeProgressSocket();clearQualities();setProgress(0,false);setState('preparing','Loading Instagram qualities','');setButton('Preparing…',true);haptic('light');preparingPromise=(async function(){try{const response=await fetch(PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:clean})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadToken||!Array.isArray(data.options)||!data.options.length)throw new Error(String(data.error||'Could not prepare Instagram video'));downloadToken=String(data.downloadToken);if(!renderQualities(data.options,preferredKey))throw new Error('Instagram quality is unavailable');const option=selectedQuality();setProgress(0,false);setState('waiting','Choose quality',qualityDetail(option));setButton('Download',false);haptic('light');return true;}catch(error){downloadToken='';prepared=null;clearQualities();setState('error',String(error?.message||'Could not prepare Instagram video'),'');setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}
  async function prepareSelectedDownload(){if(!downloadToken||!selectedOptionKey||preparingPromise)return false;const option=selectedQuality();setState('preparing','Preparing '+String(option?.label||'quality'),qualityDetail(option));setButton('Preparing…',true);preparingPromise=(async function(){try{const response=await fetch(SESSION_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedOptionKey})});const session=await response.json().catch(function(){return{};});if(!response.ok||!session.downloadUrl||!session.progressUrl||!session.fileSize)throw new Error(String(session.error||'Could not prepare Instagram quality'));prepared={downloadUrl:new URL(String(session.downloadUrl),window.location.origin).href,progressUrl:new URL(String(session.progressUrl),window.location.origin).href,fileName:String(session.fileName||'Vexa-Instagram-video.mp4'),fileSize:Number(session.fileSize||0),title:String(session.title||'Instagram video'),optionKey:String(session.optionKey||selectedOptionKey)};setProgress(0,false);setState('waiting','Ready to download',qualityDetail(option));setButton('Download',false);return true;}catch(error){prepared=null;setState('error',String(error?.message||'Could not prepare Instagram quality'),qualityDetail(option));setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}
  function requestDownload(){if(!prepared||busy)return;busy=true;setProgress(0,false);setState('preparing','Waiting for Telegram','This may take a few minutes. Keep the app open.');setButton('Downloading…',true);connectProgress(prepared.progressUrl,false);bindTelegramEvent();haptic('light');const tg=telegram();if(tg?.downloadFile){try{tg.downloadFile({url:prepared.downloadUrl,file_name:prepared.fileName},function(accepted){if(accepted===false){cancelDownload();return;}if(displayedPercent<=0)setState('preparing','Starting download','This may take a few minutes. Keep the app open.');});return;}catch(error){console.warn('Telegram Instagram downloadFile failed',error?.message||error);}}try{const link=document.createElement('a');link.href=prepared.downloadUrl;link.download=prepared.fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();if(displayedPercent<=0)setState('preparing','Starting download','This may take a few minutes. Keep the app open.');}catch(error){busy=false;closeProgressSocket();setState('error','Could not start download','');setButton('Try again',false);}}
  async function handleInstagramButton(){if(busy||button?.disabled)return;if(prepared){requestDownload();return;}if(downloadToken&&selectedOptionKey){const ready=await prepareSelectedDownload();if(ready)requestDownload();return;}if(sourceUrl)await prepareSource(sourceUrl,selectedOptionKey);}
  function queuePassthroughPrompt(source){passthroughLocked=true;passthroughSource=source;const previous=window.prompt;window.prompt=function(message,defaultValue){if(passthroughSource){const value=passthroughSource;passthroughSource='';window.prompt=previous;return value;}return previous.call(window,message,defaultValue);};}
  function captureButtonClick(event){if(instagramActive){event.preventDefault();event.stopImmediatePropagation();handleInstagramButton();return;}if(passthroughLocked)return;const source=nativePrompt('Enter video link');if(source===null){event.preventDefault();event.stopImmediatePropagation();return;}const clean=String(source||'').trim();if(!clean){event.preventDefault();event.stopImmediatePropagation();return;}const instagram=normalizeInstagram(clean);if(instagram){event.preventDefault();event.stopImmediatePropagation();prepareSource(instagram,'');return;}queuePassthroughPrompt(clean);}

  button?.addEventListener('click',captureButtonClick,true);
  bindTelegramEvent();
  const preset=launchPreset();
  const instagramPreset=normalizeInstagram(preset.source);
  if(instagramPreset){instagramActive=true;sourceUrl=instagramPreset;stripInstagramPreset();setTimeout(function(){prepareSource(instagramPreset,preset.optionKey);},0);}else if(preset.source){passthroughLocked=true;}
})();
`;