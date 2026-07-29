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
  function workspace(){return document.querySelector('.tts-page')}
  function editButton(){return q('ttsEditButton')}
  function generateButton(){return q('convertButton')}
  function label(){var button=generateButton();return button&&button.querySelector('.tts-generate-label')}
  function statusText(){return q('ttsEditStatusText')}
  function selectionText(){return q('ttsEditSelection')}
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

  function setReady(ready){
    state.ready=!!ready;
    var button=editButton();
    if(!button)return;
    button.disabled=!state.ready;
    button.classList.toggle('is-ready',state.ready);
    button.setAttribute('aria-disabled',state.ready?'false':'true');
  }

  function setBusy(busy){
    state.busy=!!busy;
    var button=generateButton();
    if(button){
      button.disabled=busy||!hasChange();
      button.classList.toggle('loading',busy);
    }
    if(editButton())editButton().disabled=busy||!state.ready;
    var area=workspace();
    if(area)area.classList.toggle('tts-edit-busy',busy);
  }

  function enterEdit(){
    if(!state.ready||state.busy)return;
    var input=editor();
    if(!input)return;
    if(state.active){exitEdit(true);return}
    state.active=true;
    state.baseText=String(input.value||state.baseText||'');
    var area=workspace();
    if(area)area.classList.add('tts-edit-mode');
    document.body.classList.add('tts-edit-mode-active');
    var button=editButton();
    if(button){button.classList.add('active');button.setAttribute('aria-label','Cancel voice editing')}
    if(label())label().textContent='Regenerate';
    var generate=generateButton();
    if(generate){generate.setAttribute('data-action','regenerate-tts');generate.disabled=true}
    if(statusText())statusText().textContent='Select a phrase, then type the replacement';
    if(selectionText())selectionText().textContent='No changes yet';
    requestAnimationFrame(function(){
      if(area)area.classList.add('tts-edit-entered');
      input.focus({preventScroll:true});
    });
  }

  function exitEdit(restore){
    if(!state.active)return;
    var input=editor();
    if(restore&&input)input.value=state.baseText;
    state.active=false;
    var area=workspace();
    if(area)area.classList.remove('tts-edit-mode','tts-edit-entered','tts-edit-busy','tts-edit-success');
    document.body.classList.remove('tts-edit-mode-active');
    var button=editButton();
    if(button){button.classList.remove('active');button.setAttribute('aria-label','Edit generated voice')}
    var generate=generateButton();
    if(generate){generate.setAttribute('data-action','generate-tts');generate.disabled=false;generate.classList.remove('loading')}
    if(label())label().textContent='Generate Voice';
    if(statusText())statusText().textContent='Select a phrase, then type the replacement';
    if(selectionText())selectionText().textContent='No changes yet';
    if(input)input.dispatchEvent(new Event('input',{bubbles:true}));
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
    var change=diff();
    var valid=hasChange();
    var button=generateButton();
    if(button)button.disabled=!valid;
    if(!selectionText())return;
    if(!valid){
      selectionText().textContent=change.newText===state.baseText?'No changes yet':'Replace an existing section';
      return;
    }
    var oldChars=Array.from(state.baseText);
    var preview=oldChars.slice(change.start,change.end).join('').replace(/\\s+/g,' ').trim();
    if(preview.length>44)preview=preview.slice(0,41)+'…';
    selectionText().textContent=Array.from(change.replacement).length+' characters · '+(preview||'Selected section');
  }

  async function regenerate(){
    if(!state.active||state.busy||!hasChange())return;
    var change=diff();
    setBusy(true);
    if(statusText())statusText().textContent='Matching tone and rebuilding…';
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
      if(statusText())statusText().textContent='Saving your new voice…';
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
      if(input)input.value=state.baseText;
      var audio=q('ttsAudio');
      if(audio){audio.pause();audio.src=state.audioSrc;audio.load()}
      window.dispatchEvent(new CustomEvent('vexa:tts-edited',{detail:{
        filename:saved.filename,
        text:state.baseText,
        revision:state.revision,
        audioSrc:state.audioSrc,
        mimeType:state.audioMime
      }}));
      var area=workspace();
      if(area)area.classList.add('tts-edit-success');
      if(statusText())statusText().textContent='Voice updated';
      toast('Voice updated · '+Number(prepared.cost||0)+' credits');
      setTimeout(function(){exitEdit(false)},650);
    }catch(error){
      if(statusText())statusText().textContent='Select a phrase, then type the replacement';
      toast(error&&error.message?error.message:'Could not regenerate this section');
    }finally{
      setBusy(false);
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
    var width=Math.min(Math.round(sampleRate*.004),position,samples.length-position);
    if(width<2)return;
    for(var index=0;index<width;index++){
      var amount=(index+1)/(width+1);
      samples[position-width+index]*=1-amount*.82;
      samples[position+index]*=.18+amount*.82;
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
    setReady(!!(data.editable&&state.historyId&&state.alignment&&state.audioSrc));
  });

  window.addEventListener('vexa:tts-reset',function(){
    exitEdit(false);
    setReady(false);
  });

  document.addEventListener('input',function(event){
    if(state.active&&event.target&&event.target.matches('[data-dialogue-text]'))syncChange();
  });

  document.addEventListener('selectionchange',function(){
    if(!state.active||state.busy)return;
    var input=editor();
    if(document.activeElement!==input)return;
    var selected=String(input.value||'').slice(input.selectionStart||0,input.selectionEnd||0).replace(/\\s+/g,' ').trim();
    if(selected&&selectionText())selectionText().textContent='Selected · '+(selected.length>44?selected.slice(0,41)+'…':selected);
  });

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');
    if(action==='edit-tts'){
      event.preventDefault();event.stopPropagation();
      enterEdit();
      return;
    }
    if(action==='regenerate-tts'){
      event.preventDefault();event.stopPropagation();
      regenerate();
    }
  },true);

  setReady(false);
})();
`;
