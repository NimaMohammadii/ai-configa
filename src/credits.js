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

export async function spendCredits(env, userId, amount) {
  requireDb(env);
  await ensureBalanceRow(env, userId);

  const needed = Number(amount || 0);
  if (!Number.isFinite(needed) || needed <= 0) {
    return { ok: true, balance: await getBalance(env, userId) };
  }

  const current = await getBalance(env, userId);
  if (current < needed) {
    return { ok: false, balance: current, needed };
  }

  await env.DB.prepare(
    "UPDATE user_credits SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND credits >= ?"
  ).bind(needed, String(userId), needed).run();

  return { ok: true, balance: await getBalance(env, userId), spent: needed };
}
