import { getBalance } from "./credits.js";
import { requireDb } from "./state.js";

export const ADMIN_CREDIT_AMOUNTS = [100, 500, 1000, 5000, 10000];

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

  if (!env.ADMIN_TOKEN) {
    throw new Error("ADMIN_TOKEN secret is missing");
  }

  if (String(env.ADMIN_TOKEN) !== String(token) && String(env.ADMIN_TOKEN) !== String(userId)) {
    return false;
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO admin_users (user_id, created_at) VALUES (?, CURRENT_TIMESTAMP)"
  ).bind(String(userId)).run();

  return true;
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

export async function getAdminUserDetails(env, userId) {
  requireDb(env);

  const user = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, created_at FROM bot_users WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!user) return null;

  const balance = await getBalance(env, userId);
  return { ...user, balance };
}

export async function adminPanelText(env, page = 0) {
  const data = await getAdminUsersPage(env, page);
  return [
    "👑 <b>Admin Panel</b>",
    "",
    "Users: <b>" + data.total + "</b>",
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
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_page:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_page:" + (data.page + 1) });
  if (nav.length) rows.push(nav);

  rows.push([{ text: "Refresh", callback_data: "admin_page:" + data.page }]);

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
    "",
    "Adjust credits:"
  ].join("\n");
}

export function adminUserKeyboard(userId, page = 0) {
  const rows = [];

  for (const amount of ADMIN_CREDIT_AMOUNTS) {
    rows.push([
      { text: "+" + amount, callback_data: "admin_credit:add:" + userId + ":" + amount + ":" + page },
      { text: "-" + amount, callback_data: "admin_credit:remove:" + userId + ":" + amount + ":" + page },
    ]);
  }

  rows.push([{ text: "← Back to users", callback_data: "admin_page:" + page }]);
  return { inline_keyboard: rows };
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
