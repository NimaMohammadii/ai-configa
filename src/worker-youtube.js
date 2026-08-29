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
const VEXA_LEGAL_PATHS = new Set(["/privacy", "/data-deletion", "/terms"]);
const DOWNLOAD_SUBTITLE_RENDERER_INSTANCES = 3;
const VEXA_MEDIA_POOL_INSTANCES = 3;

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
    const mediaEnv = withVexaMediaPool(env);
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && VEXA_LEGAL_PATHS.has(path)) {
        return vexaLegalPage(path);
      }
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
        return handleTrackedYouTubeDownloadRequest(request, mediaEnv, ctx);
      }
      if (isYouTubePlaybackRequest(request)) {
        return await handleYouTubePlaybackRequest(request, mediaEnv, ctx);
      }
      if (isYouTubeDownloadRequest(request)) {
        return await handleYouTubeDownloadRequest(request, mediaEnv, ctx);
      }

      let response = await worker.fetch(request, mediaEnv, ctx);
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

function withVexaMediaPool(env) {
  const binding = env?.VEXA_MEDIA;
  if (!binding) return env;

  const pooledBinding = new Proxy(binding, {
    get(target, property) {
      if (property === "idFromName") {
        return (name) => {
          const slot = vexaMediaPoolSlot(name);
          return target.idFromName("instance-" + slot);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(env, {
    get(target, property) {
      if (property === "VEXA_MEDIA") return pooledBinding;
      return Reflect.get(target, property, target);
    },
  });
}

function vexaMediaPoolSlot(name) {
  const value = String(name || "cf-singleton-container");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % VEXA_MEDIA_POOL_INSTANCES;
}

function vexaLegalPage(path) {
  const pages = {
    "/privacy": {
      title: "Vexa Privacy Policy",
      updated: "29 August 2026",
      content: `
        <p>Vexa provides AI tools, media utilities, and related digital services.</p>
        <h2>Information we handle</h2>
        <p>We process only information needed to provide the service, such as account identifiers, requests you submit, service preferences, payment or balance records, and technical information required for security and reliability.</p>
        <h2>How we use information</h2>
        <p>We use information to deliver requested features, protect the service from abuse, provide support, maintain account balances, and comply with applicable legal obligations.</p>
        <h2>Sharing and retention</h2>
        <p>We do not sell personal information. We may use trusted service providers only where needed to operate Vexa. Information is retained only for as long as necessary for the service, security, accounting, or legal requirements.</p>
        <h2>Your choices</h2>
        <p>You may request access to or deletion of your personal data as described on our <a href="/data-deletion">Data Deletion</a> page.</p>
        <h2>Contact</h2>
        <p>For privacy questions, contact Vexa through the service.</p>`,
    },
    "/data-deletion": {
      title: "Vexa Data Deletion",
      updated: "29 August 2026",
      content: `
        <p>You may request deletion of personal data associated with your use of Vexa.</p>
        <h2>How to request deletion</h2>
        <p>Submit a data deletion request through Vexa and include the account identifier or username used with the service so we can locate the correct record.</p>
        <h2>What happens next</h2>
        <p>We will verify the request, delete data that is no longer required, and confirm completion. We may retain limited records where required for security, fraud prevention, accounting, or legal obligations.</p>`,
    },
    "/terms": {
      title: "Vexa Terms of Service",
      updated: "29 August 2026",
      content: `
        <p>By using Vexa, you agree to use the service lawfully and responsibly.</p>
        <h2>Acceptable use</h2>
        <p>Do not use Vexa to violate rights, bypass access controls, distribute unlawful content, or infringe copyright. You are responsible for the content and links you submit.</p>
        <h2>Service availability</h2>
        <p>Features may change, be limited, or become unavailable. Vexa is provided on an as-available basis.</p>
        <h2>Accounts and payments</h2>
        <p>You are responsible for activity associated with your account. Paid balances and purchases are handled according to the service terms presented at the time of purchase.</p>
        <h2>Contact</h2>
        <p>For questions about these terms, contact Vexa through the service.</p>`,
    },
  };
  const page = pages[path] || pages["/privacy"];
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(page.title)}</title><style>body{margin:0;background:#fff;color:#141414;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{width:min(88vw,760px);margin:0 auto;padding:56px 0 72px}.brand{font-weight:800;letter-spacing:-.04em;font-size:18px}.title{margin:30px 0 8px;font-size:34px;letter-spacing:-.045em;line-height:1.1}.updated{margin:0 0 34px;color:#777;font-size:14px}p{font-size:16px;line-height:1.7;margin:0 0 20px}h2{font-size:18px;letter-spacing:-.02em;margin:32px 0 8px}a{color:#111;text-underline-offset:3px}@media(max-width:560px){.wrap{padding-top:36px}.title{font-size:28px}}</style></head><body><main class="wrap"><div class="brand">Vexa</div><h1 class="title">${escapeHtml(page.title)}</h1><p class="updated">Last updated: ${page.updated}</p>${page.content}</main></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

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
