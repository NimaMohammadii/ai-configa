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
button,select{font:inherit}
.vexa-live-download{position:fixed;inset:0;display:grid;place-items:center;background:${LIVE_BACKGROUND};overflow:hidden}
.vexa-download-core{width:min(88vw,390px);display:flex;flex-direction:column;align-items:center;gap:18px;transform:translateY(-1.5vh)}
.vexa-download-percent{margin:0;color:#f5f5f5;font-size:44px;font-weight:620;line-height:.95;letter-spacing:-.055em;font-variant-numeric:tabular-nums;opacity:0;transform:translateY(8px) scale(.97);transition:opacity .32s ease,transform .55s cubic-bezier(.16,1,.3,1)}
.vexa-live-download[data-state="preparing"] .vexa-download-percent,.vexa-live-download[data-state="waiting"] .vexa-download-percent,.vexa-live-download[data-state="downloading"] .vexa-download-percent,.vexa-live-download[data-state="completed"] .vexa-download-percent,.vexa-live-download[data-state="error"] .vexa-download-percent{opacity:1;transform:none}
.vexa-download-track{position:relative;width:100%;height:7px;border-radius:999px;overflow:hidden;background:#111;box-shadow:inset 0 0 0 1px rgba(255,255,255,.065),0 0 0 1px rgba(0,0,0,.7)}
.vexa-download-fill{position:absolute;inset:0;transform:scaleX(var(--vexa-progress,0));transform-origin:left center;border-radius:inherit;background:linear-gradient(105deg,#626262 0%,#b7b7b7 18%,#fff 38%,#8f8f8f 55%,#fafafa 74%,#737373 100%);box-shadow:0 0 12px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.76),inset 0 -1px 0 rgba(0,0,0,.42);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.vexa-live-download[data-state="completed"] .vexa-download-fill{box-shadow:0 0 18px rgba(255,255,255,.24),inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(0,0,0,.35)}
.vexa-download-copy{display:flex;flex-direction:column;align-items:center;gap:5px;min-height:35px;text-align:center}
.vexa-download-status{color:rgba(255,255,255,.72);font-size:12px;font-weight:610;line-height:1.2;letter-spacing:-.01em;transition:color .2s ease}
.vexa-download-detail{color:rgba(255,255,255,.31);font-size:10px;font-weight:560;line-height:1.2;font-variant-numeric:tabular-nums;min-height:12px}
.vexa-live-download[data-state="error"] .vexa-download-status{color:rgba(255,255,255,.55)}
.vexa-download-quality{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;width:100%;max-height:0;opacity:0;overflow:hidden;transform:translateY(8px) scale(.98);pointer-events:none;transition:max-height .55s cubic-bezier(.16,1,.3,1),opacity .3s ease,transform .5s cubic-bezier(.16,1,.3,1)}
.vexa-download-quality[data-ready="1"]{max-height:176px;opacity:1;transform:none;pointer-events:auto;overflow-y:auto;padding:2px}
.vexa-quality-option{position:relative;min-width:64px;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));color:rgba(255,255,255,.56);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;outline:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:transform .35s cubic-bezier(.16,1,.3,1),color .25s ease,border-color .25s ease,background .35s ease,box-shadow .35s ease,opacity .25s ease}
.vexa-quality-option span{font-size:12px;font-weight:680;line-height:1;letter-spacing:-.02em}
.vexa-quality-option small{font-size:8px;font-weight:570;line-height:1;color:rgba(255,255,255,.27);font-variant-numeric:tabular-nums;transition:color .25s ease}
.vexa-quality-option[data-selected="1"]{color:#0a0a0a;border-color:rgba(255,255,255,.8);background:linear-gradient(120deg,#747474 0%,#f7f7f7 34%,#a7a7a7 58%,#fff 78%,#858585 100%);box-shadow:0 0 18px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.9)}
.vexa-quality-option[data-selected="1"] small{color:rgba(0,0,0,.48)}
@media(hover:hover) and (pointer:fine){.vexa-quality-option:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.82)}}
.vexa-quality-option:active{transform:scale(.96)}
.vexa-quality-option:focus-visible{outline:none;box-shadow:${LIQUID_GLASS_FOCUS_RING}}
.vexa-download-subtitles{width:100%;max-height:0;opacity:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px;transform:translateY(7px) scale(.985);pointer-events:none;transition:max-height .48s cubic-bezier(.16,1,.3,1),opacity .28s ease,transform .44s cubic-bezier(.16,1,.3,1)}
.vexa-download-subtitles[data-ready="1"]{max-height:46px;opacity:1;transform:none;pointer-events:auto}
.vexa-subtitle-label{color:rgba(255,255,255,.34);font-size:9px;font-weight:670;letter-spacing:.02em;white-space:nowrap}
.vexa-subtitle-select-shell{position:relative;min-width:148px;height:36px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:opacity .22s ease,border-color .22s ease,background .22s ease}
.vexa-subtitle-select{position:absolute;inset:0;width:100%;height:100%;padding:0 31px 0 11px;border:0;outline:0;background:transparent;color:rgba(255,255,255,.72);font-size:10.5px;font-weight:630;appearance:none;-webkit-appearance:none;cursor:pointer}
.vexa-subtitle-select option{background:#111;color:#fff}
.vexa-subtitle-chevron{position:absolute;right:11px;top:50%;transform:translateY(-52%);color:rgba(255,255,255,.34);font-size:13px;line-height:1;pointer-events:none}
.vexa-subtitle-select:focus-visible{outline:none}
.vexa-subtitle-select-shell:has(.vexa-subtitle-select:focus-visible){box-shadow:${LIQUID_GLASS_FOCUS_RING}}
.vexa-download-subtitles[data-disabled="1"]{opacity:.28;pointer-events:none}
.vexa-live-download[data-state="preparing"] .vexa-download-quality,.vexa-live-download[data-state="downloading"] .vexa-download-quality,.vexa-live-download[data-state="preparing"] .vexa-download-subtitles,.vexa-live-download[data-state="downloading"] .vexa-download-subtitles{opacity:.22;pointer-events:none}
.vexa-live-download-action{min-width:132px;height:48px;margin-top:2px;padding:0 24px;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.92);font-size:13px;font-weight:650;letter-spacing:-.01em;line-height:1;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter,opacity;transition:opacity .24s ease,transform .38s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
@media(hover:hover) and (pointer:fine){.vexa-live-download-action:hover{transform:scale(1.045);${LIQUID_GLASS_HOVER_CSS}}}
.vexa-live-download-action:active{transform:scale(.965);filter:brightness(.9)}
.vexa-live-download-action:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-live-download-action:disabled{opacity:.35;cursor:default}
.vexa-live-download[data-state="downloading"] .vexa-live-download-action{opacity:0;transform:translateY(8px) scale(.96);pointer-events:none}
.vexa-live-download[data-state="completed"] .vexa-live-download-action{opacity:.62}
@media(prefers-reduced-motion:reduce){.vexa-download-percent,.vexa-download-fill,.vexa-live-download-action,.vexa-download-quality,.vexa-quality-option,.vexa-download-subtitles{transition:none!important}}
`;

const LANDING_SCRIPT = String.raw`(function(){
  'use strict';
  const COOKIE='vexa_download_subtitle';
  const STORAGE='vexaDownloadSubtitle';
  const allowedSubtitles=new Set(['off','original','en','fa','ru','de','tr','es','ar','fr','pt','it','hi','zh','ja','ko']);
  const endpoints={
    media:{prepare:'/mini-app/live/api/youtube-download/prepare',session:'/mini-app/live/api/youtube-download/session'},
    instagram:{prepare:'/mini-app/live/api/instagram/prepare',session:'/mini-app/live/api/instagram/session'},
    story:{prepare:'/mini-app/live/api/instagram-story/prepare',session:'/mini-app/live/api/instagram-story/session'}
  };
  const root=document.getElementById('vexaLiveDownloadRoot');
  const button=document.getElementById('vexaLiveDownload');
  const percentNode=document.getElementById('vexaLivePercent');
  const statusNode=document.getElementById('vexaLiveStatus');
  const detailNode=document.getElementById('vexaLiveDetail');
  const track=document.getElementById('vexaLiveProgressTrack');
  const qualityNode=document.getElementById('vexaLiveQuality');
  const subtitleShell=document.getElementById('vexaDownloadSubtitle');
  const subtitleSelect=document.getElementById('vexaDownloadSubtitleLanguage');
  if(!root||!button||!percentNode||!statusNode||!detailNode||!track||!qualityNode||!subtitleShell||!subtitleSelect)return;

  let provider='';
  let sourceUrl='';
  let downloadToken='';
  let providerMeta=null;
  let options=[];
  let selectedOptionKey='';
  let prepared=null;
  let preparingPromise=null;
  let busy=false;
  let progressSocket=null;
  let reconnectTimer=0;
  let reconnectAttempt=0;
  let displayedPercent=0;
  let percentAnimation=0;
  let telegramEventBound=false;

  function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch(error){}return window;}
  function telegram(){const host=hostWindow();return window.Telegram?.WebApp||host.Telegram?.WebApp||null;}
  function initData(){return String(telegram()?.initData||'');}
  function haptic(style){try{telegram()?.HapticFeedback?.impactOccurred?.(style||'light');}catch(error){}}
  function mb(bytes){return(Math.max(0,Number(bytes||0))/1048576).toFixed(1);}
  function formatPercent(value){const number=Math.max(0,Math.min(100,Number(value||0)));if(number>=100)return'100%';const rounded=Math.round(number*10)/10;return(String(rounded).includes('.')?rounded.toFixed(1):String(rounded))+'%';}
  function setState(state,message,detail){root.dataset.state=String(state||'idle');statusNode.textContent=String(message||'');detailNode.textContent=String(detail||'');}
  function setButton(text,disabled){button.textContent=String(text||'Download');button.disabled=Boolean(disabled);}
  function setProgress(value,animate){const target=Math.max(0,Math.min(100,Number(value||0)));root.style.setProperty('--vexa-progress',String(target/100));track.setAttribute('aria-valuenow',String(Math.round(target*10)/10));cancelAnimationFrame(percentAnimation);if(!animate){displayedPercent=target;percentNode.textContent=formatPercent(target);return;}const from=displayedPercent;const started=performance.now();const duration=Math.min(420,150+Math.abs(target-from)*7);const tick=function(now){const t=Math.min(1,(now-started)/Math.max(1,duration));const eased=1-Math.pow(1-t,3);displayedPercent=from+(target-from)*eased;percentNode.textContent=formatPercent(displayedPercent);if(t<1)percentAnimation=requestAnimationFrame(tick);};percentAnimation=requestAnimationFrame(tick);}

  function cookieValue(){const prefix=COOKIE+'=';for(const part of String(document.cookie||'').split(';')){const value=part.trim();if(!value.startsWith(prefix))continue;try{return decodeURIComponent(value.slice(prefix.length));}catch(error){return value.slice(prefix.length);}}return'';}
  function savedSubtitle(){const fromCookie=cookieValue();if(allowedSubtitles.has(fromCookie))return fromCookie;try{const stored=String(localStorage.getItem(STORAGE)||'');if(allowedSubtitles.has(stored))return stored;}catch(error){}return'off';}
  function saveSubtitle(value){const next=allowedSubtitles.has(value)?value:'off';try{localStorage.setItem(STORAGE,next);}catch(error){}const secure=location.protocol==='https:'?'; Secure':'';document.cookie=COOKIE+'='+encodeURIComponent(next)+'; Max-Age=31536000; Path=/; SameSite=Lax'+secure;}
  function selectedOption(){return options.find(function(option){return String(option?.key||'')===selectedOptionKey;})||null;}
  function syncSubtitle(){const option=selectedOption();const ready=options.length>0;const disabled=!option||option.kind==='audio'||option.kind==='live';subtitleShell.dataset.ready=ready?'1':'0';subtitleShell.dataset.disabled=disabled?'1':'0';subtitleSelect.disabled=disabled;}

  function sourceProvider(value){try{const url=new URL(String(value||'').trim());if(url.protocol!=='https:'||url.username||url.password)return'';const host=url.hostname.toLowerCase();const path=url.pathname.replace(/\/+$/,'');if(host==='instagram.com'||host.endsWith('.instagram.com')){if(/^\/stories\/highlights\/\d+$/.test(path)||/^\/stories\/[A-Za-z0-9._]+(?:\/\d+)?$/.test(path)||/^\/[A-Za-z0-9._]+\/live$/.test(path))return'story';if(/^\/(?:[^/]+\/)?(?:p|tv|reels?)\/[A-Za-z0-9_-]+$/.test(path)||/^\/share\/(?:reel|p)\/[A-Za-z0-9_-]+$/.test(path))return'instagram';return'';}if(host==='youtube.com'||host==='www.youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'||host==='youtu.be')return'media';const ph=['pornhub.com','pornhub.net','pornhub.org','pornhubpremium.com'];if(ph.some(function(domain){return host===domain||host.endsWith('.'+domain);}))return'media';return'';}catch(error){return'';}}
  function optionKeyValid(kind,key){const value=String(key||'');if(kind==='story')return/^s\d{1,3}$/.test(value);if(kind==='instagram')return/^v\d{2,4}$/.test(value);return/^(?:a|v\d{2,4})$/.test(value);}
  function launchContext(){const host=hostWindow();try{const params=new URLSearchParams(host.location.search);if(params.get('vexaDownload')!=='1')return{source:'',optionKey:''};const source=String(params.get('vexaSource')||'').trim();const optionKey=String(params.get('vexaOption')||'').trim();return{source:source,optionKey:optionKey};}catch(error){return{source:'',optionKey:''};}}
  function stripLaunchContext(){const host=hostWindow();try{const url=new URL(host.location.href);url.searchParams.delete('vexaDownload');url.searchParams.delete('vexaSource');url.searchParams.delete('vexaOption');host.history.replaceState(host.history.state,'',url.href);}catch(error){}}
  function tokenFromDownloadUrl(value){try{const token=new URL(String(value||''),window.location.origin).searchParams.get('token')||'';return/^[A-Za-z0-9_-]{40,160}$/.test(token)?token:'';}catch(error){return'';}}
  function wsUrl(value){const url=new URL(String(value||''),window.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}

  function optionDetail(option){if(!option)return'';if(option.kind==='live')return'Live recording · Keep the app open until it ends';const label=option.kind==='audio'?'Audio':String(option.label||option.key);const resolution=provider==='story'&&Number(option.height||0)>0?' · '+Number(option.height)+'p':'';return label+resolution+' · '+mb(option.sizeBytes)+' MB';}
  function clearOptions(){options=[];selectedOptionKey='';qualityNode.replaceChildren();qualityNode.dataset.ready='0';syncSubtitle();}
  function updateOptionSelection(){for(const node of qualityNode.querySelectorAll('[data-quality-key]')){node.dataset.selected=node.dataset.qualityKey===selectedOptionKey?'1':'0';node.setAttribute('aria-pressed',node.dataset.selected==='1'?'true':'false');}syncSubtitle();}
  function chooseOption(key,announce){const option=options.find(function(item){return String(item?.key||'')===String(key||'');});if(!option||busy)return false;selectedOptionKey=String(option.key);prepared=null;closeProgressSocket();setProgress(0,true);updateOptionSelection();if(announce!==false){setState('waiting',option.kind==='live'?'Ready to record':'Ready to download',optionDetail(option));haptic('light');}setButton(option.kind==='live'?'Start recording':'Download',false);return true;}
  function renderOptions(raw,preferredKey){clearOptions();options=Array.isArray(raw)?raw.filter(function(option){if(!option)return false;const key=String(option.key||'');if(!optionKeyValid(provider,key))return false;if(provider==='story')return option.kind==='live'||Number(option.sizeBytes||0)>0;return Number(option.sizeBytes||0)>0;}):[];if(!options.length)return false;for(const option of options){const item=document.createElement('button');item.type='button';item.className='vexa-quality-option';item.dataset.qualityKey=String(option.key);item.dataset.selected='0';item.setAttribute('aria-pressed','false');const label=document.createElement('span');label.textContent=option.kind==='audio'?'Audio':String(option.label||option.key);const small=document.createElement('small');if(option.kind==='live'){small.textContent='Records until the Live ends';}else if(provider==='story'&&Number(option.height||0)>0){small.textContent=Number(option.height)+'p · '+mb(option.sizeBytes)+' MB';}else{small.textContent=mb(option.sizeBytes)+' MB';}item.append(label,small);item.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();chooseOption(option.key,true);});qualityNode.appendChild(item);}qualityNode.dataset.ready='1';const preferred=options.some(function(option){return String(option.key)===String(preferredKey||'');})?String(preferredKey):'';let fallback=options[0];if(provider!=='story'){const videos=options.filter(function(option){return option.kind!=='audio';}).slice().sort(function(a,b){return Number(a.height||99999)-Number(b.height||99999);});fallback=videos[0]||options[0];}return chooseOption(preferred||fallback.key,false);}

  function closeProgressSocket(resetAttempt){clearTimeout(reconnectTimer);reconnectTimer=0;if(resetAttempt!==false)reconnectAttempt=0;const socket=progressSocket;progressSocket=null;if(socket)try{socket.close(1000,'done');}catch(error){}}
  function connectProgress(progressUrl,reconnecting){clearTimeout(reconnectTimer);reconnectTimer=0;const previous=progressSocket;progressSocket=null;if(previous)try{previous.close(1000,'reconnect');}catch(error){}if(!reconnecting)reconnectAttempt=0;const target=String(progressUrl||'');if(!target)return;const socket=new WebSocket(wsUrl(target));progressSocket=socket;socket.addEventListener('open',function(){if(progressSocket!==socket)return;reconnectAttempt=0;});socket.addEventListener('message',function(event){if(progressSocket!==socket)return;let data;try{data=JSON.parse(String(event.data||'{}'));}catch(error){return;}handleProgress(data);});socket.addEventListener('close',function(){if(progressSocket!==socket)return;progressSocket=null;if(!busy||!prepared?.progressUrl)return;if(reconnectAttempt>=8){setState('error','Progress connection interrupted','The download may still be running. Try again if it does not finish.');return;}const delay=Math.min(10000,500*Math.pow(2,Math.min(reconnectAttempt,5)));reconnectAttempt+=1;reconnectTimer=setTimeout(function(){if(busy&&prepared?.progressUrl)connectProgress(prepared.progressUrl,true);},delay);});socket.addEventListener('error',function(){try{socket.close();}catch(error){}});}
  function handleProgress(data){if(!data?.ok)return;const total=Number(data.totalBytes||prepared?.fileSize||0);const done=Math.max(0,Number(data.downloadedBytes||0));const pct=Math.max(0,Math.min(100,Number(data.percent||0)));const state=String(data.status||'ready');const live=Boolean(prepared?.live)||selectedOption()?.kind==='live';if(state==='completed'){busy=false;setProgress(100,true);setState('completed',live?'Live recording completed':'Downloaded',done||total?mb(done||total)+' MB':'');setButton(live?'Record again':'Download again',false);closeProgressSocket();haptic('medium');return;}if(state==='failed'||state==='cancelled'){busy=false;setState('error',String(data.error||'Download failed'),done?mb(done)+' MB received':optionDetail(selectedOption()));setButton('Try again',false);closeProgressSocket();prepared=null;return;}if(!live&&(state==='staging'||state==='transcribing'||state==='translating'||state==='rendering'||state==='finalizing')){const label=state==='staging'?'Getting video':state==='transcribing'?'Creating subtitles':state==='translating'?'Translating subtitles':state==='rendering'?'Rendering subtitles':'Finishing video';setProgress(Math.max(displayedPercent,pct),true);setState('downloading',label,formatPercent(pct)+' · Keep the app open');return;}if(state==='preparing'){if(displayedPercent<=0)setProgress(0,false);setState('preparing',live?'Connecting to Instagram Live':'Preparing download','Keep the app open.');return;}if(state==='downloading'){if(live){setState('downloading','Recording Instagram Live',mb(done)+' MB saved · Keep the app open');return;}setProgress(Math.max(displayedPercent,pct),true);setState('downloading','Downloading',mb(done)+' MB / '+mb(total)+' MB · Keep the app open');}}

  async function prepareSource(rawSource,preferredKey){if(preparingPromise)return preparingPromise;const clean=String(rawSource||'').trim();const kind=sourceProvider(clean);if(!kind){setState('error','Unsupported video link','Use a YouTube, PornHub or Instagram video link.');setButton('Try again',false);return false;}provider=kind;sourceUrl=clean;downloadToken='';providerMeta=null;prepared=null;busy=false;closeProgressSocket();clearOptions();setProgress(0,false);setState('preparing',kind==='story'&&/\/live\/?$/.test(new URL(clean).pathname)?'Checking Instagram Live':'Loading qualities','');setButton('Preparing…',true);haptic('light');preparingPromise=(async function(){try{const cfg=endpoints[kind];const response=await fetch(cfg.prepare,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),url:clean})});const first=await response.json().catch(function(){return{};});if(!response.ok)throw new Error(String(first.error||'Could not prepare this video'));let catalog=first;if(kind==='media'){const token=tokenFromDownloadUrl(first.downloadUrl);if(!token)throw new Error(String(first.error||'Download session is invalid'));downloadToken=token;const qualityResponse=await fetch(cfg.session,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:token})});catalog=await qualityResponse.json().catch(function(){return{};});if(!qualityResponse.ok)throw new Error(String(catalog.error||'Could not load video qualities'));}else{downloadToken=String(first.downloadToken||'');if(!/^[A-Za-z0-9_-]{40,160}$/.test(downloadToken))throw new Error(String(first.error||'Download session is invalid'));}providerMeta=Object.assign({},first,catalog);const preferred=optionKeyValid(kind,preferredKey)?preferredKey:'';if(!renderOptions(catalog.options,preferred))throw new Error('No downloadable video option is available');const option=selectedOption();const message=kind==='story'?(providerMeta.type==='live'?'Instagram Live is ready':providerMeta.type==='highlight'?'Choose highlight clip':'Choose story'):(kind==='instagram'?'Choose quality':'Choose format');setProgress(0,false);setState('waiting',message,optionDetail(option));setButton(option?.kind==='live'?'Start recording':'Download',false);haptic('light');stripLaunchContext();return true;}catch(error){downloadToken='';providerMeta=null;prepared=null;clearOptions();setState('error',String(error?.message||'Could not prepare download'),'');setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}

  async function prepareSelectedDownload(){if(!provider||!downloadToken||!selectedOptionKey||preparingPromise)return false;const option=selectedOption();setState('preparing','Preparing '+String(option?.label||'video'),optionDetail(option));setButton('Preparing…',true);preparingPromise=(async function(){try{const cfg=endpoints[provider];const response=await fetch(cfg.session,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData(),downloadToken:downloadToken,optionKey:selectedOptionKey})});const session=await response.json().catch(function(){return{};});if(!response.ok||!session.downloadUrl||!session.progressUrl||(!session.live&&!session.fileSize))throw new Error(String(session.error||'Could not prepare selected option'));prepared={downloadUrl:new URL(String(session.downloadUrl),window.location.origin).href,progressUrl:new URL(String(session.progressUrl),window.location.origin).href,fileName:String(session.fileName||providerMeta?.fileName||(provider==='instagram'?'Vexa-Instagram-video.mp4':provider==='story'?'Vexa-Instagram-Story.mp4':'Vexa-video.mp4')),fileSize:Number(session.fileSize||0),title:String(session.title||providerMeta?.title||'Video'),optionKey:String(session.optionKey||selectedOptionKey),live:Boolean(session.live),provider:provider};setProgress(0,false);setState('waiting',prepared.live?'Ready to record':'Ready to download',optionDetail(option));setButton(prepared.live?'Start recording':'Download',false);return true;}catch(error){prepared=null;setState('error',String(error?.message||'Could not prepare selected option'),optionDetail(option));setButton('Try again',false);return false;}finally{preparingPromise=null;}})();return preparingPromise;}

  function cancelDownload(){if(!busy)return;busy=false;closeProgressSocket();setProgress(0,true);setState('waiting','Download cancelled',optionDetail(selectedOption()));setButton(selectedOption()?.kind==='live'?'Start recording':'Download',false);}
  function handleTelegramEvent(event){const state=String(event?.status||event||'').toLowerCase();if(state==='cancelled'){cancelDownload();return;}if(state==='downloading'&&busy&&displayedPercent<=0)setState('preparing','Starting download','Keep the app open.');}
  function bindTelegramEvent(){if(telegramEventBound)return;const tg=telegram();if(!tg?.onEvent)return;try{tg.onEvent('fileDownloadRequested',handleTelegramEvent);telegramEventBound=true;}catch(error){}}
  function requestDownload(){if(!prepared||busy)return;busy=true;setProgress(0,false);setState('preparing','Waiting for Telegram','Keep the app open.');setButton('Downloading…',true);connectProgress(prepared.progressUrl,false);bindTelegramEvent();haptic('light');const tg=telegram();if(tg?.downloadFile){try{tg.downloadFile({url:prepared.downloadUrl,file_name:prepared.fileName},function(accepted){if(accepted===false){cancelDownload();return;}if(displayedPercent<=0)setState('preparing','Starting download','Keep the app open.');});return;}catch(error){console.warn('Telegram downloadFile failed',error?.message||error);}}try{const link=document.createElement('a');link.href=prepared.downloadUrl;link.download=prepared.fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();if(displayedPercent<=0)setState('preparing','Starting download','Keep the app open.');}catch(error){busy=false;closeProgressSocket();setState('error','Could not start download','');setButton('Try again',false);}}
  async function onButtonClick(event){event.preventDefault();event.stopImmediatePropagation();if(busy||button.disabled)return;if(prepared){requestDownload();return;}if(downloadToken&&selectedOptionKey){const ready=await prepareSelectedDownload();if(ready)requestDownload();return;}const preset=launchContext();let source=sourceUrl||preset.source;if(!source){const value=window.prompt('Enter video link');if(value===null)return;source=String(value||'').trim();}if(!source)return;await prepareSource(source,preset.optionKey);}

  subtitleSelect.value=savedSubtitle();saveSubtitle(subtitleSelect.value);subtitleSelect.addEventListener('change',function(){saveSubtitle(String(subtitleSelect.value||'off'));haptic('light');});
  button.addEventListener('click',onButtonClick,true);bindTelegramEvent();
  const preset=launchContext();if(preset.source){prepareSource(preset.source,preset.optionKey);}else{setProgress(0,false);setState('idle','Ready when you are','');setButton('Download',false);syncSubtitle();}
})();`;

const LANDING_BODY = '<body><main id="vexaLiveDownloadRoot" class="vexa-live-download" data-state="idle" style="--vexa-progress:0"><section class="vexa-download-core" aria-live="polite"><p id="vexaLivePercent" class="vexa-download-percent">0%</p><div id="vexaLiveProgressTrack" class="vexa-download-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="vexaLiveProgressFill" class="vexa-download-fill"></span></div><div class="vexa-download-copy"><span id="vexaLiveStatus" class="vexa-download-status">Preparing download</span><small id="vexaLiveDetail" class="vexa-download-detail"></small></div><div id="vexaLiveQuality" class="vexa-download-quality" role="group" aria-label="Video quality"></div><div id="vexaDownloadSubtitle" class="vexa-download-subtitles" data-ready="0" data-disabled="0"><span class="vexa-subtitle-label">Subtitles</span><label class="vexa-subtitle-select-shell"><select id="vexaDownloadSubtitleLanguage" class="vexa-subtitle-select" aria-label="Burned-in subtitle language"><option value="off">Off</option><option value="original">Original audio</option><option value="en">English</option><option value="fa">فارسی</option><option value="ru">Русский</option><option value="de">Deutsch</option><option value="tr">Türkçe</option><option value="es">Español</option><option value="ar">العربية</option><option value="fr">Français</option><option value="pt">Português</option><option value="it">Italiano</option><option value="hi">हिन्दी</option><option value="zh">中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select><span class="vexa-subtitle-chevron">⌄</span></label></div><button id="vexaLiveDownload" class="vexa-live-download-action" type="button" disabled>Download</button></section></main><script>' + LANDING_SCRIPT + '</script></body>';

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
