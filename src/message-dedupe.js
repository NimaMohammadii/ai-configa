import { requireDb } from "./state.js";

export async function shouldProcessMessageOnce(env, message) {
  requireDb(env);

  const chatId = message.chat?.id;
  const messageId = message.message_id;
  if (!chatId || !messageId) return true;

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS processed_telegram_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (chat_id, message_id))"
  ).run();

  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO processed_telegram_messages (chat_id, message_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(chatId), Number(messageId)).run();

  return Number(result?.meta?.changes || 0) > 0;
}
