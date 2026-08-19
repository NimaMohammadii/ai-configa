import { Container, getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const PREPARE_PATH = "/mini-app/live/api/youtube-download/prepare";
const DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";
const TOKEN_TTL_SECONDS = 10 * 60;
const METADATA_TIMEOUT_MS = 35_000;
const FORMAT_SELECTOR = "b[ext=mp4][vcodec!=none][acodec!=none]/b[vcodec!=none][acodec!=none]";
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const YTDLP_COMMON_ARGS = Object.freeze([
  "--ignore-config",
  "--no-playlist",
  "--js-runtimes",
  "deno",
  "--socket-timeout",
  "15",
  "--retries",
  "2",
  "--fragment-retries",
  "2",
]);

let tokenTableReady = null;

export class VexaMediaContainerV3 extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async getVideoMetadata(url) {
    const process = await this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
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
        const detail = decoder.decode(output.stderr).trim().split("\n").filter(Boolean).pop();
        throw publicContainerError(detail);
      }

      try {
        const data = JSON.parse(decoder.decode(output.stdout));
        return {
          title: String(data?.title || "YouTube video"),
          ext: String(data?.ext || "mp4").toLowerCase(),
        };
      } catch (error) {
        throw new Error("YouTube metadata was invalid");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async streamVideo(url) {
    const process = await this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      "--quiet",
      "--no-warnings",
      "-f",
      FORMAT_SELECTOR,
      "-o",
      "-",
      url,
    ], { stderr: "ignore" });

    if (!process.stdout) {
      throw new Error("Could not start the YouTube download");
    }
    return process.stdout;
  }

  async execYtDlp(args, options) {
    if (!this.ctx.container.running) {
      await this.start();
    }
    return this.ctx.container.exec(["yt-dlp", ...args], options);
  }
}

export function isYouTubeDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PREPARE_PATH || path === DOWNLOAD_PATH;
}

export async function handleYouTubeDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === PREPARE_PATH) {
    return prepareDownload(request, env, ctx);
  }
  if (request.method === "HEAD" && url.pathname === DOWNLOAD_PATH) {
    return inspectDownload(request, env);
  }
  if (request.method === "GET" && url.pathname === DOWNLOAD_PATH) {
    return streamDownload(request, env);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

async function prepareDownload(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceUrl = normalizeYouTubeUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid YouTube link" }, 400);

  await ensureTokenTable(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_tokens " +
    "(token, user_id, source_url, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)"
  ).bind(token, String(user.id), sourceUrl, now, now + TOKEN_TTL_SECONDS).run();

  ctx?.waitUntil?.(
    env.DB.prepare(
      "DELETE FROM vexa_youtube_download_tokens WHERE expires_at < ?"
    ).bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    downloadUrl: DOWNLOAD_PATH + "?token=" + encodeURIComponent(token),
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

async function inspectDownload(request, env) {
  const checked = await readDownloadToken(request, env);
  if (checked.response) return checked.response;
  return new Response(null, {
    status: 200,
    headers: downloadHeaders("Vexa YouTube video", "mp4"),
  });
}

async function streamDownload(request, env) {
  const checked = await readDownloadToken(request, env);
  if (checked.response) return checked.response;

  const row = checked.row;
  const sourceUrl = normalizeYouTubeUrl(row.source_url);
  if (!sourceUrl) return json({ error: "Download source is invalid" }, 400);

  try {
    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(row.user_id));
    const metadata = await container.getVideoMetadata(sourceUrl);
    const body = await container.streamVideo(sourceUrl);
    const filename = safeFileName(metadata?.title, metadata?.ext);

    return new Response(body, {
      status: 200,
      headers: downloadHeaders(filename, metadata?.ext),
    });
  } catch (error) {
    console.error("Vexa YouTube media container failed", error?.stack || error);
    return json({ error: publicMediaError(error) }, 502);
  }
}

async function readDownloadToken(request, env) {
  const requestUrl = new URL(request.url);
  const token = String(requestUrl.searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    return { response: json({ error: "Download link is invalid" }, 400) };
  }

  await ensureTokenTable(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, expires_at FROM vexa_youtube_download_tokens WHERE token = ?"
  ).bind(token).first();

  if (!row || Number(row.expires_at || 0) <= now) {
    return { response: json({ error: "Download link expired" }, 410) };
  }
  return { row };
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

function normalizeYouTubeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return "";
  url.hash = "";
  return url.toString();
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function safeFileName(title, extension) {
  const cleanTitle = String(title || "YouTube video")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 140) || "YouTube video";
  const ext = safeExtension(extension);
  return cleanTitle + "." + ext;
}

function safeExtension(extension) {
  return String(extension || "mp4").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "mp4";
}

function mediaContentType(extension) {
  const ext = safeExtension(extension);
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}

function downloadHeaders(filename, extension) {
  const ext = safeExtension(extension);
  const fallback = "Vexa-YouTube-video." + ext;
  return {
    "Content-Type": mediaContentType(ext),
    "Content-Disposition":
      "attachment; filename=\"" + fallback + "\"; filename*=UTF-8''" + encodeURIComponent(filename),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
  };
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function ensureTokenTable(env) {
  if (!tokenTableReady) {
    tokenTableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_download_tokens (" +
        "token TEXT PRIMARY KEY, " +
        "user_id TEXT NOT NULL, " +
        "source_url TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL, " +
        "expires_at INTEGER NOT NULL, " +
        "used_at INTEGER" +
      ")"
    ).run().catch((error) => {
      tokenTableReady = null;
      throw error;
    });
  }
  await tokenTableReady;
}

function publicContainerError(detail) {
  const raw = String(detail || "");
  if (/private|sign in|members-only|age-restricted/i.test(raw)) {
    return new Error("This YouTube video cannot be downloaded without additional access");
  }
  if (/unavailable|not available|video unavailable/i.test(raw)) {
    return new Error("This YouTube video is unavailable");
  }
  return new Error("YouTube could not prepare this video");
}

function publicMediaError(error) {
  const message = String(error?.message || "");
  if (
    message === "This YouTube video is unavailable" ||
    message === "This YouTube video cannot be downloaded without additional access" ||
    message === "YouTube could not prepare this video"
  ) return message;
  return "YouTube download is temporarily unavailable";
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
