import { getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { VexaMediaContainerV3 as BaseVexaMediaContainerV3 } from "./youtube-download-exec.js";

const PLAYBACK_PREPARE_PATH = "/mini-app/live/api/youtube-playback/prepare";
const PLAYBACK_PATH = "/mini-app/live/api/youtube-playback";
export const PLAYBACK_RUNTIME_PATH = "/mini-app/vexa-live/playback-runtime.js";
const PLAYBACK_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const METADATA_TIMEOUT_MS = 35_000;
const STREAM_START_TIMEOUT_MS = 25_000;
const FORMAT_SELECTOR = "b[ext=mp4][protocol^=http][vcodec!=none][acodec!=none]";
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const CLIENT_STRATEGIES = Object.freeze([
  Object.freeze({
    id: "web_embedded",
    args: Object.freeze(["--extractor-args", "youtube:player_client=web_embedded"]),
  }),
  Object.freeze({
    id: "android_vr",
    args: Object.freeze(["--extractor-args", "youtube:player_client=android_vr"]),
  }),
]);
const YTDLP_COMMON_ARGS = Object.freeze([
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

let playbackTableReady = null;

export class VexaMediaContainerV3 extends BaseVexaMediaContainerV3 {
  async resolvePlaybackMedia(url) {
    let lastError = null;
    for (const strategy of CLIENT_STRATEGIES) {
      try {
        return await this.resolvePlaybackMediaForStrategy(url, strategy);
      } catch (error) {
        lastError = error;
        console.warn(
          "Vexa playback strategy failed",
          strategy.id,
          error?.message || error
        );
      }
    }
    throw lastError || new Error("YouTube could not prepare playback");
  }

  async resolvePlaybackMediaForStrategy(url, strategy) {
    const process = await this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      ...strategy.args,
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "-f",
      FORMAT_SELECTOR,
      url,
    ]);
    const timer = setTimeout(() => {
      try { process.kill(); } catch (error) {}
    }, METADATA_TIMEOUT_MS);

    try {
      const output = await process.output();
      const decoder = new TextDecoder();
      if (output.exitCode !== 0) {
        const detail = decoder.decode(output.stderr).trim();
        throw publicPlaybackContainerError(detail);
      }

      const data = JSON.parse(decoder.decode(output.stdout));
      const ext = String(data?.ext || "").toLowerCase();
      const protocol = String(data?.protocol || "").toLowerCase();
      const mediaUrl = String(data?.url || "").trim();
      if (
        ext !== "mp4" ||
        !protocol.startsWith("http") ||
        !/^https?:\/\//i.test(mediaUrl)
      ) {
        throw new Error("YouTube did not return a playable MP4 URL");
      }

      const requestHeaders = sanitizeMediaHeaders(data?.http_headers);
      let fileSize = positiveInteger(data?.filesize);
      if (!fileSize) {
        fileSize = await this.inspectPlaybackSize(mediaUrl, requestHeaders);
      }
      if (!fileSize) throw new Error("Could not determine YouTube video size");

      return {
        title: String(data?.title || "YouTube video"),
        duration: Number.isFinite(Number(data?.duration))
          ? Math.max(0, Number(data.duration))
          : 0,
        mediaUrl,
        requestHeaders,
        fileSize,
        strategyId: strategy.id,
      };
    } catch (error) {
      if (isPublicPlaybackError(error)) throw error;
      if (
        error?.message === "YouTube did not return a playable MP4 URL" ||
        error?.message === "Could not determine YouTube video size"
      ) {
        throw error;
      }
      throw new Error("YouTube playback metadata was invalid");
    } finally {
      clearTimeout(timer);
    }
  }

  async inspectPlaybackSize(mediaUrl, requestHeaders) {
    if (!this.ctx.container.running) await this.start();
    const args = [
      "curl",
      "--location",
      "--silent",
      "--show-error",
      "--fail",
      "--range",
      "0-0",
      "--dump-header",
      "-",
      "--output",
      "/dev/null",
    ];
    appendCurlHeaders(args, requestHeaders);
    args.push(mediaUrl);

    const process = await this.ctx.container.exec(args);
    const output = await process.output();
    const decoder = new TextDecoder();
    const headersText = decoder.decode(output.stdout);
    if (output.exitCode !== 0) {
      const detail = decoder.decode(output.stderr).trim();
      throw publicPlaybackContainerError(detail);
    }

    let size = 0;
    const rangePattern = /content-range:\s*bytes\s+\d+-\d+\/(\d+)/ig;
    for (const match of headersText.matchAll(rangePattern)) {
      size = positiveInteger(match[1]);
    }
    return size;
  }

  async streamPlaybackRange(mediaUrl, requestHeaders, start, end) {
    if (!this.ctx.container.running) await this.start();
    const args = [
      "curl",
      "--location",
      "--silent",
      "--show-error",
      "--fail",
      "--range",
      String(start) + "-" + String(end),
    ];
    appendCurlHeaders(args, requestHeaders);
    args.push(mediaUrl);

    const process = await this.ctx.container.exec(args);
    if (!process.stdout) throw new Error("Could not start YouTube playback");

    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("YouTube playback did not start in time")),
            STREAM_START_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      try { await reader.cancel(); } catch (ignore) {}
      try { process.kill(); } catch (ignore) {}
      const detail = await stderrPromise.catch(() => "");
      if (detail) throw publicPlaybackContainerError(detail);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (first.done || !first.value?.byteLength) {
      const detail = await processFailureDetail(process, stderrPromise);
      try { await reader.cancel(); } catch (error) {}
      try { process.kill(); } catch (error) {}
      throw publicPlaybackContainerError(detail || "empty playback stream");
    }

    let sentFirst = false;
    return new ReadableStream({
      async pull(controller) {
        if (!sentFirst) {
          sentFirst = true;
          controller.enqueue(first.value);
          return;
        }
        try {
          const next = await reader.read();
          if (next.done) {
            const exitCode = await process.exitCode;
            const detail = await stderrPromise.catch(() => "");
            if (exitCode !== 0) {
              controller.error(
                publicPlaybackContainerError(detail || "playback failed")
              );
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
      async cancel(reason) {
        try { await reader.cancel(reason); } catch (error) {}
        try { process.kill(); } catch (error) {}
        stderrPromise.catch(() => "");
      },
    });
  }
}

export function isYouTubePlaybackRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PLAYBACK_PREPARE_PATH ||
    path === PLAYBACK_PATH ||
    path === PLAYBACK_RUNTIME_PATH;
}

export async function handleYouTubePlaybackRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === PLAYBACK_RUNTIME_PATH) {
    return new Response(PLAYBACK_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && path === PLAYBACK_PREPARE_PATH) {
    return preparePlayback(request, env, ctx);
  }
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    path === PLAYBACK_PATH
  ) {
    return streamPlayback(request, env);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendPlaybackRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const url = new URL(request.url);
  if (
    url.pathname !== "/mini-app/vexa-live" &&
    url.pathname !== "/mini-app/vexa-live/"
  ) {
    return response;
  }

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const script =
    '<script src="' + PLAYBACK_RUNTIME_PATH + '?v=20260819-1"></script>';
  const html = source.includes(PLAYBACK_RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", script + "\n</body>")
      : source + script;

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

async function preparePlayback(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceUrl = normalizeYouTubeUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid YouTube link" }, 400);

  const container = getContainer(
    env.VEXA_MEDIA,
    "youtube-" + safeContainerKey(user.id)
  );

  let media;
  try {
    media = await container.resolvePlaybackMedia(sourceUrl);
  } catch (error) {
    console.error("Vexa YouTube playback prepare failed", error?.stack || error);
    return json({ error: publicPlaybackError(error) }, 502);
  }

  await ensurePlaybackTable(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_playback_tokens " +
    "(token, user_id, source_url, media_url, media_headers, media_size, title, created_at, expires_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    token,
    String(user.id),
    sourceUrl,
    media.mediaUrl,
    JSON.stringify(media.requestHeaders || {}),
    Number(media.fileSize),
    String(media.title || "YouTube video"),
    now,
    now + PLAYBACK_TOKEN_TTL_SECONDS,
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare(
      "DELETE FROM vexa_youtube_playback_tokens WHERE expires_at < ?"
    ).bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    playbackUrl: PLAYBACK_PATH + "?token=" + encodeURIComponent(token),
    title: media.title || "YouTube video",
    duration: media.duration || 0,
    expiresIn: PLAYBACK_TOKEN_TTL_SECONDS,
  });
}

async function streamPlayback(request, env) {
  const checked = await readPlaybackToken(request, env);
  if (checked.response) return checked.response;

  let row = checked.row;
  let size = positiveInteger(row.media_size);
  if (!size) return json({ error: "Playback source is invalid" }, 500);

  let range = parseByteRange(request.headers.get("Range"), size);
  if (range.error) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": "bytes */" + String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const headers = parseStoredHeaders(row.media_headers);
  const container = getContainer(
    env.VEXA_MEDIA,
    "youtube-" + safeContainerKey(row.user_id)
  );

  let body;
  try {
    body = await container.streamPlaybackRange(
      String(row.media_url),
      headers,
      range.start,
      range.end
    );
  } catch (firstError) {
    const sourceUrl = normalizeYouTubeUrl(row.source_url);
    if (!sourceUrl) throw firstError;

    console.warn(
      "Vexa playback URL refresh",
      firstError?.message || firstError
    );
    const refreshed = await container.resolvePlaybackMedia(sourceUrl);
    size = positiveInteger(refreshed.fileSize);
    if (!size) throw firstError;

    range = parseByteRange(request.headers.get("Range"), size);
    if (range.error) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": "bytes */" + String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
        },
      });
    }

    row = {
      ...row,
      media_url: refreshed.mediaUrl,
      media_headers: JSON.stringify(refreshed.requestHeaders || {}),
      media_size: size,
      title: refreshed.title || row.title,
    };
    await env.DB.prepare(
      "UPDATE vexa_youtube_playback_tokens " +
      "SET media_url = ?, media_headers = ?, media_size = ?, title = ? WHERE token = ?"
    ).bind(
      row.media_url,
      row.media_headers,
      row.media_size,
      row.title,
      checked.token,
    ).run();

    body = await container.streamPlaybackRange(
      String(row.media_url),
      parseStoredHeaders(row.media_headers),
      range.start,
      range.end
    );
  }

  const responseHeaders = playbackHeaders(size, range);
  if (request.method === "HEAD") {
    try { await body.cancel(); } catch (error) {}
    return new Response(null, {
      status: range.partial ? 206 : 200,
      headers: responseHeaders,
    });
  }

  return new Response(body, {
    status: range.partial ? 206 : 200,
    headers: responseHeaders,
  });
}

async function readPlaybackToken(request, env) {
  const requestUrl = new URL(request.url);
  const token = String(requestUrl.searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    return {
      response: json({ error: "Playback link is invalid" }, 400),
      token: "",
    };
  }

  await ensurePlaybackTable(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, media_url, media_headers, media_size, title, expires_at " +
    "FROM vexa_youtube_playback_tokens WHERE token = ?"
  ).bind(token).first();

  if (!row || Number(row.expires_at || 0) <= now) {
    return {
      response: json({ error: "Playback link expired" }, 410),
      token,
    };
  }
  return { row, token };
}

function parseByteRange(value, size) {
  const raw = String(value || "").trim();
  if (!raw) return { start: 0, end: size - 1, partial: false, error: false };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return { error: true };

  const left = match[1];
  const right = match[2];

  let start;
  let end;
  if (!left && right) {
    const suffix = positiveInteger(right);
    if (!suffix) return { error: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(left, 10);
    if (!Number.isFinite(start) || start < 0 || start >= size) {
      return { error: true };
    }
    end = right ? Number.parseInt(right, 10) : size - 1;
    if (!Number.isFinite(end) || end < start) return { error: true };
    end = Math.min(end, size - 1);
  }

  return { start, end, partial: true, error: false };
}

function playbackHeaders(size, range) {
  const length = range.end - range.start + 1;
  const headers = {
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
    "Content-Length": String(length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range.partial) {
    headers["Content-Range"] =
      "bytes " + String(range.start) + "-" + String(range.end) + "/" + String(size);
  }
  return headers;
}

function appendCurlHeaders(args, headers) {
  for (const [name, value] of Object.entries(headers || {})) {
    const safeName = String(name || "").replace(/[^A-Za-z0-9-]/g, "");
    const safeValue = String(value || "").replace(/[\r\n]+/g, " ").trim();
    if (!safeName || !safeValue) continue;
    args.push("--header", safeName + ": " + safeValue);
  }
}

function sanitizeMediaHeaders(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  for (const [name, headerValue] of Object.entries(value)) {
    const safeName = String(name || "").replace(/[^A-Za-z0-9-]/g, "");
    const safeValue = String(headerValue || "").replace(/[\r\n]+/g, " ").trim();
    if (!safeName || !safeValue) continue;
    if (safeName.toLowerCase() === "host") continue;
    result[safeName] = safeValue;
  }
  return result;
}

function parseStoredHeaders(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return sanitizeMediaHeaders(parsed);
  } catch (error) {
    return {};
  }
}

function normalizeYouTubeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try { url = new URL(raw); } catch (error) { return ""; }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return "";
  url.hash = "";
  return url.toString();
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function assertLiveAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  if (admin) return;
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
      if (total <= maxBytes) {
        text += decoder.decode(next.value, { stream: true });
      }
    }
    text += decoder.decode();
    return text.trim();
  } catch (error) {
    return text.trim();
  }
}

async function processFailureDetail(process, stderrPromise) {
  const [exitCode, stderr] = await Promise.all([
    process.exitCode.catch(() => -1),
    stderrPromise.catch(() => ""),
  ]);
  const detail = String(stderr || "").trim();
  return detail || "playback process exited with code " + String(exitCode);
}

function publicPlaybackContainerError(detail) {
  const raw = String(detail || "");
  if (/403|forbidden/i.test(raw)) {
    return new Error("YouTube blocked this playback request (403)");
  }
  if (/po token|proof.of.origin|missing_pot/i.test(raw)) {
    return new Error("YouTube requires additional playback authorization");
  }
  if (/sign in|not a bot|private|members-only|age-restricted/i.test(raw)) {
    return new Error("YouTube blocked this Cloudflare server");
  }
  if (/unavailable|not available|video unavailable/i.test(raw)) {
    return new Error("This YouTube video is unavailable");
  }
  if (/requested format is not available|no video formats found/i.test(raw)) {
    return new Error("This video does not expose a playable MP4 format");
  }
  if (/empty/i.test(raw)) {
    return new Error("YouTube returned an empty playback stream");
  }
  console.error("Unclassified playback error", raw.slice(-4000));
  return new Error("YouTube could not prepare playback");
}

const PUBLIC_PLAYBACK_ERRORS = new Set([
  "YouTube blocked this playback request (403)",
  "YouTube requires additional playback authorization",
  "YouTube blocked this Cloudflare server",
  "This YouTube video is unavailable",
  "This video does not expose a playable MP4 format",
  "YouTube returned an empty playback stream",
  "YouTube could not prepare playback",
  "YouTube did not return a playable MP4 URL",
  "Could not determine YouTube video size",
  "YouTube playback did not start in time",
  "YouTube playback metadata was invalid",
]);

function isPublicPlaybackError(error) {
  return PUBLIC_PLAYBACK_ERRORS.has(String(error?.message || ""));
}

function publicPlaybackError(error) {
  const message = String(error?.message || "");
  return PUBLIC_PLAYBACK_ERRORS.has(message)
    ? message
    : "YouTube playback is temporarily unavailable";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function ensurePlaybackTable(env) {
  if (!playbackTableReady) {
    playbackTableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_playback_tokens (" +
        "token TEXT PRIMARY KEY, " +
        "user_id TEXT NOT NULL, " +
        "source_url TEXT NOT NULL, " +
        "media_url TEXT NOT NULL, " +
        "media_headers TEXT NOT NULL, " +
        "media_size INTEGER NOT NULL, " +
        "title TEXT, " +
        "created_at INTEGER NOT NULL, " +
        "expires_at INTEGER NOT NULL" +
      ")"
    ).run().catch((error) => {
      playbackTableReady = null;
      throw error;
    });
  }
  await playbackTableReady;
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

export const PLAYBACK_RUNTIME_JS = String.raw`
(function () {
  const PLAYBACK_PREPARE_URL = "/mini-app/live/api/youtube-playback/prepare";
  const DOWNLOAD_PREPARE_URL = "/mini-app/live/api/youtube-download/prepare";
  let currentSourceUrl = "";
  let downloadBusy = false;

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
    const tg = telegram();
    try { tg?.HapticFeedback?.impactOccurred?.(style || "light"); } catch (error) {}
  }

  function setState(busy, message, error) {
    const button = document.getElementById("vexaLiveLoad");
    const input = document.getElementById("vexaLiveYoutubeUrl");
    const status = document.getElementById("vexaLiveStatus");
    if (button) {
      button.disabled = Boolean(busy);
      button.textContent = busy ? "Opening…" : "Open";
    }
    if (input) input.disabled = Boolean(busy);
    if (status) {
      status.textContent = String(message || "");
      status.classList.toggle("show", Boolean(message));
      status.classList.toggle("error", Boolean(error));
    }
  }

  function ensureVideo() {
    const existing = document.getElementById("vexaLiveVideo");
    if (existing && existing.tagName === "VIDEO") return existing;
    const video = document.createElement("video");
    video.id = "vexaLiveVideo";
    video.className = existing?.className || "vexa-live-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("controlslist", "nodownload");
    video.style.objectFit = "contain";
    if (existing) existing.replaceWith(video);
    return video;
  }

  function showStage(title) {
    const stage = document.getElementById("vexaLiveStage");
    const empty = document.getElementById("vexaLiveEmpty");
    const titleNode = document.getElementById("vexaLiveVideoTitle");
    const download = document.getElementById("vexaLiveDownload");
    stage?.classList.add("show");
    if (empty) empty.style.display = "none";
    if (titleNode) titleNode.textContent = String(title || "YouTube video");
    if (download) {
      download.disabled = false;
      download.textContent = "Download";
      download.classList.add("show");
    }
  }

  async function openVideo() {
    const input = document.getElementById("vexaLiveYoutubeUrl");
    const sourceUrl = String(input?.value || "").trim();
    if (!sourceUrl) {
      setState(false, "Paste a YouTube link", true);
      return;
    }

    setState(true, "Preparing video…", false);
    haptic("light");
    try {
      const response = await fetch(PLAYBACK_PREPARE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          initData: initData(),
          url: sourceUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.playbackUrl) {
        throw new Error(String(data.error || "Could not prepare this video"));
      }

      const video = ensureVideo();
      currentSourceUrl = sourceUrl;
      showStage(data.title);

      video.pause();
      video.removeAttribute("src");
      video.load();
      video.src = new URL(String(data.playbackUrl), window.location.origin).href;

      video.addEventListener("loadedmetadata", function ready() {
        setState(false, "", false);
      }, { once: true });
      video.addEventListener("waiting", function waiting() {
        setState(false, "Buffering…", false);
      });
      video.addEventListener("playing", function playing() {
        setState(false, "", false);
      });
      video.addEventListener("error", function playbackError() {
        setState(false, "Could not play this YouTube video", true);
      }, { once: true });

      video.load();
      setState(false, "Buffering…", false);
      try { await video.play(); } catch (error) {}
      haptic("medium");
    } catch (error) {
      setState(false, String(error?.message || "Could not open this video"), true);
      haptic("light");
    }
  }

  async function downloadVideo() {
    if (downloadBusy || !currentSourceUrl) return;
    const button = document.getElementById("vexaLiveDownload");
    downloadBusy = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Preparing…";
    }
    setState(false, "Preparing download…", false);
    haptic("light");

    try {
      const response = await fetch(DOWNLOAD_PREPARE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          initData: initData(),
          url: currentSourceUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.downloadUrl) {
        throw new Error(String(data.error || "Could not prepare download"));
      }

      const absoluteUrl = new URL(String(data.downloadUrl), window.location.origin).href;
      const fileName = String(data.fileName || "Vexa-YouTube-video.mp4");
      const tg = telegram();

      if (tg?.downloadFile) {
        let completed = false;
        try {
          tg.downloadFile(
            { url: absoluteUrl, file_name: fileName },
            function () { completed = true; }
          );
        } catch (error) {}
        if (!completed) {
          window.open(absoluteUrl, "_blank");
        }
      } else {
        const link = document.createElement("a");
        link.href = absoluteUrl;
        link.download = fileName;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setState(false, "Download started", false);
      haptic("medium");
    } catch (error) {
      setState(false, String(error?.message || "Could not prepare download"), true);
    } finally {
      downloadBusy = false;
      if (button) {
        button.disabled = false;
        button.textContent = "Download";
      }
    }
  }

  function bind() {
    const open = document.getElementById("vexaLiveLoad");
    const input = document.getElementById("vexaLiveYoutubeUrl");
    const download = document.getElementById("vexaLiveDownload");
    if (!open || !input || !download) return false;

    ensureVideo();

    open.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openVideo();
    }, true);

    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openVideo();
    }, true);

    download.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadVideo();
    }, true);

    document.documentElement.dataset.vexaRangePlayback = "1";
    return true;
  }

  if (!bind()) {
    const observer = new MutationObserver(function () {
      if (bind()) observer.disconnect();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
`;
