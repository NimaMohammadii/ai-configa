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
    state.emotionActive = active;
    await editMessage(env, chatId, messageId, startText(state), decorateKeyboard(mainKeyboard(state), state)).catch(() => null);
  }
}

export async function handleEmotionMessage() {
  return false;
}

export async function isEmotionActive(env, userId) {
  return readEmotionActive(env, userId);
}

function decorateKeyboard(keyboard, state) {
  const rows = keyboard.inline_keyboard || [];
  setEmotionButtonLabel(rows, state);
  return { inline_keyboard: rows };
}

function setEmotionButtonLabel(rows, state) {
  const active = Boolean(state.emotionActive);
  const lang = state.language || "en";
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (!button || button.callback_data !== "emotion_on") continue;
      button.text = lang === "fa" ? `🎭 احساس‌ساز: ${active ? "روشن" : "خاموش"}` : `🎭 Emotion: ${active ? "ON" : "OFF"}`;
      return;
    }
  }
}
