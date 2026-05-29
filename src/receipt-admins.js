import { requireDb } from "./state.js";

export async function getAllAdminIds(env) {
  requireDb(env);
  const rows = await env.DB.prepare("SELECT user_id FROM admin_users").all();
  const ids = new Set((rows.results || []).map((row) => String(row.user_id)));

  if (env.ADMIN_CHAT_ID) ids.add(String(env.ADMIN_CHAT_ID));

  return Array.from(ids);
}
