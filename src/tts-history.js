import { requireDb } from "./state.js";

const HISTORY_LIMIT = 8;

export async function ensureTtsHistoryTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS tts_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, text TEXT NOT NULL, voice TEXT, language TEXT, credits INTEGER NOT NULL DEFAULT 0, audio_base64 TEXT NOT NULL DEFAULT '', file_id TEXT, file_type TEXT, telegram_message_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();

  await tryAlter(env, "ALTER TABLE tts_history ADD COLUMN audio_base64 TEXT NOT NULL DEFAULT ''");
  await tryAlter(env, "ALTER TABLE tts_history ADD COLUMN file_id TEXT");
  await tryAlter(env, "ALTER TABLE tts_history ADD COLUMN file_type TEXT");
  await tryAlter(env, "ALTER TABLE tts_history ADD COLUMN telegram_message_id INTEGER");

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tts_history_user_created ON tts_history (user_id, created_at DESC)"
  ).run();
}

async function tryAlter(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch {}
}

export async function saveTtsHistory(env, userId, text, voice, language, credits, sentMessage) {
  await ensureTtsHistoryTable(env);

  const audio = sentMessage?.audio || null;
  const document = sentMessage?.document || null;
  const voiceMsg = sentMessage?.voice || null;
  const fileId = audio?.file_id || document?.file_id || voiceMsg?.file_id || null;
  const fileType = audio?.file_id ? "audio" : document?.file_id ? "document" : voiceMsg?.file_id ? "voice" : null;

  try {
    await env.DB.prepare(
      "INSERT INTO tts_history (user_id, text, voice, language, credits, audio_base64, file_id, file_type, telegram_message_id, created_at) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(
      String(userId),
      String(text || ""),
      String(voice || ""),
      String(language || ""),
      Number(credits || 0),
      fileId,
      fileType,
      sentMessage?.message_id ? Number(sentMessage.message_id) : null
    ).run();
  } catch (firstError) {
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
}

export async function getTtsHistoryPage(env, userId, page = 0, limit = HISTORY_LIMIT) {
  await ensureTtsHistoryTable(env);
  const safePage = Math.max(0, Number(page || 0));
  const safeLimit = Math.max(1, Number(limit || HISTORY_LIMIT));
  const offset = safePage * safeLimit;

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM tts_history WHERE user_id = ?"
  ).bind(String(userId)).first();

  const rows = await env.DB.prepare(
    "SELECT id, text, voice, language, credits, file_id, file_type, created_at FROM tts_history WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ? OFFSET ?"
  ).bind(String(userId), safeLimit, offset).all();

  return {
    total: Number(count?.total || 0),
    page: safePage,
    limit: safeLimit,
    rows: rows.results || [],
  };
}

export async function getTtsHistoryItem(env, id) {
  await ensureTtsHistoryTable(env);
  return await env.DB.prepare(
    "SELECT id, user_id, text, voice, language, credits, file_id, file_type, created_at FROM tts_history WHERE id = ?"
  ).bind(String(id)).first();
}

export async function getTtsHistoryItemByIndex(env, userId, page = 0, index = 0, limit = HISTORY_LIMIT) {
  const data = await getTtsHistoryPage(env, userId, page, limit);
  return data.rows[Number(index)] || null;
}

export function ttsHistoryText(data, userId) {
  return [
    "🎧 <b>TTS History</b>",
    "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Total: <b>" + Number(data.total || 0).toLocaleString("en-US") + "</b>",
    "Page: <b>" + (Number(data.page || 0) + 1) + "</b>",
    "",
    data.total ? "Select a conversion:" : "No conversions yet. Send a new text with this user first."
  ].join("\n");
}

export function ttsHistoryKeyboard(data, userId, backPage = 0) {
  const rows = [];

  data.rows.forEach((item, index) => {
    rows.push([{ text: historyLabel(item), callback_data: "ath:" + userId + ":" + data.page + ":" + backPage + ":" + index }]);
  });

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

export function ttsHistoryItemKeyboard(item, userId, historyPage = 0, backPage = 0, index = 0) {
  const rows = [];
  if (item?.file_id) {
    rows.push([{ text: "Get Audio File", callback_data: "atf:" + userId + ":" + historyPage + ":" + backPage + ":" + index }]);
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
