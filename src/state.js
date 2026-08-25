export const APP_MODES = Object.freeze(["tts", "image", "explore", "ai_chat", "stt", "live"]);

export const DEFAULT_STATE = {
  voice: "Nora",
  output: "MP3",
  page: 0,
  menuMessageId: null,
  language: null,
  demoLanguage: null,
  appMode: "tts",
  emotionActive: false,
};

let userStateColumnsReady = false;
let userStateColumnsPromise = null;

function databaseErrorText(error) {
  return String(error?.message || error || "").toLowerCase();
}

function isMissingColumn(error, column) {
  const raw = databaseErrorText(error);
  return raw.includes(String(column).toLowerCase()) && (raw.includes("no such column") || raw.includes("has no column"));
}

function isDuplicateColumn(error, column) {
  const raw = databaseErrorText(error);
  return raw.includes(String(column).toLowerCase()) && (raw.includes("duplicate column") || raw.includes("already exists"));
}

async function ensureColumn(env, column, definition) {
  try {
    await env.DB.prepare(`SELECT ${column} FROM user_state LIMIT 1`).first();
  } catch (error) {
    if (!isMissingColumn(error, column)) throw error;
    try {
      await env.DB.prepare(`ALTER TABLE user_state ADD COLUMN ${column} ${definition}`).run();
    } catch (alterError) {
      if (!isDuplicateColumn(alterError, column)) throw alterError;
    }
  }
}

async function ensureUserStateColumns(env) {
  if (userStateColumnsReady) return;

  if (!userStateColumnsPromise) {
    userStateColumnsPromise = (async () => {
      await ensureColumn(env, "demo_language", "TEXT");
      await ensureColumn(env, "app_mode", "TEXT NOT NULL DEFAULT 'tts'");
      userStateColumnsReady = true;
    })().catch((error) => {
      userStateColumnsPromise = null;
      throw error;
    });
  }

  await userStateColumnsPromise;
}

export function normalizeAppMode(value) {
  const clean = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  if (clean === "voice") return "tts";
  if (clean === "speech_to_text") return "stt";
  if (clean === "vexa_live") return "live";
  return APP_MODES.includes(clean) ? clean : DEFAULT_STATE.appMode;
}

export async function getState(env, userId) {
  requireDb(env);
  await ensureUserStateColumns(env);

  const row = await env.DB.prepare(
    "SELECT voice, output, page, menu_message_id, language, demo_language, app_mode FROM user_state WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!row) return { ...DEFAULT_STATE };

  return {
    voice: row.voice || DEFAULT_STATE.voice,
    output: row.output || DEFAULT_STATE.output,
    page: Number(row.page || 0),
    menuMessageId: row.menu_message_id ? Number(row.menu_message_id) : null,
    language: row.language || null,
    demoLanguage: row.demo_language || null,
    appMode: normalizeAppMode(row.app_mode),
    emotionActive: false,
  };
}

export async function saveState(env, userId, state) {
  requireDb(env);
  await ensureUserStateColumns(env);

  const cleanState = {
    voice: state.voice || DEFAULT_STATE.voice,
    output: state.output || DEFAULT_STATE.output,
    page: Number(state.page || 0),
    menuMessageId: state.menuMessageId ? Number(state.menuMessageId) : null,
    language: state.language || null,
    demoLanguage: state.demoLanguage || null,
    appMode: normalizeAppMode(state.appMode),
  };

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, language, demo_language, app_mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, language = excluded.language, demo_language = excluded.demo_language, app_mode = excluded.app_mode, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId, cleanState.language, cleanState.demoLanguage, cleanState.appMode).run();
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

export async function setAppMode(env, userId, appMode) {
  const state = await getState(env, userId);
  state.appMode = normalizeAppMode(appMode);
  await saveState(env, userId, state);
  return state.appMode;
}

export async function isEmotionActive() {
  return false;
}

export async function toggleEmotionActive() {
  return false;
}

export async function setEmotionActive() {
  return false;
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 DB binding is missing. Create D1 and add binding DB in wrangler.toml.");
  }
}
