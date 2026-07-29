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
.wave-fine-tune{width:34px;height:34px;flex:0 0 34px;padding:0;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.7);background:transparent;border:0;transition:transform .22s cubic-bezier(.2,.9,.2,1),color .2s ease,background .2s ease,opacity .2s ease}
.wave-fine-tune:active:not(:disabled){transform:scale(.86);color:#fff;background:rgba(255,255,255,.08)}
.wave-fine-tune:disabled{opacity:.18;pointer-events:none}

.tts-audio-editor{width:100%;max-height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(8px) scale(.99);border:1px solid transparent;border-radius:17px;background:transparent;padding:0 11px;pointer-events:none;transition:max-height .48s cubic-bezier(.16,1,.3,1),margin .4s cubic-bezier(.16,1,.3,1),padding .4s cubic-bezier(.16,1,.3,1),opacity .24s ease,transform .44s cubic-bezier(.16,1,.3,1),background .28s ease,border-color .28s ease}
.tts-audio-editor.open{max-height:230px;margin:8px 0 2px;padding:10px 11px 11px;opacity:1;transform:translateY(0) scale(1);background:rgba(255,255,255,.022);border-color:rgba(255,255,255,.08);pointer-events:auto}
.tts-audio-editor.loading{pointer-events:none;opacity:.58}
.tts-audio-editor-head{height:28px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:7px}
.tts-audio-editor-head>div{min-width:0;display:flex;align-items:baseline;gap:8px}
.tts-audio-editor-head strong{font-size:11.5px;line-height:1;font-weight:760;letter-spacing:-.015em;color:#fff}
.tts-audio-editor-head span{font-size:9px;line-height:1;font-weight:650;color:rgba(255,255,255,.42);font-variant-numeric:tabular-nums}
.tts-audio-editor-head>button{width:28px;height:28px;flex:0 0 28px;margin-top:-6px;margin-right:-5px;padding:0;border:0;border-radius:9px;display:grid;place-items:center;color:rgba(255,255,255,.55);background:transparent;transition:transform .2s ease,color .2s ease,background .2s ease}
.tts-audio-editor-head>button:active{transform:scale(.86);color:#fff;background:rgba(255,255,255,.07)}

.tts-audio-timeline{position:relative;width:100%;height:72px;overflow-x:auto;overflow-y:hidden;border-radius:13px;background:#080808;border:1px solid rgba(255,255,255,.08);touch-action:none;user-select:none;-webkit-user-select:none;scrollbar-width:none}
.tts-audio-timeline::-webkit-scrollbar{display:none}
.tts-audio-clip-lane{position:relative;display:flex;align-items:stretch;gap:4px;width:max-content;min-width:100%;height:100%;padding:5px}
.tts-audio-clip{position:relative;flex-grow:1;flex-shrink:1;min-width:52px;height:60px;overflow:hidden;border-radius:9px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);touch-action:none;transition:transform .24s cubic-bezier(.2,.9,.2,1),border-color .2s ease,background .2s ease,opacity .2s ease,box-shadow .2s ease}
.tts-audio-clip canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.tts-audio-clip::after{content:"";position:absolute;right:6px;top:6px;width:3px;height:12px;border-radius:3px;background:linear-gradient(to bottom,rgba(255,255,255,.38) 0 16%,transparent 16% 34%,rgba(255,255,255,.38) 34% 50%,transparent 50% 68%,rgba(255,255,255,.38) 68% 84%,transparent 84%);opacity:.5;pointer-events:none}
.tts-audio-clip.active{background:rgba(255,255,255,.065);border-color:rgba(255,255,255,.42);box-shadow:0 0 0 1px rgba(255,255,255,.05),inset 0 1px 0 rgba(255,255,255,.09)}
.tts-audio-clip.dragging{opacity:.78;transform:scale(.965) translateY(-2px);border-color:#fff;box-shadow:0 7px 18px rgba(0,0,0,.42);z-index:7}
.tts-audio-selection{position:absolute;top:0;bottom:0;left:0;width:100%;border-top:1px solid rgba(255,255,255,.46);border-bottom:1px solid rgba(255,255,255,.46);background:rgba(255,255,255,.075);pointer-events:none}
.tts-audio-selection::before{content:"";position:absolute;inset:4px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.tts-audio-handle{position:absolute;top:0;bottom:0;width:28px;height:100%;padding:0;border:0;background:transparent;touch-action:none;cursor:ew-resize;z-index:5}
.tts-audio-handle i{position:absolute;top:7px;bottom:7px;width:6px;border-radius:6px;background:#fff;box-shadow:0 2px 9px rgba(0,0,0,.55)}
.tts-audio-handle i::before,.tts-audio-handle i::after{content:"";position:absolute;left:2px;width:2px;height:2px;border-radius:50%;background:#333}
.tts-audio-handle i::before{top:20px}.tts-audio-handle i::after{top:25px}
.tts-audio-handle.start{left:0}.tts-audio-handle.start i{left:0}.tts-audio-handle.end{right:auto;left:100%;transform:translateX(-100%)}.tts-audio-handle.end i{right:0}
.tts-audio-handle.dragging i{width:7px;background:#fff;box-shadow:0 2px 13px rgba(255,255,255,.23)}
.tts-audio-playhead{position:absolute;top:4px;bottom:4px;left:5px;width:1.5px;background:#fff;border-radius:2px;opacity:0;z-index:9;pointer-events:none;transform:translateX(-50%)}
.tts-audio-playhead i{position:absolute;top:-1px;left:50%;width:7px;height:7px;margin-left:-3.5px;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(0,0,0,.45)}
.tts-audio-previewing .tts-audio-playhead{opacity:1}
.tts-audio-timeline-meta{height:20px;display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding:0 2px;color:rgba(255,255,255,.3)}
.tts-audio-timeline-meta span,.tts-audio-timeline-meta strong{font-size:8.5px;line-height:1;font-weight:620}
.tts-audio-timeline-meta strong{color:rgba(255,255,255,.46);font-variant-numeric:tabular-nums}
.tts-audio-editor-actions{min-height:42px;display:flex;align-items:flex-end;justify-content:space-between;gap:7px;padding-top:6px}
.tts-audio-editor-tools,.tts-audio-editor-operations{display:flex;align-items:center;gap:5px}
.tts-audio-editor-actions button{height:34px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:rgba(255,255,255,.73);font-size:9.5px;font-weight:720;transition:transform .2s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,opacity .2s ease,border-color .2s ease}
.tts-audio-editor-actions button:active:not(:disabled){transform:scale(.9);background:rgba(255,255,255,.1);color:#fff}
.tts-audio-editor-actions button:disabled{opacity:.18;pointer-events:none}
.tts-audio-editor-tools button{width:34px;padding:0;display:grid;place-items:center}
.tts-audio-editor-tools svg{width:16px;height:16px}
.tts-audio-previewing .tts-audio-editor-tools .play{display:none}
.tts-audio-editor-tools .pause{display:none}
.tts-audio-previewing .tts-audio-editor-tools .pause{display:block}
.tts-audio-editor-operations .primary{min-width:52px;background:#fff;border-color:#fff;color:#070707;box-shadow:0 7px 20px rgba(255,255,255,.07)}
.tts-audio-editor.busy .tts-audio-editor-operations .primary{color:transparent;position:relative}
.tts-audio-editor.busy .tts-audio-editor-operations .primary::after{content:"";position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border:2px solid rgba(0,0,0,.2);border-top-color:#080808;border-radius:50%;animation:ttsAudioEditorSpin .7s linear infinite}

.tts-audio-editor-active #wavePlay,.tts-audio-editor-active #waveShare,.tts-audio-editor-active #ttsEditButton,.tts-audio-editor-active #historyButton,.tts-audio-editor-active .tts-generate-row{opacity:.28;pointer-events:none;transition:opacity .22s ease}

@keyframes ttsAudioEditorSpin{to{transform:rotate(360deg)}}
@keyframes ttsClipIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
.tts-audio-clip.entering{animation:ttsClipIn .3s cubic-bezier(.16,1,.3,1)}
@media(max-width:390px){.wave-fine-tune{width:30px;height:30px;flex-basis:30px}.tts-audio-editor.open{padding:9px}.tts-audio-editor-actions{gap:5px}.tts-audio-editor-actions button{height:33px;padding:0 7px;font-size:9px}.tts-audio-editor-tools button{width:32px}.tts-audio-editor-operations{gap:4px}}
@media(prefers-reduced-motion:reduce){.wave-fine-tune,.tts-audio-editor,.tts-audio-editor-head>button,.tts-audio-editor-actions button,.tts-audio-clip{transition-duration:.01ms!important}.tts-audio-clip.entering{animation:none}}

`;
