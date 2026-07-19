export const MINI_APP_JS = `
const tg=window.Telegram?.WebApp;

function expandMiniApp(){
  if(!tg)return;
  try{tg.ready?.()}catch(e){}
  try{tg.expand?.()}catch(e){}
  try{tg.requestFullscreen?.()}catch(e){}
  try{tg.disableVerticalSwipes?.()}catch(e){}
}

expandMiniApp();
setTimeout(expandMiniApp,120);
setTimeout(expandMiniApp,500);
setTimeout(expandMiniApp,1200);

const $=(id)=>document.getElementById(id);
const text=$("ttsText");
const count=$("charCount");
const button=$("convertButton");
const player=$("audioPlayer");
const wavePlayer=$("wavePlayer");
const wavePlay=$("wavePlay");
const waveTime=$("waveTime");
const voice=$("voiceName");
const voiceWrap=$("voiceWrap");
const balance=$("balance");
const flow=$("flow");
const toastNode=$("toast");
const limitSheet=$("ttsLimitSheet");
const initData=tg?.initData||"";
const voiceButtons=Array.from(document.querySelectorAll(".voice-menu [data-voice]"));
let selectedVoice="BIvP0GN1cAtSRTxNHnWS";
let lockTimer=null;
let toastTimer=null;

function toast(message){
  if(!toastNode)return;
  toastNode.textContent=message;
  toastNode.style.display="block";
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toastNode.style.display="none"},3000);
}

function setKeyboardOpen(open){
  document.body.classList.toggle("keyboard-open",Boolean(open));
}

function dismissKeyboard(){
  const active=document.activeElement;
  if(active&&typeof active.blur==="function")active.blur();
  setKeyboardOpen(false);
}

function setLimitSheet(open){
  if(!limitSheet)return;
  limitSheet.classList.toggle("open",Boolean(open));
  limitSheet.setAttribute("aria-hidden",open?"false":"true");
}

function updateCharCount(){
  const length=Array.from(text?.value||"").length;
  if(count)count.textContent=String(length)+" characters";
  if(flow)flow.classList.toggle("over-limit",length>1000);
}

function chooseVoice(option){
  if(!option)return;
  selectedVoice=option.getAttribute("data-voice")||selectedVoice;
  voiceButtons.forEach((item)=>item.classList.toggle("active",item===option));
  if(voice)voice.textContent=(option.textContent||"Nora").trim();
  voiceWrap?.classList.remove("open");
}

function chooseVoiceByName(name){
  const cleanName=String(name||"Nora").trim()||"Nora";
  const normalized=cleanName.toLowerCase();
  const match=voiceButtons.find((item)=>String(item.textContent||"").trim().toLowerCase()===normalized);
  if(match){
    chooseVoice(match);
    return;
  }
  selectedVoice=cleanName;
  voiceButtons.forEach((item)=>item.classList.remove("active"));
  if(voice)voice.textContent=cleanName;
  voiceWrap?.classList.remove("open");
}

async function api(path,body){
  const response=await fetch(path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({initData,...body}),
  });
  const data=await response.json().catch(()=>({error:"Invalid response"}));
  if(!response.ok)throw new Error(data.error||"Request failed");
  return data;
}

function showLocked(data){
  document.body.classList.add("is-locked");
  document.body.innerHTML='<main class="lock-screen"><section class="lock-card" aria-label="Mini app update"><p class="lock-title">Updating</p><div class="lock-bar" aria-hidden="true"><span id="lockFill"></span></div></section></main>';
  const fill=$("lockFill");
  const serverNow=Number(data.serverNow)||Math.floor(Date.now()/1000);
  const lockedUntil=Number(data.lockedUntil)||serverNow+60;
  const lockedFrom=Number(data.lockedFrom)||Math.max(serverNow,lockedUntil-60);
  const total=Math.max(1,lockedUntil-lockedFrom);
  const clientServerOffset=serverNow-Date.now()/1000;

  function tick(){
    const now=Date.now()/1000+clientServerOffset;
    const progress=Math.min(100,Math.max(0,(now-lockedFrom)/total*100));
    if(fill)fill.style.width=progress+"%";
    if(now>=lockedUntil){
      clearInterval(lockTimer);
      location.reload();
    }
  }

  tick();
  lockTimer=setInterval(tick,500);
}

function formatTime(seconds){
  const value=Math.max(0,Math.floor(Number(seconds)||0));
  const minutes=Math.floor(value/60);
  const rest=String(value%60).padStart(2,"0");
  return minutes+":"+rest;
}

async function load(){
  try{
    const data=await api("/mini-app/api/session",{});
    if(data.locked){
      showLocked(data);
      return;
    }
    chooseVoiceByName(data.voice||"Nora");
    if(balance)balance.textContent=Number(data.balance||0).toLocaleString("en-US");
  }catch(error){
    toast(error.message);
  }
}

async function generateTts(){
  const value=(text?.value||"").trim();
  if(!value){
    toast("Type text first");
    return;
  }
  if(Array.from(value).length>1000){
    setLimitSheet(true);
    return;
  }

  button.disabled=true;
  toast("Generating voice");
  wavePlayer?.classList.remove("show");
  player.pause();
  player.removeAttribute("src");
  player.load();
  if(wavePlay)wavePlay.textContent="▶";
  if(waveTime)waveTime.textContent="0:00";

  try{
    const data=await api("/mini-app/api/tts",{text:value,voice:selectedVoice});
    chooseVoiceByName(data.voice||voice?.textContent||"Nora");
    if(balance)balance.textContent=Number(data.balance||0).toLocaleString("en-US");
    player.src="data:audio/mpeg;base64,"+data.audioBase64;
    wavePlayer?.classList.add("show");
    toast("Voice generated");
  }catch(error){
    toast(error.message);
  }finally{
    button.disabled=false;
  }
}

function playTts(){
  if(!player?.src){
    toast("Generate voice first");
    return;
  }
  if(player.paused){
    player.play().catch((error)=>toast(error.message));
  }else{
    player.pause();
  }
}

text?.addEventListener("input",updateCharCount);
text?.addEventListener("focus",()=>setKeyboardOpen(true));
text?.addEventListener("blur",()=>setTimeout(()=>{
  if(document.activeElement!==text)setKeyboardOpen(false);
},80));

player?.addEventListener("play",()=>{
  if(wavePlay)wavePlay.textContent="Pause";
});

player?.addEventListener("pause",()=>{
  if(wavePlay)wavePlay.textContent=player.currentTime>0?"Play":"▶";
});

player?.addEventListener("timeupdate",()=>{
  if(waveTime)waveTime.textContent=formatTime(player.currentTime);
});

player?.addEventListener("ended",()=>{
  if(wavePlay)wavePlay.textContent="▶";
  if(waveTime)waveTime.textContent="0:00";
  player.currentTime=0;
});

document.body.addEventListener("click",(event)=>{
  const target=event.target;
  const option=target?.closest?.("[data-voice]");
  if(option){
    chooseVoice(option);
    return;
  }

  const actionButton=target?.closest?.("button[data-action]");
  if(!actionButton){
    voiceWrap?.classList.remove("open");
    return;
  }

  const action=actionButton.getAttribute("data-action");
  if(action==="toggle-voice"){
    voiceWrap?.classList.toggle("open");
    return;
  }
  if(action==="generate-tts"){
    generateTts();
    return;
  }
  if(action==="play-tts"){
    playTts();
    return;
  }
  if(action==="open-char-limit"){
    setLimitSheet(true);
    return;
  }
  if(action==="close-char-limit"){
    setLimitSheet(false);
    return;
  }
  if(action==="dismiss-keyboard"){
    dismissKeyboard();
  }
});

updateCharCount();
load();
`;
