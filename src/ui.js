import { LANGUAGES, t } from "./i18n.js";
import { CARD_NUMBER } from "./payment-card.js";
import { getUserVoices } from "./user-voices.js";
import { VOICE_NAMES } from "./voices.js";

export const CREDIT_PRICE_PER_1000_USD = 0.24;
export const CREDIT_PER_CHARACTER = 1;
export const TOMAN_PRICE_PER_1000 = 38000;
export const TOMAN_MIN_PURCHASE_AMOUNT = 60000;

export const TOMAN_PACKAGES = {
  vexa_test: { credits: 400, bonus: 0, amount: "50,000", label: "🧪 Vexa Test — 400 Credit" },
  starter: { credits: 2000, bonus: 100, amount: "160,000", label: "⚡ Starter — 2,000 + 100 🎁" },
  pro: { credits: 8000, bonus: 500, amount: "510,000", label: "🚀 Pro — 8,000 + 500 🎁" },
  ultra: { credits: 22000, bonus: 2000, amount: "999,000", label: "👑 Ultra — 22,000 + 2,000 🎁" },
};

export function languageText() {
  return ["🌐 <b>Choose your language</b>", "", "Please select your language to continue"].join("\n");
}

export function languageKeyboard() {
  return {
    inline_keyboard: [
      [{ text: LANGUAGES.en, callback_data: "lang:en" }, { text: LANGUAGES.ru, callback_data: "lang:ru" }],
      [{ text: LANGUAGES.de, callback_data: "lang:de" }, { text: LANGUAGES.fa, callback_data: "lang:fa" }],
      [{ text: LANGUAGES.tr, callback_data: "lang:tr" }, { text: LANGUAGES.ar, callback_data: "lang:ar" }],
      [{ text: LANGUAGES.zh, callback_data: "lang:zh" }, { text: LANGUAGES.ja, callback_data: "lang:ja" }],
      [{ text: LANGUAGES.es, callback_data: "lang:es" }, { text: LANGUAGES.hi, callback_data: "lang:hi" }],
    ],
  };
}

export function startText(state) {
  const lang = state.language || "en";
  const selectedVoice = state.voice || "none";
  return [
    t(lang, "ttsTitle"),
    "",
    t(lang, "sendText"),
    t(lang, "creditRule"),
    "",
    `<b>${t(lang, "selectedVoice")}:</b> ${escapeHtml(selectedVoice)}`,
  ].join("\n");
}

export function mainKeyboard(state) {
  const lang = state.language || "en";
  const selectedVoice = state.voice || "Nora";
  const voices = normalizeMenuVoices(state.savedVoices, selectedVoice);
  const rows = [];

  for (let i = 0; i < voices.length; i += 2) {
    const row = [voiceButton(voices[i], selectedVoice)];
    if (voices[i + 1]) row.push(voiceButton(voices[i + 1], selectedVoice));
    rows.push(row);
  }

  rows.push([{ text: "🎙️ صداهای بیشتر", web_app: { url: "https://ai-configa.vexaagent.workers.dev/mini-app?section=voices" } }]);

  rows.push([{ text: t(lang, "demo"), callback_data: "demo" }]);
  rows.push([
    { text: t(lang, "balance"), callback_data: "balance" },
    { text: t(lang, "buyCredits"), callback_data: "buy_credits" },
  ]);
  rows.push([{ text: "Open Mini App 🐙", web_app: { url: "https://ai-configa.vexaagent.workers.dev/mini-app" } }]);
  return { inline_keyboard: rows };
}

export async function userMainKeyboard(env, userId, state) {
  let savedVoices = [];
  try {
    savedVoices = await getUserVoices(env, userId, state.voice || "Nora");
  } catch {}
  return mainKeyboard({ ...state, savedVoices });
}

function normalizeMenuVoices(savedVoices, selectedVoice) {
  const voices = Array.isArray(savedVoices)
    ? savedVoices.map((voice) => String(voice || "").trim()).filter((voice) => VOICE_NAMES.includes(voice))
    : [];
  if (selectedVoice && VOICE_NAMES.includes(selectedVoice) && !voices.includes(selectedVoice)) voices.unshift(selectedVoice);
  if (!voices.length) voices.push(VOICE_NAMES.includes(selectedVoice) ? selectedVoice : "Nora");
  return voices.slice(0, 6);
}

export function buyCreditsText(state = {}) {
  const lang = state.language || "en";
  return [t(lang, "buyTitle"), "", t(lang, "priceLine"), t(lang, "creditRule"), t(lang, "audioCreditRule"), "", t(lang, "choosePayment")].join("\n");
}

export function buyCreditsKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: t(lang, "buyToman"), callback_data: "buy_toman" }], [{ text: t(lang, "telegramStars"), callback_data: "buy_stars" }], [{ text: t(lang, "back"), callback_data: "back_main" }]] };
}

export function tomanPackagesText(state = {}) {
  const lang = state.language || "en";
  return [
    t(lang, "buyTomanTitle"),
    "",
    t(lang, "creditRule"),
    t(lang, "audioCreditRule"),
    "",
    lang === "fa"
      ? `هر <b>1000 کردیت</b> برابر <b>${formatNumber(TOMAN_PRICE_PER_1000)} تومان</b> است`
      : `Every <b>1,000 credits</b> costs <b>${formatNumber(TOMAN_PRICE_PER_1000)} Toman</b>`,
    lang === "fa" ? "مقدار کردیت موردنظرت رو همینجا بفرست" : "Send your custom credit amount in this chat",
  ].join("\n");
}

export function tomanPackagesKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: t(lang, "cancel"), callback_data: "cancel_payment" }]] };
}

export function createCustomTomanPackage(credits, discount = null) {
  const cleanCredits = Math.max(1, Math.floor(Number(credits || 0)));
  const calculatedAmountValue = Math.ceil((cleanCredits / 1000) * TOMAN_PRICE_PER_1000);
  const baseAmountValue = Math.max(TOMAN_MIN_PURCHASE_AMOUNT, calculatedAmountValue);
  const discountPercent = Number(discount?.percent || 0);
  const amountValue = discountPercent > 0 ? Math.max(1, Math.ceil(baseAmountValue * (100 - discountPercent) / 100)) : baseAmountValue;
  return {
    id: `custom_${cleanCredits}_${amountValue}`,
    credits: cleanCredits,
    bonus: 0,
    amount: formatNumber(amountValue),
    amountValue,
    calculatedAmountValue,
    originalAmountValue: baseAmountValue,
    discountPercent,
    discountAmountValue: baseAmountValue - amountValue,
    discountExpiresAt: Number(discount?.expiresAt || 0),
    minimumApplied: baseAmountValue > calculatedAmountValue,
    label: `${formatNumber(cleanCredits)} • ${formatNumber(amountValue)} تومان`,
    custom: true,
  };
}

export function customTomanInstructionText(pack, state = {}) {
  const lang = state.language || "en";
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  return [
    lang === "fa" ? "🇮🇷 <b>پرداخت با تومان</b>" : t(lang, "buyTomanTitle"),
    "",
    `${t(lang, "package")}: <b>${formatNumber(totalCredits)} credits</b>`,
    paymentAmountLine(pack, lang),
    "",
    t(lang, "transfer"),
    `<code>${CARD_NUMBER}</code>`,
    "",
    t(lang, "sendScreenshot"),
    t(lang, "verification"),
  ].join("\n");
}

export function customTomanConfirmKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: lang === "fa" ? "تایید و دریافت شماره کارت" : "Confirm", callback_data: "toman_confirm" }], [{ text: t(lang, "cancel"), callback_data: "cancel_payment" }]] };
}

export function paymentInstructionText(pack, state = {}) {
  const lang = state.language || "en";
  const totalCredits = pack.credits + pack.bonus;
  return [
    t(lang, "almostThere"),
    "",
    `${t(lang, "package")}: <b>${formatNumber(totalCredits)} credits</b>`,
    `${t(lang, "amount")}: <b>${pack.amount} T</b>`,
    "",
    t(lang, "transfer"),
    `<code>${CARD_NUMBER}</code>`,
    "",
    t(lang, "sendScreenshot"),
    t(lang, "verification"),
  ].join("\n");
}

export function paymentCancelKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: t(lang, "cancel"), callback_data: "cancel_payment" }]] };
}

function voiceButton(name, selectedVoice) {
  if (!name) return { text: " ", callback_data: "noop" };
  const label = name === selectedVoice ? "✔️ " + name : name;
  return { text: label, callback_data: `voice:${name}` };
}

function paymentAmountLine(pack, lang) {
  if (Number(pack.discountPercent || 0) > 0) {
    const suffix = lang === "fa" ? `با ${Number(pack.discountPercent).toLocaleString("en-US")}٪ تخفیف گردونه محاسبه شده` : `calculated with ${Number(pack.discountPercent).toLocaleString("en-US")}% wheel discount`;
    return `${t(lang, "amount")}: <s>${formatNumber(pack.originalAmountValue)} تومان</s> → <b>${pack.amount} تومان</b> (${suffix})`;
  }
  return `${t(lang, "amount")}: <b>${pack.amount} تومان</b>`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
