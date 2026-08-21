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
html,body{margin:0;width:100%;height:100%;min-height:100%;overflow:hidden;overscroll-behavior:none;background:${VEXA_MESH_BASE_COLOR};color:#fff}
body{position:fixed;inset:0;min-height:100dvh;font-family:"SF Pro Display","SF Pro Text",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
button{font:inherit}
.vexa-mesh-landing{position:fixed;inset:0;z-index:1;overflow:hidden;background:${VEXA_MESH_BASE_COLOR};opacity:1;transition:opacity .28s ease}
.vexa-mesh-landing.is-hidden{opacity:0;pointer-events:none}
#vexaMeshCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.vexa-mesh-open{position:absolute;left:50%;top:50%;z-index:2;min-width:108px;height:52px;padding:0 24px;transform:translate(-50%,-50%);${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.9);font-size:14px;font-weight:620;letter-spacing:.01em;line-height:1;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter;transition:opacity .16s ease,transform .3s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
@media(hover:hover) and (pointer:fine){.vexa-mesh-open:hover{transform:translate(-50%,-50%) scale(1.05);${LIQUID_GLASS_HOVER_CSS}}}
.vexa-mesh-open:active{transform:translate(-50%,-50%) scale(.97);filter:brightness(.9)}
.vexa-mesh-open:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-mesh-open:disabled{opacity:.44;cursor:default}
.vexa-live-stage{position:fixed;inset:0;z-index:3;display:block;background:#000;overflow:hidden}
.vexa-live-video{display:block;width:100%;height:100%;border:0;background:#000;object-fit:contain}
@media(prefers-reduced-motion:reduce){.vexa-mesh-landing,.vexa-mesh-open{transition:none!important}}
`;

const LANDING_RUNTIME_JS = String.raw`
(function(){
'use strict';
const PREPARE_URL='/mini-app/live/api/youtube-playback/prepare';
const canvas=document.getElementById('vexaMeshCanvas');
const landing=document.getElementById('vexaMeshLanding');
const openButton=document.getElementById('vexaMeshOpen');
const mesh=${createVexaMeshRendererSource("canvas", { autoStart: true })};

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||'');}
function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch{}}

function setButton(text,busy){if(!openButton)return;openButton.textContent=text;openButton.disabled=Boolean(busy);}
function fail(message){console.error('Vexa Live open failed',message);setButton('Open',false);haptic('light');}
function mountVideo(data){
 let stage=document.getElementById('vexaLiveStage');if(stage)stage.remove();
 stage=document.createElement('section');stage.id='vexaLiveStage';stage.className='vexa-live-stage';
 const video=document.createElement('video');video.id='vexaLiveVideo';video.className='vexa-live-video';video.playsInline=true;video.preload='auto';video.controls=false;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('controlslist','nodownload nofullscreen noremoteplayback');video.setAttribute('disablepictureinpicture','');stage.appendChild(video);document.body.appendChild(stage);
 let entered=false;
 const enter=function(){if(entered)return;entered=true;landing?.classList.add('is-hidden');mesh.stop();};
 video.addEventListener('loadedmetadata',enter,{once:true});
 video.addEventListener('canplay',enter,{once:true});
 video.addEventListener('error',function(){stage.remove();landing?.classList.remove('is-hidden');fail('Could not play this YouTube video');},{once:true});
 video.src=new URL(String(data.playbackUrl),window.location.origin).href;video.load();
 Promise.resolve(video.play()).catch(function(){});
 setButton('Open',false);
}

async function openVideo(){
 if(!openButton||openButton.disabled)return;
 const source=window.prompt('Paste a YouTube link');
 if(source===null)return;
 const url=String(source||'').trim();if(!url)return;
 setButton('Opening…',true);haptic('light');
 try{
  const response=await fetch(PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:url})});
  const data=await response.json().catch(function(){return{};});
  if(!response.ok||!data.playbackUrl)throw new Error(String(data.error||'Could not prepare this video'));
  mountVideo(data);haptic('medium');
 }catch(error){fail(String(error?.message||'Could not open this video'));}
}
openButton?.addEventListener('click',openVideo);
})();
`;

const LANDING_BODY = '<body><main id="vexaMeshLanding" class="vexa-mesh-landing"><canvas id="vexaMeshCanvas" aria-hidden="true"></canvas><button id="vexaMeshOpen" class="vexa-mesh-open" type="button">Open</button></main><script>' + LANDING_RUNTIME_JS.split('</script>').join('<\\/script>') + '</script></body>';

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
