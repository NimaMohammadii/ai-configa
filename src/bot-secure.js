import { handleMessage as handleBaseMessage, sendFreshMainMenu } from "./bot.js";
import { handleTelegramOauthStart } from "./chatgpt-app/telegram-login.js";
import { protectStartMessage } from "./start-message-guard.js";

export async function handleMessage(message, env) {
  if (await handleTelegramOauthStart(message, env)) {
    return;
  }

  const text = String(message?.text || "").trim();
  const isStart = /^\/start(?:@\w+)?(?:\s|$)/i.test(text);

  if (!isStart) return handleBaseMessage(message, env);

  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  protectStartMessage(chatId, message?.message_id);

  try {
    return await handleBaseMessage(message, env);
  } catch (error) {
    console.error("start flow failed, restoring menu", error?.stack || error);
    if (!chatId || !userId) throw error;
    try {
      await sendFreshMainMenu(env, chatId, userId);
      return;
    } catch {
      throw error;
    }
  }
}
