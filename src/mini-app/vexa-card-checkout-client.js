export const VEXA_CARD_CHECKOUT_CLIENT_JS = String.raw`
(function(){
  if(window.__vexaOneTimeCardCheckoutLoaded)return;
  window.__vexaOneTimeCardCheckoutLoaded=true;

  var tg=window.Telegram&&window.Telegram.WebApp;
  var initData=(tg&&tg.initData)||'';
  var enabled=false;
  var busy=false;
  var checking=false;
  var observer=null;
  var PENDING_KEY='vexa_card_checkout_pending_v1';

  function q(id){return document.getElementById(id)}
  function number(value){return Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US')}
  function storageGet(){try{var raw=sessionStorage.getItem(PENDING_KEY);return raw?JSON.parse(raw):null}catch(error){return null}}
  function storageSet(value){try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(value))}catch(error){}}
  function storageRemove(){try{sessionStorage.removeItem(PENDING_KEY)}catch(error){}}
  function haptic(kind){if(!tg||!tg.HapticFeedback)return;try{if(kind==='success'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('success');else if(kind==='error'&&tg.HapticFeedback.notificationOccurred)tg.HapticFeedback.notificationOccurred('error');else if(tg.HapticFeedback.impactOccurred)tg.HapticFeedback.impactOccurred(kind||'light')}catch(error){}}
  function toast(message){var node=q('toast');if(!node)return;node.textContent=String(message||'').replace(/[.!]+$/,'');node.classList.remove('show');void node.offsetWidth;node.classList.add('show');setTimeout(function(){node.classList.remove('show')},3200)}

  async function post(path,payload){
    var response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({initData:initData},payload||{}))});
    var data=await response.json().catch(function(){return{}});
    if(!response.ok)throw new Error(data.error||'Card checkout error');
    return data;
  }

  function setPaymentState(kind,title,copy,action,label){
    var state=q('tributePaymentState');if(!state)return;
    var show=!!kind;
    state.classList.toggle('show',show);
    state.classList.toggle('success',kind==='success');
    state.classList.toggle('failed',kind==='failed');
    state.setAttribute('aria-hidden',show?'false':'true');
    var titleNode=q('tributeStateTitle'),copyNode=q('tributeStateCopy');
    if(titleNode&&title)titleNode.textContent=title;
    if(copyNode&&copy)copyNode.textContent=copy;
    var button=state.querySelector('.tribute-state-check');
    if(button){
      if(action){button.style.display='';button.setAttribute('data-action',action);button.textContent=label||'Open'}
      else{button.style.display='none';button.removeAttribute('data-action')}
    }
  }

  function openExternal(url){
    if(!url)return false;
    if(tg&&typeof tg.openLink==='function'){
      try{tg.openLink(url,{try_instant_view:false});return true}catch(error){}
    }
    try{window.open(url,'_blank','noopener,noreferrer');return true}catch(error){}
    try{window.location.assign(url);return true}catch(error){}
    return false;
  }

  function upgradeButtons(){
    if(!enabled)return;
    document.querySelectorAll('[data-action="buy-tribute-product"]').forEach(function(button){
      button.setAttribute('data-action','buy-vexa-card-product');
      button.setAttribute('data-vexa-checkout','one-time');
    });
  }

  function watchProducts(){
    var root=q('tributeProductList')||document.body;
    if(!root||observer)return;
    observer=new MutationObserver(function(){upgradeButtons()});
    observer.observe(root,{childList:true,subtree:true});
    upgradeButtons();
  }

  async function start(productId,button){
    if(busy)return;
    busy=true;
    if(button){button.disabled=true;button.classList.add('loading')}
    try{
      var data=await post('/mini-app/api/vexa-card-checkout',{productId:productId});
      if(!data.checkoutUrl||!data.statusUrl)throw new Error('Secure checkout link was not created');
      storageSet({
        checkoutId:data.checkoutId||'',
        checkoutUrl:data.checkoutUrl,
        statusUrl:data.statusUrl,
        credits:Number(data.credits||0),
        amountMinor:Number(data.amountMinor||0),
        currency:String(data.currency||'usd'),
        expiresAt:String(data.expiresAt||''),
        createdAt:Date.now()
      });
      setPaymentState('waiting','Secure checkout ready','No Telegram login is needed. Complete the card payment, then return to Vexa.','open-vexa-card-checkout','Open');
      haptic('medium');
      if(!openExternal(data.checkoutUrl))throw new Error('Could not open secure checkout');
    }catch(error){
      var message=String(error&&error.message||'Could not start secure checkout');
      toast(message);setPaymentState('failed','Checkout unavailable',message,null);haptic('error');
    }finally{
      busy=false;if(button){button.disabled=false;button.classList.remove('loading')}
    }
  }

  function openPending(){
    var pending=storageGet();
    if(!pending||!pending.checkoutUrl)return toast('Checkout link is not ready');
    haptic('medium');
    if(!openExternal(pending.checkoutUrl))toast('Could not open secure checkout');
  }

  async function checkPending(force){
    var pending=storageGet();
    if(!pending||!pending.statusUrl||checking)return;
    checking=true;
    try{
      var response=await fetch(pending.statusUrl,{cache:'no-store'});
      var data=await response.json().catch(function(){return{}});
      if(!response.ok)throw new Error(data.error||'Could not check payment');
      if(data.credited){
        storageRemove();
        var balance=Math.max(0,Number(data.balance)||0),credits=Math.max(0,Number(data.credits)||Number(pending.credits)||0);
        var mainBalance=q('balance'),pageBalance=q('creditsPageBalance');
        if(mainBalance)mainBalance.textContent=number(balance);
        if(pageBalance)pageBalance.textContent=number(balance);
        setPaymentState('success','Credits added',number(credits)+' credits are in your balance.',null);
        haptic('success');
        setTimeout(function(){window.location.reload()},1100);
      }else if(data.status==='paid'){
        setPaymentState('waiting','Payment received','Adding credits to your Vexa balance…',null);
        if(force)setTimeout(function(){checkPending(false)},900);
      }else if(data.status==='refunded'){
        storageRemove();setPaymentState('failed','Payment refunded','The credited amount was reversed.',null);haptic('error');
      }else if(data.status==='expired'){
        storageRemove();setPaymentState('failed','Checkout expired','Create a new secure checkout link and try again.',null);
      }else{
        setPaymentState('waiting','Waiting for payment','Complete the secure card payment, then return to Vexa.','open-vexa-card-checkout','Open');
      }
    }catch(error){if(force)toast(error.message||'Could not check payment')}
    finally{checking=false}
  }

  function restore(){
    var pending=storageGet();
    if(!pending)return;
    setPaymentState('waiting','Waiting for payment','Complete the secure card payment, then return to Vexa.','open-vexa-card-checkout','Open');
    setTimeout(function(){checkPending(false)},700);
  }

  document.body.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('button'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');
    if(action==='buy-vexa-card-product'){
      event.preventDefault();event.stopImmediatePropagation();
      start(button.getAttribute('data-product-id')||'',button);return;
    }
    if(action==='open-vexa-card-checkout'){
      event.preventDefault();event.stopImmediatePropagation();openPending();return;
    }
  },true);

  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkPending(false)});
  window.addEventListener('focus',function(){checkPending(false)},{passive:true});

  function boot(){
    post('/mini-app/api/vexa-card-checkout-config',{}).then(function(data){
      enabled=!!data.available;
      if(!enabled)return;
      watchProducts();restore();
      setTimeout(upgradeButtons,350);setTimeout(upgradeButtons,1000);setTimeout(upgradeButtons,2200);
    }).catch(function(){enabled=false});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
`;
