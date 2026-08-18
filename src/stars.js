import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";

const STAR_USD_PER_50 = 0.76;
export const CUSTOM_STARS_CREDITS_PER_STAR = 1000 / 12;
export const CUSTOM_STARS_USD_PER_1000_CREDITS = 0.178;

export const STAR_PACKAGES = {
  s400: createStarPackage("s400", 400, 0, 0.0712, 5),
  s1000: createStarPackage("s1000", 1000, 0, 0.178, 12),
  s33000: createStarPackage("s33000", 33000, 11000, 7.832, 528),
};

export const MINI_APP_STAR_PACKAGES = Object.freeze({
  mini_3000: createStarPackage("mini_3000", 3000, 0, 0.5, 36),
  mini_10000: createStarPackage("mini_10000", 10000, 600, 1.6, 118),
  mini_18000: createStarPackage("mini_18000", 18000, 2200, 3.2, 216),
  mini_30000: createStarPackage("mini_30000", 30000, 6000, 5.3, 360),
});

// Bank-card catalog. Payment links are intentionally kept separate so package
// pricing can be finalized before Tribute/card checkout links are attached.
export const CARD_CREDIT_PACKAGES = Object.freeze({
  card_6000: createCardCreditPackage("card_6000", 6000, 0, {
    usd: { amountMinor: 200 },
    eur: { amountMinor: 199 },
    rub: { amountMinor: 17000 },
  }, { usdPer1000: 0.34 }),
  card_40000: createCardCreditPackage("card_40000", 40000, 0, {
    usd: { amountMinor: 700, originalAmountMinor: 1000 },
    eur: { amountMinor: 699, originalAmountMinor: 999 },
    rub: { amountMinor: 59500, originalAmountMinor: 85000 },
  }, { discountPercent: 30 }),
  card_120000: createCardCreditPackage("card_120000", 120000, 10000, {
    usd: { amountMinor: 1900 },
    eur: { amountMinor: 1899 },
    rub: { amountMinor: 161500 },
  }),
  card_350000: createCardCreditPackage("card_350000", 350000, 0, {
    usd: { amountMinor: 4900 },
    eur: { amountMinor: 4899 },
    rub: { amountMinor: 416500 },
  }, { usdPer1000: 0.14 }),
});

export function getStarPackage(id) {
  return STAR_PACKAGES[id] || MINI_APP_STAR_PACKAGES[id] || null;
}

export function createCustomStarPackage(credits, discount = null) {
  const cleanCredits = Math.max(1, Math.floor(Number(credits || 0)));
  const baseStars = Math.max(80, Math.ceil(cleanCredits / CUSTOM_STARS_CREDITS_PER_STAR));
  const discountPercent = normalizeDiscountPercent(discount?.percent);
  const stars = discountPercent > 0 ? discountedStars(baseStars, discountPercent) : baseStars;
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
  const value = String(payload || "");

  if (value.startsWith("stars_custom:")) {
    const [, credits, stars, percentRaw] = value.split(":");
    const paidStars = Number(stars);
    const percent = normalizeDiscountPercent(percentRaw);
    const pack = createCustomStarPackage(credits, percent > 0 ? { percent } : null);
    if (!Number.isSafeInteger(paidStars) || paidStars <= 0 || paidStars !== Number(pack.stars)) return null;
    return pack;
  }

  if (value.startsWith("stars:")) {
    return getStarPackage(value.slice("stars:".length));
  }

  if (value.startsWith("stars_discount:")) {
    const [, id, stars, percentRaw] = value.split(":");
    const paidStars = Number(stars);
    const percent = normalizeDiscountPercent(percentRaw);
    const pack = getStarPackage(id);
    if (!pack || !percent || !Number.isSafeInteger(paidStars) || paidStars <= 0) return null;
    const discounted = applyStarPackageDiscount(pack, { percent });
    return Number(discounted?.stars) === paidStars ? discounted : null;
  }

  return null;
}

export function applyStarPackageDiscount(pack, discount = null) {
  const percent = normalizeDiscountPercent(discount?.percent);
  if (!pack || !percent) return pack;
  const originalStars = Number(pack.originalStars || pack.stars || 0);
  const stars = discountedStars(originalStars, percent);
  return {
    ...pack,
    stars,
    originalStars,
    discountPercent: percent,
    discountExpiresAt: Number(discount?.expiresAt || 0),
    label: `${formatNumber(pack.totalCredits)} • ${formatUsd(pack.usd)}$ • ${stars} ⭐️`,
  };
}

export function starInvoicePayload(pack) {
  const percent = normalizeDiscountPercent(pack?.discountPercent);
  if (pack?.custom) return `stars_custom:${pack.totalCredits}:${pack.stars}:${percent}`;
  if (percent > 0) return `stars_discount:${pack.id}:${pack.stars}:${percent}`;
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

function createCardCreditPackage(id, credits, bonus, prices, options = {}) {
  const totalCredits = Number(credits || 0) + Number(bonus || 0);
  const cleanPrices = Object.freeze(Object.fromEntries(
    Object.entries(prices || {}).map(([currency, price]) => [currency, Object.freeze({
      amountMinor: Math.max(0, Math.floor(Number(price?.amountMinor || 0))),
      originalAmountMinor: price?.originalAmountMinor == null
        ? null
        : Math.max(0, Math.floor(Number(price.originalAmountMinor || 0))),
    })])
  ));

  return Object.freeze({
    id,
    credits: Number(credits || 0),
    bonus: Number(bonus || 0),
    totalCredits,
    prices: cleanPrices,
    discountPercent: Math.max(0, Math.floor(Number(options.discountPercent || 0))),
    usdPer1000: options.usdPer1000 == null ? null : Number(options.usdPer1000),
  });
}

function normalizeDiscountPercent(value) {
  const percent = Math.floor(Number(value) || 0);
  return percent > 0 && percent < 100 ? percent : 0;
}

function discountedStars(originalStars, percent) {
  return Math.max(1, Math.ceil(Number(originalStars || 0) * (100 - percent) / 100));
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function formatUsd(value) {
  const displayValue = Math.floor((Number(value) + Number.EPSILON) * 100) / 100;
  return displayValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
