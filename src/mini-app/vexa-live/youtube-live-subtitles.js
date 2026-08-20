import { Container, getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-5";
const TRANSLATION_MODEL="gpt-5.6-luna";
const TRANSLATE_TIMEOUT_MS=10000;
const PCM_SAMPLE_RATE=16000, PCM_BYTES_PER_SECOND=32000, PCM_FRAME_BYTES=3200;
const CONTEXT_CHAR_LIMIT=1200, INITIAL_AUDIO_BURST_SECONDS=2.4;
const MAX_AUDIO_LEAD_SECONDS=3.0, FAST_CATCHUP_UNTIL_SECONDS=2.45;
const SEMANTIC_COMMIT_MIN_SECONDS=1.6, HARD_COMMIT_SECONDS=2.8, MAX_PENDING_SEGMENTS=10;
const CUE_MAX_WORDS=7, CUE_MAX_SECONDS=2.6, CUE_MAX_CHARS=54;

const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const LANGUAGE_ALIASES=Object.freeze({en:"en",eng:"en",fa:"fa",fas:"fa",per:"fa",ru:"ru",rus:"ru",de:"de",deu:"de",ger:"de",tr:"tr",tur:"tr",es:"es",spa:"es",ar:"ar",ara:"ar",fr:"fr",fra:"fr",fre:"fr",pt:"pt",por:"pt",it:"it",ita:"it",hi:"hi",hin:"hi",zh:"zh",zho:"zh",chi:"zh",cmn:"zh",ja:"ja",jpn:"ja",ko:"ko",kor:"ko"});
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
  let started=false,control=null;
  const send=v=>{if(server.readyState===WebSocket.OPEN)try{server.send(JSON.stringify(v));}catch{}};
  const abort=()=>{if(!controller.signal.aborted)controller.abort();};
  const fail=e=>{if(controller.signal.aborted)return;console.error("Vexa realtime subtitle session failed",e?.stack||e);send({type:"error",error:publicError(e),retryable:isRetryableSessionError(e)});abort();try{server.close(1011,"subtitle session failed");}catch{}};

  server.addEventListener("message",event=>{
    let m;try{m=JSON.parse(String(event.data||"{}"));}catch{return;}
    if(m?.type==="start"){
      if(started)return;started=true;
      control={playbackTime:finiteNumber(m.currentTime,0,86400)??0,playbackRate:finiteNumber(m.playbackRate,.25,4)??1,partialText:"",semanticCommit:false,translationBacklog:0,waiters:new Set()};
      runRealtimeSubtitleSession({request,env,server,payload:m,control,signal:controller.signal,send,abort}).catch(fail);
    }else if(m?.type==="sync"&&control){
      const t=finiteNumber(m.currentTime,0,86400),r=finiteNumber(m.playbackRate,.25,4);
      if(t!==null)control.playbackTime=t;if(r!==null)control.playbackRate=r;notifyControl(control);
    }else if(m?.type==="stop"){
      abort();try{server.close(1000,"stopped");}catch{}
    }
  });
  server.addEventListener("close",abort);server.addEventListener("error",abort);
  return new Response(null,{status:101,webSocket:client});
}

async function runRealtimeSubtitleSession({request,env,server,payload,control,signal,send,abort}){
  const user=await authenticateMiniAppPayload(payload,env);
  await assertLiveAccess(env,user.id);
  const token=cleanToken(payload.playbackToken);
  if(!token)throw httpError("Video session is invalid",400);
  const targetLanguage=normalizeTargetLanguage(payload.targetLanguage);
  if(!targetLanguage||targetLanguage==="off")throw httpError("Subtitle language is invalid",400);
  const start=finiteNumber(payload.currentTime,0,86400);
  if(start===null)throw httpError("Subtitle start time is invalid",400);
  const playbackRate=finiteNumber(payload.playbackRate,.25,4)??1;
  control.playbackTime=start;control.playbackRate=playbackRate;

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
  scribeUrl.searchParams.set("commit_strategy","manual");
  scribeUrl.searchParams.set("include_timestamps","true");
  scribeUrl.searchParams.set("include_language_detection","true");
  scribeUrl.searchParams.set("no_verbatim","true");

  const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
  const upstream=upstreamResponse.webSocket;
  if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
  upstream.accept();

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));

  let audioStream=null,audioSecondsSent=0,sourceContext="",translationContext="",drainPromise=null,upstreamEndedNormally=false,lastCommitAudioSeconds=0,sentActivity=false,sequence=0;
  const commitWindows=[],pendingSegments=[],seen=new Set();

  const closeUpstream=()=>{try{upstream.close(1000,"done");}catch{}};
  signal.addEventListener("abort",closeUpstream,{once:true});

  const updateBacklog=()=>{control.translationBacklog=pendingSegments.length+(drainPromise?1:0);notifyControl(control);};
  const drainCommitted=()=>{
    if(drainPromise)return drainPromise;
    drainPromise=(async()=>{
      while(pendingSegments.length&&!signal.aborted&&server.readyState===WebSocket.OPEN){
        const item=pendingSegments.shift();updateBacklog();
        try{
          const sourceLanguage=normalizeLanguageCode(item.message?.language_code);
          let cues=buildRealtimeCues(item.message,start,timestampOffsetForWindow(item.message,item.window),item.window,audioSecondsSent);
          const playbackTime=Number(control.playbackTime||0);
          cues=cues.filter(c=>c.end>=playbackTime-.8);
          if(!cues.length)continue;
          const sourceTexts=cues.map(c=>c.text);
          let outputTexts=sourceTexts;
          if(targetLanguage!=="original"&&!sameLanguage(sourceLanguage,targetLanguage)){
            outputTexts=await translateRealtimeCues({env,texts:sourceTexts,targetLanguage,sourceLanguage,previousSource:sourceContext,previousTranslation:translationContext,signal});
          }
          sourceContext=appendContext(sourceContext,sourceTexts.join(" "));
          translationContext=appendContext(translationContext,outputTexts.join(" "));
          const latestTime=Number(control.playbackTime||0);
          cues=cues.map((cue,index)=>({...cue,id:String(item.sequence)+":"+index,text:outputTexts[index]||cue.text})).filter(c=>c.end>=latestTime-1);
          if(cues.length)send({type:"cues",sequence:item.sequence,cues,sourceLanguage,targetLanguage});
        }catch(e){
          if(signal.aborted)return;
          console.error("Vexa committed subtitle translation failed",e?.stack||e);
          send({type:"translation_error",error:publicError(e)});
        }finally{updateBacklog();}
      }
    })().finally(()=>{drainPromise=null;updateBacklog();if(pendingSegments.length&&!signal.aborted)drainCommitted();});
    updateBacklog();return drainPromise;
  };

  const enqueueCommitted=message=>{
    const fp=transcriptFingerprint(message);if(!fp||seen.has(fp))return;
    seen.add(fp);if(seen.size>160)seen.delete(seen.values().next().value);
    const window=commitWindows.length?commitWindows.shift():null;
    pendingSegments.push({message,window,sequence:sequence++});
    while(pendingSegments.length>MAX_PENDING_SEGMENTS){
      const first=pendingSegments[0],absoluteEnd=first?.window?start+Number(first.window.end||0):Infinity;
      if(absoluteEnd>=Number(control.playbackTime||0)-1)break;pendingSegments.shift();
    }
    updateBacklog();drainCommitted().catch(()=>null);
  };

  upstream.addEventListener("message",event=>{
    if(signal.aborted)return;
    let m;try{m=JSON.parse(String(event.data||"{}"));}catch{return;}
    const type=String(m?.message_type||"");
    if(type==="session_started"){send({type:"ready",model:"scribe_v2_realtime"});return;}
    if(type==="partial_transcript"||type==="final_transcript"){
      const text=cleanSubtitleText(m?.text);if(!text)return;
      control.partialText=text;
      control.semanticCommit=type==="final_transcript"||/[.!?…؛؟]$/u.test(text);
      if(!sentActivity){sentActivity=true;send({type:"activity"});}
      return;
    }
    if(type==="committed_transcript"){control.partialText="";control.semanticCommit=false;return;}
    if(type==="committed_transcript_with_timestamps"){enqueueCommitted(m);return;}
    if(FATAL_SCRIBE_ERRORS.has(type)||RETRYABLE_SCRIBE_ERRORS.has(type)||type==="error"){
      const detail=String(m?.error||m?.message||"Realtime transcription failed"),retryable=!FATAL_SCRIBE_ERRORS.has(type);
      send({type:"error",error:publicScribeError(type,detail),retryable});abort();
      try{upstream.close(1011,"scribe error");}catch{}try{server.close(1011,"scribe error");}catch{}
    }
  });
  upstream.addEventListener("error",()=>{if(signal.aborted)return;send({type:"error",error:"Realtime transcription connection failed",retryable:true});abort();try{server.close(1011,"scribe connection failed");}catch{}});
  upstream.addEventListener("close",()=>{if(signal.aborted||upstreamEndedNormally)return;send({type:"error",error:"Realtime transcription connection closed",retryable:true});abort();try{server.close(1011,"scribe connection closed");}catch{}});

  try{
    audioStream=await container.streamAudioPcm(playbackUrl,start,streamId,playbackRate);
    if(!audioStream)throw httpError("Could not start realtime subtitle audio",502);
    audioSecondsSent=await streamPcmToScribe({
      audioStream,upstream,control,baseStart:start,maxAheadSeconds:MAX_AUDIO_LEAD_SECONDS,signal,
      onProgress:s=>{audioSecondsSent=s;},
      shouldCommit:next=>{
        const segment=next-lastCommitAudioSeconds;
        const semantic=Boolean(control.semanticCommit)&&segment>=SEMANTIC_COMMIT_MIN_SECONDS;
        const hard=Boolean(control.partialText)&&segment>=HARD_COMMIT_SECONDS;
        if(!semantic&&!hard)return false;
        commitWindows.push({start:lastCommitAudioSeconds,end:next});
        lastCommitAudioSeconds=next;control.semanticCommit=false;control.partialText="";return true;
      }
    });
    if(!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      if(audioSecondsSent-lastCommitAudioSeconds>.15||control.partialText){
        const silence=new Uint8Array(PCM_FRAME_BYTES),end=audioSecondsSent+silence.byteLength/PCM_BYTES_PER_SECOND;
        commitWindows.push({start:lastCommitAudioSeconds,end});
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(silence),sample_rate:PCM_SAMPLE_RATE,commit:true}));
      }
      await sleep(900,signal).catch(()=>null);
      if(drainPromise)await drainPromise.catch(()=>null);
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

async function streamPcmToScribe({audioStream,upstream,control,baseStart,maxAheadSeconds,signal,onProgress,shouldCommit}){
  const reader=audioStream.getReader();let pending=new Uint8Array(0),bytesSent=0;
  const abortReader=()=>{try{reader.cancel();}catch{}};
  signal.addEventListener("abort",abortReader,{once:true});
  try{
    while(!signal.aborted){
      const next=await reader.read();if(next.done)break;if(!next.value?.byteLength)continue;
      pending=concatBytes(pending,next.value);
      while(pending.byteLength>=PCM_FRAME_BYTES&&!signal.aborted){
        const frame=pending.slice(0,PCM_FRAME_BYTES);pending=pending.slice(PCM_FRAME_BYTES);
        await waitForSubtitleLead({control,absoluteAudioTime:baseStart+bytesSent/PCM_BYTES_PER_SECOND,frameSeconds:frame.byteLength/PCM_BYTES_PER_SECOND,maxAheadSeconds,signal});
        if(signal.aborted)return bytesSent/PCM_BYTES_PER_SECOND;
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        const nextAudioSeconds=(bytesSent+frame.byteLength)/PCM_BYTES_PER_SECOND,commit=Boolean(shouldCommit?.(nextAudioSeconds));
        const message={message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE};
        if(commit)message.commit=true;
        upstream.send(JSON.stringify(message));bytesSent+=frame.byteLength;onProgress?.(bytesSent/PCM_BYTES_PER_SECOND);
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
      bytesSent+=pending.byteLength;onProgress?.(bytesSent/PCM_BYTES_PER_SECOND);
    }
    return bytesSent/PCM_BYTES_PER_SECOND;
  }finally{signal.removeEventListener("abort",abortReader);try{await reader.cancel();}catch{}}
}

async function waitForSubtitleLead({control,absoluteAudioTime,frameSeconds,maxAheadSeconds,signal}){
  while(!signal.aborted){
    const ahead=absoluteAudioTime-Number(control.playbackTime||0),backlog=Number(control.translationBacklog||0);
    if(ahead<=maxAheadSeconds&&backlog<3){
      const rate=Math.max(.25,Math.min(4,Number(control.playbackRate)||1));
      const multiplier=ahead<FAST_CATCHUP_UNTIL_SECONDS?3:1.03;
      await sleep(Math.max(12,(frameSeconds/(rate*multiplier))*1000),signal);return;
    }
    await waitForControlChange(control,signal);
  }
}

function notifyControl(control){
  if(!control?.waiters?.size)return;const waiters=[...control.waiters];control.waiters.clear();for(const wake of waiters)try{wake();}catch{}
}

function waitForControlChange(control,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error("aborted"));
    let done=false;
    const finish=fn=>{if(done)return;done=true;control?.waiters?.delete(wake);signal?.removeEventListener?.("abort",onAbort);fn();};
    const wake=()=>finish(resolve),onAbort=()=>finish(()=>reject(new Error("aborted")));
    control?.waiters?.add(wake);signal?.addEventListener?.("abort",onAbort,{once:true});
  });
}

function timestampOffsetForWindow(message,window){
  if(!window)return 0;
  const timed=(Array.isArray(message?.words)?message.words:[]).filter(i=>Number.isFinite(Number(i?.start))&&Number.isFinite(Number(i?.end)));
  if(!timed.length)return window.start;
  const first=Number(timed[0].start),last=Number(timed[timed.length-1].end),duration=Math.max(0,window.end-window.start);
  return first>=-.25&&last<=duration+1.25?window.start:0;
}

function transcriptFingerprint(message){
  const words=Array.isArray(message?.words)?message.words:[],first=words.find(i=>Number.isFinite(Number(i?.start))),last=[...words].reverse().find(i=>Number.isFinite(Number(i?.end)));
  return [String(message?.text||"").trim(),first?Number(first.start).toFixed(3):"",last?Number(last.end).toFixed(3):""].join("|");
}

function buildRealtimeCues(message,absoluteStart,timestampOffset,window,audioSecondsSent){
  const words=(Array.isArray(message?.words)?message.words:[]).map(i=>({text:String(i?.text||""),type:String(i?.type||"word"),start:Number(i?.start),end:Number(i?.end)})).filter(i=>i.text&&Number.isFinite(i.start)&&Number.isFinite(i.end));
  if(!words.length){
    const text=cleanSubtitleText(message?.text);if(!text)return[];
    const relativeStart=window?Number(window.start||0):Math.max(0,Number(audioSecondsSent||0)-2),relativeEnd=window?Number(window.end||0):Math.max(relativeStart+.4,Number(audioSecondsSent||0));
    return[{start:roundTime(absoluteStart+relativeStart),end:roundTime(absoluteStart+Math.max(relativeStart+.45,relativeEnd+.18)),text}];
  }
  const cues=[];let parts=[],cueStart=null,cueEnd=null,wordCount=0,previousEnd=null;
  const flush=()=>{
    const text=cleanSubtitleText(parts.join(""));
    if(text&&cueStart!==null&&cueEnd!==null&&wordCount>0)cues.push({start:roundTime(absoluteStart+timestampOffset+cueStart),end:roundTime(absoluteStart+timestampOffset+Math.max(cueEnd+.16,cueStart+.42)),text,wordCount});
    parts=[];cueStart=null;cueEnd=null;wordCount=0;previousEnd=null;
  };
  for(const item of words){
    const gap=previousEnd===null?0:item.start-previousEnd;if(parts.length&&gap>.58)flush();
    if(cueStart===null&&item.type==="word")cueStart=item.start;if(cueStart===null)continue;
    cueEnd=item.end;parts.push(item.text);if(item.type==="word")wordCount++;previousEnd=item.end;
    const text=cleanSubtitleText(parts.join("")),punctuation=/[.!?…؛؟]$/u.test(text),duration=Math.max(0,cueEnd-cueStart);
    if((punctuation&&wordCount>=2)||wordCount>=CUE_MAX_WORDS||duration>=CUE_MAX_SECONDS||text.length>=CUE_MAX_CHARS)flush();
  }
  flush();
  if(cues.length>1){
    const last=cues[cues.length-1],prev=cues[cues.length-2];
    if(Number(last.wordCount||0)<2&&cleanSubtitleText(prev.text+" "+last.text).length<=CUE_MAX_CHARS+10&&last.end-prev.start<=CUE_MAX_SECONDS+.8){
      cues.splice(cues.length-2,2,{...prev,end:last.end,text:cleanSubtitleText(prev.text+" "+last.text),wordCount:Number(prev.wordCount||0)+Number(last.wordCount||0)});
    }
    for(let i=0;i<cues.length-1;i++)if(cues[i].end>cues[i+1].start+.05)cues[i].end=roundTime(Math.max(cues[i].start+.35,cues[i+1].start+.05));
  }
  return cues.map(({wordCount,...cue})=>cue).slice(0,10);
}

async function translateRealtimeCues({env,texts,targetLanguage,sourceLanguage,previousSource,previousTranslation,signal}){
  if(!env.GPT_API)throw httpError("AI translation is unavailable",503);
  const languageName=TARGET_LANGUAGES[targetLanguage],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TRANSLATE_TIMEOUT_MS);
  const abortFromParent=()=>controller.abort();signal?.addEventListener?.("abort",abortFromParent,{once:true});
  let response;
  try{
    response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+env.GPT_API,"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({
      model:TRANSLATION_MODEL,
      instructions:[
        "Translate each current video subtitle segment into "+languageName+".",
        "Keep exactly one translation for each input segment, in the same order. Never merge, repeat or split segments.",
        "Use natural everyday spoken language and preserve meaning, tone, slang, names and numbers.",
        "Previous context is only for understanding continuity. Never copy previous context into the current output.",
        "Keep every translation compact enough for at most two subtitle lines on a phone.",
        "Use light punctuation and return only the structured translations."
      ].join(" "),
      input:JSON.stringify({detected_source_language:sourceLanguage||"unknown",target_language:languageName,previous_source_context:String(previousSource||"").slice(-CONTEXT_CHAR_LIMIT),previous_translation_context:String(previousTranslation||"").slice(-CONTEXT_CHAR_LIMIT),segments:texts}),
      reasoning:{effort:"none"},
      text:{verbosity:"low",format:{type:"json_schema",name:"live_subtitle_translations",strict:true,schema:{type:"object",properties:{translations:{type:"array",minItems:texts.length,maxItems:texts.length,items:{type:"string"}}},required:["translations"],additionalProperties:false}}},
      max_output_tokens:500,store:false
    })});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){console.error("Vexa Luna subtitle translation failed",response.status,JSON.stringify(data).slice(0,1200));throw httpError("AI translation is temporarily unavailable",502);}
    const raw=extractResponseText(data).trim();let parsed;try{parsed=JSON.parse(raw);}catch{parsed=null;}
    const translations=Array.isArray(parsed?.translations)?parsed.translations.map(cleanTranslatedSubtitle):[];
    if(translations.length!==texts.length||translations.some(x=>!x)){console.error("Vexa Luna subtitle result invalid",raw.slice(0,1200));throw httpError("AI translation returned an invalid subtitle result",502);}
    return translations;
  }catch(e){if(controller.signal.aborted&&!signal?.aborted)throw httpError("Live translation timed out",504);throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener?.("abort",abortFromParent);}
}

function extractResponseText(data){
  if(typeof data?.output_text==="string")return data.output_text;
  const chunks=[];for(const item of Array.isArray(data?.output)?data.output:[])for(const part of Array.isArray(item?.content)?item.content:[])if(part?.type==="output_text"&&typeof part?.text==="string")chunks.push(part.text);
  return chunks.join("");
}

async function selectedElevenApiKey(env){const name=await getElevenApiSetting(env);return String(env[name]||"").trim();}
async function assertLiveAccess(env,userId){if(await isAdmin(env,userId))return;const[g,l]=await Promise.all([getMiniAppAccessSettings(env),getVexaLiveAccessSettings(env)]);if(g.adminOnly||l.adminOnly)throw httpError("Vexa Live is updating",423);}
function normalizeTargetLanguage(v){const k=String(v||"original").trim().toLowerCase();return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES,k)?k:"";}
function normalizeLanguageCode(v){const c=String(v||"").trim().toLowerCase().replace(/_/g,"-").split("-")[0];return LANGUAGE_ALIASES[c]||c;}
function sameLanguage(a,b){return Boolean(a&&b&&normalizeLanguageCode(a)===normalizeLanguageCode(b));}
function cleanToken(v){const t=String(v||"").trim();return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:"";}
function cleanStreamId(v){const t=String(v||"").trim();return/^[A-Za-z0-9_-]{8,80}$/.test(t)?t:"";}
function safeContainerKey(v){const r=String(v||"anonymous").replace(/[^A-Za-z0-9_-]/g,"");return(r||"anonymous").slice(0,80);}
function finiteNumber(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function roundTime(v){return Math.round(Number(v||0)*1000)/1000;}
function cleanSubtitleText(v){return String(v||"").replace(/\s+([,.;:!?،؛؟])/g,"$1").replace(/\s+/g," ").trim();}
function cleanTranslatedSubtitle(v){return cleanSubtitleText(v).replace(/^["“”'‘’]+/u,"").replace(/["“”'‘’]+$/u,"").replace(/([!?؟])\1+/g,"$1").replace(/\s*[.。\u06D4]+$/u,"").replace(/\s*[;؛]+\s*$/u,"").trim();}
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
let enabled=false,targetLanguage="original",socket=null,socketGeneration=0,reconnectTimer=0,reconnectAttempt=0,bufferCloseTimer=0,lastSyncTime=-1,cues=new Map();

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const h=hostWindow();return window.Telegram?.WebApp||h.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||"");}
function haptic(s){try{telegram()?.HapticFeedback?.impactOccurred?.(s||"light");}catch{}}
function playbackToken(v){try{const t=new URL(String(v?.currentSrc||v?.src||""),window.location.origin).searchParams.get("token")||"";return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:"";}catch{return"";}}
function websocketUrl(){const u=new URL(SOCKET_PATH,window.location.href);u.protocol=u.protocol==="https:"?"wss:":"ws:";return u.href;}

function installStyle(){
 if(document.getElementById(STYLE_ID))return;
 const s=document.createElement("style");s.id=STYLE_ID;
 s.textContent="#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}#vexaCustomPlayer .vexa-subtitle-text{max-width:min(680px,88%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:clamp(15px,3.8vw,22px);line-height:1.3;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}#vexaCustomPlayer.is-fullscreen .vexa-subtitle-drawer{bottom:calc(10px + env(safe-area-inset-bottom))}";
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
function clearBufferClose(){clearTimeout(bufferCloseTimer);bufferCloseTimer=0;}
function stopSubtitles(p){enabled=false;targetLanguage="original";socketGeneration++;reconnectAttempt=0;cues.clear();lastSyncTime=-1;clearTimeout(reconnectTimer);reconnectTimer=0;clearBufferClose();closeSocket(true);hideCaption(p);}
function startSubtitles(p,l){const v=p.querySelector("video");if(!v||!playbackToken(v))return;enabled=true;targetLanguage=l;reconnectAttempt=0;cues.clear();lastSyncTime=-1;socketGeneration++;clearBufferClose();showCaption(p,v.paused?"Live subtitles ready":"Starting live subtitles…",false);if(!v.paused&&!v.ended)connectRealtime(p,socketGeneration);}
function closeSocket(intentional){const a=socket;socket=null;if(!a)return;a.__vexaIntentionalClose=Boolean(intentional);try{if(a.readyState===WebSocket.OPEN)a.send(JSON.stringify({type:"stop"}));}catch{}try{a.close(1000,"restart");}catch{}}
function scheduleReconnect(p,g){if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;clearTimeout(reconnectTimer);const d=Math.min(5000,500*Math.pow(2,Math.min(3,reconnectAttempt++)));showCaption(p,"Reconnecting subtitles…",false);reconnectTimer=setTimeout(()=>connectRealtime(p,g),d);}
function scheduleBufferClose(p){
 if(!enabled)return;clearBufferClose();const g=socketGeneration;
 bufferCloseTimer=setTimeout(()=>{if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(v&&!v.paused&&!v.ended&&v.readyState<3)closeSocket(true);},3500);
}
function sendSync(v,force){
 if(!socket||socket.readyState!==WebSocket.OPEN||!v)return;
 const t=Math.max(0,Number(v.currentTime||0));if(!force&&Math.abs(t-lastSyncTime)<.12)return;lastSyncTime=t;
 try{socket.send(JSON.stringify({type:"sync",currentTime:t,playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1)))}));}catch{}
}
function connectRealtime(p,g){
 if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;const token=playbackToken(v);if(!token)return;
 clearBufferClose();closeSocket(true);cues.clear();lastSyncTime=-1;
 const ws=new WebSocket(websocketUrl());socket=ws;
 ws.addEventListener("open",()=>{if(!enabled||g!==socketGeneration||socket!==ws){try{ws.close();}catch{}return;}const currentTime=Math.max(0,Number(v.currentTime||0));lastSyncTime=currentTime;ws.send(JSON.stringify({type:"start",initData:initData(),playbackToken:token,currentTime,playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),targetLanguage}));});
 ws.addEventListener("message",e=>{
   if(!enabled||g!==socketGeneration||socket!==ws)return;let d;try{d=JSON.parse(String(e.data||"{}"));}catch{return;}
   if(d.type==="ready"){if(!cues.size)showCaption(p,"Listening…",false);return;}
   if(d.type==="activity"){if(!cues.size)showCaption(p,"Transcribing…",false);return;}
   if(d.type==="cues"){
     const incoming=Array.isArray(d.cues)?d.cues:[],now=Number(v.currentTime||0);
     incoming.forEach((raw,index)=>{
       const text=String(raw?.text||"").trim(),start=Number(raw?.start),end=Number(raw?.end);if(!text||!Number.isFinite(start)||!Number.isFinite(end))return;
       if(end<now-1)return;
       let cueStart=start,cueEnd=Math.max(end,start+.3);
       if(targetLanguage!=="original"&&cueEnd<now+.08&&cueEnd>=now-1){const words=text.split(/\s+/u).filter(Boolean).length,hold=Math.min(2.8,Math.max(1.25,words*.22+.65));cueStart=Math.max(0,now-.03);cueEnd=now+hold;}
       const id=String(raw?.id||String(d.sequence||0)+":"+index);cues.set(id,{id,text,start:cueStart,end:cueEnd});
     });
     reconnectAttempt=0;renderCaption(p,v);return;
   }
   if(d.type==="translation_error"){if(!findActiveCue(v))showCaption(p,String(d.error||"Translation temporarily unavailable"),true);return;}
   if(d.type==="error"){if(d.retryable!==false){showCaption(p,"Reconnecting subtitles…",false);try{ws.close();}catch{}}else{enabled=false;updateLanguageSelection(p);showCaption(p,String(d.error||"Live subtitles unavailable"),true);closeSocket(true);}return;}
   if(d.type==="ended")closeSocket(true);
 });
 ws.addEventListener("close",()=>{if(socket===ws)socket=null;if(enabled&&g===socketGeneration&&!ws.__vexaIntentionalClose&&!v.paused&&!v.ended)scheduleReconnect(p,g);});
 ws.addEventListener("error",()=>{if(socket===ws)try{ws.close();}catch{}});
}
function restartFromCurrentTime(p){if(!enabled)return;const v=p.querySelector("video");if(!v)return;socketGeneration++;const g=socketGeneration;reconnectAttempt=0;cues.clear();lastSyncTime=-1;clearBufferClose();closeSocket(true);showCaption(p,"Syncing subtitles…",false);if(!v.paused&&!v.ended)connectRealtime(p,g);}
function findActiveCue(v){
 if(!v)return null;const now=Number(v.currentTime||0);let active=null;
 for(const [key,c] of cues){if(c.end<now-1.2){cues.delete(key);continue;}if(c.start<=now+.08&&c.end>=now-.06&&(!active||c.start>=active.start))active=c;}
 return active;
}
function renderCaption(p,v){if(!enabled||!v)return;const active=findActiveCue(v);active?showCaption(p,active.text,false):hideCaption(p);}
function showCaption(p,text,error){const n=p.querySelector("[data-subtitle-text]");if(!n)return;n.textContent=String(text||"");n.style.color=error?"#ffb1bd":"#fff";n.dir=targetLanguage==="fa"||targetLanguage==="ar"?"rtl":"auto";n.classList.toggle("show",Boolean(text));}
function hideCaption(p){p.querySelector("[data-subtitle-text]")?.classList.remove("show");}
function bindPlayer(p){
 if(p.dataset.vexaLiveSubtitles==="9")return;p.dataset.vexaLiveSubtitles="9";installStyle();installUI(p);const v=p.querySelector("video");if(!v)return;
 v.addEventListener("play",()=>{if(enabled){socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}});
 v.addEventListener("playing",()=>{clearBufferClose();if(enabled&&!socket){socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}sendSync(v,true);renderCaption(p,v);});
 v.addEventListener("timeupdate",()=>{sendSync(v,false);renderCaption(p,v);});
 v.addEventListener("pause",()=>{clearBufferClose();if(enabled)closeSocket(true);renderCaption(p,v);});
 v.addEventListener("waiting",()=>scheduleBufferClose(p));
 v.addEventListener("stalled",()=>scheduleBufferClose(p));
 v.addEventListener("seeking",()=>{clearBufferClose();if(enabled)closeSocket(true);cues.clear();lastSyncTime=-1;hideCaption(p);});
 v.addEventListener("seeked",()=>restartFromCurrentTime(p));
 v.addEventListener("ratechange",()=>restartFromCurrentTime(p));
 v.addEventListener("loadedmetadata",()=>{if(enabled)restartFromCurrentTime(p);});
 v.addEventListener("emptied",()=>{clearBufferClose();if(enabled){closeSocket(true);cues.clear();lastSyncTime=-1;hideCaption(p);}});
 v.addEventListener("ended",()=>{clearBufferClose();if(enabled){closeSocket(true);cues.clear();lastSyncTime=-1;hideCaption(p);}});
}
function install(){const p=document.getElementById(PLAYER_ID);if(!p||!p.querySelector("video"))return false;bindPlayer(p);return true;}
if(!install()){const o=new MutationObserver(()=>{if(install())o.disconnect();});o.observe(document.documentElement,{childList:true,subtree:true});}
})();
`;