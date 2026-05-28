export const DEFAULT_STATE = {
  voice: null,
  output: "MP3",
  page: 0,
};

export async function getState(env, userId) {
  if (!env.USER_STATE) return { ...DEFAULT_STATE };

  const raw = await env.USER_STATE.get(stateKey(userId));
  if (!raw) return { ...DEFAULT_STATE };

  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(env, userId, state) {
  if (!env.USER_STATE) return;

  const value = JSON.stringify({
    voice: state.voice || null,
    output: state.output || "MP3",
    page: Number(state.page || 0),
  });

  await env.USER_STATE.put(stateKey(userId), value);
}

function stateKey(userId) {
  return "telegram-user-" + String(userId);
}
