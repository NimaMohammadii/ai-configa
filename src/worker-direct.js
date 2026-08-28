import { getAdminAction, isAdmin } from "./admin.js";
import { handleCallback, handleMessage } from "./mini-app/vexa-live/bot-bridge.js";
import { extractYouTubeUrl } from "./mini-app/vexa-live/youtube-download-exec.js";
import {
  handleInstagramCallback,
  handleInstagramLinkMessage,
} from "./mini-app/vexa-live/instagram-bot-bridge.js";
import {
  handleMiniAppWithSpeechToText,
  handleSpeechToTextRequest,
  isSpeechToTextRequest,
} from "./mini-app/speech-to-text/router.js";
import {
  handleMiniAppWithVexaSections,
  handleVexaLiveRequest,
  isVexaLiveRequest,
} from "./mini-app/vexa-live/router.js";
import { handleChatGptAppRequest, isChatGptAppRequest } from "./chatgpt-app/router.js";
import { isMiniAppRequest } from "./mini-app/server.js";
import { handleGitHubRequest, isGitHubRequest } from "./github-app.js";
import { handleDemoCallback, isDemoCallback } from "./demo-flow.js";
import { processPendingImageJobs } from "./image-jobs.js";
import { processPendingBroadcastJobs } from "./broadcast-jobs.js";
import { shouldProcessMessageOnce } from "./message-dedupe.js";
import { ensurePinnedFromState } from "./pinned-message.js";
import { handleReceiptCallback, handleReceiptPhoto, isReceiptCallback } from "./receipt-approval.js";
import { handlePreCheckout, handleStarsCallback, handleStarsPayment, handleStarsTextInput, isStarsCallback } from "./stars-flow.js";
import { handleSupportMessage } from "./support-flow-strict.js";
import { handleVoiceTransformMessage } from "./voice-transform.js";
import { handleExploreMediaRequest, isExploreMediaRequest } from "./explore-media.js";

const MEDIA_INSPECT_WORKFLOW_KIND = "media_inspect";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processScheduledJobs(env).catch(logError));
  },

  async fetch(request, env, ctx) {
    if (isChatGptAppRequest(request)) {
      return handleChatGptAppRequest(request, env);
    }

    if (isGitHubRequest(request)) {
      return handleGitHubRequest(request, env);
    }

    if (isExploreMediaRequest(request)) {
      return handleExploreMediaRequest(request, env);
    }

    if (isVexaLiveRequest(request)) {
      return handleVexaLiveRequest(request, env);
    }

    if (isSpeechToTextRequest(request)) {
      return handleSpeechToTextRequest(request, env);
    }

    if (isMiniAppRequest(request)) {
      return handleMiniAppWithVexaSections(
        request,
        env,
        handleMiniAppWithSpeechToText,
      );
    }

    if (request.method === "GET") return new Response("ai-configa worker is running");
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const update = await request.json().catch(() => null);
    if (!update) return new Response("Bad Request", { status: 400 });

    if (update.pre_checkout_query) {
      ctx.waitUntil(handlePreCheckout(update.pre_checkout_query, env).catch(logError));
    }

    if (update.message) {
      if (update.message.successful_payment) {
        ctx.waitUntil(handleStarsPayment(update.message, env).catch(logError));
      } else {
        const firstTime = await shouldProcessMessageOnce(env, update.message).catch((error) => {
          logError(error);
          return true;
        });
        if (firstTime) {
          const handledStarsInput = await handleStarsTextInput(update.message, env).catch((error) => {
            logError(error);
            return false;
          });
          if (!handledStarsInput) {
            await handleMessageWithSupport(update.message, env).catch(logError);
          }
        }
      }
    }

    if (update.callback_query) {
      if (isReceiptCallback(update.callback_query.data)) {
        ctx.waitUntil(handleReceiptCallback(update.callback_query, env).catch(logError));
      } else if (isDemoCallback(update.callback_query.data)) {
        ctx.waitUntil(handleDemoCallback(update.callback_query, env).catch(logError));
      } else if (isStarsCallback(update.callback_query.data)) {
        ctx.waitUntil(handleStarsCallback(update.callback_query, env).catch(logError));
      } else {
        ctx.waitUntil(handleCallbackAndPin(update.callback_query, env).catch(logError));
      }
    }

    return new Response("OK");
  },
};

async function processScheduledJobs(env) {
  await processPendingBroadcastJobs(env);
  await processPendingImageJobs(env);
}

async function handleMessageWithSupport(message, env) {
  if (message.text?.trim() === "/support" && await isAdmin(env, message.from?.id)) {
    await handleMessageAndPin(message, env);
    return;
  }

  if (await handleSupportMessage(message, env)) return;

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    if (await isAdminPendingPhoto(message, env)) {
      await handleMessageAndPin(message, env);
      return;
    }

    if (isImageEditMessage(message)) {
      await handleMessageAndPin(message, env);
      return;
    }

    await handleReceiptPhoto(message, env);
    return;
  }

  if (await handleVoiceTransformMessage(message, env)) return;
  if (await handleInstagramLinkMessage(message, env)) return;
  if (await enqueueMediaLinkInspection(message, env)) return;

  await handleMessageAndPin(message, env);
}

async function enqueueMediaLinkInspection(message, env) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const messageId = Number(message?.message_id || 0);
  const sourceUrl = extractYouTubeUrl(message?.text || "");
  if (
    !env.AI_CODING_WORKFLOW ||
    !userId ||
    !chatId ||
    message?.chat?.type !== "private" ||
    !Number.isSafeInteger(messageId) ||
    messageId <= 0 ||
    !sourceUrl
  ) {
    return false;
  }

  const workflowId = "media-inspect-" + String(chatId).replace(/[^0-9-]/g, "") + "-" + messageId;
  try {
    await env.AI_CODING_WORKFLOW.create({
      id: workflowId,
      params: {
        kind: MEDIA_INSPECT_WORKFLOW_KIND,
        message,
      },
      retention: { successRetention: "1 day", errorRetention: "1 day" },
    });
    return true;
  } catch (error) {
    console.error("bot media inspect workflow enqueue failed", error?.stack || error);
    return false;
  }
}

async function isAdminPendingPhoto(message, env) {
  const adminId = message.from && message.from.id;
  if (!adminId || !(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  return isAdminPhotoAction(action);
}

function isAdminPhotoAction(action) {
  return ["voice_profile", "mini_app_icon", "channel_post", "image_explore_image", "image_explore_prompt", "image_explore_tags", "message", "broadcast"].includes(action?.action);
}

async function handleMessageAndPin(message, env) {
  await handleMessage(message, env);

  const text = message.text ? message.text.trim() : "";
  if (!/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) return;

  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  await ensurePinnedFromState(env, chatId, userId).catch(logError);
}

async function handleCallbackAndPin(query, env) {
  if (await handleInstagramCallback(query, env)) return;

  await handleCallback(query, env);

  const data = query.data || "";
  if (!data.startsWith("lang:")) return;

  const chatId = query.message && query.message.chat && query.message.chat.id;
  const userId = query.from && query.from.id;
  await ensurePinnedFromState(env, chatId, userId).catch(logError);
}

function isImageEditMessage(message) {
  const caption = String(message?.caption || "").trim();
  return /^\/image(?:@\w+)?(?:\s|$)/i.test(caption);
}

function logError(error) {
  console.error(error);
}
