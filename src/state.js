export const DEFAULT_STATE = {
  voice: "Nora",
  output: "MP3",
  page: 0,
  menuMessageId: null,
  language: null,
  emotionActive: false,
};

export async function getState(env, userId) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT voice, output, page, menu_message_id, language FROM user_state WHERE user_id = ?"
  ).bind(String(userId)).first();

  const emotionActive = await getEmotionActive(env, userId).catch(() => false);

  if (!row) return { ...DEFAULT_STATE, emotionActive };

  return {
    voice: row.voice || DEFAULT_STATE.voice,
    output: row.output || DEFAULT_STATE.output,
    page: Number(row.page || 0),
    menuMessageId: row.menu_message_id ? Number(row.menu_message_id) : null,
    language: row.language || null,
    emotionActive,
  };
}

export async function saveState(env, userId, state) {
  requireDb(env);

  const cleanState = {
    voice: state.voice || DEFAULT_STATE.voice,
    output: state.output || DEFAULT_STATE.output,
    page: Number(state.page || 0),
    menuMessageId: state.menuMessageId ? Number(state.menuMessageId) : null,
    language: state.language || null,
  };

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, language, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, language = excluded.language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId, cleanState.language).run();
}

export async function setMenuMessageId(env, userId, messageId) {
  const state = await getState(env, userId);
  state.menuMessageId = messageId ? Number(messageId) : null;
  await saveState(env, userId, state);
}

export async function setUserLanguage(env, userId, language) {
  const state = await getState(env, userId);
  state.language = language;
  await saveState(env, userId, state);
}

export async function isEmotionActive(env, userId) {
  return getEmotionActive(env, userId);
}

export async function toggleEmotionActive(env, userId) {
  const next = !(await getEmotionActive(env, userId).catch(() => false));
  await setEmotionActive(env, userId, next);
  return next;
}

export async function setEmotionActive(env, userId, active) {
  await ensureEmotionSessionTable(env);
  await env.DB.prepare(
    "INSERT INTO emotion_sessions (user_id, is_active, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET is_active = excluded.is_active, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), active ? 1 : 0).run();
}

async function getEmotionActive(env, userId) {
  await ensureEmotionSessionTable(env);
  const row = await env.DB.prepare(
    "SELECT is_active FROM emotion_sessions WHERE user_id = ?"
  ).bind(String(userId)).first();
  return Number(row && row.is_active ? row.is_active : 0) === 1;
}

async function ensureEmotionSessionTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS emotion_sessions (user_id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 DB binding is missing. Create D1 and add binding DB in wrangler.toml.");
  }
}
