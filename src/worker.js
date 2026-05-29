import { handleCallback, handleMessage } from "./bot.js";
import { handleDemoCallback, isDemoCallback } from "./demo-flow.js";
import { handlePreCheckout, handleStarsCallback, handleStarsPayment, isStarsCallback } from "./stars-flow.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("ai-configa worker is running");
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const update = await request.json().catch(() => null);
    if (!update) return new Response("Bad Request", { status: 400 });

    if (update.pre_checkout_query) {
      ctx.waitUntil(handlePreCheckout(update.pre_checkout_query, env).catch(logError));
    }

    if (update.message) {
      if (update.message.successful_payment) {
        ctx.waitUntil(handleStarsPayment(update.message, env).catch(logError));
      } else {
        ctx.waitUntil(handleMessage(update.message, env).catch(logError));
      }
    }

    if (update.callback_query) {
      if (isDemoCallback(update.callback_query.data)) {
        ctx.waitUntil(handleDemoCallback(update.callback_query, env).catch(logError));
      } else if (isStarsCallback(update.callback_query.data)) {
        ctx.waitUntil(handleStarsCallback(update.callback_query, env).catch(logError));
      } else {
        ctx.waitUntil(handleCallback(update.callback_query, env).catch(logError));
      }
    }

    return new Response("OK");
  },
};

function logError(error) {
  console.error(error && error.stack ? error.stack : error);
}
