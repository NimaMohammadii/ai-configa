export async function ensureImageHistoryTable(env) {
  if (!env.DB) throw new Error("Database is not configured.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS image_generation_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, chat_id TEXT, kind TEXT NOT NULL, prompt TEXT NOT NULL, file_id TEXT, mime_type TEXT NOT NULL DEFAULT 'image/jpeg', filename TEXT, size TEXT, source_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_image_generation_history_user ON image_generation_history (user_id, id DESC)").run();
}

export async function saveImageHistory(env, entry) {
  await ensureImageHistoryTable(env);
  await env.DB.prepare(
    "INSERT INTO image_generation_history (user_id, chat_id, kind, prompt, file_id, mime_type, filename, size, source_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(
    String(entry.userId),
    entry.chatId ? String(entry.chatId) : null,
    entry.kind === "edit" ? "edit" : "generate",
    String(entry.prompt || ""),
    entry.fileId ? String(entry.fileId) : null,
    String(entry.mimeType || "image/jpeg"),
    entry.filename ? String(entry.filename) : null,
    entry.size ? String(entry.size) : null,
    Number(entry.sourceCount || 0),
  ).run();
}

export async function getImageUsersPage(env, page = 0, limit = 8) {
  await ensureImageHistoryTable(env);
  const offset = Number(page) * Number(limit);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM (SELECT user_id FROM image_generation_history GROUP BY user_id)").first();
  const rows = await env.DB.prepare(
    "SELECT h.user_id, u.username, u.first_name, u.last_name, COUNT(*) AS image_count, MAX(h.created_at) AS last_image_at " +
    "FROM image_generation_history h LEFT JOIN bot_users u ON u.user_id = h.user_id " +
    "GROUP BY h.user_id ORDER BY image_count DESC, datetime(last_image_at) DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), offset).all();
  return { total: Number(count?.total || 0), page: Number(page), limit: Number(limit), users: rows.results || [] };
}

export async function getUserImageHistory(env, userId, limit = 100) {
  await ensureImageHistoryTable(env);
  const rows = await env.DB.prepare(
    "SELECT id, user_id, chat_id, kind, prompt, file_id, mime_type, filename, size, source_count, created_at FROM image_generation_history WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(String(userId), Number(limit)).all();
  return rows.results || [];
}

export function buildImageHistoryFile(userId, rows) {
  const lines = ["Image history for user " + userId, "Total exported: " + rows.length, ""];
  rows.forEach((item, index) => {
    lines.push("#" + (index + 1));
    lines.push("Date: " + (item.created_at || "Unknown"));
    lines.push("Kind: " + (item.kind || "generate"));
    lines.push("Size: " + (item.size || "Unknown"));
    lines.push("Source images: " + Number(item.source_count || 0));
    lines.push("Telegram file_id: " + (item.file_id || "Not stored"));
    lines.push("Filename: " + (item.filename || "vexa-image.jpg"));
    lines.push("Prompt:");
    lines.push(String(item.prompt || ""));
    lines.push("");
  });
  return lines.join("\n");
}

export async function sendImageHistoryDocuments(env, chatId, rows, sendDocumentFileId) {
  let sent = 0;
  for (const item of rows) {
    if (!item.file_id) continue;
    await sendDocumentFileId(env, chatId, item.file_id, imageHistoryCaption(item)).then(() => { sent += 1; }).catch(() => null);
  }
  return sent;
}

function imageHistoryCaption(item) {
  return "🖼 Image #" + item.id + "\n" + String(item.prompt || "").slice(0, 850);
}
