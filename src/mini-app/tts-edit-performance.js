export const TTS_EDIT_PERFORMANCE_PATCH = String.raw`
(function installTtsEditPerformanceAnalysis(){
  if(window.__vexaTtsEditPerformanceInstalled)return;
  window.__vexaTtsEditPerformanceInstalled=true;

  var baseFetch=window.fetch.bind(window);
  var state={
    text:'',
    alignment:null,
    audioSrc:'',
    buffer:null,
    bufferSource:'',
    decodePromise:null
  };

  function normalizeAlignment(value){
    var source=value&&typeof value==='object'?value:{};
    var characters=Array.isArray(source.characters)?source.characters.map(String):[];
    var starts=Array.isArray(source.character_start_times_seconds)?source.character_start_times_seconds.map(Number):[];
    var ends=Array.isArray(source.character_end_times_seconds)?source.character_end_times_seconds.map(Number):[];
    if(!characters.length||starts.length!==characters.length||ends.length!==characters.length)return null;
    return{characters:characters,character_start_times_seconds:starts,character_end_times_seconds:ends};
  }

  function resetAudioBuffer(){
    state.buffer=null;
    state.bufferSource='';
    state.decodePromise=null;
  }

  window.addEventListener('vexa:tts-generated',function(event){
    var detail=event&&event.detail||{};
    state.text=String(detail.text||'');
    state.alignment=normalizeAlignment(detail.alignment);
    state.audioSrc=String(detail.audioSrc||'');
    resetAudioBuffer();
  });

  window.addEventListener('vexa:tts-edited',function(event){
    var detail=event&&event.detail||{};
    if(detail.text!=null)state.text=String(detail.text||state.text||'');
    if(detail.audioSrc&&String(detail.audioSrc)!==state.audioSrc){
      state.audioSrc=String(detail.audioSrc);
      resetAudioBuffer();
    }
  });

  window.addEventListener('vexa:tts-reset',function(){
    state.text='';
    state.alignment=null;
    state.audioSrc='';
    resetAudioBuffer();
  });

  function requestPath(input){
    try{
      var raw=typeof input==='string'?input:String(input&&input.url||'');
      return new URL(raw,window.location.href).pathname;
    }catch(error){return''}
  }

  function cloneInit(init,body){
    var next={};
    Object.keys(init||{}).forEach(function(key){next[key]=init[key]});
    next.body=JSON.stringify(body);
    return next;
  }

  function boundaryTime(alignment,index){
    if(!alignment||!alignment.characters.length)return 0;
    var total=alignment.characters.length;
    if(index<=0)return Math.max(0,Number(alignment.character_start_times_seconds[0])||0);
    if(index>=total)return Math.max(0,Number(alignment.character_end_times_seconds[total-1])||0);
    var left=Number(alignment.character_end_times_seconds[index-1]);
    var right=Number(alignment.character_start_times_seconds[index]);
    if(Number.isFinite(left)&&Number.isFinite(right)){
      if(right>=left)return(left+right)/2;
      return right;
    }
    return Number.isFinite(right)?right:(Number.isFinite(left)?left:0);
  }

  function isSentenceBoundary(character){
    return '.!?؟。！？\n\r'.indexOf(String(character||''))>=0;
  }

  function sentenceRange(chars,start,end){
    var from=Math.max(0,Math.min(chars.length,start));
    var to=Math.max(from,Math.min(chars.length,end));
    while(from>0&&!isSentenceBoundary(chars[from-1]))from--;
    while(from<start&&/\s/u.test(String(chars[from]||'')))from++;
    while(to<chars.length&&!isSentenceBoundary(chars[to]))to++;
    if(to<chars.length)to++;
    return{start:from,end:Math.max(from+1,to)};
  }

  function previousSentenceRange(chars,currentStart){
    if(currentStart<=0)return null;
    var end=currentStart;
    while(end>0&&/\s/u.test(String(chars[end-1]||'')))end--;
    if(end<=0)return null;
    var start=end-1;
    if(isSentenceBoundary(chars[start]))start--;
    while(start>=0&&!isSentenceBoundary(chars[start]))start--;
    start++;
    while(start<end&&/\s/u.test(String(chars[start]||'')))start++;
    return end>start?{start:start,end:end}:null;
  }

  function nextSentenceRange(chars,currentEnd){
    var start=Math.max(0,currentEnd);
    while(start<chars.length&&/\s/u.test(String(chars[start]||'')))start++;
    if(start>=chars.length)return null;
    var end=start;
    while(end<chars.length&&!isSentenceBoundary(chars[end]))end++;
    if(end<chars.length)end++;
    return end>start?{start:start,end:end}:null;
  }

  function getDecodedBuffer(){
    if(!state.audioSrc)return Promise.resolve(null);
    if(state.buffer&&state.bufferSource===state.audioSrc)return Promise.resolve(state.buffer);
    if(state.decodePromise&&state.bufferSource===state.audioSrc)return state.decodePromise;
    var source=state.audioSrc;
    state.bufferSource=source;
    var AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return Promise.resolve(null);
    state.decodePromise=baseFetch(source).then(function(response){
      if(!response.ok)throw new Error('Audio unavailable');
      return response.arrayBuffer();
    }).then(function(bytes){
      var context;
      try{context=new AudioContextClass({sampleRate:24000})}catch(error){context=new AudioContextClass()}
      return context.decodeAudioData(bytes.slice(0)).then(function(buffer){
        try{context.close()}catch(error){}
        if(state.audioSrc===source){state.buffer=buffer;state.bufferSource=source}
        return buffer;
      },function(error){try{context.close()}catch(closeError){}throw error});
    }).catch(function(){return null}).finally(function(){
      if(state.bufferSource===source)state.decodePromise=null;
    });
    return state.decodePromise;
  }

  function sampleValue(buffer,channel,frame){
    var data=buffer.getChannelData(Math.min(channel,buffer.numberOfChannels-1));
    return data[Math.max(0,Math.min(data.length-1,frame))]||0;
  }

  function analyzeEnergy(buffer,startTime,endTime){
    if(!buffer||endTime<=startTime)return null;
    var start=Math.max(0,Math.min(buffer.length-1,Math.floor(startTime*buffer.sampleRate)));
    var end=Math.max(start+1,Math.min(buffer.length,Math.ceil(endTime*buffer.sampleRate)));
    var length=end-start;
    var stride=Math.max(1,Math.floor(length/14000));
    var sum=0,peak=0,count=0;
    var frameSize=Math.max(1,Math.round(buffer.sampleRate*.045));
    var blockSum=0,blockCount=0,blockEnergy=[];
    for(var frame=start;frame<end;frame+=stride){
      var mixed=0;
      for(var channel=0;channel<buffer.numberOfChannels;channel++)mixed+=sampleValue(buffer,channel,frame);
      mixed/=Math.max(1,buffer.numberOfChannels);
      var absolute=Math.abs(mixed);
      peak=Math.max(peak,absolute);
      var square=mixed*mixed;
      sum+=square;
      blockSum+=square;
      count++;
      blockCount++;
      if((frame-start)%frameSize<stride&&blockCount>3){
        blockEnergy.push(Math.sqrt(blockSum/blockCount));
        blockSum=0;blockCount=0;
      }
    }
    if(!count)return null;
    var rms=Math.sqrt(sum/count);
    var mean=rms;
    var variance=0;
    for(var index=0;index<blockEnergy.length;index++)variance+=Math.pow(blockEnergy[index]-mean,2);
    var dynamic=blockEnergy.length?Math.sqrt(variance/blockEnergy.length)/Math.max(.00001,mean):0;
    return{
      rmsDb:Math.max(-72,Math.min(0,20*Math.log10(Math.max(.000001,rms)))),
      peak:peak,
      dynamic:Math.max(0,Math.min(3,dynamic))
    };
  }

  function estimatePitchAt(buffer,centerTime){
    if(!buffer||buffer.sampleRate<8000)return 0;
    var stride=2;
    var effectiveRate=buffer.sampleRate/stride;
    var frameLength=Math.max(320,Math.round(effectiveRate*.04));
    var center=Math.round(centerTime*buffer.sampleRate);
    var rawStart=Math.max(0,center-Math.round(frameLength*stride/2));
    if(rawStart+frameLength*stride>=buffer.length)rawStart=Math.max(0,buffer.length-frameLength*stride-1);
    var values=new Float32Array(frameLength);
    var mean=0;
    for(var index=0;index<frameLength;index++){
      var mixed=0;
      for(var channel=0;channel<buffer.numberOfChannels;channel++)mixed+=sampleValue(buffer,channel,rawStart+index*stride);
      mixed/=Math.max(1,buffer.numberOfChannels);
      values[index]=mixed;mean+=mixed;
    }
    mean/=frameLength;
    var energy=0;
    for(var current=0;current<frameLength;current++){values[current]-=mean;energy+=values[current]*values[current]}
    if(energy/frameLength<.000015)return 0;
    var minLag=Math.max(2,Math.floor(effectiveRate/420));
    var maxLag=Math.min(frameLength-4,Math.ceil(effectiveRate/70));
    var bestLag=0,bestScore=.32;
    for(var lag=minLag;lag<=maxLag;lag++){
      var correlation=0,leftEnergy=0,rightEnergy=0;
      var limit=frameLength-lag;
      for(var sample=0;sample<limit;sample++){
        var left=values[sample],right=values[sample+lag];
        correlation+=left*right;leftEnergy+=left*left;rightEnergy+=right*right;
      }
      var denominator=Math.sqrt(leftEnergy*rightEnergy)||1;
      var score=correlation/denominator;
      if(score>bestScore){bestScore=score;bestLag=lag}
    }
    return bestLag?effectiveRate/bestLag:0;
  }

  function median(values){
    if(!values.length)return 0;
    var sorted=values.slice().sort(function(a,b){return a-b});
    var middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }

  function analyzePitch(buffer,startTime,endTime){
    var duration=endTime-startTime;
    if(!buffer||duration<.12)return{pitchHz:0,pitchVariation:0};
    var count=Math.max(4,Math.min(9,Math.floor(duration/.22)+3));
    var pitches=[];
    for(var index=0;index<count;index++){
      var time=startTime+duration*(index+.5)/count;
      var pitch=estimatePitchAt(buffer,time);
      if(pitch>=70&&pitch<=430)pitches.push(pitch);
    }
    if(pitches.length<2)return{pitchHz:pitches[0]||0,pitchVariation:0};
    var center=median(pitches);
    var deviations=pitches.map(function(value){return Math.abs(value-center)});
    return{pitchHz:center,pitchVariation:Math.min(1,median(deviations)/Math.max(1,center))};
  }

  function nonSpaceCount(chars,start,end){
    var count=0;
    for(var index=start;index<end;index++)if(!/\s/u.test(String(chars[index]||'')))count++;
    return count;
  }

  function metricsForRange(buffer,alignment,chars,range){
    if(!range||range.end<=range.start)return null;
    var startTime=boundaryTime(alignment,range.start);
    var endTime=boundaryTime(alignment,range.end);
    if(!Number.isFinite(startTime)||!Number.isFinite(endTime)||endTime-startTime<.05)return null;
    var energy=analyzeEnergy(buffer,startTime,endTime)||{rmsDb:-40,peak:0,dynamic:0};
    var pitch=analyzePitch(buffer,startTime,endTime);
    return{
      rmsDb:Number(energy.rmsDb.toFixed(2)),
      peak:Number(energy.peak.toFixed(4)),
      dynamic:Number(energy.dynamic.toFixed(3)),
      pitchHz:Number((pitch.pitchHz||0).toFixed(1)),
      pitchVariation:Number((pitch.pitchVariation||0).toFixed(3)),
      charsPerSecond:Number((nonSpaceCount(chars,range.start,range.end)/Math.max(.05,endTime-startTime)).toFixed(2)),
      duration:Number((endTime-startTime).toFixed(3))
    };
  }

  function pauseAt(alignment,index){
    if(!alignment||index<=0||index>=alignment.characters.length)return 0;
    var left=Number(alignment.character_end_times_seconds[index-1]);
    var right=Number(alignment.character_start_times_seconds[index]);
    if(!Number.isFinite(left)||!Number.isFinite(right))return 0;
    return Math.max(0,Math.min(2500,(right-left)*1000));
  }

  async function buildPerformanceProfile(body){
    var alignment=state.alignment;
    var text=String(state.text||'');
    if(!alignment||!state.audioSrc||!text)return null;
    var chars=Array.from(text);
    if(alignment.characters.join('')!==chars.join(''))return null;
    var start=Math.max(0,Math.min(chars.length,Number.parseInt(String(body.start),10)||0));
    var end=Math.max(start,Math.min(chars.length,Number.parseInt(String(body.end),10)||start));
    if(end<=start)return null;
    var buffer=await getDecodedBuffer();
    if(!buffer)return null;
    var targetRange=sentenceRange(chars,start,end);
    var beforeRange=previousSentenceRange(chars,targetRange.start);
    var afterRange=nextSentenceRange(chars,targetRange.end);
    var target=metricsForRange(buffer,alignment,chars,targetRange);
    if(!target)return null;
    var before=metricsForRange(buffer,alignment,chars,beforeRange);
    var after=metricsForRange(buffer,alignment,chars,afterRange);
    var contextValues=[before,after].filter(Boolean);
    var contextRms=contextValues.length?contextValues.reduce(function(sum,item){return sum+item.rmsDb},0)/contextValues.length:target.rmsDb;
    var contextPace=contextValues.length?contextValues.reduce(function(sum,item){return sum+item.charsPerSecond},0)/contextValues.length:target.charsPerSecond;
    return{
      version:1,
      target:target,
      before:before,
      after:after,
      relativeEnergyDb:Number((target.rmsDb-contextRms).toFixed(2)),
      paceRatio:Number((target.charsPerSecond/Math.max(.1,contextPace)).toFixed(3)),
      pauseBeforeMs:Number(pauseAt(alignment,targetRange.start).toFixed(1)),
      pauseAfterMs:Number(pauseAt(alignment,targetRange.end).toFixed(1))
    };
  }

  window.fetch=async function(input,init){
    var path=requestPath(input);
    var preparedInit=init;
    if(path==='/mini-app/api/tts-regenerate'&&init&&typeof init.body==='string'){
      try{
        var body=JSON.parse(init.body);
        var profile=await buildPerformanceProfile(body);
        if(profile){body.performanceProfile=profile;preparedInit=cloneInit(init,body)}
      }catch(error){}
    }
    var response=await baseFetch(input,preparedInit);
    try{
      if(path==='/mini-app/api/tts-edit-save'&&response.ok){
        response.clone().json().then(function(data){
          var alignment=normalizeAlignment(data&&data.alignment);
          if(alignment)state.alignment=alignment;
          if(data&&data.text!=null)state.text=String(data.text||state.text||'');
        }).catch(function(){});
      }else if(path==='/mini-app/api/tts-audio-edit-save'&&response.ok){
        state.alignment=null;
      }
    }catch(error){}
    return response;
  };
})();

(function installLiquidMetalButtons(){
  if(window.__vexaLiquidMetalInstalled)return;
  window.__vexaLiquidMetalInstalled=true;

  var targets=[
    {id:'convertButton',labelSelector:'.tts-generate-label',fallback:'Generate Voice'},
    {id:'generateImageButton',labelSelector:'#generateImageLabel',fallback:'Generate image'},
    {id:'vexaSttRecord',labelSelector:'#vexaSttRecordLabel',fallback:'Tap to speak'}
  ];
  var watchedDocuments=new WeakSet();
  var decoratedButtons=new WeakMap();

  function ensureStyles(doc){
    if(!doc||!doc.head||doc.getElementById('vexaLiquidMetalStyles'))return;
    var style=doc.createElement('style');
    style.id='vexaLiquidMetalStyles';
    style.textContent=[
      'button.vexa-liquid-metal-button{position:relative!important;padding:0!important;background:transparent!important;border:0!important;outline:none!important;box-shadow:none!important;overflow:visible!important;border-radius:100px!important;opacity:1!important;transform:none!important;isolation:isolate!important}',
      'button.vexa-liquid-metal-button:disabled,button.vexa-liquid-metal-button.empty{opacity:1!important}',
      'button.vexa-liquid-metal-button:active{transform:none!important}',
      'button.vexa-liquid-metal-button::before,button.vexa-liquid-metal-button::after{display:none!important;content:none!important}',
      'button.vexa-liquid-metal-button>.vexa-lm-original{opacity:0!important;visibility:hidden!important;pointer-events:none!important}',
      '.vexa-lm-stage{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;pointer-events:none!important;overflow:visible!important;z-index:1!important;perspective:1000px!important;perspective-origin:50% 50%!important}',
      '.vexa-lm-root{position:relative!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;transform:none!important}',
      '.vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;pointer-events:none!important}',
      '.vexa-lm-content{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;transform:translateZ(20px)!important;z-index:30!important}',
      '.vexa-lm-label{font-size:14px!important;color:#666666!important;font-weight:400!important;line-height:1!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1)!important;transform:scale(1)!important;white-space:nowrap!important;font-family:inherit!important}',
      '.vexa-lm-inner-layer{transform:translateZ(10px) translateY(0) scale(1)!important;z-index:20!important}',
      '.vexa-lm-inner{position:absolute!important;inset:2px!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease,box-shadow .15s cubic-bezier(.4,0,.2,1)!important}',
      '.vexa-lm-shader-layer{transform:translateZ(0) translateY(0) scale(1)!important;z-index:10!important}',
      '.vexa-lm-shader-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:100px!important;background:rgb(0 0 0 / 0)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease,box-shadow .15s cubic-bezier(.4,0,.2,1)!important}',
      '.vexa-lm-shader{position:absolute!important;inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;transition:width .4s ease,height .4s ease!important}',
      '.vexa-lm-shader canvas{width:100%!important;height:100%!important;display:block!important;position:absolute!important;top:0!important;left:0!important;border-radius:100px!important}',
      'button.vexa-liquid-metal-button.vexa-lm-hover .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}',
      'button.vexa-liquid-metal-button.vexa-lm-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}',
      '.vexa-lm-ripple-layer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;pointer-events:none!important;z-index:40!important}',
      '.vexa-lm-ripple{position:absolute!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important}',
      '@keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}'
    ].join('');
    doc.head.appendChild(style);
  }

  function span(doc,className){
    var node=doc.createElement('span');
    node.className=className;
    node.setAttribute('aria-hidden','true');
    return node;
  }

  function labelText(button,target){
    if(target.id==='vexaSttRecord'){
      var shell=button.closest('.vexa-stt');
      if(shell&&shell.classList.contains('processing'))return'Transcribing';
    }
    var source=button.querySelector(target.labelSelector);
    var text=String(source&&source.textContent||'').trim();
    return text||target.fallback;
  }

  function destroyDecoration(button){
    var record=decoratedButtons.get(button);
    if(!record)return;
    try{if(record.labelObserver)record.labelObserver.disconnect()}catch(error){}
    try{if(record.stateObserver)record.stateObserver.disconnect()}catch(error){}
    try{if(record.mount&&record.mount.destroy)record.mount.destroy()}catch(error){}
    decoratedButtons.delete(button);
  }

  function decorate(button,target,library){
    if(!button||decoratedButtons.has(button))return;
    var doc=button.ownerDocument;
    ensureStyles(doc);

    var originalChildren=Array.prototype.slice.call(button.children);
    originalChildren.forEach(function(child){child.classList.add('vexa-lm-original')});

    var stage=span(doc,'vexa-lm-stage');
    var root=span(doc,'vexa-lm-root');
    var content=span(doc,'vexa-lm-content');
    var label=span(doc,'vexa-lm-label');
    var innerLayer=span(doc,'vexa-lm-inner-layer');
    var inner=span(doc,'vexa-lm-inner');
    var shaderLayer=span(doc,'vexa-lm-shader-layer');
    var shaderFrame=span(doc,'vexa-lm-shader-frame');
    var shaderHost=span(doc,'vexa-lm-shader');
    var rippleLayer=span(doc,'vexa-lm-ripple-layer');

    label.textContent=labelText(button,target);
    content.appendChild(label);
    innerLayer.appendChild(inner);
    shaderFrame.appendChild(shaderHost);
    shaderLayer.appendChild(shaderFrame);
    root.appendChild(content);
    root.appendChild(innerLayer);
    root.appendChild(shaderLayer);
    stage.appendChild(root);
    stage.appendChild(rippleLayer);
    button.appendChild(stage);
    button.classList.add('vexa-liquid-metal-button');
    button.setAttribute('data-vexa-liquid-metal','1');

    var mount=null;
    try{
      mount=new library.ShaderMount(
        shaderHost,
        library.liquidMetalFragmentShader,
        {
          u_repetition:4,
          u_softness:.5,
          u_shiftRed:.3,
          u_shiftBlue:.3,
          u_distortion:0,
          u_contour:0,
          u_angle:45,
          u_scale:8,
          u_shape:1,
          u_offsetX:.1,
          u_offsetY:-.1
        },
        undefined,
        .6
      );
    }catch(error){
      try{stage.remove()}catch(removeError){}
      button.classList.remove('vexa-liquid-metal-button');
      button.removeAttribute('data-vexa-liquid-metal');
      originalChildren.forEach(function(child){child.classList.remove('vexa-lm-original')});
      console.error('[Vexa] Liquid Metal shader mount failed',error);
      return;
    }

    var record={mount:mount,labelObserver:null,stateObserver:null};
    decoratedButtons.set(button,record);

    function syncLabel(){
      var next=labelText(button,target);
      if(label.textContent!==next)label.textContent=next;
    }

    var sourceLabel=button.querySelector(target.labelSelector);
    var MutationObserverClass=doc.defaultView&&doc.defaultView.MutationObserver||MutationObserver;
    if(sourceLabel){
      record.labelObserver=new MutationObserverClass(syncLabel);
      record.labelObserver.observe(sourceLabel,{childList:true,subtree:true,characterData:true});
    }
    if(target.id==='vexaSttRecord'){
      var shell=button.closest('.vexa-stt');
      if(shell){
        record.stateObserver=new MutationObserverClass(syncLabel);
        record.stateObserver.observe(shell,{attributes:true,attributeFilter:['class']});
      }
    }

    button.addEventListener('mouseenter',function(){
      button.classList.add('vexa-lm-hover');
      if(mount&&mount.setSpeed)mount.setSpeed(1);
    });
    button.addEventListener('mouseleave',function(){
      button.classList.remove('vexa-lm-hover','vexa-lm-pressed');
      if(mount&&mount.setSpeed)mount.setSpeed(.6);
    });
    button.addEventListener('pointerdown',function(){
      if(button.disabled)return;
      button.classList.add('vexa-lm-pressed');
    });
    function release(){button.classList.remove('vexa-lm-pressed')}
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('click',function(event){
      if(button.disabled)return;
      if(mount&&mount.setSpeed){
        mount.setSpeed(2.4);
        setTimeout(function(){
          if(mount&&mount.setSpeed)mount.setSpeed(button.classList.contains('vexa-lm-hover')?1:.6);
        },300);
      }
      var rect=button.getBoundingClientRect();
      var ripple=span(doc,'vexa-lm-ripple');
      var clientX=Number(event.clientX),clientY=Number(event.clientY);
      ripple.style.left=String(Number.isFinite(clientX)&&clientX>0?clientX-rect.left:rect.width/2)+'px';
      ripple.style.top=String(Number.isFinite(clientY)&&clientY>0?clientY-rect.top:rect.height/2)+'px';
      rippleLayer.appendChild(ripple);
      setTimeout(function(){try{ripple.remove()}catch(error){}},600);
    });

    var view=doc.defaultView;
    if(view)view.addEventListener('pagehide',function(){destroyDecoration(button)},{once:true});
  }

  function scanDocument(doc,library){
    targets.forEach(function(target){
      var button=doc.getElementById(target.id);
      if(button)decorate(button,target,library);
    });
  }

  function nodeContainsTarget(node){
    if(!node||node.nodeType!==1)return false;
    if(node.matches&&node.matches('#convertButton,#generateImageButton,#vexaSttRecord'))return true;
    return !!(node.querySelector&&node.querySelector('#convertButton,#generateImageButton,#vexaSttRecord'));
  }

  function watchDocument(doc,library){
    if(!doc||!doc.documentElement||watchedDocuments.has(doc))return;
    watchedDocuments.add(doc);
    ensureStyles(doc);
    scanDocument(doc,library);
    var MutationObserverClass=doc.defaultView&&doc.defaultView.MutationObserver||MutationObserver;
    var observer=new MutationObserverClass(function(mutations){
      for(var i=0;i<mutations.length;i++){
        var added=mutations[i].addedNodes||[];
        for(var j=0;j<added.length;j++){
          if(nodeContainsTarget(added[j])){scanDocument(doc,library);return}
        }
      }
    });
    observer.observe(doc.documentElement,{childList:true,subtree:true});
    if(doc.defaultView)doc.defaultView.addEventListener('pagehide',function(){try{observer.disconnect()}catch(error){}},{once:true});
  }

  function watchFrame(frame,library){
    if(!frame||frame.getAttribute('data-vexa-liquid-metal-frame')==='1')return;
    frame.setAttribute('data-vexa-liquid-metal-frame','1');
    function attach(){
      try{if(frame.contentDocument)watchDocument(frame.contentDocument,library)}catch(error){}
    }
    frame.addEventListener('load',attach);
    attach();
  }

  import('https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.80/+esm').then(function(library){
    if(!library||!library.ShaderMount||!library.liquidMetalFragmentShader)return;
    watchDocument(document,library);
    document.querySelectorAll('iframe').forEach(function(frame){watchFrame(frame,library)});
    var frameObserver=new MutationObserver(function(mutations){
      for(var i=0;i<mutations.length;i++){
        var added=mutations[i].addedNodes||[];
        for(var j=0;j<added.length;j++){
          var node=added[j];
          if(!node||node.nodeType!==1)continue;
          if(node.tagName==='IFRAME')watchFrame(node,library);
          if(node.querySelectorAll)node.querySelectorAll('iframe').forEach(function(frame){watchFrame(frame,library)});
        }
      }
    });
    frameObserver.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('pagehide',function(){try{frameObserver.disconnect()}catch(error){}},{once:true});
  }).catch(function(error){
    console.error('[Vexa] Liquid Metal shader import failed',error);
  });
})();
`;