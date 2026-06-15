import { getState, requireDb } from "./state.js";
import { copyMessage, sendPlainMessage } from "./telegram-actions.js";
import { handleSupportMessage as handleSupportMessageV2 } from "./support-flow-v2.js";

export async function handleSupportMessage(message, env) {
  const adminId = getAdminId(env);
  const fromId = String(message.from?.id || "");
  const chatId = String(message.chat?.id || "");
  const isAdmin = adminId && (fromId === adminId || chatId === adminId);

  if (!isAdmin) {
    return handleSupportMessageV2(message, env);
  }

  const reply = message.reply_to_message;
  if (!reply?.message_id) return false;

  await requireTables(env);

  const targetUserId = await resolveTargetUserId(env, adminId, chatId, reply);
  if (!targetUserId) return true;

  if (message.text) {
    await sendPlainMessage(env, targetUserId, "💬 Support\n\n" + message.text);
  } else {
    await copyMessage(env, targetUserId, message.chat.id, message.message_id, "💬 Support");
  }

  const state = await getState(env, targetUserId);
  await openSession(env, targetUserId, state.language || "en");
  await sendPlainMessage(env, chatId || adminId, "✅ Reply sent to user.");
  return true;
}

async function resolveTargetUserId(env, adminId, chatId, reply) {
  const keys = Array.from(new Set([chatId, adminId].filter(Boolean).map(String)));

  for (const key of keys) {
    const row = await env.DB.prepare(
      "SELECT user_id FROM support_admin_messages WHERE admin_chat_id = ? AND admin_message_id = ?"
    ).bind(key, Number(reply.message_id)).first();
    if (row?.user_id) return String(row.user_id);
  }

  const text = [reply.text, reply.caption].filter(Boolean).join("\n");
  const match = text.match(/User ID:\s*(\d{5,})/i);
  return match ? match[1] : "";
}

async function requireTables(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS support_sessions (user_id TEXT PRIMARY KEY, is_open INTEGER NOT NULL DEFAULT 0, language TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS support_admin_messages (admin_chat_id TEXT NOT NULL, admin_message_id INTEGER NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (admin_chat_id, admin_message_id))"),
  ]);
}

async function openSession(env, userId, lang) {
  await env.DB.prepare(
    "INSERT INTO support_sessions (user_id, is_open, language, created_at, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET is_open = 1, language = excluded.language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), lang).run();
}

function getAdminId(env) {
  const value = String(env.ADMIN_TOKEN || "");
  const match = value.match(/-?\d{5,}/);
  return match ? match[0] : "";
}
