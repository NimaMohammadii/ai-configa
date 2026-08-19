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
const YOUTUBE_RUNTIME_VERSION = "20260819-7";
const TELEGRAM_VIDEO_TIMEOUT_MS = 240000;
const TELEGRAM_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const TELEGRAM_VIDEO_FILENAME = "Vexa-YouTube-video.mp4";

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

  const internalVideoUrl = new URL(String(data.downloadUrl), request.url).href;
  let videoResponse;
  try {
    videoResponse = await handleYouTubeDownloadRequest(
      new Request(internalVideoUrl, {
        method: "GET",
        headers: { "Accept": "video/mp4" },
      }),
      env,
      ctx
    );
  } catch (error) {
    console.error("Vexa YouTube internal stream failed", error?.stack || error);
    return json({ error: publicStreamError(error) }, 502);
  }

  if (!videoResponse?.ok || !videoResponse.body) {
    const detail = await readErrorResponse(videoResponse);
    return json({ error: detail || "Could not open this video stream" }, 502);
  }

  const contentType = String(videoResponse.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("video/mp4")) {
    try { await videoResponse.body.cancel("invalid_content_type"); } catch (error) {}
    return json({ error: "YouTube did not return a valid MP4 video" }, 502);
  }

  try {
    const message = await sendTelegramVideoStream(env, user.id, videoResponse.body);
    return json({
      ok: true,
      sent: true,
      messageId: Number(message?.message_id || 0) || null,
      title: String(data.title || "YouTube video"),
    });
  } catch (error) {
    console.error(
      "Vexa YouTube sendVideo upload failed",
      error?.telegramDescription || error?.stack || error
    );
    return json({ error: publicTelegramVideoError(error) }, 502);
  }
}

async function sendTelegramVideoStream(env, chatId, videoStream) {
  if (!videoStream || typeof videoStream.getReader !== "function") {
    throw new Error("Video stream is unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("youtube_send_video_timeout"),
    TELEGRAM_VIDEO_TIMEOUT_MS
  );
  const multipart = createTelegramVideoMultipart(videoStream, chatId);

  try {
    const response = await fetch(botMethodUrl(env, "sendVideo"), {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=" + multipart.boundary,
      },
      body: multipart.body,
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
    if (multipart.state.tooLarge) {
      const sizeError = new Error("Telegram video upload exceeds 50 MB");
      sizeError.code = "telegram_video_too_large";
      throw sizeError;
    }
    if (multipart.state.sourceError) {
      throw multipart.state.sourceError;
    }
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

function createTelegramVideoMultipart(videoStream, chatId) {
  const boundary = "----VexaVideo" + crypto.randomUUID().replace(/-/g, "");
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="chat_id"\r\n\r\n' +
    String(chatId) + "\r\n" +
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="supports_streaming"\r\n\r\n' +
    "true\r\n" +
    "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="video"; filename="' + TELEGRAM_VIDEO_FILENAME + '"\r\n' +
    "Content-Type: video/mp4\r\n\r\n"
  );
  const suffix = encoder.encode("\r\n--" + boundary + "--\r\n");
  const reader = videoStream.getReader();
  const state = {
    tooLarge: false,
    sourceError: null,
    videoBytes: 0,
  };
  let phase = 0;

  const body = new ReadableStream({
    async pull(streamController) {
      if (phase === 0) {
        phase = 1;
        streamController.enqueue(prefix);
        return;
      }

      if (phase === 1) {
        try {
          const next = await reader.read();
          if (!next.done) {
            if (next.value?.byteLength) {
              state.videoBytes += next.value.byteLength;
              if (state.videoBytes > TELEGRAM_VIDEO_MAX_BYTES) {
                state.tooLarge = true;
                try { await reader.cancel("telegram_video_too_large"); } catch (error) {}
                streamController.error(new Error("Telegram video upload exceeds 50 MB"));
                return;
              }
              streamController.enqueue(next.value);
            }
            return;
          }
          phase = 2;
        } catch (error) {
          state.sourceError = error;
          streamController.error(error);
          return;
        }
      }

      if (phase === 2) {
        phase = 3;
        streamController.enqueue(suffix);
        streamController.close();
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (error) {}
    },
  });

  return { boundary, body, state };
}

async function readErrorResponse(response) {
  if (!response) return "";
  try {
    const data = await response.json();
    return String(data?.error || "");
  } catch (error) {
    return "";
  }
}

function publicStreamError(error) {
  const message = String(error?.message || "");
  if (/youtube/i.test(message) || /video/i.test(message)) return message;
  return "Could not open this video stream";
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
  const message = String(error?.message || "");
  if (error?.code === "telegram_video_too_large") {
    return "This video is larger than Telegram's 50 MB bot limit";
  }
  if (error?.code === "telegram_video_timeout") {
    return "Telegram took too long to receive this video";
  }
  if (/file is too big|file too large|request entity too large/.test(description)) {
    return "This video is larger than Telegram's 50 MB bot limit";
  }
  if (/chat not found|bot was blocked|user is deactivated/.test(description)) {
    return "Open the bot chat and press Start, then try again";
  }
  if (/youtube/i.test(message)) return message;
  return "Telegram could not receive this video";
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
