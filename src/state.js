export const DEFAULT_STATE = {
  voice: "Nora",
  output: "MP3",
  page: 0,
  menuMessageId: null,
};

export async function getState(env, userId) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT voice, output, page, menu_message_id FROM user_state WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!row) return { ...DEFAULT_STATE };

  return {
    voice: row.voice || DEFAULT_STATE.voice,
    output: row.output || DEFAULT_STATE.output,
    page: Number(row.page || 0),
    menuMessageId: row.menu_message_id ? Number(row.menu_message_id) : null,
  };
}

export async function saveState(env, userId, state) {
  requireDb(env);

  const cleanState = {
    voice: state.voice || DEFAULT_STATE.voice,
    output: state.output || DEFAULT_STATE.output,
    page: Number(state.page || 0),
    menuMessageId: state.menuMessageId ? Number(state.menuMessageId) : null,
  };

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId).run();
}

export async function setMenuMessageId(env, userId, messageId) {
  const state = await getState(env, userId);
  state.menuMessageId = messageId ? Number(messageId) : null;
  await saveState(env, userId, state);
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 DB binding is missing. Create D1 and add binding DB in wrangler.toml.");
  }
}
