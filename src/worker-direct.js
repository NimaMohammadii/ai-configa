import { getAdminAction, isAdmin } from "./admin.js";
import { handleCallback } from "./bot.js";
import { handleMessage } from "./bot-secure.js";
import { handleMiniAppRequest, isMiniAppRequest } from "./mini-app/server.js";
import { handleDemoCallback, isDemoCallback } from "./demo-flow.js";
import { shouldProcessMessageOnce } from "./message-dedupe.js";
import { ensurePinnedFromState } from "./pinned-message.js";
import { handleReceiptCallback, handleReceiptPhoto, isReceiptCallback } from "./receipt-approval.js";
import { handlePreCheckout, handleStarsCallback, handleStarsPayment, handleStarsTextInput, isStarsCallback } from "./stars-flow.js";
import { handleSupportMessage } from "./support-flow-strict.js";

export default {
  async scheduled(event, env, ctx) {
    // Daily reward reminder notifications are intentionally disabled.
  },

  async fetch(request, env, ctx) {
    if (isMiniAppRequest(request)) {
      return handleMiniAppRequest(request, env);
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

async function handleMessageWithSupport(message, env) {
  if (await handleSupportMessage(message, env)) return;

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    if (await isAdminVoiceProfilePhoto(message, env)) {
      await handleMessageAndPin(message, env);
      return;
    }

    await handleReceiptPhoto(message, env);
    return;
  }

  await handleMessageAndPin(message, env);
}

async function isAdminVoiceProfilePhoto(message, env) {
  const adminId = message.from && message.from.id;
  if (!adminId || !(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  return action?.action === "voice_profile";
}

async function handleMessageAndPin(message, env) {
  await handleMessage(message, env);

  const text = message.text ? message.text.trim() : "";
  if (text !== "/start") return;

  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  await ensurePinnedFromState(env, chatId, userId).catch(logError);
}

async function handleCallbackAndPin(query, env) {
  await handleCallback(query, env);

  const data = query.data || "";
  if (!data.startsWith("lang:")) return;

  const chatId = query.message && query.message.chat && query.message.chat.id;
  const userId = query.from && query.from.id;
  await ensurePinnedFromState(env, chatId, userId).catch(logError);
}

function logError(error) {
  console.error(error && error.stack ? error.stack : error);
}
