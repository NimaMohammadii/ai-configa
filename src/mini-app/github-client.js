export const GITHUB_CLIENT_JS = `
(function(){
  if(window.__vexaGithubClientLoaded)return;
  window.__vexaGithubClientLoaded=true;
  var tg=window.Telegram&&window.Telegram.WebApp;
  var initData=(tg&&tg.initData)||'';
  var state={connected:false,login:'',repository:null,repositories:[],authorizeUrl:'',pendingConnect:false,busy:false};
  function q(id){return document.getElementById(id)}
  function api(path,body){return fetch(path,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify(Object.assign({initData:initData},body||{}))}).then(async function(response){var data=await response.json().catch(function(){return{error:'Invalid response'}});if(!response.ok)throw new Error(data.error||'Request failed');return data})}
  function shortRepo(fullName){var parts=String(fullName||'').split('/');return parts[parts.length-1]||'GitHub'}
  function repoOwner(fullName){var parts=String(fullName||'').split('/');return parts.length>1?parts[0]:''}
  function githubIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.1 1.2a10.8 10.8 0 0 1 5.7 0C14.9 5 16 5.3 16 5.3c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"/></svg>'}
  function installAiChatTurnScrollGuard(){
    var list=q('aiChatMessages');
    if(!list||typeof MutationObserver!=='function')return;
    var anchorUser=null;
    var anchorScrollTop=0;
    var anchorReady=false;
    var manualScroll=false;
    var frame=0;

    function latestUserMessage(){
      var users=list.querySelectorAll('.ai-chat-message.user');
      return users.length?users[users.length-1]:null;
    }

    function schedule(){
      if(frame)return;
      frame=requestAnimationFrame(sync);
    }

    function capture(user){
      anchorUser=user;
      anchorReady=false;
      manualScroll=false;
      requestAnimationFrame(function(){
        if(anchorUser!==user||!user.isConnected)return;
        anchorScrollTop=list.scrollTop;
        anchorReady=true;
        schedule();
      });
    }

    function sync(){
      frame=0;
      if(manualScroll||!anchorReady||!anchorUser||!anchorUser.isConnected)return;
      var children=Array.prototype.slice.call(list.children);
      var userIndex=children.indexOf(anchorUser);
      if(userIndex<0)return;
      var tail=children[children.length-1];
      if(!tail||tail===anchorUser)return;

      var listRect=list.getBoundingClientRect();
      var tailRect=tail.getBoundingClientRect();
      var composer=q('aiChatComposer');
      var composerRect=composer&&composer.getBoundingClientRect();
      var bottomLimit=listRect.height-18;
      if(composerRect&&composerRect.top>listRect.top&&composerRect.top<listRect.bottom){
        bottomLimit=Math.min(bottomLimit,composerRect.top-listRect.top-18);
      }
      bottomLimit=Math.max(80,bottomLimit);

      var contentBottom=list.scrollTop+(tailRect.bottom-listRect.top);
      var overflow=Math.max(0,contentBottom-anchorScrollTop-bottomLimit);
      var maxScroll=Math.max(0,list.scrollHeight-list.clientHeight);
      var desired=Math.min(maxScroll,anchorScrollTop+overflow);
      if(Math.abs(list.scrollTop-desired)>1)list.scrollTop=desired;
    }

    function refresh(){
      var user=latestUserMessage();
      if(user&&user!==anchorUser)capture(user);
      else schedule();
    }

    var observer=new MutationObserver(refresh);
    observer.observe(list,{childList:true,subtree:true,characterData:true});
    list.addEventListener('pointerdown',function(){manualScroll=true},{passive:true});
    list.addEventListener('touchstart',function(){manualScroll=true},{passive:true});
    list.addEventListener('wheel',function(){manualScroll=true},{passive:true});
    refresh();
  }
  function inject(){
    var slot=document.querySelector('.ai-chat-menu-github-slot')||document.querySelector('.mode-tools');
    var panel=q('aiChatMenuPanel');
    if(!slot||!panel)return;
    var button=q('aiChatGithubButton');
    if(!button){button=document.createElement('button');button.id='aiChatGithubButton';button.type='button';button.className='ai-github-button';button.setAttribute('aria-label','Connect GitHub repository');button.innerHTML=githubIcon()+'<span class="ai-github-button-label">GitHub</span><span class="ai-chat-menu-chevron">›</span>';slot.appendChild(button)}
    var inline=q('aiGithubInline');
    if(!inline){inline=document.createElement('section');inline.id='aiGithubInline';inline.className='ai-github-inline';inline.setAttribute('aria-hidden','true');inline.innerHTML='<header class="ai-github-inline-head"><button id="aiGithubBack" class="ai-github-back" type="button" aria-label="Back to settings"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.5 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="ai-github-inline-title">'+githubIcon()+'<span><strong>Repository</strong><small id="aiGithubAccount">GitHub</small></span></div></header><div id="aiGithubBody" class="ai-github-body"><div class="ai-github-loading">Loading repositories…</div></div>';panel.appendChild(inline)}
    button.addEventListener('click',openRepositoryView,true);
    var back=q('aiGithubBack');if(back)back.addEventListener('click',closeRepositoryView);
    var backdrop=q('aiChatMenuBackdrop');
    if(backdrop){var menuObserver=new MutationObserver(function(){if(!backdrop.classList.contains('open'))closeRepositoryView()});menuObserver.observe(backdrop,{attributes:true,attributeFilter:['class']})}
  }
  function updateButton(){var button=q('aiChatGithubButton');if(!button)return;button.classList.toggle('connected',!!state.repository);var label=button.querySelector('.ai-github-button-label');if(label)label.textContent=state.repository?shortRepo(state.repository.fullName):'GitHub';button.setAttribute('aria-label',state.repository?'Connected repository '+state.repository.fullName:'Connect GitHub repository')}
  function showError(message){var node=q('aiGithubError');if(!node)return;node.textContent=String(message||'GitHub request failed');node.classList.add('show')}
  function openRepositoryView(event){if(event){event.preventDefault();event.stopImmediatePropagation()}var panel=q('aiChatMenuPanel');var inline=q('aiGithubInline');if(!panel||!inline)return;panel.classList.add('github-view');inline.setAttribute('aria-hidden','false');panel.scrollTop=0;loadRepositories()}
  function closeRepositoryView(){var panel=q('aiChatMenuPanel');var inline=q('aiGithubInline');if(panel)panel.classList.remove('github-view');if(inline)inline.setAttribute('aria-hidden','true')}
  function render(){
    updateButton();
    var accountLabel=q('aiGithubAccount');if(accountLabel)accountLabel.textContent=state.connected&&state.login?'@'+state.login:'GitHub';
    var body=q('aiGithubBody');if(!body)return;body.replaceChildren();
    var error=document.createElement('div');error.id='aiGithubError';error.className='ai-github-error';body.appendChild(error);
    if(!state.connected){var copy=document.createElement('p');copy.className='ai-github-copy';copy.textContent='Connect GitHub to choose a repository for coding.';body.appendChild(copy);var connect=document.createElement('button');connect.type='button';connect.className='ai-github-primary';connect.textContent='Connect GitHub';connect.addEventListener('click',connectGithub);body.appendChild(connect);return}
    if(!state.repositories.length){var empty=document.createElement('div');empty.className='ai-github-empty';empty.textContent='No repositories are available.';body.appendChild(empty);var install=document.createElement('button');install.type='button';install.className='ai-github-primary';install.textContent='Manage GitHub access';install.addEventListener('click',connectGithub);body.appendChild(install)}else{var repos=document.createElement('div');repos.className='ai-github-repos';state.repositories.forEach(function(repo){var selected=!!(state.repository&&state.repository.fullName===repo.fullName);var button=document.createElement('button');button.type='button';button.className='ai-github-repo'+(selected?' selected':'');button.setAttribute('aria-pressed',selected?'true':'false');var text=document.createElement('span');text.className='ai-github-repo-copy';var name=document.createElement('strong');name.textContent=shortRepo(repo.fullName);var branch=document.createElement('small');var owner=repoOwner(repo.fullName);branch.textContent=(owner?owner+' · ':'')+String(repo.defaultBranch||'main');text.appendChild(name);text.appendChild(branch);button.appendChild(text);var check=document.createElement('span');check.className='ai-github-repo-check';check.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6.5 12.5 3.4 3.4 7.6-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';button.appendChild(check);button.addEventListener('click',function(){selectRepo(repo)});repos.appendChild(button)});body.appendChild(repos)}
    var disconnect=document.createElement('button');disconnect.type='button';disconnect.className='ai-github-secondary danger';disconnect.textContent='Disconnect GitHub';disconnect.addEventListener('click',disconnectGithub);body.appendChild(disconnect);
  }
  async function refreshStatus(){try{var data=await api('/mini-app/api/github/status',{});state.connected=!!data.connected;state.login=String(data.login||'');state.repository=data.repository||null;updateButton()}catch(error){updateButton()}}
  async function loadRepositories(){var body=q('aiGithubBody');if(body)body.innerHTML='<div class="ai-github-loading">Loading repositories…</div>';try{var data=await api('/mini-app/api/github/repositories',{});state.connected=!!data.connected;state.login=String(data.login||'');state.repository=data.repository||null;state.repositories=Array.isArray(data.repositories)?data.repositories:[];state.authorizeUrl=String(data.authorizeUrl||'');render()}catch(error){state.repositories=[];state.authorizeUrl='';render();showError(error.message)}}
  function connectGithub(){if(state.busy)return;var authorizeUrl=String(state.authorizeUrl||'');var authorize=null;try{authorize=new URL(authorizeUrl)}catch(error){}if(!authorize||authorize.protocol!=='https:'||authorize.hostname!=='github.com'||authorize.pathname!=='/login/oauth/authorize'){showError('GitHub connection is not ready. Close this window and try again.');return}state.pendingConnect=true;window.location.assign(authorizeUrl)}
  async function selectRepo(repo){if(state.busy)return;state.busy=true;try{var data=await api('/mini-app/api/github/select',{installationId:repo.installationId,repoId:repo.id});state.repository=data.repository||repo;render();if(tg&&tg.HapticFeedback)try{tg.HapticFeedback.notificationOccurred('success')}catch(error){}setTimeout(closeRepositoryView,120)}catch(error){showError(error.message)}finally{state.busy=false}}
  async function disconnectGithub(){if(state.busy)return;state.busy=true;try{await api('/mini-app/api/github/disconnect',{});state.connected=false;state.login='';state.repository=null;state.repositories=[];state.authorizeUrl='';await loadRepositories()}catch(error){showError(error.message)}finally{state.busy=false}}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&state.pendingConnect){state.pendingConnect=false;loadRepositories()}});
  function start(){installAiChatTurnScrollGuard();inject();refreshStatus()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
`;