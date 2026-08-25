import { requireDb } from "./state.js";

export async function createPaymentReceipt(env, user, { packageId, amount, credits }) {
  requireDb(env);
  const id = crypto.randomUUID();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO payment_receipts (id, user_id, username, first_name, last_name, package_id, amount, credits, status, created_at) " +
      "SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP " +
      "WHERE NOT EXISTS (SELECT 1 FROM payment_receipts WHERE user_id = ? AND status = 'pending')"
  ).bind(
    id,
    String(user.id),
    user.username || null,
    user.first_name || null,
    user.last_name || null,
    packageId,
    String(amount),
    Number(credits),
    String(user.id),
  ).run();
  return changedRows(result) === 1 ? id : null;
}

export async function savePaymentReceiptAdminMessage(env, receiptId, adminId, messageId, caption) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO payment_receipt_messages (receipt_id, admin_id, message_id, caption, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(receiptId), String(adminId), Number(messageId), caption).run();
}

export async function markPaymentReceiptDeliveryFailed(env, receiptId) {
  requireDb(env);
  await env.DB.prepare(
    "UPDATE payment_receipts SET status = 'delivery_failed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(String(receiptId)).run();
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) || 0;
}
