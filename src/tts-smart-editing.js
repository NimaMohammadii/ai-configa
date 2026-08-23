import { creditsForUsdMicros, getBalance, spendCredits, TTS_USD_MICROS_PER_CHARACTER } from "./credits.js";
import { getSelectedElevenApiKey } from "./elevenlabs.js";
import { ensureTtsHistoryTable } from "./tts-history.js";
import { VOICES } from "./voices.js";

const MAX_EDIT_CHARS = 5000;
const MAX_REGEN_CONTEXT_CHARS = 2200;
const EDIT_SESSION_TTL_SECONDS = 15 * 60;
const ELEVEN_TIMEOUT_MS = 80_000;

export async function regenerateSmartTtsSelection(env, input) {
  await ensureSmartEditingStorage(env);
  const userId = String(input.userId);
  const historyId = String(input.historyId || "");
  const expectedRevision = Number(input.revision || 0);
  const row = await env.DB.prepare(
    "SELECT id, text, voice, language, file_sequence, alignment_json, edit_revision, tts_seed FROM tts_history WHERE id = ? AND user_id = ? AND source = 'mini_app'"
  ).bind(historyId, userId).first();

  if (!row) throw httpError("Voice history was not found.", 404);
  if (Number(row.edit_revision || 0) !== expectedRevision) {
    throw httpError("This voice was already updated. Open Edit again.", 409);
  }

  const oldChars = Array.from(String(row.text || ""));
  const start = clampInteger(input.start, 0, oldChars.length);
  const end = clampInteger(input.end, start, oldChars.length);
  const replacement = String(input.replacement || "");
  const replacementChars = Array.from(replacement);

  if (end <= start) throw httpError("Select a part of the text first.", 400);
  if (!replacementChars.length) throw httpError("The edited text cannot be empty.", 400);
  if (replacementChars.length > MAX_EDIT_CHARS) throw httpError("The edited section is too long.", 400);

  const newText = oldChars.slice(0, start).join("") + replacement + oldChars.slice(end).join("");
  if (Array.from(newText).length > MAX_EDIT_CHARS) {
    throw httpError("The edited text is too long.", 400);
  }

  const alignment = normalizeAlignment(parseJson(row.alignment_json));
  if (!alignmentMatches(alignment, oldChars)) {
    throw httpError("This voice does not have accurate edit timing.", 409);
  }

  const sentence = sentenceRange(oldChars, start, end);
  const window = findPerformanceWindow(oldChars, start, end, replacementChars.length, sentence);
  const windowStart = window.start;
  const windowEnd = window.end;
  const regenerationText =
    oldChars.slice(windowStart, start).join("") +
    replacement +
    oldChars.slice(end, windowEnd).join("");
  const regenerationChars = Array.from(regenerationText);

  const startTime = alignmentBoundaryTime(alignment, windowStart);
  const endTime = alignmentBoundaryTime(alignment, windowEnd);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw httpError("Could not locate a natural phrase boundary in the audio.", 409);
  }

  const cost = creditsForUsdMicros(10_000 + replacementChars.length * TTS_USD_MICROS_PER_CHARACTER);
  const balance = await getBalance(env, userId);
  if (balance < cost) throw httpError("Not enough credits.", 402);

  const storedVoiceId = VOICES[String(row.voice || "")] || "";
  const suppliedVoiceId = String(input.voiceId || "");
  const voiceId = storedVoiceId || suppliedVoiceId;
  if (!voiceId) throw httpError("Voice not found.", 404);
  if (storedVoiceId && suppliedVoiceId && storedVoiceId !== suppliedVoiceId) {
    throw httpError("The voice changed. Generate the text again before editing it.", 409);
  }

  let seed = normalizeSeed(row.tts_seed);
  if (seed == null) {
    seed = stableSeed(historyId);
    await env.DB.prepare("UPDATE tts_history SET tts_seed = ? WHERE id = ? AND user_id = ? AND tts_seed IS NULL")
      .bind(seed, historyId, userId)
      .run()
      .catch(() => null);
  }

  const performance = normalizePerformanceProfile(input.performanceProfile);
  const hasExplicitDirection = hasNearbyAudioTag(oldChars, sentence.start, sentence.end);
  const directive = hasExplicitDirection ? "" : buildPerformanceDirective(performance);
  const editSentenceOffset = Math.max(0, Math.min(regenerationChars.length, sentence.start - windowStart));
  const directedText = directive
    ? regenerationText.slice(0, editSentenceOffset) + directive + regenerationText.slice(editSentenceOffset)
    : regenerationText;

  let generated = await generateV3WithTimestamps(env, directedText, voiceId, seed);
  let replacementAlignment = extractCoreAlignment(
    generated.alignment,
    regenerationText,
    directedText,
    directive,
    editSentenceOffset
  );

  if (!alignmentMatches(replacementAlignment, regenerationChars) && directive) {
    generated = await generateV3WithTimestamps(env, regenerationText, voiceId, seed);
    replacementAlignment = normalizeAlignment(generated.alignment);
  }

  if (!alignmentMatches(replacementAlignment, regenerationChars)) {
    throw httpError("The regenerated context timing was incomplete. Try again.", 502);
  }

  const newAlignment = mergeAlignments(
    alignment,
    replacementAlignment,
    windowStart,
    windowEnd,
    startTime,
    endTime
  );

  const spent = await spendCredits(env, userId, cost, "mini_app_tts_edit", {
    historyId,
    revision: expectedRevision,
    voice: String(row.voice || ""),
    language: String(row.language || "en"),
    start,
    end,
    regenerationStart: windowStart,
    regenerationEnd: windowEnd,
    performanceAware: true,
    performanceDirection: directive.trim() || null,
    seed,
  });
  if (!spent?.ok) throw httpError("Not enough credits.", 402);

  const token = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO tts_edit_sessions (token, user_id, history_id, expected_revision, new_text, new_alignment_json, credits, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, datetime('now', ?))"
  ).bind(
    token,
    userId,
    historyId,
    expectedRevision,
    newText,
    JSON.stringify(newAlignment),
    cost,
    "+" + EDIT_SESSION_TTL_SECONDS + " seconds"
  ).run();

  return {
    token,
    historyId,
    revision: expectedRevision,
    start,
    end,
    regenerationStart: windowStart,
    regenerationEnd: windowEnd,
    startTime,
    endTime,
    replacement,
    newText,
    newAlignment,
    replacementAudioBase64: arrayBufferToBase64(generated.audio),
    replacementMimeType: "audio/mpeg",
    cost,
    balance: Number(spent.balance || 0),
  };
}

async function ensureSmartEditingStorage(env) {
  await ensureTtsHistoryTable(env);
  if (!env.DB) throw httpError("Database is not configured.", 500);
  await env.DB.prepare("ALTER TABLE tts_history ADD COLUMN tts_seed INTEGER").run().catch(() => null);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS tts_edit_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, history_id TEXT NOT NULL, expected_revision INTEGER NOT NULL, new_text TEXT NOT NULL, new_alignment_json TEXT NOT NULL, credits INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tts_edit_sessions_expiry ON tts_edit_sessions (expires_at)"
  ).run();
  await env.DB.prepare(
    "DELETE FROM tts_edit_sessions WHERE datetime(expires_at) <= datetime('now')"
  ).run().catch(() => null);
}

function findPerformanceWindow(chars, editStart, editEnd, replacementLength, editSentence) {
  let start = editSentence.start;
  let end = editSentence.end;
  const projectedLength = (from, to) => to - from - (editEnd - editStart) + replacementLength;

  for (let round = 0; round < 2; round += 1) {
    const left = previousSentenceRange(chars, start);
    if (left && projectedLength(left.start, end) <= MAX_REGEN_CONTEXT_CHARS) start = left.start;
    const right = nextSentenceRange(chars, end);
    if (right && projectedLength(start, right.end) <= MAX_REGEN_CONTEXT_CHARS) end = right.end;
  }

  if (projectedLength(start, end) > MAX_EDIT_CHARS) {
    start = editSentence.start;
    end = editSentence.end;
  }

  return { start, end };
}

function sentenceRange(chars, start, end) {
  let from = Math.max(0, Math.min(chars.length, start));
  let to = Math.max(from, Math.min(chars.length, end));
  while (from > 0 && !isSentenceBoundary(chars[from - 1])) from -= 1;
  while (from < start && isWhitespace(chars[from])) from += 1;
  while (to < chars.length && !isSentenceBoundary(chars[to])) to += 1;
  if (to < chars.length) to += 1;
  return { start: from, end: Math.max(from + 1, to) };
}

function previousSentenceRange(chars, currentStart) {
  if (currentStart <= 0) return null;
  let end = currentStart;
  while (end > 0 && isWhitespace(chars[end - 1])) end -= 1;
  if (end <= 0) return null;
  let cursor = end - 1;
  if (isSentenceBoundary(chars[cursor])) cursor -= 1;
  while (cursor >= 0 && !isSentenceBoundary(chars[cursor])) cursor -= 1;
  let start = cursor + 1;
  while (start < end && isWhitespace(chars[start])) start += 1;
  return end > start ? { start, end } : null;
}

function nextSentenceRange(chars, currentEnd) {
  let start = Math.max(0, currentEnd);
  while (start < chars.length && isWhitespace(chars[start])) start += 1;
  if (start >= chars.length) return null;
  let end = start;
  while (end < chars.length && !isSentenceBoundary(chars[end])) end += 1;
  if (end < chars.length) end += 1;
  return end > start ? { start, end } : null;
}

function isSentenceBoundary(character) {
  return ".!?؟。！？\n\r".includes(String(character || ""));
}

function isWhitespace(character) {
  return /\s/u.test(String(character || ""));
}

function hasNearbyAudioTag(chars, start, end) {
  const from = Math.max(0, start - 96);
  const to = Math.min(chars.length, end + 48);
  return /\[[^\]\n\r]{1,48}\]/u.test(chars.slice(from, to).join(""));
}

function buildPerformanceDirective(profile) {
  if (!profile?.target) return "";
  const target = profile.target;
  const tags = [];
  const rms = Number(target.rmsDb);
  const relativeEnergy = Number(profile.relativeEnergyDb);
  const paceRatio = Number(profile.paceRatio);
  const variation = Number(target.pitchVariation);
  const dynamic = Number(target.dynamic);

  const quiet = Number.isFinite(rms) && (rms <= -29 || (rms <= -24 && relativeEnergy <= -3.5));
  const loud = Number.isFinite(rms) && (rms >= -16 || relativeEnergy >= 4.5);
  const verySteady = Number.isFinite(variation) && variation <= 0.055 && Number.isFinite(dynamic) && dynamic <= 0.72;

  if (quiet && verySteady) {
    tags.push("[calm]", "[softly]");
  } else if (quiet) {
    tags.push("[softly]");
  } else if (loud) {
    tags.push("[energetic]");
  }

  if (tags.length < 2 && Number.isFinite(paceRatio)) {
    if (paceRatio <= 0.76) tags.push("[slowly]");
    else if (paceRatio >= 1.3) tags.push("[quickly]");
  }

  if (
    tags.length < 2 &&
    ((Number.isFinite(variation) && variation >= 0.135) || (Number.isFinite(dynamic) && dynamic >= 1.05))
  ) {
    tags.push("[expressive]");
  }

  return tags.length ? tags.slice(0, 2).join(" ") + " " : "";
}

function normalizePerformanceProfile(value) {
  if (!value || typeof value !== "object") return null;
  const metric = (source) => {
    if (!source || typeof source !== "object") return null;
    return {
      rmsDb: finiteClamp(source.rmsDb, -72, 0),
      peak: finiteClamp(source.peak, 0, 1.5),
      dynamic: finiteClamp(source.dynamic, 0, 3),
      pitchHz: finiteClamp(source.pitchHz, 0, 600),
      pitchVariation: finiteClamp(source.pitchVariation, 0, 1),
      charsPerSecond: finiteClamp(source.charsPerSecond, 0, 80),
      duration: finiteClamp(source.duration, 0, 120),
    };
  };
  const target = metric(value.target);
  if (!target) return null;
  return {
    target,
    before: metric(value.before),
    after: metric(value.after),
    relativeEnergyDb: finiteClamp(value.relativeEnergyDb, -24, 24),
    paceRatio: finiteClamp(value.paceRatio, 0.25, 4),
    pauseBeforeMs: finiteClamp(value.pauseBeforeMs, 0, 2500),
    pauseAfterMs: finiteClamp(value.pauseAfterMs, 0, 2500),
  };
}

function finiteClamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

async function generateV3WithTimestamps(env, text, voiceId, seed) {
  const apiKey = await getSelectedElevenApiKey(env);
  if (!apiKey) throw httpError("The voice service is not configured yet.", 503);
  const cleanText = String(text || "");
  if (!cleanText.trim()) throw httpError("The edited text is empty.", 400);
  if (Array.from(cleanText).length > MAX_EDIT_CHARS + 160) {
    throw httpError("The regenerated context is too long.", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVEN_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId) + "/with-timestamps?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_v3",
          seed,
        }),
        signal: controller.signal,
      }
    );
  } catch (error) {
    if (error?.name === "AbortError") throw httpError("Voice regeneration took too long. Try again.", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    if (response.status === 429) throw httpError("The voice service is busy. Try again in a moment.", 429);
    if (response.status === 401 || response.status === 403) throw httpError("Voice service connection error.", 502);
    console.error("smart TTS edit generation failed", response.status, raw.slice(0, 500));
    throw httpError("Could not regenerate this voice section.", response.status >= 500 ? 503 : 502);
  }

  const payload = await response.json().catch(() => null);
  const audioBase64 = String(payload?.audio_base64 || "");
  if (!audioBase64) throw httpError("The voice service returned incomplete audio.", 502);
  return {
    audio: base64ToArrayBuffer(audioBase64),
    alignment: payload?.alignment || payload?.normalized_alignment || null,
  };
}

function extractCoreAlignment(rawAlignment, coreText, directedText, directive, insertionOffset) {
  const alignment = normalizeAlignment(rawAlignment);
  if (!alignment) return normalizeAlignment(null);
  const joined = alignment.characters.join("");
  if (joined === coreText) return alignment;
  if (!directive || joined !== directedText) return alignment;

  const start = Math.max(0, Math.min(alignment.characters.length, insertionOffset));
  const removeLength = Array.from(directive).length;
  const end = Math.min(alignment.characters.length, start + removeLength);
  return {
    characters: [...alignment.characters.slice(0, start), ...alignment.characters.slice(end)],
    character_start_times_seconds: [
      ...alignment.character_start_times_seconds.slice(0, start),
      ...alignment.character_start_times_seconds.slice(end),
    ],
    character_end_times_seconds: [
      ...alignment.character_end_times_seconds.slice(0, start),
      ...alignment.character_end_times_seconds.slice(end),
    ],
  };
}

function alignmentBoundaryTime(alignment, index) {
  const total = alignment.characters.length;
  if (!total) return 0;
  if (index <= 0) return Math.max(0, Number(alignment.character_start_times_seconds[0]) || 0);
  if (index >= total) return Math.max(0, Number(alignment.character_end_times_seconds[total - 1]) || 0);
  const left = Number(alignment.character_end_times_seconds[index - 1]);
  const right = Number(alignment.character_start_times_seconds[index]);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return right >= left ? (left + right) / 2 : right;
  }
  return Number.isFinite(right) ? right : left;
}

function mergeAlignments(original, replacement, start, end, startTime, endTime) {
  const replacementDuration = Math.max(0, Number(replacement.character_end_times_seconds.at(-1) || 0));
  const shift = startTime + replacementDuration - endTime;
  return {
    characters: [
      ...original.characters.slice(0, start),
      ...replacement.characters,
      ...original.characters.slice(end),
    ],
    character_start_times_seconds: [
      ...original.character_start_times_seconds.slice(0, start),
      ...replacement.character_start_times_seconds.map((value) => Number(value) + startTime),
      ...original.character_start_times_seconds.slice(end).map((value) => Number(value) + shift),
    ],
    character_end_times_seconds: [
      ...original.character_end_times_seconds.slice(0, start),
      ...replacement.character_end_times_seconds.map((value) => Number(value) + startTime),
      ...original.character_end_times_seconds.slice(end).map((value) => Number(value) + shift),
    ],
  };
}

function normalizeAlignment(value) {
  const alignment = value && typeof value === "object" ? value : {};
  return {
    characters: Array.isArray(alignment.characters) ? alignment.characters.map(String) : [],
    character_start_times_seconds: Array.isArray(alignment.character_start_times_seconds)
      ? alignment.character_start_times_seconds.map(Number)
      : [],
    character_end_times_seconds: Array.isArray(alignment.character_end_times_seconds)
      ? alignment.character_end_times_seconds.map(Number)
      : [],
  };
}

function alignmentMatches(alignment, chars) {
  return (
    alignment.characters.length === chars.length &&
    alignment.character_start_times_seconds.length === chars.length &&
    alignment.character_end_times_seconds.length === chars.length &&
    alignment.characters.join("") === chars.join("")
  );
}

function normalizeSeed(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4_294_967_295) return null;
  return number;
}

function stableSeed(value) {
  const text = String(value || "vexa");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value || "").replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function parseJson(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(String(value), 10);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
