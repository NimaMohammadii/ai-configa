export const AI_CHAT_CSS = `
:root{color-scheme:dark;--text:#fff;--muted:rgba(255,255,255,.58);--line:rgba(255,255,255,.14);--card:rgba(255,255,255,.055);--font-main:"SF Pro Display","SF Pro Text","Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--font-num:"SF Pro Text","Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-family:var(--font-main);font-feature-settings:"kern" 1,"liga" 1,"calt" 1,"ss01" 1;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--ai-chat-keyboard-offset:0px;--ai-chat-page-height:100dvh}
html,body{margin:0;width:100%;height:var(--ai-chat-page-height);min-height:0;background:#000!important;color:#fff;overflow:hidden;overscroll-behavior:none;font-family:var(--font-main)}
body{position:fixed;inset:0;height:var(--ai-chat-page-height)}
button,textarea{font:inherit;font-family:var(--font-main)}
button{border:0}
.toast{position:fixed;left:50%;right:auto;bottom:calc(20px + env(safe-area-inset-bottom));width:max-content;max-width:min(410px,calc(100vw - 32px));min-height:39px;padding:10px 16px;border:1px solid rgba(255,255,255,.46);border-radius:15px;background:rgba(3,3,3,.96);box-shadow:0 16px 50px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:flex;align-items:center;justify-content:center;z-index:90;color:#fff;font-size:12.5px;font-weight:560;line-height:1.35;letter-spacing:-.012em;text-align:center;white-space:normal;opacity:0;visibility:hidden;transform:translate(-50%,14px) scale(.96);pointer-events:none;transition:opacity .22s ease,transform .3s cubic-bezier(.18,.86,.22,1),visibility 0s linear .3s}.toast.show{opacity:1;visibility:visible;transform:translate(-50%,0) scale(1);transition-delay:0s}
.is-locked{background:#000}.lock-screen{min-height:100vh;display:grid;place-items:center;background:#000;padding:28px}.lock-card{width:min(74vw,420px);text-align:center}.lock-title{margin:0 0 18px;color:#fff;font-size:13px;font-weight:800;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:7px}.lock-title>span:first-child{letter-spacing:.34em}.lock-dots{display:inline-flex;align-items:center;gap:3px;margin-left:-2px}.lock-dots i{display:block;width:3px;height:3px;border-radius:50%;background:#fff;opacity:.25;animation:lockDot 1.05s ease-in-out infinite}.lock-dots i:nth-child(2){animation-delay:.14s}.lock-dots i:nth-child(3){animation-delay:.28s}@keyframes lockDot{0%,70%,100%{opacity:.22;transform:translateY(0) scale(.82)}35%{opacity:1;transform:translateY(-2px) scale(1)}}.lock-bar{direction:ltr;height:4px;border-radius:999px;background:#121212;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 18px 60px rgba(255,255,255,.12)}.lock-bar span{display:block;width:0;transform-origin:left center;height:100%;border-radius:999px;background:linear-gradient(90deg,#fff,#8f8f8f,#fff);box-shadow:0 0 24px rgba(255,255,255,.72);transition:width .45s ease}
.ai-chat-page,.ai-chat-page *{font-family:var(--font-main)}.ai-chat-page{--ticket-glass-bg:rgba(13,13,13,.62);--ticket-glass-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);position:fixed;z-index:115;inset:0;width:100%;height:var(--ai-chat-page-height);display:flex;flex-direction:column;background:#000;color:#fff;opacity:1;visibility:visible;pointer-events:auto;transform:translate3d(18px,0,0) scale(.996);transition:transform .3s cubic-bezier(.16,.86,.22,1)}html.ai-chat-ready .ai-chat-page{transform:none}.ai-chat-messages{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;overflow-anchor:none;padding:calc(26px + env(safe-area-inset-top)) 16px max(96px,calc(var(--ai-chat-page-height) - 140px));scrollbar-width:none}.ai-chat-messages::-webkit-scrollbar{display:none}.ai-chat-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding-bottom:0;translate:0 -32px;opacity:1;visibility:visible;transform:translate3d(0,0,0) scale(1);transition:opacity .38s ease,transform .52s cubic-bezier(.16,1,.3,1),visibility 0s}.ai-chat-empty.hidden{opacity:0;visibility:hidden;pointer-events:none;transform:translate3d(0,-8px,0) scale(.96);transition:opacity .22s ease,transform .32s ease,visibility 0s linear .32s}.ai-chat-empty span{order:1;color:rgba(255,255,255,.48);font-size:15px;font-weight:680;line-height:1;letter-spacing:-.018em}.ai-chat-empty-orb{order:0;display:block;width:52px;height:52px;filter:drop-shadow(0 0 10px rgba(190,145,255,.14));animation:aiOrbReveal .78s cubic-bezier(.16,1,.3,1) both,aiOrbBreathe 2.8s ease-in-out .78s infinite}.ai-chat-message{width:100%;display:flex;margin:0 0 19px;opacity:0;animation:aiMessageIn .42s cubic-bezier(.16,1,.3,1) forwards;will-change:transform,opacity}.ai-chat-message+.ai-chat-message.user{margin-top:7px}.ai-chat-message.user{justify-content:flex-end;transform-origin:bottom right}.ai-chat-message.assistant{justify-content:flex-start;transform-origin:bottom left}.ai-chat-message-content{max-width:min(84%,420px);white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;font-weight:430;line-height:1.58;letter-spacing:-.018em;text-align:start}.ai-chat-message.assistant.rtl{justify-content:flex-end;transform-origin:bottom right}.ai-chat-message.rtl .ai-chat-message-content{direction:rtl;text-align:right;letter-spacing:0}.ai-chat-message.user .ai-chat-message-content{padding:9px 12px;border-radius:18px 18px 6px 18px;background:#1c1c1e;color:rgba(255,255,255,.9);font-size:14px;font-weight:500;line-height:1.48;box-shadow:none}.ai-chat-message.user.has-attachment{flex-direction:column;align-items:flex-end;gap:6px}.ai-chat-attachment-card{min-width:0;max-width:min(74vw,270px);display:flex;align-items:center;gap:9px;padding:5px 7px 5px 5px;border-radius:15px;background:rgba(28,28,30,.96);box-shadow:inset 0 0 0 1px rgba(255,255,255,.055);overflow:hidden}.ai-chat-attachment-card img{width:42px;height:42px;flex:0 0 42px;border-radius:11px;object-fit:cover;background:#101010}.ai-chat-attachment-type{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:11px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.62);font-size:9px;font-weight:720;letter-spacing:.04em}.ai-chat-attachment-copy{min-width:0;display:flex;flex:1;flex-direction:column;gap:3px}.ai-chat-attachment-copy strong{overflow:hidden;color:rgba(255,255,255,.84);font-size:11px;font-weight:560;line-height:1.2;letter-spacing:-.012em;white-space:nowrap;text-overflow:ellipsis}.ai-chat-attachment-copy small{color:rgba(255,255,255,.34);font-size:9px;font-weight:500;line-height:1}.ai-chat-message-attachment{animation:aiMessageIn .42s cubic-bezier(.16,1,.3,1) both}.ai-chat-message.assistant .ai-chat-message-content{padding:2px;color:rgba(255,255,255,.9);white-space:normal}.ai-chat-message.assistant .ai-chat-message-content p{margin:0 0 9px}.ai-chat-message.assistant .ai-chat-message-content p:last-child{margin-bottom:0}.ai-chat-message.assistant .ai-chat-message-content h2,.ai-chat-message.assistant .ai-chat-message-content h3{margin:2px 0 8px;color:#fff;font-size:15px;font-weight:700;line-height:1.4}.ai-chat-message.assistant .ai-chat-message-content strong{color:#fff;font-weight:700}.ai-chat-message.assistant .ai-chat-message-content em{font-style:italic;color:rgba(255,255,255,.84)}.ai-chat-message.assistant .ai-chat-message-content del{color:rgba(255,255,255,.48)}.ai-chat-message.assistant .ai-chat-message-content ul,.ai-chat-message.assistant .ai-chat-message-content ol{margin:0 0 10px;padding-inline-start:21px}.ai-chat-message.assistant .ai-chat-message-content li{margin:0 0 5px;padding-inline-start:2px}.ai-chat-message.assistant .ai-chat-message-content blockquote{margin:0 0 10px;padding-inline-start:10px;border-inline-start:2px solid rgba(255,255,255,.18);color:rgba(255,255,255,.68)}.ai-chat-message.assistant .ai-chat-message-content pre{margin:0 0 10px;padding:10px 11px;overflow:auto;border-radius:12px;background:rgba(255,255,255,.055);direction:ltr;text-align:left;white-space:pre}.ai-chat-message.assistant .ai-chat-message-content code{padding:2px 4px;border-radius:5px;background:rgba(255,255,255,.07);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em}.ai-chat-message.assistant .ai-chat-message-content pre code{padding:0;background:transparent}.ai-chat-message.assistant .ai-chat-message-content a{color:rgba(210,185,255,.88);text-decoration:none}.ai-chat-image-message{justify-content:flex-start}.ai-chat-image-card{position:relative;width:min(70vw,330px);overflow:hidden;border-radius:18px;background:#090909;box-shadow:var(--ticket-glass-shadow);opacity:0;transform-origin:top center}.ai-chat-image-card.ready{animation:aiImageCardDrop .72s cubic-bezier(.16,1,.3,1) both}.ai-chat-image-card img{display:block;width:100%;height:auto;background:#090909}.ai-chat-image-card .ai-chat-image-blur{filter:blur(18px)}.ai-chat-image-card .ai-chat-image-sharp{position:absolute;inset:0;height:100%;object-fit:contain;clip-path:inset(0 0 100% 0);will-change:clip-path}.ai-chat-image-card.ready .ai-chat-image-sharp{animation:aiImageSharpReveal 1.22s cubic-bezier(.16,1,.3,1) .16s forwards}.ai-chat-image-generating{justify-content:flex-start}.ai-chat-image-generating-content{display:flex;align-items:center;gap:9px;min-height:50px;animation:aiThinkingReveal .64s cubic-bezier(.16,1,.3,1) both}.ai-chat-image-generating-content canvas{display:block;width:44px;height:44px;flex:0 0 44px;filter:drop-shadow(0 0 13px rgba(190,145,255,.22));animation:aiOrbReveal .78s cubic-bezier(.16,1,.3,1) both,aiOrbBreathe 2.8s ease-in-out .78s infinite}.ai-chat-image-generating-content span{font-size:13px;font-weight:500;letter-spacing:-.012em;color:transparent;background:linear-gradient(100deg,rgba(255,255,255,.4),rgba(255,255,255,.94),rgba(211,180,255,.84),rgba(255,255,255,.42));background-size:240% 100%;-webkit-background-clip:text;background-clip:text;animation:aiThinkingShine 2.1s ease-in-out infinite}.ai-thinking-row{display:flex;align-items:center;gap:9px;min-height:50px;margin:0 0 19px;isolation:isolate;animation:aiThinkingReveal .64s cubic-bezier(.16,1,.3,1) both}.ai-thinking-orb{display:block;width:44px;height:44px;flex:0 0 44px;filter:drop-shadow(0 0 10px rgba(190,145,255,.16));animation:aiOrbReveal .78s cubic-bezier(.16,1,.3,1) both,aiOrbBreathe 2.8s ease-in-out .78s infinite}.ai-thinking-row span{font-size:15px;font-weight:480;letter-spacing:-.018em;color:transparent;background:linear-gradient(100deg,rgba(255,255,255,.36) 18%,rgba(255,255,255,.92) 43%,rgba(211,180,255,.88) 52%,rgba(255,255,255,.46) 72%);background-size:240% 100%;background-position:100% 50%;-webkit-background-clip:text;background-clip:text;text-shadow:0 0 18px rgba(190,145,255,.08);animation:aiThinkingShine 2.25s ease-in-out .32s infinite}.ai-thinking-row[data-state=searching] .ai-thinking-orb{filter:none!important}.ai-thinking-row[data-state=searching] span{background-image:linear-gradient(100deg,rgba(255,255,255,.34) 18%,rgba(255,255,255,.78) 48%,rgba(255,255,255,.4) 76%);text-shadow:none}.ai-chat-composer{position:absolute;z-index:2;left:30px;right:30px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + var(--ai-chat-keyboard-offset,0px));min-height:40px;display:flex;align-items:flex-end;gap:6px;padding:3px;border:0;border-radius:16px;background:var(--ticket-glass-bg);box-shadow:var(--ticket-glass-shadow);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);opacity:0;transform:translate3d(0,26px,0) scale(.975);transition:bottom .4s cubic-bezier(.16,1,.3,1),transform .4s cubic-bezier(.16,1,.3,1),opacity .24s ease,border-color .28s ease,background .28s ease;will-change:opacity}.ai-chat-page .ai-chat-composer{opacity:1;transform:none}.ai-chat-composer textarea{width:100%;min-height:32px;max-height:120px;resize:none;overflow-y:hidden;border:0;outline:0;padding:6px 0;background:transparent;color:#fff;caret-color:#fff;direction:ltr;font-size:16px;font-weight:520;line-height:18px;letter-spacing:-.018em;text-align:left;transition:height .32s cubic-bezier(.16,1,.3,1);scrollbar-width:none}.ai-chat-composer textarea::-webkit-scrollbar{display:none}.ai-chat-composer textarea::placeholder{color:rgba(255,255,255,.32);transition:opacity .2s ease}.ai-chat-composer textarea:focus::placeholder{opacity:.55}.ai-chat-composer button{width:34px;height:34px;flex:0 0 34px;border-radius:13px;display:grid;place-items:center;padding:0;background:linear-gradient(145deg,rgba(54,18,72,.88),rgba(23,8,31,.82));color:rgba(255,255,255,.9);border:0;box-shadow:inset 0 1px 0 rgba(232,202,255,.15),inset 0 -1px 0 rgba(0,0,0,.18),inset 0 0 18px rgba(121,52,161,.12),0 10px 24px rgba(0,0,0,.24);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .2s cubic-bezier(.16,1,.3,1),opacity .18s ease,background .2s ease,box-shadow .2s ease}.ai-chat-composer button:active{transform:scale(.88)}.ai-chat-composer button:disabled{opacity:.3}.ai-chat-composer:not(:focus-within) button:not(:disabled){box-shadow:none}.ai-chat-composer .ai-chat-attach{width:30px;height:34px;flex:0 0 30px;border-radius:12px;background:transparent;color:rgba(255,255,255,.56);box-shadow:none!important;backdrop-filter:none;-webkit-backdrop-filter:none}.ai-chat-attach span{position:relative;display:block;width:17px;height:17px;font-size:0;transform:translateY(-1px) rotate(0) scale(1);transition:transform .38s cubic-bezier(.16,1,.3,1),color .24s ease}.ai-chat-attach span::before{content:"";position:absolute;inset:0;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 17 17%27%3E%3Cpath d=%27M1.25 8.5h14.5M8.5 1.25v14.5%27 fill=%27none%27 stroke=%27white%27 stroke-width=%272.5%27 stroke-linecap=%27round%27/%3E%3C/svg%3E") center/17px 17px no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 17 17%27%3E%3Cpath d=%27M1.25 8.5h14.5M8.5 1.25v14.5%27 fill=%27none%27 stroke=%27white%27 stroke-width=%272.5%27 stroke-linecap=%27round%27/%3E%3C/svg%3E") center/17px 17px no-repeat}.ai-chat-attach:active span{transform:translateY(-1px) rotate(90deg) scale(.8)}.ai-chat-attach.loading span{animation:aiAttachLoading .78s cubic-bezier(.4,0,.2,1) infinite}.ai-chat-composer.has-attachment .ai-chat-attach{color:rgba(255,255,255,.88)}.ai-chat-attachment-preview{position:absolute;z-index:3;left:0;bottom:calc(100% + 8px);max-width:min(78vw,280px);opacity:0;visibility:hidden;pointer-events:none;filter:blur(7px);transform:translate3d(0,10px,0) scale(.94);transform-origin:bottom left;transition:opacity .24s ease,visibility 0s linear .34s,filter .38s ease,transform .42s cubic-bezier(.16,1,.3,1)}.ai-chat-attachment-preview[aria-hidden=false]{opacity:1;visibility:visible;pointer-events:auto;filter:blur(0);transform:translate3d(0,0,0) scale(1);transition-delay:0s}.ai-chat-attachment-preview .ai-chat-attachment-card{width:min(74vw,270px);background:rgba(20,20,21,.9);box-shadow:var(--ticket-glass-shadow);backdrop-filter:blur(12px) saturate(1.08);-webkit-backdrop-filter:blur(12px) saturate(1.08)}.ai-chat-composer .ai-chat-attachment-remove{width:24px;height:24px;flex:0 0 24px;padding:0;border-radius:9px;background:rgba(255,255,255,.045);box-shadow:none!important;color:rgba(255,255,255,.46);font-size:18px;font-weight:400;line-height:1;backdrop-filter:none;-webkit-backdrop-filter:none}.ai-chat-composer .ai-chat-attachment-remove:active{transform:rotate(90deg) scale(.84);color:#fff;background:rgba(255,255,255,.1)}
@keyframes aiAttachLoading{0%{transform:translateY(-1px) rotate(0) scale(.82);opacity:.45}50%{transform:translateY(-1px) rotate(90deg) scale(1);opacity:1}100%{transform:translateY(-1px) rotate(180deg) scale(.82);opacity:.45}}@keyframes aiMessageIn{from{opacity:0;transform:translate3d(0,12px,0) scale(.975)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}@keyframes aiImageCardDrop{0%{opacity:0;transform:translate3d(0,-22px,0) scale(.97)}65%{opacity:1;transform:translate3d(0,2px,0) scale(1.006)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}@keyframes aiImageSharpReveal{0%{clip-path:inset(0 0 100% 0)}100%{clip-path:inset(0 0 0 0)}}@keyframes aiThinkingReveal{0%{opacity:0;filter:blur(9px);transform:translate3d(-10px,12px,0) scale(.9)}55%{opacity:1;filter:blur(0);transform:translate3d(2px,-1px,0) scale(1.025)}100%{opacity:1;filter:blur(0);transform:translate3d(0,0,0) scale(1)}}@keyframes aiOrbReveal{0%{opacity:0;transform:rotate(-24deg) scale(.58)}70%{opacity:1;transform:rotate(4deg) scale(1.08)}100%{opacity:1;transform:rotate(0) scale(1)}}@keyframes aiOrbBreathe{0%,100%{transform:translate3d(0,0,0) scale(1);filter:drop-shadow(0 0 9px rgba(190,145,255,.13))}50%{transform:translate3d(0,-2px,0) scale(1.035);filter:drop-shadow(0 0 15px rgba(190,145,255,.25))}}@keyframes aiThinkingShine{0%,100%{background-position:100% 50%;opacity:.62}50%{background-position:0 50%;opacity:1}}
@media (prefers-reduced-motion:reduce){.ai-chat-page,.ai-chat-composer,.ai-chat-message,.ai-thinking-row,.ai-thinking-orb,.ai-thinking-row span,.ai-chat-image-card,.ai-chat-image-card img,.ai-chat-image-generating-content,.ai-chat-image-generating-content canvas,.ai-chat-image-generating-content span{transition:none!important;animation:none!important}.ai-chat-message,.ai-chat-image-card{opacity:1!important}.ai-chat-image-card.ready .ai-chat-image-sharp{clip-path:inset(0)!important}}
.wave-player{display:none;width:86%;min-width:0;height:52px;margin-left:0;margin-right:auto;border:0;border-radius:22px;background:rgba(13,13,13,.54);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 22px rgba(255,255,255,.055),0 16px 36px rgba(0,0,0,.22);padding:6px;align-items:center;gap:7px;overflow:hidden;backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);animation:waveIn .38s cubic-bezier(.16,1,.3,1);transition:background .24s ease,box-shadow .24s ease}.wave-player.show{display:flex}.wave-player.is-playing{background:rgba(13,13,13,.64);box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.065),inset 0 0 24px rgba(255,255,255,.07),0 18px 40px rgba(0,0,0,.25)}.wave-play{width:38px;height:38px;border-radius:15px;background:#fff;color:#050505;display:grid;place-items:center;flex:0 0 38px;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.1),0 10px 22px rgba(0,0,0,.24);transition:transform .22s cubic-bezier(.2,.9,.2,1),box-shadow .22s ease}.wave-play:active{transform:scale(.9);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 5px 13px rgba(0,0,0,.22)}.wave-player-body{position:relative;min-width:0;align-self:stretch;flex:1;display:flex;align-items:center;justify-content:center;padding:0 7px;border-radius:15px;background:rgba(0,0,0,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(255,255,255,.04);overflow:hidden}.wave-seek{position:relative;width:100%;min-width:44px;height:29px;overflow:hidden;touch-action:none;--wave-progress:0%}.wave-svg{position:absolute;left:0;top:2px;width:100%;height:25px;pointer-events:none;filter:saturate(0)}.wave-svg rect{fill:#fff}.wave-svg-base rect{opacity:.14}.wave-svg-progress{z-index:1;clip-path:inset(0 calc(100% - var(--wave-progress)) 0 0);-webkit-clip-path:inset(0 calc(100% - var(--wave-progress)) 0 0);transition:clip-path .045s linear,-webkit-clip-path .045s linear;will-change:clip-path}.wave-svg-progress rect{opacity:.96}.wave-seek.is-scrubbing .wave-svg-progress{transition:none}.wave-seek::after{content:"";position:absolute;z-index:2;left:var(--wave-progress);top:3px;width:2px;height:19px;border-radius:2px;background:#fff;opacity:0;transform:translateX(-50%) scaleY(.75);box-shadow:0 0 8px rgba(255,255,255,.35);transition:opacity .16s ease,transform .2s cubic-bezier(.2,.9,.2,1)}.wave-seek.is-scrubbing::after{opacity:1;transform:translateX(-50%) scaleY(1)}.wave-range{position:absolute;z-index:3;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;-webkit-appearance:none;appearance:none}.wave-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:29px}.wave-range:disabled{pointer-events:none}.wave-meta{position:absolute;z-index:4;left:clamp(20px,var(--wave-progress),calc(100% - 20px));top:50%;height:20px;padding:0 6px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:rgba(5,5,5,.84);border:1px solid rgba(255,255,255,.13);box-shadow:0 5px 16px rgba(0,0,0,.42);color:#fff;font-size:9px;font-weight:760;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.82);transition:opacity .16s ease,transform .24s cubic-bezier(.16,1,.3,1)}.wave-seek.is-scrubbing .wave-meta{opacity:1;transform:translate(-50%,-50%) scale(1)}.wave-time{color:#fff}.wave-actions{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding-left:0;border-left:0}
.wave-play{position:relative;font-size:0!important;line-height:1;overflow:hidden}.wave-play-shape{position:relative;display:block;width:16px;height:16px}.wave-play-icon,.wave-pause-icon{position:absolute;inset:0;width:16px;height:16px;transition:opacity .24s ease,transform .3s cubic-bezier(.2,.8,.2,1)}.wave-play-icon{display:block;fill:currentColor;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;transform:scale(1) rotate(0);opacity:1}.wave-pause-icon{display:flex;align-items:center;justify-content:center;gap:4px;opacity:0;transform:scale(.72) rotate(-12deg)}.wave-pause-icon i{display:block;width:4px;height:13px;border-radius:999px;background:currentColor}.wave-play.is-playing .wave-play-icon{opacity:0;transform:scale(.72) rotate(12deg)}.wave-play.is-playing .wave-pause-icon{opacity:1;transform:scale(1) rotate(0)}.wave-share{width:32px;height:32px;flex:0 0 32px;border-radius:10px;display:grid;place-items:center;padding:0;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);color:rgba(255,255,255,.86);transition:transform .22s cubic-bezier(.2,.9,.2,1),color .2s ease,background .2s ease,border-color .2s ease}.wave-share svg{width:18px;height:18px}.wave-share:active{transform:scale(.86);background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.14);color:#fff}.wave-share.sharing svg{animation:sharePulse .8s ease-in-out infinite}@keyframes sharePulse{0%,100%{transform:translateY(0);opacity:.65}50%{transform:translateY(-2px);opacity:1}}
@keyframes waveIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

.ai-chat-audio-message{
  justify-content:flex-start;
}

.ai-chat-wave-player{
  flex:0 1 86%;
}

.ai-chat-wave-player audio{
  display:none;
}

.ai-thinking-row .ai-thinking-orb{
  transition:
    width 1.08s cubic-bezier(.22,.72,.18,1),
    height 1.08s cubic-bezier(.22,.72,.18,1),
    flex-basis 1.08s cubic-bezier(.22,.72,.18,1),
    filter .9s ease,
    transform 1.08s cubic-bezier(.22,.72,.18,1);
}

.ai-thinking-row[data-state=generating_voice]{
  gap:7px;
}

.ai-thinking-row[data-state=generating_voice] .ai-thinking-orb{
  width:74px;
  height:44px;
  flex-basis:74px;
  filter:none;
  animation:
    aiVoiceWaveFloat 2.4s ease-in-out infinite;
}

.ai-thinking-row[data-state=generating_voice] span{
  background-image:
    linear-gradient(
      100deg,
      rgba(220,190,235,.42) 16%,
      rgba(255,255,255,.96) 46%,
      rgba(190,126,220,.94) 57%,
      rgba(255,255,255,.46) 78%
    );
  background-size:210% 100%;
  animation:
    aiThinkingShine 1.5s ease-in-out infinite;
}

@keyframes aiVoiceWaveFloat{
  0%,
  100%{
    transform:translate3d(0,0,0) scaleX(1);
  }
  50%{
    transform:translate3d(0,-.6px,0) scaleX(1.012);
  }
}

@media (prefers-reduced-motion:reduce){
  .ai-chat-wave-player,
  .ai-chat-wave-player *,
  .ai-thinking-row[data-state=generating_voice] .ai-thinking-orb{
    animation:none!important;
    transition:none!important;
  }
}

.ai-chat-head{
  position:absolute;
  z-index:6;
  left:16px;
  right:16px;
  top:calc(12px + env(safe-area-inset-top));
  height:36px;
  min-height:36px;
  max-height:36px;
  display:flex;
  align-items:stretch;
  justify-content:space-between;
  gap:12px;
  opacity:0;
  transform:translate3d(0,-10px,0);
  animation:
    aiChatHeadIn .52s cubic-bezier(.16,1,.3,1) .08s forwards;
}

.ai-chat-head::before{
  content:"";
  position:absolute;
  z-index:-1;
  left:-16px;
  right:-16px;
  top:calc(-12px - env(safe-area-inset-top));
  bottom:-1px;
  background:#000;
}

.ai-chat-head::after{
  content:"";
  position:absolute;
  z-index:-1;
  left:-16px;
  right:-16px;
  top:100%;
  height:34px;
  background:
    linear-gradient(
      180deg,
      #000 0%,
      rgba(0,0,0,.9) 28%,
      rgba(0,0,0,.48) 62%,
      rgba(0,0,0,0) 100%
    );
  pointer-events:none;
}

.ai-chat-head .credit-tools,
.ai-chat-head .mode-tools{
  display:flex;
  align-items:center;
  gap:7px;
  height:36px;
}

.ai-chat-head .credit-pill{
  flex:0 0 auto;
  height:36px;
  min-height:36px;
  max-height:36px;
  align-self:stretch;
  display:flex;
  align-items:center;
  gap:5px;
  padding:0 11px;
  border:0;
  border-radius:16px;
  color:#fff;
  background:var(--ticket-glass-bg);
  box-shadow:var(--ticket-glass-shadow);
  backdrop-filter:blur(10px) saturate(1.12);
  -webkit-backdrop-filter:blur(10px) saturate(1.12);
  font-size:13px;
  font-weight:620;
  line-height:1;
}

.ai-chat-menu-button{position:relative;width:36px;height:36px;flex:0 0 36px;display:grid;place-content:center;gap:4px;padding:0;border:0;border-radius:14px;background:var(--ticket-glass-bg);color:#fff;box-shadow:var(--ticket-glass-shadow);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);transition:transform .22s cubic-bezier(.16,1,.3,1),background .2s ease}.ai-chat-menu-button:active{transform:scale(.9);background:rgba(255,255,255,.11)}.ai-chat-menu-button span{display:block;width:15px;height:1.5px;border-radius:999px;background:currentColor;transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .18s ease,width .25s ease}.ai-chat-menu-button span:nth-child(2){width:11px}.ai-chat-menu-button[aria-expanded=true] span:first-child{transform:translateY(5.5px) rotate(45deg)}.ai-chat-menu-button[aria-expanded=true] span:nth-child(2){width:0;opacity:0}.ai-chat-menu-button[aria-expanded=true] span:last-child{transform:translateY(-5.5px) rotate(-45deg)}

.ai-chat-menu-backdrop{position:fixed;z-index:150;inset:0;padding:0;background:rgba(0,0,0,.54);opacity:0;visibility:hidden;pointer-events:none;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);transition:opacity .28s ease,visibility 0s linear .32s}.ai-chat-menu-backdrop.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}.ai-chat-menu-panel{position:absolute;left:0;top:0;bottom:0;width:min(86vw,344px);overflow-y:auto;overscroll-behavior:contain;padding:calc(18px + env(safe-area-inset-top)) 14px calc(20px + env(safe-area-inset-bottom));border-right:1px solid rgba(255,255,255,.11);background:linear-gradient(160deg,rgba(18,18,20,.98),rgba(5,5,6,.99) 62%);box-shadow:28px 0 80px rgba(0,0,0,.62),inset -1px 0 0 rgba(255,255,255,.035);transform:translate3d(-102%,0,0);transition:transform .42s cubic-bezier(.16,1,.3,1);scrollbar-width:none}.ai-chat-menu-panel::-webkit-scrollbar{display:none}.ai-chat-menu-backdrop.open .ai-chat-menu-panel{transform:none}.ai-chat-menu-head{display:flex;align-items:center;justify-content:space-between;padding:0 4px 19px}.ai-chat-menu-head>div{display:grid;gap:3px}.ai-chat-menu-head small{color:rgba(255,255,255,.34);font-size:9px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.ai-chat-menu-head strong{font-size:20px;font-weight:730;letter-spacing:-.035em}.ai-chat-menu-head button{width:32px;height:32px;display:grid;place-items:center;padding:0;border-radius:12px;background:rgba(255,255,255,.065);color:rgba(255,255,255,.62);font-size:22px;line-height:1}.ai-chat-menu-section{padding:14px 0;border-top:1px solid rgba(255,255,255,.075)}.ai-chat-menu-section>p{margin:0 4px 9px;color:rgba(255,255,255,.38);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.ai-chat-model-grid{display:grid;gap:5px}.ai-chat-model-grid .model-option{position:relative;width:100%;min-height:58px;display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid transparent;border-radius:17px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.7);text-align:left;transition:background .2s ease,border-color .2s ease,transform .2s ease}.ai-chat-model-grid .model-option:active{transform:scale(.98)}.ai-chat-model-grid .model-option.active{border-color:rgba(255,255,255,.13);background:rgba(255,255,255,.09);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.055)}.ai-chat-model-grid .model-option span{display:grid;gap:4px}.ai-chat-model-grid .model-option strong{font-size:14px;font-weight:720;letter-spacing:-.015em}.ai-chat-model-grid .model-option strong em{margin-left:4px;color:rgba(255,255,255,.38);font-size:9px;font-style:normal;font-weight:720;letter-spacing:.04em}.ai-chat-model-grid .model-option small{color:rgba(255,255,255,.34);font-size:10px;font-weight:550}.ai-chat-model-grid .model-option>b{width:8px;height:8px;border:2px solid rgba(255,255,255,.16);border-radius:50%}.ai-chat-model-grid .model-option.active>b{border-color:#fff;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.32)}.ai-chat-effort-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:4px;border-radius:16px;background:rgba(255,255,255,.035)}.ai-chat-effort-grid button{height:36px;padding:0 3px;border-radius:12px;background:transparent;color:rgba(255,255,255,.42);font-size:11px;font-weight:660}.ai-chat-effort-grid button.active{background:rgba(255,255,255,.11);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 6px 16px rgba(0,0,0,.18)}.ai-chat-menu-github-slot .ai-github-button{width:100%;max-width:none!important}.ai-chat-menu-chevron{margin-left:auto;color:rgba(255,255,255,.34);font-size:23px;font-weight:300}.ai-chat-memory-card{margin-top:2px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.ai-chat-memory-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ai-chat-memory-head>span{display:grid;gap:3px}.ai-chat-memory-head strong{font-size:13px;font-weight:720}.ai-chat-memory-head small{color:rgba(255,255,255,.34);font-size:9px;font-weight:560}.ai-chat-memory-head button{padding:6px 8px;border-radius:9px;background:transparent;color:rgba(255,255,255,.42);font-size:10px;font-weight:650}.ai-chat-memory-head button:disabled{opacity:.25}.ai-chat-memory-bar{height:4px;margin-top:13px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07)}.ai-chat-memory-bar span{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8e65b5,#e2c6ff);box-shadow:0 0 12px rgba(199,155,240,.35);transition:width .38s cubic-bezier(.16,1,.3,1)}.ai-chat-memory-usage{margin-top:7px;color:rgba(255,255,255,.32);font-size:9px;font-weight:560;text-align:right;font-variant-numeric:tabular-nums}

.ai-chat-head .credit-pill span{
  display:block;
  line-height:1;
}

.ai-chat-head .credit-pill span:last-child{
  color:rgba(255,255,255,.58);
  font-size:11px;
}

.ai-chat-head .voice-wrap{
  position:relative;
  display:flex;
  align-items:stretch;
  align-self:stretch;
  height:36px;
  min-height:36px;
  max-height:36px;
  flex:0 0 auto;
  margin:0;
  transform:none!important;
}

.ai-chat-head .voice-btn{
  height:36px;
  min-height:36px;
  max-height:36px;
  align-self:stretch;
  box-sizing:border-box;
  min-width:104px;
  border:1px solid var(--line);
  border-radius:999px;
  background:rgba(255,255,255,.055);
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:0 13px;
  font-size:14px;
  font-weight:650;
  line-height:1;
}

.ai-chat-head .voice-btn span,
.ai-chat-head .voice-btn svg{
  display:block;
  flex:0 0 auto;
}


.ai-chat-head .voice-button-avatar{
  display:none;
  width:22px;
  height:22px;
  flex:0 0 22px;
  border-radius:50%;
  background:#171717 center/cover no-repeat;
}

.ai-chat-head .voice-button-avatar.has-image{
  display:block;
  border:1px solid rgba(255,255,255,.22);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.18);
}


.ai-chat-head .voice-btn{
  border:0;
  border-radius:16px;
  background:var(--ticket-glass-bg);
  box-shadow:var(--ticket-glass-shadow);
  backdrop-filter:blur(10px) saturate(1.12);
  -webkit-backdrop-filter:blur(10px) saturate(1.12);
}

.ai-chat-head .voice-btn:active{
  background:rgba(255,255,255,.105);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.13),
    inset 0 -1px 0 rgba(255,255,255,.07),
    0 5px 14px rgba(0,0,0,.2);
}

.ai-chat-messages{
  padding-top:calc(80px + env(safe-area-inset-top));
}

.ai-thinking-row[data-state=generating_voice] .ai-thinking-orb{
  -webkit-mask-image:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(0,0,0,.18) 9%,
      #000 24%,
      #000 76%,
      rgba(0,0,0,.18) 91%,
      transparent 100%
    );
  mask-image:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(0,0,0,.18) 9%,
      #000 24%,
      #000 76%,
      rgba(0,0,0,.18) 91%,
      transparent 100%
    );
}


.ai-chat-head .voice-btn svg{
  transition:transform .22s ease;
}

.ai-chat-head .voice-wrap.open .voice-btn svg{
  transform:rotate(180deg);
}

.ai-chat-head .voice-wrap.updating{
  pointer-events:none;
}

.ai-chat-head .voice-wrap.updating .voice-btn{
  opacity:.62;
}

.ai-chat-head .voice-menu{
  position:absolute;
  right:0;
  top:44px;
  z-index:50;
  width:230px;
  max-height:min(390px,58vh);
  overflow:hidden;
  padding:7px 7px 6px;
  border:1px solid rgba(255,255,255,.13);
  border-radius:20px;
  background:rgba(8,8,8,.97);
  box-shadow:0 24px 70px rgba(0,0,0,.72);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  opacity:0;
  transform:translateY(-8px) scale(.96);
  transform-origin:top right;
  pointer-events:none;
  transition:
    opacity .18s ease,
    transform .18s ease;
}

.ai-chat-head .voice-wrap.open .voice-menu{
  opacity:1;
  transform:translateY(0) scale(1);
  pointer-events:auto;
}

.ai-chat-head .my-voice-rows{
  max-height:min(314px,47vh);
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-width:none;
}

.ai-chat-head .my-voice-rows::-webkit-scrollbar{
  display:none;
}

.ai-chat-head .voice-option{
  display:grid;
  grid-template-columns:34px minmax(0,1fr) 28px;
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:4px;
  border-radius:15px;
}

.ai-chat-head .voice-option+.voice-option{
  margin-top:2px;
}

.ai-chat-head .voice-option.voice-not-saved{
  display:none;
}

.ai-chat-head .voice-option:has(.voice-select.active){
  background:rgba(255,255,255,.08);
}

.ai-chat-head .voice-avatar{
  grid-column:1;
  grid-row:1;
  position:relative;
  width:32px;
  height:32px;
  display:block;
  overflow:hidden;
  border:1px solid #252525;
  border-radius:50%;
  background:#171717 center/cover no-repeat;
}

.ai-chat-head .voice-avatar.has-image{
  border-color:rgba(255,255,255,.22);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.18);
}

.ai-chat-head .voice-avatar-image{
  display:block;
  width:100%;
  height:100%;
  border-radius:inherit;
  background-position:center;
  background-size:cover;
  background-repeat:no-repeat;
  filter:none;
  box-shadow:none;
}

.ai-chat-head .voice-select{
  grid-column:2;
  width:100%;
  height:34px;
  overflow:hidden;
  padding:0 5px;
  border-radius:12px;
  background:transparent;
  color:rgba(255,255,255,.68);
  font-size:13px;
  font-weight:620;
  text-align:left;
}

.ai-chat-head .voice-select span{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ai-chat-head .voice-select.active{
  color:#fff;
}

.ai-chat-head .voice-preview{
  grid-column:3;
  grid-row:1;
  position:relative;
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
  color:rgba(255,255,255,.72);
  box-shadow:none;
  transition:
    transform .18s ease,
    color .18s ease,
    opacity .18s ease;
}

.ai-chat-head .voice-preview:active{
  transform:scale(.88);
}

.ai-chat-head .voice-preview-icon{
  display:block;
  font-size:11px;
  line-height:1;
  transform:translateX(1px);
}

.ai-chat-head .voice-preview.loading{
  opacity:.7;
}

.ai-chat-head .voice-preview.loading
.voice-preview-icon{
  width:11px;
  height:11px;
  border:1.5px solid rgba(255,255,255,.22);
  border-top-color:#fff;
  border-radius:50%;
  font-size:0;
  transform:none;
  animation:
    aiChatPreviewSpin .7s linear infinite;
}

.ai-chat-head .voice-preview.playing{
  background:transparent;
  color:#fff;
}

.ai-chat-head .voice-preview.playing
.voice-preview-icon{
  width:8px;
  height:10px;
  border-left:2.5px solid currentColor;
  border-right:2.5px solid currentColor;
  font-size:0;
  transform:none;
}

.ai-chat-head .my-voices-empty{
  display:none;
  padding:18px 12px;
  color:rgba(255,255,255,.38);
  font-size:11px;
  font-weight:650;
  text-align:center;
}

.ai-chat-head .my-voices-empty.show{
  display:block;
}

.ai-chat-head .voice-library-open{
  width:100%;
  height:42px;
  margin-top:5px;
  padding:0 10px 0 13px;
  display:grid;
  grid-template-columns:1fr auto auto;
  align-items:center;
  gap:8px;
  border-top:1px solid rgba(255,255,255,.1);
  border-radius:0 0 14px 14px;
  background:transparent;
  color:#fff;
  font-size:13px;
  font-weight:780;
  text-align:left;
}

.ai-chat-head .voice-library-open small{
  color:rgba(255,255,255,.4);
  font-size:9px;
  font-weight:720;
}

.ai-chat-head .voice-library-open svg{
  color:rgba(255,255,255,.48);
  transition:transform .2s ease;
}

.ai-chat-head .voice-library-open:active svg{
  transform:translateX(3px);
}

@keyframes aiChatPreviewSpin{
  to{
    transform:rotate(360deg);
  }
}

@keyframes aiChatHeadIn{
  to{
    opacity:1;
    transform:translate3d(0,0,0);
  }
}

.ai-chat-head .model-wrap{
  position:relative;
  height:36px;
  flex:0 0 auto;
}

.ai-chat-head .model-button{
  height:36px;
  min-width:72px;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  padding:0 10px;
  border:0;
  border-radius:16px;
  background:var(--ticket-glass-bg);
  color:#fff;
  box-shadow:var(--ticket-glass-shadow);
  backdrop-filter:blur(10px) saturate(1.12);
  -webkit-backdrop-filter:blur(10px) saturate(1.12);
  font-size:12px;
  font-weight:720;
  line-height:1;
}

.ai-chat-head .model-button svg{
  color:rgba(255,255,255,.48);
  transition:transform .2s ease;
}

.ai-chat-head .model-wrap.open .model-button svg{
  transform:rotate(180deg);
}

.ai-chat-head .model-menu{
  position:absolute;
  z-index:60;
  left:0;
  top:44px;
  width:min(270px,calc(100vw - 32px));
  padding:8px;
  border:1px solid rgba(255,255,255,.13);
  border-radius:20px;
  background:rgba(8,8,8,.98);
  box-shadow:0 24px 70px rgba(0,0,0,.72);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  opacity:0;
  pointer-events:none;
  transform:translateY(-8px) scale(.96);
  transform-origin:top left;
  transition:opacity .18s ease,transform .18s ease;
}

.ai-chat-head .model-wrap.open .model-menu{
  opacity:1;
  pointer-events:auto;
  transform:translateY(0) scale(1);
}

.ai-chat-head .model-menu>p{
  margin:4px 8px 7px;
  color:rgba(255,255,255,.38);
  font-size:10px;
  font-weight:650;
  letter-spacing:.02em;
}

.ai-chat-head .model-option{
  width:100%;
  min-height:54px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:8px 10px;
  border:0;
  border-radius:14px;
  background:transparent;
  color:rgba(255,255,255,.74);
  text-align:left;
}

.ai-chat-head .model-option+.model-option{
  margin-top:2px;
}

.ai-chat-head .model-option.active{
  background:rgba(255,255,255,.09);
  color:#fff;
}

.ai-chat-head .model-option span{
  min-width:0;
  display:grid;
  gap:3px;
}

.ai-chat-head .model-option strong{
  font-size:13px;
  font-weight:760;
}

.ai-chat-head .model-option small{
  color:rgba(255,255,255,.38);
  font-size:9px;
  font-weight:550;
}

.ai-chat-head .model-option em{
  flex:0 0 auto;
  color:rgba(255,255,255,.5);
  font-size:9px;
  font-style:normal;
  font-weight:620;
  white-space:nowrap;
}

.ai-chat-head .model-pricing-note{
  margin:6px 4px 2px;
  padding:8px 7px 2px;
  border-top:1px solid rgba(255,255,255,.08);
  color:rgba(255,255,255,.34);
  font-size:9px;
  font-weight:600;
  text-align:center;
}

@media(max-width:360px){
  .ai-chat-head{left:12px;right:12px;gap:7px}
  .ai-chat-head .credit-tools,.ai-chat-head .mode-tools{gap:5px}
  .ai-chat-head .credit-pill{padding:0 9px}
  .ai-chat-head .credit-pill span:last-child{display:none}
  .ai-chat-head .model-button{min-width:63px;padding:0 8px}
  .ai-chat-head .voice-btn{min-width:82px;padding:0 10px}
}

.ai-chat-menu-github-slot .ai-github-button{width:100%;height:44px;min-height:44px;max-height:44px;max-width:none!important;justify-content:flex-start;padding:0 13px}

.ai-thinking-row{width:min(100%,680px);align-items:stretch;flex-direction:column;gap:8px}
.ai-thinking-head{min-height:44px;display:flex;align-items:center;gap:10px}
.ai-thinking-loader{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.025);box-shadow:none;transition:width .2s ease,height .2s ease,flex-basis .2s ease,border-color .2s ease,background .2s ease}
.ai-thinking-row .ai-thinking-loader .ai-thinking-orb{width:40px;height:40px;flex-basis:40px;animation:aiOrbReveal .5s cubic-bezier(.16,1,.3,1) both}
.ai-thinking-copy{min-width:0;display:grid;gap:3px;background:none!important;color:inherit!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;text-shadow:none!important;animation:none!important}
.ai-thinking-row .ai-thinking-label{display:block;font-size:14px;font-weight:620;line-height:1.15;letter-spacing:-.018em;color:transparent;background:linear-gradient(100deg,rgba(255,255,255,.44),rgba(255,255,255,.96),rgba(218,190,241,.82),rgba(255,255,255,.48));background-size:240% 100%;-webkit-background-clip:text;background-clip:text;animation:aiThinkingShine 2.1s ease-in-out infinite}
.ai-thinking-row .ai-thinking-detail{display:block;max-width:min(72vw,430px);overflow:hidden;color:rgba(255,255,255,.34)!important;background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;font-size:10px;font-weight:520;line-height:1.3;letter-spacing:-.005em;white-space:nowrap;text-overflow:ellipsis;opacity:0;transform:translateY(-2px);animation:none!important;transition:opacity .25s ease,transform .32s cubic-bezier(.16,1,.3,1)}
.ai-thinking-row .ai-thinking-detail.visible{opacity:1;transform:none}

.ai-thinking-row:is([data-state=scanning_repository],[data-state=reading_repository],[data-state=analyzing_code],[data-state=preparing_changes],[data-state=previewing_changes],[data-state=writing_code],[data-state=committing_changes],[data-state=commit_ready],[data-state=creating_pull_request],[data-state=pull_request_ready],[data-state=merging_pull_request],[data-state=applying_changes],[data-state=changes_applied],[data-state=finalizing]) .ai-thinking-head{min-height:28px;gap:7px}
.ai-thinking-row:is([data-state=scanning_repository],[data-state=reading_repository],[data-state=analyzing_code],[data-state=preparing_changes],[data-state=previewing_changes],[data-state=writing_code],[data-state=committing_changes],[data-state=commit_ready],[data-state=creating_pull_request],[data-state=pull_request_ready],[data-state=merging_pull_request],[data-state=applying_changes],[data-state=changes_applied],[data-state=finalizing]) .ai-thinking-loader{width:16px;height:16px;flex-basis:16px;border:0;border-radius:50%;background:transparent}
.ai-thinking-row:is([data-state=scanning_repository],[data-state=reading_repository],[data-state=analyzing_code],[data-state=preparing_changes],[data-state=previewing_changes],[data-state=writing_code],[data-state=committing_changes],[data-state=commit_ready],[data-state=creating_pull_request],[data-state=pull_request_ready],[data-state=merging_pull_request],[data-state=applying_changes],[data-state=changes_applied],[data-state=finalizing]) .ai-thinking-loader .ai-thinking-orb{display:none}
.ai-thinking-row:is([data-state=scanning_repository],[data-state=reading_repository],[data-state=analyzing_code],[data-state=preparing_changes],[data-state=previewing_changes],[data-state=writing_code],[data-state=committing_changes],[data-state=creating_pull_request],[data-state=merging_pull_request],[data-state=applying_changes],[data-state=finalizing]) .ai-thinking-loader::after{content:"";width:11px;height:11px;border:1px solid rgba(255,255,255,.16);border-top-color:rgba(255,255,255,.72);border-radius:50%;animation:aiCodingSpin .75s linear infinite}
.ai-thinking-row:is([data-state=commit_ready],[data-state=pull_request_ready],[data-state=changes_applied]) .ai-thinking-loader::after{content:"";width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.7)}

.ai-coding-workbench{position:relative;width:100%;overflow:hidden;padding:0;border:1px solid rgba(255,255,255,.085);border-radius:14px;background:#070707;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;opacity:0;transform:translateY(5px);transition:opacity .2s ease,transform .24s cubic-bezier(.16,1,.3,1)}
.ai-coding-workbench.visible{opacity:1;transform:none}
.ai-coding-workbench::before{display:none}
.ai-thinking-row .ai-coding-workbench span,.ai-thinking-row .ai-coding-workbench small,.ai-thinking-row .ai-coding-workbench strong,.ai-thinking-row .ai-coding-workbench b,.ai-thinking-row .ai-coding-workbench i,.ai-thinking-row .ai-coding-workbench em{color:inherit;background:none;-webkit-background-clip:border-box;background-clip:border-box;text-shadow:none;animation:none}
.ai-coding-top{min-height:43px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.065)}
.ai-coding-top>span{min-width:0;display:block}
.ai-coding-top small{display:none}
.ai-coding-top strong{display:block;max-width:58vw;overflow:hidden;color:rgba(255,255,255,.76)!important;font:560 10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;text-overflow:ellipsis}
.ai-coding-top>b{flex:0 0 auto;color:rgba(255,255,255,.35)!important;font-size:9px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.ai-coding-context-bar{height:1px;margin:0;overflow:hidden;background:rgba(255,255,255,.045)}
.ai-coding-context-bar span{display:block;width:0;height:100%;background:rgba(255,255,255,.55)!important;box-shadow:none;transition:width .45s cubic-bezier(.16,1,.3,1)}
.ai-coding-context-files{display:flex;gap:10px;overflow-x:auto;padding:8px 11px;border-bottom:1px solid rgba(255,255,255,.055);scrollbar-width:none}
.ai-coding-context-files:empty{display:none}
.ai-coding-context-files::-webkit-scrollbar{display:none}
.ai-thinking-row .ai-coding-context-files span{position:relative;flex:0 0 auto;max-width:220px;overflow:hidden;padding:0;background:transparent!important;color:rgba(255,255,255,.36)!important;font:500 9px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;text-overflow:ellipsis}
.ai-thinking-row .ai-coding-context-files span+span::before{content:"/";margin-right:10px;color:rgba(255,255,255,.14)}
.ai-coding-timeline{display:grid;gap:5px;margin:0;padding:9px 11px;border:0;border-bottom:1px solid rgba(255,255,255,.055)}
.ai-coding-timeline:empty{display:none}
.ai-coding-event{min-height:16px;display:flex;align-items:center;gap:8px;opacity:.34;transform:none;transition:opacity .16s ease}
.ai-coding-event.active{opacity:1}
.ai-coding-event>i{width:9px;height:1px;flex:0 0 9px;border-radius:0;background:rgba(255,255,255,.18)!important}
.ai-coding-event.active>i{background:rgba(255,255,255,.72)!important;box-shadow:none;animation:none!important}
.ai-coding-event>span{min-width:0;display:flex;align-items:baseline;gap:7px}
.ai-coding-event strong{color:rgba(255,255,255,.58)!important;font-size:9px;font-weight:560;white-space:nowrap}
.ai-coding-event.active strong{color:rgba(255,255,255,.82)!important}
.ai-coding-event small{overflow:hidden;color:rgba(255,255,255,.28)!important;font-size:8px;font-weight:480;white-space:nowrap;text-overflow:ellipsis}
.ai-coding-live-diff{display:grid;gap:8px;margin:0;padding:0 10px 10px}
.ai-coding-live-diff:empty{display:none}
.ai-coding-preview-title{display:flex;align-items:center;justify-content:space-between;padding:9px 2px 0;border:0;color:rgba(255,255,255,.48);font-size:9px;font-weight:560}
.ai-coding-preview-title>b{display:flex;gap:8px;color:rgba(255,255,255,.35)!important;font-size:9px;font-weight:500;font-variant-numeric:tabular-nums}
.ai-coding-preview-title i,.ai-coding-preview-title em{color:rgba(255,255,255,.42)!important;font-style:normal}

.ai-diff-panel{display:grid;gap:6px;min-width:0}
.ai-diff-file{overflow:hidden;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#040404}
.ai-diff-file summary{min-height:39px;display:flex;align-items:center;gap:8px;padding:7px 9px;cursor:pointer;list-style:none;user-select:none;background:#080808}
.ai-diff-file summary::-webkit-details-marker{display:none}
.ai-diff-file summary::before{content:"›";flex:0 0 auto;color:rgba(255,255,255,.3);font:500 16px/1 var(--font-main);transform:rotate(0);transition:transform .16s ease}
.ai-diff-file[open] summary::before{transform:rotate(90deg)}
.ai-diff-path{min-width:0;overflow:hidden;color:rgba(255,255,255,.68)!important;font:540 9px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace!important;white-space:nowrap;text-overflow:ellipsis}
.ai-diff-stats{display:flex;flex:0 0 auto;gap:7px;margin-left:auto;color:rgba(255,255,255,.34)!important;font:550 9px/1 var(--font-num)!important;font-variant-numeric:tabular-nums}
.ai-diff-stats .added,.ai-diff-stats .removed{color:rgba(255,255,255,.4)!important}
.ai-diff-body{max-height:none;overflow-x:auto;overflow-y:visible;border-top:1px solid rgba(255,255,255,.055);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:1;transform:none;animation:none;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.13) transparent}
.ai-diff-body::-webkit-scrollbar{height:5px}.ai-diff-body::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(255,255,255,.13)}
.ai-diff-hunk{position:relative;padding:6px 9px;border-bottom:1px solid rgba(255,255,255,.04);background:#090909;color:rgba(255,255,255,.28);font:520 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
.ai-diff-line{width:max-content;min-width:100%;min-height:22px;display:grid;grid-template-columns:32px 32px 12px minmax(220px,max-content);align-items:start;border-bottom:1px solid rgba(255,255,255,.018);font:480 10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.ai-diff-line>i{padding:4px 4px;color:rgba(255,255,255,.18)!important;font-style:normal;text-align:right;font-variant-numeric:tabular-nums}.ai-diff-line>b{padding:4px 1px;color:rgba(255,255,255,.26)!important;font-weight:500}.ai-diff-line>code{display:block;min-width:0;overflow:visible;padding:4px 10px 4px 2px;color:rgba(255,255,255,.56);white-space:pre}
.ai-diff-line.add{background:rgba(255,255,255,.035)}.ai-diff-line.add>b,.ai-diff-line.add>code{color:rgba(255,255,255,.82)!important}.ai-diff-line.remove{background:rgba(255,255,255,.014)}.ai-diff-line.remove>b,.ai-diff-line.remove>code{color:rgba(255,255,255,.48)!important}
.ai-diff-truncated{display:none}

.ai-coding-result{width:100%;justify-content:flex-start}.ai-coding-result-card{width:min(100%,680px);overflow:hidden;padding:0;border:1px solid rgba(255,255,255,.085);border-radius:14px;background:#070707;box-shadow:none;animation:aiCodingPanelIn .24s cubic-bezier(.16,1,.3,1) both}
.ai-coding-result-head{min-height:43px;display:flex;align-items:center;gap:0;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)}.ai-coding-result-check{display:none}.ai-coding-result-head>span:last-child{display:block}.ai-coding-result-head small{display:none}.ai-coding-result-head strong{color:rgba(255,255,255,.8);font-size:12px;font-weight:610;letter-spacing:-.01em}
.ai-coding-summary{margin:0!important;padding:10px 12px 11px;border-bottom:1px solid rgba(255,255,255,.055);color:rgba(255,255,255,.48);font-size:11px;line-height:1.5}
.ai-coding-result-stats{display:flex;align-items:center;gap:15px;margin:0;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05)}.ai-coding-result-stats span{display:flex;align-items:baseline;gap:4px;padding:0;background:transparent;text-align:left}.ai-coding-result-stats b{color:rgba(255,255,255,.62);font-size:10px;font-weight:580;font-variant-numeric:tabular-nums}.ai-coding-result-stats small{display:block;color:rgba(255,255,255,.27);font-size:8px;font-weight:500;text-transform:none}.ai-coding-result-stats .added b,.ai-coding-result-stats .removed b{color:rgba(255,255,255,.52)}
.ai-coding-result-context{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05);color:rgba(255,255,255,.28);font-size:8px}.ai-coding-result-context>b{overflow:hidden;color:rgba(255,255,255,.38);font-weight:500;white-space:nowrap;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.ai-coding-result-card>.ai-diff-panel{padding:10px}
.ai-coding-result-link{min-height:37px;margin:0 10px 10px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.075);border-radius:9px;background:transparent;color:rgba(255,255,255,.58);font-size:10px;font-weight:560;text-decoration:none;transition:background .16s ease,color .16s ease}.ai-coding-result-link::after{content:"↗";color:rgba(255,255,255,.3);font-size:13px}.ai-coding-result-link:active{transform:none;background:rgba(255,255,255,.035);color:rgba(255,255,255,.8)}

@keyframes aiCodingSpin{to{transform:rotate(360deg)}}
@keyframes aiCodingPanelIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

@media(max-width:420px){.ai-coding-top>b{max-width:48%;overflow:hidden;text-overflow:ellipsis}.ai-diff-line{grid-template-columns:28px 28px 11px minmax(200px,max-content);font-size:9px}.ai-coding-workbench{border-radius:12px}.ai-coding-result-card{border-radius:12px}.ai-coding-result-stats{gap:11px}}
@media(prefers-reduced-motion:reduce){.ai-coding-workbench,.ai-coding-event,.ai-coding-result-card,.ai-thinking-loader,.ai-diff-file summary::before{animation:none!important;transition:none!important;transform:none!important}.ai-coding-workbench{opacity:1!important}}

`;
