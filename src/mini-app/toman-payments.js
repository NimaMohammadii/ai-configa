import { trackUser } from "../admin.js";
import { CARD_NUMBER } from "../payment-card.js";
import { getAllAdminIds } from "../receipt-admins.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { setPendingPayment } from "../payments.js";
import { getState, requireDb } from "../state.js";
import { tgForm } from "../telegram-api.js";
import {
  createCustomTomanPackage,
  TOMAN_MIN_PURCHASE_AMOUNT,
  TOMAN_PRICE_PER_1000,
} from "../ui.js";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

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
  };
}

export async function submitMiniAppTomanReceipt(env, user, payload = {}) {
  await requirePersianUser(env, user);
  await trackUser(env, user);

  const credits = Number(payload.credits);
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) {
    throw httpError("مقدار کردیت معتبر نیست.", 400);
  }

  const discount = await getActiveWheelPurchaseDiscount(env, user.id);
  const pack = createCustomTomanPackage(credits, discount);
  if (Number(payload.amount) !== Number(pack.amountValue)) {
    throw httpError("مبلغ پرداخت تغییر کرده؛ دوباره مبلغ را بررسی کن.", 409);
  }

  const receipt = parseReceiptImage(payload.receipt);
  const admins = await getAllAdminIds(env);
  if (!admins.length) throw httpError("ادمین دریافت رسید هنوز تنظیم نشده است.", 503);

  const packageId = `custom:${pack.credits}:${pack.amountValue}`;
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  const receiptId = await createReceipt(env, user, packageId, pack.amount, totalCredits);
  await setPendingPayment(env, user.id, packageId);

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
    message: "رسید برای بررسی ادمین ارسال شد",
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

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
