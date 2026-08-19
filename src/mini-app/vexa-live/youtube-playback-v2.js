import { getContainer } from "@cloudflare/containers";
import { getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { VexaMediaContainerV3 as BaseMediaContainer } from "./youtube-download-exec.js";

const PREPARE_PATH = "/mini-app/live/api/youtube-playback/prepare";
const PLAY_PATH = "/mini-app/live/api/youtube-playback";
export const RUNTIME_PATH = "/mini-app/vexa-live/playback-runtime.js";
const TOKEN_TTL = 2 * 60 * 60;
const META_TIMEOUT = 35_000;
const START_TIMEOUT = 25_000;
const FORMAT = "b[ext=mp4][protocol^=http][vcodec!=none][acodec!=none]";
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const STRATEGIES = [
  ["web_embedded", ["--extractor-args", "youtube:player_client=web_embedded"]],
  ["android_vr", ["--extractor-args", "youtube:player_client=android_vr"]],
];
const COMMON = [
  "--ignore-config", "--no-playlist", "--force-ipv4",
  "--js-runtimes", "deno", "--socket-timeout", "15",
  "--retries", "2", "--fragment-retries", "2",
];

const PY_INSPECT = [
  "import json,sys",
  "from curl_cffi import requests",
  "url=sys.argv[1]; headers=json.loads(sys.argv[2]); headers['Range']='bytes=0-0'",
  "r=requests.get(url,headers=headers,allow_redirects=True,stream=True,timeout=20)",
  "status=int(r.status_code); cr=str(r.headers.get('Content-Range') or ''); r.close()",
  "if status!=206: print('upstream status %s'%status,file=sys.stderr); sys.exit(2)",
  "total=cr.rsplit('/',1)[-1] if '/' in cr else ''",
  "if not total.isdigit(): print('missing content-range',file=sys.stderr); sys.exit(3)",
  "print(total)",
].join("\n");

const PY_STREAM = [
  "import json,sys",
  "from curl_cffi import requests",
  "url=sys.argv[1]; headers=json.loads(sys.argv[2]); start=sys.argv[3]; end=sys.argv[4]",
  "headers['Range']='bytes=%s-%s'%(start,end)",
  "r=requests.get(url,headers=headers,allow_redirects=True,stream=True,timeout=30)",
  "status=int(r.status_code)",
  "if status!=206: print('upstream status %s'%status,file=sys.stderr); r.close(); sys.exit(2)",
  "out=sys.stdout.buffer",
  "for chunk in r.iter_content(chunk_size=65536):",
  "    if chunk: out.write(chunk); out.flush()",
  "r.close()",
].join("\n");

let tableReady = null;

export class VexaMediaContainerV3 extends BaseMediaContainer {
  async resolvePlayback(url) {
    let last = null;
    for (const [id, extra] of STRATEGIES) {
      try {
        const process = await this.execYtDlp([
          ...COMMON, ...extra,
          "--dump-single-json", "--skip-download", "--no-warnings",
          "-f", FORMAT, url,
        ]);
        const timer = setTimeout(() => { try { process.kill(); } catch {} }, META_TIMEOUT);
        try {
          const output = await process.output();
          const decoder = new TextDecoder();
          if (output.exitCode !== 0) throw classify(decoder.decode(output.stderr));
          const data = JSON.parse(decoder.decode(output.stdout));
          const mediaUrl = String(data?.url || "").trim();
          const ext = String(data?.ext || "").toLowerCase();
          const protocol = String(data?.protocol || "").toLowerCase();
          if (ext !== "mp4" || !protocol.startsWith("http") || !/^https?:\/\//i.test(mediaUrl)) {
            throw new Error("YouTube did not return a playable MP4 URL");
          }
          const headers = cleanHeaders(data?.http_headers);
          let size = posInt(data?.filesize);
          if (!size) size = await this.inspectSize(mediaUrl, headers);
          if (!size) throw new Error("Could not determine YouTube video size");
          return {
            title: String(data?.title || "YouTube video"),
            duration: Number(data?.duration) > 0 ? Number(data.duration) : 0,
            mediaUrl, headers, size, strategy: id,
          };
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        last = error;
        console.warn("Vexa playback strategy failed", id, error?.message || error);
      }
    }
    throw last || new Error("YouTube could not prepare playback");
  }

  async inspectSize(mediaUrl, headers) {
    if (!this.ctx.container.running) await this.start();
    const p = await this.ctx.container.exec([
      "python", "-c", PY_INSPECT, mediaUrl, JSON.stringify(headers || {}),
    ]);
    const out = await p.output();
    const decoder = new TextDecoder();
    if (out.exitCode !== 0) throw classify(decoder.decode(out.stderr));
    return posInt(decoder.decode(out.stdout).trim());
  }

  async streamRange(mediaUrl, headers, start, end) {
    if (!this.ctx.container.running) await this.start();
    const p = await this.ctx.container.exec([
      "python", "-c", PY_STREAM,
      mediaUrl, JSON.stringify(headers || {}), String(start), String(end),
    ]);
    if (!p.stdout) throw new Error("Could not start YouTube playback");

    const stderrPromise = readText(p.stderr, 16_384);
    const reader = p.stdout.getReader();
    let timer = 0;
    let first;
    try {
      first = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("YouTube playback did not start in time")), START_TIMEOUT);
        }),
      ]);
    } catch (error) {
      try { await reader.cancel(); } catch {}
      try { p.kill(); } catch {}
      const detail = await stderrPromise.catch(() => "");
      throw detail ? classify(detail) : error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (first.done || !first.value?.byteLength) {
      const detail = await failureDetail(p, stderrPromise);
      try { await reader.cancel(); } catch {}
      try { p.kill(); } catch {}
      throw classify(detail || "empty playback stream");
    }

    let firstPending = true;
    return new ReadableStream({
      async pull(controller) {
        if (firstPending) {
          firstPending = false;
          controller.enqueue(first.value);
          return;
        }
        try {
          const next = await reader.read();
          if (next.done) {
            const code = await p.exitCode;
            const detail = await stderrPromise.catch(() => "");
            if (code !== 0) {
              controller.error(classify(detail || "playback failed"));
              return;
            }
            controller.close();
            return;
          }
          if (next.value?.byteLength) controller.enqueue(next.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason); } catch {}
        try { p.kill(); } catch {}
      },
    });
  }
}

export function isPlaybackRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PREPARE_PATH || path === PLAY_PATH || path === RUNTIME_PATH;
}

export async function handlePlaybackRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === RUNTIME_PATH) {
    return new Response(RUNTIME, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && path === PREPARE_PATH) return prepare(request, env, ctx);
  if ((request.method === "GET" || request.method === "HEAD") && path === PLAY_PATH) return play(request, env);
  return json({ error: "Method Not Allowed" }, 405);
}

export async function injectPlaybackRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  if (!String(response.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) return response;

  const source = await response.text();
  const script = '<script src="' + RUNTIME_PATH + '?v=20260819-2"></script>';
  const html = source.includes(RUNTIME_PATH)
    ? source
    : source.includes("</body>") ? source.replace("</body>", script + "\n</body>") : source + script;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function prepare(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertAccess(env, user.id);
  const source = normalizeUrl(payload.url);
  if (!source) return json({ error: "Enter a valid YouTube link" }, 400);

  const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeKey(user.id));
  let media;
  try {
    media = await container.resolvePlayback(source);
  } catch (error) {
    console.error("Vexa playback prepare failed", error?.stack || error);
    return json({ error: publicError(error) }, 502);
  }

  await ensureTable(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO vexa_youtube_playback_tokens " +
    "(token,user_id,source_url,media_url,media_headers,media_size,title,created_at,expires_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    token, String(user.id), source, media.mediaUrl, JSON.stringify(media.headers || {}),
    media.size, media.title, now, now + TOKEN_TTL
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_youtube_playback_tokens WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    playbackUrl: PLAY_PATH + "?token=" + encodeURIComponent(token),
    title: media.title,
    duration: media.duration,
    expiresIn: TOKEN_TTL,
  });
}

async function play(request, env) {
  const checked = await lookup(request, env);
  if (checked.response) return checked.response;
  let row = checked.row;
  let size = posInt(row.media_size);
  if (!size) return json({ error: "Playback source is invalid" }, 500);

  let range = parseRange(request.headers.get("Range"), size);
  if (range.error) return range416(size);

  const container = getContainer(env.VEXA_MEDIA, "youtube-" + safeKey(row.user_id));
  if (request.method === "HEAD") {
    return new Response(null, { status: range.partial ? 206 : 200, headers: mediaHeaders(size, range) });
  }

  let body;
  try {
    body = await container.streamRange(
      String(row.media_url), parseHeaders(row.media_headers), range.start, range.end
    );
  } catch (error) {
    const source = normalizeUrl(row.source_url);
    if (!source) throw error;
    console.warn("Refreshing expired YouTube playback URL", error?.message || error);
    const fresh = await container.resolvePlayback(source);
    size = posInt(fresh.size);
    range = parseRange(request.headers.get("Range"), size);
    if (range.error) return range416(size);
    row = {
      ...row,
      media_url: fresh.mediaUrl,
      media_headers: JSON.stringify(fresh.headers || {}),
      media_size: size,
      title: fresh.title || row.title,
    };
    await env.DB.prepare(
      "UPDATE vexa_youtube_playback_tokens SET media_url=?,media_headers=?,media_size=?,title=? WHERE token=?"
    ).bind(row.media_url, row.media_headers, row.media_size, row.title, checked.token).run();
    body = await container.streamRange(
      String(row.media_url), parseHeaders(row.media_headers), range.start, range.end
    );
  }

  return new Response(body, {
    status: range.partial ? 206 : 200,
    headers: mediaHeaders(size, range),
  });
}

function parseRange(value, size) {
  const raw = String(value || "").trim();
  if (!raw) return { start: 0, end: size - 1, partial: false };
  const m = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!m) return { error: true };
  let start, end;
  if (!m[1] && m[2]) {
    const suffix = posInt(m[2]);
    if (!suffix) return { error: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(m[1], 10);
    end = m[2] ? Number.parseInt(m[2], 10) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return { error: true };
    end = Math.min(end, size - 1);
  }
  return { start, end, partial: true };
}

function mediaHeaders(size, range) {
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (range.partial) headers.set("Content-Range", "bytes " + range.start + "-" + range.end + "/" + size);
  return headers;
}

function range416(size) {
  return new Response(null, {
    status: 416,
    headers: {
      "Content-Range": "bytes */" + size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}

async function lookup(request, env) {
  const token = String(new URL(request.url).searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return { response: json({ error: "Playback link is invalid" }, 400) };
  await ensureTable(env);
  const row = await env.DB.prepare(
    "SELECT user_id,source_url,media_url,media_headers,media_size,title,expires_at " +
    "FROM vexa_youtube_playback_tokens WHERE token=?"
  ).bind(token).first();
  if (!row || Number(row.expires_at || 0) <= Math.floor(Date.now() / 1000)) {
    return { response: json({ error: "Playback link expired" }, 410) };
  }
  return { row, token };
}

async function assertAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env), getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    const error = new Error("Vexa Live is updating");
    error.status = 423;
    throw error;
  }
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try { url = new URL(raw); } catch { return ""; }
  if (url.protocol !== "https:" || url.username || url.password || !HOSTS.has(url.hostname.toLowerCase())) return "";
  url.hash = "";
  return url.toString();
}

function cleanHeaders(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [name, value] of Object.entries(input)) {
    const key = String(name || "").replace(/[^A-Za-z0-9-]/g, "");
    const val = String(value || "").replace(/[\r\n]+/g, " ").trim();
    if (!key || !val || key.toLowerCase() === "host") continue;
    out[key] = val;
  }
  return out;
}

function parseHeaders(value) {
  try { return cleanHeaders(JSON.parse(String(value || "{}"))); } catch { return {}; }
}

function safeKey(value) {
  return (String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "") || "anonymous").slice(0, 80);
}

function posInt(value) {
  const n = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function readText(stream, maxBytes) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "", total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value?.byteLength) continue;
      total += part.value.byteLength;
      if (total <= maxBytes) out += decoder.decode(part.value, { stream: true });
    }
    out += decoder.decode();
  } catch {}
  return out.trim();
}

async function failureDetail(process, stderrPromise) {
  const [code, stderr] = await Promise.all([
    process.exitCode.catch(() => -1), stderrPromise.catch(() => ""),
  ]);
  return String(stderr || "").trim() || "playback process exited with code " + code;
}

function classify(detail) {
  const raw = String(detail || "");
  if (/403|forbidden|upstream status 403/i.test(raw)) return new Error("YouTube blocked this playback request (403)");
  if (/po token|proof.of.origin|missing_pot/i.test(raw)) return new Error("YouTube requires additional playback authorization");
  if (/sign in|not a bot|private|members-only|age-restricted/i.test(raw)) return new Error("YouTube blocked this Cloudflare server");
  if (/unavailable|not available|video unavailable/i.test(raw)) return new Error("This YouTube video is unavailable");
  if (/requested format is not available|no video formats found/i.test(raw)) return new Error("This video does not expose a playable MP4 format");
  console.error("Playback upstream error", raw.slice(-3000));
  return new Error("YouTube could not prepare playback");
}

function publicError(error) {
  const message = String(error?.message || "");
  const allowed = new Set([
    "YouTube blocked this playback request (403)",
    "YouTube requires additional playback authorization",
    "YouTube blocked this Cloudflare server",
    "This YouTube video is unavailable",
    "This video does not expose a playable MP4 format",
    "YouTube did not return a playable MP4 URL",
    "Could not determine YouTube video size",
    "YouTube playback did not start in time",
    "YouTube could not prepare playback",
  ]);
  return allowed.has(message) ? message : "YouTube playback is temporarily unavailable";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function ensureTable(env) {
  if (!tableReady) {
    tableReady = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_youtube_playback_tokens (" +
      "token TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_url TEXT NOT NULL," +
      "media_url TEXT NOT NULL,media_headers TEXT NOT NULL,media_size INTEGER NOT NULL," +
      "title TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)"
    ).run().catch(error => { tableReady = null; throw error; });
  }
  await tableReady;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const RUNTIME = String.raw`
(function () {
  const PLAY_PREPARE = "/mini-app/live/api/youtube-playback/prepare";
  const DOWNLOAD_PREPARE = "/mini-app/live/api/youtube-download/prepare";
  let sourceUrl = "";
  let downloadBusy = false;

  function host() {
    try {
      if (parent && parent !== window && parent.location.origin === location.origin) return parent;
    } catch {}
    return window;
  }
  function tg() { const h = host(); return window.Telegram?.WebApp || h.Telegram?.WebApp || null; }
  function initData() { return String(tg()?.initData || ""); }
  function haptic(kind) { try { tg()?.HapticFeedback?.impactOccurred?.(kind || "light"); } catch {} }

  function state(busy, message, error) {
    const open = document.getElementById("vexaLiveLoad");
    const input = document.getElementById("vexaLiveYoutubeUrl");
    const status = document.getElementById("vexaLiveStatus");
    if (open) { open.disabled = !!busy; open.textContent = busy ? "Opening…" : "Open"; }
    if (input) input.disabled = !!busy;
    if (status) {
      status.textContent = String(message || "");
      status.classList.toggle("show", !!message);
      status.classList.toggle("error", !!error);
    }
  }

  function videoNode() {
    const old = document.getElementById("vexaLiveVideo");
    if (old?.tagName === "VIDEO") return old;
    const video = document.createElement("video");
    video.id = "vexaLiveVideo";
    video.className = old?.className || "vexa-live-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.style.objectFit = "contain";
    old?.replaceWith(video);
    return video;
  }

  function show(title) {
    document.getElementById("vexaLiveStage")?.classList.add("show");
    const empty = document.getElementById("vexaLiveEmpty");
    if (empty) empty.style.display = "none";
    const titleNode = document.getElementById("vexaLiveVideoTitle");
    if (titleNode) titleNode.textContent = String(title || "YouTube video");
    const dl = document.getElementById("vexaLiveDownload");
    if (dl) { dl.disabled = false; dl.textContent = "Download"; dl.classList.add("show"); }
  }

  async function openVideo() {
    const value = String(document.getElementById("vexaLiveYoutubeUrl")?.value || "").trim();
    if (!value) return state(false, "Paste a YouTube link", true);
    state(true, "Preparing video…", false);
    haptic("light");
    try {
      const response = await fetch(PLAY_PREPARE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: initData(), url: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.playbackUrl) throw new Error(String(data.error || "Could not prepare this video"));

      const video = videoNode();
      sourceUrl = value;
      show(data.title);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.src = new URL(String(data.playbackUrl), location.origin).href;
      video.addEventListener("loadedmetadata", () => state(false, "", false), { once: true });
      video.addEventListener("playing", () => state(false, "", false));
      video.addEventListener("waiting", () => state(false, "Buffering…", false));
      video.addEventListener("error", () => state(false, "Could not play this YouTube video", true), { once: true });
      video.load();
      state(false, "Buffering…", false);
      try { await video.play(); } catch {}
      haptic("medium");
    } catch (error) {
      state(false, String(error?.message || "Could not open this video"), true);
    }
  }

  async function download() {
    if (!sourceUrl || downloadBusy) return;
    const button = document.getElementById("vexaLiveDownload");
    downloadBusy = true;
    if (button) { button.disabled = true; button.textContent = "Preparing…"; }
    state(false, "Preparing download…", false);
    try {
      const response = await fetch(DOWNLOAD_PREPARE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: initData(), url: sourceUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.downloadUrl) throw new Error(String(data.error || "Could not prepare download"));
      const href = new URL(String(data.downloadUrl), location.origin).href;
      const fileName = String(data.fileName || "Vexa-YouTube-video.mp4");
      if (tg()?.downloadFile) {
        tg().downloadFile({ url: href, file_name: fileName });
      } else {
        const a = document.createElement("a");
        a.href = href; a.download = fileName; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      }
      state(false, "Download started", false);
      haptic("medium");
    } catch (error) {
      state(false, String(error?.message || "Could not prepare download"), true);
    } finally {
      downloadBusy = false;
      if (button) { button.disabled = false; button.textContent = "Download"; }
    }
  }

  function bind() {
    const open = document.getElementById("vexaLiveLoad");
    const input = document.getElementById("vexaLiveYoutubeUrl");
    const dl = document.getElementById("vexaLiveDownload");
    if (!open || !input || !dl) return false;
    videoNode();

    open.addEventListener("click", event => {
      event.preventDefault(); event.stopImmediatePropagation(); openVideo();
    }, true);
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault(); event.stopImmediatePropagation(); openVideo();
    }, true);
    dl.addEventListener("click", event => {
      event.preventDefault(); event.stopImmediatePropagation(); download();
    }, true);

    document.documentElement.dataset.vexaRangePlayback = "1";
    return true;
  }

  if (!bind()) {
    const observer = new MutationObserver(() => { if (bind()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;
