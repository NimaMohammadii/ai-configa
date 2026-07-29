export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:14px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{transition:transform .3s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.86);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9)}
.tts-edit-button:disabled{pointer-events:none}
.tts-edit-button.active{color:#080808;background:#fff;border-color:#fff;box-shadow:0 9px 26px rgba(255,255,255,.1);opacity:1;transform:scale(.96)}
.tts-edit-button.active svg{transform:rotate(-5deg)}

.tts-inline-edit .dialogue-input-wrap{border-radius:16px!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)!important;transition:box-shadow .24s ease}
.tts-inline-edit .dialogue-text{caret-color:#c866ff}
.tts-inline-edit .dialogue-text::selection{background:rgba(200,102,255,.82);color:#fff;text-shadow:none}
.tts-inline-edit .dialogue-text::-moz-selection{background:rgba(200,102,255,.82);color:#fff;text-shadow:none}
.tts-edit-inline-active .add-speaker,.tts-edit-inline-active .dialogue-speaker-row,.tts-edit-inline-active .tts-enhance{pointer-events:none}
.tts-edit-inline-active .tts-generate{transition:transform .24s cubic-bezier(.2,.9,.2,1),opacity .22s ease}
.tts-edit-inline-active .tts-generate:not(:disabled):active{transform:scale(.975)}
.tts-edit-inline-active .tts-generate:disabled{opacity:.24!important}
.tts-edit-inline-active .tts-generate.tts-edit-loading{opacity:1!important}

@media(max-width:390px){.player-history-row{gap:7px}.tts-edit-button,.history-button{width:48px;height:48px;flex-basis:48px;border-radius:13px}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.tts-inline-edit .dialogue-input-wrap,.tts-edit-inline-active .tts-generate{transition-duration:.01ms!important}}
.wave-fine-tune{width:34px;height:34px;flex:0 0 34px;padding:0;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.7);background:transparent;border:0;transition:transform .2s ease,color .2s ease,background .2s ease,opacity .2s ease}
.wave-fine-tune:active:not(:disabled){transform:scale(.88);color:#fff;background:rgba(255,255,255,.08)}
.wave-fine-tune:disabled{opacity:.18;pointer-events:none}

.tts-audio-editor{width:100%;max-height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(10px) scale(.985);border:1px solid transparent;border-radius:18px;background:rgba(255,255,255,0);padding:0 12px;pointer-events:none;transition:max-height .5s cubic-bezier(.16,1,.3,1),margin .42s cubic-bezier(.16,1,.3,1),padding .42s cubic-bezier(.16,1,.3,1),opacity .25s ease,transform .46s cubic-bezier(.16,1,.3,1),background .3s ease,border-color .3s ease}
.tts-audio-editor.open{max-height:280px;margin:9px 0 3px;padding:12px;opacity:1;transform:translateY(0) scale(1);background:rgba(255,255,255,.025);border-color:rgba(255,255,255,.085);pointer-events:auto}
.tts-audio-editor.loading{pointer-events:none;opacity:.62}
.tts-audio-editor-head{height:32px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:9px}
.tts-audio-editor-head>div{min-width:0;display:flex;align-items:baseline;gap:9px}
.tts-audio-editor-head strong{font-size:12px;line-height:1;font-weight:760;letter-spacing:-.015em;color:#fff}
.tts-audio-editor-head span{font-size:9.5px;line-height:1;font-weight:620;color:rgba(255,255,255,.38);font-variant-numeric:tabular-nums}
.tts-audio-editor-head>button{width:30px;height:30px;flex:0 0 30px;margin-top:-6px;margin-right:-5px;padding:0;border:0;border-radius:10px;display:grid;place-items:center;color:rgba(255,255,255,.55);background:transparent;transition:transform .2s ease,color .2s ease,background .2s ease}
.tts-audio-editor-head>button:active{transform:scale(.88);color:#fff;background:rgba(255,255,255,.07)}

.tts-audio-timeline{position:relative;width:100%;height:104px;overflow:hidden;border-radius:15px;background:#090909;border:1px solid rgba(255,255,255,.075);touch-action:none;user-select:none;-webkit-user-select:none}
.tts-audio-timeline canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.tts-audio-selection{position:absolute;top:8px;bottom:8px;left:0;width:100%;border-top:1px solid rgba(255,255,255,.19);border-bottom:1px solid rgba(255,255,255,.19);background:rgba(255,255,255,.025);pointer-events:none}
.tts-audio-handle{position:absolute;top:0;bottom:0;width:30px;height:100%;margin-left:0;padding:0;border:0;border-radius:0;background:transparent;touch-action:none;cursor:ew-resize}
.tts-audio-handle i{position:absolute;top:10px;bottom:10px;left:50%;width:2px;margin-left:-1px;border-radius:99px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 12px rgba(255,255,255,.16)}
.tts-audio-handle i::before{content:"";position:absolute;top:-1px;left:50%;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.tts-audio-handle.start{left:0}.tts-audio-handle.start i{left:0}.tts-audio-handle.end{left:100%;margin-left:-30px}.tts-audio-handle.end i{left:100%}
.tts-audio-handle.dragging i{width:3px;margin-left:-1.5px}
.tts-audio-editor-actions{min-height:48px;display:flex;align-items:flex-end;justify-content:space-between;gap:9px;padding-top:10px}
.tts-audio-editor-tools,.tts-audio-editor-operations{display:flex;align-items:center;gap:7px}
.tts-audio-editor-actions button{height:38px;padding:0 13px;border-radius:12px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);color:rgba(255,255,255,.76);font-size:10.5px;font-weight:700;transition:transform .2s ease,background .2s ease,color .2s ease,opacity .2s ease,border-color .2s ease}
.tts-audio-editor-actions button:active:not(:disabled){transform:scale(.92);background:rgba(255,255,255,.1);color:#fff}
.tts-audio-editor-actions button:disabled{opacity:.2;pointer-events:none}
.tts-audio-editor-tools button{width:38px;padding:0;display:grid;place-items:center}
.tts-audio-editor-tools svg{width:17px;height:17px}
.tts-audio-previewing .tts-audio-editor-tools .play{display:none}
.tts-audio-editor-tools .pause{display:none}
.tts-audio-previewing .tts-audio-editor-tools .pause{display:block}
.tts-audio-editor-operations .primary{min-width:66px;background:#fff;border-color:#fff;color:#070707;box-shadow:0 8px 22px rgba(255,255,255,.08)}
.tts-audio-editor.busy .tts-audio-editor-operations .primary{color:transparent;position:relative}
.tts-audio-editor.busy .tts-audio-editor-operations .primary::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border:2px solid rgba(0,0,0,.2);border-top-color:#080808;border-radius:50%;animation:ttsAudioEditorSpin .7s linear infinite}

.tts-audio-editor-active #wavePlay,.tts-audio-editor-active #waveShare,.tts-audio-editor-active #ttsEditButton,.tts-audio-editor-active #historyButton,.tts-audio-editor-active .tts-generate-row{opacity:.28;pointer-events:none;transition:opacity .22s ease}

@keyframes ttsAudioEditorSpin{to{transform:rotate(360deg)}}
@media(max-width:390px){.wave-fine-tune{width:30px;height:30px;flex-basis:30px}.tts-audio-editor.open{padding:10px}.tts-audio-timeline{height:96px}.tts-audio-editor-actions button{height:36px;padding:0 10px}.tts-audio-editor-operations{gap:5px}}
@media(prefers-reduced-motion:reduce){.wave-fine-tune,.tts-audio-editor,.tts-audio-editor-head>button,.tts-audio-editor-actions button{transition-duration:.01ms!important}}

`;
