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

.tts-head{max-height:112px;opacity:1;transform:translateY(0);transition:max-height .48s cubic-bezier(.2,.86,.2,1),opacity .26s ease,transform .48s cubic-bezier(.2,.86,.2,1)}
.tts-edit-mode .tts-head{max-height:0;opacity:0;transform:translateY(-22px);overflow:hidden;pointer-events:none}

.tts-edit-mode-header{width:100%;height:0;min-height:0;overflow:hidden;opacity:0;transform:translateY(-16px) scale(.98);display:flex;align-items:center;gap:11px;padding:0 2px;border-bottom:1px solid transparent;transition:height .48s cubic-bezier(.2,.9,.2,1),min-height .48s cubic-bezier(.2,.9,.2,1),opacity .28s ease,transform .48s cubic-bezier(.2,.9,.2,1),border-color .3s ease}
.tts-edit-mode .tts-edit-mode-header{height:64px;min-height:64px;opacity:1;transform:translateY(0) scale(1);border-color:rgba(255,255,255,.09)}
.tts-edit-mode-close{width:38px;height:38px;flex:0 0 38px;padding:0;border-radius:12px;display:grid;place-items:center;color:rgba(255,255,255,.82);background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.11);transition:transform .2s ease,background .2s ease,color .2s ease}
.tts-edit-mode-close:active{transform:scale(.9);background:rgba(255,255,255,.12);color:#fff}
.tts-edit-mode-title{min-width:0;display:flex;align-items:center;gap:10px;flex:1}
.tts-edit-mode-title>div{min-width:0;display:flex;flex-direction:column;gap:3px}
.tts-edit-mode-title strong{font-size:14px;line-height:1.1;font-weight:760;letter-spacing:-.025em;color:#fff}
.tts-edit-mode-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;line-height:1.2;font-weight:540;color:rgba(255,255,255,.43)}
.tts-edit-mode-mark{width:28px;height:28px;flex:0 0 28px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:2px;background:#fff;color:#050505;box-shadow:0 8px 22px rgba(255,255,255,.09)}
.tts-edit-mode-mark i{width:2px;height:7px;border-radius:3px;background:currentColor;animation:ttsEditHeaderWave .9s ease-in-out infinite}
.tts-edit-mode-mark i:nth-child(2){height:13px;animation-delay:.13s}.tts-edit-mode-mark i:nth-child(3){height:9px;animation-delay:.26s}
.tts-edit-mode-badge{height:24px;padding:0 8px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:820;letter-spacing:.13em;color:rgba(255,255,255,.58);background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1)}

.player-history-row{max-height:60px;opacity:1;transform:translateY(0);overflow:visible;transition:max-height .42s cubic-bezier(.2,.86,.2,1),min-height .42s cubic-bezier(.2,.86,.2,1),opacity .24s ease,transform .42s cubic-bezier(.2,.86,.2,1),margin .42s ease}
.tts-edit-mode .player-history-row{max-height:0;min-height:0;opacity:0;transform:translateY(14px);overflow:hidden;pointer-events:none;margin:0}
.tts-edit-mode .dialogue-editor{padding-top:8px!important;transform:translateY(0);animation:ttsEditCanvasIn .48s cubic-bezier(.2,.9,.2,1) both}
.tts-edit-mode .dialogue-input-wrap{min-height:clamp(260px,46dvh,440px);border-radius:20px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 0 0 1px rgba(255,255,255,.13),0 24px 60px rgba(0,0,0,.34)!important}
.tts-edit-mode .tts-area .dialogue-text{height:clamp(260px,46dvh,440px)!important;min-height:clamp(260px,46dvh,440px)!important;padding:18px 16px 22px!important;font-size:16px!important;line-height:1.52!important;overflow-y:auto!important}
.tts-edit-mode .tts-edit-bar{height:52px;margin-top:12px;background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.12)}
.tts-edit-mode .tts-generate-row{padding-top:8px}
.tts-edit-mode .tts-generate{border-radius:14px;box-shadow:0 13px 34px rgba(255,255,255,.07)}
.tts-edit-mode .char-count-wrap{opacity:.62}
body.tts-edit-mode-active{background:#000}
@keyframes ttsEditHeaderWave{0%,100%{transform:scaleY(.58);opacity:.55}50%{transform:scaleY(1);opacity:1}}
@keyframes ttsEditCanvasIn{0%{opacity:.55;transform:translateY(18px) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
@media(max-height:720px){.tts-edit-mode .dialogue-input-wrap,.tts-edit-mode .tts-area .dialogue-text{min-height:220px!important;height:220px!important}.tts-edit-mode .tts-edit-mode-header{height:56px;min-height:56px}}
`;
