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

(function installAdminOnlyAiChatEntry(){
  var baseFetch=window.fetch.bind(window);

  function applyAdminState(value){
    var allowed=!!value;
    if(document.body)document.body.classList.toggle('ai-chat-admin',allowed);
    var button=document.getElementById('aiChatOpen');
    if(button)button.setAttribute('aria-hidden',allowed?'false':'true');
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
`;