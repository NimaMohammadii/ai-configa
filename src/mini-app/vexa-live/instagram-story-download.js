import { DurableObject } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";
import {
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { VexaInstagramContainer } from "./instagram-download.js";

const PREPARE_PATH = "/mini-app/live/api/instagram-story/prepare";
const SESSION_PATH = "/mini-app/live/api/instagram-story/session";
const DOWNLOAD_PATH = "/mini-app/live/api/instagram-story/download";
const PROGRESS_PATH = "/mini-app/live/api/instagram-story/progress";
export const INSTAGRAM_STORY_RUNTIME_PATH = "/mini-app/vexa-live/instagram-story-download.js";

const TOKEN_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 60 * 60;
const LIVE_SESSION_TTL_SECONDS = 6 * 60 * 60;
const METADATA_TIMEOUT_MS = 90_000;
const INSTAGRAM_API_TIMEOUT_MS = 20_000;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 750;
const INSTAGRAM_HOST_SUFFIX = "instagram.com";
const STORY_FILE_PREFIX = "Vexa-Instagram-Story-";
const HIGHLIGHT_FILE_PREFIX = "Vexa-Instagram-Highlight-";
const LIVE_FILE_PREFIX = "Vexa-Instagram-Live-";
const INSTAGRAM_WEB_APP_ID = "936619743392459";
const STORY_YTDLP_ARGS = Object.freeze([
  "--ignore-config",
  "--force-ipv4",
  "--js-runtimes",
  "deno",
  "--socket-timeout",
  "15",
  "--retries",
  "2",
  "--fragment-retries",
  "2",
]);
const STORY_YTDLP_WITH_SESSION_SCRIPT = [
  "set -eu",
  "umask 077",
  'cookie_file="/tmp/vexa-instagram-story-cookies.txt"',
  'printf \'%s\\n\' "$INSTAGRAM_COOKIES" > "$cookie_file"',
  "unset INSTAGRAM_COOKIES",
  'exec yt-dlp --cookies "$cookie_file" "$@"',
].join("\n");

let tablesReady = null;
let progressTableReady = null;

export class VexaInstagramStoryContainer extends VexaInstagramContainer {
  async execYtDlp(args, options = {}) {
    const auth = instagramAuth(this.env);
    if (!this.ctx.container.running) await this.start();
    return this.ctx.container.exec(
      ["sh", "-c", STORY_YTDLP_WITH_SESSION_SCRIPT, "vexa-instagram-story", ...args],
      {
        ...options,
        env: {
          ...(options?.env || {}),
          INSTAGRAM_COOKIES: auth.cookieFile,
        },
      },
    );
  }

  async getInstagramStoryCatalog(url) {
    if (isInstagramLiveUrl(url)) return this.getInstagramLiveCatalog(url);
    const process = await this.execYtDlp([
      ...STORY_YTDLP_ARGS,
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--verbose",
      url,
    ]);
    const timer = setTimeout(() => {
      try { process.kill(); } catch (error) {}
    }, METADATA_TIMEOUT_MS);

    try {
      const output = await process.output();
      const decoder = new TextDecoder();
      const detail = decoder.decode(output.stderr).trim();
      if (output.exitCode !== 0) {
        const diagnostic = detail.toLowerCase();
        console.error("Instagram Story yt-dlp auth diagnostic", {
          exitCode: output.exitCode,
          sessionConfigured: true,
          stderrBytes: output.stderr?.byteLength || 0,
          foundAccountCookies: diagnostic.includes("found instagram account cookies"),
          loginRequired: /login required|you need to log in|log in to access|sign in/u.test(diagnostic),
          loginRedirect: /redirect[^\n]*login|login[^\n]*redirect/u.test(diagnostic),
          challenge: /challenge|checkpoint/u.test(diagnostic),
          http403: /http error 403|\b403\b|forbidden/u.test(diagnostic),
          http404: /http error 404|\b404\b/u.test(diagnostic),
          http429: /http error 429|\b429\b|rate.?limit|too many requests/u.test(diagnostic),
          emptyResponse: /empty media response|empty response|no videos|no reels/u.test(diagnostic),
          unreachable: /unreachable|not accessible/u.test(diagnostic),
        });
        throw storyError(detail || "metadata failed");
      }
      const data = JSON.parse(decoder.decode(output.stdout));
      const catalog = buildStoryCatalog(data, url);
      if (!catalog.options.length) {
        throw new Error("Instagram did not expose a downloadable Story video");
      }
      return catalog;
    } catch (error) {
      if (isStoryPublicError(error)) throw error;
      throw storyError(error?.message || error);
    } finally {
      clearTimeout(timer);
    }
  }

  async streamInstagramStory(url, formatId, playlistIndex = 1) {
    if (isInstagramLiveUrl(url)) return this.streamInstagramLive(url);
    const selected = String(formatId || "").trim();
    const item = Math.max(1, Math.floor(Number(playlistIndex || 1)));
    if (!selected || selected.length > 120) throw new Error("Instagram Story format is unavailable");
    const process = await this.execYtDlp([
      ...STORY_YTDLP_ARGS,
      "--quiet",
      "--no-warnings",
      "--playlist-items",
      String(item),
      "-f",
      selected,
      "-o",
      "-",
      url,
    ]);
    return this.streamProcess(process);
  }

  async getInstagramLiveCatalog(url) {
    const live = await this.getInstagramLiveInfo(url);
    const username = instagramLiveUsername(url);
    return {
      title: "Instagram Live by " + username,
      type: "live",
      options: [{
        key: "s1",
        kind: "live",
        width: positiveInteger(live?.dimensions?.width),
        height: positiveInteger(live?.dimensions?.height),
        duration: 0,
        sizeBytes: 0,
        formatId: "live",
        playlistIndex: 1,
        filename: LIVE_FILE_PREFIX + sanitizeFileName(username) + ".mp4",
        label: "Live",
      }],
    };
  }

  async getInstagramLiveInfo(url) {
    const username = instagramLiveUsername(url);
    if (!username) throw new Error("Enter a valid Instagram Live link");
    const auth = instagramAuth(this.env);
    const profile = await fetchInstagramJson(
      "https://i.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username),
      auth,
    );
    const userId = String(profile?.data?.user?.id || "").trim();
    if (!/^\d+$/u.test(userId)) throw new Error("This Instagram account is unavailable");
    const live = await fetchInstagramJson(
      "https://i.instagram.com/api/v1/live/web_info/?target_user_id=" + encodeURIComponent(userId),
      auth,
    );
    const dashUrl = String(live?.dash_abr_playback_url || live?.broadcast?.dash_abr_playback_url || "").trim();
    if (!dashUrl) {
      const message = String(live?.message || live?.broadcast_status || "").toLowerCase();
      if (/not live|ended|stopped/u.test(message)) throw new Error("This Instagram account is not live now");
      throw new Error("This Instagram Live is unavailable");
    }
    if (!isTrustedInstagramMediaUrl(dashUrl)) throw new Error("Instagram returned an invalid Live stream");
    return { ...live, dashUrl };
  }

  async streamInstagramLive(url) {
    const live = await this.getInstagramLiveInfo(url);
    if (!this.ctx.container.running) await this.start();
    const process = await this.ctx.container.exec([
      "ffmpeg",
      "-hide_banner",
      "-loglevel", "warning",
      "-nostdin",
      "-rw_timeout", "15000000",
      "-i", live.dashUrl,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c", "copy",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-f", "mp4",
      "pipe:1",
    ]);
    return this.streamProcess(process);
  }
}

export class VexaInstagramStoryProgressHub extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/socket") {
      if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("WebSocket Required", { status: 426 });
      }
      const session = cleanToken(url.searchParams.get("session"));
      if (!session) return new Response("Invalid session", { status: 400 });
      await ensureProgressTable(this.env);
      const row = await readProgressRow(this.env, session);
      if (!row || Number(row.expires_at || 0) <= Math.floor(Date.now() / 1000)) {
        return new Response("Download session expired", { status: 410 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      try { server.serializeAttachment({ session }); } catch (error) {}
      try { server.send(JSON.stringify(progressPayload(row))); } catch (error) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      const payload = await request.json().catch(() => ({}));
      const session = cleanToken(payload?.session);
      if (!session) return new Response("Invalid session", { status: 400 });
      const message = JSON.stringify({
        ok: true,
        totalBytes: positiveInteger(payload?.totalBytes),
        downloadedBytes: Math.max(0, Number(payload?.downloadedBytes || 0)),
        percent: Math.max(0, Math.min(100, Number(payload?.percent || 0))),
        status: String(payload?.status || "ready"),
        error: payload?.error ? String(payload.error) : "",
        updatedAt: Number(payload?.updatedAt || 0),
      });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          const attachment = socket.deserializeAttachment?.();
          if (!attachment?.session || attachment.session === session) socket.send(message);
        } catch (error) {}
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Not Found", { status: 404 });
  }

  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}

export function isInstagramStoryDownloadRequest(request) {
  const path = new URL(request.url).pathname;
  return path === PREPARE_PATH ||
    path === SESSION_PATH ||
    path === DOWNLOAD_PATH ||
    path === PROGRESS_PATH ||
    path === INSTAGRAM_STORY_RUNTIME_PATH;
}

export async function handleInstagramStoryDownloadRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === INSTAGRAM_STORY_RUNTIME_PATH) {
    return new Response(INSTAGRAM_STORY_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && url.pathname === PREPARE_PATH) {
    return prepareStory(request, env, ctx);
  }
  if (request.method === "POST" && url.pathname === SESSION_PATH) {
    return createStorySession(request, env, ctx);
  }
  if (request.method === "GET" && url.pathname === PROGRESS_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      return openStoryProgressSocket(request, env);
    }
    return readStoryProgress(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DOWNLOAD_PATH) {
    if (request.method === "HEAD") return storyDownloadHead(request, env);
    return trackedStoryDownload(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendInstagramStoryRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + INSTAGRAM_STORY_RUNTIME_PATH + '?v=20260827-2"></script>';
  const html = source.includes(INSTAGRAM_STORY_RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function prepareStory(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const sourceUrl = normalizeInstagramStoryUrl(payload.url);
  if (!sourceUrl) return json({ error: "Enter a valid Instagram Story or Highlight link" }, 400);
  if (!env.VEXA_INSTAGRAM_STORY) return json({ error: "Instagram Story download is temporarily unavailable" }, 503);

  let catalog;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM_STORY, "instagram-story-" + safeContainerKey(user.id));
    catalog = await container.getInstagramStoryCatalog(sourceUrl);
  } catch (error) {
    console.error("Vexa Instagram Story metadata failed", error?.stack || error);
    return json({ error: publicStoryError(error) }, 502);
  }

  const options = sanitizeStoryOptions(catalog?.options);
  if (!options.length) return json({ error: "Instagram did not expose a downloadable Story video" }, 422);

  await ensureStoryTables(env);
  const now = Math.floor(Date.now() / 1000);
  const token = randomToken();
  const title = String(catalog?.title || "Instagram Story").slice(0, 500);
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_story_tokens " +
    "(token, user_id, source_url, title, catalog_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    token,
    String(user.id),
    sourceUrl,
    title,
    JSON.stringify(options),
    now,
    now + TOKEN_TTL_SECONDS,
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_instagram_story_tokens WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    downloadToken: token,
    title,
    type: catalog?.type || "story",
    options,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

async function createStorySession(request, env, ctx) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const token = cleanToken(payload.downloadToken);
  const optionKey = cleanStoryOptionKey(payload.optionKey);
  if (!token || !optionKey) return json({ error: "Instagram Story download session is invalid" }, 400);

  await ensureStoryTables(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT user_id, source_url, title, catalog_json, expires_at FROM vexa_instagram_story_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row || Number(row.expires_at || 0) <= now) {
    return json({ error: "Instagram Story download session expired. Prepare it again." }, 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    return json({ error: "Instagram Story download session does not belong to this user" }, 403);
  }

  const options = parseStoryCatalog(row.catalog_json);
  const selected = options.find((option) => option.key === optionKey) || null;
  if (!selected) return json({ error: "Selected Instagram Story is unavailable" }, 409);

  const session = randomToken();
  const totalBytes = positiveInteger(selected.sizeBytes);
  const live = selected.kind === "live";
  const fileName = String(selected.filename || (live
    ? LIVE_FILE_PREFIX + "recording.mp4"
    : STORY_FILE_PREFIX + String(selected.playlistIndex).padStart(3, "0") + ".mp4"));
  await env.DB.prepare(
    "INSERT INTO vexa_instagram_story_progress " +
    "(session, download_token, user_id, source_url, format_id, playlist_index, option_key, file_name, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ready', NULL, ?, ?, ?)"
  ).bind(
    session,
    token,
    String(user.id),
    String(row.source_url),
    String(selected.formatId),
    positiveInteger(selected.playlistIndex),
    selected.key,
    fileName,
    totalBytes,
    now,
    now,
    now + (live ? LIVE_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS),
  ).run();

  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_instagram_story_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );

  return json({
    ok: true,
    fileName,
    fileSize: totalBytes,
    title: String(row.title || "Instagram Story"),
    optionKey: selected.key,
    live,
    downloadUrl: DOWNLOAD_PATH + "?token=" + encodeURIComponent(token) + "&session=" + encodeURIComponent(session),
    progressUrl: PROGRESS_PATH + "?session=" + encodeURIComponent(session),
    expiresIn: live ? LIVE_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS,
  });
}

async function storyDownloadHead(request, env) {
  const checked = await validateStorySession(request, env);
  if (checked.response) return checked.response;
  return new Response(null, { status: 200, headers: storyDownloadHeaders(checked.row.file_name) });
}

async function trackedStoryDownload(request, env, ctx) {
  const checked = await validateStorySession(request, env);
  if (checked.response) return checked.response;
  const row = checked.row;
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  let totalBytes = positiveInteger(row.total_bytes);
  await writeStoryProgress(env, session, 0, "preparing", "", totalBytes).catch(() => null);

  let sourceStream;
  try {
    const container = getContainer(env.VEXA_INSTAGRAM_STORY, "instagram-story-" + safeContainerKey(row.user_id));
    sourceStream = await container.streamInstagramStory(
      String(row.source_url),
      String(row.format_id),
      positiveInteger(row.playlist_index),
    );
  } catch (error) {
    const message = publicStoryError(error);
    await writeStoryProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    return json({ error: message }, 502);
  }
  if (!sourceStream) {
    const message = "Could not start the Instagram Story download";
    await writeStoryProgress(env, session, 0, "failed", message, totalBytes).catch(() => null);
    return json({ error: message }, 502);
  }

  const reader = sourceStream.getReader();
  let downloaded = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = Date.now();
  let publishChain = Promise.resolve();
  let persistChain = Promise.resolve();
  let finished = false;
  let started = false;

  const enqueueProgress = (bytes, status, error) => {
    const now = Math.floor(Date.now() / 1000);
    const safeBytes = Math.max(0, Number(bytes || 0));
    const safeStatus = String(status || "ready");
    const safeError = error ? String(error).slice(0, 500) : "";
    publishChain = publishChain.then(() => publishStoryProgress(env, session, {
      totalBytes,
      downloadedBytes: safeBytes,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    })).catch(() => null);
    persistChain = persistChain.then(() => persistStoryProgress(
      env, session, safeBytes, safeStatus, safeError, now,
    )).catch(() => null);
    ctx?.waitUntil?.(Promise.all([publishChain, persistChain]));
  };

  const settleProgress = () => Promise.all([
    publishChain.catch(() => null),
    persistChain.catch(() => null),
  ]);

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (finished) return;
          finished = true;
          await settleProgress();
          await completeStoryProgress(env, session, downloaded).catch(() => null);
          controller.close();
          return;
        }
        if (!next.value?.byteLength) return;
        downloaded += next.value.byteLength;
        const nowMs = Date.now();
        if (!started || (downloaded - lastReportedBytes) >= PROGRESS_REPORT_BYTES || (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS) {
          started = true;
          lastReportedBytes = downloaded;
          lastReportedAt = nowMs;
          enqueueProgress(downloaded, "downloading", "");
        }
        controller.enqueue(next.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          await settleProgress();
          await writeStoryProgress(env, session, downloaded, "failed", publicStoryError(error), totalBytes).catch(() => null);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (error) {}
      if (!finished) {
        finished = true;
        await settleProgress();
        await writeStoryProgress(env, session, downloaded, "cancelled", "Download was cancelled", totalBytes).catch(() => null);
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: storyDownloadHeaders(row.file_name),
  });
}

async function validateStorySession(request, env) {
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const token = cleanToken(url.searchParams.get("token"));
  if (!session || !token) return { response: json({ error: "Instagram Story download link is invalid" }, 400) };
  await ensureStoryTables(env);
  const row = await env.DB.prepare(
    "SELECT download_token, user_id, source_url, format_id, playlist_index, option_key, file_name, total_bytes, status, expires_at " +
    "FROM vexa_instagram_story_progress WHERE session = ?"
  ).bind(session).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now || String(row.download_token || "") !== token) {
    return { response: json({ error: "Instagram Story download session expired" }, 410) };
  }
  return { row };
}

async function openStoryProgressSocket(request, env) {
  if (!env.VEXA_INSTAGRAM_STORY_PROGRESS) return json({ error: "Instagram Story progress is unavailable" }, 503);
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Instagram Story download session is invalid" }, 400);
  await ensureStoryTables(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Instagram Story download session expired" }, 410);
  const id = env.VEXA_INSTAGRAM_STORY_PROGRESS.idFromName(session);
  const stub = env.VEXA_INSTAGRAM_STORY_PROGRESS.get(id);
  const target = new URL("https://vexa-instagram-story-progress/socket");
  target.searchParams.set("session", session);
  return stub.fetch(new Request(target.href, request));
}

async function readStoryProgress(request, env) {
  const session = cleanToken(new URL(request.url).searchParams.get("session"));
  if (!session) return json({ error: "Instagram Story download session is invalid" }, 400);
  await ensureStoryTables(env);
  const row = await readProgressRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) return json({ error: "Instagram Story download session expired" }, 410);
  return json(progressPayload(row));
}

async function readProgressRow(env, session) {
  return env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes, status, error, updated_at, expires_at FROM vexa_instagram_story_progress WHERE session = ?"
  ).bind(session).first();
}

function progressPayload(row) {
  const totalBytes = positiveInteger(row?.total_bytes);
  const downloadedBytes = Math.max(0, Number(row?.downloaded_bytes || 0));
  const status = String(row?.status || "ready");
  return {
    ok: true,
    totalBytes,
    downloadedBytes,
    percent: progressPercent(downloadedBytes, totalBytes, status),
    status,
    error: row?.error ? String(row.error) : "",
    updatedAt: Number(row?.updated_at || 0),
  };
}

async function persistStoryProgress(env, session, downloadedBytes, status, error, updatedAt) {
  await env.DB.prepare(
    "UPDATE vexa_instagram_story_progress SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "ready"),
    error ? String(error).slice(0, 500) : null,
    Number(updatedAt || Math.floor(Date.now() / 1000)),
    session,
  ).run();
}

async function writeStoryProgress(env, session, downloadedBytes, status, error, totalBytes) {
  const now = Math.floor(Date.now() / 1000);
  const safeDownloaded = Math.max(0, Number(downloadedBytes || 0));
  const safeStatus = String(status || "ready");
  const safeError = error ? String(error).slice(0, 500) : "";
  await Promise.all([
    persistStoryProgress(env, session, safeDownloaded, safeStatus, safeError, now),
    publishStoryProgress(env, session, {
      totalBytes: positiveInteger(totalBytes),
      downloadedBytes: safeDownloaded,
      status: safeStatus,
      error: safeError,
      updatedAt: now,
    }),
  ]);
}

async function completeStoryProgress(env, session, downloadedBytes) {
  const actualBytes = positiveInteger(downloadedBytes);
  const now = Math.floor(Date.now() / 1000);
  if (!actualBytes) {
    await writeStoryProgress(env, session, 0, "failed", "Download ended before data was received", 0);
    return;
  }
  await env.DB.prepare(
    "UPDATE vexa_instagram_story_progress SET total_bytes = ?, downloaded_bytes = ?, status = 'completed', error = NULL, updated_at = ? WHERE session = ?"
  ).bind(actualBytes, actualBytes, now, session).run();
  await publishStoryProgress(env, session, {
    totalBytes: actualBytes,
    downloadedBytes: actualBytes,
    status: "completed",
    error: "",
    updatedAt: now,
  });
}

async function publishStoryProgress(env, session, payload) {
  if (!env.VEXA_INSTAGRAM_STORY_PROGRESS) return;
  const totalBytes = positiveInteger(payload.totalBytes);
  const id = env.VEXA_INSTAGRAM_STORY_PROGRESS.idFromName(session);
  const stub = env.VEXA_INSTAGRAM_STORY_PROGRESS.get(id);
  await stub.fetch(new Request("https://vexa-instagram-story-progress/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      totalBytes,
      downloadedBytes: Math.max(0, Number(payload.downloadedBytes || 0)),
      percent: progressPercent(payload.downloadedBytes, totalBytes, payload.status),
      status: String(payload.status || "ready"),
      error: payload.error || "",
      updatedAt: Number(payload.updatedAt || 0),
    }),
  })).catch(() => null);
}

function progressPercent(downloadedBytes, totalBytes, status) {
  if (String(status || "") === "completed") return 100;
  const total = positiveInteger(totalBytes);
  if (!total) return 0;
  const value = (Math.max(0, Number(downloadedBytes || 0)) / total) * 100;
  return Math.max(0, Math.min(99, Math.round(value * 10) / 10));
}

async function ensureStoryTables(env) {
  if (!tablesReady) {
    tablesReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_instagram_story_tokens (" +
          "token TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_url TEXT NOT NULL, title TEXT, catalog_json TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_instagram_story_progress (" +
          "session TEXT PRIMARY KEY, download_token TEXT NOT NULL, user_id TEXT NOT NULL, source_url TEXT NOT NULL, " +
          "format_id TEXT NOT NULL, playlist_index INTEGER NOT NULL, option_key TEXT NOT NULL, file_name TEXT NOT NULL, " +
          "total_bytes INTEGER NOT NULL, downloaded_bytes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ready', " +
          "error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_vexa_instagram_story_user_created ON vexa_instagram_story_progress (user_id, created_at DESC)"
      ).run();
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  await tablesReady;
}

async function ensureProgressTable(env) {
  if (!progressTableReady) {
    progressTableReady = ensureStoryTables(env).catch((error) => {
      progressTableReady = null;
      throw error;
    });
  }
  await progressTableReady;
}

async function assertLiveAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
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

function buildStoryCatalog(data, sourceUrl) {
  const entries = storyEntries(data);
  const isHighlight = /\/stories\/highlights\//u.test(String(sourceUrl || ""));
  const options = [];

  for (let index = 0; index < entries.length && index < 60; index += 1) {
    const entry = entries[index];
    const best = bestStoryFormat(entry);
    if (!best) continue;
    const height = positiveInteger(best.height || entry?.height);
    const width = positiveInteger(best.width || entry?.width);
    const duration = positiveNumber(entry?.duration || best.duration);
    const formatId = String(best.format_id || "").trim();
    if (!formatId) continue;
    let sizeBytes = formatSizeBytes(best, duration);
    if (!sizeBytes) sizeBytes = estimatedStorySize(height, duration);
    if (!sizeBytes) continue;

    const itemNumber = index + 1;
    options.push({
      key: "s" + itemNumber,
      kind: "video",
      width,
      height,
      duration,
      sizeBytes,
      formatId,
      playlistIndex: itemNumber,
      filename: (isHighlight ? HIGHLIGHT_FILE_PREFIX : STORY_FILE_PREFIX) +
        String(itemNumber).padStart(3, "0") + ".mp4",
      label: (isHighlight ? "Highlight " : "Story ") + itemNumber,
    });
  }

  const title = String(data?.title || (isHighlight ? "Instagram Highlight" : "Instagram Story")).trim() ||
    (isHighlight ? "Instagram Highlight" : "Instagram Story");
  return { title, type: isHighlight ? "highlight" : "story", options };
}

function storyEntries(data) {
  if (Array.isArray(data?.formats) && data.formats.length) return [data];
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.filter((entry) => Array.isArray(entry?.formats) && entry.formats.length);
}

function bestStoryFormat(entry) {
  const formats = Array.isArray(entry?.formats) ? entry.formats : [];
  return formats
    .filter(isStoryMp4Format)
    .sort((a, b) => storyFormatScore(b) - storyFormatScore(a))[0] || null;
}

function isStoryMp4Format(format) {
  if (!format || format.has_drm) return false;
  const ext = String(format.ext || "").toLowerCase();
  const protocol = String(format.protocol || "").toLowerCase();
  const url = String(format.url || "");
  const vcodec = String(format.vcodec || "").toLowerCase();
  const acodec = String(format.acodec || "").toLowerCase();
  if (ext !== "mp4" || !/^https?:\/\//i.test(url)) return false;
  if (protocol && !protocol.startsWith("http")) return false;
  if (vcodec === "none" || acodec === "none") return false;
  return true;
}

function storyFormatScore(format) {
  return positiveInteger(format?.height) * 1_000_000 +
    (positiveNumber(format?.fps) || 0) * 1000 +
    (positiveNumber(format?.tbr) || positiveNumber(format?.vbr) || 0);
}

function formatSizeBytes(format, duration) {
  const exact = positiveNumber(format?.filesize);
  if (exact) return Math.ceil(exact);
  const approximate = positiveNumber(format?.filesize_approx);
  if (approximate) return Math.ceil(approximate);
  const bitrate = positiveNumber(format?.tbr) || positiveNumber(format?.vbr);
  if (!bitrate || !duration) return 0;
  return Math.ceil(bitrate * 125 * duration * 1.05);
}

function estimatedStorySize(height, duration) {
  if (!duration) return 0;
  const effectiveHeight = Math.max(360, height || 720);
  const kbps = Math.max(900, Math.min(6500, effectiveHeight * 4.2));
  return Math.ceil(kbps * 125 * duration * 1.08);
}

function sanitizeStoryOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => ({
    key: cleanStoryOptionKey(option?.key),
    kind: option?.kind === "live" ? "live" : "video",
    width: positiveInteger(option?.width),
    height: positiveInteger(option?.height),
    duration: positiveNumber(option?.duration),
    sizeBytes: positiveInteger(option?.sizeBytes),
    formatId: String(option?.formatId || "").slice(0, 120),
    playlistIndex: positiveInteger(option?.playlistIndex),
    filename: String(option?.filename || "").slice(0, 240),
    label: String(option?.label || "").slice(0, 80),
  })).filter((option) =>
    option.key && option.formatId && option.playlistIndex && option.filename &&
    (option.kind === "live" || option.sizeBytes));
}

function parseStoryCatalog(value) {
  try { return sanitizeStoryOptions(JSON.parse(String(value || "[]"))); } catch (error) { return []; }
}

export function normalizeInstagramStoryUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  let url;
  try { url = new URL(raw); } catch (error) { return ""; }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  const host = url.hostname.toLowerCase();
  if (!(host === INSTAGRAM_HOST_SUFFIX || host.endsWith("." + INSTAGRAM_HOST_SUFFIX))) return "";
  const path = url.pathname.replace(/\/+$/u, "");
  const highlight = path.match(/^\/stories\/highlights\/(\d+)$/u);
  const story = path.match(/^\/stories\/([A-Za-z0-9._]+)(?:\/(\d+))?$/u);
  const live = path.match(/^\/([A-Za-z0-9._]+)\/live$/u);
  if (!highlight && !story && !live) return "";
  url.hostname = "www.instagram.com";
  url.pathname = live
    ? "/" + live[1] + "/live/"
    : highlight
      ? "/stories/highlights/" + highlight[1] + "/"
      : "/stories/" + story[1] + (story[2] ? "/" + story[2] : "") + "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function storyDownloadHeaders(fileName) {
  const name = sanitizeFileName(fileName) || "Vexa-Instagram-Story.mp4";
  return new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="' + name + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
  });
}

function sanitizeFileName(value) {
  return String(value || "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
}

function storyError(detail) {
  const raw = String(detail || "");
  if (/rate.?limit|too many requests|http error 429|exceeded the rate-limit/i.test(raw)) {
    return new Error("Instagram temporarily rate-limited the server");
  }
  if (/provided instagram account cookies are no longer valid|redirect[^\n]*login|login[^\n]*redirect|challenge_required|checkpoint_required/i.test(raw)) {
    return new Error("Instagram login session expired. Refresh the Instagram cookies");
  }
  if (/login required|you need to log in|log in|sign in|registered users|private|unreachable/i.test(raw)) {
    return new Error("This Instagram Story, Highlight or Live requires a valid login");
  }
  if (/not available|unavailable|removed|deleted|empty media response/i.test(raw)) {
    return new Error("This Instagram Story or Highlight is unavailable");
  }
  if (/no video|no formats|requested format is not available/i.test(raw)) {
    return new Error("Instagram did not expose a downloadable Story video");
  }
  if (/403|forbidden/i.test(raw)) {
    return new Error("Instagram blocked the Cloudflare Story request");
  }
  if (/stream did not start/i.test(raw)) return new Error("Instagram Story stream did not start in time");
  if (/invalid mp4/i.test(raw)) return new Error("Instagram returned an invalid Story MP4 stream");
  console.error("Unclassified Instagram Story yt-dlp error", raw.slice(-4000));
  return new Error("Instagram Story download is temporarily unavailable");
}

function publicStoryError(error) {
  const message = String(error?.message || "");
  return STORY_PUBLIC_ERRORS.has(message) ? message : storyError(message).message;
}

function isStoryPublicError(error) {
  return STORY_PUBLIC_ERRORS.has(String(error?.message || ""));
}

const STORY_PUBLIC_ERRORS = new Set([
  "Instagram temporarily rate-limited the server",
  "Instagram login session expired. Refresh the Instagram cookies",
  "This Instagram Story, Highlight or Live requires a valid login",
  "This Instagram Story or Highlight is unavailable",
  "Instagram did not expose a downloadable Story video",
  "Instagram blocked the Cloudflare Story request",
  "Instagram Story stream did not start in time",
  "Instagram returned an invalid Story MP4 stream",
  "Instagram Story download is temporarily unavailable",
  "Instagram Story login is temporarily unavailable",
  "Instagram authenticated request temporarily failed",
  "Could not start the Instagram Story download",
  "Enter a valid Instagram Story or Highlight link",
  "Selected Instagram Story is no longer available",
  "Instagram Story video is unavailable",
  "Enter a valid Instagram Live link",
  "This Instagram account is unavailable",
  "This Instagram account is not live now",
  "This Instagram Live is unavailable",
  "Instagram returned an invalid Live stream",
]);

function instagramAuth(env) {
  const cookies = new Map();
  const configured = String(env?.INSTAGRAM_COOKIES || "").trim();
  if (configured) {
    if (/^# Netscape HTTP Cookie File/im.test(configured) || /\t/u.test(configured)) {
      for (const rawLine of configured.split(/\r?\n/u)) {
        if (!rawLine) continue;
        const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice(10) : rawLine;
        if (line.startsWith("#")) continue;
        const fields = line.split("\t");
        if (fields.length < 7) continue;
        const domain = String(fields[0] || "").replace(/^\./u, "").toLowerCase();
        if (domain !== "instagram.com" && !domain.endsWith(".instagram.com")) continue;
        addInstagramCookie(cookies, fields[5], fields.slice(6).join("\t"));
      }
    } else {
      for (const part of configured.split(";")) {
        const separator = part.indexOf("=");
        if (separator <= 0) continue;
        addInstagramCookie(cookies, part.slice(0, separator), part.slice(separator + 1));
      }
    }
  }
  addInstagramCookie(cookies, "sessionid", env?.INSTAGRAM_SESSIONID, false);
  addInstagramCookie(cookies, "csrftoken", env?.INSTAGRAM_CSRFTOKEN, false);
  addInstagramCookie(cookies, "ds_user_id", env?.INSTAGRAM_DS_USER_ID, false);

  if (!cookies.get("sessionid")) {
    throw new Error("Instagram Story login is temporarily unavailable");
  }

  const lines = ["# Netscape HTTP Cookie File"];
  for (const [name, value] of cookies) {
    lines.push([".instagram.com", "TRUE", "/", "TRUE", "0", name, value].join("\t"));
  }
  return {
    cookieFile: lines.join("\n") + "\n",
    cookieHeader: [...cookies].map(([name, value]) => name + "=" + value).join("; "),
    csrfToken: cookies.get("csrftoken") || "",
  };
}

function addInstagramCookie(cookies, rawName, rawValue, replace = true) {
  const name = String(rawName || "").trim();
  const value = String(rawValue || "").trim();
  if (!/^[A-Za-z0-9_]+$/u.test(name) || !value || /[\u0000-\u001F\u007F;\t]/u.test(value)) return;
  if (replace || !cookies.has(name)) cookies.set(name, value);
}

async function fetchInstagramJson(url, auth) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: instagramRequestHeaders(auth),
      redirect: "manual",
      signal: AbortSignal.timeout(INSTAGRAM_API_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error("Instagram authenticated request temporarily failed");
  }
  const location = String(response.headers.get("Location") || "");
  if (response.status === 401 || response.status === 403 || /\/accounts\/login/u.test(location)) {
    throw new Error("Instagram login session expired. Refresh the Instagram cookies");
  }
  if (response.status === 429) throw new Error("Instagram temporarily rate-limited the server");
  const data = await response.json().catch(() => null);
  if (/login_required|checkpoint_required|challenge_required/u.test(String(data?.message || ""))) {
    throw new Error("Instagram login session expired. Refresh the Instagram cookies");
  }
  if (!response.ok || !data || typeof data !== "object") {
    throw new Error("Instagram authenticated request temporarily failed");
  }
  return data;
}

function instagramRequestHeaders(auth) {
  return {
    "Accept": "*/*",
    "Cookie": auth.cookieHeader,
    "Origin": "https://www.instagram.com",
    "Referer": "https://www.instagram.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "X-ASBD-ID": "359341",
    "X-IG-App-ID": INSTAGRAM_WEB_APP_ID,
    "X-IG-WWW-Claim": "0",
    ...(auth.csrfToken ? { "X-CSRFToken": auth.csrfToken } : {}),
  };
}

function isInstagramLiveUrl(value) {
  return Boolean(instagramLiveUsername(value));
}

function instagramLiveUsername(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (error) { return ""; }
  const match = url.pathname.replace(/\/+$/u, "").match(/^\/([A-Za-z0-9._]+)\/live$/u);
  return match ? match[1] : "";
}

function isTrustedInstagramMediaUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (error) { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "instagram.com" || host.endsWith(".instagram.com") ||
    host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") ||
    host === "fbcdn.net" || host.endsWith(".fbcdn.net");
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function cleanStoryOptionKey(value) {
  const key = String(value || "").trim();
  return /^s\d{1,3}$/u.test(key) ? key : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const INSTAGRAM_STORY_RUNTIME_JS = String.raw`
(function () {
  'use strict';
  const PREPARE_URL='/mini-app/live/api/instagram-story/prepare';
  const SESSION_URL='/mini-app/live/api/instagram-story/session';
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const qualityNode=document.getElementById('vexaLiveQuality');
  const originalPrompt=window.prompt.bind(window);
  let storyActive=false;
  let prepared=null;
  let preparingPromise=null;
  let downloadToken='';
  let sourceUrl='';
  let storyOptions=[];
  let selectedOptionKey='';
  let busy=false;
  let progressSocket=null;
  let reconnectTimer=0;
  let reconnectAttempt=0;
  let displayedPercent=0;
  let percentAnimation=0;
  let telegramEventBound=false;

  function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch(error){}return window;}
  function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
  function initData(){return String(telegram()?.initData||'');}
  function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch(error){}}
  function mb(bytes){return(Math.max(0,Number(bytes||0))/1048576).toFixed(1);}
  function normalizeStory(value){try{const url=new URL(String(value||'').trim());const host=url.hostname.toLowerCase();if(url.protocol!=='https:'||!(host==='instagram.com'||host.endsWith('.instagram.com')))return'';const path=url.pathname.replace(/\\/+$/,'');if(!(/^\\/stories\\/highlights\\/\\d+$/.test(path)||/^\\/stories\\/[A-Za-z0-9._]+(?:\\/\\d+)?$/.test(path)||/^\\/[A-Za-z0-9._]+\\/live$/.test(path)))return'';return url.href;}catch(error){return'';}}
  function launchPreset(){const host=hostWindow();try{const params=new URLSearchParams(host.location.search);if(params.get('vexaDownload')!=='1')return{source:'',optionKey:''};const source=String(params.get('vexaSource')||'').trim();const optionKey=/^s\\d{1,3}$/.test(String(params.get('vexaOption')||''))?String(params.get('vexaOption')):'';return{source,optionKey};}catch(error){return{source:'',optionKey:''};}}
  function stripPreset(){const host=hostWindow();try{const url=new URL(host.location.href);url.searchParams.delete('vexaDownload');url.searchParams.delete('vexaSource');url.searchParams.delete('vexaOption');host.history.replaceState(host.history.state,'',url.href);}catch(error){}}
  function setState(state,message,detail){if(root)root.dataset.state=String(state||'idle');if(statusNode)statusNode.textContent=String(message||'');if(detailNode)detailNode.textContent=String(detail||'');}
  function setButton(text,disabled){if(!button)return;button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function setProgress(value,animate){const target=Math.max(0,Math.min(100,Number(value||0)));if(root)root.style.setProperty('--vexa-progress',String(target/100));if(track)track.setAttribute('aria-valuenow',String(Math.round(target)));cancelAnimationFrame(percentAnimation);if(!animate){displayedPercent=target;if(percentNode)percentNode.textContent=Math.round(target)+'%';return;}const from=displayedPercent;const started=performance.now();const duration=Math.min(650,220+Math.abs(target-from)*12);const tick=function(now){const t=Math.min(1,(now-started)/Math.max(1,duration));const eased=1-Math.pow(1-t,3);displayedPercent=from+(target-from)*eased;if(percentNode)percentNode.textContent=Math.round(displayedPercent)+'%';if(t<1)percentAnimation=requestAnimationFrame(tick);};percentAnimation=requestAnimationFrame(tick);}
  function selectedStory(){return storyOptions.find(function(option){return option.key===selectedOptionKey;})||null;}
  function storyDetail(option){if(!option)return'';if(option.kind==='live')return'Live recording · Keep the app open until it ends';const resolution=Number(option.height||0)>0?' · '+Number(option.height)+'p':'';return String(option.label||option.key)+resolution+' · '+mb(option.sizeBytes)+' MB';}
  function updateSelection(){if(!qualityNode)return;for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedOptionKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}}
  function selectStory(key,announce){const option=storyOptions.find(function(item){return item.key===String(key||'');});if(!option||busy)return false;selectedOptionKey=option.key;prepared=null;closeProgressSocket();setProgress(0,true);updateSelection();if(announce!==false){setState('waiting','Ready to download',storyDetail(option));haptic('light');}setButton('Download',false);return true;}
  function renderStories(options,preferredKey){if(!qualityNode)return false;storyOptions=Array.isArray(options)?options.filter(function(option){return option&&/^s\\d{1,3}$/.test(String(option.key||''))&&(option.kind==='live'||Number(option.sizeBytes||0)>0);}):[];qualityNode.replaceChildren();if(!storyOptions.length){qualityNode.dataset.ready='0';selectedOptionKey='';return false;}qualityNode.style.maxHeight='176px';qualityNode.style.overflowY='auto';qualityNode.style.padding='2px';for(const option of storyOptions){const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');const label=document.createElement('span');label.textContent=String(option.label||option.key);const size=document.createElement('small');const resolution=Number(option.height||0)>0?Number(option.height)+'p · ':'';size.textContent=option.kind==='live'?'Records until the Live ends':resolution+mb(option.sizeBytes)+' MB';item.append(label,size);item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();selectStory(option.key,true);});qualityNode.appendChild(item);}qualityNode.dataset.ready='1';const preferred=storyOptions.some(function(option){return option.key===preferredKey;})?preferredKey:'';return selectStory(preferred||storyOptions[0].key,false);}
  function clearStories(){storyOptions=[];selectedOptionKey='';if(qualityNode){qualityNode.replaceChildren();qualityNode.dataset.ready='0';qualityNode.style.maxHeight='';qualityNode.style.overflowY='';qualityNode.style.padding='';}}
  function closeProgressSocket(){clearTimeout(reconnectTimer);reconnectTimer=0;reconnectAttempt=0;const socket=progressSocket;progressSocket=null;if(socket)try{socket.close(1000,'done');}catch(error){}}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  function handleProgress(data){if(!data?.ok)return;const total=Number(data.totalBytes||prepared?.fileSize||0);const done=Math.max(0,Number(data.downloadedBytes||0));const pct=Math.max(0,Math.min(100,Number(data.percent||0)));const state=String(data.status||'ready');const live=selectedStory()?.kind==='live'||prepared?.live;if(state==='completed'){busy=false;setProgress(100,true);setState('completed',live?'Live recording completed':'Downloaded',mb(done||total)+' MB');setButton('Download again',false);closeProgressSocket();haptic('medium');return;}if(state==='failed'||state==='cancelled'){busy=false;setState('error',String(data.error||'Download failed'),done?mb(done)+' MB received':storyDetail(selectedStory()));setButton('Try again',false);closeProgressSocket();prepared=null;return;}if(state==='preparing'){if(displayedPercent<=0)setProgress(0,false);setState('preparing',live?'Connecting to Instagram Live':'Preparing download','This may take a few minutes. Keep the app open.');return;}if(state==='downloading'){if(live){setState('downloading','Recording Instagram Live',mb(done)+' MB saved · Keep the app open');return;}setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Downloading',mb(done)+' MB / '+mb(total)+' MB · Keep the app open');}}
  function connectProgress(progressUrl){closeProgressSocket();const target=String(progressUrl||'');if(!target)return;const socket=new WebSocket(wsUrl(target));progressSocket=socket;socket.addEventListener('open',function(){if(progressSocket!==socket)return;reconnectAttempt=0;});socket.addEventListener('message',function(event){if(progressSocket!==socket)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}handleProgress(data);});socket.addEventListener('close',function(){if(progressSocket===socket)progressSocket=null;if(!busy||!prepared?.progressUrl)return;if(reconnectAttempt>=6){setState('preparing','Preparing download','Progress connection interrupted');return;}const delay=Math.min(5000,450*Math.pow(2,reconnectAttempt++));reconnectTimer=setTimeout(function(){if(busy&&prepared?.progressUrl)connectProgress(prepared.progressUrl);},delay);});socket.addEventListener('error',function(){try{socket.close();}catch(error){}});}
  function cancelDownload(){if(!busy)return;busy=false;closeProgressSocket();setProgress(0,true);setState('waiting','Download cancelled',storyDetail(selectedStory()));setButton('Download',false);}
  function handleTelegramEvent(event){const state=String(event?.status||event||'').toLowerCase();if(state==='cancelled'){cancelDownload();return;}if(state==='downloading'&&busy)setState('preparing','Starting download','This may take a few minutes. Keep the app open.');}
  function bindTelegramEvent(){if(telegramEventBound)return;const tg=telegram();if(!tg?.onEvent)return;try{tg.onEvent('fileDownloadRequested',handleTelegramEvent);telegramEventBound=true;}catch(error){}}
  async function prepareSource(source,preferredKey){if(preparingPromise)return preparingPromise;const clean=normalizeStory(source);if(!clean)return false;storyActive=true;sourceUrl=clean;downloadToken='';prepared=null;busy=false;closeProgressSocket();clearStories();setProgress(0,false);setState('preparing',/\\/live\\/?$/.test(new URL(clean).pathname)?'Checking Instagram Live':'Loading Instagram Story','This may take a few moments');setButton('Preparing…',true);haptic('light');preparingPromise=(async function(){try{const response=await fetch(PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:clean})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadToken||!Array.isArray(data.options)||!data.options.length)throw new Error(String(data.error||'Could not prepare Instagram Story'));downloadToken=String(data.downloadToken);if(!renderStories(data.options,preferredKey))throw new Error('Instagram Story is unavailable');const option=selectedStory();setProgress(0,false);setState('waiting',data.type==='live'?'Instagram Live is ready':data.type==='highlight'?'Choose highlight clip':'Choose story',storyDetail(option));setButton(data.type==='live'?'Start recording':'Download',false);haptic('light');return true;}catch(error){downloadToken='';prepared=null;clearStories();setState('error',String(error?.message||'Could not prepare Instagram Story'),'');setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}
  async function prepareSelectedDownload(){if(!downloadToken||!selectedOptionKey||preparingPromise)return false;const option=selectedStory();setState('preparing','Preparing '+String(option?.label||'Story'),storyDetail(option));setButton('Preparing…',true);preparingPromise=(async function(){try{const response=await fetch(SESSION_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedOptionKey})});const session=await response.json().catch(function(){return{};});if(!response.ok||!session.downloadUrl||!session.progressUrl||(!session.live&&!session.fileSize))throw new Error(String(session.error||'Could not prepare Instagram Story'));prepared={downloadUrl:new URL(String(session.downloadUrl),window.location.origin).href,progressUrl:new URL(String(session.progressUrl),window.location.origin).href,fileName:String(session.fileName||'Vexa-Instagram-Story.mp4'),fileSize:Number(session.fileSize||0),title:String(session.title||'Instagram Story'),optionKey:String(session.optionKey||selectedOptionKey),live:Boolean(session.live)};setProgress(0,false);setState('waiting',session.live?'Ready to record':'Ready to download',storyDetail(option));setButton(session.live?'Start recording':'Download',false);return true;}catch(error){prepared=null;setState('error',String(error?.message||'Could not prepare Instagram Story'),storyDetail(option));setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}
  function requestDownload(){if(!prepared||busy)return;busy=true;setProgress(0,false);setState('preparing','Waiting for Telegram','This may take a few minutes. Keep the app open.');setButton('Downloading…',true);connectProgress(prepared.progressUrl);bindTelegramEvent();haptic('light');const tg=telegram();if(tg?.downloadFile){try{tg.downloadFile({url:prepared.downloadUrl,file_name:prepared.fileName},function(accepted){if(accepted===false){cancelDownload();return;}setState('preparing','Starting download','This may take a few minutes. Keep the app open.');});return;}catch(error){console.warn('Telegram Instagram Story downloadFile failed',error?.message||error);}}try{const link=document.createElement('a');link.href=prepared.downloadUrl;link.download=prepared.fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setState('preparing','Starting download','This may take a few minutes. Keep the app open.');}catch(error){busy=false;closeProgressSocket();setState('error','Could not start download','');setButton('Try again',false);}}
  async function handleStoryButton(){if(busy||button?.disabled)return;if(prepared){requestDownload();return;}if(downloadToken&&selectedOptionKey){const ready=await prepareSelectedDownload();if(ready)requestDownload();return;}if(sourceUrl)await prepareSource(sourceUrl,selectedOptionKey);}
  function captureStoryClick(event){if(!storyActive)return;event.preventDefault();event.stopImmediatePropagation();handleStoryButton();}
  button?.addEventListener('click',captureStoryClick,true);
  bindTelegramEvent();

  window.prompt=function(message,defaultValue){const value=originalPrompt(message,defaultValue);if(value===null)return value;const clean=String(value||'').trim();const story=normalizeStory(clean);if(story){prepareSource(story,'');return'';}return value;};

  const preset=launchPreset();
  const storyPreset=normalizeStory(preset.source);
  if(storyPreset){storyActive=true;sourceUrl=storyPreset;stripPreset();setTimeout(function(){prepareSource(storyPreset,preset.optionKey);},0);}
})();
`;
