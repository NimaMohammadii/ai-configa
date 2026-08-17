import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import VEXA_VOICE_AGENT_SOURCE from "./mini-app/vexa-live/voice-agent-runtime.txt";
import VEXA_VOICE_ORB_SOURCE from "./mini-app/vexa-live/voice-orb-original.txt";

const VEXA_VOICE_AGENT_VERSION = "20260817-13";
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

function restoreOriginalOrb(source) {
  let restored = String(source || "");
  const rendererStart = restored.indexOf("  function createOrbRenderer(canvas) {");
  const initializeStart = restored.indexOf("  function initialize() {", rendererStart);

  if (rendererStart >= 0 && initializeStart > rendererStart) {
    restored =
      restored.slice(0, rendererStart) +
      String(VEXA_VOICE_ORB_SOURCE || "").trimEnd() +
      "\n\n" +
      restored.slice(initializeStart);
  }

  return restored.replace(
    "radial-gradient(circle at 50% 50%,#08080a 0 54%,rgba(54,22,118,.62) 67%,#8352ff 80%,#ffc7ea 97%)",
    "radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%)",
  );
}

function polishVoiceUi(source) {
  let polished = String(source || "");

  polished = polished.replace(
    "background:#080808;color:#fff;opacity:0;visibility:hidden",
    "background:#000000;color:#fff;opacity:0;visibility:hidden",
  );

  polished = polished.replace(
    ".vexa-voice-close{position:absolute;z-index:4;top:calc(14px + env(safe-area-inset-top));left:14px;width:38px;height:38px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:50%;color:#fff;background:rgba(255,255,255,.05);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 9px 24px rgba(0,0,0,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:20px;font-weight:300;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease}",
    ".vexa-voice-close{position:absolute;z-index:4;top:calc(14px + env(safe-area-inset-top));left:14px;width:38px;height:38px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;color:#fff;background:rgba(13,13,13,.66);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -1px 0 rgba(255,255,255,.045),0 10px 26px rgba(0,0,0,.28);backdrop-filter:blur(12px) saturate(1.08);-webkit-backdrop-filter:blur(12px) saturate(1.08);font-size:21px;line-height:1;font-weight:800;letter-spacing:-.04em;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease}",
  );

  polished = polished.replace(
    ".vexa-voice-stage{position:relative;width:min(82vw,390px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:scale(.74);filter:blur(8px);transition:opacity .48s .06s ease,transform .72s .04s cubic-bezier(.16,1,.3,1),filter .5s .04s ease}",
    ".vexa-voice-stage{position:relative;width:min(82vw,390px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:translateY(-42px) scale(.74);filter:blur(8px);transition:opacity .48s .06s ease,transform .72s .04s cubic-bezier(.16,1,.3,1),filter .5s .04s ease}",
  );

  polished = polished.replace(
    ".vexa-voice-overlay.open .vexa-voice-stage{opacity:1;transform:scale(1);filter:blur(0)}",
    ".vexa-voice-overlay.open .vexa-voice-stage{opacity:1;transform:translateY(-42px) scale(1);filter:blur(0)}",
  );

  return polished;
}

function makeVoiceOrbOnly(source) {
  let result = String(source || "");

  result = result.replace(
    "      @media(max-height:650px)",
    "      .vexa-voice-close,.vexa-voice-copy,.vexa-voice-hint{display:none!important}\n      @media(max-height:650px)",
  );

  const openMarker = "  async function openVoiceMode() {";
  if (result.includes(openMarker)) {
    const helpers = `  let vexaVoiceBackHandler = null;

  function setVoiceHostActive(active) {
    try {
      const host = hostWindow();
      const doc = host?.document;
      if (!doc || doc === document) return;
      let style = doc.getElementById("vexaVoiceHostModeStyle");
      if (!style) {
        style = doc.createElement("style");
        style.id = "vexaVoiceHostModeStyle";
        style.textContent =
          '.vexa-voice-host-active .tts-head{opacity:0!important;visibility:hidden!important;pointer-events:none!important}' +
          '.vexa-voice-host-active #vexaLiveWorkspace{top:0!important;z-index:2147483000!important}';
        doc.head?.appendChild(style);
      }
      doc.documentElement?.classList.toggle("vexa-voice-host-active", Boolean(active));
    } catch (error) {}
  }

  function showTelegramBackButton() {
    const backButton = telegram()?.BackButton;
    if (!backButton) return;
    if (!vexaVoiceBackHandler) {
      vexaVoiceBackHandler = () => {
        if (!state.active) return;
        haptic("light");
        closeVoiceMode();
      };
    }
    try { backButton.offClick?.(vexaVoiceBackHandler); } catch (error) {}
    try { backButton.onClick?.(vexaVoiceBackHandler); } catch (error) {}
    try { backButton.show?.(); } catch (error) {}
  }

  function hideTelegramBackButton() {
    const backButton = telegram()?.BackButton;
    if (!backButton) return;
    if (vexaVoiceBackHandler) {
      try { backButton.offClick?.(vexaVoiceBackHandler); } catch (error) {}
    }
    try { backButton.hide?.(); } catch (error) {}
  }
`;
    result = result.replace(openMarker, helpers + "\n" + openMarker);
  }

  result = result.replace(
    "    state.captureEnabled = false;\n    state.outputSampleRate = DEFAULT_OUTPUT_SAMPLE_RATE;",
    "    state.captureEnabled = false;\n    state.outputSampleRate = DEFAULT_OUTPUT_SAMPLE_RATE;\n    setVoiceHostActive(true);\n    showTelegramBackButton();",
  );

  result = result.replace(
    "    state.active = false;\n    state.captureEnabled = false;\n    closeSpeechEngine();",
    "    state.active = false;\n    state.captureEnabled = false;\n    hideTelegramBackButton();\n    setVoiceHostActive(false);\n    closeSpeechEngine();",
  );

  return result;
}

function browserVoiceRuntimeSource() {
  const raw = makeVoiceOrbOnly(polishVoiceUi(restoreOriginalOrb(VEXA_VOICE_AGENT_SOURCE)));
  const exportMarker = "\nexport const VEXA_VOICE_AGENT_JS";
  const exportIndex = raw.lastIndexOf(exportMarker);
  const browserBody = exportIndex >= 0 ? raw.slice(0, exportIndex) : raw;

  return (
    "try{window.__vexaVoiceRuntimeVersion=" +
    JSON.stringify(VEXA_VOICE_AGENT_VERSION) +
    ";window.__vexaVoiceRuntimeError=\"\";window.__vexaVoiceRuntimeStarted=false;}catch(error){}\n" +
    browserBody +
    "\n;try{vexaVoiceAgentBootstrap();window.__vexaVoiceRuntimeStarted=true;}catch(error){" +
    "try{window.__vexaVoiceRuntimeError=String(error&&error.message||error||\"Voice runtime failed\");}catch(ignore){}" +
    "try{console.error(\"Vexa voice runtime\",error);}catch(ignore){}" +
    "}"
  );
}

function voiceRuntimeResponse() {
  return new Response(browserVoiceRuntimeSource(), {
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

  function runtimeWindow(doc){
    try{return doc&&doc.defaultView||null;}catch(error){return null;}
  }

  function runtimeError(doc){
    var win=runtimeWindow(doc);
    return String(win&&win.__vexaVoiceRuntimeError||"").trim();
  }

  function runtimeStarted(doc){
    var win=runtimeWindow(doc);
    return Boolean(win&&win.__vexaVoiceRuntimeVersion===VERSION&&win.__vexaVoiceRuntimeStarted===true);
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
        var error=runtimeError(doc);
        if(error){status(doc,"Voice runtime error · "+error);return;}
        status(doc,"Starting voice…");
        nudge(doc);
        retryRuntime(frame,doc);
        waitForRealButton(frame,doc,Date.now());
      });
    }
    return placeholder;
  }

  function waitForRealButton(frame,doc,startedAt){
    var button=realButton(doc);
    if(button){
      removePlaceholder(doc);
      status(doc,"");
      try{button.click();}catch(error){}
      return;
    }

    var error=runtimeError(doc);
    if(error){
      status(doc,"Voice runtime error · "+error);
      return;
    }

    if(runtimeStarted(doc))nudge(doc);

    if(Date.now()-startedAt>5000){
      status(doc,runtimeStarted(doc)?"Voice UI did not attach":"Voice runtime did not start");
      return;
    }
    setTimeout(function(){waitForRealButton(frame,doc,startedAt);},90);
  }

  function retryRuntime(frame,doc){
    try{
      if(runtimeStarted(doc)){
        nudge(doc);
        return;
      }

      var old=doc.getElementById("vexaVoiceRuntimeRetry");
      if(old){try{old.remove();}catch(error){}}
      var script=doc.createElement("script");
      script.id="vexaVoiceRuntimeRetry";
      script.src=RUNTIME+"?v="+encodeURIComponent(VERSION)+"&retry="+Date.now();
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
      if(runtimeStarted(doc))nudge(doc);
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
