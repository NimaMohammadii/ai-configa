import { adminMainKeyboard, clearAdminAction, getAdminAction, setAdminAction } from "./admin.js";
import { copyMessage, deleteMessage, editMessage, sendMessage, sendPhotoFileId, sendPlainMessage } from "./telegram-actions.js";
import { setMenuMessageId } from "./state.js";

const BROADCAST_BATCH_SIZE = 10;
const COMPLETED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export async function enqueueBroadcastJob(env, job) {
  await ensureBroadcastJobsTable(env);

  const now = unixNow();
  const total = await countRecipients(env, job.config?.language);
  await env.DB.prepare(
    "INSERT INTO broadcast_jobs (token, admin_id, chat_id, menu_message_id, language, payload_json, reply_markup_json, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
  ).bind(
    String(job.token),
    String(job.adminId),
    String(job.chatId),
    Number(job.menuMessageId),
    normalizeBroadcastLanguage(job.config?.language),
    JSON.stringify(job.payload || {}),
    job.replyMarkup ? JSON.stringify(job.replyMarkup) : null,
    total,
    now,
    now,
  ).run();

  if (!total) {
    await finishBroadcastJob(env, { ...job, total, sent: 0, failed: 0, skipped: 0 }, false);
    return;
  }

  await editBroadcastProgress(env, {
    admin_id: job.adminId,
    chat_id: job.chatId,
    menu_message_id: job.menuMessageId,
    token: job.token,
    total,
    sent: 0,
    failed: 0,
    skipped: 0,
  }, false, false);
}

export async function processPendingBroadcastJobs(env) {
  await ensureBroadcastJobsTable(env);

  const job = await env.DB.prepare(
    "SELECT id, token, admin_id, chat_id, menu_message_id, language, payload_json, reply_markup_json, last_user_id, total, sent, failed, skipped FROM broadcast_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1"
  ).first();

  if (!job) {
    await cleanupBroadcastJobs(env);
    return false;
  }

  const action = await getAdminAction(env, job.admin_id).catch(() => null);
  if (action?.target_user_id !== job.token || action.action !== "broadcast_sending") {
    await finishBroadcastJob(env, job, true);
    return true;
  }

  const recipients = await getNextRecipients(env, job.language, job.last_user_id);
  if (!recipients.length) {
    await finishBroadcastJob(env, job, false);
    return true;
  }
  const hasMore = recipients.length > BROADCAST_BATCH_SIZE;
  const users = recipients.slice(0, BROADCAST_BATCH_SIZE);

  const payload = parseJson(job.payload_json, {});
  const replyMarkup = parseJson(job.reply_markup_json, null);
  let sent = Number(job.sent || 0);
  let failed = Number(job.failed || 0);
  let skipped = Number(job.skipped || 0);
  let lastUserId = String(job.last_user_id || "0");

  for (const user of users) {
    const userId = String(user.user_id);
    lastUserId = userId;

    if (userId === String(job.admin_id)) {
      skipped++;
      continue;
    }

    try {
      if (payload.kind === "copy") {
        await copyMessage(env, userId, payload.fromChatId, payload.messageId, undefined, replyMarkup);
      } else if (payload.kind === "photo") {
        await sendPhotoFileId(env, userId, payload.fileId, payload.caption, replyMarkup, { entities: payload.captionEntities });
      } else {
        await sendPlainMessage(env, userId, payload.text, replyMarkup, { entities: payload.entities });
      }
      sent++;
    } catch {
      failed++;
    }
  }

  await env.DB.prepare(
    "UPDATE broadcast_jobs SET last_user_id = ?, sent = ?, failed = ?, skipped = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(lastUserId, sent, failed, skipped, unixNow(), job.id).run();

  const updated = { ...job, last_user_id: lastUserId, sent, failed, skipped };
  if (!hasMore) {
    await finishBroadcastJob(env, updated, false);
  } else {
    await editBroadcastProgress(env, updated, false, false);
  }

  return true;
}

async function finishBroadcastJob(env, job, cancelled) {
  const payload = typeof job.payload_json === "string" ? parseJson(job.payload_json, {}) : (job.payload || {});
  const status = cancelled ? "cancelled" : "completed";

  if (job.id) {
    await env.DB.prepare(
      "UPDATE broadcast_jobs SET status = ?, updated_at = ? WHERE id = ?"
    ).bind(status, unixNow(), job.id).run();
  } else {
    await env.DB.prepare(
      "UPDATE broadcast_jobs SET status = ?, updated_at = ? WHERE token = ?"
    ).bind(status, unixNow(), String(job.token)).run();
  }

  const action = await getAdminAction(env, job.admin_id || job.adminId).catch(() => null);
  if (action?.target_user_id === String(job.token)) {
    await clearAdminAction(env, job.admin_id || job.adminId).catch(() => null);
  }

  if (payload.kind === "copy" && payload.fromChatId && payload.messageId) {
    await deleteMessage(env, payload.fromChatId, payload.messageId).catch(() => null);
  }

  await editBroadcastProgress(env, {
    ...job,
    admin_id: job.admin_id || job.adminId,
    chat_id: job.chat_id || job.chatId,
    menu_message_id: job.menu_message_id || job.menuMessageId,
  }, true, cancelled);
}

async function getNextRecipients(env, language, lastUserId) {
  const normalized = normalizeBroadcastLanguage(language);
  const cursor = Number(lastUserId || 0);
  const query = normalized === "all"
    ? "SELECT user_id FROM bot_users WHERE CAST(user_id AS INTEGER) > ? ORDER BY CAST(user_id AS INTEGER) ASC LIMIT ?"
    : "SELECT b.user_id FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE CAST(b.user_id AS INTEGER) > ? AND COALESCE(s.language, 'en') = ? ORDER BY CAST(b.user_id AS INTEGER) ASC LIMIT ?";
  const statement = env.DB.prepare(query);
  const rows = normalized === "all"
    ? await statement.bind(cursor, BROADCAST_BATCH_SIZE + 1).all()
    : await statement.bind(cursor, normalized, BROADCAST_BATCH_SIZE + 1).all();
  return rows.results || [];
}

async function countRecipients(env, language) {
  const normalized = normalizeBroadcastLanguage(language);
  const query = normalized === "all"
    ? "SELECT COUNT(*) AS total FROM bot_users"
    : "SELECT COUNT(*) AS total FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE COALESCE(s.language, 'en') = ?";
  const row = normalized === "all"
    ? await env.DB.prepare(query).first()
    : await env.DB.prepare(query).bind(normalized).first();
  return Number(row?.total || 0);
}

async function editBroadcastProgress(env, job, done, cancelled) {
  const total = Number(job.total || 0);
  const sent = Number(job.sent || 0);
  const failed = Number(job.failed || 0);
  const skipped = Number(job.skipped || 0);
  const processed = sent + failed + skipped;
  const text = [
    done ? (cancelled ? "🛑 <b>Broadcast cancelled</b>" : "✅ <b>Broadcast completed</b>") : "📣 <b>Broadcast sending…</b>",
    "",
    "Processed: <b>" + processed + "/" + total + "</b>",
    "Sent: <b>" + sent + "</b>",
    "Failed: <b>" + failed + "</b>",
    "Skipped: <b>" + skipped + "</b>",
    cancelled ? "" : null,
    cancelled ? "No more users will receive this broadcast." : null
  ].filter((line) => line !== null).join("\n");
  const keyboard = done ? adminMainKeyboard() : broadcastCancelKeyboard();

  try {
    await editMessage(env, job.chat_id, Number(job.menu_message_id), text, keyboard);
    await setMenuMessageId(env, job.admin_id, Number(job.menu_message_id));
  } catch {
    const menu = await sendMessage(env, job.chat_id, text, keyboard);
    const messageId = Number(menu?.message_id || 0) || null;
    await setMenuMessageId(env, job.admin_id, messageId);
    if (job.id && messageId) {
      await env.DB.prepare("UPDATE broadcast_jobs SET menu_message_id = ?, updated_at = ? WHERE id = ?")
        .bind(messageId, unixNow(), job.id).run();
    }
    const action = await getAdminAction(env, job.admin_id).catch(() => null);
    if (!done && action?.target_user_id === String(job.token)) {
      await setAdminAction(env, job.admin_id, action.action, {
        targetUserId: action.target_user_id,
        chatId: job.chat_id,
        messageId,
      });
    }
  }
}

async function cleanupBroadcastJobs(env) {
  await env.DB.prepare(
    "DELETE FROM broadcast_jobs WHERE status IN ('completed', 'cancelled') AND updated_at < ?"
  ).bind(unixNow() - COMPLETED_JOB_RETENTION_SECONDS).run();
}

async function ensureBroadcastJobsTable(env) {
  if (!env.DB) throw new Error("Database is not configured.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS broadcast_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, admin_id TEXT NOT NULL, chat_id TEXT NOT NULL, menu_message_id INTEGER NOT NULL, language TEXT NOT NULL DEFAULT 'all', payload_json TEXT NOT NULL, reply_markup_json TEXT, last_user_id TEXT NOT NULL DEFAULT '0', total INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
}

function normalizeBroadcastLanguage(language) {
  const value = String(language || "all").trim().toLowerCase();
  return value === "all" ? "all" : value;
}

function broadcastCancelKeyboard() {
  return { inline_keyboard: [[{ text: "🛑 Cancel Broadcast", callback_data: "admin_broadcast_cancel" }]] };
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}
