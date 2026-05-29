import { tgForm, tgJson } from "./telegram-api.js";

export function sendMessage(env, chatId, text, replyMarkup = null) {
  return tgJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export function sendPlainMessage(env, chatId, text) {
  return tgJson(env, "sendMessage", {
    chat_id: chatId,
    text,
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

export function deleteMessage(env, chatId, messageId) {
  return tgJson(env, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export function answerCallback(env, callbackQueryId, text = "", showAlert = false) {
  return tgJson(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export function sendAudio(env, chatId, audioBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("title", "Vexa");
  form.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), "Vexa.mp3");
  return tgForm(env, "sendAudio", form);
}

export function sendDocument(env, chatId, audioBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([audioBuffer], { type: "audio/mpeg" }), "Vexa.mp3");
  return tgForm(env, "sendDocument", form);
}

export function sendVoice(env, chatId, audioBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("voice", new Blob([audioBuffer], { type: "audio/mpeg" }), "Vexa.mp3");
  return tgForm(env, "sendVoice", form);
}
