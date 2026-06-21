import { handleCallback as baseHandleCallback, handleMessage as baseHandleMessage } from "./bot.js";
import { getState } from "./state.js";
import { editMessage } from "./telegram-actions.js";
import { mainKeyboard, startText } from "./ui-main.js";

export async function handleMessage(message, env) {
  await baseHandleMessage(message, env);
  const text = message.text ? message.text.trim() : "";
  if (!text || text === "/admin") return;
  await refreshMainMenu(message.chat && message.chat.id, message.from && message.from.id, env);
}

export async function handleCallback(query, env) {
  await baseHandleCallback(query, env);
  const data = query.data || "";
  if (!shouldRefresh(data)) return;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const userId = query.from && query.from.id;
  await refreshMainMenu(chatId, userId, env);
}

async function refreshMainMenu(chatId, userId, env) {
  if (!chatId || !userId) return;
  const state = await getState(env, userId).catch(() => null);
  if (!state || !state.language || !state.menuMessageId) return;
  await editMessage(env, chatId, state.menuMessageId, startText(state), mainKeyboard(state)).catch(() => null);
}

function shouldRefresh(data) {
  return data.startsWith("lang:") || data.startsWith("page:") || data.startsWith("voice:") || data === "back_main" || data === "cancel_payment";
}
