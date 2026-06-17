import { getState, requireDb } from "./state.js";
import { mainKeyboard, startText } from "./ui.js";
import { answerCallback, editMessage } from "./telegram-actions.js";

export function isEmotionCallback(data) {
  return data === "emotion_on";
}

export async function handleEmotionCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId) return;

  const active = await toggleEmotionSession(env, userId);
  await answerCallback(env, query.id, active ? "Emotion Enhancer ON" : "Emotion Enhancer OFF", false);

  if (chatId && messageId) {
    const state = await getState(env, userId).catch(() => ({}));
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state)).catch(() => null);
  }
}

export async function handleEmotionMessage() {
  return false;
}

export async function isEmotionActive(env, userId) {
  await ensureEmotionTables(env);
  const row = await env.DB.prepare(
    "SELECT is_active FROM emotion_sessions WHERE user_id = ?"
  ).bind(String(userId)).first();
  return Number(row && row.is_active ? row.is_active : 0) === 1;
}

async function toggleEmotionSession(env, userId) {
  const current = await isEmotionActive(env, userId);
  const next = !current;
  await setEmotionSession(env, userId, next);
  return next;
}

async function setEmotionSession(env, userId, active) {
  await ensureEmotionTables(env);
  await env.DB.prepare(
    "INSERT INTO emotion_sessions (user_id, is_active, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET is_active = excluded.is_active, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), active ? 1 : 0).run();
}

async function ensureEmotionTables(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS emotion_sessions (user_id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
