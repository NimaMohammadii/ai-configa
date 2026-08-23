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
  appendVexaCustomPlayerRuntime,
  handleVexaCustomPlayerRequest,
  isVexaCustomPlayerRequest,
} from "./mini-app/vexa-live/youtube-custom-player.js";
import {
  VexaSubtitleContainer,
  appendVexaLiveSubtitlesRuntime,
  handleVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
} from "./mini-app/vexa-live/youtube-live-subtitles.js";
import {
  handleVexaLivePersistenceRequest,
  isVexaLivePersistenceRequest,
} from "./mini-app/vexa-live/youtube-live-persistence.js";
import { appendVexaLiveLandingRuntime } from "./mini-app/vexa-live/vexa-live-landing.js";

const VEXA_BALANCE_USD_PER_1000_CREDITS = 0.178;
const MINI_APP_BALANCE_SCRIPT_PATH = "/mini-app/app.js";
const MINI_APP_BALANCE_HTML_PATHS = new Set(["/mini-app", "/mini-app/"]);

export { AiCodingWorkflow } from "./worker-live-events.js";
export { VexaMediaContainerV3, VexaSubtitleContainer, VexaDownloadProgressHub };

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      const voiceTransformResponse = await handleMiniAppVoiceTransformRequest(request, env);
      if (voiceTransformResponse) return voiceTransformResponse;

      if (isVexaLivePersistenceRequest(request)) {
        return handleVexaLivePersistenceRequest(request);
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
      response = await appendMiniAppVoiceTransformRuntime(request, response);
      response = await appendVexaLiveLandingRuntime(request, response);
      response = await appendVexaCustomPlayerRuntime(request, response);
      response = await appendVexaLiveSubtitlesRuntime(request, response);
      response = await applyMiniAppUsdBalanceUi(request, response);
      return response;
    } catch (error) {
      console.error("Vexa YouTube request failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

async function applyMiniAppUsdBalanceUi(request, response) {
  if (!response?.ok || request.method !== "GET") return response;

  const path = new URL(request.url).pathname;
  const isScript = path === MINI_APP_BALANCE_SCRIPT_PATH;
  const isHtml = MINI_APP_BALANCE_HTML_PATHS.has(path);
  if (!isScript && !isHtml) return response;

  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();

  if (isScript) {
    if (!contentType.includes("javascript")) return response;

    let source = await response.text();
    const balanceFunction =
      "  function updateCreditsBalanceUi(value){availableCredits=Math.max(0,Number(value)||0);var label=availableCredits.toLocaleString('en-US');setText('balance',label);setText('creditsPageBalance',label)}";

    if (!source.includes(balanceFunction)) {
      console.error("Mini App USD balance target missing", "balance formatter");
      return cloneTextResponse(response, source);
    }

    const usdBalanceFunction =
      `  function formatUsdBalanceFromCredits(value){var usd=Math.max(0,Number(value)||0)*${VEXA_BALANCE_USD_PER_1000_CREDITS}/1000;return '$'+usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}\n` +
      "  function updateCreditsBalanceUi(value){availableCredits=Math.max(0,Number(value)||0);var label=formatUsdBalanceFromCredits(availableCredits);setText('balance',label);setText('creditsPageBalance',label)}";

    source = source.replace(balanceFunction, usdBalanceFunction);

    const directBalanceWrite = "setText('balance',availableCredits.toLocaleString('en-US'))";
    const directBalanceWrites = source.split(directBalanceWrite).length - 1;
    source = source.split(directBalanceWrite).join("updateCreditsBalanceUi(availableCredits)");

    if (directBalanceWrites === 0) {
      console.error("Mini App USD balance target missing", "direct balance updates");
    }

    return cloneTextResponse(response, source);
  }

  if (!contentType.includes("text/html")) return response;

  let source = await response.text();
  const balanceSuffix = '<strong id="creditsPageBalance">—</strong><span>credits</span>';
  if (!source.includes(balanceSuffix)) {
    console.error("Mini App USD balance target missing", "balance unit label");
    return cloneTextResponse(response, source);
  }

  source = source.replace(
    balanceSuffix,
    '<strong id="creditsPageBalance">—</strong><span>USD</span>',
  );
  return cloneTextResponse(response, source);
}

function cloneTextResponse(response, text) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  return new Response(text, {
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
