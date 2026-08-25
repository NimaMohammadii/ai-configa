import { trackUser } from "../admin.js";
import { formatUsdBalanceFromCredits } from "../credits.js";
import { CARD_NUMBER } from "../payment-card.js";
import { getAllAdminIds } from "../receipt-admins.js";
import { applyWheelPurchaseDiscountToAmount, getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { setPendingPayment } from "../payments.js";
import {
  createPaymentReceipt,
  markPaymentReceiptDeliveryFailed,
  savePaymentReceiptAdminMessage,
} from "../payment-receipts.js";
import { getState, requireDb } from "../state.js";
import { tgForm } from "../telegram-api.js";
import {
  createCustomTomanPackage,
  TOMAN_MIN_PURCHASE_AMOUNT,
  TOMAN_MIN_PURCHASE_CREDITS,
  TOMAN_PRICE_PER_1000,
} from "../ui.js";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

const MINI_APP_TOMAN_PACKAGES = Object.freeze({
  toman_1000: Object.freeze({ id: "toman_1000", credits: 1000, bonus: 0, amountValue: 150000 }),
  toman_6100: Object.freeze({ id: "toman_6100", credits: 6100, bonus: 600, amountValue: 260000 }),
  toman_14000: Object.freeze({ id: "toman_14000", credits: 14000, bonus: 2000, amountValue: 620000 }),
  toman_30000: Object.freeze({ id: "toman_30000", credits: 30000, bonus: 10000, amountValue: 1550000 }),
});

export async function getMiniAppTomanConfig(env, user) {
  await requirePersianUser(env, user);
  const discount = await getActiveWheelPurchaseDiscount(env, user.id);
  return {
    available: true,
    cardNumber: CARD_NUMBER,
    pricePer1000: TOMAN_PRICE_PER_1000,
    minimumAmount: TOMAN_MIN_PURCHASE_AMOUNT,
    minimumCredits: TOMAN_MIN_PURCHASE_CREDITS,
    minimumUsd: formatUsdBalanceFromCredits(TOMAN_MIN_PURCHASE_CREDITS),
    discountPercent: Number(discount?.percent || 0),
    discountExpiresAt: Number(discount?.expiresAt || 0),
    packages: Object.values(MINI_APP_TOMAN_PACKAGES).map((pack) => buildFixedTomanPackage(pack, discount)),
  };
}

export async function submitMiniAppTomanReceipt(env, user, payload = {}) {
  await requirePersianUser(env, user);
  await trackUser(env, user);

  const discount = await getActiveWheelPurchaseDiscount(env, user.id);
  const packageId = String(payload.packageId || "").trim();
  let pack;

  if (packageId) {
    const fixed = MINI_APP_TOMAN_PACKAGES[packageId];
    if (!fixed) throw httpError("پکیج انتخاب‌شده معتبر نیست.", 400);
    pack = buildFixedTomanPackage(fixed, discount);
  } else {
    const requestedCredits = Number(payload.credits);
    if (!Number.isSafeInteger(requestedCredits) || requestedCredits < 1 || requestedCredits > 1_000_000) {
      throw httpError("مقدار موجودی دلاری معتبر نیست.", 400);
    }
    const credits = Math.max(TOMAN_MIN_PURCHASE_CREDITS, requestedCredits);
    pack = createCustomTomanPackage(credits, discount);
  }

  if (Number(payload.amount) !== Number(pack.amountValue)) {
    throw httpError("مبلغ پرداخت تغییر کرده؛ دوباره مبلغ را بررسی کن.", 409);
  }

  const receipt = parseReceiptImage(payload.receipt);
  const admins = await getAllAdminIds(env);
  if (!admins.length) throw httpError("ادمین دریافت رسید هنوز تنظیم نشده است.", 503);

  const storedPackageId = packageId
    ? `mini:${pack.id}:${pack.amountValue}`
    : `custom:${pack.credits}:${pack.amountValue}`;
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  const receiptId = await createPaymentReceipt(env, user, {
    packageId: storedPackageId,
    amount: pack.amount,
    credits: totalCredits,
  });
  if (!receiptId) {
    throw httpError("یک رسید پرداخت جدید در حال بررسی است؛ تا مشخص شدن نتیجه، رسید دیگری نفرست.", 409);
  }
  await setPendingPayment(env, user.id, storedPackageId);

  const caption = receiptCaption({ user, amount: pack.amount, credits: totalCredits });
  let sentToAdmin = 0;
  for (const adminId of admins) {
    try {
      const message = await sendReceiptPhoto(env, adminId, receipt, caption, receiptId);
      sentToAdmin += 1;
      await savePaymentReceiptAdminMessage(env, receiptId, adminId, message.message_id, caption).catch((error) => {
        console.error("save mini app receipt admin message failed", adminId, error?.message || error);
      });
    } catch (error) {
      console.error("send mini app receipt to admin failed", adminId, error?.message || error);
    }
  }

  if (!sentToAdmin) {
    await markPaymentReceiptDeliveryFailed(env, receiptId);
    throw httpError("ارسال رسید انجام نشد؛ چند لحظه دیگر دوباره امتحان کن.", 502);
  }

  return {
    ok: true,
    receiptId,
    status: "pending",
    credits: totalCredits,
    amount: pack.amountValue,
    message: "رسید برای بررسی ادمین ارسال شد",
  };
}

function buildFixedTomanPackage(base, discount) {
  const pricing = applyWheelPurchaseDiscountToAmount(base.amountValue, discount);
  const totalCredits = Number(base.credits || 0) + Number(base.bonus || 0);
  return {
    id: base.id,
    credits: Number(base.credits || 0),
    bonus: Number(base.bonus || 0),
    totalCredits,
    amount: formatNumber(pricing.amount),
    amountValue: pricing.amount,
    originalAmountValue: pricing.originalAmount,
    discountPercent: pricing.discountPercent,
    discountAmountValue: pricing.discountAmount,
    discountExpiresAt: Number(discount?.expiresAt || 0),
  };
}

async function requirePersianUser(env, user) {
  if (!user?.id) throw httpError("کاربر تلگرام پیدا نشد.", 401);
  const state = await getState(env, user.id);
  if (String(state?.language || user.language_code || "").toLowerCase() !== "fa") {
    throw httpError("پرداخت تومانی فقط برای کاربران زبان فارسی فعال است.", 403);
  }
  return state;
}

function parseReceiptImage(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw httpError("تصویر رسید معتبر نیست.", 400);

  let binary;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    throw httpError("تصویر رسید خوانده نشد.", 400);
  }
  if (!binary.length || binary.length > MAX_RECEIPT_BYTES) {
    throw httpError("حجم تصویر رسید خیلی زیاد است.", 413);
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { buffer: bytes.buffer, mimeType: match[1].toLowerCase(), filename: "payment-receipt.jpg" };
}

async function sendReceiptPhoto(env, adminId, receipt, caption, receiptId) {
  const form = new FormData();
  form.append("chat_id", String(adminId));
  form.append("photo", new Blob([receipt.buffer], { type: receipt.mimeType }), receipt.filename);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("disable_notification", "false");
  form.append("reply_markup", JSON.stringify(receiptKeyboard(receiptId)));
  return tgForm(env, "sendPhoto", form);
}

function receiptKeyboard(receiptId) {
  return { inline_keyboard: [[
    { text: "✅ تأیید", callback_data: "receipt_approve:" + receiptId },
    { text: "❌ رد", callback_data: "receipt_reject:" + receiptId },
  ]] };
}

function receiptCaption({ user, amount, credits }) {
  const username = user.username ? "@" + escapeHtml(user.username) : "@";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "-";
  return [
    "🧾 <b>رسید پرداخت جدید از مینی‌اپ</b>",
    `• User ID: <code>${escapeHtml(user.id)}</code>`,
    `• Username: ${username}`,
    `• Name: ${escapeHtml(name)}`,
    "",
    `• مبلغ: <b>${escapeHtml(amount)} تومان</b>`,
    `• موجودی دلاری: <b>${formatUsdBalanceFromCredits(credits)}</b>`,
  ].join("\n");
}

function formatNumber(value) {
  return Math.max(0, Math.ceil(Number(value) || 0)).toLocaleString("en-US");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
