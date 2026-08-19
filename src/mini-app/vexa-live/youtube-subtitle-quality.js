import { getContainer } from "@cloudflare/containers";
import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { DEFAULT_AI_CHAT_MODEL } from "../../ai-chat-model.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const CHUNK_PATH = "/mini-app/live/api/youtube-subtitles/chunk";
const REQUEST_MAX_SECONDS = 8;
const REQUEST_MIN_SECONDS = 1.2;
const AUDIO_OVERLAP_SECONDS = 1.5;
const STT_TIMEOUT_MS = 35_000;
const TRANSLATE_TIMEOUT_MS = 30_000;
const CONTEXT_MAX_AGE_SECONDS = 30 * 60;
const CONTEXT_MAX_GAP_SECONDS = 3.25;
const CONTEXT_CHAR_LIMIT = 1400;

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

let contextTableReady = null;

export function isVexaSubtitleQualityRequest(request) {
  return request.method === "POST" && new URL(request.url).pathname === CHUNK_PATH;
}

export async function handleVexaSubtitleQualityRequest(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await assertLiveAccess(env, user.id);

    const token = cleanToken(payload.playbackToken);
    if (!token) return json({ error: "Video session is invalid" }, 400);

    const start = finiteNumber(payload.start, 0, 24 * 60 * 60);
    const duration = finiteNumber(payload.duration, REQUEST_MIN_SECONDS, REQUEST_MAX_SECONDS);
    if (start === null || duration === null) {
      return json({ error: "Subtitle time range is invalid" }, 400);
    }

    const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
    if (!targetLanguage) return json({ error: "Subtitle language is invalid" }, 400);
    if (!env.VEXA_SUBTITLES) return json({ error: "Live subtitles are unavailable" }, 503);

    const row = await env.DB.prepare(
      "SELECT user_id, title, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
    ).bind(token).first();
    const now = Math.floor(Date.now() / 1000);
    if (!row || Number(row.expires_at || 0) <= now) {
      return json({ error: "Video session expired. Open the video again." }, 410);
    }
    if (String(row.user_id) !== String(user.id)) {
      return json({ error: "Video session does not belong to this user" }, 403);
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
      audio = await container.extractAudioClip(playbackUrl, {}, extractionStart, extractionDuration);
    } catch (error) {
      console.error("Vexa quality subtitle audio extraction failed", error?.stack || error);
      return json({ error: "Could not read this part of the video" }, 502);
    }

    const transcript = await transcribeClip(env, audio);
    const sourceLanguage = String(transcript?.language_code || "").trim().toLowerCase();
    const allCues = buildCues(transcript, extractionStart, extractionDuration);
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

    if (targetLanguage !== "original" && !sameLanguage(sourceLanguage, targetLanguage)) {
      const previous = await readTranslationContext(env, token, targetLanguage, start, now);
      const translated = await translateCues(
        env,
        cues,
        targetLanguage,
        sourceLanguage,
        previous,
      );
      const sourceTexts = cues.map((cue) => cue.text);
      cues = cues.map((cue, index) => ({ ...cue, text: translated[index] || cue.text }));
      await writeTranslationContext(
        env,
        token,
        targetLanguage,
        start + duration,
        sourceTexts,
        translated,
        now,
      );
    }

    return json({
      ok: true,
      cues,
      nextStart: roundTime(start + duration),
      sourceLanguage,
      targetLanguage,
    });
  } catch (error) {
    console.error("Vexa quality subtitle chunk failed", error?.stack || error);
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
    console.error("Vexa quality subtitle STT failed", response.status, detail.slice(0, 700));
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

  for (const item of timed) {
    const gap = previousEnd === null ? 0 : item.start - previousEnd;
    if (parts.length && gap > 0.9) flush();
    if (cueStart === null && item.type === "word") cueStart = item.start;
    if (cueStart === null) continue;
    cueEnd = item.end;
    parts.push(item.text);
    if (item.type === "word") wordCount += 1;
    previousEnd = item.end;

    const punctuation = item.type === "word" && /[.!?…؛؟]$/.test(item.text.trim());
    if ((punctuation && wordCount >= 3) || wordCount >= 12) flush();
  }
  flush();
  return cues.slice(0, 16);
}

function selectRequestedCues(cues, start, duration) {
  const end = start + duration;
  const selected = [];
  for (const cue of cues) {
    const midpoint = (Number(cue.start) + Number(cue.end)) / 2;
    if (midpoint < start - 0.04 || midpoint >= end + 0.04) continue;
    selected.push({
      start: Math.max(start, Number(cue.start)),
      end: Math.min(end + 0.35, Number(cue.end)),
      text: cue.text,
    });
  }
  return selected.slice(0, 10);
}

async function translateCues(env, cues, targetLanguage, sourceLanguage, previous) {
  if (!env.GPT_API) throw httpError("AI translation is unavailable", 503);
  const languageName = TARGET_LANGUAGES[targetLanguage];
  const texts = cues.map((cue) => cue.text);
  const context = previous || { source: "", translated: "" };

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
        instructions: [
          "You translate timed video subtitles into " + languageName + ".",
          "Translate for meaning, not word-for-word. Preserve names, numbers, tone, jokes and implied subjects naturally.",
          "The previous source/translation fields are context only; never repeat them in the output.",
          "Translate only the current segments. Keep exactly one output string for each input segment and preserve the segment order.",
          "If a sentence continues across segments, use the surrounding segments and previous context to make each subtitle natural while keeping the same segment count.",
          "Keep subtitles concise and readable. Do not add explanations, labels, quotes or commentary.",
        ].join(" "),
        input: JSON.stringify({
          detected_source_language: sourceLanguage || "unknown",
          target_language: languageName,
          previous_source_context: context.source || "",
          previous_translation_context: context.translated || "",
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
        max_output_tokens: 1000,
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
    console.error("Vexa quality subtitle translation failed", response.status, JSON.stringify(data).slice(0, 1200));
    throw httpError("AI translation is temporarily unavailable", 502);
  }

  const raw = extractResponseText(data).trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
  const translations = Array.isArray(parsed?.translations)
    ? parsed.translations.map((item) => cleanSubtitleText(item))
    : [];
  if (translations.length !== texts.length || translations.some((item) => !item)) {
    console.error("Vexa structured subtitle result invalid", raw.slice(0, 1200));
    throw httpError("AI translation returned an invalid subtitle result", 502);
  }
  return translations;
}

async function ensureContextTable(env) {
  if (!contextTableReady) {
    contextTableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_subtitle_context (" +
        "context_key TEXT PRIMARY KEY, " +
        "last_end REAL NOT NULL, " +
        "source_context TEXT NOT NULL, " +
        "translated_context TEXT NOT NULL, " +
        "updated_at INTEGER NOT NULL" +
      ")"
    ).run().catch((error) => {
      contextTableReady = null;
      throw error;
    });
  }
  await contextTableReady;
}

async function readTranslationContext(env, token, language, start, now) {
  await ensureContextTable(env);
  const row = await env.DB.prepare(
    "SELECT last_end, source_context, translated_context, updated_at FROM vexa_youtube_subtitle_context WHERE context_key = ?"
  ).bind(contextKey(token, language)).first();
  if (!row) return null;
  if (now - Number(row.updated_at || 0) > CONTEXT_MAX_AGE_SECONDS) return null;
  if (Math.abs(Number(row.last_end || 0) - Number(start || 0)) > CONTEXT_MAX_GAP_SECONDS) return null;
  return {
    source: String(row.source_context || "").slice(-CONTEXT_CHAR_LIMIT),
    translated: String(row.translated_context || "").slice(-CONTEXT_CHAR_LIMIT),
  };
}

async function writeTranslationContext(env, token, language, lastEnd, sourceTexts, translatedTexts, now) {
  await ensureContextTable(env);
  const source = cleanSubtitleText(sourceTexts.join(" ")).slice(-CONTEXT_CHAR_LIMIT);
  const translated = cleanSubtitleText(translatedTexts.join(" ")).slice(-CONTEXT_CHAR_LIMIT);
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_subtitle_context (context_key, last_end, source_context, translated_context, updated_at) " +
    "VALUES (?, ?, ?, ?, ?) ON CONFLICT(context_key) DO UPDATE SET " +
    "last_end = excluded.last_end, source_context = excluded.source_context, " +
    "translated_context = excluded.translated_context, updated_at = excluded.updated_at"
  ).bind(contextKey(token, language), Number(lastEnd), source, translated, Number(now)).run();
}

function contextKey(token, language) {
  return String(token) + ":" + String(language);
}

function extractResponseText(data) {
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part?.text === "string") chunks.push(part.text);
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

function sameLanguage(source, target) {
  const aliases = { eng: "en", fas: "fa", per: "fa", rus: "ru", deu: "de", ger: "de", tur: "tr", spa: "es", ara: "ar", fra: "fr", fre: "fr", por: "pt", ita: "it", hin: "hi", zho: "zh", chi: "zh", jpn: "ja", kor: "ko" };
  const sourceBase = aliases[String(source || "").toLowerCase()] || String(source || "").toLowerCase().split("-")[0];
  return sourceBase === String(target || "").toLowerCase();
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
