export const EMOTION_UI_FIXES_JS = String.raw`
;(function(){
  var telegramApp=window.Telegram&&window.Telegram.WebApp;
  if(telegramApp){
    try{
      telegramApp.setHeaderColor&&telegramApp.setHeaderColor('#000000');
      if(telegramApp.requestFullscreen&&(!telegramApp.isVersionAtLeast||telegramApp.isVersionAtLeast('8.0'))&&!telegramApp.isFullscreen)telegramApp.requestFullscreen();
    }catch(error){}
  }

  var trigger=document.getElementById('emotionButton');
  var player=document.getElementById('wavePlayer');
  if(trigger){
    trigger.innerHTML='<svg class="emotion-real-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.55"/><path d="M8.35 9.45c.45-.38.93-.56 1.45-.54M15.65 9.45c-.45-.38-.93-.56-1.45-.54" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><path d="M8.45 14.05c1.02 1.12 2.2 1.68 3.55 1.68s2.53-.56 3.55-1.68" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M18.65 3.55v2.7M17.3 4.9H20" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>';
    trigger.setAttribute('aria-label','Open emotion tags');
  }

  var panel=document.getElementById('emotionPanel');
  var panelHead=panel&&panel.querySelector('.emotion-head');
  if(panelHead)panelHead.remove();

  function syncPlayerState(){
    document.body.classList.toggle('emotion-audio-ready',!!(player&&player.classList.contains('show')));
  }
  if(player)new MutationObserver(syncPlayerState).observe(player,{attributes:true,attributeFilter:['class']});
  syncPlayerState();

  var overlays=[];
  function setOverlayDirection(entry,direction){
    if(entry.direction===direction)return;
    entry.overlay.setAttribute('dir',direction);
    entry.content.setAttribute('dir',direction);
    if(entry.direction&&entry.overlay.animate&&!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
      if(entry.directionAnimation)entry.directionAnimation.cancel();
      var offset=direction==='rtl'?'5px':'-5px';
      entry.directionAnimation=entry.overlay.animate([{opacity:.42,transform:'translate3d('+offset+',0,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:260,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    entry.direction=direction;
  }
  function render(entry){
    var input=entry.input;
    var content=entry.content;
    var value=String(input.value||'');
    var inputDirection=input.getAttribute('dir');
    var direction=value&&(inputDirection==='rtl'||inputDirection==='ltr')?inputDirection:(value?'auto':'ltr');
    var placeholder=String(input.getAttribute('placeholder')||'');
    var displayValue=value||placeholder;
    var parts=value?value.split(/(\[[^\]\r\n]{1,80}\])/g):[displayValue];
    content.textContent='';
    content.classList.toggle('placeholder',!value);
    parts.forEach(function(part){
      if(!part)return;
      if(/^\[[^\]\r\n]{1,80}\]$/.test(part)){
        var tag=document.createElement('span');
        tag.className='emotion-inline-tag';
        tag.textContent=part;
        content.appendChild(tag);
      }else content.appendChild(document.createTextNode(part));
    });
    if(value.endsWith('\n'))content.appendChild(document.createTextNode(' '));
    setOverlayDirection(entry,direction);
    requestAnimationFrame(function(){sync(entry)});
  }

  function sync(entry){
    if(!entry.input.isConnected)return;
    entry.overlay.style.left=entry.input.offsetLeft+'px';
    entry.overlay.style.top=entry.input.offsetTop+'px';
    entry.overlay.style.width=entry.input.offsetWidth+'px';
    entry.overlay.style.height=entry.input.offsetHeight+'px';
    entry.content.style.transform='translateY('+(-entry.input.scrollTop)+'px)';
  }

  function attach(input){
    if(!input||input.getAttribute('data-emotion-overlay')==='ready')return;
    input.setAttribute('data-emotion-overlay','ready');
    var overlay=document.createElement('div');
    overlay.className='emotion-text-overlay';
    overlay.setAttribute('aria-hidden','true');
    var content=document.createElement('div');
    content.className='emotion-text-content';
    overlay.appendChild(content);
    input.parentNode.insertBefore(overlay,input);
    var entry={input:input,overlay:overlay,content:content};
    overlays.push(entry);
    input.addEventListener('input',function(){render(entry)});
    input.addEventListener('scroll',function(){sync(entry)},{passive:true});
    input.addEventListener('focus',function(){sync(entry)});
    if(window.ResizeObserver)new ResizeObserver(function(){sync(entry)}).observe(input);
    render(entry);
  }

  function attachAll(){document.querySelectorAll('[data-dialogue-text]').forEach(attach)}
  function syncAll(){overlays=overlays.filter(function(entry){return entry.input.isConnected});overlays.forEach(sync)}
  attachAll();
  document.addEventListener('dialogue-turn-added',function(event){if(event.detail&&event.detail.input)attach(event.detail.input);else attachAll()});
  var editor=document.getElementById('dialogueEditor');
  if(editor)new MutationObserver(attachAll).observe(editor,{childList:true,subtree:true});
  window.addEventListener('resize',syncAll,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncAll,{passive:true});
    window.visualViewport.addEventListener('scroll',syncAll,{passive:true});
  }

  var creditWarningBuyLabels={
    'Not enough credits':'Buy credits',
    'اعتبار کافی نیست':'خرید کردیت',
    'Недостаточно кредитов':'Купить кредиты',
    'Nicht genügend Credits':'Credits kaufen',
    'Yetersiz kredi':'Kredi satın al',
    'الرصيد غير كافٍ':'شراء رصيد',
    '积分不足':'购买积分',
    'クレジットが足りません':'クレジット購入',
    'No tienes suficientes créditos':'Comprar créditos',
    'Credits कम हैं':'Credits खरीदें'
  };
  function syncCreditWarningUi(){
    var sheet=document.getElementById('ttsLimitSheet');
    var card=document.getElementById('ttsWarningCard');
    var button=document.getElementById('ttsWarningClose');
    var flow=document.getElementById('flow');
    if(!sheet||!card||!button||!flow)return;
    var isCreditWarning=sheet.classList.contains('open')&&flow.classList.contains('over-credits');
    card.classList.toggle('credit-warning-buy',isCreditWarning);
    button.classList.toggle('credit-warning-buy-button',isCreditWarning);
    if(!isCreditWarning)return;
    var title=document.getElementById('ttsWarningTitle');
    var titleText=String(title&&title.textContent||'').trim();
    var label=creditWarningBuyLabels[titleText]||(card.dir==='rtl'?'خرید کردیت':'Buy credits');
    button.textContent=label;
    button.setAttribute('aria-label',label);
  }
  var creditWarningSheet=document.getElementById('ttsLimitSheet');
  if(creditWarningSheet)new MutationObserver(syncCreditWarningUi).observe(creditWarningSheet,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('#ttsWarningClose.credit-warning-buy-button'):null;
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var sheet=document.getElementById('ttsLimitSheet');
    if(sheet){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true')}
    var creditPill=document.getElementById('creditPill');
    if(creditPill)creditPill.click();
  },true);

  document.body.classList.add('emotion-highlight-ready');
  requestAnimationFrame(function(){syncAll();syncCreditWarningUi()});
})();

;(function(){
  var FRAME_ID='vexaLiveInlineFrame';
  var STYLE_ID='vexaLiveKeyboardLockStyle';
  var BUTTON_ID='vexaLiveKeyboardDismiss';
  var boundFrame=null;
  var boundTextarea=null;
  var stableHeight=0;
  var closingTimer=0;
  var retryTimer=0;

  function liveWorkspaceOpen(){
    var workspace=document.getElementById('vexaLiveWorkspace');
    return !!(workspace&&workspace.getAttribute('aria-hidden')!=='true');
  }

  function frameHeight(frame){
    var value=0;
    try{value=Math.round(frame.getBoundingClientRect().height||frame.clientHeight||0)}catch(error){}
    if(!value)try{value=Math.round(document.documentElement.getBoundingClientRect().height||window.innerHeight||0)}catch(error){}
    return value>=320?value:0;
  }

  function lockParentViewport(frame){
    var height=frameHeight(frame);
    if(height)stableHeight=height;
    document.body.classList.add('keyboard-open','vexa-live-keyboard-open');
    document.body.classList.remove('keyboard-closing');
  }

  function setInnerHeight(doc,height){
    if(!doc||!height)return;
    doc.documentElement.style.setProperty('--vexa-live-stable-height',String(height)+'px');
    doc.documentElement.classList.add('vexa-live-layout-locked');
  }

  function clearInnerLock(doc){
    if(!doc)return;
    doc.documentElement.classList.remove('vexa-live-layout-locked');
    doc.documentElement.style.removeProperty('--vexa-live-stable-height');
    doc.body&&doc.body.classList.remove('vexa-live-keyboard-open','vexa-live-keyboard-closing');
  }

  function finishClose(frame){
    clearTimeout(closingTimer);
    closingTimer=0;
    document.body.classList.remove('keyboard-open','keyboard-closing','vexa-live-keyboard-open');
    var doc=null;
    try{doc=frame&&frame.contentDocument}catch(error){}
    clearInnerLock(doc);
    stableHeight=0;
  }

  function beginClose(frame){
    clearTimeout(closingTimer);
    document.body.classList.add('keyboard-closing');
    var doc=null;
    try{doc=frame&&frame.contentDocument}catch(error){}
    if(doc&&doc.body)doc.body.classList.add('vexa-live-keyboard-closing');
    closingTimer=setTimeout(function(){finishClose(frame)},320);
  }

  function dismiss(frame,textarea){
    var doc=null;
    try{doc=frame&&frame.contentDocument}catch(error){}
    beginClose(frame);
    try{
      var active=doc&&doc.activeElement;
      if(active&&typeof active.blur==='function')active.blur();
      else if(textarea&&typeof textarea.blur==='function')textarea.blur();
    }catch(error){}
    try{window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback&&window.Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(error){}
    setTimeout(function(){
      try{frame&&frame.contentWindow&&frame.contentWindow.scrollTo(0,0)}catch(error){}
    },40);
  }

  function installStyle(doc){
    if(doc.getElementById(STYLE_ID))return;
    var style=doc.createElement('style');
    style.id=STYLE_ID;
    style.textContent=
      'html.vexa-live-layout-locked,html.vexa-live-layout-locked body{height:var(--vexa-live-stable-height)!important;min-height:var(--vexa-live-stable-height)!important;max-height:var(--vexa-live-stable-height)!important;overflow:hidden!important}'+
      'html.vexa-live-layout-locked .live-app,html.vexa-live-layout-locked .vexa-stt{height:var(--vexa-live-stable-height)!important;min-height:var(--vexa-live-stable-height)!important;max-height:var(--vexa-live-stable-height)!important;overflow:hidden!important}'+
      'html.vexa-live-layout-locked .vexa-stt-controls{position:absolute!important;bottom:calc(16px + env(safe-area-inset-bottom))!important}'+
      '.vexa-live-keyboard-dismiss{position:fixed;right:22px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:30;width:42px;height:42px;border-radius:15px;border:0;background:rgba(13,13,13,.62);color:#fff;display:grid;place-items:center;padding:0;opacity:0;transform:translateY(12px) scale(.92);pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.2,1),background .2s ease,box-shadow .2s ease}'+
      'body.vexa-live-keyboard-open .vexa-live-keyboard-dismiss,body.vexa-live-keyboard-closing .vexa-live-keyboard-dismiss{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}'+
      'body.vexa-live-keyboard-open .vexa-live-keyboard-dismiss svg{animation:vexaLiveKeyboardArrow .95s ease-in-out infinite}'+
      '@keyframes vexaLiveKeyboardArrow{0%,100%{transform:translateY(-1px)}50%{transform:translateY(4px)}}';
    doc.head.appendChild(style);
  }

  function installButton(frame,doc,textarea){
    var button=doc.getElementById(BUTTON_ID);
    if(!button){
      button=doc.createElement('button');
      button.id=BUTTON_ID;
      button.className='vexa-live-keyboard-dismiss';
      button.type='button';
      button.setAttribute('aria-label','Hide keyboard');
      button.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      (doc.body||doc.documentElement).appendChild(button);
      button.addEventListener('pointerdown',function(event){event.preventDefault()});
      button.addEventListener('click',function(event){event.preventDefault();dismiss(frame,textarea)});
    }
    return button;
  }

  function onFocus(frame,doc){
    clearTimeout(closingTimer);
    lockParentViewport(frame);
    setInnerHeight(doc,stableHeight||frameHeight(frame));
    doc.body.classList.remove('vexa-live-keyboard-closing');
    doc.body.classList.add('vexa-live-keyboard-open');
  }

  function onBlur(frame,doc){
    clearTimeout(closingTimer);
    closingTimer=setTimeout(function(){
      var active=null;
      try{active=doc.activeElement}catch(error){}
      if(active&&active.id==='vexaSttText')return;
      finishClose(frame);
    },320);
  }

  function bind(frame){
    if(!frame||!frame.isConnected)return;
    var doc=null;
    try{doc=frame.contentDocument}catch(error){}
    if(!doc||!doc.body){scheduleBind(frame);return}
    var textarea=doc.getElementById('vexaSttText');
    if(!textarea){scheduleBind(frame);return}
    installStyle(doc);
    installButton(frame,doc,textarea);
    if(boundFrame===frame&&boundTextarea===textarea)return;
    boundFrame=frame;
    boundTextarea=textarea;
    textarea.addEventListener('focus',function(){onFocus(frame,doc)});
    textarea.addEventListener('blur',function(){onBlur(frame,doc)});
    var viewport=null;
    try{viewport=frame.contentWindow&&frame.contentWindow.visualViewport}catch(error){}
    if(viewport){
      viewport.addEventListener('resize',function(){
        if(!doc.body.classList.contains('vexa-live-keyboard-open'))return;
        var current=Number(viewport.height||0);
        if(stableHeight&&current>=stableHeight*.9&&!textarea.matches(':focus'))finishClose(frame);
      },{passive:true});
    }
  }

  function scheduleBind(frame){
    clearTimeout(retryTimer);
    retryTimer=setTimeout(function(){bind(frame||document.getElementById(FRAME_ID))},80);
  }

  function discover(){
    var frame=document.getElementById(FRAME_ID);
    if(!frame)return;
    if(frame.getAttribute('data-vexa-keyboard-watch')!=='1'){
      frame.setAttribute('data-vexa-keyboard-watch','1');
      frame.addEventListener('load',function(){scheduleBind(frame)});
    }
    scheduleBind(frame);
  }

  new MutationObserver(function(){
    discover();
    if(!liveWorkspaceOpen()&&boundFrame)finishClose(boundFrame);
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-hidden']});
  window.addEventListener('resize',function(){if(!document.body.classList.contains('vexa-live-keyboard-open'))discover()},{passive:true});
  discover();
})();
`;
