import { addCredits } from "./credits.js";
import { getAllAdminIds } from "./receipt-admins.js";
import { clearPendingPayment, getPendingPayment } from "./payments.js";
import { requireDb } from "./state.js";
import { answerCallback, copyMessage, deleteMessage, editMessageCaption, sendMessage } from "./telegram-actions.js";
import { mainKeyboard, startText, TOMAN_PACKAGES } from "./ui.js";
import { getState, setMenuMessageId } from "./state.js";

export function isReceiptCallback(data) {
  return String(data || "").startsWith("receipt_approve:") || String(data || "").startsWith("receipt_reject:");
}

export async function handleReceiptPhoto(message, env) {
  const chatId = message.chat && message.chat.id;
  const user = message.from || {};
  const userId = user.id;
  if (!chatId || !userId) return false;

  const state = await getState(env, userId);
  const pending = await getPendingPayment(env, userId);

  await deleteMessage(env, chatId, message.message_id).catch(() => null);

  if (!pending || !TOMAN_PACKAGES[pending.package_id]) {
    const menu = await sendMessage(env, chatId, "Screenshot received. Please choose a package first\n\n" + startText(state), mainKeyboard(state));
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return true;
  }

  const pack = TOMAN_PACKAGES[pending.package_id];
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  const receiptId = await createReceipt(env, user, pending.package_id, pack.amount, totalCredits);
  const caption = receiptCaption({ user, amount: pack.amount, credits: totalCredits });
  const admins = await getAllAdminIds(env);

  for (const adminId of admins) {
    try {
      const copied = await copyMessage(env, adminId, chatId, message.message_id, caption, receiptKeyboard(receiptId));
      await saveReceiptAdminMessage(env, receiptId, adminId, copied.message_id, caption);
    } catch {}
  }

  const menu = await sendMessage(
    env,
    chatId,
    "✅ <b>Payment receipt received</b>\n\nYour receipt was sent for admin review. After approval, credits will be added to your balance\n\n" + startText(state),
    mainKeyboard(state)
  );
  await setMenuMessageId(env, userId, menu?.message_id || null);
  return true;
}

export async function handleReceiptCallback(query, env) {
  const data = query.data || "";
  const adminId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!adminId || !chatId || !messageId) return;

  const approved = data.startsWith("receipt_approve:");
  const receiptId = data.split(":")[1];
  const receipt = await getReceipt(env, receiptId);

  if (!receipt) {
    await answerCallback(env, query.id, "Receipt not found", true);
    return;
  }

  if (receipt.status !== "pending") {
    await answerCallback(env, query.id, "Already reviewed", true);
    return;
  }

  if (approved) {
    const balance = await addCredits(env, receipt.user_id, receipt.credits);
    await markReceipt(env, receiptId, "approved", adminId);
    await clearPendingPayment(env, receipt.user_id);
    await updateAllReceiptCaptions(env, receiptId, "approved");
    await sendMessage(
      env,
      receipt.user_id,
      `✅ <b>Payment approved</b>\n\n<b>${Number(receipt.credits).toLocaleString("en-US")} credits</b> were added to your balance\nCurrent balance: <b>${Number(balance).toLocaleString("en-US")} credits</b>\n\nYou can now send your text and generate voice`,
      null
    ).catch(() => null);
    await answerCallback(env, query.id, "Approved", true);
    return;
  }

  await markReceipt(env, receiptId, "rejected", adminId);
  await clearPendingPayment(env, receipt.user_id);
  await updateAllReceiptCaptions(env, receiptId, "rejected");
  await sendMessage(
    env,
    receipt.user_id,
    "❌ <b>Payment rejected</b>\n\nYour receipt could not be verified. Please check the payment details and send a valid screenshot again",
    null
  ).catch(() => null);
  await answerCallback(env, query.id, "Rejected", true);
}

async function createReceipt(env, user, packageId, amount, credits) {
  requireDb(env);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO payment_receipts (id, user_id, username, first_name, last_name, package_id, amount, credits, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)"
  ).bind(
    id,
    String(user.id),
    user.username || null,
    user.first_name || null,
    user.last_name || null,
    packageId,
    String(amount),
    Number(credits)
  ).run();
  return id;
}

async function getReceipt(env, id) {
  requireDb(env);
  return await env.DB.prepare("SELECT * FROM payment_receipts WHERE id = ?").bind(String(id)).first();
}

async function markReceipt(env, id, status, adminId) {
  requireDb(env);
  await env.DB.prepare(
    "UPDATE payment_receipts SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(status, String(adminId), String(id)).run();
}

async function saveReceiptAdminMessage(env, receiptId, adminId, messageId, caption) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO payment_receipt_messages (receipt_id, admin_id, message_id, caption, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(receiptId), String(adminId), Number(messageId), caption).run();
}

async function updateAllReceiptCaptions(env, receiptId, status) {
  requireDb(env);
  const rows = await env.DB.prepare(
    "SELECT admin_id, message_id, caption FROM payment_receipt_messages WHERE receipt_id = ?"
  ).bind(String(receiptId)).all();

  const suffix = status === "approved"
    ? "\n\n<b>✅ تأیید شده توسط ادمین</b>"
    : "\n\n<b>❌ رد شده توسط ادمین</b>";

  for (const row of rows.results || []) {
    await editMessageCaption(env, row.admin_id, row.message_id, row.caption + suffix, null).catch(() => null);
  }
}

function receiptKeyboard(receiptId) {
  return {
    inline_keyboard: [[
      { text: "✅ تأیید", callback_data: "receipt_approve:" + receiptId },
      { text: "❌ رد", callback_data: "receipt_reject:" + receiptId },
    ]],
  };
}

function receiptCaption({ user, amount, credits }) {
  const username = user.username ? "@" + escapeHtml(user.username) : "@";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "-";
  return [
    "🧾 <b>رسید پرداخت جدید</b>",
    `• User ID: <code>${escapeHtml(user.id)}</code>`,
    `• Username: ${username}`,
    `• Name: ${escapeHtml(name)}`,
    "",
    `• مبلغ: <b>${escapeHtml(amount)} تومان</b>`,
    `• کردیت: <b>${Number(credits).toLocaleString("en-US")}</b>`,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
