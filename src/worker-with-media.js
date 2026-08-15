import worker from "./worker-direct.js";
import {
  handleAiBackgroundTaskRequest,
  isAiBackgroundTaskRequest,
} from "./ai-background-workflow.js";
import { AiCodingWorkflowV2 as AiCodingWorkflow } from "./ai-background-workflow-v2.js";
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
import { VEXA_LIVE_EDITOR_JS } from "./mini-app/vexa-live/editor-client.js";

const VEXA_EDITOR_VERSION = "20260815-1";

export { AiCodingWorkflow };
export { VexaMediaContainer } from "./mini-app/vexa-live/media-container.js";

function vexaEditorResponse() {
  return new Response(VEXA_LIVE_EDITOR_JS, {
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

async function injectVexaEditorClient(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const script =
    '<script type="module" src="/mini-app/live/editor.js?v=' +
    VEXA_EDITOR_VERSION +
    '"></script>';
  const html = source.includes("</body>")
    ? source.replace("</body>", script + "\n</body>")
    : source + script;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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

    if (request.method === "GET" && url.pathname === "/mini-app/live/editor.js") {
      return vexaEditorResponse();
    }

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
      const withYoutube = await injectVexaYoutubeClient(await worker.fetch(request, env, ctx));
      return injectVexaEditorClient(withYoutube);
    }

    return worker.fetch(request, env, ctx);
  },
};
