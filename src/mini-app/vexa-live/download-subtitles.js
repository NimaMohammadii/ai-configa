import { getContainer } from "@cloudflare/containers";
import { getElevenApiSetting } from "../../admin.js";
import { VexaSubtitleContainer as BaseVexaSubtitleContainer } from "./youtube-live-subtitles.js";

const YOUTUBE_SESSION_PATH = "/mini-app/live/api/youtube-download/session";
const YOUTUBE_DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";
const INSTAGRAM_SESSION_PATH = "/mini-app/live/api/instagram/session";
const INSTAGRAM_DOWNLOAD_PATH = "/mini-app/live/api/instagram/download";
const INSTAGRAM_STORY_SESSION_PATH = "/mini-app/live/api/instagram-story/session";
const INSTAGRAM_STORY_DOWNLOAD_PATH = "/mini-app/live/api/instagram-story/download";
const SOURCE_PATH = "/mini-app/live/api/download-subtitles/source";
const SUBTITLE_COOKIE = "vexa_download_subtitle";
const SOURCE_PREFIX = "vexa-subtitle-source/";
const SOURCE_TTL_SECONDS = 2 * 60 * 60;
const TRANSCRIBE_TIMEOUT_MS = 15 * 60 * 1000;
const TRANSLATE_TIMEOUT_MS = 60 * 1000;
const TRANSLATION_MODEL = "gpt-5.6-terra";
const TRANSLATION_BATCH_SIZE = 20;
const STREAM_PROGRESS_BYTES = 2 * 1024 * 1024;
const STREAM_PROGRESS_MS = 750;
const R2_MULTIPART_PART_BYTES = 8 * 1024 * 1024;
const STAGING_PROGRESS_END = 25;
const TRANSCRIBE_PROGRESS_END = 40;
const TRANSLATE_PROGRESS_END = 55;
const RENDER_PROGRESS_END = 95;

const SUBTITLE_LANGUAGES = Object.freeze({
  original: "Original",
  en: "English",
  fa: "Persian",
  ru: "Russian",
  de: "German",
  tr: "Turkish",
  es: "Spanish",
  ar: "Arabic",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
});

const LANGUAGE_ALIASES = Object.freeze({
  eng: "en", en: "en",
  fas: "fa", per: "fa", pes: "fa", fa: "fa",
  rus: "ru", ru: "ru",
  deu: "de", ger: "de", de: "de",
  tur: "tr", tr: "tr",
  spa: "es", es: "es",
  ara: "ar", ar: "ar",
  fra: "fr", fre: "fr", fr: "fr",
  por: "pt", pt: "pt",
  ita: "it", it: "it",
  hin: "hi", hi: "hi",
  zho: "zh", cmn: "zh", yue: "zh", zh: "zh",
  jpn: "ja", ja: "ja",
  kor: "ko", ko: "ko",
});

export class VexaSubtitleContainer extends BaseVexaSubtitleContainer {
  activeSubtitleProcesses = new Set();

  async onActivityExpired() {
    if (this.activeSubtitleProcesses.size) {
      try { this.renewActivityTimeout(); } catch {}
      return;
    }
    return super.onActivityExpired();
  }

  trackSubtitleProcess(process) {
    if (!process) return process;
    this.activeSubtitleProcesses.add(process);
    process.exitCode.catch(() => -1).finally(() => this.activeSubtitleProcesses.delete(process));
    return process;
  }

  async renderSubtitledVideo(mediaUrl, assText, language, durationHint = 0, onProgress = null) {
    await this.ensureAudioReady();
    const source = String(mediaUrl || "").trim();
    const subtitles = String(assText || "");
    if (!/^https:\/\//i.test(source)) throw new Error("Subtitle video source is invalid");
    if (!subtitles || subtitles.length > 2_000_000) throw new Error("Subtitle track is invalid");

    const id = crypto.randomUUID();
    const assPath = "/tmp/vexa-download-subtitles-" + id + ".ass";
    const outputPath = "/tmp/vexa-download-subtitled-" + id + ".mp4";
    try {
      await this.writeUtf8File(assPath, subtitles);
      const durationSeconds = await this.readMediaDuration(source).catch(() => positiveNumber(durationHint));
      await emitSubtitleProgress(onProgress, { phase: "rendering", percent: 0, durationSeconds });
      const filter = "ass=" + assPath;
      const process = this.trackSubtitleProcess(await this.ctx.container.exec([
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostats",
        "-stats_period",
        "0.5",
        "-progress",
        "pipe:1",
        "-y",
        "-rw_timeout",
        "30000000",
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath,
      ]));
      const progressPromise = collectSubtitleFfmpegProgress(process.stdout, durationSeconds, onProgress);
      const stderrPromise = collectProcessText(process.stderr, 16_384);
      const exitCode = await process.exitCode.catch(() => -1);
      const detail = await stderrPromise;
      await progressPromise;
      if (exitCode !== 0) {
        if (detail) console.error("Vexa subtitle burn-in failed", detail.slice(-5000));
        throw new Error("Could not render subtitles into this video");
      }
      await emitSubtitleProgress(onProgress, { phase: "rendering", percent: 100, durationSeconds });

      const sizeBytes = await this.readRenderedSize(outputPath);
      const streamProcess = this.trackSubtitleProcess(await this.ctx.container.exec([
        "sh",
        "-c",
        'exec 3<"$1" || exit 1; rm -f "$1" "$2"; cat <&3',
        "vexa-subtitle-stream",
        outputPath,
        assPath,
      ]));
      if (!streamProcess.stdout) throw new Error("Could not open subtitled video");
      return { stream: this.streamTrackedProcess(streamProcess), sizeBytes };
    } catch (error) {
      await this.removeSubtitleFiles(assPath, outputPath);
      throw error;
    }
  }

  streamTrackedProcess(process) {
    const source = process?.stdout;
    if (!source) throw new Error("Could not open subtitled video");
    const reader = source.getReader();
    let closed = false;
    const stop = async reason => {
      if (closed) return;
      closed = true;
      try { await reader.cancel(reason); } catch {}
      try { process.kill(); } catch {}
      this.activeSubtitleProcesses.delete(process);
    };
    return new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            closed = true;
            controller.close();
            return;
          }
          if (next.value?.byteLength) controller.enqueue(next.value);
        } catch (error) {
          await stop(error);
          controller.error(error);
        }
      },
      cancel: stop,
    });
  }

  async writeUtf8File(path, text) {
    const clear = await this.ctx.container.exec(["rm", "-f", path]);
    await clear.output().catch(() => null);
    for (let offset = 0; offset < text.length; offset += 12000) {
      const chunk = text.slice(offset, offset + 12000);
      const process = await this.ctx.container.exec([
        "python",
        "-c",
        "import sys; open(sys.argv[1], 'ab').write(sys.argv[2].encode('utf-8'))",
        path,
        chunk,
      ]);
      const output = await process.output();
      if (output.exitCode !== 0) throw new Error("Could not prepare subtitle track");
    }
  }

  async readMediaDuration(source) {
    const process = await this.ctx.container.exec([
      "ffprobe",
      "-v",
      "error",
      "-rw_timeout",
      "30000000",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      source,
    ]);
    const output = await process.output();
    const duration = Number.parseFloat(new TextDecoder().decode(output.stdout).trim());
    if (output.exitCode !== 0 || !Number.isFinite(duration) || duration <= 0) {
      throw new Error("Could not read video duration");
    }
    return duration;
  }

  async readRenderedSize(path) {
    const process = await this.ctx.container.exec(["sh", "-c", 'wc -c < "$1"', "vexa-subtitle-size", path]);
    const output = await process.output();
    const size = Number.parseInt(new TextDecoder().decode(output.stdout).trim(), 10);
    if (output.exitCode !== 0 || !Number.isSafeInteger(size) || size <= 0) throw new Error("Subtitled video is empty");
    return size;
  }

  async removeSubtitleFiles(...paths) {
    try {
      const process = await this.ctx.container.exec(["rm", "-f", ...paths.filter(Boolean)]);
      await process.output().catch(() => null);
    } catch {}
  }
}

export function isDownloadSubtitlesRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === SOURCE_PATH) return request.method === "GET" || request.method === "HEAD";
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (url.pathname !== YOUTUBE_DOWNLOAD_PATH && url.pathname !== INSTAGRAM_DOWNLOAD_PATH && url.pathname !== INSTAGRAM_STORY_DOWNLOAD_PATH) return false;
  return Boolean(normalizeSubtitleLanguage(url.searchParams.get("subtitle")));
}

export async function handleDownloadSubtitlesRequest(request, env, ctx, delegates) {
  const url = new URL(request.url);
  if (url.pathname === SOURCE_PATH) return serveSubtitleSource(request, env);

  const provider = url.pathname === INSTAGRAM_STORY_DOWNLOAD_PATH
    ? "story"
    : url.pathname === INSTAGRAM_DOWNLOAD_PATH
      ? "instagram"
      : "youtube";
  const language = normalizeSubtitleLanguage(url.searchParams.get("subtitle"));
  if (!language) return null;
  const delegate = provider === "story" ? delegates?.story : provider === "instagram" ? delegates?.instagram : delegates?.youtube;
  if (typeof delegate !== "function") return json({ error: "Download handler is unavailable" }, 503);

  if (request.method === "HEAD") {
    const rawUrl = new URL(request.url);
    rawUrl.searchParams.delete("subtitle");
    const response = await delegate(new Request(rawUrl.href, { method: "HEAD", headers: request.headers }), env, ctx);
    if (!response?.ok) return response;
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }

  return renderDownloadWithSubtitles(request, env, ctx, provider, language, delegate);
}

export async function rewriteDownloadSessionResponseWithSubtitles(request, response) {
  if (!response?.ok || request.method !== "POST") return response;
  const path = new URL(request.url).pathname;
  if (path !== YOUTUBE_SESSION_PATH && path !== INSTAGRAM_SESSION_PATH && path !== INSTAGRAM_STORY_SESSION_PATH) return response;
  const language = subtitleLanguageFromCookie(request.headers.get("Cookie"));
  if (!language) return response;

  const data = await response.clone().json().catch(() => null);
  if (!data || !data.downloadUrl || String(data.optionKey || "") === "a" || data.live === true) return response;
  const downloadUrl = new URL(String(data.downloadUrl), request.url);
  downloadUrl.searchParams.set("subtitle", language);
  data.downloadUrl = downloadUrl.pathname + downloadUrl.search;
  return cloneJsonResponse(response, data);
}

async function renderDownloadWithSubtitles(request, env, ctx, provider, language, delegate) {
  if (!env.EXPLORE_MEDIA || !env.VEXA_SUBTITLES) return json({ error: "Subtitle rendering is unavailable" }, 503);
  const requestUrl = new URL(request.url);
  const session = cleanToken(requestUrl.searchParams.get("session"));
  if (!session) return json({ error: "Download session is invalid" }, 400);

  const validationUrl = new URL(request.url);
  validationUrl.searchParams.delete("subtitle");
  const validation = await delegate(new Request(validationUrl.href, { method: "HEAD", headers: request.headers }), env, ctx);
  if (!validation?.ok) return validation;
  const expectedSourceBytes = positiveInteger(validation.headers.get("Content-Length"));

  await setSubtitleProgress(env, provider, session, expectedSourceBytes, 0, "staging", "", 0).catch(() => null);
  ctx?.waitUntil?.(cleanupExpiredSubtitleSources(env));

  let sourceKey = "";
  let tempSession = "";
  try {
    tempSession = await cloneDownloadSession(env, provider, session);
    if (!tempSession) throw new Error("Could not prepare subtitle source");

    const rawUrl = new URL(validationUrl.href);
    rawUrl.searchParams.set("session", tempSession);
    const rawResponse = await delegate(new Request(rawUrl.href, { method: "GET", headers: request.headers }), env, ctx);
    if (!rawResponse?.ok || !rawResponse.body) {
      const detail = await rawResponse?.text?.().catch(() => "");
      throw new Error(detail || "Could not read subtitle source video");
    }

    const sourceToken = makeSourceToken();
    sourceKey = SOURCE_PREFIX + sourceToken + ".mp4";
    const expiresAt = Math.floor(Date.now() / 1000) + SOURCE_TTL_SECONDS;
    const staged = await stageSubtitleSource(
      env.EXPLORE_MEDIA,
      sourceKey,
      rawResponse.body,
      expiresAt,
      expectedSourceBytes,
      async (fraction, bytes) => {
        const percent = STAGING_PROGRESS_END * clamp01(fraction);
        await setSubtitleProgress(env, provider, session, expectedSourceBytes, bytes, "staging", "", percent).catch(() => null);
      },
    );
    if (!staged) throw new Error("Could not stage subtitle source video");
    const actualSourceBytes = positiveInteger(staged.size) || expectedSourceBytes;
    await setSubtitleProgress(env, provider, session, actualSourceBytes, actualSourceBytes, "transcribing", "", STAGING_PROGRESS_END).catch(() => null);
    await deleteDownloadSession(env, provider, tempSession).catch(() => null);
    tempSession = "";

    const sourceUrl = new URL(SOURCE_PATH, request.url);
    sourceUrl.searchParams.set("token", sourceToken);
    const subtitle = await createDownloadSubtitleAss(env, sourceUrl.href, language, async event => {
      const phase = String(event?.phase || "");
      const fraction = clamp01(event?.fraction);
      if (phase === "transcribing") {
        const percent = STAGING_PROGRESS_END + (TRANSCRIBE_PROGRESS_END - STAGING_PROGRESS_END) * fraction;
        await setSubtitleProgress(env, provider, session, actualSourceBytes, 0, "transcribing", "", percent).catch(() => null);
      } else if (phase === "translating") {
        const percent = TRANSCRIBE_PROGRESS_END + (TRANSLATE_PROGRESS_END - TRANSCRIBE_PROGRESS_END) * fraction;
        await setSubtitleProgress(env, provider, session, actualSourceBytes, 0, "translating", "", percent).catch(() => null);
      } else if (phase === "translation_skipped") {
        await setSubtitleProgress(env, provider, session, actualSourceBytes, 0, "rendering", "", TRANSLATE_PROGRESS_END).catch(() => null);
      }
    });

    await setSubtitleProgress(env, provider, session, actualSourceBytes, 0, "rendering", "", TRANSLATE_PROGRESS_END).catch(() => null);
    const container = getContainer(env.VEXA_SUBTITLES, "subtitle-download-" + safeContainerKey(session));
    const rendered = await container.renderSubtitledVideo(
      sourceUrl.href,
      subtitle.assText,
      subtitle.fontLanguage,
      subtitle.durationSeconds,
      async event => {
        const fraction = clamp01(Number(event?.percent || 0) / 100);
        const percent = TRANSLATE_PROGRESS_END + (RENDER_PROGRESS_END - TRANSLATE_PROGRESS_END) * fraction;
        await setSubtitleProgress(env, provider, session, actualSourceBytes, 0, "rendering", "", percent).catch(() => null);
      },
    );
    const sizeBytes = positiveInteger(rendered?.sizeBytes);
    const sourceStream = rendered?.stream || null;
    if (!sourceStream || !sizeBytes) throw new Error("Subtitled video could not be finalized");

    await env.EXPLORE_MEDIA.delete(sourceKey).catch(() => null);
    sourceKey = "";
    await setSubtitleProgress(env, provider, session, sizeBytes, 0, "finalizing", "", RENDER_PROGRESS_END).catch(() => null);

    const headers = new Headers(validation.headers);
    headers.delete("Content-Length");
    headers.set("Content-Type", "video/mp4");
    headers.set("Cache-Control", "private, no-store");
    return trackedSubtitleResponse(sourceStream, sizeBytes, headers, env, ctx, provider, session);
  } catch (error) {
    console.error("Vexa download subtitles failed", error?.stack || error);
    const message = publicSubtitleError(error);
    await setSubtitleProgress(env, provider, session, 0, 0, "failed", message).catch(() => null);
    return json({ error: message }, 502);
  } finally {
    if (tempSession) await deleteDownloadSession(env, provider, tempSession).catch(() => null);
    if (sourceKey) await env.EXPLORE_MEDIA.delete(sourceKey).catch(() => null);
  }
}

async function stageSubtitleSource(bucket, key, stream, expiresAt, expectedBytes = 0, onProgress = null) {
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: "video/mp4", cacheControl: "private, no-store" },
    customMetadata: { vexaSubtitleSource: "1", expiresAt: String(expiresAt) },
  });
  const reader = stream.getReader();
  const parts = [];
  let buffer = new Uint8Array(R2_MULTIPART_PART_BYTES);
  let buffered = 0;
  let partNumber = 1;
  let totalBytes = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();

  const report = async force => {
    if (typeof onProgress !== "function") return;
    const now = Date.now();
    if (!force && totalBytes - lastReportedBytes < STREAM_PROGRESS_BYTES && now - lastReportedAt < STREAM_PROGRESS_MS) return;
    lastReportedBytes = totalBytes;
    lastReportedAt = now;
    const expected = positiveInteger(expectedBytes);
    await onProgress(expected ? Math.min(1, totalBytes / expected) : 0, totalBytes);
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const length = Math.min(R2_MULTIPART_PART_BYTES - buffered, chunk.byteLength - offset);
        buffer.set(chunk.subarray(offset, offset + length), buffered);
        buffered += length;
        offset += length;
        totalBytes += length;

        if (buffered === R2_MULTIPART_PART_BYTES) {
          parts.push(await upload.uploadPart(partNumber, buffer));
          partNumber += 1;
          buffer = new Uint8Array(R2_MULTIPART_PART_BYTES);
          buffered = 0;
        }
      }
      await report(false);
    }

    if (!parts.length && !buffered) throw new Error("Subtitle source video was empty");
    if (buffered) {
      parts.push(await upload.uploadPart(partNumber, buffer.slice(0, buffered)));
    }

    const object = await upload.complete(parts);
    if (!object || positiveInteger(object.size) !== totalBytes) {
      throw new Error("Subtitle source staging ended before the expected file size");
    }
    await report(true);
    if (typeof onProgress === "function") await onProgress(1, totalBytes);
    return object;
  } catch (error) {
    try { await reader.cancel(error); } catch {}
    try { await upload.abort(); } catch {}
    console.error("Vexa subtitle source multipart staging failed", error?.stack || error);
    if (/subtitle source/i.test(String(error?.message || ""))) throw error;
    throw new Error("Could not stage subtitle source video");
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function createDownloadSubtitleAss(env, sourceUrl, targetLanguage, onProgress = null) {
  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw new Error("Speech-to-text is unavailable");
  await emitSubtitleProgress(onProgress, { phase: "transcribing", fraction: 0 });

  const form = new FormData();
  form.append("source_url", sourceUrl);
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  form.append("no_verbatim", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  let transcript;
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: controller.signal,
    });
    transcript = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Vexa download Scribe failed", response.status, JSON.stringify(transcript).slice(0, 1200));
      throw new Error("Could not create subtitles for this video");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Subtitle transcription timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }

  let cues = subtitleCuesFromWords(transcript?.words);
  if (!cues.length) throw new Error("No speech was found for subtitles");
  await emitSubtitleProgress(onProgress, { phase: "transcribing", fraction: 1 });

  const detectedLanguage = normalizeDetectedLanguage(transcript?.language_code);
  if (targetLanguage !== "original" && targetLanguage !== detectedLanguage) {
    await emitSubtitleProgress(onProgress, { phase: "translating", fraction: 0 });
    cues = await translateSubtitleCues(env, cues, targetLanguage, async fraction => {
      await emitSubtitleProgress(onProgress, { phase: "translating", fraction });
    });
  } else {
    await emitSubtitleProgress(onProgress, { phase: "translation_skipped", fraction: 1 });
  }
  const fontLanguage = targetLanguage === "original" ? (detectedLanguage || "en") : targetLanguage;
  const durationSeconds = cues.reduce((max, cue) => Math.max(max, Number(cue?.end || 0)), 0);
  return { assText: buildAss(cues, fontLanguage), fontLanguage, durationSeconds };
}

function subtitleCuesFromWords(value) {
  const words = Array.isArray(value) ? value : [];
  const cues = [];
  let current = [];
  let start = 0;
  let end = 0;

  const flush = () => {
    if (!current.length) return;
    const text = cleanSubtitleText(current.map((item) => item.text).join(" "));
    if (text && end > start) cues.push({ start, end: Math.max(start + 0.35, end), text });
    current = [];
    start = 0;
    end = 0;
  };

  for (const item of words) {
    const text = String(item?.text || "").trim();
    const wordStart = Number(item?.start);
    const wordEnd = Number(item?.end);
    const type = String(item?.type || "word");
    if (!text || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd) || wordEnd < wordStart || type === "audio_event") continue;
    if (current.length && wordStart - end > 1.1) flush();
    if (!current.length) start = Math.max(0, wordStart);
    current.push({ text, start: wordStart, end: wordEnd });
    end = Math.max(end, wordEnd);

    const merged = cleanSubtitleText(current.map((word) => word.text).join(" "));
    const sentenceEnd = /[.!?…。！？؟]$/u.test(text);
    const span = end - start;
    if ((sentenceEnd && current.length >= 4 && span >= 1.1) || current.length >= 13 || span >= 5.2 || Array.from(merged).length >= 82) flush();
  }
  flush();
  return cues.filter((cue) => cue.text && cue.end > cue.start);
}

async function translateSubtitleCues(env, cues, targetLanguage, onProgress = null) {
  if (!env.GPT_API) throw new Error("AI translation is unavailable");
  const languageName = SUBTITLE_LANGUAGES[targetLanguage];
  if (!languageName) throw new Error("Subtitle language is invalid");
  const translated = [];
  for (let offset = 0; offset < cues.length; offset += TRANSLATION_BATCH_SIZE) {
    const chunk = cues.slice(offset, offset + TRANSLATION_BATCH_SIZE);
    const texts = await translateTextChunk(env, chunk.map((cue) => cue.text), languageName);
    for (let index = 0; index < chunk.length; index += 1) {
      translated.push({ ...chunk[index], text: cleanSubtitleText(texts[index]) });
    }
    if (typeof onProgress === "function") {
      await onProgress(Math.min(1, (offset + chunk.length) / Math.max(1, cues.length)));
    }
  }
  return translated;
}

async function translateTextChunk(env, texts, languageName) {
  try {
    return await requestTranslationChunk(env, texts, languageName);
  } catch (error) {
    if (texts.length <= 1) throw error;
    const middle = Math.ceil(texts.length / 2);
    const left = await translateTextChunk(env, texts.slice(0, middle), languageName);
    const right = await translateTextChunk(env, texts.slice(middle), languageName);
    return left.concat(right);
  }
}

async function requestTranslationChunk(env, texts, languageName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.GPT_API, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        instructions:
          "Translate each video subtitle into " + languageName + ". Preserve meaning, names, numbers and tone. " +
          "Keep every item concise and natural for at most two subtitle lines. Preserve the exact number and order of items.",
        input: JSON.stringify({ subtitles: texts }),
        reasoning: { effort: "none" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "subtitle_translations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                translations: { type: "array", items: { type: "string" } },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: Math.max(500, Math.min(7000, texts.join(" ").length * 2)),
        store: false,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Vexa subtitle batch translation failed", response.status, JSON.stringify(data).slice(0, 1200));
      throw new Error("AI subtitle translation failed");
    }
    const parsed = parseJsonObject(responseOutputText(data));
    const translations = Array.isArray(parsed?.translations) ? parsed.translations : [];
    if (translations.length !== texts.length || translations.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error("AI subtitle translation returned invalid output");
    }
    return translations.map(cleanSubtitleText);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Subtitle translation timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function responseOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("").trim();
}

function parseJsonObject(value) {
  const text = String(value || "").trim();
  try { return JSON.parse(text); } catch { return null; }
}

function buildAss(cues, language) {
  const font = subtitleFont(language);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Default," + font.name + ",48,&H00FFFFFF,&H00FFFFFF,&H00101010,&H78000000,-1,0,0,0,100,100,0,0,1,3.2,1.2,2,90,90,58,1",
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];
  const events = cues.map((cue) =>
    "Dialogue: 0," + assTime(cue.start) + "," + assTime(cue.end) + ",Default,,0,0,0,," + assEscape(wrapSubtitleText(cue.text))
  );
  return header.concat(events).join("\n") + "\n";
}

function subtitleFont(language) {
  const key = normalizeDetectedLanguage(language) || String(language || "en").toLowerCase();
  if (key === "fa" || key === "ar") return { name: "Noto Sans Arabic" };
  if (key === "hi") return { name: "Noto Sans Devanagari" };
  if (key === "zh") return { name: "Noto Sans CJK SC" };
  if (key === "ja") return { name: "Noto Sans CJK JP" };
  if (key === "ko") return { name: "Noto Sans CJK KR" };
  return { name: "Noto Sans" };
}

function wrapSubtitleText(value) {
  const text = cleanSubtitleText(value);
  if (Array.from(text).length <= 46) return text;
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length < 2) {
    const chars = Array.from(text);
    const middle = Math.ceil(chars.length / 2);
    return chars.slice(0, middle).join("") + "\n" + chars.slice(middle).join("");
  }
  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const score = Math.abs(Array.from(left).length - Array.from(right).length) +
      Math.max(0, Array.from(left).length - 54) * 4 + Math.max(0, Array.from(right).length - 54) * 4;
    if (score < bestScore) { bestScore = score; bestIndex = index; }
  }
  return words.slice(0, bestIndex).join(" ") + "\n" + words.slice(bestIndex).join(" ");
}

function assEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function assTime(value) {
  const total = Math.max(0, Number(value || 0));
  const centiseconds = Math.round(total * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(cs).padStart(2, "0");
}

async function selectedElevenApiKey(env) {
  const name = await getElevenApiSetting(env);
  return String(env[name] || "").trim();
}

async function cloneDownloadSession(env, provider, session) {
  const tempSession = randomToken();
  const now = Math.floor(Date.now() / 1000);
  let result;
  if (provider === "story") {
    result = await env.DB.prepare(
      "INSERT INTO vexa_instagram_story_progress " +
      "(session, download_token, user_id, source_url, format_id, playlist_index, option_key, file_name, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
      "SELECT ?, download_token, user_id, source_url, format_id, playlist_index, option_key, file_name, total_bytes, 0, 'ready', NULL, ?, ?, expires_at " +
      "FROM vexa_instagram_story_progress WHERE session = ?"
    ).bind(tempSession, now, now, session).run();
  } else if (provider === "instagram") {
    result = await env.DB.prepare(
      "INSERT INTO vexa_instagram_download_progress " +
      "(session, download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
      "SELECT ?, download_token, user_id, source_url, format_id, option_key, file_name, total_bytes, 0, 'ready', NULL, ?, ?, expires_at " +
      "FROM vexa_instagram_download_progress WHERE session = ?"
    ).bind(tempSession, now, now, session).run();
  } else {
    result = await env.DB.prepare(
      "INSERT INTO vexa_youtube_download_progress " +
      "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at, source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key) " +
      "SELECT ?, playback_token, user_id, total_bytes, 0, 'ready', NULL, ?, ?, expires_at, source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key " +
      "FROM vexa_youtube_download_progress WHERE session = ?"
    ).bind(tempSession, now, now, session).run();
  }
  return Number(result?.meta?.changes || 0) > 0 ? tempSession : "";
}

async function deleteDownloadSession(env, provider, session) {
  const table = provider === "story"
    ? "vexa_instagram_story_progress"
    : provider === "instagram"
      ? "vexa_instagram_download_progress"
      : "vexa_youtube_download_progress";
  await env.DB.prepare("DELETE FROM " + table + " WHERE session = ?").bind(session).run();
}

function trackedSubtitleResponse(sourceStream, sizeBytes, headers, env, ctx, provider, session) {
  const reader = sourceStream.getReader();
  let downloaded = 0;
  let lastBytes = 0;
  let lastAt = Date.now();
  let finished = false;
  let progressChain = Promise.resolve();

  const enqueueProgress = bytes => {
    const fraction = Math.max(0, Math.min(1, bytes / Math.max(1, sizeBytes)));
    const percent = RENDER_PROGRESS_END + (100 - RENDER_PROGRESS_END) * fraction;
    progressChain = progressChain
      .then(() => setSubtitleProgress(env, provider, session, sizeBytes, bytes, "finalizing", "", percent))
      .catch(() => null);
    ctx?.waitUntil?.(progressChain);
  };

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (finished) return;
          finished = true;
          await progressChain.catch(() => null);
          if (downloaded !== sizeBytes) {
            const message = "Subtitled video ended before the expected file size";
            await setSubtitleProgress(env, provider, session, sizeBytes, downloaded, "failed", message).catch(() => null);
            controller.error(new Error(message));
            return;
          }
          await setSubtitleProgress(env, provider, session, sizeBytes, sizeBytes, "completed", "", 100).catch(() => null);
          controller.close();
          return;
        }
        if (!next.value?.byteLength) return;
        downloaded += next.value.byteLength;
        const now = Date.now();
        if (downloaded - lastBytes >= STREAM_PROGRESS_BYTES || now - lastAt >= STREAM_PROGRESS_MS) {
          lastBytes = downloaded;
          lastAt = now;
          enqueueProgress(downloaded);
        }
        controller.enqueue(next.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          await progressChain.catch(() => null);
          await setSubtitleProgress(env, provider, session, sizeBytes, downloaded, "failed", publicSubtitleError(error)).catch(() => null);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch {}
      if (!finished) {
        finished = true;
        await progressChain.catch(() => null);
        await setSubtitleProgress(env, provider, session, sizeBytes, downloaded, "cancelled", "Download was cancelled").catch(() => null);
      }
    },
  });

  const fixed = new FixedLengthStream(sizeBytes);
  const pipe = body.pipeTo(fixed.writable);
  ctx?.waitUntil?.(pipe.catch((error) => console.error("Vexa subtitled fixed stream failed", error?.stack || error)));
  return new Response(fixed.readable, { status: 200, headers });
}

async function setSubtitleProgress(env, provider, session, totalBytes, downloadedBytes, status, error, percentOverride = null) {
  const requestedTotal = positiveInteger(totalBytes);
  const actualDone = Math.max(0, Number(downloadedBytes || 0));
  const state = String(status || "ready");
  const message = error ? String(error).slice(0, 500) : "";
  const now = Math.floor(Date.now() / 1000);
  const table = provider === "story"
    ? "vexa_instagram_story_progress"
    : provider === "instagram"
      ? "vexa_instagram_download_progress"
      : "vexa_youtube_download_progress";

  let publishTotal = requestedTotal;
  if (!publishTotal) {
    const row = await env.DB.prepare("SELECT total_bytes FROM " + table + " WHERE session = ?").bind(session).first();
    publishTotal = positiveInteger(row?.total_bytes);
  }
  const hasOverride = Number.isFinite(Number(percentOverride));
  const naturalPercent = publishTotal ? (actualDone / publishTotal) * 100 : 0;
  const percent = state === "completed"
    ? 100
    : Math.max(0, Math.min(99.9, hasOverride ? Number(percentOverride) : naturalPercent));
  const persistedDone = publishTotal && hasOverride && state !== "completed"
    ? Math.round(publishTotal * (percent / 100))
    : actualDone;

  await env.DB.prepare(
    "UPDATE " + table + " SET total_bytes = CASE WHEN ? > 0 THEN ? ELSE total_bytes END, downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(requestedTotal, requestedTotal, persistedDone, state, message || null, now, session).run();

  if (!publishTotal) return;
  const binding = provider === "story"
    ? env.VEXA_INSTAGRAM_STORY_PROGRESS
    : provider === "instagram"
      ? env.VEXA_INSTAGRAM_PROGRESS
      : env.VEXA_DOWNLOAD_PROGRESS;
  if (!binding) return;

  const id = binding.idFromName(session);
  const stub = binding.get(id);
  const target = provider === "story"
    ? "https://vexa-instagram-story-progress/publish"
    : provider === "instagram"
      ? "https://vexa-instagram-progress/publish"
      : "https://vexa-download-progress/publish";
  await stub.fetch(new Request(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      totalBytes: publishTotal,
      downloadedBytes: actualDone,
      percent,
      status: state,
      error: message,
      updatedAt: now,
    }),
  })).catch(() => null);
}

async function collectSubtitleFfmpegProgress(stream, durationSeconds, onProgress) {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let lastPercent = -1;
  const duration = positiveNumber(durationSeconds);

  const handleLine = async rawLine => {
    const line = String(rawLine || "").trim();
    if (!line) return;
    let elapsed = NaN;
    if (line.startsWith("out_time=")) {
      elapsed = parseFfmpegProgressTime(line.slice("out_time=".length));
    } else if (line.startsWith("out_time_us=")) {
      elapsed = Number(line.slice("out_time_us=".length)) / 1_000_000;
    } else if (line.startsWith("out_time_ms=")) {
      elapsed = Number(line.slice("out_time_ms=".length)) / 1_000_000;
    }
    if (duration && Number.isFinite(elapsed)) {
      const percent = Math.max(0, Math.min(99, Math.floor((elapsed / duration) * 100)));
      if (percent > lastPercent) {
        lastPercent = percent;
        await emitSubtitleProgress(onProgress, { phase: "rendering", percent, durationSeconds: duration });
      }
    }
    if (line === "progress=end" && lastPercent < 100) {
      lastPercent = 100;
      await emitSubtitleProgress(onProgress, { phase: "rendering", percent: 100, durationSeconds: duration });
    }
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      pending += decoder.decode(next.value, { stream: true });
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() || "";
      for (const line of lines) await handleLine(line);
    }
    pending += decoder.decode();
    if (pending) await handleLine(pending);
  } catch (error) {
    console.warn("Vexa subtitle render progress stream failed", error?.message || error);
  }
}

function parseFfmpegProgressTime(value) {
  const match = String(value || "").trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/u);
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function collectProcessText(stream, maxBytes) {
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
  } catch {}
  return text.trim();
}

async function emitSubtitleProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;
  try {
    await onProgress(event);
  } catch (error) {
    console.warn("Vexa subtitle progress callback failed", error?.message || error);
  }
}

async function serveSubtitleSource(request, env) {
  if (!env.EXPLORE_MEDIA) return new Response("Not Found", { status: 404 });
  const token = cleanSourceToken(new URL(request.url).searchParams.get("token"));
  if (!token) return new Response("Not Found", { status: 404 });
  const key = SOURCE_PREFIX + token + ".mp4";
  const head = await env.EXPLORE_MEDIA.head(key);
  const now = Math.floor(Date.now() / 1000);
  if (!head || String(head.customMetadata?.vexaSubtitleSource || "") !== "1" || sourceTokenExpiry(token) <= now) {
    if (head) await env.EXPLORE_MEDIA.delete(key).catch(() => null);
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  const size = positiveInteger(head.size);
  const rangeHeader = request.headers.get("Range");
  const range = parseRange(rangeHeader, size);
  if (rangeHeader && !range) {
    if (size) headers.set("Content-Range", "bytes */" + size);
    return new Response(null, { status: 416, headers });
  }

  if (request.method === "HEAD") {
    if (size) headers.set("Content-Length", String(size));
    return new Response(null, { status: 200, headers });
  }

  if (range) {
    const object = await env.EXPLORE_MEDIA.get(key, { range: { offset: range.start, length: range.length } });
    if (!object?.body) return new Response("Not Found", { status: 404 });
    headers.set("Content-Length", String(range.length));
    headers.set("Content-Range", "bytes " + range.start + "-" + range.end + "/" + size);
    return new Response(object.body, { status: 206, headers });
  }

  const object = await env.EXPLORE_MEDIA.get(key);
  if (!object?.body) return new Response("Not Found", { status: 404 });
  if (size) headers.set("Content-Length", String(size));
  return new Response(object.body, { status: 200, headers });
}

function parseRange(value, size) {
  const text = String(value || "").trim();
  if (!text || !size) return null;
  const match = text.match(/^bytes=(\d*)-(\d*)$/u);
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Math.min(size, Number.parseInt(match[2], 10));
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = size - suffix;
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

async function cleanupExpiredSubtitleSources(env) {
  if (!env.EXPLORE_MEDIA) return;
  const now = Math.floor(Date.now() / 1000);
  let cursor;
  for (let page = 0; page < 5; page += 1) {
    const listed = await env.EXPLORE_MEDIA.list({ prefix: SOURCE_PREFIX, cursor, limit: 100 }).catch(() => null);
    if (!listed) return;
    const expired = listed.objects.filter((object) => sourceKeyExpiry(object.key) <= now).map((object) => object.key);
    if (expired.length) await Promise.all(expired.map((key) => env.EXPLORE_MEDIA.delete(key).catch(() => null)));
    if (!listed.truncated || !listed.cursor) return;
    cursor = listed.cursor;
  }
}

function subtitleLanguageFromCookie(value) {
  const cookies = String(value || "").split(";");
  for (const pair of cookies) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    if (name !== SUBTITLE_COOKIE) continue;
    let raw = pair.slice(index + 1).trim();
    try { raw = decodeURIComponent(raw); } catch {}
    return normalizeSubtitleLanguage(raw);
  }
  return "";
}

function normalizeSubtitleLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SUBTITLE_LANGUAGES, key) ? key : "";
}

function normalizeDetectedLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return LANGUAGE_ALIASES[key] || "";
}

function cleanSubtitleText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?%،؛؟])/gu, "$1")
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function cloneJsonResponse(response, data) {
  if (!data) return response;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function makeSourceToken() {
  return String(Math.floor(Date.now() / 1000) + SOURCE_TTL_SECONDS) + "-" + randomToken();
}

function cleanSourceToken(value) {
  const token = String(value || "").trim();
  return /^\d{10}-[A-Za-z0-9_-]{40,60}$/u.test(token) ? token : "";
}

function sourceTokenExpiry(token) {
  const match = String(token || "").match(/^(\d{10})-/u);
  const value = match ? Number.parseInt(match[1], 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function sourceKeyExpiry(key) {
  const value = String(key || "").slice(SOURCE_PREFIX.length).replace(/\.mp4$/u, "");
  return sourceTokenExpiry(value);
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function publicSubtitleError(error) {
  const message = String(error?.message || "");
  if (/cancel|abort/i.test(message)) return "Download was cancelled";
  if (/speech|transcrib|subtitle|translation|render|font/i.test(message)) return message || "Could not create subtitles";
  return "Could not create the subtitled video";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
