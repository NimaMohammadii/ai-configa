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

export async function ensureCreditUsageLogTable(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS credit_usage_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credits INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT 'tts', metadata TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_credit_usage_log_created ON credit_usage_log (created_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_created ON credit_usage_log (user_id, created_at DESC)"
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credit_usage_log (id, user_id, credits, reason, metadata, created_at) " +
    "SELECT 'tts_history:' || rowid, user_id, credits, 'tts_history_backfill', NULL, created_at FROM tts_history WHERE credits > 0"
  ).run().catch(() => null);
}

export async function recordCreditUsage(env, userId, amount, reason = "tts", metadata = null) {
  requireDb(env);
  const credits = Number(amount || 0);
  if (!Number.isFinite(credits) || credits <= 0) return;
  await ensureCreditUsageLogTable(env);
  await env.DB.prepare(
    "INSERT INTO credit_usage_log (id, user_id, credits, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(
    crypto.randomUUID(),
    String(userId),
    credits,
    String(reason || "tts"),
    metadata == null ? null : JSON.stringify(metadata)
  ).run();
}

export async function spendCredits(env, userId, amount, reason = "tts", metadata = null) {
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

  const result = await env.DB.prepare(
    "UPDATE user_credits SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND credits >= ?"
  ).bind(needed, String(userId), needed).run();

  const changed = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changed <= 0) {
    const balance = await getBalance(env, userId);
    return { ok: false, balance, needed };
  }

  await recordCreditUsage(env, userId, needed, reason, metadata);

  return { ok: true, balance: await getBalance(env, userId), spent: needed };
}
