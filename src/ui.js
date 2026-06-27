import { LANGUAGES, t } from "./i18n.js";
import { CARD_NUMBER } from "./payment-card.js";
import { VOICE_NAMES, VOICES_PER_PAGE } from "./voices.js";

export const CREDIT_PRICE_PER_1000_USD = 0.24;
export const CREDIT_PER_CHARACTER = 1;

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
  const totalPages = Math.ceil(VOICE_NAMES.length / VOICES_PER_PAGE);
  const page = Math.min(Math.max(Number(state.page || 0), 0), totalPages - 1);
  const selectedVoice = state.voice || "Nora";
  const start = page * VOICES_PER_PAGE;
  const voices = VOICE_NAMES.slice(start, start + VOICES_PER_PAGE);
  const rows = [];

  for (let i = 0; i < voices.length; i += 2) {
    const row = [voiceButton(voices[i], selectedVoice)];
    if (voices[i + 1]) row.push(voiceButton(voices[i + 1], selectedVoice));
    rows.push(row);
  }

  const paginationButtons = [];
  if (page > 0) paginationButtons.push({ text: t(lang, "previous"), callback_data: `page:${page - 1}` });
  if (page < totalPages - 1) paginationButtons.push({ text: t(lang, "next"), callback_data: `page:${page + 1}` });
  if (paginationButtons.length) {
    const lastVoiceRow = rows[rows.length - 1];
    if (lastVoiceRow && lastVoiceRow.length === 1 && paginationButtons.length === 1) {
      lastVoiceRow.push(paginationButtons[0]);
    } else {
      rows.push(paginationButtons);
    }
  }

  rows.push([{ text: t(lang, "demo"), callback_data: "demo" }]);
  rows.push([
    { text: t(lang, "balance"), callback_data: "balance" },
    { text: t(lang, "buyCredits"), callback_data: "buy_credits" },
  ]);
  rows.push([{ text: t(lang, "dailyReward"), callback_data: "daily_reward" }]);
  return { inline_keyboard: rows };
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
  if (lang !== "fa") return [t(lang, "buyTomanTitle"), "", t(lang, "choosePackage")].join("\n");

  return [
    "🇮🇷 <b>خرید با تومان</b>",
    "",
    "پکیج موردنظرت رو انتخاب کن 👇",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "🧪 <b>پکیج تست Vexa</b>",
    "",
    "<b>400 Credit</b>",
    "قیمت: <b>50,000 تومان</b>",
    "مناسب برای تست کیفیت صدا",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "⚡ <b>پکیج Starter</b>",
    "",
    "<b>2,000 Credit</b> + <b>100 Credit هدیه</b> 🎁",
    "قیمت: <b>160,000 تومان</b>",
    "هر <b>1,000 Credit</b> فقط <b>80,000 تومان</b>",
    "حدود <b>4 دقیقه</b> محتوای صوتی",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "🚀 <b>پکیج Pro</b>",
    "",
    "<b>8,000 Credit</b> + <b>500 Credit هدیه</b> 🎁",
    "قیمت: <b>510,000 تومان</b>",
    "هر <b>1,000 Credit</b> حدود <b>65,000 تومان</b>",
    "حدود <b>16 دقیقه</b> محتوای صوتی",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "👑 <b>پکیج Ultra</b>",
    "",
    "<b>22,000 Credit</b> + <b>2,000 Credit هدیه</b> 🎁",
    "قیمت: <b>999,000 تومان</b>",
    "هر <b>1,000 Credit</b> حدود <b>40,000 تومان</b>",
    "حدود <b>48 دقیقه</b> محتوای صوتی",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "✨ بسته‌های بزرگ‌تر به‌صرفه‌ترن و کردیت هدیه بیشتری دارن.",
  ].join("\n");
}

export function tomanPackagesKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [...Object.entries(TOMAN_PACKAGES).map(([id, pack]) => ([{ text: pack.label, callback_data: "toman_package:" + id }])), [{ text: t(lang, "back"), callback_data: "buy_credits" }]] };
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
