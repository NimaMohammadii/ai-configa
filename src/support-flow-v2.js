import { trackUser } from "./admin.js";
import { getState, requireDb } from "./state.js";
import { copyMessage, sendMessage, sendPlainMessage } from "./telegram-actions.js";

const END = {
  fa: "اتمام چت",
  en: "End chat",
  ru: "Завершить чат",
  de: "Chat beenden",
  tr: "Sohbeti bitir",
  ar: "إنهاء المحادثة",
  zh: "结束聊天",
  ja: "チャット終了",
  es: "Finalizar chat",
  hi: "चैट समाप्त करें",
};

const TEXT = {
  fa: {
    start: "💬 چت با پشتیبانی باز شد.\n\nهرچی می‌خوای همینجا بنویس. اگر چت بسته شد، می‌تونی با ریپلای روی پیام پشتیبانی دوباره جواب بدی.",
    end: "✅ چت با پشتیبانی بسته شد.",
    sent: "✅ پیام شما برای پشتیبانی ارسال شد.",
    noAdmin: "پشتیبانی فعلاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کن.",
    adminSent: "✅ پاسخ برای کاربر ارسال شد.",
  },
  en: {
    start: "💬 Support chat is open.\n\nWrite anything you need here. If the chat is closed, you can still reply to a support message to continue the conversation.",
    end: "✅ Support chat closed.",
    sent: "✅ Your message was sent to support.",
    noAdmin: "Support is not available right now. Please try again later.",
    adminSent: "✅ Reply sent to user.",
  },
};

export async function handleSupportMessage(message, env) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  if (!chatId || !userId) return false;

  await ensureTables(env);
  await trackUser(env, message.from);

  const text = message.text?.trim() || "";
  const state = await getState(env, userId);
  const lang = state.language || "en";

  if (await handleAdminReply(env, message)) return true;

  if (text === "/support") {
    await openSession(env, userId, lang);
    await sendMessage(env, chatId, getText(lang, "start"), keyboard(lang));
    return true;
  }

  const session = await getSession(env, userId);
  if (!session) return false;

  if (text === endLabel(lang)) {
    await closeSession(env, userId);
    await sendMessage(env, chatId, getText(lang, "end"), { remove_keyboard: true });
    return true;
  }

  const ok = await sendToAdmin(env, message, lang);
  if (ok) await sendPlainMessage(env, chatId, getText(lang, "sent"));
  return true;
}

async function sendToAdmin(env, message, lang) {
  const adminId = adminChatId(env);
  const chatId = message.chat?.id;
  const user = message.from || {};

  if (!adminId) {
    await sendPlainMessage(env, chatId, getText(lang, "noAdmin"));
    return false;
  }

  const info = [
    "🆘 Support Message",
    "",
    "Name: " + ([user.first_name, user.last_name].filter(Boolean).join(" ") || "No name"),
    "Username: " + (user.username ? "@" + user.username : "No username"),
    "User ID: " + user.id,
    "Chat ID: " + chatId,
  ].join("\n");

  try {
    if (message.text) {
      const sent = await sendPlainMessage(env, adminId, info + "\n\nMessage:\n" + message.text);
      await remember(env, adminId, sent?.message_id, user.id);
    } else {
      const sent = await sendPlainMessage(env, adminId, info + "\n\nMessage:");
      await remember(env, adminId, sent?.message_id, user.id);
      const copied = await copyMessage(env, adminId, chatId, message.message_id, "Reply to this message to answer the user.");
      await remember(env, adminId, copied?.message_id, user.id);
    }
    return true;
  } catch (error) {
    console.error("support admin send failed", adminId, error?.message || error);
    await sendPlainMessage(env, chatId, getText(lang, "noAdmin"));
    return false;
  }
}

async function handleAdminReply(env, message) {
  const adminId = String(message.from?.id || "");
  if (adminId !== adminChatId(env)) return false;

  const replyId = message.reply_to_message?.message_id;
  if (!replyId) return false;

  const row = await env.DB.prepare(
    "SELECT user_id FROM support_admin_messages WHERE admin_chat_id = ? AND admin_message_id = ?"
  ).bind(adminId, Number(replyId)).first();

  if (!row?.user_id) return false;

  if (message.text) {
    await sendPlainMessage(env, row.user_id, "💬 Support\n\n" + message.text);
  } else {
    await copyMessage(env, row.user_id, message.chat.id, message.message_id, "💬 Support");
  }

  const state = await getState(env, row.user_id);
  await openSession(env, row.user_id, state.language || "en");
  await sendPlainMessage(env, adminId, getText("en", "adminSent"));
  return true;
}

function adminChatId(env) {
  const value = String(env.ADMIN_TOKEN || "");
  const match = value.match(/\d{5,}/);
  return match ? match[0] : "";
}

async function getSession(env, userId) {
  const row = await env.DB.prepare("SELECT is_open FROM support_sessions WHERE user_id = ?").bind(String(userId)).first();
  return Number(row?.is_open || 0) === 1;
}

async function openSession(env, userId, lang) {
  await env.DB.prepare(
    "INSERT INTO support_sessions (user_id, is_open, language, created_at, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET is_open = 1, language = excluded.language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), lang).run();
}

async function closeSession(env, userId) {
  await env.DB.prepare("UPDATE support_sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(String(userId)).run();
}

async function remember(env, adminChatId, adminMessageId, userId) {
  if (!adminChatId || !adminMessageId || !userId) return;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO support_admin_messages (admin_chat_id, admin_message_id, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(adminChatId), Number(adminMessageId), String(userId)).run();
}

async function ensureTables(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS support_sessions (user_id TEXT PRIMARY KEY, is_open INTEGER NOT NULL DEFAULT 0, language TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS support_admin_messages (admin_chat_id TEXT NOT NULL, admin_message_id INTEGER NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (admin_chat_id, admin_message_id))"),
  ]);
}

function keyboard(lang) {
  return { keyboard: [[{ text: endLabel(lang) }]], resize_keyboard: true, one_time_keyboard: false };
}

function endLabel(lang) {
  return END[lang] || END.en;
}

function getText(lang, key) {
  const pack = TEXT[lang] || TEXT.en;
  return pack[key] || TEXT.en[key] || "";
}
