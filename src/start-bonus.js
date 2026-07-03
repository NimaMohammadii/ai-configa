import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";

export const DEFAULT_INITIAL_START_CREDITS = 100;
export const INITIAL_START_CREDITS_SETTING_KEY = "initial_start_credits";

export async function getInitialStartCredits(env) {
  requireDb(env);
  await ensureInitialStartStorage(env);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(INITIAL_START_CREDITS_SETTING_KEY).first();
  const credits = Number.parseInt(row?.value, 10);
  return Number.isFinite(credits) && credits > 0 ? credits : DEFAULT_INITIAL_START_CREDITS;
}

export async function setInitialStartCredits(env, credits) {
  requireDb(env);
  await ensureInitialStartStorage(env);
  const value = Number.parseInt(credits, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Initial start credits must be a positive number");
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(INITIAL_START_CREDITS_SETTING_KEY, String(value)).run();
  return value;
}

export async function grantInitialStartBonusOnce(env, userId, language) {
  requireDb(env);
  await ensureInitialStartStorage(env);
  const credits = await getInitialStartCredits(env);
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO initial_start_bonuses (user_id, credits, language, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(userId), credits, language || null).run();

  if (Number(inserted?.meta?.changes || 0) > 0) {
    const balance = await addCredits(env, userId, credits);
    return { granted: true, credits, balance };
  }

  return { granted: false, credits };
}

export function initialStartBonusText(lang, credits) {
  const amount = Number(credits || DEFAULT_INITIAL_START_CREDITS).toLocaleString("en-US");
  const messages = {
    en: "You received <b>" + amount + " free credits</b>. Send text now and test it.",
    fa: "<b>" + amount + " کردیت رایگان</b> گرفتی. همین حالا متن بفرست و تست کن.",
    ru: "Вы получили <b>" + amount + " бесплатных кредитов</b>. Отправьте текст и протестируйте сейчас.",
    de: "Du hast <b>" + amount + " Gratis-Credits</b> erhalten. Sende jetzt Text und teste es.",
    tr: "<b>" + amount + " ücretsiz kredi</b> aldın. Şimdi metin gönderip test edebilirsin.",
    ar: "حصلت على <b>" + amount + " رصيداً مجانياً</b>. أرسل نصاً الآن وجربه.",
    zh: "你已获得 <b>" + amount + " 免费 credits</b>。现在发送文本即可测试。",
    ja: "<b>" + amount + " 無料 credits</b> を受け取りました。今すぐテキストを送って試せます。",
    es: "Recibiste <b>" + amount + " créditos gratis</b>. Envía texto ahora y pruébalo.",
    hi: "आपको <b>" + amount + " मुफ्त credits</b> मिले। अभी टेक्स्ट भेजकर टेस्ट करें।",
  };
  return messages[lang] || messages.en;
}

async function ensureInitialStartStorage(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS initial_start_bonuses (user_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, language TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
