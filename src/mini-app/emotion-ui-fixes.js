export const EMOTION_UI_FIXES_JS = String.raw`
;(function(){
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
  document.body.classList.add('emotion-highlight-ready');
  requestAnimationFrame(syncAll);
})();

;(function(){
  var minimumStars=80;
  var language='en';
  var supported={en:1,fa:1,ru:1,de:1,tr:1,ar:1,zh:1,ja:1,es:1,hi:1};
  var rateCopies={
    en:'1,000 credits = 12 Stars',
    fa:'هر ۱٬۰۰۰ کردیت = ۱۲ استار',
    ru:'1 000 кредитов = 12 звёзд',
    de:'1.000 Credits = 12 Stars',
    tr:'1.000 kredi = 12 Stars',
    ar:'١٬٠٠٠ رصيد = ١٢ نجمة',
    zh:'1,000 积分 = 12 Stars',
    ja:'1,000クレジット = 12 Stars',
    es:'1.000 créditos = 12 Stars',
    hi:'1,000 क्रेडिट = 12 Stars'
  };
  var minimumCopies={
    en:'Minimum purchase: 80 Stars',
    fa:'حداقل خرید: ۸۰ استار',
    ru:'Минимальная покупка: 80 звёзд',
    de:'Mindestkauf: 80 Stars',
    tr:'Minimum satın alma: 80 Stars',
    ar:'الحد الأدنى للشراء: ٨٠ نجمة',
    zh:'最低购买：80 Stars',
    ja:'最低購入額：80 Stars',
    es:'Compra mínima: 80 Stars',
    hi:'न्यूनतम खरीद: 80 Stars'
  };

  function normalizeLanguage(value){
    var clean=String(value||'en').trim().toLowerCase().split(/[-_]/)[0];
    return supported[clean]?clean:'en';
  }

  function telegramLanguage(){
    try{return normalizeLanguage(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initDataUnsafe&&window.Telegram.WebApp.initDataUnsafe.user&&window.Telegram.WebApp.initDataUnsafe.user.language_code)}catch(error){return'en'}
  }

  function syncCustomStarsMinimum(){
    var input=document.getElementById('customCreditsInput');
    var starsValue=document.getElementById('customStarsValue');
    var button=document.getElementById('customCreditsBuy');
    if(!input||!starsValue||!button)return;
    var credits=Math.min(1000000,Math.max(1,Math.floor(Number(input.value)||0)));
    var stars=Math.max(minimumStars,Math.ceil(credits*12/1000));
    var starsLabel=stars.toLocaleString('en-US')+' Stars';
    if(starsValue.textContent!==starsLabel)starsValue.textContent=starsLabel;
    var buttonLabel=button.querySelector('span');
    var buttonText='Continue with '+stars.toLocaleString('en-US')+' Stars';
    if(buttonLabel&&buttonLabel.textContent!==buttonText)buttonLabel.textContent=buttonText;
    var rate=document.querySelector('.credits-custom .credits-section-copy small');
    if(rate){
      var text=(rateCopies[language]||rateCopies.en)+' · '+(minimumCopies[language]||minimumCopies.en);
      if(rate.textContent!==text)rate.textContent=text;
    }
  }

  function scheduleSync(){requestAnimationFrame(syncCustomStarsMinimum)}

  language=telegramLanguage();
  var input=document.getElementById('customCreditsInput');
  var range=document.getElementById('customCreditsRange');
  var page=document.getElementById('creditsPage');
  var starsValue=document.getElementById('customStarsValue');
  if(input)input.addEventListener('input',scheduleSync);
  if(range)range.addEventListener('input',scheduleSync);
  if(page)new MutationObserver(scheduleSync).observe(page,{attributes:true,attributeFilter:['class']});
  if(starsValue)new MutationObserver(scheduleSync).observe(starsValue,{childList:true,subtree:true});
  scheduleSync();
})();
`;
