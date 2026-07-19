import { tgForm, tgJson } from "./telegram-api.js";

const botMessageIdsByChat = new Map();

function withOptionalReplyMarkup(payload, replyMarkup) {
  if (replyMarkup && typeof replyMarkup === "object") {
    payload.reply_markup = replyMarkup;
  }
  return payload;
}

export async function sendMessage(env, chatId, text, replyMarkup = null) {
  const result = await tgJson(env, "sendMessage", withOptionalReplyMarkup({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  }, replyMarkup));
  rememberBotMessage(chatId, result?.message_id);
  return result;
}

export async function sendPlainMessage(env, chatId, text, replyMarkup = null) {
  const result = await tgJson(env, "sendMessage", withOptionalReplyMarkup({
    chat_id: chatId,
    text,
  }, replyMarkup));
  rememberBotMessage(chatId, result?.message_id);
  return result;
}

export async function sendHtmlMessage(env, chatId, text, replyMarkup = null) {
  const result = await tgJson(env, "sendMessage", withOptionalReplyMarkup({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  }, replyMarkup));
  rememberBotMessage(chatId, result?.message_id);
  return result;
}

export function editMessage(env, chatId, messageId, text, replyMarkup = null) {
  return tgJson(env, "editMessageText", withOptionalReplyMarkup({
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  }, replyMarkup));
}

export function editMessageCaption(env, chatId, messageId, caption, replyMarkup = null) {
  return tgJson(env, "editMessageCaption", withOptionalReplyMarkup({
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
  }, replyMarkup));
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

export function answerPreCheckout(env, preCheckoutQueryId, ok = true, errorMessage = "") {
  const payload = {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
  };

  if (!ok && errorMessage) payload.error_message = errorMessage;
  return tgJson(env, "answerPreCheckoutQuery", payload);
}

export function sendStarsInvoice(env, chatId, pack, payload = null) {
  return tgJson(env, "sendInvoice", {
    chat_id: chatId,
    title: "Vexa Credits",
    description: pack.description,
    payload: payload || "stars:" + pack.id,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: pack.invoiceLabel, amount: pack.stars }],
    reply_markup: {
      inline_keyboard: [[{ text: "Pay " + pack.stars + " ⭐️", pay: true }]],
    },
  });
}

export function copyMessage(env, chatId, fromChatId, messageId, caption, replyMarkup = null) {
  return tgJson(env, "copyMessage", withOptionalReplyMarkup({
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
  }, replyMarkup));
}


export function sendPhoto(env, chatId, imageBuffer, filename = "vexa-image.png", caption = "") {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([imageBuffer], { type: "image/png" }), filename);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  return tgForm(env, "sendPhoto", form);
}

export function sendTextDocument(env, chatId, content, filename, caption = "") {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: "text/plain;charset=utf-8" }), filename);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  return tgForm(env, "sendDocument", form);
}

export function sendAudio(env, chatId, audioBuffer, filename = "vexa-voice.mp3", title = "Vexa Voice") {
  return sendNamedAudio(env, chatId, audioBuffer, title, filename);
}

export function sendDemoAudio(env, chatId, audioBuffer) {
  return sendNamedAudio(env, chatId, audioBuffer, "Vexa Demo", "vexa-demo.mp3");
}

export function sendAudioFileId(env, chatId, fileId, caption = "") {
  return tgJson(env, "sendAudio", {
    chat_id: chatId,
    audio: fileId,
    title: "Vexa Voice",
    caption,
    parse_mode: "HTML",
  });
}

export function sendVoiceFileId(env, chatId, fileId, caption = "") {
  return tgJson(env, "sendVoice", {
    chat_id: chatId,
    voice: fileId,
    caption,
    parse_mode: "HTML",
  });
}

export function sendDocumentFileId(env, chatId, fileId, caption = "") {
  return tgJson(env, "sendDocument", {
    chat_id: chatId,
    document: fileId,
    caption,
    parse_mode: "HTML",
  });
}

function sendNamedAudio(env, chatId, audioBuffer, title, filename) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("title", title);
  form.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  return tgForm(env, "sendAudio", form);
}

export function sendDocument(env, chatId, audioBuffer, filename = "vexa-voice.mp3") {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  return tgForm(env, "sendDocument", form);
}

export function sendDemoDocument(env, chatId, audioBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([audioBuffer], { type: "audio/mpeg" }), "vexa-demo.mp3");
  return tgForm(env, "sendDocument", form);
}

export function sendVoice(env, chatId, audioBuffer) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("voice", new Blob([audioBuffer], { type: "audio/mpeg" }), "vexa-voice.mp3");
  return tgForm(env, "sendVoice", form);
}

function rememberBotMessage(chatId, messageId) {
  if (!messageId) return;

  const key = String(chatId);
  const ids = botMessageIdsByChat.get(key) || new Set();
  ids.add(Number(messageId));

  if (ids.size > 50) {
    const first = ids.values().next().value;
    ids.delete(first);
  }

  botMessageIdsByChat.set(key, ids);
}

function isKnownBotMessage(chatId, messageId) {
  const ids = botMessageIdsByChat.get(String(chatId));
  return Boolean(ids && ids.has(Number(messageId)));
}
