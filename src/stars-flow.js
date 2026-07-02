import { getStarPackage, applySuccessfulStarsPayment, createCustomStarPackage, getStarPackageFromPayload, starInvoicePayload } from "./stars.js";
import { starsPackageInvoiceText, starsPackagesKeyboard, starsPackagesText, buyCreditsTextClean, customStarsPromptText, customStarsCancelKeyboard, customStarsInvoiceText, customStarsInvoiceKeyboard } from "./stars-ui.js";
import { getState } from "./state.js";
import { answerCallback, answerPreCheckout, editMessage, sendMessage, sendStarsInvoice, deleteMessage } from "./telegram-actions.js";
import { buyCreditsKeyboard, mainKeyboard, startText } from "./ui.js";
import { t } from "./i18n.js";

export function isStarsCallback(data) {
  return data === "buy_credits" || data === "buy_stars" || data === "stars_confirm" || data === "stars_cancel" || String(data || "").startsWith("stars_package:");
}

export async function handleStarsCallback(query, env) {
  const data = query.data || "";
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!userId || !chatId || !messageId) return;

  const state = await getState(env, userId);

  if (data === "buy_credits") {
    await clearPendingCustomStars(env, userId);
    await answerCallback(env, query.id);
    await editOrSend(env, chatId, messageId, buyCreditsTextClean(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "buy_stars") {
    await answerCallback(env, query.id);
    await setPendingCustomStars(env, userId, messageId, null);
    await editOrSend(env, chatId, messageId, customStarsPromptText(state), customStarsCancelKeyboard(state));
    return;
  }

  if (data === "stars_cancel") {
    await clearPendingCustomStars(env, userId);
    await answerCallback(env, query.id);
    await editOrSend(env, chatId, messageId, buyCreditsTextClean(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "stars_confirm") {
    const pending = await getPendingCustomStars(env, userId);
    if (!pending?.credits) {
      await answerCallback(env, query.id, "Send a credit amount first", true);
      return;
    }
    const pack = createCustomStarPackage(pending.credits);
    await clearPendingCustomStars(env, userId);
    await answerCallback(env, query.id);
    await sendStarsInvoice(env, chatId, pack, starInvoicePayload(pack));
    await editOrSend(env, chatId, messageId, customStarsInvoiceText(pack, state), { inline_keyboard: [[{ text: t(state.language, "back"), callback_data: "buy_stars" }]] });
    return;
  }

  const packageId = data.slice("stars_package:".length);
  const pack = getStarPackage(packageId);
  if (!pack) {
    await answerCallback(env, query.id, t(state.language, "invalidPackage"), true);
    return;
  }

  await answerCallback(env, query.id);
  await sendStarsInvoice(env, chatId, pack, starInvoicePayload(pack));
  await editOrSend(
    env,
    chatId,
    messageId,
    starsPackageInvoiceText(pack, state),
    { inline_keyboard: [[{ text: t(state.language, "back"), callback_data: "buy_stars" }]] }
  );
}

export async function handleStarsTextInput(message, env) {
  const userId = message.from && message.from.id;
  const chatId = message.chat && message.chat.id;
  const text = message.text ? message.text.trim() : "";
  if (!userId || !chatId || !text) return false;

  const pending = await getPendingCustomStars(env, userId);
  if (!pending) return false;

  const state = await getState(env, userId);
  const credits = parseCreditAmount(text);
  await deleteMessage(env, chatId, message.message_id).catch(() => null);

  if (!credits) {
    await editOrSend(env, chatId, Number(pending.message_id), customStarsPromptText(state) + "\n\nPlease send a positive number like <code>1000</code>.", customStarsCancelKeyboard(state));
    return true;
  }

  const pack = createCustomStarPackage(credits);
  await setPendingCustomStars(env, userId, pending.message_id, pack.totalCredits);
  await editOrSend(env, chatId, Number(pending.message_id), customStarsInvoiceText(pack, state), customStarsInvoiceKeyboard(state));
  return true;
}

export async function handlePreCheckout(query, env) {
  const payload = query.invoice_payload || "";
  const pack = getStarPackageFromPayload(payload);
  if (!pack) return answerPreCheckout(env, query.id, false, "Invalid payment");

  if (query.currency !== "XTR" || Number(query.total_amount) !== pack.stars) {
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

async function setPendingCustomStars(env, userId, messageId, credits) {
  await ensurePendingCustomStarsTable(env);
  await env.DB.prepare(
    "INSERT INTO pending_star_credit_inputs (user_id, message_id, credits, updated_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(user_id) DO UPDATE SET message_id = excluded.message_id, credits = excluded.credits, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), Number(messageId), credits ? Number(credits) : null).run();
}

async function getPendingCustomStars(env, userId) {
  await ensurePendingCustomStarsTable(env);
  return env.DB.prepare("SELECT message_id, credits FROM pending_star_credit_inputs WHERE user_id = ?").bind(String(userId)).first();
}

async function clearPendingCustomStars(env, userId) {
  await ensurePendingCustomStarsTable(env);
  await env.DB.prepare("DELETE FROM pending_star_credit_inputs WHERE user_id = ?").bind(String(userId)).run();
}

async function ensurePendingCustomStarsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS pending_star_credit_inputs (user_id TEXT PRIMARY KEY, message_id INTEGER NOT NULL, credits INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

function parseCreditAmount(text) {
  const normalized = String(text || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}
