export const AI_CHAT_JS = `
(function(){
  var tg=window.Telegram&&window.Telegram.WebApp;
  if(tg){try{tg.ready&&tg.ready();tg.expand&&tg.expand();tg.disableVerticalSwipes&&tg.disableVerticalSwipes();tg.setBackgroundColor&&tg.setBackgroundColor('#000000');tg.setBottomBarColor&&tg.setBottomBarColor('#000000')}catch(e){}}
  var initData=(tg&&tg.initData)||'';
  var toastTimer=null;
  var lockTimer=null;
  var aiChatOpen=true;
  var aiChatBusy=false;
  var aiChatSendKeepsKeyboard=false;
  var aiChatMessages=[];
  var aiChatAudioUrls=[];
  var aiChatPreferredVoice='Nora';
  var aiChatSavedVoices=[];
  var aiChatVoiceProfiles={};
  var aiChatVoiceMenuBusy=false;
  var aiChatActivePreviewButton=null;
  var aiChatActivePreviewVoice='';
  var aiChatAttachment=null;
  var aiChatModel='gpt-5.6-terra';
  var aiChatModels=[];
  var aiChatModelMenuBusy=false;
  var aiChatReasoningEffort='medium';
  var aiChatReasoningEfforts=[];
  var aiChatMemory={usedBytes:0,maxBytes:65536,itemCount:0};
  var aiChatAttachmentMaxBytes=10*1024*1024;
  var aiChatAttachmentMimes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',txt:'text/plain',text:'text/plain',md:'text/markdown',markdown:'text/markdown',json:'application/json',html:'text/html',htm:'text/html',xml:'text/xml',csv:'text/csv',tsv:'text/tsv',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',rtf:'application/rtf',odt:'application/vnd.oasis.opendocument.text',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',js:'text/javascript',mjs:'text/javascript',ts:'text/x-typescript',tsx:'text/tsx',jsx:'text/jsx',py:'text/x-python',css:'text/css',sql:'text/x-sql',log:'text/plain',yaml:'text/x-yaml',yml:'text/x-yaml',toml:'application/toml',eml:'message/rfc822',ics:'text/calendar',srt:'application/x-subrip',vtt:'text/vtt'};
  var aiThinkingFrame=0;
  var aiThinkingSearchMix=0;
  var aiThinkingVoiceMix=0;
  var aiThinkingLastFrame=0;
  var aiCodingProgressEvents=[];
  var aiCodingPreview=null;
  var stableViewportHeight=Math.max(1,Number(tg&&(tg.viewportStableHeight||tg.viewportHeight))||Number(window.innerHeight)||1);
  function q(id){return document.getElementById(id)}
  function setAiChatVoiceImage(image,voice){
    if(!image)return;

    var source=String(aiChatVoiceProfiles[voice]||'');
    var frame=image.parentElement;

    if(source){
      image.style.backgroundImage=
        'url("'+source.split('"').join('%22')+'")';
      image.classList.add('has-image');

      if(frame&&frame.classList.contains('voice-avatar')){
        frame.classList.add('has-image');
      }
    }else{
      image.style.backgroundImage='';
      image.classList.remove('has-image');

      if(frame&&frame.classList.contains('voice-avatar')){
        frame.classList.remove('has-image');
      }
    }
  }

  function setAiChatVoiceAvatar(avatar,voice){
    if(!avatar)return;

    var source=String(aiChatVoiceProfiles[voice]||'');
    if(source){
      avatar.style.backgroundImage=
        'url("'+source.split('"').join('%22')+'")';
      avatar.classList.add('has-image');
    }else{
      avatar.style.backgroundImage='';
      avatar.classList.remove('has-image');
    }
  }

  function renderAiChatVoiceMenu(){
    var rows=q('aiChatVoiceRows');
    var empty=q('aiChatVoicesEmpty');
    var count=q('aiChatVoiceMenuCount');
    if(!rows||!empty)return;

    var saved=new Set(aiChatSavedVoices);

    rows.querySelectorAll(
      '.voice-option[data-voice-row-name]'
    ).forEach(function(row){
      var voice=String(
        row.getAttribute('data-voice-row-name')||''
      );
      var isSaved=saved.has(voice);
      var select=row.querySelector('.voice-select');
      var image=row.querySelector('.voice-avatar-image');

      row.classList.toggle(
        'voice-not-saved',
        !isSaved
      );

      if(select){
        var active=voice===aiChatPreferredVoice;
        select.classList.toggle('active',active);
        select.setAttribute(
          'aria-pressed',
          active?'true':'false'
        );
      }

      setAiChatVoiceImage(image,voice);
    });

    empty.classList.toggle(
      'show',
      !aiChatSavedVoices.length
    );

    if(count){
      count.textContent=
        String(aiChatSavedVoices.length)+' / 6';
    }
  }

  function setAiChatVoiceMenu(open){
    var wrap=q('aiChatVoiceWrap');
    var card=q('aiChatVoiceCard');
    var menu=q('aiChatVoiceMenu');
    if(!wrap||!card||!menu)return;

    var shouldOpen=!!open;
    wrap.classList.toggle('open',shouldOpen);
    card.setAttribute(
      'aria-expanded',
      shouldOpen?'true':'false'
    );
    menu.setAttribute(
      'aria-hidden',
      shouldOpen?'false':'true'
    );
  }

  function toggleAiChatVoiceMenu(event){
    if(event){
      event.preventDefault();
      event.stopPropagation();
    }

    setAiChatMenu(false);
    var wrap=q('aiChatVoiceWrap');
    setAiChatVoiceMenu(
      !(wrap&&wrap.classList.contains('open'))
    );
  }

  function stopAiChatVoicePreview(){
    var audio=q('aiChatVoicePreviewAudio');

    if(audio){
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    if(aiChatActivePreviewButton){
      aiChatActivePreviewButton.classList.remove(
        'loading',
        'playing'
      );
    }

    aiChatActivePreviewButton=null;
    aiChatActivePreviewVoice='';
  }

  async function previewAiChatVoice(button){
    var voiceId=String(
      button.getAttribute('data-preview-voice')||''
    );
    var voiceName=String(
      button.getAttribute('data-preview-name')||'Voice'
    );
    var audio=q('aiChatVoicePreviewAudio');
    if(!voiceId||!audio)return;

    if(
      aiChatActivePreviewButton===button
      &&aiChatActivePreviewVoice===voiceId
      &&!audio.paused
    ){
      audio.pause();
      return;
    }

    stopAiChatVoicePreview();
    aiChatActivePreviewButton=button;
    aiChatActivePreviewVoice=voiceId;
    button.classList.add('loading');

    try{
      var data=await api('/mini-app/api/voice-demo',{
        voice:voiceId
      });

      if(aiChatActivePreviewButton!==button){
        return;
      }

      audio.src=
        'data:audio/mpeg;base64,'
        +String(data.audioBase64||'');
      button.classList.remove('loading');
      button.classList.add('playing');
      await audio.play();
    }catch(error){
      button.classList.remove('loading','playing');
      aiChatActivePreviewButton=null;
      aiChatActivePreviewVoice='';
      toast(
        error.message||('Could not play '+voiceName)
      );
    }
  }

  function openAiChatVoicesPage(){
    stopAiChatVoicePreview();
    window.location.assign('/mini-app?section=voices');
  }

  async function selectAiChatVoice(voiceId,voiceName){
    var selectedId=String(voiceId||'').trim();
    var selectedName=String(voiceName||'').trim();

    if(
      !selectedId
      ||!selectedName
      ||aiChatVoiceMenuBusy
    ){
      return;
    }

    if(selectedName===aiChatPreferredVoice){
      setAiChatVoiceMenu(false);
      return;
    }

    var previousVoice=aiChatPreferredVoice;
    var card=q('aiChatVoiceCard');
    aiChatVoiceMenuBusy=true;
    stopAiChatVoicePreview();
    updateAiChatHeader({voice:selectedName});
    setAiChatVoiceMenu(false);

    if(card){
      card.setAttribute('aria-busy','true');
    }

    if(tg&&tg.HapticFeedback){
      try{
        tg.HapticFeedback.impactOccurred('light');
      }catch(error){}
    }

    try{
      var data=await api('/mini-app/api/user-voices',{
        action:'select',
        voice:selectedId
      });

      updateAiChatHeader({
        voice:String(
          data.selectedVoice||selectedName
        ),
        savedVoices:Array.isArray(data.savedVoices)
          ?data.savedVoices
          :aiChatSavedVoices
      });
    }catch(error){
      updateAiChatHeader({voice:previousVoice});
      toast(error.message);
    }finally{
      aiChatVoiceMenuBusy=false;

      if(card){
        card.removeAttribute('aria-busy');
      }
    }
  }

  function setAiChatMenu(open){
    var button=q('aiChatMenuButton');
    var backdrop=q('aiChatMenuBackdrop');
    if(!button||!backdrop)return;
    var shouldOpen=!!open;
    backdrop.classList.toggle('open',shouldOpen);
    backdrop.setAttribute('aria-hidden',shouldOpen?'false':'true');
    button.setAttribute('aria-expanded',shouldOpen?'true':'false');
    document.documentElement.classList.toggle('ai-chat-menu-open',shouldOpen);
    if(shouldOpen)setAiChatVoiceMenu(false);
  }

  function toggleAiChatMenu(event){
    if(event){event.preventDefault();event.stopPropagation()}
    var backdrop=q('aiChatMenuBackdrop');
    setAiChatMenu(!(backdrop&&backdrop.classList.contains('open')));
  }

  function renderAiChatModelMenu(){
    var selected=aiChatModels.find(function(item){return item&&item.id===aiChatModel});
    document.querySelectorAll('.model-option[data-ai-model]').forEach(function(button){
      var active=button.getAttribute('data-ai-model')===aiChatModel;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    document.querySelectorAll('[data-ai-effort]').forEach(function(button){
      var active=button.getAttribute('data-ai-effort')===aiChatReasoningEffort;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
  }

  function formatAiMemoryBytes(value){
    var bytes=Math.max(0,Number(value)||0);
    if(bytes<1024)return Math.round(bytes)+' B';
    return (bytes/1024).toLocaleString('en-US',{maximumFractionDigits:bytes<10240?1:0})+' KB';
  }

  function renderAiChatMemory(){
    var used=Math.max(0,Number(aiChatMemory.usedBytes)||0);
    var max=Math.max(1,Number(aiChatMemory.maxBytes)||65536);
    var count=Math.max(0,Math.floor(Number(aiChatMemory.itemCount)||0));
    var fill=q('aiChatMemoryFill');
    var usage=q('aiChatMemoryUsage');
    var items=q('aiChatMemoryItems');
    var clear=q('aiChatMemoryClear');
    if(fill)fill.style.width=Math.min(100,used/max*100)+'%';
    if(usage)usage.textContent=formatAiMemoryBytes(used)+' of '+formatAiMemoryBytes(max);
    if(items)items.textContent=count+' saved';
    if(clear)clear.disabled=count===0;
  }

  async function selectAiChatModel(modelId){
    var selected=String(modelId||'').trim();
    if(!selected||selected===aiChatModel||aiChatModelMenuBusy)return;
    if(!aiChatModels.some(function(item){return item&&item.id===selected}))return;
    var previous=aiChatModel;
    aiChatModel=selected;
    aiChatModelMenuBusy=true;
    renderAiChatModelMenu();
    try{
      var data=await api('/mini-app/api/ai-chat-model',{model:selected});
      updateAiChatHeader(data);
      if(tg&&tg.HapticFeedback)try{tg.HapticFeedback.impactOccurred('light')}catch(error){}
    }catch(error){
      aiChatModel=previous;
      renderAiChatModelMenu();
      toast(error.message);
    }finally{
      aiChatModelMenuBusy=false;
    }
  }

  async function selectAiChatReasoningEffort(effort){
    var selected=String(effort||'').trim().toLowerCase();
    if(!selected||selected===aiChatReasoningEffort||aiChatModelMenuBusy)return;
    if(!aiChatReasoningEfforts.some(function(item){return item&&item.id===selected}))return;
    var previous=aiChatReasoningEffort;
    aiChatReasoningEffort=selected;
    aiChatModelMenuBusy=true;
    renderAiChatModelMenu();
    try{
      var data=await api('/mini-app/api/ai-chat-model',{reasoningEffort:selected});
      updateAiChatHeader(data);
      if(tg&&tg.HapticFeedback)try{tg.HapticFeedback.impactOccurred('light')}catch(error){}
    }catch(error){
      aiChatReasoningEffort=previous;
      renderAiChatModelMenu();
      toast(error.message);
    }finally{
      aiChatModelMenuBusy=false;
    }
  }

  function confirmAiMemoryClear(){
    if(tg&&typeof tg.showConfirm==='function'){
      return new Promise(function(resolve){tg.showConfirm('Clear everything Vexa remembers about you?',function(value){resolve(!!value)})});
    }
    return Promise.resolve(window.confirm('Clear everything Vexa remembers about you?'));
  }

  async function clearAiChatMemory(){
    if(!(await confirmAiMemoryClear()))return;
    var button=q('aiChatMemoryClear');
    if(button)button.disabled=true;
    try{
      var data=await api('/mini-app/api/ai-memory-clear',{});
      if(data.memory)aiChatMemory=data.memory;
      renderAiChatMemory();
      if(tg&&tg.HapticFeedback)try{tg.HapticFeedback.notificationOccurred('success')}catch(error){}
    }catch(error){
      toast(error.message);
    }finally{
      renderAiChatMemory();
    }
  }

  function updateAiChatHeader(data){
    if(!data||typeof data!=='object')return;

    if(Array.isArray(data.aiChatModels)){
      aiChatModels=data.aiChatModels.filter(function(item){return item&&item.id&&item.label});
    }
    if(data.aiChatModel||data.model){
      var selectedModel=String(data.aiChatModel||data.model||'').trim();
      if(selectedModel)aiChatModel=selectedModel;
    }
    if(Array.isArray(data.aiChatReasoningEfforts)){
      aiChatReasoningEfforts=data.aiChatReasoningEfforts.filter(function(item){return item&&item.id&&item.label});
    }
    if(data.aiChatReasoningEffort||data.reasoningEffort){
      var selectedEffort=String(data.aiChatReasoningEffort||data.reasoningEffort||'').trim().toLowerCase();
      if(selectedEffort)aiChatReasoningEffort=selectedEffort;
    }
    if(data.aiMemory&&typeof data.aiMemory==='object')aiChatMemory=data.aiMemory;
    if(data.memory&&typeof data.memory==='object')aiChatMemory=data.memory;

    var voice=String(data.voice||'').trim();
    if(voice){
      aiChatPreferredVoice=voice;
    }

    if(Array.isArray(data.savedVoices)){
      aiChatSavedVoices=data.savedVoices
        .map(function(item){return String(item||'').trim()})
        .filter(function(item,index,list){return item&&list.indexOf(item)===index})
        .slice(0,6);
    }

    if(data.voiceProfiles&&typeof data.voiceProfiles==='object')aiChatVoiceProfiles=data.voiceProfiles;

    var balance=q('aiChatBalance');
    if(balance&&data.balance!==undefined&&data.balance!==null)balance.textContent=Number(data.balance).toLocaleString('en-US');
    var label=q('aiChatVoiceLabel');
    if(label)label.textContent=aiChatPreferredVoice;
    setAiChatVoiceAvatar(q('aiChatVoiceAvatar'),aiChatPreferredVoice);
    renderAiChatVoiceMenu();
    renderAiChatModelMenu();
    renderAiChatMemory();
  }

  function setAiChatCreatureState(state){if(typeof window.aiChatCreatureSetState==='function')window.aiChatCreatureSetState(state)}
  function withoutTrailingDot(value){return String(value==null?'':value).replace(/[.!؟。]+$/u,'')}
  function toast(value){var node=q('toast');if(!node)return;node.textContent=withoutTrailingDot(value);node.classList.remove('show');void node.offsetWidth;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){node.classList.remove('show')},3200)}
  function setAiChatKeyboardOffset(value){document.documentElement.style.setProperty('--ai-chat-keyboard-offset',Math.max(0,Math.round(Number(value)||0))+'px')}
  function syncAiChatKeyboardOffset(){setAiChatKeyboardOffset(stableViewportHeight-Number(tg&&tg.viewportHeight||stableViewportHeight))}
  document.documentElement.style.setProperty('--ai-chat-page-height',Math.round(stableViewportHeight)+'px');
  if(tg&&tg.onEvent){try{tg.onEvent('viewportChanged',syncAiChatKeyboardOffset)}catch(e){}}
  async function api(path,body){var response;try{response=await fetch(path,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify(Object.assign({initData:initData},body||{}))})}catch(error){throw new Error('Connection interrupted · Try again')}var data=await response.json().catch(function(){return{error:'Invalid response'}});if(!response.ok){var requestError=new Error(data.error||'Request failed');requestError.status=response.status;throw requestError}return data}
  function aiOrbSpherePoint(index,count){var golden=Math.PI*(3-Math.sqrt(5));var y=1-2*(index+.5)/count;var radius=Math.sqrt(1-y*y);var angle=index*golden;return[radius*Math.cos(angle),y,radius*Math.sin(angle)]}
  function aiOrbProject(yaw,pitch,cx,cy){var sy=Math.sin(yaw),cyaw=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);return function(x,y,z){var rx=x*cyaw+z*sy;var rz=-x*sy+z*cyaw;var ry=y*cp-rz*sp;var depth=y*sp+rz*cp;return[cx+rx,cy-ry,depth]}}
  function aiOrbPaint(ctx,dots){dots.sort(function(first,second){return first.z-second.z});dots.forEach(function(dot){if(dot.a<.02)return;if(dot.color){ctx.fillStyle='rgba('+Math.round(dot.color[0])+','+Math.round(dot.color[1])+','+Math.round(dot.color[2])+','+dot.a+')'}else{var ink=Math.max(0,Math.min(1,dot.white));var shade=Math.round((1-ink)*255);ctx.fillStyle='rgba('+shade+','+shade+','+shade+','+dot.a+')'}ctx.beginPath();ctx.arc(dot.x,dot.y,Math.max(.255,dot.r),0,Math.PI*2);ctx.fill()})}
  function aiSmoothMorph(value){var amount=Math.max(0,Math.min(1,Number(value)||0));return amount*amount*(3-2*amount)}
  function aiVoiceWaveEnvelope(index,count){var position=index/Math.max(1,count-1);return Math.pow(Math.sin(Math.PI*position),.78)}
  function aiVoiceBarHeight(index,count,seconds){var envelope=aiVoiceWaveEnvelope(index,count);var primary=.5+.5*Math.sin(seconds*3.9+index*.62);var secondary=.5+.5*Math.sin(seconds*5.7-index*.39);var texture=.5+.5*Math.sin(seconds*8.1+index*.21);return 1.2+envelope*(4.4+12.6*(primary*.5+secondary*.34+texture*.16))}
  function drawAiVoiceWaveBody(ctx,seconds,mix,width,height){var amount=aiSmoothMorph(mix);if(amount<.01)return;var barCount=23;var left=2.5;var waveWidth=Math.max(1,width-left*2);var center=height/2;ctx.save();ctx.lineCap='round';ctx.shadowColor='transparent';ctx.shadowBlur=0;for(var index=0;index<barCount;index+=1){var envelope=aiVoiceWaveEnvelope(index,barCount);var barHeight=aiVoiceBarHeight(index,barCount,seconds);var x=left+waveWidth*index/(barCount-1);ctx.beginPath();ctx.moveTo(x,center-barHeight/2);ctx.lineTo(x,center+barHeight/2);ctx.globalAlpha=.14*amount*envelope;ctx.strokeStyle='rgba(255,255,255,.64)';ctx.lineWidth=1.9;ctx.stroke();ctx.beginPath();ctx.moveTo(x,center-barHeight*.41);ctx.lineTo(x,center+barHeight*.41);ctx.globalAlpha=.3*amount*envelope;ctx.strokeStyle='rgba(255,255,255,.86)';ctx.lineWidth=.95;ctx.stroke();ctx.beginPath();ctx.moveTo(x,center-barHeight*.25);ctx.lineTo(x,center+barHeight*.25);ctx.globalAlpha=.52*amount*envelope;ctx.strokeStyle='rgba(255,255,255,.98)';ctx.lineWidth=.42;ctx.stroke()}ctx.restore()}
  function morphAiDotsToVoiceWave(dots,seconds,mix,width,height){var amount=aiSmoothMorph(mix);if(amount<=0)return;var barCount=23;var dotsPerBar=9;var visibleDots=barCount*dotsPerBar;var left=2.5;var waveWidth=Math.max(1,width-left*2);var center=height/2;dots.forEach(function(dot,index){var visible=index<visibleDots;var bar=Math.floor(index/dotsPerBar);var level=index%dotsPerBar;var middle=(dotsPerBar-1)/2;var distance=Math.abs(level-middle);var envelope=visible?aiVoiceWaveEnvelope(bar,barCount):0;var barHeight=visible?aiVoiceBarHeight(bar,barCount,seconds):0;var targetX=left+waveWidth*bar/Math.max(1,barCount-1);var targetY=center+(level-middle)*barHeight/(dotsPerBar-1);var centerWeight=1-distance/Math.max(1,middle);var targetRadius=.28+.25*centerWeight;var targetAlpha=visible?(.16+.56*centerWeight)*envelope:0;dot.x+=(targetX-dot.x)*amount;dot.y+=(targetY-dot.y)*amount;dot.z*=1-amount;dot.r+=(targetRadius-dot.r)*amount;dot.a+=(targetAlpha-dot.a)*amount;dot.white+=(.055-dot.white)*amount;if(visible){var shade=194+58*centerWeight;var currentColor=dot.color||[shade,shade,shade];dot.color=[currentColor[0]+(shade-currentColor[0])*amount,currentColor[1]+(shade-currentColor[1])*amount,currentColor[2]+(shade-currentColor[2])*amount]}})}
  function drawAiThinkingOrb(canvas,seconds,searchMix,voiceMix){if(!canvas)return;var bounds=canvas.getBoundingClientRect();var width=Math.max(1,Number(bounds.width)||48);var height=Math.max(1,Number(bounds.height)||48);var size=Math.min(width,height);var dpr=Math.min(3,window.devicePixelRatio||1);var pixelWidth=Math.round(width*dpr);var pixelHeight=Math.round(height*dpr);if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight}var ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';var searchMorph=aiSmoothMorph(searchMix);var voiceMorph=aiSmoothMorph(voiceMix);var searchPulse=1+Math.sin(seconds*2.15)*.052*searchMorph;var radius=size*(.39-.02*searchMorph)*searchPulse;var speedTime=seconds*2.34;var project=aiOrbProject(0,.55-.42*searchMorph,width/2,height/2);var dots=[];var dotScale=Math.pow(size/300,.6);var ghostCount=38;for(var ghost=0;ghost<ghostCount;ghost+=1){var point=aiOrbSpherePoint(ghost,ghostCount);var ghostPoint=project(point[0]*radius,point[1]*radius,point[2]*radius);var ghostDepth=(ghostPoint[2]/radius+1)/2;dots.push({x:ghostPoint[0],y:ghostPoint[1],z:ghostPoint[2],r:.8*dotScale,white:.78,a:(.1+.22*ghostDepth)*(1-searchMorph)})}var sinTilt=Math.sin(.55);var cosTilt=Math.cos(.55);var lanes=12;var segments=44;for(var lane=0;lane<lanes;lane+=1){var laneOffset=(lane-(lanes-1)/2)*.075;var laneDistance=Math.abs(lane-(lanes-1)/2)/Math.max(1,(lanes-1)/2);var latitude=Math.PI*(lane+.45)/(lanes-.1);var sphereY=Math.cos(latitude);var sphereRadius=Math.sin(latitude);for(var segment=0;segment<segments;segment+=1){var angle=segment/segments*Math.PI*2;var wobble=.16*Math.sin(angle*3-speedTime*1.7+lane*.22)+.07*Math.sin(angle*5+speedTime*1.1);var elevation=laneOffset+wobble;var thinkingX=Math.cos(angle)-sinTilt*elevation;var thinkingY=cosTilt*Math.sin(angle);var thinkingZ=sinTilt*Math.sin(angle)-cosTilt*elevation;var thinkingLength=Math.sqrt(thinkingX*thinkingX+thinkingY*thinkingY+thinkingZ*thinkingZ);thinkingX/=thinkingLength;thinkingY/=thinkingLength;thinkingZ/=thinkingLength;var sphereAngle=angle+seconds*.48+(lane%2)*Math.PI/segments;var sphereX=Math.cos(sphereAngle)*sphereRadius;var sphereZ=Math.sin(sphereAngle)*sphereRadius;var x=thinkingX+(sphereX-thinkingX)*searchMorph;var y=thinkingY+(sphereY-thinkingY)*searchMorph;var z=thinkingZ+(sphereZ-thinkingZ)*searchMorph;var length=Math.sqrt(x*x+y*y+z*z)||1;var projected=project(x/length*radius,y/length*radius,z/length*radius);var depth=(projected[2]/radius+1)/2;var thinkingRadius=(.935+1.445*depth)*(1-.25*laneDistance)*dotScale;var searchRadius=.48+.52*depth;var searchVisible=segment%(lane===0||lane===lanes-1?4:2)===0?1:0;if(searchMorph>.999&&!searchVisible)continue;dots.push({x:projected[0],y:projected[1],z:projected[2],r:thinkingRadius+(searchRadius-thinkingRadius)*searchMorph,white:(.52-.44*depth+.18*laneDistance)*(1-searchMorph)+(.22+.14*(1-depth))*searchMorph,a:(.4+.6*depth)*(1-searchMorph)+(.16+.66*depth)*searchMorph*searchVisible})}}morphAiDotsToVoiceWave(dots,seconds,voiceMorph,width,height);drawAiVoiceWaveBody(ctx,seconds,voiceMorph,width,height);aiOrbPaint(ctx,dots)}
  function approachAiThinkingMix(current,target,delta,speed){var next=current+(target-current)*Math.min(1,delta*speed);if(Math.abs(target-next)<.001)return target;return next}
  function isAiCodingState(state){return ['scanning_repository','reading_repository','analyzing_code','preparing_changes','previewing_changes','writing_code','creating_pull_request','merging_pull_request','applying_changes','finalizing'].indexOf(String(state||''))>=0}
  function isAiCommitState(state){return ['committing_changes','commit_ready','pull_request_ready','changes_applied'].indexOf(String(state||''))>=0}
  function startAiThinkingOrb(){stopAiThinkingOrb();var canvas=q('aiThinkingOrb');var emptyCanvas=q('aiChatEmptyOrb');if(!canvas&&!emptyCanvas)return;var row=q('aiThinkingRow');var initialState=row?row.getAttribute('data-state'):'';aiThinkingSearchMix=initialState==='searching'?1:0;aiThinkingVoiceMix=initialState==='generating_voice'?1:0;aiThinkingLastFrame=0;var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;function frame(now){var seconds=(now||performance.now())/1000;var currentRow=q('aiThinkingRow');var state=currentRow?currentRow.getAttribute('data-state'):'';var searchTarget=state==='searching'?1:0;var voiceTarget=state==='generating_voice'?1:0;var delta=aiThinkingLastFrame?Math.min(.05,seconds-aiThinkingLastFrame):0;if(reduced){aiThinkingSearchMix=searchTarget;aiThinkingVoiceMix=voiceTarget}else{aiThinkingSearchMix=approachAiThinkingMix(aiThinkingSearchMix,searchTarget,delta,2.6);aiThinkingVoiceMix=approachAiThinkingMix(aiThinkingVoiceMix,voiceTarget,delta,1.15)}aiThinkingLastFrame=seconds;if(canvas)drawAiThinkingOrb(canvas,seconds,aiThinkingSearchMix,aiThinkingVoiceMix);if(emptyCanvas)drawAiThinkingOrb(emptyCanvas,seconds,0,0);var list=q('aiChatMessages');var emptyVisible=!!(aiChatOpen&&list&&!list.querySelector('.ai-chat-message,.ai-thinking-row'));if(!reduced&&(aiChatBusy||emptyVisible))aiThinkingFrame=requestAnimationFrame(frame)}frame(performance.now())}
  function stopAiThinkingOrb(){if(aiThinkingFrame){cancelAnimationFrame(aiThinkingFrame);aiThinkingFrame=0}var canvas=q('aiThinkingOrb');if(canvas){var ctx=canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height)}}
  function syncAiChatEmptyState(){var list=q('aiChatMessages');var empty=q('aiChatEmpty');if(!list||!empty)return;empty.classList.toggle('hidden',!!list.querySelector('.ai-chat-message,.ai-thinking-row'))}
  function placeAiChatUserAtStart(message){var list=q('aiChatMessages');if(!list||!message)return;requestAnimationFrame(function(){var top=(parseFloat(getComputedStyle(list).paddingTop)||0)+18;list.scrollTop=Math.max(0,list.scrollTop+message.getBoundingClientRect().top-list.getBoundingClientRect().top-top)})}
  function resizeAiChatInput(){var input=q('aiChatInput');if(!input)return;input.style.height='auto';var full=input.scrollHeight;input.style.height=Math.min(120,Math.max(32,full))+'px';input.style.overflowY=full>120?'auto':'hidden'}
  function aiChatFileExtension(name){var parts=String(name||'').toLowerCase().split('.');return parts.length>1?parts.pop():''}
  function formatAiChatFileSize(bytes){var size=Math.max(0,Number(bytes)||0);if(size>=1024*1024)return(size/1024/1024).toFixed(size>=10*1024*1024?0:1)+' MB';if(size>=1024)return Math.round(size/1024)+' KB';return size+' B'}
  function buildAiChatAttachmentCard(attachment,removable){var card=document.createElement('div');card.className='ai-chat-attachment-card '+(attachment.isImage?'is-image':'is-file')+(removable?' is-selected':' ai-chat-message-attachment');if(attachment.isImage){var image=document.createElement('img');image.src=attachment.dataUrl;image.alt='';image.setAttribute('aria-hidden','true');card.appendChild(image)}else{var badge=document.createElement('span');badge.className='ai-chat-attachment-type';badge.textContent=(aiChatFileExtension(attachment.name)||'FILE').slice(0,4).toUpperCase();card.appendChild(badge)}var copy=document.createElement('span');copy.className='ai-chat-attachment-copy';var name=document.createElement('strong');name.textContent=attachment.name;var meta=document.createElement('small');meta.textContent=formatAiChatFileSize(attachment.size);copy.appendChild(name);copy.appendChild(meta);card.appendChild(copy);if(removable){var remove=document.createElement('button');remove.className='ai-chat-attachment-remove';remove.type='button';remove.setAttribute('aria-label','Remove attachment');remove.textContent='×';remove.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();clearAiChatAttachment()});card.appendChild(remove)}return card}
  function renderAiChatAttachment(){var composer=q('aiChatComposer');var preview=q('aiChatAttachmentPreview');if(!preview||!composer)return;preview.replaceChildren();var selected=!!aiChatAttachment;composer.classList.toggle('has-attachment',selected);preview.setAttribute('aria-hidden',selected?'false':'true');if(selected)preview.appendChild(buildAiChatAttachmentCard(aiChatAttachment,true))}
  function clearAiChatAttachment(){aiChatAttachment=null;var input=q('aiChatFile');if(input)input.value='';renderAiChatAttachment()}
  function readAiChatFile(file){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''))};reader.onerror=function(){reject(new Error('Could not read this file'))};reader.readAsDataURL(file)})
  async function selectAiChatAttachment(file){if(!file)return;var extension=aiChatFileExtension(file.name);var mimeType=aiChatAttachmentMimes[extension];if(!mimeType){clearAiChatAttachment();toast('This file type is not supported');return}if(Number(file.size)<=0||Number(file.size)>aiChatAttachmentMaxBytes){clearAiChatAttachment();toast('File must be smaller than 10 MB');return}var button=q('aiChatAttach');if(button)button.classList.add('loading');try{var dataUrl=await readAiChatFile(file);aiChatAttachment={name:String(file.name||'attachment').slice(0,120),mimeType:mimeType,size:Number(file.size)||0,dataUrl:dataUrl.replace(/^data:[^;,]*/,'data:'+mimeType),isImage:mimeType.indexOf('image/')===0};renderAiChatAttachment();if(tg&&tg.HapticFeedback&&tg.HapticFeedback.impactOccurred)tg.HapticFeedback.impactOccurred('light')}catch(error){clearAiChatAttachment();toast(error.message||'Could not read this file')}finally{if(button)button.classList.remove('loading')}}

  function appendAiChatInline(parent,text){var source=String(text||'');var pattern=/(\\*\\*[^*]+\\*\\*|__[^_]+__|~~[^~]+~~|\\x60[^\\x60]+\\x60|\\[[^\\]]+\\]\\([^)]+\\)|\\*[^*]+\\*|_[^_]+_)/g;var cursor=0;function appendPlain(value){if(!value)return;parent.appendChild(document.createTextNode(String(value).split('**').join('').split('__').join('').split('~~').join('')))}var match;while((match=pattern.exec(source))){appendPlain(source.slice(cursor,match.index));var token=match[0];var element=null;var body='';if(token.slice(0,2)==='**'&&token.slice(-2)==='**'){element=document.createElement('strong');body=token.slice(2,-2)}else if(token.slice(0,2)==='__'&&token.slice(-2)==='__'){element=document.createElement('strong');body=token.slice(2,-2)}else if(token.slice(0,2)==='~~'&&token.slice(-2)==='~~'){element=document.createElement('del');body=token.slice(2,-2)}else if(token.charCodeAt(0)===96&&token.charCodeAt(token.length-1)===96){element=document.createElement('code');body=token.slice(1,-1)}else if(token.charAt(0)==='['){var linkMatch=token.match(/^\\[([^\\]]+)\\]\\(([^)]+)\\)$/);if(linkMatch){var href=String(linkMatch[2]||'').trim();if(/^https?:\\/\\//i.test(href)){element=document.createElement('a');element.href=href;element.target='_blank';element.rel='noopener noreferrer'}else element=document.createElement('span');body=linkMatch[1]}}else{element=document.createElement('em');body=token.slice(1,-1)}if(element){element.textContent=body;parent.appendChild(element)}else appendPlain(token);cursor=match.index+token.length}appendPlain(source.slice(cursor))}
  function renderAiChatMarkdown(target,text){target.replaceChildren();var lines=String(text||'').split(String.fromCharCode(13)).join('').split(String.fromCharCode(10));var list=null;var listType='';var fence=String.fromCharCode(96,96,96);for(var i=0;i<lines.length;i++){var line=lines[i];if(!line.trim()){list=null;listType='';continue}if(line.indexOf(fence)===0){var codeLines=[];i++;while(i<lines.length&&lines[i].indexOf(fence)!==0){codeLines.push(lines[i]);i++}var pre=document.createElement('pre');var code=document.createElement('code');code.textContent=codeLines.join(String.fromCharCode(10));pre.appendChild(code);target.appendChild(pre);list=null;listType='';continue}var heading=line.match(/^(#{1,3})\\s+(.+)$/);if(heading){var title=document.createElement(heading[1].length<3?'h2':'h3');appendAiChatInline(title,heading[2]);target.appendChild(title);list=null;listType='';continue}var bullet=line.match(/^\\s*[-+*]\\s+(.+)$/);var numbered=line.match(/^\\s*\\d+[.)]\\s+(.+)$/);if(bullet||numbered){var nextType=numbered?'ol':'ul';if(!list||listType!==nextType){list=document.createElement(nextType);target.appendChild(list);listType=nextType}var item=document.createElement('li');appendAiChatInline(item,(bullet||numbered)[1]);list.appendChild(item);continue}var quote=line.match(/^\\s*>\\s?(.*)$/);if(quote){var block=document.createElement('blockquote');appendAiChatInline(block,quote[1]);target.appendChild(block);list=null;listType='';continue}var paragraph=document.createElement('p');appendAiChatInline(paragraph,line);target.appendChild(paragraph);list=null;listType=''}}
  function appendAiChatMessage(role,text,animate,attachment){var list=q('aiChatMessages');if(!list)return Promise.resolve();var cleanRole=role==='assistant'?'assistant':'user';if(cleanRole==='assistant')setAiChatCreatureState('happy');var value=String(text||'');var rtl=/[\\u0590-\\u08ff\\ufb1d-\\ufdff\\ufe70-\\ufeff]/.test(value);var item=document.createElement('article');item.className='ai-chat-message '+cleanRole+(rtl?' rtl':'')+(attachment?' has-attachment':'');if(attachment)item.appendChild(buildAiChatAttachmentCard(attachment,false));var content=document.createElement('div');content.className='ai-chat-message-content';content.setAttribute('dir',rtl?'rtl':'ltr');item.appendChild(content);list.appendChild(item);syncAiChatEmptyState();var record={role:cleanRole,content:value};if(cleanRole==='user'&&attachment)record.attachment=attachment;aiChatMessages.push(record);if(cleanRole==='user')placeAiChatUserAtStart(item);function render(displayValue){if(cleanRole==='assistant')renderAiChatMarkdown(content,displayValue);else content.textContent=displayValue}var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(!animate||cleanRole!=='assistant'||reduced){render(value);return Promise.resolve()}var characters=Array.from(value);var duration=Math.min(2200,Math.max(360,characters.length*12));return new Promise(function(resolve){var started=performance.now(),lastCount=0;function write(now){var progress=Math.min(1,(now-started)/duration);var eased=1-Math.pow(1-progress,2.4);var count=Math.max(lastCount,Math.ceil(characters.length*eased));if(count!==lastCount){render(characters.slice(0,count).join(''));lastCount=count}if(progress<1){requestAnimationFrame(write)}else{render(value);resolve()}}requestAnimationFrame(write)})}
  function hideAiImageGenerating(){setAiChatCreatureState('idle');stopAiThinkingOrb();var item=q('aiImageGenerating');if(item)item.remove()}
  function showAiImageGenerating(){setAiChatCreatureState('thinking');var list=q('aiChatMessages');if(!list)return;hideAiImageGenerating();var item=document.createElement('article');item.id='aiImageGenerating';item.className='ai-chat-message assistant ai-chat-image-generating';item.innerHTML='<div class="ai-chat-image-generating-content"><canvas id="aiThinkingOrb" width="96" height="96" aria-hidden="true"></canvas><span>Creating image</span></div>';list.appendChild(item);syncAiChatEmptyState();startAiThinkingOrb()}
  function appendAiChatImage(data){setAiChatCreatureState('happy');var list=q('aiChatMessages');var base64=String(data&&data.imageBase64||'');if(!list||!base64)return;var mimeType=String(data&&data.mimeType||'image/jpeg');var source='data:'+mimeType+';base64,'+base64;var item=document.createElement('article');item.className='ai-chat-message assistant ai-chat-image-message';var card=document.createElement('div');card.className='ai-chat-image-card';var blurred=document.createElement('img');blurred.className='ai-chat-image-blur';blurred.alt='Generated image';var sharp=document.createElement('img');sharp.className='ai-chat-image-sharp';sharp.alt='';sharp.setAttribute('aria-hidden','true');blurred.addEventListener('load',function(){card.classList.add('ready')},{once:true});card.appendChild(blurred);card.appendChild(sharp);item.appendChild(card);list.appendChild(item);blurred.src=source;sharp.src=source;aiChatMessages.push({role:'assistant',content:'Generated image: '+String(data&&data.prompt||'')})}
  function formatAiChatAudioTime(seconds){var value=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0')}
  function finiteAiChatAudioDuration(audio){var duration=Number(audio&&audio.duration);return Number.isFinite(duration)&&duration>0?duration:0}
  function setAiChatWavePlaying(card,playing){var button=card.querySelector('.wave-play');if(button){button.classList.toggle('is-playing',!!playing);button.setAttribute('aria-label',playing?'Pause audio':'Play audio')}card.classList.toggle('is-playing',!!playing)}
  function paintAiChatWaveform(card,values){var wrap=card.querySelector('.wave-seek');if(!wrap)return;var count=values.length;var step=240/count;var width=Math.max(1.6,step*.44);var markup=values.map(function(value,index){var height=Math.max(2,Math.min(36,2+value*34));var x=index*step+(step-width)/2;var y=(44-height)/2;return '<rect x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+width.toFixed(2)+'" height="'+height.toFixed(2)+'" rx="'+Math.min(width/2,1.8).toFixed(2)+'"/>'}).join('');wrap.querySelectorAll('.wave-svg-base,.wave-svg-progress').forEach(function(svg){svg.innerHTML=markup})}
  async function renderAiChatWaveform(card,source){var count=48;paintAiChatWaveform(card,new Array(count).fill(0));var AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;var context;try{context=new AudioContextClass();var response=await fetch(source);if(!response.ok)throw new Error('Audio is unavailable');var bytes=await response.arrayBuffer();var buffer=await context.decodeAudioData(bytes.slice(0));var values=[];for(var index=0;index<count;index+=1){var from=Math.floor(buffer.length*index/count);var to=Math.max(from+1,Math.floor(buffer.length*(index+1)/count));var sampleStep=Math.max(1,Math.floor((to-from)/180));var energy=0;var peak=0;var samples=0;for(var frame=from;frame<to;frame+=sampleStep){var amplitude=0;for(var channel=0;channel<buffer.numberOfChannels;channel+=1)amplitude+=Math.abs(buffer.getChannelData(channel)[frame]||0);amplitude/=Math.max(1,buffer.numberOfChannels);energy+=amplitude*amplitude;peak=Math.max(peak,amplitude);samples+=1}values.push(Math.sqrt(energy/Math.max(1,samples))*.72+peak*.28)}var sorted=values.slice().sort(function(first,second){return first-second});var scale=sorted[Math.floor((sorted.length-1)*.92)]||sorted[sorted.length-1]||1;paintAiChatWaveform(card,values.map(function(value){return Math.min(1,value/scale)}))}catch(error){paintAiChatWaveform(card,new Array(count).fill(0))}finally{if(context)context.close().catch(function(){})}}
  function syncAiChatWave(card,audio){var wrap=card.querySelector('.wave-seek');var range=card.querySelector('.wave-range');var time=card.querySelector('.wave-time');if(!wrap||!range)return;var duration=finiteAiChatAudioDuration(audio);var current=duration?Math.min(duration,Math.max(0,Number(audio.currentTime)||0)):0;var ratio=duration?current/duration:0;wrap.style.setProperty('--wave-progress',(ratio*100).toFixed(3)+'%');range.value=String(Math.round(ratio*1000));range.disabled=!duration;if(time)time.textContent=formatAiChatAudioTime(current)}
  function startAiChatAudioProgress(card,audio){function frame(){syncAiChatWave(card,audio);if(!audio.paused&&!audio.ended)requestAnimationFrame(frame)}requestAnimationFrame(frame)}
  function downloadAiChatAudio(blob,filename){var url=URL.createObjectURL(blob);var link=document.createElement('a');link.href=url;link.download=filename||'vexa-voice.mp3';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},4000)}
  async function shareAiChatAudio(source,filename){var response=await fetch(source);if(!response.ok)throw new Error('Audio is unavailable');var blob=await response.blob();var audioName=filename||'vexa-voice.mp3';var file=typeof File==='function'?new File([blob],audioName,{type:blob.type||'audio/mpeg'}):null;var canShareFile=!!(file&&navigator.share);if(canShareFile&&navigator.canShare){try{canShareFile=navigator.canShare({files:[file]})}catch(error){canShareFile=false}}if(canShareFile){try{await navigator.share({files:[file]});return}catch(error){if(error&&error.name==='AbortError')throw error}}downloadAiChatAudio(blob,audioName)}
  function appendAiChatAudio(data){setAiChatCreatureState('happy');var list=q('aiChatMessages');var base64=String(data&&data.audioBase64||'');if(!list||!base64)return;var binary=atob(base64);var bytes=new Uint8Array(binary.length);for(var index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);var blob=new Blob([bytes],{type:'audio/mpeg'});var source=URL.createObjectURL(blob);aiChatAudioUrls.push(source);var item=document.createElement('article');item.className='ai-chat-message assistant ai-chat-audio-message';var card=document.createElement('div');card.className='wave-player show ai-chat-wave-player';card.innerHTML='<button class="wave-play" type="button" aria-label="Play audio"><span class="wave-play-shape" aria-hidden="true"><svg class="wave-play-icon" viewBox="0 0 24 24" style="stroke:none"><path d="M6.2 2.8C4.7 1.9 2.8 3 2.8 4.75v14.5c0 1.75 1.9 2.85 3.4 1.95l13.8-8.1c1.6-.95 1.6-1.25 0-2.2z"/></svg><span class="wave-pause-icon"><i></i><i></i></span></span></button><div class="wave-player-body"><div class="wave-seek" style="--wave-progress:0%"><svg class="wave-svg wave-svg-base" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"></svg><svg class="wave-svg wave-svg-progress" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"></svg><input class="wave-range" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek audio" disabled/><div class="wave-meta" aria-hidden="true"><span class="wave-time">0:00</span></div></div></div><div class="wave-actions"><button class="wave-share" type="button" aria-label="Share audio"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13.5v4A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';var audio=document.createElement('audio');audio.preload='metadata';audio.src=source;card.appendChild(audio);var play=card.querySelector('.wave-play');var range=card.querySelector('.wave-range');var wrap=card.querySelector('.wave-seek');var share=card.querySelector('.wave-share');play.addEventListener('click',function(){if(audio.paused){document.querySelectorAll('.ai-chat-wave-player audio').forEach(function(otherAudio){if(otherAudio!==audio)otherAudio.pause()});audio.play().catch(function(error){toast(error&&error.message||'Could not play audio')})}else audio.pause()});audio.addEventListener('play',function(){setAiChatWavePlaying(card,true);startAiChatAudioProgress(card,audio)});audio.addEventListener('pause',function(){setAiChatWavePlaying(card,false);syncAiChatWave(card,audio)});audio.addEventListener('loadedmetadata',function(){syncAiChatWave(card,audio)});audio.addEventListener('ended',function(){setAiChatWavePlaying(card,false);audio.currentTime=0;syncAiChatWave(card,audio)});range.addEventListener('pointerdown',function(){wrap.classList.add('is-scrubbing')});range.addEventListener('pointerup',function(){wrap.classList.remove('is-scrubbing')});range.addEventListener('pointercancel',function(){wrap.classList.remove('is-scrubbing')});range.addEventListener('input',function(){var duration=finiteAiChatAudioDuration(audio);if(!duration)return;audio.currentTime=Math.min(duration,Math.max(0,Number(range.value)||0)/1000*duration);syncAiChatWave(card,audio)});share.addEventListener('click',async function(){if(share.classList.contains('sharing'))return;share.classList.add('sharing');try{await shareAiChatAudio(source,String(data&&data.filename||'vexa-voice.mp3'))}catch(error){if(error&&error.name!=='AbortError')toast('Could not share audio')}finally{share.classList.remove('sharing')}});item.appendChild(card);list.appendChild(item);aiChatMessages.push({role:'assistant',content:'Generated voice with '+String(data&&data.voice||'Voice')+': '+String(data&&data.text||'')});syncAiChatEmptyState();renderAiChatWaveform(card,source)}
  function formatAiContextTokens(value){var amount=Math.max(0,Math.floor(Number(value)||0));if(amount>=1000000)return(amount/1000000).toFixed(2)+'M';if(amount>=1000)return(amount/1000).toFixed(amount>=100000?0:1)+'K';return String(amount)}
  function aiContextLabel(context){var data=context||{};var tokens=Math.max(0,Number(data.tokens)||0);var windowSize=Math.max(1,Number(data.window)||1050000);var percent=Math.min(100,Math.max(0,Number(data.percent)||tokens/windowSize*100));var files=Array.isArray(data.files)?data.files:[];return formatAiContextTokens(tokens)+' / '+formatAiContextTokens(windowSize)+' tokens · '+(percent<.1?percent.toFixed(2):percent.toFixed(1))+'% · '+files.length+' files'}
  function buildAiDiffPanel(preview,openFirst){var data=preview||{};var wrap=document.createElement('div');wrap.className='ai-diff-panel';(Array.isArray(data.files)?data.files:[]).forEach(function(file,index){var details=document.createElement('details');details.className='ai-diff-file';if(openFirst&&index===0)details.open=true;var summary=document.createElement('summary');var path=document.createElement('span');path.className='ai-diff-path';path.textContent=String(file.path||'file');var stats=document.createElement('span');stats.className='ai-diff-stats';var added=document.createElement('b');added.className='added';added.textContent='+'+Math.max(0,Number(file.additions)||0);var removed=document.createElement('b');removed.className='removed';removed.textContent='−'+Math.max(0,Number(file.deletions)||0);stats.appendChild(added);stats.appendChild(removed);summary.appendChild(path);summary.appendChild(stats);details.appendChild(summary);var body=document.createElement('div');body.className='ai-diff-body';(Array.isArray(file.hunks)?file.hunks:[]).forEach(function(hunk){var header=document.createElement('div');header.className='ai-diff-hunk';header.textContent='@@ -'+Math.max(0,Number(hunk.oldStart)||0)+' +'+Math.max(0,Number(hunk.newStart)||0)+' @@';body.appendChild(header);(Array.isArray(hunk.lines)?hunk.lines:[]).forEach(function(line){var row=document.createElement('div');var type=['add','remove','context'].indexOf(line.type)>=0?line.type:'context';row.className='ai-diff-line '+type;var oldNumber=document.createElement('i');oldNumber.textContent=line.oldLine==null?'':String(line.oldLine);var newNumber=document.createElement('i');newNumber.textContent=line.newLine==null?'':String(line.newLine);var sign=document.createElement('b');sign.textContent=type==='add'?'+':type==='remove'?'−':' ';var code=document.createElement('code');code.textContent=String(line.text==null?'':line.text);row.appendChild(oldNumber);row.appendChild(newNumber);row.appendChild(sign);row.appendChild(code);body.appendChild(row)});});if(file.truncated){var truncated=document.createElement('div');truncated.className='ai-diff-truncated';truncated.textContent='Preview shortened for this file';body.appendChild(truncated)}details.appendChild(body);wrap.appendChild(details)});return wrap}
  function renderAiCodingProgress(progress){if(!progress||typeof progress!=='object')return;var state=String(progress.state||'');if(!isAiCodingState(state)&&!isAiCommitState(state)&&!progress.preview&&!progress.context)return;var row=q('aiThinkingRow');if(!row)return;var workbench=q('aiCodingWorkbench');if(!workbench){workbench=document.createElement('section');workbench.id='aiCodingWorkbench';workbench.className='ai-coding-workbench';workbench.innerHTML='<div class="ai-coding-top"><span><small>Live workbench</small><strong id="aiCodingRepository">Repository</strong></span><b id="aiCodingContextLabel">Context</b></div><div class="ai-coding-context-bar"><span id="aiCodingContextFill"></span></div><div id="aiCodingContextFiles" class="ai-coding-context-files"></div><div id="aiCodingTimeline" class="ai-coding-timeline"></div><div id="aiCodingLiveDiff" class="ai-coding-live-diff"></div>';row.appendChild(workbench)}var repository=q('aiCodingRepository');if(repository&&progress.repository)repository.textContent=String(progress.repository);var context=progress.context||{};var contextLabel=q('aiCodingContextLabel');if(contextLabel)contextLabel.textContent='Context · '+aiContextLabel(context);var fill=q('aiCodingContextFill');var tokens=Math.max(0,Number(context.tokens)||0);var windowSize=Math.max(1,Number(context.window)||1050000);if(fill)fill.style.width=Math.min(100,tokens/windowSize*100)+'%';var files=q('aiCodingContextFiles');if(files){files.replaceChildren();(Array.isArray(context.files)?context.files:[]).slice(-8).forEach(function(file){var chip=document.createElement('span');chip.textContent=String(file);files.appendChild(chip)})}var event={state:state,label:String(progress.label||'Working'),detail:String(progress.detail||'')};var previous=aiCodingProgressEvents[aiCodingProgressEvents.length-1];if(!previous||previous.state!==event.state||previous.detail!==event.detail)aiCodingProgressEvents.push(event);aiCodingProgressEvents=aiCodingProgressEvents.slice(-5);var timeline=q('aiCodingTimeline');if(timeline){timeline.replaceChildren();aiCodingProgressEvents.forEach(function(item,index){var line=document.createElement('div');line.className='ai-coding-event'+(index===aiCodingProgressEvents.length-1?' active':'');var dot=document.createElement('i');var copy=document.createElement('span');var strong=document.createElement('strong');strong.textContent=item.label;var small=document.createElement('small');small.textContent=item.detail;copy.appendChild(strong);if(item.detail)copy.appendChild(small);line.appendChild(dot);line.appendChild(copy);timeline.appendChild(line)})}if(progress.preview)aiCodingPreview=progress.preview;var live=q('aiCodingLiveDiff');if(live&&aiCodingPreview){live.replaceChildren();var totals=aiCodingPreview.totals||{};var title=document.createElement('div');title.className='ai-coding-preview-title';title.innerHTML='<span>Change preview</span><b><i>+'+Math.max(0,Number(totals.additions)||0)+'</i><em>−'+Math.max(0,Number(totals.deletions)||0)+'</em></b>';live.appendChild(title);live.appendChild(buildAiDiffPanel(aiCodingPreview,false))}workbench.classList.add('visible');requestAnimationFrame(function(){workbench.scrollIntoView({block:'nearest',behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})}
  function appendAiCodingResult(activity){if(!activity||!activity.change)return;var list=q('aiChatMessages');if(!list)return;var change=activity.change||{};var preview=change.diff||{};var totals=preview.totals||{};var item=document.createElement('article');item.className='ai-chat-message assistant ai-coding-result';var card=document.createElement('section');card.className='ai-coding-result-card';var head=document.createElement('div');head.className='ai-coding-result-head';head.innerHTML='<span class="ai-coding-result-check">✓</span><span><small>Completed</small><strong>Code changes ready</strong></span>';card.appendChild(head);var summary=document.createElement('p');summary.className='ai-coding-summary';summary.textContent=String(change.summary||preview.summary||'The requested code changes are ready.');card.appendChild(summary);var stats=document.createElement('div');stats.className='ai-coding-result-stats';stats.innerHTML='<span><b>'+Math.max(0,Number(totals.files)||0)+'</b><small>files</small></span><span class="added"><b>+'+Math.max(0,Number(totals.additions)||0)+'</b><small>added</small></span><span class="removed"><b>−'+Math.max(0,Number(totals.deletions)||0)+'</b><small>removed</small></span>';card.appendChild(stats);var context=document.createElement('div');context.className='ai-coding-result-context';context.innerHTML='<span>Context</span><b></b>';context.querySelector('b').textContent=aiContextLabel(activity.context||{});card.appendChild(context);card.appendChild(buildAiDiffPanel(preview,true));var action=activity.pullRequest||activity.applied||activity.merge||change;var url=String(action&&action.url||'');if(url.indexOf('https://')===0){var link=document.createElement('a');link.className='ai-coding-result-link';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=activity.pullRequest?'Open pull request':'Open on GitHub';card.appendChild(link)}item.appendChild(card);list.appendChild(item);syncAiChatEmptyState();requestAnimationFrame(function(){item.scrollIntoView({block:'nearest',behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})}
  function showAiThinking(){setAiChatCreatureState('thinking');var list=q('aiChatMessages');if(!list)return;hideAiThinking();aiCodingProgressEvents=[];aiCodingPreview=null;var row=document.createElement('div');row.id='aiThinkingRow';row.className='ai-thinking-row';row.setAttribute('data-state','thinking');row.innerHTML='<div class="ai-thinking-head"><canvas id="aiThinkingOrb" class="ai-thinking-orb" width="96" height="96" aria-hidden="true"></canvas><span class="ai-thinking-label">Thinking</span></div>';list.appendChild(row);syncAiChatEmptyState();var page=q('aiChatPage');if(page)page.classList.add('thinking');startAiThinkingOrb()}
  function setAiThinkingState(payload){var row=q('aiThinkingRow');if(!row)return;var progress=payload&&typeof payload==='object'?payload:null;var state=progress?String(progress.state||'thinking'):String(payload||'thinking');var next='thinking';var labelText='Thinking';if(state==='searching'){next='searching';labelText='Searching…'}else if(state==='reading_repository'){next='reading_repository';labelText='Reading repository'}else if(state==='writing_code'||isAiCodingState(state)||isAiCommitState(state)){next=state;labelText='Writing code'}else if(state==='generating_voice'){next='generating_voice';labelText='Generating voice'}if(progress){next=state||next;labelText=String(progress.label||labelText);renderAiCodingProgress(progress)}setAiChatCreatureState(next==='searching'?'searching':'thinking');row.setAttribute('data-state',next);var label=row.querySelector('.ai-thinking-label');if(label)label.textContent=labelText;if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){var canvas=q('aiThinkingOrb');drawAiThinkingOrb(canvas,performance.now()/1000,next==='searching'?1:0,next==='generating_voice'?1:0)}}
  function hideAiThinking(){setAiChatCreatureState('idle');stopAiThinkingOrb();var row=q('aiThinkingRow');if(row)row.remove();var page=q('aiChatPage');if(page)page.classList.remove('thinking')}
  async function sendAiChat(){if(aiChatBusy)return;var input=q('aiChatInput');var keepKeyboard=aiChatSendKeepsKeyboard||!!(input&&document.activeElement===input);aiChatSendKeepsKeyboard=false;if(keepKeyboard&&input)input.focus();var typed=String(input&&input.value||'').trim();var attachment=aiChatAttachment;if(!typed&&!attachment)return;var message=typed||(attachment.isImage?'What is in this image?':'Analyze this attachment.');if(attachment){aiChatMessages.forEach(function(item){if(item&&item.attachment)delete item.attachment})}appendAiChatMessage('user',message,false,attachment);clearAiChatAttachment();if(input){input.value='';resizeAiChatInput()}aiChatBusy=true;var send=q('aiChatSend');var attach=q('aiChatAttach');if(send)send.disabled=true;if(attach)attach.disabled=true;showAiThinking();try{var requestMessages=aiChatMessages.slice(-20).map(function(item){return Object.assign({},item)});var latestRequest=requestMessages[requestMessages.length-1];if(latestRequest&&latestRequest.role==='user')latestRequest.preferredVoice=aiChatPreferredVoice;var data=await streamAiChat({messages:requestMessages},setAiThinkingState);updateAiChatHeader(data);if(data.type==='image_request'){hideAiThinking();showAiImageGenerating();var imageData=await api('/mini-app/api/image',{prompt:String(data.prompt||message),size:String(data.size||'1024x1024')});hideAiImageGenerating();imageData.prompt=String(data.prompt||message);updateAiChatHeader(imageData);appendAiChatImage(imageData)}else if(data.type==='speech_request'){setAiThinkingState('generating_voice');var audioData=await api('/mini-app/api/tts',{text:String(data.text||''),voice:String(data.voice||'Nora')});hideAiThinking();audioData.text=String(data.text||'');updateAiChatHeader(audioData);appendAiChatAudio(audioData)}else{hideAiThinking();appendAiCodingResult(data.codingActivity);await appendAiChatMessage('assistant',String(data.message||''),true)}}catch(error){hideAiThinking();hideAiImageGenerating();var errorMessage=error.message||'Could not reach AI';if(error.status===402||String(errorMessage).indexOf('Not enough credits')===0){await appendAiChatMessage('assistant',String(errorMessage),true)}else toast(errorMessage)}finally{aiChatBusy=false;if(send)send.disabled=false;if(attach)attach.disabled=false}}
  async function streamAiChat(body,onStatus){var response;try{response=await fetch('/mini-app/api/chat',{method:'POST',headers:{'content-type':'application/json','accept':'application/x-ndjson'},cache:'no-store',body:JSON.stringify(Object.assign({initData:initData},body||{}))})}catch(error){throw new Error('Connection interrupted · Try again')}if(!response.ok){var failed=await response.json().catch(function(){return{error:'Request failed'}});throw new Error(failed.error||'Request failed')}if(!response.body)throw new Error('Invalid response');var reader=response.body.getReader();var decoder=new TextDecoder();var buffer='';var result=null;var newline=String.fromCharCode(10);function consume(line){var clean=String(line||'').trim();if(!clean)return;var event;try{event=JSON.parse(clean)}catch(error){return}if(event.type==='status'||event.type==='progress'){if(typeof onStatus==='function')onStatus(event.type==='progress'?event.data:event.status);return}if(event.type==='error')throw new Error(event.error||'Could not reach AI');if(event.type==='result')result=event.data}while(true){var chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});var index=buffer.indexOf(newline);while(index>=0){consume(buffer.slice(0,index));buffer=buffer.slice(index+1);index=buffer.indexOf(newline)}if(chunk.done)break}if(buffer.trim())consume(buffer);if(!result)throw new Error('Invalid response');return result}
  function closeAiChat(){window.location.replace('/mini-app')}
  function closeAiChatKeyboard(){var input=q('aiChatInput');if(input&&document.activeElement===input)input.blur();if(tg&&typeof tg.hideKeyboard==='function'){try{tg.hideKeyboard()}catch(e){}}}
  function showAiChatLocked(data){var page=q('aiChatPage');if(!page)return;page.innerHTML='<main class="lock-screen"><section class="lock-card" aria-label="AI Chat update"><p class="lock-title"><span>Updating</span><span class="lock-dots" aria-hidden="true"><i></i><i></i><i></i></span></p><div class="lock-bar" aria-hidden="true"><span id="aiChatLockFill"></span></div></section></main>';var fill=q('aiChatLockFill');var serverNow=Number(data.serverNow)||Math.floor(Date.now()/1000);var lockedUntil=Number(data.lockedUntil)||serverNow+60;var lockedFrom=Number(data.lockedFrom)||Math.max(serverNow,lockedUntil-60);var total=Math.max(1,lockedUntil-lockedFrom);var offset=serverNow-Date.now()/1000;function tick(){var now=Date.now()/1000+offset;var progress=Math.min(100,Math.max(0,(now-lockedFrom)/total*100));if(fill)fill.style.width=progress+'%';if(now>=lockedUntil){clearInterval(lockTimer);location.reload()}}tick();lockTimer=setInterval(tick,500)}
  async function loadAiChat(){try{var data=await api('/mini-app/api/session',{});var lock=data.locked?data:(data.aiChatLock||{locked:false});if(lock.locked){showAiChatLocked(lock);return}updateAiChatHeader(data);api('/mini-app/api/section-open',{section:'ai_chat'}).catch(function(){})}catch(error){toast(error.message)}}
  if(tg&&tg.BackButton){try{tg.BackButton.show();tg.BackButton.onClick(closeAiChat)}catch(e){}}
  requestAnimationFrame(function(){document.documentElement.classList.add('ai-chat-ready')})
  var composer=q('aiChatComposer');if(composer)composer.addEventListener('submit',function(event){event.preventDefault();sendAiChat()});
  var send=q('aiChatSend');if(send)send.addEventListener('pointerdown',function(){var input=q('aiChatInput');aiChatSendKeepsKeyboard=!!(input&&document.activeElement===input)});
  var page=q('aiChatPage');if(page)page.addEventListener('pointerdown',function(event){var target=event.target;if(target&&target.closest&&target.closest('#aiChatComposer'))return;closeAiChatKeyboard()});
  var input=q('aiChatInput');if(input)input.addEventListener('input',resizeAiChatInput)
  var attach=q('aiChatAttach');if(attach)attach.addEventListener('click',function(){var file=q('aiChatFile');if(file)file.click()});
  var file=q('aiChatFile');if(file)file.addEventListener('change',function(){selectAiChatAttachment(file.files&&file.files[0])});
  var voiceCard=q('aiChatVoiceCard');if(voiceCard)voiceCard.addEventListener('click',toggleAiChatVoiceMenu);
  var menuButton=q('aiChatMenuButton');if(menuButton)menuButton.addEventListener('click',toggleAiChatMenu);
  var menuClose=q('aiChatMenuClose');if(menuClose)menuClose.addEventListener('click',function(){setAiChatMenu(false)});
  var menuBackdrop=q('aiChatMenuBackdrop');if(menuBackdrop)menuBackdrop.addEventListener('pointerdown',function(event){if(event.target===menuBackdrop)setAiChatMenu(false)});
  var modelMenu=q('aiChatModelMenu');if(modelMenu)modelMenu.addEventListener('click',function(event){var option=event.target&&event.target.closest?event.target.closest('.model-option[data-ai-model]'):null;if(!option)return;event.preventDefault();event.stopPropagation();selectAiChatModel(option.getAttribute('data-ai-model'))});
  var effortMenu=q('aiChatEffortMenu');if(effortMenu)effortMenu.addEventListener('click',function(event){var option=event.target&&event.target.closest?event.target.closest('[data-ai-effort]'):null;if(!option)return;event.preventDefault();event.stopPropagation();selectAiChatReasoningEffort(option.getAttribute('data-ai-effort'))});
  var memoryClear=q('aiChatMemoryClear');if(memoryClear)memoryClear.addEventListener('click',clearAiChatMemory);
  var githubButton=q('aiChatGithubButton');if(githubButton)githubButton.addEventListener('click',function(){setAiChatMenu(false)});
  var voiceMenu=q('aiChatVoiceMenu');if(voiceMenu){voiceMenu.addEventListener('click',function(event){var target=event.target;var preview=target&&target.closest?target.closest('.voice-preview'):null;var select=target&&target.closest?target.closest('.voice-select'):null;var library=target&&target.closest?target.closest('#aiChatOpenVoices'):null;if(preview){event.preventDefault();event.stopPropagation();previewAiChatVoice(preview);return}if(select){event.preventDefault();event.stopPropagation();selectAiChatVoice(select.getAttribute('data-voice'),select.getAttribute('data-voice-name'));return}if(library){event.preventDefault();event.stopPropagation();openAiChatVoicesPage()}})}
  var voicePreviewAudio=q('aiChatVoicePreviewAudio');if(voicePreviewAudio){voicePreviewAudio.addEventListener('play',function(){if(aiChatActivePreviewButton)aiChatActivePreviewButton.classList.add('playing')});voicePreviewAudio.addEventListener('pause',function(){if(aiChatActivePreviewButton)aiChatActivePreviewButton.classList.remove('playing')});voicePreviewAudio.addEventListener('ended',stopAiChatVoicePreview)}
  document.addEventListener('pointerdown',function(event){var target=event.target;if(target&&target.closest&&(target.closest('#aiChatVoiceWrap')||target.closest('#aiChatMenuPanel')||target.closest('#aiChatMenuButton')))return;setAiChatVoiceMenu(false)});
  window.addEventListener('pagehide',function(){stopAiChatVoicePreview();aiChatAudioUrls.forEach(function(url){URL.revokeObjectURL(url)});aiChatAudioUrls=[]});
  syncAiChatEmptyState();startAiThinkingOrb();loadAiChat();
})();
`;
