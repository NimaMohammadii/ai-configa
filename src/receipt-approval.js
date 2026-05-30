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

  if (state.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
    await setMenuMessageId(env, userId, null);
  }

  if (!pending || !TOMAN_PACKAGES[pending.package_id]) {
    await deleteMessage(env, chatId, message.message_id).catch(() => null);
    await sendMessage(env, chatId, "⚠️ <b>Screenshot received</b>\n\nPlease choose a credit package first", null);
    const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return true;
  }

  const pack = TOMAN_PACKAGES[pending.package_id];
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  const receiptId = await createReceipt(env, user, pending.package_id, pack.amount, totalCredits);
  const caption = receiptCaption({ user, amount: pack.amount, credits: totalCredits });
  const admins = await getAllAdminIds(env);

  let sentToAdmin = 0;
  for (const adminId of admins) {
    try {
      const copied = await copyMessage(env, adminId, chatId, message.message_id, caption, receiptKeyboard(receiptId));
      await saveReceiptAdminMessage(env, receiptId, adminId, copied.message_id, caption);
      sentToAdmin++;
    } catch (error) {
      console.error("copy receipt to admin failed", adminId, error && error.message ? error.message : error);
    }
  }

  await deleteMessage(env, chatId, message.message_id).catch(() => null);

  if (sentToAdmin > 0) {
    await sendMessage(
      env,
      chatId,
      "✅ <b>Payment receipt received</b>\n\nYour receipt was sent for admin review. After approval, credits will be added to your balance",
      null
    );
  } else {
    await sendMessage(
      env,
      chatId,
      "⚠️ <b>Payment receipt received</b>\n\nAdmin chat is not configured yet. Please contact support",
      null
    );
  }

  const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
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
    await removeButtonsFromClickedReceipt(env, query, receipt.status);
    await answerCallback(env, query.id, "Already reviewed", true);
    return;
  }

  if (approved) {
    const balance = await addCredits(env, receipt.user_id, receipt.credits);
    await markReceipt(env, receiptId, "approved", adminId);
    await clearPendingPayment(env, receipt.user_id);
    await updateClickedReceiptCaption(env, query, "approved");
    await updateAllReceiptCaptions(env, receiptId, "approved", chatId, messageId);
    await sendPaymentApprovedMessage(env, receipt.user_id, receipt.credits, balance);
    await answerCallback(env, query.id, "Approved", true);
    return;
  }

  await markReceipt(env, receiptId, "rejected", adminId);
  await clearPendingPayment(env, receipt.user_id);
  await updateClickedReceiptCaption(env, query, "rejected");
  await updateAllReceiptCaptions(env, receiptId, "rejected", chatId, messageId);
  await sendPaymentRejectedMessage(env, receipt.user_id);
  await answerCallback(env, query.id, "Rejected", true);
}

async function sendPaymentApprovedMessage(env, userId, credits, balance) {
  await sendMessage(
    env,
    userId,
    [
      "✅ <b>Payment approved</b>",
      "",
      `Your payment was verified successfully`,
      `<b>${Number(credits).toLocaleString("en-US")} credits</b> have been added to your balance`,
      `Current balance: <b>${Number(balance).toLocaleString("en-US")} credits</b>`,
      "",
      "You can now send your text to create voice",
    ].join("\n"),
    null
  ).catch(() => null);
}

async function sendPaymentRejectedMessage(env, userId) {
  await sendMessage(
    env,
    userId,
    [
      "❌ <b>Payment rejected</b>",
      "",
      "Your receipt could not be verified",
      "Please check the payment details and send a valid screenshot again",
    ].join("\n"),
    null
  ).catch(() => null);
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

async function updateClickedReceiptCaption(env, query, status) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const currentCaption = query.message?.caption || "";
  if (!chatId || !messageId || !currentCaption) return;

  const cleanCaption = stripReviewStatus(currentCaption);
  await editMessageCaption(env, chatId, messageId, cleanCaption + statusSuffix(status), emptyKeyboard()).catch((error) => {
    console.error("clicked receipt caption update failed", error && error.message ? error.message : error);
  });
}

async function removeButtonsFromClickedReceipt(env, query, status) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const currentCaption = query.message?.caption || "";
  if (!chatId || !messageId || !currentCaption) return;

  const cleanCaption = stripReviewStatus(currentCaption);
  await editMessageCaption(env, chatId, messageId, cleanCaption + statusSuffix(status), emptyKeyboard()).catch(() => null);
}

async function updateAllReceiptCaptions(env, receiptId, status, skipChatId = null, skipMessageId = null) {
  requireDb(env);
  const rows = await env.DB.prepare(
    "SELECT admin_id, message_id, caption FROM payment_receipt_messages WHERE receipt_id = ?"
  ).bind(String(receiptId)).all();

  for (const row of rows.results || []) {
    if (String(row.admin_id) === String(skipChatId) && Number(row.message_id) === Number(skipMessageId)) continue;
    const cleanCaption = stripReviewStatus(row.caption || "");
    await editMessageCaption(env, row.admin_id, row.message_id, cleanCaption + statusSuffix(status), emptyKeyboard()).catch((error) => {
      console.error("receipt caption update failed", row.admin_id, row.message_id, error && error.message ? error.message : error);
    });
  }
}

function statusSuffix(status) {
  return status === "approved"
    ? "\n\n<b>✅ تأیید شده توسط ادمین</b>"
    : "\n\n<b>❌ رد شده توسط ادمین</b>";
}

function stripReviewStatus(caption) {
  return String(caption || "")
    .replace(/\n\n✅ تأیید شده توسط ادمین/g, "")
    .replace(/\n\n❌ رد شده توسط ادمین/g, "")
    .trim();
}

function emptyKeyboard() {
  return { inline_keyboard: [] };
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
