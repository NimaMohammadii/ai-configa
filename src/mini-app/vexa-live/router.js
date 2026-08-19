import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { handleMiniAppRequest } from "../server.js";
import { getVexaLiveAccessSettings } from "./access.js";

const LIVE_ROOT = "/mini-app/live";
const INTEGRATION_VERSION = "20260819-3";
const VOICE_RUNTIME_VERSION = "20260818-1";
const SCRIBE_MODEL = "scribe_v2";

const VEXA_LIVE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover,interactive-widget=overlays-content" />
  <meta name="theme-color" content="#000000" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <style>
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;width:100%;height:100%;min-height:100%;background:#000;color:#fff;overflow:hidden;overscroll-behavior:none}
    body{min-height:100dvh}
    .live-app{position:relative;width:100%;height:100%;min-height:100dvh;background:#000;overflow:hidden}
  </style>
</head>
<body>
  <main class="live-app"></main>
  <script id="vexaVoiceRuntime" src="/mini-app/live/voice-agent-runtime.js?v=${VOICE_RUNTIME_VERSION}"></script>
</body>
</html>`;

const VEXA_LIVE_INLINE_INTEGRATION_JS = String.raw`
(function () {
  const BUTTON_ID = "vexaLiveOpen";
  const WORKSPACE_ID = "vexaLiveWorkspace";
  const BATCH_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
  const BATCH_SCRIBE_MODEL = "scribe_v2";
  const KEYBOARD_LOCK_CLASS = "vexa-live-keyboard-lock";
  const KEYBOARD_LOCK_STYLE_ID = "vexaLiveKeyboardViewportLock";
  let liveOpen = false;
  let liveFrame = null;
  let recorder = null;
  let recorderStream = null;
  let recorderContext = null;
  let recorderAnalyser = null;
  let recorderSource = null;
  let recorderChunks = [];
  let recorderStartedAt = 0;
  let recorderTimer = 0;
  let waveFrame = 0;
  let waveData = null;
  let transcribing = false;
  let liveKeyboardActive = false;
  let liveKeyboardSession = false;
  let liveKeyboardViewportHeight = 0;
  let liveKeyboardDoc = null;
  let liveKeyboardButton = null;
  let liveKeyboardViewportBound = false;

  function requestedSection() {
    let raw = "";
    const tg = window.Telegram && window.Telegram.WebApp;
    try {
      raw = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || "";
    } catch (error) {}
    if (!raw) {
      try {
        const params = new URLSearchParams(window.location.search);
        raw = params.get("tgWebAppStartParam") ||
          params.get("startapp") ||
          params.get("section") ||
          "";
      } catch (error) {}
    }
    return String(raw || "").trim().toLowerCase();
  }

  function telegram() {
    return window.Telegram && window.Telegram.WebApp;
  }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try {
      tg.HapticFeedback.impactOccurred(style || "light");
    } catch (error) {}
  }

  function hideTelegramBackButton() {
    const tg = telegram();
    if (!tg || !tg.BackButton || !tg.BackButton.hide) return;
    try {
      tg.BackButton.hide();
    } catch (error) {}
  }

  function initData() {
    const tg = telegram();
    return tg && tg.initData ? String(tg.initData) : "";
  }

  function installWorkspace() {
    const existing = document.getElementById(WORKSPACE_ID);
    if (existing) return existing;

    const page = document.querySelector(".tts-page");
    if (!page) return null;

    const workspace = document.createElement("section");
    workspace.id = WORKSPACE_ID;
    workspace.setAttribute("aria-hidden", "true");
    workspace.style.cssText =
      "position:absolute;z-index:34;left:0;right:0;top:50px;bottom:0;" +
      "display:block;overflow:hidden;background:#000;opacity:0;" +
      "transform:translateX(34px) scale(.985);pointer-events:none;" +
      "transition:opacity .28s ease,transform .46s cubic-bezier(.16,.86,.22,1);";

    page.appendChild(workspace);
    return workspace;
  }

  function currentLiveViewportHeight() {
    const viewport = window.visualViewport;
    const height = Number(viewport && viewport.height || window.innerHeight || 0);
    return Number.isFinite(height) && height > 0 ? height : 0;
  }

  function currentParentLayoutHeight() {
    let value = 0;
    try {
      value = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-height")
      );
    } catch (error) {}
    if (Number.isFinite(value) && value >= 320) return value;

    const rect = document.documentElement.getBoundingClientRect();
    value = Number(rect && rect.height || window.innerHeight || 0);
    return Number.isFinite(value) && value >= 320 ? value : 0;
  }

  function ensureLiveKeyboardParentStyle() {
    if (document.getElementById(KEYBOARD_LOCK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = KEYBOARD_LOCK_STYLE_ID;
    style.textContent =
      "html." + KEYBOARD_LOCK_CLASS +
      "{--app-viewport-height:var(--vexa-live-parent-height)!important}";
    document.head.appendChild(style);
  }

  function beginLiveKeyboardSession() {
    if (!liveOpen || liveKeyboardSession) return;
    const parentHeight = currentParentLayoutHeight();
    if (parentHeight < 320) return;

    ensureLiveKeyboardParentStyle();
    liveKeyboardSession = true;
    liveKeyboardViewportHeight = currentLiveViewportHeight();
    document.documentElement.style.setProperty(
      "--vexa-live-parent-height",
      String(Math.round(parentHeight)) + "px"
    );
    document.documentElement.classList.add(KEYBOARD_LOCK_CLASS);
  }

  function endLiveKeyboardSession() {
    if (!liveKeyboardSession) return;
    liveKeyboardSession = false;
    liveKeyboardActive = false;
    liveKeyboardViewportHeight = 0;

    document.documentElement.classList.remove(KEYBOARD_LOCK_CLASS);
    document.documentElement.style.removeProperty("--vexa-live-parent-height");

    const shell = liveKeyboardDoc && liveKeyboardDoc.getElementById("vexaStt");
    if (shell) {
      shell.classList.remove("keyboard-open");
      shell.style.removeProperty("--vexa-keyboard-top");
    }

    window.requestAnimationFrame(function () {
      try { window.dispatchEvent(new Event("resize")); } catch (error) {}
    });
  }

  function visibleKeyboardBottom() {
    const viewport = window.visualViewport;
    if (viewport) {
      const value = Number(viewport.offsetTop || 0) + Number(viewport.height || 0);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const height = Number(window.innerHeight || 0);
    return Number.isFinite(height) && height > 0 ? height : 0;
  }

  function syncLiveKeyboardPosition() {
    if (!liveKeyboardSession || !liveKeyboardActive || !liveKeyboardDoc || !liveKeyboardButton) return;
    const workspace = document.getElementById(WORKSPACE_ID);
    const shell = liveKeyboardDoc.getElementById("vexaStt");
    if (!workspace || !shell) return;

    const rect = workspace.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const visibleBottom = visibleKeyboardBottom();
    const relativeBottom = visibleBottom > 0 ? visibleBottom - Number(rect.top || 0) : Number(shellRect.height || 0);
    const maximum = Math.max(10, Number(shellRect.height || 0) - 56);
    const top = Math.max(10, Math.min(maximum, relativeBottom - 56));
    shell.style.setProperty("--vexa-keyboard-top", Math.round(top) + "px");
  }

  function handleLiveKeyboardViewport() {
    if (!liveKeyboardSession || !liveKeyboardDoc) return;
    const textarea = liveKeyboardDoc.getElementById("vexaSttText");
    const focused = Boolean(textarea && liveKeyboardDoc.activeElement === textarea);

    if (focused) {
      liveKeyboardActive = true;
      syncLiveKeyboardPosition();
      return;
    }

    liveKeyboardActive = false;
    const height = currentLiveViewportHeight();
    const recoveredHeight = Math.max(320, liveKeyboardViewportHeight - 24);
    if (!liveKeyboardViewportHeight || height >= recoveredHeight) endLiveKeyboardSession();
  }

  function bindLiveKeyboardViewport() {
    if (liveKeyboardViewportBound) return;
    liveKeyboardViewportBound = true;
    const viewportSource = window.visualViewport || window;
    viewportSource.addEventListener("resize", handleLiveKeyboardViewport, { passive: true });
  }

  function installLiveKeyboard(frame, doc) {
    const textarea = doc && doc.getElementById("vexaSttText");
    const button = doc && doc.getElementById("vexaKeyboardDismiss");
    if (!frame || !textarea || !button) return;
    if (textarea.getAttribute("data-vexa-keyboard") === "ready") return;
    textarea.setAttribute("data-vexa-keyboard", "ready");
    liveKeyboardDoc = doc;
    liveKeyboardButton = button;
    bindLiveKeyboardViewport();

    textarea.addEventListener("pointerdown", function () {
      if (!liveOpen || liveKeyboardSession) return;
      beginLiveKeyboardSession();
    }, { capture: true });

    textarea.addEventListener("focus", function () {
      if (!liveOpen) return;
      if (!liveKeyboardSession) beginLiveKeyboardSession();
      liveKeyboardActive = true;
      const shell = doc.getElementById("vexaStt");
      if (shell) shell.classList.add("keyboard-open");
      syncLiveKeyboardPosition();
    });

    textarea.addEventListener("blur", function () {
      liveKeyboardActive = false;
      const shell = doc.getElementById("vexaStt");
      if (shell) {
        shell.classList.remove("keyboard-open");
        shell.style.removeProperty("--vexa-keyboard-top");
      }
      window.requestAnimationFrame(handleLiveKeyboardViewport);
    });

    button.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      haptic("light");
      try { textarea.blur(); } catch (error) {}
    });
  }

  function embeddedStyle() {
    return [
      "html,body{height:100%!important;min-height:100%!important;overflow:hidden!important;background:#000!important}",
      ".live-app{width:100%!important;height:100%!important;min-height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important}",
      ".vexa-stt{--stt-ease:cubic-bezier(.16,.86,.22,1);position:relative;width:100%;height:100%;min-height:100%;display:flex;flex-direction:column;padding:0 16px calc(82px + env(safe-area-inset-bottom));overflow:hidden;background:#000;color:#fff;opacity:0;transform:translateX(24px) scale(.988);transition:opacity .34s ease,transform .5s var(--stt-ease)}",
      ".vexa-stt.ready{opacity:1;transform:translateX(0) scale(1)}",
      ".vexa-stt-top{display:none!important}",
      ".vexa-stt-kicker{display:flex;align-items:center;gap:7px;color:rgba(255,255,255,.42);font-size:9px;font-weight:720;letter-spacing:.13em;text-transform:uppercase}",
      ".vexa-stt-kicker i{width:5px;height:5px;border-radius:50%;background:#fff;opacity:.7;box-shadow:0 0 12px rgba(255,255,255,.3)}",
      ".vexa-stt-engine{height:24px;padding:0 8px;display:flex;align-items:center;color:rgba(255,255,255,.38);font-size:8.5px;font-weight:650;white-space:nowrap}",
      ".vexa-stt-editor{position:relative;flex:1;min-height:0;overflow:hidden;margin-top:-4px;transition:opacity .28s ease,transform .42s var(--stt-ease),filter .3s ease}",
      ".vexa-stt-label{display:flex;align-items:center;justify-content:space-between;gap:10px;height:30px;color:rgba(255,255,255,.36);font-size:9px;font-weight:720;letter-spacing:.08em;text-transform:uppercase}",
      ".vexa-stt-language{font-size:8.5px;font-weight:620;letter-spacing:0;text-transform:none;color:rgba(255,255,255,.3);opacity:0;transform:translateY(-3px);transition:opacity .2s ease,transform .3s var(--stt-ease)}",
      ".vexa-stt-language.show{opacity:1;transform:none}",
      ".vexa-stt textarea{display:block;width:100%;height:calc(100% - 30px);min-height:160px;resize:none;overflow:auto;border:0!important;outline:0!important;background:transparent!important;color:#fff;padding:0!important;font:430 16px/1.55 \"SF Pro Display\",\"SF Pro Text\",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif;letter-spacing:-.02em;caret-color:#fff;scrollbar-width:none;transition:opacity .24s ease,transform .36s var(--stt-ease)}",
      ".vexa-stt textarea::-webkit-scrollbar{display:none}",
      ".vexa-stt textarea::placeholder{color:rgba(255,255,255,.26)}",
      ".vexa-stt.has-result textarea{animation:vexaSttTextIn .48s var(--stt-ease)}",
      ".vexa-stt.recording .vexa-stt-editor{opacity:.35;transform:translateY(-7px) scale(.985);filter:blur(.15px)}",
      ".vexa-stt-wave-stage{position:absolute;z-index:4;left:50%;bottom:100px;width:100vw;max-width:560px;height:132px;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;opacity:0;transform:translate(-50%,18px) scale(.965);transition:opacity .24s ease,transform .48s var(--stt-ease);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%)}",
      ".vexa-stt.recording .vexa-stt-wave-stage,.vexa-stt.processing .vexa-stt-wave-stage{opacity:1;transform:translate(-50%,0) scale(1)}",
      ".vexa-stt-wave-track{width:calc(100% + 20px);height:94px;display:flex;align-items:center;justify-content:center;gap:2.5px;padding:0 5px;filter:drop-shadow(0 0 10px rgba(255,255,255,.08))}",
      ".vexa-stt-wave-track i{display:block;width:2.6px;flex:0 0 2.6px;height:72px;border-radius:999px;background:#fff;opacity:.82;transform:scaleY(.08);transform-origin:center;will-change:transform,opacity;transition:transform .055s linear,opacity .12s ease}",
      ".vexa-stt.processing .vexa-stt-wave-track i{animation:vexaSttProcessing .78s ease-in-out infinite}",
      ".vexa-stt-wave-caption{position:absolute;left:50%;bottom:4px;display:flex;align-items:center;gap:7px;color:rgba(255,255,255,.46);font-size:9px;font-weight:680;letter-spacing:.02em;transform:translateX(-50%);white-space:nowrap}",
      ".vexa-stt-wave-caption strong{color:#fff;font-size:10px;font-weight:720;font-variant-numeric:tabular-nums}",
      ".vexa-stt-controls{position:absolute;z-index:7;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:8px;align-items:center;transition:transform .42s var(--stt-ease),opacity .24s ease}",
      ".vexa-stt-record,.vexa-stt-upload{height:42px;min-height:42px;border:0;outline:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:13px;transition:transform .2s var(--stt-ease),box-shadow .24s ease,opacity .2s ease,background .24s ease,color .24s ease}",
      ".vexa-stt-record{position:relative;color:#050505;background:linear-gradient(180deg,#fff 0%,#f4f4f4 48%,#d9d9d9 100%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.34),0 0 24px rgba(255,255,255,.07);font-size:12.5px;font-weight:760;letter-spacing:-.015em}",
      ".vexa-stt-record::before{content:\"\";position:absolute;left:9%;right:9%;top:1px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent);opacity:.92}",
      ".vexa-stt-record:active,.vexa-stt-upload:active{transform:scale(.97)}",
      ".vexa-stt-record-inner{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .18s ease,transform .28s var(--stt-ease)}",
      ".vexa-stt-record-icon{position:relative;width:18px;height:18px;display:grid;place-items:center}",
      ".vexa-stt-record-icon svg{width:18px;height:18px;transition:opacity .2s ease,transform .32s var(--stt-ease)}",
      ".vexa-stt-stop-shape{position:absolute;width:10px;height:10px;border-radius:3px;background:#050505;opacity:0;transform:scale(.55) rotate(-12deg);transition:opacity .2s ease,transform .32s var(--stt-ease)}",
      ".vexa-stt.recording .vexa-stt-record-icon svg{opacity:0;transform:translateY(-8px) scale(.7)}",
      ".vexa-stt.recording .vexa-stt-stop-shape{opacity:1;transform:scale(1) rotate(0)}",
      ".vexa-stt.recording .vexa-stt-record{box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(0,0,0,.16),0 12px 30px rgba(0,0,0,.36),0 0 34px rgba(255,255,255,.13)}",
      ".vexa-stt.processing .vexa-stt-record{pointer-events:none}",
      ".vexa-stt-spinner{display:none!important}",
      ".vexa-stt-upload{position:relative;padding:0;color:rgba(255,255,255,.82);background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .3s cubic-bezier(.16,1,.3,1),background .24s ease,box-shadow .24s ease}",
      ".vexa-stt-upload svg{display:none!important}",
      ".vexa-stt-upload::before,.vexa-stt-upload::after{content:\"\";position:absolute;left:50%;top:50%;width:18px;height:2.5px;border-radius:999px;background:currentColor;transform:translate(-50%,-50%);transition:transform .34s cubic-bezier(.16,1,.3,1),opacity .2s ease}",
      ".vexa-stt-upload::after{transform:translate(-50%,-50%) rotate(90deg)}",
      ".vexa-stt-upload:active{transform:scale(.88) rotate(-2deg)!important;background:rgba(24,24,24,.82);box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.07),inset 0 0 18px rgba(255,255,255,.065),0 5px 13px rgba(0,0,0,.25)}",
      ".vexa-stt-upload:active::before{transform:translate(-50%,-50%) rotate(90deg) scale(.78)}",
      ".vexa-stt-upload:active::after{transform:translate(-50%,-50%) rotate(180deg) scale(.78)}",
      ".vexa-stt.recording .vexa-stt-upload,.vexa-stt.processing .vexa-stt-upload{opacity:.28;pointer-events:none;transform:scale(.92)}",
      ".vexa-stt-status{position:absolute;z-index:6;left:50%;bottom:calc(65px + env(safe-area-inset-bottom));max-width:calc(100% - 32px);height:24px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.38);font-size:8.7px;font-weight:650;white-space:nowrap;opacity:0;transform:translate(-50%,5px);transition:opacity .2s ease,transform .3s var(--stt-ease)}",
      ".vexa-stt-status.show{opacity:1;transform:translate(-50%,0)}",
      ".vexa-keyboard-dismiss{position:absolute;z-index:30;right:22px;top:var(--vexa-keyboard-top,calc(100% - 58px));width:42px;height:42px;border:0;border-radius:15px;padding:0;display:grid;place-items:center;color:#fff;background:rgba(13,13,13,.62);opacity:0;transform:translateY(12px) scale(.92);pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:opacity .18s ease,transform .2s cubic-bezier(.2,.8,.2,1)}",
      ".vexa-stt.keyboard-open .vexa-keyboard-dismiss{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}",
      ".vexa-stt.keyboard-open .vexa-keyboard-dismiss svg{animation:vexaKeyboardArrow .95s ease-in-out infinite}",
      ".vexa-stt.processing .vexa-stt-record-inner{opacity:0;transform:scale(.98)}",
      ".vexa-stt.processing .vexa-stt-record::after{content:\"Transcribing\";position:absolute;z-index:2;inset:0;display:grid;place-items:center;color:#050505;font-size:12.5px;font-weight:760;letter-spacing:-.015em;animation:vexaSttButtonState .3s cubic-bezier(.16,1,.3,1) both}",
      ".vexa-stt.processing .vexa-stt-status{opacity:0!important;transform:translate(-50%,5px)!important}",
      ".vexa-stt.processing .vexa-stt-wave-stage{height:62px;bottom:90px;transform:translate(-50%,0) scale(1)}",
      ".vexa-stt.processing .vexa-stt-wave-track{position:relative;width:100%;height:30px;display:flex;align-items:center;justify-content:center;gap:3px;padding:0;filter:none;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 9%,#000 91%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 9%,#000 91%,transparent 100%)}",
      ".vexa-stt.processing .vexa-stt-wave-track::before{content:\"\";position:absolute;z-index:0;left:7%;right:7%;top:50%;height:1px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.11) 12%,rgba(255,255,255,.24) 50%,rgba(255,255,255,.11) 88%,transparent);transform:translateY(-50%)}",
      ".vexa-stt.processing .vexa-stt-wave-track::after{display:none}",
      ".vexa-stt.processing .vexa-stt-wave-track i{position:relative;z-index:1;left:calc(-50% - 54px);display:block;width:2.4px;flex:0 0 2.4px;border-radius:999px;background:#fff;transform-origin:center;will-change:left,transform,opacity;animation:vexaSttProcessingTravel 2.4s linear infinite,vexaSttProcessingPulse .68s ease-in-out infinite}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(n+19){display:none!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+1){height:8px!important;animation-delay:0s,-.56s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+2){height:13px!important;animation-delay:0s,-.49s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+3){height:18px!important;animation-delay:0s,-.42s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+4){height:11px!important;animation-delay:0s,-.35s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+5){height:16px!important;animation-delay:0s,-.28s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+6){height:9px!important;animation-delay:0s,-.21s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n+7){height:14px!important;animation-delay:0s,-.14s!important}",
      ".vexa-stt.processing .vexa-stt-wave-track i:nth-child(8n){height:20px!important;animation-delay:0s,-.07s!important}",
      ".vexa-stt.processing .vexa-stt-wave-caption{display:none!important}",
      "@keyframes vexaKeyboardArrow{0%,100%{transform:translateY(-1px)}50%{transform:translateY(4px)}}",
      "@keyframes vexaSttTextIn{0%{opacity:.08;transform:translateY(9px)}100%{opacity:1;transform:none}}",
      "@keyframes vexaSttProcessing{0%,100%{transform:scaleY(.1);opacity:.34}50%{transform:scaleY(.82);opacity:.92}}",
      "@keyframes vexaSttProcessingTravel{0%{left:calc(-50% - 54px)}100%{left:calc(50% + 54px)}}",
      "@keyframes vexaSttProcessingPulse{0%,100%{transform:scaleY(.65);opacity:.55}50%{transform:scaleY(1.15);opacity:1}}",
      "@keyframes vexaSttButtonState{from{opacity:0;transform:translateY(3px) scale(.98)}to{opacity:1;transform:none}}",
      "@media(max-height:680px){.vexa-stt-wave-stage{bottom:104px;height:104px}.vexa-stt-wave-track{height:76px}.vexa-stt-wave-track i{height:58px}.vexa-stt-controls{bottom:calc(18px + env(safe-area-inset-bottom))}.vexa-stt-status{bottom:calc(73px + env(safe-area-inset-bottom))}}",
      "@media(prefers-reduced-motion:reduce){.vexa-stt,.vexa-stt-editor,.vexa-stt-wave-stage,.vexa-stt-record,.vexa-stt-upload,.vexa-stt-language,.vexa-stt textarea{transition:none!important;animation:none!important}.vexa-stt.processing .vexa-stt-wave-track i{animation:none!important;left:0!important;opacity:.72!important}.vexa-stt.processing .vexa-stt-wave-track i:nth-child(n+13){display:none!important}}"
    ].join("");
  }

  function prepareEmbeddedFrame(frame) {
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (doc && doc.head && !doc.getElementById("vexaLiveInlineEmbedStyle")) {
        const style = doc.createElement("style");
        style.id = "vexaLiveInlineEmbedStyle";
        style.textContent = embeddedStyle();
        doc.head.appendChild(style);
      }
      installTranscribeExperience(frame);
    } catch (error) {}
    hideTelegramBackButton();
  }

  function ensureFrame() {
    if (liveFrame) return liveFrame;
    const workspace = installWorkspace();
    if (!workspace) return null;

    const frame = document.createElement("iframe");
    frame.id = "vexaLiveInlineFrame";
    frame.src = "/mini-app/live";
    frame.title = "Vexa Live";
    frame.setAttribute("aria-label", "Vexa Live speech to text");
    frame.setAttribute("allow", "microphone");
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#000;";
    frame.addEventListener("load", function () {
      prepareEmbeddedFrame(frame);
    });
    workspace.appendChild(frame);
    liveFrame = frame;
    return frame;
  }

  function installTranscribeExperience(frame) {
    const doc = frame && frame.contentDocument;
    if (!doc || !doc.body) return;
    if (doc.getElementById("vexaStt")) return;

    doc.body.classList.add("vexa-stt-embedded");
    const root = doc.querySelector(".live-app") || doc.body;
    const shell = doc.createElement("section");
    shell.id = "vexaStt";
    shell.className = "vexa-stt";
    shell.setAttribute("aria-label", "Speech to text");
    shell.innerHTML =
      '<div class="vexa-stt-top">' +
        '<span class="vexa-stt-kicker"><i></i>Speech to text</span>' +
        '<span class="vexa-stt-engine">Scribe v2 · Auto</span>' +
      '</div>' +
      '<div class="vexa-stt-editor">' +
        '<div class="vexa-stt-label"><span>Transcript</span><span id="vexaSttLanguage" class="vexa-stt-language"></span></div>' +
        '<textarea id="vexaSttText" dir="auto" spellcheck="true" autocapitalize="sentences" placeholder="Your transcript will appear here…" aria-label="Transcript"></textarea>' +
      '</div>' +
      '<div class="vexa-stt-wave-stage" aria-hidden="true">' +
        '<div id="vexaSttWave" class="vexa-stt-wave-track"></div>' +
        '<div class="vexa-stt-wave-caption"><span id="vexaSttWaveLabel">Listening</span><strong id="vexaSttTimer">0:00</strong></div>' +
      '</div>' +
      '<div id="vexaSttStatus" class="vexa-stt-status" role="status" aria-live="polite"></div>' +
      '<button id="vexaKeyboardDismiss" class="vexa-keyboard-dismiss" type="button" aria-label="Hide keyboard"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<div class="vexa-stt-controls">' +
        '<button id="vexaSttRecord" class="vexa-stt-record" type="button" aria-label="Start recording">' +
          '<span class="vexa-stt-record-inner">' +
            '<span class="vexa-stt-record-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none"><rect x="8.2" y="3" width="7.6" height="12" rx="3.8" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>' +
              '<i class="vexa-stt-stop-shape"></i>' +
            '</span>' +
            '<span id="vexaSttRecordLabel">Tap to speak</span>' +
          '</span>' +
          '<span class="vexa-stt-spinner" aria-hidden="true"></span>' +
        '</button>' +
        '<button id="vexaSttUpload" class="vexa-stt-upload" type="button" aria-label="Upload audio or video">' +
          '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4m0 0L8.4 7.6M12 4l3.6 3.6M5 13.5v3.2A2.3 2.3 0 0 0 7.3 19h9.4a2.3 2.3 0 0 0 2.3-2.3v-3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<input id="vexaSttFile" type="file" accept="audio/*,video/*" hidden>' +
      '</div>';

    root.replaceChildren(shell);
    buildWaveBars(doc);
    installLiveKeyboard(frame, doc);

    const record = doc.getElementById("vexaSttRecord");
    const upload = doc.getElementById("vexaSttUpload");
    const input = doc.getElementById("vexaSttFile");

    if (record) {
      record.addEventListener("click", function () {
        if (transcribing) return;
        if (recorder && recorder.state === "recording") {
          stopRecordingAndTranscribe(doc).catch(function (error) {
            showSttError(doc, error);
          });
        } else {
          startRecording(doc).catch(function (error) {
            showSttError(doc, error);
          });
        }
      });
    }

    if (upload && input) {
      upload.addEventListener("click", function () {
        if (!transcribing && (!recorder || recorder.state !== "recording")) input.click();
      });
      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        transcribeFile(file, doc).catch(function (error) {
          showSttError(doc, error);
        });
      });
    }

    requestAnimationFrame(function () {
      shell.classList.add("ready");
    });
  }

  function buildWaveBars(doc) {
    const track = doc.getElementById("vexaSttWave");
    if (!track) return;
    const width = Math.max(300, Math.min(560, frameWidth()));
    const count = Math.max(58, Math.min(104, Math.round(width / 4.6)));
    const fragment = doc.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const bar = doc.createElement("i");
      bar.style.animationDelay = String(-(i % 13) * 0.047) + "s";
      fragment.appendChild(bar);
    }
    track.appendChild(fragment);
  }

  function frameWidth() {
    try {
      return liveFrame && liveFrame.clientWidth ? liveFrame.clientWidth : window.innerWidth;
    } catch (error) {
      return window.innerWidth;
    }
  }

  async function sttApi(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(Object.assign({ initData: initData() }, body || {})),
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Could not start transcription");
    return data;
  }

  async function transcribeFile(file, doc) {
    if (transcribing || !file) return;
    const type = String(file.type || "").toLowerCase();
    if (type && !type.startsWith("audio/") && !type.startsWith("video/")) {
      throw new Error("Choose an audio or video file");
    }

    transcribing = true;
    setSttState(doc, "processing");
    setStatus(doc, "Reading " + shortFileName(file.name || "media"), true);
    setWaveLabel(doc, "Transcribing");
    haptic("light");

    try {
      const tokenData = await sttApi("/mini-app/live/api/scribe-token", { mode: "transcribe" });
      const form = new FormData();
      form.append("file", file, file.name || "media");
      form.append("model_id", tokenData.modelId || BATCH_SCRIBE_MODEL);
      form.append("timestamps_granularity", "word");
      form.append("tag_audio_events", "false");
      form.append("diarize", "false");
      form.append("no_verbatim", "true");

      const response = await fetch(
        BATCH_SCRIBE_URL + "?token=" + encodeURIComponent(String(tokenData.token || "")),
        { method: "POST", body: form }
      );
      const data = await response.json().catch(function () { return {}; });

      if (!response.ok) {
        const detail = data && data.detail && data.detail.message || data.detail || data.message || data.error || "Could not transcribe this file";
        throw new Error(typeof detail === "string" ? detail : "Could not transcribe this file");
      }

      const text = transcriptText(data);
      if (!text) throw new Error("No speech was found");
      renderTranscript(doc, text, data.language_code || data.language || "");
      setStatus(doc, "Transcript ready", true);
      haptic("medium");
    } finally {
      transcribing = false;
      setSttState(doc, "idle");
      setWaveLabel(doc, "Listening");
    }
  }

  function transcriptText(data) {
    const direct = String(data && data.text || "").trim();
    if (direct) return direct;
    const words = Array.isArray(data && data.words) ? data.words : [];
    return words.map(function (word) {
      return String(word && (word.text || word.word) || "");
    }).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
  }

  function renderTranscript(doc, text, language) {
    const shell = doc.getElementById("vexaStt");
    const textarea = doc.getElementById("vexaSttText");
    const label = doc.getElementById("vexaSttLanguage");
    if (!shell || !textarea) return;

    shell.classList.remove("has-result");
    textarea.value = String(text || "");
    textarea.scrollTop = 0;
    void shell.offsetWidth;
    shell.classList.add("has-result");

    if (label) {
      const code = String(language || "").trim().toUpperCase();
      label.textContent = code ? "Detected · " + code : "";
      label.classList.toggle("show", Boolean(code));
    }
  }

  function shortFileName(value) {
    const name = String(value || "media");
    if (name.length <= 30) return name;
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    return name.slice(0, Math.max(12, 27 - ext.length)) + "…" + ext;
  }

  async function startRecording(doc) {
    if (transcribing || (recorder && recorder.state === "recording")) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Microphone recording is not supported on this device");
    }

    cleanupRecording(false);
    setStatus(doc, "Requesting microphone…", true);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    recorderStream = stream;
    recorderChunks = [];
    const mimeType = preferredRecorderMime();
    recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) recorderChunks.push(event.data);
    };

    setupAnalyser(stream, doc);
    recorderStartedAt = Date.now();
    recorder.start(250);
    updateRecorderTimer(doc);
    recorderTimer = window.setInterval(function () { updateRecorderTimer(doc); }, 250);
    setSttState(doc, "recording");
    setStatus(doc, "", false);
    setWaveLabel(doc, "Listening");
    const button = doc.getElementById("vexaSttRecord");
    const label = doc.getElementById("vexaSttRecordLabel");
    if (button) button.setAttribute("aria-label", "Stop recording and transcribe");
    if (label) label.textContent = "Stop & transcribe";
    haptic("medium");
  }

  async function stopRecordingAndTranscribe(doc) {
    if (!recorder || recorder.state !== "recording") return;
    const current = recorder;
    const mime = current.mimeType || "audio/webm";
    const stopped = new Promise(function (resolve) {
      current.addEventListener("stop", resolve, { once: true });
    });
    current.stop();
    await stopped;

    const chunks = recorderChunks.slice();
    cleanupRecording(true);
    if (!chunks.length) throw new Error("No audio was recorded");

    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error("No audio was recorded");
    const extension = mime.indexOf("mp4") >= 0 ? "m4a" : mime.indexOf("ogg") >= 0 ? "ogg" : "webm";
    const file = new File([blob], "vexa-recording." + extension, { type: mime });
    await transcribeFile(file, doc);
  }

  function preferredRecorderMime() {
    if (!MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (let i = 0; i < types.length; i += 1) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function setupAnalyser(stream, doc) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      recorderContext = new AudioContextClass();
      recorderAnalyser = recorderContext.createAnalyser();
      recorderAnalyser.fftSize = 256;
      recorderAnalyser.smoothingTimeConstant = .74;
      recorderSource = recorderContext.createMediaStreamSource(stream);
      recorderSource.connect(recorderAnalyser);
      waveData = new Uint8Array(recorderAnalyser.frequencyBinCount);
      animateWave(doc);
    } catch (error) {
      recorderContext = null;
      recorderAnalyser = null;
      recorderSource = null;
      waveData = null;
    }
  }

  function animateWave(doc) {
    if (!recorderAnalyser || !waveData) return;
    const track = doc.getElementById("vexaSttWave");
    if (!track) return;
    recorderAnalyser.getByteFrequencyData(waveData);
    const bars = track.children;
    const usable = Math.max(1, Math.floor(waveData.length * .7));
    const now = performance.now();

    for (let i = 0; i < bars.length; i += 1) {
      const ratio = bars.length <= 1 ? 0 : i / (bars.length - 1);
      const mirrored = ratio <= .5 ? ratio * 2 : (1 - ratio) * 2;
      const bin = Math.min(usable - 1, Math.floor((i / Math.max(1, bars.length - 1)) * usable));
      const raw = waveData[bin] / 255;
      const voice = Math.pow(raw, .68);
      const envelope = .42 + .58 * Math.sin(Math.PI * Math.max(0, mirrored));
      const motion = voice > .04 ? Math.sin(now * .007 + i * .72) * .045 : 0;
      const scale = Math.max(.07, Math.min(1, .07 + voice * .9 * envelope + motion));
      bars[i].style.transform = "scaleY(" + scale.toFixed(3) + ")";
      bars[i].style.opacity = String(Math.min(.98, .34 + voice * .72));
    }

    waveFrame = requestAnimationFrame(function () { animateWave(doc); });
  }

  function updateRecorderTimer(doc) {
    const timer = doc.getElementById("vexaSttTimer");
    if (!timer) return;
    const total = Math.max(0, Math.floor((Date.now() - recorderStartedAt) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    timer.textContent = minutes + ":" + String(seconds).padStart(2, "0");
  }

  function cleanupRecording(keepUi) {
    if (recorderTimer) window.clearInterval(recorderTimer);
    recorderTimer = 0;
    if (waveFrame) cancelAnimationFrame(waveFrame);
    waveFrame = 0;

    if (recorderSource) {
      try { recorderSource.disconnect(); } catch (error) {}
    }
    recorderSource = null;
    recorderAnalyser = null;
    waveData = null;

    if (recorderContext) {
      try { recorderContext.close().catch(function () {}); } catch (error) {}
    }
    recorderContext = null;

    if (recorderStream) {
      recorderStream.getTracks().forEach(function (track) {
        try { track.stop(); } catch (error) {}
      });
    }
    recorderStream = null;
    recorder = null;
    recorderChunks = [];

    const doc = liveFrame && liveFrame.contentDocument;
    if (doc) {
      resetWaveBars(doc);
      const button = doc.getElementById("vexaSttRecord");
      const label = doc.getElementById("vexaSttRecordLabel");
      if (button) button.setAttribute("aria-label", "Start recording");
      if (label) label.textContent = "Tap to speak";
      if (!keepUi) setSttState(doc, "idle");
    }
  }

  function resetWaveBars(doc) {
    const track = doc.getElementById("vexaSttWave");
    if (!track) return;
    for (let i = 0; i < track.children.length; i += 1) {
      track.children[i].style.transform = "scaleY(.08)";
      track.children[i].style.opacity = ".34";
    }
  }

  function setSttState(doc, state) {
    const shell = doc && doc.getElementById("vexaStt");
    if (!shell) return;
    shell.classList.toggle("recording", state === "recording");
    shell.classList.toggle("processing", state === "processing");
  }

  function setWaveLabel(doc, value) {
    const label = doc && doc.getElementById("vexaSttWaveLabel");
    if (label) label.textContent = String(value || "");
  }

  function setStatus(doc, value, visible) {
    const status = doc && doc.getElementById("vexaSttStatus");
    if (!status) return;
    status.textContent = String(value || "");
    status.classList.toggle("show", Boolean(visible && value));
  }

  function showSttError(doc, error) {
    transcribing = false;
    cleanupRecording(false);
    setSttState(doc, "idle");
    setWaveLabel(doc, "Listening");
    const message = String(error && error.message || "Could not transcribe audio");
    setStatus(doc, message, true);
    haptic("light");
  }

  function stopEmbeddedRecorder() {
    if (recorder && recorder.state === "recording") {
      try { recorder.stop(); } catch (error) {}
    }
    cleanupRecording(false);
  }

  function setMainContentHidden(hidden) {
    const area = document.querySelector(".tts-area");
    const bottom = document.querySelector(".tts-bottom");

    if (area) {
      area.style.opacity = hidden ? "0" : "";
      area.style.transform = hidden ? "translateX(-36px)" : "";
      area.style.pointerEvents = hidden ? "none" : "";
    }
    if (bottom) {
      bottom.style.opacity = hidden ? "0" : "";
      bottom.style.transform = hidden ? "translateX(-36px)" : "";
      bottom.style.pointerEvents = hidden ? "none" : "";
    }
  }

  function closeImageMode() {
    if (!document.body.classList.contains("image-mode")) return;
    const imageToggle = document.getElementById("modeToggle");
    if (imageToggle) imageToggle.click();
  }

  function setLiveOpen(open) {
    const next = Boolean(open);
    if (next === liveOpen) return;
    if (next) closeImageMode();
    if (!next && liveKeyboardDoc) {
      const textarea = liveKeyboardDoc.getElementById("vexaSttText");
      if (textarea) {
        try { textarea.blur(); } catch (error) {}
      }
    }

    const workspace = installWorkspace();
    const button = document.getElementById(BUTTON_ID);
    if (!workspace || !button) return;

    liveOpen = next;
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute(
      "aria-label",
      next ? "Return to voice creation" : "Open Vexa Live speech to text"
    );
    workspace.setAttribute("aria-hidden", next ? "false" : "true");
    workspace.style.opacity = next ? "1" : "0";
    workspace.style.transform = next
      ? "translateX(0) scale(1)"
      : "translateX(34px) scale(.985)";
    workspace.style.pointerEvents = next ? "auto" : "none";
    setMainContentHidden(next);

    if (next) {
      ensureFrame();
      hideTelegramBackButton();
    } else {
      if (liveKeyboardSession) window.requestAnimationFrame(handleLiveKeyboardViewport);
      stopEmbeddedRecorder();
    }
  }

  function installButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return existing;

    const wheel = document.getElementById("wheelOpenButton");
    if (!wheel || !wheel.parentElement) return null;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "mode-toggle";
    button.setAttribute("aria-label", "Open Vexa Live speech to text");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML =
      '<svg class="mode-image-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="3.25" y="4.25" width="17.5" height="15.5" rx="4.25" stroke="currentColor" stroke-width="1.7"/>' +
        '<path d="M6.8 10.15h10.4M8.6 14h6.8" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>' +
      '</svg>' +
      '<svg class="mode-voice-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="8.2" y="3" width="7.6" height="12" rx="3.8" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
      '</svg>';

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      haptic("light");
      setLiveOpen(!liveOpen);
    });

    wheel.insertAdjacentElement("afterend", button);

    const imageToggle = document.getElementById("modeToggle");
    if (imageToggle) {
      imageToggle.addEventListener("click", function () {
        if (liveOpen) setLiveOpen(false);
      });
    }

    return button;
  }

  function initialize() {
    const button = installButton();
    installWorkspace();
    if (button && requestedSection() === "live") setLiveOpen(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
`;

export function isVexaLiveRequest(request) {
  const path = new URL(request.url).pathname;
  return path === LIVE_ROOT ||
    path === LIVE_ROOT + "/" ||
    path.startsWith(LIVE_ROOT + "/");
}

export async function handleVexaLiveRequest(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && (path === LIVE_ROOT || path === LIVE_ROOT + "/")) {
      return textResponse(VEXA_LIVE_SHELL_HTML, "text/html;charset=utf-8");
    }

    if (request.method === "GET" && path === LIVE_ROOT + "/integration.js") {
      return textResponse(VEXA_LIVE_INLINE_INTEGRATION_JS, "application/javascript;charset=utf-8");
    }

    if (request.method === "POST" && path === LIVE_ROOT + "/api/scribe-token") {
      return jsonResponse(await createScribeToken(request, env));
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Vexa Live request failed", error?.stack || error);
    return jsonResponse({ error: publicError(error) }, error?.status || 500);
  }
}

export async function handleMiniAppWithVexaLive(request, env) {
  const response = await handleMiniAppRequest(request, env);
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    (url.pathname !== "/mini-app" && url.pathname !== "/mini-app/") ||
    !response.ok
  ) {
    return response;
  }

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const script =
    '<script src="/mini-app/live/integration.js?v=' +
    INTEGRATION_VERSION +
    '"></script>';
  const html = source.includes("/mini-app/live/integration.js")
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", script + "\n</body>")
      : source + script;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function createScribeToken(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const selectedKeyName = await getElevenApiSetting(env);
  const apiKey = String(env[selectedKeyName] || "").trim();
  if (!apiKey) throw httpError("ElevenLabs API is unavailable", 503);

  const response = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/batch_scribe",
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "accept": "application/json",
      },
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    console.error(
      "Vexa Live Scribe token failed",
      response.status,
      String(data?.detail?.message || data?.detail || data?.message || "unknown error")
    );
    throw httpError("Could not start transcription", 502);
  }

  return {
    token: data.token,
    mode: "transcribe",
    modelId: SCRIBE_MODEL,
  };
}

async function assertLiveAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  if (admin) return;

  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);

  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    throw httpError("Vexa Live is updating", 423);
  }
}

function textResponse(body, contentType) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
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

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  const message = String(error?.message || "Vexa Live error");
  return message.slice(0, 300);
}
