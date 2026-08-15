import { getBalance } from "./credits.js";
import { getActiveWheelPurchaseDiscount } from "./reward-wheel.js";
import { MINI_APP_STAR_PACKAGES, CUSTOM_STARS_USD_PER_1000_CREDITS } from "./stars.js";
import { getState, requireDb } from "./state.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";

const TRIBUTE_API_BASE = "https://tribute.tg/api/v1/shop";
const TRIBUTE_CURRENCY = "usd";
const TRIBUTE_MIN_CENTS = 100;
const TRIBUTE_MAX_CENTS = 100000;
const MAX_CREDITS = 1_000_000;
const CARD_STEP_CREDITS = 1_000;

export function isTributeWebhookRequest(request) {
  const url = new URL(request.url);
  return request.method === "POST" && url.pathname === "/tribute/webhook";
}

export function isTributeMiniAppRequest(request) {
  if (request.method !== "POST") return false;
  const path = new URL(request.url).pathname;
  return path === "/mini-app/api/tribute-config" ||
    path === "/mini-app/api/tribute-order" ||
    path === "/mini-app/api/tribute-status";
}

export async function handleTributeMiniAppRequest(request, env) {
  try {
    const path = new URL(request.url).pathname;
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);

    if (path === "/mini-app/api/tribute-config") {
      return json(await buildTributeConfig(env, user));
    }

    if (!tributeApiKey(env)) {
      return json({ error: "Card payment is temporarily unavailable." }, 503);
    }

    if (path === "/mini-app/api/tribute-order") {
      return json(await createTributeOrder(env, user, body));
    }

    if (path === "/mini-app/api/tribute-status") {
      return json(await getTributeOrderStatus(env, user, body));
    }

    return json({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Tribute mini app request failed", error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }
}

export async function handleTributeWebhook(request, env) {
  const key = tributeApiKey(env);
  if (!key) return json({ error: "Tribute is not configured" }, 503);

  const rawBody = await request.text();
  const signature = String(request.headers.get("trbt-signature") || "").trim();
  if (!signature || !(await verifyTributeSignature(rawBody, signature, key))) {
    console.warn("Rejected Tribute webhook with invalid signature");
    return json({ error: "Invalid Tribute signature" }, 401);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid webhook data" }, 400);
  }

  const name = String(event?.name || "");
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const orderUuid = normalizeOrderUuid(payload.uuid);
  if (!orderUuid) return json({ error: "Invalid webhook data" }, 400);

  try {
    if (name === "shop_order" && String(payload.status || "").toLowerCase() === "paid") {
      await settleTributeOrder(env, orderUuid, payload);
    } else if (name === "shop_order_refunded") {
      await refundTributeOrder(env, orderUuid, payload);
    } else if (name === "shop_order_payment_failed") {
      await markTributeOrderStatus(env, orderUuid, "failed");
    }
  } catch (error) {
    console.error("Tribute webhook processing failed", name, orderUuid, error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }

  return json({ status: "ok" });
}

async function buildTributeConfig(env, user) {
  const discount = await getActiveWheelPurchaseDiscount(env, user.id).catch(() => null);
  const percent = normalizeDiscountPercent(discount?.percent);
  const state = await getState(env, user.id).catch(() => null);
  const minimumCredits = minimumCustomCredits(percent);

  return {
    available: Boolean(tributeApiKey(env)),
    currency: TRIBUTE_CURRENCY,
    language: String(state?.language || user.language_code || "en").toLowerCase(),
    ratePer1000Usd: CUSTOM_STARS_USD_PER_1000_CREDITS,
    minimumCents: TRIBUTE_MIN_CENTS,
    minimumCredits,
    maximumCredits: MAX_CREDITS,
    stepCredits: CARD_STEP_CREDITS,
    discountPercent: percent,
    discountExpiresAt: Number(discount?.expiresAt || 0),
    packages: Object.values(MINI_APP_STAR_PACKAGES).map((pack) => cardPackage(pack, percent)),
  };
}

async function createTributeOrder(env, user, body) {
  requireDb(env);
  await ensureTributePaymentsTable(env);

  const offer = await resolveCardOffer(env, user.id, body);
  if (offer.amountCents < TRIBUTE_MIN_CENTS) {
    throw httpError("Card payments start at $1. Choose a little more credits.", 400);
  }
  if (offer.amountCents > TRIBUTE_MAX_CENTS) {
    throw httpError("This payment amount is above Tribute's limit.", 400);
  }

  const response = await fetch(TRIBUTE_API_BASE + "/orders", {
    method: "POST",
    headers: {
      "Api-Key": tributeApiKey(env),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      amount: offer.amountCents,
      currency: TRIBUTE_CURRENCY,
      title: "Vexa Credits",
      description: `${formatNumber(offer.totalCredits)} Vexa credits`,
      customerId: String(user.id),
      comment: offer.packageId ? `Vexa credit pack ${offer.packageId}` : `Vexa custom credits ${offer.totalCredits}`,
      period: "onetime",
    }),
  });

  const data = await response.json().catch(() => ({}));
  const orderUuid = normalizeOrderUuid(data?.uuid);
  const paymentUrl = safeTributePaymentUrl(data?.paymentUrl);
  if (!response.ok || !orderUuid || !paymentUrl) {
    console.error("Tribute create order failed", response.status, data);
    throw httpError(tributeApiError(data, "Could not start card checkout."), response.status >= 400 && response.status < 500 ? response.status : 502);
  }

  await env.DB.prepare(
    "INSERT INTO tribute_payments " +
    "(order_uuid, user_id, package_id, credits, amount, currency, status, payment_url, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(
    orderUuid,
    String(user.id),
    offer.packageId || null,
    offer.totalCredits,
    offer.amountCents,
    TRIBUTE_CURRENCY,
    paymentUrl
  ).run();

  return {
    ok: true,
    orderUuid,
    paymentUrl,
    credits: offer.totalCredits,
    amountCents: offer.amountCents,
    originalAmountCents: offer.originalAmountCents,
    discountPercent: offer.discountPercent,
    currency: TRIBUTE_CURRENCY,
    balance: await getBalance(env, user.id),
  };
}

async function getTributeOrderStatus(env, user, body) {
  requireDb(env);
  await ensureTributePaymentsTable(env);

  const orderUuid = normalizeOrderUuid(body?.orderUuid);
  if (!orderUuid) throw httpError("Payment not found.", 400);

  let row = await readTributeOrder(env, orderUuid, user.id);
  if (!row) throw httpError("Payment not found.", 404);

  if (row.status === "paid" && row.credited_at) {
    return statusPayload(env, row, user.id);
  }
  if (row.status === "refunded" || row.status === "failed") {
    return statusPayload(env, row, user.id);
  }

  const response = await fetch(TRIBUTE_API_BASE + "/orders/" + encodeURIComponent(orderUuid) + "/status", {
    method: "GET",
    headers: {
      "Api-Key": tributeApiKey(env),
      "Accept": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Tribute status request failed", response.status, data);
    throw httpError(tributeApiError(data, "Could not check payment status."), response.status >= 400 && response.status < 500 ? response.status : 502);
  }

  const remoteStatus = String(data?.status || "pending").toLowerCase();
  if (remoteStatus === "paid") {
    await settleTributeOrder(env, orderUuid);
  } else if (remoteStatus === "failed") {
    await markTributeOrderStatus(env, orderUuid, "failed");
  }

  row = await readTributeOrder(env, orderUuid, user.id);
  return statusPayload(env, row, user.id);
}

async function statusPayload(env, row, userId) {
  return {
    ok: true,
    orderUuid: row.order_uuid,
    status: String(row.status || "pending"),
    credits: Number(row.credits || 0),
    amountCents: Number(row.amount || 0),
    currency: String(row.currency || TRIBUTE_CURRENCY),
    credited: Boolean(row.credited_at),
    refunded: Boolean(row.refunded_at),
    balance: await getBalance(env, userId),
  };
}

async function resolveCardOffer(env, userId, body) {
  const discount = await getActiveWheelPurchaseDiscount(env, userId).catch(() => null);
  const percent = normalizeDiscountPercent(discount?.percent);
  const packageId = String(body?.packageId || "").trim();

  if (packageId) {
    const pack = MINI_APP_STAR_PACKAGES[packageId];
    if (!pack) throw httpError("Credit pack not found.", 400);
    const card = cardPackage(pack, percent);
    return {
      packageId,
      totalCredits: card.totalCredits,
      amountCents: card.amountCents,
      originalAmountCents: card.originalAmountCents,
      discountPercent: percent,
    };
  }

  const credits = Math.floor(Number(body?.credits || 0));
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > MAX_CREDITS) {
    throw httpError("Choose a valid credit amount.", 400);
  }

  const originalAmountCents = customBaseCents(credits);
  const amountCents = discountedCents(originalAmountCents, percent);
  return {
    packageId: null,
    totalCredits: credits,
    amountCents,
    originalAmountCents,
    discountPercent: percent,
  };
}

function cardPackage(pack, percent) {
  const originalAmountCents = Math.max(1, Math.round(Number(pack?.usd || 0) * 100));
  const amountCents = discountedCents(originalAmountCents, percent);
  return {
    id: String(pack?.id || ""),
    credits: Number(pack?.credits || 0),
    bonus: Number(pack?.bonus || 0),
    totalCredits: Number(pack?.totalCredits || 0),
    originalAmountCents,
    amountCents,
    available: amountCents >= TRIBUTE_MIN_CENTS && amountCents <= TRIBUTE_MAX_CENTS,
  };
}

function customBaseCents(credits) {
  return Math.max(1, Math.ceil((Number(credits || 0) / 1000) * CUSTOM_STARS_USD_PER_1000_CREDITS * 100));
}

function minimumCustomCredits(percent) {
  let credits = CARD_STEP_CREDITS;
  while (credits < MAX_CREDITS && discountedCents(customBaseCents(credits), percent) < TRIBUTE_MIN_CENTS) {
    credits += CARD_STEP_CREDITS;
  }
  return Math.min(MAX_CREDITS, credits);
}

function discountedCents(cents, percent) {
  const clean = Math.max(1, Math.round(Number(cents || 0)));
  const discount = normalizeDiscountPercent(percent);
  return discount ? Math.max(1, Math.ceil(clean * (100 - discount) / 100)) : clean;
}

function normalizeDiscountPercent(value) {
  const percent = Math.floor(Number(value) || 0);
  return percent > 0 && percent < 100 ? percent : 0;
}

async function settleTributeOrder(env, orderUuid, webhookPayload = null) {
  requireDb(env);
  await ensureTributePaymentsTable(env);
  const row = await readTributeOrder(env, orderUuid);
  if (!row) throw httpError("Unknown Tribute order.", 404);

  verifyWebhookOrder(row, webhookPayload);
  if (row.credited_at) {
    if (row.status !== "paid") await markTributeOrderStatus(env, orderUuid, "paid");
    return row;
  }

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(String(row.user_id)),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + COALESCE((SELECT credits FROM tribute_payments WHERE order_uuid = ? AND credited_at IS NULL), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(orderUuid, String(row.user_id)),
    env.DB.prepare(
      "UPDATE tribute_payments SET status = 'paid', credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE order_uuid = ? AND credited_at IS NULL"
    ).bind(orderUuid),
  ]);

  return readTributeOrder(env, orderUuid);
}

async function refundTributeOrder(env, orderUuid, webhookPayload = null) {
  requireDb(env);
  await ensureTributePaymentsTable(env);
  const row = await readTributeOrder(env, orderUuid);
  if (!row) throw httpError("Unknown Tribute order.", 404);

  verifyWebhookOrder(row, webhookPayload);
  if (row.refunded_at) return row;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(String(row.user_id)),
    env.DB.prepare(
      "UPDATE user_credits SET credits = MAX(credits - COALESCE((SELECT credits FROM tribute_payments WHERE order_uuid = ? AND credited_at IS NOT NULL AND refunded_at IS NULL), 0), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(orderUuid, String(row.user_id)),
    env.DB.prepare(
      "UPDATE tribute_payments SET status = 'refunded', refunded_at = COALESCE(refunded_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE order_uuid = ? AND refunded_at IS NULL"
    ).bind(orderUuid),
  ]);

  return readTributeOrder(env, orderUuid);
}

function verifyWebhookOrder(row, payload) {
  if (!payload) return;
  const amount = Number(payload.amount);
  const currency = String(payload.currency || "").toLowerCase();
  if (Number.isFinite(amount) && amount > 0 && amount !== Number(row.amount)) {
    throw httpError("Tribute order amount mismatch.", 400);
  }
  if (currency && currency !== String(row.currency || "").toLowerCase()) {
    throw httpError("Tribute order currency mismatch.", 400);
  }
}

async function markTributeOrderStatus(env, orderUuid, status) {
  requireDb(env);
  await ensureTributePaymentsTable(env);
  await env.DB.prepare(
    "UPDATE tribute_payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_uuid = ? AND credited_at IS NULL AND refunded_at IS NULL"
  ).bind(String(status), orderUuid).run();
}

async function readTributeOrder(env, orderUuid, userId = null) {
  const sql = userId == null
    ? "SELECT * FROM tribute_payments WHERE order_uuid = ?"
    : "SELECT * FROM tribute_payments WHERE order_uuid = ? AND user_id = ?";
  const statement = env.DB.prepare(sql);
  return userId == null
    ? statement.bind(orderUuid).first()
    : statement.bind(orderUuid, String(userId)).first();
}

async function ensureTributePaymentsTable(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS tribute_payments (" +
      "order_uuid TEXT PRIMARY KEY, " +
      "user_id TEXT NOT NULL, " +
      "package_id TEXT, " +
      "credits INTEGER NOT NULL, " +
      "amount INTEGER NOT NULL, " +
      "currency TEXT NOT NULL DEFAULT 'usd', " +
      "status TEXT NOT NULL DEFAULT 'pending', " +
      "payment_url TEXT, " +
      "credited_at TEXT, " +
      "refunded_at TEXT, " +
      "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP" +
      ")"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tribute_payments_user_created ON tribute_payments (user_id, created_at DESC)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tribute_payments_status ON tribute_payments (status, created_at DESC)"
    ),
  ]);
}

async function verifyTributeSignature(rawBody, providedSignature, apiKey) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const base64 = bytesToBase64(digest);
  const base64Url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const provided = String(providedSignature || "").replace(/^sha256=/i, "").trim();
  return safeEqual(provided.toLowerCase(), hex) || safeEqual(provided, base64) || safeEqual(provided, base64Url);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function tributeApiKey(env) {
  return String(env?.TRIBUTE_API_KEY || "").trim();
}

function normalizeOrderUuid(value) {
  const uuid = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid) ? uuid : "";
}

function safeTributePaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    if (url.hostname !== "web.tribute.tg" && url.hostname !== "tribute.tg") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function tributeApiError(data, fallback) {
  const message = data?.message || data?.error || data?.detail?.message || data?.detail;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

function formatNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
}

function publicError(error) {
  return String(error?.message || "Card payment error").replace(/\s+/g, " ").trim().slice(0, 240);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
