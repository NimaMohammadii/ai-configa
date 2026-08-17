import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import { VEXA_VOICE_AGENT_JS } from "./mini-app/vexa-live/voice-agent-client.js";

const VEXA_VOICE_AGENT_VERSION = "20260817-8";
const LIVE_ROOT = "/mini-app/live";
const LIVE_INTEGRATION_PATH = LIVE_ROOT + "/integration.js";
const VOICE_RUNTIME_PATH = LIVE_ROOT + "/voice-agent-runtime.js";

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

    if (
      request.method === "GET" &&
      (url.pathname === LIVE_ROOT || url.pathname === LIVE_ROOT + "/")
    ) {
      return injectStaticVoiceRuntime(response);
    }

    if (request.method === "GET" && url.pathname === LIVE_INTEGRATION_PATH) {
      return injectVoicePresenceBridge(response);
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
  const source =
    "try{window.__vexaVoiceRuntimeVersion=" +
    JSON.stringify(VEXA_VOICE_AGENT_VERSION) +
    ";}catch(error){}\n" +
    VEXA_VOICE_AGENT_JS;

  return new Response(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Vexa-Voice-Agent": VEXA_VOICE_AGENT_VERSION,
    },
  });
}

async function injectStaticVoiceRuntime(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const runtimeTag =
    '<script id="vexaVoiceRuntime" src="' +
    VOICE_RUNTIME_PATH +
    "?v=" +
    VEXA_VOICE_AGENT_VERSION +
    '"></script>';
  const html = source.includes('id="vexaVoiceRuntime"')
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", runtimeTag + "\n</body>")
      : source + runtimeTag;

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

async function bumpLiveIntegrationVersion(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const html = source.replace(
    /\/mini-app\/live\/integration\.js\?v=[^"'<>\s]+/g,
    "/mini-app/live/integration.js?v=" + VEXA_VOICE_AGENT_VERSION,
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

async function injectVoicePresenceBridge(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Voice-Agent", VEXA_VOICE_AGENT_VERSION);

  return new Response(source + "\n" + voicePresenceBridge(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function voicePresenceBridge() {
  return `
;(function vexaVoicePresenceBridge(){
  var VERSION=${JSON.stringify(VEXA_VOICE_AGENT_VERSION)};
  var RUNTIME=${JSON.stringify(VOICE_RUNTIME_PATH)};
  var timer=0;
  var attempts=0;

  function stop(){
    if(timer){clearInterval(timer);timer=0;}
  }

  function status(doc,message){
    var node=doc&&doc.getElementById("vexaSttStatus");
    if(!node)return;
    node.textContent=String(message||"");
    node.classList.toggle("show",Boolean(message));
  }

  function ensureStyle(doc){
    if(doc.getElementById("vexaVoicePresenceStyle"))return;
    var style=doc.createElement("style");
    style.id="vexaVoicePresenceStyle";
    style.textContent=
      'body.vexa-stt-embedded .vexa-stt-controls{grid-template-columns:minmax(0,1fr) 42px 42px!important}' +
      '.vexa-voice-placeholder{position:relative;width:42px;height:42px;padding:0;display:grid;place-items:center;border:0;border-radius:13px;color:#fff;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);overflow:hidden;transition:transform .2s ease,opacity .2s ease}' +
      '.vexa-voice-placeholder:active{transform:scale(.9)}' +
      '.vexa-voice-placeholder span{display:block;width:17px;height:17px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%);box-shadow:0 0 10px rgba(134,82,255,.34),0 0 3px rgba(255,208,240,.38);animation:vexaVoicePresenceBreath 2.8s ease-in-out infinite}' +
      '@keyframes vexaVoicePresenceBreath{0%,100%{transform:scale(.92);filter:brightness(.88)}50%{transform:scale(1.06);filter:brightness(1.14)}}';
    doc.head.appendChild(style);
  }

  function nudge(doc){
    try{
      var shell=doc.getElementById("vexaStt");
      if(!shell)return;
      var marker=doc.createComment("vexa-voice-"+VERSION);
      shell.appendChild(marker);
      marker.remove();
    }catch(error){}
  }

  function realButton(doc){
    return doc.getElementById("vexaVoiceAgentOpen");
  }

  function removePlaceholder(doc){
    var placeholder=doc.getElementById("vexaVoiceAgentPlaceholder");
    if(placeholder){try{placeholder.remove();}catch(error){}}
  }

  function ensurePlaceholder(frame,doc){
    var shell=doc.getElementById("vexaStt");
    var controls=shell&&shell.querySelector(".vexa-stt-controls");
    var upload=doc.getElementById("vexaSttUpload");
    if(!shell||!controls||!upload)return null;

    ensureStyle(doc);
    var real=realButton(doc);
    if(real){removePlaceholder(doc);return real;}

    var placeholder=doc.getElementById("vexaVoiceAgentPlaceholder");
    if(!placeholder){
      placeholder=doc.createElement("button");
      placeholder.id="vexaVoiceAgentPlaceholder";
      placeholder.className="vexa-voice-placeholder";
      placeholder.type="button";
      placeholder.setAttribute("aria-label","Talk to Vexa");
      placeholder.innerHTML='<span aria-hidden="true"></span>';
      controls.insertBefore(placeholder,upload);
      placeholder.addEventListener("click",function(){
        var current=realButton(doc);
        if(current){current.click();return;}
        status(doc,"Starting voice…");
        nudge(doc);
        retryRuntime(frame,doc);
        waitForRealButton(doc,Date.now());
      });
    }
    return placeholder;
  }

  function waitForRealButton(doc,startedAt){
    var button=realButton(doc);
    if(button){
      removePlaceholder(doc);
      status(doc,"");
      try{button.click();}catch(error){}
      return;
    }
    if(Date.now()-startedAt>5000){
      status(doc,"Voice runtime did not start");
      return;
    }
    setTimeout(function(){waitForRealButton(doc,startedAt);},90);
  }

  function retryRuntime(frame,doc){
    try{
      if(frame.contentWindow&&frame.contentWindow.__vexaVoiceRuntimeVersion===VERSION){
        nudge(doc);
        return;
      }
      var old=doc.getElementById("vexaVoiceRuntimeRetry");
      if(old)return;
      var script=doc.createElement("script");
      script.id="vexaVoiceRuntimeRetry";
      script.src=RUNTIME+"?v="+encodeURIComponent(VERSION)+"&retry=1";
      script.addEventListener("load",function(){nudge(doc);},{once:true});
      script.addEventListener("error",function(){status(doc,"Voice runtime failed to load");},{once:true});
      doc.body.appendChild(script);
    }catch(error){
      status(doc,"Voice runtime failed to load");
    }
  }

  function install(){
    attempts+=1;
    try{
      var frame=document.getElementById("vexaLiveInlineFrame");
      if(!frame)return false;
      var doc=frame.contentDocument;
      if(!doc||!doc.body||!doc.getElementById("vexaStt"))return false;

      var real=realButton(doc);
      if(real){
        removePlaceholder(doc);
        stop();
        return true;
      }

      ensurePlaceholder(frame,doc);
      nudge(doc);
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
