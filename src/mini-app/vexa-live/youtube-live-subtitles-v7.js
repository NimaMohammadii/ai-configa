import {
  VexaSubtitleContainer,
  handleVexaLiveSubtitlesRequest as handleBaseVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
  LIVE_SUBTITLES_RUNTIME_JS as BASE_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles-v6.js";

export { VexaSubtitleContainer, isVexaLiveSubtitlesRequest };

const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-19";

export async function handleVexaLiveSubtitlesRequest(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(request.method==="GET"&&path===RUNTIME_PATH){
    return new Response(LIVE_SUBTITLES_RUNTIME_JS,{headers:{
      "Content-Type":"application/javascript; charset=utf-8",
      "Cache-Control":"no-store, no-cache, must-revalidate",
      "X-Content-Type-Options":"nosniff"
    }});
  }
  return handleBaseVexaLiveSubtitlesRequest(request,env,ctx);
}

export async function appendVexaLiveSubtitlesRuntime(request,response){
  if(!response?.ok||request.method!=="GET")return response;
  const path=new URL(request.url).pathname;
  if(path!=="/mini-app/vexa-live"&&path!=="/mini-app/vexa-live/")return response;
  if(!String(response.headers.get("Content-Type")||"").toLowerCase().includes("text/html"))return response;
  const source=await response.text(),tag='<script src="'+RUNTIME_PATH+'?v='+RUNTIME_VERSION+'"></script>';
  const html=source.includes(RUNTIME_PATH)?source:source.includes("</body>")?source.replace("</body>",tag+"\n</body>"):source+tag;
  const headers=new Headers(response.headers);
  headers.delete("Content-Length");headers.delete("Content-Encoding");headers.set("Cache-Control","no-store, no-cache, must-revalidate");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function patchClientRuntime(source){
  let runtime=String(source||"");
  runtime=runtime.replace(
    'let timedCaptionQueue=[],timedCaptionDeferred=null,timedCaptionPumpGeneration=0,lastTimedCaptionMediaAt=-1e9,timedCaptionHideAt=-1;',
    'let timedCaptionQueue=[],timedCaptionDeferred=null,timedCaptionPumpGeneration=0,timedCaptionPumpScheduled=false,lastTimedCaptionMediaAt=-1e9,timedCaptionHideAt=-1;'
  );
  runtime=runtime.replace(
    'function clearTimedCaptions(){timedCaptionQueue=[];timedCaptionDeferred=null;lastTimedCaptionMediaAt=-1e9;timedCaptionHideAt=-1;timedCaptionPumpGeneration++;}',
    'function clearTimedCaptions(){timedCaptionQueue=[];timedCaptionDeferred=null;timedCaptionPumpScheduled=false;lastTimedCaptionMediaAt=-1e9;timedCaptionHideAt=-1;timedCaptionPumpGeneration++;}'
  );
  runtime=runtime.replace(
    'function scheduleTimedCaptionPump(p,v){const generation=timedCaptionPumpGeneration;const tick=()=>{if(generation!==timedCaptionPumpGeneration)return;pumpTimedCaptions(p,v,generation);};if(typeof requestAnimationFrame==="function")requestAnimationFrame(tick);else setTimeout(tick,40);}',
    'function scheduleTimedCaptionPump(p,v){if(timedCaptionPumpScheduled)return;timedCaptionPumpScheduled=true;const generation=timedCaptionPumpGeneration;const tick=()=>{timedCaptionPumpScheduled=false;if(generation!==timedCaptionPumpGeneration)return;pumpTimedCaptions(p,v,generation);};if(typeof requestAnimationFrame==="function")requestAnimationFrame(tick);else setTimeout(tick,40);}'
  );
  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchClientRuntime(BASE_LIVE_SUBTITLES_RUNTIME_JS);
