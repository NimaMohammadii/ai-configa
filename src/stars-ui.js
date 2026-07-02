import { STAR_PACKAGES, CUSTOM_STARS_CREDITS_PER_STAR, CUSTOM_STARS_USD_PER_1000_CREDITS } from "./stars.js";
import { t } from "./i18n.js";

export function starsPackagesText(state = {}) {
  const lang = state.language || "en";
  return [
    `⭐ <b>${t(lang, "telegramStars")}</b>`,
    "",
    t(lang, "choosePackage"),
  ].join("\n");
}

export function customStarsPromptText(state = {}) {
  const lang = state.language || "en";
  return [
    `⭐ <b>${t(lang, "telegramStars")}</b>`,
    "",
    t(lang, "creditRule"),
    t(lang, "audioCreditRule"),
    "",
    lang === "fa"
      ? `هر <b>1000 کردیت</b> برابر <b>$${formatUsd(CUSTOM_STARS_USD_PER_1000_CREDITS)}</b> است`
      : `Every <b>1,000 credits</b> costs <b>$${formatUsd(CUSTOM_STARS_USD_PER_1000_CREDITS)}</b>`,
    lang === "fa" ? "مقدار کردیت موردنظرت رو همینجا بفرست" : "Send your custom credit amount in this chat",
  ].join("\n");
}

export function customStarsInvoiceText(pack, state = {}) {
  const lang = state.language || "en";
  return [
    lang === "fa" ? "⭐ <b>فاکتور استارز تلگرام</b>" : "⭐ <b>Telegram Stars invoice</b>",
    "",
    `Credits: <b>${formatNumber(pack.totalCredits)}</b>`,
    `Estimated value: <b>$${formatUsd(pack.usd)}</b>`,
    `Stars to pay: <b>${formatNumber(pack.stars)} ⭐️</b>`,
    "",
    `Rate: <b>${CUSTOM_STARS_CREDITS_PER_STAR} credits = 1 ⭐️</b>`,
    lang === "fa" ? "برای دریافت فاکتور پرداخت تایید کن" : "Confirm to receive the payment invoice",
  ].join("\n");
}

export function customStarsInvoiceKeyboard(state = {}) {
  const lang = state.language || "en";
  return {
    inline_keyboard: [
      [{ text: lang === "fa" ? "تایید و پرداخت" : `Confirm and pay`, callback_data: "stars_confirm" }],
      [{ text: t(lang, "cancel"), callback_data: "stars_cancel" }],
    ],
  };
}

export function customStarsCancelKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: t(lang, "cancel"), callback_data: "stars_cancel" }]] };
}

export function starsPackagesKeyboard(state = {}) {
  const lang = state.language || "en";
  return {
    inline_keyboard: [
      ...Object.entries(STAR_PACKAGES).map(([id, pack]) => ([
        { text: pack.label, callback_data: "stars_package:" + id },
      ])),
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
    if (pack.id === "s400") return "با <b>400 کردیت</b> میشه <b>1 دقیقه</b> صدا تبدیل کرد";
    if (pack.id === "s1000") return "هر <b>1000 کردیت</b> میشه <b>2 دقیقه</b> صدا ساخت";
    if (pack.id === "s33000") return "حدوداً <b>88 دقیقه</b> محتوای صوتی";
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
