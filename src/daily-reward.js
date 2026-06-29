import { addCredits } from "./credits.js";
import { normalizeLang } from "./i18n.js";
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
    "SELECT d.user_id, COALESCE(s.language, ?) AS language FROM daily_rewards d LEFT JOIN user_state s ON s.user_id = d.user_id WHERE " + condition.replaceAll("last_claimed_at", "d.last_claimed_at").replaceAll("last_notified_at", "d.last_notified_at") + " LIMIT ?"
  ).bind("en", Number(limit)).all();

  let sent = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    const userId = row.user_id;
    try {
      const lang = normalizeLang(row.language || "en");
      await sendMessage(env, userId, dailyRewardNotificationText(rewardCredits, lang), dailyRewardNotificationKeyboard(lang));
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

export function dailyRewardNotificationText(credits, lang = "en") {
  const amount = Number(credits || DEFAULT_DAILY_REWARD_CREDITS).toLocaleString("en-US");
  const messages = {
    en: ["<b>Your daily free credits are ready.</b>", "", "Claim <b>" + amount + " free credits</b> and create a voice now."],
    ru: ["<b>Ежедневные бесплатные кредиты готовы.</b>", "", "Заберите <b>" + amount + " бесплатных кредитов</b> и создайте голос сейчас."],
    de: ["<b>Deine täglichen Gratis-Credits sind bereit.</b>", "", "Hol dir <b>" + amount + " Gratis-Credits</b> und erstelle jetzt eine Stimme."],
    fa: ["<b>کردیت رایگان روزانه‌ات آماده است.</b>", "", "<b>" + amount + " کردیت رایگان</b> بگیر و همین الان صدا بساز."],
    tr: ["<b>Günlük ücretsiz kredilerin hazır.</b>", "", "<b>" + amount + " ücretsiz kredi</b> al ve şimdi ses oluştur."],
    ar: ["<b>رصيدك المجاني اليومي جاهز.</b>", "", "احصل على <b>" + amount + " رصيداً مجانياً</b> وأنشئ صوتاً الآن."],
    zh: ["<b>你的每日免费 credits 已准备好。</b>", "", "领取 <b>" + amount + " 免费 credits</b>，现在就创建语音。"],
    ja: ["<b>毎日の無料 credits の準備ができました。</b>", "", "<b>" + amount + " 無料 credits</b> を受け取って、今すぐ音声を作成しましょう。"],
    es: ["<b>Tus créditos gratis diarios están listos.</b>", "", "Reclama <b>" + amount + " créditos gratis</b> y crea una voz ahora."],
    hi: ["<b>आपके दैनिक मुफ्त credits तैयार हैं।</b>", "", "<b>" + amount + " मुफ्त credits</b> लें और अभी आवाज़ बनाएं।"],
  };
  return (messages[normalizeLang(lang)] || messages.en).join("\n");
}

export function dailyRewardNotificationKeyboard(lang = "en") {
  const labels = {
    en: "Claim free credits", ru: "Забрать кредиты", de: "Gratis-Credits holen", fa: "گرفتن کردیت رایگان", tr: "Ücretsiz kredi al", ar: "احصل على الرصيد المجاني", zh: "领取免费 credits", ja: "無料 credits を受け取る", es: "Reclamar créditos gratis", hi: "मुफ्त credits लें",
  };
  return { inline_keyboard: [[{ text: labels[normalizeLang(lang)] || labels.en, callback_data: "daily_reward" }]] };
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
