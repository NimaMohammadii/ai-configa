import { DurableObject } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
  createVexaDownloadAttempt,
  updateVexaDownloadAttempt,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const PREPARE_PATH = "/mini-app/live/api/instagram/prepare";
const SESSION_PATH = "/mini-app/live/api/instagram/session";
const DOWNLOAD_PATH = "/mini-app/live/api/instagram/download";
const PROGRESS_PATH = "/mini-app/live/api/instagram/progress";

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
      ...YTDLP_ARGS.filter((arg) => arg !== "--no-playlist"),
      "--ignore-no-formats-error",
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
      if (!catalog.options.length && !catalog.media.length) {
        throw new Error("Instagram did not expose downloadable media");
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
  return path === PREPARE_PATH || path === SESSION_PATH || path === DOWNLOAD_PATH || path === PROGRESS_PATH;
}

export async function handleInstagramDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
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

async function prepareInstagram(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const sourceUrl = normalizeInstagramUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid Instagram Reel or video post link" }, 400);
  if (!env.VEXA_INSTAGRAM) return json({ error: "Instagram download is temporarily unavailable" }, 503);
  const attemptId = await createVexaDownloadAttempt(env, {
    userId: user.id,
    sourceUrl,
    provider: "instagram",
    channel: "mini_app",
    status: "pending",
    stage: "inspecting",
  }).catch(() => 0);

  let catalog;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + safeContainerKey(user.id));
    catalog = await container.getInstagramCatalog(sourceUrl);
  } catch (error) {
    console.error("Vexa Instagram metadata failed", error?.stack || error);
    const message = publicInstagramError(error);
    await updateVexaDownloadAttempt(env, attemptId, { status: "failed", stage: "inspecting", errorMessage: message }).catch(() => null);
    return json({ error: message }, 502);
  }

  const options = sanitizeCatalogOptions(catalog?.options);
  if (!options.length) {
    const message = "Instagram did not expose a downloadable MP4 video";
    await updateVexaDownloadAttempt(env, attemptId, { status: "failed", stage: "inspecting", errorMessage: message }).catch(() => null);
    return json({ error: message }, 422);
  }

  await ensureInstagramTables(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  const title = String(catalog?.title || "Instagram video").slice(0, 500);
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_download_tokens " +
    "(token, user_id, source_url, title, catalog_json, attempt_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    token,
    String(user.id),
    sourceUrl,
    title,
    JSON.stringify(options),
    attemptId || null,
    now,
    now + TOKEN_TTL_SECONDS,
  ).run();

  await updateVexaDownloadAttempt(env, attemptId, { status: "ready", stage: "quality_selection" }).catch(() => null);
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
    "SELECT user_id, source_url, title, catalog_json, attempt_id, expires_at FROM vexa_instagram_download_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Instagram download session expired. Prepare the video again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Instagram download session does not belong to this user" }, 403);
  }

  const options = parseCatalog(row.catalog_json);
  const selected = options.find((option) => option.key === optionKey) || null;
  if (!selected) {
    const message = "Selected Instagram quality is unavailable";
    await updateVexaDownloadAttempt(env, row.attempt_id, { status: "failed", stage: "quality_selection", errorMessage: message }).catch(() => null);
    return json({ error: message }, 409);
  }

  const session = randomToken();
  const fileName = String(selected.filename || INSTAGRAM_FILE_PREFIX + selected.height + "p.mp4");
  const totalBytes = positiveInteger(selected.sizeBytes);
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_download_progress " +
    "(session, download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at, attempt_id) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?, ?)"
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
    Number(row.attempt_id || 0) || null,
  ).run();
  await updateVexaDownloadAttempt(env, row.attempt_id, {
    status: "ready",
    stage: "quality_selection",
    optionKey: selected.key,
    totalBytes,
  }).catch(() => null);

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
  await updateVexaDownloadAttempt(env, row.attempt_id, {
    status: "downloading",
    stage: "preparing",
    optionKey: row.option_key,
    totalBytes,
  }).catch(() => null);

  let sourceStream;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + safeContainerKey(row.user_id));
    sourceStream = await container.streamInstagramVideo(String(row.source_url), String(row.format_id));
  } catch (error) {
    const message = publicInstagramError(error);
    await writeInstagramProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    await updateVexaDownloadAttempt(env, row.attempt_id, { status: "failed", stage: "preparing", errorMessage: message, totalBytes }).catch(() => null);
    return json({ error: message }, 502);
  }
  if (!sourceStream) {
    const message = "Could not start the Instagram download";
    await writeInstagramProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    await updateVexaDownloadAttempt(env, row.attempt_id, { status: "failed", stage: "preparing", errorMessage: message, totalBytes }).catch(() => null);
    return json({ error: message }, 502);
  }

  await updateVexaDownloadAttempt(env, row.attempt_id, { status: "downloading", stage: "streaming", totalBytes }).catch(() => null);
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
          await updateVexaDownloadAttempt(env, row.attempt_id, { status: "delivered", stage: "delivered", totalBytes, transferredBytes: downloaded }).catch(() => null);
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
          const message = publicInstagramError(error);
          await writeInstagramProgress(env, session, downloaded, "failed", message, totalBytes).catch(() => null);
          await updateVexaDownloadAttempt(env, row.attempt_id, { status: "failed", stage: "streaming", errorMessage: message, totalBytes, transferredBytes: downloaded }).catch(() => null);
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
    "SELECT download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, status, attempt_id, expires_at " +
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
          "token TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_url TEXT NOT NULL, title TEXT, catalog_json TEXT NOT NULL, attempt_id INTEGER, " +
          "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_instagram_download_progress (" +
          "session TEXT PRIMARY KEY, download_token TEXT NOT NULL, user_id TEXT NOT NULL, source_url TEXT NOT NULL, " +
          "format_id TEXT NOT NULL, option_key TEXT NOT NULL, file_name TEXT NOT NULL, total_bytes INTEGER NOT NULL, " +
          "downloaded_bytes INTEGER NOT NULL DEFAULT '0', status TEXT NOT NULL DEFAULT 'ready', error TEXT, " +
          "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempt_id INTEGER)"
      ).run();
      for (const table of ["vexa_instagram_download_tokens", "vexa_instagram_download_progress"]) {
        try {
          await env.DB.prepare("ALTER TABLE " + table + " ADD COLUMN attempt_id INTEGER").run();
        } catch (error) {
          if (!/duplicate column name/i.test(String(error?.message || error))) throw error;
        }
      }
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
  const entries = instagramMediaEntries(data);
  const firstVideo = entries.find((entry) => Array.isArray(entry?.formats) && entry.formats.some(isInstagramMp4Format)) || data;
  const formats = Array.isArray(firstVideo?.formats) ? firstVideo.formats : [];
  const duration = positiveNumber(firstVideo?.duration || data?.duration);
  const byHeight = new Map();

  for (const format of formats) {
    if (!isInstagramMp4Format(format)) continue;
    const height = positiveInteger(format?.height || firstVideo?.height);
    const width = positiveInteger(format?.width || firstVideo?.width);
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
  const media = [];
  for (let index = 0; index < entries.length; index += 1) {
    const item = await bestInstagramPostMedia(entries[index], index + 1);
    if (item) media.push(item);
  }
  const title = String(data?.title || firstVideo?.title || "Instagram post").trim() || "Instagram post";
  return { title, options, media };
}

function instagramMediaEntries(data) {
  const entries = Array.isArray(data?.entries) ? data.entries.filter(Boolean) : [];
  return entries.length ? entries : data ? [data] : [];
}

async function bestInstagramPostMedia(entry, position) {
  const formats = (Array.isArray(entry?.formats) ? entry.formats : [])
    .filter(isInstagramMp4Format)
    .sort((a, b) => {
      const heightDiff = positiveInteger(b?.height || entry?.height) - positiveInteger(a?.height || entry?.height);
      if (heightDiff) return heightDiff;
      const widthDiff = positiveInteger(b?.width || entry?.width) - positiveInteger(a?.width || entry?.width);
      if (widthDiff) return widthDiff;
      return instagramFormatScore(b) - instagramFormatScore(a);
    });
  if (formats.length) {
    const format = formats[0];
    const width = positiveInteger(format?.width || entry?.width);
    const height = positiveInteger(format?.height || entry?.height);
    const duration = positiveNumber(entry?.duration);
    let sizeBytes = formatSizeBytes(format, duration);
    if (!sizeBytes) sizeBytes = await remoteFormatSize(format?.url).catch(() => 0);
    if (!sizeBytes) sizeBytes = estimatedInstagramSize(height, duration);
    return {
      kind: "video",
      url: String(format?.url || ""),
      width,
      height,
      duration,
      sizeBytes,
      filename: INSTAGRAM_FILE_PREFIX + String(position).padStart(2, "0") + "-" + (height ? height + "p" : "video") + ".mp4",
    };
  }

  const candidates = [];
  for (const thumbnail of Array.isArray(entry?.thumbnails) ? entry.thumbnails : []) {
    const url = String(thumbnail?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    candidates.push({
      url,
      width: positiveInteger(thumbnail?.width),
      height: positiveInteger(thumbnail?.height),
    });
  }
  const fallbackUrl = String(entry?.thumbnail || "").trim();
  if (/^https?:\/\//i.test(fallbackUrl)) {
    candidates.push({
      url: fallbackUrl,
      width: positiveInteger(entry?.width),
      height: positiveInteger(entry?.height),
    });
  }
  candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const image = candidates[0];
  if (!image) return null;
  return {
    kind: "photo",
    url: image.url,
    width: image.width,
    height: image.height,
    sizeBytes: 0,
    filename: INSTAGRAM_FILE_PREFIX + String(position).padStart(2, "0") + ".jpg",
  };
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
  if (/did not expose downloadable media/i.test(raw)) return new Error("Instagram did not expose downloadable media");
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
  "Instagram did not expose downloadable media",
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
