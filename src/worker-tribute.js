import worker from "./worker-with-media.js";
import {
  getTributeDigitalProductsState,
  handleTributeMiniAppRequest,
  handleTributeWebhook,
  isTributeMiniAppRequest,
  isTributeWebhookRequest,
} from "./tribute-payments.js";
import { TRIBUTE_PAYMENTS_INTEGRATION_JS } from "./mini-app/tribute-payments-client.js";

const TRIBUTE_UI_VERSION = "20260818-9";
const TRIBUTE_PRODUCTS_API = "https://tribute.tg/api/v1/products";
const CONFIGURED_VEXA_PRODUCT_LINKS = new Set([
  "https://web.tribute.tg/p/CcQ",
]);

export { AiCodingWorkflow } from "./worker-with-media.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const tributeEnv = normalizeTributeEnv(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/tribute/health") {
      const [state, diagnostics] = await Promise.all([
        getTributeDigitalProductsState(tributeEnv, { force: true }),
        getTributeProductDiagnostics(tributeEnv),
      ]);
      return json({
        ok: true,
        mode: "digital_products",
        configured: Boolean(tributeApiKey(tributeEnv)),
        ready: Boolean(state.ready),
        productCount: Array.isArray(state.products) ? state.products.length : 0,
        products: state.products || [],
        error: state.error || null,
        diagnostics,
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

async function getTributeProductDiagnostics(env) {
  const key = tributeApiKey(env);
  if (!key) return { ok: false, error: "api_key_missing", total: 0, rows: [] };

  let response;
  let data;
  try {
    response = await fetch(`${TRIBUTE_PRODUCTS_API}?page=1&size=100&type=digital&desc=true`, {
      method: "GET",
      headers: { "Api-Key": key, "Accept": "application/json" },
    });
    data = await response.json().catch(() => ({}));
  } catch {
    return { ok: false, error: "tribute_unreachable", total: 0, rows: [] };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `tribute_http_${response.status}`,
      total: 0,
      rows: [],
    };
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    ok: true,
    total: rows.length,
    rows: rows.map((row) => diagnoseProduct(row)),
  };
}

function diagnoseProduct(row) {
  const type = String(row?.type || "").toLowerCase();
  const status = String(row?.status || "").toLowerCase();
  const acceptCards = row?.acceptCards === true;
  const webLink = normalizeDiagnosticUrl(row?.webLink);
  const isConfiguredLink = CONFIGURED_VEXA_PRODUCT_LINKS.has(webLink);
  const name = String(row?.name || "").slice(0, 120);
  const description = String(row?.description || "").slice(0, 180);
  const text = `${name} ${description}`.toLowerCase();
  const matchesVexaText = text.includes("vexa") && text.includes("credit");
  const reasons = [];

  if (type !== "digital") reasons.push(`type:${type || "missing"}`);
  if (isConfiguredLink) {
    if (status !== "approved" && status !== "new") reasons.push(`status:${status || "missing"}`);
  } else if (status !== "approved") {
    reasons.push(`status:${status || "missing"}`);
  }
  if (!acceptCards) reasons.push("acceptCards:false");
  if (!webLink) reasons.push("webLink:invalid_or_missing");
  if (webLink && !isConfiguredLink && !matchesVexaText) reasons.push("not_vexa_product");

  return {
    id: Number(row?.id || 0) || null,
    type: type || null,
    status: status || null,
    acceptCards,
    amount: Number(row?.amount || 0) || null,
    currency: String(row?.currency || "").toLowerCase() || null,
    webLink: webLink || null,
    configuredLink: isConfiguredLink,
    matchesVexaText,
    eligible: reasons.length === 0,
    rejectedBy: reasons,
  };
}

function normalizeDiagnosticUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function tributeMiniAppIntegrationSource() {
  // Tribute's card checkout owns its Telegram OAuth flow. Let the original
  // integration use Telegram.WebApp.openLink() so oauth.telegram.org runs in
  // the external browser context it expects instead of inside our Mini App WebView.
  return TRIBUTE_PAYMENTS_INTEGRATION_JS;
}

async function injectTributeIntoMiniAppBundle(response) {
  if (!response || !response.ok) return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const integration =
    "\n;/* Vexa Tribute UI " + TRIBUTE_UI_VERSION + " */\n" +
    tributeMiniAppIntegrationSource() +
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
