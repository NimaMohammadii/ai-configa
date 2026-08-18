import { getBalance } from "./credits.js";
import { MINI_APP_STAR_PACKAGES, CUSTOM_STARS_USD_PER_1000_CREDITS } from "./stars.js";
import { getState, requireDb } from "./state.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";

const TRIBUTE_PRODUCTS_API = "https://tribute.tg/api/v1/products";
const PRODUCT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_VEXA_PRODUCT_LINKS = Object.freeze([
  "https://web.tribute.tg/p/CcQ",
  "https://web.tribute.tg/p/Cdn",
]);

let productCache = null;

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
      return json(await createTributePaymentIntent(env, user, body));
    }

    if (path === "/mini-app/api/tribute-status") {
      return json(await getTributePaymentStatus(env, user, body));
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

  const name = String(event?.name || "").trim();
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};

  // Tribute's test request and unrelated creator events must be acknowledged.
  if (name !== "new_digital_product" && name !== "digital_product_refunded") {
    return json({ status: "ok" });
  }

  try {
    if (name === "new_digital_product") {
      await applyDigitalProductPurchase(env, payload);
    } else {
      await applyDigitalProductRefund(env, payload);
    }
  } catch (error) {
    console.error("Tribute digital product webhook failed", name, error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }

  return json({ status: "ok" });
}

export async function getTributeDigitalProductsState(env, options = {}) {
  if (!tributeApiKey(env)) {
    return { ready: false, error: "Tribute API key is not configured.", products: [] };
  }

  try {
    const products = await getVexaCardProducts(env, { force: options.force === true });
    return {
      ready: products.length > 0,
      error: products.length ? null : "No active Vexa digital product with card payments was found.",
      products: products.map((product) => ({
        productId: product.productId,
        credits: product.credits,
        amountMinor: product.amountMinor,
        currency: product.currency,
        webLink: product.paymentUrl,
        acceptCards: true,
      })),
    };
  } catch (error) {
    return { ready: false, error: publicError(error), products: [] };
  }
}

async function buildTributeConfig(env, user) {
  const state = await getState(env, user.id).catch(() => null);
  let products = [];
  let error = null;

  if (tributeApiKey(env)) {
    try {
      products = await getVexaCardProducts(env);
    } catch (caught) {
      error = publicError(caught);
    }
  }

  const currencies = uniqueCurrencies(products);
  return {
    available: Boolean(tributeApiKey(env) && products.length),
    configured: Boolean(tributeApiKey(env)),
    mode: "digital_products",
    language: String(state?.language || user.language_code || "en").toLowerCase(),
    defaultCurrency: currencies[0]?.code || "usd",
    currencies,
    products,
    error,
  };
}

async function createTributePaymentIntent(env, user, body) {
  requireDb(env);
  await ensureTributeTables(env);

  const products = await getVexaCardProducts(env);
  const product = resolveRequestedProduct(products, body);
  if (!product) throw httpError("This card pack is not available.", 400);

  const orderUuid = crypto.randomUUID().toLowerCase();
  const packageId = `digital:${product.productId}`;

  await env.DB.prepare(
    "INSERT INTO tribute_payments " +
    "(order_uuid, user_id, package_id, credits, amount, currency, status, payment_url, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(
    orderUuid,
    String(user.id),
    packageId,
    product.credits,
    product.amountMinor,
    product.currency,
    product.paymentUrl
  ).run();

  return {
    ok: true,
    orderUuid,
    productId: product.productId,
    paymentUrl: product.paymentUrl,
    webappPaymentUrl: product.telegramLink || "",
    credits: product.credits,
    amountMinor: product.amountMinor,
    currency: product.currency,
    balance: await getBalance(env, user.id),
  };
}

async function getTributePaymentStatus(env, user, body) {
  requireDb(env);
  await ensureTributeTables(env);

  const orderUuid = normalizeOrderUuid(body?.orderUuid);
  if (!orderUuid) throw httpError("Payment not found.", 400);

  let row = await readTributeIntent(env, orderUuid, user.id);
  if (!row) throw httpError("Payment not found.", 404);

  if (row.status !== "paid" && row.status !== "refunded") {
    const productId = productIdFromPackageId(row.package_id);
    if (productId) {
      const purchase = await env.DB.prepare(
        "SELECT * FROM tribute_digital_purchases " +
        "WHERE user_id = ? AND product_id = ? AND datetime(created_at) >= datetime(?) " +
        "ORDER BY datetime(created_at) DESC LIMIT 1"
      ).bind(String(user.id), productId, row.created_at).first();

      if (purchase?.status === "refunded") {
        await markIntentFromPurchase(env, row.order_uuid, purchase, "refunded");
      } else if (purchase?.credited_at) {
        await markIntentFromPurchase(env, row.order_uuid, purchase, "paid");
      }
      row = await readTributeIntent(env, orderUuid, user.id);
    }
  }

  return statusPayload(env, row, user.id);
}

async function statusPayload(env, row, userId) {
  return {
    ok: true,
    orderUuid: row.order_uuid,
    status: String(row.status || "pending"),
    credits: Number(row.credits || 0),
    amountMinor: Number(row.amount || 0),
    currency: String(row.currency || "usd"),
    credited: Boolean(row.credited_at),
    refunded: Boolean(row.refunded_at),
    balance: await getBalance(env, userId),
  };
}

async function applyDigitalProductPurchase(env, payload) {
  requireDb(env);
  await ensureTributeTables(env);

  const purchaseId = normalizePositiveId(payload?.purchase_id);
  const transactionId = normalizeOptionalId(payload?.transaction_id);
  const productId = normalizePositiveId(payload?.product_id);
  const userId = normalizePositiveId(payload?.telegram_user_id);
  if (!purchaseId || !productId || !userId) throw httpError("Invalid Tribute digital product webhook.", 400);

  const product = await getVexaProductById(env, productId);
  verifyDigitalProductPayload(product, payload);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO tribute_digital_purchases " +
      "(purchase_id, transaction_id, product_id, user_id, product_name, credits, amount, currency, status, purchase_created_at, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(
      purchaseId,
      transactionId,
      productId,
      userId,
      String(payload?.product_name || product.name || "Vexa Credits").slice(0, 240),
      product.credits,
      product.amountMinor,
      product.currency,
      String(payload?.purchase_created_at || "") || null
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(userId),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + COALESCE((" +
      "SELECT credits FROM tribute_digital_purchases WHERE purchase_id = ? AND credited_at IS NULL AND refunded_at IS NULL" +
      "), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(purchaseId, userId),
    env.DB.prepare(
      "UPDATE tribute_digital_purchases SET status = 'paid', credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
      "WHERE purchase_id = ? AND credited_at IS NULL AND refunded_at IS NULL"
    ).bind(purchaseId),
  ]);

  await linkPurchaseToLatestIntent(env, userId, productId, purchaseId, "paid");
}

async function applyDigitalProductRefund(env, payload) {
  requireDb(env);
  await ensureTributeTables(env);

  const purchaseId = normalizePositiveId(payload?.purchase_id);
  const productId = normalizePositiveId(payload?.product_id);
  const userId = normalizePositiveId(payload?.telegram_user_id);
  if (!purchaseId || !productId || !userId) throw httpError("Invalid Tribute refund webhook.", 400);

  const product = await getVexaProductById(env, productId);
  verifyDigitalProductPayload(product, payload);

  const existing = await env.DB.prepare(
    "SELECT * FROM tribute_digital_purchases WHERE purchase_id = ? LIMIT 1"
  ).bind(purchaseId).first();

  if (!existing) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO tribute_digital_purchases " +
      "(purchase_id, transaction_id, product_id, user_id, product_name, credits, amount, currency, status, refunded_at, purchase_created_at, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'refunded', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(
      purchaseId,
      normalizeOptionalId(payload?.transaction_id),
      productId,
      userId,
      String(payload?.product_name || product.name || "Vexa Credits").slice(0, 240),
      product.credits,
      product.amountMinor,
      product.currency,
      String(payload?.purchase_created_at || "") || null
    ).run();
  } else if (!existing.refunded_at) {
    verifyStoredPurchase(existing, product, userId);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).bind(userId),
      env.DB.prepare(
        "UPDATE user_credits SET credits = MAX(credits - COALESCE((" +
        "SELECT credits FROM tribute_digital_purchases WHERE purchase_id = ? AND credited_at IS NOT NULL AND refunded_at IS NULL" +
        "), 0), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(purchaseId, userId),
      env.DB.prepare(
        "UPDATE tribute_digital_purchases SET status = 'refunded', refunded_at = COALESCE(refunded_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
        "WHERE purchase_id = ? AND refunded_at IS NULL"
      ).bind(purchaseId),
    ]);
  }

  await linkPurchaseToLatestIntent(env, userId, productId, purchaseId, "refunded");
}

async function linkPurchaseToLatestIntent(env, userId, productId, purchaseId, status) {
  const pendingPackageId = `digital:${productId}`;
  const linkedPackageId = `digital:${productId}:purchase:${purchaseId}`;

  if (status === "refunded") {
    await env.DB.prepare(
      "UPDATE tribute_payments SET status = 'refunded', refunded_at = COALESCE(refunded_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ? AND package_id = ?"
    ).bind(String(userId), linkedPackageId).run();
    return;
  }

  await env.DB.prepare(
    "UPDATE tribute_payments SET package_id = ?, status = 'paid', credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
    "WHERE order_uuid = (" +
    "SELECT order_uuid FROM tribute_payments WHERE user_id = ? AND package_id = ? AND status = 'pending' " +
    "ORDER BY datetime(created_at) DESC LIMIT 1)"
  ).bind(linkedPackageId, String(userId), pendingPackageId).run();
}

async function markIntentFromPurchase(env, orderUuid, purchase, status) {
  const productId = Number(purchase?.product_id || 0);
  const purchaseId = String(purchase?.purchase_id || "");
  if (!productId || !purchaseId) return;
  const linkedPackageId = `digital:${productId}:purchase:${purchaseId}`;
  const paid = status === "paid";
  await env.DB.prepare(
    "UPDATE tribute_payments SET package_id = ?, status = ?, " +
    (paid
      ? "credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP), "
      : "refunded_at = COALESCE(refunded_at, CURRENT_TIMESTAMP), ") +
    "updated_at = CURRENT_TIMESTAMP WHERE order_uuid = ?"
  ).bind(linkedPackageId, status, orderUuid).run();
}

function verifyDigitalProductPayload(product, payload) {
  const amount = Number(payload?.amount);
  const currency = String(payload?.currency || "").trim().toLowerCase();
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount !== Number(product.amountMinor)) {
    throw httpError("Tribute product amount mismatch.", 400);
  }
  if (!currency || currency !== product.currency) {
    throw httpError("Tribute product currency mismatch.", 400);
  }
}

function verifyStoredPurchase(row, product, userId) {
  if (String(row.user_id) !== String(userId) || Number(row.product_id) !== Number(product.productId)) {
    throw httpError("Tribute purchase identity mismatch.", 400);
  }
  if (Number(row.amount) !== Number(product.amountMinor) || String(row.currency).toLowerCase() !== product.currency) {
    throw httpError("Tribute purchase data mismatch.", 400);
  }
}

async function getVexaProductById(env, productId) {
  const products = await getVexaCardProducts(env, { force: true });
  const product = products.find((item) => Number(item.productId) === Number(productId));
  if (!product) throw httpError("Unknown Vexa Tribute product.", 400);
  return product;
}

async function getVexaCardProducts(env, options = {}) {
  const rows = await getTributeProducts(env, options);
  return rows
    .filter((row) => isEligibleVexaProduct(row, env))
    .map((row) => toCardProduct(row))
    .filter(Boolean)
    .sort((a, b) => a.amountMinor - b.amountMinor || a.credits - b.credits);
}

async function getTributeProducts(env, options = {}) {
  const key = tributeApiKey(env);
  if (!key) throw httpError("Tribute API key is not configured.", 503);

  const now = Date.now();
  if (!options.force && productCache && productCache.expiresAt > now) return productCache.rows;

  const rows = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = `${TRIBUTE_PRODUCTS_API}?page=${page}&size=100&type=digital&desc=true`;
    let response;
    let data;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "Api-Key": key, "Accept": "application/json" },
      });
      data = await response.json().catch(() => ({}));
    } catch {
      throw httpError("Could not reach Tribute right now.", 502);
    }

    if (response.status === 401) throw httpError("Tribute API key is invalid.", 503);
    if (!response.ok) throw httpError(tributeApiError(data, "Could not load Tribute digital products."), 502);

    const pageRows = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }

  productCache = { rows, expiresAt: now + PRODUCT_CACHE_TTL_MS };
  return rows;
}

function isEligibleVexaProduct(row, env) {
  if (!row || String(row.type || "").toLowerCase() !== "digital") return false;
  if (row.acceptCards !== true) return false;

  const webLink = safeTributePaymentUrl(row.webLink);
  if (!webLink) return false;

  const status = String(row.status || "").toLowerCase();
  const allowedLinks = new Set(configuredVexaProductLinks(env));
  const configuredLink = allowedLinks.has(normalizeUrl(webLink));

  // Tribute's live Digital Products API currently returns `new` for a freshly
  // created, immediately shareable card-enabled product, even though the public
  // schema still documents pending/approved/rejected. Only explicitly configured
  // Vexa links may use this live `new` status; inferred products still require approved.
  if (configuredLink) return status === "approved" || status === "new";
  if (status !== "approved") return false;

  const text = `${row.name || ""} ${row.description || ""}`.toLowerCase();
  return text.includes("vexa") && text.includes("credit");
}

function configuredVexaProductLinks(env) {
  const extra = String(env?.TRIBUTE_DIGITAL_PRODUCT_LINKS || env?.TRIBUTE_PRODUCT_LINKS || "")
    .split(/[\s,;]+/)
    .map((value) => normalizeUrl(value))
    .filter(Boolean);
  return [...new Set([...DEFAULT_VEXA_PRODUCT_LINKS.map(normalizeUrl), ...extra])];
}

function toCardProduct(row) {
  const productId = normalizePositiveId(row?.id);
  const amountMinor = Math.floor(Number(row?.amount || 0));
  const currency = normalizeCurrency(row?.currency);
  const paymentUrl = safeTributePaymentUrl(row?.webLink);
  const telegramLink = safeTributeTelegramUrl(row?.link);
  if (!productId || !amountMinor || !currency || !paymentUrl) return null;

  const credits = creditsForProduct(row, amountMinor, currency);
  if (!credits) return null;

  return {
    productId: Number(productId),
    name: String(row?.name || "Vexa Credits").slice(0, 120),
    description: String(row?.description || "").slice(0, 240),
    credits,
    amountMinor,
    currency,
    paymentUrl,
    telegramLink,
  };
}

function creditsForProduct(row, amountMinor, currency) {
  const paymentUrl = normalizeUrl(safeTributePaymentUrl(row?.webLink));
  if (paymentUrl === normalizeUrl("https://web.tribute.tg/p/Cdn")) return 20000;

  const explicit = parseCredits(`${row?.name || ""} ${row?.description || ""}`);
  if (explicit) return explicit;

  if (currency === "usd") {
    const packageMatch = Object.values(MINI_APP_STAR_PACKAGES).find((pack) =>
      Math.round(Number(pack?.usd || 0) * 100) === amountMinor
    );
    if (packageMatch) return Number(packageMatch.totalCredits || 0);

    const usd = amountMinor / 100;
    const rawCredits = (usd / CUSTOM_STARS_USD_PER_1000_CREDITS) * 1000;
    return Math.max(1000, Math.round(rawCredits / 1000) * 1000);
  }

  // For EUR/RUB products, put the exact credit amount in the Tribute product name/description.
  return 0;
}

function parseCredits(text) {
  const clean = String(text || "").replace(/\u00a0/g, " ");
  const match = clean.match(/([0-9][0-9\s,.]{0,14})\s*(?:vexa\s*)?credits?\b/i);
  if (!match) return 0;
  const digits = match[1].replace(/[^0-9]/g, "");
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 && value <= 10000000 ? value : 0;
}

function resolveRequestedProduct(products, body) {
  const productId = normalizePositiveId(body?.productId);
  if (productId) return products.find((item) => Number(item.productId) === Number(productId)) || null;

  // Compatibility with the previous client while caches roll over.
  const currency = normalizeCurrency(body?.currency) || "usd";
  const requestedCredits = Math.floor(Number(body?.credits || 0));
  if (requestedCredits > 0) {
    return products.find((item) => item.currency === currency && item.credits === requestedCredits) || null;
  }
  const packageId = String(body?.packageId || "").trim();
  if (packageId && MINI_APP_STAR_PACKAGES[packageId]) {
    const credits = Number(MINI_APP_STAR_PACKAGES[packageId].totalCredits || 0);
    return products.find((item) => item.currency === currency && item.credits === credits) || null;
  }
  return null;
}

function uniqueCurrencies(products) {
  const meta = {
    usd: { code: "usd", label: "USD", symbol: "$" },
    eur: { code: "eur", label: "EUR", symbol: "€" },
    rub: { code: "rub", label: "RUB", symbol: "₽" },
  };
  const seen = new Set();
  const result = [];
  for (const product of products) {
    if (seen.has(product.currency)) continue;
    seen.add(product.currency);
    result.push(meta[product.currency] || { code: product.currency, label: product.currency.toUpperCase(), symbol: "" });
  }
  return result;
}

async function ensureTributeTables(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS tribute_payments (" +
      "order_uuid TEXT PRIMARY KEY, user_id TEXT NOT NULL, package_id TEXT, credits INTEGER NOT NULL, " +
      "amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'usd', status TEXT NOT NULL DEFAULT 'pending', " +
      "payment_url TEXT, credited_at TEXT, refunded_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tribute_payments_user_created ON tribute_payments (user_id, created_at DESC)"
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS tribute_digital_purchases (" +
      "purchase_id TEXT PRIMARY KEY, transaction_id TEXT, product_id INTEGER NOT NULL, user_id TEXT NOT NULL, " +
      "product_name TEXT, credits INTEGER NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, " +
      "status TEXT NOT NULL DEFAULT 'paid', credited_at TEXT, refunded_at TEXT, purchase_created_at TEXT, " +
      "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tribute_digital_user_product ON tribute_digital_purchases (user_id, product_id, created_at DESC)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tribute_digital_transaction ON tribute_digital_purchases (transaction_id)"
    ),
  ]);
}

async function readTributeIntent(env, orderUuid, userId = null) {
  const sql = userId == null
    ? "SELECT * FROM tribute_payments WHERE order_uuid = ?"
    : "SELECT * FROM tribute_payments WHERE order_uuid = ? AND user_id = ?";
  const statement = env.DB.prepare(sql);
  return userId == null
    ? statement.bind(orderUuid).first()
    : statement.bind(orderUuid, String(userId)).first();
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

function normalizePositiveId(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return "";
  const valueNumber = Number(text);
  return Number.isSafeInteger(valueNumber) && valueNumber > 0 ? text : "";
}

function normalizeOptionalId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

function productIdFromPackageId(value) {
  const match = String(value || "").match(/^digital:(\d+)/);
  return match ? Number(match[1]) : 0;
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toLowerCase();
  return currency === "usd" || currency === "eur" || currency === "rub" ? currency : "";
}

function safeTributePaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "web.tribute.tg") return "";
    if (!/^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeTributeTelegramUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || (url.hostname !== "t.me" && url.hostname !== "telegram.me")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function tributeApiError(data, fallback) {
  const message = data?.message || data?.error || data?.detail?.message || data?.detail;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
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
