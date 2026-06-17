import { isAdmin, tryAdminLogin } from "./admin.js";
import { handleCallback as handleBotCallback, handleMessage as handleBotMessage } from "./bot.js";
import { enhanceTextWithEmotion } from "./gpt.js";
import { getState, isEmotionActive } from "./state.js";
import { editMessage } from "./telegram-actions.js";
import { mainKeyboard, startText } from "./ui-status.js";

export async function handleCallback(query, env) {
  await handleBotCallback(query, env);

  const data = query.data || "";
  if (!shouldRefreshMainMenu(data)) return;

  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId || !chatId || !messageId) return;

  const state = await getState(env, userId).catch(() => null);
  if (!state || !state.language) return;
  await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state)).catch(() => null);
}

export async function handleMessage(message, env) {
  const userId = message.from && message.from.id;
  const text = message.text ? message.text.trim() : "";

  if (!userId || !text) {
    return handleBotMessage(message, env);
  }

  if (text === "/debug") {
    if (!(await isAdmin(env, userId))) return;
    return handleBotMessage(message, env);
  }

  if (text.startsWith("/admin")) {
    const parts = text.split(/\s+/).filter(Boolean);
    const token = parts[1] || "";

    if (await isAdmin(env, userId)) {
      return handleBotMessage(message, env);
    }

    if (!token) return;

    const loggedIn = await tryAdminLogin(env, userId, token).catch(() => false);
    if (!loggedIn) return;

    return handleBotMessage(message, env);
  }

  if (text.startsWith("/")) {
    return handleBotMessage(message, env);
  }

  if (await isEmotionActive(env, userId).catch(() => false)) {
    const state = await getState(env, userId).catch(() => ({}));
    const enhanced = await enhanceTextWithEmotion(env, text, state.language || "en").catch(() => text);
    return handleBotMessage({ ...message, text: enhanced }, env);
  }

  return handleBotMessage(message, env);
}

function shouldRefreshMainMenu(data) {
  return data.startsWith("page:") || data.startsWith("voice:") || data === "back_main" || data === "cancel_payment" || data.startsWith("lang:");
}
