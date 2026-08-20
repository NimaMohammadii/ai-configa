import { getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import {
  VexaSubtitleContainer,
  LIVE_SUBTITLES_RUNTIME_JS as BASE_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles-v3.js";

export { VexaSubtitleContainer };

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-16";
const TRANSLATION_MODEL="gpt-5.6-terra";
const TRANSLATE_TIMEOUT_MS=12000;
const PCM_SAMPLE_RATE=16000,PCM_BYTES_PER_SECOND=32000,PCM_FRAME_BYTES=3200;
const MAX_AUDIO_LEAD_SECONDS=2.4,STALE_TRANSLATION_ABORT_MS=900,FAST_STALE_DISPLAY_MS=700;
const LIVE_SOURCE_MAX_WORDS=14,LIVE_SOURCE_MAX_CHARS=160;
const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const SCRIBE_ERROR_TYPES=new Set(["error","auth_error","quota_exceeded","transcriber_error","input_error","invalid_request","unaccepted_terms","commit_throttled","rate_limited","queue_overflow","resource_exhausted","session_time_limit_exceeded","chunk_size_exceeded","insufficient_audio_activity"]);

export function isVexaLiveSubtitlesRequest(request){
  const path=new URL(request.url).pathname;
  return path===SOCKET_PATH||path===RUNTIME_PATH;
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
  if(request.method==="GET"&&path===SOCKET_PATH){
    if(String(request.headers.get("Upgrade")||"").toLowerCase()!=="websocket")return new Response("WebSocket Required",{status:426});
    return createRealtimeSubtitleSocket(request,env,ctx);
  }
  return json({error:"Method Not Allowed"},405);
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

function createRealtimeSubtitleSocket(request,env){
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);
  server.accept();
  const controller=new AbortController();
  const playbackStart={value:null,resolve:null};
  const playbackControl={playbackTime:0,playbackRate:1,playing:false,version:0,waiters:new Set()};
  let started=false;
  const send=value=>{if(server.readyState===WebSocket.OPEN)try{server.send(JSON.stringify(value));}catch{}};
  const abort=()=>{if(!controller.signal.aborted)controller.abort();};
  const fail=error=>{
    if(controller.signal.aborted)return;
    console.error("Vexa realtime subtitle session failed",error?.stack||error);
    send({type:"error",error:publicError(error)});
    abort();
    try{server.close(1011,"subtitle session failed");}catch{}
  };

  server.addEventListener("message",event=>{
    let message;try{message=JSON.parse(String(event.data||"{}"));}catch{return;}
    if(message?.type==="start"){
      if(started)return;
      started=true;
      runRealtimeSubtitleSession({request,env,server,payload:message,playbackStart,playbackControl,signal:controller.signal,send}).catch(fail);
      return;
    }
    if(message?.type==="playback_start"&&started&&!playbackStart.value){
      const state=normalizePlaybackState(message);
      playbackStart.value=state;
      updatePlaybackControl(playbackControl,state);
      if(playbackStart.resolve)playbackStart.resolve(state);
      return;
    }
    if(message?.type==="playback_state"&&started){
      updatePlaybackControl(playbackControl,normalizePlaybackState(message));
      return;
    }
    if(message?.type==="stop"){
      abort();
      try{server.close(1000,"stopped");}catch{}
    }
  });
  server.addEventListener("close",abort);
  server.addEventListener("error",abort);
  return new Response(null,{status:101,webSocket:client});
}

async function runRealtimeSubtitleSession({request,env,server,payload,playbackStart,playbackControl,signal,send}){
  const user=await authenticateMiniAppPayload(payload,env);
  await assertLiveAccess(env,user.id);
  const token=cleanToken(payload.playbackToken);
  if(!token)throw httpError("Video session is invalid",400);
  const targetLanguage=normalizeTargetLanguage(payload.targetLanguage);
  if(!targetLanguage||targetLanguage==="off")throw httpError("Subtitle language is invalid",400);

  const row=await env.DB.prepare("SELECT user_id, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?").bind(token).first();
  const now=Math.floor(Date.now()/1000);
  if(!row||Number(row.expires_at||0)<=now)throw httpError("Video session expired. Open the video again.",410);
  if(String(row.user_id)!==String(user.id))throw httpError("Video session does not belong to this user",403);
  if(!env.VEXA_SUBTITLES)throw httpError("Live subtitles are unavailable",503);

  const apiKey=await selectedElevenApiKey(env);
  if(!apiKey)throw httpError("Speech-to-text is unavailable",503);
  const scribeUrl=new URL("https://api.elevenlabs.io/v1/speech-to-text/realtime");
  scribeUrl.searchParams.set("model_id","scribe_v2_realtime");
  scribeUrl.searchParams.set("audio_format","pcm_16000");
  scribeUrl.searchParams.set("commit_strategy","vad");
  scribeUrl.searchParams.set("vad_silence_threshold_secs","0.3");
  scribeUrl.searchParams.set("vad_threshold","0.4");
  scribeUrl.searchParams.set("min_speech_duration_ms","100");
  scribeUrl.searchParams.set("min_silence_duration_ms","100");
  const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
  const upstream=upstreamResponse.webSocket;
  if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
  upstream.accept();

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));
  let audioStream=null,upstreamEndedNormally=false,completed=false;
  let latestSource="",latestRevision=0,lastSource="",translationLoopPromise=null,activeTranslationController=null,activeTranslationStartedAt=0,hasCaption=false;
  let scribeReadyResolve;
  const scribeReady=new Promise((resolve,reject)=>{
    const onAbort=()=>reject(new Error("aborted"));
    scribeReadyResolve=()=>{signal.removeEventListener("abort",onAbort);resolve();};
    signal.addEventListener("abort",onAbort,{once:true});
  });
  const closeUpstream=()=>{try{upstream.close(1000,"stopped");}catch{}};
  signal.addEventListener("abort",closeUpstream,{once:true});

  const runTranslationLoop=()=>{
    if(translationLoopPromise)return translationLoopPromise;
    translationLoopPromise=(async()=>{
      while(latestSource&&!signal.aborted&&server.readyState===WebSocket.OPEN){
        const sourceText=latestSource,revision=latestRevision;
        latestSource="";
        if(targetLanguage==="original"){
          send({type:"caption",text:sourceText,translated:false});
          hasCaption=true;
          continue;
        }
        const jobController=new AbortController();
        activeTranslationController=jobController;
        activeTranslationStartedAt=Date.now();
        const abortJob=()=>jobController.abort();
        signal.addEventListener("abort",abortJob,{once:true});
        try{
          const text=await translateLiveSubtitle({env,sourceText,targetLanguage,signal:jobController.signal});
          const current=revision===latestRevision,jobAge=Date.now()-activeTranslationStartedAt;
          if(text&&!signal.aborted&&server.readyState===WebSocket.OPEN&&(current||!hasCaption||jobAge<=FAST_STALE_DISPLAY_MS)){
            send({type:"caption",text,translated:true});
            hasCaption=true;
          }
        }catch(error){
          if(signal.aborted)return;
          if(jobController.signal.aborted)continue;
          console.error("Vexa live subtitle translation failed",error?.stack||error);
          send({type:"error",error:publicError(error)});
        }finally{
          signal.removeEventListener("abort",abortJob);
          if(activeTranslationController===jobController)activeTranslationController=null;
        }
      }
    })().finally(()=>{
      translationLoopPromise=null;
      if(latestSource&&!signal.aborted&&server.readyState===WebSocket.OPEN)return runTranslationLoop();
    });
    return translationLoopPromise;
  };

  const queueSource=value=>{
    const sourceText=liveSubtitleWindow(value);
    if(!sourceText||sourceText===lastSource)return;
    lastSource=sourceText;
    latestSource=sourceText;
    latestRevision+=1;
    if(activeTranslationController&&Date.now()-activeTranslationStartedAt>=STALE_TRANSLATION_ABORT_MS){
      try{activeTranslationController.abort();}catch{}
    }
    if(!translationLoopPromise)runTranslationLoop();
  };

  upstream.addEventListener("message",event=>{
    if(signal.aborted)return;
    let message;try{message=JSON.parse(String(event.data||"{}"));}catch{return;}
    const type=String(message?.message_type||"");
    if(type==="session_started"){scribeReadyResolve();return;}
    if(type==="partial_transcript"||type==="final_transcript"||type==="committed_transcript"){
      queueSource(message?.text);
      return;
    }
    if(SCRIBE_ERROR_TYPES.has(type)){
      send({type:"error",error:publicScribeError(type,message)});
      try{server.close(1011,"scribe error");}catch{}
    }
  });
  upstream.addEventListener("error",()=>{
    if(signal.aborted)return;
    send({type:"error",error:"Realtime transcription connection failed"});
    try{server.close(1011,"scribe connection failed");}catch{}
  });
  upstream.addEventListener("close",()=>{
    if(signal.aborted||upstreamEndedNormally)return;
    send({type:"error",error:"Realtime transcription connection closed"});
    try{server.close(1011,"scribe connection closed");}catch{}
  });

  try{
    await scribeReady;
    await container.ensureAudioReady();
    send({type:"audio_ready"});
    const playback=await waitForPlaybackStart(playbackStart,signal);
    const start=finiteNumber(playback.currentTime,0,86400);
    if(start===null)throw httpError("Subtitle start time is invalid",400);
    const playbackRate=finiteNumber(playback.playbackRate,.25,4)??1;
    updatePlaybackControl(playbackControl,{currentTime:start,playbackRate,playing:playback.playing});
    audioStream=await container.streamAudioPcm(playbackUrl,start,playbackRate,streamId);
    send({type:"ready"});
    await streamPcmToScribe({audioStream,upstream,control:playbackControl,baseStart:start,maxAheadSeconds:MAX_AUDIO_LEAD_SECONDS,signal});
    if(translationLoopPromise)await translationLoopPromise;
    if(!signal.aborted){completed=true;send({type:"ended"});}
  }finally{
    upstreamEndedNormally=true;
    signal.removeEventListener("abort",closeUpstream);
    if(activeTranslationController)try{activeTranslationController.abort();}catch{}
    if(audioStream)try{await audioStream.cancel();}catch{}
    try{await container.stopAudioStream(streamId);}catch{}
    closeUpstream();
    if(completed)try{server.close(1000,"ended");}catch{}
  }
}

function waitForPlaybackStart(control,signal){
  if(control.value)return Promise.resolve(control.value);
  return new Promise((resolve,reject)=>{
    const finish=value=>{signal.removeEventListener("abort",onAbort);control.resolve=null;resolve(value);};
    const onAbort=()=>{control.resolve=null;reject(new Error("aborted"));};
    control.resolve=finish;
    signal.addEventListener("abort",onAbort,{once:true});
    if(control.value)finish(control.value);
  });
}

async function streamPcmToScribe({audioStream,upstream,control,baseStart,maxAheadSeconds,signal}){
  const reader=audioStream.getReader();
  let pending=new Uint8Array(0),bytesSent=0;
  const cancelReader=()=>{try{reader.cancel();}catch{}};
  signal.addEventListener("abort",cancelReader,{once:true});
  try{
    while(!signal.aborted){
      const next=await reader.read();
      if(next.done)break;
      if(!next.value?.byteLength)continue;
      pending=concatBytes(pending,next.value);
      while(pending.byteLength>=PCM_FRAME_BYTES&&!signal.aborted){
        const frame=pending.slice(0,PCM_FRAME_BYTES);
        pending=pending.slice(PCM_FRAME_BYTES);
        await waitForPlaybackRunning(control,signal);
        const absoluteAudioTime=Number(baseStart||0)+(bytesSent+frame.byteLength)/PCM_BYTES_PER_SECOND;
        await waitForPlaybackLead(control,absoluteAudioTime,maxAheadSeconds,signal);
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE}));
        bytesSent+=frame.byteLength;
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      await waitForPlaybackRunning(control,signal);
      const absoluteAudioTime=Number(baseStart||0)+(bytesSent+pending.byteLength)/PCM_BYTES_PER_SECOND;
      await waitForPlaybackLead(control,absoluteAudioTime,maxAheadSeconds,signal);
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
    }
  }finally{
    signal.removeEventListener("abort",cancelReader);
    try{await reader.cancel();}catch{}
  }
}

function normalizePlaybackState(value){
  return{
    currentTime:finiteNumber(value?.currentTime,0,86400)??0,
    playbackRate:finiteNumber(value?.playbackRate,.25,4)??1,
    playing:Boolean(value?.playing)
  };
}

function updatePlaybackControl(control,state){
  const currentTime=finiteNumber(state?.currentTime,0,86400);
  const playbackRate=finiteNumber(state?.playbackRate,.25,4);
  if(currentTime!==null)control.playbackTime=currentTime;
  if(playbackRate!==null)control.playbackRate=playbackRate;
  control.playing=Boolean(state?.playing);
  control.version+=1;
  notifyControl(control);
}

async function waitForPlaybackRunning(control,signal){
  while(!signal.aborted&&!control?.playing){
    const version=Number(control?.version||0);
    await waitForControlChange(control,version,signal,1500);
  }
}

async function waitForPlaybackLead(control,absoluteAudioTime,maxAheadSeconds,signal){
  while(!signal.aborted&&absoluteAudioTime-Number(control?.playbackTime||0)>Number(maxAheadSeconds||0)){
    const version=Number(control?.version||0);
    await waitForControlChange(control,version,signal,1500);
  }
}

function notifyControl(control){
  if(!control?.waiters?.size)return;
  const waiters=[...control.waiters];
  control.waiters.clear();
  for(const wake of waiters)try{wake();}catch{}
}

function waitForControlChange(control,version,signal,timeoutMs=0){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error("aborted"));
    if(Number(control?.version||0)!==Number(version||0))return resolve();
    let done=false,timer=0;
    const finish=fn=>{if(done)return;done=true;control?.waiters?.delete(wake);signal?.removeEventListener?.("abort",onAbort);if(timer)clearTimeout(timer);fn();};
    const wake=()=>finish(resolve),onAbort=()=>finish(()=>reject(new Error("aborted")));
    control?.waiters?.add(wake);signal?.addEventListener?.("abort",onAbort,{once:true});
    if(timeoutMs>0)timer=setTimeout(()=>finish(resolve),timeoutMs);
    if(Number(control?.version||0)!==Number(version||0))wake();
  });
}

async function translateLiveSubtitle({env,sourceText,targetLanguage,signal}){
  if(!env.GPT_API)throw httpError("AI translation is unavailable",503);
  const languageName=TARGET_LANGUAGES[targetLanguage];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TRANSLATE_TIMEOUT_MS);
  const abortFromJob=()=>controller.abort();
  signal.addEventListener("abort",abortFromJob,{once:true});
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+env.GPT_API,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model:TRANSLATION_MODEL,
        instructions:"Translate this live subtitle into "+languageName+". Translate only the text present. Keep it concise and natural enough for at most two subtitle lines. Preserve names, numbers and tone. Return only the translation with no label, explanation, quotes or markdown.",
        input:sourceText,
        reasoning:{effort:"none"},
        text:{verbosity:"low"},
        max_output_tokens:120,
        stream:true,
        store:false
      })
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      console.error("Vexa subtitle translation failed",response.status,JSON.stringify(data).slice(0,900));
      throw httpError("AI translation is temporarily unavailable",502);
    }
    const text=await readTranslationStream(response,signal);
    if(!text)throw httpError("AI translation returned an empty result",502);
    return text;
  }catch(error){
    if(controller.signal.aborted&&!signal.aborted)throw httpError("Subtitle translation timed out",504);
    throw error;
  }finally{
    clearTimeout(timer);
    signal.removeEventListener("abort",abortFromJob);
  }
}

async function readTranslationStream(response,signal){
  if(!response.body)throw httpError("AI translation stream is unavailable",502);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer="",output="";
  const consume=frame=>{
    const data=frame.split(/\r?\n/u).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
    if(!data||data==="[DONE]")return;
    let event;try{event=JSON.parse(data);}catch{return;}
    if(event?.type==="response.output_text.delta"&&typeof event.delta==="string"){output+=event.delta;return;}
    if(event?.type==="error"||event?.type==="response.failed")throw httpError("AI translation is temporarily unavailable",502);
  };
  try{
    while(!signal.aborted){
      const next=await reader.read();
      buffer+=decoder.decode(next.value||new Uint8Array(),{stream:!next.done});
      let match;
      while((match=/\r?\n\r?\n/u.exec(buffer))){
        const frame=buffer.slice(0,match.index);
        buffer=buffer.slice(match.index+match[0].length);
        consume(frame);
      }
      if(next.done)break;
    }
    if(buffer.trim())consume(buffer);
  }finally{try{reader.releaseLock();}catch{}}
  return cleanTranslatedText(output);
}

async function selectedElevenApiKey(env){const name=await getElevenApiSetting(env);return String(env[name]||"").trim();}
async function assertLiveAccess(env,userId){if(await isAdmin(env,userId))return;const[globalAccess,liveAccess]=await Promise.all([getMiniAppAccessSettings(env),getVexaLiveAccessSettings(env)]);if(globalAccess.adminOnly||liveAccess.adminOnly)throw httpError("Vexa Live is updating",423);}
function normalizeTargetLanguage(value){const key=String(value||"original").trim().toLowerCase();return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES,key)?key:"";}
function cleanToken(value){const token=String(value||"").trim();return/^[A-Za-z0-9_-]{40,160}$/.test(token)?token:"";}
function safeContainerKey(value){const raw=String(value||"anonymous").replace(/[^A-Za-z0-9_-]/g,"");return(raw||"anonymous").slice(0,80);}
function finiteNumber(value,min,max){const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;}
function cleanSubtitleText(value){return String(value||"").replace(/\s+([,.;:!?،؛؟])/g,"$1").replace(/\s+/g," ").trim();}
function liveSubtitleWindow(value){
  const text=cleanSubtitleText(value);if(!text)return"";
  const words=text.split(/\s+/u),wordWindow=words.length>LIVE_SOURCE_MAX_WORDS?words.slice(-LIVE_SOURCE_MAX_WORDS).join(" "):text;
  const characters=Array.from(wordWindow);if(characters.length<=LIVE_SOURCE_MAX_CHARS)return wordWindow;
  const tail=characters.slice(-LIVE_SOURCE_MAX_CHARS).join("");
  return tail.replace(/^\S+\s+/u,"").trim()||tail.trim();
}
function cleanTranslatedText(value){return cleanSubtitleText(value).replace(/^["“”'‘’]+/u,"").replace(/["“”'‘’]+$/u,"").trim();}
function publicScribeError(type,message){
  if(type==="quota_exceeded")return"Speech-to-text quota is unavailable";
  if(type==="rate_limited")return"Realtime transcription is rate limited";
  if(type==="auth_error")return"Realtime transcription authentication failed";
  if(type==="unaccepted_terms")return"Scribe realtime terms must be accepted";
  const detail=String(message?.error||message?.message||"");
  console.error("Vexa Scribe realtime error",type,detail.slice(0,700));
  return"Realtime transcription is temporarily unavailable";
}
function bytesToBase64(bytes){let binary="";for(let offset=0;offset<bytes.byteLength;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(bytes.byteLength,offset+0x8000)));return btoa(binary);}
function concatBytes(left,right){if(!left.byteLength)return right.slice();const merged=new Uint8Array(left.byteLength+right.byteLength);merged.set(left,0);merged.set(right,left.byteLength);return merged;}
function httpError(message,status){const error=new Error(message);error.status=status;return error;}
function publicError(error){const status=Number(error?.status||500);if(status>=400&&status<500)return String(error?.message||"Request failed");const message=String(error?.message||"");if(/translation/i.test(message))return message;if(/transcription|speech-to-text/i.test(message))return message;return"Live subtitles are temporarily unavailable";}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}

function patchClientRuntime(source){
  let runtime=String(source||"");
  runtime=runtime.replace(
    'function playbackIsRunning(v){return Boolean(v&&!v.paused&&!v.ended&&Number(v.readyState||0)>=3);}\nfunction sendPlaybackState(v){const current=socket;if(!current||current.readyState!==WebSocket.OPEN||!v)return;try{current.send(JSON.stringify({type:"playback_state",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:playbackIsRunning(v)}));}catch{}}\nfunction restartFromCurrentTime(p){',
    'function playbackIsRunning(v){if(!v)return false;if(typeof v.__vexaSubtitlePlaying==="boolean")return v.__vexaSubtitlePlaying;return Boolean(!v.paused&&!v.ended&&Number(v.readyState||0)>=3);}\nfunction sendPlaybackState(v,playing){const current=socket;if(!v)return;if(typeof playing==="boolean")v.__vexaSubtitlePlaying=playing;if(!current||current.readyState!==WebSocket.OPEN)return;try{current.send(JSON.stringify({type:"playback_state",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:playbackIsRunning(v)}));}catch{}}\nfunction restartFromCurrentTime(p){'
  );
  runtime=runtime.replace(
    'if(!v.paused&&!v.ended&&Number(v.readyState||0)>=3)connectRealtime(p,v);',
    'if(!v.paused&&!v.ended)connectRealtime(p,v);'
  );
  runtime=runtime.replace(
    'v.addEventListener("play",()=>{if(enabled)sendPlaybackState(v);});',
    'v.addEventListener("play",()=>{if(enabled){v.__vexaSubtitlePlaying=false;connectRealtime(p,v);sendPlaybackState(v,false);}});'
  );
  runtime=runtime.replace(
    'v.addEventListener("playing",()=>{if(enabled){connectRealtime(p,v);sendPlaybackState(v);}});',
    'v.addEventListener("playing",()=>{if(enabled){v.__vexaSubtitlePlaying=true;connectRealtime(p,v);sendPlaybackState(v,true);}});'
  );
  runtime=runtime.replace(
    'v.addEventListener("waiting",()=>{if(enabled)sendPlaybackState(v);});',
    'v.addEventListener("waiting",()=>{if(enabled){v.__vexaSubtitlePlaying=false;sendPlaybackState(v,false);}});'
  );
  runtime=runtime.replace(
    'v.addEventListener("stalled",()=>{if(enabled)sendPlaybackState(v);});',
    'v.addEventListener("stalled",()=>{if(enabled){v.__vexaSubtitlePlaying=false;sendPlaybackState(v,false);}});'
  );
  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchClientRuntime(BASE_LIVE_SUBTITLES_RUNTIME_JS);
