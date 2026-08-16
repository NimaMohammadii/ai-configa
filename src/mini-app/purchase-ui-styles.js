export const PURCHASE_UI_CSS = String.raw`
/* Buy Credits refinements */
html body .credits-page .credits-page-head p{display:none!important}

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

/* Minimal, soft custom-credit slider with a restrained color accent. */
@property --credits-range-progress{syntax:"<percentage>";inherits:false;initial-value:0%}
html body .credits-page .credits-amount-range{
  --credits-slider-accent:#8f86ff;
  width:100%!important;
  height:30px!important;
  margin:10px 0 0!important;
  padding:0!important;
  border:0!important;
  outline:0!important;
  background:transparent!important;
  accent-color:var(--credits-slider-accent)!important;
  -webkit-appearance:none!important;
  appearance:none!important;
  cursor:pointer;
  touch-action:pan-y;
  -webkit-tap-highlight-color:transparent;
  transition:--credits-range-progress .09s cubic-bezier(.22,.8,.22,1)
}
html body .credits-page .credits-amount-range::-webkit-slider-runnable-track{
  height:2px!important;
  border:0!important;
  border-radius:999px!important;
  background:linear-gradient(90deg,rgba(255,255,255,.9) 0 var(--credits-range-progress,0%),rgba(255,255,255,.13) var(--credits-range-progress,0%) 100%)!important
}
html body .credits-page .credits-amount-range::-webkit-slider-thumb{
  -webkit-appearance:none!important;
  appearance:none!important;
  width:17px!important;
  height:17px!important;
  margin-top:-7.5px!important;
  border:3px solid #09090a!important;
  border-radius:50%!important;
  background:var(--credits-slider-accent)!important;
  box-shadow:0 0 0 1px rgba(143,134,255,.56),0 5px 14px rgba(143,134,255,.14)!important;
  transition:transform .18s cubic-bezier(.2,.9,.2,1),box-shadow .2s ease!important
}
html body .credits-page .credits-amount-range:active::-webkit-slider-thumb{
  transform:scale(1.12)!important;
  box-shadow:0 0 0 1px rgba(143,134,255,.78),0 7px 18px rgba(143,134,255,.2)!important
}
html body .credits-page .credits-amount-range:focus-visible::-webkit-slider-thumb{
  box-shadow:0 0 0 1px rgba(143,134,255,.8),0 0 0 5px rgba(143,134,255,.12)!important
}
html body .credits-page .credits-amount-range::-moz-range-track{
  height:2px!important;
  border:0!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.13)!important
}
html body .credits-page .credits-amount-range::-moz-range-progress{
  height:2px!important;
  border:0!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.9)!important
}
html body .credits-page .credits-amount-range::-moz-range-thumb{
  width:11px!important;
  height:11px!important;
  border:3px solid #09090a!important;
  border-radius:50%!important;
  background:var(--credits-slider-accent)!important;
  box-shadow:0 0 0 1px rgba(143,134,255,.56),0 5px 14px rgba(143,134,255,.14)!important;
  transition:transform .18s cubic-bezier(.2,.9,.2,1),box-shadow .2s ease!important
}
html body .credits-page .credits-amount-range:active::-moz-range-thumb{transform:scale(1.12)!important}

@media(max-width:370px){
  html body .credits-page.toman-payment-active .credits-page-head,
  html body .credits-page.tribute-payment-active .credits-page-head{background-position:center center!important;background-size:100% auto!important}
}
`;
