import { addCredits, ensureBalanceRow } from "./credits.js";
import { requireDb } from "./state.js";

const SPIN_COOLDOWN_SECONDS = 24 * 60 * 60;

export const WHEEL_PRIZES = [
  { credits: 5000, weight: 2 },
  { credits: 2100, weight: 2 },
  { credits: 150, weight: 24 },
  { credits: 400, weight: 24 },
  { credits: 990, weight: 24 },
  { credits: 80, weight: 24 },
];

export async function getRewardWheelStatus(env, userId, isAdmin = false) {
  requireDb(env);
  await ensureWheelTable(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT last_spin_at FROM mini_app_wheel_spins WHERE user_id = ?"
  ).bind(String(userId)).first();
  const nextSpinAt = isAdmin ? now : Math.max(now, Number(row?.last_spin_at || 0) + SPIN_COOLDOWN_SECONDS);
  return {
    canSpin: isAdmin || nextSpinAt <= now,
    isAdmin: Boolean(isAdmin),
    nextSpinAt,
    serverNow: now,
    prizes: WHEEL_PRIZES.map((item) => item.credits),
  };
}

export async function spinRewardWheel(env, userId, isAdmin = false) {
  requireDb(env);
  await ensureWheelTable(env);
  await ensureBalanceRow(env, userId);

  const now = Math.floor(Date.now() / 1000);
  if (!isAdmin) {
    const cutoff = now - SPIN_COOLDOWN_SECONDS;
    const claim = await env.DB.prepare(
      "INSERT INTO mini_app_wheel_spins (user_id, last_spin_at, reward, spin_id, updated_at, created_at) VALUES (?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(user_id) DO UPDATE SET last_spin_at = excluded.last_spin_at, reward = 0, spin_id = excluded.spin_id, updated_at = CURRENT_TIMESTAMP " +
      "WHERE mini_app_wheel_spins.last_spin_at <= ?"
    ).bind(String(userId), now, crypto.randomUUID(), cutoff).run();
    const changed = Number(claim?.meta?.changes ?? claim?.changes ?? 0);
    if (changed <= 0) {
      const status = await getRewardWheelStatus(env, userId, false);
      const error = new Error("Your next spin is not ready yet.");
      error.status = 429;
      error.wheel = status;
      throw error;
    }
  }

  const winner = pickPrize();
  const balance = await addCredits(env, userId, winner.credits);
  const spinId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO mini_app_wheel_spins (user_id, last_spin_at, reward, spin_id, updated_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET last_spin_at = excluded.last_spin_at, reward = excluded.reward, spin_id = excluded.spin_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), now, winner.credits, spinId).run();

  return {
    reward: winner.credits,
    segmentIndex: winner.index,
    balance,
    spinId,
    canSpin: Boolean(isAdmin),
    isAdmin: Boolean(isAdmin),
    nextSpinAt: isAdmin ? now : now + SPIN_COOLDOWN_SECONDS,
    serverNow: now,
  };
}

function pickPrize() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * 100;
  let cursor = 0;
  for (let index = 0; index < WHEEL_PRIZES.length; index += 1) {
    cursor += WHEEL_PRIZES[index].weight;
    if (random < cursor) return { ...WHEEL_PRIZES[index], index };
  }
  const index = WHEEL_PRIZES.length - 1;
  return { ...WHEEL_PRIZES[index], index };
}

async function ensureWheelTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS mini_app_wheel_spins (user_id TEXT PRIMARY KEY, last_spin_at INTEGER NOT NULL DEFAULT 0, reward INTEGER NOT NULL DEFAULT 0, spin_id TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
