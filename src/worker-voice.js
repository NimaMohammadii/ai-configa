import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-7";
const LIVE_ROOT = "/mini-app/live";
const LIVE_APP_PATH = LIVE_ROOT + "/app.js";

export { AiCodingWorkflow } from "./worker-tribute.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isVexaVoiceAgentRequest(request)) {
      return handleVexaVoiceAgentRequest(request, env);
    }

    const response = await worker.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === LIVE_APP_PATH) {
      return appendVoiceRuntime(response);
    }

    if (
      request.method === "GET" &&
      (url.pathname === LIVE_ROOT || url.pathname === LIVE_ROOT + "/")
    ) {
      return bumpLiveAppVersion(response);
    }

    return response;
  },
};

async function appendVoiceRuntime(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Voice-Agent", VEXA_VOICE_AGENT_VERSION);

  return new Response(source + "\n" + VEXA_VOICE_AGENT_JS, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function bumpLiveAppVersion(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const html = source.replace(
    /\/mini-app\/live\/app\.js\?v=[^"'<>\s]+/g,
    "/mini-app/live/app.js?v=" + VEXA_VOICE_AGENT_VERSION,
  );
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Voice-Agent", VEXA_VOICE_AGENT_VERSION);

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
