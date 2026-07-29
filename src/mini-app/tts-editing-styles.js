export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:14px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{transition:transform .36s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.86);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9);background:rgba(255,255,255,.11);color:#fff}
.tts-edit-button:disabled{pointer-events:none}

body.tts-edit-overlay-active{overflow:hidden;overscroll-behavior:none}
.tts-edit-overlay{position:fixed;inset:0;width:100%;height:var(--app-viewport-height,100dvh);z-index:160;display:grid;place-items:center;padding:12px;pointer-events:none;visibility:hidden}
.tts-edit-overlay.open{pointer-events:auto;visibility:visible}
.tts-edit-backdrop{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;border-radius:0;background:rgba(0,0,0,.58);opacity:0;-webkit-backdrop-filter:blur(18px) saturate(.75);backdrop-filter:blur(18px) saturate(.75);transition:opacity .32s ease}
.tts-edit-overlay.open .tts-edit-backdrop{opacity:1}

.tts-edit-dialog{position:relative;width:min(100%,520px);max-height:calc(var(--app-viewport-height,100dvh) - 24px);display:flex;flex-direction:column;overflow:hidden;color:#fff;background:linear-gradient(180deg,rgba(25,25,25,.97),rgba(10,10,10,.98));border:1px solid rgba(255,255,255,.13);border-radius:22px;box-shadow:0 32px 90px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.07);opacity:0;transform:translateY(18px) scale(.965);transition:opacity .24s ease,transform .42s cubic-bezier(.16,1,.3,1),border-color .26s ease}
.tts-edit-overlay.open .tts-edit-dialog{opacity:1;transform:translateY(0) scale(1)}
.tts-edit-dialog.busy{border-color:rgba(255,255,255,.2)}
.tts-edit-dialog.success{border-color:rgba(255,255,255,.42)}

.tts-edit-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:17px 17px 12px}
.tts-edit-dialog-head>div{min-width:0}
.tts-edit-dialog-head h2{margin:0;font-size:16px;line-height:1.15;font-weight:760;letter-spacing:-.025em;color:#fff}
.tts-edit-dialog-head p{margin:5px 0 0;font-size:11px;line-height:1.35;font-weight:520;color:rgba(255,255,255,.44)}
.tts-edit-dialog-close{width:36px;height:36px;flex:0 0 36px;padding:0;display:grid;place-items:center;border-radius:11px;color:rgba(255,255,255,.7);background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);transition:transform .2s ease,background .2s ease,color .2s ease,opacity .2s ease}
.tts-edit-dialog-close:active{transform:scale(.9);background:rgba(255,255,255,.11);color:#fff}
.tts-edit-dialog-close:disabled{opacity:.28;pointer-events:none}

.tts-edit-text-wrap{height:min(46dvh,390px);min-height:230px;margin:0 12px;overflow:hidden;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:border-color .22s ease,background .22s ease,box-shadow .22s ease}
.tts-edit-text-wrap:focus-within{background:rgba(255,255,255,.047);border-color:rgba(255,255,255,.18);box-shadow:0 0 0 3px rgba(255,255,255,.025),inset 0 1px 0 rgba(255,255,255,.04)}
.tts-edit-text{display:block;width:100%;height:100%;resize:none;overflow:auto;padding:16px;border:0;outline:0;background:transparent;color:#f6f6f6;font:500 16px/1.58 inherit;letter-spacing:-.01em;caret-color:#fff;white-space:pre-wrap;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.tts-edit-text::placeholder{color:rgba(255,255,255,.26)}
.tts-edit-text::selection{background:#fff;color:#050505}

.tts-edit-dialog-foot{min-height:70px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px 13px}
.tts-edit-selection{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;line-height:1.25;font-weight:620;color:rgba(255,255,255,.4);transition:color .2s ease}
.tts-edit-selection.ready{color:rgba(255,255,255,.78)}
.tts-edit-regenerate{position:relative;height:44px;min-width:128px;flex:0 0 auto;padding:0 18px;border-radius:13px;display:grid;place-items:center;color:#050505;background:#fff;border:1px solid #fff;font-size:12px;font-weight:760;letter-spacing:-.01em;box-shadow:0 10px 26px rgba(255,255,255,.08);transition:transform .22s cubic-bezier(.2,.9,.2,1),opacity .22s ease,background .22s ease,color .22s ease}
.tts-edit-regenerate:not(:disabled):active{transform:scale(.94)}
.tts-edit-regenerate:disabled{opacity:.2;box-shadow:none;pointer-events:none}
.tts-edit-regenerate-loader{display:none;align-items:center;gap:3px}
.tts-edit-regenerate-loader i{width:3px;height:12px;border-radius:999px;background:currentColor;animation:ttsEditWave .72s ease-in-out infinite}
.tts-edit-regenerate-loader i:nth-child(2){animation-delay:.11s}.tts-edit-regenerate-loader i:nth-child(3){animation-delay:.22s}
.tts-edit-regenerate.loading .tts-edit-regenerate-label{display:none}
.tts-edit-regenerate.loading .tts-edit-regenerate-loader{display:flex}
.tts-edit-regenerate.loading{opacity:.82;cursor:wait}

@keyframes ttsEditWave{0%,100%{transform:scaleY(.45);opacity:.45}50%{transform:scaleY(1);opacity:1}}
@media(max-width:390px){.player-history-row{gap:7px}.tts-edit-button,.history-button{width:48px;height:48px;flex-basis:48px;border-radius:13px}.tts-edit-overlay{padding:10px}.tts-edit-dialog{border-radius:20px}.tts-edit-dialog-head{padding:15px 15px 11px}.tts-edit-text-wrap{margin:0 10px;height:min(44dvh,350px);min-height:210px}.tts-edit-dialog-foot{padding:11px}.tts-edit-regenerate{min-width:118px;padding:0 15px}}
@media(max-height:620px){.tts-edit-text-wrap{height:38dvh;min-height:170px}.tts-edit-dialog-head p{display:none}.tts-edit-dialog-foot{min-height:62px}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.tts-edit-backdrop,.tts-edit-dialog,.tts-edit-dialog-close,.tts-edit-text-wrap,.tts-edit-regenerate{transition-duration:.01ms!important}.tts-edit-regenerate-loader i{animation:none!important}}
`;
