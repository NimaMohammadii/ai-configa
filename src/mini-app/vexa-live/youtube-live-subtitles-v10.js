import {
  VexaSubtitleContainer,
  handleVexaLiveSubtitlesRequest as handleBaseVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
  LIVE_SUBTITLES_RUNTIME_JS as BASE_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles-v9.js";

export { VexaSubtitleContainer, isVexaLiveSubtitlesRequest };

const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260821-22";

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

function replaceRequired(source,from,to,label){
  const runtime=String(source||"");
  if(!runtime.includes(from))throw new Error("Vexa v10 runtime patch mismatch: "+label);
  return runtime.replace(from,to);
}

function patchClientRuntime(source){
  let runtime=String(source||"");
  runtime=replaceRequired(
    runtime,
    'function updateTimedSlot(p,v,slot,patch){const prior=subtitleSlots.get(slot)||{};if(patch.revision!==undefined&&Number(prior.revision||0)>Number(patch.revision||0))return;if(prior.shown&&patch.text)return;const next={...prior,...patch};if(next.text&&Number.isFinite(next.start)&&Number.isFinite(next.end)&&Number(v?.currentTime||0)>next.start+.75)next.dropped=true;subtitleSlots.set(slot,next);renderTimedCaption(p,v);}',
    'function updateTimedSlot(p,v,slot,patch){const prior=subtitleSlots.get(slot)||{};if(patch.revision!==undefined&&Number(prior.revision||0)>Number(patch.revision||0))return;if(prior.shown&&patch.text)return;const next={...prior,...patch};if(next.text&&Number.isFinite(next.start)&&Number.isFinite(next.end)){const now=Math.max(0,Number(v?.currentTime||0));next.dropped=now>next.end+.6;}subtitleSlots.set(slot,next);renderTimedCaption(p,v);}',
    "caption stale deadline"
  );
  runtime=replaceRequired(
    runtime,
    'function findTimedCaption(v,mediaTime){if(!v)return null;const now=Number.isFinite(mediaTime)?mediaTime:Number(v.currentTime||0);let active=null;for(const [key,item] of subtitleSlots){if(Number.isFinite(item.end)&&item.end<now-.35){subtitleSlots.delete(key);continue;}if(item.dropped||!item.text||!Number.isFinite(item.start)||!Number.isFinite(item.end))continue;if(item.start<=now+.04&&item.end>=now-.28&&(!active||item.start>=active.start))active=item;}return active;}',
    'function findTimedCaption(v,mediaTime){if(!v)return null;const now=Number.isFinite(mediaTime)?mediaTime:Number(v.currentTime||0);let active=null;for(const [key,item] of subtitleSlots){if(Number.isFinite(item.end)&&item.end<now-.6){subtitleSlots.delete(key);continue;}if(item.dropped||!item.text||!Number.isFinite(item.start)||!Number.isFinite(item.end))continue;if(item.start<=now+.04&&item.end>=now-.6&&(!active||item.start>=active.start))active=item;}return active;}',
    "caption late grace"
  );
  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchClientRuntime(BASE_LIVE_SUBTITLES_RUNTIME_JS);
