import {
  getMiniAppAccessSettings,
  isAdmin,
  trackMiniAppOpen,
  trackMiniAppSectionOpen,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { handleMiniAppRequest } from "../server.js";
import { getVexaLiveAccessSettings } from "./access.js";
import {
  VEXA_LIVE_INTEGRATION_JS,
  VEXA_LIVE_JS,
} from "./client.js";
import { VEXA_LIVE_HTML } from "./html.js";
import {
  VEXA_LIVE_CSS,
  VEXA_LIVE_INTEGRATION_CSS,
} from "./styles.js";

const LIVE_ROOT = "/mini-app/live";
const INTEGRATION_VERSION = "20260814-1";

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
      return textResponse(VEXA_LIVE_INTEGRATION_JS, "application/javascript;charset=utf-8");
    }

    if (request.method === "POST" && path === LIVE_ROOT + "/api/session") {
      return jsonResponse(await liveSession(request, env));
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
  const admin = await isAdmin(env, user.id);

  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);

  if (globalAccess.adminOnly && !admin) {
    return lockPayload(globalAccess, "mini_app");
  }

  if (liveAccess.adminOnly && !admin) {
    return lockPayload(liveAccess, "vexa_live");
  }

  await trackMiniAppOpen(env, user);
  await trackMiniAppSectionOpen(env, user, "live");

  return {
    locked: false,
    section: "live",
    name: "Vexa Live",
  };
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

function publicError(error) {
  const message = String(error?.message || "Vexa Live error");
  return message.slice(0, 300);
}
