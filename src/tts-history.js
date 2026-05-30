import { requireDb } from "./state.js";

export async function saveTtsHistory(env, userId, text, voice, language, credits, sentMessage) {
  requireDb(env);

  const audio = sentMessage?.audio || null;
  const document = sentMessage?.document || null;
  const fileId = audio?.file_id || document?.file_id || null;
  const fileType = audio?.file_id ? "audio" : document?.file_id ? "document" : null;
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO tts_history (id, user_id, text, voice, language, credits, audio_base64, file_id, file_type, telegram_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(
    id,
    String(userId),
    String(text || ""),
    String(voice || ""),
    String(language || ""),
    Number(credits || 0),
    fileId,
    fileType,
    sentMessage?.message_id ? Number(sentMessage.message_id) : null
  ).run();
}

export async function getTtsHistoryPage(env, userId, page = 0, limit = 8) {
  requireDb(env);
  const offset = Number(page) * Number(limit);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM tts_history WHERE user_id = ?"
  ).bind(String(userId)).first();

  const rows = await env.DB.prepare(
    "SELECT id, text, voice, language, credits, file_id, file_type, created_at FROM tts_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).bind(String(userId), Number(limit), Number(offset)).all();

  return {
    total: Number(count?.total || 0),
    page: Number(page),
    limit: Number(limit),
    rows: rows.results || [],
  };
}

export async function getTtsHistoryItem(env, id) {
  requireDb(env);
  return await env.DB.prepare(
    "SELECT id, user_id, text, voice, language, credits, file_id, file_type, created_at FROM tts_history WHERE id = ?"
  ).bind(String(id)).first();
}

export function ttsHistoryText(data, userId) {
  return [
    "🎧 <b>TTS History</b>",
    "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Total: <b>" + data.total + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    data.total ? "Select a conversion:" : "No conversions yet."
  ].join("\n");
}

export function ttsHistoryKeyboard(data, userId, backPage = 0) {
  const rows = [];

  for (const item of data.rows) {
    rows.push([{ text: historyLabel(item), callback_data: "admin_tts_item:" + item.id + ":" + userId + ":" + data.page + ":" + backPage }]);
  }

  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_tts:" + userId + ":" + (data.page - 1) + ":" + backPage });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_tts:" + userId + ":" + (data.page + 1) + ":" + backPage });
  if (nav.length) rows.push(nav);

  rows.push([{ text: "← Back to User", callback_data: "admin_user:" + userId + ":" + backPage }]);
  return { inline_keyboard: rows };
}

export function ttsHistoryItemText(item) {
  if (!item) return "Conversion not found.";

  return [
    "🎧 <b>Conversion</b>",
    "",
    "User ID: <code>" + escapeHtml(item.user_id) + "</code>",
    "Voice: <b>" + escapeHtml(item.voice || "-") + "</b>",
    "Language: <b>" + escapeHtml(item.language || "-") + "</b>",
    "Credits: <b>" + Number(item.credits || 0).toLocaleString("en-US") + "</b>",
    "Date: <b>" + escapeHtml(item.created_at || "-") + "</b>",
    "Audio: <b>" + (item.file_id ? "Available" : "Not stored") + "</b>",
    "",
    "<b>Text:</b>",
    escapeHtml(item.text || ""),
  ].join("\n");
}

export function ttsHistoryItemKeyboard(item, userId, historyPage = 0, backPage = 0) {
  const rows = [];
  if (item?.file_id) {
    rows.push([{ text: "Get Audio File", callback_data: "admin_tts_file:" + item.id + ":" + userId + ":" + historyPage + ":" + backPage }]);
  }
  rows.push([{ text: "← Back to History", callback_data: "admin_tts:" + userId + ":" + historyPage + ":" + backPage }]);
  return { inline_keyboard: rows };
}

export function ttsAudioCaption(item) {
  return [
    "🎧 <b>TTS Audio</b>",
    "",
    "User ID: <code>" + escapeHtml(item.user_id) + "</code>",
    "Voice: <b>" + escapeHtml(item.voice || "-") + "</b>",
    "Credits: <b>" + Number(item.credits || 0).toLocaleString("en-US") + "</b>",
  ].join("\n");
}

function historyLabel(item) {
  const shortText = String(item.text || "").replace(/\s+/g, " ").trim().slice(0, 28);
  const date = String(item.created_at || "").slice(0, 16);
  return `${date} • ${item.voice || "voice"} • ${shortText || "text"}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
