import worker from "./worker-with-media.js";
import {
  getTributeDigitalProductsState,
  handleTributeMiniAppRequest,
  handleTributeWebhook,
  isTributeMiniAppRequest,
  isTributeWebhookRequest,
} from "./tribute-payments.js";
import { TRIBUTE_PAYMENTS_INTEGRATION_JS } from "./mini-app/tribute-payments-client.js";

const TRIBUTE_UI_VERSION = "20260818-3";

export { AiCodingWorkflow } from "./worker-with-media.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const tributeEnv = normalizeTributeEnv(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/tribute/health") {
      const state = await getTributeDigitalProductsState(tributeEnv, { force: true });
      return json({
        ok: true,
        mode: "digital_products",
        configured: Boolean(tributeApiKey(tributeEnv)),
        ready: Boolean(state.ready),
        productCount: Array.isArray(state.products) ? state.products.length : 0,
        products: state.products || [],
        error: state.error || null,
        uiVersion: TRIBUTE_UI_VERSION,
      });
    }

    if (isTributeWebhookRequest(request)) {
      return handleTributeWebhook(request, tributeEnv);
    }

    if (isTributeMiniAppRequest(request)) {
      return handleTributeMiniAppRequest(request, tributeEnv);
    }

    const response = await worker.fetch(request, tributeEnv, ctx);

    if (request.method === "GET" && url.pathname === "/mini-app/app.js") {
      return injectTributeIntoMiniAppBundle(response);
    }

    return response;
  },
};

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