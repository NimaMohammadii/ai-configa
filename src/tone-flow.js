import { getState, isEmotionActive as readToneActive, toggleEmotionActive } from "./state.js";
import { mainKeyboard, startText } from "./ui-status.js";
import { answerCallback, editMessage } from "./telegram-actions.js";

export function isToneCallback(data) {
  return data === "emotion_on";
}

export async function handleToneCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId) return;

  const active = await toggleEmotionActive(env, userId);
  await answerCallback(env, query.id, active ? "ON" : "OFF", false);

  if (chatId && messageId) {
    const state = await getState(env, userId).catch(() => ({}));
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state)).catch(() => null);
  }
}

export async function handleToneMessage() {
  return false;
}

export async function isToneActive(env, userId) {
  return readToneActive(env, userId);
}
