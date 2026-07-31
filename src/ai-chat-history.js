import { requireDb } from "./state.js";

export async function ensureAiChatHistoryTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, user_message TEXT NOT NULL DEFAULT '', assistant_message TEXT NOT NULL DEFAULT '', attachment_name TEXT, response_type TEXT NOT NULL DEFAULT 'text', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_created ON ai_chat_history (user_id, created_at DESC, id DESC)").run();
}

export async function saveAiChatExchange(env, userId, messages, result) {
  await ensureAiChatHistoryTable(env);
  const latest = [...(Array.isArray(messages) ? messages : [])].reverse().find((message) => message?.role !== "assistant");
  const userMessage = Array.from(String(latest?.content || "").trim()).slice(0, 4000).join("");
  const attachmentName = latest?.attachment?.name ? Array.from(String(latest.attachment.name)).slice(0, 255).join("") : null;
  const responseType = result?.type === "image_request" ? "image_request" : "text";
  const assistantMessage = responseType === "image_request"
    ? "[Image request] " + String(result?.prompt || "") + (result?.size ? " (" + result.size + ")" : "")
    : String(result?.message || "");
  await env.DB.prepare(
    "INSERT INTO ai_chat_history (user_id, user_message, assistant_message, attachment_name, response_type, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(userId), userMessage, assistantMessage, attachmentName, responseType).run();
}

export async function getAiChatHistory(env, userId) {
  await ensureAiChatHistoryTable(env);
  const rows = await env.DB.prepare(
    "SELECT id, user_message, assistant_message, attachment_name, response_type, created_at FROM ai_chat_history WHERE user_id = ? ORDER BY id ASC"
  ).bind(String(userId)).all();
  return rows.results || [];
}

export function buildAiChatHistoryFile(userId, rows = []) {
  const lines = ["Vexa AI chat history", "User ID: " + userId, "Exported: " + new Date().toISOString(), ""];
  if (!rows.length) lines.push("No saved conversations.");
  for (const row of rows) {
    lines.push("--- " + (row.created_at || "Unknown time") + " ---");
    lines.push("USER" + (row.attachment_name ? " [attachment: " + row.attachment_name + "]" : "") + ":");
    lines.push(row.user_message || "[No text]");
    lines.push("");
    lines.push("AI:");
    lines.push(row.assistant_message || "[No response text]", "");
  }
  return lines.join("\n");
}
