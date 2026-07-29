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
.tts-inline-edit .dialogue-input-wrap{padding:0;margin:0}
.tts-inline-edit .dialogue-input-wrap::before{content:none}
.tts-inline-edit .dialogue-input-wrap:focus-within::before{content:none}
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
.tts-audio-editor{--audio-accent:#71369c;--audio-accent-soft:rgba(105,47,148,.2);width:100%;max-height:0;margin:0;overflow:hidden;opacity:0;transform:translateY(12px) scale(.985);transform-origin:center bottom;border:0;border-radius:0;background:transparent;padding:0;pointer-events:none;box-shadow:none;transition:max-height .5s cubic-bezier(.16,1,.3,1),opacity .22s ease,transform .46s cubic-bezier(.16,1,.3,1)}
.tts-audio-editor.open{max-height:266px;margin:0;padding:2px 0 0;opacity:1;transform:translateY(0) scale(1);border:0;border-radius:0;background:transparent;box-shadow:none;pointer-events:auto}
.tts-audio-editor.loading{pointer-events:none;opacity:.48}
.tts-audio-editor-head{height:34px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 9px}
.tts-audio-editor-head>div{min-width:0;display:flex;align-items:baseline;gap:8px}
.tts-audio-editor-head strong{color:#fff;font-size:12px;line-height:1;font-weight:800;letter-spacing:-.02em}
.tts-audio-editor-head span{color:rgba(255,255,255,.42);font-size:9px;line-height:1;font-weight:690;font-variant-numeric:tabular-nums}
.tts-audio-editor-head>button{width:32px;height:32px;flex:0 0 32px;margin:0;padding:0;border:0;border-radius:12px;display:grid;place-items:center;color:rgba(255,255,255,.74);background:var(--ticket-glass-bg,rgba(13,13,13,.62));box-shadow:var(--ticket-glass-shadow,inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),0 10px 22px rgba(0,0,0,.22));backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .22s cubic-bezier(.2,.9,.2,1),color .2s ease,background .2s ease,box-shadow .2s ease}
.tts-audio-editor-head>button:active{transform:scale(.84);color:#fff;background:rgba(255,255,255,.105);box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 5px 14px rgba(0,0,0,.2)}

.tts-audio-timeline-shell{position:relative;width:100%;height:44px}
.tts-audio-timeline{position:relative;width:100%;height:44px;overflow-x:auto;overflow-y:hidden;border:0;border-radius:0;background:transparent;touch-action:none;user-select:none;-webkit-user-select:none;scrollbar-width:none;box-shadow:none}
.tts-audio-edge-fade{position:absolute;z-index:30;top:0;bottom:0;width:22px;opacity:0;pointer-events:none;transition:opacity .22s ease}
.tts-audio-edge-fade.start{left:0;background:linear-gradient(90deg,rgba(0,0,0,.72) 0,rgba(0,0,0,.48) 34%,rgba(0,0,0,0) 100%)}
.tts-audio-edge-fade.end{right:0;background:linear-gradient(270deg,rgba(0,0,0,.72) 0,rgba(0,0,0,.48) 34%,rgba(0,0,0,0) 100%)}
.tts-audio-timeline-shell.is-overflowing .tts-audio-edge-fade{opacity:1}
.tts-audio-timeline::-webkit-scrollbar{display:none}
.tts-audio-timeline.is-scroll-mode{cursor:grab}
.tts-audio-timeline.is-scroll-mode.is-panning{cursor:grabbing}
.tts-audio-timeline.is-scroll-mode .tts-audio-clip{cursor:grab}
.tts-audio-timeline.is-scroll-mode.is-panning .tts-audio-clip{cursor:grabbing}
.tts-audio-clip-lane{position:relative;display:flex;align-items:center;gap:0;width:max-content;min-width:100%;height:100%;padding:0}
.tts-audio-clip-lane.has-multiple-clips{gap:5px;padding:3px 0}
.tts-audio-clip-lane:not(.has-multiple-clips) .tts-audio-clip{cursor:default}
.tts-audio-clip{position:relative;flex-grow:1;flex-shrink:1;min-width:52px;height:42px;overflow:hidden;border:0;border-radius:12px;background:transparent;box-shadow:none;touch-action:none;transform-origin:center;will-change:transform;transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .2s ease,background .2s ease,box-shadow .2s ease}
.tts-audio-clip canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 2.5%,#000 97.5%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 2.5%,#000 97.5%,transparent 100%)}
.tts-audio-clip canvas.tts-audio-progress-wave{z-index:2;clip-path:inset(0 100% 0 0);will-change:clip-path}
.tts-audio-clip::after{display:none}
.tts-audio-clip.active{background:transparent;border:0;box-shadow:none}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip{height:36px;border:0;border-radius:10px;background:rgba(255,255,255,.025);box-shadow:inset 0 0 0 1px rgba(255,255,255,.065)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.active{background:rgba(113,54,156,.045);box-shadow:inset 0 0 0 1px rgba(113,54,156,.24)}
.tts-audio-clip-lane.has-multiple-clips .tts-audio-clip.pressed{transform:scale(.965);background:rgba(113,54,156,.08);box-shadow:inset 0 0 0 1px rgba(113,54,156,.42)}
.tts-audio-clip-lane.is-reordering{cursor:grabbing}
.tts-audio-clip-lane.is-reordering .tts-audio-clip:not(.dragging){transition:transform .22s cubic-bezier(.16,1,.3,1),opacity .2s ease}
.tts-audio-clip.dragging{opacity:.98;background:#111!important;box-shadow:0 12px 28px rgba(0,0,0,.5),inset 0 0 0 1px rgba(113,54,156,.55)!important;z-index:20;transition:none!important}
.tts-audio-selection{position:absolute;top:7px;bottom:7px;left:0;width:100%;border:0;border-radius:999px;background:var(--audio-accent-soft);pointer-events:none}
.tts-audio-selection::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(113,54,156,.28);transform:translateY(-50%)}
.tts-audio-handle{position:absolute;top:0;bottom:0;width:28px;height:100%;padding:0;border:0;background:transparent;touch-action:none;cursor:ew-resize;z-index:5}
.tts-audio-handle i{position:absolute;top:8px;bottom:8px;width:4px;border-radius:999px;background:#fff;box-shadow:0 0 0 2px rgba(113,54,156,.13),0 0 12px rgba(113,54,156,.38)}
.tts-audio-handle i::before,.tts-audio-handle i::after{display:none}
.tts-audio-handle.start{left:0}.tts-audio-handle.start i{left:0}.tts-audio-handle.end{right:auto;left:100%;transform:translateX(-100%)}.tts-audio-handle.end i{right:0}
.tts-audio-handle.dragging i{width:5px;background:var(--audio-accent)}
.tts-audio-playhead{position:absolute;top:5px;bottom:5px;left:0;width:2px;background:var(--audio-accent);border-radius:999px;opacity:0;z-index:9;pointer-events:none;transform:translate3d(0,0,0) translateX(-50%);will-change:transform;transition:opacity .16s ease;box-shadow:0 0 9px rgba(113,54,156,.45)}
.tts-audio-playhead i{position:absolute;top:-2px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--audio-accent)}
.tts-audio-previewing .tts-audio-playhead{opacity:1}
.tts-audio-previewing .tts-audio-timeline.is-whole-preview .tts-audio-playhead{opacity:0}

.tts-audio-editor-actions{display:grid;grid-template-columns:1fr;gap:11px;padding-top:12px}
.tts-audio-editor-tools{width:100%;display:grid;grid-template-columns:42px 60px 42px;align-items:center;justify-content:center;gap:14px}
.tts-audio-editor-operations{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(68px,1.16fr);align-items:center;gap:7px}
.tts-audio-editor-actions button{height:38px;padding:0 10px;border-radius:12px;border:0;background:var(--ticket-glass-bg,rgba(13,13,13,.62));box-shadow:var(--ticket-glass-shadow,inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),0 10px 22px rgba(0,0,0,.22));backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);color:rgba(255,255,255,.78);font-size:9.5px;font-weight:760;transition:transform .22s cubic-bezier(.2,.9,.2,1),background .2s ease,color .2s ease,opacity .2s ease,box-shadow .2s ease}
.tts-audio-editor-actions button:active:not(:disabled){transform:scale(.88);background:rgba(255,255,255,.105);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 5px 14px rgba(0,0,0,.2)}
.tts-audio-editor-actions button:disabled{opacity:.18;pointer-events:none}
.tts-audio-editor-tools button{width:42px;height:42px;padding:0;border-radius:15px;display:grid;place-items:center}
.tts-audio-editor-tools #ttsAudioPreview{width:60px;height:60px;border-radius:21px;background:#fff;color:#050505;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.1),0 12px 30px rgba(0,0,0,.28)}
.tts-audio-editor-tools svg{width:18px;height:18px}
.tts-audio-editor-tools #ttsAudioPreview svg{width:27px;height:27px}.tts-audio-editor-tools #ttsAudioPreview .play,.tts-audio-editor-tools #ttsAudioPreview .pause{grid-area:1/1;display:block;transform-origin:center;will-change:opacity,transform;transition:opacity .2s ease,transform .36s cubic-bezier(.16,1,.3,1)}.tts-audio-editor-tools #ttsAudioPreview .play{opacity:1;transform:translateX(1px) scale(1) rotate(0)}.tts-audio-editor-tools #ttsAudioPreview .pause{opacity:0;transform:scale(.72) rotate(-8deg)}
.tts-audio-editor-operations #ttsAudioDelete:not(:disabled){color:rgba(255,118,136,.88);border-color:rgba(255,103,124,.11)}
.tts-audio-editor-operations .primary{background:#fff;color:#050505;font-weight:840;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.1),0 10px 24px rgba(0,0,0,.26)}
.tts-audio-previewing .tts-audio-editor-tools #ttsAudioPreview{background:var(--audio-accent);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.16),0 12px 30px rgba(74,27,104,.3)}
.tts-audio-previewing .tts-audio-editor-tools #ttsAudioPreview .play{opacity:0;transform:translateX(1px) scale(.72) rotate(8deg)}
.tts-audio-previewing .tts-audio-editor-tools #ttsAudioPreview .pause{opacity:1;transform:scale(1) rotate(0)}
.tts-audio-editor.busy .tts-audio-editor-operations .primary{color:transparent;position:relative}
.tts-audio-editor.busy .tts-audio-editor-operations .primary::after{content:"";position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border:2px solid rgba(0,0,0,.2);border-top-color:#09050c;border-radius:50%;animation:ttsAudioEditorSpin .7s linear infinite}
.tts-audio-editor.open .tts-audio-editor-head,.tts-audio-editor.open .tts-audio-timeline,.tts-audio-editor.open .tts-audio-editor-tools,.tts-audio-editor.open .tts-audio-editor-operations{animation:ttsAudioControlIn .42s cubic-bezier(.16,1,.3,1) both}
.tts-audio-editor.open .tts-audio-timeline{animation-delay:.03s}.tts-audio-editor.open .tts-audio-editor-tools{animation-delay:.07s}.tts-audio-editor.open .tts-audio-editor-operations{animation-delay:.11s}
@keyframes ttsAudioControlIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}

@keyframes ttsAudioEditorSpin{to{transform:rotate(360deg)}}
@keyframes ttsClipIn{0%{opacity:.5;transform:scale(.9) translateY(2px)}68%{opacity:1;transform:scale(1.012) translateY(0)}100%{opacity:1;transform:scale(1)}}
.tts-audio-clip.entering{animation:ttsClipIn .34s cubic-bezier(.16,1,.3,1)}
@media(max-width:390px){.tts-audio-editor-actions{gap:9px}.tts-audio-editor-actions button{height:36px;padding:0 6px;font-size:8.8px}.tts-audio-editor-tools{grid-template-columns:40px 56px 40px;gap:11px}.tts-audio-editor-operations{gap:5px}.tts-audio-editor-tools button{width:40px;height:40px}.tts-audio-editor-tools #ttsAudioPreview{width:56px;height:56px}}
@media(prefers-reduced-motion:reduce){.wave-fine-tune,.tts-audio-editor,.tts-audio-editor-head>button,.tts-audio-editor-actions button,.tts-audio-clip{transition-duration:.01ms!important}.tts-audio-clip.entering,.tts-audio-editor.open .tts-audio-editor-head,.tts-audio-editor.open .tts-audio-timeline,.tts-audio-editor.open .tts-audio-editor-tools,.tts-audio-editor.open .tts-audio-editor-operations{animation:none}}

`;
