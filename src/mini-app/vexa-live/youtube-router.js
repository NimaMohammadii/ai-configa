import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { getVexaMediaContainer } from "./media-container.js";
import { VEXA_LIVE_YOUTUBE_JS } from "./youtube-import.js";

const ROOT = "/mini-app/live";
const TOKEN_TTL_SECONDS = 60 * 60;

export function isVexaYoutubeRequest(request) {
  const path = new URL(request.url).pathname;
  return path === ROOT + "/youtube.js" || path.startsWith(ROOT + "/api/youtube/");
}

export async function handleVexaYoutubeRequest(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === ROOT + "/youtube.js") {
      return new Response(VEXA_LIVE_YOUTUBE_JS, {
        headers: {
          "Content-Type": "application/javascript;charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    if (request.method === "POST" && path === ROOT + "/api/youtube/download") {
      return downloadYouTube(request, env);
    }

    if (request.method === "POST" && path === ROOT + "/api/youtube/prepare") {
      return prepareYouTube(request, env);
    }

    if ((request.method === "GET" || request.method === "HEAD") && path === ROOT + "/api/youtube/media") {
      return serveYouTubeMedia(request, env);
    }

    if (request.method === "GET" && path === ROOT + "/api/youtube/live") {
      return serveYouTubeLive(request, env);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Vexa YouTube media request failed", error?.stack || error);
    return jsonResponse({ error: publicError(error) }, error?.status || 500);
  }
}

export async function injectVexaYoutubeClient(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const script = '<script type="module" src="/mini-app/live/youtube.js?v=20260814-1"></script>';
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

async function downloadYouTube(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertAccess(env, user.id);

  const url = String(payload.url || "").trim();
  if (!url) throw httpError("Paste a YouTube link", 400);

  const container = getVexaMediaContainer(env, user.id);
  const internal = new Request("http://vexa-media/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const response = await container.fetch(internal);
  return withNoStore(response);
}

async function prepareYouTube(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertAccess(env, user.id);

  const url = String(payload.url || "").trim();
  if (!url) throw httpError("Paste a YouTube link", 400);

  const container = getVexaMediaContainer(env, user.id);
  const response = await container.fetch(new Request("http://vexa-media/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }));

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.jobId) {
    throw httpError(String(data.error || "Could not prepare YouTube video"), response.status || 502);
  }

  const playToken = await signMediaToken(env, {
    u: String(user.id),
    j: String(data.jobId),
    e: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });

  return jsonResponse({
    title: String(data.title || "YouTube video"),
    duration: Number(data.duration) || 0,
    thumbnail: String(data.thumbnail || ""),
    playToken,
    mediaUrl: ROOT + "/api/youtube/media?token=" + encodeURIComponent(playToken),
  });
}

async function serveYouTubeMedia(request, env) {
  const url = new URL(request.url);
  const token = await verifyMediaToken(env, url.searchParams.get("token"));
  const container = getVexaMediaContainer(env, token.u);

  const headers = new Headers();
  for (const name of ["Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const internal = new Request(
    "http://vexa-media/media/" + encodeURIComponent(token.j),
    { method: request.method, headers }
  );
  return withNoStore(await container.fetch(internal));
}

async function serveYouTubeLive(request, env) {
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    throw httpError("WebSocket required", 426);
  }

  const url = new URL(request.url);
  const token = await verifyMediaToken(env, url.searchParams.get("token"));
  const container = getVexaMediaContainer(env, token.u);

  const internal = new Request(
    "http://vexa-media/live/" + encodeURIComponent(token.j),
    request
  );
  return container.fetch(internal);
}

async function assertAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (admin) return;
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    throw httpError("Vexa Live is updating", 423);
  }
}

async function signMediaToken(env, payload) {
  const secret = String(env.BOT_TOKEN || "").trim();
  if (!secret) throw httpError("Media session is unavailable", 503);
  const encoder = new TextEncoder();
  const data = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  );
  return data + "." + base64UrlEncode(signature);
}

async function verifyMediaToken(env, value) {
  const raw = String(value || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) throw httpError("Media session expired", 401);

  const secret = String(env.BOT_TOKEN || "").trim();
  if (!secret) throw httpError("Media session is unavailable", 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let signature;
  try {
    signature = base64UrlDecode(parts[1]);
  } catch (error) {
    throw httpError("Media session expired", 401);
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(parts[0])
  );
  if (!valid) throw httpError("Media session expired", 401);

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  } catch (error) {
    throw httpError("Media session expired", 401);
  }

  if (!payload?.u || !payload?.j || Number(payload.e) <= Math.floor(Date.now() / 1000)) {
    throw httpError("Media session expired", 401);
  }
  return payload;
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function withNoStore(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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
  return String(error?.message || "YouTube import failed").slice(0, 300);
}
