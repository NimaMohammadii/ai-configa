import { getBalance } from "./credits.js";
import { requireDb } from "./state.js";

export async function trackUser(env, user) {
  requireDb(env);
  if (!user || !user.id) return;

  await env.DB.prepare(
    "INSERT INTO bot_users (user_id, username, first_name, last_name, last_seen_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name, last_name = excluded.last_name, last_seen_at = CURRENT_TIMESTAMP"
  ).bind(
    String(user.id),
    user.username || null,
    user.first_name || null,
    user.last_name || null
  ).run();
}

export async function isAdmin(env, userId) {
  requireDb(env);
  if (!userId) return false;

  if (env.ADMIN_TOKEN && String(env.ADMIN_TOKEN) === String(userId)) {
    return true;
  }

  const row = await env.DB.prepare(
    "SELECT user_id FROM admin_users WHERE user_id = ?"
  ).bind(String(userId)).first();

  return Boolean(row);
}

export async function tryAdminLogin(env, userId, token) {
  requireDb(env);
  if (!env.ADMIN_TOKEN) throw new Error("ADMIN_TOKEN secret is missing");

  if (String(env.ADMIN_TOKEN) !== String(token) && String(env.ADMIN_TOKEN) !== String(userId)) {
    return false;
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO admin_users (user_id, created_at) VALUES (?, CURRENT_TIMESTAMP)"
  ).bind(String(userId)).run();

  return true;
}

export function adminMainText() {
  return ["👑 <b>Admin Panel</b>", "", "Choose an option:"].join("\n");
}

export function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Users", callback_data: "admin_users:0" }],
      [{ text: "Broadcast Message", callback_data: "admin_broadcast" }],
      [{ text: "Pin Text for All Users", callback_data: "admin_pin_all" }],
    ],
  };
}

export async function getAdminUsersPage(env, page = 0, limit = 8) {
  requireDb(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM bot_users").first();
  const users = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at FROM bot_users ORDER BY last_seen_at DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function getAllUserIds(env) {
  requireDb(env);
  const users = await env.DB.prepare("SELECT user_id FROM bot_users").all();
  return (users.results || []).map((user) => String(user.user_id));
}

export async function getAdminUserDetails(env, userId) {
  requireDb(env);

  const user = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, created_at FROM bot_users WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!user) return null;

  const balance = await getBalance(env, userId);
  return { ...user, balance };
}

export async function resetUser(env, userId) {
  requireDb(env);
  const id = String(userId);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM user_credits WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM pending_payments WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tts_history WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM admin_actions WHERE admin_id = ? OR target_user_id = ?").bind(id, id),
    env.DB.prepare("DELETE FROM admin_users WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM bot_users WHERE user_id = ?").bind(id),
  ]);
}

export async function adminUsersText(env, page = 0) {
  const data = await getAdminUsersPage(env, page);
  return [
    "👥 <b>Users</b>",
    "",
    "Total: <b>" + data.total + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    "Select a user:"
  ].join("\n");
}

export async function adminUsersKeyboard(env, page = 0) {
  const data = await getAdminUsersPage(env, page);
  const rows = [];

  for (const user of data.users) {
    rows.push([{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  }

  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_users:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_users:" + (data.page + 1) });
  if (nav.length) rows.push(nav);

  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function adminUserText(env, userId) {
  const user = await getAdminUserDetails(env, userId);
  if (!user) return "User not found.";

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "No name";
  const username = user.username ? "@" + user.username : "No username";

  return [
    "👤 <b>User</b>",
    "",
    "Name: <b>" + escapeHtml(name) + "</b>",
    "Username: <b>" + escapeHtml(username) + "</b>",
    "ID: <code>" + escapeHtml(user.user_id) + "</code>",
    "Balance: <b>" + Number(user.balance || 0) + " credits</b>",
    "Last seen: <b>" + escapeHtml(user.last_seen_at || "-") + "</b>",
  ].join("\n");
}

export function adminUserKeyboard(userId, page = 0) {
  return {
    inline_keyboard: [
      [{ text: "TTS History", callback_data: "admin_tts:" + userId + ":0:" + page }],
      [{ text: "Change Credits", callback_data: "admin_credit_prompt:" + userId + ":" + page }],
      [{ text: "Send Message", callback_data: "admin_msg_prompt:" + userId + ":" + page }],
      [{ text: "Reset User", callback_data: "admin_reset_user:" + userId + ":" + page }],
      [{ text: "← Back to Users", callback_data: "admin_users:" + page }],
    ],
  };
}

export function adminCreditPromptText() {
  return [
    "✏️ <b>Change Credits</b>",
    "",
    "Send the amount you want:",
    "",
    "Examples:",
    "<code>+2500</code>",
    "<code>-700</code>",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export function adminMessagePromptText() {
  return [
    "✉️ <b>Send Message</b>",
    "",
    "Send the message text for this user.",
    "Your message will be deleted after sending."
  ].join("\n");
}

export function adminBroadcastPromptText() {
  return [
    "📣 <b>Broadcast Message</b>",
    "",
    "Send the message text for all users.",
    "Your message will be deleted after sending."
  ].join("\n");
}

export function adminCancelKeyboard(backData = "admin_main") {
  return { inline_keyboard: [[{ text: "Cancel", callback_data: backData }]] };
}

export async function setAdminAction(env, adminId, action, options = {}) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO admin_actions (admin_id, action, target_user_id, page, chat_id, message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(admin_id) DO UPDATE SET action = excluded.action, target_user_id = excluded.target_user_id, page = excluded.page, chat_id = excluded.chat_id, message_id = excluded.message_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(
    String(adminId),
    action,
    options.targetUserId ? String(options.targetUserId) : null,
    Number(options.page || 0),
    options.chatId ? String(options.chatId) : null,
    options.messageId ? Number(options.messageId) : null
  ).run();
}

export async function getAdminAction(env, adminId) {
  requireDb(env);
  return await env.DB.prepare(
    "SELECT action, target_user_id, page, chat_id, message_id FROM admin_actions WHERE admin_id = ?"
  ).bind(String(adminId)).first();
}

export async function clearAdminAction(env, adminId) {
  requireDb(env);
  await env.DB.prepare("DELETE FROM admin_actions WHERE admin_id = ?").bind(String(adminId)).run();
}

function userLabel(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const username = user.username ? "@" + user.username : "";
  const label = name || username || user.user_id;
  return label + " • " + user.user_id;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
