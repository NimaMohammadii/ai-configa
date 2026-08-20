import { Container, getContainer } from "@cloudflare/containers";
import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const CHUNK_PATH = "/mini-app/live/api/youtube-subtitles/chunk";
const RUNTIME_PATH = "/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION = "20260820-9";
const TRANSLATION_MODEL = "gpt-5.6-terra";
const REQUEST_SECONDS = 8;
const MIN_REQUEST_SECONDS = 1.2;
const AUDIO_OVERLAP_SECONDS = 1.5;
const CLIP_TIMEOUT_MS = 30_000;
const STT_TIMEOUT_MS = 35_000;
const TRANSLATE_TIMEOUT_MS = 30_000;
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

export class VexaSubtitleContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async extractAudioClip(mediaUrl, startSeconds, durationSeconds) {
    if (!this.ctx.container.running) await this.start();
    const process = await this.ctx.container.exec([
      "ffmpeg",
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      Number(startSeconds).toFixed(3),
      "-i",
      String(mediaUrl),
      "-t",
      Number(durationSeconds).toFixed(3),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "pipe:1",
    ]);

    const timer = setTimeout(() => {
      try { process.kill(); } catch {}
    }, CLIP_TIMEOUT_MS);
    try {
      const output = await process.output();
      if (output.exitCode !== 0 || !output.stdout?.byteLength) {
        const detail = new TextDecoder().decode(output.stderr || new Uint8Array());
        throw new Error(detail || "Could not extract subtitle audio");
      }
      return output.stdout;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function isVexaLiveSubtitlesRequest(request) {
  const path = new URL(request.url).pathname;
  return path === CHUNK_PATH || path === RUNTIME_PATH;
}

export async function handleVexaLiveSubtitlesRequest(request, env) {
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
  if (request.method === "POST" && path === CHUNK_PATH) {
    return createSubtitleChunk(request, env);
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
  const tag = '<script src="' + RUNTIME_PATH + "?v=" + RUNTIME_VERSION + '"></script>';
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

async function createSubtitleChunk(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await assertLiveAccess(env, user.id);

    const token = cleanToken(payload.playbackToken);
    if (!token) return json({ error: "Video session is invalid" }, 400);
    const start = finiteNumber(payload.start, 0, 24 * 60 * 60);
    const duration = finiteNumber(payload.duration, MIN_REQUEST_SECONDS, REQUEST_SECONDS);
    if (start === null || duration === null) {
      return json({ error: "Subtitle time range is invalid" }, 400);
    }
    const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
    if (!targetLanguage || targetLanguage === "off") {
      return json({ error: "Subtitle language is invalid" }, 400);
    }

    const row = await env.DB.prepare(
      "SELECT user_id, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
    ).bind(token).first();
    const now = Math.floor(Date.now() / 1_000);
    if (!row || Number(row.expires_at || 0) <= now) {
      return json({ error: "Video session expired. Open the video again." }, 410);
    }
    if (String(row.user_id) !== String(user.id)) {
      return json({ error: "Video session does not belong to this user" }, 403);
    }
    if (!env.VEXA_SUBTITLES) {
      return json({ error: "Live subtitles are unavailable" }, 503);
    }

    const before = Math.min(AUDIO_OVERLAP_SECONDS, start);
    const extractionStart = Math.max(0, start - before);
    const extractionDuration = duration + before + AUDIO_OVERLAP_SECONDS;
    const playbackUrl = new URL(
      "/mini-app/live/api/youtube-playback?token=" + encodeURIComponent(token),
      request.url,
    ).href;
    const container = getContainer(env.VEXA_SUBTITLES, "subtitle-" + safeContainerKey(user.id));

    let audio;
    try {
      audio = await container.extractAudioClip(playbackUrl, extractionStart, extractionDuration);
    } catch (error) {
      console.error("Vexa subtitle audio extraction failed", error?.stack || error);
      return json({ error: "Could not read this part of the video" }, 502);
    }

    const transcript = await transcribeClip(env, audio);
    const sourceLanguage = normalizeLanguageCode(transcript?.language_code);
    const allCues = buildCues(transcript, extractionStart);
    let cues = selectRequestedCues(allCues, start, duration);

    if (!cues.length) {
      return json({
        ok: true,
        cues: [],
        nextStart: roundTime(start + duration),
        sourceLanguage,
        targetLanguage,
      });
    }

    if (targetLanguage !== "original") {
      const translated = await translateCues({
        env,
        texts: cues.map((cue) => cue.text),
        targetLanguage,
        sourceLanguage,
        previousSource: cleanContext(payload.previousSourceContext),
        previousTranslation: cleanContext(payload.previousTranslationContext),
      });
      cues = cues.map((cue, index) => ({
        ...cue,
        sourceText: cue.text,
        text: translated[index],
        translated: true,
      }));
    } else {
      cues = cues.map((cue) => ({
        ...cue,
        sourceText: cue.text,
        translated: false,
      }));
    }

    return json({
      ok: true,
      cues,
      nextStart: roundTime(start + duration),
      sourceLanguage,
      targetLanguage,
    });
  } catch (error) {
    console.error("Vexa subtitle chunk failed", error?.stack || error);
    return json({ error: publicError(error) }, Number(error?.status || 500));
  }
}

async function transcribeClip(env, audioBytes) {
  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw httpError("Speech-to-text is unavailable", 503);

  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  form.append("file", new Blob([audioBytes], { type: "audio/wav" }), "vexa-live-subtitles.wav");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Accept": "application/json",
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw httpError("Subtitle transcription timed out", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data?.detail?.message || data?.detail || data?.message || "");
    console.error("Vexa subtitle STT failed", response.status, detail.slice(0, 700));
    throw httpError("Subtitle transcription is temporarily unavailable", 502);
  }
  return data;
}

function buildCues(transcript, absoluteStart) {
  const words = (Array.isArray(transcript?.words) ? transcript.words : [])
    .map((item) => ({
      text: String(item?.text || ""),
      type: String(item?.type || "word"),
      start: Number(item?.start),
      end: Number(item?.end),
    }))
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end));
  if (!words.length) return [];

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
        end: roundTime(absoluteStart + Math.max(cueEnd, cueStart + 0.35)),
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
    if (parts.length && gap > 0.9) flush();
    if (cueStart === null && item.type === "word") cueStart = item.start;
    if (cueStart === null) continue;
    cueEnd = item.end;
    parts.push(item.text);
    if (item.type === "word") wordCount += 1;
    previousEnd = item.end;
    const punctuation = item.type === "word" && /[.!?…؛؟]$/u.test(item.text.trim());
    if ((punctuation && wordCount >= 3) || wordCount >= 12) flush();
  }
  flush();
  return cues.slice(0, 18);
}

function selectRequestedCues(cues, start, duration) {
  const end = start + duration;
  const selected = [];
  for (const cue of cues) {
    const midpoint = (Number(cue.start) + Number(cue.end)) / 2;
    if (midpoint < start - 0.04 || midpoint >= end + 0.04) continue;
    selected.push({
      start: roundTime(Math.max(start, Number(cue.start))),
      end: roundTime(Math.min(end + 0.35, Number(cue.end))),
      text: cue.text,
    });
  }
  return selected.slice(0, 12);
}

async function translateCues({
  env,
  texts,
  targetLanguage,
  sourceLanguage,
  previousSource,
  previousTranslation,
}) {
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
          "You translate timed video subtitles into " + languageName + ".",
          "Translate for meaning, not word-for-word. Preserve names, numbers, tone, jokes, slang and implied subjects naturally.",
          "The previous source and translation fields are context only; never repeat them in the output.",
          "Translate only the current segments. Keep exactly one output string for each input segment and preserve segment order.",
          "If a sentence continues across segments, use all current segments and previous context to make every subtitle natural while keeping the same segment count.",
          "Never leave source-language words untranslated unless they are names or brands that should remain unchanged.",
          "Keep subtitles concise and readable. Do not add explanations, labels, quotes or commentary.",
        ].join(" "),
        input: JSON.stringify({
          detected_source_language: sourceLanguage || "unknown",
          target_language: languageName,
          previous_source_context: previousSource,
          previous_translation_context: previousTranslation,
          segments: texts,
        }),
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
        max_output_tokens: 1_000,
        store: false,
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) throw httpError("Subtitle translation timed out", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Vexa subtitle translation failed", response.status, JSON.stringify(data).slice(0, 1_200));
    throw httpError("AI translation is temporarily unavailable", 502);
  }

  const raw = extractResponseText(data).trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const translations = Array.isArray(parsed?.translations)
    ? parsed.translations.map((item) => cleanSubtitleText(item))
    : [];
  if (translations.length !== texts.length || translations.some((item) => !item)) {
    console.error("Vexa structured subtitle result invalid", raw.slice(0, 1_200));
    throw httpError("AI translation returned an invalid subtitle result", 502);
  }
  return translations;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
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
  const code = String(value || "").trim().toLowerCase().split("-")[0];
  return LANGUAGE_ALIASES[code] || code;
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
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
  return Math.round(Number(value || 0) * 1_000) / 1_000;
}

function cleanSubtitleText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?،؛؟])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanContext(value) {
  return cleanSubtitleText(value).slice(-CONTEXT_CHAR_LIMIT);
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
  const CHUNK_URL = "/mini-app/live/api/youtube-subtitles/chunk";
  const PLAYER_ID = "vexaCustomPlayer";
  const STYLE_ID = "vexaLiveSubtitlesStyle";
  const CHUNK_SECONDS = 8;
  const MIN_CHUNK_SECONDS = 1.2;
  const AHEAD_SECONDS = 18;
  const CONTEXT_LIMIT = 1400;
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
  let generation = 0;
  let nextStart = 0;
  let loadedUntil = 0;
  let activeRequest = null;
  let failedGeneration = -1;
  let subtitleTrack = null;
  let sourceContext = "";
  let translationContext = "";
  const cueKeys = new Set();

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) return window.parent;
    } catch {}
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
    try { telegram()?.HapticFeedback?.impactOccurred?.(style || "light"); } catch {}
  }

  function playbackToken(video) {
    try {
      const token = new URL(String(video?.currentSrc || video?.src || ""), window.location.origin).searchParams.get("token") || "";
      return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
    } catch {
      return "";
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function appendContext(current, addition) {
    return cleanText(String(current || "") + " " + String(addition || "")).slice(-CONTEXT_LIMIT);
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
      "#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}" +
      "#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}" +
      "#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}" +
      "#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}" +
      "#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}" +
      ".vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}" +
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
      '<div class="vexa-subtitle-drawer-head"><div class="vexa-subtitle-drawer-title">Live subtitles</div><div class="vexa-subtitle-drawer-sub">Translate to</div></div><div class="vexa-subtitle-language-list">' +
      LANGUAGES.map((item) => '<button type="button" class="vexa-subtitle-language" data-language="' + item[0] + '"><span class="vexa-subtitle-lang-code">' + (item[2] || "—") + '</span><span class="vexa-subtitle-lang-name">' + item[1] + '</span><span class="vexa-subtitle-check">✓</span></button>').join("") +
      "</div>";
    player.appendChild(drawer);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDrawer(player);
    });
    backdrop.addEventListener("click", () => closeDrawer(player));
    drawer.addEventListener("click", (event) => {
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
    player.querySelectorAll("[data-language]").forEach((node) => {
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

  function ensureTrack(player, video) {
    if (subtitleTrack && subtitleTrack.__vexaVideo === video) return subtitleTrack;
    if (typeof window.VTTCue !== "function" || typeof video.addTextTrack !== "function") {
      showCaption(player, "Timed subtitles are not supported on this device", true);
      return null;
    }
    subtitleTrack = video.addTextTrack("metadata", "Vexa subtitles", "");
    subtitleTrack.mode = "hidden";
    subtitleTrack.__vexaVideo = video;
    subtitleTrack.addEventListener("cuechange", () => renderActiveCue(player));
    return subtitleTrack;
  }

  function clearTrack() {
    if (subtitleTrack?.cues) {
      for (const cue of Array.from(subtitleTrack.cues)) {
        try { subtitleTrack.removeCue(cue); } catch {}
      }
    }
    cueKeys.clear();
  }

  function abortActiveRequest() {
    const request = activeRequest;
    activeRequest = null;
    if (request) request.controller.abort();
  }

  function resetPipeline(player, video, message) {
    generation += 1;
    abortActiveRequest();
    clearTrack();
    sourceContext = "";
    translationContext = "";
    failedGeneration = -1;
    nextStart = Math.max(0, Number(video?.currentTime || 0));
    loadedUntil = nextStart;
    if (message) showCaption(player, message, false);
    else hideCaption(player);
    if (enabled && video && !video.paused && !video.ended) ensureBuffer(player, video, generation);
  }

  function stopSubtitles(player) {
    enabled = false;
    targetLanguage = "original";
    generation += 1;
    abortActiveRequest();
    clearTrack();
    sourceContext = "";
    translationContext = "";
    failedGeneration = -1;
    hideCaption(player);
  }

  function startSubtitles(player, language) {
    const video = player.querySelector("video");
    if (!video || !playbackToken(video)) return;
    enabled = true;
    targetLanguage = language;
    if (!ensureTrack(player, video)) return;
    resetPipeline(player, video, video.paused ? "Subtitles ready" : "Preparing subtitles…");
  }

  function cueKey(cue) {
    return Number(cue.start).toFixed(3) + "|" + Number(cue.end).toFixed(3) + "|" + cleanText(cue.sourceText || cue.text);
  }

  function addCues(player, video, cues) {
    const track = ensureTrack(player, video);
    if (!track) return;
    for (const item of Array.isArray(cues) ? cues : []) {
      const start = Number(item?.start);
      const end = Number(item?.end);
      const text = cleanText(item?.text);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
      const key = cueKey(item);
      if (cueKeys.has(key)) continue;
      const cue = new VTTCue(start, end, text);
      cue.id = key;
      track.addCue(cue);
      cueKeys.add(key);
    }
    renderActiveCue(player);
  }

  function renderActiveCue(player) {
    if (!enabled || !subtitleTrack) {
      hideCaption(player);
      return;
    }
    const active = Array.from(subtitleTrack.activeCues || [])
      .filter((cue) => cleanText(cue?.text))
      .sort((left, right) => Number(left.startTime) - Number(right.startTime))
      .pop();
    if (active) showCaption(player, active.text, false);
    else hideCaption(player);
  }

  async function ensureBuffer(player, video, requestGeneration) {
    if (!enabled || requestGeneration !== generation || failedGeneration === requestGeneration) return;
    if (!video || video.paused || video.ended || activeRequest) return;
    if (loadedUntil >= Number(video.currentTime || 0) + AHEAD_SECONDS) return;

    const token = playbackToken(video);
    if (!token) {
      failedGeneration = requestGeneration;
      showCaption(player, "Video session is invalid", true);
      return;
    }

    const start = Math.max(nextStart, Number(video.currentTime || 0));
    const remaining = Number.isFinite(Number(video.duration)) ? Number(video.duration) - start : CHUNK_SECONDS;
    const duration = Math.min(CHUNK_SECONDS, remaining);
    if (!Number.isFinite(duration) || duration < MIN_CHUNK_SECONDS) return;

    const controller = new AbortController();
    const requestState = { controller, generation: requestGeneration };
    activeRequest = requestState;
    let continueLoading = false;
    try {
      const response = await fetch(CHUNK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          initData: initData(),
          playbackToken: token,
          start,
          duration,
          targetLanguage,
          previousSourceContext: sourceContext,
          previousTranslationContext: translationContext,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || "Subtitle request failed"));
      if (!enabled || requestGeneration !== generation || controller.signal.aborted) return;
      if (String(data?.targetLanguage || "") !== targetLanguage) return;

      const resolvedNext = Number(data?.nextStart);
      if (!Number.isFinite(resolvedNext) || resolvedNext <= start) {
        throw new Error("Subtitle server returned an invalid time range");
      }

      const cues = Array.isArray(data?.cues) ? data.cues : [];
      addCues(player, video, cues);
      sourceContext = appendContext(sourceContext, cues.map((cue) => cue?.sourceText || "").join(" "));
      translationContext = appendContext(translationContext, cues.map((cue) => cue?.text || "").join(" "));
      nextStart = resolvedNext;
      loadedUntil = Math.max(loadedUntil, resolvedNext);
      continueLoading = loadedUntil < Number(video.currentTime || 0) + AHEAD_SECONDS;
    } catch (error) {
      if (controller.signal.aborted || requestGeneration !== generation) return;
      failedGeneration = requestGeneration;
      showCaption(player, String(error?.message || "Subtitles are temporarily unavailable"), true);
    } finally {
      if (activeRequest === requestState) activeRequest = null;
      if (continueLoading && enabled && requestGeneration === generation && failedGeneration !== requestGeneration) {
        queueMicrotask(() => ensureBuffer(player, video, requestGeneration));
      }
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
    player.querySelector("[data-subtitle-text]")?.classList.remove("show");
  }

  function bindPlayer(player) {
    if (player.dataset.vexaLiveSubtitles === "13") return;
    player.dataset.vexaLiveSubtitles = "13";
    installStyle();
    installUI(player);
    const video = player.querySelector("video");
    if (!video) return;
    ensureTrack(player, video);

    video.addEventListener("play", () => {
      if (!enabled) return;
      if (failedGeneration === generation) resetPipeline(player, video, "Preparing subtitles…");
      else ensureBuffer(player, video, generation);
    });
    video.addEventListener("playing", () => {
      if (enabled) ensureBuffer(player, video, generation);
    });
    video.addEventListener("timeupdate", () => {
      if (enabled) ensureBuffer(player, video, generation);
    });
    video.addEventListener("pause", () => {
      if (enabled) abortActiveRequest();
      renderActiveCue(player);
    });
    video.addEventListener("seeking", () => {
      if (!enabled) return;
      generation += 1;
      abortActiveRequest();
      clearTrack();
      sourceContext = "";
      translationContext = "";
      failedGeneration = -1;
      hideCaption(player);
    });
    video.addEventListener("seeked", () => {
      if (enabled) resetPipeline(player, video, "Preparing subtitles…");
    });
    video.addEventListener("loadedmetadata", () => {
      if (enabled) resetPipeline(player, video, "Preparing subtitles…");
    });
    video.addEventListener("emptied", () => {
      if (!enabled) return;
      generation += 1;
      abortActiveRequest();
      clearTrack();
      sourceContext = "";
      translationContext = "";
      failedGeneration = -1;
      hideCaption(player);
    });
    video.addEventListener("ended", () => {
      if (enabled) abortActiveRequest();
      hideCaption(player);
    });
  }

  function install() {
    const player = document.getElementById(PLAYER_ID);
    if (!player || !player.querySelector("video")) return false;
    bindPlayer(player);
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;
