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
    :root {
      --vexa-white:#fff;
      --vexa-bg:#000;
      --vexa-surface:rgba(255,255,255,.048);
      --vexa-surface-2:rgba(255,255,255,.072);
      --vexa-line:rgba(255,255,255,.085);
      --vexa-line-soft:rgba(255,255,255,.05);
      --vexa-muted:rgba(255,255,255,.43);
      --vexa-dim:rgba(255,255,255,.25);
      --vexa-ease:cubic-bezier(.16,1,.3,1);
    }

    html,body{background:#000;color:#fff}
    body{min-height:var(--tg-viewport-height,100dvh)}

    .live-app{
      width:min(100%,540px);
      min-height:var(--tg-viewport-height,100dvh);
      margin:0 auto;
      padding:calc(16px + env(safe-area-inset-top)) 16px calc(22px + env(safe-area-inset-bottom));
      overflow:visible;
    }

    .live-app::before{
      top:-110px;
      width:480px;
      height:380px;
      background:radial-gradient(circle,rgba(255,255,255,.055),transparent 66%);
      filter:blur(22px);
      opacity:.9;
    }

    .live-app::after{
      opacity:.045;
      background-size:56px 56px;
      mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.52) 44%,transparent 82%);
      -webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.52) 44%,transparent 82%);
    }

    .live-header{
      height:44px;
      display:grid;
      grid-template-columns:42px 1fr auto;
      align-items:center;
      gap:11px;
      animation:vexaHeaderIn .58s var(--vexa-ease) both;
    }

    .live-back{
      width:40px;
      height:40px;
      display:grid;
      place-items:center;
      border-radius:14px;
      color:#fff;
      text-decoration:none;
      background:rgba(255,255,255,.048);
      box-shadow:inset 0 0 0 1px var(--vexa-line-soft),0 8px 28px rgba(0,0,0,.3);
      backdrop-filter:blur(16px);
      -webkit-backdrop-filter:blur(16px);
      transition:transform .22s var(--vexa-ease),background .2s ease;
    }

    .live-back:active{transform:scale(.9);background:rgba(255,255,255,.09)}
    .live-back svg{width:20px;height:20px}

    .live-brand{align-items:flex-start;gap:0;transform:translateY(1px)}
    .live-brand span{font-size:7px;font-weight:760;letter-spacing:.16em;color:rgba(255,255,255,.3)}
    .live-brand strong{margin-top:1px;font-size:16px;font-weight:750;letter-spacing:-.04em}

    .live-status-pill{
      height:30px;
      padding:0 10px 0 8px;
      display:flex;
      align-items:center;
      gap:7px;
      border-radius:999px;
      color:rgba(255,255,255,.55);
      background:rgba(255,255,255,.042);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.055);
      font-size:8px;
      font-weight:720;
      letter-spacing:.04em;
    }

    .live-status-pill i{
      width:6px;
      height:6px;
      border-radius:50%;
      background:#fff;
      box-shadow:0 0 0 4px rgba(255,255,255,.055);
      animation:vexaStatusPulse 2.1s ease-in-out infinite;
    }

    .live-hero{
      display:flex;
      flex-direction:column;
      align-items:stretch;
      padding:27px 0 18px;
      text-align:left;
    }

    .editor-demo{
      position:relative;
      width:148px;
      aspect-ratio:1/2;
      margin:0 auto 27px;
      overflow:hidden;
      border-radius:29px;
      background:
        radial-gradient(circle at 52% 22%,rgba(255,255,255,.14),transparent 18%),
        linear-gradient(150deg,#242424 0%,#111 38%,#050505 100%);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.13),
        inset 0 1px 0 rgba(255,255,255,.1),
        0 30px 86px rgba(0,0,0,.62);
      animation:vexaPreviewIn .76s .05s var(--vexa-ease) both;
    }

    .editor-demo::before{
      content:"";
      position:absolute;
      top:18%;
      left:50%;
      width:72px;
      height:105px;
      transform:translateX(-50%);
      border-radius:48% 52% 42% 42%;
      background:
        radial-gradient(circle at 50% 24%,rgba(255,255,255,.24),rgba(255,255,255,.045) 42%,transparent 43%),
        linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.015));
      opacity:.72;
    }

    .editor-demo::after{
      content:"";
      position:absolute;
      left:18px;
      right:18px;
      top:9px;
      height:1px;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);
    }

    .demo-topbar{
      position:absolute;
      z-index:3;
      top:14px;
      left:13px;
      right:13px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      color:rgba(255,255,255,.58);
      font-size:6px;
      font-weight:720;
      letter-spacing:.02em;
    }

    .demo-topbar i{width:22px;height:7px;border-radius:999px;background:rgba(255,255,255,.14)}

    .demo-caption{
      position:absolute;
      z-index:4;
      left:9px;
      right:9px;
      top:51%;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:4px;
      text-align:center;
      animation:vexaCaptionFloat 3.4s ease-in-out infinite;
    }

    .demo-caption strong{
      padding:4px 7px 5px;
      border-radius:6px;
      color:#fff;
      background:rgba(0,0,0,.72);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 5px 16px rgba(0,0,0,.24);
      font-size:8px;
      line-height:1.05;
      font-weight:820;
      letter-spacing:-.025em;
    }

    .demo-caption small{font-size:5.5px;font-weight:650;color:rgba(255,255,255,.36)}

    .demo-play{
      position:absolute;
      z-index:4;
      left:12px;
      bottom:59px;
      width:21px;
      height:21px;
      display:grid;
      place-items:center;
      border-radius:7px;
      color:#000;
      background:#fff;
      font-size:7px;
      box-shadow:0 6px 16px rgba(0,0,0,.32);
    }

    .demo-time{
      position:absolute;
      z-index:4;
      left:39px;
      bottom:66px;
      color:rgba(255,255,255,.43);
      font-size:5.5px;
      font-weight:680;
      font-variant-numeric:tabular-nums;
    }

    .demo-timeline{
      position:absolute;
      z-index:3;
      left:10px;
      right:10px;
      bottom:12px;
      height:39px;
      padding:6px;
      display:flex;
      align-items:flex-end;
      gap:3px;
      border-radius:10px;
      background:rgba(0,0,0,.64);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
    }

    .demo-timeline i{
      flex:1;
      min-width:2px;
      border-radius:99px;
      background:rgba(255,255,255,.24);
      animation:vexaWave 1.8s ease-in-out infinite alternate;
    }

    .demo-timeline i:nth-child(1){height:34%;animation-delay:-.2s}
    .demo-timeline i:nth-child(2){height:67%;animation-delay:-.7s}
    .demo-timeline i:nth-child(3){height:47%;animation-delay:-.4s}
    .demo-timeline i:nth-child(4){height:84%;animation-delay:-1.1s}
    .demo-timeline i:nth-child(5){height:56%;animation-delay:-.8s}
    .demo-timeline i:nth-child(6){height:74%;animation-delay:-.3s}
    .demo-timeline i:nth-child(7){height:42%;animation-delay:-1.2s}
    .demo-timeline i:nth-child(8){height:62%;animation-delay:-.5s}
    .demo-timeline i:nth-child(9){height:31%;animation-delay:-.9s}
    .demo-timeline i:nth-child(10){height:76%;animation-delay:-.15s}

    .demo-timeline::after{
      content:"";
      position:absolute;
      top:4px;
      bottom:4px;
      left:48%;
      width:1px;
      background:#fff;
      box-shadow:0 0 8px rgba(255,255,255,.3);
    }

    .live-kicker{
      margin:0 0 8px;
      color:rgba(255,255,255,.29);
      font-size:8px;
      font-weight:760;
      letter-spacing:.17em;
      animation:vexaCopyIn .58s .15s var(--vexa-ease) both;
    }

    .live-hero h1{
      max-width:390px;
      margin:0;
      font-size:clamp(35px,9.6vw,49px);
      line-height:.98;
      font-weight:780;
      letter-spacing:-.065em;
      animation:vexaCopyIn .66s .19s var(--vexa-ease) both;
    }

    .live-copy{
      max-width:390px;
      margin:12px 0 0;
      color:rgba(255,255,255,.4);
      font-size:12px;
      line-height:1.5;
      font-weight:500;
      letter-spacing:-.012em;
      animation:vexaCopyIn .66s .24s var(--vexa-ease) both;
    }

    .video-picker-state{
      padding:5px;
      border-radius:28px;
      background:rgba(255,255,255,.025);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 22px 70px rgba(0,0,0,.25);
      animation:vexaPanelIn .72s .23s var(--vexa-ease) both;
    }

    .setup-label{
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:13px 13px 8px;
    }

    .setup-label span:first-child{
      font-size:8px;
      font-weight:760;
      color:rgba(255,255,255,.34);
      letter-spacing:.12em;
    }

    .setup-label span:last-child{
      font-size:7px;
      font-weight:650;
      color:rgba(255,255,255,.2);
    }

    .caption-mode-switch{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:4px;
      margin:0;
      padding:4px;
      border-radius:21px;
      background:rgba(0,0,0,.28);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.045);
    }

    .caption-mode-switch button{
      min-height:47px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:2px;
      border-radius:17px;
      color:rgba(255,255,255,.35);
      background:transparent;
      transition:transform .2s var(--vexa-ease),color .22s ease,background .28s var(--vexa-ease),box-shadow .28s ease;
    }

    .caption-mode-switch button.active{
      color:#fff;
      background:rgba(255,255,255,.095);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 7px 18px rgba(0,0,0,.2);
    }

    .caption-mode-switch button:active{transform:scale(.965)}
    .caption-mode-switch strong{font-size:11.5px;font-weight:760;letter-spacing:-.025em}
    .caption-mode-switch small{font-size:7px;font-weight:650;opacity:.53}

    .language-setup{
      position:relative;
      display:grid;
      grid-template-columns:1fr 28px 1fr;
      gap:0;
      margin:5px 0;
      padding:4px;
      border-radius:22px;
      background:rgba(0,0,0,.25);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.04);
    }

    .language-field{
      min-width:0;
      min-height:71px;
      padding:11px 11px 10px;
      display:flex;
      flex-direction:column;
      justify-content:center;
      gap:7px;
      border-radius:17px;
      background:rgba(255,255,255,.035);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.035);
      transition:background .22s ease,box-shadow .22s ease,transform .22s var(--vexa-ease);
    }

    .language-field:focus-within{
      background:rgba(255,255,255,.065);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);
      transform:translateY(-1px);
    }

    .language-field>span:first-child{
      color:rgba(255,255,255,.27);
      font-size:7px;
      font-weight:760;
      letter-spacing:.115em;
    }

    .language-route-arrow{
      display:grid;
      place-items:center;
      color:rgba(255,255,255,.25);
    }

    .language-route-arrow svg{width:14px;height:14px}

    .language-select-wrap select{
      width:100%;
      height:28px;
      padding:0 20px 0 0;
      color:#fff;
      background:transparent;
      border:0;
      outline:0;
      appearance:none;
      -webkit-appearance:none;
      font-size:12px;
      font-weight:690;
      letter-spacing:-.02em;
    }

    .language-select-wrap select option{color:#000;background:#fff}
    .language-select-wrap svg{width:14px;height:14px;color:rgba(255,255,255,.32)}

    .video-picker{
      position:relative;
      width:100%;
      min-height:72px;
      padding:10px 11px 10px 12px;
      display:grid;
      grid-template-columns:42px 1fr 34px;
      align-items:center;
      gap:11px;
      overflow:hidden;
      border-radius:21px;
      color:#050505;
      text-align:left;
      background:#fff;
      box-shadow:0 14px 34px rgba(0,0,0,.32),inset 0 -1px 0 rgba(0,0,0,.08);
      transition:transform .24s var(--vexa-ease),opacity .22s ease,filter .22s ease;
    }

    .video-picker::after{
      content:"";
      position:absolute;
      top:0;
      bottom:0;
      left:-45%;
      width:34%;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);
      transform:skewX(-18deg);
      opacity:.45;
      animation:vexaCtaSweep 5.2s 1.2s ease-in-out infinite;
      pointer-events:none;
    }

    .video-picker:not(:disabled):active{transform:scale(.982)}
    .video-picker:disabled{opacity:.22;filter:saturate(0);box-shadow:none}

    .video-picker-icon{
      width:42px;
      height:42px;
      display:grid;
      place-items:center;
      border-radius:14px;
      color:#111;
      background:rgba(0,0,0,.055);
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.035);
    }

    .video-picker-icon svg{width:21px;height:21px}
    .video-picker-copy{gap:3px}
    .video-picker-copy strong{font-size:13px;font-weight:790;letter-spacing:-.03em}
    .video-picker-copy small{color:rgba(0,0,0,.43);font-size:7.5px;font-weight:710;letter-spacing:.035em}

    .video-picker-arrow{
      width:31px;
      height:31px;
      display:grid;
      place-items:center;
      border-radius:50%;
      color:#fff;
      background:#0b0b0b;
    }

    .video-picker-arrow svg{width:15px;height:15px}

    .live-source-switch,.youtube-input-state,.youtube-ready-state{display:none}

    .live-footer{
      display:flex;
      justify-content:center;
      align-items:center;
      gap:7px;
      margin:15px 0 0;
      padding:0;
      animation:vexaCopyIn .58s .36s var(--vexa-ease) both;
    }

    .live-footer::before{
      content:"";
      width:5px;
      height:5px;
      border-radius:50%;
      background:rgba(255,255,255,.44);
    }

    .live-footer small{
      color:rgba(255,255,255,.27);
      font-size:7.5px;
      font-weight:650;
      letter-spacing:.045em;
    }

    .footer-line{display:none}

    .video-ready-state{display:none}
    .video-ready-state.show{display:block}

    .live-toast{
      bottom:calc(18px + env(safe-area-inset-bottom));
      max-width:calc(100vw - 32px);
      padding:10px 13px;
      border-radius:14px;
      color:rgba(255,255,255,.9);
      background:rgba(20,20,20,.88);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 18px 55px rgba(0,0,0,.5);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
      font-size:10px;
      font-weight:620;
    }

    body.vexa-live-editing .vexa-editor-top{
      height:calc(60px + env(safe-area-inset-top))!important;
      padding:env(safe-area-inset-top) 13px 0!important;
      background:linear-gradient(180deg,rgba(0,0,0,.84),rgba(0,0,0,.18) 70%,transparent)!important;
      animation:vexaEditorTopIn .5s var(--vexa-ease) both!important;
    }

    body.vexa-live-editing .vexa-editor-back{
      width:39px!important;
      height:39px!important;
      border-radius:14px!important;
      color:#fff!important;
      background:rgba(20,20,20,.68)!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 8px 24px rgba(0,0,0,.28)!important;
      backdrop-filter:blur(14px)!important;
      -webkit-backdrop-filter:blur(14px)!important;
      font-size:22px!important;
      transition:transform .2s var(--vexa-ease)!important;
    }

    body.vexa-live-editing .vexa-editor-back:active{transform:scale(.9)!important}

    body.vexa-live-editing .vexa-editor-title b{
      font-size:12px!important;
      font-weight:760!important;
      letter-spacing:-.025em!important;
    }

    body.vexa-live-editing .vexa-editor-title small{
      margin-top:2px!important;
      color:rgba(255,255,255,.38)!important;
      font-size:7.5px!important;
      font-weight:620!important;
    }

    body.vexa-live-editing .vexa-editor-done{
      height:37px!important;
      padding:0 14px!important;
      border-radius:13px!important;
      color:#060606!important;
      background:#fff!important;
      box-shadow:0 8px 24px rgba(0,0,0,.28)!important;
      font-size:10px!important;
      font-weight:800!important;
      transition:transform .2s var(--vexa-ease)!important;
    }

    body.vexa-live-editing .vexa-editor-done:active{transform:scale(.94)!important}

    body.vexa-live-editing .vexa-editor-caption{
      max-width:86%!important;
      padding:8px 10px!important;
      font-size:clamp(18px,5vw,30px)!important;
      font-weight:820!important;
      line-height:1.06!important;
      letter-spacing:-.04em!important;
      text-shadow:0 2px 3px #000,0 0 18px #000!important;
      transition:opacity .18s ease,filter .18s ease!important;
    }

    body.vexa-live-editing .vexa-editor-caption.show{animation:vexaCaptionIn .25s var(--vexa-ease) both!important}

    body.vexa-live-editing .vexa-caption-grab{
      right:-7px!important;
      top:-7px!important;
      width:16px!important;
      height:16px!important;
      border-radius:50%!important;
      background:#fff!important;
      box-shadow:0 4px 14px rgba(0,0,0,.5)!important;
      opacity:.82!important;
    }

    body.vexa-live-editing .vexa-editor-panel{
      border-radius:24px 24px 0 0!important;
      background:rgba(8,8,8,.985)!important;
      box-shadow:0 -1px 0 rgba(255,255,255,.07),0 -24px 60px rgba(0,0,0,.42)!important;
      backdrop-filter:blur(24px)!important;
      -webkit-backdrop-filter:blur(24px)!important;
      animation:vexaEditorPanelIn .52s var(--vexa-ease) both!important;
    }

    body.vexa-live-editing .vexa-panel-grip{
      width:30px!important;
      height:3px!important;
      margin:1px auto 7px!important;
      background:rgba(255,255,255,.18)!important;
    }

    body.vexa-live-editing .vexa-editor-controls{height:35px!important;gap:8px!important}

    body.vexa-live-editing .vexa-editor-play{
      width:33px!important;
      height:33px!important;
      border-radius:11px!important;
      color:#000!important;
      background:#fff!important;
      box-shadow:0 6px 18px rgba(0,0,0,.28)!important;
      font-size:13px!important;
      transition:transform .18s var(--vexa-ease)!important;
    }

    body.vexa-live-editing .vexa-editor-play:active{transform:scale(.9)!important}

    body.vexa-live-editing .vexa-editor-time{
      min-width:72px!important;
      color:rgba(255,255,255,.66)!important;
      font-size:8.5px!important;
      font-weight:680!important;
    }

    body.vexa-live-editing .vexa-editor-hint{
      color:rgba(255,255,255,.26)!important;
      font-size:7.5px!important;
      font-weight:600!important;
    }

    body.vexa-live-editing .vexa-caption-timeline{
      margin-top:5px!important;
      border-radius:14px!important;
      background:#030303!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.055)!important;
      mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%)!important;
      -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%)!important;
    }

    body.vexa-live-editing .vexa-wave{opacity:.19!important;gap:2px!important}
    body.vexa-live-editing .vexa-wave i{background:#fff!important;min-width:2px!important;max-width:2px!important}

    body.vexa-live-editing .vexa-cue{
      height:36px!important;
      padding:0 8px!important;
      border-radius:9px!important;
      color:rgba(255,255,255,.55)!important;
      background:rgba(255,255,255,.062)!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)!important;
      transition:background .18s ease,color .18s ease,transform .18s var(--vexa-ease)!important;
    }

    body.vexa-live-editing .vexa-cue.active{
      color:#050505!important;
      background:#fff!important;
      box-shadow:0 4px 16px rgba(0,0,0,.28)!important;
      transform:translateY(-1px)!important;
    }

    body.vexa-live-editing .vexa-cue span{font-size:7.5px!important;font-weight:700!important}
    body.vexa-live-editing .vexa-playhead{width:1px!important;background:#fff!important;box-shadow:0 0 8px rgba(255,255,255,.26)!important}

    body.vexa-live-editing .vexa-caption-editor{column-gap:7px!important;margin-top:6px!important}
    body.vexa-live-editing .vexa-caption-meta{height:16px!important;color:rgba(255,255,255,.25)!important;font-size:6.8px!important}

    body.vexa-live-editing .vexa-caption-input{
      border-radius:12px!important;
      padding:9px 10px!important;
      color:#fff!important;
      background:rgba(255,255,255,.052)!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)!important;
      font-size:11px!important;
      font-weight:620!important;
      transition:background .2s ease,box-shadow .2s ease!important;
    }

    body.vexa-live-editing .vexa-caption-input:focus{
      background:rgba(255,255,255,.075)!important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)!important;
    }

    body.vexa-live-editing .vexa-reset-position{
      width:68px!important;
      border-radius:12px!important;
      color:rgba(255,255,255,.5)!important;
      background:rgba(255,255,255,.045)!important;
      font-size:7px!important;
      font-weight:680!important;
    }

    .youtube-input-state{margin-top:5px}
    .youtube-link-card{min-height:66px;padding:10px;border-radius:18px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
    .youtube-link-card input{color:#fff;background:transparent;border:0;outline:0}
    .youtube-link-card button{color:#000;background:#fff}

    @keyframes vexaHeaderIn{from{opacity:0;transform:translateY(-9px)}to{opacity:1;transform:none}}
    @keyframes vexaPreviewIn{from{opacity:0;transform:translateY(18px) scale(.92);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
    @keyframes vexaCopyIn{from{opacity:0;transform:translateY(10px);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}
    @keyframes vexaPanelIn{from{opacity:0;transform:translateY(18px) scale(.975);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}
    @keyframes vexaStatusPulse{0%,100%{opacity:.45;transform:scale(.82)}50%{opacity:1;transform:scale(1)}}
    @keyframes vexaCaptionFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    @keyframes vexaWave{from{opacity:.35;transform:scaleY(.72)}to{opacity:1;transform:scaleY(1)}}
    @keyframes vexaCtaSweep{0%,72%{left:-45%}88%,100%{left:125%}}
    @keyframes vexaEditorTopIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
    @keyframes vexaEditorPanelIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
    @keyframes vexaCaptionIn{from{opacity:0;transform:translate(-50%,-50%) scale(.94);filter:blur(4px)}to{opacity:1;transform:translate(-50%,-50%) scale(1);filter:none}}

    @media(max-height:760px){
      .live-hero{padding-top:18px}
      .editor-demo{width:118px;margin-bottom:18px;border-radius:24px}
      .live-hero h1{font-size:33px}
      .live-copy{margin-top:9px;font-size:11px}
      .video-picker-state{border-radius:25px}
      .language-field{min-height:64px}
      .video-picker{min-height:66px}
    }

    @media(max-width:380px){
      .live-app{padding-left:13px;padding-right:13px}
      .editor-demo{width:126px}
      .live-hero h1{font-size:34px}
      .language-field{padding-left:9px;padding-right:9px}
      .language-select-wrap select{font-size:11px}
    }

    @media(prefers-reduced-motion:reduce){
      .editor-demo,.live-header,.live-kicker,.live-hero h1,.live-copy,.video-picker-state,.live-footer{animation:none!important}
      .demo-caption,.demo-timeline i,.live-status-pill i,.video-picker::after{animation:none!important}
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
      <h1 id="liveTitle">Your video. Your captions.</h1>
      <p class="live-copy">Pick a video, generate accurate captions, then edit every line, timing and position right on the video.</p>
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