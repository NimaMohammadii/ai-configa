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
    en: "🎁 <b>Welcome gift activated!</b>\n\nYou received <b>" + amount + " free credits</b> to test Vexa right away. Send your text now and create your first voice.",
    fa: "🎁 <b>هدیه شروع فعال شد!</b>\n\nتو <b>" + amount + " کردیت رایگان</b> گرفتی و می‌تونی همین حالا وکسا رو تست کنی.",
    ru: "🎁 <b>Приветственный подарок активирован!</b>\n\nВы получили <b>" + amount + " бесплатных кредитов</b>, чтобы сразу протестировать Vexa. Отправьте текст и создайте первый голос.",
    de: "🎁 <b>Willkommensgeschenk aktiviert!</b>\n\nDu hast <b>" + amount + " kostenlose Credits</b> erhalten, um Vexa sofort zu testen. Sende jetzt deinen Text und erstelle deine erste Stimme.",
    tr: "🎁 <b>Hoş geldin hediyen aktif!</b>\n\nVexa’yı hemen test edebilmen için <b>" + amount + " ücretsiz kredi</b> aldın. Metnini gönder ve ilk sesini oluştur.",
    ar: "🎁 <b>تم تفعيل هدية الترحيب!</b>\n\nلقد حصلت على <b>" + amount + " رصيداً مجانياً</b> لتجربة Vexa فوراً. أرسل النص الآن وأنشئ أول صوت لك.",
    zh: "🎁 <b>欢迎礼已激活！</b>\n\n你已获得 <b>" + amount + " 免费 credits</b>，可以立即测试 Vexa。现在发送文本，创建你的第一段语音。",
    ja: "🎁 <b>ウェルカムギフトが有効になりました！</b>\n\nVexa をすぐに試せるように <b>" + amount + " 無料 credits</b> を受け取りました。テキストを送って最初の音声を作成しましょう。",
    es: "🎁 <b>¡Regalo de bienvenida activado!</b>\n\nRecibiste <b>" + amount + " créditos gratis</b> para probar Vexa de inmediato. Envía tu texto y crea tu primera voz.",
    hi: "🎁 <b>वेलकम गिफ्ट सक्रिय हो गया!</b>\n\nVexa को तुरंत टेस्ट करने के लिए आपको <b>" + amount + " मुफ्त credits</b> मिले हैं। अपना टेक्स्ट भेजें और पहली आवाज़ बनाएं।",
  };
  return messages[lang] || messages.en;
}

async function ensureInitialStartStorage(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS initial_start_bonuses (user_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, language TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
