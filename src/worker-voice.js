import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import VEXA_VOICE_AGENT_SOURCE from "./mini-app/vexa-live/voice-agent-runtime.txt";
import VEXA_VOICE_ORB_SOURCE from "./mini-app/vexa-live/voice-orb-original.txt";

const VEXA_VOICE_AGENT_VERSION = "20260821-energy-1";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";

export { AiCodingWorkflow } from "./worker-tribute.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isVexaVoiceAgentRequest(request)) {
      return handleVexaVoiceAgentRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === VOICE_RUNTIME_PATH) {
      return voiceRuntimeResponse();
    }

    const response = await worker.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === LIVE_INTEGRATION_PATH) {
      return refineLiveIntegration(response);
    }

    return response;
  },
};

function restoreOriginalOrb(source) {
  let restored = String(source || "");
  const rendererStart = restored.indexOf("  function createOrbRenderer(canvas) {");
  const initializeStart = restored.indexOf("  function initialize() {", rendererStart);

  if (rendererStart >= 0 && initializeStart > rendererStart) {
    restored =
      restored.slice(0, rendererStart) +
      String(VEXA_VOICE_ORB_SOURCE || "").trimEnd() +
      "\n\n" +
      restored.slice(initializeStart);
  }

  return restored.replace(
    "radial-gradient(circle at 50% 50%,#08080a 0 54%,rgba(54,22,118,.62) 67%,#8352ff 80%,#ffc7ea 97%)",
    "radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%)",
  );
}

function makeInlineVoice(source) {
  let result = String(source || "");

  // Keep the original bounded render density on mobile instead of forcing a 2.75 DPR buffer.
  result = result.replace(
    "const dpr = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1));",
    "const dpr = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1));",
  );

  // The status style is installed by the Orb runtime after the base stylesheet,
  // so remove its old fullscreen-era vertical offset.
  result = result.replace(
    ".vexa-voice-copy{display:flex!important;min-height:24px!important;margin-top:-8px!important;transform:translateY(-42px)!important;opacity:1!important}",
    ".vexa-voice-copy{display:flex!important;min-height:24px!important;margin-top:-2px!important;transform:none!important;opacity:1!important}",
  );
  result = result.replace(
    ".vexa-voice-overlay.open .vexa-voice-copy{display:flex!important;transform:translateY(-42px)!important;opacity:1!important}",
    ".vexa-voice-overlay.open .vexa-voice-copy{display:flex!important;transform:none!important;opacity:1!important}",
  );

  // Replace the old mini Orb button mark with a compact three-bar Voice mark.
  result = result.replace(
    `      button.innerHTML = '<span class="vexa-voice-open-orb" aria-hidden="true"></span>';`,
    `      button.innerHTML = '<span class="vexa-voice-button-icon" aria-hidden="true"><i class="vexa-voice-button-bar vexa-voice-button-bar-a"></i><i class="vexa-voice-button-bar vexa-voice-button-bar-b"></i><i class="vexa-voice-button-bar vexa-voice-button-bar-c"></i></span>';`,
  );

  // Replace the fullscreen presentation with one compact, in-page voice surface.
  const cssMarker = "      @keyframes vexaVoiceButtonBreath";
  if (result.includes(cssMarker)) {
    const inlineCss = `      .vexa-voice-close,.vexa-voice-hint,.vexa-voice-transcript{display:none!important}
      .vexa-voice-overlay{position:absolute!important;z-index:9!important;left:50%!important;right:auto!important;top:auto!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;inset:auto auto calc(72px + env(safe-area-inset-bottom)) 50%!important;width:188px!important;height:190px!important;min-height:0!important;padding:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-end!important;background:transparent!important;overflow:visible!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translate(-50%,30px) scale(.72)!important;transform-origin:50% 100%!important;filter:blur(8px)!important;transition:opacity .28s ease,transform .58s cubic-bezier(.16,1,.3,1),filter .4s ease,visibility 0s linear .58s!important}
      .vexa-voice-overlay.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translate(-50%,0) scale(1)!important;filter:blur(0)!important;transition-delay:0s!important}
      .vexa-voice-stage{width:150px!important;height:150px!important;flex:0 0 150px!important;aspect-ratio:1!important;opacity:0!important;transform:translateY(20px) scale(.68)!important;filter:blur(7px)!important;transition:opacity .32s .04s ease,transform .62s .02s cubic-bezier(.16,1,.3,1),filter .36s .02s ease!important}
      .vexa-voice-overlay.open .vexa-voice-stage{opacity:1!important;transform:translateY(0) scale(1)!important;filter:blur(0)!important}
      .vexa-voice-canvas{width:150px!important;height:150px!important;image-rendering:auto!important}
      .vexa-voice-copy{width:188px!important;min-height:24px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:center!important;opacity:0!important;transform:translateY(8px)!important;transition:opacity .28s .16s ease,transform .42s .12s cubic-bezier(.16,1,.3,1)!important}
      .vexa-voice-overlay.open .vexa-voice-copy{opacity:1!important;transform:none!important}
      .vexa-voice-status{min-height:22px!important;height:auto!important;max-width:184px!important;color:rgba(255,255,255,.68)!important;font-size:10.5px!important;font-weight:650!important;line-height:1.3!important;letter-spacing:-.01em!important;text-align:center!important;white-space:normal!important}
      .vexa-voice-button-icon{position:relative;width:20px;height:20px;display:block}
      .vexa-voice-button-bar{position:absolute;left:50%;top:50%;display:block;width:2.8px;border-radius:999px;background:currentColor;transform-origin:50% 50%;transition:left .38s cubic-bezier(.16,1,.3,1),height .38s cubic-bezier(.16,1,.3,1),opacity .22s ease,transform .42s cubic-bezier(.16,1,.3,1),width .38s cubic-bezier(.16,1,.3,1)}
      .vexa-voice-button-bar-a{height:8px;transform:translate(-7px,-50%)}
      .vexa-voice-button-bar-b{height:15px;transform:translate(-50%,-50%)}
      .vexa-voice-button-bar-c{height:10px;transform:translate(4.2px,-50%)}
      .vexa-voice-open:not([aria-pressed="true"]) .vexa-voice-button-bar-a,.vexa-voice-open:not([aria-pressed="true"]) .vexa-voice-button-bar-b,.vexa-voice-open:not([aria-pressed="true"]) .vexa-voice-button-bar-c{animation:none!important}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-a{left:50%;height:18px;width:3.2px;transform:translate(-50%,-50%) rotate(45deg)}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-b{height:3px;opacity:0;transform:translate(-50%,-50%) scale(.35)}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-c{left:50%;height:18px;width:3.2px;transform:translate(-50%,-50%) rotate(-45deg)}
      .vexa-stt.voice-active .vexa-stt-record,.vexa-stt.voice-active .vexa-stt-upload{opacity:.2!important;pointer-events:none!important;transform:scale(.94)!important}
      .vexa-stt.voice-active .vexa-voice-open{opacity:1!important;pointer-events:auto!important;transform:none!important;background:rgba(20,20,20,.82)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.07),0 0 0 1px rgba(255,255,255,.1),0 10px 24px rgba(0,0,0,.28)!important}
      @keyframes vexaVoiceBarA{0%,100%{height:7px;opacity:.58}50%{height:14px;opacity:1}}
      @keyframes vexaVoiceBarB{0%,100%{height:11px;opacity:.7}50%{height:18px;opacity:1}}
      @keyframes vexaVoiceBarC{0%,100%{height:8px;opacity:.62}50%{height:15px;opacity:1}}
`;
    result = result.replace(cssMarker, inlineCss + cssMarker);
  }

  const openMarker = "  async function openVoiceMode() {";
  if (result.includes(openMarker)) {
    const introHelpers = `  let vexaVoiceIntroPromise = null;

  function voiceIntroStorageKey() {
    const userId = String(telegram()?.initDataUnsafe?.user?.id || "guest");
    return "vexa_voice_intro_hidden_v1:" + userId;
  }

  function voiceIntroSuppressed() {
    try {
      return localStorage.getItem(voiceIntroStorageKey()) === "1";
    } catch (error) {
      return false;
    }
  }

  function suppressVoiceIntro() {
    try {
      localStorage.setItem(voiceIntroStorageKey(), "1");
    } catch (error) {}
  }

  function voiceIntroLocale() {
    const tgLanguage = String(telegram()?.initDataUnsafe?.user?.language_code || "").trim();
    const hostLanguage = String(hostWindow()?.navigator?.language || "").trim();
    const localLanguage = String(navigator.language || "").trim();
    const candidates = [tgLanguage, hostLanguage, localLanguage].filter(Boolean);
    const supported = new Set(["en", "fa", "ru", "de", "tr", "ar", "es", "hi", "zh", "ja"]);

    for (const candidate of candidates) {
      const base = candidate.toLowerCase().replace("_", "-").split("-")[0];
      if (supported.has(base)) return base;
    }

    let region = "";
    for (const candidate of candidates) {
      try {
        const parsed = new Intl.Locale(candidate.replace("_", "-"));
        if (parsed.region) {
          region = String(parsed.region).toUpperCase();
          break;
        }
      } catch (error) {}
    }

    if (["IR", "AF"].includes(region)) return "fa";
    if (region === "RU") return "ru";
    if (["DE", "AT"].includes(region)) return "de";
    if (region === "TR") return "tr";
    if (["SA", "AE", "QA", "KW", "EG", "JO", "LB", "OM", "BH"].includes(region)) return "ar";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].includes(region)) return "es";
    if (region === "IN") return "hi";
    if (["CN", "TW", "HK"].includes(region)) return "zh";
    if (region === "JP") return "ja";
    return "en";
  }

  function voiceIntroCopy() {
    const copy = {
      en: {
        title: "Vexa Voice Agent",
        body: "Talk naturally with Vexa in real time. It listens, understands, and replies by voice.",
        price: "$0.14 USD / minute",
        okay: "Got it",
        never: "Don’t show again",
        close: "Close",
        dir: "ltr",
      },
      fa: {
        title: "ایجنت صوتی وکسا",
        body: "زنده و طبیعی با وکسا صحبت کن؛ صدایت را می‌شنود، می‌فهمد و صوتی پاسخ می‌دهد.",
        price: "$0.14 USD / minute",
        okay: "باشه",
        never: "دیگر نشانم نده",
        close: "بستن",
        dir: "rtl",
      },
      ru: {
        title: "Голосовой агент Vexa",
        body: "Говорите с Vexa в реальном времени. Он слушает, понимает и отвечает голосом.",
        price: "800 кредитов / минута",
        okay: "Понятно",
        never: "Больше не показывать",
        close: "Закрыть",
        dir: "ltr",
      },
      de: {
        title: "Vexa Sprachagent",
        body: "Sprich in Echtzeit ganz natürlich mit Vexa. Vexa hört zu, versteht und antwortet per Stimme.",
        price: "$0.14 USD / minute",
        okay: "Verstanden",
        never: "Nicht mehr anzeigen",
        close: "Schließen",
        dir: "ltr",
      },
      tr: {
        title: "Vexa Sesli Asistan",
        body: "Vexa ile gerçek zamanlı ve doğal konuş. Seni dinler, anlar ve sesli yanıt verir.",
        price: "Dakikada 800 kredi",
        okay: "Tamam",
        never: "Bir daha gösterme",
        close: "Kapat",
        dir: "ltr",
      },
      ar: {
        title: "وكيل Vexa الصوتي",
        body: "تحدث مع Vexa بشكل طبيعي وفوري. يستمع إليك ويفهمك ويرد بصوت.",
        price: "٨٠٠ رصيد / دقيقة",
        okay: "حسنًا",
        never: "لا تظهرها مجددًا",
        close: "إغلاق",
        dir: "rtl",
      },
      es: {
        title: "Agente de voz Vexa",
        body: "Habla con Vexa de forma natural y en tiempo real. Te escucha, entiende y responde por voz.",
        price: "800 créditos / minuto",
        okay: "Entendido",
        never: "No volver a mostrar",
        close: "Cerrar",
        dir: "ltr",
      },
      hi: {
        title: "Vexa वॉइस एजेंट",
        body: "Vexa से रियल टाइम में स्वाभाविक रूप से बात करें। यह सुनता, समझता और आवाज़ में जवाब देता है।",
        price: "800 क्रेडिट / मिनट",
        okay: "ठीक है",
        never: "फिर न दिखाएँ",
        close: "बंद करें",
        dir: "ltr",
      },
      zh: {
        title: "Vexa 语音助手",
        body: "与 Vexa 实时自然对话。它会聆听、理解并用语音回复。",
        price: "800 积分 / 分钟",
        okay: "知道了",
        never: "不再显示",
        close: "关闭",
        dir: "ltr",
      },
      ja: {
        title: "Vexa ボイスエージェント",
        body: "Vexa とリアルタイムで自然に会話できます。音声を聞き取り、理解して声で返答します。",
        price: "800 クレジット / 分",
        okay: "了解",
        never: "今後表示しない",
        close: "閉じる",
        dir: "ltr",
      },
    };
    return copy[voiceIntroLocale()] || copy.en;
  }

  function installVoiceIntroStyles(doc) {
    if (!doc?.head || doc.getElementById("vexaVoiceIntroStyles")) return;
    const style = doc.createElement("style");
    style.id = "vexaVoiceIntroStyles";
    style.textContent =
      '.vexa-voice-intro-card{overflow:hidden!important}' +
      '.vexa-voice-intro-card .vexa-voice-intro-icon{background:linear-gradient(160deg,#fafafa 0%,#cfcfcf 38%,#fff 62%,#a9a9a9 100%)!important;color:#080808!important;box-shadow:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(0,0,0,.26),0 0 26px rgba(255,255,255,.16)!important}' +
      '.vexa-voice-intro-miniwave{width:18px;height:14px;display:flex;align-items:center;justify-content:center;gap:2px}' +
      '.vexa-voice-intro-miniwave i{display:block;width:2.5px;border-radius:999px;background:currentColor;animation:vexaVoiceIntroWave .9s ease-in-out infinite}' +
      '.vexa-voice-intro-miniwave i:nth-child(1){height:7px;animation-delay:-.2s}.vexa-voice-intro-miniwave i:nth-child(2){height:13px;animation-delay:-.4s}.vexa-voice-intro-miniwave i:nth-child(3){height:9px;animation-delay:-.6s}' +
      '.vexa-voice-intro-card h3{font-size:15px!important;font-weight:850!important;letter-spacing:-.025em!important;margin-bottom:7px!important}' +
      '.vexa-voice-intro-card p{max-width:320px!important;margin-bottom:12px!important;color:rgba(255,255,255,.64)!important;font-size:11.5px!important;font-weight:650!important;line-height:1.46!important;letter-spacing:-.01em!important}' +
      '.vexa-voice-intro-price{width:max-content;max-width:100%;min-height:29px;margin:0 auto 13px;padding:0 11px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(255,255,255,.065);box-shadow:inset 0 1px 0 rgba(255,255,255,.11),inset 0 -1px 0 rgba(255,255,255,.035);font-size:11px;font-weight:850;letter-spacing:-.015em;white-space:nowrap}' +
      '.vexa-voice-intro-card[dir="rtl"] .vexa-voice-intro-price{margin-left:auto;margin-right:auto}' +
      '.vexa-voice-intro-actions{display:grid;grid-template-columns:1fr;gap:8px;width:100%}' +
      '.vexa-voice-intro-action{position:relative;isolation:isolate;overflow:hidden;width:100%;height:42px;border:1px solid rgba(255,255,255,.72)!important;border-radius:999px;color:#050505!important;background:linear-gradient(180deg,#fff 0%,#fafafa 16%,#d0d0d0 43%,#f3f3f3 65%,#b8b8b8 100%)!important;box-shadow:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(0,0,0,.28),inset 0 0 15px rgba(255,255,255,.52),0 9px 23px rgba(0,0,0,.34)!important;font-size:12px!important;font-weight:850!important;letter-spacing:-.015em!important;transition:transform .18s cubic-bezier(.2,.9,.2,1),filter .18s ease!important}' +
      '.vexa-voice-intro-action:before{content:"";position:absolute;z-index:-1;left:7%;right:7%;top:1px;height:42%;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(255,255,255,.18),transparent);pointer-events:none}' +
      '.vexa-voice-intro-action:after{content:"";position:absolute;z-index:2;top:-35%;bottom:-35%;width:32%;left:-42%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);pointer-events:none}' +
      '.vexa-voice-intro-sheet.open .vexa-voice-intro-action:after{animation:vexaVoiceIntroShine 1.05s cubic-bezier(.16,1,.3,1) .18s both}' +
      '.vexa-voice-intro-sheet.open .vexa-voice-intro-never:after{animation-delay:.3s}' +
      '.vexa-voice-intro-action:active{transform:scale(.975);filter:brightness(.91)}' +
      '.vexa-voice-intro-card>*,.vexa-voice-intro-actions{opacity:0;transform:translateY(7px)}' +
      '.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*{animation:vexaVoiceIntroItemIn .42s cubic-bezier(.16,1,.3,1) both}' +
      '.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*:nth-child(1){animation-delay:.03s}.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*:nth-child(2){animation-delay:.07s}.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*:nth-child(3){animation-delay:.11s}.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*:nth-child(4){animation-delay:.15s}.vexa-voice-intro-sheet.open .vexa-voice-intro-card>*:nth-child(5){animation-delay:.19s}' +
      '@keyframes vexaVoiceIntroItemIn{to{opacity:1;transform:translateY(0)}}' +
      '@keyframes vexaVoiceIntroShine{0%{left:-42%;opacity:0}20%{opacity:1}100%{left:112%;opacity:0}}' +
      '@keyframes vexaVoiceIntroWave{0%,100%{transform:scaleY(.62);opacity:.6}50%{transform:scaleY(1.15);opacity:1}}' +
      '@media(prefers-reduced-motion:reduce){.vexa-voice-intro-card>*,.vexa-voice-intro-actions{opacity:1!important;transform:none!important;animation:none!important}.vexa-voice-intro-action:after,.vexa-voice-intro-miniwave i{animation:none!important}}';
    doc.head.appendChild(style);
  }

  function showVoiceIntroCard() {
    if (vexaVoiceIntroPromise) return vexaVoiceIntroPromise;

    vexaVoiceIntroPromise = new Promise((resolve) => {
      const host = hostWindow();
      const doc = host?.document;
      if (!doc?.body) {
        vexaVoiceIntroPromise = null;
        resolve(true);
        return;
      }

      installVoiceIntroStyles(doc);
      doc.getElementById("vexaVoiceIntroSheet")?.remove();

      const copy = voiceIntroCopy();
      const template = doc.getElementById("ttsLimitSheet");
      let sheet = template?.cloneNode?.(true);

      if (!sheet) {
        sheet = doc.createElement("div");
        sheet.className = "limit-sheet";
        sheet.innerHTML =
          '<button class="limit-backdrop" type="button"></button>' +
          '<div class="limit-card"><div class="limit-icon"><span>!</span></div><h3></h3><p></p><button class="limit-close" type="button"></button></div>';
      }

      sheet.id = "vexaVoiceIntroSheet";
      sheet.classList.remove("open");
      sheet.classList.add("vexa-voice-intro-sheet");
      sheet.setAttribute("aria-hidden", "true");

      const backdrop = sheet.querySelector(".limit-backdrop");
      const card = sheet.querySelector(".limit-card");
      const icon = sheet.querySelector(".limit-icon");
      const title = sheet.querySelector("h3");
      const text = sheet.querySelector("p");
      const originalButton = sheet.querySelector(".limit-close");

      if (!backdrop || !card || !icon || !title || !text || !originalButton) {
        vexaVoiceIntroPromise = null;
        resolve(true);
        return;
      }

      backdrop.removeAttribute("data-action");
      backdrop.removeAttribute("id");
      backdrop.setAttribute("aria-label", copy.close);
      card.removeAttribute("id");
      card.classList.remove("credit-warning-buy");
      card.classList.add("vexa-voice-intro-card");
      card.setAttribute("dir", copy.dir);
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      title.removeAttribute("id");
      text.removeAttribute("id");

      icon.classList.add("vexa-voice-intro-icon");
      icon.innerHTML = '<span class="vexa-voice-intro-miniwave" aria-hidden="true"><i></i><i></i><i></i></span>';
      title.textContent = copy.title;
      text.textContent = copy.body;

      const price = doc.createElement("div");
      price.className = "vexa-voice-intro-price";
      price.textContent = copy.price;

      const actions = doc.createElement("div");
      actions.className = "vexa-voice-intro-actions";

      const okay = originalButton;
      okay.removeAttribute("id");
      okay.removeAttribute("data-action");
      okay.className = "limit-close vexa-voice-intro-action vexa-voice-intro-okay";
      okay.type = "button";
      okay.textContent = copy.okay;
      okay.setAttribute("aria-label", copy.okay);

      const never = okay.cloneNode(false);
      never.className = "limit-close vexa-voice-intro-action vexa-voice-intro-never";
      never.textContent = copy.never;
      never.setAttribute("aria-label", copy.never);

      originalButton.replaceWith(price, actions);
      actions.append(okay, never);
      doc.body.appendChild(sheet);

      let settled = false;
      const finish = (allow, suppress) => {
        if (settled) return;
        settled = true;
        if (suppress) suppressVoiceIntro();
        sheet.classList.remove("open");
        sheet.setAttribute("aria-hidden", "true");
        try { haptic(allow ? "light" : "soft"); } catch (error) {}
        host.setTimeout(() => sheet.remove(), 280);
        host.setTimeout(() => {
          vexaVoiceIntroPromise = null;
          resolve(Boolean(allow));
        }, 120);
      };

      backdrop.addEventListener("click", () => finish(false, false), { once: true });
      okay.addEventListener("click", () => finish(true, false), { once: true });
      never.addEventListener("click", () => finish(true, true), { once: true });

      host.requestAnimationFrame(() => {
        host.requestAnimationFrame(() => {
          sheet.classList.add("open");
          sheet.setAttribute("aria-hidden", "false");
        });
      });
    });

    return vexaVoiceIntroPromise;
  }

`;
    result = result.replace(openMarker, introHelpers + openMarker);
  }

  // The same Voice button becomes the close/toggle control; no back button needed.
  result = result.replace(
    `      button.addEventListener("click", () => {
        if (shell.classList.contains("recording") || shell.classList.contains("processing")) return;
        haptic("medium");
        openVoiceMode().catch((error) => fail(error));
      });`,
    `      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (shell.classList.contains("recording") || shell.classList.contains("processing")) return;
        haptic("medium");
        if (state.active) {
          closeVoiceMode();
          return;
        }
        if (voiceIntroSuppressed()) {
          openVoiceMode().catch((error) => fail(error));
          return;
        }
        showVoiceIntroCard().then((allow) => {
          if (!allow || state.active) return;
          openVoiceMode().catch((error) => fail(error));
        });
      });`,
  );

  result = result.replace(
    `    state.active = true;
    state.captureEnabled = false;`,
    `    state.active = true;
    state.captureEnabled = false;
    q("vexaStt")?.classList.add("voice-active");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-pressed", "true");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-label", "Stop Vexa Voice");`,
  );

  result = result.replace(
    `    state.active = false;
    state.captureEnabled = false;
    closeSpeechEngine();`,
    `    state.active = false;
    state.captureEnabled = false;
    q("vexaStt")?.classList.remove("voice-active");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-pressed", "false");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-label", "Talk to Vexa");
    closeSpeechEngine();`,
  );

  return result;
}

function diagnoseVoiceFailures(source) {
  let result = String(source || "");

  result = result.replace(
    `  function fail(error) {
    if (!state.active) return;
    console.error("Vexa voice agent", error);
    state.captureEnabled = false;
    setPhase("error", "Connection issue", cleanError(error));
    haptic("error");
    window.setTimeout(() => {
      if (state.active && state.phase === "error") closeVoiceMode();
    }, 3200);
  }`,
    `  function fail(error) {
    if (!state.active) return;
    console.error("Vexa voice agent", error);
    state.captureEnabled = false;
    const message = cleanError(error);
    setPhase("error", "Error · " + message, "");
    haptic("error");
  }`,
  );

  result = result.replace(
    `    socket.addEventListener("close", () => {
      if (state.active && state.phase !== "error") fail(new Error("V3 voice connection closed"));
    });`,
    `    socket.addEventListener("close", (event) => {
      if (state.active && state.phase !== "error") {
        const code = Number(event?.code || 0);
        const reason = String(event?.reason || "").trim();
        const detail = reason || (code ? "WebSocket closed · " + code : "V3 voice connection closed");
        fail(new Error(detail));
      }
    });`,
  );

  result = result.replace(
    `    if (type.includes("error")) {
      fail(new Error(String(message?.message || message?.error || "V3 voice was interrupted")));
    }`,
    `    if (type.includes("error")) {
      const nested = message?.client_error_event || message?.error_event || {};
      const value = nested?.message ?? nested?.error ?? nested?.reason ?? nested?.code ?? message?.message ?? message?.error ?? "V3 voice was interrupted";
      let detail = "";
      try { detail = typeof value === "string" ? value : JSON.stringify(value); } catch (error) { detail = String(value || ""); }
      fail(new Error(detail || "V3 voice was interrupted"));
    }`,
  );

  result = result.replace(
    `      if (type.includes("error")) {
        clearVoiceResponseWatchdog();
        const messageText = String(message?.message || message?.error || "Voice connection failed");
        fail(new Error(messageText));
      }`,
    `      if (type.includes("error")) {
        clearVoiceResponseWatchdog();
        const nested = message?.client_error_event || message?.error_event || {};
        const value = nested?.message ?? nested?.error ?? nested?.reason ?? nested?.code ?? message?.message ?? message?.error ?? "Voice connection failed";
        let messageText = "";
        try { messageText = typeof value === "string" ? value : JSON.stringify(value); } catch (error) { messageText = String(value || ""); }
        fail(new Error(messageText || "Voice connection failed"));
      }`,
  );

  return result;
}

function browserVoiceRuntimeSource() {
  const raw = diagnoseVoiceFailures(
    makeInlineVoice(
      restoreOriginalOrb(VEXA_VOICE_AGENT_SOURCE),
    ),
  );
  const exportMarker = "\nexport const VEXA_VOICE_AGENT_JS";
  const exportIndex = raw.lastIndexOf(exportMarker);
  const browserBody = exportIndex >= 0 ? raw.slice(0, exportIndex) : raw;

  return (
    "try{window.__vexaVoiceRuntimeVersion=" +
    JSON.stringify(VEXA_VOICE_AGENT_VERSION) +
    ";window.__vexaVoiceRuntimeError=\"\";window.__vexaVoiceRuntimeStarted=false;}catch(error){}\n" +
    browserBody +
    "\n;try{vexaVoiceAgentBootstrap();window.__vexaVoiceRuntimeStarted=true;}catch(error){" +
    "try{window.__vexaVoiceRuntimeError=String(error&&error.message||error||\"Voice runtime failed\");}catch(ignore){}" +
    "try{console.error(\"Vexa voice runtime\",error);}catch(ignore){}" +
    "}"
  );
}

function voiceRuntimeResponse() {
  return new Response(browserVoiceRuntimeSource(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Vexa-Voice-Agent": VEXA_VOICE_AGENT_VERSION,
    },
  });
}

async function refineLiveIntegration(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();

  // Put the transcript/editor content lower without moving the bottom controls.
  source = source.replace(
    "margin-top:-4px;transition:opacity",
    "margin-top:18px;transition:opacity",
  );

  // Make Tap to speak read more like polished metal without changing its size/layout.
  source = source.replace(
    "background:linear-gradient(180deg,#fff 0%,#f4f4f4 48%,#d9d9d9 100%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.34),0 0 24px rgba(255,255,255,.07)",
    "background:linear-gradient(180deg,#fff 0%,#fbfbfb 16%,#d2d2d2 43%,#f4f4f4 66%,#b9b9b9 100%);border:1px solid rgba(255,255,255,.34);box-shadow:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(0,0,0,.3),inset 0 0 15px rgba(255,255,255,.46),0 9px 25px rgba(0,0,0,.38),0 0 26px rgba(255,255,255,.09)",
  );
  source = source.replace(
    '.vexa-stt-record::before{content:"";position:absolute;left:9%;right:9%;top:1px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent);opacity:.92}',
    '.vexa-stt-record::before{content:"";position:absolute;left:7%;right:7%;top:1px;height:38%;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.16),transparent);opacity:.76}',
  );

  // During transcription: no waveform/center line. Only a spinner on the main button.
  source = source.replace(
    '".vexa-stt.recording .vexa-stt-wave-stage,.vexa-stt.processing .vexa-stt-wave-stage{opacity:1;transform:translate(-50%,0) scale(1)}",',
    '".vexa-stt.recording .vexa-stt-wave-stage{opacity:1;transform:translate(-50%,0) scale(1)}",',
  );
  source = source.replace(
    '".vexa-stt-spinner{display:none!important}",',
    '".vexa-stt-spinner{position:absolute;z-index:2;width:18px;height:18px;border-radius:50%;border:1.8px solid rgba(0,0,0,.16);border-top-color:#050505;opacity:0;animation:vexaSttSpin .7s linear infinite}",\n      ".vexa-stt.processing .vexa-stt-spinner{opacity:1}",',
  );
  source = source.replace(
    /      "\.vexa-stt\.processing \.vexa-stt-record::after\{[^\n]*\}",\n/,
    '      ".vexa-stt.processing .vexa-stt-record::after{content:none!important}",\n',
  );
  source = source.replace(
    /      "\.vexa-stt\.processing \.vexa-stt-wave-stage\{[^\n]*\}",\n/,
    '      ".vexa-stt.processing .vexa-stt-wave-stage{display:none!important}",\n',
  );
  source = source
    .split("\n")
    .filter((line) => {
      if (line.includes('".vexa-stt.processing .vexa-stt-wave-track')) return false;
      if (line.includes('".vexa-stt.processing .vexa-stt-wave-caption')) return false;
      if (line.includes('"@keyframes vexaSttProcessingTravel')) return false;
      if (line.includes('"@keyframes vexaSttProcessingPulse')) return false;
      if (line.includes('"@keyframes vexaSttProcessing{')) return false;
      if (line.includes('"@keyframes vexaSttButtonState')) return false;
      return true;
    })
    .join("\n");
  source = source.replace(
    '      "@keyframes vexaSttTextIn{0%{opacity:.08;transform:translateY(9px)}100%{opacity:1;transform:none}}",',
    '      "@keyframes vexaSttTextIn{0%{opacity:.08;transform:translateY(9px)}100%{opacity:1;transform:none}}",\n      "@keyframes vexaSttSpin{to{transform:rotate(360deg)}}",',
  );

  // Prime the analyser AudioContext from the tap gesture for iOS/Telegram WebView.
  source = source.replace(
    `    cleanupRecording(false);
    setStatus(doc, "Requesting microphone…", true);`,
    `    cleanupRecording(false);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        recorderContext = new AudioContextClass();
        if (recorderContext.state === "suspended") {
          const resumed = recorderContext.resume();
          if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
        }
      } catch (error) {
        recorderContext = null;
      }
    }

    setStatus(doc, "Requesting microphone…", true);`,
  );

  source = source.replace(
    `      recorderContext = new AudioContextClass();
      recorderAnalyser = recorderContext.createAnalyser();`,
    `      recorderContext = recorderContext && recorderContext.state !== "closed"
        ? recorderContext
        : new AudioContextClass();
      if (recorderContext.state === "suspended") {
        try {
          const resumed = recorderContext.resume();
          if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
        } catch (error) {}
      }
      recorderAnalyser = recorderContext.createAnalyser();`,
  );

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Live-Fix", VEXA_VOICE_AGENT_VERSION);

  return new Response(source, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
