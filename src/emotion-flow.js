import { getState, requireDb, setMenuMessageId } from "./state.js";
import { mainKeyboard, startText } from "./ui.js";
import { answerCallback, sendMessage } from "./telegram-actions.js";

export function isEmotionCallback(data) {
  return data === "emotion_on";
}

export async function handleEmotionCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  if (!userId || !chatId) return;
  await answerCallback(env, query.id, "ON", false);
  await sendMessage(env, chatId, "Mode is active", { keyboard: [[{ text: "End" }]], resize_keyboard: true });
}

export async function handleEmotionMessage() {
  return false;
}
