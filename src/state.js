export const DEFAULT_STATE = {
  voice: "Nora",
  output: "MP3",
  page: 0,
};

export async function getState(env, userId) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT voice, output, page FROM user_state WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!row) return { ...DEFAULT_STATE };

  return {
    voice: row.voice || DEFAULT_STATE.voice,
    output: row.output || DEFAULT_STATE.output,
    page: Number(row.page || 0),
  };
}

export async function saveState(env, userId, state) {
  requireDb(env);

  const cleanState = {
    voice: state.voice || DEFAULT_STATE.voice,
    output: state.output || DEFAULT_STATE.output,
    page: Number(state.page || 0),
  };

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, voice, output, page, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page).run();
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 DB binding is missing. Create D1 and add binding DB in wrangler.toml.");
  }
}
