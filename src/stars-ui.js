import { STAR_CREDITS_STEP, STAR_MAX_CREDITS, STAR_MIN_CREDITS, createCustomStarPackage, normalizeStarCredits } from "./stars.js";
import { t } from "./i18n.js";

export function starsPackagesText(state = {}) {
  const lang = state.language || "en";
  return starsCreditPickerText(STAR_MIN_CREDITS, state);
}

export function starsCreditPickerText(credits, state = {}) {
  const lang = state.language || "en";
  const pack = createCustomStarPackage(credits);
  const minutes = Math.round(pack.totalCredits / 500);

  if (lang === "fa") {
    return [
      "⭐️ <b>خرید کردیت با استارز تلگرام</b>",
      "",
      "کردیت موردنیازت رو با دکمه‌های پایین تنظیم کن؛ هر بار <b>۱۰۰۰ کردیت</b> کم یا زیاد میشه.",
      "",
      "━━━━━━━━━━━━━━",
      `💎 کردیت انتخابی: <b>${formatNumber(pack.totalCredits)}</b>`,
      `⭐️ مبلغ استارز: <b>${formatNumber(pack.stars)}</b>`,
      `💵 معادل دلاری: <b>$${formatUsd(pack.usd)}</b>`,
      `🎧 حدوداً: <b>${formatNumber(minutes)} دقیقه</b> صدای هوش مصنوعی`,
      "━━━━━━━━━━━━━━",
      "",
      "وقتی آماده‌ای، روی دکمه خرید بزن تا فاکتور امن تلگرام برات باز بشه 🚀",
    ].join("\n");
  }

  return [
    `⭐ <b>${t(lang, "telegramStars")}</b>`,
    "",
    "Use the buttons below to choose credits in 1,000-credit steps.",
    "",
    `💎 Credits: <b>${formatNumber(pack.totalCredits)}</b>`,
    `⭐ Stars: <b>${formatNumber(pack.stars)}</b>`,
    `💵 USD equivalent: <b>$${formatUsd(pack.usd)}</b>`,
    `🎧 About <b>${formatNumber(minutes)} minutes</b> of audio`,
  ].join("\n");
}

export function starsPackagesKeyboard(state = {}, credits = STAR_MIN_CREDITS) {
  const lang = state.language || "en";
  const normalizedCredits = normalizeStarCredits(credits);
  const pack = createCustomStarPackage(normalizedCredits);
  const minusCredits = Math.max(STAR_MIN_CREDITS, normalizedCredits - STAR_CREDITS_STEP);
  const plusCredits = Math.min(STAR_MAX_CREDITS, normalizedCredits + STAR_CREDITS_STEP);

  return {
    inline_keyboard: [
      [
        { text: "➖ ۱۰۰۰", callback_data: "stars_select:" + minusCredits },
        { text: `${formatNumber(normalizedCredits)} 💎`, callback_data: "stars_noop" },
        { text: "➕ ۱۰۰۰", callback_data: "stars_select:" + plusCredits },
      ],
      [{ text: buyButtonText(pack, lang), callback_data: "stars_buy:" + normalizedCredits }],
      [{ text: t(lang, "back"), callback_data: "buy_credits" }],
    ],
  };
}

export function starsPackageInvoiceText(pack, state = {}) {
  const lang = state.language || "en";
  const audioLine = starPackageAudioLine(pack, lang);
  const paymentLine = lang === "fa"
    ? `پرداخت <b>${pack.stars} ⭐️</b> برای اضافه شدن کردیت‌ها`
    : `Pay <b>${pack.stars} ⭐️</b> to add credits`;

  return [
    `⭐ <b>${pack.description}</b>`,
    audioLine,
    "",
    paymentLine,
  ].join("\n");
}

function buyButtonText(pack, lang) {
  if (lang === "fa") return `🛒 خرید ${formatNumber(pack.totalCredits)} کردیت • ${formatNumber(pack.stars)} ⭐️`;
  return `🛒 Buy ${formatNumber(pack.totalCredits)} credits • ${formatNumber(pack.stars)} ⭐️`;
}

export function buyCreditsTextClean(state = {}) {
  const lang = state.language || "en";
  return [
    t(lang, "buyTitle"),
    "",
    t(lang, "creditRule"),
    t(lang, "audioCreditRule"),
    "",
    t(lang, "choosePayment"),
  ].join("\n");
}

function starPackageAudioLine(pack, lang) {
  if (lang === "fa") {
    if (pack.id === "s400") return "با <b>۴۰۰ کردیت</b> میشه <b>۱ دقیقه</b> صدا تبدیل کرد";
    if (pack.id === "s1000") return "هر <b>۱۰۰۰ کردیت</b> میشه <b>۲ دقیقه</b> صدا ساخت";
    if (pack.id === "s33000") return "حدوداً <b>۸۸ دقیقه</b> محتوای صوتی";
  }

  const audioMinutes = pack.id === "s400" ? "1" : pack.id === "s33000" ? "88" : String(Math.round(Number(pack.totalCredits || 0) / 500));
  return `About <b>${audioMinutes}</b> minutes of audio content`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function formatUsd(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
