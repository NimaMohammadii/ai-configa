export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:32px;height:32px;flex:0 0 32px;border-radius:10px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{width:19px;height:19px;transition:transform .3s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.86);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9)}
.tts-edit-button:disabled{pointer-events:none}
.tts-edit-button.active{color:#080808;background:#fff;border-color:#fff;box-shadow:0 9px 26px rgba(255,255,255,.1);opacity:1;transform:scale(.96)}
.tts-edit-button.active svg{transform:rotate(-5deg)}

.dialogue-editor .dialogue-input-wrap{position:relative;isolation:isolate;min-height:102px;padding:0;margin:0;border-radius:17px!important;background:transparent;box-shadow:none!important;transform:translateZ(0);transition:min-height .3s cubic-bezier(.22,1,.36,1),padding .3s cubic-bezier(.22,1,.36,1),margin .3s cubic-bezier(.22,1,.36,1)}
.dialogue-editor .dialogue-input-wrap::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-radius:inherit;opacity:0;transform:translateZ(0) scale(.985);background:linear-gradient(180deg,rgba(200,102,255,.075),rgba(200,102,255,.025));box-shadow:inset 0 0 0 1px rgba(200,102,255,.46),inset 0 1px 0 rgba(255,255,255,.055),0 12px 34px rgba(92,24,132,.12);transition:opacity .2s ease,transform .3s cubic-bezier(.22,1,.36,1);will-change:opacity,transform}
.dialogue-editor .dialogue-text{position:relative;z-index:1}
.tts-inline-edit .dialogue-input-wrap{min-height:122px;padding:10px 12px 9px;margin:2px 0 4px}
.tts-inline-edit .dialogue-input-wrap::before{opacity:1;transform:translateZ(0) scale(1)}
.tts-inline-edit .dialogue-input-wrap:focus-within::before{background:linear-gradient(180deg,rgba(200,102,255,.105),rgba(200,102,255,.035));box-shadow:inset 0 0 0 1px rgba(211,126,255,.72),inset 0 1px 0 rgba(255,255,255,.075),0 14px 38px rgba(104,28,148,.17)}
.tts-inline-edit .dialogue-text{color:#faf6ff!important;caret-color:#da79ff;text-shadow:0 0 18px rgba(200,102,255,.07);transition:color .22s ease,text-shadow .22s ease}
.tts-inline-edit .dialogue-text::selection{background:rgba(200,102,255,.9);color:#fff;text-shadow:none}
.tts-inline-edit .dialogue-text::-moz-selection{background:rgba(200,102,255,.9);color:#fff;text-shadow:none}
.tts-edit-inline-active .add-speaker,.tts-edit-inline-active .dialogue-speaker-row,.tts-edit-inline-active .tts-enhance{pointer-events:none}
.tts-edit-inline-active .tts-generate{transition:transform .24s cubic-bezier(.2,.9,.2,1),opacity .22s ease}
.tts-edit-inline-active .tts-generate:not(:disabled):active{transform:scale(.975)}
.tts-edit-inline-active .tts-generate:disabled{opacity:.24!important}
.tts-edit-inline-active .tts-generate.tts-edit-loading{opacity:1!important}

@media(max-width:390px){.player-history-row{gap:7px}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.dialogue-editor .dialogue-input-wrap,.dialogue-editor .dialogue-input-wrap::before,.tts-edit-inline-active .tts-generate{transition-duration:.01ms!important}}
.wave-fine-tune{width:32px;height:32px;flex:0 0 32px;padding:0;border-radius:10px;display:grid;place-items:center;color:rgba(255,255,255,.86);background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);transition:transform .22s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,border-color .2s ease,opacity .2s ease}
.wave-fine-tune:active:not(:disabled){transform:scale(.86);color:#fff;background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.14)}
.wave-fine-tune:disabled{opacity:.2;pointer-events:none}

.player-history-row,.tts-generate-row{max-height:110px;opacity:1;overflow:visible;transform:translateY(0) scale(1);transform-origin:center bottom;transition:max-height .42s cubic-bezier(.16,1,.3,1),min-height .42s cubic-bezier(.16,1,.3,1),opacity .2s ease,transform .36s cubic-bezier(.16,1,.3,1),margin .36s cubic-bezier(.16,1,.3,1)}
.tts-audio-editor-active .tts-bottom{gap:0!important}
.tts-audio-editor-active .player-history-row,.tts-audio-editor-active .tts-generate-row{max-height:0!important;min-height:0!important;margin:0!important;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(10px) scale(.975);pointer-events:none}
.tts-audio-editor{width:100%;max-height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(14px) scale(.975);transform-origin:center bottom;border:1px solid transparent;border-radius:22px;background:rgba(9,9,9,0);padding:0 13px;pointer-events:none;box-shadow:0 0 0 rgba(0,0,0,0);transition:max-height .5s cubic-bezier(.16,1,.3,1),margin .4s cubic-bezier(.16,1,.3,1),padding .4s cubic-bezier(.16,1,.3,1),opacity .24s ease,transform .46s cubic-bezier(.16,1,.3,1),border-color .3s ease,background .3s ease,box-shadow .4s ease}
.tts-audio-editor.open{max-height:286px;margin:0;padding:13px;opacity:1;transform:translateY(0) scale(1);border-color:rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(17,17,17,.98),rgba(7,7,7,.99));box-shadow:0 18px 48px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.045);pointer-events:auto}
.tts-audio-editor.loading{pointer-events:none;opacity:.5}
.tts-audio-editor-head{height:30px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px}
.tts-audio-editor-head>div{min-width:0;display:flex;align-items:baseline;gap:8px}
.tts-audio-editor-head strong{color:#fff;font-size:12px;line-height:1;font-weight:790;letter-spacing:-.02em}
.tts-audio-editor-head span{color:rgba(255,255,255,.42);font-size:9px;line-height:1;font-weight:680;font-variant-numeric:tabular-nums}
.tts-audio-editor-head>button{width:30px;height:30px;flex:0 0 30px;margin-top:-4px;margin-right:-3px;padding:0;border:1px solid rgba(255,255,255,.075);border-radius:10px;display:grid;place-items:center;color:rgba(255,255,255,.66);background:rgba(255,255,255,.045);transition:transform .22s cubic-bezier(.2,.9,.2,1),color .2s ease,background .2s ease,border-color .2s ease}
.tts-audio-editor-head>button:active{transform:scale(.86);color:#000;background:#fff;border-color:#fff}

.tts-audio-timeline{position:relative;width:100%;height:46px;overflow-x:auto;overflow-y:hidden;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:#050505;touch-action:none;user-select:none;-webkit-user-select:none;scrollbar-width:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
.tts-audio-timeline::-webkit-scrollbar{display:none}
.tts-audio-timeline.is-scroll-mode{cursor:grab}
.tts-audio-timeline.is-scroll-mode.is-panning{cursor:grabbing}
.tts-audio-timeline.is-scroll-mode .tts-audio-clip{cursor:grab}
.tts-audio-timeline.is-scroll-mode.is-panning .tts-audio-clip{cursor:grabbing}
.tts-audio-clip-lane{position:relative;display:flex;align-items:center;gap:0;width:max-content;min-width:100%;height:100%;padding:0}
.tts-audio-clip-lane.has-multiple-clips{gap:5px;padding:4px}
.tts-audio-clip-lane:not(.has-multiple-clips) .tts-audio-clip{cursor:default}
.tts-audio-clip{position:relative;flex-grow:1;flex-shrink:1;min-width:52px;height:44px;overflow:hidden;border:0;border-radius:0;background:transparent;box-shadow:none;touch-action:none;transform-origin:center;will-change:transform;transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .2s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease}
.tts-audio-clip canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;pointer-events:none}
.tts-audio-clip::after{display:none}
.tts-audio-clip.active{background:transparent;border:0;box-shadow:none}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip{height:36px;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:#090909;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.active{border-color:rgba(255,255,255,.34);background:#0c0c0c;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.pressed{transform:scale(.965);border-color:rgba(255,255,255,.56);background:#101010;box-shadow:0 5px 15px rgba(0,0,0,.34)}
.tts-audio-clip-lane.is-reordering{cursor:grabbing}
.tts-audio-clip-lane.is-reordering .tts-audio-clip:not(.dragging){transition:transform .22s cubic-bezier(.16,1,.3,1),opacity .2s ease}
.tts-audio-clip.dragging{opacity:.98;background:#111!important;border-color:rgba(255,255,255,.64)!important;box-shadow:0 12px 28px rgba(0,0,0,.56)!important;z-index:20;transition:none!important}
.tts-audio-selection{position:absolute;top:5px;bottom:5px;left:0;width:100%;border:0;border-radius:8px;background:rgba(255,255,255,.055);pointer-events:none}
.tts-audio-selection::before{display:none}
.tts-audio-handle{position:absolute;top:0;bottom:0;width:28px;height:100%;padding:0;border:0;background:transparent;touch-action:none;cursor:ew-resize;z-index:5}
.tts-audio-handle i{position:absolute;top:7px;bottom:7px;width:4px;border-radius:999px;background:#fff;box-shadow:0 0 9px rgba(255,255,255,.28),0 2px 8px rgba(0,0,0,.72)}
.tts-audio-handle i::before,.tts-audio-handle i::after{display:none}
.tts-audio-handle.start{left:0}.tts-audio-handle.start i{left:2px}.tts-audio-handle.end{right:auto;left:100%;transform:translateX(-100%)}.tts-audio-handle.end i{right:2px}
.tts-audio-handle.dragging i{width:5px}
.tts-audio-playhead{position:absolute;top:3px;bottom:3px;left:0;width:2px;background:#fff;border-radius:999px;opacity:0;z-index:9;pointer-events:none;transform:translate3d(0,0,0) translateX(-50%);will-change:transform;transition:opacity .16s ease}
.tts-audio-playhead i{position:absolute;top:-1px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.3)}
.tts-audio-previewing .tts-audio-playhead{opacity:1}

.tts-audio-editor-actions{display:grid;grid-template-columns:1fr;gap:10px;padding-top:11px}
.tts-audio-editor-tools{width:100%;display:flex;align-items:center;justify-content:center;gap:9px}
.tts-audio-editor-operations{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(66px,1.16fr);align-items:center;gap:6px}
.tts-audio-editor-actions button{height:38px;padding:0 10px;border-radius:12px;border:1px solid rgba(255,255,255,.085);background:rgba(255,255,255,.05);color:rgba(255,255,255,.76);font-size:9.5px;font-weight:740;transition:transform .22s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,opacity .2s ease,border-color .2s ease,box-shadow .2s ease}
.tts-audio-editor-actions button:active:not(:disabled){transform:scale(.9);background:#fff;color:#000;border-color:#fff}
.tts-audio-editor-actions button:disabled{opacity:.2;pointer-events:none}
.tts-audio-editor-tools button{width:40px;height:40px;padding:0;border-radius:50%;display:grid;place-items:center}
.tts-audio-editor-tools button:first-child{width:50px;height:50px;border-radius:16px;background:#fff;border-color:#fff;color:#050505;box-shadow:0 8px 24px rgba(255,255,255,.08)}
.tts-audio-editor-tools svg{width:17px;height:17px}
.tts-audio-editor-tools button:first-child svg{width:20px;height:20px}
.tts-audio-previewing .tts-audio-editor-tools .play{display:none}
.tts-audio-editor-tools .pause{display:none}
.tts-audio-previewing .tts-audio-editor-tools .pause{display:block}
.tts-audio-editor-operations .primary{background:#fff;border-color:#fff;color:#050505;font-weight:820}
.tts-audio-editor.busy .tts-audio-editor-operations .primary{color:transparent;position:relative}
.tts-audio-editor.busy .tts-audio-editor-operations .primary::after{content:"";position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border:2px solid #000;border-top-color:#fff;border-radius:50%;animation:ttsAudioEditorSpin .7s linear infinite}

@keyframes ttsAudioEditorSpin{to{transform:rotate(360deg)}}
@keyframes ttsClipIn{0%{opacity:.5;transform:scale(.9) translateY(2px)}68%{opacity:1;transform:scale(1.012) translateY(0)}100%{opacity:1;transform:scale(1)}}
.tts-audio-clip.entering{animation:ttsClipIn .34s cubic-bezier(.16,1,.3,1)}
@media(max-width:390px){.tts-audio-editor.open{padding:11px}.tts-audio-editor-actions{gap:8px}.tts-audio-editor-actions button{height:36px;padding:0 6px;font-size:8.8px}.tts-audio-editor-tools{gap:7px}.tts-audio-editor-operations{gap:5px}.tts-audio-editor-tools button{width:38px;height:38px}.tts-audio-editor-tools button:first-child{width:48px;height:48px}}
@media(prefers-reduced-motion:reduce){.wave-fine-tune,.tts-audio-editor,.tts-audio-editor-head>button,.tts-audio-editor-actions button,.tts-audio-clip{transition-duration:.01ms!important}.tts-audio-clip.entering{animation:none}}

`;
