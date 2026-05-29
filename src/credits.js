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

export async function addCredits(env, userId, amount) {
  requireDb(env);
  await ensureBalanceRow(env, userId);

  await env.DB.prepare(
    "UPDATE user_credits SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
  ).bind(Number(amount), String(userId)).run();

  return getBalance(env, userId);
}

export async function removeCredits(env, userId, amount) {
  requireDb(env);
  await ensureBalanceRow(env, userId);

  await env.DB.prepare(
    "UPDATE user_credits SET credits = MAX(credits - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
  ).bind(Number(amount), String(userId)).run();

  return getBalance(env, userId);
}
