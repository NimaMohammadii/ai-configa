import { requireDb } from "./state.js";

const HISTORY_LIMIT = 8;
const EXPORT_LIMIT = 5000;

export async function ensureTtsHistoryTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS tts_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, voice TEXT NOT NULL, language TEXT NOT NULL, credits INTEGER NOT NULL, audio_base64 TEXT NOT NULL DEFAULT '', file_id TEXT, file_type TEXT, telegram_message_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();

  await addMissingTtsHistoryColumns(env);

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tts_history_user_created ON tts_history (user_id, created_at DESC)"
  ).run();
}

async function addMissingTtsHistoryColumns(env) {
  const columns = [
    "audio_base64 TEXT NOT NULL DEFAULT ''",
    "file_id TEXT",
    "file_type TEXT",
    "telegram_message_id INTEGER",
  ];

  for (const column of columns) {
    await env.DB.prepare("ALTER TABLE tts_history ADD COLUMN " + column).run().catch(() => null);
  }
}

export async function getNextTtsFileSequence(env, userId) {
  await ensureTtsHistoryTable(env);

  const historyCount = await countUserTtsHistory(env, userId);
  const usageCount = await countUserTtsCreditUsage(env, userId);

  return Math.max(historyCount, usageCount) + 1;
}

async function countUserTtsHistory(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM tts_history WHERE user_id = ? AND credits > 0"
  ).bind(String(userId)).first();

  return Number(row?.total || 0);
}

async function countUserTtsCreditUsage(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM credit_usage_log WHERE user_id = ? AND credits > 0"
  ).bind(String(userId)).first().catch(() => null);

  return Number(row?.total || 0);
}

export function buildTtsAudioFileName(sequence) {
  const parsedSequence = Number.parseInt(String(sequence || 1), 10);
  const safeSequence = Math.min(9999, Math.max(1, Number.isFinite(parsedSequence) ? parsedSequence : 1));
  return "Vexa " + String(safeSequence).padStart(4, "0") + ".mp3";
}

export async function saveTtsHistory(env, userId, text, voice, language, credits, sentMessage = null) {
  await ensureTtsHistoryTable(env);

  const audio = sentMessage?.audio || sentMessage?.document || null;
  const fileType = sentMessage?.document ? "document" : sentMessage?.audio ? "audio" : null;
  const fileId = audio?.file_id || null;
  const telegramMessageId = sentMessage?.message_id || null;

  try {
    await env.DB.prepare(
      "INSERT INTO tts_history (id, user_id, text, voice, language, credits, audio_base64, file_id, file_type, telegram_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(
      crypto.randomUUID(),
      String(userId),
      String(text || ""),
      String(voice || ""),
      String(language || ""),
      Number(credits || 0),
      fileId,
      fileType,
      telegramMessageId
    ).run();
  } catch (firstError) {
    await env.DB.prepare(
      "INSERT INTO tts_history (user_id, text, voice, language, credits, audio_base64, created_at) VALUES (?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP)"
    ).bind(
      String(userId),
      String(text || ""),
      String(voice || ""),
      String(language || ""),
      Number(credits || 0)
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

export async function getTtsHistoryExport(env, userId, limit = EXPORT_LIMIT) {
  await ensureTtsHistoryTable(env);
  const rows = await env.DB.prepare(
    "SELECT text, voice, language, credits, created_at FROM tts_history WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ?"
  ).bind(String(userId), Math.max(1, Number(limit || EXPORT_LIMIT))).all();

  return rows.results || [];
}

export function buildTtsHistoryFile(userId, rows) {
  const totalCharacters = rows.reduce((sum, item) => sum + Array.from(String(item.text || "")).length, 0);
  const totalCredits = rows.reduce((sum, item) => sum + Number(item.credits || 0), 0);
  const lines = [
    "TTS Text History",
    "User ID: " + userId,
    "Generated at: " + new Date().toISOString(),
    "Total texts: " + rows.length,
    "Total characters: " + totalCharacters,
    "Total consumed credits: " + totalCredits,
    "",
  ];

  rows.forEach((item, index) => {
    const text = String(item.text || "");
    lines.push(
      "#" + (index + 1),
      "Date: " + (item.created_at || "-"),
      "Voice: " + (item.voice || "-"),
      "Language: " + (item.language || "-"),
      "Characters: " + Array.from(text).length,
      "Consumed credits: " + Number(item.credits || 0),
      "Text:",
      text,
      "",
      "---",
      ""
    );
  });

  return "\ufeff" + lines.join("\n");
}

export function ttsHistoryText(data, userId) {
  return [
    "📝 <b>Text History</b>",
    "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Total: <b>" + Number(data.total || 0).toLocaleString("en-US") + "</b>",
    "Page: <b>" + (Number(data.page || 0) + 1) + "</b>",
    "",
    data.total ? "Select a text:" : "No text history yet. Send a new text with this user first."
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

  rows.push([{ text: "📥 Download Text History", callback_data: "admin_tts_download:" + userId + ":" + backPage }]);
  rows.push([{ text: "← Back to User", callback_data: "admin_user:" + userId + ":" + backPage }]);
  return { inline_keyboard: rows };
}

export function ttsHistoryItemText(item) {
  if (!item) return "Text not found.";

  return [
    "📝 <b>Text</b>",
    "",
    "User ID: <code>" + escapeHtml(item.user_id) + "</code>",
    "Voice: <b>" + escapeHtml(item.voice || "-") + "</b>",
    "Language: <b>" + escapeHtml(item.language || "-") + "</b>",
    "Credits: <b>" + Number(item.credits || 0).toLocaleString("en-US") + "</b>",
    "Date: <b>" + escapeHtml(item.created_at || "-") + "</b>",
    "",
    "<b>Text:</b>",
    escapeHtml(item.text || ""),
  ].join("\n");
}

export function ttsHistoryItemKeyboard(item, userId, historyPage = 0, backPage = 0, index = 0) {
  const buttons = [];
  if (item?.file_id) {
    buttons.push([{ text: "📥 Download Audio", callback_data: "atf:" + userId + ":" + historyPage + ":" + backPage + ":" + index }]);
  }
  buttons.push([{ text: "← Back to History", callback_data: "admin_tts:" + userId + ":" + historyPage + ":" + backPage }]);
  return { inline_keyboard: buttons };
}

export function ttsAudioCaption(item) {
  return [
    "📝 <b>Text History</b>",
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
