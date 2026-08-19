import { authenticateMiniAppPayload } from "../auth.js";
import { handleYouTubePlaybackRequest } from "./youtube-range-playback.js";

const SESSION_PATH = "/mini-app/live/api/youtube-download/session";
const PROGRESS_PATH = "/mini-app/live/api/youtube-download/progress";
const PLAYBACK_PATH = "/mini-app/live/api/youtube-playback";
export const DOWNLOAD_PROGRESS_RUNTIME_PATH = "/mini-app/vexa-live/download-progress.js";

const FILE_NAME = "Vexa-YouTube-video.mp4";
const SESSION_TTL_SECONDS = 60 * 60;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 750;
let progressTableReady = null;

export function isTrackedYouTubeDownloadRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === SESSION_PATH || url.pathname === PROGRESS_PATH || url.pathname === DOWNLOAD_PROGRESS_RUNTIME_PATH) {
    return true;
  }
  return url.pathname === PLAYBACK_PATH && url.searchParams.get("download") === "1";
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
    return readDownloadProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === PLAYBACK_PATH && url.searchParams.get("download") === "1") {
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
  const tag = '<script src="' + DOWNLOAD_PROGRESS_RUNTIME_PATH + '?v=20260819-1"></script>';
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
  const playbackToken = cleanToken(payload.playbackToken);
  if (!playbackToken) return json({ error: "Video session is invalid" }, 400);

  const row = await env.DB.prepare(
    "SELECT user_id, media_size, title, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
  ).bind(playbackToken).first();

  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Video session expired. Open the video again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Video session does not belong to this user" }, 403);
  }

  const totalBytes = positiveInteger(row.media_size);
  if (!totalBytes) return json({ error: "Video size is unavailable" }, 500);

  await ensureProgressTable(env);
  const session = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_progress " +
    "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
    "VALUES (?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?)"
  ).bind(
    session,
    playbackToken,
    String(user.id),
    totalBytes,
    now,
    now,
    now + SESSION_TTL_SECONDS,
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_youtube_download_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    fileName: FILE_NAME,
    fileSize: totalBytes,
    title: String(row.title || "YouTube video"),
    downloadUrl: PLAYBACK_PATH + "?token=" + encodeURIComponent(playbackToken) + "&download=1&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function readDownloadProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Download session is invalid" }, 400);
  await ensureProgressTable(env);

  const row = await env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at " +
    "FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();

  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Download session expired" }, 410);
  }

  const totalBytes = positiveInteger(row.total_bytes);
  const downloadedBytes = Math.min(totalBytes, Math.max(0, Number(row.downloaded_bytes || 0)));
  return json({
    ok: true,
    totalBytes,
    downloadedBytes,
    percent: totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 1000) / 10) : 0,
    status: String(row.status || "ready"),
    error: row.error ? String(row.error) : "",
    updatedAt: Number(row.updated_at || 0),
  });
}

async function trackedDownload(request, env, ctx) {
  const url = new URL(request.url);
  const playbackToken = cleanToken(url.searchParams.get("token"));
  const session = cleanToken(url.searchParams.get("session"));
  if (!playbackToken || !session) return json({ error: "Download link is invalid" }, 400);

  await ensureProgressTable(env);
  const progress = await env.DB.prepare(
    "SELECT playback_token, total_bytes, status, expires_at FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!progress || Number(progress.expires_at || 0) <= now || String(progress.playback_token) !== playbackToken) {
    return json({ error: "Download session expired" }, 410);
  }

  const totalBytes = positiveInteger(progress.total_bytes);
  if (!totalBytes) return json({ error: "Download size is invalid" }, 500);

  const headers = downloadHeaders();
  if (request.method === "HEAD") {
    headers.set("X-Vexa-File-Size", String(totalBytes));
    return new Response(null, { status: 200, headers });
  }

  await writeProgress(env, session, 0, "downloading", "");

  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete("Range");
  upstreamHeaders.delete("If-Range");
  const upstreamUrl = new URL(request.url);
  upstreamUrl.searchParams.delete("download");
  upstreamUrl.searchParams.delete("session");
  const upstreamRequest = new Request(upstreamUrl.href, {
    method: "GET",
    headers: upstreamHeaders,
  });

  const upstream = await handleYouTubePlaybackRequest(upstreamRequest, env, ctx);
  if (!upstream.ok || !upstream.body) {
    const message = "Could not start the video download";
    await writeProgress(env, session, 0, "failed", message);
    return upstream;
  }

  let downloaded = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();
  let writeChain = Promise.resolve();
  const enqueueProgress = (bytes, status, error) => {
    writeChain = writeChain.then(() => writeProgress(env, session, bytes, status, error)).catch(() => null);
    ctx?.waitUntil?.(writeChain);
  };

  const counter = new TransformStream({
    transform(chunk, controller) {
      const size = chunk?.byteLength || 0;
      downloaded += size;
      const nowMs = Date.now();
      if ((downloaded - lastReportedBytes) >= PROGRESS_REPORT_BYTES || (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS) {
        lastReportedBytes = downloaded;
        lastReportedAt = nowMs;
        enqueueProgress(Math.min(downloaded, totalBytes), "downloading", "");
      }
      controller.enqueue(chunk);
    },
  });

  const fixed = new FixedLengthStream(totalBytes);
  const pump = upstream.body
    .pipeThrough(counter)
    .pipeTo(fixed.writable)
    .then(async () => {
      await writeChain;
      if (downloaded !== totalBytes) {
        await writeProgress(env, session, Math.min(downloaded, totalBytes), "failed", "Download ended before the full video was received");
        return;
      }
      await writeProgress(env, session, totalBytes, "completed", "");
    })
    .catch(async (error) => {
      await writeChain.catch(() => null);
      await writeProgress(
        env,
        session,
        Math.min(downloaded, totalBytes),
        "failed",
        publicDownloadError(error),
      ).catch(() => null);
      throw error;
    });
  ctx?.waitUntil?.(pump.catch(() => null));

  return new Response(fixed.readable, {
    status: 200,
    headers,
  });
}

function downloadHeaders() {
  return new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length, X-Vexa-File-Size",
  });
}

async function writeProgress(env, session, downloadedBytes, status, error) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "ready"),
    error ? String(error).slice(0, 500) : null,
    now,
    session,
  ).run();
}

async function ensureProgressTable(env) {
  if (!progressTableReady) {
    progressTableReady = env.DB.prepare(
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
    ).run().catch((error) => {
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

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicDownloadError(error) {
  const message = String(error?.message || "");
  if (/fixed.?length|length|shorter|longer/i.test(message)) return "Download size did not match the video size";
  if (/cancel|abort/i.test(message)) return "Download was cancelled";
  return "Video download failed before completion";
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

export const DOWNLOAD_PROGRESS_RUNTIME_JS = String.raw`
(function () {
  const SESSION_URL = "/mini-app/live/api/youtube-download/session";
  const POLL_MS = 550;
  let busy = false;
  let pollTimer = 0;

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) return window.parent;
    } catch (error) {}
    return window;
  }
  function telegram() {
    const host = hostWindow();
    return window.Telegram?.WebApp || host.Telegram?.WebApp || null;
  }
  function initData() { return String(telegram()?.initData || ""); }
  function haptic(style) {
    try { telegram()?.HapticFeedback?.impactOccurred?.(style || "light"); } catch (error) {}
  }
  function status(message, error) {
    const node = document.getElementById("vexaLiveStatus");
    if (!node) return;
    node.textContent = String(message || "");
    node.classList.toggle("show", Boolean(message));
    node.classList.toggle("error", Boolean(error));
  }
  function mb(bytes) {
    const value = Math.max(0, Number(bytes || 0)) / 1048576;
    return value < 10 ? value.toFixed(1) : value.toFixed(1);
  }
  function playbackToken() {
    const video = document.getElementById("vexaLiveVideo");
    const src = String(video?.currentSrc || video?.src || "");
    try {
      const token = new URL(src, window.location.origin).searchParams.get("token") || "";
      return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
    } catch (error) {
      return "";
    }
  }
  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = 0;
  }
  function setButton(text, disabled) {
    const button = document.getElementById("vexaLiveDownload");
    if (!button) return;
    button.textContent = text;
    button.disabled = Boolean(disabled);
  }
  function finishButtonSoon() {
    setTimeout(function () {
      if (!busy) setButton("Download", false);
    }, 1200);
  }

  async function poll(progressUrl, totalBytes) {
    stopPolling();
    const run = async function () {
      try {
        const response = await fetch(progressUrl, { cache: "no-store", headers: { "Accept": "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(String(data.error || "Could not read download progress"));

        const total = Number(data.totalBytes || totalBytes || 0);
        const done = Math.min(total, Math.max(0, Number(data.downloadedBytes || 0)));
        const percent = total > 0 ? Math.min(100, Math.max(0, Number(data.percent || 0))) : 0;
        const state = String(data.status || "ready");

        if (state === "completed") {
          busy = false;
          setButton("100%", false);
          status("Downloaded · " + mb(total) + " MB", false);
          haptic("medium");
          finishButtonSoon();
          return;
        }
        if (state === "failed" || state === "cancelled") {
          busy = false;
          setButton("Download", false);
          status(String(data.error || "Download failed"), true);
          return;
        }

        setButton(state === "downloading" ? Math.round(percent) + "%" : "Waiting…", true);
        status(
          (state === "downloading" ? "Downloading · " : "Waiting for download · ") +
          mb(done) + " MB / " + mb(total) + " MB" +
          (state === "downloading" ? " · " + Math.round(percent) + "%" : ""),
          false,
        );
        pollTimer = setTimeout(run, POLL_MS);
      } catch (error) {
        pollTimer = setTimeout(run, 1000);
      }
    };
    run();
  }

  async function startDownload() {
    if (busy) return;
    const token = playbackToken();
    if (!token) {
      status("Open the video before downloading", true);
      return;
    }

    busy = true;
    setButton("Preparing…", true);
    status("Preparing download…", false);
    haptic("light");

    try {
      const response = await fetch(SESSION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: initData(), playbackToken: token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.downloadUrl || !data.progressUrl || !data.fileSize) {
        throw new Error(String(data.error || "Could not prepare download"));
      }

      const totalBytes = Number(data.fileSize || 0);
      const absoluteDownloadUrl = new URL(String(data.downloadUrl), window.location.origin).href;
      const absoluteProgressUrl = new URL(String(data.progressUrl), window.location.origin).href;
      const fileName = String(data.fileName || "Vexa-YouTube-video.mp4");
      status("Ready · " + mb(totalBytes) + " MB", false);
      setButton("Download", false);

      const tg = telegram();
      if (tg?.downloadFile) {
        tg.downloadFile(
          { url: absoluteDownloadUrl, file_name: fileName },
          function (accepted) {
            if (!accepted) {
              busy = false;
              status("Download cancelled", false);
              setButton("Download", false);
              return;
            }
            setButton("0%", true);
            status("Starting download · 0.0 MB / " + mb(totalBytes) + " MB", false);
            poll(absoluteProgressUrl, totalBytes);
          }
        );
      } else {
        const link = document.createElement("a");
        link.href = absoluteDownloadUrl;
        link.download = fileName;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setButton("0%", true);
        status("Starting download · 0.0 MB / " + mb(totalBytes) + " MB", false);
        poll(absoluteProgressUrl, totalBytes);
      }
    } catch (error) {
      busy = false;
      setButton("Download", false);
      status(String(error?.message || "Could not prepare download"), true);
    }
  }

  function bind() {
    const oldButton = document.getElementById("vexaLiveDownload");
    if (!oldButton || oldButton.dataset.vexaTrackedDownload === "1") return Boolean(oldButton);

    const button = oldButton.cloneNode(true);
    button.dataset.vexaTrackedDownload = "1";
    oldButton.replaceWith(button);
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      startDownload();
    });
    document.documentElement.dataset.vexaTrackedDownload = "1";
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
