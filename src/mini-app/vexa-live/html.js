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
  <link rel="stylesheet" href="/mini-app/live/styles.css?v=20260814-1" />
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
      <p class="live-kicker">VIDEO · LIVE TEXT</p>
      <h1 id="liveTitle">See every word.</h1>
      <p class="live-copy">Choose a video. Watch captions appear as it plays.</p>
    </section>

    <section id="videoPickerState" class="video-picker-state">
      <button id="chooseVideoButton" class="video-picker" type="button" data-action="pick-video">
        <span class="video-picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3.75" y="5" width="16.5" height="14" rx="4" stroke="currentColor" stroke-width="1.55" />
            <path d="M12 14.8V9.2m0 0L9.7 11.5M12 9.2l2.3 2.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="video-picker-copy">
          <strong>Choose a video</strong>
          <small>MP4 · MOV · WEBM</small>
        </span>
        <span class="video-picker-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
      <input id="videoFile" type="file" accept="video/*" hidden />

      <div class="live-feature-row" aria-label="Caption settings preview">
        <div class="live-feature">
          <span class="feature-icon" aria-hidden="true">A</span>
          <span><small>LANGUAGE</small><strong>Auto detect</strong></span>
        </div>
        <div class="live-feature">
          <span class="feature-icon caption-feature-icon" aria-hidden="true">
            <i></i><i></i>
          </span>
          <span><small>MODE</small><strong>Live captions</strong></span>
        </div>
      </div>
    </section>

    <section id="videoReadyState" class="video-ready-state" aria-hidden="true">
      <div class="video-ready-head">
        <div>
          <span>VIDEO READY</span>
          <strong id="videoName">Video</strong>
        </div>
        <button type="button" data-action="change-video">Change</button>
      </div>

      <div class="video-stage">
        <video
          id="videoPreview"
          controls
          playsinline
          webkit-playsinline
          preload="metadata"
        ></video>
        <div class="caption-preview" aria-hidden="true">
          <span>Captions will appear here</span>
        </div>
      </div>

      <div class="video-meta-row">
        <span id="videoMeta">Local preview</span>
        <span class="ready-chip"><i></i> Ready</span>
      </div>

      <button id="startCaptionsButton" class="start-captions" type="button" disabled>
        <span>Start live captions</span>
        <small>Scribe connection next</small>
      </button>
    </section>

    <footer class="live-footer">
      <span class="footer-line"></span>
      <small>Designed for Scribe v2 Realtime</small>
      <span class="footer-line"></span>
    </footer>
  </main>

  <div id="liveToast" class="live-toast" role="status" aria-live="polite"></div>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/live/app.js?v=20260814-1"></script>
</body>
</html>`;
