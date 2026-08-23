import { requireDb } from "./state.js";
import { getCreditIdempotencyKey } from "./credit-idempotency.js";

export const USD_MICROS_PER_CREDIT = 178;
export const USD_PER_CREDIT = USD_MICROS_PER_CREDIT / 1_000_000;
export const USD_PER_1000_CREDITS = USD_MICROS_PER_CREDIT / 1_000;
export const TTS_USD_MICROS_PER_CHARACTER = 170;
export const SMART_TTS_EDIT_BASE_USD_MICROS = 10_000;
export const LIVE_STT_USD_MICROS_PER_MINUTE = 5_000;
export const VOICE_AGENT_USD_MICROS_PER_MINUTE = 140_000;
export const VOICE_AGENT_MINIMUM_USD_MICROS = 150_000;

export function creditsForUsdMicros(value) {
  const usdMicros = Math.max(0, Number(value) || 0);
  return usdMicros > 0 ? Math.max(1, Math.ceil((usdMicros / USD_MICROS_PER_CREDIT) - 1e-12)) : 0;
}

export function creditsForTtsCharacters(value) {
  const characters = Math.max(0, Math.floor(Number(value) || 0));
  return creditsForUsdMicros(characters * TTS_USD_MICROS_PER_CHARACTER);
}

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

  const idempotencyKey = getCreditIdempotencyKey(reason);
  if (idempotencyKey) {
    return spendCreditsIdempotently(env, userId, needed, reason, metadata, idempotencyKey);
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

async function spendCreditsIdempotently(env, userId, needed, reason, metadata, rawIdempotencyKey) {
  await ensureCreditUsageLogTable(env);
  await ensureCreditIdempotencyTable(env);
  const user = String(userId);
  const key = await sha256Hex(`${user}\n${String(rawIdempotencyKey || "")}`);
  const serializedMetadata = metadata == null ? null : JSON.stringify(metadata);

  const existing = await readCreditIdempotencyResult(env, key, user);
  if (existing && existing.status !== "pending") return idempotencyResult(existing, needed, true);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO credit_spend_idempotency " +
      "(idempotency_key, user_id, credits, reason, metadata, status, balance_before, balance_after, created_at, updated_at) " +
      "SELECT ?, ?, ?, ?, ?, CASE WHEN credits >= ? THEN 'pending' ELSE 'insufficient' END, credits, " +
      "CASE WHEN credits >= ? THEN credits - ? ELSE credits END, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP " +
      "FROM user_credits WHERE user_id = ?"
    ).bind(key, user, needed, String(reason || "tts"), serializedMetadata, needed, needed, needed, user),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ? AND credits >= ? AND EXISTS (" +
      "SELECT 1 FROM credit_spend_idempotency WHERE idempotency_key = ? AND user_id = ? AND status = 'pending')"
    ).bind(needed, user, needed, key, user),
    env.DB.prepare(
      "UPDATE credit_spend_idempotency SET status = 'spent', balance_after = (SELECT credits FROM user_credits WHERE user_id = ?), " +
      "updated_at = CURRENT_TIMESTAMP WHERE idempotency_key = ? AND user_id = ? AND status = 'pending'"
    ).bind(user, key, user),
    env.DB.prepare(
      "INSERT OR IGNORE INTO credit_usage_log (id, user_id, credits, reason, metadata, created_at) " +
      "SELECT 'idem:' || idempotency_key, user_id, credits, reason, metadata, CURRENT_TIMESTAMP " +
      "FROM credit_spend_idempotency WHERE idempotency_key = ? AND user_id = ? AND status = 'spent'"
    ).bind(key, user),
  ]);

  const saved = await readCreditIdempotencyResult(env, key, user);
  if (!saved) {
    const balance = await getBalance(env, userId);
    return { ok: false, balance, needed };
  }
  return idempotencyResult(saved, needed, false);
}

async function ensureCreditIdempotencyTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS credit_spend_idempotency (" +
      "idempotency_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, credits INTEGER NOT NULL, reason TEXT NOT NULL, metadata TEXT, " +
      "status TEXT NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL, " +
      "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_credit_spend_idempotency_user_created ON credit_spend_idempotency (user_id, created_at DESC)"
  ).run();
}

async function readCreditIdempotencyResult(env, key, userId) {
  return env.DB.prepare(
    "SELECT status, credits, balance_before, balance_after FROM credit_spend_idempotency WHERE idempotency_key = ? AND user_id = ?"
  ).bind(key, userId).first();
}

function idempotencyResult(row, needed, replayed) {
  const balance = Math.max(0, Number(row?.balance_after ?? row?.balance_before ?? 0));
  if (String(row?.status || "") === "spent") {
    return { ok: true, balance, spent: Number(row?.credits || needed), idempotent: true, replayed: Boolean(replayed) };
  }
  return { ok: false, balance, needed, idempotent: true, replayed: Boolean(replayed) };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
