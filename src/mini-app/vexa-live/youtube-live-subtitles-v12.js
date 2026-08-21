import { getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import {
  VexaSubtitleContainer as BaseVexaSubtitleContainer,
} from "./youtube-live-subtitles-v11.js";
import {
  LIVE_SUBTITLES_RUNTIME_JS as ORIGINAL_LIVE_SUBTITLES_RUNTIME_JS,
} from "./youtube-live-subtitles.js";

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260821-22";
const TRANSLATION_MODEL="gpt-5.6-terra";
const TRANSLATE_TIMEOUT_MS=8000;
const PCM_SAMPLE_RATE=16000,PCM_BYTES_PER_SECOND=32000,PCM_FRAME_BYTES=3200;
const INITIAL_AUDIO_BURST_SECONDS=5;
const WARMUP_TARGET_LEAD_SECONDS=4.0,WARMUP_MAX_AUDIO_LEAD_SECONDS=4.6,PLAYBACK_AUDIO_LEAD_SECONDS=4.2;
const WARMUP_NO_SPEECH_GRACE_MS=650,WARMUP_MAX_WAIT_MS=6500;
const SPECULATIVE_DEBOUNCE_MS=140,FINAL_TRANSLATION_MAX_CONCURRENCY=2;
const VAD_SILENCE_SECONDS=.3,VAD_THRESHOLD=.4,VAD_MIN_SPEECH_MS=100,VAD_MIN_SILENCE_MS=100;
const CAPTION_LATE_GRACE_SECONDS=.2,CAPTION_EARLY_EPSILON_SECONDS=.06;
const EOF_FLUSH_FRAMES=5,EOF_FLUSH_GRACE_MS=900;
const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const SCRIBE_ERROR_TYPES=new Set(["error","auth_error","quota_exceeded","transcriber_error","input_error","invalid_request","unaccepted_terms","commit_throttled","rate_limited","queue_overflow","resource_exhausted","session_time_limit_exceeded","chunk_size_exceeded","insufficient_audio_activity"]);

export class VexaSubtitleContainer extends BaseVexaSubtitleContainer {
  async streamAudioPcm(mediaUrl,startSeconds,playbackRate,streamId){
    await this.ensureAudioReady();
    const id=cleanStreamId(streamId);
    if(!id)throw new Error("Subtitle audio stream id is invalid");
    if(this.activeAudio?.process){try{this.activeAudio.process.kill();}catch{}this.activeAudio=null;}
    const rate=Math.max(.25,Math.min(4,Number(playbackRate)||1));
    const process=await this.ctx.container.exec([
      "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
      "-readrate",rate.toFixed(3),
      "-readrate_initial_burst",String(INITIAL_AUDIO_BURST_SECONDS),
      "-readrate_catchup",Math.max(1.25,rate*1.5).toFixed(3),
      "-ss",Number(startSeconds||0).toFixed(3),"-i",String(mediaUrl),
      "-vn","-ac","1","-ar",String(PCM_SAMPLE_RATE),"-c:a","pcm_s16le","-f","s16le","pipe:1"
    ]);
    if(!process.stdout){try{process.kill();}catch{}throw new Error("Could not start realtime subtitle audio");}
    this.activeAudio={id,process};
    try{this.renewActivityTimeout?.();}catch{}
    process.exitCode.catch(()=>-1).finally(()=>{if(this.activeAudio?.id===id&&this.activeAudio?.process===process)this.activeAudio=null;});
    return process.stdout;
  }
}

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
    return createRealtimeSubtitleSocket(request,env);
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
  const playbackControl={playbackTime:0,playbackRate:1,playing:false,warming:false,updatedAt:Date.now(),version:0,waiters:new Set()};
  let started=false;
  const send=value=>{if(server.readyState===WebSocket.OPEN)try{server.send(JSON.stringify(value));}catch{}};
  const abort=()=>{if(!controller.signal.aborted)controller.abort();};
  const fail=error=>{
    if(controller.signal.aborted)return;
    console.error("Vexa warm subtitle session failed",error?.stack||error);
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
    if(message?.type==="warmup_complete"&&started){
      updatePlaybackControl(playbackControl,{...normalizePlaybackState(message),warming:false});
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

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));
  let audioStream=null,upstream=null,upstreamEndedNormally=false,completed=false,scribeFailure="",baseStart=0;
  let audioLeadSeconds=0,warmupStartedAt=0,warmupLeadReachedAt=0,warmupReadySent=false,sawSpeech=false;
  const timestampState={offset:0,lastEnd:0};
  const seenTimedSegments=new Set();
  const readyCaptions=[];
  let activeCaptionId="",activeCaptionEnd=0,captionSequence=0;

  let speculativeTimer=0,speculativeActive=null,pendingSpeculative=null,latestSpeculativeRevision=0,latestSpeculativeText="";
  const speculativeCache=new Map();
  const finalQueue=[],activeFinalTranslations=new Set();

  const clearSpeculativeTimer=()=>{if(speculativeTimer){clearTimeout(speculativeTimer);speculativeTimer=0;}};
  signal.addEventListener("abort",clearSpeculativeTimer,{once:true});

  const maybeWarmupReady=()=>{
    if(warmupReadySent||signal.aborted||!playbackControl.warming)return;
    if(audioLeadSeconds<WARMUP_TARGET_LEAD_SECONDS)return;
    if(!warmupLeadReachedAt)warmupLeadReachedAt=Date.now();
    const hasPreparedCaption=readyCaptions.length>0||speculativeCache.size>0||targetLanguage==="original"&&sawSpeech;
    const noSpeechSettled=!sawSpeech&&Date.now()-warmupLeadReachedAt>=WARMUP_NO_SPEECH_GRACE_MS;
    const timedOut=warmupStartedAt&&Date.now()-warmupStartedAt>=WARMUP_MAX_WAIT_MS;
    if(!hasPreparedCaption&&!noSpeechSettled&&!timedOut)return;
    warmupReadySent=true;
    send({type:"warmup_ready",leadSeconds:roundTime(audioLeadSeconds),prepared:hasPreparedCaption});
  };

  const estimatedPlaybackTime=()=>{
    const base=Number(playbackControl.playbackTime||0);
    if(playbackControl.warming||!playbackControl.playing)return base;
    const elapsed=Math.max(0,(Date.now()-Number(playbackControl.updatedAt||Date.now()))/1000);
    return base+elapsed*Number(playbackControl.playbackRate||1);
  };

  const pumpCaptions=()=>{
    maybeWarmupReady();
    if(signal.aborted||playbackControl.warming||!playbackControl.playing||server.readyState!==WebSocket.OPEN)return;
    const mediaTime=estimatedPlaybackTime();
    while(readyCaptions.length&&readyCaptions[0].end<mediaTime-CAPTION_LATE_GRACE_SECONDS)readyCaptions.shift();
    let chosen=-1;
    for(let i=0;i<readyCaptions.length;i++){
      const item=readyCaptions[i];
      if(item.start>mediaTime+CAPTION_EARLY_EPSILON_SECONDS)break;
      if(item.end>=mediaTime-CAPTION_LATE_GRACE_SECONDS)chosen=i;
    }
    if(chosen>=0){
      const item=readyCaptions[chosen];
      readyCaptions.splice(0,chosen+1);
      if(item.id!==activeCaptionId){
        activeCaptionId=item.id;activeCaptionEnd=item.end;
        send({type:"caption",text:item.text,translated:item.translated,start:item.start,end:item.end});
      }
      return;
    }
    if(activeCaptionId&&mediaTime>activeCaptionEnd+.05){
      activeCaptionId="";activeCaptionEnd=0;send({type:"caption_clear"});
    }
  };
  const captionTimer=setInterval(pumpCaptions,50);

  const addReadyCaption=(text,timing,translated)=>{
    const clean=cleanTranslatedText(text);if(!clean||!timing)return;
    const current=estimatedPlaybackTime();
    if(!playbackControl.warming&&timing.end<current-CAPTION_LATE_GRACE_SECONDS)return;
    const item={id:String(++captionSequence),text:clean,start:timing.start,end:timing.end,translated:Boolean(translated)};
    readyCaptions.push(item);readyCaptions.sort((a,b)=>a.start-b.start||a.end-b.end);
    maybeWarmupReady();pumpCaptions();
  };

  const rememberSpeculative=(source,text)=>{
    if(!source||!text)return;
    speculativeCache.set(source,text);
    while(speculativeCache.size>16)speculativeCache.delete(speculativeCache.keys().next().value);
    maybeWarmupReady();
  };
  const launchSpeculative=()=>{
    if(speculativeActive||!pendingSpeculative||signal.aborted||targetLanguage==="original")return;
    const job=pendingSpeculative;pendingSpeculative=null;
    let task;
    task=(async()=>{
      try{
        const text=await translateLiveSubtitle({env,sourceText:job.text,targetLanguage,signal});
        if(text&&job.revision===latestSpeculativeRevision&&job.text===latestSpeculativeText&&!signal.aborted)rememberSpeculative(job.text,text);
      }catch(error){if(!signal.aborted)console.warn("Vexa speculative subtitle translation skipped",error?.message||error);}
    })().finally(()=>{if(speculativeActive===task)speculativeActive=null;if(pendingSpeculative)launchSpeculative();});
    speculativeActive=task;
  };
  const queueSpeculative=(value,immediate=false)=>{
    const text=cleanSubtitleText(value);if(!text)return;
    sawSpeech=true;
    if(targetLanguage==="original"){maybeWarmupReady();return;}
    if(text===latestSpeculativeText)return;
    latestSpeculativeText=text;const revision=++latestSpeculativeRevision;
    pendingSpeculative={text,revision};
    clearSpeculativeTimer();
    if(immediate){launchSpeculative();return;}
    speculativeTimer=setTimeout(()=>{speculativeTimer=0;launchSpeculative();},SPECULATIVE_DEBOUNCE_MS);
  };

  const pumpFinalTranslations=()=>{
    while(!signal.aborted&&activeFinalTranslations.size<FINAL_TRANSLATION_MAX_CONCURRENCY&&finalQueue.length){
      const job=finalQueue.shift();
      let task;
      task=(async()=>{
        try{
          const cached=speculativeCache.get(job.sourceText);
          const text=cached||await translateLiveSubtitle({env,sourceText:job.sourceText,targetLanguage,signal});
          if(text&&!signal.aborted){rememberSpeculative(job.sourceText,text);addReadyCaption(text,job.timing,true);}
        }catch(error){
          if(signal.aborted)return;
          console.error("Vexa finalized subtitle translation failed",error?.stack||error);
          send({type:"translation_error",error:publicError(error)});
        }
      })().finally(()=>{activeFinalTranslations.delete(task);pumpFinalTranslations();});
      activeFinalTranslations.add(task);
    }
  };

  const handleTimedSegment=message=>{
    const sourceText=cleanSubtitleText(message?.text);
    if(!sourceText)return;
    sawSpeech=true;
    const timing=timingFromScribeWords(message,baseStart,timestampState);
    if(!timing)return;
    const signature=sourceText+"|"+timing.start+"|"+timing.end;
    if(seenTimedSegments.has(signature))return;
    seenTimedSegments.add(signature);while(seenTimedSegments.size>64)seenTimedSegments.delete(seenTimedSegments.values().next().value);
    if(targetLanguage==="original"){addReadyCaption(sourceText,timing,false);return;}
    finalQueue.push({sourceText,timing});pumpFinalTranslations();
  };

  try{
    await container.ensureAudioReady();
    send({type:"audio_ready"});
    const playback=await waitForPlaybackStart(playbackStart,signal);
    baseStart=finiteNumber(playback.currentTime,0,86400);
    if(baseStart===null)throw httpError("Subtitle start time is invalid",400);
    const playbackRate=finiteNumber(playback.playbackRate,.25,4)??1;
    updatePlaybackControl(playbackControl,{currentTime:baseStart,playbackRate,playing:Boolean(playback.playing),warming:Boolean(playback.warming)});
    warmupStartedAt=Date.now();
    audioStream=await container.streamAudioPcm(playbackUrl,baseStart,playbackRate,streamId);

    const scribeUrl=new URL("https://api.elevenlabs.io/v1/speech-to-text/realtime");
    scribeUrl.searchParams.set("model_id","scribe_v2_realtime");
    scribeUrl.searchParams.set("audio_format","pcm_16000");
    scribeUrl.searchParams.set("commit_strategy","vad");
    scribeUrl.searchParams.set("vad_silence_threshold_secs",String(VAD_SILENCE_SECONDS));
    scribeUrl.searchParams.set("vad_threshold",String(VAD_THRESHOLD));
    scribeUrl.searchParams.set("min_speech_duration_ms",String(VAD_MIN_SPEECH_MS));
    scribeUrl.searchParams.set("min_silence_duration_ms",String(VAD_MIN_SILENCE_MS));
    scribeUrl.searchParams.set("include_timestamps","true");
    const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
    upstream=upstreamResponse.webSocket;
    if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
    upstream.accept();

    let readyResolve,readyReject;
    const scribeReady=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    const readyTimer=setTimeout(()=>readyReject(httpError("Realtime transcription did not start",504)),10000);
    const closeUpstream=()=>{try{upstream?.close(1000,"stopped");}catch{}};
    signal.addEventListener("abort",closeUpstream,{once:true});

    upstream.addEventListener("message",event=>{
      if(signal.aborted)return;
      let message;try{message=JSON.parse(String(event.data||"{}"));}catch{return;}
      const type=String(message?.message_type||"");
      if(type==="session_started"){clearTimeout(readyTimer);readyResolve();return;}
      if(type==="partial_transcript"){queueSpeculative(message?.text,false);return;}
      if(type==="final_transcript"||type==="committed_transcript"){queueSpeculative(message?.text,true);return;}
      if(type==="committed_transcript_with_timestamps"){handleTimedSegment(message);return;}
      if(SCRIBE_ERROR_TYPES.has(type)){
        scribeFailure=publicScribeError(type,message);clearTimeout(readyTimer);readyReject(httpError(scribeFailure,502));
        send({type:"error",error:scribeFailure});
        console.error("Vexa Scribe realtime error",type,String(message?.error||message?.message||"").slice(0,700));
      }
    });
    upstream.addEventListener("error",event=>{
      if(signal.aborted)return;
      if(!scribeFailure)scribeFailure="Realtime transcription connection failed";
      clearTimeout(readyTimer);readyReject(httpError(scribeFailure,502));send({type:"error",error:scribeFailure});
      console.error("Vexa Scribe websocket error",event?.message||event);
    });
    upstream.addEventListener("close",event=>{
      clearTimeout(readyTimer);
      if(signal.aborted||upstreamEndedNormally)return;
      const code=Number(event?.code||0),reason=String(event?.reason||"").trim();
      console.error("Vexa Scribe websocket closed",code,reason);
      if(!scribeFailure){scribeFailure="Realtime transcription connection closed"+(code?" ("+code+")":"");send({type:"error",error:scribeFailure});}
      readyReject(httpError(scribeFailure,502));
    });

    await scribeReady;
    if(signal.aborted)throw new Error("aborted");
    send({type:"ready"});
    const audioEndTime=await streamPcmToScribe({
      audioStream,upstream,control:playbackControl,baseStart,signal,
      onProgress:absoluteAudioTime=>{
        if(playbackControl.warming){audioLeadSeconds=Math.max(audioLeadSeconds,absoluteAudioTime-baseStart);maybeWarmupReady();}
      }
    });
    await flushScribeTail(upstream,signal);
    await sleepWithSignal(EOF_FLUSH_GRACE_MS,signal);
    upstreamEndedNormally=true;
    signal.removeEventListener("abort",closeUpstream);closeUpstream();
    clearSpeculativeTimer();
    if(pendingSpeculative)launchSpeculative();
    if(speculativeActive)await Promise.allSettled([speculativeActive]);
    while(finalQueue.length||activeFinalTranslations.size){pumpFinalTranslations();if(activeFinalTranslations.size)await Promise.allSettled([...activeFinalTranslations]);else break;}
    if(playbackControl.warming&&!warmupReadySent&&!signal.aborted){
      warmupReadySent=true;send({type:"warmup_ready",leadSeconds:roundTime(audioLeadSeconds),prepared:readyCaptions.length>0||speculativeCache.size>0});
    }
    await waitForPlaybackDrain(playbackControl,audioEndTime,signal);
    if(!signal.aborted){completed=true;send({type:"ended"});}
  }finally{
    upstreamEndedNormally=true;
    clearInterval(captionTimer);clearSpeculativeTimer();
    signal.removeEventListener("abort",clearSpeculativeTimer);
    if(audioStream)try{await audioStream.cancel();}catch{}
    try{await container.stopAudioStream(streamId);}catch{}
    try{upstream?.close(1000,"stopped");}catch{}
    if(completed)try{server.close(1000,"ended");}catch{}
  }
}

function waitForPlaybackStart(control,signal){
  if(control.value)return Promise.resolve(control.value);
  return new Promise((resolve,reject)=>{
    const finish=value=>{signal.removeEventListener("abort",onAbort);control.resolve=null;resolve(value);};
    const onAbort=()=>{control.resolve=null;reject(new Error("aborted"));};
    control.resolve=finish;signal.addEventListener("abort",onAbort,{once:true});if(control.value)finish(control.value);
  });
}

async function streamPcmToScribe({audioStream,upstream,control,baseStart,signal,onProgress}){
  const reader=audioStream.getReader();let pending=new Uint8Array(0),bytesSent=0;
  const cancelReader=()=>{try{reader.cancel();}catch{}};signal.addEventListener("abort",cancelReader,{once:true});
  try{
    while(!signal.aborted){
      const next=await reader.read();if(next.done)break;if(!next.value?.byteLength)continue;
      pending=concatBytes(pending,next.value);
      while(pending.byteLength>=PCM_FRAME_BYTES&&!signal.aborted){
        const frame=pending.slice(0,PCM_FRAME_BYTES);pending=pending.slice(PCM_FRAME_BYTES);
        const absoluteAudioTime=Number(baseStart||0)+(bytesSent+frame.byteLength)/PCM_BYTES_PER_SECOND;
        await waitForFeedPermission(control,absoluteAudioTime,signal);
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE}));
        bytesSent+=frame.byteLength;onProgress?.(Number(baseStart||0)+bytesSent/PCM_BYTES_PER_SECOND);
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      const absoluteAudioTime=Number(baseStart||0)+(bytesSent+pending.byteLength)/PCM_BYTES_PER_SECOND;
      await waitForFeedPermission(control,absoluteAudioTime,signal);
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
      bytesSent+=pending.byteLength;onProgress?.(Number(baseStart||0)+bytesSent/PCM_BYTES_PER_SECOND);
    }
  }finally{signal.removeEventListener("abort",cancelReader);try{await reader.cancel();}catch{}}
  return Number(baseStart||0)+bytesSent/PCM_BYTES_PER_SECOND;
}

async function flushScribeTail(upstream,signal){
  if(signal.aborted||upstream?.readyState!==WebSocket.OPEN)return;
  const silence=new Uint8Array(PCM_FRAME_BYTES),payload=bytesToBase64(silence);
  for(let index=0;index<EOF_FLUSH_FRAMES&&!signal.aborted&&upstream.readyState===WebSocket.OPEN;index++){
    upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:payload,sample_rate:PCM_SAMPLE_RATE}));
  }
}

async function sleepWithSignal(ms,signal){
  if(signal.aborted)throw new Error("aborted");
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(done,ms);function done(){signal.removeEventListener("abort",abort);resolve();}function abort(){clearTimeout(timer);signal.removeEventListener("abort",abort);reject(new Error("aborted"));}signal.addEventListener("abort",abort,{once:true});
  });
}

async function waitForPlaybackDrain(control,audioEndTime,signal){
  const target=Number(audioEndTime);if(!Number.isFinite(target))return;
  while(!signal.aborted){
    if(!control?.warming&&control?.playing&&estimatedControlTime(control)>=target-.08)return;
    const version=Number(control?.version||0);await waitForControlChange(control,version,signal,100);
  }
  throw new Error("aborted");
}

async function waitForFeedPermission(control,absoluteAudioTime,signal){
  while(!signal.aborted){
    const mediaTime=estimatedControlTime(control);
    const lead=absoluteAudioTime-mediaTime;
    if(control?.warming){if(lead<=WARMUP_MAX_AUDIO_LEAD_SECONDS)return;}
    else if(control?.playing&&lead<=PLAYBACK_AUDIO_LEAD_SECONDS)return;
    const version=Number(control?.version||0);await waitForControlChange(control,version,signal,100);
  }
  throw new Error("aborted");
}

function estimatedControlTime(control){
  const base=Number(control?.playbackTime||0);
  if(control?.warming||!control?.playing)return base;
  return base+Math.max(0,(Date.now()-Number(control?.updatedAt||Date.now()))/1000)*Number(control?.playbackRate||1);
}
function normalizePlaybackState(value){return{currentTime:finiteNumber(value?.currentTime,0,86400)??0,playbackRate:finiteNumber(value?.playbackRate,.25,4)??1,playing:Boolean(value?.playing),warming:Boolean(value?.warmup??value?.warming)};}
function updatePlaybackControl(control,state){
  const currentTime=finiteNumber(state?.currentTime,0,86400),playbackRate=finiteNumber(state?.playbackRate,.25,4);
  if(currentTime!==null)control.playbackTime=currentTime;if(playbackRate!==null)control.playbackRate=playbackRate;
  control.playing=Boolean(state?.playing);if(Object.prototype.hasOwnProperty.call(state||{},"warming"))control.warming=Boolean(state.warming);
  control.updatedAt=Date.now();control.version+=1;notifyControl(control);
}
function notifyControl(control){if(!control?.waiters?.size)return;const waiters=[...control.waiters];control.waiters.clear();for(const wake of waiters)try{wake();}catch{}}
function waitForControlChange(control,version,signal,timeoutMs=0){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error("aborted"));if(Number(control?.version||0)!==Number(version||0))return resolve();
    let done=false,timer=0;const finish=fn=>{if(done)return;done=true;control?.waiters?.delete(wake);signal?.removeEventListener?.("abort",onAbort);if(timer)clearTimeout(timer);fn();};
    const wake=()=>finish(resolve),onAbort=()=>finish(()=>reject(new Error("aborted")));control?.waiters?.add(wake);signal?.addEventListener?.("abort",onAbort,{once:true});if(timeoutMs>0)timer=setTimeout(()=>finish(resolve),timeoutMs);if(Number(control?.version||0)!==Number(version||0))wake();
  });
}

function timingFromScribeWords(message,baseStart,state){
  const words=(Array.isArray(message?.words)?message.words:[]).filter(word=>Number.isFinite(Number(word?.start))&&Number.isFinite(Number(word?.end)));
  if(!words.length)return null;
  const first=Number(words[0].start),last=Number(words[words.length-1].end);
  if(first+state.offset<state.lastEnd-.25)state.offset=Math.max(0,state.lastEnd+VAD_SILENCE_SECONDS-first);
  const relativeStart=Math.max(0,state.offset+first),relativeEnd=Math.max(relativeStart+.2,state.offset+last);
  state.lastEnd=Math.max(state.lastEnd,relativeEnd);
  return{start:roundTime(Number(baseStart||0)+relativeStart),end:roundTime(Number(baseStart||0)+relativeEnd)};
}

async function translateLiveSubtitle({env,sourceText,targetLanguage,signal}){
  if(!env.GPT_API)throw httpError("AI translation is unavailable",503);
  const languageName=TARGET_LANGUAGES[targetLanguage];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TRANSLATE_TIMEOUT_MS),abortFromSession=()=>controller.abort();
  signal.addEventListener("abort",abortFromSession,{once:true});
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",headers:{Authorization:"Bearer "+env.GPT_API,"Content-Type":"application/json"},signal:controller.signal,
      body:JSON.stringify({model:TRANSLATION_MODEL,service_tier:"fast",instructions:"Translate this live-video subtitle into "+languageName+". Preserve meaning, names, numbers and tone. Keep it concise and natural for at most two subtitle lines. Return only the complete translation with no label, explanation, quotes or markdown.",input:sourceText,reasoning:{effort:"none"},text:{verbosity:"low"},max_output_tokens:90,stream:true,store:false})
    });
    if(!response.ok){const data=await response.json().catch(()=>({}));console.error("Vexa subtitle translation failed",response.status,JSON.stringify(data).slice(0,900));throw httpError("AI translation is temporarily unavailable",502);}
    const text=await readTranslationStream(response,signal);if(!text)throw httpError("AI translation returned an empty result",502);return text;
  }catch(error){if(controller.signal.aborted&&!signal.aborted)throw httpError("Subtitle translation timed out",504);throw error;}finally{clearTimeout(timer);signal.removeEventListener("abort",abortFromSession);}
}
async function readTranslationStream(response,signal){
  if(!response.body)throw httpError("AI translation stream is unavailable",502);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",output="";
  const consume=frame=>{const data=frame.split(/\r?\n/u).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");if(!data||data==="[DONE]")return;let event;try{event=JSON.parse(data);}catch{return;}if(event?.type==="response.output_text.delta"&&typeof event.delta==="string"){output+=event.delta;return;}if(event?.type==="response.output_text.done"&&typeof event.text==="string"){output=event.text;return;}if(event?.type==="error"||event?.type==="response.failed")throw httpError("AI translation is temporarily unavailable",502);};
  try{while(!signal.aborted){const next=await reader.read();buffer+=decoder.decode(next.value||new Uint8Array(),{stream:!next.done});let match;while((match=/\r?\n\r?\n/u.exec(buffer))){const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);consume(frame);}if(next.done)break;}if(buffer.trim())consume(buffer);}finally{try{reader.releaseLock();}catch{}}
  return cleanTranslatedText(output);
}

async function selectedElevenApiKey(env){const name=await getElevenApiSetting(env);return String(env[name]||"").trim();}
async function assertLiveAccess(env,userId){if(await isAdmin(env,userId))return;const[globalAccess,liveAccess]=await Promise.all([getMiniAppAccessSettings(env),getVexaLiveAccessSettings(env)]);if(globalAccess.adminOnly||liveAccess.adminOnly)throw httpError("Vexa Live is updating",423);}
function normalizeTargetLanguage(value){const key=String(value||"original").trim().toLowerCase();return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES,key)?key:"";}
function cleanToken(value){const token=String(value||"").trim();return/^[A-Za-z0-9_-]{40,160}$/.test(token)?token:"";}
function cleanStreamId(value){const id=String(value||"").trim();return/^[A-Za-z0-9-]{20,80}$/.test(id)?id:"";}
function safeContainerKey(value){const raw=String(value||"anonymous").replace(/[^A-Za-z0-9_-]/g,"");return(raw||"anonymous").slice(0,80);}
function finiteNumber(value,min,max){const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;}
function roundTime(value){return Math.round(Number(value||0)*1000)/1000;}
function cleanSubtitleText(value){return String(value||"").replace(/\s+([,.;:!?،؛؟])/g,"$1").replace(/\s+/g," ").trim();}
function cleanTranslatedText(value){return cleanSubtitleText(value).replace(/^["“”'‘’]+/u,"").replace(/["“”'‘’]+$/u,"").trim();}
function publicScribeError(type,message){
  if(type==="quota_exceeded")return"Speech-to-text quota is unavailable";
  if(type==="rate_limited")return"Realtime transcription is rate limited";
  if(type==="auth_error")return"Realtime transcription authentication failed";
  if(type==="unaccepted_terms")return"Scribe realtime terms must be accepted";
  if(type==="insufficient_audio_activity")return"Realtime transcription did not receive enough audio";
  if(type==="session_time_limit_exceeded")return"Realtime transcription session time limit was reached";
  const detail=String(message?.error||message?.message||"");console.error("Vexa Scribe realtime error",type,detail.slice(0,700));return"Realtime transcription is temporarily unavailable";
}
function bytesToBase64(bytes){let binary="";for(let offset=0;offset<bytes.byteLength;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(bytes.byteLength,offset+0x8000)));return btoa(binary);}
function concatBytes(left,right){if(!left.byteLength)return right.slice();const merged=new Uint8Array(left.byteLength+right.byteLength);merged.set(left,0);merged.set(right,left.byteLength);return merged;}
function httpError(message,status){const error=new Error(message);error.status=status;return error;}
function publicError(error){const status=Number(error?.status||500);if(status>=400&&status<500)return String(error?.message||"Request failed");const message=String(error?.message||"");if(/translation/i.test(message))return message;if(/transcription|speech-to-text/i.test(message))return message;return"Live subtitles are temporarily unavailable";}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}

function replaceRequired(source,search,replacement,label){
  if(!source.includes(search))throw new Error("Vexa warm runtime patch failed: "+label);
  return source.replace(search,replacement);
}
function patchClientRuntime(source){
  let runtime=String(source||"");
  runtime=replaceRequired(runtime,
    'let enabled=false,targetLanguage="original",socket=null,generation=0;',
    'let enabled=false,targetLanguage="original",socket=null,generation=0,warmupActive=false,warmupResume=false;',
    'state');
  runtime=replaceRequired(runtime,
    'function stopSubtitles(p){enabled=false;targetLanguage="original";closeSocket();hideCaption(p);}',
    'function stopSubtitles(p){const v=p.querySelector("video"),resume=warmupActive&&warmupResume;enabled=false;targetLanguage="original";warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");closeSocket();hideCaption(p);if(resume&&v&&!v.ended)Promise.resolve(v.play()).catch(()=>{});}',
    'stopSubtitles');
  runtime=replaceRequired(runtime,
    'function startSubtitles(p,l){\n const v=p.querySelector("video");if(!v||!playbackToken(v))return;\n enabled=true;targetLanguage=l;closeSocket();\n hideCaption(p);\n if(!v.paused&&!v.ended)connectRealtime(p,v);\n}',
    'function startSubtitles(p,l){\n const v=p.querySelector("video");if(!v||!playbackToken(v))return;\n const wasPlaying=warmupActive?warmupResume:!v.paused&&!v.ended;enabled=true;targetLanguage=l;closeSocket();hideCaption(p);warmupActive=true;warmupResume=wasPlaying;p.classList.add("is-buffering");try{v.pause();}catch{}connectRealtime(p,v);\n}',
    'startSubtitles');
  runtime=replaceRequired(runtime,
    'if(!enabled||!v||v.paused||v.ended)return;',
    'if(!enabled||!v||v.ended||(!warmupActive&&v.paused))return;',
    'connect guard');
  runtime=replaceRequired(runtime,
    'if(message.type==="audio_ready"){\n     ws.send(JSON.stringify({type:"playback_start",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1)))}));\n     return;\n   }',
    'if(message.type==="audio_ready"){\n     ws.send(JSON.stringify({type:"playback_start",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:warmupActive?false:playbackIsRunning(v),warmup:warmupActive}));\n     return;\n   }',
    'audio_ready');
  runtime=replaceRequired(runtime,
    'if(message.type==="ready"){hideCaption(p);return;}\n   if(message.type==="caption"){const text=String(message.text||"").trim();if(text)showCaption(p,text,false);return;}\n   if(message.type==="error"){ws.__vexaFailed=true;showCaption(p,String(message.error||"Live subtitles are unavailable"),true);return;}',
    'if(message.type==="ready"){hideCaption(p);return;}\n   if(message.type==="warmup_ready"){if(warmupActive){try{ws.send(JSON.stringify({type:"warmup_complete",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:false,warmup:false}));}catch{}const resume=warmupResume;warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");if(resume&&!v.ended){v.__vexaSubtitlePlaying=false;Promise.resolve(v.play()).catch(()=>{});}}return;}\n   if(message.type==="caption"){const text=String(message.text||"").trim();if(text)showCaption(p,text,false);return;}\n   if(message.type==="caption_clear"){hideCaption(p);return;}\n   if(message.type==="translation_error"){if(warmupActive){const resume=warmupResume;warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");showCaption(p,String(message.error||"AI translation is temporarily unavailable"),true);if(resume&&!v.ended)Promise.resolve(v.play()).catch(()=>{});}return;}\n   if(message.type==="error"){ws.__vexaFailed=true;const resume=warmupActive&&warmupResume;warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");showCaption(p,String(message.error||"Live subtitles are unavailable"),true);if(resume&&!v.ended)Promise.resolve(v.play()).catch(()=>{});return;}',
    'message handling');
  runtime=replaceRequired(runtime,
    'function restartFromCurrentTime(p){',
    'function playbackIsRunning(v){if(!v)return false;if(typeof v.__vexaSubtitlePlaying==="boolean")return v.__vexaSubtitlePlaying;return Boolean(!v.paused&&!v.ended&&Number(v.readyState||0)>=3);}\nfunction sendPlaybackState(v,playing){const current=socket;if(!v)return;if(typeof playing==="boolean")v.__vexaSubtitlePlaying=playing;if(!current||current.readyState!==WebSocket.OPEN)return;try{current.send(JSON.stringify({type:"playback_state",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:playbackIsRunning(v),warmup:false}));}catch{}}\nfunction restartFromCurrentTime(p){',
    'playback helpers');
  runtime=replaceRequired(runtime,
    'v.addEventListener("play",()=>{if(enabled)connectRealtime(p,v);});',
    'v.addEventListener("play",()=>{if(enabled){if(warmupActive){try{v.pause();}catch{}return;}v.__vexaSubtitlePlaying=false;connectRealtime(p,v);sendPlaybackState(v,false);}});',
    'play event');
  runtime=replaceRequired(runtime,
    'v.addEventListener("playing",()=>{if(enabled)connectRealtime(p,v);});',
    'v.addEventListener("playing",()=>{if(enabled&&!warmupActive){v.__vexaSubtitlePlaying=true;connectRealtime(p,v);sendPlaybackState(v,true);}});',
    'playing event');
  runtime=replaceRequired(runtime,
    'v.addEventListener("pause",()=>{if(enabled)closeSocket();hideCaption(p);});',
    'v.addEventListener("pause",()=>{if(enabled){v.__vexaSubtitlePlaying=false;if(warmupActive)return;sendPlaybackState(v,false);hideCaption(p);}});',
    'pause event');
  runtime=replaceRequired(runtime,
    'v.addEventListener("waiting",()=>{if(enabled)closeSocket();hideCaption(p);});',
    'v.addEventListener("waiting",()=>{if(enabled&&!warmupActive){v.__vexaSubtitlePlaying=false;sendPlaybackState(v,false);}});',
    'waiting event');
  runtime=replaceRequired(runtime,
    'v.addEventListener("seeking",()=>{if(enabled)closeSocket();hideCaption(p);});',
    'v.addEventListener("timeupdate",()=>{if(enabled&&!warmupActive)sendPlaybackState(v);});\n v.addEventListener("stalled",()=>{if(enabled&&!warmupActive){v.__vexaSubtitlePlaying=false;sendPlaybackState(v,false);}});\n v.addEventListener("seeking",()=>{if(enabled){warmupActive=false;warmupResume=false;p.classList.remove("is-buffering");closeSocket();hideCaption(p);}});',
    'timeupdate/seeking');
  return runtime;
}

export const LIVE_SUBTITLES_RUNTIME_JS=patchClientRuntime(ORIGINAL_LIVE_SUBTITLES_RUNTIME_JS);
