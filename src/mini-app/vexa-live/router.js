import { handleMiniAppRequest } from "../server.js";
import {
  VEXA_MESH_BASE_COLOR,
  createVexaMeshRendererSource,
} from "./mesh-background.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const INTEGRATION_VERSION = "20260822-13";

const VEXA_LIVE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="${VEXA_MESH_BASE_COLOR}" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${VEXA_MESH_BASE_COLOR}}</style>
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
  const SHARED_MESH_CANVAS_ID = "vexaSharedMeshBackground";
  const SHARED_MESH_CLASS = "vexa-mesh-surface";
  const VEXA_BG = ${JSON.stringify(VEXA_MESH_BASE_COLOR)};
  const DEFAULT_BG = "#000000";
  let mediaOpen = false;
  let mediaFrame = null;
  let speechButtonBound = false;
  let meshSurfaceActive = false;
  let meshSurfaceRenderer = null;
  let meshSurfaceObserver = null;

  function telegram() { return window.Telegram && window.Telegram.WebApp; }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (error) {}
  }

  function syncTelegramChrome() {
    const tg = telegram();
    if (!tg) return;
    const color = mediaOpen || meshSurfaceActive ? VEXA_BG : DEFAULT_BG;
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
      "#" + SHARED_MESH_CANVAS_ID + "{position:fixed!important;inset:0!important;z-index:0!important;display:block!important;width:100%!important;height:100%!important;pointer-events:none!important;opacity:0;background:" + VEXA_BG + ";transition:opacity .28s ease!important}" +
      "body." + SHARED_MESH_CLASS + " #" + SHARED_MESH_CANVAS_ID + "{opacity:1!important}" +
      "body.credits-page-open #" + SHARED_MESH_CANVAS_ID + "{z-index:104!important;opacity:1!important}" +
      "html." + SHARED_MESH_CLASS + ",body." + SHARED_MESH_CLASS + "{background:" + VEXA_BG + "!important}" +
      "body." + SHARED_MESH_CLASS + " .app{position:relative!important;z-index:1!important;background:transparent!important}" +
      "body.image-mode." + SHARED_MESH_CLASS + " .tts-head,body.image-mode." + SHARED_MESH_CLASS + " .tts-head:before,body.image-mode." + SHARED_MESH_CLASS + " .tts-head:after{background:transparent!important}" +
      "body." + SHARED_MESH_CLASS + " .credits-page{background:transparent!important}" +
      "body." + SHARED_MESH_CLASS + " .credits-page .credits-page-head,body." + SHARED_MESH_CLASS + " .credits-page.toman-payment-active .credits-page-head,body." + SHARED_MESH_CLASS + " .credits-page.tribute-payment-active .credits-page-head{background-color:transparent!important;background-image:none!important}" +
      "body." + SHARED_MESH_CLASS + " .credits-page .credits-page-head:before,body." + SHARED_MESH_CLASS + " .credits-page .credits-page-head:after,body." + SHARED_MESH_CLASS + " .credits-page.toman-payment-active .credits-page-head:before,body." + SHARED_MESH_CLASS + " .credits-page.toman-payment-active .credits-page-head:after,body." + SHARED_MESH_CLASS + " .credits-page.tribute-payment-active .credits-page-head:before,body." + SHARED_MESH_CLASS + " .credits-page.tribute-payment-active .credits-page-head:after{background:transparent!important}" +
      "#" + BUTTON_ID + "{place-items:center!important}" +
      "#" + BUTTON_ID + " svg{display:block!important;position:static!important;inset:auto!important;width:19px!important;height:19px!important;transform:none!important;transition:none!important;overflow:visible!important}" +
      "#" + BUTTON_ID + "[aria-pressed=\"true\"] .vexa-media-play{opacity:0}" +
      "#" + BUTTON_ID + "[aria-pressed=\"true\"] .vexa-media-mic{opacity:1}" +
      ".vexa-media-play,.vexa-media-mic{transform:none!important;transform-origin:center;transition:opacity .18s ease}" +
      ".vexa-media-mic{opacity:0}" +
      "body .tts-area{transition:opacity .28s ease,transform .48s cubic-bezier(.16,.86,.22,1)!important}" +
      "body .tts-bottom{transition:opacity .25s ease,transform .48s cubic-bezier(.16,.86,.22,1)!important}" +
      "body.vexa-live-open{background:transparent!important}" +
      "body.vexa-live-open .app{position:relative!important;z-index:40!important;background:transparent!important;pointer-events:none!important}" +
      "body.vexa-live-open .app *{pointer-events:none!important}" +
      "body.vexa-live-open .tts-head{position:sticky!important;z-index:41!important;background:transparent!important;opacity:1!important;visibility:visible!important;pointer-events:none!important}" +
      "body.vexa-live-open .tts-head:before,body.vexa-live-open .tts-head:after{background:transparent!important;pointer-events:none!important}" +
      "body.vexa-live-open #" + BUTTON_ID + "{pointer-events:auto!important}" +
      "body.vexa-live-open .tts-area{opacity:0!important;transform:translateX(-30px) scale(.985)!important;pointer-events:none!important}" +
      "body.vexa-live-open .tts-bottom{opacity:0!important;transform:translateX(calc(-50% - 30px)) scale(.985)!important;pointer-events:none!important}";
    document.head.appendChild(style);
  }

  function installSharedMeshSurface() {
    let canvas = document.getElementById(SHARED_MESH_CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = SHARED_MESH_CANVAS_ID;
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.vexaMeshActive = "false";
      if (document.body.firstChild) document.body.insertBefore(canvas, document.body.firstChild);
      else document.body.appendChild(canvas);
    }
    if (!meshSurfaceObserver) {
      meshSurfaceObserver = new MutationObserver(syncSharedMeshSurface);
      meshSurfaceObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    syncSharedMeshSurface();
    return canvas;
  }

  function ensureSharedMeshRenderer() {
    if (meshSurfaceRenderer) return meshSurfaceRenderer;
    const canvas = document.getElementById(SHARED_MESH_CANVAS_ID) || installSharedMeshSurface();
    meshSurfaceRenderer = ${createVexaMeshRendererSource("canvas", { autoStart: false })};
    return meshSurfaceRenderer;
  }

  function syncSharedMeshSurface() {
    const body = document.body;
    if (!body) return;
    const canvas = document.getElementById(SHARED_MESH_CANVAS_ID);
    const next = body.classList.contains("image-mode") || body.classList.contains("credits-page-open");
    if (canvas) canvas.dataset.vexaMeshActive = next ? "true" : "false";
    document.documentElement.classList.toggle(SHARED_MESH_CLASS, next);
    body.classList.toggle(SHARED_MESH_CLASS, next);
    if (next === meshSurfaceActive) {
      if (next && meshSurfaceRenderer) meshSurfaceRenderer.resize();
      return;
    }
    meshSurfaceActive = next;
    if (next) ensureSharedMeshRenderer().start();
    else if (meshSurfaceRenderer) meshSurfaceRenderer.pause();
    syncTelegramChrome();
  }

  function applyWorkspaceGeometry(workspace) {
    if (!workspace) return;
    workspace.style.position = "fixed";
    workspace.style.zIndex = "20";
    workspace.style.inset = "0";
    workspace.style.width = "100%";
    workspace.style.height = "100%";
    workspace.style.minWidth = "100%";
    workspace.style.minHeight = "100%";
    workspace.style.maxWidth = "none";
    workspace.style.maxHeight = "none";
    workspace.style.margin = "0";
    workspace.style.padding = "0";
    workspace.style.display = "block";
    workspace.style.overflow = "hidden";
    workspace.style.background = "transparent";
    workspace.style.transformOrigin = "center";
    workspace.style.willChange = "opacity, transform, clip-path";
    workspace.style.transition = "opacity .34s ease,transform .56s cubic-bezier(.16,.86,.22,1),clip-path .56s cubic-bezier(.16,.86,.22,1)";
  }

  function installWorkspace() {
    let workspace = document.getElementById(WORKSPACE_ID);
    if (!workspace) {
      workspace = document.createElement("section");
      workspace.id = WORKSPACE_ID;
      workspace.setAttribute("aria-hidden", "true");
      workspace.style.opacity = "0";
      workspace.style.transform = "translateX(56px) scale(.97)";
      workspace.style.clipPath = "inset(0 0 0 8% round 30px)";
      workspace.style.pointerEvents = "none";
    }
    if (workspace.parentElement !== document.body) document.body.appendChild(workspace);
    applyWorkspaceGeometry(workspace);
    return workspace;
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
    frame.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;min-width:100%;min-height:100%;border:0;background:transparent;opacity:0;transform:scale(1.018);transform-origin:center;pointer-events:none;transition:opacity .32s ease,transform .48s cubic-bezier(.16,.86,.22,1);will-change:opacity,transform;";
    frame.addEventListener("load", function () {
      window.requestAnimationFrame(function () {
        if (!frame.isConnected) return;
        frame.style.opacity = "1";
        frame.style.transform = "scale(1)";
        frame.style.pointerEvents = "auto";
      });
    }, { once: true });
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
    if (next) ensureFrame();

    mediaOpen = next;
    document.body.classList.toggle("vexa-live-open", next);
    syncTelegramChrome();
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute("aria-label", next ? "Return to voice creation" : "Open Vexa Live");
    workspace.setAttribute("aria-hidden", next ? "false" : "true");
    workspace.style.opacity = next ? "1" : "0";
    workspace.style.transform = next ? "translateX(0) scale(1)" : "translateX(56px) scale(.97)";
    workspace.style.clipPath = next ? "inset(0 0 0 0 round 0px)" : "inset(0 0 0 8% round 30px)";
    workspace.style.pointerEvents = next ? "auto" : "none";
    if (!next) destroyFrame();
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
    const anchor = document.getElementById("creditPill");
    if (!anchor || !anchor.parentElement) return null;
    installParentStyle();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "mode-toggle vexa-live-media-toggle";
    button.setAttribute("aria-label", "Open Vexa Live");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-hidden", document.body.classList.contains("ai-chat-admin") ? "false" : "true");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g class="vexa-media-play"><rect x="3.25" y="4.25" width="17.5" height="15.5" rx="4.25" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.7 15.6 12 10 15.3V8.7Z" fill="currentColor"/></g><g class="vexa-media-mic"><rect x="8.2" y="3" width="7.6" height="12" rx="3.8" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></g></svg>';
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      haptic("light");
      setMediaOpen(!mediaOpen);
    });
    anchor.insertAdjacentElement("afterend", button);
    return button;
  }

  function initialize() {
    installParentStyle();
    installSharedMeshSurface();
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
