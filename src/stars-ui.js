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
    if (pack.id === "s400") return "با <b>۴۰۰ کردیت</b> میشه <b>۱ دقیقه</b> صدا تبدیل کرد";
    if (pack.id === "s1000") return "هر <b>۱۰۰۰ کردیت</b> میشه <b>۲ دقیقه</b> صدا ساخت";
    if (pack.id === "s33000") return "حدوداً <b>۸۸ دقیقه</b> محتوای صوتی";
  }

  const audioMinutes = pack.id === "s400" ? "1" : pack.id === "s33000" ? "88" : String(Math.round(Number(pack.totalCredits || 0) / 500));
  return `About <b>${audioMinutes}</b> minutes of audio content`;
}
