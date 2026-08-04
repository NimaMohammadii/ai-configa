import { trackUser } from "../admin.js";
import { ensureBalanceRow } from "../credits.js";
import { tgJson } from "../telegram-api.js";
import { approveLoginSession } from "./oauth-storage.js";

const OAUTH_START_PATTERN = /^\/start(?:@\w+)?\s+oauth_([A-Za-z0-9_-]{20,80})$/i;

export async function handleTelegramOauthStart(message, env) {
  const text = String(message?.text || "").trim();
  const match = text.match(OAUTH_START_PATTERN);

  if (!match) {
    return false;
  }

  const chatId = message?.chat?.id;
  const userId = message?.from?.id;

  if (!chatId || !userId) {
    return true;
  }

  await trackUser(env, message.from).catch(() => null);
  await ensureBalanceRow(env, userId).catch(() => null);

  const approval = await approveLoginSession(env, match[1], userId);

  if (approval.ok) {
    await sendLoginMessage(
      env,
      chatId,
      approval.alreadyApproved
        ? "✅ حساب تلگرام تو قبلاً برای این اتصال تأیید شده است. به صفحه ChatGPT برگرد."
        : "✅ حساب تلگرام با موفقیت تأیید شد. حالا به صفحه ChatGPT برگرد؛ اتصال خودکار کامل می‌شود.",
    );

    return true;
  }

  const messageText = approval.reason === "expired"
    ? "⏳ زمان این لینک تمام شده است. اتصال را دوباره از داخل ChatGPT شروع کن."
    : "❌ این لینک اتصال معتبر نیست یا قبلاً توسط حساب دیگری استفاده شده است.";

  await sendLoginMessage(env, chatId, messageText);
  return true;
}

async function sendLoginMessage(env, chatId, text) {
  await tgJson(env, "sendMessage", {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
  }).catch((error) => {
    console.error(
      "telegram oauth confirmation message failed",
      error?.stack || error,
    );
  });
}
