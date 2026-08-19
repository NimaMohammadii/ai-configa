import worker from "./worker-live-events.js";
import {
  VexaMediaContainerV3,
  handleYouTubeDownloadRequest,
  isYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-exec.js";
import { YOUTUBE_DOWNLOAD_RUNTIME } from "./mini-app/vexa-live/youtube-download-runtime.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { botMethodUrl } from "./telegram-api.js";

const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const YOUTUBE_PREPARE_PATH = "/mini-app/live/api/youtube-download/prepare";
const YOUTUBE_RUNTIME_VERSION = "20260819-6";
const TELEGRAM_VIDEO_TIMEOUT_MS = 120000;

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3 };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      if (isYouTubeDownloadRequest(request)) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname === YOUTUBE_PREPARE_PATH) {
          return await prepareAndSendYouTubeVideo(request, env, ctx);
        }
        return await handleYouTubeDownloadRequest(request, env, ctx);
      }

      const response = await worker.fetch(request, env, ctx);
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        url.pathname === LIVE_INTEGRATION_PATH &&
        response?.ok
      ) {
        return appendYouTubeRuntime(response);
      }
      return response;
    } catch (error) {
      console.error("Vexa YouTube delivery failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

async function prepareAndSendYouTubeVideo(request, env, ctx) {
  const payload = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);

  const prepared = await handleYouTubeDownloadRequest(request, env, ctx);
  if (!prepared?.ok) return prepared;

  const data = await prepared.json().catch(() => null);
  if (!data || typeof data !== "object" || !data.downloadUrl) {
    return json({ error: "Could not prepare this video" }, 502);
  }

  const videoUrl = new URL(String(data.downloadUrl), request.url).href;
  try {
    const message = await sendTelegramVideoFromUrl(env, user.id, videoUrl);
    return json({
      ok: true,
      sent: true,
      messageId: Number(message?.message_id || 0) || null,
      title: String(data.title || "YouTube video"),
    });
  } catch (error) {
    console.error(
      "Vexa YouTube sendVideo failed",
      error?.telegramDescription || error?.stack || error
    );
    return json({ error: publicTelegramVideoError(error) }, 502);
  }
}

async function sendTelegramVideoFromUrl(env, chatId, videoUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("youtube_send_video_timeout"), TELEGRAM_VIDEO_TIMEOUT_MS);

  try {
    const response = await fetch(botMethodUrl(env, "sendVideo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId),
        video: videoUrl,
        supports_streaming: true,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const error = new Error("Telegram sendVideo failed");
      error.telegramDescription = String(data?.description || "");
      error.telegramStatus = response.status;
      throw error;
    }
    return data.result;
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      String(error).includes("youtube_send_video_timeout")
    ) {
      const timeoutError = new Error("Telegram video delivery timed out");
      timeoutError.code = "telegram_video_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function appendYouTubeRuntime(response) {
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;
  let source = await response.text();
  const marker = "vexa-youtube-download-runtime:" + YOUTUBE_RUNTIME_VERSION;
  if (!source.includes(marker)) {
    source += "\n/* " + marker + " */\n" + YOUTUBE_DOWNLOAD_RUNTIME + "\n";
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-YouTube", YOUTUBE_RUNTIME_VERSION);
  return new Response(source, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicTelegramVideoError(error) {
  const description = String(error?.telegramDescription || "").toLowerCase();
  if (error?.code === "telegram_video_timeout") {
    return "Telegram took too long to receive this video";
  }
  if (/file is too big|file too large|request entity too large/.test(description)) {
    return "This video is too large to send to Telegram right now";
  }
  if (/failed to get http url content|wrong file identifier|webpage_curl_failed|wrong type/.test(description)) {
    return "Telegram could not fetch this video stream";
  }
  if (/chat not found|bot was blocked|user is deactivated/.test(description)) {
    return "Open the bot chat and press Start, then try again";
  }
  return "Telegram could not send this video";
}

function publicError(error) {
  const message = String(error?.message || "Request failed");
  if (Number(error?.status) >= 400 && Number(error?.status) < 500) return message;
  return "YouTube delivery is temporarily unavailable";
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
