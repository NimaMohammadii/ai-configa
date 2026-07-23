import { addCredits, ensureBalanceRow } from "./credits.js";
import { requireDb } from "./state.js";

const SPIN_COOLDOWN_SECONDS = 24 * 60 * 60;
export const WHEEL_DISCOUNT_SECONDS = 24 * 60 * 60;

export const WHEEL_PRIZES = [
  { type: "discount", discountPercent: 30, weight: 2 },
  { type: "credits", credits: 2100, weight: 2 },
  { type: "credits", credits: 150, weight: 24 },
  { type: "credits", credits: 400, weight: 24 },
  { type: "discount", discountPercent: 15, weight: 24 },
  { type: "credits", credits: 80, weight: 24 },
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
    prizes: WHEEL_PRIZES.map(formatPrizeForClient),
    purchaseDiscount: await getActiveWheelPurchaseDiscount(env, userId, now),
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
      "INSERT INTO mini_app_wheel_spins (user_id, last_spin_at, reward, spin_id, spin_count, total_reward, updated_at, created_at) VALUES (?, ?, 0, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
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
  const discountExpiresAt = winner.type === "discount" ? now + WHEEL_DISCOUNT_SECONDS : null;
  const balance = winner.type === "credits" ? await addCredits(env, userId, winner.credits) : await getCurrentBalance(env, userId);
  const spinId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO mini_app_wheel_spins (user_id, last_spin_at, reward, spin_id, spin_count, total_reward, reward_discount_percent, reward_discount_expires_at, updated_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET last_spin_at = excluded.last_spin_at, reward = excluded.reward, spin_id = excluded.spin_id, spin_count = COALESCE(mini_app_wheel_spins.spin_count, 0) + 1, total_reward = COALESCE(mini_app_wheel_spins.total_reward, 0) + excluded.reward, reward_discount_percent = excluded.reward_discount_percent, reward_discount_expires_at = excluded.reward_discount_expires_at, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), now, Number(winner.credits || 0), spinId, Number(winner.credits || 0), Number(winner.discountPercent || 0), Number(discountExpiresAt || 0)).run();

  return {
    reward: Number(winner.credits || 0),
    prize: formatPrizeForClient(winner),
    discountPercent: Number(winner.discountPercent || 0),
    discountExpiresAt,
    segmentIndex: winner.index,
    balance,
    spinId,
    canSpin: Boolean(isAdmin),
    isAdmin: Boolean(isAdmin),
    nextSpinAt: isAdmin ? now : now + SPIN_COOLDOWN_SECONDS,
    serverNow: now,
    purchaseDiscount: await getActiveWheelPurchaseDiscount(env, userId, now),
  };
}

async function getCurrentBalance(env, userId) {
  const row = await env.DB.prepare("SELECT credits FROM user_credits WHERE user_id = ?").bind(String(userId)).first();
  return Number(row?.credits || 0);
}

function formatPrizeForClient(item) {
  if (item?.type === "discount") return { type: "discount", discountPercent: Number(item.discountPercent || 0) };
  return { type: "credits", credits: Number(item?.credits || 0) };
}

export async function getActiveWheelPurchaseDiscount(env, userId, now = Math.floor(Date.now() / 1000)) {
  requireDb(env);
  await ensureWheelTable(env);
  const row = await env.DB.prepare(
    "SELECT reward_discount_percent, reward_discount_expires_at FROM mini_app_wheel_spins WHERE user_id = ?"
  ).bind(String(userId)).first();
  const percent = Number(row?.reward_discount_percent || 0);
  const expiresAt = Number(row?.reward_discount_expires_at || 0);
  if (!percent || expiresAt <= now) return null;
  return { percent, expiresAt };
}

export function applyWheelPurchaseDiscountToAmount(amount, discount) {
  const base = Math.max(0, Math.ceil(Number(amount || 0)));
  const percent = Number(discount?.percent || 0);
  if (!percent) return { originalAmount: base, amount: base, discountPercent: 0, discountAmount: 0 };
  const discounted = Math.max(1, Math.ceil(base * (100 - percent) / 100));
  return { originalAmount: base, amount: discounted, discountPercent: percent, discountAmount: base - discounted };
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

export async function ensureWheelTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS mini_app_wheel_spins (user_id TEXT PRIMARY KEY, last_spin_at INTEGER NOT NULL DEFAULT 0, reward INTEGER NOT NULL DEFAULT 0, spin_id TEXT, spin_count INTEGER NOT NULL DEFAULT 0, total_reward INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare("ALTER TABLE mini_app_wheel_spins ADD COLUMN spin_count INTEGER NOT NULL DEFAULT 0").run().catch(() => null);
  await env.DB.prepare("ALTER TABLE mini_app_wheel_spins ADD COLUMN total_reward INTEGER NOT NULL DEFAULT 0").run().catch(() => null);
  await env.DB.prepare("ALTER TABLE mini_app_wheel_spins ADD COLUMN reward_discount_percent INTEGER NOT NULL DEFAULT 0").run().catch(() => null);
  await env.DB.prepare("ALTER TABLE mini_app_wheel_spins ADD COLUMN reward_discount_expires_at INTEGER NOT NULL DEFAULT 0").run().catch(() => null);
  await env.DB.prepare("UPDATE mini_app_wheel_spins SET spin_count = 1 WHERE spin_count = 0 AND reward > 0").run().catch(() => null);
  await env.DB.prepare("UPDATE mini_app_wheel_spins SET total_reward = reward WHERE total_reward = 0 AND reward > 0").run().catch(() => null);
}
