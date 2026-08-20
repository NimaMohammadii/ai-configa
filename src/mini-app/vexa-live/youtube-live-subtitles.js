import { Container, getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-8";
const TRANSLATION_MODEL="gpt-5.6-luna";
const TRANSLATE_TIMEOUT_MS=10000;
const PCM_SAMPLE_RATE=16000, PCM_BYTES_PER_SECOND=32000, PCM_FRAME_BYTES=3200;
const CONTEXT_CHAR_LIMIT=1200, LIVE_SOURCE_LIMIT=600, INITIAL_AUDIO_BURST_SECONDS=2.4;
const MAX_AUDIO_LEAD_SECONDS=3.2;
const VAD_SILENCE_SECONDS=.8, VAD_THRESHOLD=.4, VAD_MIN_SPEECH_MS=120, VAD_MIN_SILENCE_MS=120;

const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const FATAL_SCRIBE_ERRORS=new Set(["auth_error","quota_exceeded","input_error","unaccepted_terms","chunk_size_exceeded","invalid_request"]);
const RETRYABLE_SCRIBE_ERRORS=new Set(["error","transcriber_error","commit_throttled","rate_limited","queue_overflow","resource_exhausted","session_time_limit_exceeded","insufficient_audio_activity"]);

export class VexaSubtitleContainer extends Container {
  sleepAfter="2m";
  enableInternet=true;
  entrypoint=["sh","-c","trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudioProcesses=new Map();

  async onActivityExpired(){
    if(this.activeAudioProcesses.size){this.renewActivityTimeout();return;}
    return super.onActivityExpired();
  }

  async ensureAudioReady(){
    if(!this.ctx.container.running)await this.start();
    this.renewActivityTimeout();
  }

  async streamAudioPcm(mediaUrl,startSeconds,streamId,playbackRate=1){
    await this.ensureAudioReady();
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
    const reader=process.stdout.getReader(),stderrPromise=collectLimitedText(process.stderr,16384);
    let finished=false;
    const finish=async controller=>{
      if(finished)return;finished=true;
      const [exitCode,detail]=await Promise.all([process.exitCode.catch(()=>-1),stderrPromise.catch(()=>"")]);
      if(this.activeAudioProcesses.get(id)===process)this.activeAudioProcesses.delete(id);
      if(exitCode!==0)controller.error(new Error("Subtitle audio process failed"+(detail?": "+detail.slice(-900):"")));
      else controller.close();
    };
    return new ReadableStream({
      pull:async controller=>{
        try{const next=await reader.read();if(next.done)await finish(controller);else if(next.value?.byteLength)controller.enqueue(next.value);}
        catch(error){if(this.activeAudioProcesses.get(id)===process)this.activeAudioProcesses.delete(id);controller.error(error);}
      },
      cancel:async reason=>{
        finished=true;if(this.activeAudioProcesses.get(id)===process)this.activeAudioProcesses.delete(id);
        try{await reader.cancel(reason);}catch{}try{process.kill();}catch{}await stderrPromise.catch(()=>"");
      }
    });
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
      control={playbackTime:finiteNumber(m.currentTime,0,86400)??0,playbackRate:finiteNumber(m.playbackRate,.25,4)??1,version:0,waiters:new Set()};
      runRealtimeSubtitleSession({request,env,server,payload:m,control,signal:controller.signal,send,abort}).catch(fail);
    }else if(m?.type==="playback_state"&&control){
      const time=finiteNumber(m.currentTime,0,86400),rate=finiteNumber(m.playbackRate,.25,4);
      if(time!==null)control.playbackTime=time;if(rate!==null)control.playbackRate=rate;
      control.version+=1;notifyControl(control);
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

  const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
  const upstream=upstreamResponse.webSocket;
  if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
  upstream.accept();

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));

  let audioStream=null,start=0,playbackRate=1,sourceContext="",upstreamEndedNormally=false,sentActivity=false,segmentIndex=0,revision=0;
  let translationLoopPromise=null,activeTranslationController=null,activeTranslationJob=null,endCommitResolve=null;
  const translationJobs=[];
  const timestampState={offset:0,lastEnd:0},committedSegments=[],finalSegments=[],timedSlots=new Set(),finalTextBySlot=new Map();

  const closeUpstream=()=>{try{upstream.close(1000,"done");}catch{}};
  const abortTranslation=()=>{if(activeTranslationController)activeTranslationController.abort();};
  signal.addEventListener("abort",closeUpstream,{once:true});
  signal.addEventListener("abort",abortTranslation,{once:true});

  const queueFinalTranslation=(rawText,slot)=>{
    const text=cleanSubtitleText(rawText).slice(0,LIVE_SOURCE_LIMIT);
    if(!text)return;
    const resolvedSlot=String(slot),job={text,context:sourceContext,slot:resolvedSlot,revision:++revision};
    const duplicate=translationJobs.findIndex(item=>item.slot===resolvedSlot);if(duplicate>=0)translationJobs.splice(duplicate,1);
    translationJobs.push(job);
    if(activeTranslationJob?.slot===resolvedSlot&&activeTranslationController)activeTranslationController.abort();
    if(!translationLoopPromise)translationLoopPromise=runTranslationLoop();
  };

  const publishFinalText=(rawText,slot)=>{
    const text=cleanSubtitleText(rawText);if(!text)return;
    if(targetLanguage==="original")send({type:"caption_text",slot:String(slot),revision:++revision,text,translated:false});
    else queueFinalTranslation(text,slot);
  };

  const runTranslationLoop=()=>{
    translationLoopPromise=(async()=>{
      while(translationJobs.length&&!signal.aborted&&server.readyState===WebSocket.OPEN){
        const job=translationJobs.shift();
        const jobController=new AbortController();activeTranslationController=jobController;activeTranslationJob=job;
        const abortJob=()=>jobController.abort();signal.addEventListener("abort",abortJob,{once:true});
        try{
          const translated=await streamLiveSubtitleTranslation({
            env,sourceText:job.text,context:job.context,targetLanguage,signal:jobController.signal,
            onText:text=>{if(!signal.aborted&&text)send({type:"caption_text",slot:job.slot,revision:job.revision,text,translated:true});}
          });
          if(!signal.aborted&&translated)send({type:"caption_text",slot:job.slot,revision:job.revision,text:translated,translated:true});
        }catch(e){
          if(signal.aborted)return;if(jobController.signal.aborted)continue;
          console.error("Vexa live subtitle translation failed",e?.stack||e);
          send({type:"translation_error",error:publicError(e)});
        }finally{signal.removeEventListener("abort",abortJob);if(activeTranslationController===jobController)activeTranslationController=null;if(activeTranslationJob===job)activeTranslationJob=null;}
      }
    })().finally(()=>{translationLoopPromise=null;if(translationJobs.length&&!signal.aborted)runTranslationLoop();});
    return translationLoopPromise;
  };

  upstream.addEventListener("message",event=>{
    if(signal.aborted)return;
    let m;try{m=JSON.parse(String(event.data||"{}"));}catch{return;}
    const type=String(m?.message_type||"");
    if(type==="session_started"){send({type:"ready",model:"scribe_v2_realtime"});return;}

    if(type==="partial_transcript"){
      const text=cleanSubtitleText(m?.text);if(!text)return;
      if(!sentActivity){sentActivity=true;send({type:"activity"});}
      return;
    }

    if(type==="final_transcript"){
      const text=cleanSubtitleText(m?.text);if(!text)return;
      if(!sentActivity){sentActivity=true;send({type:"activity"});}
      const slot=String(segmentIndex);
      finalSegments.push({slot,text});if(finalSegments.length>16)finalSegments.shift();
      finalTextBySlot.set(slot,text);publishFinalText(text,slot);
      return;
    }

    if(type==="final_transcript_with_timestamps"){
      const pending=finalSegments.shift()||{slot:String(segmentIndex),text:cleanSubtitleText(m?.text)};
      if(pending.text&&!finalTextBySlot.has(pending.slot)){finalTextBySlot.set(pending.slot,pending.text);publishFinalText(pending.text,pending.slot);}
      if(!timedSlots.has(pending.slot)){
        const timing=timingFromScribeWords(m,start,timestampState);
        if(timing){timedSlots.add(pending.slot);send({type:"timing",slot:pending.slot,start:timing.start,end:timing.end,exact:true});}
      }
      return;
    }

    if(type==="committed_transcript"){
      const text=cleanSubtitleText(m?.text),slot=String(segmentIndex);
      if(text){
        committedSegments.push({slot,text});
        if(committedSegments.length>16)committedSegments.shift();
        if(finalTextBySlot.get(slot)!==text)publishFinalText(text,slot);
        finalTextBySlot.delete(slot);
        sourceContext=appendContext(sourceContext,text);
      }
      segmentIndex+=1;
      return;
    }

    if(type==="committed_transcript_with_timestamps"){
      const pending=committedSegments.shift()||{slot:String(Math.max(0,segmentIndex-1)),text:cleanSubtitleText(m?.text)};
      if(!timedSlots.has(pending.slot)){
        const timing=timingFromScribeWords(m,start,timestampState);
        if(timing){timedSlots.add(pending.slot);send({type:"timing",slot:pending.slot,start:timing.start,end:timing.end,exact:true});}
      }
      if(endCommitResolve){const resolve=endCommitResolve;endCommitResolve=null;resolve();}
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
    await container.ensureAudioReady();
    await requestFreshPlaybackState(control,send,signal);
    start=finiteNumber(control.playbackTime,0,86400);
    if(start===null)throw httpError("Subtitle start time is invalid",400);
    playbackRate=finiteNumber(control.playbackRate,.25,4)??1;
    audioStream=await container.streamAudioPcm(playbackUrl,start,streamId,playbackRate);
    if(!audioStream)throw httpError("Could not start realtime subtitle audio",502);
    await streamPcmToScribe({audioStream,upstream,control,baseStart:start,maxAheadSeconds:MAX_AUDIO_LEAD_SECONDS,signal});
    if(!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      const silence=new Uint8Array(PCM_FRAME_BYTES);
      let timer=0,abortCommitWait=()=>{};
      const committed=new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;if(endCommitResolve===finish)endCommitResolve=null;signal.removeEventListener("abort",abortCommitWait);clearTimeout(timer);resolve();};
        endCommitResolve=finish;abortCommitWait=finish;signal.addEventListener("abort",abortCommitWait,{once:true});timer=setTimeout(finish,4000);
      });
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(silence),sample_rate:PCM_SAMPLE_RATE,commit:true}));
      await committed.catch(()=>null);
      if(translationLoopPromise)await translationLoopPromise.catch(()=>null);
      upstreamEndedNormally=true;
      if(!signal.aborted)send({type:"ended"});
    }
  }finally{
    signal.removeEventListener("abort",closeUpstream);
    signal.removeEventListener("abort",abortTranslation);
    if(activeTranslationController)activeTranslationController.abort();
    if(audioStream)try{await audioStream.cancel();}catch{}
    try{await container.stopAudioStream(streamId);}catch{}
    closeUpstream();
  }
}

async function streamPcmToScribe({audioStream,upstream,control,baseStart,maxAheadSeconds,signal}){
  const reader=audioStream.getReader();let pending=new Uint8Array(0),bytesSent=0;
  const abortReader=()=>{try{reader.cancel();}catch{}};
  signal.addEventListener("abort",abortReader,{once:true});
  try{
    while(!signal.aborted){
      const next=await reader.read();if(next.done)break;if(!next.value?.byteLength)continue;
      pending=concatBytes(pending,next.value);
      while(pending.byteLength>=PCM_FRAME_BYTES&&!signal.aborted){
        const frame=pending.slice(0,PCM_FRAME_BYTES);pending=pending.slice(PCM_FRAME_BYTES);
        await waitForPlaybackLead(control,Number(baseStart||0)+(bytesSent+frame.byteLength)/PCM_BYTES_PER_SECOND,maxAheadSeconds,signal);
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE}));
        bytesSent+=frame.byteLength;
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      await waitForPlaybackLead(control,Number(baseStart||0)+(bytesSent+pending.byteLength)/PCM_BYTES_PER_SECOND,maxAheadSeconds,signal);
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
      bytesSent+=pending.byteLength;
    }
    return bytesSent/PCM_BYTES_PER_SECOND;
  }finally{signal.removeEventListener("abort",abortReader);try{await reader.cancel();}catch{}}
}

async function requestFreshPlaybackState(control,send,signal){
  const version=Number(control?.version||0);send({type:"playback_state_request"});
  try{await waitForControlChange(control,version,signal,1500);}
  catch(e){if(signal.aborted)throw e;throw httpError("Video timing is unavailable",502);}
}

async function waitForPlaybackLead(control,absoluteAudioTime,maxAheadSeconds,signal){
  while(!signal.aborted&&absoluteAudioTime-Number(control?.playbackTime||0)>Number(maxAheadSeconds||0)){
    const version=Number(control?.version||0);await waitForControlChange(control,version,signal);
  }
}

function notifyControl(control){
  if(!control?.waiters?.size)return;const waiters=[...control.waiters];control.waiters.clear();for(const wake of waiters)try{wake();}catch{}
}

function waitForControlChange(control,version,signal,timeoutMs=0){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error("aborted"));
    if(Number(control?.version||0)!==Number(version||0))return resolve();
    let done=false,timer=0;
    const finish=fn=>{if(done)return;done=true;control?.waiters?.delete(wake);signal?.removeEventListener?.("abort",onAbort);if(timer)clearTimeout(timer);fn();};
    const wake=()=>finish(resolve),onAbort=()=>finish(()=>reject(new Error("aborted")));
    control?.waiters?.add(wake);signal?.addEventListener?.("abort",onAbort,{once:true});
    if(timeoutMs>0)timer=setTimeout(()=>finish(()=>reject(new Error("timeout"))),timeoutMs);
    if(Number(control?.version||0)!==Number(version||0))wake();
  });
}

function timingFromScribeWords(message,baseStart,state){
  const words=(Array.isArray(message?.words)?message.words:[]).filter(w=>Number.isFinite(Number(w?.start))&&Number.isFinite(Number(w?.end)));
  if(!words.length)return null;
  const first=Number(words[0].start),last=Number(words[words.length-1].end);
  if(first+state.offset<state.lastEnd-.25)state.offset=Math.max(0,state.lastEnd+VAD_SILENCE_SECONDS-first);
  const relativeStart=Math.max(0,state.offset+first),relativeEnd=Math.max(relativeStart+.25,state.offset+last);
  state.lastEnd=Math.max(state.lastEnd,relativeEnd);
  return{start:roundTime(Number(baseStart||0)+relativeStart),end:roundTime(Number(baseStart||0)+relativeEnd)};
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
        "Do not leave source-language words untranslated unless they are names or brands that should remain unchanged.",
        "Translate every present detail faithfully without summarizing or omitting content. Return only the translation without labels or markdown."
      ].join(" "),
      input:JSON.stringify({previous_source_context:String(context||"").slice(-CONTEXT_CHAR_LIMIT),current_live_subtitle:String(sourceText||"").slice(0,LIVE_SOURCE_LIMIT),target_language:languageName}),
      reasoning:{effort:"none"},text:{verbosity:"low"},max_output_tokens:260,store:false,stream:true
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
async function collectLimitedText(stream,limit){
  if(!stream)return"";const reader=stream.getReader(),decoder=new TextDecoder();let text="";
  try{while(true){const next=await reader.read();if(next.done)break;text=(text+decoder.decode(next.value,{stream:true})).slice(-Math.max(1024,Number(limit)||16384));}return(text+decoder.decode()).trim();}
  finally{try{await reader.cancel();}catch{}}
}
function httpError(message,status){const e=new Error(message);e.status=status;return e;}
function publicError(e){const s=Number(e?.status||500);if(s>=400&&s<500)return String(e?.message||"Request failed");const m=String(e?.message||"");if(/translation|transcription|speech-to-text/i.test(m))return m;return"Live subtitles are temporarily unavailable";}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}

export const LIVE_SUBTITLES_RUNTIME_JS=String.raw`
(function(){
const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime",PLAYER_ID="vexaCustomPlayer",STYLE_ID="vexaLiveSubtitlesStyle";
const LANGUAGES=[["off","Off",""],["original","Original audio","Auto"],["en","English","EN"],["fa","فارسی","FA"],["ru","Русский","RU"],["de","Deutsch","DE"],["tr","Türkçe","TR"],["es","Español","ES"],["ar","العربية","AR"],["fr","Français","FR"],["pt","Português","PT"],["it","Italiano","IT"],["hi","हिन्दी","HI"],["zh","中文","ZH"],["ja","日本語","JA"],["ko","한국어","KO"]];
let enabled=false,targetLanguage="original",socket=null,socketGeneration=0,reconnectTimer=0,reconnectAttempt=0,lastPlaybackState=-1,slots=new Map(),captionFrameVideo=null,captionFrameId=0;

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
function stopCaptionFrames(){if(captionFrameVideo&&captionFrameId)try{captionFrameVideo.cancelVideoFrameCallback(captionFrameId);}catch{}captionFrameVideo=null;captionFrameId=0;}
function startCaptionFrames(p,v){
 if(!v||captionFrameVideo===v&&captionFrameId)return;stopCaptionFrames();captionFrameVideo=v;
 const paint=(now,metadata)=>{if(!enabled||captionFrameVideo!==v){captionFrameId=0;return;}renderCaption(p,v,Number(metadata?.mediaTime));captionFrameId=v.requestVideoFrameCallback(paint);};
 captionFrameId=v.requestVideoFrameCallback(paint);
}
function stopSubtitles(p){enabled=false;targetLanguage="original";socketGeneration++;reconnectAttempt=0;lastPlaybackState=-1;slots.clear();clearTimeout(reconnectTimer);reconnectTimer=0;stopCaptionFrames();closeSocket(true);hideCaption(p);}
function startSubtitles(p,l){const v=p.querySelector("video");if(!v||!playbackToken(v))return;enabled=true;targetLanguage=l;reconnectAttempt=0;lastPlaybackState=-1;slots.clear();socketGeneration++;showCaption(p,v.paused?"Live subtitles ready":"Starting live subtitles…",false);if(!v.paused&&!v.ended){startCaptionFrames(p,v);connectRealtime(p,socketGeneration);}}
function closeSocket(intentional){const a=socket;socket=null;if(!a)return;a.__vexaIntentionalClose=Boolean(intentional);try{if(a.readyState===WebSocket.OPEN)a.send(JSON.stringify({type:"stop"}));}catch{}try{a.close(1000,"restart");}catch{}}
function scheduleReconnect(p,g){if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;clearTimeout(reconnectTimer);const d=Math.min(5000,500*Math.pow(2,Math.min(3,reconnectAttempt++)));showCaption(p,"Reconnecting subtitles…",false);reconnectTimer=setTimeout(()=>connectRealtime(p,g),d);}
function sendPlaybackState(v,force){
 if(!socket||socket.readyState!==WebSocket.OPEN||!v)return;const currentTime=Math.max(0,Number(v.currentTime||0));
 if(!force&&Math.abs(currentTime-lastPlaybackState)<.12)return;lastPlaybackState=currentTime;
 try{socket.send(JSON.stringify({type:"playback_state",currentTime,playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1)))}));}catch{}
}
function connectRealtime(p,g){
 if(!enabled||g!==socketGeneration)return;const v=p.querySelector("video");if(!v||v.paused||v.ended)return;const token=playbackToken(v);if(!token)return;
 closeSocket(true);slots.clear();lastPlaybackState=-1;
 const ws=new WebSocket(websocketUrl());socket=ws;
 ws.addEventListener("open",()=>{if(!enabled||g!==socketGeneration||socket!==ws){try{ws.close();}catch{}return;}const currentTime=Math.max(0,Number(v.currentTime||0));lastPlaybackState=currentTime;ws.send(JSON.stringify({type:"start",initData:initData(),playbackToken:token,currentTime,playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),targetLanguage}));});
 ws.addEventListener("message",e=>{
   if(!enabled||g!==socketGeneration||socket!==ws)return;let d;try{d=JSON.parse(String(e.data||"{}"));}catch{return;}
   if(d.type==="ready"){showCaption(p,"Listening…",false);return;}
   if(d.type==="activity"){showCaption(p,"Transcribing…",false);return;}
   if(d.type==="playback_state_request"){sendPlaybackState(v,true);return;}
   if(d.type==="timing"){
     const slot=String(d.slot||"live"),start=Number(d.start),end=Number(d.end);if(!Number.isFinite(start)||!Number.isFinite(end))return;
     const prior=slots.get(slot)||{};slots.set(slot,{...prior,start,end:Math.max(end,start+.25)});renderCaption(p,v);return;
   }
    if(d.type==="caption_text"){
      const text=String(d.text||"").trim(),revision=Number(d.revision||0),slot=String(d.slot||"live");if(!text)return;
      const prior=slots.get(slot);if(prior&&Number(prior.revision||0)>revision)return;
      slots.set(slot,{...prior,text,revision,translated:Boolean(d.translated)});
      reconnectAttempt=0;renderCaption(p,v);return;
    }
    if(d.type==="translation_error"){if(!findActiveSlot(v))showCaption(p,String(d.error||"Translation temporarily unavailable"),true);return;}
   if(d.type==="error"){if(d.retryable!==false){showCaption(p,"Reconnecting subtitles…",false);try{ws.close();}catch{}}else{enabled=false;updateLanguageSelection(p);showCaption(p,String(d.error||"Live subtitles unavailable"),true);closeSocket(true);}return;}
   if(d.type==="ended")closeSocket(true);
 });
 ws.addEventListener("close",()=>{if(socket===ws)socket=null;if(enabled&&g===socketGeneration&&!ws.__vexaIntentionalClose&&!v.paused&&!v.ended)scheduleReconnect(p,g);});
 ws.addEventListener("error",()=>{if(socket===ws)try{ws.close();}catch{}});
}
function restartFromCurrentTime(p){if(!enabled)return;const v=p.querySelector("video");if(!v)return;socketGeneration++;const g=socketGeneration;reconnectAttempt=0;lastPlaybackState=-1;slots.clear();closeSocket(true);showCaption(p,"Syncing subtitles…",false);if(!v.paused&&!v.ended){startCaptionFrames(p,v);connectRealtime(p,g);}}
function findActiveSlot(v,mediaTime){
 if(!v)return null;const now=Number.isFinite(mediaTime)?mediaTime:Number(v.currentTime||0);let active=null;
 for(const [key,c] of slots){if(Number.isFinite(c.end)&&c.end<now-.12){slots.delete(key);continue;}if(c.text&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start<=now+.035&&c.end>=now-.035&&(!active||c.start>=active.start))active=c;}
 return active;
}
function renderCaption(p,v,mediaTime){
 if(!enabled||!v)return;const active=findActiveSlot(v,mediaTime);
 active?showCaption(p,active.text,false,active.translated):hideCaption(p);
}
function showCaption(p,text,error,translated=true){const n=p.querySelector("[data-subtitle-text]");if(!n)return;n.textContent=String(text||"");n.style.color=error?"#ffb1bd":"#fff";n.dir=translated!==false&&(targetLanguage==="fa"||targetLanguage==="ar")?"rtl":"auto";n.classList.toggle("show",Boolean(text));}
function hideCaption(p){p.querySelector("[data-subtitle-text]")?.classList.remove("show");}
function bindPlayer(p){
 if(p.dataset.vexaLiveSubtitles==="12")return;p.dataset.vexaLiveSubtitles="12";installStyle();installUI(p);const v=p.querySelector("video");if(!v)return;
 v.addEventListener("play",()=>{if(enabled){startCaptionFrames(p,v);socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}});
 v.addEventListener("playing",()=>{if(enabled){startCaptionFrames(p,v);if(!socket){socketGeneration++;reconnectAttempt=0;connectRealtime(p,socketGeneration);}sendPlaybackState(v,true);}renderCaption(p,v);});
 v.addEventListener("timeupdate",()=>sendPlaybackState(v,false));
 v.addEventListener("pause",()=>{stopCaptionFrames();if(enabled)closeSocket(true);renderCaption(p,v);});
 v.addEventListener("waiting",()=>sendPlaybackState(v,true));
 v.addEventListener("stalled",()=>sendPlaybackState(v,true));
 v.addEventListener("seeking",()=>{if(enabled)closeSocket(true);slots.clear();lastPlaybackState=-1;hideCaption(p);});
 v.addEventListener("seeked",()=>restartFromCurrentTime(p));
 v.addEventListener("ratechange",()=>restartFromCurrentTime(p));
 v.addEventListener("loadedmetadata",()=>{if(enabled)restartFromCurrentTime(p);});
 v.addEventListener("emptied",()=>{stopCaptionFrames();if(enabled){closeSocket(true);slots.clear();lastPlaybackState=-1;hideCaption(p);}});
 v.addEventListener("ended",()=>{stopCaptionFrames();if(enabled){closeSocket(true);slots.clear();lastPlaybackState=-1;hideCaption(p);}});
}
function install(){const p=document.getElementById(PLAYER_ID);if(!p||!p.querySelector("video"))return false;bindPlayer(p);return true;}
if(!install()){const o=new MutationObserver(()=>{if(install())o.disconnect();});o.observe(document.documentElement,{childList:true,subtree:true});}
})();
`;
