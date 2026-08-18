import { getBalance } from "./credits.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { getTributeDigitalProductsState } from "./tribute-payments.js";
import { requireDb } from "./state.js";

const STRIPE_CHECKOUT_API = "https://api.stripe.com/v1/checkout/sessions";
const TOKEN_TTL_MS = 15 * 60 * 1000;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function vexaCardCheckoutConfigured(env) {
  return Boolean(stripeSecretKey(env) && stripeWebhookSecret(env));
}

export function isVexaCardCheckoutRequest(request) {
  const path = new URL(request.url).pathname;
  return path === "/mini-app/api/vexa-card-checkout-config" ||
    path === "/mini-app/api/vexa-card-checkout" ||
    path === "/pay/stripe/webhook" ||
    path.startsWith("/pay/");
}

export async function handleVexaCardCheckoutRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/pay/stripe/webhook") {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    return handleStripeWebhook(request, env);
  }

  try {
    if (path === "/mini-app/api/vexa-card-checkout-config") {
      if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
      const body = await request.json().catch(() => ({}));
      await authenticateMiniAppPayload(body, env);
      return json({
        ok: true,
        available: vexaCardCheckoutConfigured(env),
        provider: vexaCardCheckoutConfigured(env) ? "stripe" : null,
      });
    }

    if (path === "/mini-app/api/vexa-card-checkout") {
      if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
      return createOneTimeCheckout(request, env);
    }

    const route = parsePayRoute(path);
    if (!route) return text("Not Found", 404);

    if (route.action === "page" && request.method === "GET") {
      return renderCheckoutPage(request, env, route.token);
    }
    if (route.action === "start" && request.method === "POST") {
      return startProviderCheckout(request, env, route.token);
    }
    if (route.action === "status" && request.method === "GET") {
      return checkoutStatus(env, route.token);
    }
    return text("Method Not Allowed", 405);
  } catch (error) {
    console.error("Vexa card checkout failed", path, error?.stack || error);
    if (path.startsWith("/pay/")) {
      return json({ error: publicError(error) }, error?.status || 500);
    }
    return json({ error: publicError(error) }, error?.status || 500);
  }
}

async function createOneTimeCheckout(request, env) {
  if (!vexaCardCheckoutConfigured(env)) {
    throw httpError("Vexa card checkout is not configured yet.", 503);
  }

  const body = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(body, env);
  const productId = normalizePositiveId(body?.productId);
  if (!productId) throw httpError("Card pack not found.", 400);

  const state = await getTributeDigitalProductsState(env, { force: true });
  const product = Array.isArray(state.products)
    ? state.products.find((item) => Number(item?.productId) === Number(productId))
    : null;
  if (!product) throw httpError("Card pack not found.", 400);

  const credits = Math.floor(Number(product.credits || 0));
  const amount = Math.floor(Number(product.amountMinor || 0));
  const currency = String(product.currency || "").trim().toLowerCase();
  if (!Number.isSafeInteger(credits) || credits <= 0 || !Number.isSafeInteger(amount) || amount <= 0) {
    throw httpError("Card pack is invalid.", 400);
  }
  // The current Vexa card catalog is USD. Keep this explicit so currencies with
  // different minor-unit rules can never be charged using an accidental mapping.
  if (currency !== "usd") throw httpError("External card checkout currently supports USD packs only.", 400);

  requireDb(env);
  await ensureCheckoutTable(env);
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const publicId = crypto.randomUUID().toLowerCase();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    "INSERT INTO vexa_card_checkout_sessions " +
    "(public_id, token_hash, user_id, product_id, credits, amount, currency, status, provider, expires_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'created', 'stripe', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(
    publicId,
    tokenHash,
    String(user.id),
    String(productId),
    credits,
    amount,
    currency,
    expiresAt,
  ).run();

  const origin = new URL(request.url).origin;
  return json({
    ok: true,
    checkoutId: publicId,
    checkoutUrl: `${origin}/pay/${token}`,
    statusUrl: `${origin}/pay/${token}/status`,
    credits,
    amountMinor: amount,
    currency,
    expiresAt,
  });
}

async function renderCheckoutPage(request, env, token) {
  requireDb(env);
  await ensureCheckoutTable(env);
  let row = await readSessionByToken(env, token);
  if (!row) return html(checkoutErrorPage("Checkout link not found", "This payment link is invalid or has already been removed."), 404);
  row = await expireIfNeeded(env, row);

  const configured = vexaCardCheckoutConfigured(env);
  const status = String(row.status || "created");
  const canPay = configured && status !== "paid" && status !== "credited" && status !== "refunded" && status !== "expired";
  const amount = money(row.amount, row.currency);
  const credits = Math.max(0, Number(row.credits || 0)).toLocaleString("en-US");
  const statusUrl = `/pay/${encodeURIComponent(token)}/status`;
  const startUrl = `/pay/${encodeURIComponent(token)}/start`;
  const result = new URL(request.url).searchParams.get("result") || "";

  return html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Vexa · Secure checkout</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif}body{min-height:100dvh;display:grid;place-items:center;padding:24px}.shell{width:min(100%,440px)}.brand{font-size:13px;font-weight:800;letter-spacing:.18em;margin:0 0 22px;color:rgba(255,255,255,.72)}.card{border:1px solid rgba(255,255,255,.11);border-radius:28px;padding:24px;background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025));box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 26px 70px rgba(0,0,0,.4)}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.12em;color:rgba(255,255,255,.38)}h1{margin:8px 0 0;font-size:27px;letter-spacing:-.055em}.pack{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:28px 0;padding:18px 0;border-top:1px solid rgba(255,255,255,.09);border-bottom:1px solid rgba(255,255,255,.09)}.pack strong{display:block;font-size:22px;letter-spacing:-.045em}.pack small{display:block;margin-top:5px;color:rgba(255,255,255,.4);font-size:11px}.price{text-align:right}.price strong{font-size:21px}.pay{width:100%;height:52px;border:0;border-radius:16px;background:#fff;color:#050505;font-size:15px;font-weight:800;cursor:pointer;transition:transform .16s ease,opacity .16s ease}.pay:active{transform:scale(.985)}.pay:disabled{opacity:.45;cursor:default}.state{display:none;margin-top:14px;padding:14px 15px;border-radius:15px;background:rgba(255,255,255,.055);font-size:12px;line-height:1.5;color:rgba(255,255,255,.66)}.state.show{display:block}.state strong{color:#fff}.foot{margin:16px 4px 0;text-align:center;font-size:10px;line-height:1.6;color:rgba(255,255,255,.34)}.dot{color:#fff}.spinner{display:inline-block;width:11px;height:11px;margin-right:7px;border:1.5px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;vertical-align:-1px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<main class="shell">
<div class="brand">VEXA</div>
<section class="card">
<div class="eyebrow">SECURE ONE-TIME CHECKOUT</div>
<h1>Buy Vexa credits</h1>
<div class="pack"><div><strong>${escapeHtml(credits)} credits</strong><small>Added automatically after payment</small></div><div class="price"><strong>${escapeHtml(amount)}</strong><small>${escapeHtml(String(row.currency || "usd").toUpperCase())}</small></div></div>
<button id="payButton" class="pay" type="button" ${canPay ? "" : "disabled"}>${status === "paid" || status === "credited" ? "Payment complete" : status === "refunded" ? "Payment refunded" : status === "expired" ? "Link expired" : configured ? "Continue to card payment" : "Checkout unavailable"}</button>
<div id="state" class="state ${result === "success" || status === "paid" || status === "credited" ? "show" : ""}">${result === "success" || status === "paid" || status === "credited" ? "<strong>Checking payment…</strong> Your credits will appear automatically." : ""}</div>
</section>
<p class="foot"><span class="dot">●</span> Your card details are handled by the payment provider. Vexa never receives your card number or CVV.</p>
</main>
<script>
(function(){
  const pay=document.getElementById('payButton');
  const state=document.getElementById('state');
  const startUrl=${JSON.stringify(startUrl)};
  const statusUrl=${JSON.stringify(statusUrl)};
  const initialResult=${JSON.stringify(result)};
  let busy=false;
  function show(message){state.innerHTML=message;state.classList.add('show')}
  async function status(){
    try{
      const response=await fetch(statusUrl,{cache:'no-store'});const data=await response.json();
      if(!response.ok)return;
      if(data.credited){pay.disabled=true;pay.textContent='Credits added';show('<strong>Payment successful.</strong> '+Number(data.credits||0).toLocaleString('en-US')+' credits were added to your Vexa balance.');return 'done'}
      if(data.status==='paid'){pay.disabled=true;pay.textContent='Payment received';show('<strong>Payment received.</strong> Adding credits…');return 'wait'}
      if(data.status==='refunded'){pay.disabled=true;pay.textContent='Payment refunded';show('<strong>Payment refunded.</strong>');return 'done'}
      if(data.status==='expired'){pay.disabled=true;pay.textContent='Link expired';show('<strong>This checkout link expired.</strong> Return to Vexa and create a new one.');return 'done'}
    }catch(error){}
    return 'wait';
  }
  async function poll(){for(let i=0;i<16;i++){const value=await status();if(value==='done')return;await new Promise(r=>setTimeout(r,1000))}}
  pay.addEventListener('click',async function(){
    if(busy||pay.disabled)return;busy=true;pay.disabled=true;pay.innerHTML='<span class="spinner"></span>Opening secure checkout';
    try{const response=await fetch(startUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok||!data.url)throw new Error(data.error||'Could not start checkout');window.location.assign(data.url)}
    catch(error){busy=false;pay.disabled=false;pay.textContent='Try again';show('<strong>Checkout could not start.</strong> '+String(error&&error.message||'Please try again.'))}
  });
  if(initialResult==='success')poll();else status();
})();
</script>
</body>
</html>`);
}

async function startProviderCheckout(request, env, token) {
  if (!vexaCardCheckoutConfigured(env)) throw httpError("Card checkout is not configured.", 503);
  requireDb(env);
  await ensureCheckoutTable(env);
  let row = await readSessionByToken(env, token);
  if (!row) throw httpError("Checkout link not found.", 404);
  row = await expireIfNeeded(env, row);
  if (String(row.status) === "expired") throw httpError("Checkout link expired.", 410);
  if (String(row.status) === "refunded") throw httpError("This payment was refunded.", 409);
  if (row.credited_at || String(row.status) === "paid") {
    return json({ ok: true, paid: true, status: "paid" });
  }
  if (row.provider_url && row.provider_session_id) {
    return json({ ok: true, url: row.provider_url, checkoutId: row.public_id });
  }

  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/pay/${encodeURIComponent(token)}?result=success`;
  const cancelUrl = `${origin}/pay/${encodeURIComponent(token)}?result=cancel`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", String(row.public_id));
  params.set("payment_method_types[0]", "card");
  params.set("line_items[0][price_data][currency]", String(row.currency));
  params.set("line_items[0][price_data][unit_amount]", String(row.amount));
  params.set("line_items[0][price_data][product_data][name]", `${Number(row.credits).toLocaleString("en-US")} Vexa Credits`);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[vexa_checkout_id]", String(row.public_id));
  params.set("payment_intent_data[metadata][vexa_checkout_id]", String(row.public_id));

  let response;
  let data;
  try {
    response = await fetch(STRIPE_CHECKOUT_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey(env)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `vexa-card-${row.public_id}`,
      },
      body: params.toString(),
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    console.error("Stripe checkout create request failed", error?.message || error);
    throw httpError("Could not reach the card payment provider.", 502);
  }

  if (!response.ok || !data?.id || !isStripeCheckoutUrl(data?.url)) {
    console.error("Stripe checkout create failed", response.status, data?.error?.type || "", data?.error?.code || "", data?.error?.message || "");
    throw httpError("Could not start secure card checkout.", 502);
  }

  await env.DB.prepare(
    "UPDATE vexa_card_checkout_sessions SET provider_session_id = ?, provider_url = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP " +
    "WHERE public_id = ? AND credited_at IS NULL AND refunded_at IS NULL"
  ).bind(String(data.id), String(data.url), String(row.public_id)).run();

  return json({ ok: true, url: String(data.url), checkoutId: row.public_id });
}

async function checkoutStatus(env, token) {
  requireDb(env);
  await ensureCheckoutTable(env);
  let row = await readSessionByToken(env, token);
  if (!row) throw httpError("Checkout link not found.", 404);
  row = await expireIfNeeded(env, row);
  const credited = Boolean(row.credited_at);
  return json({
    ok: true,
    checkoutId: row.public_id,
    status: String(row.status || "created"),
    credited,
    refunded: Boolean(row.refunded_at),
    credits: Number(row.credits || 0),
    balance: credited ? await getBalance(env, row.user_id) : null,
  });
}

async function handleStripeWebhook(request, env) {
  if (!stripeWebhookSecret(env)) return json({ error: "Stripe webhook is not configured" }, 503);
  const rawBody = await request.text();
  const signature = String(request.headers.get("Stripe-Signature") || "").trim();
  if (!signature || !(await verifyStripeSignature(rawBody, signature, stripeWebhookSecret(env)))) {
    console.warn("Rejected Stripe webhook with invalid signature");
    return json({ error: "Invalid Stripe signature" }, 401);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid webhook payload" }, 400);
  }

  try {
    const type = String(event?.type || "");
    const object = event?.data?.object && typeof event.data.object === "object" ? event.data.object : {};
    if ((type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") && String(object.payment_status || "") === "paid") {
      await applyStripeCheckoutPayment(env, object);
    } else if (type === "checkout.session.expired") {
      await markStripeCheckoutExpired(env, object);
    } else if (type === "charge.refunded" && (object.refunded === true || Number(object.amount_refunded || 0) >= Number(object.amount || 0))) {
      await applyStripeRefund(env, object);
    }
  } catch (error) {
    console.error("Stripe webhook processing failed", event?.type || "", error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }

  return json({ received: true });
}

async function applyStripeCheckoutPayment(env, session) {
  requireDb(env);
  await ensureCheckoutTable(env);
  const checkoutId = String(session?.client_reference_id || session?.metadata?.vexa_checkout_id || "").trim();
  const sessionId = String(session?.id || "").trim();
  if (!checkoutId || !sessionId) throw httpError("Stripe checkout identity mismatch.", 400);

  const row = await env.DB.prepare(
    "SELECT * FROM vexa_card_checkout_sessions WHERE public_id = ? LIMIT 1"
  ).bind(checkoutId).first();
  if (!row) throw httpError("Unknown Vexa checkout.", 400);
  if (row.provider_session_id && String(row.provider_session_id) !== sessionId) {
    throw httpError("Stripe checkout session mismatch.", 400);
  }
  if (Number(session?.amount_total || 0) !== Number(row.amount) || String(session?.currency || "").toLowerCase() !== String(row.currency).toLowerCase()) {
    throw httpError("Stripe checkout amount mismatch.", 400);
  }
  if (row.refunded_at) return;

  const userId = String(row.user_id);
  const paymentIntent = String(session?.payment_intent || "").trim() || null;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(userId),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + COALESCE((" +
      "SELECT credits FROM vexa_card_checkout_sessions WHERE public_id = ? AND credited_at IS NULL AND refunded_at IS NULL" +
      "), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(checkoutId, userId),
    env.DB.prepare(
      "UPDATE vexa_card_checkout_sessions SET status = 'paid', provider_session_id = ?, provider_payment_id = COALESCE(?, provider_payment_id), " +
      "paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
      "WHERE public_id = ? AND refunded_at IS NULL"
    ).bind(sessionId, paymentIntent, checkoutId),
  ]);
}

async function markStripeCheckoutExpired(env, session) {
  requireDb(env);
  await ensureCheckoutTable(env);
  const sessionId = String(session?.id || "").trim();
  const checkoutId = String(session?.client_reference_id || session?.metadata?.vexa_checkout_id || "").trim();
  if (!sessionId && !checkoutId) return;
  if (checkoutId) {
    await env.DB.prepare(
      "UPDATE vexa_card_checkout_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE public_id = ? AND credited_at IS NULL AND refunded_at IS NULL"
    ).bind(checkoutId).run();
  } else {
    await env.DB.prepare(
      "UPDATE vexa_card_checkout_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE provider_session_id = ? AND credited_at IS NULL AND refunded_at IS NULL"
    ).bind(sessionId).run();
  }
}

async function applyStripeRefund(env, charge) {
  requireDb(env);
  await ensureCheckoutTable(env);
  const paymentIntent = String(charge?.payment_intent || "").trim();
  if (!paymentIntent) return;

  const row = await env.DB.prepare(
    "SELECT * FROM vexa_card_checkout_sessions WHERE provider_payment_id = ? LIMIT 1"
  ).bind(paymentIntent).first();
  if (!row || row.refunded_at) return;
  const currency = String(charge?.currency || "").toLowerCase();
  if (currency && currency !== String(row.currency).toLowerCase()) throw httpError("Stripe refund currency mismatch.", 400);
  if (Number(charge?.amount_refunded || 0) < Number(row.amount)) return;

  const userId = String(row.user_id);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_credits (user_id, credits, updated_at, created_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(userId),
    env.DB.prepare(
      "UPDATE user_credits SET credits = MAX(credits - COALESCE((" +
      "SELECT credits FROM vexa_card_checkout_sessions WHERE public_id = ? AND credited_at IS NOT NULL AND refunded_at IS NULL" +
      "), 0), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(String(row.public_id), userId),
    env.DB.prepare(
      "UPDATE vexa_card_checkout_sessions SET status = 'refunded', refunded_at = COALESCE(refunded_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP " +
      "WHERE public_id = ? AND refunded_at IS NULL"
    ).bind(String(row.public_id)),
  ]);
}

async function ensureCheckoutTable(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_card_checkout_sessions (" +
      "public_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, product_id TEXT NOT NULL, " +
      "credits INTEGER NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'usd', status TEXT NOT NULL DEFAULT 'created', " +
      "provider TEXT NOT NULL DEFAULT 'stripe', provider_session_id TEXT, provider_payment_id TEXT, provider_url TEXT, expires_at TEXT NOT NULL, " +
      "paid_at TEXT, credited_at TEXT, refunded_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_vexa_card_checkout_token_hash ON vexa_card_checkout_sessions (token_hash)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_user_created ON vexa_card_checkout_sessions (user_id, created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_provider_session ON vexa_card_checkout_sessions (provider_session_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_provider_payment ON vexa_card_checkout_sessions (provider_payment_id)"),
  ]);
}

async function readSessionByToken(env, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  const tokenHash = await sha256Hex(token);
  return env.DB.prepare(
    "SELECT * FROM vexa_card_checkout_sessions WHERE token_hash = ? LIMIT 1"
  ).bind(tokenHash).first();
}

async function expireIfNeeded(env, row) {
  if (!row) return row;
  const terminal = new Set(["paid", "credited", "refunded", "expired"]);
  if (terminal.has(String(row.status || ""))) return row;
  const expiresAt = Date.parse(String(row.expires_at || ""));
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return row;
  await env.DB.prepare(
    "UPDATE vexa_card_checkout_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE public_id = ? AND credited_at IS NULL AND refunded_at IS NULL"
  ).bind(String(row.public_id)).run();
  return { ...row, status: "expired" };
}

function parsePayRoute(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] !== "pay") return null;
  const token = parts[1];
  if (!TOKEN_RE.test(token)) return null;
  if (parts.length === 2) return { token, action: "page" };
  if (parts.length === 3 && parts[2] === "start") return { token, action: "start" };
  if (parts.length === 3 && parts[2] === "status") return { token, action: "status" };
  return null;
}

async function verifyStripeSignature(rawBody, header, secret) {
  const parts = String(header || "").split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2) || 0);
  if (!Number.isFinite(timestamp) || !timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(digest);
  return signatures.some((signature) => safeEqual(String(signature).toLowerCase(), expected));
}

function stripeSecretKey(env) {
  return String(env?.STRIPE_SECRET_KEY || "").trim();
}

function stripeWebhookSecret(env) {
  return String(env?.STRIPE_WEBHOOK_SECRET || "").trim();
}

function isStripeCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && (url.hostname === "checkout.stripe.com" || url.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return toHex(digest);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function normalizePositiveId(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return "";
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? text : "";
}

function money(minor, currency) {
  const value = Math.max(0, Number(minor || 0)) / 100;
  const code = String(currency || "usd").toLowerCase();
  if (code === "usd") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code.toUpperCase()}`;
}

function checkoutErrorPage(title, copy) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Vexa</title><style>html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}body{min-height:100dvh;display:grid;place-items:center;padding:24px}.box{width:min(100%,420px);padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:rgba(255,255,255,.04)}h1{margin:0 0 9px;font-size:23px}p{margin:0;color:rgba(255,255,255,.5);line-height:1.6;font-size:13px}</style></head><body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function publicError(error) {
  return String(error?.message || "Card checkout error").replace(/\s+/g, " ").trim().slice(0, 220);
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
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function html(value, status = 200) {
  return new Response(value, {
    status,
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function text(value, status = 200) {
  return new Response(String(value || ""), {
    status,
    headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-store" },
  });
}
