export const MINI_APP_CSS = `
:root{
  color-scheme:dark;
  --text:#fff;
  --muted:rgba(255,255,255,.58);
  --line:rgba(255,255,255,.14);
  --card:rgba(255,255,255,.055);
  --font-main:"SF Pro Display","SF Pro Text","Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  --font-num:"SF Pro Text","Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  font-family:var(--font-main);
  font-feature-settings:"kern" 1,"liga" 1,"calt" 1,"ss01" 1;
  text-rendering:geometricPrecision;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}

*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}

html,body{
  margin:0;
  height:100%;
  background:#000!important;
  color:#fff;
  overflow:hidden;
  font-family:var(--font-main);
  font-optical-sizing:auto;
}

body{
  height:100dvh;
}

button,textarea{
  font:inherit;
  font-family:var(--font-main);
}

button{
  border:0;
}

strong,.wave-time{
  font-family:var(--font-num);
  font-variant-numeric:tabular-nums lining-nums;
  font-feature-settings:"tnum" 1,"lnum" 1,"kern" 1;
}

.app{
  position:relative;
  width:min(100%,560px);
  height:100dvh;
  margin:auto;
  padding:calc(22px + env(safe-area-inset-top)) 16px calc(22px + env(safe-area-inset-bottom));
  background:#000!important;
  overflow:hidden;
}

.view{
  display:none;
  height:100%;
  overflow:hidden;
  position:relative;
}

.view.active{
  display:block;
}

.tts-page{
  height:100%;
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

.tts-head{
  display:flex;
  align-items:center!important;
  justify-content:space-between!important;
  gap:12px!important;
  margin:0 0 14px!important;
}

.credit-pill{
  order:1;
  height:36px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.13);
  background:rgba(255,255,255,.055);
  display:flex;
  align-items:center;
  gap:8px;
  padding:0 11px;
  font-size:13px;
  font-weight:620;
  margin-left:0;
  margin-right:auto;
}

.credit-pill span{
  color:var(--muted);
  font-size:11px;
  font-weight:620;
}

.credit-pill strong{
  color:#fff;
  font-size:12px;
  font-weight:760;
}

.voice-wrap{
  position:relative;
  flex:0 0 auto;
  order:2;
  margin-left:0;
  margin-right:0;
  transform:none!important;
}

.voice-btn{
  height:36px;
  min-width:104px;
  border-radius:999px;
  border:1px solid var(--line);
  background:rgba(255,255,255,.055);
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:0 13px;
  font-size:14px;
  font-weight:650;
}

.voice-btn svg{
  transition:transform .22s ease;
}

.voice-wrap.open .voice-btn svg{
  transform:rotate(180deg);
}

.voice-menu{
  position:absolute;
  right:0;
  top:44px;
  z-index:50;
  width:150px;
  max-height:242px;
  overflow:auto;
  padding:6px;
  border:1px solid rgba(255,255,255,.13);
  border-radius:18px;
  background:rgba(8,8,8,.96);
  box-shadow:0 24px 70px rgba(0,0,0,.72);
  opacity:0;
  transform:translateY(-8px) scale(.96);
  transform-origin:top right;
  pointer-events:none;
  transition:opacity .18s ease,transform .18s ease;
}

.voice-wrap.open .voice-menu{
  opacity:1;
  transform:translateY(0) scale(1);
  pointer-events:auto;
}

.voice-menu button{
  width:100%;
  height:32px;
  border-radius:13px;
  background:transparent;
  color:rgba(255,255,255,.64);
  text-align:left;
  padding:0 10px;
  font-size:12.5px;
  font-weight:560;
}

.voice-menu button.active{
  background:#fff;
  color:#050505;
}

.tts-area{
  flex:1;
  display:flex;
  flex-direction:column;
  min-height:0;
  transform:none!important;
  margin-top:-8px!important;
}

.tts-label{
  font-size:11px;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--muted);
  margin:8px 0 10px;
  font-weight:650;
}

.tts-area textarea{
  flex:1;
  width:100%;
  min-height:0;
  resize:none;
  border:0!important;
  outline:0;
  background:transparent!important;
  border-radius:0!important;
  padding:0!important;
  font-size:14px!important;
  line-height:1.22!important;
  color:#fff;
  box-shadow:none!important;
  font-weight:430;
  letter-spacing:-.03em;
}

.tts-area textarea::placeholder{
  color:rgba(255,255,255,.28);
  font-size:14px!important;
}

.tts-bottom{
  width:92%;
  max-width:480px;
  display:grid;
  gap:12px!important;
  margin-top:10px;
  margin-left:0!important;
  margin-right:auto!important;
  margin-bottom:18px!important;
  padding-bottom:0;
}

.tts-generate-row{
  width:100%;
  display:flex;
  align-items:center;
  gap:12px;
  margin-left:0;
  margin-right:0;
}

.tts-generate{
  width:min(70%,330px);
  height:44px;
  margin-left:0;
  margin-right:0;
  flex:0 0 auto;
  border-radius:999px;
  background:#fff;
  color:#050505;
  font-weight:760;
  font-size:14px;
  box-shadow:0 0 28px rgba(255,255,255,.18);
  transition:transform .2s ease,opacity .2s ease;
}

.tts-generate:active{
  transform:scale(.985);
}

.tts-generate:disabled{
  opacity:.45;
}

.char-count-wrap{
  margin-left:auto;
  margin-right:0;
  display:flex;
  align-items:center;
  gap:7px;
}

.char-count{
  color:rgba(255,255,255,.42);
  font-size:11px;
  font-weight:750;
  letter-spacing:.02em;
  white-space:nowrap;
  text-align:right;
  font-variant-numeric:tabular-nums;
}

.char-warning{
  width:18px;
  height:18px;
  flex:0 0 auto;
  border-radius:50%;
  background:#ff3030;
  color:#fff;
  display:none;
  align-items:center;
  justify-content:center;
  padding:0;
  font-size:12px;
  font-weight:950;
  line-height:1;
  box-shadow:0 0 0 0 rgba(255,48,48,.55),0 0 18px rgba(255,48,48,.36);
  transform:scale(.7);
  opacity:0;
}

#flow.over-limit .char-warning{
  display:flex;
  animation:warningPop .22s cubic-bezier(.2,.9,.2,1) forwards,warningPulse 1.15s ease-in-out .22s infinite;
}

#flow.over-limit .char-count{
  color:rgba(255,255,255,.72);
}

.wave-player{
  display:none;
  width:86%;
  margin-left:0;
  margin-right:auto;
  border:1px solid rgba(255,255,255,.12);
  border-radius:22px;
  background:rgba(255,255,255,.045);
  padding:8px 10px;
  align-items:center;
  gap:10px;
  animation:waveIn .32s cubic-bezier(.2,.8,.2,1);
}

.wave-player.show{
  display:flex;
}

.wave-play{
  width:34px;
  height:34px;
  border-radius:50%;
  background:#fff;
  color:#050505;
  display:grid;
  place-items:center;
  flex:0 0 auto;
  padding:0;
}

.wave-svg{
  height:28px;
  flex:1;
}

.wave-svg rect{
  fill:#fff;
  opacity:.38;
}

.wave-time{
  font-size:12px;
  color:var(--muted);
}

.tts-hidden-audio{
  display:none;
}

.limit-sheet{
  position:fixed;
  inset:0;
  z-index:160;
  display:grid;
  place-items:end center;
  opacity:0;
  pointer-events:none;
  transition:opacity .22s ease;
}

.limit-sheet.open{
  opacity:1;
  pointer-events:auto;
}

.limit-backdrop{
  position:absolute;
  inset:0;
  background:rgba(0,0,0,.48);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
}

.limit-card{
  position:relative;
  width:calc(100% - 32px);
  max-width:460px;
  margin:0 16px calc(24px + env(safe-area-inset-bottom));
  border:1px solid rgba(255,255,255,.14);
  border-radius:28px;
  background:linear-gradient(180deg,rgba(28,28,28,.98),rgba(8,8,8,.98));
  box-shadow:0 28px 90px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.12);
  padding:18px;
  text-align:center;
  transform:translateY(26px) scale(.96);
  opacity:0;
  transition:transform .28s cubic-bezier(.2,.85,.2,1),opacity .22s ease;
}

.limit-sheet.open .limit-card{
  transform:translateY(0) scale(1);
  opacity:1;
}

.limit-icon{
  width:34px;
  height:34px;
  margin:0 auto 10px;
  border-radius:50%;
  background:#ff3030;
  color:#fff;
  display:grid;
  place-items:center;
  font-weight:950;
  box-shadow:0 0 24px rgba(255,48,48,.35);
}

.limit-card h3{
  margin:0 0 6px;
  font-size:17px;
  font-weight:900;
  letter-spacing:-.02em;
}

.limit-card p{
  margin:0 auto 14px;
  color:rgba(255,255,255,.62);
  font-size:13px;
  line-height:1.38;
  max-width:290px;
}

.limit-close{
  width:100%;
  height:42px;
  border-radius:999px;
  background:#fff;
  color:#050505;
  font-weight:900;
}

.keyboard-dismiss{
  position:fixed;
  right:22px;
  bottom:calc(14px + env(safe-area-inset-bottom));
  z-index:30;
  width:42px;
  height:42px;
  border-radius:50%;
  border:1px solid rgba(255,255,255,.18);
  background:rgba(18,18,18,.92);
  color:#fff;
  display:grid;
  place-items:center;
  padding:0;
  opacity:0;
  transform:translateY(12px) scale(.92);
  pointer-events:none;
  box-shadow:0 18px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12);
  transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.2,1);
}

body.keyboard-open #flow.active .keyboard-dismiss{
  opacity:1;
  transform:translateY(0) scale(1);
  pointer-events:auto;
}

body.keyboard-open #flow.active .keyboard-dismiss svg{
  animation:keyboardArrow .95s ease-in-out infinite;
}

#flow .tts-page:focus-within .tts-bottom{
  display:none!important;
}

.toast{
  position:fixed;
  left:max(16px,calc((100vw - 528px)/2 + 16px));
  right:auto;
  bottom:calc(22px + env(safe-area-inset-bottom));
  width:max-content;
  max-width:min(420px,calc(100vw - 32px));
  min-height:42px;
  padding:11px 18px;
  border:1px solid rgba(255,255,255,.18);
  border-radius:22px;
  background:linear-gradient(145deg,rgba(255,255,255,.14),rgba(18,18,18,.72));
  box-shadow:0 18px 58px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.16);
  backdrop-filter:blur(22px) saturate(1.5);
  -webkit-backdrop-filter:blur(22px) saturate(1.5);
  display:none;
  z-index:190;
  font-size:15px;
  font-weight:620;
  line-height:1.25;
  letter-spacing:-.02em;
  white-space:normal;
}

.is-locked{
  background:#000;
}

.lock-screen{
  min-height:100vh;
  display:grid;
  place-items:center;
  background:#000;
  padding:28px;
}

.lock-card{
  width:min(74vw,420px);
  text-align:center;
}

.lock-title{
  margin:0 0 18px;
  color:#fff;
  font-size:13px;
  font-weight:800;
  letter-spacing:.34em;
  text-transform:uppercase;
}

.lock-bar{
  direction:ltr;
  height:4px;
  border-radius:999px;
  background:#121212;
  overflow:hidden;
  box-shadow:0 0 0 1px rgba(255,255,255,.06),0 18px 60px rgba(255,255,255,.12);
}

.lock-bar span{
  display:block;
  width:0;
  transform-origin:left center;
  height:100%;
  border-radius:999px;
  background:linear-gradient(90deg,#fff,#8f8f8f,#fff);
  box-shadow:0 0 24px rgba(255,255,255,.72);
  transition:width .45s ease;
}

@keyframes waveIn{
  from{opacity:0;transform:translateY(10px) scale(.98)}
  to{opacity:1;transform:translateY(0) scale(1)}
}

@keyframes warningPop{
  from{opacity:0;transform:scale(.7)}
  to{opacity:1;transform:scale(1)}
}

@keyframes warningPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(255,48,48,.48),0 0 18px rgba(255,48,48,.36)}
  50%{box-shadow:0 0 0 5px rgba(255,48,48,0),0 0 24px rgba(255,48,48,.48)}
}

@keyframes keyboardArrow{
  0%,100%{transform:translateY(-1px)}
  50%{transform:translateY(4px)}
}

@media (max-width:520px){
  .app{
    padding-top:calc(18px + env(safe-area-inset-top));
  }

  .tts-bottom{
    width:100%;
  }

  .tts-generate{
    width:min(72%,330px);
  }

  .lock-card{
    width:min(82vw,360px);
  }
}
`;
