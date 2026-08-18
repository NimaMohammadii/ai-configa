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
  var transientState=null;
  var MAX_CARD_PACKS=6;
  var PENDING_KEY='vexa_tribute_pending_v3';
  var SUCCESS_KEY='vexa_tribute_success_v2';

  var CARD_CATALOG=[
    {id:'card_6000',credits:6000,bonus:0,discountPercent:0,usdPer1000:0.34,prices:{usd:{amountMinor:200},eur:{amountMinor:199},rub:{amountMinor:17000}}},
    {id:'card_40000',credits:40000,bonus:0,discountPercent:30,prices:{usd:{amountMinor:700,originalAmountMinor:1000},eur:{amountMinor:699,originalAmountMinor:999},rub:{amountMinor:59500,originalAmountMinor:85000}}},
    {id:'card_120000',credits:120000,bonus:10000,discountPercent:0,prices:{usd:{amountMinor:1900},eur:{amountMinor:1899},rub:{amountMinor:161500}}},
    {id:'card_350000',credits:350000,bonus:0,discountPercent:0,usdPer1000:0.14,prices:{usd:{amountMinor:4900},eur:{amountMinor:4899},rub:{amountMinor:416500}}}
  ];
  var CURRENCIES=[
    {code:'usd',label:'USD',symbol:'$'},
    {code:'eur',label:'EUR',symbol:'€'},
    {code:'rub',label:'RUB',symbol:'₽'}
  ];

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
    var clean=String(code||selectedCurrency||'usd').toLowerCase();
    return CURRENCIES.find(function(item){return item.code===clean})||CURRENCIES[0];
  }
  function money(minor,code){
    var info=currencyInfo(code);var amount=Math.max(0,Number(minor)||0)/100;
    var digits=String(code||'').toLowerCase()==='rub'?0:2;
    var formatted=amount.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    return String(info.symbol||'')+formatted;
  }
  function liveProducts(){return config&&Array.isArray(config.products)?config.products:[]}
  function liveMatch(pack,currency){
    var total=Number(pack.credits||0)+Number(pack.bonus||0);
    var base=Number(pack.credits||0);
    return liveProducts().find(function(item){
      if(!item||String(item.currency||'').toLowerCase()!==currency)return false;
      var credits=Number(item.credits||0);
      return credits===total||credits===base;
    })||null;
  }
  function catalogProducts(currency){
    return CARD_CATALOG.map(function(pack){
      var price=pack.prices&&pack.prices[currency];if(!price)return null;
      var live=liveMatch(pack,currency);
      return {
        catalogId:pack.id,
        productId:live&&live.productId?live.productId:'',
        credits:Number(pack.credits||0),
        bonus:Number(pack.bonus||0),
        totalCredits:Number(pack.credits||0)+Number(pack.bonus||0),
        amountMinor:Number(price.amountMinor||0),
        originalAmountMinor:price.originalAmountMinor==null?null:Number(price.originalAmountMinor||0),
        currency:currency,
        discountPercent:Number(pack.discountPercent||0),
        usdPer1000:pack.usdPer1000==null?null:Number(pack.usdPer1000),
        checkoutReady:!!(live&&live.productId)
      };
    }).filter(Boolean).slice(0,MAX_CARD_PACKS);
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
        '<div id="tributeCurrencyPicker" class="tribute-currency-picker"></div>'+
        '<div id="tributeProductList" class="tribute-product-list"></div>'+
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
    if(stars)stars.hidden=false;
    if(card){card.hidden=false;card.title=''}
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
    selectedCurrency='usd';
    syncPaymentSwitcher();renderCurrencies();renderProducts();
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
    var picker=q('tributeCurrencyPicker');if(!picker)return;
    picker.hidden=false;picker.style.setProperty('--tribute-currency-count',String(CURRENCIES.length));
    picker.innerHTML=CURRENCIES.map(function(item){var active=item.code===selectedCurrency;return '<button type="button" data-action="set-tribute-currency" data-currency="'+item.code+'" class="'+(active?'active':'')+'">'+item.label+'</button>'}).join('');
    var index=Math.max(0,CURRENCIES.findIndex(function(item){return item.code===selectedCurrency}));picker.style.setProperty('--tribute-currency-shift',String(index*100)+'%');
  }

  function setCurrency(code){selectedCurrency=String(code||'usd').toLowerCase();renderCurrencies();renderProducts();haptic('light')}

  function stateForProduct(product){
    var productId=String(product&&product.productId||'');
    if(!productId)return null;
    if(transientState&&String(transientState.productId||'')===productId)return transientState;
    var pending=storageGet(PENDING_KEY);
    if(pending&&String(pending.productId||'')===productId)return{productId:productId,kind:'waiting',copy:'Waiting for payment · tap to reopen'};
    return null;
  }

  function defaultMeta(product){
    var parts=[];
    if(Number(product.bonus||0)>0)parts.push('+'+number(product.bonus)+' credits gift');
    if(Number(product.discountPercent||0)>0)parts.push(number(product.discountPercent)+'% OFF');
    if(product.usdPer1000!=null)parts.push('$'+Number(product.usdPer1000).toFixed(2)+' / 1K credits');
    if(!parts.length)parts.push(number(product.totalCredits||product.credits)+' credits total');
    if(!product.checkoutReady)parts.push('payment link coming soon');
    return parts.join(' · ');
  }

  function stateMarkup(state,product){
    if(!state)return '<span>'+defaultMeta(product)+'</span>';
    if(state.kind==='loading')return '<span class="tribute-inline-spinner" aria-hidden="true"></span><span>'+String(state.copy||'Preparing checkout')+'</span>';
    if(state.kind==='success')return '<span class="tribute-inline-check" aria-hidden="true">✓</span><span>'+String(state.copy||'Credits added')+'</span>';
    if(state.kind==='failed')return '<span class="tribute-inline-alert" aria-hidden="true">!</span><span>'+String(state.copy||'Payment failed · tap to retry')+'</span>';
    return '<span class="tribute-inline-dot" aria-hidden="true"></span><span>'+String(state.copy||'Waiting for payment · tap to reopen')+'</span>';
  }

  function priceMarkup(product){
    var current=money(product.amountMinor,product.currency);
    var old=product.originalAmountMinor!=null?money(product.originalAmountMinor,product.currency):'';
    return '<strong>'+(old?'<s>'+old+'</s> ':'')+current+'</strong><small>'+String(product.currency||'').toUpperCase()+(product.discountPercent?' · '+number(product.discountPercent)+'% OFF':'')+'</small>';
  }

  function creditTitle(product){
    return Number(product.bonus||0)>0
      ? number(product.credits)+' + '+number(product.bonus)+' 🎁 credits'
      : number(product.credits)+' credits';
  }

  function renderProducts(){
    var list=q('tributeProductList');if(!list)return;
    var products=catalogProducts(selectedCurrency);
    list.innerHTML=products.map(function(product){
      var state=stateForProduct(product);var kind=state&&String(state.kind||'');var pending=kind==='waiting';var loading=kind==='loading';
      var action=pending?'open-tribute-checkout':(product.checkoutReady?'buy-tribute-product':'catalog-tribute-product');
      return '<button class="tribute-product'+(kind?' '+kind:'')+'" type="button" data-action="'+action+'" data-product-id="'+String(product.productId||'')+'" data-catalog-id="'+String(product.catalogId||'')+'"'+(loading?' disabled':'')+'><span class="tribute-product-main"><strong>'+creditTitle(product)+'</strong><small class="tribute-product-meta">'+stateMarkup(state,product)+'</small></span><span class="tribute-product-price">'+priceMarkup(product)+'</span></button>';
    }).join('');
  }

  function activateCardMode(){
    cardModeActive=true;
    var page=q('creditsPage'),stars=q('creditsStarsMode'),toman=q('creditsTomanMode'),tribute=q('creditsTributeMode'),switcher=q('creditsPaymentSwitch');
    if(page){page.classList.remove('toman-payment-active');page.classList.add('tribute-payment-active')}if(stars)stars.classList.remove('active');if(toman){toman.classList.remove('active');toman.setAttribute('aria-hidden','true')}if(tribute){tribute.classList.add('active');tribute.setAttribute('aria-hidden','false')}if(switcher)switcher.setAttribute('data-mode','card');
    document.querySelectorAll('[data-action="set-credit-payment"]').forEach(function(button){var active=button.getAttribute('data-payment-mode')==='card';button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')});
    var head=page&&page.querySelector('.credits-page-head>div:first-child');if(head){var kicker=head.querySelector('span'),title=head.querySelector('h2');if(kicker)kicker.textContent='BANK CARD';if(title)title.textContent='Buy credits';head.setAttribute('dir','ltr')}
    syncSwitchIndicator();renderCurrencies();renderProducts();haptic('light');
  }

  function deactivateCardMode(next){
    if(!cardModeActive){setTimeout(syncSwitchIndicator,0);return}cardModeActive=false;var page=q('creditsPage'),tribute=q('creditsTributeMode');if(page)page.classList.remove('tribute-payment-active');if(tribute){tribute.classList.remove('active');tribute.setAttribute('aria-hidden','true')}var switcher=q('creditsPaymentSwitch');if(switcher)switcher.setAttribute('data-mode',next||'stars');setTimeout(syncSwitchIndicator,0);
  }

  function openCheckout(paymentUrl,webappUrl){
    if(paymentUrl&&tg&&typeof tg.openLink==='function'){try{tg.openLink(paymentUrl,{try_instant_view:false});return true}catch(error){}}
    if(paymentUrl){try{window.location.assign(paymentUrl);return true}catch(error){}}
    if(tg&&webappUrl&&typeof tg.openTelegramLink==='function'){try{tg.openTelegramLink(webappUrl);return true}catch(error){}}
    if(webappUrl){try{window.location.assign(webappUrl);return true}catch(error){}}return false;
  }

  function openPendingCheckout(){
    var pending=storageGet(PENDING_KEY);if(!pending||(!pending.paymentUrl&&!pending.webappPaymentUrl))return toast('Checkout link is not ready');haptic('medium');if(!openCheckout(pending.paymentUrl,pending.webappPaymentUrl)){transientState={productId:pending.productId,kind:'failed',copy:'Could not open checkout · tap to retry'};renderProducts();toast('Could not open checkout')}
  }

  async function startCardPayment(productId){
    if(!productId)return toast('Payment link coming soon');
    if(cardBusy)return;cardBusy=true;transientState={productId:productId,kind:'loading',copy:'Preparing checkout'};renderProducts();
    try{
      var data=await api('/mini-app/api/tribute-order',{productId:productId});
      if(!data.paymentUrl||!data.orderUuid)throw new Error('Tribute did not return a payment link.');
      storageSet(PENDING_KEY,{orderUuid:data.orderUuid,productId:data.productId,credits:data.credits,amountMinor:data.amountMinor,currency:data.currency,paymentUrl:data.paymentUrl||'',webappPaymentUrl:data.webappPaymentUrl||'',createdAt:Date.now()});
      transientState=null;renderProducts();haptic('medium');openCheckout(data.paymentUrl,data.webappPaymentUrl);
    }catch(error){
      var message=String(error&&error.message||'Could not start card checkout').trim();
      transientState={productId:productId,kind:'failed',copy:'Checkout unavailable · tap to retry'};renderProducts();toast(message);haptic('error');
      setTimeout(function(){if(transientState&&transientState.kind==='failed'&&String(transientState.productId||'')===String(productId)){transientState=null;renderProducts()}},2600);
    }finally{cardBusy=false}
  }

  async function checkPending(force){
    var pending=storageGet(PENDING_KEY);if(!pending||!pending.orderUuid||pendingCheckBusy)return;var now=Date.now();if(!force&&now-lastPendingCheckAt<1200)return;lastPendingCheckAt=now;pendingCheckBusy=true;
    try{
      var data=await api('/mini-app/api/tribute-status',{orderUuid:pending.orderUuid});
      if(data.status==='paid'&&data.credited){
        storageRemove(PENDING_KEY);var balance=Math.max(0,Number(data.balance)||0),credits=Math.max(0,Number(data.credits)||Number(pending.credits)||0);var mainBalance=q('balance'),pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(balance);if(pageBalance)pageBalance.textContent=number(balance);
        transientState={productId:pending.productId,kind:'success',copy:number(credits)+' credits added'};renderProducts();haptic('success');storageSet(SUCCESS_KEY,{balance:balance,credits:credits,productId:pending.productId,at:Date.now()});setTimeout(function(){window.location.reload()},950)
      }else if(data.status==='refunded'){
        storageRemove(PENDING_KEY);transientState={productId:pending.productId,kind:'failed',copy:'Payment refunded'};renderProducts();haptic('error')
      }else{transientState=null;renderProducts()}
    }catch(error){if(force)toast(error.message||'Could not check payment')}finally{pendingCheckBusy=false}
  }

  function restoreSuccessAfterReload(){
    var success=storageGet(SUCCESS_KEY);if(!success)return;storageRemove(SUCCESS_KEY);
    setTimeout(function(){var pill=q('creditPill');if(pill&&typeof pill.click==='function')pill.click();setTimeout(function(){activateCardMode();if(success.productId){transientState={productId:success.productId,kind:'success',copy:number(success.credits||0)+' credits added'};renderProducts()}else{toast(number(success.credits||0)+' credits added')}var mainBalance=q('balance'),pageBalance=q('creditsPageBalance');if(mainBalance)mainBalance.textContent=number(success.balance||0);if(pageBalance)pageBalance.textContent=number(success.balance||0)},90)},520)
  }

  document.body.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button)return;var action=button.getAttribute('data-action'),mode=button.getAttribute('data-payment-mode');
    if(action==='set-credit-payment'&&mode==='card'){event.preventDefault();event.stopImmediatePropagation();activateCardMode();return}
    if(action==='set-credit-payment'&&(mode==='stars'||mode==='toman')){deactivateCardMode(mode);return}
    if(action==='set-tribute-currency'){event.preventDefault();event.stopImmediatePropagation();setCurrency(button.getAttribute('data-currency')||'usd');return}
    if(action==='catalog-tribute-product'){event.preventDefault();event.stopImmediatePropagation();haptic('light');toast('Payment link coming soon');return}
    if(action==='buy-tribute-product'){event.preventDefault();event.stopImmediatePropagation();startCardPayment(button.getAttribute('data-product-id')||'');return}
    if(action==='open-tribute-checkout'){event.preventDefault();event.stopImmediatePropagation();openPendingCheckout();return}
  },true);

  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkPending(false)});window.addEventListener('focus',function(){checkPending(false)},{passive:true});

  function boot(attempt){
    if(!installUi()){if(attempt<30)setTimeout(function(){boot(attempt+1)},80);return}
    api('/mini-app/api/tribute-config',{}).then(function(data){
      applyConfig(data);setTimeout(syncPaymentSwitcher,850);restoreSuccessAfterReload();if(storageGet(PENDING_KEY))setTimeout(function(){checkPending(false)},1100)
    }).catch(function(){
      applyConfig({configured:false,available:false,products:[],currencies:CURRENCIES});setTimeout(syncPaymentSwitcher,250)
    })
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0)},{once:true});else boot(0);
})();
`;