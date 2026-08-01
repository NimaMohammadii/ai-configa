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
  <link rel="stylesheet" href="/mini-app/chat/styles.css?v=20260801-ai-chat-voice-menu-soft-wave-1"/>
</head>
<body>
  <section id="aiChatPage" class="ai-chat-page" aria-hidden="false">
    <header id="aiChatHead" class="ai-chat-head">
      <div class="credit-tools">
        <div id="aiChatCreditPill" class="credit-pill" aria-label="Credits">
          <span id="aiChatBalance">—</span>
          <span>credits</span>
        </div>
      </div>
      <div class="mode-tools">
        <div id="aiChatVoiceWrap" class="voice-wrap">
          <button id="aiChatVoiceCard" class="voice-btn" type="button" aria-label="Selected voice" aria-haspopup="listbox" aria-expanded="false">
            <span id="aiChatVoiceAvatar" class="voice-button-avatar" aria-hidden="true"></span>
            <span id="aiChatVoiceLabel">Nora</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="aiChatVoiceMenu" class="voice-menu" role="listbox" aria-label="Choose voice" aria-hidden="true">
            <div id="aiChatVoiceRows" class="my-voice-rows"></div>
            <div id="aiChatVoicesEmpty" class="my-voices-empty" hidden>No saved voices yet</div>
          </div>
        </div>
      </div>
    </header>
    <div id="aiChatMessages" class="ai-chat-messages" role="log" aria-live="polite"><div id="aiChatEmpty" class="ai-chat-empty"><span>How can I help?</span><canvas id="aiChatEmptyOrb" class="ai-chat-empty-orb" width="96" height="96" aria-hidden="true"></canvas></div></div>
    <form id="aiChatComposer" class="ai-chat-composer">
      <input id="aiChatFile" type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,.json,.html,.htm,.xml,.csv,.tsv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.js,.mjs,.ts,.tsx,.jsx,.py,.css,.sql,.log,.yaml,.yml,.toml,.eml,.ics,.srt,.vtt"/>
      <div id="aiChatAttachmentPreview" class="ai-chat-attachment-preview" aria-hidden="true"></div>
      <button id="aiChatAttach" class="ai-chat-attach" type="button" aria-label="Attach a file"><span aria-hidden="true">+</span></button>
      <textarea id="aiChatInput" maxlength="4000" rows="1" dir="ltr" placeholder="Ask Vexa" aria-label="Ask Vexa"></textarea>
      <button id="aiChatSend" type="submit" aria-label="Send message"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </form>
  </section>
  <div id="toast" class="toast" role="status"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="/mini-app/chat/creature.js?v=20260801-ai-chat-creature-rounded-jelly-2"></script>
  <script type="module" src="/mini-app/chat/app.js?v=20260801-ai-chat-voice-menu-soft-wave-1"></script>
</body>
</html>`;
