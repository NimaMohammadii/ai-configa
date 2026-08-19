import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { authenticateMiniAppPayload } from "../auth.js";
import { handleYouTubePlaybackRequest } from "./youtube-range-playback.js";

const SESSION_PATH = "/mini-app/live/api/youtube-download/background/session";
const PROGRESS_PATH = "/mini-app/live/api/youtube-download/background/progress";
const FILE_PATH = "/mini-app/live/api/youtube-download/background/file";
export const BACKGROUND_DOWNLOAD_RUNTIME_PATH = "/mini-app/vexa-live/background-download.js";
const PLAYBACK_PATH = "/mini-app/live/api/youtube-playback";

const FILE_NAME = "Vexa-YouTube-video.mp4";
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 900;
const STORAGE_PREFIX = "vexa-downloads/";
const LOCAL_STORAGE_KEY = "vexa.youtube.backgroundDownload.v1";

let tableReady = null;

export function isBackgroundYouTubeDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === SESSION_PATH ||
    path === PROGRESS_PATH ||
    path === FILE_PATH ||
    path === BACKGROUND_DOWNLOAD_RUNTIME_PATH;
}

export async function handleBackgroundYouTubeDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === BACKGROUND_DOWNLOAD_RUNTIME_PATH) {
    return new Response(BACKGROUND_DOWNLOAD_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && path === SESSION_PATH) {
    return createSession(request, env, ctx);
  }
  if (request.method === "GET" && path === PROGRESS_PATH) {
    return readProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && path === FILE_PATH) {
    return serveFile(request, env);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendBackgroundDownloadRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + BACKGROUND_DOWNLOAD_RUNTIME_PATH + '?v=20260819-1"></script>';
  const html = source.includes(BACKGROUND_DOWNLOAD_RUNTIME_PATH)
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

export class VexaYouTubeDownloadWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    const session = cleanToken(payload.session);
    const playbackToken = cleanToken(payload.playbackToken);
    const userId = String(payload.userId || "").trim();
    const totalBytes = positiveInteger(payload.totalBytes);
    if (!session || !playbackToken || !userId || !totalBytes) {
      throw new NonRetryableError("YouTube download workflow payload is invalid");
    }
    if (!this.env.EXPLORE_MEDIA) {
      throw new NonRetryableError("R2 media storage is unavailable");
    }

    await ensureProgressTable(this.env);
    const r2Key = storageKey(session);

    try {
      await step.do("mark video staging", async () => {
        await writeProgress(this.env, session, 0, "staging", "");
        return { session, status: "staging" };
      });

      await step.do(
        "stage YouTube video in R2",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "linear" },
          timeout: "30 minutes",
        },
        async () => {
          await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);

          const internalRequest = new Request(
            "https://vexa.internal" + PLAYBACK_PATH + "?token=" + encodeURIComponent(playbackToken),
            { method: "GET", headers: { Accept: "video/mp4" } },
          );
          const upstream = await handleYouTubePlaybackRequest(internalRequest, this.env);
          if (!upstream.ok || !upstream.body) {
            let detail = "";
            try { detail = await upstream.text(); } catch (error) {}
            throw new Error(detail || "Could not read the prepared YouTube video");
          }

          let received = 0;
          let lastReportedBytes = 0;
          let lastReportedAt = Date.now();
          const env = this.env;

          const counted = upstream.body.pipeThrough(new TransformStream({
            async transform(chunk, controller) {
              const size = Number(chunk?.byteLength || 0);
              received += size;
              if (received > totalBytes) {
                throw new Error("YouTube stream exceeded the expected video size");
              }

              const nowMs = Date.now();
              if (
                (received - lastReportedBytes) >= PROGRESS_REPORT_BYTES ||
                (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS
              ) {
                lastReportedBytes = received;
                lastReportedAt = nowMs;
                await writeProgress(
                  env,
                  session,
                  Math.min(received, totalBytes),
                  "staging",
                  "",
                );
              }
              controller.enqueue(chunk);
            },
          }));

          const object = await this.env.EXPLORE_MEDIA.put(r2Key, counted, {
            httpMetadata: {
              contentType: "video/mp4",
              contentDisposition: 'attachment; filename="' + FILE_NAME + '"',
              cacheControl: "private, max-age=3600",
            },
            customMetadata: {
              vexaSession: session,
              vexaUser: userId,
              expectedBytes: String(totalBytes),
            },
          });

          if (!object || Number(object.size || 0) !== totalBytes || received !== totalBytes) {
            await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
            throw new Error(
              "Staged video size mismatch: expected " + totalBytes + ", received " + received,
            );
          }

          const readyUntil = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
          await markReady(this.env, session, totalBytes, readyUntil);
          return { key: r2Key, size: totalBytes };
        },
      );

      await step.sleep("keep staged video available", "2 hours");

      await step.do("expire staged video", async () => {
        await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
        await markExpired(this.env, session);
        return { session, status: "expired" };
      });

      return { session, status: "expired" };
    } catch (error) {
      const message = publicWorkflowError(error);
      await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
      await writeProgress(this.env, session, 0, "failed", message).catch(() => null);
      throw new NonRetryableError(message);
    }
  }
}

async function createSession(request, env) {
  if (!env.VEXA_YOUTUBE_DOWNLOAD_WORKFLOW) {
    return json({ error: "Background downloads are not configured" }, 503);
  }
  if (!env.EXPLORE_MEDIA) {
    return json({ error: "Download storage is not configured" }, 503);
  }

  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const playbackToken = cleanToken(payload.playbackToken);
  if (!playbackToken) return json({ error: "Open the video before downloading" }, 400);

  const playback = await env.DB.prepare(
    "SELECT user_id, media_size, title, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
  ).bind(playbackToken).first();

  const now = Math.floor(Date.now() / 1000);
  if (!playback || Number(playback.expires_at || 0) <= now) {
    return json({ error: "Video session expired. Open the video again." }, 410);
  }
  if (String(playback.user_id) !== String(user.id)) {
    return json({ error: "Video session does not belong to this user" }, 403);
  }

  const totalBytes = positiveInteger(playback.media_size);
  if (!totalBytes) return json({ error: "Video size is unavailable" }, 500);

  await ensureProgressTable(env);

  const reusable = await env.DB.prepare(
    "SELECT session, total_bytes, status, expires_at FROM vexa_youtube_download_progress " +
    "WHERE playback_token = ? AND user_id = ? AND status IN ('queued','staging','ready') " +
    "AND expires_at > ? ORDER BY updated_at DESC LIMIT 1"
  ).bind(playbackToken, String(user.id), now).first();

  if (reusable?.session && cleanToken(reusable.session)) {
    return sessionPayload(
      cleanToken(reusable.session),
      positiveInteger(reusable.total_bytes) || totalBytes,
      String(reusable.status || "queued"),
      String(playback.title || "YouTube video"),
    );
  }

  const session = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_progress " +
    "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
    "VALUES (?, ?, ?, ?, 0, 'queued', NULL, ?, ?, ?)"
  ).bind(
    session,
    playbackToken,
    String(user.id),
    totalBytes,
    now,
    now,
    now + SESSION_TTL_SECONDS,
  ).run();

  try {
    const instance = await env.VEXA_YOUTUBE_DOWNLOAD_WORKFLOW.create({
      id: "yt-" + session,
      params: {
        session,
        playbackToken,
        userId: String(user.id),
        totalBytes,
      },
      retention: { successRetention: "1 day", errorRetention: "1 day" },
    });
    return {
      ...sessionPayload(
        session,
        totalBytes,
        "queued",
        String(playback.title || "YouTube video"),
      ),
      workflowId: String(instance?.id || ("yt-" + session)),
    };
  } catch (error) {
    const message = "Could not start background video download";
    await writeProgress(env, session, 0, "failed", message).catch(() => null);
    console.error("Vexa background download workflow start failed", error?.stack || error);
    return json({ error: message }, 502);
  }
}

async function readProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Download session is invalid" }, 400);
  await ensureProgressTable(env);

  const row = await env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at " +
    "FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();

  const now = Math.floor(Date.now() / 1000);
  if (!row) return json({ error: "Download session not found" }, 404);

  const status = String(row.status || "queued");
  if (Number(row.expires_at || 0) <= now && status !== "staging") {
    return json({
      ok: true,
      totalBytes: positiveInteger(row.total_bytes),
      downloadedBytes: Math.max(0, Number(row.downloaded_bytes || 0)),
      percent: 100,
      status: "expired",
      error: "",
    });
  }

  const totalBytes = positiveInteger(row.total_bytes);
  const downloadedBytes = Math.min(totalBytes, Math.max(0, Number(row.downloaded_bytes || 0)));
  return json({
    ok: true,
    totalBytes,
    downloadedBytes,
    percent: totalBytes
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 1000) / 10)
      : 0,
    status,
    error: row.error ? String(row.error) : "",
    updatedAt: Number(row.updated_at || 0),
    fileReady: status === "ready",
  });
}

async function serveFile(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  if (!session) return json({ error: "Download link is invalid" }, 400);
  await ensureProgressTable(env);

  const row = await env.DB.prepare(
    "SELECT total_bytes, status, expires_at FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();

  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Download link expired" }, 410);
  }
  if (String(row.status || "") !== "ready") {
    return json({ error: "Video is still being prepared" }, 425);
  }

  const totalBytes = positiveInteger(row.total_bytes);
  if (!totalBytes) return json({ error: "Download size is invalid" }, 500);
  const key = storageKey(session);

  if (request.method === "HEAD") {
    const object = await env.EXPLORE_MEDIA.head(key);
    if (!object || Number(object.size || 0) !== totalBytes) {
      return json({ error: "Prepared video is unavailable" }, 404);
    }
    return new Response(null, {
      status: 200,
      headers: fileHeaders(totalBytes, null),
    });
  }

  const range = parseByteRange(request.headers.get("Range"), totalBytes);
  if (range.error) return rangeNotSatisfiable(totalBytes);

  const object = await env.EXPLORE_MEDIA.get(
    key,
    range.partial
      ? { range: { offset: range.start, length: range.end - range.start + 1 } }
      : undefined,
  );
  if (!object || !("body" in object) || !object.body) {
    return json({ error: "Prepared video is unavailable" }, 404);
  }

  return new Response(object.body, {
    status: range.partial ? 206 : 200,
    headers: fileHeaders(totalBytes, range),
  });
}

function sessionPayload(session, totalBytes, status, title) {
  return {
    ok: true,
    session,
    status,
    title,
    fileName: FILE_NAME,
    fileSize: totalBytes,
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    downloadUrl: FILE_PATH + "?session=" + encodeURIComponent(session),
    expiresIn: SESSION_TTL_SECONDS,
  };
}

function fileHeaders(totalBytes, range) {
  const length = range?.partial
    ? range.end - range.start + 1
    : totalBytes;
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"',
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length, Content-Range",
  });
  if (range?.partial) {
    headers.set(
      "Content-Range",
      "bytes " + range.start + "-" + range.end + "/" + totalBytes,
    );
  }
  return headers;
}

function parseByteRange(value, size) {
  const raw = String(value || "").trim();
  if (!raw) return { start: 0, end: size - 1, partial: false, error: false };

  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return { error: true };

  let start;
  let end;
  if (!match[1] && match[2]) {
    const suffix = positiveInteger(match[2]);
    if (!suffix) return { error: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    if (!Number.isFinite(start) || start < 0 || start >= size) return { error: true };
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (!Number.isFinite(end) || end < start) return { error: true };
    end = Math.min(end, size - 1);
  }
  return { start, end, partial: true, error: false };
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    headers: {
      "Content-Range": "bytes */" + size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}

async function ensureProgressTable(env) {
  if (!tableReady) {
    tableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_download_progress (" +
        "session TEXT PRIMARY KEY, " +
        "playback_token TEXT NOT NULL, " +
        "user_id TEXT NOT NULL, " +
        "total_bytes INTEGER NOT NULL, " +
        "downloaded_bytes INTEGER NOT NULL DEFAULT 0, " +
        "status TEXT NOT NULL DEFAULT 'queued', " +
        "error TEXT, " +
        "created_at INTEGER NOT NULL, " +
        "updated_at INTEGER NOT NULL, " +
        "expires_at INTEGER NOT NULL" +
      ")"
    ).run().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function writeProgress(env, session, downloadedBytes, status, error) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "queued"),
    error ? String(error).slice(0, 500) : null,
    now,
    session,
  ).run();
}

async function markReady(env, session, totalBytes, expiresAt) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET downloaded_bytes = ?, status = 'ready', error = NULL, updated_at = ?, expires_at = ? " +
    "WHERE session = ?"
  ).bind(totalBytes, now, expiresAt, session).run();
}

async function markExpired(env, session) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET status = 'expired', updated_at = ?, expires_at = ? WHERE session = ?"
  ).bind(now, now, session).run();
}

function storageKey(session) {
  return STORAGE_PREFIX + session + ".mp4";
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function publicWorkflowError(error) {
  const message = String(error?.message || "");
  if (/blocked.*403|403/i.test(message)) return "YouTube blocked the download request";
  if (/authorization|po token/i.test(message)) return "YouTube requires additional playback authorization";
  if (/size mismatch|expected video size|ended before|exceeded/i.test(message)) {
    return "Video download ended before the complete file was prepared";
  }
  if (/expired/i.test(message)) return "Video session expired. Open the video again.";
  return "Background video preparation failed";
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

export const BACKGROUND_DOWNLOAD_RUNTIME_JS = String.raw`
(function () {
  const SESSION_URL = "/mini-app/live/api/youtube-download/background/session";
  const STORAGE_KEY = ${JSON.stringify(LOCAL_STORAGE_KEY)};
  const POLL_MS = 700;

  let busy = false;
  let pollTimer = 0;
  let active = null;

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) {
        return window.parent;
      }
    } catch (error) {}
    return window;
  }

  function telegram() {
    const host = hostWindow();
    return window.Telegram?.WebApp || host.Telegram?.WebApp || null;
  }

  function initData() {
    return String(telegram()?.initData || "");
  }

  function haptic(style) {
    try { telegram()?.HapticFeedback?.impactOccurred?.(style || "light"); } catch (error) {}
  }

  function setStatus(message, error) {
    const node = document.getElementById("vexaLiveStatus");
    if (!node) return;
    node.textContent = String(message || "");
    node.classList.toggle("show", Boolean(message));
    node.classList.toggle("error", Boolean(error));
  }

  function setButton(text, disabled) {
    const button = document.getElementById("vexaLiveDownload");
    if (!button) return;
    button.textContent = String(text || "Download");
    button.disabled = Boolean(disabled);
  }

  function mb(bytes) {
    return (Math.max(0, Number(bytes || 0)) / 1048576).toFixed(1);
  }

  function currentPlaybackToken() {
    const video = document.getElementById("vexaLiveVideo");
    const src = String(video?.currentSrc || video?.src || "");
    try {
      const token = new URL(src, window.location.origin).searchParams.get("token") || "";
      return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
    } catch (error) {
      return "";
    }
  }

  function saveActive(value) {
    active = value || null;
    try {
      if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (error) {}
  }

  function loadActive() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = 0;
  }

  function absolute(value) {
    return new URL(String(value || ""), window.location.origin).href;
  }

  async function handoffToTelegram(session) {
    if (!session?.downloadUrl) return;
    const tg = telegram();
    const downloadUrl = absolute(session.downloadUrl);
    const fileName = String(session.fileName || "Vexa-YouTube-video.mp4");
    const sizeText = mb(session.fileSize) + " MB";

    if (tg?.downloadFile) {
      try {
        tg.downloadFile(
          { url: downloadUrl, file_name: fileName },
          function (accepted) {
            busy = false;
            if (!accepted) {
              setButton("Download", false);
              setStatus("Download cancelled · file remains ready", false);
              return;
            }
            setButton("Download again", false);
            setStatus("Download started · " + sizeText + " · you can leave Vexa Live", false);
            haptic("medium");
          }
        );
        return;
      } catch (error) {}
    }

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    busy = false;
    setButton("Download again", false);
    setStatus("Download started · " + sizeText, false);
    haptic("medium");
  }

  async function poll(session, autoStart) {
    stopPolling();
    active = session;

    const run = async function () {
      if (!active?.progressUrl) return;
      try {
        const response = await fetch(absolute(active.progressUrl), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          throw new Error(String(data.error || "Could not read download progress"));
        }

        const total = Number(data.totalBytes || active.fileSize || 0);
        const done = Math.min(total, Math.max(0, Number(data.downloadedBytes || 0)));
        const percent = total > 0
          ? Math.min(100, Math.max(0, Number(data.percent || 0)))
          : 0;
        const state = String(data.status || "queued");

        active.fileSize = total || active.fileSize;
        active.status = state;
        saveActive(active);

        if (state === "ready") {
          busy = false;
          setButton("Download", false);
          setStatus("Ready · " + mb(total) + " MB · safe to leave after download starts", false);
          haptic("medium");
          if (autoStart && document.visibilityState !== "hidden") {
            busy = true;
            setButton("Starting…", true);
            await handoffToTelegram(active);
          }
          return;
        }

        if (state === "failed") {
          busy = false;
          setButton("Download", false);
          setStatus(String(data.error || "Video preparation failed"), true);
          saveActive(null);
          return;
        }

        if (state === "expired") {
          busy = false;
          setButton("Download", false);
          setStatus("Prepared download expired. Tap Download to prepare it again.", false);
          saveActive(null);
          return;
        }

        busy = true;
        setButton(Math.round(percent) + "%", true);
        setStatus(
          "Preparing download · " + mb(done) + " MB / " + mb(total) + " MB · " +
          Math.round(percent) + "%",
          false,
        );
        pollTimer = setTimeout(run, POLL_MS);
      } catch (error) {
        pollTimer = setTimeout(run, 1200);
      }
    };

    run();
  }

  async function createSession() {
    const playbackToken = currentPlaybackToken();
    if (!playbackToken) {
      setStatus("Open the video before downloading", true);
      return;
    }

    busy = true;
    setButton("Preparing…", true);
    setStatus("Starting background download…", false);
    haptic("light");

    try {
      const response = await fetch(SESSION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          initData: initData(),
          playbackToken,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.session || !data.progressUrl || !data.downloadUrl) {
        throw new Error(String(data.error || "Could not start background download"));
      }

      const session = {
        session: String(data.session),
        progressUrl: String(data.progressUrl),
        downloadUrl: String(data.downloadUrl),
        fileName: String(data.fileName || "Vexa-YouTube-video.mp4"),
        fileSize: Number(data.fileSize || 0),
        status: String(data.status || "queued"),
        createdAt: Date.now(),
      };
      saveActive(session);
      setStatus("Preparing download · 0.0 MB / " + mb(session.fileSize) + " MB", false);
      poll(session, true);
    } catch (error) {
      busy = false;
      setButton("Download", false);
      setStatus(String(error?.message || "Could not start background download"), true);
    }
  }

  async function onDownload() {
    if (busy) return;

    const saved = active || loadActive();
    if (saved?.status === "ready" && saved?.downloadUrl) {
      active = saved;
      busy = true;
      setButton("Starting…", true);
      await handoffToTelegram(saved);
      return;
    }

    await createSession();
  }

  function restore() {
    const saved = loadActive();
    if (!saved?.session || !saved?.progressUrl) return;
    active = saved;

    if (saved.status === "ready") {
      busy = false;
      setButton("Download", false);
      setStatus("Download ready · " + mb(saved.fileSize) + " MB", false);
      return;
    }

    busy = true;
    setButton("Checking…", true);
    setStatus("Checking background download…", false);
    poll(saved, false);
  }

  function bind() {
    const oldButton = document.getElementById("vexaLiveDownload");
    if (!oldButton || oldButton.dataset.vexaBackgroundDownload === "1") {
      return Boolean(oldButton);
    }

    const button = oldButton.cloneNode(true);
    button.dataset.vexaBackgroundDownload = "1";
    oldButton.replaceWith(button);
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onDownload();
    }, true);

    document.documentElement.dataset.vexaBackgroundDownload = "1";
    restore();
    return true;
  }

  if (!bind()) {
    const observer = new MutationObserver(function () {
      if (bind()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;
