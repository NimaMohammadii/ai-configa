import { enhanceTextWithEmotion } from "./gpt.js";
import { getState, requireDb, setMenuMessageId } from "./state.js";
import { mainKeyboard, startText } from "./ui.js";
import { answerCallback, deleteMessage, sendMessage, sendPlainMessage } from "./telegram-actions.js";

const END_LABELS = { en: "End", fa: "اتمام", ru: "End", de: "End", tr: "End", ar: "End", zh: "End", ja: "End", es: "End", hi: "End" };

export function isEmotionCallback(data) {
  return data === "emotion_on";
}

export async function handleEmotionCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  if (!userId || !chatId) return;
  await ensureEmotionTables(env);
  const state = await getState(env, userId);
  const lang = state.language || "en";
  await setEmotionSession(env, userId, true);
  await answerCallback(env, query.id, "ON", false);
  await sendMessage(env, chatId, introText(lang), emotionKeyboard(lang));
}

export async function handleEmotionMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const textValue = message.text ? message.text.trim() : "";
  if (!chatId || !userId || !textValue) return false;
  await ensureEmotionTables(env);
  if (!(await isEmotionActive(env, userId))) return false;

  const state = await getState(env, userId);
  const lang = state.language || "en";

  if (isEndText(textValue, lang)) {
    await setEmotionSession(env, userId, false);
    await sendMessage(env, chatId, doneText(lang), { remove_keyboard: true });
    const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    await setMenuMessageId(env, userId, menu && menu.message_id ? menu.message_id : null);
    return true;
  }

  if (textValue.startsWith("/")) {
    await setEmotionSession(env, userId, false);
    return false;
  }

  let statusMessage = null;
  try {
    statusMessage = await sendPlainMessage(env, chatId, waitText(lang));
    const enhanced = await enhanceTextWithEmotion(env, textValue, lang);
    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await sendPlainMessage(env, chatId, [titleText(lang), "", enhanced].join("\n"));
    return true;
  } catch (error) {
    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await sendPlainMessage(env, chatId, errorText(lang) + ": " + safeError(error));
    return true;
  }
}

async function ensureEmotionTables(env) {
  requireDb(env);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS emotion_sessions (user_id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

async function isEmotionActive(env, userId) {
  const row = await env.DB.prepare("SELECT is_active FROM emotion_sessions WHERE user_id = ?").bind(String(userId)).first();
  return Number(row && row.is_active ? row.is_active : 0) === 1;
}

async function setEmotionSession(env, userId, active) {
  await env.DB.prepare("INSERT INTO emotion_sessions (user_id, is_active, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET is_active = excluded.is_active, updated_at = CURRENT_TIMESTAMP").bind(String(userId), active ? 1 : 0).run();
}

function emotionKeyboard(lang) {
  return { keyboard: [[{ text: endLabel(lang) }]], resize_keyboard: true, one_time_keyboard: false };
}

function endLabel(lang) {
  return END_LABELS[lang] || END_LABELS.en;
}

function isEndText(value, lang) {
  const clean = String(value || "").trim();
  return clean === endLabel(lang) || Object.values(END_LABELS).includes(clean);
}

function introText(lang) {
  return lang === "fa" ? "🎭 حالت احساس‌ساز فعال شد.\n\nمتنت رو بفرست. وقتی تمام شد، اتمام رو بزن." : "🎭 Emotion Enhancer is active.\n\nSend your text. Tap End when finished.";
}
function waitText(lang) { return lang === "fa" ? "🎭 در حال آماده‌سازی..." : "🎭 Working..."; }
function titleText(lang) { return lang === "fa" ? "🎭 متن آماده:" : "🎭 Enhanced text:"; }
function doneText(lang) { return lang === "fa" ? "✅ خاموش شد." : "✅ Turned off."; }
function errorText(lang) { return lang === "fa" ? "خطا" : "Error"; }
function safeError(error) { const message = error && error.message ? error.message : String(error); return message.slice(0, 1200); }
