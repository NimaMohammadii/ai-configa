import { getMiniAppAccessSettings, isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import {
  MINI_APP_STAR_PACKAGES,
  applyStarPackageDiscount,
  createCustomStarPackage,
  starInvoicePayload,
} from "../stars.js";
import { tgJson } from "../telegram-api.js";
import { TOMAN_MIN_PURCHASE_AMOUNT, TOMAN_PRICE_PER_1000 } from "../ui.js";
import { authenticateMiniAppPayload } from "./auth.js";

const MAX_CUSTOM_CREDITS = 1_000_000;

export async function handleMiniAppDiscountedStarsInvoice(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await assertMiniAppAccess(env, user.id);

    const discount = await getActiveWheelPurchaseDiscount(env, user.id);
    const packageId = String(payload.packageId || "").trim();
    let pack = packageId ? MINI_APP_STAR_PACKAGES[packageId] || null : null;

    if (pack) {
      pack = applyStarPackageDiscount(pack, discount);
    } else {
      const credits = Number(payload.credits);
      if (!Number.isSafeInteger(credits) || credits < 1 || credits > MAX_CUSTOM_CREDITS) {
        return jsonResponse({ error: "Choose a credit amount between 1 and 1,000,000." }, 400);
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

    return jsonResponse({
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
      balance: await getBalance(env, user.id),
    });
  } catch (error) {
    return jsonResponse({ error: publicError(error) }, Number(error?.status || 500));
  }
}

export async function handleMiniAppPurchaseDiscount(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await assertMiniAppAccess(env, user.id);
    const now = Math.floor(Date.now() / 1000);
    const discount = await getActiveWheelPurchaseDiscount(env, user.id, now);
    return jsonResponse({
      discountPercent: Number(discount?.percent || 0),
      discountExpiresAt: Number(discount?.expiresAt || 0),
      serverNow: now,
      tomanPricePer1000: TOMAN_PRICE_PER_1000,
      tomanMinimumAmount: TOMAN_MIN_PURCHASE_AMOUNT,
    });
  } catch (error) {
    return jsonResponse({ error: publicError(error) }, Number(error?.status || 500));
  }
}

async function assertMiniAppAccess(env, userId) {
  const settings = await getMiniAppAccessSettings(env);
  if (!settings.adminOnly || await isAdmin(env, userId)) return;
  const error = new Error("Mini app is updating.");
  error.status = 423;
  throw error;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function publicError(error) {
  return String(error?.message || "Could not start payment").slice(0, 300);
}

function creditPurchaseDiscountBootstrap() {
  const MAX_CUSTOM_CREDITS = 1_000_000;
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = String(tg?.initData || "");
  const packageStars = Object.freeze({
    mini_3000: 36,
    mini_10000: 118,
    mini_18000: 216,
    mini_30000: 360,
  });
  const state = {
    percent: 0,
    expiresAt: 0,
    clockOffset: 0,
    tomanPricePer1000: 39000,
    tomanMinimumAmount: 260000,
    expiryTimer: 0,
    refreshing: false,
  };

  function q(id) { return document.getElementById(id); }
  function format(value) { return Math.max(0, Math.ceil(Number(value) || 0)).toLocaleString("en-US"); }
  function discounted(value, percent) {
    const base = Math.max(1, Math.ceil(Number(value) || 0));
    return percent > 0 ? Math.max(1, Math.ceil(base * (100 - percent) / 100)) : base;
  }
  function now() { return Date.now() / 1000 + state.clockOffset; }
  function activePercent() {
    if (!state.percent || !state.expiresAt || state.expiresAt <= now()) return 0;
    return state.percent;
  }

  async function post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(body || {}), initData }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load purchase discount");
    return data;
  }

  function installStyle() {
    if (q("creditPurchaseDiscountStyle")) return;
    const style = document.createElement("style");
    style.id = "creditPurchaseDiscountStyle";
    style.textContent = `
      .credits-pack-price strong.wheel-discount-price,
      #customStarsValue.wheel-discount-price,
      #tomanAmountValue.wheel-discount-price,
      #tomanOrderAmount.wheel-discount-price {
        display:flex!important;
        align-items:baseline!important;
        justify-content:flex-end!important;
        gap:7px!important;
        flex-wrap:wrap!important;
      }
      .wheel-original-amount {
        color:rgba(255,255,255,.34)!important;
        font-size:.72em!important;
        font-weight:650!important;
        text-decoration:line-through!important;
        text-decoration-thickness:1px!important;
      }
      .wheel-final-amount {
        color:#fff!important;
        font-weight:820!important;
      }
      #tomanAmountValue .wheel-original-amount,
      #tomanOrderAmount .wheel-original-amount { font-size:.7em!important; }
      .credits-pack-price[data-wheel-discount]:after {
        content:attr(data-wheel-discount);
        display:block;
        margin-top:3px;
        color:rgba(255,255,255,.42);
        font-size:7px;
        font-weight:760;
        letter-spacing:.04em;
      }
    `;
    document.head.appendChild(style);
  }

  function priceMarkup(original, finalValue, suffix) {
    return '<span class="wheel-original-amount">' + format(original) + ' ' + suffix + '</span>' +
      '<span class="wheel-final-amount">' + format(finalValue) + ' ' + suffix + '</span>';
  }

  function renderStarPackages() {
    const percent = activePercent();
    document.querySelectorAll('[data-action="buy-credit-package"][data-package-id]').forEach((button) => {
      const id = String(button.getAttribute("data-package-id") || "");
      const base = Number(packageStars[id] || 0);
      const price = button.querySelector(".credits-pack-price");
      const strong = price?.querySelector("strong");
      if (!base || !strong || !price) return;
      if (percent > 0) {
        const finalStars = discounted(base, percent);
        strong.classList.add("wheel-discount-price");
        strong.innerHTML = priceMarkup(base, finalStars, "★");
        price.setAttribute("data-wheel-discount", percent + "% wheel discount");
      } else {
        strong.classList.remove("wheel-discount-price");
        strong.innerHTML = format(base) + ' <i>★</i>';
        price.removeAttribute("data-wheel-discount");
      }
    });
  }

  function customCredits() {
    const input = q("customCreditsInput");
    return Math.min(MAX_CUSTOM_CREDITS, Math.max(1, Math.floor(Number(input?.value) || 0)));
  }

  function renderCustomStars() {
    const input = q("customCreditsInput");
    const value = q("customStarsValue");
    const button = q("customCreditsBuy");
    if (!input || !value || !button) return;
    const credits = customCredits();
    const baseStars = Math.max(80, Math.ceil(credits * 12 / 1000));
    const percent = activePercent();
    const finalStars = discounted(baseStars, percent);
    if (percent > 0) {
      value.classList.add("wheel-discount-price");
      value.innerHTML = priceMarkup(baseStars, finalStars, "Stars");
    } else {
      value.classList.remove("wheel-discount-price");
      value.textContent = format(baseStars) + " Stars";
    }
    const span = button.querySelector("span");
    if (span) span.textContent = "Continue with " + format(finalStars) + " Stars";
  }

  function tomanOrder() {
    const input = q("tomanCreditsInput");
    const credits = Math.min(MAX_CUSTOM_CREDITS, Math.max(1, Math.floor(Number(input?.value) || 0)));
    const calculated = Math.ceil(credits / 1000 * state.tomanPricePer1000);
    const original = Math.max(state.tomanMinimumAmount, calculated);
    const percent = activePercent();
    return { original, amount: discounted(original, percent), percent };
  }

  function renderToman() {
    const amountNode = q("tomanAmountValue");
    if (!amountNode) return;
    const order = tomanOrder();
    const badge = q("tomanDiscountBadge");
    if (order.percent > 0) {
      amountNode.classList.add("wheel-discount-price");
      amountNode.innerHTML = priceMarkup(order.original, order.amount, "تومان");
      if (badge) {
        badge.textContent = format(order.percent) + "% تخفیف گردونه";
        badge.classList.add("show");
        badge.setAttribute("aria-hidden", "false");
      }
    } else {
      amountNode.classList.remove("wheel-discount-price");
      amountNode.textContent = format(order.original) + " تومان";
      if (badge) {
        badge.textContent = "";
        badge.classList.remove("show");
        badge.setAttribute("aria-hidden", "true");
      }
    }

    const orderAmount = q("tomanOrderAmount");
    if (orderAmount && q("tomanCheckout")?.getAttribute("data-step") === "receipt") {
      if (order.percent > 0) {
        orderAmount.classList.add("wheel-discount-price");
        orderAmount.innerHTML = priceMarkup(order.original, order.amount, "تومان");
      } else {
        orderAmount.classList.remove("wheel-discount-price");
        orderAmount.textContent = format(order.amount) + " تومان";
      }
    }
  }

  function renderAll() {
    installStyle();
    renderStarPackages();
    renderCustomStars();
    renderToman();
  }

  function scheduleExpiry() {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = 0;
    if (!state.expiresAt) return;
    const milliseconds = Math.max(0, Math.ceil((state.expiresAt - now()) * 1000)) + 250;
    if (milliseconds <= 250) {
      state.percent = 0;
      state.expiresAt = 0;
      renderAll();
      return;
    }
    state.expiryTimer = setTimeout(() => {
      state.percent = 0;
      state.expiresAt = 0;
      renderAll();
    }, milliseconds);
  }

  async function refreshDiscount() {
    if (!initData || state.refreshing) return;
    state.refreshing = true;
    try {
      const data = await post("/mini-app/api/purchase-discount", {});
      state.percent = Number(data.discountPercent || 0);
      state.expiresAt = Number(data.discountExpiresAt || 0);
      state.clockOffset = Number(data.serverNow || Date.now() / 1000) - Date.now() / 1000;
      state.tomanPricePer1000 = Number(data.tomanPricePer1000 || 39000);
      state.tomanMinimumAmount = Number(data.tomanMinimumAmount || 260000);
      scheduleExpiry();
      renderAll();
    } catch (error) {
      renderAll();
    } finally {
      state.refreshing = false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button,[role='button']");
    const action = button?.getAttribute?.("data-action") || "";
    if (button?.id === "creditPill" || action === "open-credits-page" || action === "set-credit-payment") {
      setTimeout(refreshDiscount, 0);
    }
    if (action === "continue-toman-payment") setTimeout(renderToman, 0);
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id === "customCreditsInput" || event.target?.id === "customCreditsRange") {
      setTimeout(renderCustomStars, 0);
    }
    if (event.target?.id === "tomanCreditsInput" || event.target?.id === "tomanCreditsRange") {
      setTimeout(renderToman, 0);
    }
  });

  const checkout = q("tomanCheckout");
  if (checkout) {
    new MutationObserver(renderToman).observe(checkout, { attributes: true, attributeFilter: ["data-step"] });
  }

  const wheelResult = q("wheelResult");
  if (wheelResult) {
    new MutationObserver(() => {
      const text = String(wheelResult.textContent || "");
      if (/off credit purchases/i.test(text)) setTimeout(refreshDiscount, 0);
    }).observe(wheelResult, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshDiscount, { once: true });
  } else {
    refreshDiscount();
  }
}

export const MINI_APP_CREDIT_PURCHASE_DISCOUNT_JS = "(" + creditPurchaseDiscountBootstrap.toString() + ")();";
