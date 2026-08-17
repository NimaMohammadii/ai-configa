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
  var PENDING_KEY='vexa_tribute_pending_v3';
  var SUCCESS_KEY='vexa_tribute_success_v2';

  function q(id){return document.getElementById(id)}
  function number(value){return Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US')}
  function minutes(credits){return (Math.max(0,Number(credits)||0)/1000).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:1})}
  function toast(message){var node=q('toast');if(!node)return;node.textContent=String(message||'').replace(/[.!]+$/,'');node.classList.remove('show');void node.offsetWidth;node.classList.add('show');setTimeout(function(){node.classList.remove('show')},3200)}
  function haptic(kind){if(!tg||!tg.HapticFeedback)return;try{if(kind==='success'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('success');else if(kind==='error'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('error');else if(tg.HapticFeedback.impactOccurred)tg.HapticFeedback.impactOccurred(kind||'light')}catch(error){}}
  function api(path,payload){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({initData:initData},payload||{}))}).then(async function(response){var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Card payment error');return data})}
  function storageGet(key){try{var value=sessionStorage.getItem(key);return value?JSON.parse(value):null}catch(error){return null}}
  function storageSet(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch(error){}}
  function storageRemove(key){try{sessionStorage.removeItem(key)}catch(error){}}

  function currencyInfo(code){
    var list=config&&Array.isArray(config.currencies)?config.currencies:[];
    var clean=String(code||selectedCurrency||'usd').toLowerCase();
    return list.find(function(item){return item&&String(item.code||'').toLowerCase()===clean})||list[0]||{code:'usd',label:'USD',symbol:'$'};
  }
  function money(minor,code){
    var info=currencyInfo(code);var amount=Math.max(0,Number(minor)||0)/100;
    var formatted=amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return String(info.symbol||'')+formatted;
  }

  function installStyles(){
    if(q('tributePaymentsStyles'))return;
    var style=document.createElement('style');
    style.id='tributePaymentsStyles';
    style.textContent='\
.credits-payment-switch.tribute-switch{--tribute-count:2;--tribute-shift:0%;display:grid!important;grid-template-columns:repeat(var(--tribute-count),minmax(0,1fr))!important}\
.credits-payment-switch.tribute-switch:before{left:3px!important;right:auto!important;width:calc((100% - 6px)/var(--tribute-count))!important;transform:translateX(var(--tribute-shift))!important;transition:transform .44s cubic-bezier(.22,1,.36,1),width .32s ease!important}\
.credits-payment-switch.tribute-switch button{min-width:0;white-space:nowrap}.credits-payment-switch.tribute-switch button[hidden]{display:none!important}\
.credits-page.tribute-payment-active .credits-page-head{background:#000!important}.credits-page.tribute-payment-active .credits-page-head:before,.credits-page.tribute-payment-active .credits-page-head:after{display:none!important}.credits-page.tribute-payment-active .credits-page-head p{display:none!important}.credits-page.tribute-payment-active .credits-balance{bottom:8px!important}\
.credits-tribute-mode{max-width:540px;margin:0 auto;padding:0 0 calc(env(safe-area-inset-bottom,0px) + 22px)}.credits-tribute-mode.active{display:block;animation:tributeModeIn .5s cubic-bezier(.16,.86,.22,1) both}\
.tribute-card-shell{position:relative;overflow:hidden;padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.055)}\
.tribute-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:15px}.tribute-card-head span{display:block;color:rgba(255,255,255,.34);font-size:8px;font-weight:800;letter-spacing:.1em}.tribute-card-head h3{margin:4px 0 0;font-size:19px;letter-spacing:-.04em}.tribute-card-head small{color:rgba(255,255,255,.38);font-size:8px;white-space:nowrap}\
.tribute-currency-picker{--tribute-currency-count:1;--tribute-currency-shift:0%;position:relative;display:grid;grid-template-columns:repeat(var(--tribute-currency-count),minmax(0,1fr));padding:3px;margin:0 0 14px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:#0f0f10;overflow:hidden}.tribute-currency-picker[hidden]{display:none!important}.tribute-currency-picker:before{content:"";position:absolute;z-index:0;left:3px;top:3px;bottom:3px;width:calc((100% - 6px)/var(--tribute-currency-count));border-radius:12px;background:#fff;transform:translateX(var(--tribute-currency-shift));transition:transform .38s cubic-bezier(.22,1,.36,1)}.tribute-currency-picker button{position:relative;z-index:1;height:40px;border:0;background:transparent;color:rgba(255,255,255,.44);font-size:10px;font-weight:760}.tribute-currency-picker button.active{color:#080808}.tribute-currency-picker button:active{transform:scale(.97)}\
.tribute-product-list{display:grid;gap:9px}.tribute-product{width:100%;min-height:72px;padding:12px 13px;border:1px solid rgba(255,255,255,.085);border-radius:18px;background:rgba(255,255,255,.035);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;transition:transform .18s ease,background .18s ease,border-color .18s ease}.tribute-product:active{transform:scale(.985);background:rgba(255,255,255,.07)}.tribute-product-main{min-width:0}.tribute-product-main strong,.tribute-product-main small{display:block}.tribute-product-main strong{font-size:17px;letter-spacing:-.035em}.tribute-product-main small{margin-top:5px;color:rgba(255,255,255,.38);font-size:8.5px}.tribute-product-price{text-align:right;flex:0 0 auto}.tribute-product-price strong,.tribute-product-price small{display:block}.tribute-product-price strong{font-size:15px;letter-spacing:-.025em}.tribute-product-price small{margin-top:4px;color:rgba(255,255,255,.35);font-size:7.5px}.tribute-empty{padding:24px 10px;text-align:center;color:rgba(255,255,255,.4);font-size:9px;line-height:1.6}\
.tribute-payment-state{position:relative;display:none;align-items:center;gap:11px;margin-top:12px;padding:11px 12px;border-radius:16px;background:rgba(13,13,13,.68);box-shadow:inset 0 1px 0 rgba(255,255,255,.1);animation:tributeStateIn .36s cubic-bezier(.16,1,.3,1) both}.tribute-payment-state.show{display:flex}.tribute-state-orb{position:relative;width:34px;height:34px;flex:0 0 34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05)}.tribute-state-orb:before{content:"";position:absolute;inset:4px;border-radius:50%;border:1.5px solid rgba(255,255,255,.18);border-top-color:#fff;animation:creditsSpin .8s linear infinite}.tribute-state-orb svg{width:17px;height:17px;opacity:0;transform:scale(.6);transition:opacity .2s ease,transform .35s cubic-bezier(.16,1,.3,1)}.tribute-payment-state.success .tribute-state-orb{background:#fff;color:#050505;border-color:#fff}.tribute-payment-state.success .tribute-state-orb:before,.tribute-payment-state.failed .tribute-state-orb:before{display:none}.tribute-payment-state.success .tribute-state-orb svg,.tribute-payment-state.failed .tribute-state-orb svg{opacity:1;transform:scale(1)}.tribute-state-copy{min-width:0;flex:1}.tribute-state-copy strong,.tribute-state-copy small{display:block}.tribute-state-copy strong{font-size:10.5px;font-weight:760}.tribute-state-copy small{margin-top:4px;color:rgba(255,255,255,.4);font-size:8px;line-height:1.35}.tribute-state-check{height:28px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);color:#fff;font-size:8px;font-weight:750}.tribute-payment-state.success .tribute-state-check,.tribute-payment-state.failed .tribute-state-check{display:none}\
.tribute-footnote{margin:16px auto 0;text-align:center;color:rgba(255,255,255,.33);font-size:8.5px;line-height:1.55}.tribute-footnote span{color:#fff}\
@keyframes tributeModeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes tributeStateIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}\
@media(max-width:370px){.credits-payment-switch.tribute-switch button{font-size:9px;padding:0 5px}.tribute-card-shell{padding:15px}.tribute-product{min-height:68px}}';
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
      cardButton.id='creditsCardTab';cardButton.type='button';
      cardButton.setAttribute('data-action','set-credit-payment');cardButton.setAttribute('data-payment-mode','card');cardButton.setAttribute('aria-pressed','false');
      cardButton.innerHTML='<span aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.8 9.5h16.4" stroke="currentColor" stroke-width="1.7"/><path d="M7 14.4h3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>Bank Card';
      switcher.insertBefore(cardButton,tomanButton||null);
    }

    if(!q('creditsTributeMode')){
      var mode=document.createElement('section');
      mode.id='creditsTributeMode';mode.className='credits-payment-mode credits-tribute-mode';mode.setAttribute('aria-hidden','true');
      mode.innerHTML='<section class="tribute-card-shell">'+
        '<div class="tribute-card-head"><div><span>CARD CHECKOUT</span><h3>Choose a credit pack</h3></div><small>One-time payment</small></div>'+
        '<div id="tributeCurrencyPicker" class="tribute-currency-picker" hidden></div>'+
        '<div id="tributeProductList" class="tribute-product-list"></div>'+
        '<div id="tributePaymentState" class="tribute-payment-state" aria-hidden="true"><span class="tribute-state-orb" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m7 12.5 3.2 3.2L17.5 8.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="tribute-state-copy"><strong id="tributeStateTitle">Finish payment</strong><small id="tributeStateCopy">Come back here — credits add automatically.</small></span><button class="tribute-state-check" data-action="check-tribute-payment" type="button">Check</button></div>'+
      '</section><p class="tribute-footnote"><span>●</span> Secure card checkout</p>';
      starsMode.insertAdjacentElement('afterend',mode);
    }
    return true;
  }

  function paymentButtons(){
    var switcher=q('creditsPaymentSwitch');
    return switcher?Array.prototype.slice.call(switcher.querySelectorAll('[data-action="set-credit-payment"]')):[];
  }

  function syncPaymentSwitcher(){
    var switcher=q('creditsPaymentSwitch');if(!switcher)return;
    var stars=switcher.querySelector('[data-payment-mode="stars"]');
    var card=switcher.querySelector('[data-payment-mode="card"]');
    var toman=switcher.querySelector('[data-payment-mode="toman"]');
    var persian=!!(config&&String(config.language||'').toLowerCase()==='fa');
    var cardConfigured=!!(config&&config.configured);
    if(stars)stars.hidden=false;
    if(card){card.hidden=!cardConfigured;card.title=cardConfigured&&!config.available?String(config.error||'Card checkout is not ready yet'):''}
    if(toman)toman.hidden=!persian;
    var visible=paymentButtons().filter(function(button){return !button.hidden});
    var show=visible.length>1;
    switcher.classList.toggle('show',show);
    switcher.classList.toggle('tribute-switch',show);
    switcher.setAttribute('aria-hidden',show?'false':'true');
    switcher.style.setProperty('--tribute-count',String(Math.max(1,visible.length)));
    syncSwitchIndicator();
  }

  function applyConfig(data){
    config=data||{};
    selectedCurrency=String(config.defaultCurrency||((config.currencies&&config.currencies[0]&&config.currencies[0].code)||'usd')).toLowerCase();
    syncPaymentSwitcher();
    renderCurrencies();renderProducts();restorePaymentState();
  }

  function syncSwitchIndicator(){
    var switcher=q('creditsPaymentSwitch');if(!switcher)return;
    var activeMode=cardModeActive?'card':String(switcher.getAttribute('data-mode')||'stars');
    var visible=paymentButtons().filter(function(button){return !button.hidden});
    var index=visible.findIndex(function(button){return String(button.getAttribute('data-payment-mode')||'')===activeMode});
    if(index<0)index=0;
    switcher.style.setProperty('--tribute-shift',String(index*100)+'%');
  }

  function renderCurrencies(){
    var picker=q('tributeCurrencyPicker');if(!picker||!config)return;var currencies=Array.isArray(config.currencies)?config.currencies:[];
    picker.hidden=currencies.length<=1;picker.style.setProperty('--tribute-currency-count',String(Math.max(1,currencies.length)));
    picker.innerHTML=currencies.map(function(item){var code=String(item.code||'').toLowerCase();var active=code===selectedCurrency;return '<button type="button" data-action="set-tribute-currency" data-currency="'+code+'" class="'+(active?'active':'')+'">'+String(item.label||code).toUpperCase()+'</button>'}).join('');
    var index=Math.max(0,currencies.findIndex(function(item){return String(item.code||'').toLowerCase()===selectedCurrency}));picker.style.setProperty('--tribute-currency-shift',String(index*100)+'%');
  }

  function setCurrency(code){selectedCurrency=String(code||'usd').toLowerCase();renderCurrencies();renderProducts();haptic('light')}

  function renderProducts(){
    var list=q('tributeProductList');if(!list)return;
    if(!config){list.innerHTML='';return}
    var products=Array.isArray(config.products)?config.products.filter(function(item){return item&&String(item.currency||'').toLowerCase()===selectedCurrency}):[];
    if(!products.length){list.innerHTML='<div class="tribute-empty">'+String(config.error||'No card pack is available in this currency yet.')+'</div>';return}
    list.innerHTML=products.map(function(product){return '<button class="tribute-product" type="button" data-action="buy-tribute-product" data-product-id="'+String(product.productId||'')+'"><span class="tribute-product-main"><strong>'+number(product.credits)+' credits</strong><small>'+minutes(product.credits)+' min voice · added automatically</small></span><span class="tribute-product-price"><strong>'+money(product.amountMinor,product.currency)+'</strong><small>'+String(product.currency||'').toUpperCase()+' · card</small></span></button>'}).join('');
  }

  function activateCardMode(){
    if(!config||!config.configured)return toast('Card payment is temporarily unavailable');
    cardModeActive=true;
    var page=q('creditsPage'),stars=q('creditsStarsMode'),toman=q('creditsTomanMode'),tribute=q('creditsTributeMode'),switcher=q('creditsPaymentSwitch');
    if(page){page.classList.remove('toman-payment-active');page.classList.add('tribute-payment-active')}if(stars)stars.classList.remove('active');if(toman){toman.classList.remove('active');toman.setAttribute('aria-hidden','true')}if(tribute){tribute.classList.add('active');tribute.setAttribute('aria-hidden','false')}if(switcher)switcher.setAttribute('data-mode','card');
    document.querySelectorAll('[data-action="set-credit-payment"]').forEach(function(button){var active=button.getAttribute('data-payment-mode')==='card';button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')});
    var head=page&&page.querySelector('.credits-page-head>div:first-child');if(head){var kicker=head.querySelector('span'),title=head.querySelector('h2');if(kicker)kicker.textContent='BANK CARD';if(title)title.textContent='Buy credits';head.setAttribute('dir','ltr')}
    syncSwitchIndicator();renderCurrencies();renderProducts();
    if(config.available){restorePaymentState()}else{setPaymentState('failed','Card checkout not ready',config.error||'No active card product is available yet.');setStateAction(null)}
    haptic('light');
  }

  function deactivateCardMode(next){
    if(!cardModeActive){setTimeout(syncSwitchIndicator,0);return}cardModeActive=false;var page=q('creditsPage'),tribute=q('creditsTributeMode');if(page)page.classList.remove('tribute-payment-active');if(tribute){tribute.classList.remove('active');tribute.setAttribute('aria-hidden','true')}var switcher=q('creditsPaymentSwitch');if(switcher)switcher.setAttribute('data-mode',next||'stars');setTimeout(syncSwitchIndicator,0);
  }

  function setPaymentState(kind,title,copy){
    var state=q('tributePaymentState');if(!state)return;var show=!!kind;state.classList.toggle('show',show);state.classList.toggle('success',kind==='success');state.classList.toggle('failed',kind==='failed');state.setAttribute('aria-hidden',show?'false':'true');var titleNode=q('tributeStateTitle'),copyNode=q('tributeStateCopy');if(titleNode&&title)titleNode.textContent=title;if(copyNode&&copy)copyNode.textContent=copy;
  }
  function setStateAction(action,label){var button=q('tributePaymentState')&&q('tributePaymentState').querySelector('.tribute-state-check');if(!button)return;if(!action){button.style.display='none';button.removeAttribute('data-action');return}button.style.display='';button.setAttribute('data-action',action);button.textContent=label||'Open'}

  function restorePaymentState(){
    var pending=storageGet(PENDING_KEY);if(!pending||!pending.orderUuid)return;setPaymentState('waiting','Checkout ready','Complete the payment, then return to Vexa.');setStateAction('open-tribute-checkout','Open');
  }

  function openCheckout(paymentUrl,webappUrl){
    if(paymentUrl&&tg&&typeof tg.openLink==='function'){try{tg.openLink(paymentUrl,{try_instant_view:false});return true}catch(error){}}
    if(paymentUrl){try{window.location.assign(paymentUrl);return true}catch(error){}}
    if(tg&&webappUrl&&typeof tg.openTelegramLink==='function'){try{tg.openTelegramLink(webappUrl);return true}catch(error){}}
    if(webappUrl){try{window.location.assign(webappUrl);return true}catch(error){}}return false;
  }

  function openPendingCheckout(){
    var pending=storageGet(PENDING_KEY);if(!pending||(!pending.paymentUrl&&!pending.webappPaymentUrl))return toast('Checkout link is not ready');haptic('medium');if(!openCheckout(pending.paymentUrl,pending.webappPaymentUrl)){toast('Could not open checkout');setPaymentState('failed','Checkout unavailable','Telegram could not open the payment link.');setStateAction(null)}
  }

  async function startCardPayment(productId,button){
    if(cardBusy)return;cardBusy=true;if(button){button.disabled=true;button.classList.add('loading')}
    try{
      var data=await api('/mini-app/api/tribute-order',{productId:productId});
      if(!data.paymentUrl||!data.orderUuid)throw new Error('Tribute did not return a payment link.');
      storageSet(PENDING_KEY,{orderUuid:data.orderUuid,productId:data.productId,credits:data.credits,amountMinor:data.amountMinor,currency:data.currency,paymentUrl:data.paymentUrl||'',webappPaymentUrl:data.webappPaymentUrl||'',createdAt:Date.now()});
      setPaymentState('waiting','Checkout ready','If it does not open automatically, tap Open.');setStateAction('open-tribute-checkout','Open');haptic('medium');openCheckout(data.paymentUrl,data.webappPaymentUrl);
    }catch(error){var message=String(error&&error.message||'Could not start card checkout').trim();toast(message);setPaymentState('failed','Checkout unavailable',message);setStateAction(null);haptic('error')}
    finally{cardBusy=false;if(button){button.disabled=false;button.classList.remove('loading')}}
  }

  async function checkPending(force){
    var pending=storageGet(PENDING_KEY);if(!pending||!pending.orderUuid||pendingCheckBusy)return;var now=Date.now();if(!force&&now-lastPendingCheckAt<1200)return;lastPendingCheckAt=now;pendingCheckBusy=true;
    try{
      var data=await api('/mini-app/api/tribute-status',{orderUuid:pending.orderUuid});
      if(data.status==='paid'&&data.credited){storageRemove(PENDING_KEY);var balance=Math.max(0,Number(data.balance)||0),credits=Math.max(0,Number(data.credits)||Number(pending.credits)||0);var mainBalance=q('balance'),pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(balance);if(pageBalance)pageBalance.textContent=number(balance);setPaymentState('success','Credits added',number(credits)+' credits are in your balance.');setStateAction(null);haptic('success');storageSet(SUCCESS_KEY,{balance:balance,credits:credits,at:Date.now()});setTimeout(function(){window.location.reload()},950)}
      else if(data.status==='refunded'){storageRemove(PENDING_KEY);setPaymentState('failed','Payment refunded','The credited amount was reversed.');setStateAction(null);haptic('error')}
      else{setPaymentState('waiting','Payment not finished yet','Complete the card payment, then come back here.');setStateAction('open-tribute-checkout','Open')}
    }catch(error){if(force)toast(error.message||'Could not check payment')}finally{pendingCheckBusy=false}
  }

  function restoreSuccessAfterReload(){var success=storageGet(SUCCESS_KEY);if(!success)return;storageRemove(SUCCESS_KEY);setTimeout(function(){var pill=q('creditPill');if(pill&&typeof pill.click==='function')pill.click();setTimeout(function(){activateCardMode();setPaymentState('success','Credits added',number(success.credits||0)+' credits are in your balance.');setStateAction(null);var mainBalance=q('balance'),pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(success.balance||0);if(pageBalance)pageBalance.textContent=number(success.balance||0)},90)},520)}

  document.body.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button)return;var action=button.getAttribute('data-action'),mode=button.getAttribute('data-payment-mode');
    if(action==='set-credit-payment'&&mode==='card'){event.preventDefault();event.stopImmediatePropagation();activateCardMode();return}
    if(action==='set-credit-payment'&&(mode==='stars'||mode==='toman')){deactivateCardMode(mode);return}
    if(action==='set-tribute-currency'){event.preventDefault();event.stopImmediatePropagation();setCurrency(button.getAttribute('data-currency')||'usd');return}
    if(action==='buy-tribute-product'){event.preventDefault();event.stopImmediatePropagation();startCardPayment(button.getAttribute('data-product-id')||'',button);return}
    if(action==='open-tribute-checkout'){event.preventDefault();event.stopImmediatePropagation();openPendingCheckout();return}
    if(action==='check-tribute-payment'){event.preventDefault();event.stopImmediatePropagation();checkPending(true);return}
  },true);

  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkPending(false)});window.addEventListener('focus',function(){checkPending(false)},{passive:true});

  function boot(attempt){
    installStyles();
    if(!installUi()){if(attempt<30)setTimeout(function(){boot(attempt+1)},80);return}
    api('/mini-app/api/tribute-config',{}).then(function(data){
      applyConfig(data);
      setTimeout(syncPaymentSwitcher,850);
      restoreSuccessAfterReload();
      if(storageGet(PENDING_KEY))setTimeout(function(){checkPending(false)},1100)
    }).catch(function(){
      var card=q('creditsCardTab');if(card)card.hidden=true;
    })
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0)},{once:true});else boot(0);
})();
`;