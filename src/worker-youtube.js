import worker from "./worker-live-events.js";
import {
  handleYouTubeDownloadRequest,
  isYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-exec.js";
import {
  VexaMediaContainerV3,
  appendPlaybackRuntime,
  handleYouTubePlaybackRequest,
  isYouTubePlaybackRequest,
} from "./mini-app/vexa-live/youtube-range-playback.js";
import {
  appendBackgroundDownloadRuntime,
  handleBackgroundYouTubeDownloadRequest,
  isBackgroundYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-background-download.js";
import { VexaYouTubeDownloadWorkflowV2 } from "./mini-app/vexa-live/youtube-background-workflow-v2.js";

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3, VexaYouTubeDownloadWorkflowV2 };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      if (isBackgroundYouTubeDownloadRequest(request)) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname.endsWith("/session")) {
          await env.DB?.prepare(
            "DELETE FROM vexa_youtube_download_progress WHERE status = 'ready' AND downloaded_bytes = 0"
          ).run().catch(() => null);
        }
        return await handleBackgroundYouTubeDownloadRequest(request, env, ctx);
      }
      if (isYouTubePlaybackRequest(request)) {
        return await handleYouTubePlaybackRequest(request, env, ctx);
      }
      if (isYouTubeDownloadRequest(request)) {
        return await handleYouTubeDownloadRequest(request, env, ctx);
      }
      let response = await worker.fetch(request, env, ctx);
      response = await appendPlaybackRuntime(request, response);
      return await appendBackgroundDownloadRuntime(request, response);
    } catch (error) {
      console.error("Vexa YouTube request failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

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
