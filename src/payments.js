import { requireDb } from "./state.js";

export async function setPendingPayment(env, userId, packageId) {
  requireDb(env);

  await env.DB.prepare(
    "INSERT INTO pending_payments (user_id, package_id, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET package_id = excluded.package_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), packageId).run();
}

export async function getPendingPayment(env, userId) {
  requireDb(env);

  return await env.DB.prepare(
    "SELECT package_id FROM pending_payments WHERE user_id = ?"
  ).bind(String(userId)).first();
}

export async function clearPendingPayment(env, userId) {
  requireDb(env);

  await env.DB.prepare(
    "DELETE FROM pending_payments WHERE user_id = ?"
  ).bind(String(userId)).run();
}
