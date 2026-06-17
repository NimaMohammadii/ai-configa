export function isToneCallback(data) {
  return data === "emotion_on";
}

export async function handleToneCallback(query, env) {
  const userId = query.from && query.from.id;
  if (!userId) return;
  return null;
}
