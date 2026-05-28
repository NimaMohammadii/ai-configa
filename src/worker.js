import { handleCallback, handleMessage } from "./bot.js";

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

    if (update.message) {
      ctx.waitUntil(handleMessage(update.message, env));
    }

    if (update.callback_query) {
      ctx.waitUntil(handleCallback(update.callback_query, env));
    }

    return new Response("OK");
  },
};
