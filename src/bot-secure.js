import { getMiniAppDefaultSection, hasTrackedUser } from "./admin.js";
import { handleMessage as handleBaseMessage } from "./bot-github-admin.js";
import { sendFreshMainMenu } from "./bot.js";
import { handleTelegramOauthStart } from "./chatgpt-app/telegram-login.js";
import { setAppMode } from "./state.js";
import { protectStartMessage } from "./start-message-guard.js";

const MINI_APP_START_MODES = new Set(["tts", "image", "explore", "ai_chat", "stt", "live"]);

export async function handleMessage(message, env) {
  if (await handleTelegramOauthStart(message, env)) {
    return;
  }

  const text = String(message?.text || "").trim();
  const isStart = /^\/start(?:@\w+)?(?:\s|$)/i.test(text);

  if (!isStart) return handleBaseMessage(message, env);

  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const requestedMode = miniAppStartMode(text);
  protectStartMessage(chatId, message?.message_id);

  try {
    if (userId) {
      let mode = requestedMode;
      if (!mode && isPlainStart(text) && !(await hasTrackedUser(env, userId))) {
        mode = await getMiniAppDefaultSection(env).catch(() => "tts");
      }
      if (mode) await setAppMode(env, userId, mode);
    }

    const startMessage = requestedMode ? { ...message, text: "/start" } : message;
    return await handleBaseMessage(startMessage, env);
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

function isPlainStart(text) {
  return /^\/start(?:@\w+)?$/i.test(String(text || "").trim());
}

function miniAppStartMode(text) {
  const match = String(text || "").trim().match(/^\/start(?:@\w+)?\s+app_([a-z0-9_-]+)$/i);
  if (!match) return "";
  const mode = String(match[1] || "").toLowerCase();
  return MINI_APP_START_MODES.has(mode) ? mode : "";
}
