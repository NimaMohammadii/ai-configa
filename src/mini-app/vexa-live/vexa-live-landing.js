import {
  LIQUID_GLASS_FOCUS_RING,
  LIQUID_GLASS_HOVER_CSS,
  liquidGlassMaterialCss,
} from "../liquid-glass-style.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const LIVE_BACKGROUND = "#000000";

const LANDING_STYLE = String.raw`
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;min-height:100%;overflow:hidden;overscroll-behavior:none;background:${LIVE_BACKGROUND};color:#fff}
body{position:fixed;inset:0;min-height:100dvh;font-family:"SF Pro Display","SF Pro Text",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
button{font:inherit}
.vexa-live-download{position:fixed;inset:0;display:grid;place-items:center;background:${LIVE_BACKGROUND}}
.vexa-live-download-action{min-width:132px;height:52px;padding:0 26px;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.92);font-size:14px;font-weight:620;letter-spacing:.01em;line-height:1;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter;transition:opacity .16s ease,transform .3s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
@media(hover:hover) and (pointer:fine){.vexa-live-download-action:hover{transform:scale(1.05);${LIQUID_GLASS_HOVER_CSS}}}
.vexa-live-download-action:active{transform:scale(.97);filter:brightness(.9)}
.vexa-live-download-action:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-live-download-action:disabled{opacity:.44;cursor:default}
@media(prefers-reduced-motion:reduce){.vexa-live-download-action{transition:none!important}}
`;

const LANDING_RUNTIME_JS = String.raw`
(function(){
'use strict';
const PLAYBACK_PREPARE_URL='/mini-app/live/api/youtube-playback/prepare';
const DOWNLOAD_SESSION_URL='/mini-app/live/api/youtube-download/session';
const downloadButton=document.getElementById('vexaLiveDownload');

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||'');}
function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch{}}
function setBusy(busy,text){if(!downloadButton)return;downloadButton.textContent=text||'Download';downloadButton.disabled=Boolean(busy);}
function fail(message){console.error('Vexa Live download failed',message);setBusy(false);try{window.alert(String(message||'Could not prepare download'));}catch{}haptic('light');}
function promptVideoUrl(){const source=window.prompt('Enter video link');if(source===null)return'';return String(source||'').trim();}
function requestedDownloadUrl(){
 const host=hostWindow();
 try{
  const params=new URLSearchParams(host.location.search);
  if(params.get('vexaDownload')!=='1')return'';
  const source=String(params.get('vexaSource')||'').trim();
  if(!source||source.length>2048)return'';
  const url=new URL(source);
  return url.protocol==='https:'?url.href:'';
 }catch{return'';}
}
function playbackToken(data){try{return String(new URL(String(data?.playbackUrl||''),window.location.origin).searchParams.get('token')||'').trim();}catch{return'';}}
function startDownload(data){
 const absoluteUrl=new URL(String(data.downloadUrl),window.location.origin).href;
 const fileName=String(data.fileName||'Vexa-video.mp4');
 const tg=telegram();
 if(tg?.downloadFile){try{tg.downloadFile({url:absoluteUrl,file_name:fileName});return;}catch{}}
 const link=document.createElement('a');link.href=absoluteUrl;link.download=fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();
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

async function runDownload(sourceOverride){
 if(!downloadButton||downloadButton.disabled)return;
 const preset=String(sourceOverride||'').trim();
 const url=preset||promptVideoUrl();if(!url)return;
 setBusy(true,'Preparing…');haptic('light');
 try{
  const playback=await preparePlayback(url);
  const download=await prepareDownload(playback);
  startDownload(download);setBusy(false);haptic('medium');
 }catch(error){fail(String(error?.message||'Could not prepare download'));}
}

downloadButton?.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();runDownload();});
const autoDownloadUrl=requestedDownloadUrl();
if(autoDownloadUrl)runDownload(autoDownloadUrl);
})();
`;

const LANDING_BODY = '<body><main class="vexa-live-download"><button id="vexaLiveDownload" class="vexa-live-download-action" type="button">Download</button></main><script>' + LANDING_RUNTIME_JS.split('</script>').join('<\\/script>') + '</script></body>';

export async function appendVexaLiveLandingRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== LIVE_ROOT && path !== LIVE_ROOT + "/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  let source = await response.text();
  source = source.replace(/<meta name="theme-color" content="[^"]*" \/>/i, '<meta name="theme-color" content="' + LIVE_BACKGROUND + '" />');
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
