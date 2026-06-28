import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";
import { sendMessage } from "./telegram-actions.js";

export const DEFAULT_DAILY_REWARD_CREDITS = 80;
export const DAILY_REWARD_SETTING_KEY = "daily_reward_credits";
const DAY_SECONDS = 24 * 60 * 60;

export async function claimDailyReward(env, userId) {
  requireDb(env);
  const id = String(userId);
  const existing = await getDailyReward(env, id);
  const rewardCredits = await getDailyRewardCredits(env);

  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO daily_rewards (user_id, last_claimed_at, last_notified_at, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(id).run();
    const balance = await addCredits(env, id, rewardCredits);
    return { ok: true, credits: rewardCredits, balance, remainingSeconds: DAY_SECONDS };
  }

  const remainingSeconds = secondsUntilNextClaim(existing.last_claimed_at);
  if (remainingSeconds > 0) {
    return { ok: false, credits: rewardCredits, remainingSeconds };
  }

  const result = await env.DB.prepare(
    "UPDATE daily_rewards SET last_claimed_at = CURRENT_TIMESTAMP, last_notified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND (last_claimed_at IS NULL OR datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP)"
  ).bind(id).run();

  if (!result?.meta?.changes) {
    const latest = await getDailyReward(env, id);
    return { ok: false, credits: rewardCredits, remainingSeconds: secondsUntilNextClaim(latest?.last_claimed_at) };
  }

  const balance = await addCredits(env, id, rewardCredits);
  return { ok: true, credits: rewardCredits, balance, remainingSeconds: DAY_SECONDS };
}

export async function getDailyRewardStatus(env, userId) {
  requireDb(env);
  const row = await getDailyReward(env, userId);
  const rewardCredits = await getDailyRewardCredits(env);
  return { credits: rewardCredits, canClaim: !row || secondsUntilNextClaim(row.last_claimed_at) <= 0, remainingSeconds: row ? secondsUntilNextClaim(row.last_claimed_at) : 0 };
}

export function dailyRewardMessage(lang, result) {
  if (result.ok) {
    if (lang === "fa") return `🎁 تو امروز ${result.credits} کردیت گرفتی\nفردا دوباره منتظرتم`;
    return `🎁 You got ${result.credits} credits today\nCome back tomorrow`;
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

export async function notifyDueDailyRewards(env, limit = 50, options = {}) {
  requireDb(env);
  const includeAlreadyNotified = Boolean(options.includeAlreadyNotified);
  const rewardCredits = await getDailyRewardCredits(env);
  const condition = includeAlreadyNotified
    ? "last_claimed_at IS NOT NULL AND datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP"
    : "last_claimed_at IS NOT NULL AND datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP AND (last_notified_at IS NULL OR datetime(last_notified_at) < datetime(last_claimed_at, '+24 hours'))";
  const rows = await env.DB.prepare(
    "SELECT user_id FROM daily_rewards WHERE " + condition + " LIMIT ?"
  ).bind(Number(limit)).all();

  let sent = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    const userId = row.user_id;
    try {
      await sendMessage(env, userId, dailyRewardNotificationText(rewardCredits), dailyRewardNotificationKeyboard());
      sent++;
      await env.DB.prepare(
        "UPDATE daily_rewards SET last_notified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(String(userId)).run();
    } catch {
      failed++;
    }
  }

  return { total: (rows.results || []).length, sent, failed, credits: rewardCredits };
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


export async function getDailyRewardCredits(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(DAILY_REWARD_SETTING_KEY).first();
  const credits = Number.parseInt(row?.value, 10);
  return Number.isFinite(credits) && credits > 0 ? credits : DEFAULT_DAILY_REWARD_CREDITS;
}

export async function setDailyRewardCredits(env, credits) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const value = Number.parseInt(credits, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Daily reward credits must be a positive number");
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(DAILY_REWARD_SETTING_KEY, String(value)).run();
  return value;
}

export function dailyRewardNotificationText(credits) {
  return [
    "🎁 <b>هدیه روزانه‌ات آماده‌ست!</b>",
    "",
    "امروز <b>" + Number(credits || DEFAULT_DAILY_REWARD_CREDITS).toLocaleString("en-US") + " کردیت رایگان</b> منتظرته ✨",
    "بزن روش و همین الان با Vexa صدای خفن بساز 🚀🎧"
  ].join("\n");
}

export function dailyRewardNotificationKeyboard() {
  return { inline_keyboard: [[{ text: "🎁 گرفتن کردیت رایگان امروز", callback_data: "daily_reward" }]] };
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
