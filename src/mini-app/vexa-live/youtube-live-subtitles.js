import { Container, getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-3";
const TRANSLATION_MODEL="gpt-5.6-luna";
const TRANSLATE_TIMEOUT_MS=12000;
const PCM_SAMPLE_RATE=16000, PCM_BYTES_PER_SECOND=32000, PCM_FRAME_BYTES=3200;
const CONTEXT_CHAR_LIMIT=1200, LIVE_SOURCE_LIMIT=180, INITIAL_AUDIO_BURST_SECONDS=2.2;
const VAD_SILENCE_SECONDS=.45, VAD_THRESHOLD=.4, VAD_MIN_SPEECH_MS=100, VAD_MIN_SILENCE_MS=100;

const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const FATAL_SCRIBE_ERRORS=new Set(["auth_error","quota_exceeded","input_error","unaccepted_terms","chunk_size_exceeded","invalid_request"]);
const RETRYABLE_SCRIBE_ERRORS=new Set(["error","transcriber_error","commit_throttled","rate_limited","queue_overflow","resource_exhausted","session_time_limit_exceeded","insufficient_audio_activity"]);

export class VexaSubtitleContainer extends Container {
  sleepAfter="2m";
  enableInternet=true;
  entrypoint=["sh","-c","trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudioProcesses=new Map();

  async streamAudioPcm(mediaUrl,startSeconds,streamId,playbackRate=1){
    if(!this.ctx.container.running) await this.start();
    const id=cleanStreamId(streamId);
    if(!id) throw new Error("Subtitle audio stream id is invalid");
    const prior=this.activeAudioProcesses.get(id);
    if(prior){try{prior.kill();}catch{} this.activeAudioProcesses.delete(id);}
    const rate=Math.max(.25,Math.min(4,Number(playbackRate)||1));
    const process=await this.ctx.container.exec([
      "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
      "-readrate",rate.toFixed(3),"-readrate_initial_burst",String(INITIAL_AUDIO_BURST_SECONDS),
      "-ss",Number(startSeconds||0).toFixed(3),"-i",String(mediaUrl),
      "-vn","-ac","1","-ar",String(PCM_SAMPLE_RATE),"-c:a","pcm_s16le","-f","s16le","pipe:1"
    ]);
    if(!process.stdout){try{process.kill();}catch{} throw new Error("Could not start realtime subtitle audio");}
    this.activeAudioProcesses.set(id,process);
    process.exitCode.catch(()=>-1).finally(()=>{if(this.activeAudioProcesses.get(id)===process)this.activeAudioProcesses.delete(id);});
    return process.stdout;
  }

  async stopAudioStream(streamId){
    const id=cleanStreamId(streamId), process=id&&this.activeAudioProcesses.get(id);
    if(!process)return false;
    this.activeAudioProcesses.delete(id);
    try{process.kill();}catch{}
    return true;
  }
}

export function isVexaLiveSubtitlesRequest(request){
  const p=new URL(request.url).pathname;
  return p===SOCKET_PATH||p===RUNTIME_PATH;
}

export async function handleVexaLiveSubtitlesRequest(request,env,ctx){
  const p=new URL(request.url).pathname;
  if(request.method==="GET"&&p===RUNTIME_PATH)return new Response(LIVE_SUBTITLES_RUNTIME_JS,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store, no-cache, must-revalidate","X-Content-Type-Options":"nosniff"}});
  if(request.method==="GET"&&p===SOCKET_PATH){
    if(String(request.headers.get("Upgrade")||"").toLowerCase()!=="websocket")return new Response("WebSocket Required",{status:426});
    return createRealtimeSubtitleSocket(request,env,ctx);
  }
  return json({error:"Method Not Allowed"},405);
}

export async function appendVexaLiveSubtitlesRuntime(request,response){
  if(!response?.ok||request.method!=="GET")return response;
  const p=new URL(request.url).pathname;
  if(p!=="/mini-app/vexa-live"&&p!=="/mini-app/vexa-live/")return response;
  if(!String(response.headers.get("Content-Type")||"").toLowerCase().includes("text/html"))return response;
  const source=await response.text(), tag='<script src="'+RUNTIME_PATH+'?v='+RUNTIME_VERSION+'"></script>';
  const html=source.includes(RUNTIME_PATH)?source:source.includes("</body>")?source.replace("</body>",tag+"\n</body>"):source+tag;
  const headers=new Headers(response.headers);
  headers.delete("Content-Length");headers.delete("Content-Encoding");headers.set("Cache-Control","no-store, no-cache, must-revalidate");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function createRealtimeSubtitleSocket(request,env){
  const pair=new WebSocketPair(), [client,server]=Object.values(pair);
  server.accept();
  const controller=new AbortController();
  let started=false;
  const send=v=>{if(server.readyState===WebSocket.OPEN)try{server.send(JSON.stringify(v));}catch{}};
  const abort=()=>{if(!controller.signal.aborted)controller.abort();};
  const fail=e=>{if(controller.signal.aborted)return;console.error("Vexa realtime subtitle session failed",e?.stack||e);send({type:"error",error:publicError(e),retryable:isRetryableSessionError(e)});abort();try{server.close(1011,"subtitle session failed");}catch{}};

  server.addEventListener("message",event=>{
    let m;try{m=JSON.parse(String(event.data||"{}"));}catch{return;}
    if(m?.type==="start"){
      if(started)return;started=true;
      runRealtimeSubtitleSession({request,env,server,payload:m,signal:controller.signal,send,abort}).catch(fail);
    }else if(m?.type==="stop"){
      abort();try{server.close(1000,"stopped");}catch{}
    }
  });
  server.addEventListener("close",abort);server.addEventListener("error",abort);
  return new Response(null,{status:101,webSocket:client});
}

async function runRealtimeSubtitleSession({request,env,server,payload,signal,send,abort}){
  const user=await authenticateMiniAppPayload(payload,env);
  await assertLiveAccess(env,user.id);
  const token=cleanToken(payload.playbackToken);
  if(!token)throw httpError("Video session is invalid",400);
  const targetLanguage=normalizeTargetLanguage(payload.targetLanguage);
  if(!targetLanguage||targetLanguage==="off")throw httpError("Subtitle language is invalid",400);
  const start=finiteNumber(payload.currentTime,0,86400);
  if(start===null)throw httpError("Subtitle start time is invalid",400);
  const playbackRate=finiteNumber(payload.playbackRate,.25,4)??1;

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
  scribeUrl.searchParams.set("vad_silence_threshold_secs",String(VAD_SILENCE_SECONDS));
  scribeUrl.searchParams.set("vad_threshold",String(VAD_THRESHOLD));
  scribeUrl.searchParams.set("min_speech_duration_ms",String(VAD_MIN_SPEECH_MS));
  scribeUrl.searchParams.set("min_silence_duration_ms",String(VAD_MIN_SILENCE_MS));
  scribeUrl.searchParams.set("include_timestamps","true");
  scribeUrl.searchParams.set("include_language_detection","true");

  const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
  const upstream=upstreamResponse.webSocket;
  if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
  upstream.accept();

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));

  let audioStream=null,audioSecondsSent=0,sourceContext="",upstreamEndedNormally=false,sentActivity=false,segmentIndex=0,revision=0;
  let latestTranslationJob=null,translationLoopPromise=null,lastQueuedSource="";
  const timestampState={offset:0,lastEnd:0},committedSegments=[];

  const closeUpstream=()=>{try{upstream.close(1000,"done");}catch{}};
  signal.addEventListener("abort",closeUpstream,{once:true});

  const queueLiveTranslation=(rawText,{final=false,force=false,timing=null,slot=null}={})=>{
    const text=cleanSubtitleText(rawText).slice(-LIVE_SOURCE_LIMIT);
    if(!text)return;
    if(!force&&!shouldTranslatePartial(text,lastQueuedSource))return;
    lastQueuedSource=text;
    const resolvedSlot=slot===null?String(segmentIndex):String(slot);
    latestTranslationJob={text,final,timing:timing||estimateLiveTiming(start,audioSecondsSent,text),context:sourceContext,slot:resolvedSlot,revision:++revision};
    if(!translationLoopPromise)translationLoopPromise=runTranslationLoop();
  };

  const runTranslationLoop=()=>{
    translationLoopPromise=(async()=>{
      while(latestTranslationJob&&!signal.aborted&&server.readyState===WebSocket.OPEN){
        const job=latestTranslationJob;latestTranslationJob=null;
        try{
          const translated=await streamLiveSubtitleTranslation({
            env,sourceText:job.text,context:job.context,targetLanguage,signal,
            onText:text=>{if(!signal.aborted&&text)send({type:"preview",slot:job.slot,revision:job.revision,start:job.timing.start,end:job.timing.end,text,complete:false});}
          });
          if(!signal.aborted&&translated)send({type:"preview",slot:job.slot,revision:job.revision,start:job.timing.start,end:job.timing.end,text:translated,complete:job.final});
        }catch(e){
          if(signal.aborted)return;
          console.error("Vexa live subtitle translation failed",e?.stack||e);
          send({type:"translation_error",error:publicError(e)});
        }
      }
    })().finally(()=>{translationLoopPromise=null;if(latestTranslationJob&&!signal.aborted)runTranslationLoop();});
    return translationLoopPromise;
  };

  upstream.addEventListener("message",event=>{
    if(signal.aborted)return;
    let m;try{m=JSON.parse(String(event.data||"{}"));}catch{return;}
    const type=String(m?.message_type||"");
    if(type==="session_started"){send({type:"ready",model:"scribe_v2_realtime"});return;}

    if(type==="partial_transcript"||type==="final_transcript"){
      const text=cleanSubtitleText(m?.text);if(!text)return;
      if(!sentActivity){sentActivity=true;send({type:"activity"});}
      const timing=estimateLiveTiming(start,audioSecondsSent,text);
      if(targetLanguage==="original")send({type:"preview",slot:String(segmentIndex),revision:++revision,start:timing.start,end:timing.end,text,complete:type==="final_transcript"});
      else queueLiveTranslation(text,{force:type==="final_transcript",final:type==="final_transcript",timing});
      return;
    }

    if(type==="committed_transcript"){
      const text=cleanSubtitleText(m?.text),slot=String(segmentIndex),timing=estimateLiveTiming(start,audioSecondsSent,text);
      if(text){
        committedSegments.push({slot,text});
        if(committedSegments.length>16)committedSegments.shift();
        if(targetLanguage==="original")send({type:"preview",slot,revision:++revision,start:timing.start,end:timing.end,text,complete:true});
        else queueLiveTranslation(text,{force:true,final:true,timing,slot});
        sourceContext=appendContext(sourceContext,text);
      }
      segmentIndex+=1;lastQueuedSource="";
      return;
    }

    if(type==="committed_transcript_with_timestamps"){
      const pending=committedSegments.shift()||{slot:String(Math.max(0,segmentIndex-1)),text:cleanSubtitleText(m?.text)};
      const timing=timingFromScribeWords(m,start,timestampState);
      if(timing)send({type:"timing",slot:pending.slot,start:timing.start,end:timing.end,exact:true});
      return;
    }

    if(FATAL_SCRIBE_ERRORS.has(type)||RETRYABLE_SCRIBE_ERRORS.has(type)||type==="error"){
      const detail=String(m?.error||m?.message||"Realtime transcription failed"), retryable=!FATAL_SCRIBE_ERRORS.has(type);
      send({type:"error",error:publicScribeError(type,detail),retryable});abort();
      try{upstream.close(1011,"scribe error");}catch{}try{server.close(1011,"scribe error");}catch{}
    }
  });
  upstream.addEventListener("error",()=>{if(signal.aborted)return;send({type:"error",error:"Realtime transcription connection failed",retryable:true});abort();try{server.close(1011,"scribe connection failed");}catch{}});
  upstream.addEventListener("close",()=>{if(signal.aborted||upstreamEndedNormally)return;send({type:"error",error:"Realtime transcription connection closed",retryable:true});abort();try{server.close(1011,"scribe connection closed");}catch{}});

  try{
    audioStream=await container.streamAudioPcm(playbackUrl,start,streamId,playbackRate);
    if(!audioStream)throw httpError("Could not start realtime subtitle audio",502);
    await streamPcmToScribe({audioStream,upstream,signal,onProgress:s=>{audioSecondsSent=s;}});
    if(!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      const silence=new Uint8Array(PCM_FRAME_BYTES);
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(silence),sample_rate:PCM_SAMPLE_RATE,commit:true}));
      await sleep(700,signal).catch(()=>null);
      if(translationLoopPromise)await translationLoopPromise.catch(()=>null);
      upstreamEndedNormally=true;
      if(!signal.aborted)send({type:"ended"});
    }
  }finally{
    signal.removeEventListener("abort",closeUpstream);
    if(audioStream)try{await audioStream.cancel();}catch{}
    try{await container.stopAudioStream(streamId);}catch{}
    closeUpstream();
  }
}

async function streamPcmToScribe({audioStream,upstream,signal,onProgress}){
  const reader=audioStream.getReader();let pending=new Uint8Array(0),bytesSent=0;
  const abortReader=()=>{try{reader.cancel();}catch{}};
  signal.addEventListener("abort",abortReader,{once:true});
  try{
    while(!signal.aborted){
      const next=await reader.read();if(next.done)break;if(!next.value?.byteLength)continue;
      pending=concatBytes(pending,next.value);
      while(pending.byteLength>=PCM_FRAME_BYTES&&!signal.aborted){
        const frame=pending.slice(0,PCM_FRAME_BYTES);pending=pending.slice(PCM_FRAME_BYTES);
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE}));
        bytesSent+=frame.byteLength;onProgress?.(bytesSent/PCM_BYTES_PER_SECOND);
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
      bytesSent+=pending.byteLength;onProgress?.(bytesSent/PCM_BYTES_PER_SECOND);
    }
    return bytesSent/PCM_BYTES_PER_SECOND;
  }finally{signal.removeEventListener("abort",abortReader);try{await reader.cancel();}catch{}}
}

function shouldTranslatePartial(text,last){
  const current=cleanSubtitleText(text),previous=cleanSubtitleText(last);
  if(!current||current===previous)return false;
  const currentWords=current.split(/\s+/u).filter(Boolean).length;
  if(currentWords<2)return false;
  if(!previous)return true;
  const previousWords=previous.split(/\s+/u).filter(Boolean).length;
  if(/[.!?…؟]$/u.test(current))return true;
  if(currentWords>=previousWords+2)return true;
  return !current.startsWith(previous)&&Math.abs(current.length-previous.length)>=6;
}

function estimateLiveTiming(baseStart,audioSecondsSent,text){
  const words=cleanSubtitleText(text).split(/\s+/u).filter(Boolean).length;
  const duration=Math.min(4.2,Math.max(.9,words*.34+.4));
  const end=Number(baseStart||0)+Math.max(0,Number(audioSecondsSent||0))+.3;
  return{start:roundTime(Math.max(Number(baseStart||0),end-duration)),end:roundTime(Math.max(Number(baseStart||0)+.35,end))};
}

function timingFromScribeWords(message,baseStart,state){
  const words=(Array.isArray(message?.words)?message.words:[]).filter(w=>Number.isFinite(Number(w?.start))&&Number.isFinite(Number(w?.end)));
  if(!words.length)return null;
  const first=Number(words[0].start),last=Number(words[words.length-1].end);
  if(first+state.offset<state.lastEnd-.25)state.offset=Math.max(0,state.lastEnd+.08-first);
  const relativeStart=Math.max(0,state.offset+first),relativeEnd=Math.max(relativeStart+.25,state.offset+last);
  state.lastEnd=Math.max(state.lastEnd,relativeEnd);
  return{start:roundTime(Number(baseStart||0)+relativeStart),end:roundTime(Number(baseStart||0)+relativeEnd+.22)};
}

async function streamLiveSubtitleTranslation({env,sourceText,context,targetLanguage,signal,onText}){
  if(!env.GPT_API)throw httpError("AI translation is unavailable",503);
  const languageName=TARGET_LANGUAGES[targetLanguage],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TRANSLATE_TIMEOUT_MS);
  const abortFromParent=()=>controller.abort();signal?.addEventListener?.("abort",abortFromParent,{once:true});
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+env.GPT_API,"Content-Type":"application/json","Accept":"text/event-stream"},signal:controller.signal,body:JSON.stringify({
      model:TRANSLATION_MODEL,
      instructions:[
        "Translate ONLY the current live video subtitle into "+languageName+".",
        "Use natural everyday spoken language and preserve tone, slang, names, numbers and meaning.",
        "The current subtitle may be incomplete because it is live. Translate only what is present and never invent the missing ending.",
        "Previous context is for understanding only; never repeat it unless it is present in the current subtitle.",
        "Keep the subtitle short and readable on a phone. Return only the translation without labels or markdown."
      ].join(" "),
      input:JSON.stringify({previous_source_context:String(context||"").slice(-CONTEXT_CHAR_LIMIT),current_live_subtitle:String(sourceText||"").slice(-LIVE_SOURCE_LIMIT),target_language:languageName}),
      reasoning:{effort:"none"},text:{verbosity:"low"},max_output_tokens:140,store:false,stream:true
    })});
    if(!response.ok||!response.body){const detail=await response.text().catch(()=>"");console.error("Vexa Luna live translation request failed",response.status,detail.slice(0,900));throw httpError("AI translation is temporarily unavailable",502);}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",output="";
    while(!controller.signal.aborted){
      const part=await reader.read();if(part.done)break;
      buffer+=decoder.decode(part.value,{stream:true}).replace(/\r\n/g,"\n");
      let boundary;
      while((boundary=buffer.indexOf("\n\n"))>=0){
        const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
        for(const line of block.split("\n")){
          if(!line.startsWith("data:"))continue;
          const raw=line.slice(5).trim();if(!raw||raw==="[DONE]")continue;
          let event;try{event=JSON.parse(raw);}catch{continue;}
          if(event?.type==="response.output_text.delta"&&typeof event.delta==="string"){
            output+=event.delta;const cleaned=cleanLiveTranslatedSubtitle(output);if(cleaned)onText?.(cleaned);
          }else if(event?.type==="response.output_text.done"&&typeof event.text==="string")output=event.text;
          else if(event?.type==="error")throw new Error(String(event?.error?.message||event?.message||"Live translation failed"));
        }
      }
    }
    return cleanTranslatedSubtitle(output);
  }catch(e){if(controller.signal.aborted&&!signal?.aborted)throw httpError("Live translation timed out",504);throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener?.("abort",abortFromParent);}
}

async function selectedElevenApiKey(env){const name=await getElevenApiSetting(env);return String(env[name]||"").trim();}
async function assertLiveAccess(env,userId){if(await isAdmin(env,userId))return;const[g,l]=await Promise.all([getMiniAppAccessSettings(env),getVexaLiveAccessSettings(env)]);if(g.adminOnly||l.adminOnly)throw httpError("Vexa Live is updating",423);}
function normalizeTargetLanguage(v){const k=String(v||"original").trim().toLowerCase();return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES,k)?k:"";}
function cleanToken(v){const t=String(v||"").trim();return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:"";}
function cleanStreamId(v){const t=String(v||"").trim();return/^[A-Za-z0-9_-]{8,80}$/.test(t)?t:"";}
function safeContainerKey(v){const r=String(v||"anonymous").replace(/[^A-Za-z0-9_-]/g,"");return(r||"anonymous").slice(0,80);}
function finiteNumber(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function roundTime(v){return Math.round(Number(v||0)*1000)/1000;}
function cleanSubtitleText(v){return String(v||"").replace(/\s+([,.;:!?،؛؟])/g,"$1").replace(/\s+/g," ").trim();}
function cleanLiveTranslatedSubtitle(v){return cleanSubtitleText(v).replace(/^["“”'‘’]+/u,"").replace(/["“”'‘’]+$/u,"").replace(/([!?؟])\1+/g,"$1").replace(/\s*[.。\u06D4]+$/u,"").trim();}
function cleanTranslatedSubtitle(v){return cleanLiveTranslatedSubtitle(v).replace(/\s*[;؛]+\s*$/u,"").trim();}
function appendContext(a,b){return cleanSubtitleText((String(a||"")+" "+String(b||"")).trim()).slice(-CONTEXT_CHAR_LIMIT);}
function publicScribeError(type,detail){
  if(type==="quota_exceeded")return"Speech-to-text quota is unavailable";
  if(type==="rate_limited")return"Live subtitles are temporarily rate limited";
  if(type==="unaccepted_terms")return"Scribe realtime terms must be accepted in ElevenLabs";
  if(type==="session_time_limit_exceeded")return"Live subtitle session reached its time limit";
  if(type==="auth_error")return"Realtime transcription authentication failed";
  if(type==="input_error"||type==="chunk_size_exceeded"||type==="invalid_request"){console.error("Vexa Scribe request error",type,String(detail||"").slice(0,700));return"Realtime transcription request was rejected";}
  console.error("Vexa Scribe realtime error",type,String(detail||"").slice(0,700));return"Realtime transcription is temporarily unavailable";
}
function isRetryableSessionError(e){const m=String(e?.message||"");if(m==="AI translation is unavailable"||m==="Speech-to-text is unavailable")return false;const s=Number(e?.status||500);return s>=500||s===429;}
function bytesToBase64(bytes){let binary="";for(let o=0;o<bytes.byteLength;o+=0x8000)binary+=String.fromCharCode(...bytes.subarray(o,Math.min(bytes.byteLength,o+0x8000)));return btoa(binary);}
function concatBytes(a,b){if(!a.byteLength)return b.slice();const m=new Uint8Array(a.byteLength+b.byteLength);m.set(a,0);m.set(b,a.byteLength);return m;}
function sleep(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new Error("aborted"));let done=false;const finish=fn=>{if(done)return;done=true;signal?.removeEventListener?.("abort",onAbort);fn();};const timer=setTimeout(()=>finish(resolve),Math.max(0,Number(ms||0)));const onAbort=()=>{clearTimeout(timer);finish(()=>reject(new Error("aborted")));};signal?.addEventListener?.("abort",onAbort,{once:true});});}
function httpError(message,status){const e=new Error(message);e.status=status;return e;}
function publicError(e){const s=Number(e?.status||500);if(s>=400&&s<500)return String(e?.message||"Request failed");const m=String(e?.message||"");if(/translation|transcription|speech-to-text/i.test(m))return m;return"Live subtitles are temporarily unavailable";}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}

export const LIVE_SUBTITLES_RUNTIME_JS=String.raw`
(function(){
const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime",PLAYER_ID="vexaCustomPlayer",STYLE_ID="vexaLiveSubtitlesStyle";
const LANGUAGES=[["off","Off",""],["original","Original audio","Auto"],["en","English","EN"],["fa","فارسی","FA"],["ru","Русский","RU"],["de","Deutsch","DE"],["tr","Türkçe","TR"],["es","Español","ES"],["ar","العربية","AR"],["fr","Français","FR"],["pt","Português","PT"],["it","Italiano","IT"],["hi","हिन्दी","HI"],["zh","中文","ZH"],["ja","日本語","JA"],["ko","한국어","KO"]];
let enabled=false,targetLanguage="original",socket=null,socketGeneration=0,reconnectTimer=0,reconnectAttempt=0,slots=new Map(),exactTimings=new Map();

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const h=hostWindow();return window.Telegram?.WebApp||h.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||"");}
function haptic(s){try{telegram()?.HapticFeedback?.impactOccurred?.(s||"light");}catch{}}
function playbackToken(v){try{const t=new URL(String(v?.currentSrc||v?.src||""),window.location.origin).searchParams.get("token")||"";return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:"";}catch{return"";}}
function websocketUrl(){const u=new URL(SOCKET_PATH,window.location.href);u.protocol=u.protocol==="https:"?"wss:":"ws:";return u.href;}

function installStyle(){
 if(document.getElementById(STYLE_ID))return;
 const s=document.createElement("style");s.id=STYLE_ID;
 s.textContent="#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}#vexaCustomPlayer .vexa-subtitle-text{max-width:min(780px,92%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:clamp(15px,3.8vw,22px);line-height:1.32;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}#vexaCustomPlayer.is-fullscreen .vexa-subtitle-drawer{bottom:calc(10px + env(safe-area-inset-bottom))}";
 document.head.appendChild(s);
}

function installUI(player){
 if(player.querySelector("[data-vexa-subtitles]"))return;
 const row=player.querySelector(".vexa-player-row"),spacer=row?.querySelector(".vexa-player-spacer");if(!row||!spacer)return;
 const b=document.createElement("button");b.type="button";b.className="vexa-player-small vexa-subtitle-toggle";b.setAttribute("data-vexa-subtitles","1");b.setAttribute("aria-label","Live subtitles");b.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M18 10a2 2 0 1 0 0 4"/></svg>';row.insertBefore(b,spacer);
 const layer=document.createElement("div");layer.className="vexa-subtitle-layer";layer.innerHTML='<div class="vexa-subtitle-text" data-subtitle-text></div>';player.appendChild(layer);
 const back=document.createElement("div");back.className="vexa-subtitle-drawer-backdrop";back.setAttribute("data-subtitle-backdrop","1");player.appendChild(back);
 const drawer=document.createElement("div");drawer.className="vexa-subtitle-drawer";drawer.setAttribute("data-subtitle-drawer","1");drawer.innerHTML='<div class="vexa-subtitle-drawer-head"><div class="vexa-subtitle-drawer-title">Live subtitles</div><div class="vexa-subtitle-drawer-sub">Translate to</div></div><div class="vexa-subtitle-language-list">'+LANGUAGES.map(x=>'<button type="button" class="vexa-subtitle-language" data-language="'+x[0]+'"><span class="vexa-subtitle-lang-code">'+(x[2]||"—")+'</span><span class="vexa-subtitle-lang-name">'+x[1]+'</span><span class="vexa-subtitle-check">✓</span></button>').join("")+"</div>";player.appendChild(drawer);
 b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openDrawer(player);});
 back.addEventListener("click",()=>closeDrawer(player));
 drawer.addEventListener("click",e=>{const o=e.target?.closest?.("[data-language]");if(!o)return;e.preventDefault();e.stopPropagation();chooseLanguage(player,String(o.dataset.language||"off"));});
 updateLanguageSelection(player);
}
function openDrawer(p){updateLanguageSelection(p);p.querySelector("[data-subtitle-backdrop]")?.classList.add("show");p.querySelector("[data-subtitle-drawer]")?.classList.add("show");haptic("light");}
function closeDrawer(p){p.querySelector("[data-subtitle-backdrop]")?.classList.remove("show");p.querySelector("[data-subtitle-drawer]")?.classList.remove("show");}
function updateLanguageSelection(p){const s=enabled?targetLanguage:"off";p.querySelectorAll("[data-language]").forEach(n=>n.classList.toggle("is-selected",String(n.dataset.language)===s));p.querySelector("[data-vexa-subtitles]")?.classList.toggle("is-active",enabled);}
function chooseLanguage(p,l){closeDrawer(p);l==="off"?stopSubtitles(p):startSubtitles(p,l);updateLanguageSelection(p);haptic("medium");}
function stopSubtitles(p){enabled=false;targetLanguage="original";socketGeneration++;reconnectAttempt=0;slots.clear();exactTimings.clear();clearTimeout(reconnectTimer);reconnectTimer=0;closeSocket(true);hideCaption(p);}
function startSubtitles(p,l){const v=p.querySelector("video");if(!v||!playbackToken(v))return;enabled=true;targetLanguage=l;reconnectAttempt=0;slots.clear();exactTimings.clear();socketGeneration++;showCaption(p,v.paused?"Live subtitles ready":"Starting live subtitles…",false);if(!v.paused&&!v.ended)connectRealtime(p,socketGeneration);}
function closeSocket(intentional){const a=socket;socket=null;if(!a)return;a.__vexaIntentionalClose=Boolean(intentional);try{if(a.readyState===WebSocket.OPEN)a.send(JSON.stringify({type:"stop"}));}catch{}try{a.close(1000,"restart");}catch{}}
function scheduleReconnect(p,g){if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;clearTimeout(reconnectTimer);const d=Math.min(5000,500*Math.pow(2,Math.min(3,reconnectAttempt++)));showCaption(p,"Reconnecting subtitles…",false);reconnectTimer=setTimeout(()=>connectRealtime(p,g),d);}
function connectRealtime(p,g){
 if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;const token=playbackToken(v);if(!token)return;
 closeSocket(true);slots.clear();exactTimings.clear();
 const ws=new WebSocket(websocketUrl());socket=ws;
 ws.addEventListener("open",()=>{if(!enabled||g!==socketGeneration||socket!==ws){try{ws.close();}catch{}return;}ws.send(JSON.stringify({type:"start",initData:initData(),playbackToken:token,currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),targetLanguage}));});
 ws.addEventListener("message",e=>{
   if(!enabled||g!==socketGeneration||socket!==ws)return;let d;try{d=JSON.parse(String(e.data||"{}"));}catch{return;}
   if(d.type==="ready"){showCaption(p,"Listening…",false);return;}
   if(d.type==="activity"){showCaption(p,"Transcribing…",false);return;}
   if(d.type==="timing"){
     const slot=String(d.slot||"live"),start=Number(d.start),end=Number(d.end);if(!Number.isFinite(start)||!Number.isFinite(end))return;
     const timing={start,end:Math.max(end,start+.25)};exactTimings.set(slot,timing);
     const prior=slots.get(slot);if(prior){slots.set(slot,{...prior,...timing});renderCaption(p,v);}return;
   }
   if(d.type==="preview"){
     const text=String(d.text||"").trim(),start=Number(d.start),end=Number(d.end),revision=Number(d.revision||0),slot=String(d.slot||"live");if(!text||!Number.isFinite(start)||!Number.isFinite(end))return;
     const prior=slots.get(slot);if(prior&&Number(prior.revision||0)>revision)return;
     const exact=exactTimings.get(slot);slots.set(slot,{text,start:exact?.start??start,end:Math.max(exact?.end??end,(exact?.start??start)+.25),revision,complete:Boolean(d.complete)});reconnectAttempt=0;renderCaption(p,v);return;
   }
   if(d.type==="translation_error"){showCaption(p,String(d.error||"Translation temporarily unavailable"),true);return;}
   if(d.type==="error"){if(d.retryable!==false){showCaption(p,"Reconnecting subtitles…",false);try{ws.close();}catch{}}else{enabled=false;updateLanguageSelection(p);showCaption(p,String(d.error||"Live subtitles unavailable"),true);closeSocket(true);}return;}
   if(d.type==="ended")closeSocket(true);
 });
 ws.addEventListener("close",()=>{if(socket===ws)socket=null;if(enabled&&g===socketGeneration&&!ws.__vexaIntentionalClose&&!v.paused&&!v.ended)scheduleReconnect(p,g);});
 ws.addEventListener("error",()=>{if(socket===ws)try{ws.close();}catch{}});
}
function restartFromCurrentTime(p){if(!enabled)return;const v=p.querySelector("video");if(!v)return;socketGeneration++;const g=socketGeneration;reconnectAttempt=0;slots.clear();exactTimings.clear();closeSocket(true);showCaption(p,"Syncing subtitles…",false);if(!v.paused&&!v.ended)connectRealtime(p,g);}
function renderCaption(p,v){
 if(!enabled||!v)return;const now=Number(v.currentTime||0);let active=null;
 for(const [key,c] of slots){if(c.end<now-1.5){slots.delete(key);exactTimings.delete(key);continue;}if(c.start<=now+.12&&c.end>=now-.08&&(!active||c.start>=active.start))active=c;}
 active?showCaption(p,active.text,false):hideCaption(p);
}
function showCaption(p,text,error){const n=p.querySelector("[data-subtitle-text]");if(!n)return;n.textContent=String(text||"");n.style.color=error?"#ffb1bd":"#fff";n.dir=targetLanguage==="fa"||targetLanguage==="ar"?"rtl":"auto";n.classList.toggle("show",Boolean(text));}
function hideCaption(p){p.querySelector("[data-subtitle-text]")?.classList.remove("show");}
function bindPlayer(p){
 if(p.dataset.vexaLiveSubtitles==="7")return;p.dataset.vexaLiveSubtitles="7";installStyle();installUI(p);const v=p.querySelector("video");if(!v)return;
 v.addEventListener("play",()=>{if(enabled){socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}});
 v.addEventListener("playing",()=>{if(enabled&&!socket){socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}renderCaption(p,v);});
 v.addEventListener("timeupdate",()=>renderCaption(p,v));
 v.addEventListener("pause",()=>{if(enabled)closeSocket(true);renderCaption(p,v);});
 v.addEventListener("waiting",()=>{if(enabled)closeSocket(true);});
 v.addEventListener("stalled",()=>{if(enabled)closeSocket(true);});
 v.addEventListener("seeking",()=>{if(enabled)closeSocket(true);slots.clear();exactTimings.clear();hideCaption(p);});
 v.addEventListener("seeked",()=>restartFromCurrentTime(p));
 v.addEventListener("ratechange",()=>restartFromCurrentTime(p));
 v.addEventListener("loadedmetadata",()=>{if(enabled)restartFromCurrentTime(p);});
 v.addEventListener("emptied",()=>{if(enabled){closeSocket(true);slots.clear();exactTimings.clear();hideCaption(p);}});
 v.addEventListener("ended",()=>{if(enabled){closeSocket(true);slots.clear();exactTimings.clear();hideCaption(p);}});
}
function install(){const p=document.getElementById(PLAYER_ID);if(!p||!p.querySelector("video"))return false;bindPlayer(p);return true;}
if(!install()){const o=new MutationObserver(()=>{if(install())o.disconnect();});o.observe(document.documentElement,{childList:true,subtree:true});}
})();
`;
