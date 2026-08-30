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

const RUNTIME_PATH = "/mini-app/vexa-live/aparat-download.js";
const PREPARE_PATH = "/mini-app/live/api/aparat/prepare";
const SESSION_PATH = "/mini-app/live/api/aparat/session";
const DOWNLOAD_PATH = "/mini-app/live/api/aparat/download";
const PROGRESS_PATH = "/mini-app/live/api/aparat/progress";

const TOKEN_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 60 * 60;
const METADATA_TIMEOUT_MS = 90_000;
const STREAM_START_TIMEOUT_MS = 90_000;
const PROCESS_SETTLE_TIMEOUT_MS = 2_000;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 750;
const APARAT_FILE_PREFIX = "Vexa-Aparat-";
const APARAT_REFERER = "https://www.aparat.com/";
const APARAT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const YTDLP_ARGS = Object.freeze([
  "--ignore-config",
  "--no-playlist",
  "--force-ipv4",
  "--socket-timeout",
  "15",
  "--retries",
  "2",
  "--fragment-retries",
  "2",
]);

let tablesReady = null;
let progressTableReady = null;

export class VexaAparatContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async getAparatCatalog(url) {
    const sourceUrl = normalizeAparatUrl(url);
    if (!sourceUrl) throw new Error("Enter a valid Aparat video link");
    const process = await this.execYtDlp([
      ...YTDLP_ARGS,
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      sourceUrl,
    ]);
    let timer = 0;
    try {
      const output = await Promise.race([
        process.output(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            try { process.kill(); } catch (error) {}
            reject(new Error("Aparat metadata request timed out"));
          }, METADATA_TIMEOUT_MS);
        }),
      ]);
      const decoder = new TextDecoder();
      const detail = decoder.decode(output.stderr).trim();
      if (output.exitCode !== 0) throw aparatError(detail || "metadata failed");
      const data = JSON.parse(decoder.decode(output.stdout));
      const catalog = await buildAparatCatalog(data);
      if (!catalog.options.length) throw new Error("Aparat did not expose a downloadable MP4 video");
      return catalog;
    } catch (error) {
      if (isAparatPublicError(error)) throw error;
      throw aparatError(error?.message || error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async streamAparatVideo(url, formatId) {
    const sourceUrl = normalizeAparatUrl(url);
    const selected = String(formatId || "").trim();
    if (!sourceUrl || !selected || selected.length > 160) {
      throw new Error("Aparat video format is unavailable");
    }
    const process = await this.execYtDlp([
      ...YTDLP_ARGS,
      "--quiet",
      "--no-warnings",
      "-f",
      selected,
      "-o",
      "-",
      sourceUrl,
    ]);
    return this.streamProcess(process);
  }

  async streamProcess(process) {
    if (!process?.stdout) throw new Error("Could not start the Aparat download");
    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        readStreamPrefix(reader, 12),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Aparat stream did not start in time")),
            STREAM_START_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      stopProcessNow(process, reader, "stream_start_failed");
      const detail = await settleWithin(stderrPromise, PROCESS_SETTLE_TIMEOUT_MS, "");
      throw aparatError(detail || error?.message || error);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!first?.byteLength) {
      stopProcessNow(process, reader, "empty_stream");
      const detail = await processFailureDetail(process, stderrPromise);
      throw aparatError(detail || "empty stream");
    }
    if (!looksLikeMp4(first)) {
      stopProcessNow(process, reader, "invalid_mp4");
      throw new Error("Aparat returned an invalid MP4 stream");
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
              controller.error(aparatError(detail || "download failed"));
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

export class VexaAparatProgressHub extends DurableObject {
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

export function isAparatDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === RUNTIME_PATH || path === PREPARE_PATH || path === SESSION_PATH ||
    path === DOWNLOAD_PATH || path === PROGRESS_PATH;
}

export async function handleAparatDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === RUNTIME_PATH) {
    return new Response(APARAT_DOWNLOAD_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && url.pathname === PREPARE_PATH) return prepareAparat(request, env, ctx);
  if (request.method === "POST" && url.pathname === SESSION_PATH) return createAparatSession(request, env, ctx);
  if (request.method === "GET" && url.pathname === PROGRESS_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      return openAparatProgressSocket(request, env);
    }
    return readAparatProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DOWNLOAD_PATH) {
    if (request.method === "HEAD") return aparatDownloadHead(request, env);
    return trackedAparatDownload(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendAparatDownloadRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  if (!String(response.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) return response;
  const source = await response.text();
  const tag = '<script src="' + RUNTIME_PATH + '?v=20260830-1"></script>';
  const html = source.includes(RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function prepareAparat(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const sourceUrl = normalizeAparatUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid Aparat video link" }, 400);
  if (!env.VEXA_APARAT) return json({ error: "Aparat download is temporarily unavailable" }, 503);

  const attemptId = await createVexaDownloadAttempt(env, {
    userId: user.id,
    sourceUrl,
    provider: "aparat",
    channel: "mini_app",
    status: "pending",
    stage: "inspecting",
  }).catch(() => 0);

  let catalog;
  try {
    const container = getContainer(env.VEXA_APARAT, "aparat-" + safeContainerKey(user.id));
    catalog = await container.getAparatCatalog(sourceUrl);
  } catch (error) {
    console.error("Vexa Aparat metadata failed", error?.stack || error);
    const message = publicAparatError(error);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: "inspecting",
      errorMessage: message,
    }).catch(() => null);
    return json({ error: message }, 502);
  }

  const options = sanitizeCatalogOptions(catalog?.options);
  if (!options.length) {
    const message = "Aparat did not expose a downloadable MP4 video";
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: "inspecting",
      errorMessage: message,
    }).catch(() => null);
    return json({ error: message }, 422);
  }

  await ensureAparatTables(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  const title = String(catalog?.title || "Aparat video").slice(0, 500);
  await env.DB.prepare(
    "INSERT INTO vexa_aparat_download_tokens " +
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

  await updateVexaDownloadAttempt(env, attemptId, {
    status: "ready",
    stage: "quality_selection",
  }).catch(() => null);
  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_aparat_download_tokens WHERE expires_at < ?")
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

async function createAparatSession(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const token = cleanToken(payload.downloadToken);
  const optionKey = cleanOptionKey(payload.optionKey);
  if (!token || !optionKey) return json({ error: "Aparat download session is invalid" }, 400);

  await ensureAparatTables(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, title, catalog_json, attempt_id, expires_at FROM vexa_aparat_download_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Aparat download session expired. Prepare the video again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Aparat download session does not belong to this user" }, 403);
  }

  const options = parseCatalog(row.catalog_json);
  const selected = options.find((option) => option.key === optionKey) || null;
  if (!selected) {
    const message = "Selected Aparat quality is unavailable";
    await updateVexaDownloadAttempt(env, row.attempt_id, {
      status: "failed",
      stage: "quality_selection",
      errorMessage: message,
    }).catch(() => null);
    return json({ error: message }, 409);
  }

  const session = randomToken();
  const fileName = String(selected.filename || APARAT_FILE_PREFIX + selected.height + "p.mp4");
  const totalBytes = positiveInteger(selected.sizeBytes);
  await env.DB.prepare(
    "INSERT INTO vexa_aparat_download_progress " +
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
    env.DB.prepare("DELETE FROM vexa_aparat_download_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    fileName,
    fileSize: totalBytes,
    title: String(row.title || "Aparat video"),
    optionKey: selected.key,
    downloadUrl: DOWNLOAD_PATH + "?token=" + encodeURIComponent(token) + "&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function aparatDownloadHead(request, env) {
  const checked = await validateAparatSession(request, env);
  if (checked.response) return checked.response;
  return new Response(null, { status: 200, headers: aparatDownloadHeaders(checked.row.file_name) });
}

async function trackedAparatDownload(request, env, ctx) {
  const checked = await validateAparatSession(request, env);
  if (checked.response) return checked.response;
  const row = checked.row;
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  let totalBytes = positiveInteger(row.total_bytes);
  await writeAparatProgress(env, session, 0, "preparing", "", totalBytes).catch(() => null);
  await updateVexaDownloadAttempt(env, row.attempt_id, {
    status: "downloading",
    stage: "preparing",
    optionKey: row.option_key,
    totalBytes,
  }).catch(() => null);

  let sourceStream;
  try {
    const container = getContainer(env.VEXA_APARAT, "aparat-" + safeContainerKey(row.user_id));
    sourceStream = await container.streamAparatVideo(String(row.source_url), String(row.format_id));
  } catch (error) {
    const message = publicAparatError(error);
    await writeAparatProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    await updateVexaDownloadAttempt(env, row.attempt_id, {
      status: "failed",
      stage: "preparing",
      errorMessage: message,
      totalBytes,
    }).catch(() => null);
    return json({ error: message }, 502);
  }

  if (!sourceStream) {
    const message = "Could not start the Aparat download";
    await writeAparatProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    await updateVexaDownloadAttempt(env, row.attempt_id, {
      status: "failed",
      stage: "preparing",
      errorMessage: message,
      totalBytes,
    }).catch(() => null);
    return json({ error: message }, 502);
  }

  await updateVexaDownloadAttempt(env, row.attempt_id, {
    status: "downloading",
    stage: "streaming",
    totalBytes,
  }).catch(() => null);

  const reader = sourceStream.getReader();
  let downloaded = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();
  let publishChain = Promise.resolve();
  let persistChain = Promise.resolve();
  let finished = false;

  const enqueueProgress = (bytes, status, error) => {
    const now = Math.floor(Date.now() / 1000);
    const safeBytes = Math.max(0, Number(bytes || 0));
    const safeStatus = String(status || "ready");
    const safeError = error ? String(error).slice(0, 500) : "";
    publishChain = publishChain.then(() => publishAparatProgress(env, session, {
      totalBytes,
      downloadedBytes: safeBytes,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    })).catch(() => null);
    persistChain = persistChain.then(() => persistAparatProgress(
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
          totalBytes = positiveInteger(downloaded) || totalBytes;
          await completeAparatProgress(env, session, downloaded).catch(() => null);
          await updateVexaDownloadAttempt(env, row.attempt_id, {
            status: "delivered",
            stage: "delivered",
            totalBytes,
            transferredBytes: downloaded,
          }).catch(() => null);
          controller.close();
          return;
        }
        if (!next.value?.byteLength) return;
        downloaded += next.value.byteLength;
        const nowMs = Date.now();
        if ((downloaded - lastReportedBytes) >= PROGRESS_REPORT_BYTES || (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS) {
          lastReportedBytes = downloaded;
          lastReportedAt = nowMs;
          enqueueProgress(downloaded, "downloading", "");
        }
        controller.enqueue(next.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          await settleProgress();
          const message = publicAparatError(error);
          await writeAparatProgress(env, session, downloaded, "failed", message, totalBytes).catch(() => null);
          await updateVexaDownloadAttempt(env, row.attempt_id, {
            status: "failed",
            stage: "streaming",
            errorMessage: message,
            totalBytes,
            transferredBytes: downloaded,
          }).catch(() => null);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (error) {}
      if (!finished) {
        finished = true;
        await settleProgress();
        await writeAparatProgress(env, session, downloaded, "cancelled", "Download was cancelled", totalBytes).catch(() => null);
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: aparatDownloadHeaders(row.file_name),
  });
}

async function validateAparatSession(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const token = cleanToken(url.searchParams.get("token"));
  if (!session || !token) return { response: json({ error: "Aparat download link is invalid" }, 400) };
  await ensureAparatTables(env);
  const row = await env.DB.prepare(
    "SELECT download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, status, attempt_id, expires_at " +
    "FROM vexa_aparat_download_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now || String(row.download_token || "") !== token) {
    return { response: json({ error: "Aparat download session expired" }, 410) };
  }
  return { row };
}

async function openAparatProgressSocket(request, env) {
  if (!env.VEXA_APARAT_PROGRESS) return json({ error: "Aparat progress is unavailable" }, 503);
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Aparat download session is invalid" }, 400);
  await ensureProgressTable(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Aparat download session expired" }, 410);
  const id = env.VEXA_APARAT_PROGRESS.idFromName(session);
  const stub = env.VEXA_APARAT_PROGRESS.get(id);
  const target = new URL("https://vexa-aparat-progress/socket");
  target.searchParams.set("session", session);
  return stub.fetch(new Request(target.href, request));
}

async function readAparatProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Aparat download session is invalid" }, 400);
  await ensureProgressTable(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Aparat download session expired" }, 410);
  return json(progressPayload(row));
}

async function readProgressRow(env, session) {
  return env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at FROM vexa_aparat_download_progress WHERE session = ?"
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

async function persistAparatProgress(env, session, downloadedBytes, status, error, updatedAt) {
  await env.DB.prepare(
    "UPDATE vexa_aparat_download_progress SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "ready"),
    error ? String(error).slice(0, 500) : null,
    Number(updatedAt || Math.floor(Date.now() / 1000)),
    session,
  ).run();
}

async function writeAparatProgress(env, session, downloadedBytes, status, error, totalBytes) {
  const now = Math.floor(Date.now() / 1000);
  const safeDownloaded = Math.max(0, Number(downloadedBytes || 0));
  const safeStatus = String(status || "ready");
  const safeError = error ? String(error).slice(0, 500) : "";
  await Promise.all([
    persistAparatProgress(env, session, safeDownloaded, safeStatus, safeError, now),
    publishAparatProgress(env, session, {
      totalBytes: positiveInteger(totalBytes),
      downloadedBytes: safeDownloaded,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    }),
  ]);
}

async function completeAparatProgress(env, session, downloadedBytes) {
  const actualBytes = positiveInteger(downloadedBytes);
  const now = Math.floor(Date.now() / 1000);
  if (!actualBytes) {
    await writeAparatProgress(env, session, 0, "failed", "Download ended before data was received", 0);
    return;
  }
  await env.DB.prepare(
    "UPDATE vexa_aparat_download_progress SET total_bytes = ?, downloaded_bytes = ?, status = 'completed', error = NULL, updated_at = ? WHERE session = ?"
  ).bind(actualBytes, actualBytes, now, session).run();
  await publishAparatProgress(env, session, {
    totalBytes: actualBytes,
    downloadedBytes: actualBytes,
    status: "completed",
    error: "",
    updatedAt: now,
  });
}

async function publishAparatProgress(env, session, payload) {
  if (!env.VEXA_APARAT_PROGRESS) return;
  const totalBytes = positiveInteger(payload.totalBytes);
  if (!totalBytes) return;
  const id = env.VEXA_APARAT_PROGRESS.idFromName(session);
  const stub = env.VEXA_APARAT_PROGRESS.get(id);
  await stub.fetch(new Request("https://vexa-aparat-progress/publish", {
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

async function ensureAparatTables(env) {
  if (!tablesReady) {
    tablesReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_aparat_download_tokens (" +
          "token TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_url TEXT NOT NULL, title TEXT, catalog_json TEXT NOT NULL, attempt_id INTEGER, " +
          "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_aparat_download_progress (" +
          "session TEXT PRIMARY KEY, download_token TEXT NOT NULL, user_id TEXT NOT NULL, source_url TEXT NOT NULL, " +
          "format_id TEXT NOT NULL, option_key TEXT NOT NULL, file_name TEXT NOT NULL, total_bytes INTEGER NOT NULL, " +
          "downloaded_bytes INTEGER NOT NULL DEFAULT '0', status TEXT NOT NULL DEFAULT 'ready', error TEXT, " +
          "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempt_id INTEGER)"
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_vexa_aparat_progress_user_created ON vexa_aparat_download_progress (user_id, created_at DESC)"
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
    progressTableReady = ensureAparatTables(env).catch((error) => {
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

async function buildAparatCatalog(data) {
  const formats = Array.isArray(data?.formats) ? data.formats : [];
  const duration = positiveNumber(data?.duration);
  const byHeight = new Map();

  for (const format of formats) {
    if (!isAparatMp4Format(format)) continue;
    const height = aparatFormatHeight(format);
    const width = positiveInteger(format?.width);
    const formatId = String(format?.format_id || "").trim();
    if (!height || !formatId) continue;
    let sizeBytes = formatSizeBytes(format, duration);
    if (!sizeBytes) sizeBytes = await remoteFormatSize(format?.url).catch(() => 0);
    if (!sizeBytes) sizeBytes = estimatedAparatSize(height, duration);
    if (!sizeBytes) continue;

    const option = {
      key: "v" + height,
      kind: "video",
      width,
      height,
      duration,
      sizeBytes,
      formatId,
      filename: APARAT_FILE_PREFIX + height + "p.mp4",
      label: height + "p",
      score: aparatFormatScore(format),
    };
    const current = byHeight.get(height);
    if (!current || option.score > current.score) byHeight.set(height, option);
  }

  const options = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .slice(0, 7)
    .map(({ score, ...option }) => option);
  const title = String(data?.title || "Aparat video").trim() || "Aparat video";
  return { title, options };
}

function isAparatMp4Format(format) {
  if (!format || format.has_drm) return false;
  const ext = String(format.ext || "").toLowerCase();
  const protocol = String(format.protocol || "").toLowerCase();
  const url = String(format.url || "");
  const vcodec = String(format.vcodec || "").toLowerCase();
  const acodec = String(format.acodec || "").toLowerCase();
  if (ext !== "mp4" || !/^https?:\/\//i.test(url)) return false;
  if (protocol && !protocol.startsWith("http")) return false;
  if (vcodec === "none" || acodec === "none") return false;
  return true;
}

function aparatFormatHeight(format) {
  const direct = positiveInteger(format?.height);
  if (direct) return direct;
  const source = [format?.format_id, format?.format_note, format?.resolution]
    .map((value) => String(value || ""))
    .join(" ");
  const match = source.match(/(?:^|\D)(\d{2,4})p(?:\D|$)/i);
  return match ? positiveInteger(match[1]) : 0;
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
  const headers = { "Referer": APARAT_REFERER, "User-Agent": APARAT_USER_AGENT };
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

function estimatedAparatSize(height, duration) {
  if (!duration || !height) return 0;
  const kbps = Math.max(700, Math.min(8000, height * 4.25));
  return Math.ceil(kbps * 125 * duration * 1.08);
}

function aparatFormatScore(format) {
  const protocol = String(format?.protocol || "").toLowerCase();
  const direct = !protocol || protocol.startsWith("http") ? 1_000_000 : 0;
  return direct +
    (positiveNumber(format?.fps) || 0) * 1000 +
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
    formatId: String(option?.formatId || "").slice(0, 160),
    filename: String(option?.filename || "").slice(0, 240),
    label: String(option?.label || "").slice(0, 80),
  })).filter((option) => option.key && option.height && option.sizeBytes && option.formatId && option.filename);
}

function parseCatalog(value) {
  try { return sanitizeCatalogOptions(JSON.parse(String(value || "[]"))); } catch (error) { return []; }
}

export function normalizeAparatUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try { url = new URL(raw); } catch (error) { return ""; }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  const host = url.hostname.toLowerCase();
  if (host !== "aparat.com" && host !== "www.aparat.com") return "";
  const path = url.pathname.replace(/\/+$/u, "");
  const video = path.match(/^\/v\/([A-Za-z0-9]+)$/u);
  const embed = path.match(/^\/video\/video\/embed\/videohash\/([A-Za-z0-9]+)$/u);
  const id = video?.[1] || embed?.[1] || "";
  if (!id) return "";
  return "https://www.aparat.com/v/" + id;
}

function safeContainerKey(value) {
  return String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "anonymous";
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/u.test(token) ? token : "";
}

function cleanOptionKey(value) {
  const key = String(value || "").trim();
  return /^v\d{2,4}$/u.test(key) ? key : "";
}

function randomToken() {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function positiveInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function positiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function looksLikeMp4(bytes) {
  if (!bytes || bytes.byteLength < 8) return false;
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70;
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
  if (!total) return new Uint8Array();
  if (chunks.length === 1) return chunks[0];
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function collectText(stream, limit) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      text += decoder.decode(next.value, { stream: true });
      if (text.length > limit) text = text.slice(-limit);
    }
    text += decoder.decode();
  } catch (error) {}
  return text;
}

function stopProcessNow(process, reader, reason) {
  try { reader?.cancel?.(reason); } catch (error) {}
  try { process?.kill?.(); } catch (error) {}
}

async function settleWithin(promise, timeoutMs, fallback) {
  let timer = 0;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } catch (error) {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function processFailureDetail(process, stderrPromise) {
  const [exitCode, detail] = await Promise.all([
    settleWithin(process?.exitCode?.catch?.(() => -1), PROCESS_SETTLE_TIMEOUT_MS, -1),
    settleWithin(stderrPromise, PROCESS_SETTLE_TIMEOUT_MS, ""),
  ]);
  return String(detail || "").trim() || "yt-dlp exited with code " + String(exitCode);
}

function aparatError(value) {
  const detail = String(value?.message || value || "").trim();
  const lower = detail.toLowerCase();
  let message = "Aparat download is temporarily unavailable";
  if (/429|too many requests|rate.?limit/.test(lower)) message = "Aparat is temporarily rate-limited";
  else if (/private|login required|not available|removed|404|video unavailable/.test(lower)) message = "This Aparat video is unavailable";
  else if (/timed out|timeout/.test(lower)) message = "Aparat did not respond in time";
  else if (/invalid mp4|did not expose/.test(lower)) message = detail;
  const error = new Error(message);
  error.cause = detail;
  return error;
}

function isAparatPublicError(error) {
  const value = String(error?.message || "");
  return value === "Aparat download is temporarily unavailable" ||
    value === "Aparat is temporarily rate-limited" ||
    value === "This Aparat video is unavailable" ||
    value === "Aparat did not respond in time" ||
    /^Aparat (?:returned|did not expose)/u.test(value) ||
    value === "Enter a valid Aparat video link" ||
    value === "Aparat video format is unavailable";
}

function publicAparatError(error) {
  return isAparatPublicError(error) ? String(error.message) : aparatError(error).message;
}

function aparatDownloadHeaders(fileName) {
  const safe = String(fileName || "Vexa-Aparat-video.mp4").replace(/[\r\n"]/g, "_");
  return new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + safe + '"',
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const APARAT_DOWNLOAD_RUNTIME_JS = String.raw`
(function(){
  'use strict';
  const PREPARE='${PREPARE_PATH}';
  const SESSION='${SESSION_PATH}';
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const qualityNode=document.getElementById('vexaLiveQuality');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const uploadButton=document.getElementById('vexaLiveUpload');
  if(!root||!button||!qualityNode)return;

  const nativePrompt=typeof window.prompt==='function'?window.prompt.bind(window):null;
  let active=false;
  let busy=false;
  let sourceUrl='';
  let downloadToken='';
  let selectedKey='';
  let options=[];
  let prepared=null;
  let socket=null;

  function normalize(value){let url;try{url=new URL(String(value||'').trim());}catch(error){return'';}if(url.protocol!=='https:')return'';const host=url.hostname.toLowerCase();if(host!=='aparat.com'&&host!=='www.aparat.com')return'';const path=url.pathname.replace(/\/+$/,'');let match=path.match(/^\/v\/([A-Za-z0-9]+)$/);if(!match)match=path.match(/^\/video\/video\/embed\/videohash\/([A-Za-z0-9]+)$/);return match?'https://www.aparat.com/v/'+match[1]:'';}
  function initData(){try{return String(window.Telegram?.WebApp?.initData||window.parent?.Telegram?.WebApp?.initData||'');}catch(error){return'';}}
  function telegram(){try{return window.Telegram?.WebApp||window.parent?.Telegram?.WebApp||null;}catch(error){return null;}}
  function mb(value){return(Math.max(0,Number(value||0))/1048576).toFixed(1);}
  function setButton(text,disabled){button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function setUploadDisabled(value){if(uploadButton)uploadButton.disabled=Boolean(value);}
  function setState(state,message,detail){root.dataset.state=String(state||'idle');if(statusNode)statusNode.textContent=String(message||'');if(detailNode)detailNode.textContent=String(detail||'');}
  function setProgress(value){const pct=Math.max(0,Math.min(100,Number(value||0)));root.style.setProperty('--vexa-progress',String(pct/100));if(track)track.setAttribute('aria-valuenow',String(Math.round(pct*10)/10));if(percentNode)percentNode.textContent=(Math.round(pct*10)/10).toFixed(pct%1?1:0)+'%';}
  function clearOptions(){options=[];selectedKey='';qualityNode.replaceChildren();qualityNode.dataset.ready='0';}
  function closeSocket(){const current=socket;socket=null;if(current)try{current.close(1000,'done');}catch(error){}}
  function reset(){active=false;busy=false;sourceUrl='';downloadToken='';selectedKey='';prepared=null;closeSocket();clearOptions();setUploadDisabled(false);setButton('Download',false);}
  function renderOptions(items){options=Array.isArray(items)?items.filter(function(item){return /^v\d{2,4}$/.test(String(item?.key||''))&&Number(item?.sizeBytes||0)>0;}):[];clearOptions();if(!options.length)return false;for(const option of options){const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');const label=document.createElement('span');label.textContent=String(option.label||option.key);const size=document.createElement('small');size.textContent=mb(option.sizeBytes)+' MB';item.append(label,size);item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();if(busy)return;selectedKey=String(option.key);prepared=null;for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}setState('waiting','Ready to download',String(option.label||option.key)+' · '+mb(option.sizeBytes)+' MB');setButton('Download',false);});qualityNode.appendChild(item);}qualityNode.dataset.ready='1';const sorted=options.slice().sort(function(a,b){return Number(a.height||99999)-Number(b.height||99999);});const first=sorted[0]||options[0];if(first){selectedKey=String(first.key);for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}}return Boolean(first);}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  function connectProgress(value){closeSocket();const target=String(value||'');if(!target)return;const next=new WebSocket(wsUrl(target));socket=next;next.addEventListener('message',function(event){if(socket!==next)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}if(!data?.ok)return;const total=Number(data.totalBytes||prepared?.fileSize||0);const done=Math.max(0,Number(data.downloadedBytes||0));const pct=Math.max(0,Math.min(100,Number(data.percent||0)));const status=String(data.status||'ready');if(status==='completed'){setProgress(100);setState('completed','Downloaded',mb(done||total)+' MB');reset();return;}if(status==='failed'||status==='cancelled'){busy=false;setUploadDisabled(false);setState('error',String(data.error||'Aparat download failed'),done?mb(done)+' MB processed':'');setButton('Try again',false);closeSocket();prepared=null;return;}if(status==='preparing'){setState('preparing','Preparing Aparat download','Keep the app open');return;}if(status==='downloading'){setProgress(pct);setState('downloading','Downloading from Aparat',mb(done)+' MB / '+mb(total)+' MB · Keep the app open');}});next.addEventListener('error',function(){try{next.close();}catch(error){}});}
  function launchNative(url,fileName){const target=new URL(String(url||''),window.location.origin).href;const tg=telegram();if(tg?.downloadFile){try{tg.downloadFile({url:target,file_name:String(fileName||'Vexa-Aparat-video.mp4')},function(accepted){if(accepted===false&&active){busy=false;setUploadDisabled(false);closeSocket();setState('waiting','Download cancelled','');setButton('Download',false);}});return;}catch(error){}}const link=document.createElement('a');link.href=target;link.download=String(fileName||'Vexa-Aparat-video.mp4');link.rel='noopener';document.body.appendChild(link);link.click();link.remove();}
  async function prepareSource(value){const normalized=normalize(value);if(!normalized)return false;active=true;busy=true;sourceUrl=normalized;downloadToken='';prepared=null;closeSocket();clearOptions();setProgress(0);setState('preparing','Loading Aparat qualities','');setButton('Preparing…',true);setUploadDisabled(true);try{const response=await fetch(PREPARE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:sourceUrl})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadToken||!Array.isArray(data.options)||!data.options.length)throw new Error(String(data.error||'Could not prepare Aparat video'));downloadToken=String(data.downloadToken);if(!renderOptions(data.options))throw new Error('Aparat quality is unavailable');const selected=options.find(function(item){return String(item.key)===selectedKey;});setState('waiting','Choose format',selected?String(selected.label||selected.key)+' · '+mb(selected.sizeBytes)+' MB':'');setButton('Download',false);return true;}catch(error){active=false;downloadToken='';clearOptions();setState('error',String(error?.message||'Could not prepare Aparat download'),'');setButton('Try again',false);return false;}finally{busy=false;setUploadDisabled(false);}}
  async function prepareSelected(){if(!active||!downloadToken||!selectedKey||busy)return false;busy=true;setUploadDisabled(true);setButton('Preparing…',true);try{const response=await fetch(SESSION,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedKey})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadUrl||!data.progressUrl||!data.fileSize)throw new Error(String(data.error||'Could not prepare Aparat download'));prepared={downloadUrl:new URL(String(data.downloadUrl),window.location.origin).href,progressUrl:new URL(String(data.progressUrl),window.location.origin).href,fileName:String(data.fileName||'Vexa-Aparat-video.mp4'),fileSize:Number(data.fileSize||0)};setState('waiting','Ready to download',mb(prepared.fileSize)+' MB');setButton('Download',false);return true;}catch(error){prepared=null;setState('error',String(error?.message||'Could not prepare Aparat download'),'');setButton('Try again',false);return false;}finally{busy=false;setUploadDisabled(false);}}
  async function startDownload(){if(!prepared||busy)return;busy=true;setUploadDisabled(true);setProgress(0);setState('preparing','Waiting for Telegram','Keep the app open');connectProgress(prepared.progressUrl);launchNative(prepared.downloadUrl,prepared.fileName);}

  if(nativePrompt){window.prompt=function(message){const args=Array.prototype.slice.call(arguments,1);const value=nativePrompt.apply(window,[message].concat(args));const apar=normalize(value);if(apar&&/video\s+link/i.test(String(message||''))){queueMicrotask(function(){prepareSource(apar);});return'';}return value;};}
  try{const tg=telegram();if(tg?.onEvent)tg.onEvent('fileDownloadRequested',function(event){const state=String(event?.status||event||'').toLowerCase();if(active&&state==='cancelled'){busy=false;setUploadDisabled(false);closeSocket();setProgress(0);setState('waiting','Download cancelled','');setButton('Download',false);}});}catch(error){}
  button.addEventListener('click',function(event){if(!active)return;event.preventDefault();event.stopImmediatePropagation();if(busy||button.disabled)return;if(prepared){startDownload();return;}if(downloadToken&&selectedKey){prepareSelected().then(function(ok){if(ok)startDownload();});}},true);

  try{const params=new URLSearchParams(window.location.search);const preset=params.get('vexaDownload')==='1'?normalize(params.get('vexaSource')||''):'';if(preset)queueMicrotask(function(){prepareSource(preset);});}catch(error){}
})();
`;
