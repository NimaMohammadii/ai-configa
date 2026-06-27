import { createCustomStarPackage, getStarPackage, applySuccessfulStarsPayment, normalizeStarCredits } from "./stars.js";
import { starsCreditPickerText, starsPackageInvoiceText, starsPackagesKeyboard, starsPackagesText, buyCreditsTextClean } from "./stars-ui.js";
import { getState } from "./state.js";
import { answerCallback, answerPreCheckout, editMessage, sendMessage, sendStarsInvoice, deleteMessage } from "./telegram-actions.js";
import { buyCreditsKeyboard, mainKeyboard, startText } from "./ui.js";
import { t } from "./i18n.js";

export function isStarsCallback(data) {
  return data === "buy_credits"
    || data === "buy_stars"
    || data === "stars_noop"
    || String(data || "").startsWith("stars_select:")
    || String(data || "").startsWith("stars_buy:")
    || String(data || "").startsWith("stars_package:");
}

export async function handleStarsCallback(query, env) {
  const data = query.data || "";
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId || !chatId || !messageId) return;

  const state = await getState(env, userId);

  if (data === "buy_credits") {
    await answerCallback(env, query.id);
    await editOrSend(env, chatId, messageId, buyCreditsTextClean(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "buy_stars") {
    await answerCallback(env, query.id);
    await editOrSend(env, chatId, messageId, starsPackagesText(state), starsPackagesKeyboard(state));
    return;
  }

  if (data === "stars_noop") {
    await answerCallback(env, query.id);
    return;
  }

  if (data.startsWith("stars_select:")) {
    const credits = normalizeStarCredits(data.slice("stars_select:".length));
    await answerCallback(env, query.id);
    await editOrSend(env, chatId, messageId, starsCreditPickerText(credits, state), starsPackagesKeyboard(state, credits));
    return;
  }

  if (data.startsWith("stars_buy:")) {
    const credits = normalizeStarCredits(data.slice("stars_buy:".length));
    const pack = createCustomStarPackage(credits);
    await answerCallback(env, query.id);
    await sendStarsInvoice(env, chatId, pack);
    await editOrSend(
      env,
      chatId,
      messageId,
      starsPackageInvoiceText(pack, state),
      { inline_keyboard: [[{ text: t(state.language, "back"), callback_data: "buy_stars" }]] }
    );
    return;
  }

  const packageId = data.slice("stars_package:".length);
  const pack = getStarPackage(packageId);
  if (!pack) {
    await answerCallback(env, query.id, t(state.language, "invalidPackage"), true);
    return;
  }

  await answerCallback(env, query.id);
  await sendStarsInvoice(env, chatId, pack);
  await editOrSend(
    env,
    chatId,
    messageId,
    starsPackageInvoiceText(pack, state),
    { inline_keyboard: [[{ text: t(state.language, "back"), callback_data: "buy_stars" }]] }
  );
}

export async function handlePreCheckout(query, env) {
  const payload = query.invoice_payload || "";
  if (!payload.startsWith("stars:")) return answerPreCheckout(env, query.id, false, "Invalid payment");

  const pack = getStarPackage(payload.slice("stars:".length));
  if (!pack || query.currency !== "XTR" || Number(query.total_amount) !== pack.stars) {
    return answerPreCheckout(env, query.id, false, "Invalid package");
  }

  return answerPreCheckout(env, query.id, true);
}

export async function handleStarsPayment(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  if (!chatId || !userId || !message.successful_payment) return false;

  const state = await getState(env, userId);
  const result = await applySuccessfulStarsPayment(env, userId, message.successful_payment);
  await deleteMessage(env, chatId, message.message_id).catch(() => null);

  if (!result.ok) {
    await sendMessage(env, chatId, "Payment error\n\n" + startText(state), mainKeyboard(state));
    return true;
  }

  await sendMessage(
    env,
    chatId,
    `✅ Payment successful\n\nAdded: <b>${result.pack.totalCredits.toLocaleString("en-US")} credits</b>\nBalance: <b>${result.balance?.toLocaleString("en-US") || "updated"} credits</b>\n\n${startText(state)}`,
    mainKeyboard(state)
  );
  return true;
}

function localizedBuyCreditsKeyboard(state = {}) {
  const lang = state.language || "en";
  if (lang === "fa") return buyCreditsKeyboard(state);

  return {
    inline_keyboard: [
      [{ text: t(lang, "telegramStars"), callback_data: "buy_stars" }],
      [{ text: t(lang, "back"), callback_data: "back_main" }],
    ],
  };
}

async function editOrSend(env, chatId, messageId, text, keyboard) {
  try {
    await editMessage(env, chatId, messageId, text, keyboard);
  } catch {
    await sendMessage(env, chatId, text, keyboard);
  }
}
