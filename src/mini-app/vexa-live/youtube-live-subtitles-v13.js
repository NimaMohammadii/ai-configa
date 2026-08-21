import {
  VexaSubtitleContainer,
  handleVexaLiveSubtitlesRequest as handleV12VexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
  LIVE_SUBTITLES_RUNTIME_JS as BASE_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles-v12.js";

export { VexaSubtitleContainer, isVexaLiveSubtitlesRequest };

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260821-23";

export async function handleVexaLiveSubtitlesRequest(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(request.method==="GET"&&path===RUNTIME_PATH){
    return new Response(LIVE_SUBTITLES_RUNTIME_JS,{headers:{
      "Content-Type":"application/javascript; charset=utf-8",
      "Cache-Control":"no-store, no-cache, must-revalidate",
      "X-Content-Type-Options":"nosniff"
    }});
  }
  if(path===SOCKET_PATH)return handleV12VexaLiveSubtitlesRequest(request,env,ctx);
  return handleV12VexaLiveSubtitlesRequest(request,env,ctx);
}

export async function appendVexaLiveSubtitlesRuntime(request,response){
  if(!response?.ok||request.method!=="GET")return response;
  const path=new URL(request.url).pathname;
  if(path!=="/mini-app/vexa-live"&&path!=="/mini-app/vexa-live/")return response;
  if(!String(response.headers.get("Content-Type")||"").toLowerCase().includes("text/html"))return response;
  const source=await response.text(),tag='<script src="'+RUNTIME_PATH+'?v='+RUNTIME_VERSION+'"></script>';
  const html=source.includes(RUNTIME_PATH)?source:source.includes("</body>")?source.replace("</body>",tag+"\n</body>"):source+tag;
  const headers=new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control","no-store, no-cache, must-revalidate");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function replaceRequired(source,search,replacement,label){
  if(!source.includes(search))throw new Error("Vexa warmup hardening patch failed: "+label);
  return source.replace(search,replacement);
}

function patchRuntime(source){
  let runtime=String(source||"");

  runtime=replaceRequired(
    runtime,
    'ws.addEventListener("close",()=>{\n   if(socket!==ws||generation!==currentGeneration)return;\n   socket=null;\n   if(enabled&&!ws.__vexaIntentional&&!ws.__vexaFailed&&!v.paused&&!v.ended)showCaption(p,"Live subtitles disconnected",true);\n });\n ws.addEventListener("error",()=>{if(socket===ws){ws.__vexaFailed=true;showCaption(p,"Live subtitles connection failed",true);}});',
    'ws.addEventListener("close",()=>{\n   if(socket!==ws||generation!==currentGeneration)return;\n   socket=null;\n   if(warmupActive&&!ws.__vexaIntentional){const resume=warmupResume;warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");if(resume&&!v.ended)Promise.resolve(v.play()).catch(()=>{});}\n   if(enabled&&!ws.__vexaIntentional&&!ws.__vexaFailed&&!v.paused&&!v.ended)showCaption(p,"Live subtitles disconnected",true);\n });\n ws.addEventListener("error",()=>{if(socket===ws){ws.__vexaFailed=true;const resume=warmupActive&&warmupResume;warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");showCaption(p,"Live subtitles connection failed",true);if(resume&&!v.ended)Promise.resolve(v.play()).catch(()=>{});}});',
    "socket-close-recovery"
  );

  runtime=replaceRequired(
    runtime,
    'function restartFromCurrentTime(p){\n if(!enabled)return;\n const v=p.querySelector("video");if(!v)return;\n closeSocket();hideCaption(p);\n if(!v.paused&&!v.ended)connectRealtime(p,v);\n}',
    'function restartFromCurrentTime(p){\n if(!enabled)return;\n const v=p.querySelector("video");if(!v)return;\n const resume=warmupActive?warmupResume:Boolean(!v.paused&&!v.ended);warmupActive=true;warmupResume=resume;p.classList.add("is-buffering");closeSocket();hideCaption(p);if(!v.paused){try{v.pause();}catch{}}connectRealtime(p,v);\n}',
    "restart-warmup"
  );

  runtime=replaceRequired(
    runtime,
    'v.addEventListener("play",()=>{if(enabled){if(warmupActive){try{v.pause();}catch{}return;}v.__vexaSubtitlePlaying=false;connectRealtime(p,v);sendPlaybackState(v,false);}});',
    'v.addEventListener("play",()=>{if(enabled){if(warmupActive){try{v.pause();}catch{}return;}if(!socket){warmupActive=true;warmupResume=true;p.classList.add("is-buffering");v.__vexaSubtitlePlaying=false;try{v.pause();}catch{}connectRealtime(p,v);return;}v.__vexaSubtitlePlaying=false;connectRealtime(p,v);sendPlaybackState(v,false);}});',
    "reconnect-warmup"
  );

  runtime=replaceRequired(
    runtime,
    'v.addEventListener("seeking",()=>{if(enabled){warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");closeSocket();hideCaption(p);}});\n v.addEventListener("seeked",()=>{if(enabled&&!v.paused&&!v.ended)connectRealtime(p,v);});',
    'v.addEventListener("seeking",()=>{if(enabled){const resume=warmupActive?warmupResume:Boolean(!v.paused&&!v.ended);warmupActive=true;warmupResume=resume;p.classList.add("is-buffering");closeSocket();hideCaption(p);}});\n v.addEventListener("seeked",()=>{if(enabled){if(warmupActive){if(!v.paused){try{v.pause();}catch{}}connectRealtime(p,v);}else if(!v.paused&&!v.ended)connectRealtime(p,v);}});',
    "seek-warmup"
  );

  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchRuntime(BASE_LIVE_SUBTITLES_RUNTIME_JS);
