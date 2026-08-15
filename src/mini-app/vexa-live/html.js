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
  <link rel="stylesheet" href="/mini-app/live/styles.css?v=20260815-7" />
  <style id="vexaLivePremiumUi">
    :root{
      --vexa-card:rgba(255,255,255,.055);
      --vexa-card-strong:rgba(255,255,255,.075);
      --vexa-line:rgba(255,255,255,.13);
      --vexa-line-soft:rgba(255,255,255,.075);
      --vexa-muted:rgba(255,255,255,.58);
      --vexa-dim:rgba(255,255,255,.32);
      --vexa-ease:cubic-bezier(.16,.86,.22,1);
    }

    html,body{background:#000!important;color:#fff!important}
    body{min-height:var(--tg-viewport-height,100dvh)}

    .live-app{
      width:min(100%,560px)!important;
      min-height:var(--tg-viewport-height,100dvh)!important;
      margin:0 auto!important;
      padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom))!important;
      background:#000!important;
      overflow:visible!important;
    }
    .live-app::before,.live-app::after{display:none!important}

    .live-header{
      height:38px!important;
      display:grid!important;
      grid-template-columns:38px 1fr auto!important;
      align-items:center!important;
      gap:10px!important;
      animation:vexaSoftIn .42s var(--vexa-ease) both!important;
    }
    .live-back{
      width:36px!important;
      height:36px!important;
      border-radius:50%!important;
      display:grid!important;
      place-items:center!important;
      color:#fff!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 24px rgba(0,0,0,.28)!important;
      backdrop-filter:blur(10px)!important;
      -webkit-backdrop-filter:blur(10px)!important;
      transition:transform .2s var(--vexa-ease),background .2s ease!important;
    }
    .live-back:active{transform:scale(.9)!important;background:var(--vexa-card-strong)!important}
    .live-back svg{width:18px!important;height:18px!important}

    .live-brand{align-items:center!important;justify-content:center!important;gap:0!important;transform:none!important}
    .live-brand span{display:none!important}
    .live-brand strong{margin:0!important;font-size:16px!important;font-weight:690!important;letter-spacing:-.035em!important}

    .live-status-pill{
      height:30px!important;
      padding:0 10px!important;
      display:flex!important;
      align-items:center!important;
      gap:6px!important;
      border-radius:999px!important;
      color:var(--vexa-muted)!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line-soft)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.045)!important;
      font-size:9px!important;
      font-weight:650!important;
      letter-spacing:0!important;
    }
    .live-status-pill i{
      width:5px!important;
      height:5px!important;
      border-radius:50%!important;
      background:#fff!important;
      box-shadow:none!important;
      animation:vexaReadyPulse 2.4s ease-in-out infinite!important;
    }

    .live-hero{
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-start!important;
      padding:34px 2px 18px!important;
      text-align:left!important;
    }
    .editor-demo,.live-kicker{display:none!important}
    .live-hero h1{
      max-width:340px!important;
      margin:0!important;
      color:#fff!important;
      font-size:26px!important;
      line-height:1.04!important;
      font-weight:720!important;
      letter-spacing:-.055em!important;
      animation:vexaSoftIn .45s .04s var(--vexa-ease) both!important;
    }
    .live-copy{
      max-width:350px!important;
      margin:8px 0 0!important;
      color:var(--vexa-muted)!important;
      font-size:12px!important;
      line-height:1.45!important;
      font-weight:450!important;
      letter-spacing:-.01em!important;
      animation:vexaSoftIn .45s .08s var(--vexa-ease) both!important;
    }

    .video-picker-state{
      padding:8px!important;
      border-radius:22px!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 16px 38px rgba(0,0,0,.2)!important;
      backdrop-filter:blur(10px)!important;
      -webkit-backdrop-filter:blur(10px)!important;
      animation:vexaSoftIn .48s .1s var(--vexa-ease) both!important;
    }
    .setup-label{display:none!important}

    .caption-mode-switch{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
      gap:4px!important;
      margin:0 0 7px!important;
      padding:3px!important;
      border-radius:15px!important;
      background:rgba(0,0,0,.28)!important;
      border:1px solid rgba(255,255,255,.05)!important;
      box-shadow:none!important;
    }
    .caption-mode-switch button{
      min-height:36px!important;
      border-radius:11px!important;
      display:grid!important;
      place-items:center!important;
      padding:0 10px!important;
      color:rgba(255,255,255,.42)!important;
      background:transparent!important;
      box-shadow:none!important;
      transition:transform .18s var(--vexa-ease),background .2s ease,color .2s ease!important;
    }
    .caption-mode-switch button.active{
      color:#fff!important;
      background:var(--vexa-card-strong)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06)!important;
    }
    .caption-mode-switch button:active{transform:scale(.97)!important}
    .caption-mode-switch strong{font-size:11px!important;font-weight:680!important;letter-spacing:-.015em!important}
    .caption-mode-switch small{display:none!important}

    .language-setup{
      position:relative!important;
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr)!important;
      gap:5px!important;
      margin:0 0 7px!important;
      padding:0!important;
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
    }
    .language-field{
      min-width:0!important;
      min-height:58px!important;
      padding:9px 10px!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
      gap:5px!important;
      border-radius:14px!important;
      background:rgba(0,0,0,.24)!important;
      border:1px solid rgba(255,255,255,.065)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;
      transition:background .2s ease,border-color .2s ease,transform .18s var(--vexa-ease)!important;
    }
    .language-field:focus-within{
      background:rgba(255,255,255,.035)!important;
      border-color:rgba(255,255,255,.14)!important;
      transform:translateY(-1px)!important;
    }
    .language-field>span:first-child{
      color:var(--vexa-dim)!important;
      font-size:7px!important;
      font-weight:650!important;
      letter-spacing:.06em!important;
    }
    .language-route-arrow{display:grid!important;place-items:center!important;color:rgba(255,255,255,.22)!important}
    .language-route-arrow svg{width:13px!important;height:13px!important}
    .language-select-wrap select{
      width:100%!important;
      height:25px!important;
      padding:0 18px 0 0!important;
      color:#fff!important;
      background:transparent!important;
      border:0!important;
      outline:0!important;
      appearance:none!important;
      -webkit-appearance:none!important;
      font-size:11px!important;
      font-weight:620!important;
      letter-spacing:-.015em!important;
    }
    .language-select-wrap svg{width:13px!important;height:13px!important;color:rgba(255,255,255,.38)!important}

    .video-picker{
      width:100%!important;
      min-height:44px!important;
      padding:0 10px!important;
      display:grid!important;
      grid-template-columns:30px 1fr 24px!important;
      align-items:center!important;
      gap:7px!important;
      border-radius:13px!important;
      color:#050505!important;
      background:#fff!important;
      border:1px solid rgba(255,255,255,.16)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 24px rgba(0,0,0,.28)!important;
      text-align:left!important;
      overflow:hidden!important;
      transition:transform .18s var(--vexa-ease),opacity .2s ease!important;
    }
    .video-picker::after{display:none!important}
    .video-picker:not(:disabled):active{transform:scale(.985)!important}
    .video-picker:disabled{opacity:.36!important;filter:none!important;box-shadow:none!important}
    .video-picker-icon{
      width:30px!important;
      height:30px!important;
      display:grid!important;
      place-items:center!important;
      border-radius:10px!important;
      color:#111!important;
      background:rgba(0,0,0,.055)!important;
      box-shadow:none!important;
    }
    .video-picker-icon svg{width:17px!important;height:17px!important}
    .video-picker-copy{display:block!important;min-width:0!important}
    .video-picker-copy strong{font-size:12px!important;font-weight:720!important;letter-spacing:-.02em!important}
    .video-picker-copy small{display:none!important}
    .video-picker-arrow{width:24px!important;height:24px!important;display:grid!important;place-items:center!important;color:#111!important;background:transparent!important}
    .video-picker-arrow svg{width:14px!important;height:14px!important}

    .live-source-switch,.youtube-input-state,.youtube-ready-state{display:none!important}
    .live-footer{display:none!important}

    .video-ready-state{display:none}
    .video-ready-state.show{display:block}

    .live-toast{
      bottom:calc(14px + env(safe-area-inset-bottom))!important;
      max-width:calc(100vw - 32px)!important;
      padding:9px 12px!important;
      border-radius:13px!important;
      color:#fff!important;
      background:rgba(13,13,13,.9)!important;
      border:1px solid var(--vexa-line)!important;
      box-shadow:0 14px 36px rgba(0,0,0,.4)!important;
      backdrop-filter:blur(12px)!important;
      -webkit-backdrop-filter:blur(12px)!important;
      font-size:10px!important;
      font-weight:600!important;
    }

    body.vexa-live-editing .vexa-editor-top{
      height:calc(58px + env(safe-area-inset-top))!important;
      padding:env(safe-area-inset-top) 14px 0!important;
      background:transparent!important;
      animation:vexaSoftIn .35s var(--vexa-ease) both!important;
    }
    body.vexa-live-editing .vexa-editor-back{
      width:36px!important;
      height:36px!important;
      border-radius:50%!important;
      color:#fff!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 24px rgba(0,0,0,.28)!important;
      backdrop-filter:blur(10px)!important;
      -webkit-backdrop-filter:blur(10px)!important;
      font-size:21px!important;
      transition:transform .18s var(--vexa-ease)!important;
    }
    body.vexa-live-editing .vexa-editor-back:active{transform:scale(.9)!important}
    body.vexa-live-editing .vexa-editor-title b{font-size:12px!important;font-weight:680!important;letter-spacing:-.025em!important}
    body.vexa-live-editing .vexa-editor-title small{margin-top:1px!important;color:var(--vexa-muted)!important;font-size:8px!important;font-weight:520!important}
    body.vexa-live-editing .vexa-editor-done{
      height:34px!important;
      padding:0 12px!important;
      border-radius:11px!important;
      color:#050505!important;
      background:#fff!important;
      border:1px solid rgba(255,255,255,.16)!important;
      box-shadow:0 8px 22px rgba(0,0,0,.25)!important;
      font-size:10px!important;
      font-weight:720!important;
      transition:transform .18s var(--vexa-ease)!important;
    }
    body.vexa-live-editing .vexa-editor-done:active{transform:scale(.95)!important}

    body.vexa-live-editing .vexa-editor-caption{
      max-width:84%!important;
      padding:7px 10px!important;
      border-radius:9px!important;
      font-size:clamp(17px,4.8vw,28px)!important;
      font-weight:760!important;
      line-height:1.08!important;
      letter-spacing:-.035em!important;
      text-shadow:0 2px 3px #000,0 0 12px #000!important;
    }
    body.vexa-live-editing .vexa-editor-caption.show{animation:vexaCaptionIn .2s var(--vexa-ease) both!important}
    body.vexa-live-editing .vexa-caption-grab{
      right:-6px!important;
      top:-6px!important;
      width:15px!important;
      height:15px!important;
      background:#fff!important;
      box-shadow:0 4px 12px rgba(0,0,0,.42)!important;
      opacity:.8!important;
    }

    body.vexa-live-editing .vexa-panel-grip{display:none!important}
    body.vexa-live-editing .vexa-editor-controls{height:37px!important;gap:8px!important}
    body.vexa-live-editing .vexa-editor-play{
      width:34px!important;
      height:34px!important;
      border-radius:12px!important;
      color:#050505!important;
      background:#fff!important;
      border:1px solid rgba(255,255,255,.14)!important;
      box-shadow:0 7px 20px rgba(0,0,0,.24)!important;
      font-size:13px!important;
      transition:transform .18s var(--vexa-ease)!important;
    }
    body.vexa-live-editing .vexa-editor-play:active{transform:scale(.9)!important}
    body.vexa-live-editing .vexa-editor-time{min-width:74px!important;color:rgba(255,255,255,.75)!important;font-size:9px!important;font-weight:620!important}
    body.vexa-live-editing .vexa-editor-hint{display:none!important}
    body.vexa-live-editing .vexa-fit-button{
      margin-left:auto!important;
      height:30px!important;
      padding:0 10px!important;
      border-radius:10px!important;
      color:rgba(255,255,255,.68)!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line-soft)!important;
      font-size:9px!important;
      font-weight:620!important;
    }

    body.vexa-live-editing .vexa-caption-timeline{
      margin-top:6px!important;
      border-radius:14px!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line-soft)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;
      mask-image:none!important;
      -webkit-mask-image:none!important;
    }
    body.vexa-live-editing .vexa-wave{opacity:.18!important;gap:2px!important}
    body.vexa-live-editing .vexa-wave i{background:#fff!important;min-width:2px!important;max-width:2px!important}
    body.vexa-live-editing .vexa-cue{
      height:36px!important;
      padding:0 8px!important;
      border-radius:9px!important;
      color:rgba(255,255,255,.58)!important;
      background:rgba(255,255,255,.055)!important;
      border:1px solid rgba(255,255,255,.055)!important;
      box-shadow:none!important;
      transition:background .16s ease,color .16s ease,transform .16s var(--vexa-ease)!important;
    }
    body.vexa-live-editing .vexa-cue.active{color:#050505!important;background:#fff!important;border-color:#fff!important;box-shadow:0 5px 16px rgba(0,0,0,.24)!important;transform:translateY(-1px)!important}
    body.vexa-live-editing .vexa-cue span{font-size:8px!important;font-weight:650!important}
    body.vexa-live-editing .vexa-playhead{width:1px!important;background:#fff!important;box-shadow:none!important}

    body.vexa-live-editing .vexa-caption-editor{column-gap:7px!important;margin-top:7px!important}
    body.vexa-live-editing .vexa-caption-meta{height:16px!important;padding:0 2px!important;color:var(--vexa-dim)!important;font-size:7px!important;font-weight:620!important}
    body.vexa-live-editing .vexa-caption-meta b{color:var(--vexa-muted)!important;font-weight:560!important}
    body.vexa-live-editing .vexa-caption-input{
      border-radius:13px!important;
      padding:9px 10px!important;
      color:#fff!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line-soft)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;
      font-size:11px!important;
      font-weight:560!important;
      transition:background .18s ease,border-color .18s ease!important;
    }
    body.vexa-live-editing .vexa-caption-input:focus{background:var(--vexa-card-strong)!important;border-color:var(--vexa-line)!important}
    body.vexa-live-editing .vexa-reset-position{
      width:66px!important;
      border-radius:13px!important;
      color:rgba(255,255,255,.58)!important;
      background:var(--vexa-card)!important;
      border:1px solid var(--vexa-line-soft)!important;
      font-size:7px!important;
      font-weight:620!important;
    }

    @keyframes vexaSoftIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes vexaReadyPulse{0%,100%{opacity:.42}50%{opacity:1}}
    @keyframes vexaCaptionIn{from{opacity:0;transform:translate(-50%,-50%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}

    @media(max-height:760px){
      .live-hero{padding-top:24px!important;padding-bottom:14px!important}
      .live-hero h1{font-size:23px!important}
      .live-copy{font-size:11px!important}
      .language-field{min-height:54px!important}
    }
    @media(max-width:380px){
      .live-app{padding-left:13px!important;padding-right:13px!important}
      .live-hero h1{font-size:24px!important}
      .language-field{padding-left:8px!important;padding-right:8px!important}
      .language-select-wrap select{font-size:10.5px!important}
    }
    @media(prefers-reduced-motion:reduce){
      .live-header,.live-hero h1,.live-copy,.video-picker-state,.live-status-pill i,body.vexa-live-editing .vexa-editor-top,body.vexa-live-editing .vexa-editor-caption.show{animation:none!important}
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
        <span>VIDEO EDITOR</span>
        <strong>Vexa Live</strong>
      </div>

      <span class="live-status-pill" aria-label="Vexa Live ready"><i></i>Ready</span>
    </header>

    <section class="live-hero" aria-labelledby="liveTitle">
      <div class="editor-demo" aria-hidden="true">
        <div class="demo-topbar"><span>VEXA LIVE</span><i></i></div>
        <div class="demo-caption"><strong>Every word, exactly where you want it.</strong><small>Drag · edit · time</small></div>
        <span class="demo-play">▶</span>
        <span class="demo-time">0:08 / 0:24</span>
        <div class="demo-timeline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>

      <p class="live-kicker">CAPTIONS · TIMING · POSITION</p>
      <h1 id="liveTitle">Add captions to video</h1>
      <p class="live-copy">Choose the languages, add your video, then edit captions directly on it.</p>
    </section>

    <section id="videoPickerState" class="video-picker-state">
      <div class="setup-label"><span>CAPTION MODE</span><span>Choose how captions are prepared</span></div>

      <div class="caption-mode-switch" aria-label="Caption mode">
        <button class="active" type="button" data-caption-mode="standard" aria-pressed="true">
          <strong>Standard</strong>
          <small>Generate first · most accurate</small>
        </button>
        <button type="button" data-caption-mode="live" aria-pressed="false">
          <strong>Live</strong>
          <small>Caption while playing</small>
        </button>
      </div>

      <div id="liveSourceSwitch" class="live-source-switch" aria-label="Live video source">
        <button class="active" type="button" data-live-source="file" aria-pressed="true">Video file</button>
        <button type="button" data-live-source="youtube" aria-pressed="false">YouTube</button>
      </div>

      <div class="setup-label"><span>LANGUAGE ROUTE</span><span>Video → Captions</span></div>

      <div class="language-setup" aria-label="Caption languages">
        <label class="language-field" for="sourceLanguage">
          <span>VIDEO</span>
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

        <span class="language-route-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 12h12m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>

        <label class="language-field" for="subtitleLanguage">
          <span>CAPTIONS</span>
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
          <strong>Choose video</strong>
          <small id="languageRoute">SELECT BOTH LANGUAGES FIRST</small>
        </span>
        <span class="video-picker-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
      </button>
      <input id="videoFile" type="file" accept="video/*" hidden />

      <div id="youtubeInputState" class="youtube-input-state">
        <div class="youtube-link-card">
          <span class="youtube-link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M8.2 6.7h7.6c2.6 0 3.5.9 3.5 3.4v3.8c0 2.5-.9 3.4-3.5 3.4H8.2c-2.6 0-3.5-.9-3.5-3.4v-3.8c0-2.5.9-3.4 3.5-3.4Z" stroke="currentColor" stroke-width="1.5" /><path d="m10.6 9.7 4 2.3-4 2.3V9.7Z" fill="currentColor" /></svg>
          </span>
          <input id="youtubeUrl" type="url" inputmode="url" autocomplete="off" placeholder="Paste YouTube link" aria-label="YouTube link" />
          <button id="openYoutubeButton" type="button" data-action="open-youtube" disabled>Open</button>
        </div>
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
        <video id="videoPreview" playsinline webkit-playsinline preload="metadata"></video>
        <div id="captionPreview" class="caption-preview" aria-live="polite"><span id="liveCaptionText"></span></div>
      </div>

      <div class="video-meta-row">
        <span id="videoMeta">Local preview</span>
        <span id="captionStatus" class="ready-chip"><i></i><b>Preparing captions</b></span>
      </div>
    </section>

    <section id="youtubeReadyState" class="youtube-ready-state" aria-hidden="true">
      <div class="video-ready-head">
        <div><span>YOUTUBE · LIVE</span><strong id="youtubeVideoName">YouTube</strong></div>
        <button type="button" data-action="change-youtube">Change</button>
      </div>
      <div class="video-stage youtube-stage">
        <iframe id="youtubePlayer" title="YouTube video player" src="about:blank" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
      </div>
      <div class="video-meta-row"><span>Official YouTube player</span><span class="ready-chip"><i></i><b>Captions if available</b></span></div>
    </section>

    <footer class="live-footer">
      <span class="footer-line"></span>
      <small id="engineLabel">Scribe v2 · Local video preview</small>
      <span class="footer-line"></span>
    </footer>
  </main>

  <div id="liveToast" class="live-toast" role="status" aria-live="polite"></div>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/live/app.js?v=20260815-7"></script>
</body>
</html>`;