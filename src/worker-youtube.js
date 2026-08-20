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
  VexaDownloadProgressHub,
  appendDownloadProgressRuntime,
  handleTrackedYouTubeDownloadRequest,
  isTrackedYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-progress.js";
import {
  appendVexaCustomPlayerRuntime,
  handleVexaCustomPlayerRequest,
  isVexaCustomPlayerRequest,
} from "./mini-app/vexa-live/youtube-custom-player.js";
import {
  VexaSubtitleContainer,
  appendVexaLiveSubtitlesRuntime,
  handleVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
} from "./mini-app/vexa-live/youtube-live-subtitles-v4.js";
import {
  appendVexaLivePersistenceRuntime,
  isVexaLivePersistenceRequest,
} from "./mini-app/vexa-live/youtube-live-persistence.js";
import {
  handlePatchedVexaLivePersistenceRequest,
} from "./mini-app/vexa-live/youtube-live-persistence-patched.js";

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3, VexaSubtitleContainer, VexaDownloadProgressHub };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      if (isVexaLivePersistenceRequest(request)) {
        return handlePatchedVexaLivePersistenceRequest(request);
      }
      if (isVexaLiveSubtitlesRequest(request)) {
        return await handleVexaLiveSubtitlesRequest(request, env, ctx);
      }
      if (isVexaCustomPlayerRequest(request)) {
        return handleVexaCustomPlayerRequest(request);
      }
      if (isTrackedYouTubeDownloadRequest(request)) {
        return await handleTrackedYouTubeDownloadRequest(request, env, ctx);
      }
      if (isYouTubePlaybackRequest(request)) {
        return await handleYouTubePlaybackRequest(request, env, ctx);
      }
      if (isYouTubeDownloadRequest(request)) {
        return await handleYouTubeDownloadRequest(request, env, ctx);
      }
      let response = await worker.fetch(request, env, ctx);
      response = await appendPlaybackRuntime(request, response);
      response = await appendDownloadProgressRuntime(request, response);
      response = await appendVexaCustomPlayerRuntime(request, response);
      response = await appendVexaLiveSubtitlesRuntime(request, response);
      return await appendVexaLivePersistenceRuntime(request, response);
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
