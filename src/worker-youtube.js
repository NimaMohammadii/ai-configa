import worker from "./worker-live-events.js";
import {
  appendMiniAppVoiceTransformRuntime,
  handleMiniAppVoiceTransformRequest,
} from "./mini-app/voice-transform-miniapp.js";
import {
  handleYouTubeDownloadRequest,
  isYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-exec.js";
import {
  VexaMediaContainerV3,
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
  VexaInstagramContainer,
  VexaInstagramProgressHub,
  appendInstagramDownloadRuntime,
  handleInstagramDownloadRequest,
  isInstagramDownloadRequest,
} from "./mini-app/vexa-live/instagram-download.js";
import {
  VexaInstagramStoryContainer,
  VexaInstagramStoryProgressHub,
  appendInstagramStoryRuntime,
  handleInstagramStoryDownloadRequest,
  isInstagramStoryDownloadRequest,
} from "./mini-app/vexa-live/instagram-story-download.js";
import {
  appendVexaCustomPlayerRuntime,
  handleVexaCustomPlayerRequest,
  isVexaCustomPlayerRequest,
} from "./mini-app/vexa-live/youtube-custom-player.js";
import {
  appendVexaLiveSubtitlesRuntime,
  handleVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
} from "./mini-app/vexa-live/youtube-live-subtitles.js";
import {
  VexaSubtitleContainer,
  handleDownloadSubtitlesRequest,
  isDownloadSubtitlesRequest,
  rewriteDownloadSessionResponseWithSubtitles,
} from "./mini-app/vexa-live/download-subtitles.js";
import {
  handleVexaLivePersistenceRequest,
  isVexaLivePersistenceRequest,
} from "./mini-app/vexa-live/youtube-live-persistence.js";
import { appendVexaLiveLandingRuntime } from "./mini-app/vexa-live/vexa-live-landing.js";

export { AiCodingWorkflow } from "./worker-live-events.js";
export {
  VexaMediaContainerV3,
  VexaSubtitleContainer,
  VexaDownloadProgressHub,
  VexaInstagramContainer,
  VexaInstagramProgressHub,
  VexaInstagramStoryContainer,
  VexaInstagramStoryProgressHub,
};

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      const voiceTransformResponse = await handleMiniAppVoiceTransformRequest(request, env);
      if (voiceTransformResponse) return voiceTransformResponse;

      if (isVexaLivePersistenceRequest(request)) {
        return handleVexaLivePersistenceRequest(request);
      }
      if (isDownloadSubtitlesRequest(request)) {
        const response = await handleDownloadSubtitlesRequest(request, env, ctx, {
          youtube: handleTrackedYouTubeDownloadRequest,
          instagram: handleInstagramDownloadRequest,
          story: handleInstagramStoryDownloadRequest,
        });
        if (response) return response;
      }
      if (isVexaLiveSubtitlesRequest(request)) {
        return await handleVexaLiveSubtitlesRequest(request, env, ctx);
      }
      if (isVexaCustomPlayerRequest(request)) {
        return handleVexaCustomPlayerRequest(request);
      }
      if (isInstagramStoryDownloadRequest(request)) {
        const response = await handleInstagramStoryDownloadRequest(request, env, ctx);
        return await rewriteDownloadSessionResponseWithSubtitles(request, response);
      }
      if (isInstagramDownloadRequest(request)) {
        const response = await handleInstagramDownloadRequest(request, env, ctx);
        return await rewriteDownloadSessionResponseWithSubtitles(request, response);
      }
      if (isTrackedYouTubeDownloadRequest(request)) {
        const response = await handleTrackedYouTubeDownloadRequest(request, env, ctx);
        return await rewriteDownloadSessionResponseWithSubtitles(request, response);
      }
      if (isYouTubePlaybackRequest(request)) {
        return await handleYouTubePlaybackRequest(request, env, ctx);
      }
      if (isYouTubeDownloadRequest(request)) {
        return await handleYouTubeDownloadRequest(request, env, ctx);
      }
      let response = await worker.fetch(request, env, ctx);
      response = await appendMiniAppVoiceTransformRuntime(request, response);
      response = await appendVexaLiveLandingRuntime(request, response);
      response = await appendInstagramStoryRuntime(request, response);
      response = await appendInstagramDownloadRuntime(request, response);
      response = await appendDownloadProgressRuntime(request, response);
      response = await appendVexaCustomPlayerRuntime(request, response);
      response = await appendVexaLiveSubtitlesRuntime(request, response);
      return response;
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
