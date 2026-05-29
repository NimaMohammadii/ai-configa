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

export async function adminPanelText(env) {
  requireDb(env);

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM bot_users"
  ).first();

  const users = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at FROM bot_users ORDER BY last_seen_at DESC LIMIT 50"
  ).all();

  const rows = users.results || [];
  const lines = [
    "Admin panel",
    "Users: " + String(countRow?.total || 0),
    "",
    "Latest users:",
  ];

  if (rows.length === 0) {
    lines.push("No users yet.");
  }

  for (const user of rows) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "No name";
    const username = user.username ? "@" + user.username : "no username";
    lines.push("- " + name + " | " + username + " | id: " + user.user_id + " | " + user.last_seen_at);
  }

  return lines.join("\n");
}
