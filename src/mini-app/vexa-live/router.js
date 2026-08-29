import { handleMiniAppRequest } from "../server.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const LIVE_BACKGROUND = "#000000";
const INTEGRATION_VERSION = "20260829-save-match-1";

const VEXA_LIVE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="${LIVE_BACKGROUND}" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${LIVE_BACKGROUND}}</style>
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
  const VEXA_DOWNLOAD_PATHS = new Set([
    "/mini-app/live/api/youtube-download",
    "/mini-app/live/api/instagram/download",
    "/mini-app/live/api/instagram-story/download",
    "/mini-app/live/api/download-subtitles/result",
  ]);
  const LIVE_BG = ${JSON.stringify(LIVE_BACKGROUND)};
  let mediaOpen = false;
  let mediaFrame = null;
  let speechButtonBound = false;
  let nativeDownload = null;
  let lastDownload = null;
  let savedDownloadKey = "";
  let saveBusy = false;
  let frameActionsCleanup = null;
  let frameActionsSync = null;

  function telegram() { return window.Telegram && window.Telegram.WebApp; }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (error) {}
  }

  function isVexaDownloadUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return url.origin === window.location.origin && VEXA_DOWNLOAD_PATHS.has(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function downloadKey(download) {
    if (!download) return "";
    return String(download.url || "") + "\n" + String(download.fileName || "");
  }

  function installDownloadCapture() {
    const tg = telegram();
    if (!tg || typeof tg.downloadFile !== "function" || nativeDownload) return;
    const original = tg.downloadFile;
    nativeDownload = original.bind(tg);
    const wrapped = function (params, callback) {
      const url = String(params && params.url || "").trim();
      const fileName = String(params && params.file_name || "").trim();
      if (url && fileName && isVexaDownloadUrl(url)) {
        const next = { url: url, fileName: fileName };
        if (downloadKey(lastDownload) !== downloadKey(next)) savedDownloadKey = "";
        lastDownload = next;
        if (frameActionsSync) frameActionsSync();
      }
      return nativeDownload(params, callback);
    };
    try {
      tg.downloadFile = wrapped;
    } catch (error) {
      nativeDownload = null;
    }
  }

  function cleanupFrameActions() {
    if (typeof frameActionsCleanup === "function") {
      try { frameActionsCleanup(); } catch (error) {}
    }
    frameActionsCleanup = null;
    frameActionsSync = null;
  }

  function installFrameSave(frame) {
    cleanupFrameActions();
    let doc;
    try { doc = frame && frame.contentDocument; } catch (error) { return; }
    if (!doc) return;
    const root = doc.getElementById("vexaLiveDownloadRoot");
    const downloadButton = doc.getElementById("vexaLiveDownload");
    const uploadButton = doc.getElementById("vexaLiveUpload");
    const actions = downloadButton && downloadButton.parentElement;
    if (!root || !downloadButton || !actions) return;

    let style = doc.getElementById("vexaSaveCircleStyle");
    if (!style) {
      style = doc.createElement("style");
      style.id = "vexaSaveCircleStyle";
      style.textContent = "#vexaLiveDownload:not(:disabled),#vexaLiveUpload:not(:disabled),#vexaLiveSave:not(:disabled){opacity:1!important;filter:none!important}.vexa-save-action[hidden]{display:none!important}.vexa-save-action svg{display:block;width:18px;height:18px;pointer-events:none}";
      doc.head.appendChild(style);
    }

    let saveButton = doc.getElementById("vexaLiveSave");
    if (!saveButton) {
      saveButton = doc.createElement("button");
      saveButton.id = "vexaLiveSave";
      saveButton.type = "button";
      saveButton.hidden = true;
      saveButton.disabled = true;
      saveButton.setAttribute("aria-label", "Save file");
      saveButton.title = "Save";
      saveButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 16.5v1.75A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      actions.insertBefore(saveButton, uploadButton || null);
    }

    const referenceButton = uploadButton || downloadButton;
    saveButton.className = referenceButton.className;
    saveButton.classList.add("vexa-save-action");

    const matchReferenceSize = function () {
      if (!referenceButton || !frame.contentWindow) return;
      const referenceStyle = frame.contentWindow.getComputedStyle(referenceButton);
      saveButton.style.width = referenceStyle.width;
      saveButton.style.height = referenceStyle.height;
      saveButton.style.minWidth = referenceStyle.minWidth;
      saveButton.style.minHeight = referenceStyle.minHeight;
      saveButton.style.maxWidth = referenceStyle.maxWidth;
      saveButton.style.maxHeight = referenceStyle.maxHeight;
      saveButton.style.padding = referenceStyle.padding;
      saveButton.style.borderRadius = referenceStyle.borderRadius;
      saveButton.style.flexGrow = referenceStyle.flexGrow;
      saveButton.style.flexShrink = referenceStyle.flexShrink;
      saveButton.style.flexBasis = referenceStyle.flexBasis;
    };

    const sync = function () {
      if (!frame.isConnected) return;
      const completed = String(root.dataset.state || "") === "completed";
      const canSave = completed && Boolean(lastDownload && nativeDownload);
      saveButton.hidden = !canSave;
      saveButton.disabled = !canSave || Boolean(saveBusy);
      if (canSave) matchReferenceSize();
    };

    const onSave = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (saveBusy || String(root.dataset.state || "") !== "completed" || !lastDownload || !nativeDownload) return;
      const key = downloadKey(lastDownload);
      haptic("light");
      if (key && savedDownloadKey === key) return;
      saveBusy = true;
      sync();
      try {
        nativeDownload({ url: lastDownload.url, file_name: lastDownload.fileName }, function (accepted) {
          if (accepted !== false) savedDownloadKey = key;
          saveBusy = false;
          sync();
        });
      } catch (error) {
        saveBusy = false;
        sync();
        console.warn("Vexa Save failed", error && error.message || error);
      }
    };

    saveButton.addEventListener("click", onSave);
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-state"] });
    frameActionsSync = sync;
    frameActionsCleanup = function () {
      observer.disconnect();
      saveButton.removeEventListener("click", onSave);
    };
    sync();
  }

  function syncTelegramChrome() {
    const tg = telegram();
    if (!tg) return;
    try { if (tg.setHeaderColor) tg.setHeaderColor(LIVE_BG); } catch (error) {}
    try { if (tg.setBackgroundColor) tg.setBackgroundColor(LIVE_BG); } catch (error) {}
    try { if (tg.setBottomBarColor) tg.setBottomBarColor(LIVE_BG); } catch (error) {}
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
      "html,body{background:" + LIVE_BG + "!important}" +
      "body.credits-page-open .credits-page{background:" + LIVE_BG + "!important}" +
      "#" + BUTTON_ID + "{place-items:center!important}" +
      "#" + BUTTON_ID + " svg{display:block!important;position:static!important;inset:auto!important;width:19px!important;height:19px!important;transform:none!important;transition:none!important;overflow:visible!important}" +
      "body .tts-area{transition:opacity .28s ease,transform .48s cubic-bezier(.16,.86,.22,1)!important}" +
      "body .tts-bottom{transition:opacity .25s ease,transform .48s cubic-bezier(.16,.86,.22,1)!important}" +
      "html:has(body.vexa-live-open),body.vexa-live-open{background:" + LIVE_BG + "!important}" +
      "body.vexa-live-open .app{position:relative!important;z-index:40!important;background:transparent!important;pointer-events:none!important}" +
      "body.vexa-live-open .app *{pointer-events:none!important}" +
      "body.vexa-live-open .tts-head{display:none!important}" +
      "body.vexa-live-open .tts-area{opacity:0!important;transform:translateX(-30px) scale(.985)!important;pointer-events:none!important}" +
      "body.vexa-live-open .tts-bottom{opacity:0!important;transform:translateX(calc(-50% - 30px)) scale(.985)!important;pointer-events:none!important}";
    document.head.appendChild(style);
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
    workspace.style.background = LIVE_BG;
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
    cleanupFrameActions();
    const frame = mediaFrame || document.getElementById(FRAME_ID);
    if (!frame) { mediaFrame = null; return; }
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
    frame.setAttribute("aria-label", "Vexa Live download workspace");
    frame.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;min-width:100%;min-height:100%;border:0;background:" + LIVE_BG + ";opacity:0;transform:scale(1.018);transform-origin:center;pointer-events:none;transition:opacity .32s ease,transform .48s cubic-bezier(.16,.86,.22,1);will-change:opacity,transform;";
    frame.addEventListener("load", function () {
      installFrameSave(frame);
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
    button.setAttribute("aria-label", next ? "Return to voice creation" : "Open Vexa Live downloads");
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
    button.setAttribute("aria-label", "Open Vexa Live downloads");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-hidden", document.body.classList.contains("ai-chat-admin") ? "false" : "true");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.75v10.5m0 0 4-4m-4 4-4-4M5 15.75v2.5A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25v-2.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    installDownloadCapture();
    installParentStyle();
    syncTelegramChrome();
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
