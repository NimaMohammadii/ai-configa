import { getAdminAction, hasTrackedUser, isAdmin } from "./admin.js";
import { handleCallback as baseHandleCallback, handleMessage as baseHandleMessage } from "./bot.js";
import { getBalance } from "./credits.js";
import { normalizeLang, t } from "./i18n.js";
import { isFaChannelMember, isMandatoryFaMembershipEnabled } from "./mandatory-channel.js";
import { getPendingPayment } from "./payments.js";
import { buildReferralStartParam, getReferralStatus, parseReferralStartParam, registerReferralFromStartParam } from "./referrals.js";
import { getState } from "./state.js";
import { answerCallback, editMessage } from "./telegram-actions.js";
import { tgJson } from "./telegram-api.js";
import { referralMenuLabel, userMainKeyboard, startText } from "./ui.js";
import { isLockedVoice } from "./voices.js";

let botUsernameCache = "";

export async function handleMessage(message, env) {
  const startPayload = extractBotStartPayload(message && message.text);
  if (startPayload) {
    await registerBotReferralStart(message, env, startPayload).catch((error) => {
      console.error("bot referral registration failed", error?.message || error);
    });
  }

  const shouldEnhanceInsufficient = await shouldOfferReferralOnInsufficient(message, env).catch(() => false);
  const normalizedMessage = startPayload !== null && String(message?.text || "").trim() !== "/start"
    ? { ...message, text: "/start" }
    : message;

  await baseHandleMessage(normalizedMessage, env);

  if (shouldEnhanceInsufficient) {
    await enhanceInsufficientCreditsMenu(message, env).catch((error) => {
      console.error("bot referral insufficient-credit UI failed", error?.message || error);
    });
  }
}

export async function handleCallback(query, env) {
  const data = query.data || "";
  if (data === "bot_referral") {
    await showBotReferral(query, env);
    return;
  }

  await baseHandleCallback(query, env);
  if (!shouldRefresh(data)) return;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const userId = query.from && query.from.id;
  await refreshMainMenu(chatId, userId, env);
}

async function registerBotReferralStart(message, env, startPayload) {
  const userId = message?.from?.id;
  if (!userId || message?.chat?.type !== "private") return;

  const parsed = parseReferralStartParam(startPayload);
  if (!parsed) return;

  const alreadyTracked = await hasTrackedUser(env, userId).catch(() => true);
  if (alreadyTracked) return;

  const referrerExists = await hasTrackedUser(env, parsed.referrerUserId).catch(() => false);
  if (!referrerExists) return;

  await registerReferralFromStartParam(env, userId, startPayload);
}

function extractBotStartPayload(value) {
  const match = String(value || "").trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) return null;
  return String(match[1] || "").trim();
}

async function showBotReferral(query, env) {
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  const userId = query.from && query.from.id;
  if (!chatId || !messageId || !userId) return;

  await answerCallback(env, query.id).catch(() => null);

  const state = await getState(env, userId).catch(() => ({}));
  const language = normalizeLang(state?.language || query.from?.language_code || "en");
  const copy = botReferralCopy(language);
  const status = await getReferralStatus(env, userId);
  const username = await getBotUsername(env);
  const startParam = buildReferralStartParam(userId, "tts");
  const inviteUrl = `https://t.me/${username}?start=${encodeURIComponent(startParam)}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(copy.shareText)}`;

  const text = [
    `🎁 <b>${copy.title}</b>`,
    "",
    copy.description,
    "",
    `<b>${copy.progress}:</b> ${formatNumber(status.progress)} / ${formatNumber(status.requiredInvites)}`,
    `<b>${copy.total}:</b> ${formatNumber(status.totalInvites)}`,
    `<b>${copy.earned}:</b> ${formatNumber(status.totalRewardCredits)} ${copy.credits}`,
  ].join("\n");

  const keyboard = {
    inline_keyboard: [
      [{ text: copy.share, url: shareUrl }],
      [{ text: copy.refresh, callback_data: "bot_referral" }],
      [{ text: t(language, "back"), callback_data: "back_main" }],
    ],
  };

  await editMessage(env, chatId, messageId, text, keyboard);
}

async function getBotUsername(env) {
  if (botUsernameCache) return botUsernameCache;
  const me = await tgJson(env, "getMe");
  const username = String(me?.username || "").replace(/^@/, "").trim();
  if (!username) throw new Error("Bot username is unavailable");
  botUsernameCache = username;
  return username;
}

async function shouldOfferReferralOnInsufficient(message, env) {
  const userId = message?.from?.id;
  const text = String(message?.text || "").trim();
  if (!userId || !text || text.startsWith("/")) return false;
  if (message?.photo || message?.audio || message?.voice || message?.video || message?.video_note || message?.document) return false;

  const state = await getState(env, userId).catch(() => null);
  if (!state?.language) return false;

  const adminAction = await getAdminAction(env, userId).catch(() => null);
  if (adminAction) return false;

  const pending = await getPendingPayment(env, userId).catch(() => null);
  const pendingId = String(pending?.package_id || "");
  if (pendingId.startsWith("input") || pendingId.startsWith("custom:")) return false;

  const admin = await isAdmin(env, userId).catch(() => false);
  if (isLockedVoice(state.voice || "Nora") && !admin) return false;

  if (state.language === "fa" && !admin && await isMandatoryFaMembershipEnabled(env).catch(() => false)) {
    const member = await isFaChannelMember(env, userId).catch(() => false);
    if (!member) return false;
  }

  const balance = await getBalance(env, userId);
  return balance < Array.from(text).length;
}

async function enhanceInsufficientCreditsMenu(message, env) {
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  if (!chatId || !userId) return;

  const state = await getState(env, userId).catch(() => null);
  const messageId = state?.menuMessageId;
  if (!messageId) return;

  const language = normalizeLang(state.language || message?.from?.language_code || "en");
  const balance = await getBalance(env, userId);
  const cost = Array.from(String(message?.text || "").trim()).length;
  const copy = botReferralCopy(language);
  const text = [
    t(language, "notEnough", { needed: cost, balance }),
    "",
    t(language, "creditRule"),
    "",
    copy.insufficientOffer,
  ].join("\n");

  await editMessage(env, chatId, messageId, text, {
    inline_keyboard: [[
      { text: t(language, "buyCredits"), callback_data: "insufficient_buy_credits" },
      { text: copy.share, callback_data: "bot_referral" },
    ]],
  });
}

async function refreshMainMenu(chatId, userId, env) {
  if (!chatId || !userId) return;
  const state = await getState(env, userId).catch(() => null);
  if (!state || !state.language || !state.menuMessageId) return;
  await editMessage(env, chatId, state.menuMessageId, startText(state), await userMainKeyboard(env, userId, state)).catch(() => null);
}

function shouldRefresh(data) {
  return data.startsWith("lang:") || data.startsWith("page:") || data.startsWith("voice:") || data === "back_main" || data === "cancel_payment";
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("en-US");
}

function botReferralCopy(language) {
  return BOT_REFERRAL_COPY[language] || BOT_REFERRAL_COPY.en;
}

const BOT_REFERRAL_COPY = Object.freeze({
  en: {
    title: "Free credits",
    description: "Invite 3 friends and get <b>300 credits</b>. Every 3 new friends unlock another 300 credits.",
    insufficientOffer: "Buy credits, or invite <b>3 friends</b> and get <b>300 free credits</b>.",
    progress: "Progress",
    total: "Friends invited",
    earned: "Earned",
    credits: "credits",
    share: "Invite friends",
    refresh: "Refresh progress",
    shareText: "🎙 Try Vexa — turn any text into a natural AI voice in seconds 👇",
  },
  fa: {
    title: "کردیت رایگان",
    description: "3 تا از دوستاتو دعوت کن و <b>300 کردیت</b> بگیر. هر 3 دعوت جدید دوباره 300 کردیت می‌ده.",
    insufficientOffer: "یا کردیت بخر، یا <b>3 تا از دوستاتو دعوت کن</b> و <b>300 کردیت رایگان</b> بگیر.",
    progress: "پیشرفت",
    total: "دوست‌های دعوت‌شده",
    earned: "کردیت گرفته‌شده",
    credits: "کردیت",
    share: "دعوت از دوستا",
    refresh: "آپدیت پیشرفت",
    shareText: "🎙 وکسا رو امتحان کن — هر متنی رو تو چند ثانیه به صدای طبیعی AI تبدیل می‌کنه 👇",
  },
  ru: {
    title: "Бесплатные кредиты",
    description: "Пригласи 3 друзей и получи <b>300 кредитов</b>. Каждые следующие 3 друга дают ещё 300.",
    insufficientOffer: "Купи кредиты или пригласи <b>3 друзей</b> и получи <b>300 бесплатных кредитов</b>.",
    progress: "Прогресс",
    total: "Приглашено друзей",
    earned: "Получено",
    credits: "кредитов",
    share: "Пригласить друзей",
    refresh: "Обновить прогресс",
    shareText: "🎙 Попробуй Vexa — превращай любой текст в естественную AI-озвучку за секунды 👇",
  },
  de: {
    title: "Kostenlose Credits",
    description: "Lade 3 Freunde ein und erhalte <b>300 Credits</b>. Für je 3 weitere Freunde gibt es erneut 300.",
    insufficientOffer: "Kaufe Credits oder lade <b>3 Freunde</b> ein und erhalte <b>300 kostenlose Credits</b>.",
    progress: "Fortschritt",
    total: "Eingeladene Freunde",
    earned: "Verdient",
    credits: "Credits",
    share: "Freunde einladen",
    refresh: "Fortschritt aktualisieren",
    shareText: "🎙 Probier Vexa aus — verwandle jeden Text in Sekunden in eine natürliche KI-Stimme 👇",
  },
  tr: {
    title: "Ücretsiz kredi",
    description: "3 arkadaşını davet et ve <b>300 kredi</b> kazan. Her yeni 3 davette tekrar 300 kredi alırsın.",
    insufficientOffer: "Kredi satın al veya <b>3 arkadaşını davet et</b> ve <b>300 ücretsiz kredi</b> kazan.",
    progress: "İlerleme",
    total: "Davet edilen arkadaşlar",
    earned: "Kazanılan",
    credits: "kredi",
    share: "Arkadaş davet et",
    refresh: "İlerlemeyi yenile",
    shareText: "🎙 Vexa'yı dene — istediğin metni saniyeler içinde doğal bir AI sesine dönüştür 👇",
  },
  ar: {
    title: "رصيد مجاني",
    description: "ادعُ 3 أصدقاء واحصل على <b>300 رصيد</b>. كل 3 دعوات جديدة تمنحك 300 أخرى.",
    insufficientOffer: "اشترِ رصيدًا أو ادعُ <b>3 أصدقاء</b> واحصل على <b>300 رصيد مجاني</b>.",
    progress: "التقدم",
    total: "الأصدقاء المدعوون",
    earned: "المكتسب",
    credits: "رصيد",
    share: "دعوة أصدقاء",
    refresh: "تحديث التقدم",
    shareText: "🎙 جرّب Vexa — حوّل أي نص إلى صوت AI طبيعي خلال ثوانٍ 👇",
  },
  zh: {
    title: "免费积分",
    description: "邀请 3 位好友即可获得 <b>300 积分</b>。之后每邀请 3 位新好友，再获得 300 积分。",
    insufficientOffer: "购买积分，或邀请 <b>3 位好友</b>，获得 <b>300 免费积分</b>。",
    progress: "进度",
    total: "已邀请好友",
    earned: "已获得",
    credits: "积分",
    share: "邀请好友",
    refresh: "刷新进度",
    shareText: "🎙 试试 Vexa — 几秒钟把任意文字变成自然的 AI 语音 👇",
  },
  ja: {
    title: "無料クレジット",
    description: "友達を3人招待すると <b>300クレジット</b>。その後も3人ごとに300クレジット獲得できます。",
    insufficientOffer: "クレジットを購入するか、<b>友達を3人招待</b>して<b>300無料クレジット</b>を獲得できます。",
    progress: "進捗",
    total: "招待した友達",
    earned: "獲得済み",
    credits: "クレジット",
    share: "友達を招待",
    refresh: "進捗を更新",
    shareText: "🎙 Vexaを試してみて — テキストを数秒で自然なAI音声に変換できるよ 👇",
  },
  es: {
    title: "Créditos gratis",
    description: "Invita a 3 amigos y recibe <b>300 créditos</b>. Cada 3 nuevos amigos vuelves a recibir 300.",
    insufficientOffer: "Compra créditos o invita a <b>3 amigos</b> y recibe <b>300 créditos gratis</b>.",
    progress: "Progreso",
    total: "Amigos invitados",
    earned: "Ganado",
    credits: "créditos",
    share: "Invitar amigos",
    refresh: "Actualizar progreso",
    shareText: "🎙 Prueba Vexa — convierte cualquier texto en una voz IA natural en segundos 👇",
  },
  hi: {
    title: "Free credits",
    description: "3 दोस्तों को invite करो और <b>300 credits</b> पाओ। हर अगले 3 नए दोस्तों पर फिर 300 credits मिलेंगे।",
    insufficientOffer: "Credits खरीदो, या <b>3 दोस्तों को invite करो</b> और <b>300 free credits</b> पाओ।",
    progress: "Progress",
    total: "Invited friends",
    earned: "Earned",
    credits: "credits",
    share: "दोस्तों को invite करें",
    refresh: "Progress refresh करें",
    shareText: "🎙 Vexa try करो — किसी भी text को seconds में natural AI voice में बदलो 👇",
  },
});
