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
const STREAM_START_TIMEOUT_MS = 90_000;
const PROCESS_SETTLE_TIMEOUT_MS = 2_000;
const DOWNLOAD_FILE_NAME = "Vexa-video.mp4";
const FORMAT_SELECTOR = "b[ext=mp4][protocol^=http][vcodec!=none][acodec!=none]";
const PORNHUB_MINI_APP_SELECTOR =
  "b[ext=mp4][protocol^=m3u8][vcodec!=none][acodec!=none]/" +
  "bv[ext=mp4][protocol^=m3u8]+ba[protocol^=m3u8]/b[ext=mp4]";
const TELEGRAM_SAFE_FILE_BYTES = 45_000_000;
const TELEGRAM_UPLOAD_FILE_BYTES = 49_000_000;
const FFMPEG_INPUT_ARGS =
  "ffmpeg_i:-rw_timeout 15000000 -reconnect 1 -reconnect_on_network_error 1 " +
  "-reconnect_on_http_error 5xx -reconnect_streamed 1 -reconnect_delay_max 2 -reconnect_max_retries 1";
const FFMPEG_OUTPUT_ARGS =
  "ffmpeg_o:-f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof";
const FFMPEG_FILE_OUTPUT_ARGS = "ffmpeg_o:-movflags +faststart";
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const PORNHUB_HOST_SUFFIXES = Object.freeze([
  "pornhub.com",
  "pornhub.net",
  "pornhub.org",
  "pornhubpremium.com",
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
const PORNHUB_STRATEGY = Object.freeze({
  id: "pornhub",
  args: Object.freeze([]),
});
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
    const normalized = normalizeBotMediaUrl(url);
    if (normalized?.provider === "pornhub") {
      return this.preparePornHubVideo(normalized.url);
    }

    const youtubeUrl = normalized?.provider === "youtube" ? normalized.url : normalizeYouTubeUrl(url);
    let lastError = null;
    for (const strategy of CLIENT_STRATEGIES) {
      try {
        const metadata = await this.getVideoMetadataForStrategy(youtubeUrl, strategy);
        await this.probeVideo(youtubeUrl, metadata.strategyId, metadata.formatId);
        return metadata;
      } catch (error) {
        lastError = error;
        console.warn("Vexa YouTube strategy probe failed", strategy.id, error?.message || error);
      }
    }
    throw lastError || new Error("YouTube could not prepare this video");
  }

  async preparePornHubVideo(url) {
    const process = await this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      ...PORNHUB_STRATEGY.args,
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "-f",
      PORNHUB_MINI_APP_SELECTOR,
      url,
    ]);
    const timer = setTimeout(() => {
      try { process.kill(); } catch (error) {}
    }, METADATA_TIMEOUT_MS);

    try {
      const output = await process.output();
      const decoder = new TextDecoder();
      if (output.exitCode !== 0) {
        throw publicContainerError(decoder.decode(output.stderr).trim(), "pornhub");
      }
      const data = JSON.parse(decoder.decode(output.stdout));
      return {
        title: String(data?.title || "Video"),
        ext: "mp4",
        protocol: "media",
        formatId: PORNHUB_MINI_APP_SELECTOR,
        strategyId: PORNHUB_STRATEGY.id,
        transport: "ffmpeg",
      };
    } catch (error) {
      if (isPublicMediaError(error)) throw error;
      throw new Error("PornHub metadata was invalid");
    } finally {
      clearTimeout(timer);
    }
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
    const strategies = mediaStrategies(url);
    for (const strategy of strategies) {
      try {
        return await this.getTelegramDownloadCatalogForStrategy(url, strategy);
      } catch (error) {
        lastError = error;
        console.warn("Vexa Telegram media catalog failed", strategy.id, error?.message || error);
      }
    }
    const provider = strategies[0]?.id === PORNHUB_STRATEGY.id ? "pornhub" : "youtube";
    throw lastError || new Error(provider === "pornhub"
      ? "PornHub could not prepare this video"
      : "YouTube could not prepare this video");
  }

  async getTelegramDownloadCatalogForStrategy(url, strategy) {
    const provider = mediaProviderForStrategy(strategy.id);
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
        throw publicContainerError(decoder.decode(output.stderr).trim(), provider);
      }
      const data = JSON.parse(decoder.decode(output.stdout));
      return buildTelegramCatalog(data, strategy.id);
    } catch (error) {
      if (isPublicMediaError(error)) throw error;
      if (PUBLIC_MEDIA_ERRORS.has(String(error?.message || ""))) throw error;
      throw new Error(provider === "pornhub" ? "PornHub metadata was invalid" : "YouTube metadata was invalid");
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
      stopProcessNow(process, reader, "probe_complete");
      stderrPromise.catch(() => "");
    }
  }

  async streamVideo(url, strategyId, formatId, transport = "", maxFinalizedBytes = TELEGRAM_UPLOAD_FILE_BYTES) {
    const provider = mediaProviderForStrategy(strategyId);
    const timeoutMessage = provider === "pornhub"
      ? "PornHub stream did not start in time"
      : "YouTube stream did not start in time";
    const invalidStreamMessage = provider === "pornhub"
      ? "PornHub returned an invalid MP4 stream"
      : "YouTube returned an invalid MP4 stream";
    const process = provider === "pornhub"
      ? await this.startFinalizedPornHubProcess(url, strategyId, formatId, transport, maxFinalizedBytes)
      : await this.startVideoProcess(url, strategyId, formatId, transport);
    if (!process.stdout) throw new Error(provider === "pornhub"
      ? "Could not start the PornHub download"
      : "Could not start the YouTube download");

    const stderrPromise = collectText(process.stderr, 16_384);
    const reader = process.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        readStreamPrefix(reader, 12),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(timeoutMessage)),
            STREAM_START_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      stopProcessNow(process, reader, "stream_start_failed");
      const detail = await settleWithin(stderrPromise, PROCESS_SETTLE_TIMEOUT_MS, "");
      if (detail) console.error("yt-dlp stream start failed", detail.slice(-2000));
      if (detail && error?.message === timeoutMessage) {
        const mapped = publicContainerError(detail, provider);
        if (mapped?.message && !/could not prepare/i.test(mapped.message)) throw mapped;
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!first?.byteLength) {
      stopProcessNow(process, reader, "empty_stream");
      const detail = await processFailureDetail(process, stderrPromise);
      throw publicContainerError(detail || "empty stream", provider);
    }
    if (!looksLikeMp4(first)) {
      stopProcessNow(process, reader, "invalid_mp4");
      throw new Error(invalidStreamMessage);
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
              if (detail) console.error("yt-dlp download failed", detail.slice(-4000));
              controller.error(publicContainerError(detail || "download failed", provider));
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

  async startFinalizedPornHubProcess(url, strategyId, formatId, transport = "", maxBytes = TELEGRAM_UPLOAD_FILE_BYTES) {
    const tempPath = "/tmp/vexa-pornhub-" + crypto.randomUUID() + ".mp4";
    try {
      const downloadProcess = await this.startVideoProcess(
        url,
        strategyId,
        formatId,
        transport,
        tempPath,
      );
      const output = await downloadProcess.output();
      const decoder = new TextDecoder();
      const detail = decoder.decode(output.stderr).trim();
      if (output.exitCode !== 0) {
        if (detail) console.error("yt-dlp finalized PornHub download failed", detail.slice(-4000));
        throw publicContainerError(detail || "download failed", "pornhub");
      }

      const sizeProcess = await this.ctx.container.exec([
        "sh",
        "-c",
        'wc -c < "$1"',
        "vexa-pornhub-size",
        tempPath,
      ]);
      const sizeOutput = await sizeProcess.output();
      const sizeText = new TextDecoder().decode(sizeOutput.stdout).trim();
      const fileSize = Number.parseInt(sizeText, 10);
      if (sizeOutput.exitCode !== 0 || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
        throw new Error("PornHub returned an empty video stream");
      }
      if (Number(maxBytes) > 0 && fileSize > Number(maxBytes)) {
        throw new Error("This download is too large for Telegram");
      }

      return await this.ctx.container.exec([
        "sh",
        "-c",
        'exec 3<"$1" || exit 1; rm -f "$1" "$1.part"; cat <&3',
        "vexa-pornhub-stream",
        tempPath,
      ]);
    } catch (error) {
      try {
        const cleanup = await this.ctx.container.exec(["rm", "-f", tempPath, tempPath + ".part"]);
        cleanup.output().catch(() => null);
      } catch (ignore) {}
      throw error;
    }
  }

  async startVideoProcess(url, strategyId, formatId, transport = "", outputPath = "-") {
    const strategy = clientStrategy(strategyId);
    if (!strategy) throw new Error("Media client strategy is invalid");
    const selectedFormat = String(formatId || "").trim() || FORMAT_SELECTOR;
    const forceFfmpeg = String(transport || "") === "ffmpeg";
    const needsFfmpegOutput = selectedFormat.includes("+") || forceFfmpeg;
    const processingArgs = [];
    if (forceFfmpeg) {
      processingArgs.push("--downloader", "m3u8:ffmpeg");
    }
    if (selectedFormat.includes("+")) {
      processingArgs.push("--merge-output-format", "mp4");
    }
    if (needsFfmpegOutput) {
      processingArgs.push(
        "--downloader-args",
        FFMPEG_INPUT_ARGS,
        "--downloader-args",
        outputPath === "-" ? FFMPEG_OUTPUT_ARGS : FFMPEG_FILE_OUTPUT_ARGS,
      );
    }
    return this.execYtDlp([
      ...YTDLP_COMMON_ARGS,
      ...strategy.args,
      "--quiet",
      "--no-warnings",
      "-f",
      selectedFormat,
      ...processingArgs,
      "-o",
      outputPath,
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
    const normalized = normalizeBotMediaUrl(candidate);
    if (normalized?.url) return normalized.url;
  }
  return "";
}

export async function getTelegramYouTubeOptions(env, userId, value) {
  const normalized = normalizeBotMediaUrl(value);
  if (!normalized?.url) throw new Error("Enter a valid YouTube or PornHub link");
  if (!env.VEXA_MEDIA) throw new Error(normalized.provider === "pornhub"
    ? "PornHub download is temporarily unavailable"
    : "YouTube download is temporarily unavailable");
  try {
    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(userId));
    const catalog = await container.getTelegramDownloadCatalog(normalized.url);
    if (!catalog.options?.length) {
      throw new Error("This download is too large for Telegram");
    }
    return { ...catalog, sourceUrl: normalized.url, provider: normalized.provider };
  } catch (error) {
    const message = publicMediaError(error, normalized.provider);
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
    stream = await container.streamVideo(
      prepared.sourceUrl,
      prepared.strategyId,
      selected.selector,
      selected.transport || "",
    );
    return {
      kind: selected.kind,
      title: prepared.title,
      label: selected.label,
      filename: selected.filename,
      mimeType: selected.mimeType,
      sizeBytes: selected.sizeBytes,
      width: selected.width,
      height: selected.height,
      duration: selected.duration,
      stream,
    };
  } catch (error) {
    const message = publicMediaError(error, prepared.provider);
    throw new Error(message);
  }
}

async function prepareDownload(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const normalized = normalizeBotMediaUrl(payload.url);
  if (!normalized?.url) return json({ error: "لینک ویدیو رو وارد کن" }, 400);
  const sourceUrl = normalized.url;

  const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(user.id));
  let metadata;
  try {
    metadata = await container.prepareVideo(sourceUrl);
  } catch (error) {
    console.error("Vexa media prepare failed", error?.stack || error);
    return json({ error: publicMediaError(error, normalized.provider) }, 502);
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
    title: metadata?.title || "Video",
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
  const normalized = normalizeBotMediaUrl(row.source_url);
  if (!normalized?.url) return json({ error: "Download source is invalid" }, 400);
  const sourceUrl = normalized.url;

  try {
    const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeContainerKey(row.user_id));
    const metadata = await container.prepareVideo(sourceUrl);
    const body = await container.streamVideo(
      sourceUrl,
      metadata.strategyId,
      metadata.formatId,
      metadata.transport || "",
      0,
    );
    return new Response(body, {
      status: 200,
      headers: downloadHeaders(),
    });
  } catch (error) {
    console.error("Vexa media container failed", error?.stack || error);
    return json({ error: publicMediaError(error, normalized.provider) }, 502);
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
  const provider = mediaProviderForStrategy(strategyId);
  const formats = Array.isArray(data?.formats) ? data.formats : [];
  const duration = positiveNumber(data?.duration);
  const telegramDuration = duration ? Math.max(1, Math.round(duration)) : 0;
  const fallbackTitle = provider === "pornhub" ? "PornHub video" : "YouTube video";
  const title = String(data?.title || fallbackTitle).trim() || fallbackTitle;

  const audioCandidates = formats
    .filter((format) => provider === "pornhub"
      ? isPornHubAudioOnlyFormat(format)
      : isHttpFormat(format) && isAudioOnlyM4a(format))
    .map((format) => ({
      format,
      size: formatSizeBytes(format, duration) || (provider === "pornhub" ? estimatedAudioSize(duration) : 0),
    }))
    .filter((item) => item.size > 0 && item.size <= TELEGRAM_SAFE_FILE_BYTES)
    .sort((a, b) => audioScore(b.format) - audioScore(a.format));
  const defaultAudio = audioCandidates[0] || null;

  const byHeight = new Map();
  for (const format of formats) {
    const supportedVideo = provider === "pornhub"
      ? isPornHubTelegramVideo(format)
      : isHttpFormat(format) && isTelegramMp4Video(format);
    if (!supportedVideo) continue;

    const height = positiveInteger(format?.height);
    const width = videoWidth(format, height);
    const formatId = String(format?.format_id || "").trim();
    if (!height || !formatId || height > 2160) continue;

    const hasAudio = provider === "pornhub"
      ? pornHubFormatHasAudio(format)
      : hasAudioCodec(format);
    if (provider !== "pornhub" && hasAudio && !isAacCodec(format?.acodec)) continue;

    const pairedAudio = hasAudio
      ? null
      : provider === "pornhub"
        ? selectPornHubAudio(format, audioCandidates)
        : defaultAudio;
    if (!hasAudio && !pairedAudio) continue;

    const videoSize = formatSizeBytes(format, duration);
    if (!videoSize) continue;
    const totalSize = hasAudio ? videoSize : videoSize + pairedAudio.size;
    if (totalSize > TELEGRAM_SAFE_FILE_BYTES) continue;

    const selector = hasAudio
      ? formatId
      : formatId + "+" + String(pairedAudio.format?.format_id || "");
    if (!selector || selector.endsWith("+")) continue;

    const transport = provider === "pornhub" && (
      isHlsFormat(format) || (!hasAudio && isHlsFormat(pairedAudio?.format))
    ) ? "ffmpeg" : "";
    const prefix = provider === "pornhub" ? "Vexa-PornHub-" : "Vexa-YouTube-";
    const option = {
      key: "v" + height,
      kind: "video",
      width,
      height,
      duration: telegramDuration,
      sizeBytes: totalSize,
      selector,
      transport,
      mimeType: "video/mp4",
      filename: prefix + height + "p.mp4",
      label: height + "p",
      score: provider === "pornhub" ? pornHubVideoScore(format) : videoScore(format),
    };
    const current = byHeight.get(height);
    if (!current || option.score > current.score) byHeight.set(height, option);
  }

  const options = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .slice(0, 7)
    .map(({ score, ...option }) => option);

  if (defaultAudio) {
    options.push({
      key: "a",
      kind: "audio",
      sizeBytes: defaultAudio.size,
      selector: String(defaultAudio.format.format_id),
      transport: provider === "pornhub" && isHlsFormat(defaultAudio.format) ? "ffmpeg" : "",
      mimeType: "audio/mp4",
      filename: provider === "pornhub" ? "Vexa-PornHub-audio.m4a" : "Vexa-YouTube-audio.m4a",
      label: "Audio only",
    });
  }

  return { title, strategyId, provider, options };
}

function isHttpFormat(format) {
  return String(format?.protocol || "").toLowerCase().startsWith("http");
}

function isHlsFormat(format) {
  return String(format?.protocol || "").toLowerCase().startsWith("m3u8");
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

function isPornHubAudioOnlyFormat(format) {
  const ext = String(format?.ext || "").toLowerCase();
  const protocol = String(format?.protocol || "").toLowerCase();
  const vcodec = String(format?.vcodec || "").toLowerCase();
  const resolution = String(format?.resolution || "").toLowerCase();
  const audioOnly = vcodec === "none" || resolution === "audio only";
  if (!audioOnly || (ext !== "mp4" && ext !== "m4a")) return false;
  if (!(protocol.startsWith("http") || protocol.startsWith("m3u8"))) return false;
  const acodec = String(format?.acodec || "").toLowerCase();
  return acodec !== "none";
}

function isPornHubTelegramVideo(format) {
  if (format?.has_drm) return false;
  const ext = String(format?.ext || "").toLowerCase();
  const protocol = String(format?.protocol || "").toLowerCase();
  const vcodec = String(format?.vcodec || "").toLowerCase();
  const acodec = String(format?.acodec || "").toLowerCase();
  if (ext !== "mp4" || !(protocol.startsWith("http") || protocol.startsWith("m3u8"))) return false;
  if (!positiveInteger(format?.height) || vcodec === "none") return false;
  if (vcodec && vcodec !== "unknown" && !vcodec.startsWith("avc1") && !vcodec.includes("h264")) return false;
  if (acodec && acodec !== "none" && acodec !== "unknown" && !isAacCodec(acodec)) return false;
  return true;
}

function pornHubFormatHasAudio(format) {
  const acodec = String(format?.acodec || "").toLowerCase();
  if (acodec === "none") return false;
  if (acodec) return true;
  return isHttpFormat(format);
}

function selectPornHubAudio(videoFormat, audioCandidates) {
  if (!audioCandidates.length) return null;
  const videoId = String(videoFormat?.format_id || "");
  const suffix = videoId.match(/-(\d+)$/)?.[1] || "";
  if (suffix) {
    const paired = audioCandidates.find((item) =>
      String(item.format?.format_id || "").endsWith("-" + suffix));
    if (paired) return paired;
  }
  const language = String(videoFormat?.language || "").toLowerCase();
  if (language) {
    const sameLanguage = audioCandidates.find((item) =>
      String(item.format?.language || "").toLowerCase() === language);
    if (sameLanguage) return sameLanguage;
  }
  return audioCandidates[0];
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

function estimatedAudioSize(duration) {
  if (!duration) return 0;
  return Math.ceil(256 * 125 * duration * 1.05);
}

function videoWidth(format, height) {
  let width = positiveInteger(format?.width);
  if (!width) {
    const match = String(format?.resolution || "").trim().match(/^(\d+)\s*x\s*(\d+)$/i);
    if (match && (!height || positiveInteger(match[2]) === height)) {
      width = positiveInteger(match[1]);
    }
  }
  if (!width && height) {
    const ratio = positiveNumber(format?.aspect_ratio);
    if (ratio) width = Math.max(1, Math.round(height * ratio));
  }
  return width;
}

function audioScore(format) {
  return (positiveNumber(format?.abr) || positiveNumber(format?.tbr) || 0) * 100 +
    (positiveNumber(format?.asr) || 0) / 1000;
}

function videoScore(format) {
  return (positiveNumber(format?.fps) || 0) * 1000 +
    (positiveNumber(format?.tbr) || positiveNumber(format?.vbr) || 0);
}

function pornHubVideoScore(format) {
  const hlsPreference = isHlsFormat(format) ? 1_000_000_000 : 0;
  const knownCodecs = String(format?.vcodec || "").toLowerCase() !== "unknown" ? 10_000_000 : 0;
  return hlsPreference + knownCodecs + videoScore(format);
}

function clientStrategy(strategyId) {
  const id = String(strategyId || "");
  if (id === PORNHUB_STRATEGY.id) return PORNHUB_STRATEGY;
  return CLIENT_STRATEGIES.find((strategy) => strategy.id === id) || null;
}

function mediaStrategies(value) {
  return normalizePornHubUrl(value) ? [PORNHUB_STRATEGY] : CLIENT_STRATEGIES;
}

function mediaProviderForStrategy(strategyId) {
  return String(strategyId || "") === PORNHUB_STRATEGY.id ? "pornhub" : "youtube";
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

function stopProcessNow(process, reader, reason) {
  try { process.kill(9); } catch (error) {}
  try {
    const cancelled = reader?.cancel?.(reason);
    cancelled?.catch?.(() => null);
  } catch (error) {}
}

async function settleWithin(promise, timeoutMs, fallback) {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
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
  const detail = String(stderr || "").trim();
  return detail || "yt-dlp exited with code " + String(exitCode);
}

export function normalizeBotMediaUrl(value) {
  const youtube = normalizeYouTubeUrl(value);
  if (youtube) return { url: youtube, provider: "youtube" };
  const pornhub = normalizePornHubUrl(value);
  if (pornhub) return { url: pornhub, provider: "pornhub" };
  return null;
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

function normalizePornHubUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  const host = url.hostname.toLowerCase();
  const allowedHost = PORNHUB_HOST_SUFFIXES.some((suffix) =>
    host === suffix || host.endsWith("." + suffix));
  if (!allowedHost) return "";

  const path = url.pathname.replace(/\/+$/u, "") || "/";
  if (path === "/view_video.php" || path === "/video/show") {
    const viewkey = String(url.searchParams.get("viewkey") || "").trim();
    if (!/^[A-Za-z0-9]+$/u.test(viewkey)) return "";
    url.search = "";
    url.searchParams.set("viewkey", viewkey);
  } else {
    const embed = path.match(/^\/embed\/([A-Za-z0-9]+)$/u);
    if (!embed) return "";
    url.pathname = "/embed/" + embed[1];
    url.search = "";
  }
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

function publicContainerError(detail, provider = "youtube") {
  const raw = String(detail || "");
  if (provider === "pornhub") {
    if (/geo.?restricted|unavailable in your country|not available in your country/i.test(raw)) {
      return new Error("This PornHub video is not available from the server region");
    }
    if (/403|forbidden|410|gone|http error 412/i.test(raw)) {
      return new Error("PornHub blocked the Cloudflare download request");
    }
    if (/sign in|log ?in|private|premium|locked|redirection detected|requires? (?:an? )?(?:account|login)/i.test(raw)) {
      return new Error("This PornHub video requires additional access");
    }
    if (/removed|deleted|disabled|unavailable|not available|video unavailable/i.test(raw)) {
      return new Error("This PornHub video is unavailable");
    }
    if (/requested format is not available|no video formats found|no formats/i.test(raw)) {
      return new Error("PornHub did not expose a downloadable video format");
    }
    if (/empty stream/i.test(raw)) {
      return new Error("PornHub returned an empty video stream");
    }
    console.error("Unclassified PornHub yt-dlp error", raw.slice(-4000));
    return new Error("PornHub could not prepare this video");
  }

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
  "Enter a valid YouTube or PornHub link",
  "لینک ویدیو رو وارد کن",
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
  "This PornHub video is not available from the server region",
  "PornHub blocked the Cloudflare download request",
  "This PornHub video requires additional access",
  "This PornHub video is unavailable",
  "PornHub did not expose a downloadable video format",
  "PornHub returned an empty video stream",
  "PornHub returned an invalid MP4 stream",
  "PornHub stream did not start in time",
  "PornHub metadata was invalid",
  "PornHub could not prepare this video",
  "PornHub download is temporarily unavailable",
]);

function publicMediaError(error, provider = "youtube") {
  const message = String(error?.message || "");
  if (PUBLIC_MEDIA_ERRORS.has(message)) return message;
  return provider === "pornhub"
    ? "PornHub download is temporarily unavailable"
    : "YouTube download is temporarily unavailable";
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