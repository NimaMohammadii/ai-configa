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

/* Compact Bank Card currency selector with the same restrained metallic treatment. */
html body .credits-page .tribute-currency-wrap{
  width:min(78%,280px)!important;
  margin:12px auto 11px!important
}
html body .credits-page .tribute-currency-label{
  margin:0 1px 6px!important
}
html body .credits-page .tribute-currency-picker{
  padding:2px!important;
  border:1px solid rgba(255,255,255,.075)!important;
  border-radius:13px!important;
  background:rgba(15,15,16,.96)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important
}
html body .credits-page .tribute-currency-picker:before{
  left:2px!important;
  top:2px!important;
  bottom:2px!important;
  width:calc((100% - 4px)/3)!important;
  border-radius:10px!important;
  background:
    radial-gradient(circle at 32% 20%,rgba(255,255,255,.98) 0 16%,rgba(255,255,255,0) 40%),
    linear-gradient(145deg,#fff 0%,#f8fafc 24%,#d8dee7 54%,#f5f8fb 76%,#fff 100%)!important;
  background-size:100% 100%,180% 180%!important;
  background-position:center,28% 28%!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.88),inset 0 -1px 0 rgba(105,113,126,.2),0 3px 9px rgba(0,0,0,.24)!important;
  filter:saturate(.92)!important;
  transition:transform .48s cubic-bezier(.16,1,.3,1),background-position .42s ease,box-shadow .3s ease,filter .3s ease!important
}
html body .credits-page .tribute-currency-picker:active:before{
  background-position:center,72% 66%!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.94),inset 0 -1px 0 rgba(105,113,126,.22),0 4px 11px rgba(0,0,0,.27)!important;
  filter:saturate(.96) brightness(1.025)!important
}
html body .credits-page .tribute-currency-picker button{
  height:32px!important;
  padding:0 6px!important;
  border-radius:10px!important;
  font-size:9.5px!important;
  font-weight:760!important;
  transition:color .28s ease,transform .22s cubic-bezier(.16,1,.3,1)!important
}
html body .credits-page .tribute-currency-picker button.active{
  color:#111318!important;
  text-shadow:0 1px 0 rgba(255,255,255,.42)!important
}
html body .credits-page .tribute-currency-picker button:active{
  transform:scale(.965)!important
}

/* Bank Card packs: same black glass language as the rest of Buy Credits, kept intentionally quiet. */
html body .credits-page .credits-tribute-mode{
  width:100%!important;
  max-width:540px!important;
  padding:0 15px calc(env(safe-area-inset-bottom,0px) + 22px)!important
}
html body .credits-page .tribute-card-shell{
  overflow:visible!important;
  padding:0!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important
}
html body .credits-page .tribute-card-head{
  align-items:end!important;
  margin:0 1px 12px!important;
  padding:0!important
}
html body .credits-page .tribute-card-head span{
  font-size:8px!important;
  letter-spacing:.12em!important;
  color:rgba(255,255,255,.28)!important
}
html body .credits-page .tribute-card-head h3{
  margin-top:5px!important;
  font-size:19px!important;
  font-weight:720!important;
  letter-spacing:-.045em!important
}
html body .credits-page .tribute-card-head small{
  padding-bottom:2px!important;
  font-size:8px!important;
  color:rgba(255,255,255,.3)!important
}
html body .credits-page .tribute-product-list{
  display:grid!important;
  gap:8px!important;
  perspective:900px
}
html body .credits-page .tribute-product{
  position:relative!important;
  isolation:isolate!important;
  overflow:hidden!important;
  width:100%!important;
  min-height:68px!important;
  padding:12px 13px 12px 15px!important;
  border:1px solid rgba(255,255,255,.075)!important;
  border-radius:17px!important;
  background:rgba(255,255,255,.032)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.028),0 8px 24px rgba(0,0,0,.09)!important;
  -webkit-tap-highlight-color:transparent!important;
  transform:translateY(8px) scale(.985)!important;
  opacity:0;
  animation:tributePackEnter .52s cubic-bezier(.16,1,.3,1) forwards!important;
  transition:transform .26s cubic-bezier(.16,1,.3,1),background .24s ease,border-color .24s ease,box-shadow .24s ease!important;
  will-change:transform,opacity
}
html body .credits-page .tribute-product:nth-child(1){animation-delay:.02s!important}
html body .credits-page .tribute-product:nth-child(2){animation-delay:.065s!important}
html body .credits-page .tribute-product:nth-child(3){animation-delay:.11s!important}
html body .credits-page .tribute-product:nth-child(4){animation-delay:.155s!important}
html body .credits-page .tribute-product:nth-child(5){animation-delay:.2s!important}
html body .credits-page .tribute-product:before{
  content:"";
  position:absolute;
  z-index:-1;
  inset:-1px;
  opacity:0;
  pointer-events:none;
  background:radial-gradient(120px 56px at 84% 22%,rgba(255,255,255,.075),transparent 72%);
  transition:opacity .24s ease
}
html body .credits-page .tribute-product:after{
  content:"›";
  display:grid;
  place-items:center;
  width:22px;
  height:22px;
  margin-left:1px;
  flex:0 0 22px;
  border-radius:50%;
  color:rgba(255,255,255,.42);
  background:rgba(255,255,255,.045);
  font-size:18px;
  line-height:1;
  font-weight:420;
  transition:transform .28s cubic-bezier(.16,1,.3,1),color .22s ease,background .22s ease
}
html body .credits-page .tribute-product:hover,
html body .credits-page .tribute-product:focus-visible{
  border-color:rgba(255,255,255,.12)!important;
  background:rgba(255,255,255,.052)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 10px 26px rgba(0,0,0,.13)!important
}
html body .credits-page .tribute-product:hover:before,
html body .credits-page .tribute-product:focus-visible:before{opacity:1}
html body .credits-page .tribute-product:hover:after,
html body .credits-page .tribute-product:focus-visible:after{
  transform:translateX(1.5px);
  color:rgba(255,255,255,.7);
  background:rgba(255,255,255,.07)
}
html body .credits-page .tribute-product:active{
  transform:scale(.978)!important;
  background:rgba(255,255,255,.068)!important;
  border-color:rgba(255,255,255,.13)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important
}
html body .credits-page .tribute-product.loading{
  opacity:.66!important;
  transform:scale(.986)!important;
  pointer-events:none!important
}
html body .credits-page .tribute-product-main{
  min-width:0!important;
  flex:1 1 auto!important
}
html body .credits-page .tribute-product-main strong{
  font-size:16px!important;
  line-height:1.05!important;
  font-weight:735!important;
  letter-spacing:-.04em!important
}
html body .credits-page .tribute-product-main small{
  margin-top:6px!important;
  font-size:8.25px!important;
  line-height:1.2!important;
  color:rgba(255,255,255,.34)!important
}
html body .credits-page .tribute-product-price{
  min-width:70px!important;
  margin-left:8px!important;
  text-align:right!important
}
html body .credits-page .tribute-product-price strong{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:56px!important;
  height:31px!important;
  padding:0 10px!important;
  border:1px solid rgba(255,255,255,.08)!important;
  border-radius:11px!important;
  background:rgba(255,255,255,.055)!important;
  color:#fff!important;
  font-size:13px!important;
  font-weight:730!important;
  letter-spacing:-.025em!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important
}
html body .credits-page .tribute-product-price small{
  margin-top:5px!important;
  font-size:7px!important;
  line-height:1!important;
  letter-spacing:.04em!important;
  color:rgba(255,255,255,.27)!important
}
html body .credits-page .tribute-payment-state{
  margin-top:10px!important;
  border:1px solid rgba(255,255,255,.065)!important;
  background:rgba(255,255,255,.025)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important
}
html body .credits-page .tribute-footnote{
  margin-top:13px!important;
  color:rgba(255,255,255,.27)!important
}
@keyframes tributePackEnter{
  from{opacity:0;transform:translateY(8px) scale(.985)}
  to{opacity:1;transform:translateY(0) scale(1)}
}

@media(prefers-reduced-motion:reduce){
  html body .credits-page .credits-amount-range{transition:none!important}
  html body .credits-page .credits-amount-range::-webkit-slider-runnable-track,
  html body .credits-page .credits-amount-range::-webkit-slider-thumb,
  html body .credits-page .credits-amount-range::-moz-range-track,
  html body .credits-page .credits-amount-range::-moz-range-thumb,
  html body .credits-page .tribute-currency-picker:before,
  html body .credits-page .tribute-currency-picker button,
  html body .credits-page .tribute-product,
  html body .credits-page .tribute-product:after{animation:none!important;transition:none!important}
  html body .credits-page .tribute-product{opacity:1!important;transform:none!important}
}

@media(max-width:370px){
  html body .credits-page.toman-payment-active .credits-page-head,
  html body .credits-page.tribute-payment-active .credits-page-head{background-position:center center!important;background-size:100% auto!important}
  html body .credits-page .tribute-currency-wrap{width:min(82%,260px)!important}
  html body .credits-page .credits-tribute-mode{padding-left:12px!important;padding-right:12px!important}
  html body .credits-page .tribute-product{min-height:64px!important;padding-left:13px!important;padding-right:11px!important}
  html body .credits-page .tribute-product-main strong{font-size:15px!important}
  html body .credits-page .tribute-product-price{min-width:64px!important;margin-left:5px!important}
  html body .credits-page .tribute-product-price strong{min-width:52px!important;padding:0 8px!important}
}
`;
