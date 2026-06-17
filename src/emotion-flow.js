import { getState, isEmotionActive as readEmotionActive, toggleEmotionActive } from "./state.js";
import { mainKeyboard, startText } from "./ui.js";
import { answerCallback, editMessage } from "./telegram-actions.js";

export function isEmotionCallback(data) {
  return data === "emotion_on";
}

export async function handleEmotionCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId) return;

  const active = await toggleEmotionActive(env, userId);
  await answerCallback(env, query.id, active ? "Emotion Enhancer ON" : "Emotion Enhancer OFF", false);

  if (chatId && messageId) {
    const state = await getState(env, userId).catch(() => ({}));
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state)).catch(() => null);
  }
}

export async function handleEmotionMessage() {
  return false;
}

export async function isEmotionActive(env, userId) {
  return readEmotionActive(env, userId);
}
