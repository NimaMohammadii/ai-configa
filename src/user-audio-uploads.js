import { requireDb } from "./state.js";

const PAGE_LIMIT = 8;

export async function ensureUserAudioUploadsTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_audio_uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, file_id TEXT NOT NULL, file_type TEXT NOT NULL, file_name TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '', file_size INTEGER NOT NULL DEFAULT 0, duration INTEGER NOT NULL DEFAULT 0, telegram_message_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_user_audio_uploads_user_created ON user_audio_uploads (user_id, created_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_audio_uploads_message_file ON user_audio_uploads (user_id, telegram_message_id, file_id)"
  ).run();
}

export async function saveUserAudioUpload(env, userId, messageId, attachment) {
  if (!attachment || !["voice", "audio", "document"].includes(attachment.fileType)) return;
  if (attachment.fileType === "document" && !String(attachment.mimeType || "").startsWith("audio/")) return;
  await ensureUserAudioUploadsTable(env);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_audio_uploads (id, user_id, file_id, file_type, file_name, mime_type, file_size, duration, telegram_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(
    crypto.randomUUID(), String(userId), attachment.fileId, attachment.fileType,
    attachment.fileName, attachment.mimeType, attachment.fileSize, attachment.duration,
    messageId == null ? null : Number(messageId)
  ).run();
}

export async function getUserAudioUploadsPage(env, userId, page = 0) {
  await ensureUserAudioUploadsTable(env);
  const safePage = Math.max(0, Number(page || 0));
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM user_audio_uploads WHERE user_id = ?"
  ).bind(String(userId)).first();
  const rows = await env.DB.prepare(
    "SELECT id, file_id, file_type, file_name, mime_type, file_size, duration, created_at FROM user_audio_uploads WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ? OFFSET ?"
  ).bind(String(userId), PAGE_LIMIT, safePage * PAGE_LIMIT).all();
  return { total: Number(count?.total || 0), page: safePage, limit: PAGE_LIMIT, rows: rows.results || [] };
}

export function userAudioUploadsText(data, userId) {
  return [
    "🎙 <b>User Audio Files</b>", "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Total: <b>" + Number(data.total || 0).toLocaleString("en-US") + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>", "",
    data.total ? "Select a file to download:" : "No audio files have been received from this user yet."
  ].join("\n");
}

export function userAudioUploadsKeyboard(data, userId, backPage = 0) {
  const rows = data.rows.map((item, index) => [{
    text: uploadLabel(item),
    callback_data: "auf:" + userId + ":" + data.page + ":" + backPage + ":" + index,
  }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_audio_uploads:" + userId + ":" + (data.page - 1) + ":" + backPage });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_audio_uploads:" + userId + ":" + (data.page + 1) + ":" + backPage });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back to User", callback_data: "admin_user:" + userId + ":" + backPage }]);
  return { inline_keyboard: rows };
}

export function userAudioUploadCaption(item, userId) {
  return [
    "🎙 <b>User Audio File</b>", "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Type: <b>" + escapeHtml(item.file_type) + "</b>",
    "Name: <b>" + escapeHtml(item.file_name || "-") + "</b>",
    "Duration: <b>" + formatDuration(item.duration) + "</b>",
    "Date: <b>" + escapeHtml(item.created_at || "-") + "</b>",
  ].join("\n");
}

function uploadLabel(item) {
  const date = String(item.created_at || "").slice(0, 16);
  const name = String(item.file_name || item.file_type || "audio").replace(/\s+/g, " ").slice(0, 24);
  return `📥 ${date} • ${formatDuration(item.duration)} • ${name}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  if (!total) return "-";
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
