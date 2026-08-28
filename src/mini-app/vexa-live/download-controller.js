import { WorkflowEntrypoint } from "cloudflare:workers";
import { getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { creditsForUsdMicros, getBalance, refundCredits, spendCredits } from "../../credits.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { handleDownloadSubtitlesRequest, probeDownloadVideoDuration } from "./download-subtitles.js";
import {
  ensureVexaDownloadProgressTable,
  handleTrackedYouTubeDownloadRequest,
} from "./youtube-download-progress.js";
import { handleInstagramDownloadRequest } from "./instagram-download.js";
import { handleInstagramStoryDownloadRequest } from "./instagram-story-download.js";

const RUNTIME_PATH = "/mini-app/vexa-live/download-controller.js";
const START_PATH = "/mini-app/live/api/download-subtitles/start";
const RESULT_PATH = "/mini-app/live/api/download-subtitles/result";
const UPLOAD_CREATE_PATH = "/mini-app/live/api/download-subtitles/upload/create";
const UPLOAD_PART_PATH = "/mini-app/live/api/download-subtitles/upload/part";
const UPLOAD_COMPLETE_PATH = "/mini-app/live/api/download-subtitles/upload/complete";
const UPLOAD_ABORT_PATH = "/mini-app/live/api/download-subtitles/upload/abort";
const RESULT_PREFIX = "vexa-subtitle-result/";
const LOCAL_UPLOAD_PREFIX = "vexa-local-subtitle-upload/";
const RESULT_TTL_SECONDS = 6 * 60 * 60;
const LOCAL_UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const RESULT_PART_BYTES = 8 * 1024 * 1024;
const LOCAL_UPLOAD_PART_BYTES = 8 * 1024 * 1024;
const LOCAL_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;
const LOCAL_UPLOAD_PROGRESS_END = 20;
const RESULT_READ_STALL_MS = 90 * 1000;
const RESULT_PART_STALL_MS = 2 * 60 * 1000;
const LOCAL_UPLOAD_PART_STALL_MS = 2 * 60 * 1000;
const WORKFLOW_TIMEOUT = "30 minutes";
const SUBTITLE_USD_MICROS_PER_HOUR = 330_000;
const SUBTITLE_LANGUAGES = new Set([
  "original", "en", "fa", "ru", "de", "tr", "es", "ar", "fr", "pt", "it", "hi", "zh", "ja", "ko",
]);
const LOCAL_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv"]);

const DOWNLOAD_PATHS = Object.freeze({
  youtube: "/mini-app/live/api/youtube-download",
  instagram: "/mini-app/live/api/instagram/download",
  story: "/mini-app/live/api/instagram-story/download",
});

export class VexaSubtitleWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = normalizeWorkflowPayload(event?.payload);
    if (!payload) throw new Error("Subtitle workflow payload is invalid");
    try {
      return await step.do(
        "create final subtitled video",
        { retries: { limit: 0, delay: "1 second" }, timeout: WORKFLOW_TIMEOUT },
        async () => runSubtitleWorkflow(this.env, payload),
      );
    } catch (error) {
      const message = publicWorkflowError(error);
      await step.do(
        "mark subtitle workflow failed",
        { retries: { limit: 0, delay: "1 second" }, timeout: "30 seconds" },
        async () => {
          await forceSubtitleFailure(this.env, payload.provider, payload.session, message).catch(() => null);
          await refundSubtitleCharge(this.env, payload, "workflow_failed");
          return { status: "failed", error: message };
        },
      ).catch(() => null);
      throw new Error(message);
    }
  }
}

export function isVexaDownloadControllerRequest(request) {
  const path = new URL(request.url).pathname;
  return path === RUNTIME_PATH || path === START_PATH || path === RESULT_PATH ||
    path === UPLOAD_CREATE_PATH || path === UPLOAD_PART_PATH ||
    path === UPLOAD_COMPLETE_PATH || path === UPLOAD_ABORT_PATH || path === DOWNLOAD_PATHS.youtube;
}

export async function handleVexaDownloadControllerRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === RUNTIME_PATH) {
    return new Response(VEXA_DOWNLOAD_CONTROLLER_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "POST" && url.pathname === START_PATH) {
    return startSubtitleWorkflow(request, env, ctx);
  }
  if (request.method === "POST" && url.pathname === UPLOAD_CREATE_PATH) {
    return createLocalSubtitleUpload(request, env, ctx);
  }
  if (request.method === "PUT" && url.pathname === UPLOAD_PART_PATH) {
    return uploadLocalSubtitlePart(request, env);
  }
  if (request.method === "POST" && url.pathname === UPLOAD_COMPLETE_PATH) {
    return completeLocalSubtitleUpload(request, env, ctx);
  }
  if (request.method === "POST" && url.pathname === UPLOAD_ABORT_PATH) {
    return abortLocalSubtitleUpload(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === RESULT_PATH) {
    return serveSubtitleResult(request, env);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === DOWNLOAD_PATHS.youtube) {
    const session = cleanToken(url.searchParams.get("session"));
    const row = session ? await readLocalUploadRow(env, session).catch(() => null) : null;
    if (String(row?.provider || "") === "upload") return handleUploadedVideoDelegate(request, env);
    return handleTrackedYouTubeDownloadRequest(request, env, ctx);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendVexaDownloadControllerRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  if (!String(response.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + RUNTIME_PATH + '?v=20260827-local-upload-1"></script>';
  const html = source.includes(RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function startSubtitleWorkflow(request, env, ctx) {
  if (!env.VEXA_SUBTITLE_WORKFLOW || !env.EXPLORE_MEDIA) {
    return json({ error: "Background subtitle rendering is unavailable" }, 503);
  }
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const language = normalizeSubtitleLanguage(payload?.language);
  if (!language) return json({ error: "Subtitle language is invalid" }, 400);

  const parsed = normalizeDownloadUrl(payload?.downloadUrl, request.url);
  if (!parsed) return json({ error: "Download session is invalid" }, 400);
  const session = cleanToken(parsed.url.searchParams.get("session"));
  const token = cleanToken(parsed.url.searchParams.get("token"));
  if (!session || !token) return json({ error: "Download session is invalid" }, 400);

  const eligible = await subtitleEligible(env, parsed.provider, session, user.id);
  if (!eligible.ok) return json({ error: eligible.error }, eligible.status);

  const delegate = delegateForProvider(parsed.provider);
  const head = await delegate(
    new Request(parsed.url.href, { method: "HEAD", headers: request.headers }),
    env,
    ctx,
  );
  if (!head?.ok) {
    const detail = await head?.text?.().catch(() => "");
    return json({ error: detail || "Download session is unavailable" }, head?.status || 502);
  }

  const claimed = await claimSubtitleSession(env, parsed.provider, session);
  if (!claimed) return json({ error: "This subtitle download is already running" }, 409);

  const charged = await chargeSubtitleCredits(env, user.id, eligible.durationSeconds, parsed.provider, session, language);
  if (!charged.ok) {
    await releaseSubtitleClaim(env, parsed.provider, session).catch(() => null);
    return json({ error: "Not enough USD balance", balance: charged.balance, needed: charged.needed }, 402);
  }

  try {
    const queued = await enqueueSubtitleWorkflow(env, {
      provider: parsed.provider,
      session,
      language,
      downloadUrl: parsed.url.href,
      userId: String(user.id),
      chargedCredits: charged.spent,
      durationSeconds: eligible.durationSeconds,
    });
    ctx?.waitUntil?.(cleanupExpiredResults(env));
    return json({ ok: true, ...queued, balance: charged.balance, chargedCredits: charged.spent });
  } catch (error) {
    await refundSubtitleCharge(env, {
      provider: parsed.provider,
      session,
      userId: String(user.id),
      chargedCredits: charged.spent,
      durationSeconds: eligible.durationSeconds,
    }, "enqueue_failed").catch(() => null);
    await releaseSubtitleClaim(env, parsed.provider, session).catch(() => null);
    console.error("Vexa subtitle workflow enqueue failed", error?.stack || error);
    return json({ error: "Could not start subtitle rendering" }, 502);
  }
}

async function enqueueSubtitleWorkflow(env, input) {
  if (!env.VEXA_SUBTITLE_WORKFLOW || !env.EXPLORE_MEDIA) throw new Error("Background subtitle rendering is unavailable");
  const resultToken = makeResultToken();
  const resultKey = RESULT_PREFIX + resultToken + ".mp4";
  const workflowId = "vexa-subtitle-" + crypto.randomUUID();
  const resultUrl = RESULT_PATH + "?token=" + encodeURIComponent(resultToken);
  await env.VEXA_SUBTITLE_WORKFLOW.create({
    id: workflowId,
    params: {
      provider: input.provider,
      session: input.session,
      language: input.language,
      downloadUrl: input.downloadUrl,
      resultKey,
      resultToken,
      userId: input.userId,
      chargedCredits: input.chargedCredits,
      durationSeconds: input.durationSeconds,
    },
    retention: { successRetention: "1 day", errorRetention: "1 day" },
  });
  return { workflowId, resultUrl };
}

async function createLocalSubtitleUpload(request, env, ctx) {
  if (!env.EXPLORE_MEDIA || !env.VEXA_SUBTITLE_WORKFLOW || !env.VEXA_DOWNLOAD_PROGRESS) {
    return json({ error: "Video upload is unavailable" }, 503);
  }
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const fileSize = positiveInteger(payload?.fileSize);
  const durationSeconds = positiveNumber(payload?.durationSeconds);
  const fileName = sanitizeUploadFileName(payload?.fileName);
  const mimeType = normalizeUploadMime(payload?.mimeType, fileName);
  if (!fileSize || fileSize > LOCAL_UPLOAD_MAX_BYTES) {
    return json({ error: "Video must be 512 MB or smaller" }, 413);
  }
  if (!isSupportedLocalVideo(fileName, mimeType)) {
    return json({ error: "Choose a supported video file" }, 415);
  }
  if (durationSeconds) {
    const needed = subtitleCreditsForDuration(durationSeconds);
    const balance = await getBalance(env, user.id);
    if (balance < needed) return json({ error: "Not enough USD balance", balance, needed }, 402);
  }

  await ensureVexaDownloadProgressTable(env);
  const session = randomToken();
  const accessToken = randomToken();
  const sourceKey = LOCAL_UPLOAD_PREFIX + session + ".media";
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + LOCAL_UPLOAD_TTL_SECONDS;
  const upload = await env.EXPLORE_MEDIA.createMultipartUpload(sourceKey, {
    httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
    customMetadata: {
      vexaLocalSubtitleUpload: "1",
      expiresAt: String(expiresAt),
    },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO vexa_youtube_download_progress " +
      "(session, playback_token, user_id, total_bytes, downloaded_bytes, status, error, created_at, updated_at, expires_at, " +
      "source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key) " +
      "VALUES (?, ?, ?, ?, 0, 'uploading', NULL, ?, ?, ?, ?, ?, ?, ?, 'upload', ?, 'upload')"
    ).bind(
      session,
      accessToken,
      String(user.id),
      fileSize,
      now,
      now,
      expiresAt,
      sourceKey,
      String(upload.uploadId || ""),
      fileName,
      mimeType,
      durationSeconds,
    ).run();
  } catch (error) {
    try { await upload.abort(); } catch {}
    throw error;
  }

  await publishProgress(env, "youtube", session, {
    totalBytes: fileSize,
    downloadedBytes: 0,
    percent: 0,
    status: "uploading",
    error: "",
    updatedAt: now,
  }).catch(() => null);
  ctx?.waitUntil?.(
    env.DB.prepare("DELETE FROM vexa_youtube_download_progress WHERE expires_at < ?")
      .bind(now - 86400).run().catch(() => null)
  );
  return json({
    ok: true,
    session,
    partSize: LOCAL_UPLOAD_PART_BYTES,
    partsCount: Math.ceil(fileSize / LOCAL_UPLOAD_PART_BYTES),
    progressUrl: "/mini-app/live/api/youtube-download/progress?session=" + encodeURIComponent(session),
    fileName: "Vexa-video.mp4",
  });
}

async function uploadLocalSubtitlePart(request, env) {
  if (!env.EXPLORE_MEDIA) return json({ error: "Video upload is unavailable" }, 503);
  const user = await authenticateMiniAppPayload({ initData: request.headers.get("X-Vexa-Init-Data") || "" }, env);
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const partNumber = positiveInteger(url.searchParams.get("part"));
  if (!session || !partNumber || !request.body) return json({ error: "Video upload part is invalid" }, 400);

  const row = await readLocalUploadRow(env, session);
  const checked = validateLocalUploadOwner(row, user.id, true);
  if (checked) return checked;
  const total = positiveInteger(row.total_bytes);
  const uploaded = Math.max(0, Number(row.downloaded_bytes || 0));
  const partsCount = Math.ceil(total / LOCAL_UPLOAD_PART_BYTES);
  const completedParts = uploaded >= total ? partsCount : Math.floor(uploaded / LOCAL_UPLOAD_PART_BYTES);
  const newPart = partNumber === completedParts + 1;
  const retryPart = completedParts > 0 && partNumber === completedParts;
  if ((!newPart && !retryPart) || partNumber > partsCount) {
    return json({ error: "Upload parts must be sent in order" }, 409);
  }
  const offset = (partNumber - 1) * LOCAL_UPLOAD_PART_BYTES;
  const expectedLength = Math.min(LOCAL_UPLOAD_PART_BYTES, total - offset);
  if (expectedLength <= 0) return json({ error: "Video upload part is invalid" }, 400);
  const contentLength = positiveInteger(request.headers.get("Content-Length"));
  if (contentLength && contentLength !== expectedLength) {
    return json({ error: "Video upload part size is invalid" }, 400);
  }

  const multipart = env.EXPLORE_MEDIA.resumeMultipartUpload(String(row.source_url), String(row.strategy_id));
  const part = await withTimeout(
    multipart.uploadPart(partNumber, request.body),
    LOCAL_UPLOAD_PART_STALL_MS,
    "Video upload stalled",
  );
  if (!part?.etag) throw new Error("Video upload part did not complete");

  let uploadedBytes = uploaded;
  if (newPart) {
    uploadedBytes = Math.min(total, offset + expectedLength);
    const now = Math.floor(Date.now() / 1000);
    const result = await env.DB.prepare(
      "UPDATE vexa_youtube_download_progress SET downloaded_bytes = ?, updated_at = ? " +
      "WHERE session = ? AND provider = 'upload' AND status = 'uploading' AND downloaded_bytes = ?"
    ).bind(uploadedBytes, now, session, uploaded).run();
    if (Number(result?.meta?.changes || 0) <= 0) {
      return json({ error: "Upload state changed. Try the file again." }, 409);
    }
    const percent = localUploadPercent(uploadedBytes, total);
    await publishProgress(env, "youtube", session, {
      totalBytes: total,
      downloadedBytes: uploadedBytes,
      percent,
      status: "uploading",
      error: "",
      updatedAt: now,
    }).catch(() => null);
  }

  return json({ ok: true, partNumber, etag: String(part.etag), uploadedBytes });
}

async function completeLocalSubtitleUpload(request, env, ctx) {
  if (!env.EXPLORE_MEDIA || !env.VEXA_SUBTITLE_WORKFLOW) return json({ error: "Video upload is unavailable" }, 503);
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const session = cleanToken(payload?.session);
  const language = normalizeSubtitleLanguage(payload?.language);
  if (!session || !language) return json({ error: "Choose a subtitle language" }, 400);

  const row = await readLocalUploadRow(env, session);
  const checked = validateLocalUploadOwner(row, user.id, true);
  if (checked) return checked;
  const total = positiveInteger(row.total_bytes);
  if (Math.max(0, Number(row.downloaded_bytes || 0)) !== total) {
    return json({ error: "Video upload has not finished" }, 409);
  }
  const partsCount = Math.ceil(total / LOCAL_UPLOAD_PART_BYTES);
  const parts = sanitizeCompletedParts(payload?.parts, partsCount);
  if (!parts) return json({ error: "Video upload parts are incomplete" }, 400);

  const multipart = env.EXPLORE_MEDIA.resumeMultipartUpload(String(row.source_url), String(row.strategy_id));
  let object;
  try {
    object = await withTimeout(
      multipart.complete(parts),
      LOCAL_UPLOAD_PART_STALL_MS,
      "Video upload could not be finalized",
    );
  } catch (error) {
    try { await multipart.abort(); } catch {}
    throw error;
  }
  if (!object || positiveInteger(object.size) !== total) {
    await env.EXPLORE_MEDIA.delete(String(row.source_url)).catch(() => null);
    return json({ error: "Uploaded video ended before the expected file size" }, 502);
  }

  const downloadUrl = new URL(DOWNLOAD_PATHS.youtube, request.url);
  downloadUrl.searchParams.set("token", String(row.playback_token));
  downloadUrl.searchParams.set("session", session);
  let durationSeconds;
  try {
    durationSeconds = await probeDownloadVideoDuration(env, downloadUrl.href, session);
  } catch (error) {
    await env.EXPLORE_MEDIA.delete(String(row.source_url)).catch(() => null);
    await forceSubtitleFailure(env, "youtube", session, "Could not read video duration").catch(() => null);
    return json({ error: "Could not read video duration" }, 422);
  }
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET duration_seconds = ?, updated_at = ? WHERE session = ? AND provider = 'upload' AND status = 'uploading'"
  ).bind(durationSeconds, Math.floor(Date.now() / 1000), session).run();

  const now = Math.floor(Date.now() / 1000);
  const stagedProgressBytes = Math.round(total * (LOCAL_UPLOAD_PROGRESS_END / 100));
  const transition = await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET downloaded_bytes = ?, status = 'staging', error = NULL, updated_at = ? " +
    "WHERE session = ? AND provider = 'upload' AND status = 'uploading'"
  ).bind(stagedProgressBytes, now, session).run();
  if (Number(transition?.meta?.changes || 0) <= 0) {
    return json({ error: "Video upload state changed. Try again." }, 409);
  }
  const charged = await chargeSubtitleCredits(env, user.id, durationSeconds, "youtube", session, language);
  if (!charged.ok) {
    await env.EXPLORE_MEDIA.delete(String(row.source_url)).catch(() => null);
    await forceSubtitleFailure(env, "youtube", session, "Not enough USD balance").catch(() => null);
    return json({ error: "Not enough USD balance", balance: charged.balance, needed: charged.needed }, 402);
  }
  await publishProgress(env, "youtube", session, {
    totalBytes: total,
    downloadedBytes: stagedProgressBytes,
    percent: LOCAL_UPLOAD_PROGRESS_END,
    status: "staging",
    error: "",
    updatedAt: now,
  }).catch(() => null);

  try {
    const queued = await enqueueSubtitleWorkflow(env, {
      provider: "youtube",
      session,
      language,
      downloadUrl: downloadUrl.href,
      userId: String(user.id),
      chargedCredits: charged.spent,
      durationSeconds,
    });
    ctx?.waitUntil?.(cleanupExpiredResults(env));
    return json({
      ok: true,
      ...queued,
      progressUrl: "/mini-app/live/api/youtube-download/progress?session=" + encodeURIComponent(session),
      fileName: "Vexa-video.mp4",
      balance: charged.balance,
      chargedCredits: charged.spent,
    });
  } catch (error) {
    const message = "Could not start subtitle rendering";
    await refundSubtitleCharge(env, {
      provider: "youtube", session, userId: String(user.id), chargedCredits: charged.spent, durationSeconds,
    }, "enqueue_failed").catch(() => null);
    await forceSubtitleFailure(env, "youtube", session, message).catch(() => null);
    await env.EXPLORE_MEDIA.delete(String(row.source_url)).catch(() => null);
    console.error("Vexa local subtitle workflow enqueue failed", error?.stack || error);
    return json({ error: message }, 502);
  }
}

async function abortLocalSubtitleUpload(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const session = cleanToken(payload?.session);
  if (!session) return json({ error: "Video upload session is invalid" }, 400);
  const row = await readLocalUploadRow(env, session);
  const checked = validateLocalUploadOwner(row, user.id, false);
  if (checked) return checked;
  if (String(row.status || "") !== "uploading") return json({ ok: true });
  try {
    const multipart = env.EXPLORE_MEDIA.resumeMultipartUpload(String(row.source_url), String(row.strategy_id));
    await multipart.abort();
  } catch {}
  const total = positiveInteger(row.total_bytes);
  const uploaded = Math.max(0, Number(row.downloaded_bytes || 0));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress SET status = 'cancelled', error = ?, updated_at = ? WHERE session = ? AND status = 'uploading'"
  ).bind("Upload was cancelled", now, session).run().catch(() => null);
  await publishProgress(env, "youtube", session, {
    totalBytes: total,
    downloadedBytes: uploaded,
    percent: localUploadPercent(uploaded, total),
    status: "cancelled",
    error: "Upload was cancelled",
    updatedAt: now,
  }).catch(() => null);
  return json({ ok: true });
}

async function claimSubtitleSession(env, provider, session) {
  const table = progressTable(provider);
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "UPDATE " + table + " SET downloaded_bytes = 0, status = 'staging', error = NULL, updated_at = ? " +
    "WHERE session = ? AND status = 'ready'"
  ).bind(now, session).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function releaseSubtitleClaim(env, provider, session) {
  const table = progressTable(provider);
  await env.DB.prepare(
    "UPDATE " + table + " SET downloaded_bytes = 0, status = 'ready', error = NULL, updated_at = ? " +
    "WHERE session = ? AND status = 'staging'"
  ).bind(Math.floor(Date.now() / 1000), session).run();
}

async function runSubtitleWorkflow(env, payload) {
  const pending = [];
  const workflowCtx = {
    waitUntil(value) {
      if (value) pending.push(Promise.resolve(value).catch(() => null));
    },
  };

  let localSourceKey = "";
  let youtubeDelegate = handleTrackedYouTubeDownloadRequest;
  if (payload.provider === "youtube") {
    const row = await env.DB.prepare(
      "SELECT provider, source_url FROM vexa_youtube_download_progress WHERE session = ?"
    ).bind(payload.session).first().catch(() => null);
    if (String(row?.provider || "") === "upload") {
      localSourceKey = String(row?.source_url || "");
      youtubeDelegate = handleUploadedVideoDelegate;
    }
  }

  try {
    const url = new URL(payload.downloadUrl);
    url.searchParams.set("subtitle", payload.language);
    const response = await handleDownloadSubtitlesRequest(
      new Request(url.href, { method: "GET" }),
      env,
      workflowCtx,
      {
        youtube: youtubeDelegate,
        instagram: handleInstagramDownloadRequest,
        story: handleInstagramStoryDownloadRequest,
      },
    );
    if (!response?.ok || !response.body) {
      const detail = await readResponseError(response);
      throw new Error(detail || "Could not create the subtitled video");
    }

    const object = await uploadResultMultipart(
      env.EXPLORE_MEDIA,
      payload.resultKey,
      response.body,
      resultTokenExpiry(payload.resultToken),
    );
    await Promise.allSettled(pending);
    await publishFileReady(env, payload.provider, payload.session, positiveInteger(object?.size));
    return { status: "completed", resultKey: payload.resultKey, sizeBytes: positiveInteger(object?.size) };
  } finally {
    if (localSourceKey) await env.EXPLORE_MEDIA.delete(localSourceKey).catch(() => null);
  }
}

async function handleUploadedVideoDelegate(request, env) {
  if (!env.EXPLORE_MEDIA) return json({ error: "Uploaded video is unavailable" }, 503);
  const url = new URL(request.url);
  const session = cleanToken(url.searchParams.get("session"));
  const token = cleanToken(url.searchParams.get("token"));
  if (!session || !token) return json({ error: "Uploaded video session is invalid" }, 400);
  const row = await readLocalUploadRow(env, session);
  const now = Math.floor(Date.now() / 1000);
  if (!row || String(row.provider || "") !== "upload" || String(row.playback_token || "") !== token || Number(row.expires_at || 0) <= now) {
    return json({ error: "Uploaded video session expired" }, 410);
  }
  const key = String(row.source_url || "");
  const total = positiveInteger(row.total_bytes);
  const head = key ? await env.EXPLORE_MEDIA.head(key) : null;
  if (!head || positiveInteger(head.size) !== total) return json({ error: "Uploaded video is unavailable" }, 410);
  const fileName = sanitizeUploadFileName(row.format_id) || "Vexa-uploaded-video.mp4";
  const contentType = normalizeUploadMime(row.transport, fileName);
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(total),
    "Content-Disposition": 'attachment; filename="' + fileName + '"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  const object = await env.EXPLORE_MEDIA.get(key);
  if (!object?.body) return json({ error: "Uploaded video is unavailable" }, 410);
  return new Response(object.body, { status: 200, headers });
}

async function uploadResultMultipart(bucket, key, stream, expiresAt) {
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: {
      contentType: "video/mp4",
      cacheControl: "private, no-store",
      contentDisposition: 'attachment; filename="Vexa-video.mp4"',
    },
    customMetadata: { vexaSubtitleResult: "1", expiresAt: String(expiresAt) },
  });
  const reader = stream.getReader();
  const parts = [];
  let buffer = new Uint8Array(RESULT_PART_BYTES);
  let buffered = 0;
  let partNumber = 1;
  let totalBytes = 0;
  try {
    while (true) {
      const next = await withTimeout(reader.read(), RESULT_READ_STALL_MS, "Final subtitle video stream stalled");
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const length = Math.min(RESULT_PART_BYTES - buffered, chunk.byteLength - offset);
        buffer.set(chunk.subarray(offset, offset + length), buffered);
        buffered += length;
        offset += length;
        totalBytes += length;
        if (buffered === RESULT_PART_BYTES) {
          parts.push(await withTimeout(
            upload.uploadPart(partNumber, buffer),
            RESULT_PART_STALL_MS,
            "Final subtitle video upload stalled",
          ));
          partNumber += 1;
          buffer = new Uint8Array(RESULT_PART_BYTES);
          buffered = 0;
        }
      }
    }
    if (!parts.length && !buffered) throw new Error("Final subtitled video was empty");
    if (buffered) {
      parts.push(await withTimeout(
        upload.uploadPart(partNumber, buffer.slice(0, buffered)),
        RESULT_PART_STALL_MS,
        "Final subtitle video upload stalled",
      ));
    }
    const object = await withTimeout(upload.complete(parts), RESULT_PART_STALL_MS, "Final subtitle video upload stalled");
    if (!object || positiveInteger(object.size) !== totalBytes) {
      throw new Error("Final subtitled video upload ended early");
    }
    return object;
  } catch (error) {
    try { await reader.cancel(error); } catch {}
    try { await upload.abort(); } catch {}
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function publishFileReady(env, provider, session, sizeBytes) {
  const total = positiveInteger(sizeBytes);
  if (!total) throw new Error("Final subtitled video was empty");
  const table = progressTable(provider);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE " + table + " SET total_bytes = ?, downloaded_bytes = ?, status = 'completed', error = NULL, updated_at = ? WHERE session = ?"
  ).bind(total, total, now, session).run();
  await publishProgress(env, provider, session, {
    totalBytes: total,
    downloadedBytes: total,
    percent: 100,
    status: "file_ready",
    error: "",
    updatedAt: now,
  });
}

async function forceSubtitleFailure(env, provider, session, error) {
  const cleanSession = cleanToken(session);
  const table = progressTable(provider);
  if (!cleanSession || !table) return;
  const message = String(error || "Could not create the subtitled video").slice(0, 500);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT total_bytes, downloaded_bytes FROM " + table + " WHERE session = ?"
  ).bind(cleanSession).first().catch(() => null);
  const total = positiveInteger(row?.total_bytes);
  const done = Math.max(0, Number(row?.downloaded_bytes || 0));
  await env.DB.prepare(
    "UPDATE " + table + " SET status = 'failed', error = ?, updated_at = ? WHERE session = ? AND status NOT IN ('completed','cancelled')"
  ).bind(message, now, cleanSession).run().catch(() => null);
  await publishProgress(env, provider, cleanSession, {
    totalBytes: total,
    downloadedBytes: done,
    percent: total ? Math.min(99.9, (done / total) * 100) : 0,
    status: "failed",
    error: message,
    updatedAt: now,
  }).catch(() => null);
}

async function publishProgress(env, provider, session, payload) {
  const binding = provider === "story"
    ? env.VEXA_INSTAGRAM_STORY_PROGRESS
    : provider === "instagram"
      ? env.VEXA_INSTAGRAM_PROGRESS
      : env.VEXA_DOWNLOAD_PROGRESS;
  if (!binding) return;
  const target = provider === "story"
    ? "https://vexa-instagram-story-progress/publish"
    : provider === "instagram"
      ? "https://vexa-instagram-progress/publish"
      : "https://vexa-download-progress/publish";
  const id = binding.idFromName(session);
  await binding.get(id).fetch(new Request(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      totalBytes: positiveInteger(payload.totalBytes),
      downloadedBytes: Math.max(0, Number(payload.downloadedBytes || 0)),
      percent: Math.max(0, Math.min(100, Number(payload.percent || 0))),
      status: String(payload.status || "ready"),
      error: payload.error ? String(payload.error) : "",
      updatedAt: Number(payload.updatedAt || 0),
    }),
  }));
}

async function readLocalUploadRow(env, session) {
  await ensureVexaDownloadProgressTable(env);
  return env.DB.prepare(
    "SELECT playback_token, user_id, total_bytes, downloaded_bytes, status, error, expires_at, source_url, strategy_id, format_id, transport, provider, duration_seconds, option_key " +
    "FROM vexa_youtube_download_progress WHERE session = ?"
  ).bind(session).first();
}

function validateLocalUploadOwner(row, userId, requireUploading) {
  const now = Math.floor(Date.now() / 1000);
  if (!row || String(row.provider || "") !== "upload" || Number(row.expires_at || 0) <= now) {
    return json({ error: "Video upload session expired" }, 410);
  }
  if (String(row.user_id) !== String(userId)) return json({ error: "Video upload does not belong to this user" }, 403);
  if (requireUploading && String(row.status || "") !== "uploading") return json({ error: "Video upload is no longer active" }, 409);
  return null;
}

function sanitizeCompletedParts(value, count) {
  if (!Array.isArray(value) || value.length !== count) return null;
  const parts = [];
  for (let index = 0; index < value.length; index += 1) {
    const partNumber = positiveInteger(value[index]?.partNumber);
    const etag = String(value[index]?.etag || "").trim();
    if (partNumber !== index + 1 || !etag || etag.length > 300) return null;
    parts.push({ partNumber, etag });
  }
  return parts;
}

function localUploadPercent(bytes, total) {
  const size = positiveInteger(total);
  if (!size) return 0;
  return Math.max(0, Math.min(LOCAL_UPLOAD_PROGRESS_END, Math.round(((Math.max(0, Number(bytes || 0)) / size) * LOCAL_UPLOAD_PROGRESS_END) * 10) / 10));
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

function isSupportedLocalVideo(fileName, mimeType) {
  const extension = String(fileName || "").toLowerCase().match(/\.([a-z0-9]{2,8})$/u)?.[1] || "";
  if (LOCAL_VIDEO_EXTENSIONS.has(extension)) return true;
  return /^video\//i.test(String(mimeType || ""));
}

function sanitizeUploadFileName(value) {
  const name = String(value || "").trim().replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 160);
  return name || "Vexa-uploaded-video.mp4";
}

function normalizeUploadMime(value, fileName) {
  const mime = String(value || "").trim().toLowerCase();
  if (/^video\/[a-z0-9.+-]{1,80}$/u.test(mime)) return mime;
  const extension = String(fileName || "").toLowerCase().match(/\.([a-z0-9]{2,8})$/u)?.[1] || "";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mkv") return "video/x-matroska";
  if (extension === "m4v") return "video/x-m4v";
  return "video/mp4";
}

async function subtitleEligible(env, provider, session, userId) {
  try {
    const table = progressTable(provider);
    let row;
    if (provider === "youtube") {
      row = await env.DB.prepare(
        "SELECT user_id, option_key, status, duration_seconds FROM " + table + " WHERE session = ?"
      ).bind(session).first();
    } else {
      const tokenTable = provider === "story" ? "vexa_instagram_story_tokens" : "vexa_instagram_download_tokens";
      const tokenColumn = "download_token";
      row = await env.DB.prepare(
        "SELECT p.user_id, p.option_key, p.total_bytes, p.status, t.catalog_json " +
        "FROM " + table + " p LEFT JOIN " + tokenTable + " t ON t.token = p." + tokenColumn + " WHERE p.session = ?"
      ).bind(session).first();
    }
    if (!row) return { ok: false, status: 410, error: "Download session expired" };
    if (String(row.user_id) !== String(userId)) {
      return { ok: false, status: 403, error: "Download session does not belong to this user" };
    }
    if (["staging", "transcribing", "translating", "rendering", "finalizing"].includes(String(row.status || ""))) {
      return { ok: false, status: 409, error: "This subtitle download is already running" };
    }
    if (String(row.status || "") !== "ready") {
      return { ok: false, status: 409, error: "Prepare a fresh download session" };
    }
    if (provider === "story" && !positiveInteger(row.total_bytes)) {
      return { ok: false, status: 409, error: "Burned-in subtitles are unavailable for Live recordings" };
    }
    if (provider === "youtube" && String(row.option_key || "") === "a") {
      return { ok: false, status: 409, error: "Burned-in subtitles are unavailable for audio downloads" };
    }
    const durationSeconds = provider === "youtube"
      ? positiveNumber(row.duration_seconds)
      : catalogOptionDuration(row.catalog_json, row.option_key);
    if (!durationSeconds) return { ok: false, status: 422, error: "Video duration is unavailable" };
    return { ok: true, durationSeconds };
  } catch (error) {
    console.error("Vexa subtitle eligibility check failed", error?.stack || error);
    return { ok: false, status: 502, error: "Could not validate subtitle download" };
  }
}

async function serveSubtitleResult(request, env) {
  if (!env.EXPLORE_MEDIA) return new Response("Not Found", { status: 404 });
  const token = cleanResultToken(new URL(request.url).searchParams.get("token"));
  if (!token) return new Response("Not Found", { status: 404 });
  const key = RESULT_PREFIX + token + ".mp4";
  const head = await env.EXPLORE_MEDIA.head(key);
  const now = Math.floor(Date.now() / 1000);
  if (!head || String(head.customMetadata?.vexaSubtitleResult || "") !== "1" || resultTokenExpiry(token) <= now) {
    if (head) await env.EXPLORE_MEDIA.delete(key).catch(() => null);
    return new Response("Not Found", { status: 404 });
  }

  const size = positiveInteger(head.size);
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Disposition": 'attachment; filename="Vexa-video.mp4"',
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  const rangeHeader = request.headers.get("Range");
  const range = parseRange(rangeHeader, size);
  if (rangeHeader && !range) {
    headers.set("Content-Range", "bytes */" + size);
    return new Response(null, { status: 416, headers });
  }
  if (request.method === "HEAD") {
    headers.set("Content-Length", String(size));
    return new Response(null, { status: 200, headers });
  }
  if (range) {
    const object = await env.EXPLORE_MEDIA.get(key, { range: { offset: range.start, length: range.length } });
    if (!object?.body) return new Response("Not Found", { status: 404 });
    headers.set("Content-Length", String(range.length));
    headers.set("Content-Range", "bytes " + range.start + "-" + range.end + "/" + size);
    return new Response(object.body, { status: 206, headers });
  }
  const object = await env.EXPLORE_MEDIA.get(key);
  if (!object?.body) return new Response("Not Found", { status: 404 });
  headers.set("Content-Length", String(size));
  return new Response(object.body, { status: 200, headers });
}

async function cleanupExpiredResults(env) {
  if (!env.EXPLORE_MEDIA) return;
  const now = Math.floor(Date.now() / 1000);
  let cursor;
  for (let page = 0; page < 3; page += 1) {
    const listed = await env.EXPLORE_MEDIA.list({ prefix: RESULT_PREFIX, cursor, limit: 100 }).catch(() => null);
    if (!listed) return;
    const expired = listed.objects.filter(object => resultKeyExpiry(object.key) <= now).map(object => object.key);
    if (expired.length) await Promise.all(expired.map(key => env.EXPLORE_MEDIA.delete(key).catch(() => null)));
    if (!listed.truncated || !listed.cursor) return;
    cursor = listed.cursor;
  }
}

function normalizeWorkflowPayload(value) {
  const provider = String(value?.provider || "");
  const session = cleanToken(value?.session);
  const language = normalizeSubtitleLanguage(value?.language);
  const resultToken = cleanResultToken(value?.resultToken);
  const resultKey = String(value?.resultKey || "");
  const userId = cleanUserId(value?.userId);
  const chargedCredits = positiveInteger(value?.chargedCredits);
  const durationSeconds = positiveNumber(value?.durationSeconds);
  let url;
  try { url = new URL(String(value?.downloadUrl || "")); } catch { return null; }
  if (
    !["youtube", "instagram", "story"].includes(provider) ||
    !session || !language || !resultToken || !userId || !chargedCredits || !durationSeconds ||
    resultKey !== RESULT_PREFIX + resultToken + ".mp4" ||
    url.protocol !== "https:" ||
    providerForDownloadPath(url.pathname) !== provider
  ) return null;
  return { provider, session, language, resultToken, resultKey, downloadUrl: url.href, userId, chargedCredits, durationSeconds };
}

function normalizeDownloadUrl(value, base) {
  let url;
  try { url = new URL(String(value || ""), base); } catch { return null; }
  const origin = new URL(base).origin;
  if (url.origin !== origin || url.protocol !== "https:") return null;
  const provider = providerForDownloadPath(url.pathname);
  if (!provider) return null;
  url.searchParams.delete("subtitle");
  return { provider, url };
}

function providerForDownloadPath(path) {
  if (path === DOWNLOAD_PATHS.instagram) return "instagram";
  if (path === DOWNLOAD_PATHS.story) return "story";
  if (path === DOWNLOAD_PATHS.youtube) return "youtube";
  return "";
}

function delegateForProvider(provider) {
  if (provider === "story") return handleInstagramStoryDownloadRequest;
  if (provider === "instagram") return handleInstagramDownloadRequest;
  return handleTrackedYouTubeDownloadRequest;
}

function progressTable(provider) {
  if (provider === "story") return "vexa_instagram_story_progress";
  if (provider === "instagram") return "vexa_instagram_download_progress";
  if (provider === "youtube") return "vexa_youtube_download_progress";
  return "";
}

function normalizeSubtitleLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return SUBTITLE_LANGUAGES.has(key) ? key : "";
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function makeResultToken() {
  return String(Math.floor(Date.now() / 1000) + RESULT_TTL_SECONDS) + "-" + randomToken();
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

function resultKeyExpiry(key) {
  const token = String(key || "").slice(RESULT_PREFIX.length).replace(/\.mp4$/u, "");
  return resultTokenExpiry(token);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cleanUserId(value) {
  const userId = String(value || "").trim();
  return /^\d{1,24}$/u.test(userId) ? userId : "";
}

function catalogOptionDuration(value, optionKey) {
  try {
    const options = JSON.parse(String(value || "[]"));
    const option = Array.isArray(options)
      ? options.find(item => String(item?.key || "") === String(optionKey || ""))
      : null;
    return positiveNumber(option?.duration);
  } catch {
    return 0;
  }
}

function subtitleCreditsForDuration(value) {
  const durationSeconds = positiveNumber(value);
  if (!durationSeconds) return 0;
  return creditsForUsdMicros(Math.ceil((durationSeconds * SUBTITLE_USD_MICROS_PER_HOUR) / 3600));
}

async function chargeSubtitleCredits(env, userId, durationSeconds, provider, session, language) {
  const credits = subtitleCreditsForDuration(durationSeconds);
  if (!credits) return { ok: false, balance: await getBalance(env, userId), needed: 0 };
  return spendCredits(env, userId, credits, "vexa_download_subtitles", {
    provider,
    session,
    language,
    durationSeconds,
    usdMicrosPerHour: SUBTITLE_USD_MICROS_PER_HOUR,
  });
}

async function refundSubtitleCharge(env, payload, cause) {
  const userId = cleanUserId(payload?.userId);
  const credits = positiveInteger(payload?.chargedCredits);
  const session = cleanToken(payload?.session);
  if (!userId || !credits || !session) return null;
  return refundCredits(env, userId, credits, "vexa_download_subtitles_refund", {
    provider: String(payload?.provider || ""),
    session,
    durationSeconds: positiveNumber(payload?.durationSeconds),
    cause: String(cause || "failed"),
  }, "vexa-download-subtitles:" + session);
}

function parseRange(value, size) {
  const text = String(value || "").trim();
  if (!text || !size) return null;
  const match = text.match(/^bytes=(\d*)-(\d*)$/u);
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Math.min(size, Number.parseInt(match[2], 10));
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = size - suffix;
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

async function withTimeout(promise, timeoutMs, message) {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), Math.max(1, Number(timeoutMs || 0)));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readResponseError(response) {
  if (!response) return "";
  const text = await response.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    return String(data?.error || data?.message || "");
  } catch {
    return text.slice(0, 500);
  }
}

function publicWorkflowError(error) {
  const message = String(error?.message || "");
  if (/subtitle|transcrib|translation|render|video|download|upload|speech|font/i.test(message)) return message.slice(0, 500);
  return "Could not create the subtitled video";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const VEXA_DOWNLOAD_CONTROLLER_JS = String.raw`
(function(){
  'use strict';
  const YT_PREPARE='/mini-app/live/api/youtube-download/prepare';
  const YT_SESSION='/mini-app/live/api/youtube-download/session';
  const IG_PREPARE='/mini-app/live/api/instagram/prepare';
  const IG_SESSION='/mini-app/live/api/instagram/session';
  const STORY_PREPARE='/mini-app/live/api/instagram-story/prepare';
  const STORY_SESSION='/mini-app/live/api/instagram-story/session';
  const SUBTITLE_START='/mini-app/live/api/download-subtitles/start';
  const UPLOAD_CREATE='/mini-app/live/api/download-subtitles/upload/create';
  const UPLOAD_PART='/mini-app/live/api/download-subtitles/upload/part';
  const UPLOAD_COMPLETE='/mini-app/live/api/download-subtitles/upload/complete';
  const UPLOAD_ABORT='/mini-app/live/api/download-subtitles/upload/abort';
  const SUBTITLE_COOKIE='vexa_download_subtitle';
  const LOCAL_MAX_BYTES=512*1024*1024;
  const allowedSubtitles=new Set(['original','en','fa','ru','de','tr','es','ar','fr','pt','it','hi','zh','ja','ko']);
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const uploadButton=document.getElementById('vexaLiveUpload');
  const fileInput=document.getElementById('vexaLiveUploadInput');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const qualityNode=document.getElementById('vexaLiveQuality');
  if(!root||!button||!qualityNode)return;

  let provider='';
  let sourceUrl='';
  let downloadToken='';
  let options=[];
  let selectedKey='';
  let prepared=null;
  let preparing=null;
  let busy=false;
  let socket=null;
  let reconnectTimer=0;
  let reconnectAttempt=0;
  let displayedPercent=0;
  let percentAnimation=0;
  let telegramBound=false;
  let subtitleJob=false;
  let subtitleResultUrl='';
  let nativeStarted=false;
  let resultCheckInFlight=false;
  let localFile=null;
  let localUploadSession='';

  function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch(error){}return window;}
  function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
  function initData(){return String(telegram()?.initData||'');}
  function syncCreditsBalance(value){const balance=Number(value);if(!Number.isFinite(balance))return;try{const host=hostWindow();host.dispatchEvent(new host.CustomEvent('vexa:credits-balance',{detail:{balance:Math.max(0,balance),source:'vexa_download_subtitles'}}));}catch(error){}}
  function showInsufficientCredits(data){syncCreditsBalance(data?.balance);try{const host=hostWindow();host.dispatchEvent(new host.CustomEvent('vexa:insufficient-credits',{detail:{balance:Number(data?.balance),needed:Number(data?.needed),source:'vexa_download_subtitles'}}));}catch(error){}}
  function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch(error){}}
  function mb(bytes){return(Math.max(0,Number(bytes||0))/1048576).toFixed(1);}
  function formatPercent(value){const number=Math.max(0,Math.min(100,Number(value||0)));if(number>=100)return'100%';const rounded=Math.round(number*10)/10;return(String(rounded).includes('.')?rounded.toFixed(1):String(rounded))+'%';}
  function localDetail(){return localFile?String(localFile.name||'Video')+' · '+mb(localFile.size)+' MB':'';}
  function currentDetail(){return localFile?localDetail():optionDetail(selected());}
  function setState(state,message,detail){root.dataset.state=String(state||'idle');if(statusNode)statusNode.textContent=String(message||'');if(detailNode)detailNode.textContent=String(detail||'');}
  function setButton(text,disabled){button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function setUploadDisabled(value){if(uploadButton)uploadButton.disabled=Boolean(value);}
  function setProgress(value,animate){const target=Math.max(0,Math.min(100,Number(value||0)));root.style.setProperty('--vexa-progress',String(target/100));if(track)track.setAttribute('aria-valuenow',String(Math.round(target*10)/10));cancelAnimationFrame(percentAnimation);if(!animate){displayedPercent=target;if(percentNode)percentNode.textContent=formatPercent(target);return;}const from=displayedPercent;const started=performance.now();const duration=Math.min(650,220+Math.abs(target-from)*12);const tick=function(now){const t=Math.min(1,(now-started)/Math.max(1,duration));const eased=1-Math.pow(1-t,3);displayedPercent=from+(target-from)*eased;if(percentNode)percentNode.textContent=formatPercent(displayedPercent);if(t<1)percentAnimation=requestAnimationFrame(tick);};percentAnimation=requestAnimationFrame(tick);}
  function subtitleLanguage(){const prefix=SUBTITLE_COOKIE+'=';for(const part of String(document.cookie||'').split(';')){const value=part.trim();if(!value.startsWith(prefix))continue;let raw=value.slice(prefix.length);try{raw=decodeURIComponent(raw);}catch(error){}raw=String(raw||'').toLowerCase();return allowedSubtitles.has(raw)?raw:'';}return'';}
  function launchPreset(){const host=hostWindow();try{const params=new URLSearchParams(host.location.search);if(params.get('vexaDownload')!=='1')return{source:'',optionKey:''};return{source:String(params.get('vexaSource')||'').trim(),optionKey:String(params.get('vexaOption')||'').trim()};}catch(error){return{source:'',optionKey:''};}}
  function classify(value){let url;try{url=new URL(String(value||'').trim());}catch(error){return null;}if(url.protocol!=='https:')return null;const host=url.hostname.toLowerCase();const path=url.pathname.replace(/\/+$/,'');if(host==='instagram.com'||host.endsWith('.instagram.com')){if(/^\/stories\/highlights\/\d+$/.test(path)||/^\/stories\/[A-Za-z0-9._]+(?:\/\d+)?$/.test(path)||/^\/[A-Za-z0-9._]+\/live$/.test(path))return{provider:'story',url:url.href};if(/^\/(?:[^/]+\/)?(?:p|tv|reels?)\/[A-Za-z0-9_-]+$/.test(path)||/^\/share\/(?:reel|p)\/[A-Za-z0-9_-]+$/.test(path))return{provider:'instagram',url:url.href};return null;}if(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com')||host==='pornhub.com'||host.endsWith('.pornhub.com')||host==='pornhub.net'||host.endsWith('.pornhub.net')||host==='pornhub.org'||host.endsWith('.pornhub.org')||host==='pornhubpremium.com'||host.endsWith('.pornhubpremium.com'))return{provider:'youtube',url:url.href};return null;}
  function endpoints(kind){if(kind==='instagram')return{prepare:IG_PREPARE,session:IG_SESSION};if(kind==='story')return{prepare:STORY_PREPARE,session:STORY_SESSION};return{prepare:YT_PREPARE,session:YT_SESSION};}
  function optionValid(option){const key=String(option?.key||'');if(provider==='story')return/^s\d{1,3}$/.test(key)&&(option?.kind==='live'||Number(option?.sizeBytes||0)>0);if(provider==='instagram')return/^v\d{2,4}$/.test(key)&&Number(option?.sizeBytes||0)>0;return((option?.kind==='audio'&&key==='a')||(option?.kind==='video'&&/^v\d{2,4}$/.test(key)))&&Number(option?.sizeBytes||0)>0;}
  function selected(){return options.find(function(item){return item.key===selectedKey;})||null;}
  function optionDetail(option){if(!option)return'';if(option.kind==='live')return'Live recording · Keep the app open until it ends';const label=option.kind==='audio'?'Audio':String(option.label||option.key);const size=Number(option.sizeBytes||0)>0?' · '+mb(option.sizeBytes)+' MB':'';return label+size;}
  function clearOptions(){options=[];selectedKey='';qualityNode.replaceChildren();qualityNode.dataset.ready='0';qualityNode.style.maxHeight='';qualityNode.style.overflowY='';qualityNode.style.padding='';}
  function clearLocalFile(){localFile=null;localUploadSession='';root.dataset.localUpload='0';if(fileInput)fileInput.value='';}
  function updateSelection(){for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}}
  function choose(key,announce){const option=options.find(function(item){return item.key===String(key||'');});if(!option||busy)return false;selectedKey=option.key;prepared=null;closeSocket();setProgress(0,true);updateSelection();if(announce!==false){setState('waiting','Ready to download',optionDetail(option));haptic('light');}setButton(option.kind==='live'?'Start recording':'Download',false);return true;}
  function renderOptions(items,preferred){options=Array.isArray(items)?items.filter(optionValid):[];qualityNode.replaceChildren();if(!options.length){qualityNode.dataset.ready='0';selectedKey='';return false;}if(provider==='story'){qualityNode.style.maxHeight='176px';qualityNode.style.overflowY='auto';qualityNode.style.padding='2px';}for(const option of options){const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');const label=document.createElement('span');label.textContent=option.kind==='audio'?'Audio':String(option.label||option.key);const size=document.createElement('small');size.textContent=option.kind==='live'?'Records until the Live ends':mb(option.sizeBytes)+' MB';item.append(label,size);item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();choose(option.key,true);});qualityNode.appendChild(item);}qualityNode.dataset.ready='1';const preferredKey=options.some(function(option){return option.key===preferred;})?preferred:'';let fallback=options[0];if(provider!=='story'){const videos=options.filter(function(option){return option.kind==='video';}).sort(function(a,b){return Number(a.height||99999)-Number(b.height||99999);});if(videos[0])fallback=videos[0];}return choose(preferredKey||fallback.key,false);}
  function closeSocket(reset){clearTimeout(reconnectTimer);reconnectTimer=0;if(reset!==false)reconnectAttempt=0;const current=socket;socket=null;if(current)try{current.close(1000,'done');}catch(error){}}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  function connectSocket(progressUrl,reconnecting){clearTimeout(reconnectTimer);reconnectTimer=0;const previous=socket;socket=null;if(previous)try{previous.close(1000,'reconnect');}catch(error){}if(!reconnecting)reconnectAttempt=0;const target=String(progressUrl||'');if(!target)return;const next=new WebSocket(wsUrl(target));socket=next;next.addEventListener('open',function(){if(socket!==next)return;reconnectAttempt=0;if(subtitleJob&&subtitleResultUrl)checkResultReady();});next.addEventListener('message',function(event){if(socket!==next)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}handleProgress(data);});next.addEventListener('close',function(){if(socket!==next)return;socket=null;if(!busy||!prepared?.progressUrl)return;const delay=Math.min(10000,500*Math.pow(2,Math.min(reconnectAttempt,5)));reconnectAttempt=Math.min(reconnectAttempt+1,6);reconnectTimer=setTimeout(function(){if(busy&&prepared?.progressUrl)connectSocket(prepared.progressUrl,true);},delay);});next.addEventListener('error',function(){try{next.close();}catch(error){}});}
  async function checkResultReady(){if(!subtitleJob||!subtitleResultUrl||nativeStarted||resultCheckInFlight)return;resultCheckInFlight=true;try{const response=await fetch(subtitleResultUrl,{method:'HEAD',cache:'no-store'});if(response.ok)launchNative(subtitleResultUrl,prepared?.fileName||'Vexa-video.mp4',true);}catch(error){}finally{resultCheckInFlight=false;}}
  function handleProgress(data){if(!data?.ok)return;const total=Number(data.totalBytes||prepared?.fileSize||0);const done=Math.max(0,Number(data.downloadedBytes||0));const pct=Math.max(0,Math.min(100,Number(data.percent||0)));const state=String(data.status||'ready');const live=selected()?.kind==='live'||prepared?.live;if(state==='file_ready'&&subtitleJob){setProgress(100,true);launchNative(subtitleResultUrl,prepared?.fileName||'Vexa-video.mp4',true);return;}if(state==='completed'){setProgress(100,true);if(subtitleJob){setState('downloading','Finishing video','100% · Preparing your file');checkResultReady();return;}busy=false;setUploadDisabled(false);setState('completed',live?'Live recording completed':'Downloaded',mb(done||total)+' MB');setButton('Download again',false);closeSocket();haptic('medium');return;}if(state==='failed'||state==='cancelled'){busy=false;setUploadDisabled(false);setState('error',String(data.error||'Download failed'),localFile?localDetail():(done?mb(done)+' MB processed':optionDetail(selected())));setButton('Try again',false);closeSocket();prepared=null;subtitleJob=false;subtitleResultUrl='';return;}if(state==='uploading'){setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Uploading video',mb(done)+' MB / '+mb(total)+' MB');return;}if(!live&&(state==='staging'||state==='transcribing'||state==='translating'||state==='rendering'||state==='finalizing')){const label=state==='staging'?'Getting video':state==='transcribing'?'Creating subtitles':state==='translating'?'Translating subtitles':state==='rendering'?'Rendering subtitles':'Finishing video';setProgress(Math.max(displayedPercent,pct),true);setState('downloading',label,formatPercent(Math.max(displayedPercent,pct))+' · Keep the app open');return;}if(state==='preparing'){if(displayedPercent<=0)setProgress(0,false);setState('preparing',live?'Connecting to Instagram Live':'Preparing download','Keep the app open');return;}if(state==='downloading'){if(live){setState('downloading','Recording Instagram Live',mb(done)+' MB saved · Keep the app open');return;}setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Downloading',mb(done)+' MB / '+mb(total)+' MB · Keep the app open');}}
  function bindTelegram(){if(telegramBound)return;const tg=telegram();if(!tg?.onEvent)return;try{tg.onEvent('fileDownloadRequested',function(event){const state=String(event?.status||event||'').toLowerCase();if(state==='cancelled'){if(nativeStarted&&subtitleJob){nativeStarted=false;busy=false;setUploadDisabled(false);setState('completed','Video is ready','Tap Download to try again');setButton(localFile?'Download':'Download',false);return;}busy=false;setUploadDisabled(false);closeSocket();setProgress(0,true);setState('waiting','Download cancelled',currentDetail());setButton(localFile?'Add subtitles':'Download',false);}});telegramBound=true;}catch(error){}}
  function launchNative(url,fileName,fromSubtitle){if(nativeStarted)return;nativeStarted=true;const target=new URL(String(url||''),window.location.origin).href;const tg=telegram();if(tg?.downloadFile){try{tg.downloadFile({url:target,file_name:String(fileName||'Vexa-video.mp4')},function(accepted){if(accepted===false){nativeStarted=false;busy=false;setUploadDisabled(false);setState('completed',fromSubtitle?'Video is ready':'Ready to download',currentDetail());setButton('Download',false);return;}if(fromSubtitle){busy=false;setUploadDisabled(false);setProgress(100,true);setState('completed','Video is ready','Download started');setButton('Download again',false);closeSocket();haptic('medium');}});return;}catch(error){console.warn('Telegram downloadFile failed',error?.message||error);}}try{const link=document.createElement('a');link.href=target;link.download=String(fileName||'Vexa-video.mp4');link.rel='noopener';document.body.appendChild(link);link.click();link.remove();if(fromSubtitle){busy=false;setUploadDisabled(false);setProgress(100,true);setState('completed','Video is ready','Download started');setButton('Download again',false);closeSocket();haptic('medium');}}catch(error){nativeStarted=false;busy=false;setUploadDisabled(false);setState('error','Could not start download','');setButton('Try again',false);}}
  async function startSubtitle(){const language=subtitleLanguage();if(!language||selected()?.kind==='audio'||selected()?.kind==='live'||prepared?.live)return false;subtitleJob=true;nativeStarted=false;subtitleResultUrl='';setProgress(0,false);setState('downloading','Starting subtitles','0% · Keep the app open');connectSocket(prepared.progressUrl,false);try{const response=await fetch(SUBTITLE_START,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadUrl:prepared.downloadUrl,language:language})});const data=await response.json().catch(function(){return{};});if(response.status===402)showInsufficientCredits(data);if(!response.ok||!data.resultUrl)throw new Error(String(data.error||'Could not start subtitle rendering'));syncCreditsBalance(data.balance);subtitleResultUrl=new URL(String(data.resultUrl),window.location.origin).href;checkResultReady();return true;}catch(error){subtitleJob=false;subtitleResultUrl='';busy=false;setUploadDisabled(false);closeSocket();setState('error',String(error?.message||'Could not start subtitle rendering'),'');setButton('Try again',false);return true;}}
  async function requestDownload(){if(!prepared||busy)return;busy=true;setUploadDisabled(true);bindTelegram();haptic('light');if(await startSubtitle())return;setProgress(0,false);setState('preparing','Waiting for Telegram','Keep the app open');connectSocket(prepared.progressUrl,false);launchNative(prepared.downloadUrl,prepared.fileName,false);}
  function localVideoSupported(file){if(!file||!Number(file.size))return false;const type=String(file.type||'').toLowerCase();const name=String(file.name||'').toLowerCase();return type.startsWith('video/')||/\.(?:mp4|mov|m4v|webm|mkv)$/.test(name);}
  function localVideoDuration(file){return new Promise(function(resolve){const video=document.createElement('video');const objectUrl=URL.createObjectURL(file);let finished=false;const done=function(value){if(finished)return;finished=true;clearTimeout(timer);video.removeAttribute('src');try{video.load();}catch(loadError){}URL.revokeObjectURL(objectUrl);resolve(value);};const timer=setTimeout(function(){done(0);},10000);video.preload='metadata';video.muted=true;video.onloadedmetadata=function(){const duration=Number(video.duration);done(Number.isFinite(duration)&&duration>0?duration:0);};video.onerror=function(){done(0);};video.src=objectUrl;});}
  function uploadPart(session,partNumber,blob,uploadedBefore,totalBytes){return new Promise(function(resolve,reject){let attempt=0;const send=function(){attempt+=1;const xhr=new XMLHttpRequest();xhr.open('PUT',UPLOAD_PART+'?session='+encodeURIComponent(session)+'&part='+encodeURIComponent(String(partNumber)),true);xhr.setRequestHeader('X-Vexa-Init-Data',initData());xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.upload.onprogress=function(event){if(!event.lengthComputable)return;const bytes=Math.min(totalBytes,uploadedBefore+event.loaded);const percent=(bytes/Math.max(1,totalBytes))*20;setProgress(Math.max(displayedPercent,percent),true);setState('downloading','Uploading video',mb(bytes)+' MB / '+mb(totalBytes)+' MB');};xhr.onload=function(){let data={};try{data=JSON.parse(String(xhr.responseText||'{}'));}catch(error){}if(xhr.status>=200&&xhr.status<300&&data.etag){resolve({partNumber:Number(data.partNumber||partNumber),etag:String(data.etag)});return;}const message=String(data.error||'Video upload failed');if(attempt<2&&xhr.status>=500){send();return;}reject(new Error(message));};xhr.onerror=function(){if(attempt<2){send();return;}reject(new Error('Video upload connection failed'));};xhr.onabort=function(){reject(new Error('Video upload was cancelled'));};xhr.send(blob);};send();});}
  async function abortUpload(session){if(!session)return;try{await fetch(UPLOAD_ABORT,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),session:session})});}catch(error){}}
  async function requestLocalUpload(){if(!localFile||busy)return;const language=subtitleLanguage();if(!language){setState('error','Choose a subtitle language',localDetail());setButton('Add subtitles',false);return;}busy=true;setUploadDisabled(true);bindTelegram();haptic('light');setProgress(0,false);setState('downloading','Preparing upload',localDetail());setButton('Uploading…',true);let session='';try{const durationSeconds=await localVideoDuration(localFile);const createResponse=await fetch(UPLOAD_CREATE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),fileName:String(localFile.name||'video.mp4'),mimeType:String(localFile.type||''),fileSize:Number(localFile.size||0),durationSeconds:durationSeconds})});const created=await createResponse.json().catch(function(){return{};});if(createResponse.status===402)showInsufficientCredits(created);if(!createResponse.ok||!created.session||!created.progressUrl||!created.partSize)throw new Error(String(created.error||'Could not start video upload'));session=String(created.session);localUploadSession=session;prepared={downloadUrl:'',progressUrl:new URL(String(created.progressUrl),window.location.origin).href,fileName:String(created.fileName||'Vexa-video.mp4'),fileSize:Number(localFile.size||0),title:String(localFile.name||'Video'),optionKey:'upload',live:false,local:true};subtitleJob=true;subtitleResultUrl='';nativeStarted=false;connectSocket(prepared.progressUrl,false);const partSize=Number(created.partSize);const count=Math.ceil(localFile.size/partSize);const parts=[];for(let index=0;index<count;index+=1){const start=index*partSize;const end=Math.min(localFile.size,start+partSize);const blob=localFile.slice(start,end);parts.push(await uploadPart(session,index+1,blob,start,localFile.size));}setProgress(Math.max(displayedPercent,20),true);setState('downloading','Preparing subtitles','20% · Keep the app open');const completeResponse=await fetch(UPLOAD_COMPLETE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),session:session,parts:parts,language:language})});const completed=await completeResponse.json().catch(function(){return{};});if(completeResponse.status===402)showInsufficientCredits(completed);if(!completeResponse.ok||!completed.resultUrl)throw new Error(String(completed.error||'Could not start subtitle rendering'));syncCreditsBalance(completed.balance);subtitleResultUrl=new URL(String(completed.resultUrl),window.location.origin).href;if(completed.progressUrl)prepared.progressUrl=new URL(String(completed.progressUrl),window.location.origin).href;checkResultReady();}catch(error){if(session)await abortUpload(session);busy=false;setUploadDisabled(false);subtitleJob=false;subtitleResultUrl='';nativeStarted=false;closeSocket();prepared=null;setState('error',String(error?.message||'Could not upload video'),localDetail());setButton('Try again',false);}}
  function chooseLocalFile(file){if(!file)return;if(!localVideoSupported(file)){setState('error','Choose a supported video file','MP4, MOV, M4V, WebM or MKV');setButton('Download',false);return;}if(Number(file.size||0)>LOCAL_MAX_BYTES){setState('error','Video must be 512 MB or smaller',mb(file.size)+' MB');setButton('Download',false);return;}provider='youtube';sourceUrl='';downloadToken='';prepared=null;subtitleJob=false;subtitleResultUrl='';nativeStarted=false;busy=false;closeSocket();clearOptions();localFile=file;localUploadSession='';root.dataset.localUpload='1';setProgress(0,false);setState('waiting','Ready for subtitles',localDetail());setButton('Add subtitles',false);setUploadDisabled(false);haptic('light');}
  async function prepareSource(value,preferred){if(preparing)return preparing;const classified=classify(value);if(!classified){setState('error','Unsupported video link','');setButton('Try again',false);return false;}clearLocalFile();provider=classified.provider;sourceUrl=classified.url;downloadToken='';prepared=null;subtitleJob=false;subtitleResultUrl='';nativeStarted=false;busy=false;closeSocket();clearOptions();setProgress(0,false);setState('preparing',provider==='story'?'Loading Instagram Story':provider==='instagram'?'Loading Instagram qualities':'Loading qualities','');setButton('Preparing…',true);setUploadDisabled(true);haptic('light');const api=endpoints(provider);preparing=(async function(){try{if(provider==='youtube'){const response=await fetch(api.prepare,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:sourceUrl})});const direct=await response.json().catch(function(){return{};});if(!response.ok||!direct.downloadUrl)throw new Error(String(direct.error||'Could not prepare video'));const token=new URL(String(direct.downloadUrl),window.location.origin).searchParams.get('token')||'';if(!/^[A-Za-z0-9_-]{40,160}$/.test(token))throw new Error('Download session is invalid');downloadToken=token;const qualityResponse=await fetch(api.session,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken})});const qualityData=await qualityResponse.json().catch(function(){return{};});if(!qualityResponse.ok||!Array.isArray(qualityData.options)||!qualityData.options.length)throw new Error(String(qualityData.error||'Could not load video qualities'));if(!renderOptions(qualityData.options,preferred))throw new Error('Download option is unavailable');}else{const response=await fetch(api.prepare,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:sourceUrl})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadToken||!Array.isArray(data.options)||!data.options.length)throw new Error(String(data.error||'Could not prepare media'));downloadToken=String(data.downloadToken);if(!renderOptions(data.options,preferred))throw new Error('Download option is unavailable');}setProgress(0,false);setState('waiting','Choose format',optionDetail(selected()));setButton(selected()?.kind==='live'?'Start recording':'Download',false);return true;}catch(error){downloadToken='';prepared=null;clearOptions();setState('error',String(error?.message||'Could not prepare download'),'');setButton('Try again',false);return false;}finally{preparing=null;setUploadDisabled(false);}})();return preparing;}
  async function prepareSelected(){if(!downloadToken||!selectedKey||preparing)return false;const option=selected();const api=endpoints(provider);setState('preparing','Preparing '+String(option?.label||'format'),optionDetail(option));setButton('Preparing…',true);setUploadDisabled(true);preparing=(async function(){try{const response=await fetch(api.session,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedKey})});const data=await response.json().catch(function(){return{};});if(!response.ok||!data.downloadUrl||!data.progressUrl||(!data.live&&!data.fileSize))throw new Error(String(data.error||'Could not prepare selected format'));prepared={downloadUrl:new URL(String(data.downloadUrl),window.location.origin).href,progressUrl:new URL(String(data.progressUrl),window.location.origin).href,fileName:String(data.fileName||'Vexa-video.mp4'),fileSize:Number(data.fileSize||0),title:String(data.title||'Video'),optionKey:String(data.optionKey||selectedKey),live:Boolean(data.live)};setProgress(0,false);setState('waiting',prepared.live?'Ready to record':'Ready to download',optionDetail(option));setButton(prepared.live?'Start recording':'Download',false);return true;}catch(error){prepared=null;setState('error',String(error?.message||'Could not prepare selected format'),optionDetail(option));setButton('Try again',false);return false;}finally{preparing=null;setUploadDisabled(false);}})();return preparing;}
  async function onButton(event){event.preventDefault();event.stopPropagation();if(busy||button.disabled)return;if(localFile){requestLocalUpload();return;}if(prepared){requestDownload();return;}if(downloadToken&&selectedKey){const ready=await prepareSelected();if(ready)requestDownload();return;}const preset=launchPreset();const raw=sourceUrl||preset.source||String(window.prompt('Enter video link')||'').trim();if(!raw)return;await prepareSource(raw,preset.optionKey);}
  function onUploadButton(event){event.preventDefault();event.stopPropagation();if(busy||preparing||uploadButton?.disabled||!fileInput)return;fileInput.value='';fileInput.click();}
  button.addEventListener('click',onButton);
  uploadButton?.addEventListener('click',onUploadButton);
  fileInput?.addEventListener('change',function(){const file=fileInput.files&&fileInput.files[0];if(file)chooseLocalFile(file);});
  bindTelegram();
  root.dataset.localUpload='0';
  const preset=launchPreset();
  if(preset.source){setTimeout(function(){prepareSource(preset.source,preset.optionKey);},0);}else{setProgress(0,false);setState('idle','Ready when you are','');setButton('Download',false);setUploadDisabled(false);}
})();
`;
