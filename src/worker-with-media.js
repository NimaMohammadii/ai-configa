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

const VEXA_EDITOR_VERSION = "20260815-10";
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
  const editorLayout =
    '<style id="vexaContainerDisabled">' +
    '#liveSourceSwitch,#youtubeInputState,#youtubeReadyState{display:none!important}' +
    'html body.vexa-live-editing{overflow:hidden!important;background:#000!important}' +
    'html body.vexa-live-editing .live-app{' +
      'position:fixed!important;inset:0!important;width:100%!important;height:var(--tg-viewport-height,100dvh)!important;' +
      'max-width:none!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important' +
    '}' +
    'html body.vexa-live-editing .live-header,html body.vexa-live-editing .live-hero,' +
    'html body.vexa-live-editing #videoPickerState,html body.vexa-live-editing .live-footer{display:none!important}' +
    'html body.vexa-live-editing #videoReadyState.show{' +
      'display:flex!important;position:fixed!important;inset:0!important;z-index:120!important;' +
      'width:100%!important;height:var(--tg-viewport-height,100dvh)!important;min-height:0!important;' +
      'padding:calc(62px + env(safe-area-inset-top)) 14px 0!important;' +
      'flex-direction:column!important;justify-content:flex-start!important;align-items:center!important;' +
      'gap:12px!important;background:#000!important;overflow:hidden!important;animation:none!important' +
    '}' +
    'html body.vexa-live-editing #videoReadyState>.video-ready-head,' +
    'html body.vexa-live-editing #videoReadyState>.video-meta-row{display:none!important}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage{' +
      'position:relative!important;flex:0 0 auto!important;' +
      'height:min(54vh,540px)!important;width:auto!important;aspect-ratio:1/2!important;' +
      'max-width:78vw!important;max-height:54vh!important;align-self:center!important;' +
      'margin:0 auto!important;border-radius:24px!important;overflow:hidden!important;background:#060606!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 22px 70px rgba(0,0,0,.55)!important' +
    '}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage:before{' +
      'content:"";position:absolute;z-index:5;inset:0;border-radius:inherit;pointer-events:none;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 -1px 0 rgba(255,255,255,.035)' +
    '}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage>video{' +
      'display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;' +
      'object-fit:contain!important;object-position:center center!important;background:#060606!important;' +
      'pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:none!important;user-select:none!important' +
    '}' +
    'html body.vexa-live-editing #videoReadyState.show>.video-stage.vexa-fill>video{object-fit:contain!important}' +
    'html body.vexa-live-editing .vexa-editor-top{' +
      'position:fixed!important;z-index:145!important;top:env(safe-area-inset-top)!important;left:0!important;right:0!important;' +
      'height:58px!important;padding:7px 14px!important;background:linear-gradient(180deg,rgba(0,0,0,.92),rgba(0,0,0,.18),transparent)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-back{' +
      'width:40px!important;height:40px!important;border-radius:14px!important;background:rgba(255,255,255,.055)!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)!important;backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-title b{font-size:13px!important;font-weight:760!important}' +
    'html body.vexa-live-editing .vexa-editor-title small{font-size:8px!important;color:rgba(255,255,255,.4)!important}' +
    'html body.vexa-live-editing .vexa-editor-done{' +
      'height:38px!important;padding:0 15px!important;border-radius:13px!important;font-size:10px!important;font-weight:800!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-caption{' +
      'max-width:86%!important;padding:7px 10px!important;font-size:clamp(18px,4.8vw,28px)!important;' +
      'text-shadow:0 2px 4px #000,0 0 16px #000!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-panel{' +
      'position:relative!important;z-index:138!important;flex:1 1 auto!important;width:min(100%,620px)!important;height:auto!important;' +
      'min-height:0!important;margin:0 auto!important;padding:9px 10px calc(10px + env(safe-area-inset-bottom))!important;' +
      'border-radius:24px 24px 0 0!important;background:rgba(8,8,8,.985)!important;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 -18px 55px rgba(0,0,0,.42)!important;' +
      'overflow:hidden!important' +
    '}' +
    'html body.vexa-live-editing .vexa-panel-grip{width:36px!important;height:4px!important;margin:0 auto 8px!important;background:rgba(255,255,255,.16)!important}' +
    'html body.vexa-live-editing .vexa-editor-controls{' +
      'height:40px!important;display:grid!important;grid-template-columns:38px auto 1fr!important;align-items:center!important;gap:9px!important;' +
      'padding:0 2px 4px!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-play{' +
      'width:36px!important;height:36px!important;border-radius:12px!important;font-size:13px!important;box-shadow:0 8px 22px rgba(0,0,0,.28)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-time{' +
      'min-width:82px!important;font-size:9px!important;color:rgba(255,255,255,.72)!important;font-variant-numeric:tabular-nums!important' +
    '}' +
    'html body.vexa-live-editing .vexa-editor-hint{' +
      'font-size:8px!important;text-align:right!important;color:rgba(255,255,255,.3)!important;padding-right:4px!important' +
    '}' +
    'html body.vexa-live-editing .vexa-fit-button{display:none!important}' +
    'html body.vexa-live-editing .vexa-caption-timeline{' +
      'position:relative!important;height:132px!important;margin-top:4px!important;border-radius:16px!important;' +
      'background:#030303!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)!important;overflow-x:auto!important;overflow-y:hidden!important' +
    '}' +
    'html body.vexa-live-editing .vexa-timeline-lane{height:132px!important}' +
    'html body.vexa-live-editing .vexa-video-track{' +
      'position:absolute!important;left:8px!important;right:8px!important;top:12px!important;height:28px!important;' +
      'display:flex!important;gap:2px!important;overflow:hidden!important;border-radius:7px!important;background:rgba(255,255,255,.035)!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)!important;pointer-events:none!important' +
    '}' +
    'html body.vexa-live-editing .vexa-video-track i{' +
      'flex:1 0 22px!important;min-width:22px!important;height:100%!important;background:linear-gradient(135deg,rgba(255,255,255,.11),rgba(255,255,255,.025))!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-wave{' +
      'left:8px!important;right:8px!important;top:49px!important;height:25px!important;padding:0!important;gap:2px!important;opacity:.32!important' +
    '}' +
    'html body.vexa-live-editing .vexa-wave:before{' +
      'content:"AUDIO";position:absolute;left:2px;top:-10px;color:rgba(255,255,255,.22);font-size:6px;font-weight:780;letter-spacing:.12em' +
    '}' +
    'html body.vexa-live-editing .vexa-cue-track{' +
      'left:8px!important;right:8px!important;bottom:10px!important;height:40px!important' +
    '}' +
    'html body.vexa-live-editing .vexa-cue-track:before{' +
      'content:"CAPTIONS";position:absolute;left:2px;top:-10px;color:rgba(255,255,255,.22);font-size:6px;font-weight:780;letter-spacing:.12em' +
    '}' +
    'html body.vexa-live-editing .vexa-cue{' +
      'height:38px!important;border-radius:9px!important;background:rgba(255,255,255,.07)!important;color:rgba(255,255,255,.72)!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-cue.active{' +
      'background:#fff!important;color:#000!important;box-shadow:0 6px 18px rgba(0,0,0,.22)!important' +
    '}' +
    'html body.vexa-live-editing .vexa-playhead{top:6px!important;bottom:6px!important;width:1.5px!important;box-shadow:0 0 10px rgba(255,255,255,.32)!important}' +
    'html body.vexa-live-editing .vexa-caption-editor{' +
      'margin-top:8px!important;grid-template-columns:1fr 70px!important;column-gap:8px!important' +
    '}' +
    'html body.vexa-live-editing .vexa-caption-input{' +
      'height:52px!important;border-radius:13px!important;padding:10px 11px!important;background:rgba(255,255,255,.05)!important;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)!important;font-size:11px!important' +
    '}' +
    'html body.vexa-live-editing .vexa-reset-position{' +
      'width:70px!important;height:52px!important;border-radius:13px!important;background:rgba(255,255,255,.045)!important;font-size:7px!important' +
    '}' +
    'html body.vexa-live-editing.vexa-editor-collapsed #videoReadyState.show>.video-stage{height:min(66vh,620px)!important}' +
    'html body.vexa-live-editing.vexa-editor-collapsed .vexa-editor-panel{flex:0 0 68px!important;height:68px!important}' +
    'html body.vexa-live-editing.vexa-editor-keyboard #videoReadyState.show>.video-stage{height:30vh!important}' +
    'html body.vexa-live-editing.vexa-editor-keyboard .vexa-editor-panel{flex:1 1 auto!important;height:auto!important}' +
    '@media (max-height:720px){' +
      'html body.vexa-live-editing #videoReadyState.show{padding-top:calc(56px + env(safe-area-inset-top))!important;gap:8px!important}' +
      'html body.vexa-live-editing #videoReadyState.show>.video-stage{height:min(43vh,420px)!important;border-radius:20px!important}' +
      'html body.vexa-live-editing .vexa-caption-timeline{height:112px!important}' +
      'html body.vexa-live-editing .vexa-timeline-lane{height:112px!important}' +
      'html body.vexa-live-editing .vexa-video-track{top:9px!important;height:24px!important}' +
      'html body.vexa-live-editing .vexa-wave{top:40px!important;height:20px!important}' +
      'html body.vexa-live-editing .vexa-cue-track{bottom:8px!important;height:34px!important}' +
      'html body.vexa-live-editing .vexa-cue{height:32px!important}' +
      'html body.vexa-live-editing .vexa-caption-input,html body.vexa-live-editing .vexa-reset-position{height:44px!important}' +
    '}' +
    '</style>';

  const editorRuntime =
    '<script id="vexaEditorRuntime">' +
    'document.documentElement.dataset.vexaEditorVersion="' +
    VEXA_EDITOR_VERSION +
    '";' +
    VEXA_LIVE_EDITOR_JS.replace(/<\/script/gi, "<\\/script") +
    '</script>';

  const decoration =
    '<script id="vexaEditorDecorations">' +
    '(function(){' +
      'function decorate(){' +
        'var lane=document.getElementById("vexaTimelineLane");' +
        'if(!lane||document.getElementById("vexaVideoTrack"))return;' +
        'var track=document.createElement("div");' +
        'track.id="vexaVideoTrack";track.className="vexa-video-track";' +
        'for(var i=0;i<18;i+=1)track.appendChild(document.createElement("i"));' +
        'lane.insertBefore(track,lane.firstChild);' +
      '}' +
      'new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});' +
      'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",decorate,{once:true});else decorate();' +
    '})();' +
    '</script>';

  const injection = editorLayout + editorRuntime + decoration;
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
