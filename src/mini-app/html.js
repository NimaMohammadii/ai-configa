export const MINI_APP_HTML = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#000000" />
  <title>Vexa FLOW</title>
  <link rel="stylesheet" href="/mini-app/styles.css" />
</head>
<body>
  <main class="app">
    <section id="flow" class="view active">
      <div class="tts-page">
        <div class="tts-head">
          <div class="credit-pill"><span>Credits</span><strong id="balance">—</strong></div>
          <div id="voiceWrap" class="voice-wrap">
            <button class="voice-btn" data-action="toggle-voice" type="button">
              <span id="voiceName">Nora</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="voice-menu">
              <button class="active" data-voice="TX3LPaxmHKxFdv7VOQHJ" type="button">Liam</button>
              <button data-voice="1SM7GgM6IMuvQlz2BwM3" type="button">Noah</button>
              <button data-voice="tnSpp4vdxKPjI9w0GnoV" type="button">Ava</button>
              <button data-voice="BIvP0GN1cAtSRTxNHnWS" type="button">Nora</button>
              <button data-voice="GFGuOkimbpNkTEOVDkqX" type="button">Alex</button>
              <button data-voice="NZiuR1C6kVMSWHG27sIM" type="button">Ella</button>
              <button data-voice="BZgkqPqms7Kj9ulSkVzn" type="button">Chloe</button>
              <button data-voice="kdmDKE6EkgrWrrykO9Qt" type="button">Alexandra</button>
              <button data-voice="7piC4m7q8WrpEAnMj5xC" type="button">Laura</button>
              <button data-voice="0dPqNXnhg2bmxQv1WKDp" type="button">Maxon</button>
              <button data-voice="cgSgspJ2msm6clMCkdW9" type="button">Jessica</button>
              <button data-voice="Bj9UqZbhQsanLzgalpEG" type="button">Austin</button>
            </div>
          </div>
        </div>

        <div class="tts-area">
          <div class="tts-label">Text</div>
          <textarea id="ttsText" placeholder="Type something"></textarea>
        </div>

        <button class="keyboard-dismiss" data-action="dismiss-keyboard" type="button" aria-label="Hide keyboard">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <div class="tts-bottom">
          <div id="wavePlayer" class="wave-player">
            <button id="wavePlay" class="wave-play" data-action="play-tts" type="button">▶</button>
            <svg class="wave-svg" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">
              <rect x="2.0" y="15.0" width="3.2" height="14" rx="1.6"/><rect x="9.6" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="17.2" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="24.8" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="32.4" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="40.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="47.6" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="55.2" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="62.8" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="70.4" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="78.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="85.6" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="93.2" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="100.8" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="108.4" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="116.0" y="3.0" width="3.2" height="38" rx="1.6"/><rect x="123.6" y="10.5" width="3.2" height="23" rx="1.6"/><rect x="131.2" y="15.5" width="3.2" height="13" rx="1.6"/><rect x="138.8" y="6.0" width="3.2" height="32" rx="1.6"/><rect x="146.4" y="9.0" width="3.2" height="26" rx="1.6"/><rect x="154.0" y="14.5" width="3.2" height="15" rx="1.6"/><rect x="161.6" y="4.0" width="3.2" height="36" rx="1.6"/><rect x="169.2" y="12.0" width="3.2" height="20" rx="1.6"/><rect x="176.8" y="8.0" width="3.2" height="28" rx="1.6"/><rect x="184.4" y="16.0" width="3.2" height="12" rx="1.6"/><rect x="192.0" y="5.0" width="3.2" height="34" rx="1.6"/><rect x="199.6" y="13.0" width="3.2" height="18" rx="1.6"/><rect x="207.2" y="7.0" width="3.2" height="30" rx="1.6"/><rect x="214.8" y="16.5" width="3.2" height="11" rx="1.6"/><rect x="222.4" y="10.0" width="3.2" height="24" rx="1.6"/><rect x="230.0" y="15.0" width="3.2" height="14" rx="1.6"/>
            </svg>
            <span class="wave-time" id="waveTime">0:00</span>
          </div>

          <div class="tts-generate-row">
            <button id="convertButton" class="tts-generate" data-action="generate-tts" type="button">Generate Voice</button>
            <span class="char-count-wrap">
              <span class="char-count" id="charCount">0 characters</span>
              <button class="char-warning" id="ttsCharWarning" data-action="open-char-limit" type="button" aria-label="Character limit warning">!</button>
            </span>
          </div>

          <audio id="audioPlayer" class="tts-hidden-audio"></audio>
        </div>

        <div class="limit-sheet" id="ttsLimitSheet" aria-hidden="true">
          <button class="limit-backdrop" data-action="close-char-limit" type="button" aria-label="Close"></button>
          <div class="limit-card">
            <div class="limit-icon">!</div>
            <h3>Character limit</h3>
            <p>You can’t convert more than 1000 characters</p>
            <button class="limit-close" data-action="close-char-limit" type="button">Got it</button>
          </div>
        </div>
      </div>
    </section>
  </main>

  <div id="toast" class="toast" role="status"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/app.js"></script>
</body>
</html>`;
