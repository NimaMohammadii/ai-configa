import { handleMiniAppRequest as baseHandleMiniAppRequest, isMiniAppRequest } from "./server-original.js";
import { authenticateMiniAppPayload } from "./auth.js";
import { getMiniAppAccessSettings, hasTrackedUser, isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { buildPreparedReferralShare, getReferralLanguage, getReferralStatus, parseReferralStartParam, registerReferralFromStartParam } from "../referrals.js";
import { MINI_APP_STAR_PACKAGES, createCustomStarPackage, applyStarPackageDiscount, starInvoicePayload } from "../stars.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { tgJson } from "../telegram-api.js";
import { handlePaymentHeroImageRequest, isPaymentHeroImageRequest } from "../payment-hero.js";
import { dynamicPricingPayload, handleUsagePricedImageRequest, isUsagePricedImageRequest } from "../image-usage-pricing.js";
import { PURCHASE_UI_CSS } from "./purchase-ui-styles.js";
import { REFERRAL_UI_PATCH } from "./referral-ui.js";
import { VOICE_INTRO_REFERRAL_UI_PATCH } from "./voice-intro-referral-ui.js";
import { HISTORY_FILE_IDENTITY_PATCH } from "./history-file-identity.js";

export { isMiniAppRequest };

export async function handleMiniAppRequest(request, env) {
  const url = new URL(request.url);

  if (isPaymentHeroImageRequest(request)) {
    return handlePaymentHeroImageRequest(request, env);
  }

  if (isUsagePricedImageRequest(request)) {
    return handleUsagePricedImageRequest(request, env);
  }

  if (request.method === "GET" && url.pathname === "/mini-app/app.js") {
    return injectMiniAppUi(await baseHandleMiniAppRequest(request, env), true);
  }

  if (request.method === "GET" && url.pathname === "/mini-app/chat/app.js") {
    return injectMiniAppUi(await baseHandleMiniAppRequest(request, env), false);
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
    return overrideSessionImagePricing(await baseHandleMiniAppRequest(request, env));
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

async function overrideSessionImagePricing(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || data.locked) return json(data || {}, response.status);
  return json({ ...data, imagePricing: dynamicPricingPayload(0) }, response.status);
}

async function registerReferralBeforeFirstSession(request, env) {
  const body = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(body, env);
  if (await hasTrackedUser(env, user.id)) return;

  const startParam = signedStartParam(body.initData);
  if (!startParam) return;

  const referral = parseReferralStartParam(startParam);
  if (!referral || !(await hasTrackedUser(env, referral.referrerUserId))) return;

  await registerReferralFromStartParam(env, user.id, startParam);
}

function signedStartParam(initData) {
  try {
    return String(new URLSearchParams(String(initData || "")).get("start_param") || "").trim();
  } catch {
    return "";
  }
}

async function injectMiniAppUi(response, includeHistoryIdentity) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  if (includeHistoryIdentity) source = applyUsagePricedImageUi(source);
  const marker = "(function(){";
  if (!source.includes(marker)) return cloneTextResponse(response, source);
  const injection =
    REFERRAL_UI_PATCH +
    (includeHistoryIdentity ? "\n" + VOICE_INTRO_REFERRAL_UI_PATCH + "\n" + HISTORY_FILE_IDENTITY_PATCH : "");
  const patched = source.replace(marker, marker + "\n" + injection);
  return cloneTextResponse(response, patched);
}

function applyUsagePricedImageUi(source) {
  const replacements = [
    [
      "var imagePricing={baseCost:188,activeCost:188,discountEnabled:false,discountCost:0,discountUntil:0,serverNow:Math.floor(Date.now()/1000),discountPercent:0};",
      "var imagePricing={mode:'api_usage',baseCost:1,activeCost:1,lastCost:0,markupRate:.30,discountEnabled:false,discountCost:0,discountUntil:0,serverNow:Math.floor(Date.now()/1000),discountPercent:0};",
    ],
    [
      "function updateImagePricing(data){if(data){imagePricing={baseCost:Number(data.baseCost)||188,activeCost:Number(data.activeCost)||Number(data.baseCost)||188,discountEnabled:!!data.discountEnabled,discountCost:Number(data.discountCost)||0,discountUntil:Number(data.discountUntil)||0,serverNow:Number(data.serverNow)||Math.floor(Date.now()/1000),discountPercent:Number(data.discountPercent)||0};imageOfferClockOffset=imagePricing.serverNow-Date.now()/1000}updateImageCreditNote();syncImageOfferTimer()}",
      "function updateImagePricing(data){if(data&&String(data.mode||'')==='api_usage'){imagePricing={mode:'api_usage',baseCost:1,activeCost:1,lastCost:Math.max(0,Number(data.lastCost||data.cost)||0),markupRate:Number(data.markupRate)||.30,discountEnabled:false,discountCost:0,discountUntil:0,serverNow:Number(data.serverNow)||Math.floor(Date.now()/1000),discountPercent:0};imageOfferClockOffset=imagePricing.serverNow-Date.now()/1000}else if(!imagePricing||imagePricing.mode!=='api_usage'){imagePricing={mode:'api_usage',baseCost:1,activeCost:1,lastCost:0,markupRate:.30,discountEnabled:false,discountCost:0,discountUntil:0,serverNow:Math.floor(Date.now()/1000),discountPercent:0}}updateImageCreditNote();stopImageOfferTimer()}",
    ],
    [
      "function updateImageCreditNote(){var node=q('imageCreditNote');if(!node)return;node.dir='ltr';var base=Number(imagePricing.baseCost)||188,active=Number(imagePricing.activeCost)||base,remaining=imageOfferRemaining();if(imagePricing.discountEnabled&&(Number(imagePricing.discountUntil)<=0||remaining>0)&&active<base){var percent=Number(imagePricing.discountPercent)||Math.round((base-active)/base*100),countdown=Number(imagePricing.discountUntil)>0?'<span class=\"discount-countdown\"><small>Ends in</small><strong>'+formatOfferTime(remaining)+'</strong></span>':'';node.classList.add('has-discount');node.innerHTML='<span class=\"discount-badge\">LIMITED RATE</span><span class=\"old-price\">'+base.toLocaleString('en-US')+'</span><strong>'+active.toLocaleString('en-US')+' credits</strong><span class=\"discount-percent\">-'+percent+'%</span>'+countdown}else{if(imagePricing.discountEnabled&&Number(imagePricing.discountUntil)>0&&remaining<=0)endImageOffer();node.classList.remove('has-discount');node.textContent=base.toLocaleString('en-US')+' credits per image'}}",
      "function updateImageCreditNote(){var node=q('imageCreditNote');if(!node)return;node.dir='ltr';node.classList.remove('has-discount');var last=Math.max(0,Number(imagePricing&&imagePricing.lastCost)||0);node.textContent=last?last.toLocaleString('en-US')+' credits used':''}",
    ],
    [
      "var imageCost=Number(imagePricing.activeCost)||188;if(availableCredits!==null&&availableCredits<imageCost)return toast('Not enough credits · Image creation costs '+imageCost+' credits');",
      "if(availableCredits!==null&&availableCredits<1)return toast('Not enough credits');",
    ],
  ];

  let patched = source;
  for (const [before, after] of replacements) {
    if (!patched.includes(before)) {
      console.error("usage-priced image UI patch target missing");
      continue;
    }
    patched = patched.replace(before, after);
  }
  return patched;
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
