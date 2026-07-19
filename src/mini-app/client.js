export const MINI_APP_JS = `
(function(){
  var tg=window.Telegram&&window.Telegram.WebApp;
  if(tg){try{tg.ready&&tg.ready()}catch(e){}}

  var selectedVoice='TX3LPaxmHKxFdv7VOQHJ';
  var initData=(tg&&tg.initData)||'';
  var lockTimer=null;
  var toastTimer=null;
  var activePreviewButton=null;
  var activePreviewVoice='';

  var uiStyle=document.createElement('style');
  uiStyle.textContent='.tts-generate{position:relative}.tts-generate.loading{color:transparent!important;opacity:1!important;cursor:wait}.tts-generate.loading::after{content:"";position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid rgba(5,5,5,.22);border-top-color:#050505;border-radius:50%;animation:generateButtonSpin .72s linear infinite}@keyframes generateButtonSpin{to{transform:rotate(360deg)}}.wave-play{position:relative;font-size:0!important;line-height:1}.wave-play::before{content:"";display:block;width:12px;height:12px;background:currentColor;clip-path:polygon(18% 5%,18% 95%,92% 50%);-webkit-clip-path:polygon(18% 5%,18% 95%,92% 50%);transform:translateX(1px)}.wave-play.is-playing::before{background:linear-gradient(90deg,currentColor 0 4px,transparent 4px 8px,currentColor 8px 12px);clip-path:none;-webkit-clip-path:none;transform:none}.voice-menu{padding-left:8px!important}.voice-option{grid-template-columns:36px minmax(0,1fr) 28px!important;overflow:visible!important}.voice-avatar{box-sizing:border-box!important;overflow:hidden!important;clip-path:circle(50% at 50% 50%);-webkit-clip-path:circle(50% at 50% 50%);transform:translateZ(0);margin-left:1px}';
  document.head.appendChild(uiStyle);

  function q(id){return document.getElementById(id)}
  function setText(id,value){var node=q(id);if(node)node.textContent=value}
  function toast(value){var node=q('toast');if(!node)return;node.textContent=value;node.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(function(){node.style.display='none'},3000)}
  function setKeyboardOpen(open){document.body.classList.toggle('keyboard-open',!!open)}
  function dismissKeyboard(){var active=document.activeElement;if(active&&typeof active.blur==='function')active.blur();setKeyboardOpen(false)}
  function setLimitSheet(open){var sheet=q('ttsLimitSheet');if(!sheet)return;sheet.classList.toggle('open',!!open);sheet.setAttribute('aria-hidden',open?'false':'true')}
  function updateTtsCharCount(){var input=q('ttsText');var counter=q('ttsCharCount');var flow=q('flow');var count=(input&&input.value||'').length;if(counter)counter.textContent=String(count)+' characters';if(flow)flow.classList.toggle('over-limit',count>1000)}
  function stopPreview(){var audio=q('voicePreviewAudio');if(audio){audio.pause();audio.removeAttribute('src');audio.load()}if(activePreviewButton){activePreviewButton.classList.remove('loading','playing')}activePreviewButton=null;activePreviewVoice=''}
  function setVoice(value,label){selectedVoice=value;setText('voiceLabel',label);document.querySelectorAll('.voice-select[data-voice]').forEach(function(option){option.classList.toggle('active',option.getAttribute('data-voice')===value)});var wrap=q('voiceWrap');if(wrap)wrap.classList.remove('open')}
  function setVoiceByName(name){var clean=String(name||'Nora').trim();var option=Array.prototype.slice.call(document.querySelectorAll('.voice-select[data-voice]')).filter(function(item){return String(item.getAttribute('data-voice-name')||'').trim().toLowerCase()===clean.toLowerCase()})[0];if(option){setVoice(option.getAttribute('data-voice'),option.getAttribute('data-voice-name')||clean);return}setText('voiceLabel',clean);document.querySelectorAll('.voice-select[data-voice]').forEach(function(item){item.classList.remove('active')})}
  function applyVoiceProfiles(profiles){profiles=profiles||{};document.querySelectorAll('.voice-option').forEach(function(row){var button=row.querySelector('.voice-select[data-voice-name]');var avatar=row.querySelector('.voice-avatar');if(!button||!avatar)return;var name=button.getAttribute('data-voice-name')||'';var url=profiles[name];if(url){avatar.style.backgroundImage='url("'+String(url).replace(/"/g,'%22')+'")';avatar.classList.add('has-image')}else{avatar.style.backgroundImage='';avatar.classList.remove('has-image')}})}
  function formatTime(seconds){var value=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0')}
  function setWavePlaying(playing){var button=q('wavePlay');if(!button)return;button.textContent='';button.classList.toggle('is-playing',!!playing);button.setAttribute('aria-label',playing?'Pause audio':'Play audio')}

  async function api(path,body){var response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({initData:initData},body||{}))});var data=await response.json().catch(function(){return{error:'Invalid response'}});if(!response.ok)throw new Error(data.error||'Request failed');return data}

  function showLocked(data){document.body.classList.add('is-locked');document.body.innerHTML='<main class="lock-screen"><section class="lock-card" aria-label="Mini app update"><p class="lock-title">Updating</p><div class="lock-bar" aria-hidden="true"><span id="lockFill"></span></div></section></main>';var fill=q('lockFill');var serverNow=Number(data.serverNow)||Math.floor(Date.now()/1000);var lockedUntil=Number(data.lockedUntil)||serverNow+60;var lockedFrom=Number(data.lockedFrom)||Math.max(serverNow,lockedUntil-60);var total=Math.max(1,lockedUntil-lockedFrom);var offset=serverNow-Date.now()/1000;function tick(){var now=Date.now()/1000+offset;var progress=Math.min(100,Math.max(0,(now-lockedFrom)/total*100));if(fill)fill.style.width=progress+'%';if(now>=lockedUntil){clearInterval(lockTimer);location.reload()}}tick();lockTimer=setInterval(tick,500)}

  async function load(){try{var data=await api('/mini-app/api/session',{});if(data.locked){showLocked(data);return}setVoiceByName(data.voice||'Nora');setText('balance',Number(data.balance||0).toLocaleString('en-US'));applyVoiceProfiles(data.voiceProfiles)}catch(error){toast(error.message)}}

  async function previewVoice(button){var voiceId=button.getAttribute('data-preview-voice')||'';var voiceName=button.getAttribute('data-preview-name')||'Voice';var audio=q('voicePreviewAudio');if(!voiceId||!audio)return;
    if(activePreviewButton===button&&activePreviewVoice===voiceId&&!audio.paused){audio.pause();return}
    stopPreview();
    activePreviewButton=button;activePreviewVoice=voiceId;button.classList.add('loading');
    try{var data=await api('/mini-app/api/voice-demo',{voice:voiceId});if(activePreviewButton!==button)return;audio.src='data:audio/mpeg;base64,'+data.audioBase64;button.classList.remove('loading');button.classList.add('playing');await audio.play()}catch(error){button.classList.remove('loading','playing');activePreviewButton=null;activePreviewVoice='';toast(error.message||('Could not play '+voiceName))}
  }

  async function generateTts(){var text=(q('ttsText')&&q('ttsText').value.trim())||'';if(!text)return toast('Type text first');if(text.length>1000){setLimitSheet(true);return}var button=q('convertButton');if(button){button.disabled=true;button.classList.add('loading');button.setAttribute('aria-label','Generating voice')}var audio=q('ttsAudio');var player=q('wavePlayer');if(player)player.classList.remove('show');if(audio){audio.pause();audio.removeAttribute('src');audio.load()}stopPreview();setWavePlaying(false);setText('waveTime','0:00');try{var data=await api('/mini-app/api/tts',{text:text,voice:selectedVoice});if(data.voice)setVoiceByName(data.voice);setText('balance',Number(data.balance||0).toLocaleString('en-US'));if(audio)audio.src='data:audio/mpeg;base64,'+data.audioBase64;if(player)player.classList.add('show')}catch(error){toast(error.message)}finally{if(button){button.disabled=false;button.classList.remove('loading');button.setAttribute('aria-label','Generate Voice')}}}

  function playTts(){var audio=q('ttsAudio');if(!audio||!audio.src)return toast('Generate voice first');stopPreview();if(audio.paused){audio.play().catch(function(error){toast(error.message)})}else audio.pause()}

  document.body.addEventListener('focusin',function(event){if(event.target&&event.target.id==='ttsText')setKeyboardOpen(true)});
  document.body.addEventListener('focusout',function(event){if(event.target&&event.target.id==='ttsText')setTimeout(function(){if(document.activeElement!==q('ttsText'))setKeyboardOpen(false)},80)});
  document.body.addEventListener('click',function(event){var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button){var wrap=q('voiceWrap');if(wrap)wrap.classList.remove('open');return}var action=button.getAttribute('data-action');if(action==='preview-voice'){event.preventDefault();event.stopPropagation();previewVoice(button);return}var voice=button.getAttribute('data-voice');if(voice){stopPreview();setVoice(voice,button.getAttribute('data-voice-name')||button.textContent||voice);return}if(action==='open-char-limit'){setLimitSheet(true);return}if(action==='close-char-limit'){setLimitSheet(false);return}if(action==='dismiss-keyboard'){dismissKeyboard();return}if(action==='toggle-voice'){var wrap=q('voiceWrap');if(wrap)wrap.classList.toggle('open');return}if(action==='generate-tts'){generateTts();return}if(action==='play-tts')playTts()});

  var input=q('ttsText');if(input)input.addEventListener('input',updateTtsCharCount);
  var audio=q('ttsAudio');if(audio){audio.addEventListener('play',function(){setWavePlaying(true)});audio.addEventListener('pause',function(){setWavePlaying(false)});audio.addEventListener('timeupdate',function(){setText('waveTime',formatTime(audio.currentTime))});audio.addEventListener('ended',function(){audio.currentTime=0;setWavePlaying(false);setText('waveTime','0:00')})}
  var previewAudio=q('voicePreviewAudio');if(previewAudio){previewAudio.addEventListener('pause',function(){if(activePreviewButton)activePreviewButton.classList.remove('playing')});previewAudio.addEventListener('play',function(){if(activePreviewButton)activePreviewButton.classList.add('playing')});previewAudio.addEventListener('ended',stopPreview)}
  setWavePlaying(false);updateTtsCharCount();load();
})();
`;