import { handleMiniAppRequest as baseHandleMiniAppRequest, isMiniAppRequest } from "./server-original.js";
import { authenticateMiniAppPayload } from "./auth.js";
import { getMiniAppAccessSettings, hasTrackedUser, isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { regenerateSmartTtsSelection } from "../tts-smart-editing.js";
import { buildPreparedReferralShare, getReferralLanguage, getReferralStatus, parseReferralStartParam, registerReferralFromStartParam } from "../referrals.js";
import { MINI_APP_STAR_PACKAGES, createCustomStarPackage, applyStarPackageDiscount, starInvoicePayload } from "../stars.js";
import { getActiveWheelPurchaseDiscount } from "../reward-wheel.js";
import { APP_MODES, getState, normalizeAppMode, setAppMode } from "../state.js";
import { editMessage } from "../telegram-actions.js";
import { tgForm, tgJson } from "../telegram-api.js";
import { startText, userMainKeyboard } from "../ui.js";
import { dynamicPricingPayload, handleUsagePricedImageRequest, isUsagePricedImageRequest } from "../image-usage-pricing.js";
import { PURCHASE_UI_CSS } from "./purchase-ui-styles.js";
import { REFERRAL_UI_PATCH } from "./referral-ui.js";
import { VOICE_INTRO_REFERRAL_UI_PATCH } from "./voice-intro-referral-ui.js";
import { HISTORY_FILE_IDENTITY_PATCH } from "./history-file-identity.js";
import { TTS_KEYBOARD_LOCK_PATCH } from "./tts-keyboard-lock.js";
import { TTS_EDIT_PERFORMANCE_PATCH } from "./tts-edit-performance.js";

export { isMiniAppRequest };

const MINI_APP_ROOT = "https://ai-configa.vexaagent.workers.dev/mini-app";
const APP_MODE_CONFIG = Object.freeze({
  tts: { section: "tts", menuText: "🎙 Voice" },
  image: { section: "image", menuText: "🎨 Image" },
  explore: { section: "explore", menuText: "✨ Explore" },
  ai_chat: { section: "ai_chat", menuText: "🐙 AI Chat" },
  stt: { section: "stt", menuText: "📝 Speech to Text" },
  live: { section: "live", menuText: "▶️ Vexa Live" },
});

export async function handleMiniAppRequest(request, env) {
  const url = new URL(request.url);

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

  if (request.method === "GET" && url.pathname === "/mini-app/chat/styles.css") {
    return appendResponsiveStyles(await baseHandleMiniAppRequest(request, env), AI_CHAT_RESPONSIVE_CSS);
  }

  if (request.method === "GET" && (url.pathname === "/mini-app" || url.pathname === "/mini-app/")) {
    return stripCreditsHeaderCopy(await baseHandleMiniAppRequest(request, env));
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/session") {
    const sessionRequest = request.clone();
    await registerReferralBeforeFirstSession(request, env).catch((error) => {
      console.error("mini app referral registration failed", error?.message || error);
    });
    return enhanceSession(await baseHandleMiniAppRequest(request, env), sessionRequest, env);
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/app-mode") {
    return handleAppModeUpdate(request, env);
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/history-send-to-bot") {
    return handleHistorySendToBot(request, env);
  }

  if (request.method === "POST" && url.pathname === "/mini-app/api/tts-regenerate") {
    return handleSmartTtsRegenerate(request, env);
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
        return json({ error: "Choose a USD balance amount between $0.01 and $178.00." }, 400);
      }
      pack = createCustomStarPackage(credits, discount);
    }

    const invoiceUrl = await tgJson(env, "createInvoiceLink", {
      title: "Vexa USD Balance",
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

async function handleAppModeUpdate(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);
    const rawMode = String(body.mode || "").trim().toLowerCase().replaceAll("-", "_");
    const aliases = { voice: "tts", speech_to_text: "stt", vexa_live: "live" };
    const requestedMode = aliases[rawMode] || rawMode;
    if (!APP_MODES.includes(requestedMode)) {
      return json({ error: "Unknown Vexa section." }, 400);
    }

    const appMode = await setAppMode(env, user.id, requestedMode);
    await syncBotModeExperience(env, user.id, appMode).catch((error) => {
      console.error("sync bot app mode failed", error?.message || error);
    });
    return json({ ok: true, appMode });
  } catch (error) {
    return json({ error: error?.message || "Could not update settings." }, error?.status || 500);
  }
}

async function syncBotModeExperience(env, userId) {
  await tgJson(env, "setChatMenuButton", {
    chat_id: Number(userId),
    menu_button: { type: "default" },
  }).catch((error) => {
    console.error("resetChatMenuButton failed", error?.message || error);
  });

  const state = await getState(env, userId);
  const messageId = Number(state.menuMessageId || 0);
  if (!messageId) return;
  await editMessage(
    env,
    Number(userId),
    messageId,
    startText(state),
    await userMainKeyboard(env, userId, state),
  ).catch((error) => {
    const text = String(error?.message || error).toLowerCase();
    if (!text.includes("message is not modified")) {
      console.error("update bot main menu for app mode failed", error?.message || error);
    }
  });
}

async function handleSmartTtsRegenerate(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);
    const access = await getMiniAppAccessSettings(env);
    if (access.adminOnly && !(await isAdmin(env, user.id))) {
      return json({ error: "Mini app is updating." }, 423);
    }

    const result = await regenerateSmartTtsSelection(env, {
      userId: user.id,
      historyId: String(body.historyId || ""),
      revision: Number(body.revision || 0),
      voiceId: String(body.voice || ""),
      start: body.start,
      end: body.end,
      replacement: String(body.replacement || ""),
      performanceProfile: body.performanceProfile,
    });
    return json(result);
  } catch (error) {
    return json({ error: error?.message || "Could not regenerate this voice section." }, error?.status || 500);
  }
}

async function handleHistorySendToBot(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const historyId = String(body.id || "").trim();
    if (!historyId) return json({ error: "History item not found." }, 400);

    const user = await authenticateMiniAppPayload(body, env);
    const audioRequest = new Request(new URL("/mini-app/api/history-audio", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const audioResponse = await baseHandleMiniAppRequest(audioRequest, env);
    const audioData = await audioResponse.json().catch(() => null);
    if (!audioResponse.ok) {
      return json({ error: audioData?.error || "Audio is not available." }, audioResponse.status);
    }

    const audioBase64 = String(audioData?.audioBase64 || "").replace(/\s/g, "");
    if (!audioBase64) return json({ error: "Audio is not available." }, 404);

    const audio = base64ToArrayBuffer(audioBase64);
    const filename = String(audioData?.filename || "vexa-voice.mp3").trim() || "vexa-voice.mp3";
    const mimeType = String(audioData?.mimeType || "audio/mpeg").toLowerCase();
    const telegramAudio = mimeType === "audio/mpeg" || /\.(mp3|m4a)$/i.test(filename);
    const form = new FormData();
    form.append("chat_id", String(user.id));

    if (telegramAudio) {
      form.append("title", filename.replace(/\.[^.]+$/, "") || "Vexa Voice");
      form.append("audio", new Blob([audio], { type: mimeType || "audio/mpeg" }), filename);
      await tgForm(env, "sendAudio", form);
    } else {
      form.append("document", new Blob([audio], { type: mimeType || "application/octet-stream" }), filename);
      await tgForm(env, "sendDocument", form);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error?.message || "Could not send audio to bot." }, error?.status || 500);
  }
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function enhanceSession(response, request, env) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || data.locked) return json(data || {}, response.status);

  let appMode = "tts";
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);
    appMode = normalizeAppMode((await getState(env, user.id)).appMode);
  } catch (error) {
    console.error("mini app mode session lookup failed", error?.message || error);
  }

  return json({ ...data, appMode, imagePricing: dynamicPricingPayload(0) }, response.status);
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
  else source = applyAiChatUsdBalanceUi(source);
  const marker = "(function(){";
  if (!source.includes(marker)) return cloneTextResponse(response, source);
  const injection =
    REFERRAL_UI_PATCH + "\n" + APP_MODE_SETTINGS_PATCH +
    (includeHistoryIdentity
      ? "\n" + TTS_KEYBOARD_LOCK_PATCH + "\n" + TTS_EDIT_PERFORMANCE_PATCH + "\n" + VOICE_INTRO_REFERRAL_UI_PATCH + "\n" + HISTORY_FILE_IDENTITY_PATCH
      : "");
  const patched = source.replace(marker, () => marker + "\n" + injection);
  return cloneTextResponse(response, patched);
}

function applyAiChatUsdBalanceUi(source) {
  const before = "balance.textContent=\n        Number(data.balance).toLocaleString('en-US');";
  const after = "balance.textContent=String.fromCharCode(36)+(Math.max(0,Number(data.balance)||0)*.000178).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});\n      var balanceUnit=balance.nextElementSibling;if(balanceUnit)balanceUnit.textContent='USD';";
  if (!source.includes(before)) {
    console.error("AI Chat USD balance UI patch target missing");
    return source;
  }
  return source.replace(before, () => after);
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
      "function updateImageCreditNote(){var node=q('imageCreditNote');if(!node)return;node.dir='ltr';var base=Number(imagePricing.baseCost)||188,active=Number(imagePricing.activeCost)||base,remaining=imageOfferRemaining();if(imagePricing.discountEnabled&&(Number(imagePricing.discountUntil)<=0||remaining>0)&&active<base){var percent=Number(imagePricing.discountPercent)||Math.round((base-active)/base*100),countdown=Number(imagePricing.discountUntil)>0?'<span class=\"discount-countdown\"><small>Ends in</small><strong>'+formatOfferTime(remaining)+'</strong></span>':'';node.classList.add('has-discount');node.innerHTML='<span class=\"discount-badge\">LIMITED RATE</span><span class=\"old-price\">'+base.toLocaleString('en-US')+'</span><strong>'+formatBalanceUsd(active)+'</strong><span class=\"discount-percent\">-'+percent+'%</span>'+countdown}else{if(imagePricing.discountEnabled&&Number(imagePricing.discountUntil)>0&&remaining<=0)endImageOffer();node.classList.remove('has-discount');node.textContent=formatBalanceUsd(base)+' per image'}}",
      "function updateImageCreditNote(){var node=q('imageCreditNote');if(!node)return;node.dir='ltr';node.classList.remove('has-discount');var last=Math.max(0,Number(imagePricing&&imagePricing.lastCost)||0);node.textContent=last?formatBalanceUsd(last)+' used':''}",
    ],
    [
      "var imageCost=Number(imagePricing.activeCost)||188;if(availableCredits!==null&&availableCredits<imageCost)return toast('Not enough USD balance · Image creation costs '+formatBalanceUsd(imageCost));",
      "if(availableCredits!==null&&availableCredits<1)return toast('Not enough USD balance');",
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

function stripLegacyTtsKeyboardGeometry(source) {
  const legacyRules = [
    "body.keyboard-open:not(.image-mode) #flow.active,body.keyboard-closing:not(.image-mode) #flow.active,body.keyboard-open:not(.image-mode) #flow.active .tts-page,body.keyboard-closing:not(.image-mode) #flow.active .tts-page{position:static}",
    "body.keyboard-open:not(.image-mode) #flow.active .tts-bottom,body.keyboard-closing:not(.image-mode) #flow.active .tts-bottom{position:absolute!important;bottom:60px!important;display:grid!important}",
  ];

  let patched = source;
  for (const rule of legacyRules) {
    if (!patched.includes(rule)) {
      console.error("legacy TTS keyboard geometry rule missing");
      continue;
    }
    patched = patched.replace(rule, "");
  }
  return patched;
}

async function appendPurchaseStyles(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/css")) return response;

  const source = stripLegacyTtsKeyboardGeometry(await response.text());
  return cloneTextResponse(response, source + "\n" + PURCHASE_UI_CSS + "\n" + MINI_APP_RESPONSIVE_CSS);
}

async function appendResponsiveStyles(response, responsiveCss) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/css")) return response;
  const source = await response.text();
  return cloneTextResponse(response, source + "\n" + responsiveCss);
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

const APP_MODE_SETTINGS_PATCH = String.raw`
  var appModeTg=window.Telegram&&window.Telegram.WebApp;
  var appModeInitData=(appModeTg&&appModeTg.initData)||'';
  var appModeValue='tts';
  var appModeLanguage='en';
  var appModeChanged=false;
  var appModeSaving=false;
  var appModeBaseFetch=window.fetch.bind(window);
  var appModeObserver=null;
  var appModeBackWasVisible=false;
  var appModeBackBound=false;
  var appModeModes=[
    {id:'tts',title:'Text to Speech',note:'AI voice from text'},
    {id:'image',title:'Image Creator',note:'Create and edit images'},
    {id:'explore',title:'Explore Prompts',note:'Ready-made visual prompts'},
    {id:'ai_chat',title:'🐙 AI Chat',note:'Chat with Vexa'},
    {id:'stt',title:'Speech to Text',note:'Transcribe speech and audio'},
    {id:'live',title:'Vexa Live',note:'Open the live media workspace'}
  ];

  function appModeNormalize(value){var clean=String(value||'').trim().toLowerCase().replace(/-/g,'_');if(clean==='voice')clean='tts';if(clean==='speech_to_text')clean='stt';if(clean==='vexa_live')clean='live';return appModeModes.some(function(item){return item.id===clean})?clean:'tts'}
  function appModeRawLaunch(){var raw='';try{raw=appModeTg&&appModeTg.initDataUnsafe&&appModeTg.initDataUnsafe.start_param||''}catch(e){}if(!raw){try{var params=new URLSearchParams(window.location.search);raw=params.get('tgWebAppStartParam')||params.get('startapp')||params.get('section')||''}catch(e){}}return String(raw||'').trim().toLowerCase()}
  function appModeIsReferral(raw){return /^ref_\d+_[tixcv]$/i.test(String(raw||''))}
  function appModeClick(action){var button=document.querySelector('[data-action="'+action+'"]');if(button){button.click();return true}return false}
  function appModeWhen(selector,callback){var node=document.querySelector(selector);if(node){callback(node);return}if(appModeObserver)appModeObserver.disconnect();appModeObserver=new MutationObserver(function(){var found=document.querySelector(selector);if(!found)return;appModeObserver.disconnect();appModeObserver=null;callback(found)});appModeObserver.observe(document.documentElement,{childList:true,subtree:true})}
  function appModeApply(mode){mode=appModeNormalize(mode);var chatPath=window.location.pathname.indexOf('/mini-app/chat')===0;if(chatPath){if(mode!=='ai_chat')window.location.replace('/mini-app?section='+encodeURIComponent(mode));return}if(mode==='ai_chat'){window.location.replace('/mini-app/chat');return}if(mode==='tts'){if(document.body&&document.body.classList.contains('image-mode'))appModeClick('toggle-creation-mode');return}if(mode==='image'){if(document.body&&!document.body.classList.contains('image-mode'))appModeClick('toggle-creation-mode');return}if(mode==='explore'){if(document.body&&!document.body.classList.contains('image-mode'))appModeClick('toggle-creation-mode');appModeWhen('[data-action="open-explore-page"]',function(button){button.click()});return}if(mode==='stt'){appModeWhen('#speechToTextOpen',function(button){if(button.getAttribute('aria-pressed')!=='true')button.click()});return}if(mode==='live'){appModeWhen('#vexaLiveOpen',function(button){if(button.getAttribute('aria-pressed')!=='true')button.click()})}}
  function appModeApplySession(data){if(!data||typeof data!=='object')return;appModeValue=appModeNormalize(data.appMode);appModeLanguage=String(data.language||appModeLanguage||'en').toLowerCase().split(/[-_]/)[0];appModeRender();var raw=appModeRawLaunch();if(raw==='settings'){setTimeout(appModeOpenSettings,0);return}if(appModeIsReferral(raw))return;if(window.location.pathname.indexOf('/mini-app/chat')===0)return;var directMap={tts:'tts',voice:'tts',image:'image',explore:'explore',ai_chat:'ai_chat',stt:'stt','speech-to-text':'stt',live:'live','vexa-live':'live'};if(directMap[raw]){appModeApply(directMap[raw]);return}if(!raw||raw==='home')appModeApply(appModeValue)}
  function appModeBindBack(){if(!appModeTg||!appModeTg.BackButton)return;try{appModeBackWasVisible=!!appModeTg.BackButton.isVisible;if(!appModeBackBound){appModeTg.BackButton.onClick(appModeCloseSettings);appModeBackBound=true}appModeTg.BackButton.show()}catch(e){}}
  function appModeReleaseBack(){if(!appModeTg||!appModeTg.BackButton)return;try{if(appModeBackBound){appModeTg.BackButton.offClick(appModeCloseSettings);appModeBackBound=false}if(appModeBackWasVisible)appModeTg.BackButton.show();else appModeTg.BackButton.hide()}catch(e){}}

  function appModeInstallStyle(){if(document.getElementById('vexaAppModeSettingsStyle'))return;var style=document.createElement('style');style.id='vexaAppModeSettingsStyle';style.textContent='.vexa-app-settings{position:fixed;inset:0;z-index:2147483200;background:#050505;color:#fff;opacity:0;visibility:hidden;pointer-events:none;transform:translate3d(0,18px,0) scale(.992);filter:blur(6px);transition:opacity .22s ease,transform .46s cubic-bezier(.16,1,.3,1),filter .3s ease,visibility 0s linear .46s;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}.vexa-app-settings.open{opacity:1;visibility:visible;pointer-events:auto;transform:none;filter:none;transition-delay:0s}.vexa-app-settings-scroll{height:100%;overflow:auto;padding:calc(62px + env(safe-area-inset-top,0px)) 20px calc(34px + env(safe-area-inset-bottom,0px));box-sizing:border-box}.vexa-app-settings-inner{width:min(100%,520px);margin:0 auto}.vexa-app-settings-head{margin:0 2px 30px}.vexa-app-settings-copy{opacity:0;transform:translateY(10px);transition:opacity .28s .05s ease,transform .46s .04s cubic-bezier(.16,1,.3,1)}.vexa-app-settings.open .vexa-app-settings-copy{opacity:1;transform:none}.vexa-app-settings-copy span{display:block;color:rgba(255,255,255,.34);font-size:9.5px;font-weight:820;letter-spacing:.11em;text-transform:uppercase}.vexa-app-settings-copy h2{margin:6px 0 0;font-size:29px;line-height:1;font-weight:840;letter-spacing:-.045em}.vexa-app-settings-section{padding:0;background:transparent}.vexa-app-settings-label{margin:0 2px 13px;opacity:0;transform:translateY(8px);transition:opacity .28s .09s ease,transform .44s .08s cubic-bezier(.16,1,.3,1)}.vexa-app-settings.open .vexa-app-settings-label{opacity:1;transform:none}.vexa-app-settings-label strong{display:block;font-size:13px;font-weight:810;letter-spacing:-.018em}.vexa-app-settings-label small{display:block;margin-top:4px;color:rgba(255,255,255,.38);font-size:10.5px;font-weight:610;line-height:1.35}.vexa-app-mode-row{width:100%;min-height:70px;padding:12px 2px;border:0;border-top:1px solid rgba(255,255,255,.065);background:transparent;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:18px;text-align:left;opacity:0;transform:translateY(9px);transition:opacity .28s ease,transform .42s cubic-bezier(.16,1,.3,1)}.vexa-app-settings.open .vexa-app-mode-row{opacity:1;transform:none}.vexa-app-settings.open .vexa-app-mode-row:nth-child(1){transition-delay:.11s}.vexa-app-settings.open .vexa-app-mode-row:nth-child(2){transition-delay:.14s}.vexa-app-settings.open .vexa-app-mode-row:nth-child(3){transition-delay:.17s}.vexa-app-settings.open .vexa-app-mode-row:nth-child(4){transition-delay:.20s}.vexa-app-settings.open .vexa-app-mode-row:nth-child(5){transition-delay:.23s}.vexa-app-settings.open .vexa-app-mode-row:nth-child(6){transition-delay:.26s}.vexa-app-mode-row:first-child{border-top-color:rgba(255,255,255,.09)}.vexa-app-mode-copy{min-width:0;display:block}.vexa-app-mode-copy strong{display:block;font-size:15px;font-weight:780;letter-spacing:-.022em}.vexa-app-mode-copy small{display:block;margin-top:4px;color:rgba(255,255,255,.36);font-size:10.5px;font-weight:610;line-height:1.3}.vexa-app-mode-switch{position:relative;width:43px;height:25px;flex:0 0 43px;border-radius:999px;background:#29292b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.055);transition:background .24s ease,box-shadow .24s ease}.vexa-app-mode-switch i{position:absolute;width:21px;height:21px;left:2px;top:2px;border-radius:50%;background:#f4f4f4;box-shadow:0 2px 7px rgba(0,0,0,.34);transition:transform .32s cubic-bezier(.16,1,.3,1),background .24s ease}.vexa-app-mode-row[aria-checked="true"] .vexa-app-mode-switch{background:#f5f5f5;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6)}.vexa-app-mode-row[aria-checked="true"] .vexa-app-mode-switch i{background:#080808;transform:translateX(18px)}.vexa-app-mode-row:disabled{opacity:.52}.vexa-app-settings-status{min-height:18px;margin:12px 2px 0;color:rgba(255,255,255,.34);font-size:10px;font-weight:650;letter-spacing:-.01em}.vexa-app-settings[dir="rtl"] .vexa-app-mode-row{text-align:right}.vexa-app-settings[dir="rtl"] .vexa-app-mode-switch i{left:auto;right:2px}.vexa-app-settings[dir="rtl"] .vexa-app-mode-row[aria-checked="true"] .vexa-app-mode-switch i{transform:translateX(-18px)}@media (prefers-reduced-motion:reduce){.vexa-app-settings,.vexa-app-settings-copy,.vexa-app-settings-label,.vexa-app-mode-row{transition:none!important;transform:none!important;filter:none!important}}';document.head.appendChild(style)}
  function appModeEnsureUi(){var root=document.getElementById('vexaAppModeSettings');if(root)return root;appModeInstallStyle();root=document.createElement('section');root.id='vexaAppModeSettings';root.className='vexa-app-settings';root.setAttribute('aria-hidden','true');root.setAttribute('role','dialog');root.setAttribute('aria-label','Vexa Settings');root.innerHTML='<div class="vexa-app-settings-scroll"><div class="vexa-app-settings-inner"><header class="vexa-app-settings-head"><div class="vexa-app-settings-copy"><span>Vexa</span><h2>Settings</h2></div></header><section class="vexa-app-settings-section"><div class="vexa-app-settings-label"><strong>Main experience</strong><small>Choose what Vexa opens first.</small></div><div id="vexaAppModeRows"></div><div id="vexaAppModeStatus" class="vexa-app-settings-status"></div></section></div></div>';document.body.appendChild(root);root.addEventListener('click',function(event){var row=event.target&&event.target.closest?event.target.closest('[data-app-mode]'):null;if(row)appModeSave(row.getAttribute('data-app-mode'))});appModeRender();return root}
  function appModeRender(){var root=document.getElementById('vexaAppModeSettings');if(!root)return;root.dir=['fa','ar'].indexOf(appModeLanguage)>=0?'rtl':'ltr';var rows=root.querySelector('#vexaAppModeRows');if(!rows)return;rows.innerHTML=appModeModes.map(function(item){var active=item.id===appModeValue;return '<button class="vexa-app-mode-row" data-app-mode="'+item.id+'" role="switch" aria-checked="'+(active?'true':'false')+'" type="button"'+(appModeSaving?' disabled':'')+'><span class="vexa-app-mode-copy"><strong>'+item.title+'</strong><small>'+item.note+'</small></span><span class="vexa-app-mode-switch" aria-hidden="true"><i></i></span></button>'}).join('')}
  function appModeOpenSettings(){var root=appModeEnsureUi();if(root.classList.contains('open'))return;appModeBindBack();root.classList.add('open');root.setAttribute('aria-hidden','false');try{appModeTg&&appModeTg.HapticFeedback&&appModeTg.HapticFeedback.impactOccurred&&appModeTg.HapticFeedback.impactOccurred('light')}catch(e){}}
  function appModeCloseSettings(){var root=document.getElementById('vexaAppModeSettings');if(root){root.classList.remove('open');root.setAttribute('aria-hidden','true')}appModeReleaseBack();if(appModeChanged){appModeChanged=false;setTimeout(function(){appModeApply(appModeValue)},240)}}
  async function appModeSave(mode){mode=appModeNormalize(mode);if(appModeSaving||mode===appModeValue)return;var previous=appModeValue;appModeSaving=true;appModeValue=mode;appModeRender();var status=document.getElementById('vexaAppModeStatus');if(status)status.textContent='Saving…';try{var response=await appModeBaseFetch('/mini-app/api/app-mode',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:appModeInitData,mode:mode})});var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Could not update settings');appModeValue=appModeNormalize(data.appMode||mode);appModeChanged=true;if(status)status.textContent='Updated';try{appModeTg&&appModeTg.HapticFeedback&&appModeTg.HapticFeedback.selectionChanged&&appModeTg.HapticFeedback.selectionChanged()}catch(e){}}catch(error){appModeValue=previous;if(status)status.textContent=String(error&&error.message||'Could not update settings')}finally{appModeSaving=false;appModeRender()}}

  window.fetch=async function(input,init){var path=typeof input==='string'?input:String(input&&input.url||'');var response=await appModeBaseFetch(input,init);if(path.indexOf('/mini-app/api/session')>=0&&response.ok){response.clone().json().then(appModeApplySession).catch(function(){})}return response};
  if(appModeTg&&appModeTg.SettingsButton){try{appModeTg.SettingsButton.show();appModeTg.SettingsButton.onClick(appModeOpenSettings)}catch(e){}}
`;

const MINI_APP_RESPONSIVE_CSS = String.raw`
/* Adaptive layout: mobile portrait keeps the existing UI unchanged. */
@media (min-width:700px){
  .app{width:min(100%,960px);padding-top:calc(24px + env(safe-area-inset-top))}
  .tts-head,.tts-area{width:min(calc(100% - 56px),760px);margin-left:auto!important;margin-right:auto!important}
  .tts-head:before,.tts-head:after{left:-28px;right:-28px}
  .tts-bottom{width:min(calc(100vw - 64px),720px);max-width:720px}
  .image-workspace{max-width:820px;margin-left:auto;margin-right:auto;padding-left:28px;padding-right:28px}
  .image-explore{margin-left:-28px;margin-right:-28px}
  .image-explore-head{padding-left:30px;padding-right:30px}
  .image-explore-grid{padding-left:30px;padding-right:30px}
  .image-history-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .history-card{width:min(calc(100% - 48px),760px);max-height:min(68dvh,620px);padding-left:20px;padding-right:20px}
  .history-list{max-height:min(58dvh,550px)}
  .explore-page{padding-left:24px;padding-right:24px}
  .explore-page-head,.explore-search,.explore-page-grid{width:100%;max-width:900px;margin-left:auto;margin-right:auto}
  .explore-page-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .voices-page{padding-left:24px;padding-right:24px}
  .voices-page-head,.saved-voices-strip,.voice-library-search,.voice-library-grid{width:100%;max-width:820px;margin-left:auto;margin-right:auto}
  .credits-page-scroll{padding-left:28px;padding-right:28px}
  .credits-page-head,.credits-custom,.credits-packs-section,.credits-footnote{max-width:760px}
  .credits-payment-switch{width:min(calc(100% - 32px),760px);margin-left:auto;margin-right:auto}
  .credits-pack-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .wheel-panel{width:min(calc(100% - 40px),620px)}
  .limit-card{max-width:520px}
  .explore-reels-page{width:min(100%,620px);left:50%;right:auto;transform:translateX(-50%)}
}

@media (min-width:1100px){
  .app{width:min(100%,1180px);padding-top:calc(28px + env(safe-area-inset-top))}
  .tts-head,.tts-area{width:min(calc(100% - 96px),900px)}
  .tts-bottom{width:min(calc(100vw - 96px),840px);max-width:840px}
  .image-workspace{max-width:980px;padding-left:40px;padding-right:40px}
  .image-explore{margin-left:-40px;margin-right:-40px}
  .image-explore-head{padding-left:42px;padding-right:42px}
  .image-explore-grid{padding-left:42px;padding-right:42px}
  .explore-page{padding-left:32px;padding-right:32px}
  .explore-page-head,.explore-search,.explore-page-grid{max-width:1180px}
  .explore-page-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .voices-page{padding-left:32px;padding-right:32px}
  .voices-page-head,.saved-voices-strip,.voice-library-search,.voice-library-grid{max-width:980px}
  .voice-library-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px}
  .credits-page-head,.credits-custom,.credits-packs-section,.credits-footnote{max-width:920px}
  .credits-payment-switch{width:min(calc(100% - 64px),920px)}
  .credits-pack-list{gap:12px}
  .history-card{width:min(calc(100% - 80px),900px);max-height:min(72dvh,680px)}
  .history-list{max-height:min(62dvh,610px)}
  .wheel-panel{width:min(calc(100% - 64px),680px)}
  .explore-reels-page{width:min(100%,680px)}
}

/* Phone landscape: compact vertical geometry without turning the phone into desktop UI. */
@media (orientation:landscape) and (min-width:560px) and (max-width:960px) and (max-height:600px){
  .app{padding-top:calc(10px + env(safe-area-inset-top))}
  body:not(.keyboard-open) .tts-page{padding-bottom:126px}
  body:not(.keyboard-open) .tts-head{height:34px;min-height:34px;max-height:34px;margin-bottom:8px!important}
  body:not(.keyboard-open) .tts-head:before{top:calc(-10px - env(safe-area-inset-top))}
  body:not(.keyboard-open) .tts-head:after{height:20px}
  body:not(.keyboard-open) .tts-bottom{bottom:calc(8px + env(safe-area-inset-bottom,0px));gap:7px!important}
  body:not(.keyboard-open) .wave-player{height:46px}
  body:not(.keyboard-open) .tts-generate{height:38px!important;min-height:38px!important}
  .image-workspace{top:42px;gap:8px;padding-bottom:8px}
  .image-intro{padding-top:0}
  .image-intro p{display:none}
  .image-composer textarea{height:72px}
  .history-card{max-height:min(84dvh,420px)}
  .history-list{max-height:min(72dvh,350px)}
  .wheel-panel{max-height:calc(var(--app-viewport-height,100vh) - env(safe-area-inset-top,0px) - 6px);padding-top:12px}
  .wheel-stage{width:min(44vh,220px);margin-top:8px;margin-bottom:7px}
  .explore-page-head,.voices-page-head{padding-top:calc(env(safe-area-inset-top,0px) + 10px)}
}
`;

const AI_CHAT_RESPONSIVE_CSS = String.raw`
/* Adaptive AI chat: compact mobile remains unchanged below 700px. */
@media (min-width:700px){
  .ai-chat-head{left:50%;right:auto;width:min(calc(100% - 56px),760px);transform:translateX(-50%)}
  .ai-chat-messages{padding-left:max(28px,calc((100vw - 760px)/2));padding-right:max(28px,calc((100vw - 760px)/2))}
  .ai-chat-message-content{max-width:min(78%,620px)}
  .ai-chat-image-card{width:min(56vw,430px)}
  .ai-chat-page .ai-chat-composer{left:50%;right:auto;width:min(calc(100% - 64px),720px);transform:translateX(-50%)}
  .ai-chat-menu-panel{width:min(52vw,380px)}
}

@media (min-width:1100px){
  .ai-chat-head{width:min(calc(100% - 96px),900px)}
  .ai-chat-messages{padding-left:max(48px,calc((100vw - 900px)/2));padding-right:max(48px,calc((100vw - 900px)/2))}
  .ai-chat-message-content{max-width:min(74%,720px)}
  .ai-chat-image-card{width:min(44vw,520px)}
  .ai-chat-page .ai-chat-composer{width:min(calc(100% - 96px),820px)}
  .ai-chat-menu-panel{width:min(38vw,410px)}
}

@media (orientation:landscape) and (min-width:560px) and (max-width:960px) and (max-height:600px){
  .ai-chat-head{top:calc(8px + env(safe-area-inset-top))}
  .ai-chat-messages{padding-top:calc(60px + env(safe-area-inset-top));padding-bottom:max(74px,calc(var(--ai-chat-page-height) - 112px))}
  .ai-chat-page .ai-chat-composer{bottom:calc(max(7px,env(safe-area-inset-bottom)) + var(--ai-chat-keyboard-offset,0px))}
  .ai-chat-menu-panel{width:min(58vw,344px);padding-top:calc(10px + env(safe-area-inset-top));padding-bottom:calc(12px + env(safe-area-inset-bottom))}
}
`;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}