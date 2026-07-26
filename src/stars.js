import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";

const STAR_USD_PER_50 = 0.76;
export const CUSTOM_STARS_CREDITS_PER_STAR = 85;
export const CUSTOM_STARS_USD_PER_1000_CREDITS = 0.16;

export const STAR_PACKAGES = {
  s400: createStarPackage("s400", 400, 0, 0.08, 6),
  s1000: createStarPackage("s1000", 1000, 0, 0.16, 12),
  s33000: createStarPackage("s33000", 33000, 11000, 6.8, 462),
};

export function getStarPackage(id) {
  return STAR_PACKAGES[id] || null;
}

export function createCustomStarPackage(credits, discount = null) {
  const cleanCredits = Math.max(1, Math.floor(Number(credits || 0)));
  const baseStars = Math.max(1, Math.ceil(cleanCredits / CUSTOM_STARS_CREDITS_PER_STAR));
  const discountPercent = Number(discount?.percent || 0);
  const stars = discountPercent > 0 ? Math.max(1, Math.ceil(baseStars * (100 - discountPercent) / 100)) : baseStars;
  const usd = (cleanCredits / 1000) * CUSTOM_STARS_USD_PER_1000_CREDITS;
  return {
    id: `custom_${cleanCredits}_${stars}`,
    credits: cleanCredits,
    bonus: 0,
    totalCredits: cleanCredits,
    usd,
    stars,
    originalStars: baseStars,
    discountPercent,
    discountExpiresAt: Number(discount?.expiresAt || 0),
    label: `${formatNumber(cleanCredits)} • ${formatUsd(usd)}$ • ${stars} ⭐️`,
    description: `${formatNumber(cleanCredits)} Vexa credits`,
    invoiceLabel: `${formatNumber(cleanCredits)} credits`,
    custom: true,
  };
}

export function getStarPackageFromPayload(payload) {
  if (String(payload || "").startsWith("stars_custom:")) {
    const [, credits, stars] = String(payload).split(":");
    const pack = createCustomStarPackage(credits);
    if (Number(stars) === pack.stars) return pack;
    if (Number(stars) > 0 && Number(stars) < Number(pack.stars)) {
      const percent = Math.round((1 - Number(stars) / Number(pack.stars)) * 100);
      const discounted = createCustomStarPackage(credits, { percent });
      return Number(stars) === discounted.stars ? discounted : null;
    }
    return null;
  }

  if (String(payload || "").startsWith("stars:")) {
    return getStarPackage(String(payload).slice("stars:".length));
  }

  if (String(payload || "").startsWith("stars_discount:")) {
    const [, id, stars] = String(payload).split(":");
    const pack = getStarPackage(id);
    if (!pack || Number(stars) >= Number(pack.stars)) return null;
    const percent = Math.round((1 - Number(stars) / Number(pack.stars)) * 100);
    return applyStarPackageDiscount(pack, { percent });
  }

  return null;
}

export function applyStarPackageDiscount(pack, discount = null) {
  const percent = Number(discount?.percent || 0);
  if (!pack || !percent) return pack;
  const stars = Math.max(1, Math.ceil(Number(pack.stars || 0) * (100 - percent) / 100));
  return { ...pack, stars, originalStars: pack.stars, discountPercent: percent, discountExpiresAt: Number(discount?.expiresAt || 0), label: `${formatNumber(pack.totalCredits)} • ${formatUsd(pack.usd)}$ • ${stars} ⭐️` };
}

export function starInvoicePayload(pack) {
  if (pack?.custom) return `stars_custom:${pack.totalCredits}:${pack.stars}`;
  if (Number(pack?.discountPercent || 0) > 0) return `stars_discount:${pack.id}:${pack.stars}`;
  return "stars:" + pack.id;
}

export async function applySuccessfulStarsPayment(env, userId, successfulPayment) {
  requireDb(env);

  const payload = successfulPayment?.invoice_payload || "";
  const pack = getStarPackageFromPayload(payload);
  if (!pack) return { ok: false, reason: "invalid_payload" };

  if (successfulPayment.currency !== "XTR") {
    return { ok: false, reason: "invalid_currency" };
  }

  const paidStars = Number(successfulPayment.total_amount || 0);
  if (paidStars !== pack.stars) {
    return { ok: false, reason: "invalid_amount" };
  }

  const chargeId = successfulPayment.telegram_payment_charge_id || `${userId}:${pack.id}:${Date.now()}`;
  const existing = await env.DB.prepare(
    "SELECT charge_id FROM star_payments WHERE charge_id = ?"
  ).bind(chargeId).first();

  if (existing) {
    return { ok: true, duplicate: true, pack, balance: null };
  }

  await env.DB.prepare(
    "INSERT INTO star_payments (charge_id, user_id, package_id, stars, credits, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(chargeId, String(userId), pack.id, pack.stars, pack.totalCredits).run();

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
