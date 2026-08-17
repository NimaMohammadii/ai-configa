import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
  trackMiniAppOpen,
  trackMiniAppSectionOpen,
} from "../../admin.js";
import { AI_CHAT_MODELS } from "../../ai-chat-model.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { handleMiniAppRequest } from "../server.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { VEXA_LIVE_JS } from "./client.js";
import { VEXA_LIVE_HTML } from "./html.js";
import {
  VEXA_LIVE_CSS,
  VEXA_LIVE_INTEGRATION_CSS,
} from "./styles.js";

const LIVE_ROOT = "/mini-app/live";
const INTEGRATION_VERSION = "20260817-1";
const SCRIBE_MODEL = "scribe_v2";
const REALTIME_SCRIBE_MODEL = "scribe_v2_realtime";
const MAX_TRANSLATION_TEXT = 1200;
const MAX_TRANSLATION_SEGMENTS = 30;
const MAX_TRANSLATION_BATCH_CHARS = 9000;

const SUPPORTED_LANGUAGES = Object.freeze({
  en: "English",
  fa: "Persian",
  ru: "Russian",
  de: "German",
  tr: "Turkish",
  ar: "Arabic",
  es: "Spanish",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
});

const VEXA_LIVE_INLINE_INTEGRATION_JS = String.raw`
(function () {
  const BUTTON_ID = "vexaLiveOpen";
  const WORKSPACE_ID = "vexaLiveWorkspace";
  let liveOpen = false;
  let liveFrame = null;

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

  function haptic() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try {
      tg.HapticFeedback.impactOccurred("light");
    } catch (error) {}
  }

  function hideTelegramBackButton() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.BackButton || !tg.BackButton.hide) return;
    try {
      tg.BackButton.hide();
    } catch (error) {}
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

  function prepareEmbeddedFrame(frame) {
    if (!frame) return;

    try {
      const doc = frame.contentDocument;
      if (doc && doc.head && !doc.getElementById("vexaLiveInlineEmbedStyle")) {
        const style = doc.createElement("style");
        style.id = "vexaLiveInlineEmbedStyle";
        style.textContent =
          ".live-header,.live-hero{display:none!important}" +
          ".live-app{width:100%!important;min-height:100%!important;margin:0!important;" +
          "padding:8px 16px calc(18px + env(safe-area-inset-bottom))!important}";
        doc.head.appendChild(style);
      }
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
    frame.setAttribute("aria-label", "Vexa Live captions");
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#000;";
    frame.addEventListener("load", function () {
      prepareEmbeddedFrame(frame);
    });

    workspace.appendChild(frame);
    liveFrame = frame;
    return frame;
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

    const workspace = installWorkspace();
    const button = document.getElementById(BUTTON_ID);
    if (!workspace || !button) return;

    liveOpen = next;
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute(
      "aria-label",
      next ? "Return to voice creation" : "Open Vexa Live captions"
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
    button.setAttribute("aria-label", "Open Vexa Live captions");
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
      haptic();
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
      return textResponse(VEXA_LIVE_HTML, "text/html;charset=utf-8");
    }

    if (request.method === "GET" && path === LIVE_ROOT + "/styles.css") {
      return textResponse(VEXA_LIVE_CSS, "text/css;charset=utf-8");
    }

    if (request.method === "GET" && path === LIVE_ROOT + "/app.js") {
      return textResponse(VEXA_LIVE_JS, "application/javascript;charset=utf-8");
    }

    if (request.method === "GET" && path === LIVE_ROOT + "/integration.css") {
      return textResponse(VEXA_LIVE_INTEGRATION_CSS, "text/css;charset=utf-8");
    }

    if (request.method === "GET" && path === LIVE_ROOT + "/integration.js") {
      return textResponse(VEXA_LIVE_INLINE_INTEGRATION_JS, "application/javascript;charset=utf-8");
    }

    if (request.method === "POST" && path === LIVE_ROOT + "/api/session") {
      return jsonResponse(await liveSession(request, env));
    }

    if (request.method === "POST" && path === LIVE_ROOT + "/api/scribe-token") {
      return jsonResponse(await createScribeToken(request, env));
    }

    if (request.method === "POST" && path === LIVE_ROOT + "/api/translate") {
      return jsonResponse(await translateCaption(request, env));
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
  const html = source.includes("</body>")
    ? source.replace("</body>", script + "\n</body>")
    : source + script;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function liveSession(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const access = await getLiveAccess(env, user.id);

  if (access.locked) {
    return lockPayload(access.settings, access.scope);
  }

  await trackMiniAppOpen(env, user);
  await trackMiniAppSectionOpen(env, user, "live");

  return {
    locked: false,
    section: "live",
    name: "Vexa Live",
    languages: SUPPORTED_LANGUAGES,
  };
}

async function createScribeToken(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceLanguage = normalizeLanguage(payload.sourceLanguage);
  normalizeLanguage(payload.targetLanguage);

  const liveMode = String(payload.mode || "").trim().toLowerCase() === "live";
  const tokenType = liveMode ? "realtime_scribe" : "batch_scribe";
  const modelId = liveMode ? REALTIME_SCRIBE_MODEL : SCRIBE_MODEL;

  const selectedKeyName = await getElevenApiSetting(env);
  const apiKey = String(env[selectedKeyName] || "").trim();
  if (!apiKey) {
    throw httpError("ElevenLabs API is unavailable", 503);
  }

  const response = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/" + tokenType,
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
    throw httpError(
      liveMode ? "Could not start live captions" : "Could not start video captions",
      502
    );
  }

  return {
    token: data.token,
    mode: liveMode ? "live" : "standard",
    modelId,
    languageCode: sourceLanguage,
  };
}

async function translateCaption(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceLanguage = normalizeLanguage(payload.sourceLanguage);
  const targetLanguage = normalizeLanguage(payload.targetLanguage);

  if (Array.isArray(payload.segments)) {
    const segments = normalizeTranslationSegments(payload.segments);

    if (sourceLanguage === targetLanguage) {
      return { segments };
    }

    const translated = await translateSegments(
      env,
      segments,
      sourceLanguage,
      targetLanguage
    );

    return { segments: translated };
  }

  const text = String(payload.text || "").trim();
  if (!text) return { text: "" };
  if (text.length > MAX_TRANSLATION_TEXT) {
    throw httpError("Subtitle segment is too long", 413);
  }

  if (sourceLanguage === targetLanguage) {
    return { text };
  }

  const translated = await translateSegments(
    env,
    [{ id: 0, text }],
    sourceLanguage,
    targetLanguage
  );

  return { text: translated[0]?.text || "" };
}

function normalizeTranslationSegments(value) {
  const source = value.slice(0, MAX_TRANSLATION_SEGMENTS);
  const segments = [];
  let totalChars = 0;

  for (const item of source) {
    const id = Number(item?.id);
    const text = String(item?.text || "").trim();

    if (!Number.isInteger(id) || id < 0 || !text) {
      throw httpError("Invalid subtitle segment", 400);
    }

    if (text.length > MAX_TRANSLATION_TEXT) {
      throw httpError("Subtitle segment is too long", 413);
    }

    totalChars += text.length;
    if (totalChars > MAX_TRANSLATION_BATCH_CHARS) {
      throw httpError("Subtitle batch is too large", 413);
    }

    segments.push({ id, text });
  }

  if (!segments.length) {
    throw httpError("Subtitle segments are empty", 400);
  }

  return segments;
}

async function translateSegments(env, segments, sourceLanguage, targetLanguage) {
  const apiKey = String(env.GPT_API || "").trim();
  if (!apiKey) {
    throw httpError("Translation is unavailable", 503);
  }

  const model = translationModel();
  if (!model) {
    throw httpError("Translation model is unavailable", 503);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 4000,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Translate subtitle segments from " +
                SUPPORTED_LANGUAGES[sourceLanguage] +
                " to " +
                SUPPORTED_LANGUAGES[targetLanguage] +
                ". Return ONLY valid JSON. The output must be a JSON array of objects in the exact same order, each with exactly two fields: id and text. Keep every input id unchanged. Translate only the text. Do not merge, split, omit, reorder, explain, or add markdown.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(segments),
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      "Vexa Live translation failed",
      response.status,
      String(data?.error?.message || "unknown error")
    );
    throw httpError("Could not translate captions", 502);
  }

  const parsed = parseTranslatedSegments(extractResponseText(data));
  const byId = new Map();

  for (const item of parsed) {
    const id = Number(item?.id);
    const text = String(item?.text || "").trim();
    if (Number.isInteger(id) && text) {
      byId.set(id, text);
    }
  }

  const translated = segments.map((segment) => ({
    id: segment.id,
    text: byId.get(segment.id) || "",
  }));

  if (translated.some((segment) => !segment.text)) {
    throw httpError("Could not translate captions", 502);
  }

  return translated;
}

function parseTranslatedSegments(value) {
  let text = String(value || "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    text = text.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.segments)) return parsed.segments;
  } catch (error) {}

  throw httpError("Could not translate captions", 502);
}

async function assertLiveAccess(env, userId) {
  const access = await getLiveAccess(env, userId);
  if (!access.locked) return;
  throw httpError("Vexa Live is updating", 423);
}

async function getLiveAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);

  if (globalAccess.adminOnly && !admin) {
    return { locked: true, settings: globalAccess, scope: "mini_app" };
  }

  if (liveAccess.adminOnly && !admin) {
    return { locked: true, settings: liveAccess, scope: "vexa_live" };
  }

  return { locked: false, settings: null, scope: "" };
}

function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  if (!SUPPORTED_LANGUAGES[language]) {
    throw httpError("Choose both languages first", 400);
  }
  return language;
}

function translationModel() {
  const luna = AI_CHAT_MODELS.find((model) =>
    String(model.label || "").toLowerCase() === "luna"
  );
  return luna?.id || AI_CHAT_MODELS[0]?.id || "";
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

function lockPayload(settings, scope) {
  return {
    locked: true,
    scope,
    lockedFrom: Number(settings.lockedFrom || 0),
    lockedUntil: Number(settings.lockedUntil || 0),
    serverNow: Math.floor(Date.now() / 1000),
  };
}

function textResponse(body, contentType) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
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
