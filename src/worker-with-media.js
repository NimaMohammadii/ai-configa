import worker from "./worker-direct.js";
import {
  handleAiBackgroundTaskRequest,
  isAiBackgroundTaskRequest,
} from "./ai-background-workflow.js";
import { AiCodingWorkflowV2 as AiCodingWorkflow } from "./ai-background-workflow-v2.js";
import {
  handleGitHubAiApprovalRequest,
  isGitHubAiApprovalRequest,
} from "./github-ai-approval.js";
import {
  handleAiBackgroundTasksClientRequest,
  injectAiBackgroundTasksClient,
  isAiBackgroundTasksClientRequest,
} from "./mini-app/ai-background-tasks-client.js";
import {
  handleAiGitHubApprovalClientRequest,
  injectAiGitHubApprovalClient,
  isAiGitHubApprovalClientRequest,
} from "./mini-app/ai-github-approval-client.js";
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

    if (isGitHubAiApprovalRequest(request)) {
      return handleGitHubAiApprovalRequest(request, env);
    }

    if (isAiBackgroundTasksClientRequest(request)) {
      return handleAiBackgroundTasksClientRequest();
    }

    if (isAiGitHubApprovalClientRequest(request)) {
      return handleAiGitHubApprovalClientRequest();
    }

    if (isVexaYoutubeRequest(request)) {
      return handleVexaYoutubeRequest(request, env);
    }

    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app/chat" || url.pathname === "/mini-app/chat/")
    ) {
      let response = await worker.fetch(request, env, ctx);
      response = await injectAiBackgroundTasksClient(response);
      return injectAiGitHubApprovalClient(response);
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
