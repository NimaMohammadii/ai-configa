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
  VexaDownloadProgressHub as VexaDownloadProgressHubBase,
  handleTrackedYouTubeDownloadRequest,
  isTrackedYouTubeDownloadRequest,
} from "./mini-app/vexa-live/youtube-download-progress.js";
import {
  VexaInstagramContainer,
  VexaInstagramProgressHub as VexaInstagramProgressHubBase,
  handleInstagramDownloadRequest,
  isInstagramDownloadRequest,
} from "./mini-app/vexa-live/instagram-download.js";
import {
  VexaInstagramStoryContainer,
  VexaInstagramStoryProgressHub as VexaInstagramStoryProgressHubBase,
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
const DOWNLOAD_SUBTITLE_RENDERER_INSTANCES = 400;
const DOWNLOAD_CANCELABLE_PATHS = new Set([
  "/mini-app/live/api/youtube-download",
  "/mini-app/live/api/instagram/download",
  "/mini-app/live/api/instagram-story/download",
]);
const DOWNLOAD_CANCELABLE_PARAM = "vexaCancelable";
const DOWNLOAD_CANCEL_REQUEST_PARAM = "vexaCancel";
const DOWNLOAD_CANCEL_SIGNAL_PATH = "/download-cancel";
const DOWNLOAD_CANCEL_WAIT_PATH = "/download-cancel-wait";
const DOWNLOAD_CANCEL_FINISH_PATH = "/download-cancel-finish";
const DOWNLOAD_CANCEL_STORAGE_KEY = "vexa_download_cancelled";

function withDownloadCancelHub(Base) {
  return class extends Base {
    cancelWaiters = new Set();

    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === DOWNLOAD_CANCEL_SIGNAL_PATH) {
        await this.ctx.storage.put(DOWNLOAD_CANCEL_STORAGE_KEY, true);
        this.resolveCancelWaiters(true);
        return new Response(null, { status: 204 });
      }
      if (request.method === "GET" && url.pathname === DOWNLOAD_CANCEL_WAIT_PATH) {
        const cancelled = await this.ctx.storage.get(DOWNLOAD_CANCEL_STORAGE_KEY);
        if (cancelled) return new Response(null, { status: 200 });
        return new Promise((resolve) => {
          this.cancelWaiters.add(resolve);
        });
      }
      if (request.method === "POST" && url.pathname === DOWNLOAD_CANCEL_FINISH_PATH) {
        await this.ctx.storage.delete(DOWNLOAD_CANCEL_STORAGE_KEY).catch(() => null);
        this.resolveCancelWaiters(false);
        return new Response(null, { status: 204 });
      }
      return super.fetch(request);
    }

    resolveCancelWaiters(cancelled) {
      const status = cancelled ? 200 : 204;
      for (const resolve of this.cancelWaiters) {
        try { resolve(new Response(null, { status })); } catch (error) {}
      }
      this.cancelWaiters.clear();
    }
  };
}

class VexaDownloadProgressHub extends withDownloadCancelHub(VexaDownloadProgressHubBase) {}
class VexaInstagramProgressHub extends withDownloadCancelHub(VexaInstagramProgressHubBase) {}
class VexaInstagramStoryProgressHub extends withDownloadCancelHub(VexaInstagramStoryProgressHubBase) {}

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
      if (isDownloadCancelControlRequest(request)) {
        return handleDownloadCancelControl(request, env, ctx);
      }
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
        const response = await handleVexaDownloadControllerRequest(request, env, ctx);
        return wrapCancelableDownloadResponse(request, response, env);
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
        const response = await handleInstagramStoryDownloadRequest(request, env, ctx);
        return wrapCancelableDownloadResponse(request, response, env);
      }
      if (isInstagramDownloadRequest(request)) {
        const response = await handleInstagramDownloadRequest(request, env, ctx);
        return wrapCancelableDownloadResponse(request, response, env);
      }
      if (isTrackedYouTubeDownloadRequest(request)) {
        const response = await handleTrackedYouTubeDownloadRequest(request, env, ctx);
        return wrapCancelableDownloadResponse(request, response, env);
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

function isDownloadCancelControlRequest(request) {
  const url = new URL(request.url);
  return request.method === "POST" &&
    DOWNLOAD_CANCELABLE_PATHS.has(url.pathname) &&
    url.searchParams.get(DOWNLOAD_CANCELABLE_PARAM) === "1" &&
    url.searchParams.get(DOWNLOAD_CANCEL_REQUEST_PARAM) === "1";
}

async function handleDownloadCancelControl(request, env, ctx) {
  const url = new URL(request.url);
  const session = cleanDownloadSession(url.searchParams.get("session"));
  const context = downloadCancelContext(url.pathname, env);
  if (!session || !context?.binding) return json({ error: "Download session is invalid" }, 400);

  const validationUrl = new URL(url.href);
  validationUrl.searchParams.delete(DOWNLOAD_CANCELABLE_PARAM);
  validationUrl.searchParams.delete(DOWNLOAD_CANCEL_REQUEST_PARAM);
  const validationRequest = new Request(validationUrl.href, { method: "HEAD", headers: request.headers });
  let validationResponse;
  if (url.pathname === "/mini-app/live/api/instagram-story/download") {
    validationResponse = await handleInstagramStoryDownloadRequest(validationRequest, env, ctx);
  } else if (url.pathname === "/mini-app/live/api/instagram/download") {
    validationResponse = await handleInstagramDownloadRequest(validationRequest, env, ctx);
  } else {
    validationResponse = await handleVexaDownloadControllerRequest(validationRequest, env, ctx);
  }
  if (!validationResponse?.ok) {
    const detail = await validationResponse?.text?.().catch(() => "");
    return json({ error: detail || "Download session is unavailable" }, validationResponse?.status || 410);
  }

  const id = context.binding.idFromName(session);
  const stub = context.binding.get(id);
  const response = await stub.fetch(new Request("https://" + context.host + DOWNLOAD_CANCEL_SIGNAL_PATH, {
    method: "POST",
  }));
  if (!response.ok) return json({ error: "Could not cancel download" }, 502);
  return json({ ok: true });
}

async function wrapCancelableDownloadResponse(request, response, env) {
  if (!response?.ok || !response.body || request.method !== "GET") return response;
  const url = new URL(request.url);
  if (
    !DOWNLOAD_CANCELABLE_PATHS.has(url.pathname) ||
    url.searchParams.get(DOWNLOAD_CANCELABLE_PARAM) !== "1"
  ) return response;
  const session = cleanDownloadSession(url.searchParams.get("session"));
  const context = downloadCancelContext(url.pathname, env);
  if (!session || !context?.binding) return response;

  const id = context.binding.idFromName(session);
  const stub = context.binding.get(id);
  const reader = response.body.getReader();
  let finished = false;
  const cancelSignal = stub.fetch(new Request("https://" + context.host + DOWNLOAD_CANCEL_WAIT_PATH))
    .then((result) => result.status === 200 ? true : new Promise(() => {}))
    .catch(() => new Promise(() => {}));

  const finishCancelWatch = async () => {
    await stub.fetch(new Request("https://" + context.host + DOWNLOAD_CANCEL_FINISH_PATH, {
      method: "POST",
    })).catch(() => null);
  };

  const body = new ReadableStream({
    async pull(controller) {
      if (finished) return;
      try {
        const outcome = await Promise.race([
          reader.read().then((value) => ({ type: "read", value })),
          cancelSignal.then(() => ({ type: "cancel" })),
        ]);
        if (outcome.type === "cancel") {
          finished = true;
          try { await reader.cancel("user_cancelled"); } catch (error) {}
          await finishCancelWatch();
          controller.error(new Error("Download cancelled"));
          return;
        }
        const next = outcome.value;
        if (next.done) {
          finished = true;
          await finishCancelWatch();
          controller.close();
          return;
        }
        if (next.value?.byteLength) controller.enqueue(next.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          await finishCancelWatch();
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (finished) return;
      finished = true;
      try { await reader.cancel(reason); } catch (error) {}
      await finishCancelWatch();
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

function downloadCancelContext(path, env) {
  if (path === "/mini-app/live/api/instagram-story/download") {
    return { binding: env.VEXA_INSTAGRAM_STORY_PROGRESS, host: "vexa-instagram-story-progress" };
  }
  if (path === "/mini-app/live/api/instagram/download") {
    return { binding: env.VEXA_INSTAGRAM_PROGRESS, host: "vexa-instagram-progress" };
  }
  if (path === "/mini-app/live/api/youtube-download") {
    return { binding: env.VEXA_DOWNLOAD_PROGRESS, host: "vexa-download-progress" };
  }
  return null;
}

function cleanDownloadSession(value) {
  const session = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/u.test(session) ? session : "";
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
