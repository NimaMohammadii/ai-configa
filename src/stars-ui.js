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

export function buyCreditsTextClean(state = {}) {
  const lang = state.language || "en";
  return [
    t(lang, "buyTitle"),
    "",
    t(lang, "creditRule"),
    "",
    t(lang, "choosePayment"),
  ].join("\n");
}
