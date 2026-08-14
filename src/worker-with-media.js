import worker from "./worker-direct.js";
import {
  AiCodingWorkflow,
  handleAiBackgroundTaskRequest,
  isAiBackgroundTaskRequest,
} from "./ai-background-workflow.js";
import {
  handleAiBackgroundTasksClientRequest,
  injectAiBackgroundTasksClient,
  isAiBackgroundTasksClientRequest,
} from "./mini-app/ai-background-tasks-client.js";
import {
  handleVexaYoutubeRequest,
  injectVexaYoutubeClient,
  isVexaYoutubeRequest,
} from "./mini-app/vexa-live/youtube-router.js";

export { AiCodingWorkflow };
export { VexaMediaContainer } from "./mini-app/vexa-live/media-container.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    if (isAiBackgroundTaskRequest(request)) {
      return handleAiBackgroundTaskRequest(request, env);
    }

    if (isAiBackgroundTasksClientRequest(request)) {
      return handleAiBackgroundTasksClientRequest();
    }

    if (isVexaYoutubeRequest(request)) {
      return handleVexaYoutubeRequest(request, env);
    }

    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app/chat" || url.pathname === "/mini-app/chat/")
    ) {
      return injectAiBackgroundTasksClient(await worker.fetch(request, env, ctx));
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app/live" || url.pathname === "/mini-app/live/")
    ) {
      return injectVexaYoutubeClient(await worker.fetch(request, env, ctx));
    }

    return worker.fetch(request, env, ctx);
  },
};
