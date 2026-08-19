import { handleMiniAppRequest } from "../server.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const INTEGRATION_VERSION = "20260819-1";

const VEXA_LIVE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="#000000" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <style>
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;width:100%;height:100%;min-height:100%;background:#000;color:#fff;overflow:hidden;overscroll-behavior:none}
    body{min-height:100dvh;font-family:"SF Pro Display","SF Pro Text",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
    button,input{font:inherit}
    .vexa-live-media{position:relative;width:100%;height:100%;min-height:100dvh;padding:14px 16px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:13px;background:#000;overflow:hidden}
    .vexa-live-head{flex:0 0 auto;padding:5px 2px 0}
    .vexa-live-kicker{display:flex;align-items:center;gap:7px;color:rgba(255,255,255,.42);font-size:9px;font-weight:760;letter-spacing:.13em;text-transform:uppercase}
    .vexa-live-kicker i{width:5px;height:5px;border-radius:50%;background:#fff;opacity:.78;box-shadow:0 0 13px rgba(255,255,255,.32)}
    .vexa-live-title{margin:8px 0 0;color:#fff;font-size:22px;line-height:1.08;font-weight:820;letter-spacing:-.04em}
    .vexa-live-subtitle{max-width:440px;margin:6px 0 0;color:rgba(255,255,255,.42);font-size:11px;line-height:1.45;font-weight:600;letter-spacing:-.01em}
    .vexa-live-entry{flex:0 0 auto;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:17px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
    .vexa-live-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
    .vexa-live-input{width:100%;height:43px;border:1px solid rgba(255,255,255,.08);border-radius:12px;outline:0;background:#0c0c0d;color:#fff;padding:0 12px;font-size:12px;font-weight:560;caret-color:#fff}
    .vexa-live-input::placeholder{color:rgba(255,255,255,.26)}
    .vexa-live-load{height:43px;min-width:82px;border:0;border-radius:12px;padding:0 15px;color:#050505;background:linear-gradient(180deg,#fff 0%,#fafafa 18%,#d5d5d5 48%,#f0f0f0 67%,#bcbcbc 100%);box-shadow:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(0,0,0,.24),0 8px 20px rgba(0,0,0,.3);font-size:12px;font-weight:820;transition:transform .18s ease,opacity .18s ease}
    .vexa-live-load:active{transform:scale(.97)}
    .vexa-live-load:disabled{opacity:.48}
    .vexa-live-status{min-height:13px;margin:7px 3px 0;color:rgba(255,255,255,.42);font-size:9px;font-weight:640;line-height:1.35;opacity:0;transform:translateY(-2px);transition:opacity .18s ease,transform .2s ease}
    .vexa-live-status.show{opacity:1;transform:none}
    .vexa-live-status.error{color:rgba(255,177,189,.8)}
    .vexa-live-stage{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:#050505;border:1px solid rgba(255,255,255,.07);opacity:0;transform:translateY(10px) scale(.992);pointer-events:none;transition:opacity .24s ease,transform .38s cubic-bezier(.16,1,.3,1)}
    .vexa-live-stage.show{opacity:1;transform:none;pointer-events:auto}
    .vexa-live-video-wrap{position:relative;flex:1;min-height:0;display:grid;place-items:center;background:#000;overflow:hidden}
    .vexa-live-video{display:block;width:100%;height:100%;max-height:100%;object-fit:contain;background:#000}
    .vexa-live-meta{flex:0 0 auto;min-height:42px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)}
    .vexa-live-video-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.68);font-size:10.5px;font-weight:680}
    .vexa-live-ai-badge{flex:0 0 auto;height:22px;padding:0 8px;border-radius:999px;display:flex;align-items:center;color:rgba(255,255,255,.48);background:rgba(255,255,255,.055);font-size:8.5px;font-weight:720;white-space:nowrap}
    .vexa-live-empty{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:rgba(255,255,255,.22);font-size:11px;font-weight:620;line-height:1.5;pointer-events:none}
    @media(max-height:680px){.vexa-live-head{display:none}.vexa-live-media{padding-top:8px;gap:9px}}
    @media(prefers-reduced-motion:reduce){.vexa-live-stage,.vexa-live-load,.vexa-live-status{transition:none!important}}
  </style>
</head>
<body>
  <main class="vexa-live-media">
    <header class="vexa-live-head">
      <div class="vexa-live-kicker"><i></i>Vexa Live</div>
      <h1 class="vexa-live-title">YouTube, inside Vexa.</h1>
      <p class="vexa-live-subtitle">Paste a video link here. AI subtitles and live translation will live in this workspace.</p>
    </header>
    <section class="vexa-live-entry" aria-label="YouTube video">
      <div class="vexa-live-row">
        <input id="vexaLiveYoutubeUrl" class="vexa-live-input" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste YouTube link" aria-label="YouTube link" />
        <button id="vexaLiveLoad" class="vexa-live-load" type="button">Open</button>
      </div>
      <div id="vexaLiveStatus" class="vexa-live-status" role="status" aria-live="polite"></div>
    </section>
    <section id="vexaLiveStage" class="vexa-live-stage" aria-label="Video player">
      <div class="vexa-live-video-wrap">
        <video id="vexaLiveVideo" class="vexa-live-video" controls playsinline preload="metadata"></video>
        <div id="vexaLiveEmpty" class="vexa-live-empty">Your video will appear here.</div>
      </div>
      <div class="vexa-live-meta">
        <div id="vexaLiveVideoTitle" class="vexa-live-video-title">YouTube video</div>
        <div class="vexa-live-ai-badge">AI subtitles · next</div>
      </div>
    </section>
  </main>
</body>
</html>`;

const VEXA_LIVE_INTEGRATION_JS = String.raw`
(function () {
  const BUTTON_ID = "vexaMediaOpen";
  const SPEECH_BUTTON_ID = "vexaLiveOpen";
  const WORKSPACE_ID = "vexaMediaWorkspace";
  const FRAME_ID = "vexaMediaInlineFrame";
  const PREPARE_URL = "/mini-app/live/api/youtube-download/prepare";
  let mediaOpen = false;
  let mediaFrame = null;
  let mediaObjectUrl = "";
  let speechButtonBound = false;

  function telegram() {
    return window.Telegram && window.Telegram.WebApp;
  }

  function initData() {
    const tg = telegram();
    return tg && tg.initData ? String(tg.initData) : "";
  }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (error) {}
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
      ".vexa-media-stop{opacity:0;transform:scale(.62)}";
    document.head.appendChild(style);
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
      "position:absolute;z-index:35;left:0;right:0;top:50px;bottom:0;display:block;overflow:hidden;background:#000;" +
      "opacity:0;transform:translateX(34px) scale(.985);pointer-events:none;" +
      "transition:opacity .28s ease,transform .46s cubic-bezier(.16,.86,.22,1);";
    page.appendChild(workspace);
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

  function ensureFrame() {
    if (mediaFrame) return mediaFrame;
    const workspace = installWorkspace();
    if (!workspace) return null;
    const frame = document.createElement("iframe");
    frame.id = FRAME_ID;
    frame.src = "/mini-app/vexa-live";
    frame.title = "Vexa Live";
    frame.setAttribute("aria-label", "Vexa Live YouTube workspace");
    frame.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#000;";
    frame.addEventListener("load", function () { bindFrame(frame); });
    workspace.appendChild(frame);
    mediaFrame = frame;
    return frame;
  }

  function bindFrame(frame) {
    let doc;
    try { doc = frame && frame.contentDocument; } catch (error) { return; }
    if (!doc || doc.documentElement.dataset.vexaLiveBound === "1") return;
    doc.documentElement.dataset.vexaLiveBound = "1";
    const input = doc.getElementById("vexaLiveYoutubeUrl");
    const button = doc.getElementById("vexaLiveLoad");
    if (!input || !button) return;
    button.addEventListener("click", function () { openYoutubeVideo(doc); });
    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      openYoutubeVideo(doc);
    });
  }

  function validYoutubeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (
        host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" ||
        host === "music.youtube.com" || host === "youtu.be"
      );
    } catch (error) {
      return false;
    }
  }

  function setFrameState(doc, busy, message, error) {
    const button = doc && doc.getElementById("vexaLiveLoad");
    const input = doc && doc.getElementById("vexaLiveYoutubeUrl");
    const status = doc && doc.getElementById("vexaLiveStatus");
    if (button) {
      button.disabled = Boolean(busy);
      button.textContent = busy ? "Loading…" : "Open";
    }
    if (input) input.disabled = Boolean(busy);
    if (status) {
      status.textContent = String(message || "");
      status.classList.toggle("show", Boolean(message));
      status.classList.toggle("error", Boolean(error));
    }
  }

  async function openYoutubeVideo(doc) {
    const input = doc && doc.getElementById("vexaLiveYoutubeUrl");
    const value = String(input && input.value || "").trim();
    if (!validYoutubeUrl(value)) {
      setFrameState(doc, false, "Paste a valid YouTube link", true);
      return;
    }

    setFrameState(doc, true, "Preparing YouTube video…", false);
    haptic("light");
    try {
      const preparedResponse = await fetch(PREPARE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: initData(), url: value }),
      });
      const prepared = await preparedResponse.json().catch(function () { return {}; });
      if (!preparedResponse.ok || !prepared.downloadUrl) {
        throw new Error(String(prepared.error || "Could not prepare this video"));
      }

      setFrameState(doc, true, "Loading video into Vexa…", false);
      const mediaResponse = await fetch(new URL(String(prepared.downloadUrl), window.location.origin).href, {
        method: "GET",
        headers: { "accept": "video/mp4" },
        cache: "no-store",
      });
      if (!mediaResponse.ok) {
        const problem = await mediaResponse.json().catch(function () { return {}; });
        throw new Error(String(problem.error || "Could not load this video"));
      }
      const type = String(mediaResponse.headers.get("content-type") || "").toLowerCase();
      if (!type.startsWith("video/mp4")) throw new Error("YouTube did not return an MP4 video");

      const blob = await mediaResponse.blob();
      if (!blob.size) throw new Error("YouTube returned an empty video");
      if (mediaObjectUrl) {
        try { URL.revokeObjectURL(mediaObjectUrl); } catch (error) {}
      }
      mediaObjectUrl = URL.createObjectURL(blob);

      const video = doc.getElementById("vexaLiveVideo");
      const stage = doc.getElementById("vexaLiveStage");
      const empty = doc.getElementById("vexaLiveEmpty");
      const title = doc.getElementById("vexaLiveVideoTitle");
      if (!video || !stage) throw new Error("Vexa video player is unavailable");
      video.src = mediaObjectUrl;
      video.load();
      stage.classList.add("show");
      if (empty) empty.style.display = "none";
      if (title) title.textContent = String(prepared.title || "YouTube video");
      setFrameState(doc, false, "Ready", false);
      try { await video.play(); } catch (error) {}
      haptic("medium");
    } catch (error) {
      setFrameState(doc, false, String(error && error.message || "Could not open this video"), true);
      haptic("light");
    }
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
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute("aria-label", next ? "Return to voice creation" : "Open Vexa Live");
    workspace.setAttribute("aria-hidden", next ? "false" : "true");
    workspace.style.opacity = next ? "1" : "0";
    workspace.style.transform = next ? "translateX(0) scale(1)" : "translateX(34px) scale(.985)";
    workspace.style.pointerEvents = next ? "auto" : "none";
    setMainContentHidden(next);
    if (next) ensureFrame();
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
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<g class="vexa-media-play"><rect x="3.25" y="4.25" width="17.5" height="15.5" rx="4.25" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.7 15.6 12 10 15.3V8.7Z" fill="currentColor"/></g>' +
        '<g class="vexa-media-stop"><path d="M7 7 17 17M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>' +
      '</svg>';
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
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
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
