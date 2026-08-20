import { Container, getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH="/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION="20260820-12";
const TRANSLATION_MODEL="gpt-5.6-terra";
const TRANSLATE_TIMEOUT_MS=20000;
const PCM_SAMPLE_RATE=16000,PCM_FRAME_BYTES=3200;
const LIVE_SOURCE_MAX_WORDS=14,LIVE_SOURCE_MAX_CHARS=160;
const TARGET_LANGUAGES=Object.freeze({original:"Original",en:"English",fa:"Persian",ru:"Russian",de:"German",tr:"Turkish",es:"Spanish",ar:"Arabic",fr:"French",pt:"Portuguese",it:"Italian",hi:"Hindi",zh:"Chinese",ja:"Japanese",ko:"Korean"});
const SCRIBE_ERROR_TYPES=new Set(["error","auth_error","quota_exceeded","transcriber_error","input_error","invalid_request","unaccepted_terms","commit_throttled","rate_limited","queue_overflow","resource_exhausted","session_time_limit_exceeded","chunk_size_exceeded","insufficient_audio_activity"]);

export class VexaSubtitleContainer extends Container {
  sleepAfter="2m";
  enableInternet=true;
  entrypoint=["sh","-c","trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudio=null;

  async ensureAudioReady(){if(!this.ctx.container.running)await this.start();}

  async streamAudioPcm(mediaUrl,startSeconds,playbackRate,streamId){
    await this.ensureAudioReady();
    const id=cleanStreamId(streamId);
    if(!id)throw new Error("Subtitle audio stream id is invalid");
    if(this.activeAudio?.process){try{this.activeAudio.process.kill();}catch{}this.activeAudio=null;}
    const rate=Math.max(.25,Math.min(4,Number(playbackRate)||1));
    const process=await this.ctx.container.exec([
      "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
      "-readrate",rate.toFixed(3),"-ss",Number(startSeconds||0).toFixed(3),"-i",String(mediaUrl),
      "-vn","-ac","1","-ar",String(PCM_SAMPLE_RATE),"-c:a","pcm_s16le","-f","s16le","pipe:1"
    ]);
    if(!process.stdout){try{process.kill();}catch{}throw new Error("Could not start realtime subtitle audio");}
    this.activeAudio={id,process};
    process.exitCode.catch(()=>-1).finally(()=>{if(this.activeAudio?.id===id&&this.activeAudio?.process===process)this.activeAudio=null;});
    return process.stdout;
  }

  async stopAudioStream(streamId){
    const id=cleanStreamId(streamId);
    if(!id||this.activeAudio?.id!==id)return false;
    const process=this.activeAudio.process;this.activeAudio=null;
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
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);
  server.accept();
  const controller=new AbortController();
  const playbackStart={value:null,resolve:null};
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
      if(started)return;started=true;
      runRealtimeSubtitleSession({request,env,server,payload:message,playbackStart,signal:controller.signal,send}).catch(fail);
    }else if(message?.type==="playback_start"&&started&&!playbackStart.value){
      playbackStart.value={currentTime:message.currentTime,playbackRate:message.playbackRate};
      if(playbackStart.resolve)playbackStart.resolve(playbackStart.value);
    }else if(message?.type==="stop"){
      abort();try{server.close(1000,"stopped");}catch{}
    }
  });
  server.addEventListener("close",abort);
  server.addEventListener("error",abort);
  return new Response(null,{status:101,webSocket:client});
}

async function runRealtimeSubtitleSession({request,env,server,payload,playbackStart,signal,send}){
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
  const upstreamResponse=await fetch(scribeUrl,{headers:{Upgrade:"websocket","xi-api-key":apiKey}});
  const upstream=upstreamResponse.webSocket;
  if(!upstream||upstreamResponse.status!==101)throw httpError("Realtime transcription connection is unavailable",502);
  upstream.accept();

  const streamId=crypto.randomUUID();
  const playbackUrl=new URL("/mini-app/live/api/youtube-playback?token="+encodeURIComponent(token),request.url).href;
  const container=getContainer(env.VEXA_SUBTITLES,"subtitle-"+safeContainerKey(user.id));
  let audioStream=null,translationLoopPromise=null,pendingPartial="",lastPartial="",upstreamEndedNormally=false,completed=false;
  let scribeReadyResolve;
  const scribeReady=new Promise((resolve,reject)=>{
    const onAbort=()=>reject(new Error("aborted"));
    scribeReadyResolve=()=>{signal.removeEventListener("abort",onAbort);resolve();};
    signal.addEventListener("abort",onAbort,{once:true});
  });
  const closeUpstream=()=>{try{upstream.close(1000,"stopped");}catch{}};
  signal.addEventListener("abort",closeUpstream,{once:true});

  const runTranslationLoop=()=>{
    translationLoopPromise=(async()=>{
      while(pendingPartial&&!signal.aborted&&server.readyState===WebSocket.OPEN){
        const sourceText=pendingPartial;
        pendingPartial="";
        try{
          if(targetLanguage==="original")send({type:"caption",text:sourceText,translated:false});
          else await translateLiveSubtitle({env,sourceText,targetLanguage,signal,onText:text=>{
            if(!signal.aborted&&server.readyState===WebSocket.OPEN)send({type:"caption",text,translated:true});
          }});
        }catch(error){
          if(signal.aborted)return;
          console.error("Vexa live partial translation failed",error?.stack||error);
          send({type:"error",error:publicError(error)});
        }
      }
    })().finally(()=>{
      translationLoopPromise=null;
      if(pendingPartial&&!signal.aborted&&server.readyState===WebSocket.OPEN)return runTranslationLoop();
    });
    return translationLoopPromise;
  };
  const queuePartial=value=>{
    const sourceText=liveSubtitleWindow(value);
    if(!sourceText||sourceText===lastPartial)return;
    lastPartial=sourceText;
    pendingPartial=sourceText;
    if(!translationLoopPromise)runTranslationLoop();
  };

  upstream.addEventListener("message",event=>{
    if(signal.aborted)return;
    let message;try{message=JSON.parse(String(event.data||"{}"));}catch{return;}
    const type=String(message?.message_type||"");
    if(type==="session_started"){scribeReadyResolve();return;}
    if(type==="partial_transcript"){queuePartial(message?.text);return;}
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
    audioStream=await container.streamAudioPcm(playbackUrl,start,playbackRate,streamId);
    send({type:"ready"});
    await streamPcmToScribe(audioStream,upstream,signal);
    if(translationLoopPromise)await translationLoopPromise;
    if(!signal.aborted){completed=true;send({type:"ended"});}
  }finally{
    upstreamEndedNormally=true;
    signal.removeEventListener("abort",closeUpstream);
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

async function streamPcmToScribe(audioStream,upstream,signal){
  const reader=audioStream.getReader();
  let pending=new Uint8Array(0);
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
        if(upstream.readyState!==WebSocket.OPEN)throw httpError("Realtime transcription connection closed",502);
        upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(frame),sample_rate:PCM_SAMPLE_RATE}));
      }
    }
    if(pending.byteLength&&!signal.aborted&&upstream.readyState===WebSocket.OPEN){
      upstream.send(JSON.stringify({message_type:"input_audio_chunk",audio_base_64:bytesToBase64(pending),sample_rate:PCM_SAMPLE_RATE}));
    }
  }finally{
    signal.removeEventListener("abort",cancelReader);
    try{await reader.cancel();}catch{}
  }
}

async function translateLiveSubtitle({env,sourceText,targetLanguage,signal,onText}){
  if(!env.GPT_API)throw httpError("AI translation is unavailable",503);
  const languageName=TARGET_LANGUAGES[targetLanguage];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TRANSLATE_TIMEOUT_MS);
  const abortFromSession=()=>controller.abort();
  signal.addEventListener("abort",abortFromSession,{once:true});
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+env.GPT_API,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model:TRANSLATION_MODEL,
        instructions:"Translate this rolling live subtitle window into "+languageName+". It may begin or end mid-sentence. Translate only the text present; do not invent missing context. Keep the result short enough for two subtitle lines. Preserve names, numbers and tone. Return only the translation with no label, explanation, quotes or markdown.",
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
    const text=await readTranslationStream(response,onText,signal);
    if(!text)throw httpError("AI translation returned an empty result",502);
    return text;
  }catch(error){
    if(controller.signal.aborted&&!signal.aborted)throw httpError("Subtitle translation timed out",504);
    throw error;
  }finally{
    clearTimeout(timer);
    signal.removeEventListener("abort",abortFromSession);
  }
}

async function readTranslationStream(response,onText,signal){
  if(!response.body)throw httpError("AI translation stream is unavailable",502);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer="",output="";
  const consume=frame=>{
    const data=frame.split(/\r?\n/u).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
    if(!data||data==="[DONE]")return;
    let event;try{event=JSON.parse(data);}catch{return;}
    if(event?.type==="response.output_text.delta"&&typeof event.delta==="string"){
      output+=event.delta;
      const text=cleanTranslatedText(output);
      if(text&&!signal.aborted)onText(text);
      return;
    }
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
  }finally{
    try{reader.releaseLock();}catch{}
  }
  return cleanTranslatedText(output);
}

async function selectedElevenApiKey(env){const name=await getElevenApiSetting(env);return String(env[name]||"").trim();}
async function assertLiveAccess(env,userId){if(await isAdmin(env,userId))return;const[globalAccess,liveAccess]=await Promise.all([getMiniAppAccessSettings(env),getVexaLiveAccessSettings(env)]);if(globalAccess.adminOnly||liveAccess.adminOnly)throw httpError("Vexa Live is updating",423);}
function normalizeTargetLanguage(value){const key=String(value||"original").trim().toLowerCase();return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES,key)?key:"";}
function cleanToken(value){const token=String(value||"").trim();return/^[A-Za-z0-9_-]{40,160}$/.test(token)?token:"";}
function cleanStreamId(value){const id=String(value||"").trim();return/^[A-Za-z0-9-]{20,80}$/.test(id)?id:"";}
function safeContainerKey(value){const raw=String(value||"anonymous").replace(/[^A-Za-z0-9_-]/g,"");return(raw||"anonymous").slice(0,80);}
function finiteNumber(value,min,max){const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;}
function cleanSubtitleText(value){return String(value||"").replace(/\s+([,.;:!?،؛؟])/g,"$1").replace(/\s+/g," ").trim();}
function liveSubtitleWindow(value){
  const text=cleanSubtitleText(value);
  if(!text)return"";
  const words=text.split(/\s+/u),wordWindow=words.length>LIVE_SOURCE_MAX_WORDS?words.slice(-LIVE_SOURCE_MAX_WORDS).join(" "):text;
  const characters=Array.from(wordWindow);
  if(characters.length<=LIVE_SOURCE_MAX_CHARS)return wordWindow;
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

export const LIVE_SUBTITLES_RUNTIME_JS=String.raw`
(function(){
const SOCKET_PATH="/mini-app/live/api/youtube-subtitles/realtime",PLAYER_ID="vexaCustomPlayer",STYLE_ID="vexaLiveSubtitlesStyle";
const LANGUAGES=[["off","Off",""],["original","Original audio","Auto"],["en","English","EN"],["fa","فارسی","FA"],["ru","Русский","RU"],["de","Deutsch","DE"],["tr","Türkçe","TR"],["es","Español","ES"],["ar","العربية","AR"],["fr","Français","FR"],["pt","Português","PT"],["it","Italiano","IT"],["hi","हिन्दी","HI"],["zh","中文","ZH"],["ja","日本語","JA"],["ko","한국어","KO"]];
let enabled=false,targetLanguage="original",socket=null,generation=0;

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const h=hostWindow();return window.Telegram?.WebApp||h.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||"");}
function haptic(s){try{telegram()?.HapticFeedback?.impactOccurred?.(s||"light");}catch{}}
function playbackToken(v){try{const t=new URL(String(v?.currentSrc||v?.src||""),window.location.origin).searchParams.get("token")||"";return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:"";}catch{return"";}}
function websocketUrl(){const u=new URL(SOCKET_PATH,window.location.href);u.protocol=u.protocol==="https:"?"wss:":"ws:";return u.href;}

function installStyle(){
 if(document.getElementById(STYLE_ID))return;
 const s=document.createElement("style");s.id=STYLE_ID;
 s.textContent="#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}#vexaCustomPlayer .vexa-subtitle-text{max-width:min(780px,92%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;font-size:clamp(15px,3.8vw,22px);line-height:1.32;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}#vexaCustomPlayer.is-fullscreen .vexa-subtitle-drawer{bottom:calc(10px + env(safe-area-inset-bottom))}";
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
function closeSocket(){
 const current=socket;socket=null;generation++;
 if(!current)return;
 current.__vexaIntentional=true;
 try{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:"stop"}));}catch{}
 try{current.close(1000,"stopped");}catch{}
}
function stopSubtitles(p){enabled=false;targetLanguage="original";closeSocket();hideCaption(p);}
function startSubtitles(p,l){
 const v=p.querySelector("video");if(!v||!playbackToken(v))return;
 enabled=true;targetLanguage=l;closeSocket();
 hideCaption(p);
 if(!v.paused&&!v.ended)connectRealtime(p,v);
}
function connectRealtime(p,v){
 if(!enabled||!v||v.paused||v.ended)return;
 if(socket&&(socket.readyState===WebSocket.CONNECTING||socket.readyState===WebSocket.OPEN))return;
 const token=playbackToken(v);if(!token){showCaption(p,"Video session is invalid",true);return;}
 const currentGeneration=++generation,ws=new WebSocket(websocketUrl());socket=ws;
 ws.addEventListener("open",()=>{
   if(!enabled||socket!==ws||generation!==currentGeneration){try{ws.close();}catch{}return;}
   ws.send(JSON.stringify({type:"start",initData:initData(),playbackToken:token,targetLanguage}));
 });
 ws.addEventListener("message",event=>{
   if(!enabled||socket!==ws||generation!==currentGeneration)return;
   let message;try{message=JSON.parse(String(event.data||"{}"));}catch{return;}
   if(message.type==="audio_ready"){
     ws.send(JSON.stringify({type:"playback_start",currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1)))}));
     return;
   }
   if(message.type==="ready"){hideCaption(p);return;}
   if(message.type==="caption"){const text=String(message.text||"").trim();if(text)showCaption(p,text,false);return;}
   if(message.type==="error"){ws.__vexaFailed=true;showCaption(p,String(message.error||"Live subtitles are unavailable"),true);return;}
   if(message.type==="ended"){closeSocket();}
 });
 ws.addEventListener("close",()=>{
   if(socket!==ws||generation!==currentGeneration)return;
   socket=null;
   if(enabled&&!ws.__vexaIntentional&&!ws.__vexaFailed&&!v.paused&&!v.ended)showCaption(p,"Live subtitles disconnected",true);
 });
 ws.addEventListener("error",()=>{if(socket===ws){ws.__vexaFailed=true;showCaption(p,"Live subtitles connection failed",true);}});
}
function restartFromCurrentTime(p){
 if(!enabled)return;
 const v=p.querySelector("video");if(!v)return;
 closeSocket();hideCaption(p);
 if(!v.paused&&!v.ended)connectRealtime(p,v);
}
function showCaption(p,text,error){const n=p.querySelector("[data-subtitle-text]");if(!n)return;n.textContent=String(text||"");n.style.color=error?"#ffb1bd":"#fff";n.dir=targetLanguage==="fa"||targetLanguage==="ar"?"rtl":"auto";n.classList.toggle("show",Boolean(text));}
function hideCaption(p){p.querySelector("[data-subtitle-text]")?.classList.remove("show");}
function bindPlayer(p){
 if(p.dataset.vexaLiveSubtitles==="14")return;p.dataset.vexaLiveSubtitles="14";installStyle();installUI(p);const v=p.querySelector("video");if(!v)return;
 v.addEventListener("play",()=>{if(enabled)connectRealtime(p,v);});
 v.addEventListener("playing",()=>{if(enabled)connectRealtime(p,v);});
 v.addEventListener("pause",()=>{if(enabled)closeSocket();hideCaption(p);});
 v.addEventListener("waiting",()=>{if(enabled)closeSocket();hideCaption(p);});
 v.addEventListener("seeking",()=>{if(enabled)closeSocket();hideCaption(p);});
 v.addEventListener("seeked",()=>{if(enabled&&!v.paused&&!v.ended)connectRealtime(p,v);});
 v.addEventListener("ratechange",()=>restartFromCurrentTime(p));
 v.addEventListener("loadedmetadata",()=>restartFromCurrentTime(p));
 v.addEventListener("emptied",()=>{if(enabled)closeSocket();hideCaption(p);});
 v.addEventListener("ended",()=>{if(enabled)closeSocket();hideCaption(p);});
}
function install(){const p=document.getElementById(PLAYER_ID);if(!p||!p.querySelector("video"))return false;bindPlayer(p);return true;}
if(!install()){const observer=new MutationObserver(()=>{if(install())observer.disconnect();});observer.observe(document.documentElement,{childList:true,subtree:true});}
})();
`;
