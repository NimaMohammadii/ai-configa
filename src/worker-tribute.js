import worker from "./worker-with-media.js";
import {
  handleTributeMiniAppRequest,
  handleTributeWebhook,
  isTributeMiniAppRequest,
  isTributeWebhookRequest,
} from "./tribute-payments.js";
import { TRIBUTE_PAYMENTS_INTEGRATION_JS } from "./mini-app/tribute-payments-client.js";

const TRIBUTE_UI_VERSION = "20260816-1";
const KNOWN_TRIBUTE_SHOP_EVENTS = new Set([
  "shop_order",
  "shop_order_refunded",
  "shop_order_payment_failed",
]);

export { AiCodingWorkflow } from "./worker-with-media.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const tributeEnv = normalizeTributeEnv(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/tribute/health") {
      return json({
        ok: true,
        configured: Boolean(tributeApiKey(tributeEnv)),
        uiVersion: TRIBUTE_UI_VERSION,
      });
    }

    if (isTributeWebhookRequest(request)) {
      const compatibilityResponse = await handleTributeWebhookCompatibility(request, tributeEnv);
      if (compatibilityResponse) return compatibilityResponse;
      return handleTributeWebhook(request, tributeEnv);
    }

    if (isTributeMiniAppRequest(request)) {
      return handleTributeMiniAppRequest(request, tributeEnv);
    }

    const response = await worker.fetch(request, tributeEnv, ctx);

    // Load Tribute through the same external JS bundle the Mini App already uses.
    // This is more reliable in Telegram WebViews than injecting a separate inline
    // script into the HTML document and keeps one UI execution path.
    if (request.method === "GET" && url.pathname === "/mini-app/app.js") {
      return injectTributeIntoMiniAppBundle(response);
    }

    return response;
  },
};

async function handleTributeWebhookCompatibility(request, env) {
  const key = tributeApiKey(env);
  if (!key) {
    return json({ error: "Tribute API key is not configured in this Worker" }, 503);
  }

  const rawBody = await request.clone().text();
  const signature = String(request.headers.get("trbt-signature") || "").trim();
  if (!signature || !(await verifyTributeSignature(rawBody, signature, key))) {
    return json({ error: "Invalid Tribute signature" }, 401);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid webhook data" }, 400);
  }

  const eventName = String(event?.name || "").trim();
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const orderUuid = String(payload.uuid || "").trim().toLowerCase();

  // Tribute's dashboard test request is signed but is not guaranteed to point
  // at a real order created by this app. Acknowledge signed test/unknown events.
  if (!KNOWN_TRIBUTE_SHOP_EVENTS.has(eventName) || !orderUuid) {
    return json({ status: "ok" });
  }

  // A signed sample order from Tribute's Test Request can carry a dummy UUID.
  // Only real orders created by this app exist in tribute_payments and should
  // continue into the normal settlement/refund handler.
  try {
    const row = await env.DB.prepare(
      "SELECT order_uuid FROM tribute_payments WHERE order_uuid = ? LIMIT 1"
    ).bind(orderUuid).first();
    if (!row) return json({ status: "ok" });
  } catch (error) {
    // The table may not exist before the first real checkout; Test Request
    // should still be acknowledged after its signature has been verified.
    if (isMissingTributeTable(error)) return json({ status: "ok" });
    throw error;
  }

  return null;
}

function normalizeTributeEnv(env) {
  if (tributeApiKey(env)) return env;

  const alias = [
    env?.TRIBUTE_API,
    env?.TRIBUTE_KEY,
    env?.TRIBUTE_TOKEN,
    env?.TRBT_API_KEY,
  ].map((value) => String(value || "").trim()).find(Boolean);

  if (!alias) return env;

  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === "TRIBUTE_API_KEY") return alias;
      return Reflect.get(target, property, receiver);
    },
  });
}

function tributeApiKey(env) {
  return String(env?.TRIBUTE_API_KEY || "").trim();
}

async function verifyTributeSignature(rawBody, signature, key) {
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(key),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      ),
      new TextEncoder().encode(rawBody)
    )
  );

  const actual = hexToBytes(signature);
  if (!actual || actual.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected[index] ^ actual[index];
  }
  return diff === 0;
}

function hexToBytes(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function isMissingTributeTable(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("tribute_payments") && message.includes("no such table");
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

async function injectTributeIntoMiniAppBundle(response) {
  if (!response || !response.ok) return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const integration =
    "\n;/* Vexa Tribute UI " + TRIBUTE_UI_VERSION + " */\n" +
    TRIBUTE_PAYMENTS_INTEGRATION_JS +
    "\n";

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Tribute-UI", TRIBUTE_UI_VERSION);

  return new Response(source + integration, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
