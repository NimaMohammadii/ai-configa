import { Container, getContainer } from "@cloudflare/containers";
import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH = "/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH = "/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION = "20260819-3";
const TRANSLATION_MODEL = "gpt-5.6-luna";
const TRANSLATE_TIMEOUT_MS = 24_000;
const PCM_SAMPLE_RATE = 16_000;
const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2;
const PCM_FRAME_BYTES = 3_200;
const MAX_AHEAD_SECONDS = 7.5;
const FAST_CATCHUP_UNTIL_SECONDS = 3.2;
const CONTEXT_CHAR_LIMIT = 1_400;

const TARGET_LANGUAGES = Object.freeze({
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
  en: "en", eng: "en",
  fa: "fa", fas: "fa", per: "fa",
  ru: "ru", rus: "ru",
  de: "de", deu: "de", ger: "de",
  tr: "tr", tur: "tr",
  es: "es", spa: "es",
  ar: "ar", ara: "ar",
  fr: "fr", fra: "fr", fre: "fr",
  pt: "pt", por: "pt",
  it: "it", ita: "it",
  hi: "hi", hin: "hi",
  zh: "zh", zho: "zh", chi: "zh", cmn: "zh",
  ja: "ja", jpn: "ja",
  ko: "ko", kor: "ko",
});

const SCRIBE_ERROR_TYPES = new Set([
  "error",
  "auth_error",
  "quota_exceeded",
  "transcriber_error",
  "input_error",
  "commit_throttled",
  "unaccepted_terms",
  "rate_limited",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "chunk_size_exceeded",
  "insufficient_audio_activity",
  "invalid_request",
]);

export class VexaSubtitleContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudioProcesses = new Map();

  async streamAudioPcm(mediaUrl, startSeconds, streamId) {
    if (!this.ctx.container.running) await this.start();

    const id = cleanStreamId(streamId);
    if (!id) throw new Error("Subtitle audio stream id is invalid");

    const prior = this.activeAudioProcesses.get(id);
    if (prior) {
      try { prior.kill(); } catch (error) {}
      this.activeAudioProcesses.delete(id);
    }

    const process = await this.ctx.container.exec([
      "ffmpeg",
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      Number(startSeconds || 0).toFixed(3),
      "-i",
      String(mediaUrl),
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(PCM_SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      "-f",
      "s16le",
      "pipe:1",
    ]);

    if (!process.stdout) {
      try { process.kill(); } catch (error) {}
      throw new Error("Could not start realtime subtitle audio");
    }

    this.activeAudioProcesses.set(id, process);
    process.exitCode
      .catch(() => -1)
      .finally(() => {
        if (this.activeAudioProcesses.get(id) === process) {
          this.activeAudioProcesses.delete(id);
        }
      });

    return process.stdout;
  }

  async stopAudioStream(streamId) {
    const id = cleanStreamId(streamId);
    if (!id) return false;
    const process = this.activeAudioProcesses.get(id);
    if (!process) return false;
    this.activeAudioProcesses.delete(id);
    try { process.kill(); } catch (error) {}
    return true;
  }
}

export function isVexaLiveSubtitlesRequest(request) {
  const path = new URL(request.url).pathname;
  return path === SOCKET_PATH || path === RUNTIME_PATH;
}

export async function handleVexaLiveSubtitlesRequest(request, env, ctx) {
  const path = new URL(request.url).pathname;

  if (request.method === "GET" && path === RUNTIME_PATH) {
    return new Response(LIVE_SUBTITLES_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (request.method === "GET" && path === SOCKET_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("WebSocket Required", { status: 426 });
    }
    return createRealtimeSubtitleSocket(request, env, ctx);
  }

  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendVexaLiveSubtitlesRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + RUNTIME_PATH + '?v=' + RUNTIME_VERSION + '"></script>';
  const html = source.includes(RUNTIME_PATH)
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

function createRealtimeSubtitleSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const abortController = new AbortController();
  let started = false;
  let sessionControl = null;

  const send = (value) => {
    if (server.readyState !== 1) return;
    try { server.send(JSON.stringify(value)); } catch (error) {}
  };

  const fail = (error) => {
    if (abortController.signal.aborted) return;
    console.error("Vexa realtime subtitle session failed", error?.stack || error);
    send({ type: "error", error: publicError(error) });
    abortController.abort();
    try { server.close(1011, "subtitle session failed"); } catch (closeError) {}
  };

  server.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
    const type = String(message?.type || "");

    if (type === "start") {
      if (started) return;
      started = true;
      sessionControl = {
        playbackTime: finiteNumber(message.currentTime, 0, 24 * 60 * 60) ?? 0,
      };
      runRealtimeSubtitleSession({
        request,
        env,
        server,
        payload: message,
        control: sessionControl,
        signal: abortController.signal,
        send,
      }).catch(fail);
      return;
    }

    if (type === "sync" && sessionControl) {
      const currentTime = finiteNumber(message.currentTime, 0, 24 * 60 * 60);
      if (currentTime !== null) sessionControl.playbackTime = currentTime;
      return;
    }

    if (type === "stop") {
      abortController.abort();
      try { server.close(1000, "stopped"); } catch (error) {}
    }
  });

  const stop = () => abortController.abort();
  server.addEventListener("close", stop);
  server.addEventListener("error", stop);

  return new Response(null, { status: 101, webSocket: client });
}

async function runRealtimeSubtitleSession({
  request,
  env,
  server,
  payload,
  control,
  signal,
  send,
}) {
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const token = cleanToken(payload.playbackToken);
  if (!token) throw httpError("Video session is invalid", 400);

  const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
  if (!targetLanguage || targetLanguage === "off") {
    throw httpError("Subtitle language is invalid", 400);
  }

  const start = finiteNumber(payload.currentTime, 0, 24 * 60 * 60);
  if (start === null) throw httpError("Subtitle start time is invalid", 400);
  control.playbackTime = start;

  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
  ).bind(token).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    throw httpError("Video session expired. Open the video again.", 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    throw httpError("Video session does not belong to this user", 403);
  }
  if (!env.VEXA_SUBTITLES) throw httpError("Live subtitles are unavailable", 503);

  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw httpError("Speech-to-text is unavailable", 503);

  const singleUseToken = await createRealtimeScribeToken(apiKey);
  if (signal.aborted) return;

  const scribeUrl = new URL("https://api.elevenlabs.io/v1/speech-to-text/realtime");
  scribeUrl.searchParams.set("model_id", "scribe_v2_realtime");
  scribeUrl.searchParams.set("token", singleUseToken);
  scribeUrl.searchParams.set("audio_format", "pcm_16000");
  scribeUrl.searchParams.set("commit_strategy", "vad");
  scribeUrl.searchParams.set("vad_threshold", "0.4");
  scribeUrl.searchParams.set("vad_silence_threshold_secs", "0.7");
  scribeUrl.searchParams.set("min_speech_duration_ms", "100");
  scribeUrl.searchParams.set("min_silence_duration_ms", "100");
  scribeUrl.searchParams.set("include_timestamps", "true");
  scribeUrl.searchParams.set("include_language_detection", "true");

  const upstreamResponse = await fetch(scribeUrl, {
    headers: { Upgrade: "websocket" },
  });
  const upstream = upstreamResponse.webSocket;
  if (!upstream || upstreamResponse.status !== 101) {
    throw httpError("Realtime transcription connection is unavailable", 502);
  }
  upstream.accept();

  const streamId = crypto.randomUUID();
  const playbackUrl = new URL(
    "/mini-app/live/api/youtube-playback?token=" + encodeURIComponent(token),
    request.url,
  ).href;
  const container = getContainer(env.VEXA_SUBTITLES, "subtitle-" + safeContainerKey(user.id));

  let audioStream = null;
  let translationQueue = Promise.resolve();
  let sourceContext = "";
  let translationContext = "";
  let audioSecondsSent = 0;
  const seen = new Set();

  const closeUpstream = () => {
    try { upstream.close(1000, "done"); } catch (error) {}
  };
  signal.addEventListener("abort", closeUpstream, { once: true });

  const processTimestampEvent = (message) => {
    const words = Array.isArray(message?.words) ? message.words : [];
    const first = words.find((item) => Number.isFinite(Number(item?.start)));
    const last = [...words].reverse().find((item) => Number.isFinite(Number(item?.end)));
    const fingerprint = [
      String(message?.text || "").trim(),
      first ? Number(first.start).toFixed(3) : "",
      last ? Number(last.end).toFixed(3) : "",
    ].join("|");
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    if (seen.size > 120) {
      const oldest = seen.values().next().value;
      seen.delete(oldest);
    }

    translationQueue = translationQueue.then(async () => {
      if (signal.aborted || server.readyState !== 1) return;
      const sourceLanguage = normalizeLanguageCode(message?.language_code);
      let cues = buildRealtimeCues(message, start, audioSecondsSent);
      if (!cues.length) return;

      if (targetLanguage !== "original" && !sameLanguage(sourceLanguage, targetLanguage)) {
        const sourceTexts = cues.map((cue) => cue.text);
        const translated = await translateRealtimeCues(
          env,
          sourceTexts,
          targetLanguage,
          sourceLanguage,
          sourceContext,
          translationContext,
        );
        cues = cues.map((cue, index) => ({
          ...cue,
          text: translated[index] || cue.text,
        }));
        sourceContext = appendContext(sourceContext, sourceTexts.join(" "));
        translationContext = appendContext(translationContext, translated.join(" "));
      } else {
        sourceContext = appendContext(sourceContext, cues.map((cue) => cue.text).join(" "));
        translationContext = appendContext(translationContext, cues.map((cue) => cue.text).join(" "));
      }

      send({
        type: "cues",
        cues,
        sourceLanguage,
        targetLanguage,
      });
    }).catch((error) => {
      if (signal.aborted) return;
      console.error("Vexa realtime subtitle translation failed", error?.stack || error);
      send({ type: "error", error: publicError(error) });
    });
  };

  upstream.addEventListener("message", (event) => {
    if (signal.aborted) return;
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
    const type = String(message?.message_type || "");

    if (type === "session_started") {
      send({ type: "ready", model: "scribe_v2_realtime" });
      return;
    }

    if (type === "partial_transcript") {
      const text = cleanSubtitleText(message?.text);
      if (text) send({ type: "partial", text });
      return;
    }

    if (
      type === "committed_transcript_with_timestamps" ||
      type === "final_transcript_with_timestamps"
    ) {
      processTimestampEvent(message);
      return;
    }

    if (SCRIBE_ERROR_TYPES.has(type)) {
      const detail = String(message?.error || message?.message || "Realtime transcription failed");
      send({ type: "error", error: publicScribeError(type, detail) });
      return;
    }
  });

  upstream.addEventListener("error", () => {
    if (!signal.aborted) send({ type: "error", error: "Realtime transcription connection failed" });
  });

  try {
    audioStream = await container.streamAudioPcm(playbackUrl, start, streamId);
    if (!audioStream) throw httpError("Could not start realtime subtitle audio", 502);

    audioSecondsSent = await streamPcmToScribe({
      audioStream,
      upstream,
      control,
      baseStart: start,
      signal,
      onProgress: (seconds) => { audioSecondsSent = seconds; },
    });

    if (!signal.aborted && upstream.readyState === 1) {
      const silence = new Uint8Array(PCM_FRAME_BYTES);
      upstream.send(JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: bytesToBase64(silence),
        sample_rate: PCM_SAMPLE_RATE,
        commit: true,
      }));
      await sleep(900, signal).catch(() => null);
      await translationQueue.catch(() => null);
      if (!signal.aborted) send({ type: "ended" });
    }
  } finally {
    signal.removeEventListener("abort", closeUpstream);
    if (audioStream) {
      try { await audioStream.cancel(); } catch (error) {}
    }
    try { await container.stopAudioStream(streamId); } catch (error) {}
    closeUpstream();
  }
}

async function streamPcmToScribe({
  audioStream,
  upstream,
  control,
  baseStart,
  signal,
  onProgress,
}) {
  const reader = audioStream.getReader();
  let pending = new Uint8Array(0);
  let bytesSent = 0;

  const abortReader = () => {
    try { reader.cancel(); } catch (error) {}
  };
  signal.addEventListener("abort", abortReader, { once: true });

  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      pending = concatBytes(pending, next.value);

      while (pending.byteLength >= PCM_FRAME_BYTES && !signal.aborted) {
        const frame = pending.slice(0, PCM_FRAME_BYTES);
        pending = pending.slice(PCM_FRAME_BYTES);

        await waitForSubtitleLead({
          control,
          absoluteAudioTime: baseStart + bytesSent / PCM_BYTES_PER_SECOND,
          frameSeconds: frame.byteLength / PCM_BYTES_PER_SECOND,
          signal,
        });

        if (signal.aborted || upstream.readyState !== 1) return bytesSent / PCM_BYTES_PER_SECOND;
        upstream.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: bytesToBase64(frame),
          sample_rate: PCM_SAMPLE_RATE,
        }));
        bytesSent += frame.byteLength;
        onProgress?.(bytesSent / PCM_BYTES_PER_SECOND);
      }
    }

    if (pending.byteLength && !signal.aborted && upstream.readyState === 1) {
      upstream.send(JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: bytesToBase64(pending),
        sample_rate: PCM_SAMPLE_RATE,
      }));
      bytesSent += pending.byteLength;
      onProgress?.(bytesSent / PCM_BYTES_PER_SECOND);
    }
    return bytesSent / PCM_BYTES_PER_SECOND;
  } finally {
    signal.removeEventListener("abort", abortReader);
    try { await reader.cancel(); } catch (error) {}
  }
}

async function waitForSubtitleLead({
  control,
  absoluteAudioTime,
  frameSeconds,
  signal,
}) {
  while (!signal.aborted) {
    const playbackTime = Number(control.playbackTime || 0);
    const ahead = absoluteAudioTime - playbackTime;
    if (ahead <= MAX_AHEAD_SECONDS) {
      const speed = ahead < FAST_CATCHUP_UNTIL_SECONDS ? 2.0 : 1.05;
      await sleep(Math.max(18, (frameSeconds / speed) * 1000), signal);
      return;
    }
    await sleep(70, signal);
  }
}

async function createRealtimeScribeToken(apiKey) {
  const response = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Accept": "application/json",
      },
    },
  );
  const data = await response.json().catch(() => ({}));
  const token = String(data?.token || "");
  if (!response.ok || !token) {
    const detail = String(data?.detail?.message || data?.detail || data?.message || "");
    console.error("Vexa realtime Scribe token failed", response.status, detail.slice(0, 700));
    throw httpError("Realtime transcription authentication is unavailable", 502);
  }
  return token;
}

function buildRealtimeCues(message, absoluteStart, audioSecondsSent) {
  const words = (Array.isArray(message?.words) ? message.words : [])
    .map((item) => ({
      text: String(item?.text || ""),
      type: String(item?.type || "word"),
      start: Number(item?.start),
      end: Number(item?.end),
    }))
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end));

  if (!words.length) {
    const text = cleanSubtitleText(message?.text);
    if (!text) return [];
    const end = absoluteStart + Math.max(0, Number(audioSecondsSent || 0));
    return [{
      start: roundTime(Math.max(absoluteStart, end - 2.4)),
      end: roundTime(Math.max(absoluteStart + 0.35, end + 0.35)),
      text,
    }];
  }

  const cues = [];
  let parts = [];
  let cueStart = null;
  let cueEnd = null;
  let wordCount = 0;
  let previousEnd = null;

  const flush = () => {
    const text = cleanSubtitleText(parts.join(""));
    if (text && cueStart !== null && cueEnd !== null && wordCount > 0) {
      cues.push({
        start: roundTime(absoluteStart + cueStart),
        end: roundTime(absoluteStart + Math.max(cueEnd + 0.22, cueStart + 0.38)),
        text,
      });
    }
    parts = [];
    cueStart = null;
    cueEnd = null;
    wordCount = 0;
    previousEnd = null;
  };

  for (const item of words) {
    const gap = previousEnd === null ? 0 : item.start - previousEnd;
    if (parts.length && gap > 0.78) flush();
    if (cueStart === null && item.type === "word") cueStart = item.start;
    if (cueStart === null) continue;

    cueEnd = item.end;
    parts.push(item.text);
    if (item.type === "word") wordCount += 1;
    previousEnd = item.end;

    const punctuation = item.type === "word" && /[.!?…؛؟]$/.test(item.text.trim());
    if ((punctuation && wordCount >= 3) || wordCount >= 10) flush();
  }
  flush();
  return cues.slice(0, 10);
}

async function translateRealtimeCues(
  env,
  texts,
  targetLanguage,
  sourceLanguage,
  previousSource,
  previousTranslation,
) {
  if (!env.GPT_API) throw httpError("AI translation is unavailable", 503);
  const languageName = TARGET_LANGUAGES[targetLanguage];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        instructions: [
          "Translate the current video subtitle segments into " + languageName + ".",
          "Use natural everyday spoken language, like how real people talk in videos. Do not sound formal, literary, bureaucratic, or bookish.",
          "Translate the meaning and tone, not word-for-word. Keep names, numbers, jokes, slang, implied subjects, and conversational intent natural.",
          "The previous source and previous translation are context only. Never repeat them.",
          "Keep exactly one output string for each current segment, in the same order. Do not merge or split segments.",
          "Keep each subtitle short and easy to read.",
          "Use very light punctuation. Do not add a period or full stop at the end of subtitle lines unless it is truly required for meaning. Do not overuse commas, semicolons, ellipses, exclamation marks, or question marks.",
          "Return only the requested structured result with no explanations or labels.",
        ].join(" "),
        input: JSON.stringify({
          detected_source_language: sourceLanguage || "unknown",
          target_language: languageName,
          previous_source_context: String(previousSource || "").slice(-CONTEXT_CHAR_LIMIT),
          previous_translation_context: String(previousTranslation || "").slice(-CONTEXT_CHAR_LIMIT),
          segments: texts,
        }),
        reasoning: { effort: "none" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "live_subtitle_translations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  minItems: texts.length,
                  maxItems: texts.length,
                  items: { type: "string" },
                },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 700,
        store: false,
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) throw httpError("Live translation timed out", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      "Vexa Luna subtitle translation failed",
      response.status,
      JSON.stringify(data).slice(0, 1200),
    );
    throw httpError("AI translation is temporarily unavailable", 502);
  }

  const raw = extractResponseText(data).trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
  const translations = Array.isArray(parsed?.translations)
    ? parsed.translations.map((item) => cleanTranslatedSubtitle(item))
    : [];
  if (translations.length !== texts.length || translations.some((item) => !item)) {
    console.error("Vexa Luna subtitle result invalid", raw.slice(0, 1200));
    throw httpError("AI translation returned an invalid subtitle result", 502);
  }
  return translations;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("");
}

async function selectedElevenApiKey(env) {
  const selectedKeyName = await getElevenApiSetting(env);
  return String(env[selectedKeyName] || "").trim();
}

async function assertLiveAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    throw httpError("Vexa Live is updating", 423);
  }
}

function normalizeTargetLanguage(value) {
  const key = String(value || "original").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES, key) ? key : "";
}

function normalizeLanguageCode(value) {
  const code = String(value || "").trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return LANGUAGE_ALIASES[code] || code;
}

function sameLanguage(sourceLanguage, targetLanguage) {
  if (!sourceLanguage || !targetLanguage) return false;
  return normalizeLanguageCode(sourceLanguage) === normalizeLanguageCode(targetLanguage);
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function cleanStreamId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : "";
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function finiteNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function roundTime(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function cleanSubtitleText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?،؛؟])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTranslatedSubtitle(value) {
  return cleanSubtitleText(value)
    .replace(/([!?؟])\1+/g, "$1")
    .replace(/\s*[.。\u06D4]+$/u, "")
    .replace(/\s*[;؛]+\s*$/u, "")
    .trim();
}

function appendContext(current, next) {
  const value = cleanSubtitleText((String(current || "") + " " + String(next || "")).trim());
  return value.slice(-CONTEXT_CHAR_LIMIT);
}

function publicScribeError(type, detail) {
  if (type === "quota_exceeded") return "Speech-to-text quota is unavailable";
  if (type === "rate_limited") return "Live subtitles are temporarily rate limited";
  if (type === "unaccepted_terms") return "Scribe realtime terms must be accepted in ElevenLabs";
  if (type === "session_time_limit_exceeded") return "Live subtitle session reached its time limit";
  console.error("Vexa Scribe realtime error", type, String(detail || "").slice(0, 700));
  return "Realtime transcription is temporarily unavailable";
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function concatBytes(left, right) {
  if (!left.byteLength) return right.slice();
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, Math.max(0, Number(ms || 0)));
    signal?.addEventListener?.("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }, { once: true });
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  const status = Number(error?.status || 500);
  if (status >= 400 && status < 500) return String(error?.message || "Request failed");
  const message = String(error?.message || "");
  if (/translation/i.test(message)) return message;
  if (/transcription|speech-to-text/i.test(message)) return message;
  return "Live subtitles are temporarily unavailable";
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

export const LIVE_SUBTITLES_RUNTIME_JS = String.raw`
(function () {
  const SOCKET_PATH = "/mini-app/live/api/youtube-subtitles/realtime";
  const PLAYER_ID = "vexaCustomPlayer";
  const STYLE_ID = "vexaLiveSubtitlesStyle";
  const LANGUAGES = [
    ["off", "Off", ""],
    ["original", "Original audio", "Auto"],
    ["en", "English", "EN"],
    ["fa", "فارسی", "FA"],
    ["ru", "Русский", "RU"],
    ["de", "Deutsch", "DE"],
    ["tr", "Türkçe", "TR"],
    ["es", "Español", "ES"],
    ["ar", "العربية", "AR"],
    ["fr", "Français", "FR"],
    ["pt", "Português", "PT"],
    ["it", "Italiano", "IT"],
    ["hi", "हिन्दी", "HI"],
    ["zh", "中文", "ZH"],
    ["ja", "日本語", "JA"],
    ["ko", "한국어", "KO"],
  ];

  let enabled = false;
  let targetLanguage = "original";
  let socket = null;
  let socketGeneration = 0;
  let reconnectTimer = 0;
  let syncTimer = 0;
  let renderTimer = 0;
  let cues = [];
  let partialText = "";

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
  function playbackToken(video) {
    const src = String(video?.currentSrc || video?.src || "");
    try {
      const token = new URL(src, window.location.origin).searchParams.get("token") || "";
      return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
    } catch (error) { return ""; }
  }
  function websocketUrl() {
    const url = new URL(SOCKET_PATH, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }
  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}" +
      "#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}" +
      "#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}" +
      "#vexaCustomPlayer .vexa-subtitle-text{max-width:min(780px,92%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:clamp(15px,3.8vw,22px);line-height:1.32;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}" +
      "#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-head{flex:0 0 auto;padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820;letter-spacing:-.02em}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}" +
      "#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}" +
      "#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}" +
      "#vexaCustomPlayer .vexa-subtitle-language:active{background:rgba(255,255,255,.08)}" +
      "#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}" +
      "#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}" +
      "#vexaCustomPlayer.is-fullscreen .vexa-subtitle-drawer{bottom:calc(10px + env(safe-area-inset-bottom))}";
    document.head.appendChild(style);
  }
  function installUI(player) {
    if (player.querySelector("[data-vexa-subtitles]")) return;
    const row = player.querySelector(".vexa-player-row");
    const spacer = row?.querySelector(".vexa-player-spacer");
    if (!row || !spacer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vexa-player-small vexa-subtitle-toggle";
    button.setAttribute("data-vexa-subtitles", "1");
    button.setAttribute("aria-label", "Live subtitles");
    button.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M18 10a2 2 0 1 0 0 4"/></svg>';
    row.insertBefore(button, spacer);

    const layer = document.createElement("div");
    layer.className = "vexa-subtitle-layer";
    layer.innerHTML = '<div class="vexa-subtitle-text" data-subtitle-text></div>';
    player.appendChild(layer);

    const backdrop = document.createElement("div");
    backdrop.className = "vexa-subtitle-drawer-backdrop";
    backdrop.setAttribute("data-subtitle-backdrop", "1");
    player.appendChild(backdrop);

    const drawer = document.createElement("div");
    drawer.className = "vexa-subtitle-drawer";
    drawer.setAttribute("data-subtitle-drawer", "1");
    drawer.innerHTML =
      '<div class="vexa-subtitle-drawer-head"><div class="vexa-subtitle-drawer-title">Live subtitles</div><div class="vexa-subtitle-drawer-sub">Translate to</div></div>' +
      '<div class="vexa-subtitle-language-list">' +
      LANGUAGES.map(function (item) {
        return '<button type="button" class="vexa-subtitle-language" data-language="' + item[0] + '">' +
          '<span class="vexa-subtitle-lang-code">' + (item[2] || "—") + '</span>' +
          '<span class="vexa-subtitle-lang-name">' + item[1] + '</span>' +
          '<span class="vexa-subtitle-check">✓</span></button>';
      }).join("") + "</div>";
    player.appendChild(drawer);

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openDrawer(player);
    });
    backdrop.addEventListener("click", function () { closeDrawer(player); });
    drawer.addEventListener("click", function (event) {
      const option = event.target?.closest?.("[data-language]");
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      chooseLanguage(player, String(option.dataset.language || "off"));
    });
    updateLanguageSelection(player);
  }
  function openDrawer(player) {
    updateLanguageSelection(player);
    player.querySelector("[data-subtitle-backdrop]")?.classList.add("show");
    player.querySelector("[data-subtitle-drawer]")?.classList.add("show");
    haptic("light");
  }
  function closeDrawer(player) {
    player.querySelector("[data-subtitle-backdrop]")?.classList.remove("show");
    player.querySelector("[data-subtitle-drawer]")?.classList.remove("show");
  }
  function updateLanguageSelection(player) {
    const selected = enabled ? targetLanguage : "off";
    player.querySelectorAll("[data-language]").forEach(function (node) {
      node.classList.toggle("is-selected", String(node.dataset.language) === selected);
    });
    player.querySelector("[data-vexa-subtitles]")?.classList.toggle("is-active", enabled);
  }
  function chooseLanguage(player, language) {
    closeDrawer(player);
    if (language === "off") stopSubtitles(player);
    else startSubtitles(player, language);
    updateLanguageSelection(player);
    haptic("medium");
  }
  function stopSubtitles(player) {
    enabled = false;
    targetLanguage = "original";
    socketGeneration += 1;
    cues = [];
    partialText = "";
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    closeSocket(true);
    hideCaption(player);
  }
  function startSubtitles(player, language) {
    const video = player.querySelector("video");
    if (!video || !playbackToken(video)) return;
    enabled = true;
    targetLanguage = language;
    cues = [];
    partialText = "";
    socketGeneration += 1;
    showCaption(player, video.paused ? "Live subtitles ready" : "Starting live subtitles…", false);
    if (!video.paused && !video.ended) connectRealtime(player, socketGeneration);
  }
  function closeSocket(intentional) {
    clearInterval(syncTimer);
    syncTimer = 0;
    const active = socket;
    socket = null;
    if (!active) return;
    active.__vexaIntentionalClose = Boolean(intentional);
    try {
      if (active.readyState === WebSocket.OPEN) {
        active.send(JSON.stringify({ type: "stop" }));
      }
    } catch (error) {}
    try { active.close(1000, "restart"); } catch (error) {}
  }
  function connectRealtime(player, gen) {
    if (!enabled || gen !== socketGeneration) return;
    const video = player.querySelector("video");
    if (!video || video.paused || video.ended) return;
    const token = playbackToken(video);
    if (!token) return;

    closeSocket(true);
    partialText = "";
    cues = cues.filter(function (cue) { return cue.end >= Number(video.currentTime || 0) - 1; });

    const ws = new WebSocket(websocketUrl());
    socket = ws;

    ws.addEventListener("open", function () {
      if (!enabled || gen !== socketGeneration || socket !== ws) {
        try { ws.close(); } catch (error) {}
        return;
      }
      ws.send(JSON.stringify({
        type: "start",
        initData: initData(),
        playbackToken: token,
        currentTime: Math.max(0, Number(video.currentTime || 0)),
        targetLanguage: targetLanguage,
      }));
      clearInterval(syncTimer);
      syncTimer = setInterval(function () {
        if (socket !== ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(JSON.stringify({
            type: "sync",
            currentTime: Math.max(0, Number(video.currentTime || 0)),
          }));
        } catch (error) {}
      }, 400);
    });

    ws.addEventListener("message", function (event) {
      if (!enabled || gen !== socketGeneration || socket !== ws) return;
      let data;
      try { data = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
      const type = String(data?.type || "");

      if (type === "ready") {
        if (!cues.length) showCaption(player, "Listening…", false);
        return;
      }

      if (type === "partial") {
        partialText = String(data?.text || "").trim();
        if (targetLanguage === "original" && partialText) {
          showCaption(player, partialText, false);
        }
        return;
      }

      if (type === "cues") {
        partialText = "";
        const incoming = Array.isArray(data?.cues) ? data.cues : [];
        for (const cue of incoming) {
          const start = Number(cue?.start);
          const end = Number(cue?.end);
          const text = String(cue?.text || "").trim();
          if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
          cues.push({ start, end: Math.max(end, start + 0.22), text });
        }
        cues.sort(function (a, b) { return a.start - b.start; });
        const current = Number(video.currentTime || 0);
        cues = cues.filter(function (cue) { return cue.end >= current - 8; }).slice(-100);
        return;
      }

      if (type === "error") {
        enabled = false;
        updateLanguageSelection(player);
        showCaption(player, String(data?.error || "Live subtitles unavailable"), true);
        closeSocket(true);
        return;
      }

      if (type === "ended") {
        closeSocket(true);
      }
    });

    ws.addEventListener("close", function () {
      if (socket === ws) socket = null;
      clearInterval(syncTimer);
      syncTimer = 0;
      const shouldReconnect =
        enabled &&
        gen === socketGeneration &&
        !ws.__vexaIntentionalClose &&
        socket === null &&
        !video.paused &&
        !video.ended;
      if (shouldReconnect) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(function () {
          connectRealtime(player, gen);
        }, 650);
      }
    });

    ws.addEventListener("error", function () {
      if (socket !== ws) return;
      try { ws.close(); } catch (error) {}
    });
  }
  function restartFromCurrentTime(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    socketGeneration += 1;
    const gen = socketGeneration;
    cues = [];
    partialText = "";
    closeSocket(true);
    showCaption(player, "Syncing subtitles…", false);
    if (!video.paused && !video.ended) connectRealtime(player, gen);
  }
  function renderCaption(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    const now = Number(video.currentTime || 0);
    let active = null;
    for (let index = cues.length - 1; index >= 0; index -= 1) {
      const cue = cues[index];
      if (cue.start <= now + 0.08 && cue.end >= now - 0.08) {
        active = cue;
        break;
      }
      if (cue.end < now - 2) break;
    }
    if (active) {
      showCaption(player, active.text, false);
    } else if (targetLanguage === "original" && partialText) {
      showCaption(player, partialText, false);
    } else if (cues.length) {
      hideCaption(player);
    }
  }
  function showCaption(player, text, error) {
    const node = player.querySelector("[data-subtitle-text]");
    if (!node) return;
    node.textContent = String(text || "");
    node.style.color = error ? "#ffb1bd" : "#fff";
    node.dir = targetLanguage === "fa" || targetLanguage === "ar" ? "rtl" : "auto";
    node.classList.toggle("show", Boolean(text));
  }
  function hideCaption(player) {
    const node = player.querySelector("[data-subtitle-text]");
    if (node) node.classList.remove("show");
  }
  function bindPlayer(player) {
    if (player.dataset.vexaLiveSubtitles === "2") return;
    player.dataset.vexaLiveSubtitles = "2";
    installStyle();
    installUI(player);
    const video = player.querySelector("video");
    if (!video) return;

    video.addEventListener("play", function () {
      if (!enabled) return;
      socketGeneration += 1;
      connectRealtime(player, socketGeneration);
    });
    video.addEventListener("pause", function () {
      if (!enabled) return;
      closeSocket(true);
      partialText = "";
      renderCaption(player);
    });
    video.addEventListener("seeked", function () {
      restartFromCurrentTime(player);
    });
    video.addEventListener("loadedmetadata", function () {
      if (enabled) restartFromCurrentTime(player);
    });
    video.addEventListener("emptied", function () {
      if (!enabled) return;
      closeSocket(true);
      cues = [];
      partialText = "";
    });
    video.addEventListener("ended", function () {
      if (!enabled) return;
      closeSocket(true);
      partialText = "";
    });

    renderTimer = setInterval(function () { renderCaption(player); }, 80);
  }
  function install() {
    const player = document.getElementById(PLAYER_ID);
    if (!player || !player.querySelector("video")) return false;
    bindPlayer(player);
    return true;
  }
  if (!install()) {
    const observer = new MutationObserver(function () {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;