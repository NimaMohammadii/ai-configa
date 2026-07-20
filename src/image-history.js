import { downloadTelegramFile } from "./telegram-api.js";

export async function ensureImageHistoryTable(env) {
  if (!env.DB) throw new Error("Database is not configured.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS image_generation_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, chat_id TEXT, kind TEXT NOT NULL, prompt TEXT NOT NULL, file_id TEXT, mime_type TEXT NOT NULL DEFAULT 'image/jpeg', filename TEXT, size TEXT, source_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_image_generation_history_user ON image_generation_history (user_id, id DESC)").run();
}

export async function saveImageHistory(env, entry) {
  await ensureImageHistoryTable(env);
  const result = await env.DB.prepare(
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
  return { id: Number(result?.meta?.last_row_id || 0) || null };
}

export async function deleteImageHistory(env, userId, historyId) {
  await ensureImageHistoryTable(env);
  const id = Number(historyId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = await env.DB.prepare(
    "DELETE FROM image_generation_history WHERE id = ? AND user_id = ?"
  ).bind(id, String(userId)).run();
  return Number(result?.meta?.changes || 0) > 0;
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
  if (limit == null) {
    const rows = await env.DB.prepare(
      "SELECT id, user_id, chat_id, kind, prompt AS archive_prompt, '' AS prompt, file_id, mime_type, filename, size, source_count, created_at FROM image_generation_history WHERE user_id = ? ORDER BY id DESC"
    ).bind(String(userId)).all();
    return rows.results || [];
  }
  const rows = await env.DB.prepare(
    "SELECT id, user_id, chat_id, kind, prompt AS archive_prompt, '' AS prompt, file_id, mime_type, filename, size, source_count, created_at FROM image_generation_history WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(String(userId), Number(limit)).all();
  return rows.results || [];
}

export function buildImageHistoryFile(userId, rows) {
  return { type: "image-history-archive", userId: String(userId), rows };
}

function buildImageHistoryText(userId, rows) {
  const lines = ["Image history for user " + userId, "Total exported: " + rows.length, ""];
  rows.forEach((item, index) => {
    lines.push("#" + (index + 1));
    lines.push("Date: " + (item.created_at || "Unknown"));
    lines.push("Kind: " + (item.kind || "generate"));
    lines.push("Size: " + (item.size || "Unknown"));
    lines.push("Source images: " + Number(item.source_count || 0));
    lines.push("Image file: " + (item.archiveFilename || "Not available in archive"));
    lines.push("Prompt:");
    lines.push(String(item.archive_prompt || item.prompt || ""));
    lines.push("");
  });
  return lines.join("\n");
}

export async function buildImageHistoryArchive(env, userId, rows) {
  const entries = [];
  const exportedRows = rows.map((item) => ({ ...item, archiveFilename: "" }));
  let imageCount = 0;

  for (let index = 0; index < exportedRows.length; index += 1) {
    const item = exportedRows[index];
    if (!item.file_id) continue;
    try {
      const image = await downloadTelegramFile(env, item.file_id);
      const filename = buildArchiveImageName(item, index, image.mimeType, image.filename);
      item.archiveFilename = filename;
      entries.push({ name: filename, data: new Uint8Array(image.buffer) });
      imageCount += 1;
    } catch (error) {
      item.archiveFilename = "Download failed";
    }
  }

  entries.unshift({
    name: "prompts.txt",
    data: new TextEncoder().encode(buildImageHistoryText(userId, exportedRows)),
  });

  return {
    buffer: createStoredZip(entries),
    imageCount,
    missingCount: Math.max(0, exportedRows.length - imageCount),
  };
}

export async function sendImageHistoryDocuments(env, chatId, rows, sendDocumentFileId) {
  return rows.filter((item) => item.file_id).length;
}

function buildArchiveImageName(item, index, mimeType, originalFilename) {
  const number = String(index + 1).padStart(3, "0");
  const kind = item.kind === "edit" ? "edit" : "generate";
  return "images/" + number + "-" + kind + "-" + String(item.id) + imageExtension(mimeType, originalFilename);
}

function imageExtension(mimeType, filename) {
  const type = String(mimeType || "").toLowerCase();
  const name = String(filename || "").toLowerCase();
  if (type.includes("png") || name.endsWith(".png")) return ".png";
  if (type.includes("webp") || name.endsWith(".webp")) return ".webp";
  return ".jpg";
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  for (const entry of entries) {
    const name = new TextEncoder().encode(String(entry.name));
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
