export const HISTORY_FILE_IDENTITY_PATCH = String.raw`
  function vexaHistoryFileIdentity(item){
    var sequence=Number.parseInt(String(item&&item.file_sequence||''),10);
    var match=!Number.isFinite(sequence)||sequence<1?String(item&&item.filename||'').match(/Vexa\s+(\d{1,4})/i):null;
    if((!Number.isFinite(sequence)||sequence<1)&&match)sequence=Number.parseInt(match[1],10);
    var code=Number.isFinite(sequence)&&sequence>0?'Vexa '+String(Math.min(9999,sequence)).padStart(4,'0'):'—';
    var name=String(item&&item.filename||'').trim()||(code!=='—'?code+'.mp3':'—');
    return{code:code,name:name};
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

  function vexaInjectHistoryFileIdentity(button){
    var id=String(button&&button.getAttribute('data-history-id')||'');
    var item=(Array.isArray(historyItems)?historyItems:[]).find(function(entry){return String(entry&&entry.id||'')===id});
    var card=button&&button.closest('.history-item');
    var facts=card&&card.querySelector('.history-inline-facts');
    if(!item||!facts||facts.querySelector('.history-file-code-row'))return;
    var identity=vexaHistoryFileIdentity(item);
    var codeRow=vexaHistoryIdentityRow('FILE CODE',identity.code,'history-file-code-row');
    var nameRow=vexaHistoryIdentityRow('FILE NAME',identity.name,'history-file-name-row');
    var created=facts.querySelector('.history-inline-row');
    if(created&&created.nextSibling){
      facts.insertBefore(nameRow,created.nextSibling);
      facts.insertBefore(codeRow,nameRow);
    }else{
      facts.appendChild(codeRow);
      facts.appendChild(nameRow);
    }
  }

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action="open-history-details"]'):null;
    if(!button)return;
    setTimeout(function(){vexaInjectHistoryFileIdentity(button)},0);
  },true);
`;
