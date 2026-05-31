import { tgJson } from "./telegram-api.js";

const PIN_TEXTS = {
  en: "Send text here, I’ll turn it into voice",
  ru: "Отправь текст сюда, сделаю голос",
  de: "Schreib hier Text, ich mache daraus Stimme",
  fa: "همینجا متن بفرست، تبدیلش می‌کنم به صدا",
  tr: "Buraya metin yaz, sese çevireyim",
  ar: "أرسل النص هنا، أحوله إلى صوت",
  zh: "在这里发文字，我帮你转成语音",
  ja: "ここに文章を送れば音声にします",
  es: "Envía texto aquí y lo convierto en voz",
  hi: "यहाँ टेक्स्ट भेजो, मैं आवाज़ बना दूँगा",
};

export async function ensurePinnedMessage(env, chatId, userId, language) {
  if (!chatId || !userId || !env.DB) return null;

  const lang = PIN_TEXTS[language] ? language : "en";
  const text = pinText(lang);

  await ensurePinnedTable(env);
  const current = await getPinnedRow(env, userId);

  if (current?.message_id && current.language === lang) {
    const pinned = await pinExisting(env, chatId, current.message_id);
    if (pinned) return current.message_id;
  }

  if (current?.message_id) {
    const edited = await editPinnedMessage(env, chatId, current.message_id, text);
    if (edited) {
      await pinExisting(env, chatId, current.message_id);
      await savePinnedRow(env, userId, chatId, current.message_id, lang);
      return current.message_id;
    }
  }

  const sent = await sendPinnedText(env, chatId, text);
  if (!sent?.message_id) return null;

  await pinExisting(env, chatId, sent.message_id);
  await savePinnedRow(env, userId, chatId, sent.message_id, lang);
  return sent.message_id;
}

function pinText(language) {
  return "<b>" + PIN_TEXTS[language] + "</b>";
}

async function ensurePinnedTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_pins (user_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, language TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function getPinnedRow(env, userId) {
  return await env.DB.prepare("SELECT user_id, chat_id, message_id, language FROM user_pins WHERE user_id = ?")
    .bind(String(userId))
    .first();
}

async function savePinnedRow(env, userId, chatId, messageId, language) {
  await env.DB.prepare(
    "INSERT INTO user_pins (user_id, chat_id, message_id, language, updated_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, message_id = excluded.message_id, language = excluded.language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), String(chatId), Number(messageId), String(language)).run();
}

async function sendPinnedText(env, chatId, text) {
  return await tgJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_notification: true,
  });
}

async function editPinnedMessage(env, chatId, messageId, text) {
  try {
    await tgJson(env, "editMessageText", {
      chat_id: chatId,
      message_id: Number(messageId),
      text,
      parse_mode: "HTML",
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function pinExisting(env, chatId, messageId) {
  try {
    await tgJson(env, "pinChatMessage", {
      chat_id: chatId,
      message_id: Number(messageId),
      disable_notification: true,
    });
    return true;
  } catch (error) {
    return false;
  }
}
