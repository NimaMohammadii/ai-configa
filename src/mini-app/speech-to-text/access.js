import { requireDb } from "../../state.js";

const ADMIN_ONLY_KEY = "speech_to_text_admin_only";
const LOCKED_FROM_KEY = "speech_to_text_locked_from";
const LOCKED_UNTIL_KEY = "speech_to_text_locked_until";

export async function getSpeechToTextAccessSettings(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  const rows = await env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)"
  ).bind(
    ADMIN_ONLY_KEY,
    LOCKED_FROM_KEY,
    LOCKED_UNTIL_KEY,
  ).all();

  const values = Object.fromEntries(
    (rows.results || []).map((row) => [row.key, row.value])
  );

  const lockedFrom = positiveInteger(values[LOCKED_FROM_KEY]);
  const lockedUntil = positiveInteger(values[LOCKED_UNTIL_KEY]);
  const now = Math.floor(Date.now() / 1000);
  const timedLockActive = lockedUntil > now;

  if (values[ADMIN_ONLY_KEY] === "1" && lockedUntil > 0 && !timedLockActive) {
    await setSpeechToTextAccessSettings(env, false, 0, 0);
    return {
      adminOnly: false,
      lockedFrom: 0,
      lockedUntil: 0,
      remainingSeconds: 0,
    };
  }

  return {
    adminOnly: values[ADMIN_ONLY_KEY] === "1",
    lockedFrom,
    lockedUntil,
    remainingSeconds: timedLockActive ? lockedUntil - now : 0,
  };
}

export async function setSpeechToTextAccessSettings(
  env,
  adminOnly,
  lockedUntil = 0,
  lockedFrom = 0,
) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  await Promise.all([
    setSetting(env, ADMIN_ONLY_KEY, adminOnly ? "1" : "0"),
    setSetting(env, LOCKED_FROM_KEY, String(positiveInteger(lockedFrom))),
    setSetting(env, LOCKED_UNTIL_KEY, String(positiveInteger(lockedUntil))),
  ]);
}

// Compatibility exports used by the moved legacy STT/voice code. The storage
// underneath is now Speech-to-Text specific and no longer shares Vexa Live's lock.
export const getVexaLiveAccessSettings = getSpeechToTextAccessSettings;
export const setVexaLiveAccessSettings = setSpeechToTextAccessSettings;

async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(key, value).run();
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (" +
      "key TEXT PRIMARY KEY, " +
      "value TEXT, " +
      "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP" +
    ")"
  ).run();
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
