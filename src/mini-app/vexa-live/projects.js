import { getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { requireDb } from "../../state.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { getVexaMediaContainer } from "./media-container.js";

const ROOT = "/mini-app/live";
const API = ROOT + "/api/projects";
const STORAGE_PREFIX = "vexa-live/";
const UPLOAD_PART_SIZE = 8 * 1024 * 1024;
const MAX_PART_SIZE = 32 * 1024 * 1024;
const MAX_SOURCE_BYTES_FOR_EXPORT = 1536 * 1024 * 1024;
const MEDIA_TOKEN_TTL = 60 * 60;
const MAX_CUES = 5000;
const MAX_CUE_TEXT = 800;

export function isVexaLiveProjectRequest(request) {
  const path = new URL(request.url).pathname;
  return path === API || path.startsWith(API + "/");
}

export async function handleVexaLiveProjectRequest(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === API + "/list") {
      return jsonResponse(await listProjects(request, env));
    }
    if (request.method === "POST" && path === API + "/load") {
      return jsonResponse(await loadProject(request, env));
    }
    if (request.method === "POST" && path === API + "/save") {
      return jsonResponse(await saveProject(request, env));
    }
    if (request.method === "POST" && path === API + "/delete") {
      return jsonResponse(await deleteProject(request, env));
    }
    if (request.method === "POST" && path === API + "/upload/start") {
      return jsonResponse(await startUpload(request, env));
    }
    if (request.method === "PUT" && path === API + "/upload/part") {
      return jsonResponse(await uploadPart(request, env));
    }
    if (request.method === "POST" && path === API + "/upload/complete") {
      return jsonResponse(await completeUpload(request, env));
    }
    if (request.method === "POST" && path === API + "/upload/abort") {
      return jsonResponse(await abortUpload(request, env));
    }
    if (request.method === "POST" && path === API + "/export") {
      return jsonResponse(await exportProject(request, env));
    }
    if ((request.method === "GET" || request.method === "HEAD") && path === API + "/media") {
      return serveStoredMedia(request, env);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Vexa Live project request failed", error?.stack || error);
    return jsonResponse({ error: publicError(error) }, error?.status || 500);
  }
}

async function listProjects(request, env) {
  const { user } = await authJson(request, env);
  await ensureTables(env);
  const rows = await env.DB.prepare(
    "SELECT id, title, source_kind, source_name, source_duration, source_language, target_language, mode, updated_at, created_at " +
    "FROM vexa_live_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
  ).bind(String(user.id)).all();
  return { projects: (rows.results || []).map(publicProjectSummary) };
}

async function loadProject(request, env) {
  const { user, payload } = await authJson(request, env);
  await ensureTables(env);
  const id = cleanId(payload.projectId);
  const row = await projectRow(env, user.id, id);
  if (!row) throw httpError("Project not found", 404);

  let mediaUrl = "";
  if (row.source_key) {
    const token = await signMediaToken(env, {
      u: String(user.id),
      p: row.id,
      k: row.source_key,
      e: Math.floor(Date.now() / 1000) + MEDIA_TOKEN_TTL,
      t: "source",
    });
    mediaUrl = API + "/media?token=" + encodeURIComponent(token);
  }

  return {
    project: {
      id: row.id,
      title: row.title,
      sourceKind: row.source_kind,
      sourceName: row.source_name,
      sourceMime: row.source_mime,
      sourceSize: Number(row.source_size || 0),
      sourceDuration: Number(row.source_duration || 0),
      sourceUrl: row.source_url || "",
      sourceKey: row.source_key || "",
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      mode: row.mode,
      cues: parseJson(row.cues_json, []),
      style: parseJson(row.style_json, defaultStyle()),
      mediaUrl,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    },
  };
}

async function saveProject(request, env) {
  const { user, payload } = await authJson(request, env);
  await ensureTables(env);

  const requestedId = String(payload.projectId || "").trim();
  const id = requestedId ? cleanId(requestedId) : crypto.randomUUID();
  const existing = requestedId ? await projectRow(env, user.id, id) : null;
  if (requestedId && !existing) throw httpError("Project not found", 404);

  const title = cleanText(payload.title || existing?.title || "Untitled video", 120);
  const sourceKind = normalizeSourceKind(payload.sourceKind || existing?.source_kind || "local");
  const sourceName = cleanText(payload.sourceName || existing?.source_name || "Video", 220);
  const sourceMime = cleanText(payload.sourceMime || existing?.source_mime || "video/mp4", 100);
  const sourceSize = nonNegativeInteger(payload.sourceSize ?? existing?.source_size);
  const sourceDuration = nonNegativeNumber(payload.sourceDuration ?? existing?.source_duration);
  const sourceUrl = normalizeYoutubeUrl(payload.sourceUrl || existing?.source_url || "", sourceKind === "youtube");
  const sourceKey = await normalizeOwnedSourceKey(env, user.id, payload.sourceKey || existing?.source_key || "");
  const sourceLanguage = normalizeLanguage(payload.sourceLanguage || existing?.source_language || "");
  const targetLanguage = normalizeLanguage(payload.targetLanguage || existing?.target_language || "");
  const mode = String(payload.mode || existing?.mode || "standard") === "live" ? "live" : "standard";
  const cues = normalizeCues(payload.cues ?? parseJson(existing?.cues_json, []));
  const style = normalizeStyle(payload.style ?? parseJson(existing?.style_json, defaultStyle()));

  if (!sourceKey && !sourceUrl) {
    throw httpError("Save the video source first", 409);
  }

  await env.DB.prepare(
    "INSERT INTO vexa_live_projects (id, user_id, title, source_kind, source_key, source_url, source_name, source_mime, source_size, source_duration, source_language, target_language, mode, cues_json, style_json, latest_export_key, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(id) DO UPDATE SET title=excluded.title, source_kind=excluded.source_kind, source_key=excluded.source_key, source_url=excluded.source_url, source_name=excluded.source_name, source_mime=excluded.source_mime, source_size=excluded.source_size, source_duration=excluded.source_duration, source_language=excluded.source_language, target_language=excluded.target_language, mode=excluded.mode, cues_json=excluded.cues_json, style_json=excluded.style_json, updated_at=CURRENT_TIMESTAMP " +
    "WHERE vexa_live_projects.user_id=excluded.user_id"
  ).bind(
    id, String(user.id), title, sourceKind, sourceKey || null, sourceUrl || null, sourceName,
    sourceMime, sourceSize, sourceDuration, sourceLanguage, targetLanguage, mode,
    JSON.stringify(cues), JSON.stringify(style), existing?.latest_export_key || null,
  ).run();

  return { ok: true, projectId: id, title, updatedAt: new Date().toISOString() };
}

async function deleteProject(request, env) {
  const { user, payload } = await authJson(request, env);
  await ensureTables(env);
  const id = cleanId(payload.projectId);
  const row = await projectRow(env, user.id, id);
  if (!row) return { ok: true };

  await env.DB.prepare("DELETE FROM vexa_live_projects WHERE id = ? AND user_id = ?")
    .bind(id, String(user.id)).run();

  const keys = [row.source_key, row.latest_export_key].filter(Boolean);
  if (keys.length && env.EXPLORE_MEDIA) {
    await env.EXPLORE_MEDIA.delete(keys).catch(() => null);
  }
  return { ok: true };
}

async function startUpload(request, env) {
  const { user, payload } = await authJson(request, env);
  requireStorage(env);
  await ensureTables(env);

  const size = nonNegativeInteger(payload.size);
  if (!size) throw httpError("Video file is empty", 400);
  if (size > MAX_SOURCE_BYTES_FOR_EXPORT) throw httpError("Video is too large to export", 413);
  const mime = normalizeVideoMime(payload.mime);
  const name = cleanText(payload.name || "video.mp4", 220);
  const extension = fileExtension(name, mime);
  const uploadRowId = crypto.randomUUID();
  const key = STORAGE_PREFIX + "sources/" + encodeURIComponent(String(user.id)) + "/" + crypto.randomUUID() + extension;
  const multipart = await env.EXPLORE_MEDIA.createMultipartUpload(key, {
    httpMetadata: {
      contentType: mime,
      cacheControl: "private, no-store, max-age=0",
      contentDisposition: "inline",
    },
    customMetadata: {
      kind: "vexa-live-source",
      userId: String(user.id),
      originalName: name.slice(0, 200),
    },
  });

  await env.DB.prepare(
    "INSERT INTO vexa_live_uploads (id, user_id, object_key, r2_upload_id, file_name, file_mime, file_size, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(uploadRowId, String(user.id), key, multipart.uploadId, name, mime, size).run();

  return { uploadId: uploadRowId, partSize: UPLOAD_PART_SIZE, sourceKey: key };
}

async function uploadPart(request, env) {
  requireStorage(env);
  await ensureTables(env);
  const user = await authBinary(request, env);
  const url = new URL(request.url);
  const uploadId = cleanId(url.searchParams.get("uploadId"));
  const partNumber = Number.parseInt(url.searchParams.get("partNumber") || "", 10);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw httpError("Invalid upload part", 400);
  }

  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_PART_SIZE) throw httpError("Upload part is too large", 413);
  if (!request.body) throw httpError("Upload part is empty", 400);

  const row = await uploadRow(env, user.id, uploadId);
  if (!row || row.status !== "pending") throw httpError("Upload session expired", 404);
  const multipart = env.EXPLORE_MEDIA.resumeMultipartUpload(row.object_key, row.r2_upload_id);
  const part = await multipart.uploadPart(partNumber, request.body);
  return { partNumber: part.partNumber, etag: part.etag };
}

async function completeUpload(request, env) {
  const { user, payload } = await authJson(request, env);
  requireStorage(env);
  await ensureTables(env);
  const uploadId = cleanId(payload.uploadId);
  const row = await uploadRow(env, user.id, uploadId);
  if (!row || row.status !== "pending") throw httpError("Upload session expired", 404);

  const parts = normalizeUploadedParts(payload.parts);
  const multipart = env.EXPLORE_MEDIA.resumeMultipartUpload(row.object_key, row.r2_upload_id);
  const object = await multipart.complete(parts);
  await env.DB.prepare(
    "UPDATE vexa_live_uploads SET status='complete', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?"
  ).bind(uploadId, String(user.id)).run();

  return {
    ok: true,
    sourceKey: object.key,
    size: Number(row.file_size || object.size || 0),
    name: row.file_name,
    mime: row.file_mime,
  };
}

async function abortUpload(request, env) {
  const { user, payload } = await authJson(request, env);
  requireStorage(env);
  await ensureTables(env);
  const uploadId = cleanId(payload.uploadId);
  const row = await uploadRow(env, user.id, uploadId);
  if (!row) return { ok: true };
  if (row.status === "pending") {
    await env.EXPLORE_MEDIA.resumeMultipartUpload(row.object_key, row.r2_upload_id).abort().catch(() => null);
  }
  await env.DB.prepare("DELETE FROM vexa_live_uploads WHERE id=? AND user_id=?")
    .bind(uploadId, String(user.id)).run();
  return { ok: true };
}

async function exportProject(request, env) {
  const { user, payload } = await authJson(request, env);
  requireStorage(env);
  await ensureTables(env);
  const id = cleanId(payload.projectId);
  const row = await projectRow(env, user.id, id);
  if (!row) throw httpError("Project not found", 404);

  const cues = normalizeCues(parseJson(row.cues_json, []));
  if (!cues.length) throw httpError("This project has no captions to export", 409);
  const style = normalizeStyle(parseJson(row.style_json, defaultStyle()));
  const container = getVexaMediaContainer(env, user.id);
  const jobId = crypto.randomUUID();

  try {
    if (row.source_key) {
      const source = await env.EXPLORE_MEDIA.get(row.source_key);
      if (!source) throw httpError("Project video is missing", 404);
      if (Number(source.size || 0) > MAX_SOURCE_BYTES_FOR_EXPORT) {
        throw httpError("This video is too large to export on the current media worker", 413);
      }
      const uploadResponse = await container.fetch(new Request(
        "http://vexa-media/source/" + encodeURIComponent(jobId),
        {
          method: "PUT",
          headers: {
            "Content-Type": row.source_mime || "video/mp4",
            "X-Vexa-Source-Size": String(source.size || 0),
          },
          body: source.body,
        }
      ));
      if (!uploadResponse.ok) {
        throw httpError(await responseError(uploadResponse, "Could not prepare video for export"), uploadResponse.status || 502);
      }
    } else if (row.source_url) {
      const sourceResponse = await container.fetch(new Request(
        "http://vexa-media/source-youtube/" + encodeURIComponent(jobId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: row.source_url }),
        }
      ));
      if (!sourceResponse.ok) {
        throw httpError(await responseError(sourceResponse, "Could not prepare YouTube video"), sourceResponse.status || 502);
      }
    } else {
      throw httpError("Project video is missing", 404);
    }

    const renderResponse = await container.fetch(new Request(
      "http://vexa-media/export/" + encodeURIComponent(jobId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cues, style }),
      }
    ));
    if (!renderResponse.ok) {
      throw httpError(await responseError(renderResponse, "Could not export video"), renderResponse.status || 502);
    }

    const outputKey = STORAGE_PREFIX + "exports/" + encodeURIComponent(String(user.id)) + "/" + id + "/" + crypto.randomUUID() + ".mp4";
    const filename = safeExportFilename(row.title);
    await env.EXPLORE_MEDIA.put(outputKey, renderResponse.body, {
      httpMetadata: {
        contentType: "video/mp4",
        cacheControl: "private, no-store, max-age=0",
        contentDisposition: `attachment; filename="${filename}"`,
      },
      customMetadata: {
        kind: "vexa-live-export",
        userId: String(user.id),
        projectId: id,
      },
    });

    const previousExport = row.latest_export_key || "";
    await env.DB.prepare(
      "UPDATE vexa_live_projects SET latest_export_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?"
    ).bind(outputKey, id, String(user.id)).run();
    if (previousExport && previousExport !== outputKey) {
      await env.EXPLORE_MEDIA.delete(previousExport).catch(() => null);
    }

    const token = await signMediaToken(env, {
      u: String(user.id), p: id, k: outputKey,
      e: Math.floor(Date.now() / 1000) + MEDIA_TOKEN_TTL, t: "export",
      n: filename,
    });
    return {
      ok: true,
      exportUrl: API + "/media?token=" + encodeURIComponent(token),
      filename,
    };
  } finally {
    await container.fetch(new Request(
      "http://vexa-media/job/" + encodeURIComponent(jobId),
      { method: "DELETE" }
    )).catch(() => null);
  }
}

async function serveStoredMedia(request, env) {
  requireStorage(env);
  const url = new URL(request.url);
  const token = await verifyMediaToken(env, url.searchParams.get("token"));
  if (!String(token.k || "").startsWith(STORAGE_PREFIX)) {
    throw httpError("Media link expired", 401);
  }

  const range = request.headers.get("Range");
  const object = request.method === "HEAD"
    ? await env.EXPLORE_MEDIA.head(token.k)
    : await env.EXPLORE_MEDIA.get(token.k, range ? { range: request.headers } : undefined);
  if (!object) throw httpError("Media not found", 404);

  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (typeof object.writeHttpMetadata === "function") object.writeHttpMetadata(headers);
  headers.set("Content-Type", token.t === "export" ? "video/mp4" : String(object.httpMetadata?.contentType || "video/mp4"));
  if (token.t === "export") {
    headers.set("Content-Disposition", `attachment; filename="${safeExportFilename(token.n || "Vexa Live")}"`);
  }
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  let status = 200;
  if (range && object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    const start = object.range.offset;
    const length = object.range.length;
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    status = 206;
  } else if (Number.isFinite(object.size)) {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}

async function authJson(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertAccess(env, user.id);
  return { user, payload };
}

async function authBinary(request, env) {
  const initData = String(request.headers.get("X-Telegram-Init-Data") || "");
  const user = await authenticateMiniAppPayload({ initData }, env);
  await assertAccess(env, user.id);
  return user;
}

async function assertAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  if (admin) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env), getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) throw httpError("Vexa Live is updating", 423);
}

async function ensureTables(env) {
  requireDb(env);
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_live_projects (" +
      "id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, source_kind TEXT NOT NULL, source_key TEXT, source_url TEXT, source_name TEXT, source_mime TEXT, source_size INTEGER NOT NULL DEFAULT 0, source_duration REAL NOT NULL DEFAULT 0, source_language TEXT NOT NULL, target_language TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'standard', cues_json TEXT NOT NULL DEFAULT '[]', style_json TEXT NOT NULL DEFAULT '{}', latest_export_key TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_vexa_live_projects_user_updated ON vexa_live_projects (user_id, updated_at DESC)"
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS vexa_live_uploads (" +
      "id TEXT PRIMARY KEY, user_id TEXT NOT NULL, object_key TEXT NOT NULL, r2_upload_id TEXT NOT NULL, file_name TEXT NOT NULL, file_mime TEXT NOT NULL, file_size INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_vexa_live_uploads_user_created ON vexa_live_uploads (user_id, created_at DESC)"
    ),
  ]);
}

async function projectRow(env, userId, id) {
  return env.DB.prepare(
    "SELECT * FROM vexa_live_projects WHERE id=? AND user_id=?"
  ).bind(id, String(userId)).first();
}

async function uploadRow(env, userId, id) {
  return env.DB.prepare(
    "SELECT * FROM vexa_live_uploads WHERE id=? AND user_id=?"
  ).bind(id, String(userId)).first();
}

function publicProjectSummary(row) {
  return {
    id: row.id,
    title: row.title,
    sourceKind: row.source_kind,
    sourceName: row.source_name,
    duration: Number(row.source_duration || 0),
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    mode: row.mode,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function normalizeCues(value) {
  if (!Array.isArray(value)) throw httpError("Invalid captions", 400);
  if (value.length > MAX_CUES) throw httpError("Too many caption segments", 413);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index] || {};
    const start = nonNegativeNumber(item.start);
    const end = nonNegativeNumber(item.end);
    const text = cleanText(item.text, MAX_CUE_TEXT);
    if (!text || end <= start) throw httpError("Invalid caption timing", 400);
    result.push({ id: index, start, end, text });
  }
  return result;
}

function normalizeStyle(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    x: clampNumber(source.x, 8, 92, 50),
    y: clampNumber(source.y, 10, 90, 72),
    fontSize: clampNumber(source.fontSize, 34, 90, 54),
    background: Boolean(source.background),
    fontWeight: String(source.fontWeight || "bold") === "regular" ? "regular" : "bold",
    textColor: normalizeColor(source.textColor, "#ffffff"),
  };
}

function defaultStyle() {
  return { x: 50, y: 72, fontSize: 54, background: false, fontWeight: "bold", textColor: "#ffffff" };
}

function normalizeUploadedParts(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw httpError("Invalid upload parts", 400);
  const parts = value.map((item) => ({
    partNumber: Number.parseInt(item?.partNumber, 10),
    etag: String(item?.etag || ""),
  })).sort((a, b) => a.partNumber - b.partNumber);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].partNumber !== index + 1 || !parts[index].etag) throw httpError("Invalid upload parts", 400);
  }
  return parts;
}

async function normalizeOwnedSourceKey(env, userId, value) {
  const key = String(value || "").trim();
  if (!key) return "";
  const expected = STORAGE_PREFIX + "sources/" + encodeURIComponent(String(userId)) + "/";
  if (!key.startsWith(expected)) throw httpError("Invalid project source", 403);
  requireStorage(env);
  const object = await env.EXPLORE_MEDIA.head(key);
  if (!object) throw httpError("Uploaded video was not found", 404);
  return key;
}

function normalizeYoutubeUrl(value, required) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw httpError("YouTube source is missing", 400);
    return "";
  }
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"]).has(host)) {
      throw new Error("host");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
    return url.toString().slice(0, 2048);
  } catch (error) {
    throw httpError("Invalid YouTube source", 400);
  }
}

function normalizeSourceKind(value) {
  const kind = String(value || "local").toLowerCase();
  return kind === "youtube" ? "youtube" : "local";
}

function normalizeLanguage(value) {
  const lang = String(value || "").trim().toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) throw httpError("Choose both languages first", 400);
  return lang;
}

function normalizeVideoMime(value) {
  const mime = String(value || "video/mp4").toLowerCase().split(";")[0].trim();
  if (!mime.startsWith("video/")) throw httpError("Choose a video file", 400);
  return mime.slice(0, 100);
}

function fileExtension(name, mime) {
  const match = String(name || "").toLowerCase().match(/\.(mp4|mov|m4v|webm|mkv)$/);
  if (match) return "." + match[1];
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("quicktime")) return ".mov";
  return ".mp4";
}

function cleanId(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(text)) throw httpError("Invalid project", 400);
  return text;
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeColor(value, fallback) {
  const text = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) ? text : fallback;
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value || "")); } catch (error) { return fallback; }
}

function requireStorage(env) {
  if (!env.EXPLORE_MEDIA) throw httpError("Vexa Live storage is unavailable", 503);
}

async function signMediaToken(env, payload) {
  const secret = String(env.BOT_TOKEN || "").trim();
  if (!secret) throw httpError("Media link is unavailable", 503);
  const encoder = new TextEncoder();
  const data = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return data + "." + base64UrlEncode(signature);
}

async function verifyMediaToken(env, value) {
  const raw = String(value || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) throw httpError("Media link expired", 401);
  const secret = String(env.BOT_TOKEN || "").trim();
  if (!secret) throw httpError("Media link is unavailable", 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let signature;
  try { signature = base64UrlDecode(parts[1]); } catch (error) { throw httpError("Media link expired", 401); }
  const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(parts[0]));
  if (!valid) throw httpError("Media link expired", 401);
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))); }
  catch (error) { throw httpError("Media link expired", 401); }
  if (!payload?.u || !payload?.p || !payload?.k || Number(payload.e) <= Math.floor(Date.now() / 1000)) {
    throw httpError("Media link expired", 401);
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
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function responseError(response, fallback) {
  const data = await response.clone().json().catch(() => ({}));
  if (data?.error) return String(data.error).slice(0, 300);
  const text = await response.text().catch(() => "");
  return String(text || fallback).slice(0, 300);
}

function safeExportFilename(value) {
  const base = cleanText(value || "Vexa Live", 100).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Vexa Live";
  return base.replace(/\.mp4$/i, "") + " - Vexa.mp4";
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  return String(error?.message || "Vexa Live project error").slice(0, 300);
}
