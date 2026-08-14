export const AI_BACKGROUND_TASKS_CLIENT_JS = `
(function(){
  if(window.__vexaBackgroundTasksUi)return;
  window.__vexaBackgroundTasksUi=true;

  var tg=window.Telegram&&window.Telegram.WebApp;
  var initData=tg&&tg.initData||'';
  var tasks=[];
  var panelOpen=false;
  var busy=false;

  function q(id){return document.getElementById(id)}

  function api(path,payload){
    return fetch(path,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      cache:'no-store',
      body:JSON.stringify(Object.assign({initData:initData},payload||{}))
    }).then(async function(response){
      var data=await response.json().catch(function(){return{error:'Request failed'}});
      if(!response.ok){
        var error=new Error(data&&data.error||'Request failed');
        error.status=response.status;
        throw error;
      }
      return data;
    });
  }

  function haptic(kind){
    if(!tg||!tg.HapticFeedback)return;
    try{
      if(kind==='success'||kind==='error')tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred('light');
    }catch(error){}
  }

  function toast(message){
    var item=q('aiBgToast');
    if(!item){
      item=document.createElement('div');
      item.id='aiBgToast';
      item.className='ai-bg-toast';
      document.body.appendChild(item);
    }
    item.textContent=String(message||'');
    item.classList.add('show');
    clearTimeout(item._timer);
    item._timer=setTimeout(function(){item.classList.remove('show')},2200);
  }

  function installStyles(){
    if(q('aiBgStyles'))return;
    var style=document.createElement('style');
    style.id='aiBgStyles';
    style.textContent='\
.ai-bg-menu-section{display:grid;gap:8px}.ai-bg-menu-button,.ai-bg-run-button{width:100%;border:1px solid rgba(255,255,255,.1);background:#101010;color:#fff;border-radius:14px;min-height:52px;padding:0 14px;font:inherit;display:flex;align-items:center;gap:11px;text-align:left}.ai-bg-menu-button:active,.ai-bg-run-button:active{transform:scale(.992)}.ai-bg-menu-icon{width:28px;height:28px;border-radius:9px;background:#fff;color:#000;display:grid;place-items:center;font-size:14px;font-weight:750;flex:0 0 auto}.ai-bg-menu-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.ai-bg-menu-copy strong{font-size:14px;font-weight:650}.ai-bg-menu-copy small{font-size:11px;color:#8d8d92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-bg-count{min-width:25px;height:25px;border-radius:8px;background:#1c1c1e;color:#bbb;display:grid;place-items:center;font-size:11px}.ai-bg-run-button{background:#fff;color:#000;border-color:#fff}.ai-bg-run-button .ai-bg-menu-icon{background:#000;color:#fff}.ai-bg-run-button .ai-bg-menu-copy small{color:#626267}.ai-bg-run-button:disabled{opacity:.5}.ai-bg-overlay{position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.64);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity .22s ease}.ai-bg-overlay.open{opacity:1;pointer-events:auto}.ai-bg-sheet{width:100%;max-height:min(82dvh,760px);background:#080808;border:1px solid rgba(255,255,255,.1);border-bottom:0;border-radius:24px 24px 0 0;padding:14px 14px calc(18px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .25s cubic-bezier(.2,.8,.2,1);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 -18px 50px rgba(0,0,0,.5)}.ai-bg-overlay.open .ai-bg-sheet{transform:translateY(0)}.ai-bg-grabber{width:38px;height:4px;background:#333;border-radius:99px;margin:0 auto 11px}.ai-bg-head{display:flex;align-items:center;justify-content:space-between;padding:4px 2px 13px}.ai-bg-head span{display:flex;flex-direction:column;gap:2px}.ai-bg-head strong{font-size:17px}.ai-bg-head small{font-size:11px;color:#777}.ai-bg-head-actions{display:flex;gap:7px}.ai-bg-icon-button{border:1px solid #222;background:#111;color:#fff;border-radius:11px;height:34px;padding:0 11px;font:600 12px/1 inherit}.ai-bg-list{overflow:auto;overscroll-behavior:contain;display:grid;gap:8px;padding:2px 0 6px}.ai-bg-empty{border:1px dashed #27272a;border-radius:16px;padding:28px 18px;text-align:center;color:#777;font-size:13px}.ai-bg-task{border:1px solid #202024;background:#0e0e0f;border-radius:16px;padding:12px;display:grid;gap:10px}.ai-bg-task-top{display:flex;align-items:flex-start;gap:10px}.ai-bg-status-dot{width:9px;height:9px;border-radius:50%;background:#666;margin-top:5px;flex:0 0 auto}.ai-bg-task.running .ai-bg-status-dot,.ai-bg-task.queued .ai-bg-status-dot{background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.08)}.ai-bg-task.completed .ai-bg-status-dot{background:#b7b7b7}.ai-bg-task.failed .ai-bg-status-dot,.ai-bg-task.cancelled .ai-bg-status-dot{background:#555}.ai-bg-task-copy{min-width:0;flex:1}.ai-bg-task-copy strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-bg-task-copy small{display:block;margin-top:3px;color:#777;font-size:11px}.ai-bg-task-summary{font-size:12px;line-height:1.45;color:#b7b7bb;white-space:pre-wrap;word-break:break-word;max-height:72px;overflow:hidden}.ai-bg-task-actions{display:flex;gap:7px}.ai-bg-task-actions button{border:1px solid #29292d;background:#151517;color:#fff;border-radius:10px;height:32px;padding:0 11px;font:600 11px/1 inherit}.ai-bg-task-actions button.primary{background:#fff;color:#000;border-color:#fff}.ai-bg-detail{position:absolute;inset:0;background:#080808;z-index:2;display:none;flex-direction:column;padding:14px 14px calc(18px + env(safe-area-inset-bottom))}.ai-bg-detail.open{display:flex}.ai-bg-detail-body{overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.55;color:#d7d7da;padding:4px 2px 16px}.ai-bg-detail-meta{display:grid;gap:5px;border:1px solid #202024;background:#0e0e0f;border-radius:14px;padding:11px;margin-bottom:10px;color:#89898e;font-size:11px}.ai-bg-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));z-index:14000;max-width:calc(100vw - 36px);transform:translate(-50%,10px);background:#fff;color:#000;border-radius:11px;padding:9px 13px;font:600 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;opacity:0;pointer-events:none;transition:.18s ease}.ai-bg-toast.show{opacity:1;transform:translate(-50%,0)}';
    document.head.appendChild(style);
  }

  function installMenu(){
    if(q('aiBgMenuSection'))return;
    var github=document.querySelector('.ai-chat-menu-github-slot');
    if(!github)return;
    var section=document.createElement('section');
    section.id='aiBgMenuSection';
    section.className='ai-chat-menu-section ai-bg-menu-section';
    section.innerHTML='\
<p>Agent tasks</p>\
<button id="aiBgTasksOpen" class="ai-bg-menu-button" type="button">\
<span class="ai-bg-menu-icon" aria-hidden="true">◫</span>\
<span class="ai-bg-menu-copy"><strong>Background Tasks</strong><small>Runs even after you leave</small></span>\
<span id="aiBgTaskCount" class="ai-bg-count">0</span>\
</button>\
<button id="aiBgRunPrompt" class="ai-bg-run-button" type="button">\
<span class="ai-bg-menu-icon" aria-hidden="true">↗</span>\
<span class="ai-bg-menu-copy"><strong>Run current prompt in background</strong><small>Up to 4 independent tasks</small></span>\
</button>';
    github.insertAdjacentElement('afterend',section);
    q('aiBgTasksOpen').addEventListener('click',function(){openPanel();refreshTasks()});
    q('aiBgRunPrompt').addEventListener('click',runCurrentPrompt);
  }

  function installPanel(){
    if(q('aiBgOverlay'))return;
    var overlay=document.createElement('div');
    overlay.id='aiBgOverlay';
    overlay.className='ai-bg-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='\
<section class="ai-bg-sheet" role="dialog" aria-modal="true" aria-label="Background AI tasks">\
<div class="ai-bg-grabber" aria-hidden="true"></div>\
<header class="ai-bg-head"><span><strong>Background Tasks</strong><small>No polling · refresh when you want</small></span><div class="ai-bg-head-actions"><button id="aiBgRefresh" class="ai-bg-icon-button" type="button">Refresh</button><button id="aiBgClose" class="ai-bg-icon-button" type="button">Close</button></div></header>\
<div id="aiBgTaskList" class="ai-bg-list"></div>\
<section id="aiBgDetail" class="ai-bg-detail"><header class="ai-bg-head"><span><strong id="aiBgDetailTitle">Task result</strong><small id="aiBgDetailStatus"></small></span><div class="ai-bg-head-actions"><button id="aiBgCopy" class="ai-bg-icon-button" type="button">Copy</button><button id="aiBgDetailBack" class="ai-bg-icon-button" type="button">Back</button></div></header><div id="aiBgDetailMeta" class="ai-bg-detail-meta"></div><div id="aiBgDetailBody" class="ai-bg-detail-body"></div></section>\
</section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown',function(event){if(event.target===overlay)closePanel()});
    q('aiBgClose').addEventListener('click',closePanel);
    q('aiBgRefresh').addEventListener('click',refreshTasks);
    q('aiBgDetailBack').addEventListener('click',closeDetail);
    q('aiBgCopy').addEventListener('click',copyDetail);
  }

  function openPanel(){
    panelOpen=true;
    var overlay=q('aiBgOverlay');
    if(overlay){overlay.classList.add('open');overlay.setAttribute('aria-hidden','false')}
    var menuClose=q('aiChatMenuClose');
    if(menuClose)menuClose.click();
    haptic('light');
  }

  function closePanel(){
    panelOpen=false;
    closeDetail();
    var overlay=q('aiBgOverlay');
    if(overlay){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true')}
  }

  function closeDetail(){var detail=q('aiBgDetail');if(detail)detail.classList.remove('open')}

  function updateCount(){
    var active=tasks.filter(function(task){return task&&['queued','running'].indexOf(task.status)>=0}).length;
    var count=q('aiBgTaskCount');
    if(count)count.textContent=String(active);
  }

  async function refreshTasks(){
    if(busy)return;
    busy=true;
    var button=q('aiBgRefresh');
    if(button){button.disabled=true;button.textContent='Loading'}
    try{
      var data=await api('/mini-app/api/ai-tasks/list',{});
      tasks=Array.isArray(data.tasks)?data.tasks:[];
      renderTasks();
      updateCount();
    }catch(error){
      toast(error.message||'Could not load background tasks');
    }finally{
      busy=false;
      if(button){button.disabled=false;button.textContent='Refresh'}
    }
  }

  function renderTasks(){
    var list=q('aiBgTaskList');
    if(!list)return;
    list.replaceChildren();
    if(!tasks.length){
      var empty=document.createElement('div');
      empty.className='ai-bg-empty';
      empty.textContent='No background tasks yet';
      list.appendChild(empty);
      return;
    }
    tasks.forEach(function(task){list.appendChild(buildTaskCard(task))});
  }

  function buildTaskCard(task){
    var status=String(task.status||'unknown');
    var card=document.createElement('article');
    card.className='ai-bg-task '+status;
    var top=document.createElement('div');
    top.className='ai-bg-task-top';
    var dot=document.createElement('i');
    dot.className='ai-bg-status-dot';
    var copy=document.createElement('div');
    copy.className='ai-bg-task-copy';
    var title=document.createElement('strong');
    title.textContent=statusLabel(status)+' · '+shortTaskId(task.taskId);
    var meta=document.createElement('small');
    meta.textContent=formatTaskTime(task.updatedAt||task.createdAt);
    copy.appendChild(title);copy.appendChild(meta);top.appendChild(dot);top.appendChild(copy);card.appendChild(top);
    var summary=document.createElement('div');
    summary.className='ai-bg-task-summary';
    summary.textContent=taskSummary(task);
    card.appendChild(summary);
    var actions=document.createElement('div');
    actions.className='ai-bg-task-actions';
    var open=document.createElement('button');
    open.type='button';open.className='primary';open.textContent=status==='completed'?'Open':'Details';
    open.addEventListener('click',function(){openTask(task)});
    actions.appendChild(open);
    if(status==='queued'||status==='running'){
      var cancel=document.createElement('button');
      cancel.type='button';cancel.textContent='Cancel';
      cancel.addEventListener('click',function(){cancelTask(task.taskId,cancel)});
      actions.appendChild(cancel);
    }
    card.appendChild(actions);
    return card;
  }

  async function openTask(task){
    try{
      var fresh=await api('/mini-app/api/ai-tasks/status',{taskId:task.taskId});
      var index=tasks.findIndex(function(item){return item.taskId===fresh.taskId});
      if(index>=0)tasks[index]=fresh;
      task=fresh;
      renderTasks();updateCount();
    }catch(error){toast(error.message||'Could not refresh task')}
    var detail=q('aiBgDetail');
    if(!detail)return;
    var message=resultMessage(task);
    q('aiBgDetailTitle').textContent=shortTaskId(task.taskId);
    q('aiBgDetailStatus').textContent=statusLabel(task.status);
    var meta=q('aiBgDetailMeta');
    meta.replaceChildren();
    ['Status: '+statusLabel(task.status),'Updated: '+formatTaskTime(task.updatedAt),'Task: '+String(task.taskId||'')].forEach(function(text){var line=document.createElement('span');line.textContent=text;meta.appendChild(line)});
    q('aiBgDetailBody').textContent=message;
    detail.classList.add('open');
  }

  async function cancelTask(taskId,button){
    if(button)button.disabled=true;
    try{
      await api('/mini-app/api/ai-tasks/cancel',{taskId:taskId});
      haptic('success');
      await refreshTasks();
    }catch(error){toast(error.message||'Could not cancel task');haptic('error')}
    finally{if(button)button.disabled=false}
  }

  async function runCurrentPrompt(){
    if(busy)return;
    var input=q('aiChatInput');
    var prompt=String(input&&input.value||'').trim();
    if(!prompt){toast('Type a prompt first');return}
    var attachment=q('aiChatAttachmentPreview');
    if(attachment&&attachment.children&&attachment.children.length){
      toast('Remove the attachment before using background mode');
      return;
    }
    var messages=collectContext(prompt);
    var button=q('aiBgRunPrompt');
    busy=true;
    if(button){button.disabled=true}
    try{
      var data=await api('/mini-app/api/ai-tasks/start',{messages:messages});
      if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}
      haptic('success');
      toast('Background task started');
      openPanel();
      await refreshTasksAfterStart(data.taskId);
    }catch(error){
      toast(error.message||'Could not start background task');
      haptic('error');
    }finally{
      busy=false;
      if(button)button.disabled=false;
    }
  }

  function collectContext(prompt){
    var messages=[];
    document.querySelectorAll('#aiChatMessages .ai-chat-message').forEach(function(item){
      var content=item.querySelector('.ai-chat-message-content');
      if(!content)return;
      var text=String(content.innerText||content.textContent||'').trim();
      if(!text)return;
      messages.push({role:item.classList.contains('assistant')?'assistant':'user',content:text.slice(0,4000)});
    });
    messages=messages.slice(-19);
    messages.push({role:'user',content:String(prompt).slice(0,4000)});
    return messages;
  }

  async function refreshTasksAfterStart(taskId){
    try{
      var data=await api('/mini-app/api/ai-tasks/list',{});
      tasks=Array.isArray(data.tasks)?data.tasks:[];
      if(taskId&&!tasks.some(function(task){return task.taskId===taskId}))tasks.unshift({taskId:taskId,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      renderTasks();updateCount();
    }catch(error){
      tasks.unshift({taskId:taskId,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      renderTasks();updateCount();
    }
  }

  function resultMessage(task){
    if(task&&task.error)return 'Task failed\n\n'+String(task.error);
    var result=task&&task.result;
    if(!result)return task&&['queued','running'].indexOf(task.status)>=0?'This task is still running. Tap Refresh when you want to check again.':'No result is available.';
    var message=String(result.message||result.result&&result.result.message||'').trim();
    if(!message&&result.type==='image_request')message='This background task returned an image-generation request. Open AI Chat in foreground to generate the image.';
    if(!message&&result.type==='speech_request')message='This background task returned a voice-generation request. Open AI Chat in foreground to generate the audio.';
    if(!message)message='Task completed.';
    var activity=result.codingActivity||result.result&&result.result.codingActivity;
    if(activity){
      var details=[];
      if(activity.currentBranch)details.push('Branch: '+activity.currentBranch);
      if(activity.currentCommitSha)details.push('Commit: '+activity.currentCommitSha);
      var changed=activity.change&&Array.isArray(activity.change.changedFiles)?activity.change.changedFiles:[];
      if(changed.length)details.push('Changed files: '+changed.join(', '));
      if(details.length)message+='\n\n'+details.join('\n');
    }
    return message;
  }

  function taskSummary(task){
    if(task&&task.error)return String(task.error).slice(0,220);
    var text=resultMessage(task);
    if(task&&['queued','running'].indexOf(task.status)>=0)return task.status==='queued'?'Waiting to start':'Working in background';
    return text.slice(0,220);
  }

  function statusLabel(status){
    return ({queued:'Queued',running:'Running',completed:'Completed',failed:'Failed',cancelled:'Cancelled'})[String(status||'')]||'Task';
  }

  function shortTaskId(value){var id=String(value||'');return id.length>14?id.slice(0,7)+'…'+id.slice(-5):id||'Task'}
  function formatTaskTime(value){var date=new Date(value||'');if(Number.isNaN(date.getTime()))return '';try{return date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}catch(error){return date.toISOString()}}

  async function copyDetail(){
    var text=String(q('aiBgDetailBody')&&q('aiBgDetailBody').textContent||'');
    if(!text)return;
    try{await navigator.clipboard.writeText(text);toast('Copied');haptic('success')}catch(error){toast('Could not copy')}
  }

  function boot(){
    installStyles();
    installMenu();
    installPanel();
    api('/mini-app/api/ai-tasks/list',{}).then(function(data){tasks=Array.isArray(data.tasks)?data.tasks:[];updateCount()}).catch(function(){});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
`;

export function isAiBackgroundTasksClientRequest(request) {
  return request.method === "GET" && new URL(request.url).pathname === "/mini-app/chat/background-tasks.js";
}

export function handleAiBackgroundTasksClientRequest() {
  return new Response(AI_BACKGROUND_TASKS_CLIENT_JS, {
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

export async function injectAiBackgroundTasksClient(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;
  const source = await response.text();
  const script = '<script src="/mini-app/chat/background-tasks.js?v=20260814-1"></script>';
  if (source.includes("/mini-app/chat/background-tasks.js")) return new Response(source, { status: response.status, headers: response.headers });
  const html = source.includes("</body>") ? source.replace("</body>", script + "\n</body>") : source + script;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(html, { status: response.status, headers });
}
