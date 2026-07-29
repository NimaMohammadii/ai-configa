import { getBalance, spendCredits } from "./credits.js";
import { textToSpeechWithTimestamps } from "./elevenlabs.js";
import { ensureTtsHistoryTable } from "./tts-history.js";

const MAX_EDIT_CHARS = 5000;
const MAX_EDIT_AUDIO_BYTES = 32 * 1024 * 1024;
const EDIT_SESSION_TTL_SECONDS = 15 * 60;
const AUDIO_PREFIX = "tts-audio";

export async function saveEditableTtsHistory(env, input) {
  await ensureEditingStorage(env);
  const id = crypto.randomUUID();
  const userId = String(input.userId);
  const sequence = Number(input.fileSequence || 1);
  const audio = toArrayBuffer(input.audio);
  const key = audioKey(userId, id, 0, "mp3");

  await putAudio(env, key, audio, "audio/mpeg");
  await env.DB.prepare(
    "INSERT INTO tts_history (id, user_id, text, voice, language, credits, file_sequence, audio_base64, file_id, file_type, telegram_message_id, source, audio_r2_key, audio_mime, alignment_json, edit_revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, NULL, 'mini_app', ?, 'audio/mpeg', ?, 0, CURRENT_TIMESTAMP)"
  ).bind(
    id,
    userId,
    String(input.text || ""),
    String(input.voice || ""),
    String(input.language || "en"),
    Number(input.credits || 0),
    sequence,
    key,
    JSON.stringify(normalizeAlignment(input.alignment))
  ).run();

  return { id, revision: 0, key };
}

export async function getEditableTtsAudio(env, userId, historyId) {
  await ensureEditingStorage(env);
  const row = await env.DB.prepare(
    "SELECT id, file_sequence, audio_r2_key, audio_mime, edit_revision FROM tts_history WHERE id = ? AND user_id = ?"
  ).bind(String(historyId), String(userId)).first();
  if (!row?.audio_r2_key) return null;

  const object = await audioBucket(env).get(String(row.audio_r2_key));
  if (!object) return null;

  return {
    id: row.id,
    fileSequence: Number(row.file_sequence || 1),
    mimeType: String(row.audio_mime || "audio/mpeg"),
    revision: Number(row.edit_revision || 0),
    audio: await object.arrayBuffer(),
  };
}

export async function regenerateTtsSelection(env, input) {
  await ensureEditingStorage(env);
  const userId = String(input.userId);
  const historyId = String(input.historyId || "");
  const expectedRevision = Number(input.revision || 0);
  const row = await env.DB.prepare(
    "SELECT id, text, voice, language, file_sequence, alignment_json, edit_revision FROM tts_history WHERE id = ? AND user_id = ? AND source = 'mini_app'"
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

  const alignment = normalizeAlignment(parseJson(row.alignment_json));
  if (!alignmentMatches(alignment, oldChars)) {
    throw httpError("This voice does not have accurate edit timing.", 409);
  }

  const window = findRegenerationWindow(oldChars, start, end, replacementChars.length);
  const windowStart = window.start;
  const windowEnd = window.end;
  const regenerationText =
    oldChars.slice(windowStart, start).join("") +
    replacement +
    oldChars.slice(end, windowEnd).join("");
  const regenerationChars = Array.from(regenerationText);

  const startTime = Number(alignment.character_start_times_seconds[windowStart]);
  const endTime = Number(alignment.character_end_times_seconds[windowEnd - 1]);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw httpError("Could not locate a natural sentence boundary in the audio.", 409);
  }

  const cost = replacementChars.length + 50;
  const balance = await getBalance(env, userId);
  if (balance < cost) throw httpError("Not enough credits.", 402);

  const voiceId = String(input.voiceId || "");
  if (!voiceId) throw httpError("Voice not found.", 404);

  const generated = await textToSpeechWithTimestamps(
    env,
    regenerationText,
    voiceId,
    String(row.language || "en")
  );

  const replacementAlignment = normalizeAlignment(generated.alignment);
  if (!alignmentMatches(replacementAlignment, regenerationChars)) {
    throw httpError("The regenerated sentence timing was incomplete. Try again.", 502);
  }

  const newText = oldChars.slice(0, start).join("") + replacement + oldChars.slice(end).join("");
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

export async function saveManualTtsAudioEdit(env, input) {
  await ensureEditingStorage(env);
  const userId = String(input.userId);
  const historyId = String(input.historyId || "");
  const expectedRevision = Number(input.revision || 0);
  const row = await env.DB.prepare(
    "SELECT id, text, file_sequence, edit_revision, audio_r2_key FROM tts_history WHERE id = ? AND user_id = ? AND source = 'mini_app'"
  ).bind(historyId, userId).first();

  if (!row) throw httpError("Voice history was not found.", 404);
  if (Number(row.edit_revision || 0) !== expectedRevision) {
    throw httpError("This voice was already updated. Open the editor again.", 409);
  }

  const mimeType = String(input.mimeType || "audio/wav").toLowerCase();
  if (mimeType !== "audio/wav") throw httpError("Audio fine-tuning must be saved as WAV.", 400);
  const audio = base64ToArrayBuffer(String(input.audioBase64 || ""));
  if (!audio.byteLength || audio.byteLength > MAX_EDIT_AUDIO_BYTES) {
    throw httpError("The edited audio is too large.", 413);
  }

  const nextRevision = expectedRevision + 1;
  const key = audioKey(userId, historyId, nextRevision, "wav");
  await putAudio(env, key, audio, mimeType);

  const result = await env.DB.prepare(
    "UPDATE tts_history SET audio_base64 = '', audio_r2_key = ?, audio_mime = ?, alignment_json = '', edit_revision = ? WHERE id = ? AND user_id = ? AND edit_revision = ?"
  ).bind(key, mimeType, nextRevision, historyId, userId, expectedRevision).run();

  if (!Number(result?.meta?.changes || 0)) {
    await audioBucket(env).delete(key).catch(() => null);
    throw httpError("This voice was already updated.", 409);
  }

  await env.DB.prepare("DELETE FROM tts_edit_sessions WHERE history_id = ? AND user_id = ?")
    .bind(historyId, userId)
    .run()
    .catch(() => null);
  if (row.audio_r2_key && row.audio_r2_key !== key) {
    await audioBucket(env).delete(String(row.audio_r2_key)).catch(() => null);
  }

  return {
    id: historyId,
    revision: nextRevision,
    text: String(row.text || ""),
    mimeType,
    editable: false,
    filename: "Vexa " + String(Number(row.file_sequence || 1)).padStart(4, "0") + " fine-tuned.wav",
  };
}

export async function commitTtsEdit(env, input) {
  await ensureEditingStorage(env);
  const userId = String(input.userId);
  const token = String(input.token || "");
  const session = await env.DB.prepare(
    "SELECT token, history_id, expected_revision, new_text, new_alignment_json, credits FROM tts_edit_sessions WHERE token = ? AND user_id = ? AND datetime(expires_at) > datetime('now')"
  ).bind(token, userId).first();

  if (!session) throw httpError("This edit expired. Please regenerate it again.", 410);

  const record = await env.DB.prepare(
    "SELECT id, file_sequence, edit_revision, audio_r2_key FROM tts_history WHERE id = ? AND user_id = ?"
  ).bind(String(session.history_id), userId).first();
  if (!record) throw httpError("Voice history was not found.", 404);
  if (Number(record.edit_revision || 0) !== Number(session.expected_revision || 0)) {
    throw httpError("This voice was already updated.", 409);
  }

  const mimeType = String(input.mimeType || "audio/wav").toLowerCase();
  if (mimeType !== "audio/wav" && mimeType !== "audio/mpeg") {
    throw httpError("Unsupported edited audio format.", 400);
  }

  const audio = base64ToArrayBuffer(String(input.audioBase64 || ""));
  if (!audio.byteLength || audio.byteLength > MAX_EDIT_AUDIO_BYTES) {
    throw httpError("The edited audio is too large.", 413);
  }

  const nextRevision = Number(record.edit_revision || 0) + 1;
  const extension = mimeType === "audio/mpeg" ? "mp3" : "wav";
  const key = audioKey(userId, String(session.history_id), nextRevision, extension);
  await putAudio(env, key, audio, mimeType);

  const result = await env.DB.prepare(
    "UPDATE tts_history SET text = ?, credits = credits + ?, audio_base64 = '', audio_r2_key = ?, audio_mime = ?, alignment_json = ?, edit_revision = ? WHERE id = ? AND user_id = ? AND edit_revision = ?"
  ).bind(
    String(session.new_text || ""),
    Number(session.credits || 0),
    key,
    mimeType,
    String(session.new_alignment_json || ""),
    nextRevision,
    String(session.history_id),
    userId,
    Number(session.expected_revision || 0)
  ).run();

  if (!Number(result?.meta?.changes || 0)) {
    await audioBucket(env).delete(key).catch(() => null);
    throw httpError("This voice was already updated.", 409);
  }

  await env.DB.prepare("DELETE FROM tts_edit_sessions WHERE token = ?").bind(token).run();
  if (record.audio_r2_key && record.audio_r2_key !== key) {
    await audioBucket(env).delete(String(record.audio_r2_key)).catch(() => null);
  }

  return {
    id: String(session.history_id),
    revision: nextRevision,
    text: String(session.new_text || ""),
    alignment: normalizeAlignment(parseJson(session.new_alignment_json)),
    mimeType,
    filename: "Vexa " + String(Number(record.file_sequence || 1)).padStart(4, "0") + " edited." + extension,
  };
}

async function ensureEditingStorage(env) {
  await ensureTtsHistoryTable(env);
  if (!env.DB) throw httpError("Database is not configured.", 500);
  if (!env.EXPLORE_MEDIA) throw httpError("Audio storage is not configured.", 500);

  const columns = [
    "audio_r2_key TEXT",
    "audio_mime TEXT NOT NULL DEFAULT 'audio/mpeg'",
    "alignment_json TEXT NOT NULL DEFAULT ''",
    "edit_revision INTEGER NOT NULL DEFAULT 0",
  ];
  for (const column of columns) {
    await env.DB.prepare("ALTER TABLE tts_history ADD COLUMN " + column).run().catch(() => null);
  }

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

function findRegenerationWindow(chars, start, end, replacementLength) {
  const maxWindow = 900;
  const availableContext = Math.max(
    0,
    Math.min(MAX_EDIT_CHARS - replacementLength, maxWindow - replacementLength)
  );
  const leftBudget = Math.floor(availableContext / 2);
  const rightBudget = availableContext - leftBudget;
  return {
    start: findSentenceStart(chars, start, leftBudget),
    end: findSentenceEnd(chars, end, rightBudget),
  };
}

function findSentenceStart(chars, start, budget) {
  if (start <= 0 || budget <= 0) return start;
  const minimum = Math.max(0, start - budget);
  for (let index = start - 1; index >= minimum; index -= 1) {
    if (!isSentenceBoundary(chars[index])) continue;
    let boundary = index + 1;
    while (boundary < start && isWhitespace(chars[boundary])) boundary += 1;
    return boundary;
  }
  if (minimum === 0) return 0;
  let boundary = minimum;
  while (boundary < start && !isWhitespace(chars[boundary - 1])) boundary += 1;
  while (boundary < start && isWhitespace(chars[boundary])) boundary += 1;
  return boundary;
}

function findSentenceEnd(chars, end, budget) {
  if (end >= chars.length || budget <= 0) return end;
  const maximum = Math.min(chars.length, end + budget);
  for (let index = end; index < maximum; index += 1) {
    if (isSentenceBoundary(chars[index])) return index + 1;
  }
  if (maximum === chars.length) return chars.length;
  let boundary = maximum;
  while (boundary > end && !isWhitespace(chars[boundary - 1])) boundary -= 1;
  return boundary > end ? boundary : end;
}

function isSentenceBoundary(character) {
  return ".!?؟。！？\n\r".includes(String(character || ""));
}

function isWhitespace(character) {
  return /\s/u.test(String(character || ""));
}

function mergeAlignments(original, replacement, start, end, startTime, endTime) {
  const replacementDuration = Math.max(
    0,
    Number(replacement.character_end_times_seconds.at(-1) || 0)
  );
  const shift = startTime + replacementDuration - endTime;
  const characters = [
    ...original.characters.slice(0, start),
    ...replacement.characters,
    ...original.characters.slice(end),
  ];
  const starts = [
    ...original.character_start_times_seconds.slice(0, start),
    ...replacement.character_start_times_seconds.map((value) => Number(value) + startTime),
    ...original.character_start_times_seconds.slice(end).map((value) => Number(value) + shift),
  ];
  const ends = [
    ...original.character_end_times_seconds.slice(0, start),
    ...replacement.character_end_times_seconds.map((value) => Number(value) + startTime),
    ...original.character_end_times_seconds.slice(end).map((value) => Number(value) + shift),
  ];
  return {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
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

function audioBucket(env) {
  return env.EXPLORE_MEDIA;
}

async function putAudio(env, key, audio, contentType) {
  await audioBucket(env).put(key, audio, {
    httpMetadata: { contentType },
    customMetadata: { kind: "tts-editable-audio" },
  });
}

function audioKey(userId, historyId, revision, extension) {
  return AUDIO_PREFIX + "/" + encodeURIComponent(userId) + "/" + historyId + "/revision-" + revision + "." + extension;
}

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return new ArrayBuffer(0);
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
  const clean = String(value || "").replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
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
