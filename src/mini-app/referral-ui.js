export const REFERRAL_UI_PATCH = String.raw`
  var referralTg=window.Telegram&&window.Telegram.WebApp;
  var referralInitData=(referralTg&&referralTg.initData)||'';
  var referralLanguage='en';
  var referralBalance=null;
  var referralImageCost=188;
  var referralActiveSection='tts';
  var referralShareBusy=false;
  var referralStatusBusy=false;
  var referralBaseFetch=window.fetch.bind(window);
  var referralLaunchApplied=false;

  var referralCopies={
    en:{title:'Not enough credits',text:'Invite 3 friends and get 300 free credits.',progress:'Friends invited',share:'Invite friends',sharing:'Opening share…',reward:'300 free credits',close:'Close'},
    fa:{title:'کردیت کافی نداری',text:'۳ تا از دوستاتو دعوت کن و ۳۰۰ کردیت رایگان بگیر.',progress:'دوست‌های دعوت‌شده',share:'دعوت از دوستا',sharing:'در حال باز کردن…',reward:'۳۰۰ کردیت رایگان',close:'بستن'},
    ru:{title:'Недостаточно кредитов',text:'Пригласи 3 друзей и получи 300 бесплатных кредитов.',progress:'Приглашено друзей',share:'Пригласить друзей',sharing:'Открываем…',reward:'300 бесплатных кредитов',close:'Закрыть'},
    de:{title:'Nicht genügend Credits',text:'Lade 3 Freunde ein und erhalte 300 Credits kostenlos.',progress:'Eingeladene Freunde',share:'Freunde einladen',sharing:'Teilen wird geöffnet…',reward:'300 Credits gratis',close:'Schließen'},
    tr:{title:'Yetersiz kredi',text:'3 arkadaşını davet et, 300 ücretsiz kredi kazan.',progress:'Davet edilen arkadaşlar',share:'Arkadaşlarını davet et',sharing:'Paylaşım açılıyor…',reward:'300 ücretsiz kredi',close:'Kapat'},
    ar:{title:'الرصيد غير كافٍ',text:'ادعُ 3 من أصدقائك واحصل على 300 رصيد مجانًا.',progress:'الأصدقاء المدعوون',share:'دعوة الأصدقاء',sharing:'جارٍ فتح المشاركة…',reward:'300 رصيد مجانًا',close:'إغلاق'},
    zh:{title:'积分不足',text:'邀请 3 位好友，即可获得 300 免费积分。',progress:'已邀请好友',share:'邀请好友',sharing:'正在打开分享…',reward:'300 免费积分',close:'关闭'},
    ja:{title:'クレジットが足りません',text:'友だちを3人招待すると、300クレジットを無料でもらえます。',progress:'招待した友だち',share:'友だちを招待',sharing:'共有を開いています…',reward:'300無料クレジット',close:'閉じる'},
    es:{title:'No tienes suficientes créditos',text:'Invita a 3 amigos y recibe 300 créditos gratis.',progress:'Amigos invitados',share:'Invitar amigos',sharing:'Abriendo compartir…',reward:'300 créditos gratis',close:'Cerrar'},
    hi:{title:'Credits कम हैं',text:'3 दोस्तों को invite करो और 300 free credits पाओ।',progress:'Invite किए गए दोस्त',share:'दोस्तों को Invite करें',sharing:'Share खुल रहा है…',reward:'300 free credits',close:'बंद करें'}
  };

  function referralNormalizeLanguage(value){var clean=String(value||'').trim().toLowerCase().split(/[-_]/)[0];return referralCopies[clean]?clean:'en'}
  try{referralLanguage=referralNormalizeLanguage(referralTg&&referralTg.initDataUnsafe&&referralTg.initDataUnsafe.user&&referralTg.initDataUnsafe.user.language_code)}catch(e){}

  function referralStartParam(){var raw='';try{raw=referralTg&&referralTg.initDataUnsafe&&referralTg.initDataUnsafe.start_param||''}catch(e){}if(!raw){try{var params=new URLSearchParams(window.location.search);raw=params.get('tgWebAppStartParam')||params.get('startapp')||''}catch(e){}}return String(raw||'').trim()}
  function referralStartSection(){var match=referralStartParam().match(/^ref_\d+_([tixcv])$/i);if(!match)return'';return({t:'tts',i:'image',x:'explore',c:'ai_chat',v:'voices'})[String(match[1]).toLowerCase()]||''}

  function referralCurrentSection(){
    if(window.location.pathname.indexOf('/mini-app/chat')===0)return'ai_chat';
    var reels=document.getElementById('exploreReelsPage');
    if(document.body&&document.body.classList.contains('explore-page-open')||reels&&reels.classList.contains('show'))return'explore';
    if(document.body&&document.body.classList.contains('voices-page-open'))return'voices';
    if(document.body&&document.body.classList.contains('image-mode'))return'image';
    return'tts';
  }

  function referralSectionForRequest(path,init){
    var clean=String(path||'');
    if(clean.indexOf('/mini-app/api/chat')>=0)return'ai_chat';
    if(clean.indexOf('/mini-app/api/tts')>=0)return'tts';
    if(clean.indexOf('/mini-app/api/image')>=0&&clean.indexOf('image-delete')<0){
      try{var body=init&&typeof init.body==='string'?JSON.parse(init.body):null;if(body&&String(body.exploreId||'').trim())return'explore'}catch(e){}
      return'image';
    }
    return referralCurrentSection();
  }

  function referralInstallUi(){
    if(document.getElementById('referralCreditSheet'))return;
    var style=document.createElement('style');
    style.id='referralCreditStyles';
    style.textContent='.referral-credit-sheet{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end center;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .24s ease,visibility 0s linear .34s}.referral-credit-sheet.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}.referral-credit-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.56);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .3s ease}.referral-credit-sheet.open .referral-credit-backdrop{opacity:1}.referral-credit-card{position:relative;width:min(calc(100% - 24px),480px);margin:0 12px calc(12px + env(safe-area-inset-bottom,0px));padding:15px;border:0;border-radius:24px;background:rgba(13,13,13,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 22px rgba(255,255,255,.055),0 22px 64px rgba(0,0,0,.5);backdrop-filter:blur(18px) saturate(1.12);-webkit-backdrop-filter:blur(18px) saturate(1.12);overflow:hidden;transform:translate3d(0,110%,0) scale(.975);opacity:.4;transition:transform .46s cubic-bezier(.16,.86,.22,1),opacity .26s ease}.referral-credit-sheet.open .referral-credit-card{transform:translate3d(0,0,0) scale(1);opacity:1}.referral-credit-card:before{content:"";position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)}.referral-credit-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.referral-credit-copy{min-width:0;flex:1}.referral-credit-kicker{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);color:rgba(255,255,255,.72);font-size:9px;font-weight:760;letter-spacing:.02em}.referral-credit-title{margin:11px 0 5px;color:#fff;font-size:19px;line-height:1.08;font-weight:780;letter-spacing:-.035em}.referral-credit-text{max-width:350px;margin:0;color:rgba(255,255,255,.58);font-size:12.5px;line-height:1.45;font-weight:450}.referral-credit-x{width:32px;height:32px;flex:0 0 32px;padding:0;border:0;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.055);color:rgba(255,255,255,.68);box-shadow:inset 0 1px 0 rgba(255,255,255,.07);transition:transform .2s ease,background .2s ease,color .2s ease}.referral-credit-x:active{transform:scale(.88);background:rgba(255,255,255,.11);color:#fff}.referral-credit-progress-card{margin-top:14px;padding:11px 12px;border-radius:16px;background:rgba(255,255,255,.045);box-shadow:inset 0 1px 0 rgba(255,255,255,.065),inset 0 -1px 0 rgba(255,255,255,.035);overflow:hidden}.referral-credit-progress-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:rgba(255,255,255,.5);font-size:10px;font-weight:650}.referral-credit-progress-head strong{color:#fff;font-size:11px;font-weight:780;font-variant-numeric:tabular-nums}.referral-credit-dots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}.referral-credit-dot{height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;transform:scaleX(.98);transition:background .28s ease,transform .34s cubic-bezier(.16,.86,.22,1)}.referral-credit-dot.done{background:#fff;transform:scaleX(1)}.referral-credit-actions{display:grid;grid-template-columns:1fr;gap:7px;margin-top:9px}.referral-credit-share{position:relative;width:100%;height:44px;border:0;border-radius:14px;background:#fff;color:#050505;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;font-size:13px;font-weight:780;box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 8px 24px rgba(0,0,0,.22);transition:transform .2s cubic-bezier(.2,.9,.2,1),opacity .2s ease}.referral-credit-share:active{transform:scale(.985)}.referral-credit-share:disabled{opacity:.68}.referral-credit-share svg{width:17px;height:17px}.referral-credit-share.loading svg{animation:referralSharePulse .8s ease-in-out infinite}.referral-credit-card[dir="rtl"]{text-align:right}.referral-credit-card[dir="rtl"] .referral-credit-progress-head{direction:rtl}@keyframes referralSharePulse{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-2px);opacity:1}}@media(prefers-reduced-motion:reduce){.referral-credit-sheet,.referral-credit-backdrop,.referral-credit-card,.referral-credit-share,.referral-credit-dot{transition:none!important;animation:none!important}}';
    document.head.appendChild(style);
    var sheet=document.createElement('div');
    sheet.id='referralCreditSheet';
    sheet.className='referral-credit-sheet';
    sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML='<button class="referral-credit-backdrop" type="button" data-referral-action="close" aria-label="Close"></button><section class="referral-credit-card" id="referralCreditCard" role="dialog" aria-modal="true"><div class="referral-credit-top"><div class="referral-credit-copy"><span class="referral-credit-kicker" id="referralCreditReward">300 free credits</span><h3 class="referral-credit-title" id="referralCreditTitle">Not enough credits</h3><p class="referral-credit-text" id="referralCreditText">Invite 3 friends and get 300 free credits.</p></div><button class="referral-credit-x" type="button" data-referral-action="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><div class="referral-credit-progress-card"><div class="referral-credit-progress-head"><span id="referralCreditProgressLabel">Friends invited</span><strong id="referralCreditProgress">0 / 3</strong></div><div class="referral-credit-dots" aria-hidden="true"><i class="referral-credit-dot"></i><i class="referral-credit-dot"></i><i class="referral-credit-dot"></i></div></div><div class="referral-credit-actions"><button class="referral-credit-share" id="referralCreditShare" type="button" data-referral-action="share"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2M5.5 13.5v4A2.5 2.5 0 0 0 8 20h8a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="referralCreditShareText">Invite friends</span></button></div></section>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click',function(event){var action=event.target&&event.target.closest?event.target.closest('[data-referral-action]'):null;if(!action)return;var name=action.getAttribute('data-referral-action');if(name==='close'){event.preventDefault();referralSetOpen(false)}else if(name==='share'){event.preventDefault();referralShare()}});
    referralRenderCopy();
  }

  function referralCopy(){return referralCopies[referralLanguage]||referralCopies.en}
  function referralRenderCopy(){
    referralInstallUiIfNeeded();
    var copy=referralCopy(),rtl=referralLanguage==='fa'||referralLanguage==='ar';
    var card=document.getElementById('referralCreditCard');if(card)card.dir=rtl?'rtl':'ltr';
    var reward=document.getElementById('referralCreditReward');if(reward)reward.textContent=copy.reward;
    var title=document.getElementById('referralCreditTitle');if(title)title.textContent=copy.title;
    var text=document.getElementById('referralCreditText');if(text)text.textContent=copy.text;
    var label=document.getElementById('referralCreditProgressLabel');if(label)label.textContent=copy.progress;
    var share=document.getElementById('referralCreditShareText');if(share&&!referralShareBusy)share.textContent=copy.share;
    var close=document.querySelector('#referralCreditSheet [data-referral-action="close"]');if(close)close.setAttribute('aria-label',copy.close);
  }
  function referralInstallUiIfNeeded(){if(!document.getElementById('referralCreditSheet'))referralInstallUi()}

  function referralSetOpen(open,section){
    referralInstallUiIfNeeded();
    if(section)referralActiveSection=section;
    var sheet=document.getElementById('referralCreditSheet');if(!sheet)return;
    if(open){referralRenderCopy();sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');referralLoadStatus();if(referralTg&&referralTg.HapticFeedback)try{referralTg.HapticFeedback.notificationOccurred('warning')}catch(e){}}
    else{sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true')}
  }

  function referralRenderStatus(status){
    if(!status)return;
    var progress=Math.max(0,Math.min(2,Number(status.progress)||0));
    var required=Math.max(3,Number(status.requiredInvites)||3);
    if(Number.isFinite(Number(status.balance))){
      referralBalance=Math.max(0,Number(status.balance));
      if(typeof availableCredits!=='undefined')availableCredits=referralBalance;
      ['balance','aiChatBalance'].forEach(function(id){var balance=document.getElementById(id);if(balance)balance.textContent=Math.floor(referralBalance).toLocaleString('en-US')});
      if(typeof updateTtsCharCount==='function')updateTtsCharCount();
    }
    var counter=document.getElementById('referralCreditProgress');if(counter)counter.textContent=String(progress)+' / '+String(required);
    document.querySelectorAll('#referralCreditSheet .referral-credit-dot').forEach(function(dot,index){dot.classList.toggle('done',index<progress)});
  }

  async function referralLoadStatus(){
    if(referralStatusBusy)return;
    referralStatusBusy=true;
    try{var response=await referralBaseFetch('/mini-app/api/referral-status',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:referralInitData})});var data=await response.json().catch(function(){return null});if(response.ok&&data){if(data.language){referralLanguage=referralNormalizeLanguage(data.language);referralRenderCopy()}referralRenderStatus(data)}}catch(e){}finally{referralStatusBusy=false}
  }

  async function referralShare(){
    if(referralShareBusy)return;
    referralShareBusy=true;
    var button=document.getElementById('referralCreditShare'),label=document.getElementById('referralCreditShareText'),copy=referralCopy();
    if(button){button.disabled=true;button.classList.add('loading')}if(label)label.textContent=copy.sharing;
    try{
      var response=await referralBaseFetch('/mini-app/api/referral-share',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:referralInitData,section:referralActiveSection||referralCurrentSection()})});
      var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Could not create invite');
      if(data.language){referralLanguage=referralNormalizeLanguage(data.language);copy=referralCopy()}
      if(referralTg&&typeof referralTg.shareMessage==='function'&&data.preparedMessageId){
        referralTg.shareMessage(String(data.preparedMessageId),function(sent){if(sent&&referralTg&&referralTg.HapticFeedback)try{referralTg.HapticFeedback.notificationOccurred('success')}catch(e){}});
      }else{
        var shareUrl='https://t.me/share/url?url='+encodeURIComponent(String(data.inviteUrl||''))+'&text='+encodeURIComponent(String(data.fallbackText||''));
        if(referralTg&&typeof referralTg.openTelegramLink==='function')referralTg.openTelegramLink(shareUrl);else window.open(shareUrl,'_blank','noopener');
      }
    }catch(e){
      var shareUrlFallback='https://t.me/share/url?url='+encodeURIComponent(window.location.href)+'&text='+encodeURIComponent(copy.text);
      if(referralTg&&typeof referralTg.openTelegramLink==='function')referralTg.openTelegramLink(shareUrlFallback);
    }finally{
      referralShareBusy=false;if(button){button.disabled=false;button.classList.remove('loading')}if(label)label.textContent=referralCopy().share;
    }
  }

  function referralApplyLaunchSection(){
    if(referralLaunchApplied)return;
    var section=referralStartSection();if(!section)return;
    referralLaunchApplied=true;
    if(section==='ai_chat'){if(window.location.pathname.indexOf('/mini-app/chat')!==0)window.location.replace('/mini-app/chat');return}
    function clickAction(action){var button=document.querySelector('[data-action="'+action+'"]');if(button)button.click()}
    if(section==='tts'){if(document.body&&document.body.classList.contains('image-mode'))clickAction('toggle-creation-mode');return}
    if(section==='image'){if(document.body&&!document.body.classList.contains('image-mode'))clickAction('toggle-creation-mode');return}
    if(section==='voices'){if(document.body&&document.body.classList.contains('image-mode'))clickAction('toggle-creation-mode');setTimeout(function(){clickAction('open-voices-page')},70);return}
    if(section==='explore'){if(document.body&&!document.body.classList.contains('image-mode'))clickAction('toggle-creation-mode');setTimeout(function(){clickAction('open-explore-page')},80)}
  }

  window.fetch=async function(input,init){
    var path=typeof input==='string'?input:String(input&&input.url||'');
    var response=await referralBaseFetch(input,init);
    try{
      if(path.indexOf('/mini-app/api/session')>=0){response.clone().json().then(function(data){
        if(data&&data.language){referralLanguage=referralNormalizeLanguage(data.language);referralRenderCopy()}
        if(data&&Number.isFinite(Number(data.balance)))referralBalance=Math.max(0,Number(data.balance));
        if(data&&data.imagePricing&&Number.isFinite(Number(data.imagePricing.activeCost)))referralImageCost=Math.max(1,Number(data.imagePricing.activeCost));
        setTimeout(referralApplyLaunchSection,120)
      }).catch(function(){})}
      if(response.status===402&&path.indexOf('/mini-app/api/')>=0){var section=referralSectionForRequest(path,init);setTimeout(function(){referralSetOpen(true,section)},0)}
    }catch(e){}
    return response;
  };

  document.body.addEventListener('click',function(event){
    if(referralBalance===null)return;
    var imageButton=event.target&&event.target.closest?event.target.closest('[data-action="generate-image"]'):null;
    if(imageButton&&referralBalance<referralImageCost){
      event.preventDefault();event.stopImmediatePropagation();
      var exploreSelected=!!document.querySelector('.image-composer.explore-selected,#exploreReferenceChip.show');
      referralSetOpen(true,exploreSelected?'explore':'image');return;
    }
    var ttsButton=event.target&&event.target.closest?event.target.closest('#convertButton,[data-action="generate-tts"]'):null;if(!ttsButton)return;
    var count=0;document.querySelectorAll('[data-dialogue-text]').forEach(function(input){count+=Array.from(String(input.value||'')).length});
    if(count>referralBalance){event.preventDefault();event.stopImmediatePropagation();referralSetOpen(true,'tts')}
  },true);

  referralInstallUi();
`;
