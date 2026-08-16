export const APP_NAVIGATION_CSS = String.raw`
#ttsAppMenuButton.tts-app-menu-button{position:relative;width:36px;height:36px;flex:0 0 36px;display:grid;place-content:center;gap:4.2px;padding:0;border:0;border-radius:14px;background:rgba(13,13,13,.62);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s ease}
#ttsAppMenuButton.tts-app-menu-button:active{transform:scale(.9);background:rgba(255,255,255,.11)}
#ttsAppMenuButton.tts-app-menu-button>span{display:block;width:15px;height:2px;border-radius:999px;background:currentColor;transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .18s ease,width .25s ease}
#ttsAppMenuButton.tts-app-menu-button>span:nth-child(2){width:11px}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:first-child{transform:translateY(6.2px) rotate(45deg)}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:nth-child(2){width:0;opacity:0}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:last-child{transform:translateY(-6.2px) rotate(-45deg)}
body.tts-app-nav-mounted #wheelOpenButton,body.tts-app-nav-mounted #aiChatOpen,body.tts-app-nav-mounted #modeToggle{display:none!important}
.tts-app-nav-backdrop{position:fixed;z-index:2100;inset:0;background:rgba(0,0,0,.6);opacity:0;visibility:hidden;pointer-events:none;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);transition:opacity .25s ease,visibility 0s linear .34s}
.tts-app-nav-backdrop.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}
.tts-app-nav-panel,.tts-app-nav-panel button{font-family:ui-rounded,"SF Pro Rounded","SF Pro Display","Avenir Next",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.tts-app-nav-panel{position:absolute;left:0;top:0;bottom:0;width:min(33.333vw,186px);min-width:0;overflow:hidden;display:flex;flex-direction:column;padding:calc(30px + env(safe-area-inset-top)) 9px calc(14px + env(safe-area-inset-bottom));border:0;border-right:1px solid rgba(255,255,255,.09);border-radius:0;background:rgba(7,7,7,.985);box-shadow:18px 0 42px rgba(0,0,0,.28);backdrop-filter:blur(18px) saturate(1.04);-webkit-backdrop-filter:blur(18px) saturate(1.04);transform:translate3d(-103%,0,0);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.tts-app-nav-backdrop.open .tts-app-nav-panel{transform:none}
.tts-app-nav-head{height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 7px 12px 8px;border-bottom:1px solid rgba(255,255,255,.085)}
.tts-app-nav-brand{min-width:0;display:flex;align-items:center}
.tts-app-nav-brand small{display:none}
.tts-app-nav-brand strong{color:#fff;font-size:18px;font-weight:780;line-height:1;letter-spacing:-.04em;white-space:nowrap}
.tts-app-nav-close{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:transparent;color:rgba(255,255,255,.48);transition:transform .2s cubic-bezier(.16,1,.3,1),color .18s ease,background .18s ease}
.tts-app-nav-close:active{transform:scale(.88);background:rgba(255,255,255,.055);color:#fff}
.tts-app-nav-close svg{width:16px;height:16px}
.tts-app-nav-list{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 0 4px;scrollbar-width:none}
.tts-app-nav-list::-webkit-scrollbar{display:none}
.tts-app-nav-section{padding:11px 8px 6px;color:rgba(255,255,255,.37);font-size:8px;font-weight:790;line-height:1;letter-spacing:.075em;text-transform:uppercase}
.tts-app-nav-item{--nav-index:0;position:relative;width:100%;min-height:40px;display:grid;grid-template-columns:21px minmax(0,1fr) auto;align-items:center;gap:8px;margin:0 0 2px;padding:0 9px;border:0;border-radius:12px;background:transparent;color:rgba(255,255,255,.43);box-shadow:none;text-align:left;opacity:0;transform:translateX(-9px);transition:opacity .2s ease,transform .32s cubic-bezier(.16,1,.3,1),background .18s ease,color .18s ease}
.tts-app-nav-backdrop.open .tts-app-nav-item{opacity:1;transform:none;transition-delay:calc(44ms + var(--nav-index) * 19ms),calc(44ms + var(--nav-index) * 19ms),0ms,0ms}
.tts-app-nav-item:not(.is-coming):active{transform:scale(.975)!important;background:rgba(255,255,255,.045);color:rgba(255,255,255,.72)}
.tts-app-nav-item.active{background:#292929;color:#fff}
.tts-app-nav-item.active:before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:3px;border-radius:0 999px 999px 0;background:#fff}
.tts-app-nav-icon{width:21px;height:21px;display:grid;place-items:center;color:currentColor;transition:color .18s ease,transform .22s cubic-bezier(.16,1,.3,1)}
.tts-app-nav-item.active .tts-app-nav-icon{color:#fff;transform:none}
.tts-app-nav-icon svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tts-app-nav-copy{min-width:0;display:block}
.tts-app-nav-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:currentColor;font-size:11.5px;font-weight:690;line-height:1;letter-spacing:-.022em}
.tts-app-nav-soon{justify-self:end;color:rgba(255,255,255,.28);font-size:6.5px;font-weight:780;line-height:1;letter-spacing:.055em;text-transform:uppercase}
.tts-app-nav-item.is-coming{color:rgba(255,255,255,.34);cursor:default;pointer-events:none}
.tts-app-nav-item.is-coming .tts-app-nav-icon{color:rgba(255,255,255,.34)}
.tts-app-nav-item.is-coming .tts-app-nav-label{font-weight:650}
.tts-app-nav-item:disabled{opacity:0}
.tts-app-nav-backdrop.open .tts-app-nav-item:disabled{opacity:1}
#ttsAppNavAiIcon{overflow:visible}
#aiChatButtonOrb.tts-app-nav-ai-orb{display:block!important;width:20px!important;height:20px!important;max-width:none!important;max-height:none!important;margin:0!important;opacity:.62;filter:saturate(.25) brightness(.92)!important;transition:opacity .18s ease,filter .18s ease}
.tts-app-nav-item.active #aiChatButtonOrb.tts-app-nav-ai-orb{opacity:1;filter:none!important;transform:none}
body.tts-app-nav-open{touch-action:none}
@media(max-width:350px){.tts-app-nav-panel{padding-left:7px;padding-right:7px}.tts-app-nav-head{padding-left:7px;padding-right:5px}.tts-app-nav-brand strong{font-size:16px}.tts-app-nav-section{font-size:7px;padding-left:6px}.tts-app-nav-item{grid-template-columns:19px minmax(0,1fr) auto;gap:6px;padding-left:7px;padding-right:6px}.tts-app-nav-label{font-size:10px}.tts-app-nav-icon,.tts-app-nav-icon svg{width:18px;height:18px}.tts-app-nav-soon{font-size:5.5px}}
@media(prefers-reduced-motion:reduce){#ttsAppMenuButton.tts-app-menu-button>span,.tts-app-nav-backdrop,.tts-app-nav-panel,.tts-app-nav-item,.tts-app-nav-icon,.tts-app-nav-close{transition:none!important}.tts-app-nav-item{opacity:1;transform:none}}
`;

export const APP_NAVIGATION_JS = String.raw`
(function(){
  if(window.__vexaAppNavigationMounted)return;
  window.__vexaAppNavigationMounted=true;

  var creditTools=document.querySelector('.tts-head .credit-tools');
  if(!creditTools)return;

  var icon=function(path){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>'};
  var icons={
    tts:icon('<rect x="8.2" y="3.2" width="7.6" height="11.2" rx="3.8"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4"></path>'),
    image:icon('<rect x="3.5" y="4.4" width="17" height="15.2" rx="3.8"></rect><circle cx="8.2" cy="9.1" r="1.35"></circle><path d="m5.8 16.6 3.7-3.7a1.4 1.4 0 0 1 2 0l1.45 1.45 1.3-1.3a1.4 1.4 0 0 1 2 0l2 2"></path><path d="M17.6 2.8v3.6M15.8 4.6h3.6"></path>'),
    explore:icon('<circle cx="12" cy="12" r="8.2"></circle><path d="m15.2 8.8-2.1 6-6 2.1 2.1-6 6-2.1Z"></path>'),
    live:icon('<path d="M7 8.2a6.2 6.2 0 0 0 0 7.6M17 8.2a6.2 6.2 0 0 1 0 7.6"></path><path d="M4.4 5.8a9.5 9.5 0 0 0 0 12.4M19.6 5.8a9.5 9.5 0 0 1 0 12.4"></path><circle cx="12" cy="12" r="2.2"></circle>'),
    voices:icon('<circle cx="12" cy="8" r="3.1"></circle><path d="M6.7 19.2v-1.4a5.3 5.3 0 0 1 10.6 0v1.4"></path>'),
    credits:icon('<rect x="3.4" y="5.2" width="17.2" height="13.6" rx="3.3"></rect><path d="M3.6 9.5h16.8M7.2 14.8h4.2"></path>'),
    wheel:icon('<circle cx="12" cy="12" r="8.2"></circle><circle cx="12" cy="12" r="2.1"></circle><path d="M12 3.8v6.1M12 14.1v6.1M3.8 12h6.1M14.1 12h6.1"></path>'),
    dubbing:icon('<path d="M5 5.2h10a4 4 0 0 1 4 4v4.5a4 4 0 0 1-4 4H9.3L5 20l1-3.2a4 4 0 0 1-2.4-3.7V9.2A4 4 0 0 1 5 5.2Z"></path>'),
    music:icon('<path d="M9.2 17.3V7.2L18 5.4v9.7"></path><ellipse cx="6.9" cy="17.5" rx="2.3" ry="1.8"></ellipse><ellipse cx="15.7" cy="15.2" rx="2.3" ry="1.8"></ellipse>'),
    effects:icon('<path d="M4.5 12h2.1M8.6 8.5v7M12 5.7v12.6M15.4 8.5v7M19.4 10.2v3.6"></path>'),
    changer:icon('<rect x="8.2" y="3.3" width="7.6" height="10.4" rx="3.8"></rect><path d="M5.8 11.4a6.2 6.2 0 0 0 10.7 4.2M12 17.6v3M9.1 20.6h5.8"></path><path d="M17.1 7.7h3.4v-3.4M20.5 7.7a4.8 4.8 0 0 0-3.2-4.3"></path>'),
    clone:icon('<rect x="7.2" y="6.3" width="11.7" height="13.1" rx="3.2"></rect><path d="M5.1 16.1h-.4A2.7 2.7 0 0 1 2 13.4V6.8A2.7 2.7 0 0 1 4.7 4h7.5A2.7 2.7 0 0 1 15 6.7"></path>')
  };

  var trigger=document.createElement('button');
  trigger.id='ttsAppMenuButton';
  trigger.className='tts-app-menu-button';
  trigger.type='button';
  trigger.setAttribute('aria-label','Open navigation');
  trigger.setAttribute('aria-controls','ttsAppNavigation');
  trigger.setAttribute('aria-expanded','false');
  trigger.innerHTML='<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
  creditTools.insertBefore(trigger,creditTools.firstChild);

  var upcoming=function(name,iconMarkup,index){return '<button class="tts-app-nav-item is-coming" style="--nav-index:'+index+'" type="button" disabled aria-disabled="true"><span class="tts-app-nav-icon">'+iconMarkup+'</span><span class="tts-app-nav-copy"><span class="tts-app-nav-label">'+name+'</span></span><small class="tts-app-nav-soon">Soon</small></button>'};
  var section=function(name){return '<div class="tts-app-nav-section">'+name+'</div>'};

  var backdrop=document.createElement('div');
  backdrop.id='ttsAppNavigation';
  backdrop.className='tts-app-nav-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML=''
    +'<aside class="tts-app-nav-panel" aria-label="Vexa navigation">'
    +'<div class="tts-app-nav-head"><div class="tts-app-nav-brand"><strong>Vexa AI</strong></div><button class="tts-app-nav-close" type="button" aria-label="Close navigation"><svg viewBox="0 0 24 24" fill="none"><path d="m7.5 7.5 9 9M16.5 7.5l-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>'
    +'<nav class="tts-app-nav-list">'
    +section('Create')
    +'<button class="tts-app-nav-item active" style="--nav-index:0" data-app-nav="tts" type="button"><span class="tts-app-nav-icon">'+icons.tts+'</span><span class="tts-app-nav-label">Text to Speech</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:1" data-app-nav="image" type="button"><span class="tts-app-nav-icon">'+icons.image+'</span><span class="tts-app-nav-label">Generate Image</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:2" data-app-nav="ai" data-action="open-ai-chat" type="button"><span id="ttsAppNavAiIcon" class="tts-app-nav-icon"></span><span class="tts-app-nav-label">AI Agent</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:3" data-app-nav="live" type="button"><span class="tts-app-nav-icon">'+icons.live+'</span><span class="tts-app-nav-label">Vexa Live</span></button>'
    +section('Audio')
    +upcoming('Dubbing',icons.dubbing,4)
    +upcoming('Music',icons.music,5)
    +upcoming('Sound Effects',icons.effects,6)
    +upcoming('Voice Changer',icons.changer,7)
    +upcoming('Voice Clone',icons.clone,8)
    +section('Discover')
    +'<button class="tts-app-nav-item" style="--nav-index:9" data-app-nav="explore" data-action="open-explore-page" type="button"><span class="tts-app-nav-icon">'+icons.explore+'</span><span class="tts-app-nav-label">Explore</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:10" data-app-nav="voices" data-action="open-voices-page" type="button"><span class="tts-app-nav-icon">'+icons.voices+'</span><span class="tts-app-nav-label">Voices</span></button>'
    +section('More')
    +'<button class="tts-app-nav-item" style="--nav-index:11" data-app-nav="credits" data-action="open-credits-page" type="button"><span class="tts-app-nav-icon">'+icons.credits+'</span><span class="tts-app-nav-label">Buy Credits</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:12" data-app-nav="wheel" data-action="open-wheel" type="button"><span class="tts-app-nav-icon">'+icons.wheel+'</span><span class="tts-app-nav-label">Reward Wheel</span></button>'
    +'</nav></aside>';
  document.body.appendChild(backdrop);
  document.body.classList.add('tts-app-nav-mounted');

  var aiCanvas=document.getElementById('aiChatButtonOrb');
  var aiSlot=document.getElementById('ttsAppNavAiIcon');
  if(aiCanvas&&aiSlot){
    aiCanvas.classList.add('tts-app-nav-ai-orb');
    aiSlot.appendChild(aiCanvas);
  }

  var closeButton=backdrop.querySelector('.tts-app-nav-close');
  var items=Array.prototype.slice.call(backdrop.querySelectorAll('[data-app-nav]'));
  var lastFocus=null;

  function setActive(target){
    items.forEach(function(item){
      var active=item.getAttribute('data-app-nav')===target;
      item.classList.toggle('active',active);
      if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
    });
  }

  function syncActive(){
    setActive(document.body.classList.contains('image-mode')?'image':'tts');
  }

  function setOpen(open,restoreFocus){
    var next=!!open;
    backdrop.classList.toggle('open',next);
    backdrop.setAttribute('aria-hidden',next?'false':'true');
    trigger.setAttribute('aria-expanded',next?'true':'false');
    trigger.setAttribute('aria-label',next?'Close navigation':'Open navigation');
    document.body.classList.toggle('tts-app-nav-open',next);
    if(next){
      lastFocus=document.activeElement;
      syncActive();
      requestAnimationFrame(function(){var active=backdrop.querySelector('.tts-app-nav-item.active');if(active)active.focus({preventScroll:true})});
      if(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback)try{window.Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(error){}
    }else if(restoreFocus&&lastFocus&&typeof lastFocus.focus==='function'){
      try{lastFocus.focus({preventScroll:true})}catch(error){}
    }
  }

  trigger.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();setOpen(!backdrop.classList.contains('open'),false)});
  closeButton.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();setOpen(false,true)});
  backdrop.addEventListener('click',function(event){if(event.target===backdrop)setOpen(false,true)});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&backdrop.classList.contains('open'))setOpen(false,true)});

  items.forEach(function(item){
    item.addEventListener('click',function(event){
      var target=item.getAttribute('data-app-nav')||'';
      setActive(target);
      setOpen(false,false);
      if(target==='tts'||target==='image'){
        event.preventDefault();
        event.stopPropagation();
        var imageMode=document.body.classList.contains('image-mode');
        var shouldImage=target==='image';
        if(imageMode!==shouldImage){var toggle=document.getElementById('modeToggle');if(toggle)toggle.click()}
        return;
      }
      if(target==='live'){
        event.preventDefault();
        event.stopPropagation();
        window.location.assign('/mini-app/live');
      }
    });
  });
})();
`;
