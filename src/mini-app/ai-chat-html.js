import { VOICE_NAMES, VOICES } from "../voices.js";

const AI_CHAT_VOICE_ROWS = VOICE_NAMES.map((name) => {
  const voiceId = VOICES[name];
  const activeClass = name === "Nora" ? " active" : "";

  return [
    '<div class="voice-option" data-voice-row="' + voiceId + '" data-voice-row-name="' + name + '">',
    '<span class="voice-avatar" aria-hidden="true"><span class="voice-avatar-image"></span></span>',
    '<button class="voice-select' + activeClass + '" data-voice="' + voiceId + '" data-voice-name="' + name + '" type="button"><span>' + name + '</span></button>',
    '<button class="voice-preview" data-action="preview-voice" data-preview-voice="' + voiceId + '" data-preview-name="' + name + '" type="button" aria-label="Hear ' + name + '"><span class="voice-preview-icon">▶</span></button>',
    '</div>'
  ].join("");
}).join("");

export const AI_CHAT_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <meta name="theme-color" content="#000000"/>
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
  <meta http-equiv="Pragma" content="no-cache"/>
  <meta http-equiv="Expires" content="0"/>
  <title>AI Chat</title>
  <link rel="stylesheet" href="/mini-app/chat/styles.css?v=20260814-loader-text-original-1"/>
</head>
<body>
  <section id="aiChatPage" class="ai-chat-page" aria-hidden="false">
    <header id="aiChatHead" class="ai-chat-head">
      <div class="credit-tools">
        <button id="aiChatMenuButton" class="ai-chat-menu-button" type="button" aria-label="Open AI settings" aria-controls="aiChatMenuPanel" aria-expanded="false">
          <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
        </button>
        <div id="aiChatCreditPill" class="credit-pill" aria-label="USD balance">
          <span id="aiChatBalance">—</span>
          <span>USD</span>
        </div>
      </div>
      <div class="mode-tools">
        <div id="aiChatVoiceWrap" class="voice-wrap">
          <button id="aiChatVoiceCard" class="voice-btn" data-action="toggle-voice" type="button" aria-label="Selected voice" aria-haspopup="listbox" aria-expanded="false">
            <span id="aiChatVoiceAvatar" class="voice-button-avatar" aria-hidden="true"></span>
            <span id="aiChatVoiceLabel">Nora</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="aiChatVoiceMenu" class="voice-menu" aria-hidden="true">
            <div id="aiChatVoiceRows" class="my-voice-rows">${AI_CHAT_VOICE_ROWS}</div>
            <div id="aiChatVoicesEmpty" class="my-voices-empty">Add voices to your list</div>
            <button id="aiChatOpenVoices" class="voice-library-open" type="button">
              <span>Voices</span>
              <small id="aiChatVoiceMenuCount">0 / 6</small>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
    <div id="aiChatMenuBackdrop" class="ai-chat-menu-backdrop" aria-hidden="true">
      <aside id="aiChatMenuPanel" class="ai-chat-menu-panel" aria-label="AI settings">
        <div class="ai-chat-menu-head">
          <div><small>Vexa</small><strong>AI settings</strong></div>
          <button id="aiChatMenuClose" type="button" aria-label="Close AI settings">×</button>
        </div>
        <section class="ai-chat-menu-section">
          <p>Model</p>
          <div id="aiChatModelMenu" class="ai-chat-model-grid" role="listbox" aria-label="Choose GPT model">
            <button class="model-option" data-ai-model="gpt-5.6-luna" type="button" role="option"><span><strong>Luna <em>5.6</em></strong><small>Fast & efficient</small></span><b aria-hidden="true"></b></button>
            <button class="model-option active" data-ai-model="gpt-5.6-terra" type="button" role="option"><span><strong>Terra <em>5.6</em></strong><small>Balanced</small></span><b aria-hidden="true"></b></button>
            <button class="model-option" data-ai-model="gpt-5.6-sol" type="button" role="option"><span><strong>Sol <em>5.6</em></strong><small>Hard coding</small></span><b aria-hidden="true"></b></button>
          </div>
        </section>
        <section class="ai-chat-menu-section">
          <p>Thinking</p>
          <div id="aiChatEffortMenu" class="ai-chat-effort-grid" role="listbox" aria-label="Choose reasoning effort">
            <button data-ai-effort="low" type="button" role="option">Light</button>
            <button class="active" data-ai-effort="medium" type="button" role="option">Medium</button>
            <button data-ai-effort="high" type="button" role="option">High</button>
            <button data-ai-effort="max" type="button" role="option">Max</button>
          </div>
        </section>
        <section class="ai-chat-menu-section ai-chat-menu-github-slot">
          <p>Repository</p>
          <button id="aiChatGithubButton" class="ai-github-button" type="button" aria-label="Connect GitHub repository"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.1 1.2a10.8 10.8 0 0 1 5.7 0C14.9 5 16 5.3 16 5.3c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"/></svg><span class="ai-github-button-label">GitHub</span><span class="ai-chat-menu-chevron">›</span></button>
        </section>
        <section class="ai-chat-memory-card" aria-label="AI memory usage">
          <div class="ai-chat-memory-head"><span><strong>Memory</strong><small id="aiChatMemoryItems">0 saved</small></span><button id="aiChatMemoryClear" type="button">Clear</button></div>
          <div class="ai-chat-memory-bar" aria-hidden="true"><span id="aiChatMemoryFill"></span></div>
          <div id="aiChatMemoryUsage" class="ai-chat-memory-usage">0 B of 64 KB</div>
        </section>
      </aside>
    </div>
    <div id="aiChatMessages" class="ai-chat-messages" role="log" aria-live="polite"><div id="aiChatEmpty" class="ai-chat-empty"><span>How can I help?</span><canvas id="aiChatEmptyOrb" class="ai-chat-empty-orb" width="96" height="96" aria-hidden="true"></canvas></div></div>
    <form id="aiChatComposer" class="ai-chat-composer">
      <input id="aiChatFile" type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,.json,.html,.htm,.xml,.csv,.tsv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.js,.mjs,.ts,.tsx,.jsx,.py,.css,.sql,.log,.yaml,.yml,.toml,.eml,.ics,.srt,.vtt"/>
      <div id="aiChatAttachmentPreview" class="ai-chat-attachment-preview" aria-hidden="true"></div>
      <button id="aiChatAttach" class="ai-chat-attach" type="button" aria-label="Attach a file"><span aria-hidden="true">+</span></button>
      <textarea id="aiChatInput" maxlength="4000" rows="1" dir="ltr" placeholder="Ask Vexa" aria-label="Ask Vexa"></textarea>
      <button id="aiChatSend" type="submit" aria-label="Send message"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </form>
  </section>
  <audio id="aiChatVoicePreviewAudio" hidden></audio>
  <div id="toast" class="toast" role="status"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="/mini-app/chat/creature.js?v=20260801-ai-chat-creature-rounded-jelly-2"></script>
  <script>
  (function(){
    var list=document.getElementById('aiChatMessages');
    if(!list)return;

    var tg=window.Telegram&&window.Telegram.WebApp;
    var tgUser=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.user;
    var userId=tgUser&&tgUser.id!=null?String(tgUser.id):'local';
    var storageKey='vexa:ai-chat:conversation:v1:'+userId;
    var restoredContext=[];
    var restoredScroll=null;
    var saveTimer=0;

    function normalizeEntry(value){
      if(!value||typeof value!=='object')return null;
      var role=value.role==='assistant'?'assistant':value.role==='user'?'user':'';
      var content=String(value.content||'').slice(0,24000);
      if(!role||!content)return null;
      return {role:role,content:content,rtl:!!value.rtl};
    }

    function readHistory(){
      try{
        var raw=localStorage.getItem(storageKey);
        if(!raw)return {messages:[],scroll:null};
        var parsed=JSON.parse(raw);
        var source=Array.isArray(parsed)?parsed:Array.isArray(parsed&&parsed.messages)?parsed.messages:[];
        var scroll=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.scroll&&typeof parsed.scroll==='object'?parsed.scroll:null;
        return {messages:source.map(normalizeEntry).filter(Boolean).slice(-2000),scroll:scroll};
      }catch(error){
        return {messages:[],scroll:null};
      }
    }

    function captureScroll(){
      var messages=list.querySelectorAll('.ai-chat-message');
      if(!messages.length)return {top:Math.max(0,list.scrollTop||0),index:-1,offset:0};
      var listRect=list.getBoundingClientRect();
      var index=0;
      for(var i=0;i<messages.length;i+=1){
        if(messages[i].getBoundingClientRect().bottom>listRect.top+1){index=i;break}
        index=i;
      }
      return {
        top:Math.max(0,list.scrollTop||0),
        index:index,
        offset:messages[index].getBoundingClientRect().top-listRect.top
      };
    }

    function writeHistory(entries){
      var keep=entries.slice(-2000);
      var scroll=captureScroll();
      while(keep.length){
        try{
          localStorage.setItem(storageKey,JSON.stringify({version:1,messages:keep,scroll:scroll}));
          return;
        }catch(error){
          if(keep.length<=20)return;
          keep=keep.slice(Math.min(10,keep.length-20));
          if(scroll.index>=0)scroll.index=Math.max(0,scroll.index-Math.min(10,keep.length-20));
        }
      }
    }

    function messageText(content){
      var value='';
      try{value=String(content.innerText||content.textContent||'')}catch(error){value=String(content.textContent||'')}
      return value.slice(0,24000);
    }

    function collectHistory(){
      return Array.prototype.map.call(list.querySelectorAll('.ai-chat-message'),function(item){
        var content=item.querySelector('.ai-chat-message-content');
        if(!content)return null;
        var role=item.classList.contains('assistant')?'assistant':item.classList.contains('user')?'user':'';
        var text=messageText(content);
        if(!role||!text)return null;
        return {role:role,content:text,rtl:item.classList.contains('rtl')};
      }).filter(Boolean).slice(-2000);
    }

    function saveNow(){
      if(saveTimer){clearTimeout(saveTimer);saveTimer=0}
      writeHistory(collectHistory());
    }

    function scheduleSave(){
      if(saveTimer)clearTimeout(saveTimer);
      saveTimer=setTimeout(saveNow,180);
    }

    function restoreMessage(entry){
      var item=document.createElement('article');
      item.className='ai-chat-message '+entry.role+(entry.rtl?' rtl':'');
      item.setAttribute('data-restored-chat','true');
      item.style.animation='none';
      item.style.opacity='1';
      var content=document.createElement('div');
      content.className='ai-chat-message-content';
      content.setAttribute('dir',entry.rtl?'rtl':'ltr');
      content.style.whiteSpace='pre-wrap';
      content.textContent=entry.content;
      item.appendChild(content);
      list.appendChild(item);
    }

    var stored=readHistory();
    var restored=stored.messages;
    restoredScroll=stored.scroll;
    restoredContext=restored.map(function(entry){return {role:entry.role,content:entry.content}});
    restored.forEach(restoreMessage);

    if(restored.length){
      var empty=document.getElementById('aiChatEmpty');
      if(empty)empty.classList.add('hidden');
      requestAnimationFrame(function(){
        var messages=list.querySelectorAll('.ai-chat-message');
        var scroll=restoredScroll;
        if(scroll&&Number.isFinite(Number(scroll.index))&&Number(scroll.index)>=0&&messages.length){
          var index=Math.min(messages.length-1,Math.max(0,Math.floor(Number(scroll.index))));
          var listRect=list.getBoundingClientRect();
          var target=messages[index];
          var offset=Number(scroll.offset)||0;
          list.scrollTop=Math.max(0,list.scrollTop+target.getBoundingClientRect().top-listRect.top-offset);
        }else if(scroll&&Number.isFinite(Number(scroll.top))){
          list.scrollTop=Math.max(0,Number(scroll.top));
        }
      });
    }

    if(typeof MutationObserver==='function'){
      var observer=new MutationObserver(scheduleSave);
      observer.observe(list,{childList:true,subtree:true,characterData:true});
    }

    list.addEventListener('scroll',scheduleSave,{passive:true});
    window.addEventListener('pagehide',saveNow);

    var nativeFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      try{
        var url=typeof input==='string'?input:String(input&&input.url||'');
        var method=String(init&&init.method||input&&input.method||'GET').toUpperCase();
        if(restoredContext.length&&method==='POST'&&url.indexOf('/mini-app/api/chat')>=0&&init&&typeof init.body==='string'){
          var body=JSON.parse(init.body);
          if(Array.isArray(body.messages)){
            body.messages=restoredContext.concat(body.messages).slice(-20);
            init=Object.assign({},init,{body:JSON.stringify(body)});
          }
        }
      }catch(error){}
      return nativeFetch(input,init);
    };
  })();
  </script>
  <script type="module" src="/mini-app/chat/app.js?v=20260814-loader-text-original-1"></script>
  <script src="/mini-app/chat/github.js?v=20260814-loader-text-root-1"></script>
</body>
</html>`;
