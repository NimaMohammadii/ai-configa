export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:14px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{transition:transform .3s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.86);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9)}
.tts-edit-button:disabled{pointer-events:none}
.tts-edit-button.active{color:#080808;background:#fff;border-color:#fff;box-shadow:0 9px 26px rgba(255,255,255,.1);opacity:1;transform:scale(.96)}
.tts-edit-button.active svg{transform:rotate(-5deg)}

.tts-inline-edit .dialogue-input-wrap{border-radius:17px!important;background:linear-gradient(180deg,rgba(200,102,255,.075),rgba(200,102,255,.025));box-shadow:inset 0 0 0 1px rgba(200,102,255,.46),inset 0 1px 0 rgba(255,255,255,.055),0 12px 34px rgba(92,24,132,.12)!important;transform:translateZ(0);animation:ttsInlineEditIn .34s cubic-bezier(.16,1,.3,1);transition:background .26s ease,box-shadow .26s ease,transform .26s cubic-bezier(.16,1,.3,1)}
.tts-inline-edit .dialogue-input-wrap:focus-within{background:linear-gradient(180deg,rgba(200,102,255,.105),rgba(200,102,255,.035));box-shadow:inset 0 0 0 1px rgba(211,126,255,.72),inset 0 1px 0 rgba(255,255,255,.075),0 14px 38px rgba(104,28,148,.17)!important}
.tts-inline-edit .dialogue-text{color:#faf6ff!important;caret-color:#da79ff;text-shadow:0 0 18px rgba(200,102,255,.07);transition:color .22s ease,text-shadow .22s ease}
.tts-inline-edit .dialogue-text::selection{background:rgba(200,102,255,.9);color:#fff;text-shadow:none}
.tts-inline-edit .dialogue-text::-moz-selection{background:rgba(200,102,255,.9);color:#fff;text-shadow:none}
@keyframes ttsInlineEditIn{0%{opacity:.72;transform:translateY(3px) scale(.992)}100%{opacity:1;transform:translateY(0) scale(1)}}
.tts-edit-inline-active .add-speaker,.tts-edit-inline-active .dialogue-speaker-row,.tts-edit-inline-active .tts-enhance{pointer-events:none}
.tts-edit-inline-active .tts-generate{transition:transform .24s cubic-bezier(.2,.9,.2,1),opacity .22s ease}
.tts-edit-inline-active .tts-generate:not(:disabled):active{transform:scale(.975)}
.tts-edit-inline-active .tts-generate:disabled{opacity:.24!important}
.tts-edit-inline-active .tts-generate.tts-edit-loading{opacity:1!important}

@media(max-width:390px){.player-history-row{gap:7px}.tts-edit-button,.history-button{width:48px;height:48px;flex-basis:48px;border-radius:13px}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.tts-inline-edit .dialogue-input-wrap,.tts-edit-inline-active .tts-generate{transition-duration:.01ms!important}.tts-inline-edit .dialogue-input-wrap{animation:none!important}}
.wave-fine-tune{width:34px;height:34px;flex:0 0 34px;padding:0;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.82);background:rgba(255,255,255,.055);border:0;transition:transform .22s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,opacity .2s ease}
.wave-fine-tune:active:not(:disabled){transform:scale(.86);color:#000;background:#fff}
.wave-fine-tune:disabled{opacity:.2;pointer-events:none}

.tts-audio-editor{width:100%;max-height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(8px) scale(.99);border:0;border-radius:0;background:#000;padding:0 10px;pointer-events:none;transition:max-height .48s cubic-bezier(.16,1,.3,1),margin .4s cubic-bezier(.16,1,.3,1),padding .4s cubic-bezier(.16,1,.3,1),opacity .24s ease,transform .44s cubic-bezier(.16,1,.3,1)}
.tts-audio-editor.open{max-height:205px;margin:7px 0 2px;padding:9px 10px 10px;opacity:1;transform:translateY(0) scale(1);background:rgba(255,255,255,.018);pointer-events:auto}
.tts-audio-editor.loading{pointer-events:none;opacity:.55}
.tts-audio-editor-head{height:27px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px}
.tts-audio-editor-head>div{min-width:0;display:flex;align-items:baseline;gap:8px}
.tts-audio-editor-head strong{color:#fff}.tts-audio-editor-head span{color:rgba(255,255,255,.48)}
.tts-audio-editor-head strong{font-size:11.5px;line-height:1;font-weight:760;letter-spacing:-.015em}
.tts-audio-editor-head span{font-size:9px;line-height:1;font-weight:650;font-variant-numeric:tabular-nums}
.tts-audio-editor-head>button{width:28px;height:28px;flex:0 0 28px;margin-top:-6px;margin-right:-5px;padding:0;border:0;border-radius:9px;display:grid;place-items:center;color:rgba(255,255,255,.68);background:rgba(255,255,255,.045);transition:transform .2s ease,color .2s ease,background .2s ease}
.tts-audio-editor-head>button:active{transform:scale(.86);color:#000;background:#fff}

.tts-audio-timeline{position:relative;width:100%;height:64px;overflow-x:auto;overflow-y:hidden;border:0;border-radius:11px;background:#070707;touch-action:none;user-select:none;-webkit-user-select:none;scrollbar-width:none}
.tts-audio-timeline::-webkit-scrollbar{display:none}
.tts-audio-clip-lane{position:relative;display:flex;align-items:stretch;gap:0;width:max-content;min-width:100%;height:100%;padding:0}
.tts-audio-clip-lane.has-multiple-clips{align-items:center;gap:6px;padding:4px}
.tts-audio-clip{position:relative;flex-grow:1;flex-shrink:1;min-width:52px;height:64px;overflow:hidden;border:0;border-radius:0;background:transparent;box-shadow:none;touch-action:none;transform-origin:center;will-change:transform;transition:transform .26s cubic-bezier(.16,1,.3,1),opacity .2s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease}
.tts-audio-clip canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;pointer-events:none}
.tts-audio-clip::after{display:none}
.tts-audio-clip.active{background:transparent;border:0;box-shadow:none}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip{height:56px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:#090909;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.active{border-color:rgba(255,255,255,.46);background:#0c0c0c;box-shadow:inset 0 1px 0 rgba(255,255,255,.055)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.pressed{transform:scale(.965);border-color:rgba(255,255,255,.68);background:#101010;box-shadow:0 5px 15px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.07)}
.tts-audio-clip-lane.is-reordering{cursor:grabbing}
.tts-audio-clip-lane.is-reordering .tts-audio-clip:not(.dragging){transition:transform .22s cubic-bezier(.16,1,.3,1),opacity .2s ease}
.tts-audio-clip.dragging{opacity:.98;background:#111!important;border-color:rgba(255,255,255,.72)!important;box-shadow:0 12px 28px rgba(0,0,0,.56),inset 0 1px 0 rgba(255,255,255,.09)!important;z-index:20;transition:none!important}
.tts-audio-selection{position:absolute;top:4px;bottom:4px;left:0;width:100%;border:0;border-radius:8px;background:rgba(255,255,255,.1);pointer-events:none}
.tts-audio-selection::before{display:none}
.tts-audio-handle{position:absolute;top:0;bottom:0;width:30px;height:100%;padding:0;border:0;background:transparent;touch-action:none;cursor:ew-resize;z-index:5}
.tts-audio-handle i{position:absolute;top:5px;bottom:5px;width:7px;border-radius:7px;background:#fff;box-shadow:0 2px 9px rgba(0,0,0,.72)}
.tts-audio-handle i::before,.tts-audio-handle i::after{content:"";position:absolute;left:2px;width:3px;height:3px;border-radius:50%;background:#4b4b4b}
.tts-audio-handle i::before{top:21px}.tts-audio-handle i::after{top:27px}
.tts-audio-handle.start{left:0}.tts-audio-handle.start i{left:0}.tts-audio-handle.end{right:auto;left:100%;transform:translateX(-100%)}.tts-audio-handle.end i{right:0}
.tts-audio-handle.dragging i{width:8px;background:#fff}
.tts-audio-playhead{position:absolute;top:0;bottom:0;left:0;width:2px;background:#fff;border-radius:2px;opacity:0;z-index:9;pointer-events:none;transform:translateX(-50%)}
.tts-audio-playhead i{position:absolute;top:0;left:50%;width:7px;height:7px;margin-left:-3.5px;border-radius:50%;background:#fff;box-shadow:none}
.tts-audio-previewing .tts-audio-playhead{opacity:1}
.tts-audio-editor-actions{min-height:42px;display:flex;align-items:flex-end;justify-content:space-between;gap:7px;padding-top:8px}
.tts-audio-editor-tools,.tts-audio-editor-operations{display:flex;align-items:center;gap:5px}
.tts-audio-editor-actions button{height:34px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.085);background:rgba(255,255,255,.065);color:rgba(255,255,255,.82);font-size:9.5px;font-weight:720;transition:transform .2s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,opacity .2s ease,border-color .2s ease}
.tts-audio-editor-actions button:active:not(:disabled){transform:scale(.9);background:#fff;color:#000}
.tts-audio-editor-actions button:disabled{opacity:.23;pointer-events:none}
.tts-audio-editor-tools button{width:34px;padding:0;display:grid;place-items:center}
.tts-audio-editor-tools svg{width:16px;height:16px}
.tts-audio-previewing .tts-audio-editor-tools .play{display:none}
.tts-audio-editor-tools .pause{display:none}
.tts-audio-previewing .tts-audio-editor-tools .pause{display:block}
.tts-audio-editor-operations .primary{min-width:52px;background:#fff;border-color:#fff;color:#000}
.tts-audio-editor.busy .tts-audio-editor-operations .primary{color:transparent;position:relative}
.tts-audio-editor.busy .tts-audio-editor-operations .primary::after{content:"";position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border:2px solid #000;border-top-color:#fff;border-radius:50%;animation:ttsAudioEditorSpin .7s linear infinite}

.tts-audio-editor-active #wavePlay,.tts-audio-editor-active #waveShare,.tts-audio-editor-active #ttsEditButton,.tts-audio-editor-active #historyButton,.tts-audio-editor-active .tts-generate-row{opacity:.28;pointer-events:none;transition:opacity .22s ease}

@keyframes ttsAudioEditorSpin{to{transform:rotate(360deg)}}
@keyframes ttsClipIn{0%{opacity:.5;transform:scale(.9) translateY(2px)}68%{opacity:1;transform:scale(1.012) translateY(0)}100%{opacity:1;transform:scale(1)}}
.tts-audio-clip.entering{animation:ttsClipIn .34s cubic-bezier(.16,1,.3,1)}
@media(max-width:390px){.wave-fine-tune{width:30px;height:30px;flex-basis:30px}.tts-audio-editor.open{padding:8px}.tts-audio-editor-actions{gap:5px}.tts-audio-editor-actions button{height:33px;padding:0 7px;font-size:9px}.tts-audio-editor-tools button{width:32px}.tts-audio-editor-operations{gap:4px}}
@media(prefers-reduced-motion:reduce){.wave-fine-tune,.tts-audio-editor,.tts-audio-editor-head>button,.tts-audio-editor-actions button,.tts-audio-clip{transition-duration:.01ms!important}.tts-audio-clip.entering{animation:none}}

`;
