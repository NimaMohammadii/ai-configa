export const APP_NAVIGATION_CSS = String.raw`
#ttsAppMenuButton.tts-app-menu-button{position:relative;width:36px;height:36px;flex:0 0 36px;display:grid;place-content:center;gap:4.3px;padding:0;border:0;border-radius:14px;background:rgba(13,13,13,.62);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s ease}
#ttsAppMenuButton.tts-app-menu-button:active{transform:scale(.9);background:rgba(255,255,255,.11)}
#ttsAppMenuButton.tts-app-menu-button>span{display:block;width:15px;height:2px;border-radius:999px;background:currentColor;transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .18s ease,width .25s ease}
#ttsAppMenuButton.tts-app-menu-button>span:nth-child(2){width:11px}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:first-child{transform:translateY(6.3px) rotate(45deg)}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:nth-child(2){width:0;opacity:0}
#ttsAppMenuButton.tts-app-menu-button[aria-expanded="true"]>span:last-child{transform:translateY(-6.3px) rotate(-45deg)}
body.tts-app-nav-mounted #wheelOpenButton,body.tts-app-nav-mounted #aiChatOpen,body.tts-app-nav-mounted #modeToggle{display:none!important}
.tts-app-nav-backdrop{position:fixed;z-index:2100;inset:0;background:rgba(0,0,0,.48);opacity:0;visibility:hidden;pointer-events:none;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);transition:opacity .28s ease,visibility 0s linear .36s}
.tts-app-nav-backdrop.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}
.tts-app-nav-panel,.tts-app-nav-panel button{font-family:ui-rounded,"SF Pro Rounded","SF Pro Display","Avenir Next",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.tts-app-nav-panel{position:absolute;left:8px;top:8px;bottom:8px;width:min(33.333vw,186px);min-width:0;overflow:hidden;padding:calc(29px + env(safe-area-inset-top)) 8px calc(14px + env(safe-area-inset-bottom));border:0;border-radius:24px;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transform:translate3d(-112%,0,0) scale(.985);transform-origin:left center;transition:transform .44s cubic-bezier(.16,1,.3,1),opacity .28s ease;display:flex;flex-direction:column;opacity:.94}
.tts-app-nav-backdrop.open .tts-app-nav-panel{transform:none;opacity:1}
.tts-app-nav-head{height:42px;display:flex;align-items:center;justify-content:space-between;gap:7px;padding:0 3px 8px 5px;border-bottom:1px solid rgba(255,255,255,.065)}
.tts-app-nav-brand{min-width:0;display:grid;gap:2px}
.tts-app-nav-brand small{color:rgba(255,255,255,.32);font-size:7px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.tts-app-nav-brand strong{color:#fff;font-size:13px;font-weight:760;line-height:1;letter-spacing:-.028em}
.tts-app-nav-close{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;padding:0;border:0;border-radius:11px;background:rgba(13,13,13,.62);color:rgba(255,255,255,.58);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s ease,color .2s ease}
.tts-app-nav-close:active{transform:scale(.86);background:rgba(255,255,255,.1);color:#fff}
.tts-app-nav-close svg{width:14px;height:14px}
.tts-app-nav-list{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:10px 0 3px;scrollbar-width:none}
.tts-app-nav-list::-webkit-scrollbar{display:none}
.tts-app-nav-item{--nav-index:0;position:relative;width:100%;height:42px;display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:7px;margin:0 0 6px;padding:0 7px;border:0;border-radius:14px;background:rgba(13,13,13,.62);color:rgba(255,255,255,.48);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);text-align:left;opacity:0;transform:translateX(-10px) scale(.985);transition:opacity .22s ease,transform .34s cubic-bezier(.16,1,.3,1),background .2s ease,color .2s ease,box-shadow .2s ease}
.tts-app-nav-backdrop.open .tts-app-nav-item{opacity:1;transform:none;transition-delay:calc(55ms + var(--nav-index) * 24ms),calc(55ms + var(--nav-index) * 24ms),0ms,0ms,0ms}
.tts-app-nav-item:active{transform:scale(.955)!important;background:rgba(255,255,255,.09)}
.tts-app-nav-item.active{background:rgba(20,20,20,.78);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(255,255,255,.07),inset 0 0 20px rgba(255,255,255,.065),0 10px 22px rgba(0,0,0,.24)}
.tts-app-nav-item.active:after{content:"";position:absolute;right:6px;top:50%;width:4px;height:4px;border-radius:50%;background:#fff;transform:translateY(-50%)}
.tts-app-nav-icon{width:20px;height:20px;display:grid;place-items:center;border-radius:8px;color:currentColor;transition:transform .28s cubic-bezier(.16,1,.3,1),color .2s ease}
.tts-app-nav-item.active .tts-app-nav-icon{transform:scale(1.06)}
.tts-app-nav-icon svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.05;stroke-linecap:round;stroke-linejoin:round}
.tts-app-nav-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:currentColor;font-size:10.5px;font-weight:720;line-height:1;letter-spacing:-.014em}
.tts-app-nav-separator{height:1px;margin:7px 5px 13px;background:rgba(255,255,255,.07)}
#ttsAppNavAiIcon{overflow:visible}
#aiChatButtonOrb.tts-app-nav-ai-orb{display:block!important;width:20px!important;height:20px!important;max-width:none!important;max-height:none!important;margin:0!important;opacity:.78;filter:none!important;transition:opacity .2s ease,transform .28s cubic-bezier(.16,1,.3,1)}
.tts-app-nav-item.active #aiChatButtonOrb.tts-app-nav-ai-orb{opacity:1;transform:scale(1.06)}
body.tts-app-nav-open{touch-action:none}
@media(max-width:350px){.tts-app-nav-panel{left:6px;padding-left:6px;padding-right:6px}.tts-app-nav-item{gap:5px;padding:0 5px}.tts-app-nav-label{font-size:9.5px}.tts-app-nav-icon,.tts-app-nav-icon svg{width:17px;height:17px}}
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
    tts:icon('<rect x="8.2" y="3.4" width="7.6" height="10.8" rx="3.8"></rect><path d="M5.7 11.2a6.3 6.3 0 0 0 12.6 0M12 17.5v3M8.9 20.5h6.2"></path>'),
    image:icon('<rect x="3.6" y="4.2" width="16.8" height="15.6" rx="4.7"></rect><circle cx="8.4" cy="9" r="1.45"></circle><path d="m5.8 16.8 3.7-3.7a1.45 1.45 0 0 1 2.05 0l1.45 1.45 1.2-1.2a1.45 1.45 0 0 1 2.05 0l1.95 1.95"></path>'),
    explore:icon('<circle cx="12" cy="12" r="8.3"></circle><path d="m15.1 8.9-2.1 5.9-5.9 2.1 2.1-5.9 5.9-2.1Z"></path>'),
    live:icon('<rect x="3.7" y="5" width="16.6" height="14" rx="4.7"></rect><path d="M7.2 10.1h3.1M13.7 10.1h3.1M7.2 13.9h5"></path><circle cx="16.3" cy="13.9" r="1.25"></circle>'),
    voices:icon('<path d="M5 14.4V9.6M8.5 16.9V7.1M12 18.7V5.3M15.5 16V8M19 13.8v-3.6"></path>'),
    credits:icon('<rect x="3.5" y="5.3" width="17" height="13.4" rx="4.2"></rect><path d="M3.7 9.4h16.6M7.2 14.7h4.1"></path>'),
    wheel:icon('<circle cx="12" cy="12" r="8.3"></circle><path d="M12 3.7v4.2M12 16.1v4.2M3.7 12h4.2M16.1 12h4.2M6.1 6.1l3 3M14.9 14.9l3 3M17.9 6.1l-3 3M9.1 14.9l-3 3"></path><circle cx="12" cy="12" r="1.6"></circle>')
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

  var backdrop=document.createElement('div');
  backdrop.id='ttsAppNavigation';
  backdrop.className='tts-app-nav-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML=''
    +'<aside class="tts-app-nav-panel" aria-label="Vexa navigation">'
    +'<div class="tts-app-nav-head"><div class="tts-app-nav-brand"><small>Vexa</small><strong>Menu</strong></div><button class="tts-app-nav-close" type="button" aria-label="Close navigation"><svg viewBox="0 0 24 24" fill="none"><path d="m7.5 7.5 9 9M16.5 7.5l-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>'
    +'<nav class="tts-app-nav-list">'
    +'<button class="tts-app-nav-item active" style="--nav-index:0" data-app-nav="tts" type="button"><span class="tts-app-nav-icon">'+icons.tts+'</span><span class="tts-app-nav-label">Text to Speech</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:1" data-app-nav="image" type="button"><span class="tts-app-nav-icon">'+icons.image+'</span><span class="tts-app-nav-label">Image Studio</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:2" data-app-nav="ai" data-action="open-ai-chat" type="button"><span id="ttsAppNavAiIcon" class="tts-app-nav-icon"></span><span class="tts-app-nav-label">AI Chat</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:3" data-app-nav="live" type="button"><span class="tts-app-nav-icon">'+icons.live+'</span><span class="tts-app-nav-label">Vexa Live</span></button>'
    +'<div class="tts-app-nav-separator" aria-hidden="true"></div>'
    +'<button class="tts-app-nav-item" style="--nav-index:4" data-app-nav="explore" data-action="open-explore-page" type="button"><span class="tts-app-nav-icon">'+icons.explore+'</span><span class="tts-app-nav-label">Explore</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:5" data-app-nav="voices" data-action="open-voices-page" type="button"><span class="tts-app-nav-icon">'+icons.voices+'</span><span class="tts-app-nav-label">Voices</span></button>'
    +'<div class="tts-app-nav-separator" aria-hidden="true"></div>'
    +'<button class="tts-app-nav-item" style="--nav-index:6" data-app-nav="credits" data-action="open-credits-page" type="button"><span class="tts-app-nav-icon">'+icons.credits+'</span><span class="tts-app-nav-label">Buy Credits</span></button>'
    +'<button class="tts-app-nav-item" style="--nav-index:7" data-app-nav="wheel" data-action="open-wheel" type="button"><span class="tts-app-nav-icon">'+icons.wheel+'</span><span class="tts-app-nav-label">Reward Wheel</span></button>'
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