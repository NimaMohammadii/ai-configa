import { Container, getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const PREPARE_PATH = "/mini-app/live/api/youtube-download/prepare";
const DOWNLOAD_PATH = "/mini-app/live/api/youtube-download";
const TOKEN_TTL_SECONDS = 10 * 60;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

let tokenTableReady = null;

export class VexaMediaContainerV3 extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  enableInternet = true;
}

export function isYouTubeDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PREPARE_PATH || path === DOWNLOAD_PATH;
}

export async function handleYouTubeDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === PREPARE_PATH) {
    return prepareDownload(request, env, ctx);
  }
  if (request.method === "GET" && url.pathname === DOWNLOAD_PATH) {
    return streamDownload(request, env);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

async function prepareDownload(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const sourceUrl = normalizeYouTubeUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid YouTube link" }, 400);

  await ensureTokenTable(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_download_tokens " +
    "(token, user_id, source_url, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)"
  ).bind(token, String(user.id), sourceUrl, now, now + TOKEN_TTL_SECONDS).run();

  ctx?.waitUntil?.(
    env.DB.prepare(
      "DELETE FROM vexa_youtube_download_tokens WHERE expires_at < ?"
    ).bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    downloadUrl: DOWNLOAD_PATH + "?token=" + encodeURIComponent(token),
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

async function streamDownload(request, env) {
  const requestUrl = new URL(request.url);
  const token = String(requestUrl.searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    return json({ error: "Download link is invalid" }, 400);
  }

  await ensureTokenTable(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, expires_at, used_at FROM vexa_youtube_download_tokens WHERE token = ?"
  ).bind(token).first();

  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Download link expired" }, 410);
  }
  if (row.used_at) {
    return json({ error: "Download link was already used" }, 409);
  }

  const claimed = await env.DB.prepare(
    "UPDATE vexa_youtube_download_tokens SET used_at = ? " +
    "WHERE token = ? AND used_at IS NULL AND expires_at > ?"
  ).bind(now, token, now).run();
  if (changedRows(claimed) <= 0) {
    return json({ error: "Download link is unavailable" }, 409);
  }

  const sourceUrl = normalizeYouTubeUrl(row.source_url);
  if (!sourceUrl) return json({ error: "Download source is invalid" }, 400);

  const containerName = "youtube-" + safeContainerKey(row.user_id);
  const container = getContainer(env.VEXA_MEDIA, containerName);
  const upstream = await container.fetch(new Request("http://container/download", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/octet-stream,application/json",
    },
    body: JSON.stringify({ url: sourceUrl }),
  }));

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("Server");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function assertLiveAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  if (admin) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    const error = new Error("Vexa Live is updating");
    error.status = 423;
    throw error;
  }
}

function normalizeYouTubeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return "";
  url.hash = "";
  return url.toString();
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function ensureTokenTable(env) {
  if (!tokenTableReady) {
    tokenTableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_download_tokens (" +
        "token TEXT PRIMARY KEY, " +
        "user_id TEXT NOT NULL, " +
        "source_url TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL, " +
        "expires_at INTEGER NOT NULL, " +
        "used_at INTEGER" +
      ")"
    ).run().catch((error) => {
      tokenTableReady = null;
      throw error;
    });
  }
  await tokenTableReady;
}

function changedRows(result) {
  return Number(result?.meta?.changes || result?.changes || 0);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const YOUTUBE_DOWNLOAD_RUNTIME = String.raw`
(function () {
  const PREPARE_URL = "/mini-app/live/api/youtube-download/prepare";
  const STYLE_ID = "vexaYoutubeDownloadStyle";
  const PANEL_ID = "vexaYoutubeDownload";
  let scanTimer = 0;

  function telegramInitData() {
    try {
      return String(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData || "");
    } catch (error) {
      return "";
    }
  }

  function validYouTubeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (
        host === "youtube.com" ||
        host === "www.youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtu.be"
      );
    } catch (error) {
      return false;
    }
  }

  function setPanelState(panel, busy, message, error) {
    const button = panel && panel.querySelector("button");
    const input = panel && panel.querySelector("input");
    const status = panel && panel.querySelector(".vexa-youtube-status");
    if (button) {
      button.disabled = Boolean(busy);
      button.textContent = busy ? "Preparing…" : "Download";
    }
    if (input) input.disabled = Boolean(busy);
    if (status) {
      status.textContent = String(message || "");
      status.classList.toggle("error", Boolean(error));
      status.classList.toggle("show", Boolean(message));
    }
  }

  async function beginDownload(panel) {
    if (!panel || panel.dataset.busy === "1") return;
    const input = panel.querySelector("input");
    const value = String(input && input.value || "").trim();
    if (!validYouTubeUrl(value)) {
      setPanelState(panel, false, "Paste a valid YouTube link", true);
      return;
    }

    panel.dataset.busy = "1";
    setPanelState(panel, true, "Creating download…", false);
    try {
      const response = await fetch(PREPARE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: telegramInitData(), url: value }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.downloadUrl) {
        throw new Error(String(data.error || "Could not prepare this video"));
      }

      setPanelState(panel, false, "Download starting…", false);
      const doc = panel.ownerDocument;
      const link = doc.createElement("a");
      link.href = String(data.downloadUrl);
      link.download = "";
      link.rel = "noopener";
      link.style.display = "none";
      doc.body.appendChild(link);
      link.click();
      window.setTimeout(function () { link.remove(); }, 3000);
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch (error) {}
    } catch (error) {
      setPanelState(panel, false, String(error && error.message || "Download failed"), true);
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error"); } catch (ignore) {}
    } finally {
      panel.dataset.busy = "0";
    }
  }

  function install(frame) {
    let doc;
    try { doc = frame && frame.contentDocument; } catch (error) { return false; }
    if (!doc) return false;
    const shell = doc.getElementById("vexaStt");
    if (!shell) return false;
    if (doc.getElementById(PANEL_ID)) return true;

    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent =
        ".vexa-youtube-download{flex:0 0 auto;margin:4px 0 8px;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}" +
        ".vexa-youtube-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}" +
        ".vexa-youtube-input{width:100%;height:40px;border:1px solid rgba(255,255,255,.08);border-radius:11px;outline:0;background:#0c0c0d;color:#fff;padding:0 11px;font:500 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;caret-color:#fff}" +
        ".vexa-youtube-input::placeholder{color:rgba(255,255,255,.26)}" +
        ".vexa-youtube-button{height:40px;min-width:86px;border:0;border-radius:11px;padding:0 13px;background:#fff;color:#050505;font:760 11.5px/1 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;transition:transform .16s ease,opacity .16s ease}" +
        ".vexa-youtube-button:active{transform:scale(.96)}.vexa-youtube-button:disabled{opacity:.5}" +
        ".vexa-youtube-status{height:0;margin:0 3px;color:rgba(255,255,255,.42);font:600 8.5px/1.2 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;opacity:0;overflow:hidden;transition:height .18s ease,margin .18s ease,opacity .18s ease}" +
        ".vexa-youtube-status.show{height:12px;margin-top:6px;opacity:1}.vexa-youtube-status.error{color:rgba(255,180,190,.74)}";
      doc.head.appendChild(style);
    }

    const panel = doc.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "vexa-youtube-download";
    panel.dataset.busy = "0";
    panel.innerHTML =
      '<div class="vexa-youtube-row">' +
        '<input class="vexa-youtube-input" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste YouTube link" aria-label="YouTube link">' +
        '<button class="vexa-youtube-button" type="button">Download</button>' +
      '</div>' +
      '<div class="vexa-youtube-status" role="status" aria-live="polite"></div>';

    const editor = shell.querySelector(".vexa-stt-editor");
    if (editor) shell.insertBefore(panel, editor);
    else shell.prepend(panel);

    const input = panel.querySelector("input");
    const button = panel.querySelector("button");
    button?.addEventListener("click", function () { beginDownload(panel); });
    input?.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      beginDownload(panel);
    });
    return true;
  }

  function scan() {
    if (scanTimer) window.clearTimeout(scanTimer);
    const frame = document.getElementById("vexaLiveInlineFrame");
    if (frame && install(frame)) return;
    scanTimer = window.setTimeout(scan, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (error) {}
})();
`;
