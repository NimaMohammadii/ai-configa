export const DEFAULT_STATE = {
  voice: "Nora",
  output: "MP3",
  page: 0,
  menuMessageId: null,
  language: null,
  demoLanguage: null,
  emotionActive: false,
};

let demoLanguageColumnReady = false;
let demoLanguageColumnPromise = null;

function databaseErrorText(error) {
  return String(error?.message || error || "").toLowerCase();
}

function isMissingDemoLanguageColumn(error) {
  const raw = databaseErrorText(error);
  return raw.includes("demo_language") && (raw.includes("no such column") || raw.includes("has no column"));
}

function isDuplicateDemoLanguageColumn(error) {
  const raw = databaseErrorText(error);
  return raw.includes("demo_language") && (raw.includes("duplicate column") || raw.includes("already exists"));
}

async function ensureDemoLanguageColumn(env) {
  if (demoLanguageColumnReady) return;

  if (!demoLanguageColumnPromise) {
    demoLanguageColumnPromise = (async () => {
      try {
        await env.DB.prepare("SELECT demo_language FROM user_state LIMIT 1").first();
      } catch (error) {
        if (!isMissingDemoLanguageColumn(error)) throw error;

        try {
          await env.DB.prepare("ALTER TABLE user_state ADD COLUMN demo_language TEXT").run();
        } catch (alterError) {
          if (!isDuplicateDemoLanguageColumn(alterError)) throw alterError;
        }
      }

      demoLanguageColumnReady = true;
    })().catch((error) => {
      demoLanguageColumnPromise = null;
      throw error;
    });
  }

  await demoLanguageColumnPromise;
}

export async function getState(env, userId) {
  requireDb(env);
  await ensureDemoLanguageColumn(env);

  const row = await env.DB.prepare(
    "SELECT voice, output, page, menu_message_id, language, demo_language FROM user_state WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!row) return { ...DEFAULT_STATE };

  return {
    voice: row.voice || DEFAULT_STATE.voice,
    output: row.output || DEFAULT_STATE.output,
    page: Number(row.page || 0),
    menuMessageId: row.menu_message_id ? Number(row.menu_message_id) : null,
    language: row.language || null,
    demoLanguage: row.demo_language || null,
    emotionActive: false,
  };
}

export async function saveState(env, userId, state) {
  requireDb(env);
  await ensureDemoLanguageColumn(env);

  const cleanState = {
    voice: state.voice || DEFAULT_STATE.voice,
    output: state.output || DEFAULT_STATE.output,
    page: Number(state.page || 0),
    menuMessageId: state.menuMessageId ? Number(state.menuMessageId) : null,
    language: state.language || null,
    demoLanguage: state.demoLanguage || null,
  };

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, language, demo_language, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, language = excluded.language, demo_language = excluded.demo_language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId, cleanState.language, cleanState.demoLanguage).run();
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
