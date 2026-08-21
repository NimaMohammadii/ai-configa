export const LIVE_SUBTITLES_RUNTIME_JS = String.raw`
(function(){
'use strict';
const SOCKET_PATH='/mini-app/live/api/youtube-subtitles/realtime';
const PLAYER_ID='vexaCustomPlayer';
const STYLE_ID='vexaLiveSubtitlesStyle';
const LANGUAGES=[['off','Off',''],['original','Original audio','Auto'],['en','English','EN'],['fa','فارسی','FA'],['ru','Русский','RU'],['de','Deutsch','DE'],['tr','Türkçe','TR'],['es','Español','ES'],['ar','العربية','AR'],['fr','Français','FR'],['pt','Português','PT'],['it','Italiano','IT'],['hi','हिन्दी','HI'],['zh','中文','ZH'],['ja','日本語','JA'],['ko','한국어','KO']];
let enabled=false,targetLanguage='original',socket=null,generation=0;
let warmupActive=false,resumeAfterWarmup=false;
let timedSegments=[],renderHandle=0;

function hostWindow(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin)return window.parent;}catch{}return window;}
function telegram(){const h=hostWindow();return window.Telegram?.WebApp||h.Telegram?.WebApp||null;}
function initData(){return String(telegram()?.initData||'');}
function haptic(s){try{telegram()?.HapticFeedback?.impactOccurred?.(s||'light');}catch{}}
function playbackToken(v){try{const t=new URL(String(v?.currentSrc||v?.src||''),window.location.origin).searchParams.get('token')||'';return/^[A-Za-z0-9_-]{40,160}$/.test(t)?t:'';}catch{return'';}}
function websocketUrl(){const u=new URL(SOCKET_PATH,window.location.href);u.protocol=u.protocol==='https:'?'wss:':'ws:';return u.href;}
function playbackIsRunning(v){return Boolean(v&&!v.paused&&!v.ended&&Number(v.readyState||0)>=2);}

function installStyle(){
 if(document.getElementById(STYLE_ID))return;
 const s=document.createElement('style');s.id=STYLE_ID;
 s.textContent='#vexaCustomPlayer.vexa-subtitle-warming .vexa-player-buffer{opacity:1}#vexaCustomPlayer.vexa-subtitle-warming .vexa-player-center{opacity:.25}#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}#vexaCustomPlayer .vexa-subtitle-text{max-width:min(780px,92%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;font-size:clamp(15px,3.8vw,22px);line-height:1.32;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}';
 document.head.appendChild(s);
}

function installUI(player){
 if(player.querySelector('[data-vexa-subtitles]'))return;
 const row=player.querySelector('.vexa-player-row'),spacer=row?.querySelector('.vexa-player-spacer');if(!row||!spacer)return;
 const b=document.createElement('button');b.type='button';b.className='vexa-player-small vexa-subtitle-toggle';b.setAttribute('data-vexa-subtitles','1');b.setAttribute('aria-label','Live subtitles');b.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M18 10a2 2 0 1 0 0 4"/></svg>';row.insertBefore(b,spacer);
 const layer=document.createElement('div');layer.className='vexa-subtitle-layer';layer.innerHTML='<div class="vexa-subtitle-text" data-subtitle-text></div>';player.appendChild(layer);
 const back=document.createElement('div');back.className='vexa-subtitle-drawer-backdrop';back.setAttribute('data-subtitle-backdrop','1');player.appendChild(back);
 const drawer=document.createElement('div');drawer.className='vexa-subtitle-drawer';drawer.setAttribute('data-subtitle-drawer','1');drawer.innerHTML='<div class="vexa-subtitle-drawer-head"><div class="vexa-subtitle-drawer-title">Live subtitles</div><div class="vexa-subtitle-drawer-sub">Translate to</div></div><div class="vexa-subtitle-language-list">'+LANGUAGES.map(function(x){return'<button type="button" class="vexa-subtitle-language" data-language="'+x[0]+'"><span class="vexa-subtitle-lang-code">'+(x[2]||'—')+'</span><span class="vexa-subtitle-lang-name">'+x[1]+'</span><span class="vexa-subtitle-check">✓</span></button>';}).join('')+'</div>';player.appendChild(drawer);
 b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openDrawer(player);});
 back.addEventListener('click',function(){closeDrawer(player);});
 drawer.addEventListener('click',function(e){const o=e.target?.closest?.('[data-language]');if(!o)return;e.preventDefault();e.stopPropagation();chooseLanguage(player,String(o.dataset.language||'off'));});
 updateLanguageSelection(player);
}
function openDrawer(p){updateLanguageSelection(p);p.querySelector('[data-subtitle-backdrop]')?.classList.add('show');p.querySelector('[data-subtitle-drawer]')?.classList.add('show');haptic('light');}
function closeDrawer(p){p.querySelector('[data-subtitle-backdrop]')?.classList.remove('show');p.querySelector('[data-subtitle-drawer]')?.classList.remove('show');}
function updateLanguageSelection(p){const s=enabled?targetLanguage:'off';p.querySelectorAll('[data-language]').forEach(function(n){n.classList.toggle('is-selected',String(n.dataset.language)===s);});p.querySelector('[data-vexa-subtitles]')?.classList.toggle('is-active',enabled);}
function chooseLanguage(p,l){closeDrawer(p);if(l==='off')stopSubtitles(p);else startSubtitles(p,l);updateLanguageSelection(p);haptic('medium');}

function clearCaptionState(p){timedSegments=[];hideCaption(p);}
function closeSocket(){const current=socket;socket=null;generation++;if(!current)return;current.__vexaIntentional=true;try{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:'stop'}));}catch{}try{current.close(1000,'stopped');}catch{}}
function stopSubtitles(p){const v=p.querySelector('video'),resume=warmupActive&&resumeAfterWarmup;enabled=false;targetLanguage='original';warmupActive=false;resumeAfterWarmup=false;p.classList.remove('vexa-subtitle-warming');closeSocket();clearCaptionState(p);if(resume&&v&&!v.ended)Promise.resolve(v.play()).catch(function(){});}

function startSubtitles(p,l){const v=p.querySelector('video');if(!v||!playbackToken(v))return;const shouldResume=warmupActive?resumeAfterWarmup:Boolean(!v.paused&&!v.ended);enabled=true;targetLanguage=l;startWarmup(p,v,shouldResume);}
function startWarmup(p,v,shouldResume){
 if(!enabled||!v||v.ended)return;
 closeSocket();clearCaptionState(p);warmupActive=true;resumeAfterWarmup=Boolean(shouldResume);p.classList.add('vexa-subtitle-warming');
 if(!v.paused){try{v.pause();}catch{}}
 connectRealtime(p,v);
}

function sendPlaybackState(v,playing){const current=socket;if(!current||current.readyState!==WebSocket.OPEN||!v)return;try{current.send(JSON.stringify({type:'playback_state',currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:typeof playing==='boolean'?playing:playbackIsRunning(v),warmup:false}));}catch{}}

function connectRealtime(p,v){
 if(!enabled||!v||v.ended||(!warmupActive&&v.paused))return;
 if(socket&&(socket.readyState===WebSocket.CONNECTING||socket.readyState===WebSocket.OPEN))return;
 const token=playbackToken(v);if(!token){showCaption(p,'Video session is invalid',true);return;}
 const currentGeneration=++generation,ws=new WebSocket(websocketUrl());socket=ws;
 ws.addEventListener('open',function(){if(!enabled||socket!==ws||generation!==currentGeneration){try{ws.close();}catch{}return;}ws.send(JSON.stringify({type:'start',initData:initData(),playbackToken:token,targetLanguage:targetLanguage}));});
 ws.addEventListener('message',function(event){
   if(!enabled||socket!==ws||generation!==currentGeneration)return;
   let message;try{message=JSON.parse(String(event.data||'{}'));}catch{return;}
   if(message.type==='audio_ready'){
     ws.send(JSON.stringify({type:'playback_start',currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:false,warmup:warmupActive}));return;
   }
   if(message.type==='caption_segment'){
     const text=String(message.text||'').trim(),start=Number(message.start),end=Number(message.end);if(!text||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
     timedSegments.push({id:String(message.id||''),text:text,start:start,end:end,exact:Boolean(message.exact),revision:Number(message.revision||0)});
     timedSegments.sort(function(a,b){return a.start-b.start||a.end-b.end||a.revision-b.revision;});
     if(timedSegments.length>40)timedSegments=timedSegments.slice(-40);
     return;
   }
   if(message.type==='warmup_ready'){
     if(warmupActive){try{ws.send(JSON.stringify({type:'warmup_complete',currentTime:Math.max(0,Number(v.currentTime||0)),playbackRate:Math.max(.25,Math.min(4,Number(v.playbackRate||1))),playing:false,warmup:false}));}catch{}
       const resume=resumeAfterWarmup;warmupActive=false;resumeAfterWarmup=false;p.classList.remove('vexa-subtitle-warming');if(resume&&!v.ended)Promise.resolve(v.play()).catch(function(){});
     }return;
   }
   if(message.type==='error'){
     ws.__vexaFailed=true;const resume=warmupActive&&resumeAfterWarmup;warmupActive=false;resumeAfterWarmup=false;p.classList.remove('vexa-subtitle-warming');showCaption(p,String(message.error||'Live subtitles are unavailable'),true);if(resume&&!v.ended)Promise.resolve(v.play()).catch(function(){});return;
   }
   if(message.type==='ended'){closeSocket();return;}
 });
 ws.addEventListener('close',function(){
   if(socket!==ws||generation!==currentGeneration)return;socket=null;
   if(warmupActive&&!ws.__vexaIntentional){const resume=resumeAfterWarmup;warmupActive=false;resumeAfterWarmup=false;p.classList.remove('vexa-subtitle-warming');if(resume&&!v.ended)Promise.resolve(v.play()).catch(function(){});}
   if(enabled&&!ws.__vexaIntentional&&!ws.__vexaFailed&&!v.paused&&!v.ended)showCaption(p,'Live subtitles disconnected',true);
 });
 ws.addEventListener('error',function(){if(socket===ws){ws.__vexaFailed=true;const resume=warmupActive&&resumeAfterWarmup;warmupActive=false;resumeAfterWarmup=false;p.classList.remove('vexa-subtitle-warming');showCaption(p,'Live subtitles connection failed',true);if(resume&&!v.ended)Promise.resolve(v.play()).catch(function(){});}});
}

function showCaption(p,text,error){const n=p.querySelector('[data-subtitle-text]');if(!n)return;n.textContent=String(text||'');n.style.color=error?'#ffb1bd':'#fff';n.dir=targetLanguage==='fa'||targetLanguage==='ar'?'rtl':'auto';n.classList.toggle('show',Boolean(text));}
function hideCaption(p){p.querySelector('[data-subtitle-text]')?.classList.remove('show');}
function renderCaption(p,v){
 if(!enabled||warmupActive){hideCaption(p);return;}
 const t=Number(v.currentTime||0);
 timedSegments=timedSegments.filter(function(x){return x.end>=t-.45&&x.start<=t+15;});
 let best=null;
 for(let i=0;i<timedSegments.length;i++){
   const x=timedSegments[i];if(x.start>t+.12)break;if(x.end<t-.18)continue;
   if(!best||Number(x.exact)>Number(best.exact)||x.revision>best.revision||(x.revision===best.revision&&x.start>best.start))best=x;
 }
 if(best){showCaption(p,best.text,false);return;}
 hideCaption(p);
}
function startRenderer(p,v){if(renderHandle)return;const frame=function(){renderHandle=0;renderCaption(p,v);if(document.body.contains(p))renderHandle=requestAnimationFrame(frame);};renderHandle=requestAnimationFrame(frame);}

function bindPlayer(p){
 if(p.dataset.vexaLiveSubtitles==='clean1')return;p.dataset.vexaLiveSubtitles='clean1';installStyle();installUI(p);const v=p.querySelector('video');if(!v)return;startRenderer(p,v);
 v.addEventListener('play',function(){if(!enabled)return;if(warmupActive){try{v.pause();}catch{}return;}if(!socket){startWarmup(p,v,true);return;}sendPlaybackState(v,false);});
 v.addEventListener('playing',function(){if(enabled&&!warmupActive)sendPlaybackState(v,true);});
 v.addEventListener('pause',function(){if(!enabled)return;if(warmupActive)return;sendPlaybackState(v,false);closeSocket();clearCaptionState(p);});
 v.addEventListener('waiting',function(){if(enabled&&!warmupActive)sendPlaybackState(v,false);});
 v.addEventListener('stalled',function(){if(enabled&&!warmupActive)sendPlaybackState(v,false);});
 v.addEventListener('timeupdate',function(){if(enabled&&!warmupActive)sendPlaybackState(v);});
 v.addEventListener('seeking',function(){if(enabled){const resume=warmupActive?resumeAfterWarmup:Boolean(!v.paused&&!v.ended);warmupActive=true;resumeAfterWarmup=resume;p.classList.add('vexa-subtitle-warming');closeSocket();clearCaptionState(p);}});
 v.addEventListener('seeked',function(){if(enabled&&!v.ended){const resume=warmupActive?resumeAfterWarmup:Boolean(!v.paused&&!v.ended);startWarmup(p,v,resume);}});
 v.addEventListener('ratechange',function(){if(enabled&&!v.ended){const resume=warmupActive?resumeAfterWarmup:Boolean(!v.paused&&!v.ended);startWarmup(p,v,resume);}});
 v.addEventListener('emptied',function(){if(enabled){closeSocket();clearCaptionState(p);}});
 v.addEventListener('ended',function(){if(enabled){closeSocket();clearCaptionState(p);}});
}
function install(){const p=document.getElementById(PLAYER_ID);if(!p||!p.querySelector('video'))return false;bindPlayer(p);return true;}
if(!install()){const observer=new MutationObserver(function(){if(install())observer.disconnect();});observer.observe(document.documentElement,{childList:true,subtree:true});}
})();
`;
