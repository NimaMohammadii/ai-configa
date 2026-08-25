export const TTS_KEYBOARD_LOCK_PATCH = String.raw`
(function installTtsKeyboardLayoutLock(){
  var locked=false;
  var focused=false;
  var baselineViewportHeight=0;
  var bottomNode=null;
  var viewportRecoveryTimers=[];
  var viewportRecoveryFrame=0;

  function viewportHeight(){
    var viewport=window.visualViewport;
    var height=Number(viewport&&viewport.height||window.innerHeight||0);
    return Number.isFinite(height)&&height>0?height:0;
  }

  function isTextInput(target){
    return !!(target&&target.matches&&target.matches('textarea,input,[contenteditable="true"]'));
  }

  function isDialogueInput(target){
    return !!(target&&target.matches&&target.matches('[data-dialogue-text]'));
  }

  function keyboardIsActive(){
    var active=document.activeElement;
    return !!(
      focused||
      isTextInput(active)||
      (document.body&&document.body.classList.contains('keyboard-open'))
    );
  }

  function shellViewportHeight(){
    var root=document.documentElement;
    var inner=Number(window.innerHeight||0);
    var client=Number(root&&root.clientHeight||0);
    var visual=Number(window.visualViewport&&window.visualViewport.height||0);
    var telegram=Number(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.viewportHeight||0);
    var height=0;

    if(Number.isFinite(inner)&&inner>=320)height=Math.max(height,inner);
    if(Number.isFinite(client)&&client>=320)height=Math.max(height,client);

    if(!height){
      if(Number.isFinite(visual)&&visual>=320)height=Math.max(height,visual);
      if(Number.isFinite(telegram)&&telegram>=320)height=Math.max(height,telegram);
      return height;
    }

    if(Number.isFinite(visual)&&visual>=320&&Math.abs(visual-height)<=120){
      height=Math.max(height,visual);
    }
    if(Number.isFinite(telegram)&&telegram>=320&&Math.abs(telegram-height)<=120){
      height=Math.max(height,telegram);
    }
    return height;
  }

  function syncShellViewport(){
    if(keyboardIsActive())return;
    var height=shellViewportHeight();
    if(!Number.isFinite(height)||height<320)return;
    document.documentElement.style.setProperty('--app-viewport-height',Math.round(height)+'px');
  }

  function clearViewportRecovery(){
    if(viewportRecoveryFrame){
      cancelAnimationFrame(viewportRecoveryFrame);
      viewportRecoveryFrame=0;
    }
    viewportRecoveryTimers.forEach(function(timer){clearTimeout(timer)});
    viewportRecoveryTimers=[];
  }

  function scheduleViewportRecovery(){
    clearViewportRecovery();
    viewportRecoveryFrame=requestAnimationFrame(function(){
      viewportRecoveryFrame=0;
      syncShellViewport();
    });
    [70,180,360,700,1100].forEach(function(delay){
      viewportRecoveryTimers.push(setTimeout(syncShellViewport,delay));
    });
  }

  function lock(){
    if(locked)return;
    var node=document.querySelector('#flow.active .tts-bottom')||document.querySelector('.tts-bottom');
    if(!node)return;
    var rect=node.getBoundingClientRect();
    if(!Number.isFinite(rect.top)||rect.height<1)return;

    locked=true;
    bottomNode=node;
    baselineViewportHeight=viewportHeight();

    node.style.setProperty('position','fixed','important');
    node.style.setProperty('top',Math.round(rect.top)+'px','important');
    node.style.setProperty('bottom','auto','important');
  }

  function release(){
    if(!locked)return;
    var node=bottomNode;
    locked=false;
    focused=false;
    baselineViewportHeight=0;
    bottomNode=null;
    if(!node)return;

    node.style.removeProperty('position');
    node.style.removeProperty('top');
    node.style.removeProperty('bottom');
  }

  function releaseIfRecovered(){
    if(!locked||focused)return;
    var height=viewportHeight();
    if(!baselineViewportHeight||height>=Math.max(320,baselineViewportHeight-24))release();
  }

  function onViewportMutation(){
    releaseIfRecovered();
    scheduleViewportRecovery();
  }

  document.addEventListener('pointerdown',function(event){
    if(!isDialogueInput(event.target))return;
    lock();
  },true);

  document.addEventListener('focusin',function(event){
    if(!isDialogueInput(event.target))return;
    if(!locked)lock();
    focused=true;
  },true);

  document.addEventListener('focusout',function(event){
    if(!isDialogueInput(event.target))return;
    focused=false;
    requestAnimationFrame(function(){
      releaseIfRecovered();
      scheduleViewportRecovery();
    });
  },true);

  var viewportSource=window.visualViewport;
  if(viewportSource){
    viewportSource.addEventListener('resize',onViewportMutation,{passive:true});
  }
  window.addEventListener('resize',onViewportMutation,{passive:true});
  window.addEventListener('orientationchange',scheduleViewportRecovery,{passive:true});
  window.addEventListener('pageshow',scheduleViewportRecovery,{passive:true});
  window.addEventListener('pagehide',function(){
    clearViewportRecovery();
    release();
  },{passive:true});

  var tg=window.Telegram&&window.Telegram.WebApp;
  if(tg&&tg.onEvent){
    try{tg.onEvent('viewportChanged',onViewportMutation)}catch(error){}
  }

  scheduleViewportRecovery();
})();

(function installAdminOnlyPrimaryEntries(){
  var baseFetch=window.fetch.bind(window);
  var entryIds=['aiChatOpen','vexaLiveOpen'];

  function applyAdminState(value){
    var allowed=!!value;
    if(document.body)document.body.classList.toggle('ai-chat-admin',allowed);
    entryIds.forEach(function(id){
      var button=document.getElementById(id);
      if(button)button.setAttribute('aria-hidden',allowed?'false':'true');
    });
  }

  applyAdminState(false);

  window.fetch=async function(input,init){
    var response=await baseFetch(input,init);
    try{
      var path=typeof input==='string'?input:String(input&&input.url||'');
      if(path.indexOf('/mini-app/api/session')>=0){
        response.clone().json().then(function(data){
          applyAdminState(!!(data&&data.rewardWheel&&data.rewardWheel.isAdmin));
        }).catch(function(){
          applyAdminState(false);
        });
      }
    }catch(error){
      applyAdminState(false);
    }
    return response;
  };
})();

(function installPrimarySectionCoordinator(){
  var coordinating=false;
  var style=document.createElement('style');
  style.id='primarySectionCoordinatorStyle';
  style.textContent=
    'html body.vexa-mesh-surface .credits-page .credits-page-scroll{padding:calc(40px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom))!important}'+
    'html body.vexa-mesh-surface .credits-page .credits-page-head>div{display:block!important}'+
    'html body.vexa-mesh-surface .credits-page .credits-page-head p{display:block!important}'+
    '@media(max-width:620px){html body.vexa-mesh-surface .credits-page .credits-page-head{padding-right:50px!important}}'+
    'body.image-mode.vexa-mesh-surface #vexaSharedMeshBackground,body.credits-page-open.vexa-mesh-surface #vexaSharedMeshBackground{filter:brightness(.88)!important}'+
    '.tts-head .mode-toggle[aria-pressed="true"]{background:radial-gradient(145% 110% at 10% -8%,rgba(255,255,255,.98) 0%,rgba(255,255,255,.34) 36%,rgba(255,255,255,0) 58%),linear-gradient(155deg,#fff 0%,#f7f7f7 18%,#cecece 43%,#f4f4f4 68%,#bdbdbd 100%)!important;color:#090909!important;border:1px solid rgba(255,255,255,.9)!important;box-shadow:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.66),inset -1px 0 0 rgba(0,0,0,.08),inset 0 0 8px rgba(255,255,255,.35),0 8px 20px rgba(0,0,0,.26),0 0 14px rgba(255,255,255,.12)!important}';
  document.head.appendChild(style);

  function actionSection(button){
    if(!button)return '';
    var action=button.getAttribute('data-action')||'';
    if(button.id==='creditPill'||action==='open-credits-page')return 'credits';
    if(button.id==='modeToggle')return 'image';
    if(button.id==='speechToTextOpen')return 'speech-to-text';
    if(button.id==='vexaLiveOpen')return 'vexa-live';
    if(button.id==='wheelOpenButton'||action==='open-wheel')return 'wheel';
    if(action==='toggle-voice')return 'voice-picker';
    if(action==='open-voices-page')return 'voices';
    if(button.id==='aiChatOpen'||action==='open-ai-chat')return 'ai-chat';
    return '';
  }

  function closeExternalToggle(id,section,target){
    if(target===section)return;
    var button=document.getElementById(id);
    if(!button||button.getAttribute('aria-pressed')!=='true')return;
    button.click();
  }

  function closeMainSectionsExcept(target){
    if(target!=='image'&&document.body&&document.body.classList.contains('image-mode')){
      try{setCreationMode('voice')}catch(error){}
    }
    if(target!=='credits'&&document.body&&document.body.classList.contains('credits-page-open')){
      try{setCreditsPage(false)}catch(error){}
    }
    if(target!=='voices'&&document.body&&document.body.classList.contains('voices-page-open')){
      try{setVoicesPage(false)}catch(error){}
    }
    if(target!=='wheel'&&document.body&&document.body.classList.contains('wheel-open')){
      try{setWheelSheet(false)}catch(error){}
    }
    if(document.body&&document.body.classList.contains('explore-page-open')){
      try{closeExplorePage()}catch(error){}
    }
    try{if(exploreReelsIsOpen())closeExploreReels()}catch(error){}
    try{setHistorySheet(false)}catch(error){}
    try{setLimitSheet(false)}catch(error){}
    try{setImageSizeMenu(false)}catch(error){}
    try{setDemoLanguageMenu(false)}catch(error){}
    if(target!=='voice-picker'){
      var wrap=document.getElementById('voiceWrap');
      if(wrap)wrap.classList.remove('open');
    }
  }

  function coordinate(target){
    if(!target||coordinating)return;
    coordinating=true;
    try{
      closeMainSectionsExcept(target);
      closeExternalToggle('speechToTextOpen','speech-to-text',target);
      closeExternalToggle('vexaLiveOpen','vexa-live',target);
    }finally{
      coordinating=false;
    }
  }

  document.addEventListener('click',function(event){
    if(coordinating)return;
    var button=event.target&&event.target.closest?event.target.closest('button,[role="button"]'):null;
    var target=actionSection(button);
    if(target)coordinate(target);
  },true);

  document.addEventListener('keydown',function(event){
    if(coordinating||!(event.key==='Enter'||event.key===' '))return;
    var button=event.target&&event.target.closest?event.target.closest('#creditPill'):null;
    if(button)coordinate('credits');
  },true);
})();
`;
