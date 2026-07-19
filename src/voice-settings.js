import { requireDb } from "./state.js";

export const DEFAULT_VOICE_SETTINGS = Object.freeze({
  stability: 0.5,
});

export async function getUserVoiceSettings(env, userId) {
  await ensureVoiceSettingsTable(env);

  const row = await env.DB.prepare(
    "SELECT stability FROM user_voice_settings WHERE user_id = ?"
  ).bind(String(userId)).first();

  return normalizeVoiceSettings(row ? {
    stability: row.stability,
  } : DEFAULT_VOICE_SETTINGS);
}

export async function saveUserVoiceSettings(env, userId, settings) {
  await ensureVoiceSettingsTable(env);
  const clean = normalizeVoiceSettings(settings);

  await env.DB.prepare(
    "INSERT INTO user_voice_settings (user_id, stability, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET stability = excluded.stability, updated_at = CURRENT_TIMESTAMP"
  ).bind(
    String(userId),
    clean.stability
  ).run();

  return clean;
}

export function normalizeVoiceSettings(settings = {}) {
  return {
    stability: clamp(Number(settings.stability), 0, 1, DEFAULT_VOICE_SETTINGS.stability),
  };
}

async function ensureVoiceSettingsTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_voice_settings (user_id TEXT PRIMARY KEY, stability REAL NOT NULL DEFAULT 0.5, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
