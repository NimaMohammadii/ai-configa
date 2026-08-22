import {
  VEXA_MESH_BASE_COLOR,
  createVexaMeshRendererSource,
} from "./mesh-background.js";
import {
  LIQUID_GLASS_FOCUS_RING,
  LIQUID_GLASS_HOVER_CSS,
  liquidGlassMaterialCss,
} from "../liquid-glass-style.js";

const LIVE_ROOT = "/mini-app/vexa-live";

const LANDING_STYLE = String.raw`
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;min-height:0;overflow:hidden;overscroll-behavior:none;background:${VEXA_MESH_BASE_COLOR};color:#fff}
body{position:fixed;inset:0;height:100%;min-height:0;font-family:"SF Pro Display","SF Pro Text",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
button,input{font:inherit}
.vexa-mesh-landing{position:fixed;inset:0;z-index:1;overflow:hidden;background:${VEXA_MESH_BASE_COLOR};opacity:1;transition:opacity .28s ease}
.vexa-mesh-landing.is-hidden{opacity:0;pointer-events:none}
#vexaMeshCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.vexa-mesh-actions{position:absolute;left:50%;top:50%;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;transform:translate(-50%,-50%)}
.vexa-mode-switch{position:relative;display:grid;grid-template-columns:1fr 1fr;width:206px;height:40px;padding:3px;${liquidGlassMaterialCss()}border-radius:999px;overflow:hidden;isolation:isolate}
.vexa-mode-thumb{position:absolute;left:3px;top:3px;width:calc(50% - 3px);height:34px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 4px 15px rgba(0,0,0,.18);transform:translateX(0);transition:transform .32s cubic-bezier(.16,1,.3,1);z-index:0}
.vexa-mode-switch[data-mode="download"] .vexa-mode-thumb{transform:translateX(100%)}
.vexa-mode-option{position:relative;z-index:1;height:34px;padding:0 15px;border:0;background:transparent;color:rgba(255,255,255,.72);font-size:12px;font-weight:680;letter-spacing:.01em;cursor:pointer;transition:color .22s ease,transform .14s ease}
.vexa-mode-option:active{transform:scale(.96)}
.vexa-mode-option[aria-selected="true"]{color:#09090a}
.vexa-mode-option:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important;border-radius:999px}
.vexa-video-input{width:min(78vw,320px);height:38px;margin:0;padding:0 8px;border:0!important;border-radius:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;appearance:none!important;-webkit-appearance:none!important;color:#fff;text-align:center;font-size:14px;font-weight:560;letter-spacing:.01em;caret-color:#fff}
.vexa-video-input::placeholder{color:rgba(255,255,255,.46);opacity:1}
.vexa-video-input:focus{border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important}
.vexa-video-input:disabled{opacity:.44}
.vexa-mesh-open{min-width:108px;height:52px;padding:0 24px;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.9);font-size:14px;font-weight:620;letter-spacing:.01em;line-height:1;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter;transition:opacity .16s ease,transform .3s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
@media(hover:hover) and (pointer:fine){.vexa-mesh-open:hover{transform:scale(1.05);${LIQUID_GLASS_HOVER_CSS}}}
.vexa-mesh-open:active{transform:scale(.97);filter:brightness(.9)}
.vexa-mesh-open:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-mesh-open:disabled,.vexa-mode-option:disabled{opacity:.44;cursor:default}
.vexa-live-stage{position:fixed;inset:0;z-index:3;display:block;background:#000;overflow:hidden}
.vexa-live-video{display:block;width:100%;height:100%;border:0;background:#000;object-fit:contain}
@media(prefers-reduced-motion:reduce){.vexa-mesh-landing,.vexa-mesh-open,.vexa-mode-thumb,.vexa-mode-option{transition:none!important}}
`;

const LANDING_RUNTIME_JS = String.raw`
(function(){
'use strict';
const PLAYBACK_PREPARE_URL='/mini-app/live/api/youtube-playback/prepare';
const DOWNLOAD_SESSION_URL='/mini-app/live/api/youtube-download/session';
const canvas=document.getElementById('vexaMeshCanvas');
const landing=document.getElementById('vexaMeshLanding');
const openButton=document.getElementById('vexaMeshOpen');
const videoInput=document.getElementById('vexaVideoUrl');
const modeSwitch=document.getElementById('vexaModeSwitch');
const modeButtons=Array.from(document.querySelectorAll('[data-vexa-mode]'));
const mesh=${createVexaMeshRendererSource("canvas", { autoStart: true })};
let mode='watch';

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||'');}
function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch{}}
function idleLabel(){return mode==='download'?'Download':'Open';}
function setBusy(busy,text){if(openButton){openButton.textContent=text||idleLabel();openButton.disabled=Boolean(busy);}if(videoInput)videoInput.disabled=Boolean(busy);for(const button of modeButtons)button.disabled=Boolean(busy);}
function fail(message){console.error('Vexa Live action failed',message);setBusy(false);try{window.alert(String(message||'Could not open this video'));}catch{}haptic('light');}
function selectMode(next,vibrate){if(next!=='watch'&&next!=='download')return;mode=next;if(modeSwitch)modeSwitch.dataset.mode=mode;for(const button of modeButtons)button.setAttribute('aria-selected',String(button.dataset.vexaMode===mode));if(openButton&&!openButton.disabled)openButton.textContent=idleLabel();if(vibrate!==false)haptic('light');}
function videoUrl(){return String(videoInput?.value||'').trim();}
function releaseKeyboard(){try{videoInput?.blur();}catch{}requestAnimationFrame(function(){try{window.scrollTo(0,0);}catch{}});setTimeout(function(){try{window.scrollTo(0,0);}catch{}},120);}
function playbackToken(data){try{return String(new URL(String(data?.playbackUrl||''),window.location.origin).searchParams.get('token')||'').trim();}catch{return'';}}
function startDownload(data){
 const absoluteUrl=new URL(String(data.downloadUrl),window.location.origin).href;
 const fileName=String(data.fileName||'Vexa-video.mp4');
 const tg=telegram();
 if(tg?.downloadFile){try{tg.downloadFile({url:absoluteUrl,file_name:fileName});return;}catch{}}
 const link=document.createElement('a');link.href=absoluteUrl;link.download=fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();
}
function mountVideo(data){
 let stage=document.getElementById('vexaLiveStage');if(stage)stage.remove();
 stage=document.createElement('section');stage.id='vexaLiveStage';stage.className='vexa-live-stage';
 const video=document.createElement('video');video.id='vexaLiveVideo';video.className='vexa-live-video';video.playsInline=true;video.preload='auto';video.controls=false;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('controlslist','nodownload nofullscreen noremoteplayback');video.setAttribute('disablepictureinpicture','');stage.appendChild(video);document.body.appendChild(stage);
 let entered=false;
 const enter=function(){if(entered)return;entered=true;landing?.classList.add('is-hidden');mesh.stop();};
 video.addEventListener('loadedmetadata',enter,{once:true});
 video.addEventListener('canplay',enter,{once:true});
 video.addEventListener('error',function(){stage.remove();landing?.classList.remove('is-hidden');fail('Could not play this video');},{once:true});
 video.src=new URL(String(data.playbackUrl),window.location.origin).href;video.load();
 Promise.resolve(video.play()).catch(function(){});
 setBusy(false);
}

async function preparePlayback(url){
 const response=await fetch(PLAYBACK_PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:url})});
 const data=await response.json().catch(function(){return{};});
 if(!response.ok||!data.playbackUrl)throw new Error(String(data.error||'Could not prepare this video'));
 return data;
}

async function prepareDownload(playback){
 const token=playbackToken(playback);
 if(!token)throw new Error('Video session is invalid');
 const response=await fetch(DOWNLOAD_SESSION_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),playbackToken:token})});
 const data=await response.json().catch(function(){return{};});
 if(!response.ok||!data.downloadUrl)throw new Error(String(data.error||'Could not prepare download'));
 return data;
}

async function runAction(){
 if(!openButton||openButton.disabled)return;
 const url=videoUrl();
 if(!url){try{videoInput?.focus({preventScroll:true});}catch{try{videoInput?.focus();}catch{}}return;}
 releaseKeyboard();
 setBusy(true,mode==='download'?'Preparing…':'Opening…');haptic('light');
 try{
  const playback=await preparePlayback(url);
  if(mode==='download'){
   const download=await prepareDownload(playback);
   startDownload(download);setBusy(false);haptic('medium');return;
  }
  mountVideo(playback);haptic('medium');
 }catch(error){fail(String(error?.message||'Could not open this video'));}
}
for(const button of modeButtons)button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();if(!button.disabled)selectMode(String(button.dataset.vexaMode||''),true);});
videoInput?.addEventListener('keydown',function(event){if(event.key!=='Enter')return;event.preventDefault();event.stopPropagation();runAction();});
videoInput?.addEventListener('blur',releaseKeyboard);
openButton?.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();runAction();});
selectMode('watch',false);
})();
`;

const LANDING_BODY = '<body><main id="vexaMeshLanding" class="vexa-mesh-landing"><canvas id="vexaMeshCanvas" aria-hidden="true"></canvas><div class="vexa-mesh-actions"><div id="vexaModeSwitch" class="vexa-mode-switch" data-mode="watch" role="tablist" aria-label="Video action"><span class="vexa-mode-thumb" aria-hidden="true"></span><button class="vexa-mode-option" data-vexa-mode="watch" type="button" role="tab" aria-selected="true">Watch</button><button class="vexa-mode-option" data-vexa-mode="download" type="button" role="tab" aria-selected="false">Download</button></div><input id="vexaVideoUrl" class="vexa-video-input" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="Enter video link" aria-label="Video link"><button id="vexaMeshOpen" class="vexa-mesh-open" type="button">Open</button></div></main><script>' + LANDING_RUNTIME_JS.split('</script>').join('<\\/script>') + '</script></body>';

export async function appendVexaLiveLandingRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== LIVE_ROOT && path !== LIVE_ROOT + "/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  let source = await response.text();
  source = source.replace(/<meta name="theme-color" content="[^"]*" \/>/i, '<meta name="theme-color" content="' + VEXA_MESH_BASE_COLOR + '" />');
  source = source.replace(/<style>[\s\S]*?<\/style>/i, '<style>' + LANDING_STYLE + '</style>');
  source = /<body[\s\S]*?<\/body>/i.test(source)
    ? source.replace(/<body[\s\S]*?<\/body>/i, LANDING_BODY)
    : source + LANDING_BODY;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(source, { status: response.status, statusText: response.statusText, headers });
}
