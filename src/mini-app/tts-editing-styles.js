export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:14px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{transition:transform .36s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.84);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9);background:rgba(255,255,255,.11);color:#fff}
.tts-edit-button.active{color:#080808;background:#fff;border-color:#fff;box-shadow:0 9px 28px rgba(255,255,255,.12);transform:scale(.96)}
.tts-edit-button.active svg{transform:rotate(-8deg) scale(1.04)}
.tts-edit-button:disabled{pointer-events:none}

.tts-edit-bar{width:100%;height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(10px) scale(.985);display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid transparent;border-radius:14px;background:rgba(255,255,255,.035);padding:0 13px;transition:height .42s cubic-bezier(.2,.86,.2,1),margin .42s cubic-bezier(.2,.86,.2,1),opacity .25s ease,transform .42s cubic-bezier(.2,.86,.2,1),border-color .28s ease,background .28s ease}
.tts-edit-bar-copy{min-width:0;display:flex;align-items:center;gap:9px}
.tts-edit-pulse{position:relative;width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.3)}
.tts-edit-bar-copy div{min-width:0;display:flex;flex-direction:column;gap:2px}
.tts-edit-bar-copy strong{font-size:11.5px;line-height:1.15;font-weight:720;color:#fff;letter-spacing:-.01em}
.tts-edit-bar-copy small{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;line-height:1.2;font-weight:560;color:rgba(255,255,255,.46)}
.tts-edit-selection{max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;font-weight:650;color:rgba(255,255,255,.5);text-align:right}

.tts-edit-mode .tts-edit-bar{height:48px;margin:8px 0 1px;opacity:1;transform:translateY(0) scale(1);border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.04)}
.tts-edit-mode.tts-edit-entered .tts-edit-pulse{animation:ttsEditPulse 1.8s ease-out infinite}
.tts-edit-mode .dialogue-input-wrap{border-radius:16px;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 16px 44px rgba(0,0,0,.26);background:rgba(255,255,255,.018);transform:translateY(-1px);transition:transform .4s cubic-bezier(.2,.86,.2,1),box-shadow .35s ease,background .35s ease}
.tts-edit-mode .dialogue-text{caret-color:#fff}
.tts-edit-mode .dialogue-text::selection{background:rgba(255,255,255,.92);color:#050505}
.tts-edit-mode .add-speaker,.tts-edit-mode .dialogue-speaker-row,.tts-edit-mode .tts-enhance{opacity:.18!important;pointer-events:none!important;filter:saturate(0)}
.tts-edit-mode .wave-player{opacity:.44;transform:scale(.985);pointer-events:none;transition:opacity .3s ease,transform .38s cubic-bezier(.2,.86,.2,1)}
.tts-edit-mode .history-button{opacity:.28;pointer-events:none;transform:scale(.94)}
.tts-edit-mode .tts-generate{transition:transform .3s cubic-bezier(.2,.86,.2,1),opacity .24s ease,background .24s ease}
.tts-edit-mode .tts-generate:not(:disabled){box-shadow:0 10px 30px rgba(255,255,255,.08)}
.tts-edit-mode .tts-generate:disabled{opacity:.2}
.tts-edit-busy .tts-edit-bar{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.16)}
.tts-edit-busy .tts-edit-pulse{animation:ttsEditBusy .72s ease-in-out infinite}
.tts-edit-success .tts-edit-bar{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.24)}
.tts-edit-success .tts-edit-pulse{animation:none;transform:scale(1.5)}

@keyframes ttsEditPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.32)}65%,100%{box-shadow:0 0 0 8px rgba(255,255,255,0)}}
@keyframes ttsEditBusy{0%,100%{opacity:.35;transform:scale(.72)}50%{opacity:1;transform:scale(1.35)}}
@media(max-width:390px){.player-history-row{gap:7px}.tts-edit-button,.history-button{width:48px;height:48px;flex-basis:48px;border-radius:13px}.tts-edit-bar-copy small{max-width:150px}.tts-edit-selection{max-width:36%}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.tts-edit-bar,.tts-edit-mode .dialogue-input-wrap,.tts-edit-mode .wave-player{transition-duration:.01ms!important}.tts-edit-pulse{animation:none!important}}
`;
