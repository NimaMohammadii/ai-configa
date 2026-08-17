import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-3";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";

export { AiCodingWorkflow } from "./worker-tribute.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isVexaVoiceAgentRequest(request)) {
      return handleVexaVoiceAgentRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === VOICE_RUNTIME_PATH) {
      return voiceRuntimeResponse();
    }

    const response = await worker.fetch(request, env, ctx);
    if (request.method === "GET" && url.pathname === LIVE_INTEGRATION_PATH) {
      return injectVoiceBridge(response);
    }
    return response;
  },
};

function voiceRuntimeResponse() {
  return new Response(VEXA_VOICE_AGENT_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Vexa-Voice-Agent": VEXA_VOICE_AGENT_VERSION,
    },
  });
}

async function injectVoiceBridge(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Voice-Agent", VEXA_VOICE_AGENT_VERSION);

  return new Response(source + "\n" + voiceBridgeRuntime(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function voiceBridgeRuntime() {
  return `
;(function vexaVoiceAgentBridge(){
  var VERSION=${JSON.stringify(VEXA_VOICE_AGENT_VERSION)};
  var RUNTIME=${JSON.stringify(VOICE_RUNTIME_PATH)};
  var timer=0;
  var attempts=0;

  function stop(){
    if(timer){clearInterval(timer);timer=0;}
  }

  function install(){
    attempts+=1;
    try{
      var frame=document.getElementById("vexaLiveInlineFrame");
      if(!frame)return false;
      var doc=frame.contentDocument;
      if(!doc||!doc.body||!doc.getElementById("vexaStt"))return false;

      if(doc.getElementById("vexaVoiceAgentOpen")){
        frame.dataset.vexaVoiceAgent=VERSION;
        stop();
        return true;
      }

      var runtime=doc.getElementById("vexaVoiceAgentRuntime");
      if(!runtime){
        runtime=doc.createElement("script");
        runtime.id="vexaVoiceAgentRuntime";
        runtime.src=RUNTIME+"?v="+encodeURIComponent(VERSION);
        runtime.async=false;
        runtime.dataset.version=VERSION;
        runtime.addEventListener("load",function(){
          frame.dataset.vexaVoiceAgent=VERSION;
          if(doc.getElementById("vexaVoiceAgentOpen"))stop();
        },{once:true});
        runtime.addEventListener("error",function(){
          try{runtime.remove();}catch(error){}
        },{once:true});
        doc.body.appendChild(runtime);
      }

      if(doc.getElementById("vexaVoiceAgentOpen")){
        frame.dataset.vexaVoiceAgent=VERSION;
        stop();
        return true;
      }
    }catch(error){}

    if(attempts>=240)stop();
    return false;
  }

  install();
  timer=setInterval(install,250);
  window.addEventListener("pageshow",install);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)install();});
})();
`;
}
