import worker from "./worker-with-media.js";
import {
  handleTributeMiniAppRequest,
  handleTributeWebhook,
  isTributeMiniAppRequest,
  isTributeWebhookRequest,
} from "./tribute-payments.js";
import { TRIBUTE_PAYMENTS_INTEGRATION_JS } from "./mini-app/tribute-payments-client.js";

const TRIBUTE_UI_VERSION = "20260815-1";

export { AiCodingWorkflow } from "./worker-with-media.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    if (isTributeWebhookRequest(request)) {
      return handleTributeWebhook(request, env);
    }

    if (isTributeMiniAppRequest(request)) {
      return handleTributeMiniAppRequest(request, env);
    }

    const response = await worker.fetch(request, env, ctx);
    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app" || url.pathname === "/mini-app/")
    ) {
      return injectTributePayments(response);
    }

    return response;
  },
};

async function injectTributePayments(response) {
  if (!response || !response.ok) return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const fixStyle = '<style id="tributePaymentsFixes">.tribute-card-mark{position:relative}</style>';
  const script =
    '<script id="tributePaymentsIntegration" data-version="' +
    TRIBUTE_UI_VERSION +
    '">' +
    TRIBUTE_PAYMENTS_INTEGRATION_JS.replace(/<\/script/gi, "<\\/script") +
    '</script>';
  const injection = fixStyle + script;
  const html = source.includes("</body>")
    ? source.replace("</body>", injection + "\n</body>")
    : source + injection;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
