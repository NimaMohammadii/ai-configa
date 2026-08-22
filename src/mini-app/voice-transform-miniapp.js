import { getMiniAppAccessSettings, isAdmin } from "../admin.js";
import { getBalance, spendCredits } from "../credits.js";
import { normalizeLang } from "../i18n.js";
import { getState } from "../state.js";
import {
  buildTtsAudioFileName,
  getMiniAppTtsHistory,
  getNextTtsFileSequence,
  saveTtsHistory,
} from "../tts-history.js";
import { transformVoiceMediaForV3 } from "../voice-transform.js";
import { VOICES, isLockedVoice } from "../voices.js";
import { authenticateMiniAppPayload } from "./auth.js";
import VEXA_VOICE_ORB_SOURCE from "./vexa-live/voice-orb-original.txt";

const VOICE_TRANSFORM_PATH = "/mini-app/api/voice-transform";
const MINI_APP_SCRIPT_PATH = "/mini-app/app.js";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_DURATION_MS = 180 * 1000;

export async function handleMiniAppVoiceTransformRequest(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== VOICE_TRANSFORM_PATH) return null;

  try {
    const form = await request.formData();
    const user = await authenticateMiniAppPayload({ initData: String(form.get("initData") || "") }, env);
    const admin = await isAdmin(env, user.id);
    const access = await getMiniAppAccessSettings(env);
    if (access.adminOnly && !admin) return json({ error: "Mini app is updating." }, 423);

    const audio = form.get("audio");
    if (!audio || typeof audio.arrayBuffer !== "function") {
      return json({ error: "Record your voice first." }, 400);
    }
    const size = Math.max(0, Number(audio.size || 0));
    if (!size) return json({ error: "The recording is empty." }, 400);
    if (size > MAX_AUDIO_BYTES) return json({ error: "The recording is too large. Keep it under 20 MB." }, 413);

    const durationMs = Math.max(0, Number(form.get("durationMs") || 0));
    if (durationMs > MAX_DURATION_MS + 1500) {
      return json({ error: "Recordings are limited to 3 minutes." }, 400);
    }

    const state = await getState(env, user.id);
    const voiceName = resolveVoiceName(form.get("voice")) || resolveVoiceName(state?.voice) || "Nora";
    const voiceId = VOICES[voiceName] || VOICES.Nora;
    if (isLockedVoice(voiceName) && !admin) {
      return json({ error: "This voice is currently locked. Choose an available voice first." }, 403);
    }

    const lang = normalizeLang(state?.language || user?.language_code || "en");
    const startingBalance = await getBalance(env, user.id);
    if (startingBalance <= 0) return json({ error: "Not enough credits." }, 402);

    const buffer = await audio.arrayBuffer();
    const transformed = await transformVoiceMediaForV3(env, {
      buffer,
      filename: safeAudioFilename(audio.name, audio.type),
      mimeType: String(audio.type || "application/octet-stream"),
      voiceId,
      lang,
      beforeGenerate: async ({ transcriptChars }) => {
        const currentBalance = await getBalance(env, user.id);
        if (currentBalance < transcriptChars) {
          throw httpError(
            "Not enough credits · Voice creation needs " + transcriptChars.toLocaleString("en-US") +
              " credits · Balance " + currentBalance.toLocaleString("en-US") + " credits",
            402,
          );
        }
      },
    });

    const sequence = await getNextTtsFileSequence(env, user.id);
    const filename = buildTtsAudioFileName(sequence);
    const audioBase64 = arrayBufferToBase64(transformed.outputAudio);
    const language = String(transformed.transcript?.language_code || lang);

    await saveTtsHistory(
      env,
      user.id,
      transformed.cleanTranscript,
      voiceName,
      language,
      transformed.transcriptChars,
      null,
      sequence,
      audioBase64,
      "mini_app",
    ).catch((error) => {
      console.error("save mini app V3 voice history failed", error?.message || error);
    });

    const spent = await spendCredits(env, user.id, transformed.transcriptChars, "mini_app_voice_v3", {
      voice: voiceName,
      language,
      sourceType: "microphone",
      duration: durationMs > 0 ? Math.round(durationMs / 1000) : null,
    });
    if (!spent?.ok) return json({ error: "Not enough credits." }, 402);

    const latest = await getMiniAppTtsHistory(env, user.id, 1).catch(() => []);
    const historyId = latest?.[0]?.file_sequence === sequence ? latest[0].id : null;

    return json({
      audioBase64,
      filename,
      mimeType: "audio/mpeg",
      voice: voiceName,
      voiceId,
      dialogue: false,
      language,
      balance: Number(spent.balance ?? (startingBalance - transformed.transcriptChars)),
      historyId,
      revision: 0,
      text: transformed.cleanTranscript,
      alignment: null,
      editable: false,
      voiceTransform: true,
    });
  } catch (error) {
    console.error("mini app voice transform failed", error?.stack || error);
    return json({ error: error?.message || "Voice conversion failed. Please try again." }, Number(error?.status) || 500);
  }
}

export async function appendMiniAppVoiceTransformRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const url = new URL(request.url);
  if (url.pathname !== MINI_APP_SCRIPT_PATH) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  if (source.includes("vexa:voice-transform-generated")) return cloneTextResponse(response, source);

  const bridgeMarker = "  function playTts(){";
  if (!source.includes(bridgeMarker)) {
    console.error("Mini App voice transform bridge target missing");
    return cloneTextResponse(response, source);
  }

  source = source.replace(bridgeMarker, VOICE_TRANSFORM_RESULT_BRIDGE + "\n" + bridgeMarker);
  return cloneTextResponse(response, source + "\n" + MINI_APP_VOICE_TRANSFORM_UI);
}

function resolveVoiceName(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (VOICES[raw]) return raw;
  return Object.keys(VOICES).find((name) => VOICES[name] === raw) || null;
}

function safeAudioFilename(name, mimeType) {
  const raw = String(name || "").split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "_");
  if (raw && raw.includes(".")) return raw;
  const type = String(mimeType || "").toLowerCase();
  const extension = type.includes("mp4") || type.includes("m4a") ? ".m4a" :
    type.includes("ogg") ? ".ogg" : type.includes("wav") ? ".wav" : ".webm";
  return (raw || "voice-recording") + extension;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let output = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(output);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function cloneTextResponse(response, text) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(text, { status: response.status, statusText: response.statusText, headers });
}

const VOICE_TRANSFORM_RESULT_BRIDGE = String.raw`
  window.addEventListener('vexa:voice-transform-generated',function(event){
    var data=event&&event.detail||{};
    if(!data||!data.audioBase64)return;
    if(data.voice&&!data.dialogue)setVoiceByName(data.voice);
    availableCredits=Math.max(0,Number(data.balance)||0);
    currentLanguage=String(data.language||currentLanguage||'en');
    updateImageCreditNote();
    setText('balance',availableCredits.toLocaleString('en-US'));
    generatedFileName=String(data.filename||'vexa-voice.mp3');
    var audio=q('ttsAudio');
    var player=q('wavePlayer');
    if(audio){audio.pause();audio.removeAttribute('src');audio.load()}
    stopPreview();
    setWavePlaying(false);
    syncMainWave();
    renderMainWaveform('');
    var audioSrc='data:'+(data.mimeType||'audio/mpeg')+';base64,'+data.audioBase64;
    if(audio){audio.src=audioSrc;renderMainWaveform(audio.src)}
    window.dispatchEvent(new CustomEvent('vexa:tts-generated',{detail:{historyId:data.historyId||null,revision:Number(data.revision||0),voiceId:String(data.voiceId||''),text:String(data.text||''),alignment:data.alignment||null,editable:!!data.editable,audioSrc:audioSrc}}));
    if(player)player.classList.add('show');
    historyLoaded=false;
  });
`;

const MINI_APP_VOICE_TRANSFORM_UI = String.raw`
(function(){
  if(window.__vexaMiniVoiceTransformInstalled)return;
  window.__vexaMiniVoiceTransformInstalled=true;

  var tg=window.Telegram&&window.Telegram.WebApp;
  var recorder=null;
  var stream=null;
  var audioContext=null;
  var analyser=null;
  var analyserData=null;
  var analyserSource=null;
  var energyFrame=0;
  var chunks=[];
  var startedAt=0;
  var maxTimer=0;
  var cancelled=false;
  var state={active:false,phase:'idle',micEnergy:0,socket:{addEventListener:function(){}},orb:null};

  function q(id){return document.getElementById(id)}
  function playbackEnergy(){return 0}
  function haptic(kind){try{if(kind==='success')tg&&tg.HapticFeedback&&tg.HapticFeedback.notificationOccurred&&tg.HapticFeedback.notificationOccurred('success');else if(kind==='error')tg&&tg.HapticFeedback&&tg.HapticFeedback.notificationOccurred&&tg.HapticFeedback.notificationOccurred('error');else tg&&tg.HapticFeedback&&tg.HapticFeedback.impactOccurred&&tg.HapticFeedback.impactOccurred(kind||'light')}catch(error){}}
  function setPhase(phase,label){state.phase=phase;var overlay=q('vexaVoiceTransformOverlay');if(overlay){overlay.classList.remove('listening','thinking','error');if(phase)overlay.classList.add(phase)}var status=q('vexaVoiceTransformStatus');if(status)status.textContent=String(label||'')}
  function fail(error){setPhase('error',String(error&&error.message||'Voice conversion failed'));haptic('error')}

${VEXA_VOICE_ORB_SOURCE}

  function ensureStyles(){
    if(q('vexaVoiceTransformStyles'))return;
    var style=document.createElement('style');
    style.id='vexaVoiceTransformStyles';
    style.textContent='.vexa-vt-open{width:32px;height:32px;flex:0 0 32px;padding:0;border:0;border-radius:10px;display:grid;place-items:center;color:rgba(255,255,255,.74);background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);transition:transform .2s ease,background .2s ease,color .2s ease}.vexa-vt-open svg{width:16px;height:16px}.vexa-vt-open:active{transform:scale(.9);background:rgba(255,255,255,.1);color:#fff}.vexa-vt-overlay{position:fixed;z-index:90;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top)) 18px calc(26px + env(safe-area-inset-bottom));background:#080808;color:#fff;opacity:0;visibility:hidden;pointer-events:none;transform:scale(1.018);transition:opacity .3s ease,transform .46s cubic-bezier(.16,.86,.22,1),visibility 0s linear .46s;overflow:hidden}.vexa-vt-overlay.open{opacity:1;visibility:visible;pointer-events:auto;transform:scale(1);transition-delay:0s}.vexa-vt-cancel{position:absolute;z-index:3;top:calc(16px + env(safe-area-inset-top));left:16px;width:38px;height:38px;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.05);font-size:20px;font-weight:300;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .2s ease,opacity .2s ease}.vexa-vt-cancel:active{transform:scale(.9)}.vexa-vt-overlay.thinking .vexa-vt-cancel{opacity:.24;pointer-events:none}.vexa-vt-stage{position:relative;width:min(78vw,340px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:scale(.72);filter:blur(8px);transition:opacity .42s .03s ease,transform .66s cubic-bezier(.16,1,.3,1),filter .42s ease}.vexa-vt-overlay.open .vexa-vt-stage{opacity:1;transform:scale(1);filter:blur(0)}.vexa-vt-orb{display:block;width:100%;height:100%;touch-action:manipulation;cursor:pointer}.vexa-vt-copy{min-height:42px;margin-top:-14px;display:flex;flex-direction:column;align-items:center;text-align:center;opacity:0;transform:translateY(9px);transition:opacity .28s .16s ease,transform .42s .12s cubic-bezier(.16,1,.3,1)}.vexa-vt-overlay.open .vexa-vt-copy{opacity:1;transform:none}.vexa-vt-copy .vexa-voice-status{height:auto!important;min-height:20px!important;max-width:86vw!important;color:rgba(255,255,255,.72)!important;font-size:12px!important;font-weight:650!important;line-height:1.35!important;letter-spacing:-.015em!important;text-align:center!important}.vexa-vt-hint{margin-top:7px;color:rgba(255,255,255,.28);font-size:9px;font-weight:560}.vexa-vt-overlay.thinking .vexa-vt-hint{opacity:.28}.vexa-vt-overlay.error .vexa-voice-status{color:rgba(255,210,220,.78)!important}@media(max-height:650px){.vexa-vt-stage{width:min(58vh,290px)}.vexa-vt-copy{margin-top:-20px}}';
    document.head.appendChild(style);
  }

  function ensureUi(){
    ensureStyles();
    var tools=document.querySelector('.tts-enhance-tools');
    if(tools&&!q('vexaVoiceTransformOpen')){
      var button=document.createElement('button');
      button.id='vexaVoiceTransformOpen';
      button.className='vexa-vt-open';
      button.type='button';
      button.setAttribute('aria-label','Transform your voice');
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.2" y="3" width="7.6" height="12" rx="3.8" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
      tools.insertBefore(button,tools.firstChild);
      button.addEventListener('click',function(){openRecorder().catch(function(error){fail(error);setTimeout(closeOverlay,1500)})});
    }
    var page=document.querySelector('.tts-page');
    if(page&&!q('vexaVoiceTransformOverlay')){
      var overlay=document.createElement('section');
      overlay.id='vexaVoiceTransformOverlay';
      overlay.className='vexa-vt-overlay';
      overlay.setAttribute('aria-hidden','true');
      overlay.innerHTML='<button id="vexaVoiceTransformCancel" class="vexa-vt-cancel" type="button" aria-label="Cancel">×</button><div class="vexa-vt-stage"><canvas id="vexaVoiceTransformOrb" class="vexa-vt-orb" aria-label="Voice activity orb"></canvas></div><div class="vexa-vt-copy"><div id="vexaVoiceTransformStatus" class="vexa-voice-status">Ready</div><div id="vexaVoiceTransformHint" class="vexa-vt-hint">Tap the orb when you are done</div></div>';
      page.appendChild(overlay);
      q('vexaVoiceTransformCancel').addEventListener('click',cancelRecording);
      q('vexaVoiceTransformOrb').addEventListener('click',function(){if(state.active&&state.phase==='listening')finishRecording()});
    }
  }

  function selectedVoice(){
    var turn=document.querySelector('[data-dialogue-turn].active')||document.querySelector('[data-dialogue-turn]');
    return {id:String(turn&&turn.getAttribute('data-voice')||''),name:String(turn&&turn.getAttribute('data-voice-name')||q('voiceLabel')&&q('voiceLabel').textContent||'Voice')};
  }

  function preferredMimeType(){
    if(typeof MediaRecorder==='undefined'||!MediaRecorder.isTypeSupported)return'';
    var types=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'];
    for(var i=0;i<types.length;i+=1)if(MediaRecorder.isTypeSupported(types[i]))return types[i];
    return'';
  }

  function extensionFor(type){type=String(type||'').toLowerCase();if(type.indexOf('mp4')>=0)return'm4a';if(type.indexOf('ogg')>=0)return'ogg';if(type.indexOf('wav')>=0)return'wav';return'webm'}

  async function openRecorder(){
    if(state.active||document.body.classList.contains('image-mode'))return;
    ensureUi();
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Microphone is not available on this device');
    if(typeof MediaRecorder==='undefined')throw new Error('Voice recording is not supported on this device');
    var voice=selectedVoice();
    if(!voice.id)throw new Error('Choose a voice first');
    var active=document.activeElement;if(active&&typeof active.blur==='function')active.blur();
    state.active=true;state.phase='connecting';state.micEnergy=0;cancelled=false;chunks=[];
    var overlay=q('vexaVoiceTransformOverlay');overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
    setPhase('connecting','Preparing microphone');
    var canvas=q('vexaVoiceTransformOrb');
    state.orb=createOrbRenderer(canvas);state.orb.start();
    haptic('medium');
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(!state.active){stream.getTracks().forEach(function(track){track.stop()});stream=null;return}
      startEnergyMeter(stream);
      var mime=preferredMimeType();
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      recorder.addEventListener('dataavailable',function(event){if(event.data&&event.data.size)chunks.push(event.data)});
      recorder.addEventListener('stop',onRecorderStopped,{once:true});
      recorder.start(250);
      startedAt=Date.now();
      maxTimer=setTimeout(function(){if(state.active&&state.phase==='listening')finishRecording()},180000);
      setPhase('listening','Listening · '+voice.name+' V3');
    }catch(error){cleanupMedia();state.active=false;if(state.orb){state.orb.stop();state.orb=null}throw error}
  }

  function startEnergyMeter(mediaStream){
    var AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    audioContext=new AudioContextClass();
    analyser=audioContext.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.55;
    analyserData=new Uint8Array(analyser.fftSize);
    analyserSource=audioContext.createMediaStreamSource(mediaStream);analyserSource.connect(analyser);
    function frame(){if(!state.active||!analyser)return;analyser.getByteTimeDomainData(analyserData);var sum=0;for(var i=0;i<analyserData.length;i+=1)sum+=Math.abs(analyserData[i]-128);state.micEnergy=Math.min(1,(sum/analyserData.length)/24);energyFrame=requestAnimationFrame(frame)}
    energyFrame=requestAnimationFrame(frame);
  }

  function finishRecording(){
    if(!state.active||state.phase!=='listening'||!recorder)return;
    clearTimeout(maxTimer);maxTimer=0;
    setPhase('thinking','Generating '+selectedVoice().name+' V3');
    var hint=q('vexaVoiceTransformHint');if(hint)hint.textContent='Analyzing your delivery and pauses';
    haptic('light');
    if(recorder.state!=='inactive')recorder.stop();
  }

  function cancelRecording(){
    if(!state.active||state.phase==='thinking')return;
    cancelled=true;clearTimeout(maxTimer);maxTimer=0;
    if(recorder&&recorder.state!=='inactive'){recorder.stop();return}
    closeOverlay();
  }

  async function onRecorderStopped(){
    var durationMs=Math.max(0,Date.now()-startedAt);
    var type=String(recorder&&recorder.mimeType||chunks[0]&&chunks[0].type||'audio/webm');
    var blob=new Blob(chunks,{type:type});
    cleanupMedia();
    if(cancelled){closeOverlay();return}
    if(!blob.size){fail(new Error('The recording is empty'));setTimeout(closeOverlay,1400);return}
    try{
      var voice=selectedVoice();
      var form=new FormData();
      form.append('initData',String(tg&&tg.initData||''));
      form.append('voice',voice.id);
      form.append('durationMs',String(durationMs));
      form.append('audio',blob,'voice-recording.'+extensionFor(type));
      var response=await fetch('/mini-app/api/voice-transform',{method:'POST',body:form,cache:'no-store'});
      var data=await response.json().catch(function(){return{}});
      if(!response.ok)throw new Error(String(data&&data.error||'Voice conversion failed'));
      window.dispatchEvent(new CustomEvent('vexa:voice-transform-generated',{detail:data}));
      haptic('success');
      closeOverlay();
    }catch(error){fail(error);setTimeout(closeOverlay,1800)}
  }

  function cleanupMedia(){
    clearTimeout(maxTimer);maxTimer=0;
    if(energyFrame)cancelAnimationFrame(energyFrame);energyFrame=0;
    try{if(analyserSource)analyserSource.disconnect()}catch(error){}
    analyserSource=null;analyser=null;analyserData=null;
    if(audioContext){try{audioContext.close()}catch(error){}}audioContext=null;
    if(stream){stream.getTracks().forEach(function(track){try{track.stop()}catch(error){}})}stream=null;
    recorder=null;chunks=[];state.micEnergy=0;
  }

  function closeOverlay(){
    cleanupMedia();state.active=false;state.phase='idle';
    if(state.orb){state.orb.stop();state.orb=null}
    var overlay=q('vexaVoiceTransformOverlay');if(overlay){overlay.classList.remove('open','listening','thinking','error');overlay.setAttribute('aria-hidden','true')}
    var hint=q('vexaVoiceTransformHint');if(hint)hint.textContent='Tap the orb when you are done';
    setPhase('idle','Ready');
  }

  ensureUi();
})();
`;
