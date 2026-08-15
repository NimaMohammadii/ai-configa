import { MINI_APP_JS as BASE_MINI_APP_JS } from "./client-original.js";

const PURCHASE_DISCOUNT_PATCH = String.raw`
  var purchaseDiscountState=null;
  var purchaseTomanConfig=null;
  var purchaseDiscountExpiryTimer=null;
  var purchaseTomanSelectedPackageId='';
  var purchaseBaseFetch=window.fetch.bind(window);

  function purchaseDiscountPercent(){var state=purchaseDiscountState;if(!state)return 0;var expires=Number(state.expiresAt)||0;if(expires>0&&expires*1000<=Date.now())return 0;return Math.max(0,Math.min(95,Number(state.percent)||0))}
  function purchaseDiscounted(value){var percent=purchaseDiscountPercent();return percent?Math.max(1,Math.ceil(Number(value||0)*(100-percent)/100)):Math.max(0,Math.ceil(Number(value||0)))}
  function purchaseFormat(value){return Math.max(0,Math.ceil(Number(value)||0)).toLocaleString('en-US')}
  function purchaseFormatMinutes(credits){return (Math.max(0,Number(credits)||0)/1000).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:1})}
  function purchaseSetState(discount){purchaseDiscountState=discount&&Number(discount.percent)>0?{percent:Number(discount.percent),expiresAt:Number(discount.expiresAt)||0}:null;clearTimeout(purchaseDiscountExpiryTimer);var expires=Number(purchaseDiscountState&&purchaseDiscountState.expiresAt)||0;if(expires>0){var delay=Math.max(0,expires*1000-Date.now());purchaseDiscountExpiryTimer=setTimeout(function(){purchaseDiscountState=null;purchaseRenderPrices()},Math.min(delay,2147483647))}setTimeout(purchaseRenderPrices,0)}
  function purchaseEnsureStyles(){if(document.getElementById('purchaseDiscountStyles'))return;var style=document.createElement('style');style.id='purchaseDiscountStyles';style.textContent='.credits-page{height:auto!important}.purchase-price-pair{display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap}.purchase-price-original{color:rgba(255,255,255,.34)!important;text-decoration:line-through;text-decoration-thickness:1.2px;font-size:.78em!important;font-weight:650!important}.purchase-price-final{color:inherit;font:inherit}.credits-pack-price strong .purchase-price-original{font-size:10px!important}.credits-pack-price strong .purchase-price-final{font-size:inherit}.credits-custom-summary strong .purchase-price-original{font-size:11px!important}.purchase-wheel-badge{display:none;width:max-content;min-height:19px;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.11);color:rgba(255,255,255,.78);font-size:8px;font-weight:820;line-height:1;letter-spacing:.02em;white-space:nowrap}.purchase-wheel-badge.show{display:inline-flex;align-items:center}.purchase-stars-discount-wrap{display:flex!important;flex-direction:column;align-items:flex-end;justify-content:center;gap:4px}.purchase-toman-packs{margin-top:18px!important}.toman-checkout:not([data-step="amount"])+.purchase-toman-packs{display:none!important}.purchase-toman-packs .credits-pack-list{direction:rtl}.purchase-toman-packs .credits-pack{width:100%;text-align:right}.purchase-toman-packs .credits-pack-price{direction:ltr;text-align:left}.purchase-toman-packs .credits-pack-price strong{font-size:12px}.purchase-toman-packs .credits-pack-total{direction:rtl}.toman-payment-summary #tomanAmountValue{display:flex!important;align-items:baseline;justify-content:flex-start;gap:8px;flex-wrap:wrap}.toman-payment-summary #tomanAmountValue .purchase-price-original{font-size:10px!important;direction:ltr}.toman-payment-summary #tomanAmountValue .purchase-price-final{font-size:inherit;font-weight:inherit;direction:ltr}';document.head.appendChild(style)}
  function purchasePairHtml(original,discounted,suffix){return '<span class="purchase-price-pair"><span class="purchase-price-original">'+purchaseFormat(original)+' '+suffix+'</span><span class="purchase-price-final">'+purchaseFormat(discounted)+' '+suffix+'</span></span>'}
  function purchaseEnsureStarsBadge(){var summary=document.querySelector('#creditsStarsMode .credits-custom-summary');if(!summary)return null;var wrap=summary.lastElementChild;if(!wrap)return null;wrap.classList.add('purchase-stars-discount-wrap');var badge=document.getElementById('starsDiscountBadge');if(!badge){badge=document.createElement('span');badge.id='starsDiscountBadge';badge.className='purchase-wheel-badge';badge.setAttribute('aria-hidden','true');wrap.insertBefore(badge,wrap.firstChild)}return badge}
  function purchaseDecorateStarMinutes(){var totals={mini_3000:3000,mini_10000:10600,mini_18000:20200,mini_30000:36000};document.querySelectorAll('#creditsStarsMode .credits-pack[data-package-id]').forEach(function(card){var id=card.getAttribute('data-package-id')||'';var total=totals[id];var node=card.querySelector('.credits-pack-total');if(total&&node)node.textContent=purchaseFormat(total)+' total credits · '+purchaseFormatMinutes(total)+' min voice'})}
  function purchaseRenderStars(){var percent=purchaseDiscountPercent();var input=document.getElementById('customCreditsInput');var credits=Math.max(1,Math.floor(Number(input&&input.value)||0));var baseStars=Math.max(80,Math.ceil(credits*12/1000));var finalStars=percent?purchaseDiscounted(baseStars):baseStars;var custom=document.getElementById('customStarsValue');if(custom)custom.innerHTML=percent?purchasePairHtml(baseStars,finalStars,'Stars'):purchaseFormat(baseStars)+' Stars';var buy=document.getElementById('customCreditsBuy');var buyText=buy&&buy.querySelector('span');if(buyText)buyText.textContent='Continue with '+purchaseFormat(finalStars)+' Stars';var badge=purchaseEnsureStarsBadge();if(badge){badge.textContent=percent?purchaseFormat(percent)+'% Wheel discount':'';badge.classList.toggle('show',!!percent);badge.setAttribute('aria-hidden',percent?'false':'true')}var bases={mini_3000:36,mini_10000:118,mini_18000:216,mini_30000:360};document.querySelectorAll('#creditsStarsMode .credits-pack[data-package-id]').forEach(function(card){var id=card.getAttribute('data-package-id')||'';var base=bases[id];var strong=card.querySelector('.credits-pack-price strong');if(!base||!strong)return;strong.innerHTML=percent?'<span class="purchase-price-pair"><span class="purchase-price-original">'+purchaseFormat(base)+' ★</span><span class="purchase-price-final">'+purchaseFormat(purchaseDiscounted(base))+' <i>★</i></span></span>':purchaseFormat(base)+' <i>★</i>'});purchaseDecorateStarMinutes()}
  function purchaseTomanPackages(){return purchaseTomanConfig&&Array.isArray(purchaseTomanConfig.packages)?purchaseTomanConfig.packages:[]}
  function purchaseEnsureTomanPackages(){var checkout=document.getElementById('tomanCheckout');if(!checkout)return null;var section=document.getElementById('tomanCreditPackages');if(section)return section;section=document.createElement('section');section.id='tomanCreditPackages';section.className='credits-packs-section purchase-toman-packs';section.dir='rtl';section.innerHTML='<div class="credits-packs-head"><div><span>پکیج‌های آماده</span><h3>پکیج‌های کردیت</h3></div><small>هدیه داخل پکیج</small></div><div id="tomanCreditPackageList" class="credits-pack-list"></div>';checkout.insertAdjacentElement('afterend',section);return section}
  function purchaseTomanPackageMarkup(pack,index){var credits=Number(pack.credits)||0,bonus=Number(pack.bonus)||0,total=Number(pack.totalCredits)||credits+bonus,original=Number(pack.originalAmountValue)||Number(pack.amountValue)||0,percent=purchaseDiscountPercent(),finalAmount=percent?purchaseDiscounted(original):original;var title=bonus?purchaseFormat(credits)+' <b>+ '+purchaseFormat(bonus)+'</b>':purchaseFormat(credits);var bonusLabel=bonus?'<em>'+purchaseFormat(bonus)+' هدیه</em>':'<small>کردیت</small>';var price=percent?purchasePairHtml(original,finalAmount,'تومان'):purchaseFormat(original)+' تومان';return '<button class="credits-pack toman-credit-pack'+(index===1?' featured':'')+'" data-action="buy-toman-package" data-toman-package-id="'+String(pack.id||'')+'" type="button"><span class="credits-pack-main"><span class="credits-pack-title"><strong>'+title+'</strong>'+bonusLabel+'</span><span class="credits-pack-total">'+purchaseFormat(total)+' کردیت · '+purchaseFormatMinutes(total)+' دقیقه صدا</span></span><span class="credits-pack-price"><strong>'+price+'</strong><small>پرداخت با کارت</small></span></button>'}
  function purchaseRenderTomanPackages(){if(!purchaseTomanConfig)return;var section=purchaseEnsureTomanPackages();var list=document.getElementById('tomanCreditPackageList');if(!section||!list)return;var packs=purchaseTomanPackages();section.style.display=packs.length?'block':'none';list.innerHTML=packs.map(purchaseTomanPackageMarkup).join('')}
  function purchaseRenderToman(){if(!purchaseTomanConfig)return;var percent=purchaseDiscountPercent();var input=document.getElementById('tomanCreditsInput');var credits=Math.max(1,Math.floor(Number(input&&input.value)||0));var price=Number(purchaseTomanConfig.pricePer1000)||39000;var minimum=Number(purchaseTomanConfig.minimumAmount)||260000;var original=Math.max(minimum,Math.ceil(credits/1000*price));var finalAmount=percent?purchaseDiscounted(original):original;var node=document.getElementById('tomanAmountValue');if(node)node.innerHTML=percent?purchasePairHtml(original,finalAmount,'تومان'):purchaseFormat(original)+' تومان';if(!purchaseTomanSelectedPackageId){var order=document.getElementById('tomanOrderAmount');if(order)order.innerHTML=percent?purchasePairHtml(original,finalAmount,'تومان'):purchaseFormat(original)+' تومان'}purchaseRenderTomanPackages()}
  function purchaseRenderPrices(){purchaseEnsureStyles();purchaseRenderStars();purchaseRenderToman()}
  function purchaseBindPriceInputs(){['customCreditsInput','customCreditsRange','tomanCreditsInput','tomanCreditsRange'].forEach(function(id){var node=document.getElementById(id);if(!node||node.dataset.purchaseDiscountBound)return;node.dataset.purchaseDiscountBound='1';node.addEventListener('input',function(){if(id.indexOf('toman')===0)purchaseTomanSelectedPackageId='';setTimeout(purchaseRenderPrices,0)});node.addEventListener('change',function(){setTimeout(purchaseRenderPrices,0)})})}
  function purchaseSelectTomanPackage(packageId){var pack=purchaseTomanPackages().find(function(item){return String(item.id||'')===String(packageId||'')});if(!pack)return;var original=Number(pack.originalAmountValue)||Number(pack.amountValue)||0;var percent=purchaseDiscountPercent();var amount=percent?purchaseDiscounted(original):original;var total=Number(pack.totalCredits)||Number(pack.credits||0)+Number(pack.bonus||0);purchaseTomanSelectedPackageId=String(pack.id||'');tomanOrder={packageId:purchaseTomanSelectedPackageId,credits:total,amount:amount,originalAmount:original,discountPercent:percent,bonus:Number(pack.bonus)||0};setText('tomanOrderCredits',purchaseFormat(total)+' کردیت · '+purchaseFormatMinutes(total)+' دقیقه صدا');var amountNode=document.getElementById('tomanOrderAmount');if(amountNode)amountNode.innerHTML=percent?purchasePairHtml(original,amount,'تومان'):purchaseFormat(amount)+' تومان';if(tomanConfig&&tomanConfig.cardNumber)setText('tomanCardNumber',formatCardNumber(tomanConfig.cardNumber));setTomanStep('receipt');if(tg&&tg.HapticFeedback&&tg.HapticFeedback.impactOccurred)try{tg.HapticFeedback.impactOccurred('medium')}catch(error){}}
  async function purchasePrepareTomanReceipt(path,init){if(path.indexOf('/mini-app/api/toman-receipt')<0||!init||typeof init.body!=='string')return init;try{var body=JSON.parse(init.body);var authData=String(body&&body.initData||'');if(!authData)return init;var configResponse=await purchaseBaseFetch('/mini-app/api/toman-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:authData})});var config=await configResponse.json().catch(function(){return null});if(!configResponse.ok||!config)return init;purchaseTomanConfig=config;purchaseSetState(Number(config.discountPercent)>0?{percent:Number(config.discountPercent),expiresAt:Number(config.discountExpiresAt)||0}:null);if(purchaseTomanSelectedPackageId){var pack=(Array.isArray(config.packages)?config.packages:[]).find(function(item){return String(item.id||'')===purchaseTomanSelectedPackageId});if(!pack)throw new Error('پکیج انتخاب‌شده دیگر در دسترس نیست');body.packageId=purchaseTomanSelectedPackageId;body.credits=Number(pack.totalCredits)||Number(pack.credits||0)+Number(pack.bonus||0);body.amount=Number(pack.amountValue)||0}else{var credits=Math.max(1,Math.floor(Number(body.credits)||0));var price=Number(config.pricePer1000)||39000;var minimum=Number(config.minimumAmount)||260000;var original=Math.max(minimum,Math.ceil(credits/1000*price));body.amount=purchaseDiscounted(original)}purchaseRenderPrices();var next={};Object.keys(init).forEach(function(key){next[key]=init[key]});next.body=JSON.stringify(body);return next}catch(error){return init}}

  window.fetch=async function(input,init){var path=typeof input==='string'?input:String(input&&input.url||'');var preparedInit=await purchasePrepareTomanReceipt(path,init);var response=await purchaseBaseFetch(input,preparedInit);try{if(path.indexOf('/mini-app/api/session')>=0){response.clone().json().then(function(data){purchaseSetState(data&&data.rewardWheel&&data.rewardWheel.purchaseDiscount)}).catch(function(){})}else if(path.indexOf('/mini-app/api/toman-config')>=0){response.clone().json().then(function(data){purchaseTomanConfig=data||null;purchaseSetState(data&&Number(data.discountPercent)>0?{percent:Number(data.discountPercent),expiresAt:Number(data.discountExpiresAt)||0}:null);setTimeout(purchaseRenderPrices,0)}).catch(function(){})}else if(path.indexOf('/mini-app/api/wheel-spin')>=0){response.clone().json().then(function(data){purchaseSetState(data&&data.purchaseDiscount)}).catch(function(){})}else if(path.indexOf('/mini-app/api/stars-invoice')>=0){response.clone().json().then(function(data){purchaseSetState(data&&data.purchaseDiscount)}).catch(function(){})}}catch(error){}return response};
  document.body.addEventListener('click',function(event){var button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button)return;var action=button.getAttribute('data-action');if(action==='buy-toman-package'){event.preventDefault();event.stopImmediatePropagation();purchaseSelectTomanPackage(button.getAttribute('data-toman-package-id')||'');return}if(action==='continue-toman-payment'||action==='reset-toman-payment')purchaseTomanSelectedPackageId=''},true);
  setTimeout(function(){purchaseBindPriceInputs();purchaseRenderPrices()},0);
`;

function replaceHistoryImplementation(source, pattern, replacement, label) {
  const updated = source.replace(pattern, replacement);
  if (updated === source) throw new Error(`Could not update mini-app history ${label}`);
  return updated;
}

function reusePrimaryAudioPlayerInHistory(source) {
  let updated = source;

  updated = replaceHistoryImplementation(
    updated,
    /  function syncHistoryProgress\(\)\{[^\n]*\}\n/,
    String.raw`  function syncHistoryProgress(){var audio=q('historyAudio');var duration=finiteDuration(audio);var current=duration?Math.min(duration,Math.max(0,Number(audio.currentTime)||0)):0;var ratio=duration?current/duration:0;document.querySelectorAll('[data-history-progress]').forEach(function(row){var active=!!activeHistoryId&&row.getAttribute('data-history-id')===activeHistoryId;var progress=active?ratio:0;var range=row.querySelector('[data-history-seek]');var currentNode=row.querySelector('[data-history-current]');var player=row.closest('[data-history-player]');row.style.setProperty('--wave-progress',(progress*100).toFixed(3)+'%');if(range){range.value=String(Math.round(progress*1000));range.disabled=!active||!duration}if(currentNode)currentNode.textContent=formatTime(active?current:0);if(player)player.classList.toggle('is-playing',active&&!!audio&&!audio.paused&&!audio.ended)})}
`,
    'progress'
  );

  updated = replaceHistoryImplementation(
    updated,
    /  function historyPlayIcon\(\)\{[^\n]*\}\n/,
    String.raw`  function historyPlayIcon(){var button=q('wavePlay');var shape=button&&button.querySelector('.wave-play-shape');return shape?shape.outerHTML:''}
`,
    'play icon'
  );

  updated = replaceHistoryImplementation(
    updated,
    /  function historyShareIcon\(\)\{[^\n]*\}\n/,
    String.raw`  function historyShareIcon(){var button=q('waveShare');var icon=button&&button.querySelector('svg');return icon?icon.outerHTML:''}
  function historyWaveMarkup(id){var source=q('waveSeekWrap');var base=source&&source.querySelector('.wave-svg-base');var baseMarkup=base?base.outerHTML:'';var progressMarkup=baseMarkup?baseMarkup.replace('wave-svg-base','wave-svg-progress'):'';return baseMarkup+progressMarkup+'<input class="wave-range" data-history-seek data-history-id="'+id+'" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek audio" disabled/><div class="wave-meta" aria-hidden="true"><span class="wave-time" data-history-current>0:00</span></div>'}
`,
    'share icon'
  );

  updated = replaceHistoryImplementation(
    updated,
    /  function drawHistory\(items,emptyLabel\)\{[^\n]*\}\n/,
    String.raw`  function drawHistory(items,emptyLabel){var list=q('historyList');if(!list)return;var visible=Array.isArray(items)?items:[];if(!visible.length){list.innerHTML='<div class="history-empty"><div><svg width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.6 8.2A8.2 8.2 0 1 1 4 13M4.6 8.2V4.6M4.6 8.2H8.2M12 7.8v4.6l3.1 1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'+escapeHtml(emptyLabel||'No creations yet')+'</div></div>';return}list.innerHTML=visible.map(function(item){var id=escapeHtml(item.id);var disabled=item.has_audio?'':' disabled';var meta=[item.voice||'Voice',formatHistoryDate(item.created_at)].filter(Boolean).join(' · ');return '<article data-history-item="'+id+'"><p class="history-item-text">'+escapeHtml(item.text||'')+'</p><div class="history-item-foot"><span class="history-meta">'+escapeHtml(meta)+'</span></div><div class="player-history-row" style="margin-bottom:6px"><div class="wave-player show" data-history-player data-history-id="'+id+'"><button class="wave-play history-play" data-action="play-history" data-history-id="'+id+'" type="button" aria-label="Play audio"'+disabled+'>'+historyPlayIcon()+'</button><div class="wave-player-body"><div class="wave-seek" data-history-progress data-history-id="'+id+'" style="--wave-progress:0%">'+historyWaveMarkup(id)+'</div></div><div class="wave-actions"><button class="wave-share history-share" data-action="share-history" data-history-id="'+id+'" type="button" aria-label="Share audio"'+disabled+'>'+historyShareIcon()+'</button></div></div></div></article>'}).join('');syncHistoryProgress()}
`,
    'card renderer'
  );

  updated = replaceHistoryImplementation(
    updated,
    /  function setHistoryPlaying\(id,playing\)\{[^\n]*\}\n/,
    String.raw`  function setHistoryPlaying(id,playing){document.querySelectorAll('.history-play').forEach(function(button){var active=playing&&button.getAttribute('data-history-id')===id;button.classList.toggle('is-playing',active);button.setAttribute('aria-label',active?'Pause audio':'Play audio');var player=button.closest('[data-history-player]');if(player)player.classList.toggle('is-playing',active)});syncHistoryProgress()}
`,
    'play state'
  );

  updated = replaceHistoryImplementation(
    updated,
    /  async function shareHistory\(button\)\{[^\n]*\}\n/,
    String.raw`  async function shareHistory(button){var id=button.getAttribute('data-history-id')||'';if(!id||button.classList.contains('sharing'))return;button.classList.add('sharing');try{var item=await getHistoryAudio(id);await shareAudioSource(item.src,item.filename)}catch(error){if(error&&error.name!=='AbortError')toast(error.message||'Could not share audio')}finally{button.classList.remove('sharing')}}
`,
    'share state'
  );

  const oldPointerRow = "var row=event.target.closest('.history-progress')";
  if (!updated.includes(oldPointerRow)) throw new Error('Could not update mini-app history scrub row');
  updated = updated.replace(oldPointerRow, "var row=event.target.closest('[data-history-progress]')");

  const oldScrubbingRows = "document.querySelectorAll('.history-progress.is-scrubbing')";
  if (!updated.includes(oldScrubbingRows)) throw new Error('Could not update mini-app history scrub state');
  updated = updated.replace(oldScrubbingRows, "document.querySelectorAll('[data-history-progress].is-scrubbing')");

  return updated;
}

const MINI_APP_JS_WITH_PURCHASE = BASE_MINI_APP_JS.replace("(function(){", "(function(){\n" + PURCHASE_DISCOUNT_PATCH);
export const MINI_APP_JS = reusePrimaryAudioPlayerInHistory(MINI_APP_JS_WITH_PURCHASE);
