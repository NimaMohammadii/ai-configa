import { STAR_PACKAGES, CUSTOM_STARS_USD_PER_1000_CREDITS } from "./stars.js";
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
      ? `هر <b>1000 کردیت</b> برابر <b>$${formatUsdRate(CUSTOM_STARS_USD_PER_1000_CREDITS)}</b> است`
      : `Every <b>1,000 credits</b> costs <b>$${formatUsdRate(CUSTOM_STARS_USD_PER_1000_CREDITS)}</b>`,
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
    starsAmountLine(pack, lang),
    "",
    lang === "fa" ? `نرخ: <b>هر ۱٬۰۰۰ کردیت = ۱۲ ⭐️</b>` : `Rate: <b>1,000 credits = 12 ⭐️</b>`,
    lang === "fa" ? "حداقل خرید: <b>۸۰ ⭐️</b>" : "Minimum purchase: <b>80 ⭐️</b>",
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
  const audioLine = starPackageAudioLine(lang);
  const paymentLine = starsPaymentLine(pack, lang);

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

function starsAmountLine(pack, lang) {
  if (Number(pack.discountPercent || 0) > 0) {
    const note = lang === "fa" ? `با ${formatNumber(pack.discountPercent)}٪ تخفیف گردونه حساب می‌شود` : `calculated with ${formatNumber(pack.discountPercent)}% wheel discount`;
    return `Stars to pay: <s>${formatNumber(pack.originalStars)} ⭐️</s> → <b>${formatNumber(pack.stars)} ⭐️</b> (${note})`;
  }
  return `Stars to pay: <b>${formatNumber(pack.stars)} ⭐️</b>`;
}

function starsPaymentLine(pack, lang) {
  if (Number(pack.discountPercent || 0) > 0) {
    return lang === "fa"
      ? `پرداخت <s>${formatNumber(pack.originalStars)} ⭐️</s> → <b>${formatNumber(pack.stars)} ⭐️</b> برای اضافه شدن کردیت‌ها (تخفیف گردونه، اعتبار ۲۴ ساعت)`
      : `Pay <s>${formatNumber(pack.originalStars)} ⭐️</s> → <b>${formatNumber(pack.stars)} ⭐️</b> to add credits (24-hour wheel discount)`;
  }
  return lang === "fa" ? `پرداخت <b>${pack.stars} ⭐️</b> برای اضافه شدن کردیت‌ها` : `Pay <b>${pack.stars} ⭐️</b> to add credits`;
}

function starPackageAudioLine(lang) {
  return lang === "fa"
    ? `نرخ TTS: <b>$0.00017 برای هر کاراکتر</b>`
    : `TTS rate: <b>$0.00017 per character</b>`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function formatUsd(value) {
  const displayValue = Math.floor((Number(value) + Number.EPSILON) * 100) / 100;
  return displayValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatUsdRate(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
