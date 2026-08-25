export const PURCHASE_UI_CSS = String.raw`
/* Admin-only AI chat entry: fail closed until the authenticated session confirms admin. */
html body #aiChatOpen{display:none!important}
html body.ai-chat-admin #aiChatOpen{display:grid!important}

/* Buy Credits refinements */
html body .credits-page .credits-page-head>div{display:none!important}
html body .credits-page .credits-page-head{margin-bottom:32px!important}
html body .credits-page .credits-page-head p{display:none!important}
html body .credits-page .tribute-section-copy>div>span{display:none!important}
html body .credits-page .tribute-section-copy>div>h3{margin-top:0!important}

/* Stars hero: keep the original 1440x680 asset, only scale it slightly and move it down. */
html body .credits-page:not(.toman-payment-active):not(.tribute-payment-active) .credits-page-head{
  background-size:106% auto!important;
  background-position:58% calc(50% + 8px)!important
}

/* Payment-specific heroes reuse the same header framing. */
html body .credits-page.toman-payment-active .credits-page-head{
  background-color:#000!important;
  background-image:url("/mini-app/payment-hero/toman")!important;
  background-position:center calc(50% + 8px)!important;
  background-size:100% auto!important;
  background-repeat:no-repeat!important
}
html body .credits-page.tribute-payment-active .credits-page-head{
  background-color:#000!important;
  background-image:url("/mini-app/payment-hero/card")!important;
  background-position:center calc(50% + 8px)!important;
  background-size:100% auto!important;
  background-repeat:no-repeat!important
}
html body .credits-page.toman-payment-active .credits-page-head:before,
html body .credits-page.tribute-payment-active .credits-page-head:before{
  content:""!important;display:block!important;position:absolute!important;z-index:-1!important;inset:0!important;opacity:1!important;filter:none!important;
  background:transparent!important
}
html body .credits-page.toman-payment-active .credits-page-head:after,
html body .credits-page.tribute-payment-active .credits-page-head:after{
  content:""!important;display:block!important;position:absolute!important;z-index:-1!important;left:0!important;right:0!important;bottom:-1px!important;height:50px!important;
  background:linear-gradient(180deg,transparent,#000)!important
}

/* Premium custom-credit slider. */
@property --credits-range-progress{syntax:"<percentage>";inherits:false;initial-value:0%}
html body .credits-page .credits-amount-range{
  width:100%!important;height:34px!important;margin:8px 0 0!important;padding:0!important;border:0!important;outline:0!important;background:transparent!important;
  -webkit-appearance:none!important;appearance:none!important;cursor:grab;touch-action:pan-y;-webkit-tap-highlight-color:transparent;
  transition:--credits-range-progress .2s cubic-bezier(.16,1,.3,1),filter .24s ease!important
}
html body .credits-page .credits-amount-range:active{cursor:grabbing;filter:brightness(1.08)}
html body .credits-page .credits-amount-range::-webkit-slider-runnable-track{
  height:3px!important;border:0!important;border-radius:999px!important;background-color:rgba(255,255,255,.11)!important;
  background-image:linear-gradient(90deg,#fff 0%,#f8fbff 32%,#eaf0ff 58%,#f5edff 78%,#fff 100%)!important;
  background-size:var(--credits-range-progress,0%) 100%!important;background-position:left center!important;background-repeat:no-repeat!important;
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.04)!important;
  transition:background-size .2s cubic-bezier(.16,1,.3,1),filter .24s ease,box-shadow .24s ease!important
}
html body .credits-page .credits-amount-range:active::-webkit-slider-runnable-track{filter:brightness(1.12)!important;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06),0 0 12px rgba(214,220,255,.08)!important}
html body .credits-page .credits-amount-range::-webkit-slider-thumb{
  -webkit-appearance:none!important;appearance:none!important;width:17px!important;height:17px!important;margin-top:-7px!important;border:0!important;border-radius:50%!important;
  background:radial-gradient(circle at 34% 28%,#fff 0 18%,rgba(255,255,255,.95) 19%,rgba(255,255,255,0) 40%),linear-gradient(145deg,#fff 0%,#f7f9fc 27%,#dce2eb 58%,#f9fbff 78%,#fff 100%)!important;
  background-size:100% 100%,180% 180%!important;background-position:center,30% 30%!important;
  box-shadow:0 2px 5px rgba(0,0,0,.44),0 7px 16px rgba(203,211,255,.16)!important;
  transform:translateY(0) scale(1)!important;transform-origin:center!important;will-change:transform,box-shadow,filter,background-position;
  transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s ease,filter .3s ease,background-position .45s ease!important
}
html body .credits-page .credits-amount-range:hover::-webkit-slider-thumb{transform:translateY(-.25px) scale(1.055)!important;background-position:center,70% 65%!important;box-shadow:0 3px 7px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.2)!important}
html body .credits-page .credits-amount-range:active::-webkit-slider-thumb{animation:creditsMetallicThumbDrag 1.05s cubic-bezier(.45,0,.55,1) infinite alternate!important;box-shadow:0 3px 8px rgba(0,0,0,.42),0 10px 23px rgba(202,210,255,.24)!important;filter:brightness(1.055)}
html body .credits-page .credits-amount-range:focus-visible::-webkit-slider-thumb{transform:scale(1.07)!important;box-shadow:0 3px 8px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.22)!important}
html body .credits-page .credits-amount-range::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.11)!important;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.04)!important}
html body .credits-page .credits-amount-range::-moz-range-progress{height:3px!important;border:0!important;border-radius:999px!important;background:linear-gradient(90deg,#fff 0%,#f8fbff 32%,#eaf0ff 58%,#f5edff 78%,#fff 100%)!important}
html body .credits-page .credits-amount-range::-moz-range-thumb{
  width:17px!important;height:17px!important;border:0!important;border-radius:50%!important;
  background:radial-gradient(circle at 34% 28%,#fff 0 18%,rgba(255,255,255,.95) 19%,rgba(255,255,255,0) 40%),linear-gradient(145deg,#fff 0%,#f7f9fc 27%,#dce2eb 58%,#f9fbff 78%,#fff 100%)!important;
  background-size:100% 100%,180% 180%!important;background-position:center,30% 30%!important;
  box-shadow:0 2px 5px rgba(0,0,0,.44),0 7px 16px rgba(203,211,255,.16)!important;
  transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s ease,filter .3s ease,background-position .45s ease!important
}
@keyframes creditsMetallicThumbDrag{0%{transform:translateY(0) scale(1.07);background-position:center,28% 28%}100%{transform:translateY(-.4px) scale(1.12);background-position:center,76% 70%}}

/* Bank Card uses the exact shared Stars package-card classes. */
html body .credits-page .credits-payment-switch.tribute-switch{--tribute-count:2;--tribute-shift:0%;display:grid!important;grid-template-columns:repeat(var(--tribute-count),minmax(0,1fr))!important}
html body .credits-page .credits-payment-switch.tribute-switch:before{left:3px!important;right:auto!important;width:calc((100% - 6px)/var(--tribute-count))!important;transform:translateX(var(--tribute-shift))!important;transition:transform .44s cubic-bezier(.22,1,.36,1),width .32s ease!important}
html body .credits-page .credits-payment-switch.tribute-switch button{min-width:0!important;white-space:nowrap!important}
html body .credits-page .credits-payment-switch.tribute-switch button[hidden]{display:none!important}
html body .credits-page.tribute-payment-active .credits-balance{bottom:8px!important}

html body .credits-page .credits-tribute-mode{width:100%!important;max-width:540px!important;margin:0 auto!important;padding:0 15px calc(env(safe-area-inset-bottom,0px) + 22px)!important}
html body .credits-page .credits-tribute-mode.active{display:block!important;animation:tributeModeIn .48s cubic-bezier(.16,1,.3,1) both!important}
html body .credits-page .tribute-card-shell{position:relative!important;overflow:visible!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html body .credits-page .tribute-card-head{display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:12px!important;margin:0 1px 12px!important;padding:0!important}
html body .credits-page .tribute-card-head span{display:block!important;color:rgba(255,255,255,.32)!important;font-size:8px!important;font-weight:800!important;letter-spacing:.12em!important}
html body .credits-page .tribute-card-head h3{margin:4px 0 0!important;font-size:19px!important;font-weight:720!important;letter-spacing:-.045em!important}
html body .credits-page .tribute-card-head small{padding-bottom:2px!important;color:rgba(255,255,255,.34)!important;font-size:8px!important;white-space:nowrap!important}

/* Bank Card tiers: quiet material, crisp hierarchy, restrained color. */
html body .credits-page #tributeProductList{gap:9px!important}
html body .credits-page .credits-tribute-mode .credits-pack{
  --tier-rgb:185,191,200;
  position:relative!important;width:100%!important;min-height:78px!important;padding:14px 15px!important;overflow:hidden!important;
  border:1px solid rgba(255,255,255,.085)!important;border-radius:16px!important;
  background:linear-gradient(180deg,rgba(255,255,255,.026),rgba(255,255,255,.009)),#111214!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.055),inset 0 -1px 0 rgba(255,255,255,.015),0 7px 18px rgba(0,0,0,.18)!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  text-align:left!important;-webkit-tap-highlight-color:transparent;transform:translateZ(0);will-change:transform,background,border-color;
  transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease,border-color .2s ease!important
}
html body .credits-page .credits-tribute-mode .credits-pack:before{
  content:""!important;position:absolute!important;left:14px!important;top:0!important;width:34px!important;height:1px!important;
  background:rgba(var(--tier-rgb),.72)!important;opacity:.7!important;pointer-events:none!important
}
html body .credits-page .credits-tribute-mode .credits-pack-main{display:flex!important;width:100%!important;min-width:0!important;flex-direction:column!important;align-items:stretch!important;gap:7px!important}
html body .credits-page .credits-tribute-mode .credits-pack-title{display:flex!important;width:100%!important;min-width:0!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}
html body .credits-page .credits-tribute-mode .credits-pack-title strong{color:#f7f7f8!important;font-size:19px!important;font-weight:720!important;line-height:1!important;letter-spacing:-.04em!important;font-variant-numeric:tabular-nums!important;text-shadow:none!important}
html body .credits-page .credits-tribute-mode .credits-pack-title em{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:21px!important;padding:0 8px!important;border:1px solid rgba(var(--tier-rgb),.17)!important;border-radius:999px!important;background:rgba(var(--tier-rgb),.065)!important;color:rgba(var(--tier-rgb),.96)!important;box-shadow:none!important;font-size:8px!important;font-style:normal!important;font-weight:760!important;line-height:1!important;letter-spacing:.045em!important;white-space:nowrap!important}
html body .credits-page .credits-tribute-mode .credits-pack-title em:before{content:""!important;width:4px!important;height:4px!important;margin-right:5px!important;border-radius:50%!important;background:rgb(var(--tier-rgb))!important;box-shadow:0 0 0 2px rgba(var(--tier-rgb),.08)!important}
html body .credits-page .credits-tribute-mode .credits-pack-total{display:block!important;margin:0!important;color:rgba(255,255,255,.42)!important;font-size:9.5px!important;font-weight:540!important;line-height:1.35!important;letter-spacing:0!important}

html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_2"]{--tier-rgb:184,190,200}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_5"]{--tier-rgb:84,164,220}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_10"]{--tier-rgb:154,122,218}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_20"]{
  --tier-rgb:188,150,222;
  border-color:rgba(255,255,255,.11)!important;
  background:linear-gradient(180deg,rgba(255,255,255,.032),rgba(255,255,255,.01)),#121216!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.065),inset 0 -1px 0 rgba(255,255,255,.016),0 8px 20px rgba(0,0,0,.19)!important
}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_20"]:before{
  width:52px!important;background:linear-gradient(90deg,rgba(82,162,218,.85),rgba(155,124,218,.88) 52%,rgba(216,164,112,.82))!important
}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_20"] .credits-pack-title em{
  border-color:rgba(255,255,255,.12)!important;
  background:linear-gradient(105deg,rgba(82,162,218,.06),rgba(155,124,218,.075) 52%,rgba(216,164,112,.055))!important;
  color:rgba(244,241,248,.9)!important
}
html body .credits-page .credits-tribute-mode .credits-pack[data-catalog-id="card_20"] .credits-pack-title em:before{
  background:linear-gradient(135deg,rgb(82,162,218),rgb(155,124,218) 55%,rgb(216,164,112))!important;box-shadow:none!important
}
html body .credits-page .credits-tribute-mode .credits-pack:focus-visible{outline:0!important;border-color:rgba(var(--tier-rgb),.28)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 0 0 2px rgba(var(--tier-rgb),.075),0 8px 20px rgba(0,0,0,.19)!important}
html body .credits-page .credits-tribute-mode .credits-pack:active{transform:scale(.988)!important;background:linear-gradient(180deg,rgba(255,255,255,.032),rgba(255,255,255,.012)),#121315!important}
@media(hover:hover){
  html body .credits-page .credits-tribute-mode .credits-pack:hover{transform:translateY(-1px)!important;border-color:rgba(255,255,255,.12)!important;background:linear-gradient(180deg,rgba(255,255,255,.034),rgba(255,255,255,.011)),#121315!important}
}

html body .credits-page .tribute-currency-picker{
  --tribute-currency-count:1;--tribute-currency-shift:0%;position:relative!important;display:grid!important;grid-template-columns:repeat(var(--tribute-currency-count),minmax(0,1fr))!important;
  width:min(78%,280px)!important;margin:0 auto 12px!important;padding:3px!important;overflow:hidden!important;border:0!important;border-radius:16px!important;
  background:var(--ticket-glass-bg,rgba(13,13,13,.62))!important;
  box-shadow:var(--ticket-glass-shadow,inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22))!important;
  backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important
}
html body .credits-page .tribute-currency-picker[hidden]{display:none!important}
html body .credits-page .tribute-currency-picker:before{content:""!important;position:absolute!important;z-index:0!important;left:3px!important;top:3px!important;bottom:3px!important;width:calc((100% - 6px)/var(--tribute-currency-count))!important;border-radius:13px!important;background:rgba(255,255,255,.92)!important;box-shadow:0 2px 9px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.88)!important;transform:translateX(var(--tribute-currency-shift))!important;transition:transform .42s cubic-bezier(.16,1,.3,1)!important}
html body .credits-page .tribute-currency-picker button{position:relative!important;z-index:1!important;height:34px!important;padding:0 8px!important;border:0!important;border-radius:13px!important;background:transparent!important;color:rgba(255,255,255,.48)!important;font-size:9.5px!important;font-weight:760!important;transition:color .24s ease,transform .2s cubic-bezier(.16,1,.3,1)!important}
html body .credits-page .tribute-currency-picker button.active{color:#101114!important}
html body .credits-page .tribute-currency-picker button:active{transform:scale(.97)!important}

html body .credits-page .tribute-footnote{margin:13px auto 0!important;text-align:center!important;color:rgba(255,255,255,.3)!important;font-size:8.5px!important;line-height:1.55!important}
html body .credits-page .tribute-footnote span{color:#fff!important}

@keyframes tributeModeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

@media(prefers-reduced-motion:reduce){
  html body .credits-page .credits-amount-range,
  html body .credits-page .credits-amount-range::-webkit-slider-runnable-track,
  html body .credits-page .credits-amount-range::-webkit-slider-thumb,
  html body .credits-page .credits-amount-range::-moz-range-track,
  html body .credits-page .credits-amount-range::-moz-range-thumb,
  html body .credits-page .tribute-currency-picker:before,
  html body .credits-page .tribute-currency-picker button,
  html body .credits-page .credits-tribute-mode,
  html body .credits-page .credits-tribute-mode .credits-pack{animation:none!important;transition:none!important}
}

@media(max-width:370px){
  html body .credits-page.toman-payment-active .credits-page-head{background-position:center calc(50% + 8px)!important;background-size:100% auto!important}
  html body .credits-page.tribute-payment-active .credits-page-head{background-position:center calc(50% + 8px)!important;background-size:100% auto!important}
  html body .credits-page .tribute-currency-picker{width:min(82%,260px)!important}
  html body .credits-page .credits-tribute-mode{padding-left:12px!important;padding-right:12px!important}
  html body .credits-page .credits-payment-switch.tribute-switch button{font-size:9px!important;padding:0 5px!important}
  html body .credits-page .credits-tribute-mode .credits-pack{min-height:74px!important;padding:13px 14px!important;border-radius:15px!important}
  html body .credits-page .credits-tribute-mode .credits-pack-title strong{font-size:18px!important}
}

/* Reward wheel: keep the Buy Credits DOM and controls untouched. */
html body #wheelOpenButton{display:none!important}
html body:has(#creditsPage.show) .tts-head{position:static!important;z-index:auto!important}
html body:has(#creditsPage.show) #wheelOpenButton{
  display:grid!important;
  position:fixed!important;
  z-index:106!important;
  top:calc(22px + env(safe-area-inset-top))!important;
  right:18px!important;
  margin:0!important
}
`;