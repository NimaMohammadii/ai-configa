import worker from "./worker-live-events.js";
import {
  VexaMediaContainerV3,
  handleYouTubeDownloadRequest,
  isYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-exec.js";

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3 };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      if (isYouTubeDownloadRequest(request)) {
        const response = await handleYouTubeDownloadRequest(request, env, ctx);
        return inlinePlaybackResponse(request, response);
      }
      return await worker.fetch(request, env, ctx);
    } catch (error) {
      console.error("Vexa YouTube request failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

function inlinePlaybackResponse(request, response) {
  if (!response || !response.ok || request.method !== "GET") return response;
  const url = new URL(request.url);
  if (url.searchParams.get("inline") !== "1") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("video/mp4")) return response;

  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
