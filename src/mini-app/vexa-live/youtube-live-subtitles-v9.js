import {
  VexaSubtitleContainer as BaseVexaSubtitleContainer,
  handleVexaLiveSubtitlesRequest as handleBaseVexaLiveSubtitlesRequest,
  isVexaLiveSubtitlesRequest,
  LIVE_SUBTITLES_RUNTIME_JS as BASE_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles-v8.js";

export { isVexaLiveSubtitlesRequest };

const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260821-21";
const PCM_SAMPLE_RATE=16000,PCM_BYTES_PER_SECOND=32000;
const EOF_FLUSH_SILENCE_SECONDS=.5;
const EOF_FLUSH_GRACE_MS=1500;

export class VexaSubtitleContainer extends BaseVexaSubtitleContainer {
  async ensureAudioReady(){
    await super.ensureAudioReady();
    this.renewActivityTimeout();
  }

  async onActivityExpired(){
    if(this.activeAudio?.process){
      this.renewActivityTimeout();
      return;
    }
    return super.onActivityExpired();
  }

  async streamAudioPcm(mediaUrl,startSeconds,playbackRate,streamId){
    const source=await super.streamAudioPcm(mediaUrl,startSeconds,playbackRate,streamId);
    this.renewActivityTimeout();
    return keepAliveAndFlushPcmStream(source,this);
  }
}

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

function keepAliveAndFlushPcmStream(source,owner){
  const reader=source.getReader();
  const flushBytes=Math.round(PCM_BYTES_PER_SECOND*EOF_FLUSH_SILENCE_SECONDS);
  let sourceEnded=false,closed=false;
  return new ReadableStream({
    async pull(controller){
      if(closed)return;
      owner.renewActivityTimeout();
      if(sourceEnded){
        closed=true;
        controller.close();
        return;
      }
      const next=await reader.read();
      if(!next.done){
        if(next.value?.byteLength)controller.enqueue(next.value);
        return;
      }
      sourceEnded=true;
      if(flushBytes>0)controller.enqueue(new Uint8Array(flushBytes));
      owner.renewActivityTimeout();
      await sleep(EOF_FLUSH_GRACE_MS);
    },
    async cancel(reason){
      closed=true;
      try{await reader.cancel(reason);}catch{}
    }
  });
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));}

function replaceRequired(source,from,to,label){
  const runtime=String(source||"");
  if(!runtime.includes(from))throw new Error("Vexa v9 runtime patch mismatch: "+label);
  return runtime.replace(from,to);
}

function patchClientRuntime(source){
  let runtime=String(source||"");
  runtime=replaceRequired(
    runtime,
    'v.addEventListener("pause",()=>{if(enabled)closeSocket();hideCaption(p);});',
    'v.addEventListener("pause",()=>{stopCaptionFrames();clearTimedCaptions();if(enabled&&!v.ended)closeSocket();hideCaption(p);});',
    "pause cleanup"
  );
  runtime=replaceRequired(
    runtime,
    'v.addEventListener("ended",()=>{stopCaptionFrames();clearTimedCaptions();if(enabled)closeSocket();hideCaption(p);});',
    'v.addEventListener("ended",()=>{stopCaptionFrames();clearTimedCaptions();hideCaption(p);});',
    "natural EOF drain"
  );
  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchClientRuntime(BASE_LIVE_SUBTITLES_RUNTIME_JS);
