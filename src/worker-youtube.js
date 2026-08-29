import { getRandom } from "@cloudflare/containers";
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
  handleTrackedYouTubeDownloadRequest,
  isTrackedYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-progress.js";
import {
  VexaInstagramContainer,
  VexaInstagramProgressHub,
  handleInstagramDownloadRequest,
  isInstagramDownloadRequest,
} from "./mini-app/vexa-live/instagram-download.js";
import {
  VexaInstagramStoryContainer,
  VexaInstagramStoryProgressHub,
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
  VexaSubtitleContainer as VexaSubtitleContainerBase,
  handleDownloadSubtitlesRequest,
} from "./mini-app/vexa-live/download-subtitles.js";
import {
  VexaSubtitleWorkflow,
  appendVexaDownloadControllerRuntime,
  handleVexaDownloadControllerRequest,
  isVexaDownloadControllerRequest,
} from "./mini-app/vexa-live/download-controller.js";
import {
  handleVexaLivePersistenceRequest,
  isVexaLivePersistenceRequest,
} from "./mini-app/vexa-live/youtube-live-persistence.js";
import { appendVexaLiveLandingRuntime } from "./mini-app/vexa-live/vexa-live-landing.js";
import {
  handleInstagramMessagingRequest,
  isInstagramMessagingRequest,
} from "./instagram-messaging.js";

const SUBTITLE_SOURCE_PATH = "/mini-app/live/api/download-subtitles/source";
const INSTAGRAM_LOGIN_CALLBACK_PATH = "/api/instagram/login/callback";
const DOWNLOAD_SUBTITLE_RENDERER_INSTANCES = 3;

class VexaSubtitleContainer extends VexaSubtitleContainerBase {
  constructor(ctx, env) {
    super(ctx, env);
    this.vexaEnv = env;
  }

  async renderSubtitledVideo(...args) {
    if (!this.vexaEnv?.VEXA_DOWNLOAD_SUBTITLES) {
      throw new Error("Subtitle renderer pool is unavailable");
    }
    const renderer = await getRandom(
      this.vexaEnv.VEXA_DOWNLOAD_SUBTITLES,
      DOWNLOAD_SUBTITLE_RENDERER_INSTANCES,
    );
    return renderer.renderSubtitledVideo(...args);
  }
}

class VexaDownloadSubtitleContainer extends VexaSubtitleContainerBase {
  renderQueue = Promise.resolve();

  async renderSubtitledVideo(...args) {
    const previous = this.renderQueue.catch(() => null);
    let release;
    this.renderQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      return await super.renderSubtitledVideo(...args);
    } finally {
      release?.();
    }
  }
}

export { AiCodingWorkflow } from "./worker-live-events.js";
export {
  VexaMediaContainerV3,
  VexaSubtitleContainer,
  VexaDownloadSubtitleContainer,
  VexaSubtitleWorkflow,
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
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === INSTAGRAM_LOGIN_CALLBACK_PATH) {
        return instagramBusinessLoginCallback(request);
      }

      if (isInstagramMessagingRequest(request)) {
        return handleInstagramMessagingRequest(request, env, ctx);
      }

      const voiceTransformResponse = await handleMiniAppVoiceTransformRequest(request, env);
      if (voiceTransformResponse) return voiceTransformResponse;

      if (isVexaLivePersistenceRequest(request)) {
        return handleVexaLivePersistenceRequest(request);
      }
      if (isVexaDownloadControllerRequest(request)) {
        return handleVexaDownloadControllerRequest(request, env, ctx);
      }
      if (path === SUBTITLE_SOURCE_PATH && (request.method === "GET" || request.method === "HEAD")) {
        return handleDownloadSubtitlesRequest(request, env, ctx, {});
      }
      if (isVexaLiveSubtitlesRequest(request)) {
        return await handleVexaLiveSubtitlesRequest(request, env, ctx);
      }
      if (isVexaCustomPlayerRequest(request)) {
        return handleVexaCustomPlayerRequest(request);
      }
      if (isInstagramStoryDownloadRequest(request)) {
        return handleInstagramStoryDownloadRequest(request, env, ctx);
      }
      if (isInstagramDownloadRequest(request)) {
        return handleInstagramDownloadRequest(request, env, ctx);
      }
      if (isTrackedYouTubeDownloadRequest(request)) {
        return handleTrackedYouTubeDownloadRequest(request, env, ctx);
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
      response = await appendVexaDownloadControllerRuntime(request, response);
      response = await appendVexaCustomPlayerRuntime(request, response);
      response = await appendVexaLiveSubtitlesRuntime(request, response);
      return response;
    } catch (error) {
      console.error("Vexa YouTube request failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

function instagramBusinessLoginCallback(request) {
  const url = new URL(request.url);
  const error = String(url.searchParams.get("error") || "").trim();
  const errorDescription = String(url.searchParams.get("error_description") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();

  if (error) {
    return htmlPage(
      "Instagram connection cancelled",
      errorDescription || "Instagram did not complete authorization.",
      400,
    );
  }

  if (code) {
    return htmlPage(
      "Instagram authorization received",
      "You can close this page and return to Vexa.",
      200,
    );
  }

  return htmlPage(
    "Vexa Instagram callback",
    "This callback URL is ready for Instagram Business Login.",
    200,
  );
}

function htmlPage(title, message, status) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(88vw,420px);padding:28px;text-align:center}.title{font-size:22px;font-weight:700;letter-spacing:-.02em}.message{margin-top:10px;font-size:15px;line-height:1.55;color:#555}</style></head><body><main class="card"><div class="title">${safeTitle}</div><div class="message">${safeMessage}</div></main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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