export const VEXA_LIVE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"
  />
  <meta name="theme-color" content="#000000" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <link rel="stylesheet" href="/mini-app/live/styles.css?v=20260814-4" />
  <style>
    .caption-mode-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin: 0 0 8px;
      padding: 4px;
      border-radius: 17px;
      background: rgba(255, 255, 255, 0.035);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.065);
    }

    .caption-mode-switch button {
      min-height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border-radius: 13px;
      color: rgba(255, 255, 255, 0.42);
      background: transparent;
      transition: transform 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }

    .caption-mode-switch button.active {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.085);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 8px 22px rgba(0, 0, 0, 0.18);
    }

    .caption-mode-switch button:active {
      transform: scale(0.97);
    }

    .caption-mode-switch strong {
      font-size: 12px;
      font-weight: 760;
      letter-spacing: -0.025em;
    }

    .caption-mode-switch small {
      font-size: 7.5px;
      font-weight: 680;
      letter-spacing: 0.02em;
      opacity: 0.58;
    }

    .live-source-switch {
      display: none;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin: 0 0 8px;
      opacity: 0;
      transform: translateY(-4px);
    }

    .live-source-switch.show {
      display: grid;
      opacity: 1;
      transform: translateY(0);
      animation: panelIn 0.28s ease both;
    }

    .live-source-switch button {
      height: 36px;
      border-radius: 12px;
      color: rgba(255, 255, 255, 0.38);
      background: rgba(255, 255, 255, 0.025);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.045);
      font-size: 10px;
      font-weight: 720;
      transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
    }

    .live-source-switch button.active {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.075);
    }

    .live-source-switch button:active {
      transform: scale(0.97);
    }

    .is-hidden {
      display: none !important;
    }

    .youtube-input-state {
      display: none;
      margin-top: 0;
    }

    .youtube-input-state.show {
      display: block;
      animation: panelIn 0.32s ease both;
    }

    .youtube-link-card {
      min-height: 66px;
      display: grid;
      grid-template-columns: 38px 1fr auto;
      align-items: center;
      gap: 9px;
      padding: 10px;
      border-radius: 18px;
      background: rgba(13, 13, 13, 0.66);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.09),
        inset 0 -1px 0 rgba(255, 255, 255, 0.04);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .youtube-link-icon {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 13px;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.065);
    }

    .youtube-link-icon svg {
      width: 21px;
      height: 21px;
    }

    .youtube-link-card input {
      min-width: 0;
      height: 38px;
      padding: 0 3px;
      border: 0;
      outline: 0;
      color: #ffffff;
      background: transparent;
      font-family: var(--font);
      font-size: 12px;
      font-weight: 620;
      letter-spacing: -0.018em;
    }

    .youtube-link-card input::placeholder {
      color: rgba(255, 255, 255, 0.28);
    }

    .youtube-link-card button {
      height: 34px;
      padding: 0 12px;
      border-radius: 11px;
      color: #000000;
      background: #ffffff;
      font-size: 10px;
      font-weight: 780;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .youtube-link-card button:active:not(:disabled) {
      transform: scale(0.94);
    }

    .youtube-link-card button:disabled {
      opacity: 0.25;
    }

    .youtube-note {
      display: block;
      margin: 8px 4px 0;
      color: rgba(255, 255, 255, 0.28);
      font-size: 8px;
      font-weight: 560;
      line-height: 1.45;
    }

    .youtube-ready-state {
      display: none;
      animation: panelIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .youtube-ready-state.show {
      display: block;
    }

    .youtube-stage iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #050505;
    }
  </style>
</head>
<body>
  <main class="live-app">
    <header class="live-header">
      <a class="live-back" href="/mini-app" data-action="back" aria-label="Back to Vexa">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15.5 5.5 9 12l6.5 6.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>

      <div class="live-brand">
        <span>CAPTIONS</span>
        <strong>Vexa Live</strong>
      </div>

      <span class="live-mark" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </header>

    <section class="live-hero" aria-labelledby="liveTitle">
      <div class="caption-orbit" aria-hidden="true">
        <span class="orbit-frame"></span>
        <span class="orbit-line orbit-line-one"></span>
        <span class="orbit-line orbit-line-two"></span>
        <span class="orbit-cursor"></span>
      </div>
      <p class="live-kicker">VIDEO · SMART TEXT</p>
      <h1 id="liveTitle">See every word.</h1>
      <p class="live-copy">Choose accurate captions first, or switch to Live for subtitles while the video plays.</p>
    </section>

    <section id="videoPickerState" class="video-picker-state">
      <div class="caption-mode-switch" aria-label="Caption mode">
        <button class="active" type="button" data-caption-mode="standard" aria-pressed="true">
          <strong>Standard</strong>
          <small>Ready first</small>
        </button>
        <button type="button" data-caption-mode="live" aria-pressed="false">
          <strong>Live</strong>
          <small>While playing</small>
        </button>
      </div>

      <div id="liveSourceSwitch" class="live-source-switch" aria-label="Live video source">
        <button class="active" type="button" data-live-source="file" aria-pressed="true">Video file</button>
        <button type="button" data-live-source="youtube" aria-pressed="false">YouTube</button>
      </div>

      <div class="language-setup" aria-label="Caption languages">
        <label class="language-field" for="sourceLanguage">
          <span>VIDEO LANGUAGE</span>
          <span class="language-select-wrap">
            <select id="sourceLanguage" aria-label="Video language">
              <option value="">Choose language</option>
              <option value="en">English</option>
              <option value="fa">Persian</option>
              <option value="ru">Russian</option>
              <option value="de">German</option>
              <option value="tr">Turkish</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="hi">Hindi</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </label>

        <label class="language-field" for="subtitleLanguage">
          <span>SUBTITLE LANGUAGE</span>
          <span class="language-select-wrap">
            <select id="subtitleLanguage" aria-label="Subtitle language">
              <option value="">Choose language</option>
              <option value="en">English</option>
              <option value="fa">Persian</option>
              <option value="ru">Russian</option>
              <option value="de">German</option>
              <option value="tr">Turkish</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="hi">Hindi</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </label>
      </div>

      <button id="chooseVideoButton" class="video-picker" type="button" data-action="pick-video" disabled>
        <span class="video-picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3.75" y="5" width="16.5" height="14" rx="4" stroke="currentColor" stroke-width="1.55" />
            <path d="M12 14.8V9.2m0 0L9.7 11.5M12 9.2l2.3 2.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="video-picker-copy">
          <strong>Choose a video</strong>
          <small id="languageRoute">SELECT BOTH LANGUAGES FIRST</small>
        </span>
        <span class="video-picker-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
      <input id="videoFile" type="file" accept="video/*" hidden />

      <div id="youtubeInputState" class="youtube-input-state">
        <div class="youtube-link-card">
          <span class="youtube-link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M8.2 6.7h7.6c2.6 0 3.5.9 3.5 3.4v3.8c0 2.5-.9 3.4-3.5 3.4H8.2c-2.6 0-3.5-.9-3.5-3.4v-3.8c0-2.5.9-3.4 3.5-3.4Z" stroke="currentColor" stroke-width="1.5" />
              <path d="m10.6 9.7 4 2.3-4 2.3V9.7Z" fill="currentColor" />
            </svg>
          </span>
          <input id="youtubeUrl" type="url" inputmode="url" autocomplete="off" placeholder="Paste YouTube link" aria-label="YouTube link" />
          <button id="openYoutubeButton" type="button" data-action="open-youtube" disabled>Open</button>
        </div>
        <small class="youtube-note">Live YouTube uses captions available inside the official YouTube player. If a target-language caption is not available, upload the video file for Vexa captions.</small>
      </div>
    </section>

    <section id="videoReadyState" class="video-ready-state" aria-hidden="true">
      <div class="video-ready-head">
        <div>
          <span id="captionModeLabel">CAPTIONS</span>
          <strong id="videoName">Video</strong>
        </div>
        <button type="button" data-action="change-video">Change</button>
      </div>

      <div class="video-stage">
        <video
          id="videoPreview"
          playsinline
          webkit-playsinline
          preload="metadata"
        ></video>
        <div id="captionPreview" class="caption-preview" aria-live="polite">
          <span id="liveCaptionText"></span>
        </div>
      </div>

      <div class="video-meta-row">
        <span id="videoMeta">Local preview</span>
        <span id="captionStatus" class="ready-chip"><i></i><b>Preparing captions</b></span>
      </div>
    </section>

    <section id="youtubeReadyState" class="youtube-ready-state" aria-hidden="true">
      <div class="video-ready-head">
        <div>
          <span>YOUTUBE · LIVE</span>
          <strong id="youtubeVideoName">YouTube</strong>
        </div>
        <button type="button" data-action="change-youtube">Change</button>
      </div>

      <div class="video-stage youtube-stage">
        <iframe
          id="youtubePlayer"
          title="YouTube video player"
          src="about:blank"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>

      <div class="video-meta-row">
        <span>Official YouTube player</span>
        <span class="ready-chip"><i></i><b>Captions if available</b></span>
      </div>
    </section>

    <footer class="live-footer">
      <span class="footer-line"></span>
      <small id="engineLabel">Scribe v2</small>
      <span class="footer-line"></span>
    </footer>
  </main>

  <div id="liveToast" class="live-toast" role="status" aria-live="polite"></div>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/live/app.js?v=20260814-4"></script>
</body>
</html>`;
