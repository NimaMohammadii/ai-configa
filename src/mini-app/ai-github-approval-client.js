export const AI_GITHUB_APPROVAL_CLIENT_JS = `
(function(){
  if(window.__vexaGithubApprovalUi)return;
  window.__vexaGithubApprovalUi=true;

  var tg=window.Telegram&&window.Telegram.WebApp;
  var initData=tg&&tg.initData||'';
  var approvals=[];
  var busy=false;
  var syncTimer=0;

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
    var item=q('aiGithubApprovalToast');
    if(!item){
      item=document.createElement('div');
      item.id='aiGithubApprovalToast';
      item.className='ai-github-approval-toast';
      document.body.appendChild(item);
    }
    item.textContent=String(message||'');
    item.classList.add('show');
    clearTimeout(item._timer);
    item._timer=setTimeout(function(){item.classList.remove('show')},2400);
  }

  function installStyles(){
    if(q('aiGithubApprovalStyles'))return;
    var style=document.createElement('style');
    style.id='aiGithubApprovalStyles';
    style.textContent='\
.ai-github-approval-panel{margin-top:12px;border:1px solid rgba(255,255,255,.13);background:rgba(13,13,14,.94);border-radius:16px;padding:12px;display:grid;gap:10px}.ai-github-approval-head{display:flex;gap:10px;align-items:flex-start}.ai-github-approval-lock{width:30px;height:30px;border-radius:9px;background:#fff;color:#000;display:grid;place-items:center;flex:0 0 auto;font-size:14px;font-weight:800}.ai-github-approval-copy{min-width:0;display:grid;gap:3px}.ai-github-approval-copy strong{font-size:13px;line-height:1.3;color:#fff}.ai-github-approval-copy small{font-size:11px;line-height:1.45;color:#89898f}.ai-github-approval-meta{display:flex;gap:6px;flex-wrap:wrap}.ai-github-approval-meta span{font-size:10px;color:#9b9ba1;background:#171719;border:1px solid #252529;border-radius:8px;padding:5px 7px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ai-github-approval-actions{display:grid;grid-template-columns:1fr auto;gap:7px}.ai-github-approval-actions button{min-height:39px;border-radius:11px;border:1px solid #29292d;background:#151517;color:#fff;padding:0 12px;font:650 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.ai-github-approval-actions button.primary{background:#fff;color:#000;border-color:#fff}.ai-github-approval-actions button:disabled{opacity:.5}.ai-github-approval-status{font-size:11px;line-height:1.45;color:#aaa}.ai-github-approval-status.success{color:#d8d8da}.ai-github-approval-result-link{display:inline-flex;align-items:center;min-height:34px;width:max-content;max-width:100%;border-radius:10px;background:#171719;border:1px solid #27272a;color:#fff;text-decoration:none;padding:0 10px;font-size:11px;font-weight:650}.ai-github-approval-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));z-index:15000;max-width:calc(100vw - 36px);transform:translate(-50%,10px);background:#fff;color:#000;border-radius:11px;padding:9px 13px;font:600 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;opacity:0;pointer-events:none;transition:.18s ease}.ai-github-approval-toast.show{opacity:1;transform:translate(-50%,0)}';
    document.head.appendChild(style);
  }

  function latestResultCard(){
    var cards=document.querySelectorAll('.ai-coding-result-card');
    return cards.length?cards[cards.length-1]:null;
  }

  function approvalHost(){
    var card=latestResultCard();
    if(card)return card;
    var list=q('aiChatMessages');
    if(!list)return null;
    var host=q('aiGithubApprovalStandalone');
    if(host)return host;
    var item=document.createElement('article');
    item.className='ai-chat-message assistant ai-github-approval-message';
    host=document.createElement('section');
    host.id='aiGithubApprovalStandalone';
    host.style.width='100%';
    item.appendChild(host);
    list.appendChild(item);
    return host;
  }

  function actionLabel(item){
    return item&&item.actionType==='merge_pull_request'
      ?'Confirm merge'
      :'Confirm apply to '+String(item&&item.baseBranch||'main');
  }

  function actionDescription(item){
    if(item&&item.actionType==='merge_pull_request'){
      return 'This will merge PR #'+String(item.pullRequestNumber||'')+' into '+String(item.baseBranch||'main')+'.';
    }
    return 'This will fast-forward '+String(item.baseBranch||'main')+' to the reviewed Vexa branch.';
  }

  function expiryText(item){
    var remaining=Math.max(0,Number(item&&item.expiresAt||0)*1000-Date.now());
    if(!remaining)return 'Approval expired';
    var minutes=Math.max(1,Math.ceil(remaining/60000));
    return 'Expires in '+minutes+' min';
  }

  function confirmAction(item){
    var text=actionDescription(item)+' This changes the default branch. Continue?';
    if(tg&&typeof tg.showConfirm==='function'){
      return new Promise(function(resolve){
        try{tg.showConfirm(text,function(value){resolve(!!value)})}
        catch(error){resolve(window.confirm(text))}
      });
    }
    return Promise.resolve(window.confirm(text));
  }

  async function approve(item,button,panel){
    if(!item||!item.approvalId||busy)return;
    if(!(await confirmAction(item)))return;
    busy=true;
    if(button){button.disabled=true;button.textContent='Applying…'}
    try{
      var result=await api('/mini-app/api/github-ai-approvals/approve',{approvalId:item.approvalId});
      haptic('success');
      renderApproved(panel,result,item);
      approvals=approvals.filter(function(entry){return entry.approvalId!==item.approvalId});
      toast(item.actionType==='merge_pull_request'?'Pull request merged':'Changes applied to '+String(item.baseBranch||'main'));
    }catch(error){
      haptic('error');
      toast(error.message||'Could not apply this GitHub action');
      if(button){button.disabled=false;button.textContent=actionLabel(item)}
      if(error.status===409||error.status===410)scheduleSync(80);
    }finally{
      busy=false;
    }
  }

  async function reject(item,button){
    if(!item||!item.approvalId||busy)return;
    busy=true;
    if(button)button.disabled=true;
    try{
      await api('/mini-app/api/github-ai-approvals/reject',{approvalId:item.approvalId});
      approvals=approvals.filter(function(entry){return entry.approvalId!==item.approvalId});
      haptic('light');
      render();
    }catch(error){
      toast(error.message||'Could not cancel approval');
      if(button)button.disabled=false;
    }finally{
      busy=false;
    }
  }

  function renderApproved(panel,result,item){
    if(!panel)return;
    panel.replaceChildren();
    var head=document.createElement('div');
    head.className='ai-github-approval-head';
    var icon=document.createElement('span');
    icon.className='ai-github-approval-lock';
    icon.textContent='✓';
    var copy=document.createElement('span');
    copy.className='ai-github-approval-copy';
    var strong=document.createElement('strong');
    strong.textContent=item.actionType==='merge_pull_request'?'Pull request merged':'Changes applied';
    var small=document.createElement('small');
    small.textContent='Confirmed by you · '+String(result.commitSha||'').slice(0,12);
    copy.appendChild(strong);copy.appendChild(small);head.appendChild(icon);head.appendChild(copy);panel.appendChild(head);
    if(result.url&&String(result.url).indexOf('https://')===0){
      var link=document.createElement('a');
      link.className='ai-github-approval-result-link';
      link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Open on GitHub';
      panel.appendChild(link);
    }
  }

  function buildPanel(item){
    var panel=document.createElement('section');
    panel.className='ai-github-approval-panel';
    panel.setAttribute('data-approval-id',String(item.approvalId||''));

    var head=document.createElement('div');
    head.className='ai-github-approval-head';
    var icon=document.createElement('span');
    icon.className='ai-github-approval-lock';
    icon.textContent='✓';
    var copy=document.createElement('span');
    copy.className='ai-github-approval-copy';
    var strong=document.createElement('strong');
    strong.textContent=String(item.title||'Confirm GitHub action');
    var small=document.createElement('small');
    small.textContent='AI prepared this action, but it cannot change the default branch until you confirm it here.';
    copy.appendChild(strong);copy.appendChild(small);head.appendChild(icon);head.appendChild(copy);panel.appendChild(head);

    var meta=document.createElement('div');
    meta.className='ai-github-approval-meta';
    [String(item.repository||''),String(item.branch||''),expiryText(item)].filter(Boolean).forEach(function(text){
      var chip=document.createElement('span');chip.textContent=text;meta.appendChild(chip);
    });
    panel.appendChild(meta);

    var status=document.createElement('div');
    status.className='ai-github-approval-status';
    status.textContent=actionDescription(item)+' The approval is single-use and tied to the exact reviewed commit.';
    panel.appendChild(status);

    var actions=document.createElement('div');
    actions.className='ai-github-approval-actions';
    var confirm=document.createElement('button');
    confirm.type='button';confirm.className='primary';confirm.textContent=actionLabel(item);
    var cancel=document.createElement('button');
    cancel.type='button';cancel.textContent='Cancel';
    confirm.addEventListener('click',function(){approve(item,confirm,panel)});
    cancel.addEventListener('click',function(){reject(item,cancel)});
    actions.appendChild(confirm);actions.appendChild(cancel);panel.appendChild(actions);
    return panel;
  }

  function render(){
    document.querySelectorAll('.ai-github-approval-panel[data-approval-id]').forEach(function(node){node.remove()});
    if(!approvals.length){
      var standalone=q('aiGithubApprovalStandalone');
      if(standalone&&standalone.parentElement)standalone.parentElement.remove();
      return;
    }
    var host=approvalHost();
    if(!host)return;
    approvals.slice().reverse().forEach(function(item){host.appendChild(buildPanel(item))});
  }

  async function sync(){
    if(busy)return;
    try{
      var data=await api('/mini-app/api/github-ai-approvals/list',{});
      approvals=Array.isArray(data.approvals)?data.approvals:[];
      render();
    }catch(error){
      if(error&&error.status===401)return;
    }
  }

  function scheduleSync(delay){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(sync,Math.max(0,Number(delay)||120));
  }

  function boot(){
    installStyles();
    scheduleSync(0);
    var list=q('aiChatMessages');
    if(list&&typeof MutationObserver==='function'){
      var observer=new MutationObserver(function(mutations){
        var shouldSync=mutations.some(function(mutation){
          return Array.prototype.some.call(mutation.addedNodes||[],function(node){
            return node&&node.nodeType===1&&(
              node.matches&&node.matches('.ai-coding-result')
              ||node.querySelector&&node.querySelector('.ai-coding-result')
            );
          });
        });
        if(shouldSync)scheduleSync(120);
      });
      observer.observe(list,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
`;

export function isAiGitHubApprovalClientRequest(request) {
  return request.method === "GET" && new URL(request.url).pathname === "/mini-app/chat/github-approval.js";
}

export function handleAiGitHubApprovalClientRequest() {
  return new Response(AI_GITHUB_APPROVAL_CLIENT_JS, {
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

export async function injectAiGitHubApprovalClient(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;
  const source = await response.text();
  const script = '<script src="/mini-app/chat/github-approval.js?v=20260814-1"></script>';
  if (source.includes("/mini-app/chat/github-approval.js")) {
    return new Response(source, { status: response.status, headers: response.headers });
  }
  const html = source.includes("</body>")
    ? source.replace("</body>", script + "\\n</body>")
    : source + script;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(html, { status: response.status, headers });
}
