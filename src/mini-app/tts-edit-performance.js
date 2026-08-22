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
`;