import { VOICE_NAMES, VOICES } from "../voices.js";

const VOICE_LIBRARY_NAMES = [
  ...VOICE_NAMES.slice(0, 3),
  ...VOICE_NAMES.slice(-15),
  ...VOICE_NAMES.slice(3, -15),
];

const VOICE_ROWS = VOICE_NAMES.map((name) => {
  const voiceId = VOICES[name];
  return `<div class="voice-option" data-voice-row="${voiceId}" data-voice-row-name="${name}"><span class="voice-avatar" aria-hidden="true"><span class="voice-avatar-image"></span></span><button class="voice-select${name === "Liam" ? " active" : ""}" data-voice="${voiceId}" data-voice-name="${name}" type="button"><span>${name}</span></button><button class="voice-preview" data-action="preview-voice" data-preview-voice="${voiceId}" data-preview-name="${name}" type="button" aria-label="Hear ${name}"><span class="voice-preview-icon">▶</span></button></div>`;
}).join("");

const VOICE_DESCRIPTIONS = {
  Liam: "Warm, calm and naturally conversational",
  Noah: "Deep, steady and quietly confident",
  Ava: "Bright, clear and effortlessly friendly",
  Nora: "Soft, expressive and emotionally warm",
  Alex: "Balanced, modern and highly versatile",
  Ella: "Gentle, polished and naturally elegant",
  Chloe: "Youthful, lively and full of character",
  Alexandra: "Smooth, refined and professionally composed",
  Laura: "Warm, reassuring and easy to listen to",
  Maxon: "Bold, cinematic and naturally powerful",
  Jessica: "Clear, upbeat and confidently engaging",
  Austin: "Relaxed, authentic and conversational",
  priyanka: "Rich, expressive and beautifully melodic",
  horatius: "Deep, dramatic and storyteller-like",
  Nova: "Modern, energetic and distinctly bright",
  James: "Mature, grounded and professionally calm",
  Xavier: "Confident, smooth and cinematic",
  Lucas: "Natural, friendly and gently expressive",
  Lana: "Soft, intimate and emotionally detailed",
  Amanda: "Warm, polished and naturally inviting",
  Scarlett: "Elegant, vivid and full of emotion",
  Aurora: "Airy, calming and softly cinematic",
  Allison: "Clear, composed and professionally warm",
  Mason: "Strong, relaxed and naturally trustworthy",
  Aria: "Fresh, bright and emotionally magnetic",
  Selena: "Elegant, intimate and softly premium",
  Vespera: "Cinematic mystery with a rare, velvet edge",
  Elara: "Radiant, crisp and full of modern charm",
  Atlas: "Bold, grounded and commandingly modern",
  Mira: "Tender, honest and warmly memorable",
  Zoya: "Playful, colorful and instantly engaging",
  Kiara: "Trendy, sparkling and emotionally close",
  Orion: "Deep, futuristic and unmistakably bold",
  Ryder: "Stylish, energetic and confidently bold",
  Lyra: "Trendy, bright and softly expressive",
  Zane: "Cool, crisp and confidently modern",
  Knox: "Deep, sleek and naturally magnetic",
  Jaxon: "Urban, energetic and full of attitude",
  Ace: "Sharp, bold and made for punchy lines",
  Cruz: "Smooth, warm and casually confident",
  Neo: "Fresh, futuristic and cleanly expressive",
  Skye: "Dreamy, youthful and emotionally clear",
  Kairo: "Deep, stylish and instantly premium",
  Sia: "Good for conversation; warm, natural and easygoing",
  Milo: "Good for conversation; relaxed, friendly and natural",
  Rhea: "Good for conversation; soft, expressive and relatable",
  June: "Bright, friendly and naturally personal",
  Ivy: "Light, close and warmly memorable",
  Rowan: "Modern, focused and confidently clear",
  Hazel: "Gentle, airy and softly emotional",
  Octavia: "Rare cinematic mystery with dramatic depth",
  Leo: "Energetic, agile and sharply expressive",
  Marina: "Dreamy softness with a floating, intimate tone",
  Esme: "Fresh, bright and smilingly expressive",
  Darius: "Narration voice; steady, clear and grounded",
  Beckett: "Narration voice; thoughtful, calm and articulate",
  Silas: "Narration voice; composed, strong and precise",
  Morgan: "Versatile narration and social voice with smooth flow",
  Quinn: "Social voice; playful, punchy and effortlessly current",
  Isla: "Social voice; lively, close and instantly engaging",
  Dante: "Social voice; bold, direct and stylish",
  Stella: "Social voice; upbeat, crisp and shareable",
  Griffin: "Grounded, polished and attention-holding",
  Ronan: "Low, calm and naturally trustworthy",
  Aurelius: "Cinematic shimmer with a luminous premium feel",
};

const VOICE_LIBRARY_CARDS = VOICE_LIBRARY_NAMES.map((name) => {
  const voiceId = VOICES[name];
  return `<article class="voice-library-card" data-library-voice="${voiceId}" data-library-name="${name}"><button class="voice-library-main" data-action="select-library-voice" data-voice="${voiceId}" data-voice-name="${name}" type="button"><span class="voice-library-avatar" aria-hidden="true"></span><span class="voice-library-copy"><span class="voice-library-name"><strong>${name}</strong><em class="voice-library-state">Add</em></span><small class="voice-library-description">${VOICE_DESCRIPTIONS[name] || "Natural, expressive and versatile"}</small></span></button><div class="voice-library-actions"><button class="voice-library-preview" data-action="preview-voice" data-preview-voice="${voiceId}" data-preview-name="${name}" type="button" aria-label="Hear ${name}"><span class="voice-preview-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.15 5.95c-.86-.54-1.97.08-1.97 1.1v9.9c0 1.02 1.11 1.64 1.97 1.1l7.92-4.95a1.3 1.3 0 0 0 0-2.2L8.15 5.95Z" fill="currentColor"/></svg></span></button><button class="voice-library-save" data-action="toggle-saved-voice" data-voice="${voiceId}" data-voice-name="${name}" type="button" aria-label="Add ${name}"><span class="voice-save-plus" aria-hidden="true"></span><span class="voice-save-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7.5 8.25h9l-.5 9.1a1.8 1.8 0 0 1-1.8 1.7H9.8a1.8 1.8 0 0 1-1.8-1.7l-.5-9.1Z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/><path d="M6 5.85h12M9.4 5.85V4.9c0-.75.6-1.35 1.35-1.35h2.5c.75 0 1.35.6 1.35 1.35v.95M10.3 11.1v4.75M13.7 11.1v4.75" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg></span></button></div></article>`;
}).join("");

const LIQUID_METAL_RUNTIME = String.raw`<script>
(function(){
  var mounts=new WeakMap();
  var libraryPromise=null;

  function loadLibrary(){
    if(!libraryPromise){
      libraryPromise=import('https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.80/+esm').then(function(library){
        if(!library||!library.ShaderMount||!library.liquidMetalFragmentShader)throw new Error('Liquid Metal shader unavailable');
        return library;
      });
    }
    return libraryPromise;
  }

  function ensureStyles(doc){
    if(!doc||!doc.head||doc.getElementById('vexaLiquidMetalStyles'))return;
    var style=doc.createElement('style');
    style.id='vexaLiquidMetalStyles';
    style.textContent=[
      'button.vexa-liquid-metal-button{--vexa-lm-ring:2px;position:relative!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;overflow:visible!important;border-radius:100px!important;color:#666!important;font-size:14px!important;font-weight:400!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;opacity:1!important;transform:none!important;perspective:1000px!important;perspective-origin:50% 50%!important;transform-style:preserve-3d!important;isolation:isolate!important}',
      'button.vexa-liquid-metal-button#convertButton,button.vexa-liquid-metal-button#generateImageButton{--vexa-lm-ring:1.5px;width:100%!important;min-width:0!important;max-width:none!important;align-self:stretch!important;margin:0!important;padding:0!important;cursor:pointer!important;perspective:none!important;transform-style:flat!important;font-weight:560!important;letter-spacing:-.01em!important}',
      'button.vexa-liquid-metal-button#convertButton{height:42px!important;min-height:42px!important;max-height:42px!important;flex:0 0 42px!important}',
      'button.vexa-liquid-metal-button#generateImageButton{height:46px!important;min-height:46px!important;max-height:46px!important;flex:0 0 46px!important}',
      'button.vexa-liquid-metal-button.empty,button.vexa-liquid-metal-button:disabled{opacity:1!important}',
      'button.vexa-liquid-metal-button:active{transform:none!important}',
      'button.vexa-liquid-metal-button::before{content:none!important;display:none!important}',
      'button.vexa-liquid-metal-button>.vexa-lm-shader-layer,button.vexa-liquid-metal-button>.vexa-lm-inner-layer,button.vexa-liquid-metal-button>.vexa-lm-ripple-layer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;transform-style:preserve-3d!important}',
      'button.vexa-liquid-metal-button>.vexa-lm-shader-layer{z-index:10!important;transform:translateZ(0) translateY(0) scale(1)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important}',
      'button.vexa-liquid-metal-button>.vexa-lm-inner-layer{z-index:20!important;transform:translateZ(10px) translateY(0) scale(1)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important}',
      'button.vexa-liquid-metal-button>.vexa-lm-ripple-layer{z-index:40!important;border-radius:100px!important;overflow:hidden!important}',
      'button.vexa-liquid-metal-button>:not(.vexa-lm-shader-layer):not(.vexa-lm-inner-layer):not(.vexa-lm-ripple-layer){position:relative!important;z-index:30!important;translate:0 0 20px;color:#666!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important}',
      'button.vexa-liquid-metal-button#convertButton>:not(.vexa-lm-shader-layer):not(.vexa-lm-inner-layer):not(.vexa-lm-ripple-layer),button.vexa-liquid-metal-button#generateImageButton>:not(.vexa-lm-shader-layer):not(.vexa-lm-inner-layer):not(.vexa-lm-ripple-layer){font-weight:560!important;letter-spacing:-.01em!important;text-shadow:none!important}',
      'button.vexa-liquid-metal-button .vexa-lm-inner{position:absolute!important;inset:var(--vexa-lm-ring)!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease,box-shadow .15s cubic-bezier(.4,0,.2,1)!important}',
      'button.vexa-liquid-metal-button .vexa-lm-shader-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:100px!important;background:linear-gradient(180deg,#b4b4b4 0%,#707070 46%,#303030 100%)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease,box-shadow .15s cubic-bezier(.4,0,.2,1)!important;overflow:hidden!important}',
      'button.vexa-liquid-metal-button .vexa-lm-shader-host{position:absolute!important;inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;transition:width .4s ease,height .4s ease!important}',
      'button.vexa-liquid-metal-button .vexa-lm-shader-host canvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border-radius:100px!important}',
      'button.vexa-liquid-metal-button.vexa-lm-hover .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed>.vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed>.vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}',
      '.vexa-lm-ripple{position:absolute!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important}',
      'button.vexa-liquid-metal-button.tts-generate .tts-generate-wave i{background:#666!important}',
      'button.vexa-liquid-metal-button.tts-generate .tts-generate-wave{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 72%,transparent 100%)!important;mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 72%,transparent 100%)!important}',
      'button.vexa-liquid-metal-button.tts-generate .tts-generate-wave::before,button.vexa-liquid-metal-button.tts-generate .tts-generate-wave::after{display:none!important}',
      'button.vexa-liquid-metal-button.image-generate.loading>:not(.vexa-lm-shader-layer):not(.vexa-lm-inner-layer):not(.vexa-lm-ripple-layer){opacity:0!important}',
      'button.vexa-liquid-metal-button.image-generate.loading::after{z-index:35!important;border:2px solid rgba(102,102,102,.28)!important;border-top-color:#666!important}',
      'button.vexa-liquid-metal-button.vexa-stt-record .vexa-stt-stop-shape{background:#666!important}',
      '.vexa-stt.processing button.vexa-liquid-metal-button.vexa-stt-record::after{z-index:30!important;color:#666!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important}',
      '@keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}'
    ].join('');
    doc.head.appendChild(style);
  }

  function layer(doc,className){
    var node=doc.createElement('span');
    node.className=className;
    node.setAttribute('aria-hidden','true');
    return node;
  }

  function mount(button){
    if(!button||mounts.has(button))return;
    mounts.set(button,{pending:true});
    loadLibrary().then(function(library){
      if(!button.isConnected){mounts.delete(button);return}
      var doc=button.ownerDocument;
      var view=doc.defaultView||window;
      ensureStyles(doc);
      var shaderLayer=layer(doc,'vexa-lm-shader-layer');
      var shaderFrame=layer(doc,'vexa-lm-shader-frame');
      var shaderHost=layer(doc,'vexa-lm-shader-host');
      var innerLayer=layer(doc,'vexa-lm-inner-layer');
      var inner=layer(doc,'vexa-lm-inner');
      var rippleLayer=layer(doc,'vexa-lm-ripple-layer');
      shaderFrame.appendChild(shaderHost);
      shaderLayer.appendChild(shaderFrame);
      innerLayer.appendChild(inner);
      button.appendChild(shaderLayer);
      button.appendChild(innerLayer);
      button.appendChild(rippleLayer);
      button.classList.add('vexa-liquid-metal-button');

      var shaderMount=new library.ShaderMount(shaderHost,library.liquidMetalFragmentShader,{
        u_repetition:1,
        u_softness:.5,
        u_shiftRed:.3,
        u_shiftBlue:.3,
        u_distortion:0,
        u_contour:0,
        u_angle:45,
        u_scale:8,
        u_shape:0,
        u_offsetX:.1,
        u_offsetY:-.1
      },undefined,.3);
      mounts.set(button,{mount:shaderMount});
      var motionSpeed=.3;
      var speedRaf=0;
      function setMotionSpeed(target,duration){
        if(!shaderMount||!shaderMount.setSpeed)return;
        if(speedRaf)view.cancelAnimationFrame(speedRaf);
        var from=motionSpeed;
        var start=view.performance&&view.performance.now?view.performance.now():Date.now();
        var span=Math.max(0,Number(duration)||0);
        if(!span){motionSpeed=target;shaderMount.setSpeed(target);return}
        function step(now){
          var progress=Math.min(1,(now-start)/span);
          var eased=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
          motionSpeed=from+(target-from)*eased;
          shaderMount.setSpeed(motionSpeed);
          if(progress<1)speedRaf=view.requestAnimationFrame(step);else speedRaf=0;
        }
        speedRaf=view.requestAnimationFrame(step);
      }

      button.addEventListener('mouseenter',function(){
        button.classList.add('vexa-lm-hover');
        setMotionSpeed(.4,220);
      });
      button.addEventListener('mouseleave',function(){
        button.classList.remove('vexa-lm-hover','vexa-lm-pressed');
        setMotionSpeed(.3,260);
      });
      button.addEventListener('pointerdown',function(){
        if(!button.disabled)button.classList.add('vexa-lm-pressed');
      });
      function release(){button.classList.remove('vexa-lm-pressed')}
      button.addEventListener('pointerup',release);
      button.addEventListener('pointercancel',release);
      button.addEventListener('click',function(event){
        if(button.disabled)return;
        setMotionSpeed(.75,180);
        setTimeout(function(){
          setMotionSpeed(button.classList.contains('vexa-lm-hover')?.4:.3,320);
        },300);
        var rect=button.getBoundingClientRect();
        var ripple=layer(doc,'vexa-lm-ripple');
        var x=Number(event.clientX),y=Number(event.clientY);
        ripple.style.left=String(Number.isFinite(x)&&x>0?x-rect.left:rect.width/2)+'px';
        ripple.style.top=String(Number.isFinite(y)&&y>0?y-rect.top:rect.height/2)+'px';
        rippleLayer.appendChild(ripple);
        setTimeout(function(){if(ripple.parentNode)ripple.remove()},600);
      });
    }).catch(function(error){
      mounts.delete(button);
      console.error('[Vexa] Liquid Metal unavailable',error);
    });
  }

  window.vexaMountLiquidMetalButton=mount;
  mount(document.getElementById('convertButton'));
  mount(document.getElementById('generateImageButton'));

  document.addEventListener('load',function(event){
    var frame=event.target;
    if(!frame||frame.tagName!=='IFRAME')return;
    setTimeout(function(){
      try{
        var doc=frame.contentDocument;
        var record=doc&&doc.getElementById('vexaSttRecord');
        if(record)mount(record);
      }catch(error){}
    },0);
  },true);
})();
</script>`;

export const MINI_APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <meta name="theme-color" content="#000000"/>
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
  <meta http-equiv="Pragma" content="no-cache"/>
  <meta http-equiv="Expires" content="0"/>
  <title>Vexa Voice</title>
  <link rel="stylesheet" href="/mini-app/styles.css?v=20260813-wheel-layout-2"/>
  <style>
    .credits-page{--ticket-glass-bg:rgba(13,13,13,.62);--ticket-glass-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)}
    .credits-page .credits-payment-switch,.credits-page .credits-custom,.credits-page .credits-pack,.credits-page .credits-amount-field,.credits-page .toman-card,.credits-page .toman-receipt-picker,.credits-page .toman-upload-icon,.credits-page .toman-back{border:0;background:var(--ticket-glass-bg);box-shadow:var(--ticket-glass-shadow);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12)}
    .credits-page .credits-payment-switch,.credits-page .credits-custom,.credits-page .credits-pack,.credits-page .credits-amount-field,.credits-page .toman-card,.credits-page .toman-receipt-picker{border-radius:16px}
    .credits-page .toman-upload-icon,.credits-page .toman-back{border-radius:13px}
    .credits-page .credits-amount-field{padding:0 14px}
    .credits-page .credits-pack:active,.credits-page .toman-card:active,.credits-page .toman-receipt-picker:active,.credits-page .toman-back:active,.credits-page .credits-amount-field:focus-within{background:rgba(255,255,255,.105);box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.07),0 5px 14px rgba(0,0,0,.2)}
    .explore-page-head,.voices-page-head{box-shadow:0 -140px 0 140px #000}
  </style>
</head>
<body>
  <main class="app">
    <section id="flow" class="view active">
      <div class="tts-page">
        <div class="tts-head">
          <div class="credit-tools"><div id="creditPill" class="credit-pill" role="button" tabindex="0" aria-label="Add USD balance"><span id="balance">—</span><span>USD</span></div><span id="editModeIndicator" class="edit-mode-indicator" aria-hidden="true">EDIT MODE</span></div>
          <div class="mode-tools"><div id="voiceWrap" class="voice-wrap">
            <button class="voice-btn" data-action="toggle-voice" type="button">
              <span id="voiceButtonAvatar" class="voice-button-avatar" aria-hidden="true"></span>
              <span id="voiceLabel">Liam</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="voice-menu"><div id="myVoiceRows" class="my-voice-rows">${VOICE_ROWS}</div><div id="myVoicesEmpty" class="my-voices-empty">Add voices to your list</div><button class="voice-library-open" data-action="open-voices-page" type="button"><span>Voices</span><small id="voiceMenuCount">1 / 6</small><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
          </div><button id="aiChatOpen" class="mode-toggle ai-chat-open-button" data-action="open-ai-chat" type="button" aria-label="Open AI chat"><canvas id="aiChatButtonOrb" width="48" height="48" aria-hidden="true"></canvas></button><button id="modeToggle" class="mode-toggle" data-action="toggle-creation-mode" type="button" aria-label="Switch to image creation" aria-pressed="false"><svg class="mode-image-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.25" y="4.25" width="17.5" height="15.5" rx="4.25" stroke="currentColor" stroke-width="1.7"/><circle cx="8.3" cy="9" r="1.55" stroke="currentColor" stroke-width="1.55"/><path d="m5.8 17 4.15-4.15a1.4 1.4 0 0 1 1.98 0l1.55 1.55 1.25-1.25a1.4 1.4 0 0 1 1.98 0L19 15.45" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.2 2.7v3M16.7 4.2h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><svg class="mode-voice-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.2" y="3" width="7.6" height="12" rx="3.8" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button></div>
        </div>
        <div class="tts-area dialogue-editor" id="dialogueEditor">
          <section class="dialogue-turn active" data-dialogue-turn data-dialogue-id="1" data-voice="${VOICES.Liam}" data-voice-name="Liam">
            <div class="dialogue-speaker-row">
              <button class="dialogue-speaker" data-action="select-dialogue-speaker" type="button" aria-label="Change speaker voice">
                <span class="dialogue-speaker-avatar" data-dialogue-avatar aria-hidden="true"></span>
                <span class="dialogue-speaker-name" data-dialogue-voice-label>Liam</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 9.5 12 14l5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="dialogue-remove" data-action="remove-speaker" type="button" aria-label="Remove speaker"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <div class="dialogue-input-wrap">
              <textarea id="ttsText" class="dialogue-text" data-dialogue-text dir="auto" placeholder="Type your text… Add emotion tags like [laughs] or [whispering]"></textarea>
            </div>
            <button class="add-speaker" data-action="add-speaker" type="button"><span aria-hidden="true"></span><strong>+ Add speaker</strong><span aria-hidden="true"></span></button>
          </section>
        </div>
        <button class="keyboard-dismiss" data-action="dismiss-keyboard" type="button" aria-label="Hide keyboard"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="tts-bottom">
          <div class="player-history-row">
            <div id="wavePlayer" class="wave-player">
            <button id="wavePlay" class="wave-play" data-action="play-tts" type="button" aria-label="Play audio"><span class="wave-play-shape" aria-hidden="true"><svg class="wave-play-icon" viewBox="0 0 24 24" style="stroke:none"><path d="M6.2 2.8C4.7 1.9 2.8 3 2.8 4.75v14.5c0 1.75 1.9 2.85 3.4 1.95l13.8-8.1c1.6-.95 1.6-1.25 0-2.2z"/></svg><span class="wave-pause-icon"><i></i><i></i></span></span></button>
            <div class="wave-player-body"><div id="waveSeekWrap" class="wave-seek" style="--wave-progress:0%"><svg class="wave-svg wave-svg-base" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"><rect x="2.0" y="15.0" width="3.2" height="14" rx="1.6"/><rect x="9.6" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="17.2" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="24.8" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="32.4" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="40.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="47.6" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="55.2" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="62.8" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="70.4" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="78.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="85.6" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="93.2" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="100.8" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="108.4" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="116.0" y="3.0" width="3.2" height="38" rx="1.6"/><rect x="123.6" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="131.2" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="138.8" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="146.4" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="154.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="161.6" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="169.2" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="176.8" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="184.4" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="192.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="199.6" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="207.2" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="214.8" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="222.4" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="230.0" y="15.0" width="3.2" height="14" rx="1.6"/></svg><input id="waveSeek" class="wave-range" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek audio" disabled/><div class="wave-meta" aria-hidden="true"><span class="wave-time" id="waveTime">0:00</span></div></div>
            </div>
            <div class="wave-actions"><button id="waveShare" class="wave-share" data-action="share-tts" type="button" aria-label="Share audio"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13.5v4A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button id="waveFineTune" class="wave-fine-tune" data-action="open-audio-editor" type="button" aria-label="Fine-tune audio" disabled><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.25h9.5M17.5 8.25H20M4 15.75h2.5M10.5 15.75H20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="15.5" cy="8.25" r="2" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="15.75" r="2" stroke="currentColor" stroke-width="2"/></svg></button><button id="ttsEditButton" class="tts-edit-button" data-action="edit-tts" type="button" aria-label="Edit generated voice" aria-disabled="true" disabled><svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 19 1-4.25L15.8 4.9a2.15 2.15 0 0 1 3.05 0l.25.25a2.15 2.15 0 0 1 0 3.05L9.25 18 5 19Z" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"/><path d="m14.45 6.25 3.3 3.3M6.05 14.75 9.25 18" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
            </div>
          </div>
          <section id="ttsAudioEditor" class="tts-audio-editor" aria-hidden="true">
            <header class="tts-audio-editor-head"><div><strong>Fine tune</strong><span id="ttsAudioSelectionTime">0:00 — 0:00</span></div><button data-action="close-audio-editor" type="button" aria-label="Close audio editor"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg></button></header>
            <div class="tts-audio-timeline-shell">
              <div id="ttsAudioTimeline" class="tts-audio-timeline" aria-label="Audio clip timeline">
                <div id="ttsAudioClipLane" class="tts-audio-clip-lane"></div>
                <div id="ttsAudioPlayhead" class="tts-audio-playhead" aria-hidden="true"><i></i></div>
              </div>
              <i class="tts-audio-edge-fade start" aria-hidden="true"></i>
              <i class="tts-audio-edge-fade end" aria-hidden="true"></i>
            </div>
            <div class="tts-audio-editor-actions">
              <div class="tts-audio-editor-tools">
                <button id="ttsAudioUndo" data-action="undo-audio-edit" type="button" aria-label="Undo" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8H5V4M5.4 8.1A8 8 0 1 1 4.2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                <button id="ttsAudioPreview" data-action="preview-audio-edit" type="button" aria-label="Preview edit"><svg class="play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.15 5.8c-.92-.57-2.1.1-2.1 1.18v10.04c0 1.08 1.18 1.75 2.1 1.18l8.18-5.02a1.38 1.38 0 0 0 0-2.36L8.15 5.8Z" fill="currentColor" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg><svg class="pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.75" y="4.25" width="4.75" height="15.5" rx="2.375" fill="currentColor"/><rect x="13.5" y="4.25" width="4.75" height="15.5" rx="2.375" fill="currentColor"/></svg></button>
                <button id="ttsAudioRedo" data-action="redo-audio-edit" type="button" aria-label="Redo" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 8h4V4m-.4 4.1A8 8 0 1 0 19.8 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              </div>
              <div class="tts-audio-editor-operations">
                <button id="ttsAudioSplit" data-action="split-audio-edit" type="button">Split</button>
                <button id="ttsAudioTrim" data-action="trim-audio-edit" type="button">Trim</button>
                <button id="ttsAudioDelete" data-action="delete-audio-edit" type="button">Delete</button>
                <button id="ttsAudioSave" class="primary" data-action="save-audio-edit" type="button">Done</button>
              </div>
            </div>
          </section>
          <div class="tts-generate-row">
            <button id="convertButton" class="tts-generate" data-action="generate-tts" type="button"><span class="tts-generate-copy"><span class="tts-generate-label">Generate Voice</span><span class="tts-regenerate-cost" aria-hidden="true"><strong id="ttsRegenerateCost" data-value="50">$0.01</strong><small>USD</small></span></span><span class="tts-generate-wave" aria-hidden="true"><span class="tts-generate-wave-conveyor"><span class="tts-generate-wave-set"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="tts-generate-wave-set"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></span></span></button>
            <span class="char-count-wrap"><span class="tts-enhance-tools"><button id="enhanceButton" class="tts-enhance" data-action="enhance-tts" type="button" aria-label="Enhance text with emotion tags"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.8l1.25 4.15a5.1 5.1 0 0 0 3.4 3.4L20.8 11.6l-4.15 1.25a5.1 5.1 0 0 0-3.4 3.4L12 20.4l-1.25-4.15a5.1 5.1 0 0 0-3.4-3.4L3.2 11.6l4.15-1.25a5.1 5.1 0 0 0 3.4-3.4L12 2.8Z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/></svg><span>Enhance</span></button><button id="historyButton" class="history-button history-enhance-button" data-action="open-history" type="button" aria-label="Open history"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.6 8.2A8.2 8.2 0 1 1 4 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4.6 8.2V4.6M4.6 8.2H8.2M12 7.8v4.6l3.1 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span><button class="char-warning" id="ttsCharWarning" data-action="open-char-limit" type="button" aria-label="Text length warning"><span>!</span></button><span class="char-count-summary" aria-live="polite"><span class="char-count" id="ttsCharCount">0 / 5,000 characters</span><span class="tts-cost" id="ttsCost">$0.0000 USD</span></span></span>
          </div>
          <audio id="ttsAudio" class="tts-hidden-audio"></audio>
          <audio id="voicePreviewAudio" class="tts-hidden-audio"></audio>
          <audio id="historyAudio" class="tts-hidden-audio"></audio>
        </div>
        <section id="imageWorkspace" class="image-workspace" aria-hidden="true">
          <header class="image-intro"><div class="image-kicker-row"><span class="image-kicker">CREATE</span><span id="imageCreditNote" class="image-credit-note">$0.03 per image</span></div><h1>Imagine anything</h1><p>Describe a new image, or add one and tell us exactly what to change</p></header>
          <div class="image-composer">
            <label class="image-prompt-label" for="imagePrompt">Prompt</label>
            <textarea id="imagePrompt" maxlength="2000" placeholder="Describe the image you want to create"></textarea>
            <div class="image-composer-foot"><div class="image-composer-status"><span id="imagePromptCount">0 / 2000</span><button id="exploreReferenceChip" class="explore-reference-chip" data-action="clear-explore-image" type="button" aria-label="Remove selected reference" aria-hidden="true"><img id="exploreReferenceThumb" alt=""/><span aria-hidden="true">×</span></button></div><div class="image-composer-tools"><div id="imageSizePicker" class="image-size-picker"><button id="imageSizeToggle" class="image-size-toggle" data-action="toggle-image-size" type="button" aria-label="Image size: Square" aria-expanded="false"><span id="selectedSizeShape" class="size-shape size-square" aria-hidden="true"></span></button><div class="image-size-menu" role="menu" aria-label="Choose output size">
              <button class="image-size-option active" data-action="select-image-size" data-image-size="1024x1024" data-size-name="Square" type="button" role="menuitem" aria-pressed="true"><span class="size-shape size-square" aria-hidden="true"></span><span><strong>Square</strong><small>1:1 · 1024×1024</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1024x1280" data-size-name="Social portrait" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-portrait" aria-hidden="true"></span><span><strong>Social portrait</strong><small>4:5 · 1024×1280</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="960x1344" data-size-name="Photo portrait" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-portrait" aria-hidden="true"></span><span><strong>Photo portrait</strong><small>5:7 · 960×1344</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1152x1536" data-size-name="Classic portrait" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-portrait" aria-hidden="true"></span><span><strong>Classic portrait</strong><small>3:4 · 1152×1536</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1024x1536" data-size-name="Portrait" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-portrait" aria-hidden="true"></span><span><strong>Portrait</strong><small>2:3 · 1024×1536</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1152x2048" data-size-name="Story" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-tall" aria-hidden="true"></span><span><strong>Story</strong><small>9:16 · 1152×2048</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="768x1792" data-size-name="Mobile tall" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-tall" aria-hidden="true"></span><span><strong>Mobile tall</strong><small>9:21 · 768×1792</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1024x2048" data-size-name="Tall" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-tall" aria-hidden="true"></span><span><strong>Tall</strong><small>1:2 · 1024×2048</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="864x2592" data-size-name="Ultra tall" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-ultra-tall" aria-hidden="true"></span><span><strong>Ultra tall</strong><small>1:3 · 864×2592</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1280x1024" data-size-name="Social landscape" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-landscape" aria-hidden="true"></span><span><strong>Social landscape</strong><small>5:4 · 1280×1024</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1344x960" data-size-name="Photo landscape" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-landscape" aria-hidden="true"></span><span><strong>Photo landscape</strong><small>7:5 · 1344×960</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1536x1152" data-size-name="Classic landscape" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-landscape" aria-hidden="true"></span><span><strong>Classic landscape</strong><small>4:3 · 1536×1152</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1536x1024" data-size-name="Wide" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-landscape" aria-hidden="true"></span><span><strong>Wide</strong><small>3:2 · 1536×1024</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="2048x1152" data-size-name="Cinema" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-wide" aria-hidden="true"></span><span><strong>Cinema</strong><small>16:9 · 2048×1152</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="1792x768" data-size-name="Ultrawide" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-wide" aria-hidden="true"></span><span><strong>Ultrawide</strong><small>21:9 · 1792×768</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="2048x1024" data-size-name="Panorama" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-wide" aria-hidden="true"></span><span><strong>Panorama</strong><small>2:1 · 2048×1024</small></span></button>
              <button class="image-size-option" data-action="select-image-size" data-image-size="2592x864" data-size-name="Banner" type="button" role="menuitem" aria-pressed="false"><span class="size-shape size-ultra-wide" aria-hidden="true"></span><span><strong>Banner</strong><small>3:1 · 2592×864</small></span></button>
            </div></div><div id="imageQualityPicker" class="image-quality-picker"><button id="imageQualityToggle" class="image-quality-toggle" data-action="toggle-image-quality" type="button" aria-label="Image quality: Low" aria-expanded="false"><span id="selectedImageQuality">LOW</span></button><div class="image-quality-menu" role="menu" aria-label="Choose image quality"><button class="image-quality-option active" data-action="select-image-quality" data-image-quality="low" data-quality-name="Low" type="button" role="menuitem" aria-pressed="true"><strong>Low</strong><small>Fast</small></button><button class="image-quality-option" data-action="select-image-quality" data-image-quality="medium" data-quality-name="Medium" type="button" role="menuitem" aria-pressed="false"><strong>Medium</strong><small>Balanced</small></button><button class="image-quality-option" data-action="select-image-quality" data-image-quality="high" data-quality-name="High" type="button" role="menuitem" aria-pressed="false"><strong>High</strong><small>Best</small></button></div></div><button class="image-upload-trigger" data-action="pick-image" type="button"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V5m0 0L8 9m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Add photos</span></button></div></div>
          </div>
          <input id="imageFile" class="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple/>
          <div id="imageSources" class="image-sources" aria-hidden="true"><div class="image-sources-head"><span id="imageSourcesCount">0 selected</span><small>Up to 4 photos</small></div><div id="imageSourcesGrid" class="image-sources-grid"></div></div>
          <button id="generateImageButton" class="image-generate" data-action="generate-image" type="button"><span id="generateImageLabel">Generate image</span></button>
          <section id="imageExplore" class="image-explore" aria-hidden="true"><div class="image-explore-head"><button class="image-explore-title" data-action="open-explore-page" type="button">Explore</button><small id="imageExploreCount">0 cards</small></div><div id="imageExploreGrid" class="image-explore-grid"></div></section>
          <div id="imageResult" class="image-result" aria-hidden="true"><div class="image-result-frame"><img id="imageResultPreview" alt="Generated image"/><div class="image-result-shine" aria-hidden="true"></div></div><div class="image-result-actions"><button data-action="share-image" type="button"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2M5.5 13.5v4A2.5 2.5 0 0 0 8 20h8a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Share</span></button><button data-action="delete-image" type="button" aria-label="Delete image"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5.5 7.5h13M9.5 7.5V5.8c0-.72.58-1.3 1.3-1.3h2.4c.72 0 1.3.58 1.3 1.3v1.7m-7.1 0 .72 11.1c.06.92.82 1.64 1.74 1.64h4.78c.92 0 1.68-.72 1.74-1.64l.72-11.1M10.2 11v5.8m3.6-5.8v5.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Delete</span></button></div></div>
          <section id="imageHistorySection" class="image-history-section" aria-hidden="true"><div class="image-history-head"><span>CREATIONS</span><small id="imageHistoryCount">0</small></div><div id="imageHistoryGrid" class="image-history-grid"></div></section>
        </section>
        <div class="history-sheet" id="historySheet" aria-hidden="true"><button class="history-backdrop" data-action="close-history" type="button" aria-label="Close history"></button><section class="history-card" role="dialog" aria-modal="true" aria-label="Voice history"><label class="history-search" for="historySearch"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" stroke-width="1.9"/><path d="m15.5 15.5 4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg><input id="historySearch" type="search" autocomplete="off" placeholder="Search your voice history..."/></label><div id="historyList" class="history-list"><div class="history-loading"><span></span><span></span><span></span></div></div></section></div>
        <div class="limit-sheet" id="ttsLimitSheet" aria-hidden="true"><button class="limit-backdrop" data-action="close-char-limit" type="button" aria-label="Close"></button><div class="limit-card" id="ttsWarningCard"><div class="limit-icon"><span>!</span></div><h3 id="ttsWarningTitle">Character limit</h3><p id="ttsWarningText">You can’t convert more than 1000 characters</p><button class="limit-close" id="ttsWarningClose" data-action="close-char-limit" type="button">Got it</button></div></div>
      </div>
    </section>
  </main>





  <div id="rewardWheelSheet" class="wheel-sheet" aria-hidden="true"><button class="wheel-backdrop" data-action="close-wheel" type="button" aria-label="Close reward wheel"></button><section class="wheel-panel" role="dialog" aria-modal="true" aria-labelledby="wheelTitle"><header class="wheel-panel-head"><div><span>DAILY REWARD</span><h2 id="wheelTitle">Spin & win</h2></div><button data-action="close-wheel" type="button" aria-label="Close reward wheel"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header><div class="wheel-stage"><span class="wheel-pointer" aria-hidden="true"></span><div id="wheelRotor" class="wheel-rotor"><span class="wheel-prize" style="--wheel-angle:0deg">30% OFF</span><span class="wheel-prize" style="--wheel-angle:60deg">2,100</span><span class="wheel-prize" style="--wheel-angle:120deg">150</span><span class="wheel-prize" style="--wheel-angle:180deg">250</span><span class="wheel-prize" style="--wheel-angle:240deg">15% OFF</span><span class="wheel-prize" style="--wheel-angle:300deg">80</span><i class="wheel-hub" aria-hidden="true"></i></div></div><p id="wheelResult" class="wheel-result" aria-live="polite">Your daily reward is ready</p><button id="wheelSpinButton" class="wheel-spin-button" data-action="spin-wheel" type="button"><span>Spin the wheel</span></button><small id="wheelCountdown" class="wheel-countdown"></small></section></div>

  <section id="explorePage" class="explore-page" aria-hidden="true" style="padding-top:24px"><div class="explore-page-head"><div class="explore-page-title"><h2>Explore</h2><button class="explore-reels-open-button" data-action="open-explore-reels" type="button" aria-label="Open reels view"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="5" stroke="currentColor" stroke-width="1.7"/><path d="m9.7 8.2 5.5 3.8-5.5 3.8V8.2Z" fill="currentColor"/></svg><span>Reels</span><i aria-hidden="true"></i></button></div></div><label class="explore-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.1" stroke="currentColor" stroke-width="1.8"/><path d="m15.4 15.4 4.1 4.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="exploreSearch" type="search" autocomplete="off" placeholder="Search tags like Portrait, Fashion, Night"/></label><div id="explorePageGrid" class="explore-page-grid"></div><div id="exploreEmpty" class="explore-empty" aria-hidden="true">No matching images</div></section>

  <section id="exploreReelsPage" class="explore-reels-page" aria-hidden="true"><div id="exploreReelsFeed" class="explore-reels-feed"></div><div id="exploreReelsEmpty" class="explore-reels-empty" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="5" stroke="currentColor" stroke-width="1.6"/><path d="m9.7 8.2 5.5 3.8-5.5 3.8V8.2Z" fill="currentColor"/></svg><span>No content yet</span></div></section>

  <section id="voicesPage" class="voices-page" aria-hidden="true"><button class="keyboard-dismiss voices-keyboard-dismiss" data-action="dismiss-keyboard" type="button" aria-label="Hide keyboard"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><header class="voices-page-head"><div><span>VOICE LIBRARY</span><h2>Voices</h2></div><div class="voices-page-count"><strong id="savedVoiceCount">1</strong><span>/ 6 saved</span></div></header><label class="voice-library-search" for="voiceLibrarySearch"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" stroke-width="1.9"/><path d="m15.5 15.5 4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg><input id="voiceLibrarySearch" type="search" autocomplete="off" placeholder="Search voices..."/></label><section class="saved-voices-strip"><div class="saved-voices-copy"><strong>Your voices</strong><small>Available in the quick menu</small></div><div id="savedVoiceAvatars" class="saved-voice-avatars"></div></section><div class="voice-library-grid">${VOICE_LIBRARY_CARDS}</div></section>


  <section id="creditsPage" class="credits-page" aria-hidden="true">
    <div class="credits-page-scroll">
      <header class="credits-page-head">
        <div><h2>Add USD balance</h2><p>Top up instantly and keep creating.</p></div>
        <div class="credits-balance"><small>YOUR BALANCE</small><strong id="creditsPageBalance">—</strong></div>
      </header>
      <div id="creditsPaymentSwitch" class="credits-payment-switch" aria-hidden="true">
        <button class="active" data-action="set-credit-payment" data-payment-mode="stars" type="button" aria-pressed="true"><span>★</span>Telegram Stars</button>
        <button data-action="set-credit-payment" data-payment-mode="toman" type="button" aria-pressed="false"><span>﷼</span>پرداخت با تومان</button>
      </div>
      <div id="creditsStarsMode" class="credits-payment-mode active">
      <section class="credits-custom">
        <div class="credits-section-copy"><div><span>FLEXIBLE AMOUNT</span><h3>Choose your amount</h3></div><small>$0.18 balance = 12 Stars</small></div>
        <label class="credits-amount-field" for="customCreditsInput"><input id="customCreditsInput" type="number" inputmode="decimal" min="0.01" max="178" step="0.01" value="0.18" autocomplete="off"/><span>USD</span></label>
        <input id="customCreditsRange" class="credits-amount-range" type="range" min="0.18" max="17.80" step="0.18" value="0.18" aria-label="USD amount"/>
        <div class="credits-custom-summary"><div><strong id="customStarsValue">12 Stars</strong><small>Telegram Stars</small></div><div><strong id="customUsdValue">$0.17</strong><small>estimated value</small></div></div>
        <button id="customCreditsBuy" class="credits-primary-button" data-action="buy-custom-credits" type="button"><span>Continue with 12 Stars</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </section>
      <section class="credits-packs-section">
        <div class="credits-packs-head"><div><h3>USD balance packages</h3></div></div>
        <div class="credits-pack-list">
          <button class="credits-pack" data-action="buy-credit-package" data-package-id="mini_3000" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>$0.53</strong><small>USD balance</small></span><span class="credits-pack-total">$0.53 total balance</span></span><span class="credits-pack-price"><strong>36 <i>★</i></strong><small>$0.5</small></span></button>
          <button class="credits-pack featured" data-action="buy-credit-package" data-package-id="mini_10000" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>$1.89</strong><em>$0.11 BONUS</em></span><span class="credits-pack-total">$1.89 total balance</span></span><span class="credits-pack-price"><strong>118 <i>★</i></strong><small>$1.6</small></span></button>
          <button class="credits-pack" data-action="buy-credit-package" data-package-id="mini_18000" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>$3.60</strong><em>$0.39 BONUS</em></span><span class="credits-pack-total">$3.60 total balance</span></span><span class="credits-pack-price"><strong>216 <i>★</i></strong><small>$3.2</small></span></button>
          <button class="credits-pack" data-action="buy-credit-package" data-package-id="mini_30000" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>$6.41</strong><em>$1.07 BONUS</em></span><span class="credits-pack-total">$6.41 total balance</span></span><span class="credits-pack-price"><strong>360 <i>★</i></strong><small>$5.3</small></span></button>
        </div>
      </section>
      <p class="credits-footnote"><span>★</span> Secure payment powered by Telegram Stars</p>
      </div>
      <section id="creditsTomanMode" class="credits-payment-mode credits-toman-mode" aria-hidden="true" dir="rtl">
        <div id="tomanCheckout" class="credits-custom toman-checkout" data-step="amount">
          <div class="toman-stage">
            <div id="tomanAmountPanel" class="toman-panel toman-amount-panel">
              <div class="credits-section-copy toman-section-copy"><div><span>مقدار دلخواه</span><h3>چند دلار موجودی می‌خوای؟</h3></div><small>هر $0.18 موجودی = 39,000 تومان</small></div>
              <label class="credits-amount-field toman-amount-field" for="tomanCreditsInput"><input id="tomanCreditsInput" type="number" inputmode="decimal" min="0.01" max="178" step="0.01" value="1.25" autocomplete="off" dir="ltr"/><span>USD</span></label>
              <input id="tomanCreditsRange" class="credits-amount-range toman-amount-range" type="range" min="0.18" max="17.80" step="0.18" value="1.25" dir="ltr" aria-label="مقدار موجودی دلاری"/>
              <div class="credits-custom-summary toman-payment-summary"><div><strong id="tomanAmountValue">273,000 تومان</strong><small>جمع پرداختی</small></div><div><span id="tomanDiscountBadge" aria-hidden="true"></span><small>پرداخت با کارت بانکی</small></div></div>
              <p id="tomanMinimumNote" class="toman-minimum-note">حداقل خرید 260,000 تومانه.</p>
              <button id="tomanContinueButton" class="credits-primary-button" data-action="continue-toman-payment" type="button"><span>ادامه</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <div id="tomanReceiptPanel" class="toman-panel toman-receipt-panel" aria-hidden="true">
              <button class="toman-back" data-action="reset-toman-payment" type="button" aria-label="برگشت"><svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <div class="credits-section-copy toman-step-head"><div><span>پرداخت</span><h3>کارت‌به‌کارت کن</h3></div><small><b id="tomanOrderCredits">$1.25</b><br/><b id="tomanOrderAmount">273,000 تومان</b></small></div>
              <button id="tomanCardButton" class="toman-card" data-action="copy-toman-card" type="button"><small>شماره کارت — برای کپی بزن</small><strong id="tomanCardNumber" dir="ltr">•••• •••• •••• ••••</strong><span>کپی شد ✓</span></button>
              <input id="tomanReceiptInput" type="file" accept="image/jpeg,image/png,image/webp" hidden/>
              <button id="tomanReceiptPicker" class="toman-receipt-picker" data-action="pick-toman-receipt" type="button"><span class="toman-upload-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V5m0 0L8 9m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="toman-upload-copy"><strong>عکس رسید رو انتخاب کن</strong><small id="tomanReceiptName">JPG، PNG یا WebP</small></span><span class="toman-upload-check">✓</span></button>
              <button id="tomanSubmitReceipt" class="credits-primary-button toman-submit-button" data-action="submit-toman-receipt" type="button" disabled><span>ارسال رسید</span></button>
              <p class="toman-review-note">تأیید بشه، مبلغ دلاری خودش میاد تو حسابت.</p>
            </div>
            <div id="tomanSuccessPanel" class="toman-panel toman-success-panel" aria-hidden="true">
              <div class="toman-success-mark"><svg viewBox="0 0 24 24" fill="none"><path d="m7 12.5 3.2 3.2L17.5 8.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <span>ارسال شد</span><h3>رسیدت رسید</h3><p>ادمین چکش می‌کنه.<br/>تأیید بشه، مبلغ دلاری خودش میاد تو حسابت.</p>
              <div class="toman-success-order"><span id="tomanSuccessCredits">$1.25</span><strong id="tomanSuccessAmount">273,000 تومان</strong></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>

  <div id="toast" class="toast" role="status"></div>
  ${LIQUID_METAL_RUNTIME}
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/app.js?v=20260823-load-fix-2"></script>
</body>
</html>`;
