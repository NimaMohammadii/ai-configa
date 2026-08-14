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
  <link rel="stylesheet" href="/mini-app/live/styles.css?v=20260814-3" />
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
      <p class="live-copy">Pick the video language and the subtitle language, then choose your video.</p>
    </section>

    <section id="videoPickerState" class="video-picker-state">
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

    <footer class="live-footer">
      <span class="footer-line"></span>
      <small>Scribe v2</small>
      <span class="footer-line"></span>
    </footer>
  </main>

  <div id="liveToast" class="live-toast" role="status" aria-live="polite"></div>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/live/app.js?v=20260814-3"></script>
</body>
</html>`;
