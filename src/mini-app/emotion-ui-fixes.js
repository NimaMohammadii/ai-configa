export const EMOTION_UI_FIXES_JS = String.raw`
;(function(){
  var input=document.getElementById('ttsText');
  var trigger=document.getElementById('emotionButton');
  var player=document.getElementById('wavePlayer');
  if(!input||!trigger)return;

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

  var overlay=document.createElement('div');
  overlay.className='emotion-text-overlay';
  overlay.setAttribute('aria-hidden','true');
  var content=document.createElement('div');
  content.className='emotion-text-content';
  overlay.appendChild(content);
  input.parentNode.insertBefore(overlay,input);
  document.body.classList.add('emotion-highlight-ready');

  function syncOverlayBox(){
    overlay.style.left=input.offsetLeft+'px';
    overlay.style.top=input.offsetTop+'px';
    overlay.style.width=input.offsetWidth+'px';
    overlay.style.height=input.offsetHeight+'px';
    content.style.transform='translateY('+(-input.scrollTop)+'px)';
  }

  function renderHighlightedText(){
    var value=String(input.value||'');
    var parts=value.split(/(\[[^\]\r\n]{1,80}\])/g);
    content.textContent='';
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
    syncOverlayBox();
  }

  input.addEventListener('input',renderHighlightedText);
  input.addEventListener('scroll',syncOverlayBox,{passive:true});
  input.addEventListener('focus',syncOverlayBox);
  window.addEventListener('resize',syncOverlayBox,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncOverlayBox,{passive:true});
    window.visualViewport.addEventListener('scroll',syncOverlayBox,{passive:true});
  }
  requestAnimationFrame(renderHighlightedText);
})();
`;
