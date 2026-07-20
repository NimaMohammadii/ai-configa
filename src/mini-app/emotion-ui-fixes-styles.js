export const EMOTION_UI_FIXES_CSS = String.raw`
.player-history-row{position:relative}
.emotion-trigger{min-width:92px!important;width:92px!important;flex:0 0 92px!important;border-radius:999px!important;padding:0 14px!important;gap:0!important}
.emotion-trigger-icon{display:none!important}
body.emotion-audio-ready:not(.keyboard-open):not(.image-mode) .player-history-row .emotion-trigger{position:absolute;z-index:4;right:56px;top:-48px;height:38px;min-width:92px!important;width:92px!important;box-shadow:0 14px 34px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.09);animation:emotionButtonLift .34s cubic-bezier(.16,.9,.22,1)}
body.keyboard-open #flow.active .emotion-trigger,body.keyboard-open.emotion-audio-ready #flow.active .emotion-trigger{position:fixed;z-index:57;right:72px;top:auto;bottom:calc(14px + env(safe-area-inset-bottom));width:96px!important;min-width:96px!important;height:42px;border-radius:999px!important;margin:0;transform:none}
.tts-area{position:relative}
.emotion-text-overlay{position:absolute;z-index:1;overflow:hidden;pointer-events:none;color:#fff;background:transparent;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;font-size:14px;line-height:1.22;font-weight:430;letter-spacing:-.03em;text-align:start}
.emotion-text-content{min-height:100%;transform:translateY(0);transform-origin:top left;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}
.emotion-inline-tag{display:inline;color:#c7a1ff;font-weight:740;letter-spacing:-.015em;background:rgba(52,25,82,.92);border:1px solid rgba(174,123,255,.3);border-radius:5px;padding:1px 2px;margin:0 1px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);-webkit-box-decoration-break:clone;box-decoration-break:clone}
body.emotion-highlight-ready .tts-area textarea{position:relative;z-index:2;color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:#fff!important}
body.emotion-highlight-ready .tts-area textarea::placeholder{color:rgba(255,255,255,.28)!important;-webkit-text-fill-color:rgba(255,255,255,.28)!important}
body.emotion-highlight-ready .tts-area textarea::selection{background:rgba(122,72,178,.42)}
@keyframes emotionButtonLift{from{opacity:0;transform:translateY(12px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:380px){.emotion-trigger{min-width:86px!important;width:86px!important;flex-basis:86px!important}body.keyboard-open #flow.active .emotion-trigger,body.keyboard-open.emotion-audio-ready #flow.active .emotion-trigger{right:72px;width:92px!important;min-width:92px!important}}
`;
