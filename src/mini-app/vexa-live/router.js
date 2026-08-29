import { handleMiniAppRequest } from "../server.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { tgJson } from "../../telegram-api.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const LIVE_BACKGROUND = "#000000";
const INTEGRATION_VERSION = "20260827-1";
const SHARE_PATH = LIVE_ROOT + "/share";
const SHARE_THUMB_PATH = LIVE_ROOT + "/share-thumbnail.jpg";
const SUBTITLE_RESULT_PATH = "/mini-app/live/api/download-subtitles/result";
const YOUTUBE_DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";
const INSTAGRAM_DOWNLOAD_PATH = "/mini-app/live/api/instagram/download";
const STORY_DOWNLOAD_PATH = "/mini-app/live/api/instagram-story/download";
const SHARE_THUMBNAIL_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAC0AUADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYHCP/EACgQAQABBAECBAcBAAAAAAAAAAACAQMEBRIGERMiMWEHFCEjQkNygf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDl8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU/Qti5tcjY6CzTld2mNWFiNa/ut1pch2968JQp/a82F/N2PSMpaDL6ghh4+zzMW1TVY0rsLlm1jYlu34tYzjxpWMO/pL1l/oY4NWnrrm102v19JxhtrnysN7OlPPDF7/ZlX2jHh4nvS1381Kp/wCJOVi7uWBv9fO9OzkeLi3K3rNLUoztSpWMeNJSpxpauWY0+v4AiQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/9k=";

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
  const LIVE_BG = ${JSON.stringify(LIVE_BACKGROUND)};
  let mediaOpen = false;
  let mediaFrame = null;
  let speechButtonBound = false;

  function telegram() { return window.Telegram && window.Telegram.WebApp; }

  function haptic(style) {
    const tg = telegram();
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (error) {}
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

export async function handleVexaLiveRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && (path === LIVE_ROOT || path === LIVE_ROOT + "/")) {
    return textResponse(VEXA_LIVE_SHELL_HTML, "text/html;charset=utf-8");
  }
  if (request.method === "GET" && path === LIVE_ROOT + "/integration.js") {
    return textResponse(VEXA_LIVE_INTEGRATION_JS, "application/javascript;charset=utf-8");
  }
  if (request.method === "GET" && path === SHARE_THUMB_PATH) {
    return shareThumbnailResponse();
  }
  if (request.method === "POST" && path === SHARE_PATH) {
    return prepareTelegramShare(request, env);
  }
  return jsonResponse({ error: "Not Found" }, 404);
}

async function prepareTelegramShare(request, env) {
  const payload = await request.json().catch(() => ({}));
  let user;
  try {
    user = await authenticateMiniAppPayload(payload, env);
  } catch (error) {
    return jsonResponse({ error: "Telegram authorization is invalid" }, 401);
  }

  const target = await validateShareTarget(env, user.id, payload?.downloadUrl, request.url).catch((error) => {
    console.error("Vexa share target validation failed", error?.stack || error);
    return null;
  });
  if (!target) return jsonResponse({ error: "This video is no longer available to share" }, 410);
  if (target.kind !== "video") return jsonResponse({ error: "Only video sharing is available here" }, 415);

  const title = cleanShareTitle(payload?.fileName || "Vexa-video.mp4");
  const result = {
    type: "video",
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
    video_url: target.url,
    mime_type: "video/mp4",
    thumbnail_url: new URL(SHARE_THUMB_PATH, request.url).href,
    title,
  };

  try {
    const prepared = await tgJson(env, "savePreparedInlineMessage", {
      user_id: Number(user.id),
      result,
      allow_user_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });
    const id = String(prepared?.id || "").trim();
    if (!id) throw new Error("Prepared share id is missing");
    return jsonResponse({ ok: true, messageId: id, expiresAt: Number(prepared?.expiration_date || 0) });
  } catch (error) {
    console.error("Vexa Telegram share preparation failed", error?.stack || error);
    return jsonResponse({ error: "Could not open Telegram sharing" }, 502);
  }
}

async function validateShareTarget(env, userId, value, base) {
  let url;
  try { url = new URL(String(value || ""), base); } catch { return null; }
  const origin = new URL(base).origin;
  if (url.protocol !== "https:" || url.origin !== origin) return null;
  const now = Math.floor(Date.now() / 1000);

  if (url.pathname === SUBTITLE_RESULT_PATH) {
    if (!env.EXPLORE_MEDIA) return null;
    const token = cleanResultToken(url.searchParams.get("token"));
    if (!token) return null;
    const object = await env.EXPLORE_MEDIA.head("vexa-subtitle-result/" + token + ".mp4").catch(() => null);
    if (!object || String(object.customMetadata?.vexaSubtitleResult || "") !== "1") return null;
    const expiresAt = Number(object.customMetadata?.expiresAt || resultTokenExpiry(token));
    if (!Number.isFinite(expiresAt) || expiresAt <= now || Number(object.size || 0) <= 0) return null;
    return { url: url.href, kind: "video" };
  }

  const session = cleanSessionToken(url.searchParams.get("session"));
  const token = cleanSessionToken(url.searchParams.get("token"));
  if (!session || !token) return null;

  let row = null;
  let expectedToken = "";
  let kind = "video";
  if (url.pathname === YOUTUBE_DOWNLOAD_PATH) {
    row = await env.DB.prepare(
      "SELECT user_id, playback_token, option_key, expires_at FROM vexa_youtube_download_progress WHERE session = ?"
    ).bind(session).first();
    expectedToken = String(row?.playback_token || "");
    kind = String(row?.option_key || "") === "a" ? "audio" : "video";
  } else if (url.pathname === INSTAGRAM_DOWNLOAD_PATH) {
    row = await env.DB.prepare(
      "SELECT user_id, download_token, option_key, expires_at FROM vexa_instagram_download_progress WHERE session = ?"
    ).bind(session).first();
    expectedToken = String(row?.download_token || "");
  } else if (url.pathname === STORY_DOWNLOAD_PATH) {
    row = await env.DB.prepare(
      "SELECT user_id, download_token, option_key, expires_at FROM vexa_instagram_story_progress WHERE session = ?"
    ).bind(session).first();
    expectedToken = String(row?.download_token || "");
  } else {
    return null;
  }

  if (!row || String(row.user_id) !== String(userId)) return null;
  if (expectedToken !== token || Number(row.expires_at || 0) <= now) return null;
  return { url: url.href, kind };
}

function cleanSessionToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/u.test(token) ? token : "";
}

function cleanResultToken(value) {
  const token = String(value || "").trim();
  return /^\d{10}-[A-Za-z0-9_-]{40,60}$/u.test(token) ? token : "";
}

function resultTokenExpiry(token) {
  const match = String(token || "").match(/^(\d{10})-/u);
  const value = match ? Number.parseInt(match[1], 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function cleanShareTitle(value) {
  const title = String(value || "Vexa-video.mp4").replace(/[\r\n\t]+/g, " ").trim().slice(0, 128);
  return title || "Vexa-video.mp4";
}

function shareThumbnailResponse() {
  const binary = atob(SHARE_THUMBNAIL_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
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
