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
import { VEXA_LIVE_EDITOR_JS } from "./mini-app/vexa-live/editor-client.js";

const VEXA_EDITOR_VERSION = "20260815-4";
const AI_CHAT_HEARTBEAT_MS = 10_000;
const AI_CHAT_PATH = "/mini-app/api/chat";

export { AiCodingWorkflow };

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
  const disabledContainerUi =
    '<style id="vexaContainerDisabled">' +
    '#liveSourceSwitch,#youtubeInputState,#youtubeReadyState{display:none!important}' +
    'html body.vexa-live-editing #videoReadyState.show{justify-content:flex-end!important;align-items:stretch!important}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage{' +
      'position:relative!important;flex:0 0 auto!important;' +
      'width:min(100vw,calc((var(--tg-viewport-height,100dvh) - 258px - env(safe-area-inset-bottom))/2))!important;' +
      'height:auto!important;aspect-ratio:1/2!important;max-width:100vw!important;' +
      'max-height:calc(var(--tg-viewport-height,100dvh) - 258px - env(safe-area-inset-bottom))!important;' +
      'margin:0 auto!important;border-radius:0!important;overflow:hidden!important;background:#050505!important;' +
      'box-shadow:0 -1px 0 rgba(255,255,255,.04),0 1px 0 rgba(255,255,255,.04)!important' +
    '}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage>video{' +
      'display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;' +
      'object-fit:contain!important;object-position:center center!important;background:#050505!important' +
    '}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage.vexa-fill>video{object-fit:contain!important}' +
    'html body.vexa-live-editing .vexa-editor-panel{flex:0 0 258px!important;height:258px!important;margin:0!important}' +
    'html body.vexa-live-editing .vexa-fit-button{display:none!important}' +
    '@media (max-height:700px){' +
      'html body.vexa-live-editing #videoReadyState.show>.video-stage{' +
        'width:min(100vw,calc((var(--tg-viewport-height,100dvh) - 220px - env(safe-area-inset-bottom))/2))!important;' +
        'max-height:calc(var(--tg-viewport-height,100dvh) - 220px - env(safe-area-inset-bottom))!important' +
      '}' +
      'html body.vexa-live-editing .vexa-editor-panel{flex-basis:220px!important;height:220px!important}' +
      'html body.vexa-live-editing .vexa-caption-timeline{height:72px!important}' +
      'html body.vexa-live-editing .vexa-caption-input,html body.vexa-live-editing .vexa-reset-position{height:48px!important}' +
    '}' +
    '</style>';
  const script =
    '<script type="module" src="/mini-app/live/editor.js?v=' +
    VEXA_EDITOR_VERSION +
    '"></script>';
  const injection = disabledContainerUi + script;
  const html = source.includes("</body>")
    ? source.replace("</body>", injection + "\n</body>")
    : source + injection;

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

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === AI_CHAT_PATH) {
      const response = await worker.fetch(request, env, ctx);
      return hardenAiChatResponse(response);
    }

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
      return injectVexaEditorClient(await worker.fetch(request, env, ctx));
    }

    return worker.fetch(request, env, ctx);
  },
};

async function hardenAiChatResponse(response) {
  if (!response.ok) {
    let message = "Could not reach AI · Try again";
    try {
      const body = await response.json();
      message = cleanAiChatError(body?.error || body?.message || message);
    } catch {
      message = cleanAiChatError(message);
    }
    return aiChatResultResponse(message, response.headers);
  }

  if (!response.body) {
    return aiChatResultResponse("Connection interrupted · Try again", response.headers);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let closed = false;
  let heartbeatTimer = null;

  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        try {
          controller.close();
        } catch {
          // The client may already have disconnected.
        }
      };

      const enqueueEvent = (event) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          return true;
        } catch {
          return false;
        }
      };

      const finishWithResult = (event) => {
        enqueueEvent(event);
        close();
        reader.cancel("ai_chat_result_delivered").catch(() => {});
      };

      const handleLine = (rawLine) => {
        const line = String(rawLine || "").trim();
        if (!line || closed) return;

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event?.type === "error") {
          finishWithResult({
            type: "result",
            data: {
              type: "text",
              message: cleanAiChatError(event.error),
            },
          });
          return;
        }

        if (event?.type === "result") {
          finishWithResult(event);
          return;
        }

        enqueueEvent(event);
      };

      heartbeatTimer = setInterval(() => {
        enqueueEvent({ type: "heartbeat", at: Date.now() });
      }, AI_CHAT_HEARTBEAT_MS);

      (async () => {
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0 && !closed) {
              handleLine(buffer.slice(0, newlineIndex));
              buffer = buffer.slice(newlineIndex + 1);
              newlineIndex = buffer.indexOf("\n");
            }

            if (done) break;
          }

          if (!closed && buffer.trim()) handleLine(buffer);
          if (!closed) {
            finishWithResult({
              type: "result",
              data: {
                type: "text",
                message: "Connection interrupted · Try again",
              },
            });
          }
        } catch (error) {
          if (!closed) {
            finishWithResult({
              type: "result",
              data: {
                type: "text",
                message: cleanAiChatError(error?.message || "Connection interrupted · Try again"),
              },
            });
          }
        }
      })();
    },
    cancel(reason) {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      return reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, {
    status: 200,
    headers: aiChatStreamHeaders(response.headers),
  });
}

function aiChatResultResponse(message, sourceHeaders) {
  const body = JSON.stringify({
    type: "result",
    data: {
      type: "text",
      message: cleanAiChatError(message),
    },
  }) + "\n";

  return new Response(body, {
    status: 200,
    headers: aiChatStreamHeaders(sourceHeaders),
  });
}

function aiChatStreamHeaders(sourceHeaders) {
  const headers = new Headers(sourceHeaders || undefined);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("Transfer-Encoding");
  headers.set("Content-Type", "application/x-ndjson;charset=utf-8");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function cleanAiChatError(value) {
  const message = String(value || "").replace(/\s+/g, " ").trim();
  if (!message) return "Something went wrong · Try again";
  if (message === "AI request cancelled.") return "AI request cancelled.";
  return Array.from(message).slice(0, 700).join("");
}
