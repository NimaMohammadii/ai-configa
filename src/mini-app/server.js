import { handleMiniAppRequest as baseHandleMiniAppRequest, isMiniAppRequest } from "./server-original.js";
import { authenticateMiniAppPayload } from "./auth.js";
import { getMiniAppAccessSettings, hasTrackedUser, isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { buildPreparedReferralShare, getReferralLanguage, getReferralStatus, registerReferralFromStartParam } from "../referrals.js";
import { MINI_APP_STAR_PACKAGES, createCustomStarPackage, applyStarPackageDiscount, starInvoicePayload } from "../stars.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { tgJson } from "../telegram-api.js";
import { handlePaymentHeroImageRequest, isPaymentHeroImageRequest } from "../payment-hero.js";
import { PURCHASE_UI_CSS } from "./purchase-ui-styles.js";
import { REFERRAL_UI_PATCH } from "./referral-ui.js";

export { isMiniAppRequest };

export async function handleMiniAppRequest(request, env) {
  const url = new URL(request.url);

  if (isPaymentHeroImageRequest(request)) {
    return handlePaymentHeroImageRequest(request, env);
  }

  if (request.method === "GET" && (url.pathname === "/mini-app/app.js" || url.pathname === "/mini-app/chat/app.js")) {
    return injectReferralUi(await baseHandleMiniAppRequest(request, env));
  }

  if (request.method === "GET" && url.pathname === "/mini-app/styles.css") {
    return appendPurchaseStyles(await baseHandleMiniAppRequest(request, env));
  }

  if (request.method === "GET" && (url.pathname === "/mini-app" || url.pathname === "/mini-app/")) {
    return stripCreditsHeaderCopy(await baseHandleMiniAppRequest(request, env));
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/session") {
    await registerReferralBeforeFirstSession(request, env).catch((error) => {
      console.error("mini app referral registration failed", error?.message || error);
    });
    return baseHandleMiniAppRequest(request, env);
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/referral-status") {
    try {
      const body = await request.json().catch(() => ({}));
      const user = await authenticateMiniAppPayload(body, env);
      const [status, language] = await Promise.all([
        getReferralStatus(env, user.id),
        getReferralLanguage(env, user),
      ]);
      return json({ ...status, language });
    } catch (error) {
      return json({ error: error?.message || "Mini app error" }, error?.status || 500);
    }
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/referral-share") {
    try {
      const body = await request.json().catch(() => ({}));
      const user = await authenticateMiniAppPayload(body, env);
      const access = await getMiniAppAccessSettings(env);
      if (access.adminOnly && !(await isAdmin(env, user.id))) {
        return json({ error: "Mini app is updating." }, 423);
      }
      return json(await buildPreparedReferralShare(env, user, body.section));
    } catch (error) {
      return json({ error: error?.message || "Mini app error" }, error?.status || 500);
    }
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

async function registerReferralBeforeFirstSession(request, env) {
  const body = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(body, env);
  if (await hasTrackedUser(env, user.id)) return;

  const startParam = signedStartParam(body.initData);
  if (!startParam) return;
  await registerReferralFromStartParam(env, user.id, startParam);
}

function signedStartParam(initData) {
  try {
    return String(new URLSearchParams(String(initData || "")).get("start_param") || "").trim();
  } catch {
    return "";
  }
}

async function injectReferralUi(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const marker = "(function(){";
  if (!source.includes(marker)) return cloneTextResponse(response, source);
  const patched = source.replace(marker, marker + "\n" + REFERRAL_UI_PATCH);
  return cloneTextResponse(response, patched);
}

async function appendPurchaseStyles(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/css")) return response;

  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(source + "\n" + PURCHASE_UI_CSS, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function stripCreditsHeaderCopy(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const html = source.replace("<p>Top up instantly and keep creating.</p>", "");
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cloneTextResponse(response, text) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(text, {
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
