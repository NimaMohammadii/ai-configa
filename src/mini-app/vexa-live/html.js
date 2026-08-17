export const VEXA_LIVE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="#000000" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Vexa Live</title>
  <link rel="stylesheet" href="/mini-app/live/styles.css?v=20260815-8" />
  <style id="vexaLiveAppTheme">
    :root{
      --glass:rgba(13,13,13,.54);
      --glass-strong:rgba(13,13,13,.64);
      --glass-soft:rgba(255,255,255,.055);
      --line:rgba(255,255,255,.13);
      --line-strong:rgba(255,255,255,.16);
      --muted:rgba(255,255,255,.58);
      --dim:rgba(255,255,255,.3);
      --ease:cubic-bezier(.16,.86,.22,1);
      --font:"SF Pro Display","SF Pro Text","Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      color-scheme:dark;
      font-family:var(--font);
    }
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;width:100%;min-height:100%;background:#000!important;color:#fff;overscroll-behavior:none;font-family:var(--font);-webkit-font-smoothing:antialiased}
    body{min-height:var(--tg-viewport-height,100dvh);overflow-x:hidden}
    button,a,select,input{font:inherit}
    button{border:0}

    .live-app{position:relative;width:min(100%,560px);min-height:var(--tg-viewport-height,100dvh);margin:0 auto;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));background:#000!important;overflow:visible}
    .live-app::before,.live-app::after{display:none!important}

    .live-header{height:38px;display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px;animation:softIn .38s var(--ease) both}
    .live-back{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;text-decoration:none;background:var(--glass-soft);border:1px solid var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.34);transition:transform .18s var(--ease),background .2s ease}
    .live-back:active{transform:scale(.9);background:rgba(255,255,255,.08)}
    .live-back svg{width:18px;height:18px}
    .live-brand{display:flex;align-items:center;justify-content:center;min-width:0}
    .live-brand span{display:none}
    .live-brand strong{font-size:16px;font-weight:690;letter-spacing:-.035em}
    .live-status-pill{height:30px;padding:0 10px;display:flex;align-items:center;gap:6px;border-radius:999px;color:var(--muted);background:var(--glass-soft);border:1px solid var(--line);font-size:9px;font-weight:650}
    .live-status-pill i{width:5px;height:5px;border-radius:50%;background:#fff;animation:readyPulse 2.4s ease-in-out infinite}

    .live-hero{display:flex;flex-direction:column;align-items:flex-start;padding:30px 2px 16px;text-align:left}
    .editor-demo,.live-kicker{display:none!important}
    .live-hero h1{max-width:350px;margin:0;font-size:25px;line-height:1.05;font-weight:720;letter-spacing:-.05em;animation:softIn .42s .04s var(--ease) both}
    .live-copy{max-width:355px;margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.48;font-weight:450;letter-spacing:-.01em;animation:softIn .42s .08s var(--ease) both}

    .video-picker-state{padding:7px;border-radius:22px;background:var(--glass);border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 22px rgba(255,255,255,.055),0 16px 36px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);animation:softIn .46s .1s var(--ease) both}
    .setup-label{display:none!important}

    .caption-mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:0 0 7px;padding:3px;border-radius:15px;background:rgba(0,0,0,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(255,255,255,.04)}
    .caption-mode-switch button{min-height:36px;border-radius:11px;display:grid;place-items:center;padding:0 10px;color:rgba(255,255,255,.42);background:transparent;transition:transform .18s var(--ease),background .2s ease,color .2s ease}
    .caption-mode-switch button.active{color:#fff;background:rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.075)}
    .caption-mode-switch button:active{transform:scale(.97)}
    .caption-mode-switch strong{font-size:11px;font-weight:680;letter-spacing:-.015em}
    .caption-mode-switch small{display:none}

    .live-source-switch,.youtube-input-state,.youtube-ready-state{display:none!important}

    .language-setup{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:5px;margin:0 0 7px;padding:0;background:transparent}
    .language-field{min-width:0;min-height:58px;padding:9px 10px;display:flex;flex-direction:column;justify-content:center;gap:5px;border-radius:15px;background:rgba(0,0,0,.22);border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(255,255,255,.04);transition:background .2s ease,transform .18s var(--ease)}
    .language-field:focus-within{background:rgba(255,255,255,.055);transform:translateY(-1px)}
    .language-field>span:first-child{color:var(--dim);font-size:7px;font-weight:650;letter-spacing:.06em}
    .language-route-arrow{display:grid;place-items:center;color:rgba(255,255,255,.22)}
    .language-route-arrow svg{width:13px;height:13px}
    .language-select-wrap{position:relative;display:block;min-width:0}
    .language-select-wrap select{width:100%;height:25px;padding:0 18px 0 0;color:#fff;background:transparent;border:0;outline:0;appearance:none;-webkit-appearance:none;font-size:11px;font-weight:620;letter-spacing:-.015em}
    .language-select-wrap select option{color:#000;background:#fff}
    .language-select-wrap svg{position:absolute;right:0;top:50%;width:13px;height:13px;color:rgba(255,255,255,.38);transform:translateY(-50%);pointer-events:none}

    .video-picker{width:100%;height:42px;min-height:42px;padding:0 10px;display:grid;grid-template-columns:30px 1fr 24px;align-items:center;gap:7px;border-radius:13px;color:#050505;background:#fff;border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.34);text-align:left;overflow:hidden;transition:transform .18s var(--ease),opacity .2s ease}
    .video-picker::after{display:none!important}
    .video-picker:not(:disabled):active{transform:scale(.985)}
    .video-picker:disabled{opacity:.34;box-shadow:none}
    .video-picker-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;color:#111;background:rgba(0,0,0,.055)}
    .video-picker-icon svg{width:17px;height:17px}
    .video-picker-copy{display:block;min-width:0}
    .video-picker-copy strong{font-size:12px;font-weight:720;letter-spacing:-.02em}
    .video-picker-copy small{display:none}
    .video-picker-arrow{width:24px;height:24px;display:grid;place-items:center;color:#111;background:transparent}
    .video-picker-arrow svg{width:14px;height:14px}

    .video-ready-state{display:none}
    .video-ready-state.show{display:block}
    .video-ready-head,.video-meta-row{display:none}
    .video-stage{position:relative;overflow:hidden;background:#050505}
    .video-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#050505}
    .caption-preview{position:absolute;left:50%;top:72%;transform:translate(-50%,-50%);max-width:88%;pointer-events:none}

    .live-footer{display:none!important}
    .live-toast{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));z-index:220;max-width:calc(100vw - 32px);padding:9px 12px;border-radius:13px;color:#fff;background:rgba(13,13,13,.74);border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),0 14px 36px rgba(0,0,0,.4);backdrop-filter:blur(14px) saturate(1.12);-webkit-backdrop-filter:blur(14px) saturate(1.12);font-size:10px;font-weight:600;opacity:0;transform:translate(-50%,8px);pointer-events:none;transition:opacity .18s ease,transform .22s var(--ease)}
    .live-toast.show{opacity:1;transform:translate(-50%,0)}

    @keyframes softIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes readyPulse{0%,100%{opacity:.45}50%{opacity:1}}
    @media(max-height:700px){.live-hero{padding-top:22px;padding-bottom:13px}.live-hero h1{font-size:23px}.live-copy{font-size:11px}}
    @media(max-width:380px){.live-app{padding-left:13px;padding-right:13px}.language-field{padding-left:8px;padding-right:8px}.language-select-wrap select{font-size:10.5px}}
    @media(prefers-reduced-motion:reduce){.live-header,.live-hero h1,.live-copy,.video-picker-state,.live-status-pill i{animation:none!important}}

    body.vexa-stt-embedded .vexa-stt-top{display:none!important}
    body.vexa-stt-embedded .vexa-stt{padding:0 16px calc(82px + env(safe-area-inset-bottom))!important}
    body.vexa-stt-embedded .vexa-stt-editor{margin-top:-4px!important}
    body.vexa-stt-embedded .vexa-stt-controls{grid-template-columns:minmax(0,1fr) 42px!important;gap:8px!important;bottom:calc(16px + env(safe-area-inset-bottom))!important}
    body.vexa-stt-embedded .vexa-stt-record,body.vexa-stt-embedded .vexa-stt-upload{height:42px!important;min-height:42px!important;border-radius:13px!important}
    body.vexa-stt-embedded .vexa-stt-record{background:linear-gradient(180deg,#fff 0%,#f4f4f4 48%,#d9d9d9 100%)!important;border:1px solid rgba(255,255,255,.16)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.34),0 0 24px rgba(255,255,255,.07)!important}
    body.vexa-stt-embedded .vexa-stt-record::before{left:9%!important;right:9%!important;opacity:.92!important}
    body.vexa-stt-embedded .vexa-stt-upload{position:relative!important;padding:0!important;border:0!important;background:rgba(13,13,13,.62)!important;color:rgba(255,255,255,.82)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)!important;backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important;transition:transform .3s cubic-bezier(.16,1,.3,1),background .24s ease,box-shadow .24s ease!important}
    body.vexa-stt-embedded .vexa-stt-upload svg{display:none!important}
    body.vexa-stt-embedded .vexa-stt-upload::before,body.vexa-stt-embedded .vexa-stt-upload::after{content:"";position:absolute;left:50%;top:50%;width:18px;height:2.5px;border-radius:999px;background:currentColor;transform:translate(-50%,-50%);transition:transform .34s cubic-bezier(.16,1,.3,1),opacity .2s ease}
    body.vexa-stt-embedded .vexa-stt-upload::after{transform:translate(-50%,-50%) rotate(90deg)}
    body.vexa-stt-embedded .vexa-stt-upload:active{transform:scale(.88) rotate(-2deg)!important;background:rgba(24,24,24,.82)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.07),inset 0 0 18px rgba(255,255,255,.065),0 5px 13px rgba(0,0,0,.25)!important}
    body.vexa-stt-embedded .vexa-stt-upload:active::before{transform:translate(-50%,-50%) rotate(90deg) scale(.78)}
    body.vexa-stt-embedded .vexa-stt-upload:active::after{transform:translate(-50%,-50%) rotate(180deg) scale(.78)}
    body.vexa-stt-embedded .vexa-stt-status{bottom:calc(65px + env(safe-area-inset-bottom))!important}
    body.vexa-stt-embedded .vexa-stt-wave-stage{bottom:100px!important}

    body.vexa-stt-embedded .vexa-stt-spinner{display:none!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-record-inner{opacity:0!important;transform:scale(.98)!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-record::after{content:"Transcribing";position:absolute;z-index:2;inset:0;display:grid;place-items:center;color:#050505;font-size:12.5px;font-weight:760;letter-spacing:-.015em;animation:vexaSttButtonState .3s cubic-bezier(.16,1,.3,1) both}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-status{opacity:0!important;transform:translate(-50%,5px)!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-stage{height:72px!important;bottom:86px!important;transform:translate(-50%,0) scale(1)!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-track{position:relative!important;height:34px!important;filter:none!important;overflow:visible!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-track i{animation:none!important;opacity:0!important;transform:scaleY(.02)!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-track::before{content:"";position:absolute;left:7%;right:7%;top:50%;height:1px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14) 12%,rgba(255,255,255,.27) 50%,rgba(255,255,255,.14) 88%,transparent);transform:translateY(-50%)}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-track::after{content:"";position:absolute;left:7%;top:50%;width:48px;height:16px;background:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 56 18%22%3E%3Cpath d=%22M1 9h10c3 0 3-5 6-5s3 10 6 10 3-8 6-8 3 6 6 6 3-3 6-3h14%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E") center/contain no-repeat;filter:drop-shadow(0 0 7px rgba(255,255,255,.12));opacity:0;transform:translateY(-50%) scale(.88);animation:vexaSttQuietWave 2.05s cubic-bezier(.4,0,.2,1) infinite}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-caption{bottom:0!important;color:rgba(255,255,255,.38)!important}
    body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-caption strong{display:none!important}
    @keyframes vexaSttQuietWave{0%{left:7%;opacity:0;transform:translateY(-50%) scale(.84)}14%{opacity:.55}48%{opacity:.92;transform:translateY(-50%) scale(1)}86%{opacity:.52}100%{left:calc(93% - 48px);opacity:0;transform:translateY(-50%) scale(.84)}}
    @keyframes vexaSttButtonState{from{opacity:0;transform:translateY(3px) scale(.98)}to{opacity:1;transform:none}}
    @media(prefers-reduced-motion:reduce){body.vexa-stt-embedded .vexa-stt.processing .vexa-stt-wave-track::after{animation:none!important;left:50%!important;opacity:.72!important;transform:translate(-50%,-50%)!important}}
  </style>
</head>
<body>
  <main class="live-app">
    <header class="live-header">
      <a class="live-back" href="/mini-app" data-action="back" aria-label="Back to Vexa">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.5 5.5 9 12l6.5 6.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </a>
      <div class="live-brand"><span>VIDEO EDITOR</span><strong>Vexa Live</strong></div>
      <span class="live-status-pill" aria-label="Vexa Live ready"><i></i>Ready</span>
    </header>

    <section class="live-hero" aria-labelledby="liveTitle">
      <h1 id="liveTitle">Add captions to video</h1>
      <p class="live-copy">Choose the languages, add your video, then edit captions directly on it.</p>
    </section>

    <section id="videoPickerState" class="video-picker-state">
      <div class="caption-mode-switch" aria-label="Caption mode">
        <button class="active" type="button" data-caption-mode="standard" aria-pressed="true"><strong>Standard</strong><small>Generate first · most accurate</small></button>
        <button type="button" data-caption-mode="live" aria-pressed="false"><strong>Live</strong><small>Caption while playing</small></button>
      </div>

      <div id="liveSourceSwitch" class="live-source-switch" aria-label="Live video source">
        <button class="active" type="button" data-live-source="file" aria-pressed="true">Video file</button>
        <button type="button" data-live-source="youtube" aria-pressed="false">YouTube</button>
      </div>

      <div class="language-setup" aria-label="Caption languages">
        <label class="language-field" for="sourceLanguage">
          <span>VIDEO</span>
          <span class="language-select-wrap">
            <select id="sourceLanguage" aria-label="Video language">
              <option value="">Choose language</option><option value="en">English</option><option value="fa">Persian</option><option value="ru">Russian</option><option value="de">German</option><option value="tr">Turkish</option><option value="ar">Arabic</option><option value="es">Spanish</option><option value="hi">Hindi</option><option value="zh">Chinese</option><option value="ja">Japanese</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </label>
        <span class="language-route-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 12h12m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        <label class="language-field" for="subtitleLanguage">
          <span>CAPTIONS</span>
          <span class="language-select-wrap">
            <select id="subtitleLanguage" aria-label="Subtitle language">
              <option value="">Choose language</option><option value="en">English</option><option value="fa">Persian</option><option value="ru">Russian</option><option value="de">German</option><option value="tr">Turkish</option><option value="ar">Arabic</option><option value="es">Spanish</option><option value="hi">Hindi</option><option value="zh">Chinese</option><option value="ja">Japanese</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </label>
      </div>

      <button id="chooseVideoButton" class="video-picker" type="button" data-action="pick-video" disabled>
        <span class="video-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.75" y="5" width="16.5" height="14" rx="4" stroke="currentColor" stroke-width="1.55" /><path d="M12 14.8V9.2m0 0L9.7 11.5M12 9.2l2.3 2.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        <span class="video-picker-copy"><strong>Choose video</strong><small id="languageRoute">SELECT BOTH LANGUAGES FIRST</small></span>
        <span class="video-picker-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
      </button>
      <input id="videoFile" type="file" accept="video/*" hidden />

      <div id="youtubeInputState" class="youtube-input-state"><div class="youtube-link-card"><input id="youtubeUrl" type="url" inputmode="url" autocomplete="off" placeholder="Paste YouTube link" aria-label="YouTube link" /><button id="openYoutubeButton" type="button" data-action="open-youtube" disabled>Open</button></div></div>
    </section>

    <section id="videoReadyState" class="video-ready-state" aria-hidden="true">
      <div class="video-ready-head"><div><span id="captionModeLabel">CAPTIONS</span><strong id="videoName">Video</strong></div><button type="button" data-action="change-video">Change</button></div>
      <div class="video-stage">
        <video id="videoPreview" playsinline webkit-playsinline preload="metadata" disablepictureinpicture disableremoteplayback x-webkit-airplay="deny"></video>
        <div id="captionPreview" class="caption-preview" aria-live="polite"><span id="liveCaptionText"></span></div>
      </div>
      <div class="video-meta-row"><span id="videoMeta">Local preview</span><span id="captionStatus" class="ready-chip"><i></i><b>Preparing captions</b></span></div>
    </section>

    <section id="youtubeReadyState" class="youtube-ready-state" aria-hidden="true">
      <div class="video-ready-head"><div><span>YOUTUBE · LIVE</span><strong id="youtubeVideoName">YouTube</strong></div><button type="button" data-action="change-youtube">Change</button></div>
      <div class="video-stage youtube-stage"><iframe id="youtubePlayer" title="YouTube video player" src="about:blank"></iframe></div>
      <div class="video-meta-row"><span>Official YouTube player</span><span class="ready-chip"><i></i><b>Captions if available</b></span></div>
    </section>

    <footer class="live-footer"><small id="engineLabel">Scribe v2 · Local video preview</small></footer>
  </main>

  <div id="liveToast" class="live-toast" role="status" aria-live="polite"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/live/app.js?v=20260815-9"></script>
</body>
</html>`;