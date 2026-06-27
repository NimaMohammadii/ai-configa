import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";

const STAR_USD_PER_50 = 0.76;

export const STAR_PACKAGES = {
  s400: createStarPackage("s400", 400, 0, 0.08, 6),
  s1000: createStarPackage("s1000", 1000, 0, 0.16, 12),
  s33000: createStarPackage("s33000", 33000, 11000, 6.8, 462),
};

export function getStarPackage(id) {
  return STAR_PACKAGES[id] || null;
}

export async function applySuccessfulStarsPayment(env, userId, successfulPayment) {
  requireDb(env);

  const payload = successfulPayment?.invoice_payload || "";
  if (!payload.startsWith("stars:")) return { ok: false, reason: "invalid_payload" };

  const packageId = payload.slice("stars:".length);
  const pack = getStarPackage(packageId);
  if (!pack) return { ok: false, reason: "invalid_package" };

  if (successfulPayment.currency !== "XTR") {
    return { ok: false, reason: "invalid_currency" };
  }

  const paidStars = Number(successfulPayment.total_amount || 0);
  if (paidStars !== pack.stars) {
    return { ok: false, reason: "invalid_amount" };
  }

  const chargeId = successfulPayment.telegram_payment_charge_id || `${userId}:${packageId}:${Date.now()}`;
  const existing = await env.DB.prepare(
    "SELECT charge_id FROM star_payments WHERE charge_id = ?"
  ).bind(chargeId).first();

  if (existing) {
    return { ok: true, duplicate: true, pack, balance: null };
  }

  await env.DB.prepare(
    "INSERT INTO star_payments (charge_id, user_id, package_id, stars, credits, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(chargeId, String(userId), packageId, pack.stars, pack.totalCredits).run();

  const balance = await addCredits(env, userId, pack.totalCredits);
  return { ok: true, duplicate: false, pack, balance };
}

function createStarPackage(id, credits, bonus, usd, starsOverride = null) {
  const totalCredits = credits + bonus;
  const stars = starsOverride ?? Math.ceil((usd / STAR_USD_PER_50) * 50);
  const creditLabel = bonus > 0 ? `${formatNumber(credits)} + ${formatNumber(bonus)}🎁` : formatNumber(credits);

  return {
    id,
    credits,
    bonus,
    totalCredits,
    usd,
    stars,
    label: `${creditLabel} • ${formatUsd(usd)}$ • ${stars} ⭐️`,
    description: `${formatNumber(totalCredits)} Vexa credits`,
    invoiceLabel: `${formatNumber(totalCredits)} credits`,
  };
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function formatUsd(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
