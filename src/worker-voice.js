import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-5";
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

    if (
      request.method === "GET" &&
      (url.pathname === "/mini-app" || url.pathname === "/mini-app/")
    ) {
      return bumpLiveIntegrationVersion(response);
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

async function bumpLiveIntegrationVersion(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const html = source.replace(
    /\/mini-app\/live\/integration\.js\?v=[^"'<>\s]+/g,
    "/mini-app/live/integration.js?v=" + VEXA_VOICE_AGENT_VERSION
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

  function ensureStyle(doc){
    if(doc.getElementById("vexaVoiceBridgeStyles"))return;
    var style=doc.createElement("style");
    style.id="vexaVoiceBridgeStyles";
    style.textContent=
      'body.vexa-stt-embedded .vexa-stt-controls{grid-template-columns:minmax(0,1fr) 42px 42px!important}' +
      '.vexa-voice-open{position:relative;width:42px;height:42px;padding:0;display:grid!important;place-items:center;border:0;border-radius:13px;color:#fff;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);overflow:hidden;opacity:1!important;visibility:visible!important;transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .2s ease}' +
      '.vexa-voice-open:active{transform:scale(.88)}' +
      '.vexa-voice-open-orb{display:block;width:17px;height:17px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%);box-shadow:0 0 10px rgba(134,82,255,.34),0 0 3px rgba(255,208,240,.38);animation:vexaVoiceBridgeBreath 2.8s ease-in-out infinite}' +
      '#vexaVoiceAgentPlaceholder{pointer-events:none}' +
      'body.vexa-stt-embedded .vexa-stt.recording .vexa-voice-open,body.vexa-stt-embedded .vexa-stt.processing .vexa-voice-open{opacity:.25!important;pointer-events:none;transform:scale(.92)}' +
      '@keyframes vexaVoiceBridgeBreath{0%,100%{transform:scale(.92);filter:brightness(.88)}50%{transform:scale(1.06);filter:brightness(1.14)}}';
    doc.head.appendChild(style);
  }

  function removePlaceholder(doc){
    var placeholder=doc.getElementById("vexaVoiceAgentPlaceholder");
    if(placeholder){
      try{placeholder.remove();}catch(error){}
    }
  }

  function realButton(doc){
    var button=doc.getElementById("vexaVoiceAgentOpen");
    if(button&&button.dataset&&button.dataset.vexaVoiceBridgeBound){
      try{button.remove();}catch(error){}
      return null;
    }
    return button;
  }

  function ensurePlaceholder(doc){
    var shell=doc.getElementById("vexaStt");
    var controls=shell&&shell.querySelector(".vexa-stt-controls");
    var upload=doc.getElementById("vexaSttUpload");
    if(!shell||!controls||!upload)return null;

    ensureStyle(doc);
    var button=realButton(doc);
    if(button){
      removePlaceholder(doc);
      return button;
    }

    var placeholder=doc.getElementById("vexaVoiceAgentPlaceholder");
    if(!placeholder){
      placeholder=doc.createElement("button");
      placeholder.id="vexaVoiceAgentPlaceholder";
      placeholder.className="vexa-voice-open";
      placeholder.type="button";
      placeholder.tabIndex=-1;
      placeholder.setAttribute("aria-hidden","true");
      placeholder.innerHTML='<span class="vexa-voice-open-orb" aria-hidden="true"></span>';
      controls.insertBefore(placeholder,upload);
    }
    return placeholder;
  }

  function ensureRuntime(doc){
    var runtime=doc.getElementById("vexaVoiceAgentRuntime");
    if(runtime&&runtime.dataset.version!==VERSION){
      try{runtime.remove();}catch(error){}
      runtime=null;
    }
    if(runtime)return runtime;

    runtime=doc.createElement("script");
    runtime.id="vexaVoiceAgentRuntime";
    runtime.src=RUNTIME+"?v="+encodeURIComponent(VERSION);
    runtime.async=false;
    runtime.dataset.version=VERSION;
    runtime.addEventListener("load",function(){
      var button=realButton(doc);
      if(button){
        removePlaceholder(doc);
        stop();
      }
    },{once:true});
    runtime.addEventListener("error",function(){
      try{runtime.remove();}catch(error){}
    },{once:true});
    doc.body.appendChild(runtime);
    return runtime;
  }

  function install(){
    attempts+=1;
    try{
      var frame=document.getElementById("vexaLiveInlineFrame");
      if(!frame)return false;
      var doc=frame.contentDocument;
      if(!doc||!doc.body||!doc.getElementById("vexaStt"))return false;

      var button=realButton(doc);
      if(button){
        removePlaceholder(doc);
        frame.dataset.vexaVoiceAgent=VERSION;
        stop();
        return true;
      }

      if(!ensurePlaceholder(doc))return false;
      ensureRuntime(doc);

      button=realButton(doc);
      if(button){
        removePlaceholder(doc);
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
