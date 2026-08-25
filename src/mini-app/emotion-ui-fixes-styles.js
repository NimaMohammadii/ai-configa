export const EMOTION_UI_FIXES_CSS = String.raw`
.player-history-row{position:relative}
.emotion-trigger,.player-history-row>.emotion-trigger{position:absolute!important;z-index:4;right:0!important;top:-54px!important;bottom:auto!important;width:46px!important;min-width:46px!important;height:46px!important;flex:0 0 46px!important;border-radius:50%!important;padding:0!important;display:grid!important;place-items:center!important;gap:0!important;background:rgba(255,255,255,.055)!important;color:rgba(255,255,255,.88)!important;border:1px solid rgba(255,255,255,.15)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 14px 34px rgba(0,0,0,.4)!important;animation:emotionButtonLift .34s cubic-bezier(.16,.9,.22,1)}
.emotion-trigger-icon{display:none!important}
.emotion-real-icon{display:block;width:22px;height:22px;filter:drop-shadow(0 1px 4px rgba(255,255,255,.08));transition:transform .24s cubic-bezier(.2,.9,.2,1)}
.emotion-trigger:active .emotion-real-icon,.emotion-trigger.active .emotion-real-icon{transform:scale(.9) rotate(-4deg)}
body.emotion-audio-ready:not(.keyboard-open):not(.image-mode) .player-history-row .emotion-trigger{right:0!important;top:-54px!important;width:46px!important;min-width:46px!important;height:46px!important}
.emotion-head{display:none!important}
.emotion-backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.emotion-card{left:24px!important;right:24px!important;max-width:410px!important;max-height:min(42dvh,350px)!important;bottom:calc(108px + env(safe-area-inset-bottom))!important;border-radius:22px!important;padding:7px 9px 9px!important}
.emotion-handle{margin-bottom:8px!important}.emotion-search{height:37px!important;flex-basis:37px!important}.emotion-categories{padding-top:7px!important;padding-bottom:6px!important}.emotion-list{gap:5px!important}.emotion-tag{min-height:46px!important;padding:7px 8px!important;border-radius:13px!important}
body.keyboard-open .emotion-panel{display:none!important}
.tts-area{position:relative}
.emotion-text-overlay{position:absolute;z-index:1;box-sizing:border-box;padding:4px 2px 2px;overflow:hidden;pointer-events:none;color:#fff;background:transparent;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;font-size:16px;line-height:1.55;font-weight:430;letter-spacing:-.02em;text-align:start}
.emotion-text-content{min-height:100%;transform:translateY(0);transform-origin:top left;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}
.emotion-text-content.placeholder{color:rgba(255,255,255,.28);direction:ltr!important;text-align:left!important}
.emotion-inline-tag{display:inline;color:#e5b8ff;font:inherit;line-height:inherit;letter-spacing:inherit;vertical-align:baseline;background:rgba(213,145,255,.28);border:0;border-radius:6px;padding:.055em .21em .12em;margin:0 .02em;box-shadow:inset 0 0 0 1px rgba(229,184,255,.44);-webkit-box-decoration-break:clone;box-decoration-break:clone}
body.emotion-highlight-ready .tts-area textarea{position:relative;z-index:2;color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:#fff!important}
body.emotion-highlight-ready .tts-area textarea::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important}
body.emotion-highlight-ready .tts-area textarea::selection{background:rgba(122,72,178,.42)}
@keyframes emotionButtonLift{from{opacity:0;transform:translateY(12px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:380px){.emotion-card{left:14px!important;right:14px!important;max-height:min(40dvh,320px)!important}}

/* Preserve the original Voices header and search geometry. */
.voices-page-head{overflow:visible!important}
.voices-page-head>div:first-child{flex:1 1 auto!important;min-width:0!important;overflow:visible!important}
.demo-language-title-row{display:block!important;position:relative!important;width:100%!important;min-width:0!important;overflow:visible!important}
.demo-language-wrap{position:absolute!important;left:auto!important;right:0!important;top:auto!important;bottom:-3px!important;z-index:12!important;height:36px!important;min-height:36px!important;max-height:36px!important;align-self:auto!important;overflow:visible!important;transform:none!important}
.demo-language-wrap .voice-btn{width:auto!important;min-width:116px!important;max-width:132px!important;height:36px!important;min-height:36px!important;max-height:36px!important;padding:0 10px 0 8px!important;gap:7px!important;overflow:hidden!important;white-space:nowrap!important;border:0!important;border-radius:16px!important;background:rgba(13,13,13,.62)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)!important;backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important;transform:none!important}
.demo-language-wrap .voice-btn:active{background:rgba(255,255,255,.105)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(0,0,0,.07),0 5px 14px rgba(0,0,0,.2)!important}
#demoLanguageLabel{min-width:0!important;flex:1 1 auto!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.demo-language-wrap .voice-menu{left:auto!important;right:0!important;top:44px!important;width:230px!important;transform-origin:top right!important}
.demo-language-button-avatar{display:contents!important;border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important}
.demo-language-button-avatar .demo-language-flag{display:block!important;width:28px!important;height:18px!important;flex:0 0 28px!important;border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important;filter:none!important}
@media(max-width:390px){.demo-language-wrap .voice-btn{min-width:112px!important;max-width:124px!important;padding:0 8px!important;gap:6px!important;font-size:12px!important}.demo-language-wrap .voice-menu{width:min(230px,calc(100vw - 32px))!important}}

/* Shared top spacing. */
.app{padding-top:calc(41px + env(safe-area-inset-top))!important}
.tts-head:before{top:calc(-41px - env(safe-area-inset-top))!important}
.voices-page{padding-top:24px!important}
.credits-page-scroll{padding-top:20px!important}

/* Credits hero fine positioning. */
.credits-page-head{background-position:center calc(50% + 12px)!important}
.credits-balance{bottom:12px!important}
@media(max-width:370px){.credits-page-head{background-position:center calc(50% + 12px)!important}.credits-balance{bottom:9px!important}}

/* Share buttons stay flat with no glow, focus halo, or browser appearance. */
.referral-credit-share,.ai-chat-referral-share{box-shadow:none!important;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none!important;appearance:none!important;-webkit-tap-highlight-color:transparent!important}
.referral-credit-share:focus,.referral-credit-share:focus-visible,.referral-credit-share:active,.ai-chat-referral-share:focus,.ai-chat-referral-share:focus-visible,.ai-chat-referral-share:active{box-shadow:none!important;filter:none!important;outline:0!important}

/* History only paints the panel itself; the page above stays visible. */
.history-sheet{background:transparent!important}
.history-backdrop{background:transparent!important}
.history-card{padding:0 16px!important;background:#000!important;box-shadow:none!important}

/* Image creation: referral-style metallic line and clean white-metal actions. */
.image-composer{position:relative!important;border:0!important;overflow:hidden}
.image-composer:before{content:"";position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent);pointer-events:none}
.image-upload-trigger,.image-generate{border:0!important;background:linear-gradient(145deg,#fff 0%,#f2f2f2 34%,#d4d4d4 66%,#f8f8f8 100%)!important;color:#050505!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.16)!important;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none!important;appearance:none!important}
.image-upload-trigger:focus,.image-upload-trigger:focus-visible,.image-upload-trigger:active,.image-generate:focus,.image-generate:focus-visible,.image-generate:active{box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.18)!important;filter:none!important;outline:0!important}

/* Match the primary TTS and Stars checkout actions to the referral metallic finish. */
#convertButton.tts-generate,#customCreditsBuy.credits-primary-button{border:0!important;background:linear-gradient(145deg,#fff 0%,#f5f5f5 21%,#d8d8d8 47%,#bdbdbd 68%,#f7f7f7 100%)!important;color:#050505;box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.2)!important;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none!important;appearance:none!important;font-weight:840!important;letter-spacing:-.018em!important}
#convertButton.tts-generate{border:1px solid rgba(255,255,255,.42)!important;border-radius:10px!important;background-clip:padding-box!important}
#convertButton.tts-generate:focus,#convertButton.tts-generate:focus-visible,#convertButton.tts-generate:active,#customCreditsBuy.credits-primary-button:focus,#customCreditsBuy.credits-primary-button:focus-visible,#customCreditsBuy.credits-primary-button:active{background:linear-gradient(145deg,#efefef 0%,#e0e0e0 28%,#bdbdbd 62%,#ececec 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.28),inset 1px 0 0 rgba(255,255,255,.34),0 4px 10px rgba(0,0,0,.2)!important;filter:none!important;outline:0!important}
#convertButton.tts-generate .tts-generate-wave{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 72%,transparent 100%)!important;mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 72%,transparent 100%)!important}
#convertButton.tts-generate .tts-generate-wave::before,#convertButton.tts-generate .tts-generate-wave::after{display:none!important}

/* TTS credit warning: match the Image prompt card and use the same metallic purchase action. */
#ttsWarningCard.limit-card{position:relative!important;overflow:hidden!important;border:0!important;border-radius:22px!important;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 20px 50px rgba(0,0,0,.26)!important;padding:16px!important}
#ttsWarningCard.limit-card:before{content:"";position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent);pointer-events:none}
#ttsWarningCard.credit-warning-buy{backdrop-filter:blur(15px)!important;-webkit-backdrop-filter:blur(15px)!important}
#ttsWarningCard.credit-warning-buy .limit-icon{box-shadow:none!important;filter:none!important;text-shadow:none!important}
#ttsWarningCard.credit-warning-buy .limit-close{border:0!important;background:linear-gradient(145deg,#fff 0%,#f5f5f5 21%,#d8d8d8 47%,#bdbdbd 68%,#f7f7f7 100%)!important;color:#050505!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.2)!important;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none!important;appearance:none!important;font-size:13px!important;font-weight:840!important;letter-spacing:-.018em!important}
#ttsWarningCard.credit-warning-buy .limit-close:focus,#ttsWarningCard.credit-warning-buy .limit-close:focus-visible,#ttsWarningCard.credit-warning-buy .limit-close:active{background:linear-gradient(145deg,#efefef 0%,#e0e0e0 28%,#bdbdbd 62%,#ececec 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.28),inset 1px 0 0 rgba(255,255,255,.34),0 4px 10px rgba(0,0,0,.2)!important;filter:none!important;outline:0!important}
#ttsWarningCard[dir="rtl"]{font-family:"SF Arabic","Geeza Pro",Tahoma,Arial,sans-serif!important;font-feature-settings:"kern" 1,"liga" 1!important;text-rendering:geometricPrecision!important;-webkit-font-smoothing:antialiased!important;text-align:right!important}
#ttsWarningCard[dir="rtl"] h3{width:100%;margin:0 0 7px!important;font-family:inherit!important;font-size:16px!important;font-weight:800!important;line-height:1.5!important;letter-spacing:0!important;text-align:right!important}
#ttsWarningCard[dir="rtl"] p{width:100%;max-width:none!important;margin:0 0 15px!important;font-family:inherit!important;font-size:12.5px!important;font-weight:560!important;line-height:1.85!important;letter-spacing:0!important;text-align:right!important;word-spacing:0!important;overflow-wrap:normal!important;word-break:normal!important}
#ttsWarningCard[dir="rtl"] .limit-close{font-family:inherit!important;font-weight:800!important;letter-spacing:0!important;line-height:1.4!important;text-align:center!important}
`;