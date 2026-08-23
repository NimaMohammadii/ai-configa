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
    'Not enough USD balance':'Add USD balance',
    'موجودی دلاری کافی نیست':'افزایش موجودی دلاری',
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
    var label=creditWarningBuyLabels[titleText]||(card.dir==='rtl'?'افزایش موجودی دلاری':'Add USD balance');
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
`;
