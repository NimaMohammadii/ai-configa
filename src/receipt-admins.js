import { requireDb } from "./state.js";

export async function getAllAdminIds(env) {
  requireDb(env);
  const ids = new Set();

  for (const key of ["ADMIN_CHAT_ID", "ADMIN_ID", "ADMIN_USER_ID"]) {
    const value = env[key];
    if (isNumericId(value)) ids.add(String(value).trim());
  }

  if (isNumericId(env.ADMIN_TOKEN)) {
    ids.add(String(env.ADMIN_TOKEN).trim());
  }

  try {
    const rows = await env.DB.prepare("SELECT user_id FROM admin_users").all();
    for (const row of rows.results || []) {
      if (row.user_id) ids.add(String(row.user_id));
    }
  } catch (error) {
    console.error("admin lookup failed", error && error.message ? error.message : error);
  }

  return Array.from(ids);
}

function isNumericId(value) {
  return /^-?\d+$/.test(String(value || "").trim());
}
