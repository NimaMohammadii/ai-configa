export const TRIBUTE_PAYMENTS_INTEGRATION_JS = String.raw`
(function(){
  if(window.__vexaTributePaymentsLoaded)return;
  window.__vexaTributePaymentsLoaded=true;

  var tg=window.Telegram&&window.Telegram.WebApp;
  var initData=(tg&&tg.initData)||'';
  var config=null;
  var cardModeActive=false;
  var cardBusy=false;
  var pendingCheckBusy=false;
  var lastPendingCheckAt=0;
  var selectedCurrency='usd';
  var PENDING_KEY='vexa_tribute_pending_v2';
  var SUCCESS_KEY='vexa_tribute_success_v1';
  var CURRENCY_KEY='vexa_tribute_currency_v1';

  function q(id){return document.getElementById(id)}
  function number(value){return Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US')}
  function minutes(credits){return (Math.max(0,Number(credits)||0)/1000).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:1})}
  function toast(message){var node=q('toast');if(!node)return;node.textContent=String(message||'').replace(/[.!]+$/,'');node.classList.remove('show');void node.offsetWidth;node.classList.add('show');setTimeout(function(){node.classList.remove('show')},3200)}
  function haptic(kind){if(!tg||!tg.HapticFeedback)return;try{if(kind==='success'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('success');else if(kind==='error'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('error');else if(tg.HapticFeedback.impactOccurred)tg.HapticFeedback.impactOccurred(kind||'light')}catch(error){}}
  function api(path,payload){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({initData:initData},payload||{}))}).then(async function(response){var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Card payment error');return data})}
  function storageGet(key){try{var value=sessionStorage.getItem(key)||localStorage.getItem(key);return value?JSON.parse(value):null}catch(error){return null}}
  function storageSet(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch(error){}try{if(key===CURRENCY_KEY)localStorage.setItem(key,JSON.stringify(value))}catch(error){}}
  function storageRemove(key){try{sessionStorage.removeItem(key)}catch(error){}}

  function currencyInfo(code){
    var list=config&&Array.isArray(config.currencies)?config.currencies:[];
    var clean=String(code||selectedCurrency||'usd').toLowerCase();
    return list.find(function(item){return item&&String(item.code||'').toLowerCase()===clean})||list[0]||{code:'usd',label:'USD',symbol:'$',rateFromUsd:1,minimumMinor:100,maximumMinor:300000,minimumCredits:6000};
  }
  function currentCurrency(){return currencyInfo(selectedCurrency)}
  function money(minor,code){
    var info=currencyInfo(code);
    var amount=Math.max(0,Number(minor)||0)/100;
    return String(info.symbol||'')+amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function minimumLabel(info){
    var item=info||currentCurrency();
    return money(Number(item.minimumMinor)||100,item.code);
  }
  function usdToMinor(usd,info){return Math.max(1,Math.ceil(Math.max(0,Number(usd)||0)*Math.max(.000001,Number((info||currentCurrency()).rateFromUsd)||1)*100))}
  function discountedMinor(minor){var percent=Math.max(0,Math.min(95,Number(config&&config.discountPercent)||0));return percent?Math.max(1,Math.ceil(minor*(100-percent)/100)):minor}

  function installStyles(){
    if(q('tributePaymentsStyles'))return;
    var style=document.createElement('style');
    style.id='tributePaymentsStyles';
    style.textContent='\
.credits-payment-switch.tribute-switch{--tribute-count:2;--tribute-shift:0%;display:grid!important;grid-template-columns:repeat(var(--tribute-count),minmax(0,1fr))!important}\
.credits-payment-switch.tribute-switch:before{left:3px!important;right:auto!important;width:calc((100% - 6px)/var(--tribute-count))!important;transform:translateX(var(--tribute-shift))!important;transition:transform .44s cubic-bezier(.22,1,.36,1),width .32s ease!important}\
.credits-payment-switch.tribute-switch button{min-width:0;white-space:nowrap}\
.credits-payment-switch.tribute-switch button[hidden]{display:none!important}\
.credits-page.tribute-payment-active .credits-page-head{background:#000!important}\
.credits-page.tribute-payment-active .credits-page-head:before,.credits-page.tribute-payment-active .credits-page-head:after{display:none!important}\
.credits-page.tribute-payment-active .credits-page-head p{display:none!important}\
.credits-page.tribute-payment-active .credits-balance{bottom:8px!important}\
.credits-tribute-mode{max-width:540px;margin:0 auto;padding:0 0 calc(env(safe-area-inset-bottom,0px) + 22px)}\
.credits-tribute-mode.active{display:block;animation:tributeModeIn .5s cubic-bezier(.16,.86,.22,1) both}\
.tribute-checkout{position:relative;overflow:hidden}\
.tribute-currency-wrap{position:relative;z-index:1;margin:0 0 13px}\
.tribute-currency-label{display:flex;align-items:center;justify-content:space-between;margin:0 2px 7px;color:rgba(255,255,255,.36);font-size:8px;font-weight:720;letter-spacing:.07em;text-transform:uppercase}\
.tribute-currency-label strong{color:rgba(255,255,255,.62);font-size:8px;font-weight:760;letter-spacing:0;text-transform:none}\
.tribute-currency-picker{--tribute-currency-shift:0%;position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;padding:3px;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:#0f0f10;box-shadow:none}\
.tribute-currency-picker:before{content:"";position:absolute;z-index:0;left:3px;top:3px;bottom:3px;width:calc((100% - 6px)/3);border-radius:12px;background:#fff;box-shadow:none;transform:translateX(var(--tribute-currency-shift));transition:transform .4s cubic-bezier(.22,1,.36,1)}\
.tribute-currency-picker button{position:relative;z-index:1;height:40px;padding:0 8px;border:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:transparent;color:rgba(255,255,255,.44);font-size:10px;font-weight:760;letter-spacing:0;transition:color .25s ease,transform .2s ease}\
.tribute-currency-picker button.active{color:#090909;background:transparent;box-shadow:none}\
.tribute-currency-picker button:active{transform:scale(.97)}\
.tribute-checkout .credits-custom-summary{grid-template-columns:1fr}\
.tribute-minimum{height:14px;margin:8px 0 0;color:rgba(255,255,255,.34);font-size:8px;line-height:1.4}\
.tribute-minimum[hidden]{display:none}\
.tribute-minimum.warn{color:rgba(255,255,255,.72)}\
.tribute-payment-state{position:relative;display:none;align-items:center;gap:11px;margin-top:11px;padding:11px 12px;border:0;border-radius:16px;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);animation:tributeStateIn .36s cubic-bezier(.16,1,.3,1) both}\
.tribute-payment-state.show{display:flex}\
.tribute-state-orb{position:relative;width:34px;height:34px;flex:0 0 34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05)}\
.tribute-state-orb:before{content:"";position:absolute;inset:4px;border-radius:50%;border:1.5px solid rgba(255,255,255,.18);border-top-color:#fff;animation:creditsSpin .8s linear infinite}\
.tribute-state-orb svg{width:17px;height:17px;opacity:0;transform:scale(.6);transition:opacity .2s ease,transform .35s cubic-bezier(.16,1,.3,1)}\
.tribute-payment-state.success .tribute-state-orb{background:#fff;color:#050505;border-color:#fff;animation:tributeSuccessPop .45s cubic-bezier(.16,1,.3,1)}\
.tribute-payment-state.success .tribute-state-orb:before,.tribute-payment-state.failed .tribute-state-orb:before{display:none}\
.tribute-payment-state.success .tribute-state-orb svg,.tribute-payment-state.failed .tribute-state-orb svg{opacity:1;transform:scale(1)}\
.tribute-payment-state.failed .tribute-state-orb svg{color:rgba(255,255,255,.78)}\
.tribute-state-copy{min-width:0;flex:1}\
.tribute-state-copy strong,.tribute-state-copy small{display:block}\
.tribute-state-copy strong{font-size:10.5px;font-weight:760;letter-spacing:-.01em}\
.tribute-state-copy small{margin-top:4px;color:rgba(255,255,255,.4);font-size:8px;line-height:1.35}\
.tribute-state-check{flex:0 0 auto;height:28px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);color:#fff;font-size:8px;font-weight:750;transition:transform .18s ease,background .18s ease}\
.tribute-state-check:active{transform:scale(.94);background:rgba(255,255,255,.1)}\
.tribute-payment-state.success .tribute-state-check,.tribute-payment-state.failed .tribute-state-check{display:none}\
.tribute-packs{margin-top:27px}\
.tribute-packs .credits-pack[disabled]{opacity:.32;pointer-events:none}\
.tribute-price-pair{display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap}\
.tribute-price-old{color:rgba(255,255,255,.34);text-decoration:line-through;font-size:10px;font-weight:650}\
.tribute-price-new{color:#fff}\
.tribute-discount-badge{display:none;width:max-content;margin-top:8px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.72);font-size:7px;font-weight:820;letter-spacing:.03em}\
.tribute-discount-badge.show{display:block}\
@keyframes tributeModeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}\
@keyframes tributeStateIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}\
@keyframes tributeSuccessPop{from{transform:scale(.72)}to{transform:scale(1)}}\
@media(max-width:370px){.credits-payment-switch.tribute-switch button{font-size:9px;padding:0 5px}.tribute-checkout{padding:16px!important}.credits-page.tribute-payment-active .credits-balance{bottom:6px!important}}';
    document.head.appendChild(style);
  }

  function installUi(){
    var switcher=q('creditsPaymentSwitch');
    var starsButton=switcher&&switcher.querySelector('[data-payment-mode="stars"]');
    var tomanButton=switcher&&switcher.querySelector('[data-payment-mode="toman"]');
    var starsMode=q('creditsStarsMode');
    if(!switcher||!starsButton||!starsMode)return false;

    if(!q('creditsCardTab')){
      var cardButton=document.createElement('button');
      cardButton.id='creditsCardTab';
      cardButton.type='button';
      cardButton.setAttribute('data-action','set-credit-payment');
      cardButton.setAttribute('data-payment-mode','card');
      cardButton.setAttribute('aria-pressed','false');
      cardButton.innerHTML='<span aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.8 9.5h16.4" stroke="currentColor" stroke-width="1.7"/><path d="M7 14.4h3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>Bank Card';
      switcher.insertBefore(cardButton,tomanButton||null);
    }

    if(!q('creditsTributeMode')){
      var mode=document.createElement('section');
      mode.id='creditsTributeMode';
      mode.className='credits-payment-mode credits-tribute-mode';
      mode.setAttribute('aria-hidden','true');
      mode.innerHTML='<section class="credits-custom tribute-checkout">'+
        '<div class="tribute-currency-wrap"><div class="tribute-currency-label"><span>Payment currency</span><strong id="tributeCurrencyHint">USD</strong></div><div id="tributeCurrencyPicker" class="tribute-currency-picker" role="group" aria-label="Payment currency"><button type="button" data-action="set-tribute-currency" data-currency="usd">USD</button><button type="button" data-action="set-tribute-currency" data-currency="eur">EUR</button><button type="button" data-action="set-tribute-currency" data-currency="rub">RUB</button></div></div>'+
        '<label class="credits-amount-field" for="tributeCreditsInput"><input id="tributeCreditsInput" type="number" inputmode="numeric" min="6000" max="1000000" step="1000" value="6000" autocomplete="off"/><span>credits</span></label>'+
        '<input id="tributeCreditsRange" class="credits-amount-range" type="range" min="6000" max="100000" step="1000" value="6000" aria-label="Card credit amount"/>'+
        '<div class="credits-custom-summary"><div><strong id="tributeAmountValue">$1.07</strong></div></div>'+
        '<div id="tributeDiscountBadge" class="tribute-discount-badge" aria-hidden="true"></div>'+
        '<p id="tributeMinimumNote" class="tribute-minimum">Minimum card payment is $1.00.</p>'+
        '<button id="tributeCustomBuy" class="credits-primary-button" data-action="buy-tribute-custom" type="button"><span>Continue with $1.07</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
        '<div id="tributePaymentState" class="tribute-payment-state" aria-hidden="true"><span class="tribute-state-orb" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m7 12.5 3.2 3.2L17.5 8.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="tribute-state-copy"><strong id="tributeStateTitle">Finish payment in Tribute</strong><small id="tributeStateCopy">Come back here — credits add automatically.</small></span><button class="tribute-state-check" data-action="check-tribute-payment" type="button">Check</button></div>'+
      '</section>'+
      '<section id="tributePacks" class="credits-packs-section tribute-packs"><div class="credits-packs-head"><div><span>READY TO BUY</span><h3>Credit packs</h3></div><small>Bonus included</small></div><div id="tributePackList" class="credits-pack-list"></div></section>';
      starsMode.insertAdjacentElement('afterend',mode);
    }

    bindInputs();
    return true;
  }

  function bindInputs(){
    var input=q('tributeCreditsInput');
    var range=q('tributeCreditsRange');
    if(input&&!input.dataset.tributeBound){input.dataset.tributeBound='1';input.addEventListener('input',function(){renderCustom('input')});input.addEventListener('change',function(){renderCustom('input')})}
    if(range&&!range.dataset.tributeBound){range.dataset.tributeBound='1';range.addEventListener('input',function(){renderCustom('range')});range.addEventListener('change',function(){renderCustom('range')})}
  }

  function applyConfig(data){
    config=data||null;
    if(!config||!config.available){var card=q('creditsCardTab');if(card)card.hidden=true;return}
    var saved=storageGet(CURRENCY_KEY);var savedCode=saved&&String(saved.code||'').toLowerCase();
    if(savedCode&&currencyInfo(savedCode).code===savedCode)selectedCurrency=savedCode;else selectedCurrency=String(config.defaultCurrency||'usd').toLowerCase();
    var switcher=q('creditsPaymentSwitch');
    var toman=q('creditsPaymentSwitch')&&q('creditsPaymentSwitch').querySelector('[data-payment-mode="toman"]');
    var persian=String(config.language||'').toLowerCase()==='fa';
    if(toman)toman.hidden=!persian;
    if(switcher){switcher.classList.add('show','tribute-switch');switcher.setAttribute('aria-hidden','false');switcher.style.setProperty('--tribute-count',persian?'3':'2');syncSwitchIndicator()}
    syncCurrencyUi();
    renderCustom('config');
    renderPackages();
    var badge=q('tributeDiscountBadge');
    var percent=Number(config.discountPercent)||0;
    if(badge){badge.textContent=percent?number(percent)+'% Wheel discount':'';badge.classList.toggle('show',!!percent);badge.setAttribute('aria-hidden',percent?'false':'true')}
    restorePaymentState();
  }

  function syncSwitchIndicator(){
    var switcher=q('creditsPaymentSwitch');if(!switcher)return;
    var persian=config&&String(config.language||'').toLowerCase()==='fa';
    var shift='0%';
    if(cardModeActive)shift='100%';
    else if(switcher.getAttribute('data-mode')==='toman'&&persian)shift='200%';
    switcher.style.setProperty('--tribute-shift',shift);
  }

  function syncCurrencyUi(){
    var info=currentCurrency();
    var picker=q('tributeCurrencyPicker');
    if(picker){var currencyIndex=0;picker.querySelectorAll('[data-currency]').forEach(function(button,index){var active=button.getAttribute('data-currency')===info.code;if(active)currencyIndex=index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')});picker.style.setProperty('--tribute-currency-shift',String(currencyIndex*100)+'%')}
    var hint=q('tributeCurrencyHint');if(hint)hint.textContent=String(info.label||info.code||'USD').toUpperCase();
  }

  function setCurrency(code){
    if(!config)return;
    var candidate=currencyInfo(code);
    selectedCurrency=String(candidate.code||'usd').toLowerCase();
    storageSet(CURRENCY_KEY,{code:selectedCurrency});
    syncCurrencyUi();renderCustom('currency');renderPackages();haptic('light');
  }

  function customCredits(){var input=q('tributeCreditsInput');return Math.min(Number(config&&config.maximumCredits)||1000000,Math.max(1,Math.floor(Number(input&&input.value)||0)))}
  function baseCustomMinor(credits){var usd=(credits/1000)*(Number(config&&config.ratePer1000Usd)||0.178);return usdToMinor(usd,currentCurrency())}

  function renderCustom(source){
    if(!config)return;
    var info=currentCurrency();
    var input=q('tributeCreditsInput');var range=q('tributeCreditsRange');if(!input||!range)return;
    var minimum=Math.max(1000,Number(info.minimumCredits)||6000);
    input.min=String(minimum);range.min=String(minimum);
    var credits=customCredits();
    if(source==='range'){credits=Math.floor(Number(range.value)||minimum);input.value=String(credits)}
    if((source==='currency'||source==='config')&&credits<minimum){credits=minimum;input.value=String(credits);range.value=String(credits)}
    if(credits>=Number(range.min)&&credits<=Number(range.max))range.value=String(Math.round(credits/1000)*1000);
    var denominator=Math.max(1,Number(range.max)-Number(range.min));
    var progress=(Number(range.value)-Number(range.min))/denominator*100;
    range.style.setProperty('--credits-range-progress',Math.max(0,Math.min(100,progress)).toFixed(2)+'%');
    var amount=discountedMinor(baseCustomMinor(credits));
    var valid=credits>=minimum&&amount>=Number(info.minimumMinor||100)&&amount<=Number(info.maximumMinor||300000);
    var amountNode=q('tributeAmountValue');if(amountNode)amountNode.textContent=money(amount,info.code);
    var note=q('tributeMinimumNote');if(note){note.hidden=valid;note.textContent=valid?'':'Minimum card payment is '+minimumLabel(info)+' · choose at least '+number(minimum)+' credits.';note.classList.toggle('warn',!valid)}
    var button=q('tributeCustomBuy');if(button){button.disabled=!valid||cardBusy;var label=button.querySelector('span');if(label)label.textContent=valid?'Continue with '+money(amount,info.code):'Minimum '+minimumLabel(info)}
  }

  function renderPackages(){
    var list=q('tributePackList');if(!list||!config)return;
    var info=currentCurrency();
    var packages=Array.isArray(config.packages)?config.packages.map(function(pack){var original=usdToMinor(Number(pack&&pack.usd)||0,info);var amount=discountedMinor(original);return Object.assign({},pack,{originalAmountMinor:original,amountMinor:amount,available:amount>=Number(info.minimumMinor||100)&&amount<=Number(info.maximumMinor||300000)})}).filter(function(item){return item&&item.available}):[];
    list.innerHTML=packages.map(function(pack,index){var bonus=Number(pack.bonus)||0;var credits=Number(pack.credits)||0;var total=Number(pack.totalCredits)||credits+bonus;var original=Number(pack.originalAmountMinor)||Number(pack.amountMinor)||0;var amount=Number(pack.amountMinor)||0;var price=amount<original?'<span class="tribute-price-pair"><span class="tribute-price-old">'+money(original,info.code)+'</span><span class="tribute-price-new">'+money(amount,info.code)+'</span></span>':money(amount,info.code);var title=bonus?number(credits)+' <b>+ '+number(bonus)+'</b>':number(credits);var bonusLabel=bonus?'<em>'+number(bonus)+' bonus</em>':'<small>credits</small>';return '<button class="credits-pack'+(index===0?' featured':'')+'" data-action="buy-tribute-package" data-package-id="'+String(pack.id||'')+'" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>'+title+'</strong>'+bonusLabel+'</span><span class="credits-pack-total">'+minutes(total)+' min voice</span></span><span class="credits-pack-price"><strong>'+price+'</strong><small>'+String(info.label||'').toUpperCase()+' · Bank card</small></span></button>'}).join('');
    var section=q('tributePacks');if(section)section.style.display=packages.length?'block':'none';
  }

  function activateCardMode(){
    if(!config||!config.available)return toast('Card payment is temporarily unavailable');
    cardModeActive=true;
    var page=q('creditsPage');var stars=q('creditsStarsMode');var toman=q('creditsTomanMode');var tribute=q('creditsTributeMode');var switcher=q('creditsPaymentSwitch');
    if(page){page.classList.remove('toman-payment-active');page.classList.add('tribute-payment-active')}
    if(stars)stars.classList.remove('active');
    if(toman){toman.classList.remove('active');toman.setAttribute('aria-hidden','true')}
    if(tribute){tribute.classList.add('active');tribute.setAttribute('aria-hidden','false')}
    if(switcher)switcher.setAttribute('data-mode','card');
    document.querySelectorAll('[data-action="set-credit-payment"]').forEach(function(button){var active=button.getAttribute('data-payment-mode')==='card';button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')});
    var head=page&&page.querySelector('.credits-page-head>div:first-child');if(head){var kicker=head.querySelector('span');var title=head.querySelector('h2');if(kicker)kicker.textContent='BANK CARD';if(title)title.textContent='Buy credits';head.setAttribute('dir','ltr')}
    syncSwitchIndicator();syncCurrencyUi();renderCustom('open');restorePaymentState();haptic('light');
  }

  function deactivateCardMode(next){
    if(!cardModeActive){setTimeout(syncSwitchIndicator,0);return}
    cardModeActive=false;
    var page=q('creditsPage');var tribute=q('creditsTributeMode');
    if(page)page.classList.remove('tribute-payment-active');
    if(tribute){tribute.classList.remove('active');tribute.setAttribute('aria-hidden','true')}
    var switcher=q('creditsPaymentSwitch');if(switcher)switcher.setAttribute('data-mode',next||'stars');
    setTimeout(syncSwitchIndicator,0);
  }

  function setPaymentState(kind,title,copy){
    var state=q('tributePaymentState');if(!state)return;
    var show=!!kind;
    state.classList.toggle('show',show);state.classList.toggle('success',kind==='success');state.classList.toggle('failed',kind==='failed');state.setAttribute('aria-hidden',show?'false':'true');
    var titleNode=q('tributeStateTitle');var copyNode=q('tributeStateCopy');if(titleNode&&title)titleNode.textContent=title;if(copyNode&&copy)copyNode.textContent=copy;
  }

  function setStateAction(action,label){
    var button=q('tributePaymentState')&&q('tributePaymentState').querySelector('.tribute-state-check');
    if(!button)return;
    if(!action){button.style.display='none';button.removeAttribute('data-action');return}
    button.style.display='';button.setAttribute('data-action',action);button.textContent=label||'Open';
  }

  function restorePaymentState(){
    var pending=storageGet(PENDING_KEY);
    if(!pending||!pending.orderUuid)return;
    if(pending.paymentUrl||pending.webappPaymentUrl){
      setPaymentState('waiting','Checkout ready','Tap Open to continue with the card payment.');
      setStateAction('open-tribute-checkout','Open');
    }else{
      setPaymentState('waiting','Finish payment in Tribute','Come back here — credits add automatically.');
      setStateAction('check-tribute-payment','Check');
    }
  }

  function openCheckout(paymentUrl,webappUrl){
    if(paymentUrl&&tg&&typeof tg.openLink==='function'){
      try{tg.openLink(paymentUrl,{try_instant_view:false});return true}catch(error){}
    }
    if(paymentUrl){
      try{window.location.assign(paymentUrl);return true}catch(error){}
    }
    if(tg&&webappUrl&&typeof tg.openTelegramLink==='function'){
      try{tg.openTelegramLink(webappUrl);return true}catch(error){}
    }
    if(webappUrl){
      try{window.location.assign(webappUrl);return true}catch(error){}
    }
    return false;
  }

  function openPendingCheckout(){
    var pending=storageGet(PENDING_KEY);
    if(!pending||(!pending.paymentUrl&&!pending.webappPaymentUrl))return toast('Checkout link is not ready');
    haptic('medium');
    if(!openCheckout(pending.paymentUrl,pending.webappPaymentUrl)){
      toast('Could not open Tribute checkout');
      setPaymentState('failed','Checkout unavailable','Telegram could not open the payment link.');
      setStateAction(null);
    }
  }

  async function startCardPayment(payload,button){
    if(cardBusy)return;
    cardBusy=true;if(button){button.disabled=true;button.classList.add('loading')}
    try{
      var requestPayload=Object.assign({},payload||{},{currency:selectedCurrency});
      var data=await api('/mini-app/api/tribute-order',requestPayload);
      if((!data.paymentUrl&&!data.webappPaymentUrl)||!data.orderUuid)throw new Error('Tribute did not return a checkout link.');
      storageSet(PENDING_KEY,{orderUuid:data.orderUuid,credits:data.credits,amountMinor:data.amountMinor,currency:data.currency||selectedCurrency,paymentUrl:data.paymentUrl||'',webappPaymentUrl:data.webappPaymentUrl||'',createdAt:Date.now()});
      setPaymentState('waiting','Checkout ready','If it does not open automatically, tap Open.');
      setStateAction('open-tribute-checkout','Open');
      haptic('medium');
      openCheckout(data.paymentUrl,data.webappPaymentUrl);
    }catch(error){
      var message=String(error&&error.message||'Could not start card checkout').trim();
      toast(message);setPaymentState('failed','Checkout unavailable',message);setStateAction(null);haptic('error');
    }
    finally{cardBusy=false;if(button){button.disabled=false;button.classList.remove('loading')}renderCustom('done')}
  }

  async function checkPending(force){
    var pending=storageGet(PENDING_KEY);if(!pending||!pending.orderUuid||pendingCheckBusy)return;
    var now=Date.now();if(!force&&now-lastPendingCheckAt<1200)return;
    lastPendingCheckAt=now;pendingCheckBusy=true;
    try{
      var data=await api('/mini-app/api/tribute-status',{orderUuid:pending.orderUuid});
      if(data.status==='paid'&&data.credited){
        storageRemove(PENDING_KEY);
        var balance=Math.max(0,Number(data.balance)||0);var credits=Math.max(0,Number(data.credits)||Number(pending.credits)||0);
        var mainBalance=q('balance');var pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(balance);if(pageBalance)pageBalance.textContent=number(balance);
        setPaymentState('success','Credits added',number(credits)+' credits are in your balance.');setStateAction(null);haptic('success');
        storageSet(SUCCESS_KEY,{balance:balance,credits:credits,at:Date.now()});
        setTimeout(function(){window.location.reload()},950);
      }else if(data.status==='failed'||data.status==='refunded'){
        storageRemove(PENDING_KEY);setPaymentState('failed',data.status==='refunded'?'Payment refunded':'Payment failed',data.status==='refunded'?'The credited amount was reversed.':'Nothing was charged to your Vexa balance.');setStateAction(null);haptic('error')
      }else{
        setPaymentState('waiting','Payment not finished yet','Complete checkout in Tribute, then come back here.');
        if(pending.paymentUrl||pending.webappPaymentUrl)setStateAction('open-tribute-checkout','Open');else setStateAction('check-tribute-payment','Check');
      }
    }catch(error){if(force)toast(error.message||'Could not check payment')}
    finally{pendingCheckBusy=false}
  }

  function restoreSuccessAfterReload(){
    var success=storageGet(SUCCESS_KEY);if(!success)return;
    storageRemove(SUCCESS_KEY);
    setTimeout(function(){
      var pill=q('creditPill');if(pill&&typeof pill.click==='function')pill.click();
      setTimeout(function(){activateCardMode();setPaymentState('success','Credits added',number(success.credits||0)+' credits are in your balance.');setStateAction(null);var mainBalance=q('balance');var pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(success.balance||0);if(pageBalance)pageBalance.textContent=number(success.balance||0)},90);
    },520);
  }

  document.body.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button)return;
    var action=button.getAttribute('data-action');var mode=button.getAttribute('data-payment-mode');
    if(action==='set-credit-payment'&&mode==='card'){event.preventDefault();event.stopImmediatePropagation();activateCardMode();return}
    if(action==='set-credit-payment'&&(mode==='stars'||mode==='toman')){deactivateCardMode(mode);return}
    if(action==='set-tribute-currency'){event.preventDefault();event.stopImmediatePropagation();setCurrency(button.getAttribute('data-currency')||'usd');return}
    if(action==='buy-tribute-custom'){event.preventDefault();event.stopImmediatePropagation();startCardPayment({credits:customCredits()},button);return}
    if(action==='buy-tribute-package'){event.preventDefault();event.stopImmediatePropagation();startCardPayment({packageId:button.getAttribute('data-package-id')||''},button);return}
    if(action==='open-tribute-checkout'){event.preventDefault();event.stopImmediatePropagation();openPendingCheckout();return}
    if(action==='check-tribute-payment'){event.preventDefault();event.stopImmediatePropagation();checkPending(true);return}
  },true);

  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkPending(false)});
  window.addEventListener('focus',function(){checkPending(false)},{passive:true});

  function boot(attempt){
    installStyles();
    if(!installUi()){if(attempt<30)setTimeout(function(){boot(attempt+1)},80);return}
    api('/mini-app/api/tribute-config',{}).then(function(data){applyConfig(data);setTimeout(function(){var switcher=q('creditsPaymentSwitch');if(switcher&&config&&config.available){switcher.classList.add('show','tribute-switch');switcher.setAttribute('aria-hidden','false');syncSwitchIndicator()}},850);restoreSuccessAfterReload();if(storageGet(PENDING_KEY))setTimeout(function(){checkPending(false)},1100)}).catch(function(){var card=q('creditsCardTab');if(card)card.hidden=true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0)},{once:true});else boot(0);
})();
`;