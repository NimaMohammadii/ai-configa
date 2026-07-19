import { VOICE_NAMES, VOICES } from "../voices.js";

const VOICE_ROWS = VOICE_NAMES.map((name) => {
  const voiceId = VOICES[name];
  return `<div class="voice-option" data-voice-row="${voiceId}"><span class="voice-avatar" aria-hidden="true"><span class="voice-avatar-image"></span></span><button class="voice-select${name === "Liam" ? " active" : ""}" data-voice="${voiceId}" data-voice-name="${name}" type="button"><span>${name}</span></button><button class="voice-preview" data-action="preview-voice" data-preview-voice="${voiceId}" data-preview-name="${name}" type="button" aria-label="Play ${name} demo"><span class="voice-preview-icon">▶</span></button></div>`;
}).join("");

export const MINI_APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <meta name="theme-color" content="#000000"/>
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
  <meta http-equiv="Pragma" content="no-cache"/>
  <meta http-equiv="Expires" content="0"/>
  <title>Vexa Voice</title>
  <link rel="stylesheet" href="/mini-app/styles.css?v=20260719-9"/>
</head>
<body>
  <main class="app">
    <section id="flow" class="view active">
      <div class="tts-page">
        <div class="tts-head">
          <div class="credit-pill"><span id="balance">—</span><span>credits</span></div>
          <div id="voiceWrap" class="voice-wrap">
            <button class="voice-btn" data-action="toggle-voice" type="button">
              <span id="voiceButtonAvatar" class="voice-button-avatar" aria-hidden="true"></span>
              <span id="voiceLabel">Liam</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="voice-menu">${VOICE_ROWS}</div>
          </div>
        </div>
        <div class="tts-area">
          <div class="tts-label">Text</div>
          <textarea id="ttsText" placeholder="Type something"></textarea>
        </div>
        <button class="keyboard-dismiss" data-action="dismiss-keyboard" type="button" aria-label="Hide keyboard"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="tts-bottom">
          <div class="player-history-row">
            <div id="wavePlayer" class="wave-player">
            <button id="wavePlay" class="wave-play" data-action="play-tts" type="button" aria-label="Play audio"><span class="wave-play-shape" aria-hidden="true"><svg class="wave-play-icon" viewBox="0 0 24 24" style="stroke:none"><path d="M6.2 2.8C4.7 1.9 2.8 3 2.8 4.75v14.5c0 1.75 1.9 2.85 3.4 1.95l13.8-8.1c1.6-.95 1.6-1.25 0-2.2z"/></svg><span class="wave-pause-icon"><i></i><i></i></span></span></button>
            <svg class="wave-svg" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"><rect x="2.0" y="15.0" width="3.2" height="14" rx="1.6"/><rect x="9.6" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="17.2" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="24.8" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="32.4" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="40.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="47.6" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="55.2" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="62.8" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="70.4" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="78.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="85.6" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="93.2" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="100.8" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="108.4" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="116.0" y="3.0" width="3.2" height="38" rx="1.6"/><rect x="123.6" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="131.2" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="138.8" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="146.4" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="154.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="161.6" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="169.2" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="176.8" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="184.4" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="192.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="199.6" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="207.2" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="214.8" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="222.4" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="230.0" y="15.0" width="3.2" height="14" rx="1.6"/></svg>
            <span class="wave-time" id="waveTime">0:00</span>
            <button id="waveShare" class="wave-share" data-action="share-tts" type="button" aria-label="Share audio"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13.5v4A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <button id="historyButton" class="history-button" data-action="open-history" type="button" aria-label="Open history"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.6 8.2A8.2 8.2 0 1 1 4 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.6 8.2V4.6M4.6 8.2H8.2M12 7.8v4.6l3.1 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <div class="tts-generate-row">
            <button id="convertButton" class="tts-generate" data-action="generate-tts" type="button">Generate Voice</button>
            <span class="char-count-wrap"><span class="char-count" id="ttsCharCount">0 characters</span><button class="char-warning" id="ttsCharWarning" data-action="open-char-limit" type="button" aria-label="Character limit warning">!</button></span>
          </div>
          <audio id="ttsAudio" class="tts-hidden-audio"></audio>
          <audio id="voicePreviewAudio" class="tts-hidden-audio"></audio>
          <audio id="historyAudio" class="tts-hidden-audio"></audio>
        </div>
        <div class="history-sheet" id="historySheet" aria-hidden="true"><button class="history-backdrop" data-action="close-history" type="button" aria-label="Close history"></button><section class="history-card" role="dialog" aria-modal="true" aria-labelledby="historyTitle"><div class="history-grabber" aria-hidden="true"></div><header class="history-head"><div><p class="history-kicker">Your creations</p><h2 id="historyTitle">History</h2></div><button class="history-close" data-action="close-history" type="button" aria-label="Close history"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header><div id="historyList" class="history-list"><div class="history-loading"><span></span><span></span><span></span></div></div></section></div>
        <div class="limit-sheet" id="ttsLimitSheet" aria-hidden="true"><button class="limit-backdrop" data-action="close-char-limit" type="button" aria-label="Close"></button><div class="limit-card"><div class="limit-icon">!</div><h3>Character limit</h3><p>You can’t convert more than 1000 characters</p><button class="limit-close" data-action="close-char-limit" type="button">Got it</button></div></div>
      </div>
    </section>
  </main>
  <div id="toast" class="toast" role="status"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/app.js?v=20260719-10"></script>
</body>
</html>`;
