import worker from "./worker-direct.js";
import {
  handleVexaYoutubeRequest,
  injectVexaYoutubeClient,
  isVexaYoutubeRequest,
} from "./mini-app/vexa-live/youtube-router.js";

export { VexaMediaContainer } from "./mini-app/vexa-live/media-container.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    if (isVexaYoutubeRequest(request)) {
      return handleVexaYoutubeRequest(request, env);
    }

    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app/live" || url.pathname === "/mini-app/live/")
    ) {
      return injectVexaYoutubeClient(await worker.fetch(request, env, ctx));
    }

    return worker.fetch(request, env, ctx);
  },
};
