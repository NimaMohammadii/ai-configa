import { trackUser } from "../admin.js";
import { CARD_NUMBER } from "../payment-card.js";
import { getAllAdminIds } from "../receipt-admins.js";
import { applyWheelPurchaseDiscountToAmount, getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { setPendingPayment } from "../payments.js";
import { getState, requireDb } from "../state.js";
import { tgForm } from "../telegram-api.js";
import {
  createCustomTomanPackage,
  TOMAN_MIN_PURCHASE_AMOUNT,
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
    const credits = Number(payload.credits);
    if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) {
      throw httpError("مقدار کردیت معتبر نیست.", 400);
    }
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
  const receiptId = await createReceipt(env, user, storedPackageId, pack.amount, totalCredits);
  await setPendingPayment(env, user.id, storedPackageId);

  const caption = receiptCaption({ user, amount: pack.amount, credits: totalCredits });
  let sentToAdmin = 0;
  for (const adminId of admins) {
    try {
      const message = await sendReceiptPhoto(env, adminId, receipt, caption, receiptId);
      await saveReceiptAdminMessage(env, receiptId, adminId, message.message_id, caption);
      sentToAdmin += 1;
    } catch (error) {
      console.error("send mini app receipt to admin failed", adminId, error?.message || error);
    }
  }

  if (!sentToAdmin) {
    await markReceiptDeliveryFailed(env, receiptId);
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
    voiceMinutes: totalCredits / 1000,
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

async function createReceipt(env, user, packageId, amount, credits) {
  requireDb(env);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO payment_receipts (id, user_id, username, first_name, last_name, package_id, amount, credits, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)"
  ).bind(id, String(user.id), user.username || null, user.first_name || null, user.last_name || null, packageId, String(amount), Number(credits)).run();
  return id;
}

async function saveReceiptAdminMessage(env, receiptId, adminId, messageId, caption) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO payment_receipt_messages (receipt_id, admin_id, message_id, caption, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(receiptId), String(adminId), Number(messageId), caption).run();
}

async function markReceiptDeliveryFailed(env, receiptId) {
  requireDb(env);
  await env.DB.prepare(
    "UPDATE payment_receipts SET status = 'delivery_failed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(String(receiptId)).run();
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
    `• کردیت: <b>${Number(credits).toLocaleString("en-US")}</b>`,
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
