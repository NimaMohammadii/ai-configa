export const EMOTION_UI_FIXES_JS = String.raw`
;(function(){
  var trigger=document.getElementById('emotionButton');
  var player=document.getElementById('wavePlayer');
  if(!trigger)return;

  trigger.innerHTML='<svg class="emotion-real-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.55"/><path d="M8.35 9.45c.45-.38.93-.56 1.45-.54M15.65 9.45c-.45-.38-.93-.56-1.45-.54" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><path d="M8.45 14.05c1.02 1.12 2.2 1.68 3.55 1.68s2.53-.56 3.55-1.68" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M18.65 3.55v2.7M17.3 4.9H20" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>';
  trigger.setAttribute('aria-label','Open emotion tags');

  var panel=document.getElementById('emotionPanel');
  var panelHead=panel&&panel.querySelector('.emotion-head');
  if(panelHead)panelHead.remove();

  function syncPlayerState(){
    document.body.classList.toggle('emotion-audio-ready',!!(player&&player.classList.contains('show')));
  }
  if(player)new MutationObserver(syncPlayerState).observe(player,{attributes:true,attributeFilter:['class']});
  syncPlayerState();

  var overlays=[];
  function render(entry){
    var input=entry.input;
    var content=entry.content;
    var value=String(input.value||'');
    var placeholder=String(input.getAttribute('placeholder')||'');
    var displayValue=value||placeholder;
    var parts=value.split(/(\[[^\]\r\n]{1,80}\])/g);
    if(!value)parts=displayValue.split(/(\[[^\]\r\n]{1,80}\])/g);
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
`;
