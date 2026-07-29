export const TTS_EDITING_JS = `
(function(){
  var state={
    ready:false,
    active:false,
    busy:false,
    historyId:'',
    revision:0,
    voiceId:'',
    baseText:'',
    alignment:null,
    audioSrc:'',
    audioMime:'audio/mpeg',
    objectUrl:''
  };

  function q(id){return document.getElementById(id)}
  function editor(){return document.querySelector('[data-dialogue-text]')}
  function editButton(){return q('ttsEditButton')}
  function generateButton(){return q('convertButton')}
  function generateLabel(){var button=generateButton();return button&&button.querySelector('.tts-generate-label')}
  function editSurface(){return q('dialogueEditor')}
  function initData(){var tg=window.Telegram&&window.Telegram.WebApp;return tg&&tg.initData?tg.initData:''}

  async function api(path,body){
    var response=await fetch(path,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      cache:'no-store',
      body:JSON.stringify(Object.assign({initData:initData()},body||{}))
    });
    var data=await response.json().catch(function(){return{error:'Invalid response'}});
    if(!response.ok)throw new Error(data.error||'Request failed');
    return data;
  }

  function toast(message){
    var node=q('toast');
    if(!node)return;
    node.textContent=String(message||'');
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(function(){node.classList.remove('show')},2600);
  }

  function haptic(style){
    var tg=window.Telegram&&window.Telegram.WebApp;
    try{if(tg&&tg.HapticFeedback&&tg.HapticFeedback.impactOccurred)tg.HapticFeedback.impactOccurred(style||'light')}catch(error){}
  }

  function setReady(ready){
    state.ready=!!ready;
    var button=editButton();
    if(!button)return;
    button.disabled=!state.ready||state.busy;
    button.classList.toggle('is-ready',state.ready);
    button.setAttribute('aria-disabled',button.disabled?'true':'false');
  }

  function setMode(active){
    var input=editor();
    var surface=editSurface();
    var edit=editButton();
    var generate=generateButton();
    var label=generateLabel();
    document.body.classList.toggle('tts-edit-inline-active',!!active);
    if(surface)surface.classList.toggle('tts-inline-edit',!!active);
    if(edit){
      edit.classList.toggle('active',!!active);
      edit.setAttribute('aria-pressed',active?'true':'false');
      edit.setAttribute('aria-label',active?'Cancel voice edit':'Edit generated voice');
    }
    if(label)label.textContent=active?'Regenerate':'Generate Voice';
    if(generate){
      generate.classList.remove('tts-edit-loading');
      generate.disabled=active?!hasChange():false;
      generate.setAttribute('aria-label',active?'Regenerate selected text':'Generate Voice');
    }
    if(input)input.setAttribute('aria-label',active?'Edit generated text':'Text to convert to voice');
  }

  function openEdit(){
    if(!state.ready||state.busy||state.active)return;
    var input=editor();
    if(!input)return;
    if(String(input.value||'')!==state.baseText){
      setReady(false);
      toast('Generate this text before editing the voice');
      return;
    }
    if(document.activeElement===input)input.blur();
    state.active=true;
    setMode(true);
    haptic('light');
  }

  function closeEdit(restore){
    if(!state.active||state.busy)return;
    var input=editor();
    if(restore&&input&&input.value!==state.baseText){
      input.value=state.baseText;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    state.active=false;
    setMode(false);
    if(input)input.blur();
    haptic('light');
  }

  function setBusy(busy){
    state.busy=!!busy;
    var input=editor();
    var generate=generateButton();
    var edit=editButton();
    if(input)input.readOnly=busy;
    if(generate){
      generate.classList.toggle('loading',busy);
      generate.classList.toggle('tts-edit-loading',busy);
      generate.disabled=busy||!hasChange();
    }
    if(edit)edit.disabled=busy||!state.ready;
  }

  function diff(){
    var input=editor();
    var oldChars=Array.from(state.baseText||'');
    var newText=input?String(input.value||''):'';
    var newChars=Array.from(newText);
    var prefix=0;
    while(prefix<oldChars.length&&prefix<newChars.length&&oldChars[prefix]===newChars[prefix])prefix++;
    var suffix=0;
    while(
      suffix<oldChars.length-prefix&&
      suffix<newChars.length-prefix&&
      oldChars[oldChars.length-1-suffix]===newChars[newChars.length-1-suffix]
    )suffix++;
    return{
      start:prefix,
      end:oldChars.length-suffix,
      replacement:newChars.slice(prefix,newChars.length-suffix).join(''),
      newText:newText
    };
  }

  function hasChange(){
    if(!state.active)return false;
    var change=diff();
    return change.end>change.start&&Array.from(change.replacement).length>0&&change.newText!==state.baseText;
  }

  function syncChange(){
    if(!state.active||state.busy)return;
    var button=generateButton();
    if(button)button.disabled=!hasChange();
  }

  async function regenerate(){
    if(!state.active||state.busy||!hasChange())return;
    var change=diff();
    setBusy(true);
    try{
      var prepared=await api('/mini-app/api/tts-regenerate',{
        historyId:state.historyId,
        revision:state.revision,
        voice:state.voiceId,
        start:change.start,
        end:change.end,
        replacement:change.replacement
      });
      var merged=await mergeAudio(
        state.audioSrc,
        prepared.replacementAudioBase64,
        Number(prepared.startTime),
        Number(prepared.endTime)
      );
      var audioBase64=arrayBufferToBase64(await merged.blob.arrayBuffer());
      var saved=await api('/mini-app/api/tts-edit-save',{
        token:prepared.token,
        audioBase64:audioBase64,
        mimeType:'audio/wav'
      });

      if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
      state.objectUrl=URL.createObjectURL(merged.blob);
      state.audioSrc=state.objectUrl;
      state.audioMime='audio/wav';
      state.baseText=String(saved.text||prepared.newText||change.newText);
      state.alignment=saved.alignment||prepared.newAlignment;
      state.revision=Number(saved.revision||state.revision+1);

      var input=editor();
      if(input){
        input.value=state.baseText;
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
      var audio=q('ttsAudio');
      if(audio){audio.pause();audio.src=state.audioSrc;audio.load()}
      window.dispatchEvent(new CustomEvent('vexa:tts-edited',{detail:{
        filename:saved.filename,
        text:state.baseText,
        revision:state.revision,
        audioSrc:state.audioSrc,
        mimeType:state.audioMime
      }}));
      setBusy(false);
      state.active=false;
      setMode(false);
      haptic('medium');
      toast('Voice updated · '+Number(prepared.cost||0)+' credits');
    }catch(error){
      var message=error&&error.message?error.message:'Could not regenerate this section';
      toast(message);
      setBusy(false);
      syncChange();
    }
  }

  async function mergeAudio(originalSrc,replacementBase64,startTime,endTime){
    if(!originalSrc)throw new Error('Original audio is unavailable');
    var AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw new Error('Audio editing is not supported on this device');
    var context;try{context=new AudioContextClass({sampleRate:24000})}catch(error){context=new AudioContextClass()}
    try{
      var originalBytes=await fetch(originalSrc).then(function(response){return response.arrayBuffer()});
      var replacementBytes=base64ToArrayBuffer(replacementBase64);
      var decoded=await Promise.all([
        context.decodeAudioData(originalBytes.slice(0)),
        context.decodeAudioData(replacementBytes.slice(0))
      ]);
      var original=decoded[0],replacement=decoded[1];
      var sampleRate=original.sampleRate;
      var startFrame=Math.max(0,Math.min(original.length,Math.round(startTime*sampleRate)));
      var endFrame=Math.max(startFrame,Math.min(original.length,Math.round(endTime*sampleRate)));
      var quietRadius=Math.max(1,Math.round(sampleRate*.012));
      startFrame=findQuietFrame(original,startFrame,quietRadius);
      endFrame=Math.max(startFrame,findQuietFrame(original,endFrame,quietRadius));
      var replacementFrames=Math.max(1,Math.round(replacement.duration*sampleRate));
      var channels=Math.min(2,Math.max(original.numberOfChannels,replacement.numberOfChannels));
      var output=context.createBuffer(channels,startFrame+replacementFrames+(original.length-endFrame),sampleRate);

      for(var channel=0;channel<channels;channel++){
        var target=output.getChannelData(channel);
        var originalData=original.getChannelData(Math.min(channel,original.numberOfChannels-1));
        var replacementData=replacement.getChannelData(Math.min(channel,replacement.numberOfChannels-1));
        target.set(originalData.subarray(0,startFrame),0);
        copyResampled(replacementData,replacement.sampleRate,target,startFrame,replacementFrames,sampleRate);
        target.set(originalData.subarray(endFrame),startFrame+replacementFrames);
        softenJoin(target,startFrame,sampleRate);
        softenJoin(target,startFrame+replacementFrames,sampleRate);
      }
      return{blob:encodeWav(output)};
    }finally{
      context.close().catch(function(){});
    }
  }

  function findQuietFrame(buffer,frame,radius){
    var minimum=Math.max(0,frame-radius);
    var maximum=Math.min(buffer.length-1,frame+radius);
    var bestFrame=Math.max(minimum,Math.min(maximum,frame));
    var bestScore=Infinity;
    for(var candidate=minimum;candidate<=maximum;candidate++){
      var score=0;
      for(var channel=0;channel<buffer.numberOfChannels;channel++){
        var samples=buffer.getChannelData(channel);
        var current=samples[candidate]||0;
        var previous=samples[Math.max(0,candidate-1)]||0;
        score+=Math.abs(current)+Math.abs(current-previous)*.35;
      }
      if(score<bestScore){bestScore=score;bestFrame=candidate}
    }
    return bestFrame;
  }

  function copyResampled(source,sourceRate,target,targetOffset,targetLength,targetRate){
    if(sourceRate===targetRate&&source.length===targetLength){
      target.set(source,targetOffset);
      return;
    }
    var scale=(source.length-1)/Math.max(1,targetLength-1);
    for(var index=0;index<targetLength;index++){
      var position=index*scale;
      var left=Math.floor(position);
      var right=Math.min(source.length-1,left+1);
      var mix=position-left;
      target[targetOffset+index]=source[left]*(1-mix)+source[right]*mix;
    }
  }

  function softenJoin(samples,position,sampleRate){
    var width=Math.min(Math.round(sampleRate*.008),position,samples.length-position);
    if(width<2)return;
    for(var index=0;index<width;index++){
      var amount=(index+1)/(width+1);
      samples[position-width+index]*=Math.cos(amount*Math.PI*.5);
      samples[position+index]*=Math.sin(amount*Math.PI*.5);
    }
  }

  function encodeWav(buffer){
    var channels=buffer.numberOfChannels;
    var sampleRate=buffer.sampleRate;
    var frames=buffer.length;
    var bytesPerSample=2;
    var blockAlign=channels*bytesPerSample;
    var output=new ArrayBuffer(44+frames*blockAlign);
    var view=new DataView(output);
    writeAscii(view,0,'RIFF');
    view.setUint32(4,36+frames*blockAlign,true);
    writeAscii(view,8,'WAVE');
    writeAscii(view,12,'fmt ');
    view.setUint32(16,16,true);
    view.setUint16(20,1,true);
    view.setUint16(22,channels,true);
    view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*blockAlign,true);
    view.setUint16(32,blockAlign,true);
    view.setUint16(34,16,true);
    writeAscii(view,36,'data');
    view.setUint32(40,frames*blockAlign,true);
    var channelData=[];
    for(var channel=0;channel<channels;channel++)channelData.push(buffer.getChannelData(channel));
    var offset=44;
    for(var frame=0;frame<frames;frame++){
      for(var current=0;current<channels;current++){
        var sample=Math.max(-1,Math.min(1,channelData[current][frame]));
        view.setInt16(offset,sample<0?sample*32768:sample*32767,true);
        offset+=2;
      }
    }
    return new Blob([output],{type:'audio/wav'});
  }

  function writeAscii(view,offset,value){
    for(var index=0;index<value.length;index++)view.setUint8(offset+index,value.charCodeAt(index));
  }

  function base64ToArrayBuffer(value){
    var binary=atob(String(value||''));
    var bytes=new Uint8Array(binary.length);
    for(var index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return bytes.buffer;
  }

  function arrayBufferToBase64(buffer){
    var bytes=new Uint8Array(buffer);
    var binary='';
    var size=32768;
    for(var index=0;index<bytes.length;index+=size){
      binary+=String.fromCharCode.apply(null,bytes.subarray(index,index+size));
    }
    return btoa(binary);
  }


  window.addEventListener('vexa:tts-generated',function(event){
    var data=event&&event.detail||{};
    if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl=''}
    state.historyId=String(data.historyId||'');
    state.revision=Number(data.revision||0);
    state.voiceId=String(data.voiceId||'');
    state.baseText=String(data.text||'');
    state.alignment=data.alignment||null;
    state.audioSrc=String(data.audioSrc||'');
    state.audioMime='audio/mpeg';
    state.active=false;
    setMode(false);
    setReady(!!(data.editable&&state.historyId&&state.alignment&&state.audioSrc));
  });

  window.addEventListener('vexa:tts-reset',function(){
    if(state.active&&!state.busy)closeEdit(true);
    setReady(false);
  });

  document.addEventListener('input',function(event){
    if(state.active&&event.target===editor())syncChange();
  });

  document.addEventListener('keydown',function(event){
    if(state.active&&event.key==='Escape'&&!state.busy){
      event.preventDefault();
      closeEdit(true);
    }
  });

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');
    if(action==='edit-tts'){
      event.preventDefault();
      event.stopPropagation();
      if(state.active)closeEdit(true);
      else openEdit();
      return;
    }
    if(action==='generate-tts'&&state.active){
      event.preventDefault();
      event.stopPropagation();
      regenerate();
    }
  },true);

  setReady(false);
})();
`;
