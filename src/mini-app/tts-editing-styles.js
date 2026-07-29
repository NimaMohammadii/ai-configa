export const TTS_EDITING_CSS = `
.tts-edit-button{position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:14px;display:grid;place-items:center;padding:0;color:rgba(255,255,255,.28);background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);opacity:.48;cursor:default;transition:transform .28s cubic-bezier(.2,.9,.2,1),color .24s ease,background .24s ease,border-color .24s ease,box-shadow .24s ease,opacity .24s ease}
.tts-edit-button svg{transition:transform .36s cubic-bezier(.2,.9,.2,1)}
.tts-edit-button.is-ready{color:rgba(255,255,255,.86);background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:1;cursor:pointer}
.tts-edit-button.is-ready:active{transform:scale(.9)}
.tts-edit-button:disabled{pointer-events:none}

.tts-edit-button.active{color:#fff;background:#bd4cff;border-color:#cb70ff;box-shadow:0 0 0 1px rgba(197,91,255,.26),0 10px 30px rgba(184,62,255,.24);opacity:1;transform:scale(.96)}
.tts-edit-button.active svg{transform:rotate(-7deg) scale(1.04)}

.tts-inline-edit .dialogue-input-wrap{background:rgba(190,73,255,.1)!important;border-color:#c653ff!important;box-shadow:0 0 0 2px rgba(198,83,255,.68),0 0 32px rgba(181,55,255,.2),inset 0 1px 0 rgba(221,153,255,.18)!important;animation:ttsInlineEditIn .46s cubic-bezier(.16,1,.3,1) both;transition:background .28s ease,border-color .28s ease,box-shadow .36s ease,transform .36s cubic-bezier(.16,1,.3,1)}
.tts-inline-edit .dialogue-text{caret-color:#cf72ff}
.tts-inline-edit .dialogue-text::selection{background:#c14fff;color:#fff}
.tts-inline-edit .dialogue-text::-moz-selection{background:#c14fff;color:#fff}

.tts-edit-inline-active .tts-generate{background:#b93fff!important;border-color:#ca68ff!important;color:#fff!important;box-shadow:0 12px 32px rgba(179,49,255,.22)!important;transition:transform .24s cubic-bezier(.2,.9,.2,1),opacity .22s ease,background .24s ease,box-shadow .28s ease}
.tts-edit-inline-active .tts-generate:not(:disabled):active{transform:scale(.975)}
.tts-edit-inline-active .tts-generate:disabled{opacity:.24!important;box-shadow:none!important}
.tts-edit-inline-active .tts-generate.tts-edit-loading{opacity:1!important}
.tts-edit-inline-active .add-speaker,.tts-edit-inline-active .dialogue-speaker-row,.tts-edit-inline-active .tts-enhance{pointer-events:none;opacity:.3;transition:opacity .22s ease}

@keyframes ttsInlineEditIn{0%{transform:scale(.987);box-shadow:0 0 0 0 rgba(198,83,255,0),0 0 0 rgba(181,55,255,0)}100%{transform:scale(1);box-shadow:0 0 0 2px rgba(198,83,255,.68),0 0 32px rgba(181,55,255,.2),inset 0 1px 0 rgba(221,153,255,.18)}}
@media(max-width:390px){.player-history-row{gap:7px}.tts-edit-button,.history-button{width:48px;height:48px;flex-basis:48px;border-radius:13px}}
@media(prefers-reduced-motion:reduce){.tts-edit-button,.tts-inline-edit .dialogue-input-wrap,.tts-edit-inline-active .tts-generate{transition-duration:.01ms!important;animation:none!important}}
`;
