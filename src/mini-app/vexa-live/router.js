import { handleMiniAppRequest } from "../server.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const INTEGRATION_VERSION = "20260821-6";

const VEXA_LIVE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="#07040d" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07040d}</style>
</head>
<body></body>
</html>`;

const VEXA_LIVE_INTEGRATION_JS = String.raw`
(function () {
  'use strict';
  const BUTTON_ID = "vexaLiveOpen";
  const SPEECH_BUTTON_ID = "speechToTextOpen";
  const WORKSPACE_ID = "vexaMediaWorkspace";
  const FRAME_ID = "vexaMediaInlineFrame";
  const VEXA_BG = "#07040d";
  const DEFAULT_BG = "#000000";
  let mediaOpen = false;
  let mediaFrame = null;
  let speechButtonBound = false;

  function telegram() { return window.Telegram && window.Telegram.WebApp; }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (error) {}
  }

  function syncTelegramChrome(open) {
    const tg = telegram();
    if (!tg) return;
    const color = open ? VEXA_BG : DEFAULT_BG;
    try { if (tg.setHeaderColor) tg.setHeaderColor(color); } catch (error) {}
    try { if (tg.setBackgroundColor) tg.setBackgroundColor(color); } catch (error) {}
    try { if (tg.setBottomBarColor) tg.setBottomBarColor(color); } catch (error) {}
  }

  function requestedSection() {
    let raw = "";
    const tg = telegram();
    try { raw = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || ""; } catch (error) {}
    if (!raw) {
      try {
        const params = new URLSearchParams(window.location.search);
        raw = params.get("tgWebAppStartParam") || params.get("startapp") || params.get("section") || "";
      } catch (error) {}
    }
    return String(raw || "").trim().toLowerCase();
  }

  function installParentStyle() {
    if (document.getElementById("vexaMediaParentStyle")) return;
    const style = document.createElement("style");
    style.id = "vexaMediaParentStyle";
    style.textContent =
      "#" + BUTTON_ID + " svg{display:block!important;width:19px!important;height:19px!important}" +
      "#" + BUTTON_ID + "[aria-pressed=\"true\"] .vexa-media-play{opacity:.28;transform:scale(.82)}" +
      "#" + BUTTON_ID + "[aria-pressed=\"true\"] .vexa-media-stop{opacity:1;transform:scale(1)}" +
      ".vexa-media-play,.vexa-media-stop{transform-origin:center;transition:opacity .18s ease,transform .28s cubic-bezier(.16,1,.3,1)}" +
      ".vexa-media-stop{opacity:0;transform:scale(.62)}" +
      "body.vexa-live-open,body.vexa-live-open .app{background:transparent!important}" +
      "body.vexa-live-open .tts-head{background:transparent!important;z-index:35!important}" +
      "body.vexa-live-open .tts-head:before,body.vexa-live-open .tts-head:after{background:transparent!important}";
    document.head.appendChild(style);
  }

  function applyWorkspaceGeometry(workspace) {
    if (!workspace) return;
    workspace.style.position = "fixed";
    workspace.style.zIndex = "34";
    workspace.style.inset = "0";
    workspace.style.width = "100vw";
    workspace.style.height = "100dvh";
    workspace.style.minWidth = "100vw";
    workspace.style.minHeight = "100dvh";
    workspace.style.maxWidth = "none";
    workspace.style.maxHeight = "none";
    workspace.style.margin = "0";
    workspace.style.padding = "0";
    workspace.style.display = "block";
    workspace.style.overflow = "hidden";
    workspace.style.background = VEXA_BG;
    workspace.style.transformOrigin = "center";
    workspace.style.transition = "opacity .28s ease,transform .46s cubic-bezier(.16,.86,.22,1)";
  }

  function installWorkspace() {
    let workspace = document.getElementById(WORKSPACE_ID);
    if (!workspace) {
      workspace = document.createElement("section");
      workspace.id = WORKSPACE_ID;
      workspace.setAttribute("aria-hidden", "true");
      workspace.style.opacity = "0";
      workspace.style.transform = "translateX(34px) scale(.985)";
      workspace.style.pointerEvents = "none";
    }
    if (workspace.parentElement !== document.body) document.body.appendChild(workspace);
    applyWorkspaceGeometry(workspace);
    return workspace;
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

  function destroyFrame() {
    const frame = mediaFrame || document.getElementById(FRAME_ID);
    if (!frame) { mediaFrame = null; return; }
    try {
      const video = frame.contentDocument && frame.contentDocument.querySelector("video");
      if (video && !video.paused) video.pause();
    } catch (error) {}
    try { frame.remove(); } catch (error) {}
    mediaFrame = null;
  }

  function ensureFrame() {
    if (mediaFrame && mediaFrame.isConnected) return mediaFrame;
    const workspace = installWorkspace();
    const frame = document.createElement("iframe");
    frame.id = FRAME_ID;
    frame.src = "/mini-app/vexa-live";
    frame.title = "Vexa Live";
    frame.setAttribute("aria-label", "Vexa Live YouTube workspace");
    frame.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    frame.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;min-width:100%;min-height:100%;border:0;background:#07040d;";
    workspace.appendChild(frame);
    mediaFrame = frame;
    return frame;
  }

  function setMediaOpen(open) {
    const next = Boolean(open);
    if (next === mediaOpen) return;
    if (next) {
      closeImageMode();
      const speechButton = document.getElementById(SPEECH_BUTTON_ID);
      if (speechButton && speechButton.getAttribute("aria-pressed") === "true") speechButton.click();
    }

    const workspace = installWorkspace();
    const button = document.getElementById(BUTTON_ID);
    if (!workspace || !button) return;

    mediaOpen = next;
    document.body.classList.toggle("vexa-live-open", next);
    syncTelegramChrome(next);
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute("aria-label", next ? "Return to voice creation" : "Open Vexa Live");
    workspace.setAttribute("aria-hidden", next ? "false" : "true");
    workspace.style.opacity = next ? "1" : "0";
    workspace.style.transform = next ? "translateX(0) scale(1)" : "translateX(34px) scale(.985)";
    workspace.style.pointerEvents = next ? "auto" : "none";
    setMainContentHidden(next);
    if (next) ensureFrame();
    else destroyFrame();
  }

  function bindSpeechButton() {
    if (speechButtonBound) return true;
    const speechButton = document.getElementById(SPEECH_BUTTON_ID);
    if (!speechButton) return false;
    speechButtonBound = true;
    speechButton.addEventListener("click", function () {
      if (mediaOpen) setMediaOpen(false);
    }, { capture: true });
    return true;
  }

  function installButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return existing;
    const wheel = document.getElementById("wheelOpenButton");
    if (!wheel || !wheel.parentElement) return null;
    installParentStyle();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "mode-toggle vexa-live-media-toggle";
    button.setAttribute("aria-label", "Open Vexa Live");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g class="vexa-media-play"><rect x="3.25" y="4.25" width="17.5" height="15.5" rx="4.25" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.7 15.6 12 10 15.3V8.7Z" fill="currentColor"/></g><g class="vexa-media-stop"><path d="M7 7 17 17M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g></svg>';
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      haptic("light");
      setMediaOpen(!mediaOpen);
    });
    wheel.insertAdjacentElement("afterend", button);
    return button;
  }

  function initialize() {
    installParentStyle();
    const button = installButton();
    installWorkspace();
    bindSpeechButton();
    if (!speechButtonBound) {
      const observer = new MutationObserver(function () {
        if (bindSpeechButton()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    const section = requestedSection();
    if (button && (section === "live" || section === "vexa-live")) setMediaOpen(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
`;

export function isVexaLiveRequest(request) {
  const path = new URL(request.url).pathname;
  return path === LIVE_ROOT || path === LIVE_ROOT + "/" || path.startsWith(LIVE_ROOT + "/");
}

export async function handleVexaLiveRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && (path === LIVE_ROOT || path === LIVE_ROOT + "/")) {
    return textResponse(VEXA_LIVE_SHELL_HTML, "text/html;charset=utf-8");
  }
  if (request.method === "GET" && path === LIVE_ROOT + "/integration.js") {
    return textResponse(VEXA_LIVE_INTEGRATION_JS, "application/javascript;charset=utf-8");
  }
  return jsonResponse({ error: "Not Found" }, 404);
}

export async function appendVexaLiveToMiniApp(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;
  const source = await response.text();
  const script = '<script src="/mini-app/vexa-live/integration.js?v=' + INTEGRATION_VERSION + '"></script>';
  const html = source.includes("/mini-app/vexa-live/integration.js")
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", script + "\n</body>")
      : source + script;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export async function handleMiniAppWithVexaSections(request, env, speechHandler) {
  const base = speechHandler
    ? await speechHandler(request, env)
    : await handleMiniAppRequest(request, env);
  return appendVexaLiveToMiniApp(base);
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
