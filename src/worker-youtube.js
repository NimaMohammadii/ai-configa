import worker from "./worker-live-events.js";
import {
  VexaMediaContainerV3,
  YOUTUBE_DOWNLOAD_RUNTIME,
  handleYouTubeDownloadRequest,
  isYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download.js";

const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const YOUTUBE_RUNTIME_VERSION = "20260819-1";

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3 };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      if (isYouTubeDownloadRequest(request)) {
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
      console.error("Vexa YouTube download failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

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

function publicError(error) {
  const message = String(error?.message || "Request failed");
  if (Number(error?.status) >= 400 && Number(error?.status) < 500) return message;
  return "YouTube download is temporarily unavailable";
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
