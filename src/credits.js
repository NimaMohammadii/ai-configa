import { requireDb } from "./state.js";

export async function getBalance(env, userId) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT credits FROM user_credits WHERE user_id = ?"
  ).bind(String(userId)).first();

  return Number(row?.credits || 0);
}

export async function ensureBalanceRow(env, userId) {
  requireDb(env);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(String(userId)).run();
}
