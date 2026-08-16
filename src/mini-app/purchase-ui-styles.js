export const PURCHASE_UI_CSS = String.raw`
/* Buy Credits refinements */
html body .credits-page .credits-page-head p{display:none!important}
html body .credits-page .tribute-section-copy>div>span{display:none!important}
html body .credits-page .tribute-section-copy>div>h3{margin-top:0!important}

/* Payment-specific heroes reuse the exact Stars header framing and fades. */
html body .credits-page.toman-payment-active .credits-page-head{
  background-color:#000!important;
  background-image:url("/mini-app/payment-hero/toman"),url("/mini-app/assets/toman-checkout-hero-628cea8287db.png")!important;
  background-position:center center,center center!important;
  background-size:100% auto,100% auto!important;
  background-repeat:no-repeat,no-repeat!important
}
html body .credits-page.tribute-payment-active .credits-page-head{
  background-color:#000!important;
  background-image:url("/mini-app/payment-hero/card")!important;
  background-position:center center!important;
  background-size:100% auto!important;
  background-repeat:no-repeat!important
}
html body .credits-page.toman-payment-active .credits-page-head:before,
html body .credits-page.tribute-payment-active .credits-page-head:before{
  content:""!important;
  display:block!important;
  position:absolute!important;
  z-index:-1!important;
  inset:0!important;
  opacity:1!important;
  filter:none!important;
  background:linear-gradient(90deg,rgba(0,0,0,.98) 0%,rgba(0,0,0,.78) 31%,rgba(0,0,0,.08) 67%,rgba(0,0,0,.22) 100%)!important
}
html body .credits-page.toman-payment-active .credits-page-head:after,
html body .credits-page.tribute-payment-active .credits-page-head:after{
  content:""!important;
  display:block!important;
  position:absolute!important;
  z-index:-1!important;
  left:0!important;
  right:0!important;
  bottom:-1px!important;
  height:50px!important;
  background:linear-gradient(180deg,transparent,#000)!important
}

/* Premium custom-credit slider: one metallic white thumb + softly tinted white progress. */
@property --credits-range-progress{syntax:"<percentage>";inherits:false;initial-value:0%}
html body .credits-page .credits-amount-range{
  width:100%!important;
  height:34px!important;
  margin:8px 0 0!important;
  padding:0!important;
  border:0!important;
  outline:0!important;
  background:transparent!important;
  -webkit-appearance:none!important;
  appearance:none!important;
  cursor:grab;
  touch-action:pan-y;
  -webkit-tap-highlight-color:transparent;
  transition:--credits-range-progress .2s cubic-bezier(.16,1,.3,1),filter .24s ease!important
}
html body .credits-page .credits-amount-range:active{
  cursor:grabbing;
  filter:brightness(1.08)
}
html body .credits-page .credits-amount-range::-webkit-slider-runnable-track{
  height:3px!important;
  border:0!important;
  border-radius:999px!important;
  background-color:rgba(255,255,255,.11)!important;
  background-image:linear-gradient(90deg,#fff 0%,#f8fbff 32%,#eaf0ff 58%,#f5edff 78%,#fff 100%)!important;
  background-size:var(--credits-range-progress,0%) 100%!important;
  background-position:left center!important;
  background-repeat:no-repeat!important;
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.04)!important;
  transition:background-size .2s cubic-bezier(.16,1,.3,1),filter .24s ease,box-shadow .24s ease!important
}
html body .credits-page .credits-amount-range:active::-webkit-slider-runnable-track{
  filter:brightness(1.12)!important;
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06),0 0 12px rgba(214,220,255,.08)!important
}
html body .credits-page .credits-amount-range::-webkit-slider-thumb{
  -webkit-appearance:none!important;
  appearance:none!important;
  width:17px!important;
  height:17px!important;
  margin-top:-7px!important;
  border:0!important;
  border-radius:50%!important;
  background:
    radial-gradient(circle at 34% 28%,#fff 0 18%,rgba(255,255,255,.95) 19%,rgba(255,255,255,0) 40%),
    linear-gradient(145deg,#fff 0%,#f7f9fc 27%,#dce2eb 58%,#f9fbff 78%,#fff 100%)!important;
  background-size:100% 100%,180% 180%!important;
  background-position:center,30% 30%!important;
  box-shadow:0 2px 5px rgba(0,0,0,.44),0 7px 16px rgba(203,211,255,.16)!important;
  transform:translateY(0) scale(1)!important;
  transform-origin:center!important;
  will-change:transform,box-shadow,filter,background-position;
  transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s ease,filter .3s ease,background-position .45s ease!important
}
html body .credits-page .credits-amount-range:hover::-webkit-slider-thumb{
  transform:translateY(-.25px) scale(1.055)!important;
  background-position:center,70% 65%!important;
  box-shadow:0 3px 7px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.2)!important
}
html body .credits-page .credits-amount-range:active::-webkit-slider-thumb{
  animation:creditsMetallicThumbDrag 1.05s cubic-bezier(.45,0,.55,1) infinite alternate!important;
  box-shadow:0 3px 8px rgba(0,0,0,.42),0 10px 23px rgba(202,210,255,.24)!important;
  filter:brightness(1.055)
}
html body .credits-page .credits-amount-range:focus-visible::-webkit-slider-thumb{
  transform:scale(1.07)!important;
  box-shadow:0 3px 8px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.22)!important
}
html body .credits-page .credits-amount-range::-moz-range-track{
  height:3px!important;
  border:0!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.11)!important;
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.04)!important;
  transition:filter .24s ease,box-shadow .24s ease!important
}
html body .credits-page .credits-amount-range::-moz-range-progress{
  height:3px!important;
  border:0!important;
  border-radius:999px!important;
  background:linear-gradient(90deg,#fff 0%,#f8fbff 32%,#eaf0ff 58%,#f5edff 78%,#fff 100%)!important
}
html body .credits-page .credits-amount-range::-moz-range-thumb{
  width:17px!important;
  height:17px!important;
  border:0!important;
  border-radius:50%!important;
  background:
    radial-gradient(circle at 34% 28%,#fff 0 18%,rgba(255,255,255,.95) 19%,rgba(255,255,255,0) 40%),
    linear-gradient(145deg,#fff 0%,#f7f9fc 27%,#dce2eb 58%,#f9fbff 78%,#fff 100%)!important;
  background-size:100% 100%,180% 180%!important;
  background-position:center,30% 30%!important;
  box-shadow:0 2px 5px rgba(0,0,0,.44),0 7px 16px rgba(203,211,255,.16)!important;
  transform:translateY(0) scale(1)!important;
  transform-origin:center!important;
  will-change:transform,box-shadow,filter,background-position;
  transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s ease,filter .3s ease,background-position .45s ease!important
}
html body .credits-page .credits-amount-range:hover::-moz-range-thumb{
  transform:translateY(-.25px) scale(1.055)!important;
  background-position:center,70% 65%!important;
  box-shadow:0 3px 7px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.2)!important
}
html body .credits-page .credits-amount-range:active::-moz-range-thumb{
  animation:creditsMetallicThumbDrag 1.05s cubic-bezier(.45,0,.55,1) infinite alternate!important;
  box-shadow:0 3px 8px rgba(0,0,0,.42),0 10px 23px rgba(202,210,255,.24)!important;
  filter:brightness(1.055)
}
html body .credits-page .credits-amount-range:focus-visible::-moz-range-thumb{
  transform:scale(1.07)!important;
  box-shadow:0 3px 8px rgba(0,0,0,.42),0 9px 20px rgba(203,211,255,.22)!important
}
@keyframes creditsMetallicThumbDrag{
  0%{transform:translateY(0) scale(1.07);background-position:center,28% 28%}
  100%{transform:translateY(-.4px) scale(1.12);background-position:center,76% 70%}
}
@media(prefers-reduced-motion:reduce){
  html body .credits-page .credits-amount-range{transition:none!important}
  html body .credits-page .credits-amount-range::-webkit-slider-runnable-track,
  html body .credits-page .credits-amount-range::-webkit-slider-thumb,
  html body .credits-page .credits-amount-range::-moz-range-track,
  html body .credits-page .credits-amount-range::-moz-range-thumb{animation:none!important;transition:none!important}
}

@media(max-width:370px){
  html body .credits-page.toman-payment-active .credits-page-head,
  html body .credits-page.tribute-payment-active .credits-page-head{background-position:center center!important;background-size:100% auto!important}
}
`;
