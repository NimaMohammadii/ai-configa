export const HISTORY_FILE_IDENTITY_PATCH = String.raw`
  function vexaHistoryFileName(item){
    var name=String(item&&item.filename||'').trim();
    if(name)return name;
    var sequence=Number.parseInt(String(item&&item.file_sequence||''),10);
    return Number.isFinite(sequence)&&sequence>0?'Vexa '+String(Math.min(9999,sequence)).padStart(4,'0')+'.mp3':'—';
  }

  function vexaHistoryIdentityRow(label,value,className){
    var row=document.createElement('div');
    row.className='history-inline-row '+className;
    var key=document.createElement('span');
    key.textContent=label;
    var val=document.createElement('strong');
    val.textContent=value;
    val.setAttribute('dir','ltr');
    val.style.textAlign='right';
    row.appendChild(key);
    row.appendChild(val);
    return row;
  }

  function vexaEnsureHistoryActionStyles(){
    if(document.getElementById('vexaHistoryBotActionStyles'))return;
    var style=document.createElement('style');
    style.id='vexaHistoryBotActionStyles';
    style.textContent='.history-inline-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:10px}.history-inline-actions .history-inline-edit-button{margin-top:0}';
    document.head.appendChild(style);
  }

  function vexaInjectHistoryExtras(button){
    var id=String(button&&button.getAttribute('data-history-id')||'');
    var item=(Array.isArray(historyItems)?historyItems:[]).find(function(entry){return String(entry&&entry.id||'')===id});
    var card=button&&button.closest('.history-item');
    var facts=card&&card.querySelector('.history-inline-facts');
    if(!item||!card||!facts)return;

    if(!facts.querySelector('.history-file-name-row')){
      var nameRow=vexaHistoryIdentityRow('FILE NAME',vexaHistoryFileName(item),'history-file-name-row');
      var created=facts.querySelector('.history-inline-row');
      if(created&&created.nextSibling)facts.insertBefore(nameRow,created.nextSibling);
      else facts.appendChild(nameRow);
    }

    var editBox=card.querySelector('.history-inline-edit');
    var editButton=editBox&&editBox.querySelector('[data-action="edit-history-detail"]');
    if(!editBox||!editButton||editBox.querySelector('[data-action="send-history-to-bot"]'))return;

    vexaEnsureHistoryActionStyles();
    var actions=document.createElement('div');
    actions.className='history-inline-actions';
    editButton.parentNode.insertBefore(actions,editButton);
    actions.appendChild(editButton);

    var sendButton=document.createElement('button');
    sendButton.className='history-inline-edit-button';
    sendButton.setAttribute('data-action','send-history-to-bot');
    sendButton.setAttribute('data-history-id',id);
    sendButton.setAttribute('type','button');
    sendButton.disabled=!item.has_audio;
    sendButton.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 4 9.2 14.8M20 4l-6.8 16-4-5.2L4 10.8 20 4Z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Send to bot</span>';
    actions.appendChild(sendButton);
  }

  async function vexaSendHistoryToBot(button){
    var id=String(button&&button.getAttribute('data-history-id')||'');
    var item=(Array.isArray(historyItems)?historyItems:[]).find(function(entry){return String(entry&&entry.id||'')===id});
    if(!id||!item||!item.has_audio||button.classList.contains('loading'))return;
    button.classList.add('loading');
    button.disabled=true;
    try{
      await api('/mini-app/api/history-send-to-bot',{id:id});
      toast('Sent to bot');
      if(tg&&tg.HapticFeedback&&tg.HapticFeedback.notificationOccurred)try{tg.HapticFeedback.notificationOccurred('success')}catch(error){}
    }catch(error){
      toast(error&&error.message?error.message:'Could not send audio to bot');
    }finally{
      button.classList.remove('loading');
      button.disabled=!item.has_audio;
    }
  }

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');
    if(action==='open-history-details'){
      setTimeout(function(){vexaInjectHistoryExtras(button)},0);
      return;
    }
    if(action==='send-history-to-bot'){
      event.preventDefault();
      event.stopImmediatePropagation();
      vexaSendHistoryToBot(button);
    }
  },true);
`;
