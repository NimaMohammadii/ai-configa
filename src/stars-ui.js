import { formatUsdBalanceFromCredits } from "./credits.js";
import { STAR_PACKAGES } from "./stars.js";
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
      ? "مقدار موجودی دلاری را بفرست؛ حداقل <code>1.00</code> دلار"
      : "Send the USD balance amount you want to add; minimum <code>1.00</code> USD",
  ].join("\n");
}

export function customStarsInvoiceText(pack, state = {}) {
  const lang = state.language || "en";
  return [
    lang === "fa" ? "⭐ <b>فاکتور استارز تلگرام</b>" : "⭐ <b>Telegram Stars invoice</b>",
    "",
    lang === "fa"
      ? `موجودی قابل افزودن: <b>${formatUsdBalanceFromCredits(pack.totalCredits)}</b>`
      : `Balance to add: <b>${formatUsdBalanceFromCredits(pack.totalCredits)}</b>`,
    starsAmountLine(pack, lang),
    "",
    lang === "fa" ? "حداقل خرید: <b>$1.00</b>" : "Minimum purchase: <b>$1.00</b>",
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
  const balanceLine = lang === "fa"
    ? `موجودی قابل افزودن: <b>${formatUsdBalanceFromCredits(pack.totalCredits)}</b>`
    : `Balance to add: <b>${formatUsdBalanceFromCredits(pack.totalCredits)}</b>`;
  const paymentLine = starsPaymentLine(pack, lang);

  return [
    `⭐ <b>${pack.description}</b>`,
    balanceLine,
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
      ? `پرداخت <s>${formatNumber(pack.originalStars)} ⭐️</s> → <b>${formatNumber(pack.stars)} ⭐️</b> برای افزایش موجودی (تخفیف گردونه، اعتبار ۲۴ ساعت)`
      : `Pay <s>${formatNumber(pack.originalStars)} ⭐️</s> → <b>${formatNumber(pack.stars)} ⭐️</b> to add balance (24-hour wheel discount)`;
  }
  return lang === "fa" ? `پرداخت <b>${pack.stars} ⭐️</b> برای افزایش موجودی` : `Pay <b>${pack.stars} ⭐️</b> to add balance`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}