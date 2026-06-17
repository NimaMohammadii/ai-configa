import { isAdmin, tryAdminLogin } from "./admin.js";
import { handleCallback, handleMessage as handleBotMessage } from "./bot.js";
import { isEmotionActive } from "./emotion-flow.js";
import { enhanceTextWithEmotion } from "./gpt.js";

export { handleCallback };

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
    const stateLang = "fa";
    const enhanced = await enhanceTextWithEmotion(env, text, stateLang).catch(() => text);
    return handleBotMessage({ ...message, text: enhanced }, env);
  }

  return handleBotMessage(message, env);
}
