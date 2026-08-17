import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-1";

export { AiCodingWorkflow } from "./worker-tribute.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    if (isVexaVoiceAgentRequest(request)) {
      return handleVexaVoiceAgentRequest(request, env);
    }

    const response = await worker.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app/live" || url.pathname === "/mini-app/live/")
    ) {
      return injectVoiceAgent(response);
    }
    return response;
  },
};

async function injectVoiceAgent(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const runtime =
    '<script id="vexaVoiceAgentRuntime">' +
    'document.documentElement.dataset.vexaVoiceAgentVersion="' +
    VEXA_VOICE_AGENT_VERSION +
    '";' +
    VEXA_VOICE_AGENT_JS.replace(/<\/script/gi, "<\\/script") +
    '</script>';
  const html = source.includes("</body>")
    ? source.replace("</body>", runtime + "\n</body>")
    : source + runtime;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("X-Vexa-Voice-Agent", VEXA_VOICE_AGENT_VERSION);
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
