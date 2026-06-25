import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";
import { sendMessage } from "./telegram-actions.js";

export const DAILY_REWARD_CREDITS = 80;
const DAY_SECONDS = 24 * 60 * 60;

export async function claimDailyReward(env, userId) {
  requireDb(env);
  const id = String(userId);
  const existing = await getDailyReward(env, id);

  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO daily_rewards (user_id, last_claimed_at, last_notified_at, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(id).run();
    const balance = await addCredits(env, id, DAILY_REWARD_CREDITS);
    return { ok: true, credits: DAILY_REWARD_CREDITS, balance, remainingSeconds: DAY_SECONDS };
  }

  const remainingSeconds = secondsUntilNextClaim(existing.last_claimed_at);
  if (remainingSeconds > 0) {
    return { ok: false, credits: DAILY_REWARD_CREDITS, remainingSeconds };
  }

  const result = await env.DB.prepare(
    "UPDATE daily_rewards SET last_claimed_at = CURRENT_TIMESTAMP, last_notified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND (last_claimed_at IS NULL OR datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP)"
  ).bind(id).run();

  if (!result?.meta?.changes) {
    const latest = await getDailyReward(env, id);
    return { ok: false, credits: DAILY_REWARD_CREDITS, remainingSeconds: secondsUntilNextClaim(latest?.last_claimed_at) };
  }

  const balance = await addCredits(env, id, DAILY_REWARD_CREDITS);
  return { ok: true, credits: DAILY_REWARD_CREDITS, balance, remainingSeconds: DAY_SECONDS };
}

export async function getDailyRewardStatus(env, userId) {
  requireDb(env);
  const row = await getDailyReward(env, userId);
  return { credits: DAILY_REWARD_CREDITS, canClaim: !row || secondsUntilNextClaim(row.last_claimed_at) <= 0, remainingSeconds: row ? secondsUntilNextClaim(row.last_claimed_at) : 0 };
}

export function dailyRewardMessage(lang, result) {
  if (result.ok) {
    if (lang === "fa") return `🎁 تو امروز ${DAILY_REWARD_CREDITS} کردیت گرفتی\nفردا دوباره منتظرتم`;
    return `🎁 You got ${DAILY_REWARD_CREDITS} credits today\nCome back tomorrow`;
  }
  const remaining = formatRemainingTime(result.remainingSeconds, lang);
  if (lang === "fa") return `⏳ جایزه روزانه‌ات هنوز آماده نیست\nزمان باقی‌مانده: ${remaining}`;
  return `⏳ Your daily reward is not ready yet\nTime left: ${remaining}`;
}

export function formatRemainingTime(totalSeconds, lang = "en") {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (lang === "fa") return `${hours} ساعت و ${minutes} دقیقه و ${secs} ثانیه`;
  return `${hours}h ${minutes}m ${secs}s`;
}

export async function notifyDueDailyRewards(env, limit = 50) {
  requireDb(env);
  const rows = await env.DB.prepare(
    "SELECT user_id FROM daily_rewards WHERE last_claimed_at IS NOT NULL AND datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP AND (last_notified_at IS NULL OR datetime(last_notified_at) < datetime(last_claimed_at, '+24 hours')) LIMIT ?"
  ).bind(Number(limit)).all();

  for (const row of rows.results || []) {
    const userId = row.user_id;
    await sendMessage(env, userId, "🎁 امروز جایزه روزانه داری بیا بگیرش و باهاش متنتو تبدیل به صدا کن").catch(() => null);
    await env.DB.prepare(
      "UPDATE daily_rewards SET last_notified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(String(userId)).run();
  }
}

async function getDailyReward(env, userId) {
  return env.DB.prepare("SELECT last_claimed_at, last_notified_at FROM daily_rewards WHERE user_id = ?").bind(String(userId)).first();
}

function secondsUntilNextClaim(lastClaimedAt) {
  if (!lastClaimedAt) return 0;
  const last = new Date(String(lastClaimedAt).replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, Math.ceil((last + DAY_SECONDS * 1000 - Date.now()) / 1000));
}
