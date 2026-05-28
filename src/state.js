export const DEFAULT_STATE = {
  voice: null,
  output: "MP3",
  page: 0,
};

const memoryState = new Map();

export async function getState(env, userId) {
  const fallback = memoryState.get(stateKey(userId)) || { ...DEFAULT_STATE };

  if (!env.USER_STATE) return { ...DEFAULT_STATE, ...fallback };

  const raw = await env.USER_STATE.get(stateKey(userId));
  if (!raw) return { ...DEFAULT_STATE, ...fallback };

  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE, ...fallback };
  }
}

export async function saveState(env, userId, state) {
  const cleanState = {
    voice: state.voice || null,
    output: state.output || "MP3",
    page: Number(state.page || 0),
  };

  memoryState.set(stateKey(userId), cleanState);

  if (!env.USER_STATE) return;

  await env.USER_STATE.put(stateKey(userId), JSON.stringify(cleanState));
}

function stateKey(userId) {
  return "telegram-user-" + String(userId);
}
