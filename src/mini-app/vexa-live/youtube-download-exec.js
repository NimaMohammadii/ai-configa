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
const STREAM_START_TIMEOUT_MS = 25_000;
const DOWNLOAD_FILE_NAME = "Vexa-YouTube-video.mp4";
const FORMAT_SELECTOR = "b[ext=mp4][protocol^=http][vcodec!=none][acodec!=none]";
const TELEGRAM_SAFE_FILE_BYTES = 45 * 1024 * 1024;
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

let tokenTableReady = null;

export class VexaMediaContainerV3 extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async prepareVideo(url) {
    let lastError = null;
    for (const strategy of CLIENT_STRATEGIES) {
      try {
        const metadata = await this.getVideoMetadataForStrategy(url, strategy);
        await this.probeVideo(url, metadata.strategyId, metadata.formatId);
        return metadata;
      } catch (error) {
        lastError = error;
        console.warn("Vexa YouTube strategy probe failed", strategy.id, error?.message || error);
      }
    }
    throw lastError || new Error("YouTube could not prepare this video");
  }

  async getVideoMetadata(url) {
    let lastError = null;
    for (const strategy of CLIENT_STRATEGIES) {
      try {
        return await this.getVideoMetadataForStrategy(url, strategy);
      } catch (error) {
        lastError = error;
        console.warn("Vexa YouTube client strategy failed", strategy.id, error?.message || error);
      }
    }
    throw lastError || new Error("YouTube could not prepare this video");
  }

  async getVideoMetadataForStrategy(url, strategy) {
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
        throw publicContainerError(detail);
      }

      const data = JSON.parse(decoder.decode(output.stdout));
      const ext = String(data?.ext || "").toLowerCase();
      const protocol = String(data?.protocol || "").toLowerCase();
      const formatId = String(data?.format_id || "").trim();
      if (ext !== "mp4" || !protocol.startsWith("http") || !formatId) {
        throw new Error("YouTube did not return a direct MP4 stream");
      }
      return {
        title: String(data?.title || "YouTube video"),
        ext,
        protocol,
        formatId,
        strategyId: strategy.id,
      };
    } catch (error) {
      if (isPublicMediaError(error)) throw error;
      if (error?.message === "YouTube did not return a direct MP4 stream") throw error;
      throw new Error("YouTube metadata was invalid");
    } finally {
      clearTimeout(timer);
    }
  }

  async getTelegramDownloadCatalog(url) {
    let lastError = null;
    for (const strategy of CLIENT_STRATEGIES) {
      try {
        return await this.getTelegramDownloadCatalogForStrategy(url, strategy);
      } catch (error) {
        lastError = error;
        console.warn("Vexa Telegram YouTube catalog failed", strategy.id, error?.message || error);
      }
    }
    throw lastError || new Error("YouTube could not prepare this video");
  }

  async getTelegramDownloadCatalogForStrategy(url, strategy) {
    const process = await this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      ...strategy.args,
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
      if (output.exitCode !== 0) {
        throw publicContainerError(decoder.decode(output.stderr).trim());
      }
      const data = JSON.parse(decoder.decode(output.stdout));
      return buildTelegramCatalog(data, strategy.id);
    } catch (error) {
      if (isPublicMediaError(error)) throw error;
      if (PUBLIC_MEDIA_ERRORS.has(String(error?.message || ""))) throw error;
      throw new Error("YouTube metadata was invalid");
    } finally {
      clearTimeout(timer);
    }
  }

  async probeVideo(url, strategyId, formatId) {
    const process = await this.startVideoProcess(url, strategyId, formatId);
    if (!process.stdout) throw new Error("Could not start the YouTube download");

    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    try {
      const first = await Promise.race([
        readStreamPrefix(reader, 12),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("YouTube stream did not start in time")),
            STREAM_START_TIMEOUT_MS
          );
        }),
      ]);
      if (!first?.byteLength) {
        const detail = await processFailureDetail(process, stderrPromise);
        throw publicContainerError(detail || "empty stream");
      }
      if (!looksLikeMp4(first)) {
        throw new Error("YouTube returned an invalid MP4 stream");
      }
      return true;
    } catch (error) {
      if (error?.message === "YouTube stream did not start in time") {
        console.warn("Vexa YouTube probe timeout", strategyId, formatId);
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      try { await reader.cancel(); } catch (error) {}
      try { process.kill(); } catch (error) {}
      stderrPromise.catch(() => "");
    }
  }

  async streamVideo(url, strategyId, formatId) {
    const process = await this.startVideoProcess(url, strategyId, formatId);
    if (!process.stdout) throw new Error("Could not start the YouTube download");

    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        readStreamPrefix(reader, 12),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("YouTube stream did not start in time")),
            STREAM_START_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      try { await reader.cancel(); } catch (ignore) {}
      try { process.kill(); } catch (ignore) {}
      const detail = await stderrPromise.catch(() => "");
      if (detail) console.error("yt-dlp stream start failed", detail.slice(-2000));
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!first?.byteLength) {
      const detail = await processFailureDetail(process, stderrPromise);
      try { await reader.cancel(); } catch (error) {}
      try { process.kill(); } catch (error) {}
      throw publicContainerError(detail || "empty stream");
    }
    if (!looksLikeMp4(first)) {
      try { await reader.cancel(); } catch (error) {}
      try { process.kill(); } catch (error) {}
      throw new Error("YouTube returned an invalid MP4 stream");
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
            const exitCode = await process.exitCode;
            const detail = await stderrPromise.catch(() => "");
            if (exitCode !== 0) {
              if (detail) console.error("yt-dlp download failed", detail.slice(-4000));
              controller.error(publicContainerError(detail || "download failed"));
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

  async startVideoProcess(url, strategyId, formatId) {
    const strategy = clientStrategy(strategyId);
    if (!strategy) throw new Error("YouTube client strategy is invalid");
    const selectedFormat = String(formatId || "").trim() || FORMAT_SELECTOR;
    const mergeArgs = selectedFormat.includes("+")
      ? [
          "--merge-output-format",
          "mp4",
          "--downloader-args",
          "ffmpeg_o:-f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof",
        ]
      : [];
    return this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      ...strategy.args,
      "--quiet",
      "--no-warnings",
      "-f",
      selectedFormat,
      ...mergeArgs,
      "-o",
      "-",
      url,
    ]);
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

export function extractYouTubeUrl(value) {
  const matches = String(value || "").match(/https:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;!?]+$/u, "");
    const normalized = normalizeYouTubeUrl(candidate);
    if (normalized) return normalized;
  }
  return "";
}

export async function getTelegramYouTubeOptions(env, userId, value) {
  const sourceUrl = normalizeYouTubeUrl(value);
  if (!sourceUrl) throw new Error("Enter a valid YouTube link");
  if (!env.VEXA_MEDIA) throw new Error("YouTube download is temporarily unavailable");
  try {
    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(userId));
    const catalog = await container.getTelegramDownloadCatalog(sourceUrl);
    if (!catalog.options?.length) {
      throw new Error("This download is too large for Telegram");
    }
    return { ...catalog, sourceUrl };
  } catch (error) {
    const message = publicMediaError(error);
    throw new Error(message);
  }
}

export async function downloadTelegramYouTubeMedia(env, userId, value, optionKey) {
  const prepared = await getTelegramYouTubeOptions(env, userId, value);
  const selected = prepared.options.find((option) => option.key === String(optionKey || ""));
  if (!selected) throw new Error("This download option is no longer available");

  const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(userId));
  let stream;
  try {
    stream = await container.streamVideo(prepared.sourceUrl, prepared.strategyId, selected.selector);
    return {
      kind: selected.kind,
      title: prepared.title,
      label: selected.label,
      filename: selected.filename,
      mimeType: selected.mimeType,
      sizeBytes: selected.sizeBytes,
      stream,
    };
  } catch (error) {
    const message = publicMediaError(error);
    throw new Error(message);
  }
}

async function prepareDownload(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceUrl = normalizeYouTubeUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid YouTube link" }, 400);

  const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(user.id));
  let metadata;
  try {
    metadata = await container.prepareVideo(sourceUrl);
  } catch (error) {
    console.error("Vexa YouTube prepare failed", error?.stack || error);
    return json({ error: publicMediaError(error) }, 502);
  }

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
    fileName: DOWNLOAD_FILE_NAME,
    title: metadata?.title || "YouTube video",
    format: "mp4",
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

async function inspectDownload(request, env) {
  const checked = await readDownloadToken(request, env);
  if (checked.response) return checked.response;
  return new Response(null, {
    status: 200,
    headers: downloadHeaders(),
  });
}

async function streamDownload(request, env) {
  const checked = await readDownloadToken(request, env);
  if (checked.response) return checked.response;

  const row = checked.row;
  await markDownloadTokenUsed(env, checked.token).catch(() => null);
  const sourceUrl = normalizeYouTubeUrl(row.source_url);
  if (!sourceUrl) return json({ error: "Download source is invalid" }, 400);

  try {
    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(row.user_id));
    const metadata = await container.prepareVideo(sourceUrl);
    const body = await container.streamVideo(sourceUrl, metadata.strategyId, metadata.formatId);
    return new Response(body, {
      status: 200,
      headers: downloadHeaders(),
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
  return { row, token };
}

async function markDownloadTokenUsed(env, token) {
  await env.DB.prepare("UPDATE vexa_youtube_download_tokens SET used_at = COALESCE(used_at, ?) WHERE token = ?").bind(Math.floor(Date.now() / 1000), token).run();
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

function buildTelegramCatalog(data, strategyId) {
  const formats = Array.isArray(data?.formats) ? data.formats : [];
  const duration = positiveNumber(data?.duration);
  const title = String(data?.title || "YouTube video").trim() || "YouTube video";

  const audioCandidates = formats
    .filter((format) => isHttpFormat(format) && isAudioOnlyM4a(format))
    .map((format) => ({ format, size: formatSizeBytes(format, duration) }))
    .filter((item) => item.size > 0 && item.size <= TELEGRAM_SAFE_FILE_BYTES)
    .sort((a, b) => audioScore(b.format) - audioScore(a.format));
  const audio = audioCandidates[0] || null;

  const byHeight = new Map();
  for (const format of formats) {
    if (!isHttpFormat(format) || !isTelegramMp4Video(format)) continue;
    const height = positiveInteger(format?.height);
    const formatId = String(format?.format_id || "").trim();
    if (!height || !formatId || height > 2160) continue;

    const hasAudio = hasAudioCodec(format);
    if (hasAudio && !isAacCodec(format?.acodec)) continue;
    if (!hasAudio && !audio) continue;

    const videoSize = formatSizeBytes(format, duration);
    if (!videoSize) continue;
    const totalSize = hasAudio ? videoSize : videoSize + audio.size;
    if (totalSize > TELEGRAM_SAFE_FILE_BYTES) continue;

    const selector = hasAudio
      ? formatId
      : formatId + "+" + String(audio.format?.format_id || "");
    if (!selector || selector.endsWith("+")) continue;

    const option = {
      key: "v" + height,
      kind: "video",
      height,
      sizeBytes: totalSize,
      selector,
      mimeType: "video/mp4",
      filename: "Vexa-YouTube-" + height + "p.mp4",
      label: height + "p",
      score: videoScore(format),
    };
    const current = byHeight.get(height);
    if (!current || option.score > current.score) byHeight.set(height, option);
  }

  const options = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .slice(0, 7)
    .map(({ score, ...option }) => option);

  if (audio) {
    options.push({
      key: "a",
      kind: "audio",
      sizeBytes: audio.size,
      selector: String(audio.format.format_id),
      mimeType: "audio/mp4",
      filename: "Vexa-YouTube-audio.m4a",
      label: "Audio only",
    });
  }

  return { title, strategyId, options };
}

function isHttpFormat(format) {
  return String(format?.protocol || "").toLowerCase().startsWith("http");
}

function isAudioOnlyM4a(format) {
  const ext = String(format?.ext || "").toLowerCase();
  return ext === "m4a" && !hasVideoCodec(format) && hasAudioCodec(format) && isAacCodec(format?.acodec);
}

function isTelegramMp4Video(format) {
  const ext = String(format?.ext || "").toLowerCase();
  const codec = String(format?.vcodec || "").toLowerCase();
  return ext === "mp4" && hasVideoCodec(format) && (codec.startsWith("avc1") || codec.includes("h264"));
}

function hasVideoCodec(format) {
  const codec = String(format?.vcodec || "").toLowerCase();
  return Boolean(codec && codec !== "none");
}

function hasAudioCodec(format) {
  const codec = String(format?.acodec || "").toLowerCase();
  return Boolean(codec && codec !== "none");
}

function isAacCodec(value) {
  const codec = String(value || "").toLowerCase();
  return codec.startsWith("mp4a") || codec.includes("aac");
}

function formatSizeBytes(format, duration) {
  const exact = positiveNumber(format?.filesize);
  if (exact) return Math.ceil(exact);
  const approximate = positiveNumber(format?.filesize_approx);
  if (approximate) return Math.ceil(approximate);
  const bitrate = positiveNumber(format?.tbr) || positiveNumber(format?.abr) || positiveNumber(format?.vbr);
  if (!bitrate || !duration) return 0;
  return Math.ceil(bitrate * 125 * duration * 1.05);
}

function audioScore(format) {
  return (positiveNumber(format?.abr) || positiveNumber(format?.tbr) || 0) * 100 +
    (positiveNumber(format?.asr) || 0) / 1000;
}

function videoScore(format) {
  return (positiveNumber(format?.fps) || 0) * 1000 +
    (positiveNumber(format?.tbr) || positiveNumber(format?.vbr) || 0);
}

function clientStrategy(strategyId) {
  const id = String(strategyId || "");
  return CLIENT_STRATEGIES.find((strategy) => strategy.id === id) || null;
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

async function processFailureDetail(process, stderrPromise) {
  const [exitCode, stderr] = await Promise.all([
    process.exitCode.catch(() => -1),
    stderrPromise.catch(() => ""),
  ]);
  const detail = String(stderr || "").trim();
  return detail || "yt-dlp exited with code " + String(exitCode);
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function looksLikeMp4(chunk) {
  if (!(chunk instanceof Uint8Array) || chunk.byteLength < 12) return false;
  return chunk[4] === 0x66 && chunk[5] === 0x74 && chunk[6] === 0x79 && chunk[7] === 0x70;
}

function downloadHeaders() {
  return {
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + DOWNLOAD_FILE_NAME + '"',
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
  if (/403|forbidden/i.test(raw)) {
    return new Error("YouTube blocked the Cloudflare download request (403)");
  }
  if (/po token|proof.of.origin|missing_pot/i.test(raw)) {
    return new Error("YouTube requires a PO Token for this download");
  }
  if (/sign in|not a bot|private|members-only|age-restricted/i.test(raw)) {
    return new Error("YouTube blocked this Cloudflare server");
  }
  if (/unavailable|not available|video unavailable/i.test(raw)) {
    return new Error("This YouTube video is unavailable");
  }
  if (/requested format is not available|no video formats found/i.test(raw)) {
    return new Error("This video does not expose a direct MP4 download format");
  }
  if (/empty stream/i.test(raw)) {
    return new Error("YouTube returned an empty video stream");
  }
  console.error("Unclassified yt-dlp error", raw.slice(-4000));
  return new Error("YouTube could not prepare this video");
}

function isPublicMediaError(error) {
  return PUBLIC_MEDIA_ERRORS.has(String(error?.message || ""));
}

const PUBLIC_MEDIA_ERRORS = new Set([
  "This YouTube video is unavailable",
  "This YouTube video cannot be downloaded without additional access",
  "This video does not expose a direct MP4 download format",
  "This download is too large for Telegram",
  "This download option is no longer available",
  "Enter a valid YouTube link",
  "YouTube blocked the Cloudflare download request (403)",
  "YouTube requires a PO Token for this download",
  "YouTube blocked this Cloudflare server",
  "YouTube could not prepare this video",
  "YouTube did not return a direct MP4 stream",
  "YouTube returned an empty video stream",
  "YouTube returned an invalid MP4 stream",
  "YouTube stream did not start in time",
  "YouTube download ended unexpectedly",
  "YouTube download is temporarily unavailable",
]);

function publicMediaError(error) {
  const message = String(error?.message || "");
  return PUBLIC_MEDIA_ERRORS.has(message) ? message : "YouTube download is temporarily unavailable";
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