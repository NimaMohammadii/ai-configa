import { tgForm, tgJson } from "./telegram-api.js";

export function sendMessage(env, chatId, text, replyMarkup = null) {
  return tgJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export function editMessage(env, chatId, messageId, text, replyMarkup = null) {
  return tgJson(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export function answerCallback(env, callbackQueryId, text = "") {
  return tgJson(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export function sendAudio(env, chatId, audioBuffer, filename, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("title", filename.replace(/\.mp3$/i, ""));
  form.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  return tgForm(env, "sendAudio", form);
}

export function sendVoice(env, chatId, audioBuffer, filename, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("voice", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  return tgForm(env, "sendVoice", form);
}
