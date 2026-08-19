import { Container, getContainer } from "@cloudflare/containers";
import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { DEFAULT_AI_CHAT_MODEL } from "../../ai-chat-model.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const CHUNK_PATH = "/mini-app/live/api/youtube-subtitles/chunk";
const RUNTIME_PATH = "/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION = "20260819-1";
const MAX_CLIP_SECONDS = 8;
const MIN_CLIP_SECONDS = 1.2;
const CLIP_TIMEOUT_MS = 30_000;
const STT_TIMEOUT_MS = 35_000;
const TRANSLATE_TIMEOUT_MS = 30_000;

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

export class VexaSubtitleContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];

  async extractAudioClip(mediaUrl, requestHeaders, startSeconds, durationSeconds) {
    if (!this.ctx.container.running) await this.start();

    const args = [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      Number(startSeconds).toFixed(3),
    ];
    const headers = ffmpegHeaderBlock(requestHeaders);
    if (headers) args.push("-headers", headers);
    args.push(
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
    );

    const process = await this.ctx.container.exec(args);
    const timer = setTimeout(() => {
      try { process.kill(); } catch (error) {}
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

async function createSubtitleChunk(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await assertLiveAccess(env, user.id);

    const token = cleanToken(payload.playbackToken);
    if (!token) return json({ error: "Video session is invalid" }, 400);

    const start = finiteNumber(payload.start, 0, 24 * 60 * 60);
    const duration = finiteNumber(payload.duration, MIN_CLIP_SECONDS, MAX_CLIP_SECONDS);
    if (start === null || duration === null) {
      return json({ error: "Subtitle time range is invalid" }, 400);
    }
    const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
    if (!targetLanguage) return json({ error: "Subtitle language is invalid" }, 400);

    const row = await env.DB.prepare(
      "SELECT user_id, media_url, media_headers, media_size, title, expires_at " +
      "FROM vexa_youtube_playback_tokens WHERE token = ?"
    ).bind(token).first();
    const now = Math.floor(Date.now() / 1000);
    if (!row || Number(row.expires_at || 0) <= now) {
      return json({ error: "Video session expired. Open the video again." }, 410);
    }
    if (String(row.user_id) !== String(user.id)) {
      return json({ error: "Video session does not belong to this user" }, 403);
    }
    if (!env.VEXA_SUBTITLES) return json({ error: "Live subtitles are unavailable" }, 503);

    const container = getContainer(env.VEXA_SUBTITLES, "subtitle-" + safeContainerKey(user.id));
    let audio;
    try {
      audio = await container.extractAudioClip(
        String(row.media_url || ""),
        parseStoredHeaders(row.media_headers),
        start,
        duration,
      );
    } catch (error) {
      console.error("Vexa subtitle audio extraction failed", error?.stack || error);
      return json({ error: "Could not read this part of the video" }, 502);
    }

    const transcript = await transcribeClip(env, audio);
    let cues = buildCues(transcript, start, duration);
    if (!cues.length) {
      return json({
        ok: true,
        cues: [],
        nextStart: roundTime(start + duration),
        sourceLanguage: String(transcript?.language_code || ""),
        targetLanguage,
      });
    }

    if (targetLanguage !== "original") {
      const translated = await translateCues(env, cues, targetLanguage);
      cues = cues.map((cue, index) => ({ ...cue, text: translated[index] || cue.text }));
    }

    return json({
      ok: true,
      cues,
      nextStart: roundTime(start + duration),
      sourceLanguage: String(transcript?.language_code || ""),
      targetLanguage,
    });
  } catch (error) {
    console.error("Vexa live subtitle chunk failed", error?.stack || error);
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
      headers: { "xi-api-key": apiKey, "Accept": "application/json" },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw httpError("Live transcription timed out", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data?.detail?.message || data?.detail || data?.message || "");
    console.error("Vexa live subtitle STT failed", response.status, detail.slice(0, 700));
    throw httpError("Live transcription is temporarily unavailable", 502);
  }
  return data;
}

function buildCues(transcript, absoluteStart, duration) {
  const rawWords = Array.isArray(transcript?.words) ? transcript.words : [];
  const timed = rawWords
    .map((item) => ({
      text: String(item?.text || ""),
      type: String(item?.type || "word"),
      start: Number(item?.start),
      end: Number(item?.end),
    }))
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end));

  if (!timed.length) {
    const text = cleanSubtitleText(transcript?.text);
    return text ? [{ start: roundTime(absoluteStart), end: roundTime(absoluteStart + duration), text }] : [];
  }

  const cues = [];
  let parts = [];
  let cueStart = null;
  let cueEnd = null;
  let wordCount = 0;
  let previousEnd = null;

  const flush = () => {
    const text = cleanSubtitleText(parts.join(""));
    if (text && cueStart !== null && cueEnd !== null) {
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

  for (const item of timed) {
    const gap = previousEnd === null ? 0 : item.start - previousEnd;
    if (parts.length && gap > 0.9) flush();
    if (cueStart === null) cueStart = item.start;
    cueEnd = item.end;
    parts.push(item.text);
    if (item.type === "word") wordCount += 1;
    previousEnd = item.end;

    const punctuation = /[.!?…؛؟]$/.test(item.text.trim());
    if ((punctuation && wordCount >= 3) || wordCount >= 11) flush();
  }
  flush();
  return cues.slice(0, 8);
}

async function translateCues(env, cues, targetLanguage) {
  if (!env.GPT_API) throw httpError("AI translation is unavailable", 503);
  const languageName = TARGET_LANGUAGES[targetLanguage];
  const texts = cues.map((cue) => cue.text);

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
        model: DEFAULT_AI_CHAT_MODEL,
        instructions:
          "Translate subtitle segments into " + languageName + ". Preserve meaning, names and tone. " +
          "Keep each item concise enough for on-screen subtitles. Do not merge or split items. " +
          "Return only valid JSON in this exact shape: {\"translations\":[\"...\"]}. " +
          "The translations array must contain exactly " + texts.length + " strings.",
        input: JSON.stringify(texts),
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
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
    console.error("Vexa subtitle translation failed", response.status, JSON.stringify(data).slice(0, 900));
    throw httpError("AI translation is temporarily unavailable", 502);
  }

  const raw = extractResponseText(data).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
  const translations = Array.isArray(parsed?.translations) ? parsed.translations.map((item) => cleanSubtitleText(item)) : [];
  if (translations.length !== texts.length || translations.some((item) => !item)) {
    throw httpError("AI translation returned an invalid subtitle result", 502);
  }
  return translations;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === "string") chunks.push(part.text);
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
  if (globalAccess.adminOnly || liveAccess.adminOnly) throw httpError("Vexa Live is updating", 423);
}

function parseStoredHeaders(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || "{}")); } catch (error) { parsed = {}; }
  const result = {};
  if (!parsed || typeof parsed !== "object") return result;
  for (const [name, headerValue] of Object.entries(parsed)) {
    const safeName = String(name || "").replace(/[^A-Za-z0-9-]/g, "");
    const safeValue = String(headerValue || "").replace(/[\r\n]+/g, " ").trim();
    if (!safeName || !safeValue || safeName.toLowerCase() === "host") continue;
    result[safeName] = safeValue;
  }
  return result;
}

function ffmpegHeaderBlock(headers) {
  return Object.entries(headers || {})
    .map(([name, value]) => String(name) + ": " + String(value))
    .join("\r\n") + (Object.keys(headers || {}).length ? "\r\n" : "");
}

function normalizeTargetLanguage(value) {
  const key = String(value || "original").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES, key) ? key : "";
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
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function cleanSubtitleText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?،؛؟])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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
  const AHEAD_SECONDS = 18;
  const POLL_MS = 260;
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
  let cues = [];
  let nextStart = 0;
  let processing = false;
  let timer = 0;
  let renderTimer = 0;

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
          '<span class="vexa-subtitle-lang-code">' + (item[2] || '—') + '</span>' +
          '<span class="vexa-subtitle-lang-name">' + item[1] + '</span>' +
          '<span class="vexa-subtitle-check">✓</span></button>';
      }).join('') + '</div>';
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
    generation += 1;
    cues = [];
    processing = false;
    clearTimeout(timer);
    timer = 0;
    hideCaption(player);
  }
  function startSubtitles(player, language) {
    const video = player.querySelector("video");
    if (!video || !playbackToken(video)) return;
    enabled = true;
    targetLanguage = language;
    generation += 1;
    cues = [];
    processing = false;
    nextStart = Math.max(0, Number(video.currentTime || 0) - 0.15);
    showCaption(player, "Starting live subtitles…", false);
    scheduleWork(player, 0, generation);
  }
  function resetForSeek(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    generation += 1;
    cues = [];
    processing = false;
    nextStart = Math.max(0, Number(video.currentTime || 0) - 0.12);
    showCaption(player, "Syncing subtitles…", false);
    scheduleWork(player, 0, generation);
  }
  function scheduleWork(player, delay, gen) {
    clearTimeout(timer);
    timer = setTimeout(function () { fillAhead(player, gen); }, Math.max(0, delay || 0));
  }
  async function fillAhead(player, gen) {
    if (!enabled || gen !== generation || processing) return;
    const video = player.querySelector("video");
    if (!video) return;
    const token = playbackToken(video);
    if (!token) return;
    const current = Math.max(0, Number(video.currentTime || 0));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;

    if (nextStart < current - 2 || nextStart > current + AHEAD_SECONDS + CHUNK_SECONDS) {
      nextStart = current;
      cues = cues.filter(function (cue) { return cue.end >= current - 1; });
    }
    if (nextStart >= Math.min(duration, current + AHEAD_SECONDS)) {
      scheduleWork(player, POLL_MS, gen);
      return;
    }

    const clipDuration = Math.min(CHUNK_SECONDS, duration - nextStart);
    if (!Number.isFinite(clipDuration) || clipDuration < 1.2) {
      scheduleWork(player, 500, gen);
      return;
    }

    processing = true;
    const start = nextStart;
    nextStart = Math.min(duration, nextStart + clipDuration);
    try {
      const response = await fetch(CHUNK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          initData: initData(),
          playbackToken: token,
          start: start,
          duration: clipDuration,
          targetLanguage: targetLanguage,
        }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(String(data.error || "Could not generate live subtitles"));
      if (!enabled || gen !== generation) return;
      const incoming = Array.isArray(data.cues) ? data.cues : [];
      for (const cue of incoming) {
        const s = Number(cue?.start), e = Number(cue?.end), text = String(cue?.text || "").trim();
        if (!Number.isFinite(s) || !Number.isFinite(e) || !text) continue;
        cues.push({ start: s, end: Math.max(e, s + 0.2), text: text });
      }
      cues.sort(function (a, b) { return a.start - b.start; });
      cues = cues.filter(function (cue) { return cue.end >= current - 12; }).slice(-80);
    } catch (error) {
      if (enabled && gen === generation) {
        enabled = false;
        showCaption(player, String(error?.message || "Live subtitles unavailable"), true);
        updateLanguageSelection(player);
      }
    } finally {
      processing = false;
      if (enabled && gen === generation) scheduleWork(player, 20, gen);
    }
  }
  function renderCaption(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    const now = Number(video.currentTime || 0);
    let active = null;
    for (let i = cues.length - 1; i >= 0; i -= 1) {
      const cue = cues[i];
      if (cue.start <= now + 0.08 && cue.end >= now - 0.08) { active = cue; break; }
      if (cue.end < now - 2) break;
    }
    if (active) showCaption(player, active.text, false);
    else if (cues.length) hideCaption(player);
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
    if (player.dataset.vexaLiveSubtitles === "1") return;
    player.dataset.vexaLiveSubtitles = "1";
    installStyle();
    installUI(player);
    const video = player.querySelector("video");
    if (!video) return;
    video.addEventListener("seeked", function () { resetForSeek(player); });
    video.addEventListener("loadedmetadata", function () {
      if (enabled) resetForSeek(player);
    });
    video.addEventListener("emptied", function () {
      if (enabled) resetForSeek(player);
    });
    renderTimer = setInterval(function () { renderCaption(player); }, 100);
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
