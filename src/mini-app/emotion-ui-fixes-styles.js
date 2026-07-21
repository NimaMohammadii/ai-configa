export const EMOTION_UI_FIXES_CSS = String.raw`
.player-history-row{position:relative}
.emotion-trigger,.player-history-row>.emotion-trigger{position:absolute!important;z-index:4;right:0!important;top:-54px!important;bottom:auto!important;width:46px!important;min-width:46px!important;height:46px!important;flex:0 0 46px!important;border-radius:50%!important;padding:0!important;display:grid!important;place-items:center!important;gap:0!important;background:rgba(255,255,255,.055)!important;color:rgba(255,255,255,.88)!important;border:1px solid rgba(255,255,255,.15)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 14px 34px rgba(0,0,0,.4)!important;animation:emotionButtonLift .34s cubic-bezier(.16,.9,.22,1)}
.emotion-trigger-icon{display:none!important}
.emotion-real-icon{display:block;width:22px;height:22px;filter:drop-shadow(0 1px 4px rgba(255,255,255,.08));transition:transform .24s cubic-bezier(.2,.9,.2,1)}
.emotion-trigger:active .emotion-real-icon,.emotion-trigger.active .emotion-real-icon{transform:scale(.9) rotate(-4deg)}
body.emotion-audio-ready:not(.keyboard-open):not(.image-mode) .player-history-row .emotion-trigger{right:0!important;top:-54px!important;width:46px!important;min-width:46px!important;height:46px!important}
body.keyboard-open #flow.active .emotion-trigger,body.keyboard-open.emotion-audio-ready #flow.active .emotion-trigger{position:fixed!important;z-index:57;right:22px!important;top:auto!important;bottom:calc(64px + env(safe-area-inset-bottom))!important;width:42px!important;min-width:42px!important;height:42px!important;border-radius:50%!important;margin:0;transform:none}
.emotion-head{display:none!important}
.emotion-backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.emotion-card{left:24px!important;right:24px!important;max-width:410px!important;max-height:min(42dvh,350px)!important;bottom:calc(108px + env(safe-area-inset-bottom))!important;border-radius:22px!important;padding:7px 9px 9px!important}
.emotion-handle{margin-bottom:8px!important}.emotion-search{height:37px!important;flex-basis:37px!important}.emotion-categories{padding-top:7px!important;padding-bottom:6px!important}.emotion-list{gap:5px!important}.emotion-tag{min-height:46px!important;padding:7px 8px!important;border-radius:13px!important}
body.keyboard-open .emotion-panel{display:none!important}
.tts-area{position:relative}
.emotion-text-overlay{position:absolute;z-index:1;overflow:hidden;pointer-events:none;color:#fff;background:transparent;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;font-size:16px;line-height:1.34;font-weight:430;letter-spacing:-.025em;direction:ltr;text-align:left;unicode-bidi:isolate}
.emotion-text-content{min-height:100%;transform:translateY(0);transform-origin:top left;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}
.emotion-inline-tag{display:inline;color:#c7a1ff;font:inherit;line-height:inherit;letter-spacing:inherit;vertical-align:baseline;background:rgba(52,25,82,.92);border:0;border-radius:3px;padding:0;margin:0;box-shadow:inset 0 0 0 1px rgba(174,123,255,.3);-webkit-box-decoration-break:clone;box-decoration-break:clone}
body.emotion-highlight-ready .tts-area textarea{position:relative;z-index:2;color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:#fff!important}
body.emotion-highlight-ready .tts-area textarea::placeholder{color:rgba(255,255,255,.28)!important;-webkit-text-fill-color:rgba(255,255,255,.28)!important}
body.emotion-highlight-ready .tts-area textarea::selection{background:rgba(122,72,178,.42)}
@keyframes emotionButtonLift{from{opacity:0;transform:translateY(12px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:380px){.emotion-card{left:14px!important;right:14px!important;max-height:min(40dvh,320px)!important}body.keyboard-open #flow.active .emotion-trigger,body.keyboard-open.emotion-audio-ready #flow.active .emotion-trigger{right:22px!important;width:42px!important;min-width:42px!important}}
`;
