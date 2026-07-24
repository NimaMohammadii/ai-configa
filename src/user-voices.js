import { requireDb } from "./state.js";
import { VOICES } from "./voices.js";

export const MAX_SAVED_VOICES = 6;
export const DEFAULT_SAVED_VOICES = ["Milo", "Sia", "Jaxon", "Lyra", "Atlas", "Jessica"];

export async function getUserVoices(env, userId, fallbackVoice = "Nora") {
  requireDb(env);
  await ensureUserVoicesTable(env);

  const owner = String(userId);
  let voices = await readUserVoices(env, owner);
  const defaultVoices = DEFAULT_SAVED_VOICES.filter((voice) => Boolean(VOICES[voice])).slice(0, MAX_SAVED_VOICES);

  if (!voices.length) {
    const insertDefaultVoice = env.DB.prepare(
      "INSERT OR IGNORE INTO mini_app_user_voices (user_id, voice, position, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    );
    await env.DB.batch(defaultVoices.map((voice, position) => insertDefaultVoice.bind(owner, voice, position)));
    voices = await readUserVoices(env, owner);
  }

  return voices;
}

export async function updateUserVoice(env, userId, voice, action, fallbackVoice = "Nora") {
  requireDb(env);
  await ensureUserVoicesTable(env);

  const owner = String(userId);
  const cleanVoice = String(voice || "").trim();
  if (!VOICES[cleanVoice]) throw httpError("Voice not found.", 404);

  if (action === "add") {
    const result = await env.DB.prepare(
      "INSERT INTO mini_app_user_voices (user_id, voice, position, created_at, updated_at) " +
      "SELECT ?, ?, COALESCE(MAX(position), -1) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM mini_app_user_voices WHERE user_id = ? " +
      "HAVING COUNT(*) < ? ON CONFLICT(user_id, voice) DO NOTHING"
    ).bind(owner, cleanVoice, owner, MAX_SAVED_VOICES).run();

    if (!Number(result?.meta?.changes || 0)) {
      const existing = await env.DB.prepare(
        "SELECT 1 AS found FROM mini_app_user_voices WHERE user_id = ? AND voice = ?"
      ).bind(owner, cleanVoice).first();
      if (!existing) throw httpError(`You can save up to ${MAX_SAVED_VOICES} voices.`, 409);
    }
  } else if (action === "remove") {
    await env.DB.prepare(
      "DELETE FROM mini_app_user_voices WHERE user_id = ? AND voice = ?"
    ).bind(owner, cleanVoice).run();
  } else {
    throw httpError("Invalid voice action.", 400);
  }

  const voices = await readUserVoices(env, owner);
  if (voices.length) return voices;

  if (action === "remove") return [];
  return getUserVoices(env, owner, fallbackVoice);
}

async function readUserVoices(env, userId) {
  const result = await env.DB.prepare(
    "SELECT voice FROM mini_app_user_voices WHERE user_id = ? ORDER BY position ASC, created_at ASC"
  ).bind(String(userId)).all();

  return (result.results || [])
    .map((row) => String(row.voice || "").trim())
    .filter((voice) => Boolean(VOICES[voice]))
    .slice(0, MAX_SAVED_VOICES);
}

async function ensureUserVoicesTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS mini_app_user_voices (" +
    "user_id TEXT NOT NULL, voice TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, " +
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
    "PRIMARY KEY (user_id, voice))"
  ).run();
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
