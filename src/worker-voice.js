import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-2";

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
  const voiceSource = exposeVoiceInstaller(VEXA_VOICE_AGENT_JS);
  const runtime =
    '<script id="vexaVoiceAgentRuntime">' +
    'document.documentElement.dataset.vexaVoiceAgentVersion="' +
    VEXA_VOICE_AGENT_VERSION +
    '";' +
    voiceSource.replace(/<\/script/gi, "<\\/script") +
    voiceInstallSyncRuntime() +
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

function exposeVoiceInstaller(source) {
  const marker = "  function initialize() {";
  const exposed =
    "  try { window.__vexaVoiceAgentEnsureUi = ensureUi; } catch (error) {}\n\n" +
    marker;
  return String(source || "").includes(marker)
    ? String(source).replace(marker, exposed)
    : String(source || "");
}

function voiceInstallSyncRuntime() {
  return `
;(function vexaVoiceInstallSync(){
  var attempts=0;
  var timer=0;
  function stop(){if(timer){clearInterval(timer);timer=0;}}
  function sync(){
    attempts+=1;
    try{
      if(typeof window.__vexaVoiceAgentEnsureUi==="function" && window.__vexaVoiceAgentEnsureUi()){
        stop();
        return;
      }
    }catch(error){}
    if(attempts>=120)stop();
  }
  sync();
  timer=setInterval(sync,250);
  window.addEventListener("pageshow",sync);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)sync();});
})();
`;
}
