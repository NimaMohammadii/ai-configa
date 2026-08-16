import { handleMiniAppRequest as baseHandleMiniAppRequest, isMiniAppRequest } from "./server-original.js";
import { authenticateMiniAppPayload } from "./auth.js";
import { getMiniAppAccessSettings, isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { MINI_APP_STAR_PACKAGES, createCustomStarPackage, applyStarPackageDiscount, starInvoicePayload } from "../stars.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { tgJson } from "../telegram-api.js";
import { APP_NAVIGATION_CSS, APP_NAVIGATION_JS } from "./app-navigation.js";

export { isMiniAppRequest };

export async function handleMiniAppRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && (url.pathname === "/mini-app" || url.pathname === "/mini-app/")) {
    const response = await baseHandleMiniAppRequest(request, env);
    return injectAppNavigation(response);
  }

  if (request.method !== "POST" || url.pathname !== "/mini-app/api/stars-invoice") {
    return baseHandleMiniAppRequest(request, env);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);
    const access = await getMiniAppAccessSettings(env);
    if (access.adminOnly && !(await isAdmin(env, user.id))) {
      return json({ error: "Mini app is updating." }, 423);
    }

    const discount = await getActiveWheelPurchaseDiscount(env, user.id);
    const packageId = String(body.packageId || "").trim();
    let pack = packageId ? MINI_APP_STAR_PACKAGES[packageId] || null : null;

    if (pack) {
      pack = applyStarPackageDiscount(pack, discount);
    } else {
      const credits = Number(body.credits);
      if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) {
        return json({ error: "Choose a credit amount between 1 and 1,000,000." }, 400);
      }
      pack = createCustomStarPackage(credits, discount);
    }

    const invoiceUrl = await tgJson(env, "createInvoiceLink", {
      title: "Vexa Credits",
      description: pack.description,
      payload: starInvoicePayload(pack),
      provider_token: "",
      currency: "XTR",
      prices: [{ label: pack.invoiceLabel, amount: pack.stars }],
    });

    return json({
      invoiceUrl: String(invoiceUrl || ""),
      package: {
        id: pack.id,
        credits: pack.credits,
        bonus: pack.bonus,
        totalCredits: pack.totalCredits,
        stars: pack.stars,
        originalStars: Number(pack.originalStars || pack.stars),
        discountPercent: Number(pack.discountPercent || 0),
        discountExpiresAt: Number(pack.discountExpiresAt || 0),
        usd: pack.usd,
      },
      purchaseDiscount: discount,
      balance: await getBalance(env, user.id),
    });
  } catch (error) {
    return json({ error: error?.message || "Mini app error" }, error?.status || 500);
  }
}

async function injectAppNavigation(response) {
  if (!response.ok) return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const integration =
    '<style id="ttsAppNavigationStyles">' + APP_NAVIGATION_CSS + '</style>' +
    '<script id="ttsAppNavigationScript">' + APP_NAVIGATION_JS + '</script>';
  const html = source.includes("</body>")
    ? source.replace("</body>", integration + "\n</body>")
    : source + integration;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}
