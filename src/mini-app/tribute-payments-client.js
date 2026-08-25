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
  var pendingReturnCheckTimer=0;
  var selectedCurrency='usd';
  var MAX_CARD_PACKS=6;
  var PENDING_KEY='vexa_tribute_pending_v3';
  var SUCCESS_KEY='vexa_tribute_success_v2';
  var directCardLaunch=bankCardLaunchRequested();
  var directLaunchObserver=null;
  var tributeConfigResolved=false;
  var directLaunchApplied=false;
  var restoredSuccess=null;

  var CARD_CATALOG=[
    {id:'card_2',credits:11236,bonus:0,giftPercent:0,prices:{usd:{amountMinor:200},eur:{amountMinor:199},rub:{amountMinor:17000}}},
    {id:'card_5',credits:28090,bonus:2809,giftPercent:10,prices:{usd:{amountMinor:500},eur:{amountMinor:499},rub:{amountMinor:42500}}},
    {id:'card_10',credits:56180,bonus:11236,giftPercent:20,prices:{usd:{amountMinor:1000},eur:{amountMinor:999},rub:{amountMinor:85000}}},
    {id:'card_20',credits:112360,bonus:28090,giftPercent:25,prices:{usd:{amountMinor:2000},eur:{amountMinor:1999},rub:{amountMinor:170000}}}
  ];
  var CURRENCIES=[
    {code:'usd',label:'USD',symbol:'$'},
    {code:'eur',label:'EUR',symbol:'€'},
    {code:'rub',label:'RUB',symbol:'₽'}
  ];

  function q(id){return document.getElementById(id)}
  function number(value){return Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US')}
  function formatUsd(credits){return '$'+(Math.max(0,Number(credits)||0)*.000178).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function usageEstimate(credits){var usd=Math.round(Math.max(0,Number(credits)||0)*.000178*100)/100;return{voiceMinutes:usd>0?Math.ceil(usd/.17):0,images:usd>0?Math.ceil(usd/.01-1e-9):0}}
  function usageText(credits){var usage=usageEstimate(credits);return '≈'+number(usage.voiceMinutes)+' min voice · ≈'+number(usage.images)+' images'}
  function syncBalance(value){var balance=Math.max(0,Number(value)||0);try{window.dispatchEvent(new CustomEvent('vexa:credits-balance',{detail:{balance:balance,source:'tribute'}}))}catch(error){}}
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
        currency:currency,
        giftPercent:Number(pack.giftPercent||0),
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
        '<div class="tribute-card-head"><div><h3>Choose your amount</h3></div></div>'+
        '<div id="tributeCurrencyPicker" class="tribute-currency-picker"></div>'+
        '<div id="tributeProductList" class="credits-pack-list"></div>'+
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

  function usageLabel(product){
    var total=Math.max(0,Number(product.totalCredits||0)||Number(product.credits||0)+Number(product.bonus||0));
    return usageText(total);
  }

  function priceMarkup(product){
    return money(product.amountMinor,product.currency);
  }

  function titleMarkup(product){
    var price=priceMarkup(product);
    return '<span class="credits-pack-title"><strong>'+price+'</strong><em>'+number(product.giftPercent)+'% GIFT</em></span>';
  }

  function renderProducts(){
    var list=q('tributeProductList');if(!list)return;
    var pending=storageGet(PENDING_KEY);
    var products=catalogProducts(selectedCurrency);
    list.innerHTML=products.map(function(product){
      var isPending=!!(pending&&String(pending.productId||'')===String(product.productId||'')&&product.productId);
      var action=isPending?'open-tribute-checkout':(product.checkoutReady?'buy-tribute-product':'catalog-tribute-product');
      return '<button class="credits-pack" type="button" data-action="'+action+'" data-product-id="'+String(product.productId||'')+'" data-catalog-id="'+String(product.catalogId||'')+'">'+
        '<span class="credits-pack-main">'+titleMarkup(product)+'<span class="credits-pack-total">'+usageLabel(product)+'</span></span>'+
      '</button>';
    }).join('');
  }

  function activateCardMode(){
    cardModeActive=true;
    var page=q('creditsPage'),stars=q('creditsStarsMode'),toman=q('creditsTomanMode'),tribute=q('creditsTributeMode'),switcher=q('creditsPaymentSwitch');
    if(page){page.classList.remove('toman-payment-active');page.classList.add('tribute-payment-active')}if(stars)stars.classList.remove('active');if(toman){toman.classList.remove('active');toman.setAttribute('aria-hidden','true')}if(tribute){tribute.classList.add('active');tribute.setAttribute('aria-hidden','false')}if(switcher)switcher.setAttribute('data-mode','card');
    document.querySelectorAll('[data-action="set-credit-payment"]').forEach(function(button){var active=button.getAttribute('data-payment-mode')==='card';button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')});
    var head=page&&page.querySelector('.credits-page-head>div:first-child');if(head){var title=head.querySelector('h2');if(title)title.textContent='Add USD balance';head.setAttribute('dir','ltr')}
    syncPaymentSwitcher();renderCurrencies();renderProducts();haptic('light');
  }

  function bankCardLaunchRequested(){
    var raw='';try{raw=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.start_param||''}catch(error){}
    if(!raw)try{var params=new URLSearchParams(window.location.search);raw=params.get('tgWebAppStartParam')||params.get('startapp')||params.get('section')||''}catch(error){}
    return String(raw||'').trim().toLowerCase()==='bank_card';
  }

  function showRestoredSuccess(){
    var success=restoredSuccess;if(!success)return;
    restoredSuccess=null;
    toast(formatUsd(success.credits||0)+' balance added');syncBalance(success.balance||0);
  }

  function maybeActivateDirectCardLaunch(){
    if(!directCardLaunch||directLaunchApplied||!tributeConfigResolved)return;
    var page=q('creditsPage');
    if(!page||!page.classList.contains('show'))return;
    directLaunchApplied=true;
    if(directLaunchObserver){directLaunchObserver.disconnect();directLaunchObserver=null}
    activateCardMode();showRestoredSuccess();
  }

  function watchDirectCardLaunch(){
    if(!directCardLaunch||directLaunchObserver||directLaunchApplied)return;
    var page=q('creditsPage');if(!page)return;
    directLaunchObserver=new MutationObserver(maybeActivateDirectCardLaunch);
    directLaunchObserver.observe(page,{attributes:true,attributeFilter:['class']});
    maybeActivateDirectCardLaunch();
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
    var pending=storageGet(PENDING_KEY);if(!pending||(!pending.paymentUrl&&!pending.webappPaymentUrl))return toast('Checkout link is not ready');
    haptic('medium');if(!openCheckout(pending.paymentUrl,pending.webappPaymentUrl))toast('Could not open checkout');
  }

  async function startCardPayment(productId,button){
    if(!productId)return toast('Payment link coming soon');
    if(cardBusy)return;cardBusy=true;
    if(button){button.disabled=true;button.classList.add('loading')}
    try{
      var data=await api('/mini-app/api/tribute-order',{productId:productId});
      if(!data.paymentUrl||!data.orderUuid)throw new Error('Tribute did not return a payment link.');
      storageSet(PENDING_KEY,{orderUuid:data.orderUuid,productId:data.productId,credits:data.credits,amountMinor:data.amountMinor,currency:data.currency,paymentUrl:data.paymentUrl||'',webappPaymentUrl:data.webappPaymentUrl||'',createdAt:Date.now()});
      haptic('medium');openCheckout(data.paymentUrl,data.webappPaymentUrl);
    }catch(error){
      toast(String(error&&error.message||'Could not start card checkout').trim());haptic('error');
    }finally{
      cardBusy=false;if(button){button.disabled=false;button.classList.remove('loading')}
    }
  }

  async function checkPending(force){
    var pending=storageGet(PENDING_KEY);if(!pending||!pending.orderUuid||pendingCheckBusy)return;var now=Date.now();if(!force&&now-lastPendingCheckAt<1200)return;lastPendingCheckAt=now;pendingCheckBusy=true;
    try{
      var data=await api('/mini-app/api/tribute-status',{orderUuid:pending.orderUuid});
      if(data.status==='paid'&&data.credited){
        storageRemove(PENDING_KEY);var balance=Math.max(0,Number(data.balance)||0),credits=Math.max(0,Number(data.credits)||Number(pending.credits)||0);syncBalance(balance);
        haptic('success');storageSet(SUCCESS_KEY,{balance:balance,credits:credits,at:Date.now()});renderProducts();setTimeout(function(){window.location.reload()},950)
      }else if(data.status==='refunded'){
        storageRemove(PENDING_KEY);renderProducts();toast('Payment refunded');haptic('error')
      }
    }catch(error){if(force)toast(error.message||'Could not check payment')}finally{pendingCheckBusy=false}
  }

  function verifyPendingAfterReturn(){
    if(!storageGet(PENDING_KEY))return;
    checkPending(false);
    if(pendingReturnCheckTimer)clearTimeout(pendingReturnCheckTimer);
    pendingReturnCheckTimer=setTimeout(function(){
      pendingReturnCheckTimer=0;
      if(storageGet(PENDING_KEY))checkPending(false)
    },2200)
  }

  function restoreSuccessAfterReload(){
    var success=storageGet(SUCCESS_KEY);if(!success)return;storageRemove(SUCCESS_KEY);
    if(directCardLaunch){restoredSuccess=success;maybeActivateDirectCardLaunch();if(cardModeActive)showRestoredSuccess();return}
    setTimeout(function(){var pill=q('creditPill');if(pill&&typeof pill.click==='function')pill.click();setTimeout(function(){activateCardMode();toast(formatUsd(success.credits||0)+' balance added');syncBalance(success.balance||0)},90)},520)
  }

  document.body.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button)return;var action=button.getAttribute('data-action'),mode=button.getAttribute('data-payment-mode');
    if(action==='set-credit-payment'&&mode==='card'){event.preventDefault();event.stopImmediatePropagation();activateCardMode();return}
    if(action==='set-credit-payment'&&(mode==='stars'||mode==='toman')){deactivateCardMode(mode);return}
    if(action==='set-tribute-currency'){event.preventDefault();event.stopImmediatePropagation();setCurrency(button.getAttribute('data-currency')||'usd');return}
    if(action==='catalog-tribute-product'){event.preventDefault();event.stopImmediatePropagation();haptic('light');toast('Payment link coming soon');return}
    if(action==='buy-tribute-product'){event.preventDefault();event.stopImmediatePropagation();startCardPayment(button.getAttribute('data-product-id')||'',button);return}
    if(action==='open-tribute-checkout'){event.preventDefault();event.stopImmediatePropagation();openPendingCheckout();return}
  },true);

  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')verifyPendingAfterReturn()});window.addEventListener('focus',function(){verifyPendingAfterReturn()},{passive:true});

  function boot(attempt){
    if(!installUi()){if(attempt<30)setTimeout(function(){boot(attempt+1)},80);return}
    watchDirectCardLaunch();
    api('/mini-app/api/tribute-config',{}).then(function(data){
      applyConfig(data);tributeConfigResolved=true;maybeActivateDirectCardLaunch();restoreSuccessAfterReload();if(storageGet(PENDING_KEY))setTimeout(verifyPendingAfterReturn,1100)
    }).catch(function(){
      applyConfig({configured:false,available:false,products:[],currencies:CURRENCIES});tributeConfigResolved=true;maybeActivateDirectCardLaunch()
    })
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0)},{once:true});else boot(0);
})();
`;
