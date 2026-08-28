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
    en:{title:'Not enough balance',text:'Add USD balance, or invite 3 friends and get $0.05 free',progress:'Friends invited',share:'Invite friends',buy:'Add USD balance',sharing:'Opening share…',reward:'$0.05 free',close:'Close',shareError:'Could not open sharing. Try again'},
    fa:{title:'موجودی کافی نداری',text:'موجودی دلاری اضافه کن، یا ۳ تا از دوستاتو دعوت کن و $0.05 رایگان بگیر',progress:'دوست‌های دعوت‌شده',share:'دعوت از دوستا',buy:'افزایش موجودی دلاری',sharing:'در حال باز کردن…',reward:'$0.05 رایگان',close:'بستن',shareError:'اشتراک‌گذاری باز نشد؛ دوباره امتحان کن'},
    ru:{title:'Недостаточно средств',text:'Пополните баланс в USD или пригласите 3 друзей и получите $0.05',progress:'Приглашено друзей',share:'Пригласить друзей',buy:'Пополнить USD-баланс',sharing:'Открываем…',reward:'$0.05 бесплатно',close:'Закрыть',shareError:'Не удалось открыть отправку. Попробуй ещё раз'},
    de:{title:'Guthaben reicht nicht',text:'Lade USD-Guthaben auf oder erhalte $0.05 für 3 Einladungen',progress:'Eingeladene Freunde',share:'Freunde einladen',buy:'USD-Guthaben aufladen',sharing:'Teilen wird geöffnet…',reward:'$0.05 gratis',close:'Schließen',shareError:'Teilen konnte nicht geöffnet werden. Versuch es erneut'},
    tr:{title:'Bakiye yetersiz',text:'USD bakiyesi yükle veya 3 arkadaş davet ederek $0.05 kazan',progress:'Davet edilen arkadaşlar',share:'Arkadaşlarını davet et',buy:'USD bakiyesi yükle',sharing:'Paylaşım açılıyor…',reward:'$0.05 ücretsiz',close:'Kapat',shareError:'Paylaşım açılamadı. Tekrar dene'},
    ar:{title:'الرصيد غير كافٍ',text:'أضف رصيدًا بالدولار أو ادعُ 3 أصدقاء واحصل على $0.05',progress:'الأصدقاء المدعوون',share:'دعوة الأصدقاء',buy:'إضافة رصيد بالدولار',sharing:'جارٍ فتح المشاركة…',reward:'$0.05 مجانًا',close:'إغلاق',shareError:'تعذر فتح المشاركة. حاول مرة أخرى'},
    zh:{title:'余额不足',text:'充值美元余额，或邀请 3 位好友获得 $0.05',progress:'已邀请好友',share:'邀请好友',buy:'充值美元余额',sharing:'正在打开分享…',reward:'免费 $0.05',close:'关闭',shareError:'无法打开分享，请重试'},
    ja:{title:'残高が不足しています',text:'USD残高を追加するか、友だち3人を招待して$0.05を獲得',progress:'招待した友だち',share:'友だちを招待',buy:'USD残高を追加',sharing:'共有を開いています…',reward:'$0.05無料',close:'閉じる',shareError:'共有を開けませんでした。もう一度試してください'},
    es:{title:'Saldo insuficiente',text:'Añade saldo en USD o invita a 3 amigos y recibe $0.05',progress:'Amigos invitados',share:'Invitar amigos',buy:'Añadir saldo USD',sharing:'Abriendo compartir…',reward:'$0.05 gratis',close:'Cerrar',shareError:'No se pudo abrir compartir. Inténtalo de nuevo'},
    hi:{title:'बैलेंस कम है',text:'USD बैलेंस जोड़ें या 3 दोस्तों को बुलाकर $0.05 पाएँ',progress:'बुलाए गए दोस्त',share:'दोस्तों को बुलाएँ',buy:'USD बैलेंस जोड़ें',sharing:'शेयर खुल रहा है…',reward:'$0.05 मुफ़्त',close:'बंद करें',shareError:'शेयर नहीं खुला। फिर कोशिश करें'}
  };

  function referralNormalizeLanguage(value){var clean=String(value||'').trim().toLowerCase().split(/[-_]/)[0];return referralCopies[clean]?clean:'en'}
  function referralWithoutTrailingDot(value){return String(value==null?'':value).replace(/[.!؟。।]+$/u,'')}
  try{referralLanguage=referralNormalizeLanguage(referralTg&&referralTg.initDataUnsafe&&referralTg.initDataUnsafe.user&&referralTg.initDataUnsafe.user.language_code)}catch(e){}

  function referralStartParam(){var raw='';try{raw=referralTg&&referralTg.initDataUnsafe&&referralTg.initDataUnsafe.start_param||''}catch(e){}if(!raw){try{var params=new URLSearchParams(window.location.search);raw=params.get('tgWebAppStartParam')||params.get('startapp')||''}catch(e){}}return String(raw||'').trim()}
  function referralStartSection(){var match=referralStartParam().match(/^ref_\d+_([tixcv])$/i);if(!match)return'';return({t:'tts',i:'image',x:'explore',c:'ai_chat',v:'voices'})[String(match[1]).toLowerCase()]||''}

  function referralCurrentSection(){
    if(window.location.pathname.indexOf('/mini-app/chat')===0)return'ai_chat';
    var reels=document.getElementById('exploreReelsPage');
    if((document.body&&document.body.classList.contains('explore-page-open'))||(reels&&reels.classList.contains('show')))return'explore';
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
    style.textContent='.referral-credit-sheet{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end center;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility 0s linear .36s}.referral-credit-sheet.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}.referral-credit-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .28s ease}.referral-credit-sheet.open .referral-credit-backdrop{opacity:1}.referral-credit-card{position:relative;width:min(calc(100% - 24px),480px);margin:0 12px calc(12px + env(safe-area-inset-bottom,0px));padding:15px;border:0;border-radius:22px;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);overflow:hidden;transform:translate3d(0,112%,0) scale(.985);opacity:.35;transition:transform .46s cubic-bezier(.16,.86,.22,1),opacity .24s ease}.referral-credit-sheet.open .referral-credit-card{transform:translate3d(0,0,0) scale(1);opacity:1}.referral-credit-card:before{content:"";position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)}.referral-credit-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.referral-credit-copy{min-width:0;flex:1}.referral-credit-kicker{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:rgba(255,255,255,.055);box-shadow:inset 0 1px 0 rgba(255,255,255,.07);color:rgba(255,255,255,.72);font-size:9px;font-weight:800;letter-spacing:.015em}.referral-credit-title{margin:11px 0 5px;color:#fff;font-size:19px;line-height:1.08;font-weight:840;letter-spacing:-.04em}.referral-credit-text{max-width:370px;margin:0;color:rgba(255,255,255,.64);font-size:12.5px;line-height:1.5;font-weight:620;letter-spacing:-.012em}.referral-credit-x{width:32px;height:32px;flex:0 0 32px;padding:0;border:0;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.055);color:rgba(255,255,255,.68);box-shadow:inset 0 1px 0 rgba(255,255,255,.07);transition:transform .2s ease,background .2s ease,color .2s ease}.referral-credit-x:active{transform:scale(.88);background:rgba(255,255,255,.11);color:#fff}.referral-credit-progress-card{margin-top:14px;padding:11px 12px;border-radius:16px;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);overflow:hidden}.referral-credit-progress-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:rgba(255,255,255,.54);font-size:10px;font-weight:730}.referral-credit-progress-head strong{color:#fff;font-size:11px;font-weight:820;font-variant-numeric:tabular-nums}.referral-credit-dots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}.referral-credit-dot{height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;transform:scaleX(.98);transition:background .28s ease,transform .34s cubic-bezier(.16,.86,.22,1)}.referral-credit-dot.done{background:#fff;transform:scaleX(1)}.referral-credit-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.referral-credit-share,.referral-credit-buy{position:relative;min-width:0;width:100%;height:44px;border:0;border-radius:14px;background:linear-gradient(145deg,#fff 0%,#f5f5f5 21%,#d8d8d8 47%,#bdbdbd 68%,#f7f7f7 100%);color:#050505;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 10px;font-size:12px;font-weight:840;letter-spacing:-.018em;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;transition:transform .2s cubic-bezier(.2,.9,.2,1),opacity .2s ease,background .2s ease}.referral-credit-actions .referral-credit-share,.referral-credit-actions .referral-credit-buy{box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.2)!important}.referral-credit-actions .referral-credit-share:focus,.referral-credit-actions .referral-credit-share:focus-visible,.referral-credit-actions .referral-credit-share:active,.referral-credit-actions .referral-credit-buy:focus,.referral-credit-actions .referral-credit-buy:focus-visible,.referral-credit-actions .referral-credit-buy:active{box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.28),inset 1px 0 0 rgba(255,255,255,.34),0 4px 10px rgba(0,0,0,.2)!important;filter:none!important;outline:0!important}.referral-credit-share:active,.referral-credit-buy:active{transform:scale(.975);background:linear-gradient(145deg,#efefef 0%,#e0e0e0 28%,#bdbdbd 62%,#ececec 100%)}.referral-credit-share:disabled{opacity:.68}.referral-credit-share svg,.referral-credit-buy svg{width:16px;height:16px;flex:0 0 16px}.referral-credit-share.loading svg{animation:referralSharePulse .8s ease-in-out infinite}.referral-credit-card[dir="rtl"]{text-align:right}.referral-credit-card[dir="rtl"] .referral-credit-progress-head{direction:rtl}.ai-chat-referral-offer{width:min(88%,420px);margin:-7px auto 19px 0;opacity:0;animation:referralAiChatOfferIn .42s cubic-bezier(.16,1,.3,1) forwards}.ai-chat-referral-offer[dir="rtl"]{margin-left:auto;margin-right:0;text-align:right}.ai-chat-referral-card{position:relative;overflow:hidden;padding:13px;border-radius:18px;background:var(--ticket-glass-bg,rgba(13,13,13,.62));box-shadow:var(--ticket-glass-shadow,inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22));backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12)}.ai-chat-referral-card:before{content:"";position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)}.ai-chat-referral-title{display:flex;align-items:center;gap:7px;min-height:20px;color:#fff;font-size:13px;line-height:1.15;letter-spacing:-.018em}.ai-chat-referral-title strong{font-weight:850}.ai-chat-referral-alert{width:18px;height:18px;flex:0 0 18px;border-radius:50%;background:#ff3030;color:#fff;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:12px;font-weight:950;line-height:1;box-shadow:0 0 13px rgba(255,48,48,.38)}.ai-chat-referral-alert span{display:block}.ai-chat-referral-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px}.ai-chat-referral-reward{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:rgba(255,255,255,.055);box-shadow:inset 0 1px 0 rgba(255,255,255,.07);color:rgba(255,255,255,.72);font-size:9px;font-weight:800}.ai-chat-referral-count{display:flex;align-items:baseline;gap:5px;color:rgba(255,255,255,.46);font-size:9px;font-weight:720}.ai-chat-referral-count strong{color:#fff;font-size:13px;font-weight:820;font-variant-numeric:tabular-nums}.ai-chat-referral-copy{margin:10px 0 0;color:rgba(255,255,255,.66);font-size:12.25px;font-weight:620;line-height:1.5;letter-spacing:-.01em}.ai-chat-referral-dots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px}.ai-chat-referral-dot{height:4px;border-radius:999px;background:rgba(255,255,255,.1);transition:background .25s ease,transform .3s cubic-bezier(.16,1,.3,1)}.ai-chat-referral-dot.done{background:#fff;transform:scaleX(1)}.ai-chat-referral-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.ai-chat-referral-share,.ai-chat-referral-buy{min-width:0;width:100%;height:40px;margin:0;border:0;border-radius:13px;background:linear-gradient(145deg,#fff 0%,#f5f5f5 21%,#d8d8d8 47%,#bdbdbd 68%,#f7f7f7 100%);color:#090909;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 9px;font-size:11.5px;font-weight:840;letter-spacing:-.018em;filter:none!important;text-shadow:none!important;outline:0!important;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;transition:transform .2s cubic-bezier(.2,.9,.2,1),opacity .2s ease,background .2s ease}.ai-chat-referral-actions .ai-chat-referral-share,.ai-chat-referral-actions .ai-chat-referral-buy{box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.2)!important}.ai-chat-referral-actions .ai-chat-referral-share:focus,.ai-chat-referral-actions .ai-chat-referral-share:focus-visible,.ai-chat-referral-actions .ai-chat-referral-share:active,.ai-chat-referral-actions .ai-chat-referral-buy:focus,.ai-chat-referral-actions .ai-chat-referral-buy:focus-visible,.ai-chat-referral-actions .ai-chat-referral-buy:active{box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.28),inset 1px 0 0 rgba(255,255,255,.34),0 4px 10px rgba(0,0,0,.2)!important;filter:none!important;outline:0!important}.ai-chat-referral-share:active,.ai-chat-referral-buy:active{transform:scale(.975);background:linear-gradient(145deg,#efefef 0%,#e0e0e0 28%,#bdbdbd 62%,#ececec 100%)}.ai-chat-referral-share:disabled{opacity:.68}.ai-chat-referral-share svg,.ai-chat-referral-buy svg{width:15px;height:15px;flex:0 0 15px}.ai-chat-referral-share.loading svg{animation:referralSharePulse .8s ease-in-out infinite}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-card,.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-share,.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-buy{font-family:"SF Arabic","Geeza Pro",Tahoma,Arial,sans-serif;font-feature-settings:"kern" 1,"liga" 1;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-title strong{font-weight:850;letter-spacing:0}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-reward{font-weight:780;letter-spacing:0}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-count{font-weight:730;letter-spacing:0}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-copy{font-weight:650;letter-spacing:0;line-height:1.6}.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-share,.ai-chat-referral-offer[dir="rtl"] .ai-chat-referral-buy{font-weight:840;letter-spacing:0}@keyframes referralAiChatOfferIn{from{opacity:0;transform:translate3d(0,8px,0) scale(.985)}to{opacity:1;transform:none}}@keyframes referralSharePulse{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-2px);opacity:1}}@media(max-width:350px){.referral-credit-actions,.ai-chat-referral-actions{gap:6px}.referral-credit-share,.referral-credit-buy{font-size:11px;padding:0 8px}.ai-chat-referral-share,.ai-chat-referral-buy{font-size:10.5px;padding:0 7px}}@media(prefers-reduced-motion:reduce){.referral-credit-sheet,.referral-credit-backdrop,.referral-credit-card,.referral-credit-share,.referral-credit-buy,.referral-credit-dot,.ai-chat-referral-offer,.ai-chat-referral-share,.ai-chat-referral-buy,.ai-chat-referral-dot{transition:none!important;animation:none!important}}';
    document.head.appendChild(style);
    var sheet=document.createElement('div');
    sheet.id='referralCreditSheet';
    sheet.className='referral-credit-sheet';
    sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML='<button class="referral-credit-backdrop" type="button" data-referral-action="close" aria-label="Close"></button><section class="referral-credit-card" id="referralCreditCard" role="dialog" aria-modal="true" aria-labelledby="referralCreditTitle"><div class="referral-credit-top"><div class="referral-credit-copy"><span class="referral-credit-kicker" id="referralCreditReward">$0.05 free</span><h3 class="referral-credit-title" id="referralCreditTitle">Not enough balance</h3><p class="referral-credit-text" id="referralCreditText">Add USD balance, or invite 3 friends and get $0.05 free</p></div><button class="referral-credit-x" type="button" data-referral-action="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><div class="referral-credit-progress-card"><div class="referral-credit-progress-head"><span id="referralCreditProgressLabel">Friends invited</span><strong id="referralCreditProgress">0 / 3</strong></div><div class="referral-credit-dots" aria-hidden="true"><i class="referral-credit-dot"></i><i class="referral-credit-dot"></i><i class="referral-credit-dot"></i></div></div><div class="referral-credit-actions"><button class="referral-credit-share" id="referralCreditShare" type="button" data-referral-action="share"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2M5.5 13.5v4A2.5 2.5 0 0 0 8 20h8a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="referralCreditShareText">Invite friends</span></button><button class="referral-credit-buy" id="referralCreditBuy" type="button" data-referral-action="buy"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7.5h15v10h-15zM4.5 10.5h15M8 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="referralCreditBuyText">Add USD balance</span></button></div></section>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click',function(event){var action=event.target&&event.target.closest?event.target.closest('[data-referral-action]'):null;if(!action)return;var name=action.getAttribute('data-referral-action');if(name==='close'){event.preventDefault();referralSetOpen(false)}else if(name==='share'){event.preventDefault();referralShare()}else if(name==='buy'){event.preventDefault();referralOpenBuyCredits()}});
    referralRenderCopy();
  }

  function referralCopy(){return referralCopies[referralLanguage]||referralCopies.en}
  function referralInstallUiIfNeeded(){if(!document.getElementById('referralCreditSheet'))referralInstallUi()}
  function referralRenderCopy(){
    referralInstallUiIfNeeded();
    var copy=referralCopy(),rtl=referralLanguage==='fa'||referralLanguage==='ar';
    var card=document.getElementById('referralCreditCard');if(card)card.dir=rtl?'rtl':'ltr';
    var reward=document.getElementById('referralCreditReward');if(reward)reward.textContent=referralWithoutTrailingDot(copy.reward);
    var title=document.getElementById('referralCreditTitle');if(title)title.textContent=referralWithoutTrailingDot(copy.title);
    var text=document.getElementById('referralCreditText');if(text)text.textContent=referralWithoutTrailingDot(copy.text);
    var label=document.getElementById('referralCreditProgressLabel');if(label)label.textContent=referralWithoutTrailingDot(copy.progress);
    var share=document.getElementById('referralCreditShareText');if(share&&!referralShareBusy)share.textContent=referralWithoutTrailingDot(copy.share);
    var buy=document.getElementById('referralCreditBuyText');if(buy)buy.textContent=referralWithoutTrailingDot(copy.buy);
    document.querySelectorAll('#referralCreditSheet [data-referral-action="close"]').forEach(function(button){button.setAttribute('aria-label',referralWithoutTrailingDot(copy.close))});
  }

  function referralApplyBalance(value){
    if(!Number.isFinite(Number(value)))return;
    referralBalance=Math.max(0,Number(value));
    if(typeof availableCredits!=='undefined')availableCredits=referralBalance;
    ['balance','creditsPageBalance','aiChatBalance'].forEach(function(id){var node=document.getElementById(id);if(node)node.textContent='$'+(referralBalance*.000178).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})});
    if(typeof updateTtsCharCount==='function')updateTtsCharCount();
  }

  function referralApplyApiData(data){
    if(!data||typeof data!=='object')return;
    if(data.language){referralLanguage=referralNormalizeLanguage(data.language);referralRenderCopy()}
    if(Number.isFinite(Number(data.balance)))referralApplyBalance(data.balance);
    if(data.imagePricing&&Number.isFinite(Number(data.imagePricing.activeCost)))referralImageCost=Math.max(1,Number(data.imagePricing.activeCost));
  }

  function referralCurrentBalance(){
    var value=typeof availableCredits!=='undefined'?Number(availableCredits):NaN;
    if(Number.isFinite(value))return Math.max(0,value);
    value=Number(referralBalance);
    return Number.isFinite(value)?Math.max(0,value):null;
  }

  function referralTtsCostForCharacters(count){
    if(typeof ttsCostForCharacters==='function'){
      try{var canonical=Number(ttsCostForCharacters(count));if(Number.isFinite(canonical))return Math.max(0,canonical)}catch(e){}
    }
    return Math.max(0,Math.ceil((Math.max(0,Number(count)||0)*170/178)-1e-12));
  }

  function referralSetOpen(open,section){
    referralInstallUiIfNeeded();
    if(section)referralActiveSection=section;
    var sheet=document.getElementById('referralCreditSheet');if(!sheet)return;
    if(open){
      referralRenderCopy();sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');referralLoadStatus();
      if(referralTg&&referralTg.HapticFeedback)try{referralTg.HapticFeedback.notificationOccurred('warning')}catch(e){}
    }else{sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true')}
  }

  function referralOpenBuyCredits(){
    referralSetOpen(false);
    if(typeof openCreditsPage==='function'){
      try{openCreditsPage();if(referralTg&&referralTg.HapticFeedback&&referralTg.HapticFeedback.impactOccurred)referralTg.HapticFeedback.impactOccurred('light');return}catch(e){}
    }
    window.location.assign('/mini-app?buy=credits');
  }

  function referralApplyBuyCreditsLaunch(){
    if(window.location.pathname.indexOf('/mini-app/chat')===0||typeof openCreditsPage!=='function')return;
    var shouldOpen=false;
    try{var params=new URLSearchParams(window.location.search);shouldOpen=params.get('buy')==='credits';if(shouldOpen){params.delete('buy');var query=params.toString();window.history.replaceState(null,'',window.location.pathname+(query?'?'+query:'')+window.location.hash)}}catch(e){}
    if(shouldOpen)setTimeout(function(){try{openCreditsPage()}catch(e){}},0);
  }

  function referralRenderStatus(status){
    if(!status)return;
    var progress=Math.max(0,Math.min(2,Number(status.progress)||0));
    var required=Math.max(3,Number(status.requiredInvites)||3);
    referralApplyBalance(status.balance);
    var counter=document.getElementById('referralCreditProgress');if(counter)counter.textContent=String(progress)+' / '+String(required);
    document.querySelectorAll('#referralCreditSheet .referral-credit-dot').forEach(function(dot,index){dot.classList.toggle('done',index<progress)});
  }

  async function referralLoadStatus(){
    if(referralStatusBusy)return null;
    referralStatusBusy=true;
    var result=null;
    try{
      var response=await referralBaseFetch('/mini-app/api/referral-status',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:referralInitData})});
      var data=await response.json().catch(function(){return null});
      if(response.ok&&data){if(data.language){referralLanguage=referralNormalizeLanguage(data.language);referralRenderCopy()}referralRenderStatus(data);result=data}
    }catch(e){}finally{referralStatusBusy=false}
    return result;
  }

  function referralShareError(){
    var copy=referralCopy();
    if(referralTg&&typeof referralTg.showAlert==='function'){try{referralTg.showAlert(referralWithoutTrailingDot(copy.shareError));return}catch(e){}}
    if(typeof toast==='function'){try{toast(referralWithoutTrailingDot(copy.shareError))}catch(e){}}
  }

  async function referralShare(){
    if(referralShareBusy)return;
    referralShareBusy=true;
    var button=document.getElementById('referralCreditShare'),label=document.getElementById('referralCreditShareText'),copy=referralCopy();
    if(button){button.disabled=true;button.classList.add('loading')}if(label)label.textContent=referralWithoutTrailingDot(copy.sharing);
    try{
      var response=await referralBaseFetch('/mini-app/api/referral-share',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:referralInitData,section:referralActiveSection||referralCurrentSection()})});
      var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Could not create invite');
      if(data.language){referralLanguage=referralNormalizeLanguage(data.language);copy=referralCopy()}
      if(referralTg&&typeof referralTg.shareMessage==='function'&&data.preparedMessageId){
        referralTg.shareMessage(String(data.preparedMessageId),function(sent){if(sent&&referralTg&&referralTg.HapticFeedback)try{referralTg.HapticFeedback.notificationOccurred('success')}catch(e){}});
      }else if(data.inviteUrl){
        var shareUrl='https://t.me/share/url?url='+encodeURIComponent(String(data.inviteUrl))+'&text='+encodeURIComponent(String(data.fallbackText||''));
        if(referralTg&&typeof referralTg.openTelegramLink==='function')referralTg.openTelegramLink(shareUrl);else window.open(shareUrl,'_blank','noopener');
      }else throw new Error('Invite link unavailable');
    }catch(e){referralShareError()}finally{
      referralShareBusy=false;if(button){button.disabled=false;button.classList.remove('loading')}if(label)label.textContent=referralWithoutTrailingDot(referralCopy().share);
    }
  }

  function referralAppendAiChatOffer(status,anchor){
    var list=document.getElementById('aiChatMessages');if(!list)return;
    list.querySelectorAll('.ai-chat-referral-offer').forEach(function(node){node.remove()});
    var copy=referralCopy();
    var rtl=referralLanguage==='fa'||referralLanguage==='ar';
    var total=Math.max(0,Math.floor(Number(status&&status.totalInvites)||0));
    var progress=Math.max(0,Math.min(2,Number(status&&status.progress)||0));
    var offer=document.createElement('article');
    offer.className='ai-chat-referral-offer';
    offer.dir=rtl?'rtl':'ltr';
    offer.innerHTML='<section class="ai-chat-referral-card"><div class="ai-chat-referral-title"><span class="ai-chat-referral-alert" aria-hidden="true"><span>!</span></span><strong></strong></div><div class="ai-chat-referral-head"><span class="ai-chat-referral-reward"></span><span class="ai-chat-referral-count"><span></span><strong></strong></span></div><p class="ai-chat-referral-copy"></p><div class="ai-chat-referral-dots" aria-hidden="true"><i class="ai-chat-referral-dot"></i><i class="ai-chat-referral-dot"></i><i class="ai-chat-referral-dot"></i></div><div class="ai-chat-referral-actions"><button class="ai-chat-referral-share" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2M5.5 13.5v4A2.5 2.5 0 0 0 8 20h8a2.5 2.5 0 0 0 2.5-2.5v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></button><button class="ai-chat-referral-buy" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7.5h15v10h-15zM4.5 10.5h15M8 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></button></div></section>';
    var title=offer.querySelector('.ai-chat-referral-title strong');if(title)title.textContent=referralWithoutTrailingDot(copy.title);
    var reward=offer.querySelector('.ai-chat-referral-reward');if(reward)reward.textContent=referralWithoutTrailingDot(copy.reward);
    var countLabel=offer.querySelector('.ai-chat-referral-count span');if(countLabel)countLabel.textContent=referralWithoutTrailingDot(copy.progress);
    var countValue=offer.querySelector('.ai-chat-referral-count strong');if(countValue)countValue.textContent=String(total);
    var text=offer.querySelector('.ai-chat-referral-copy');if(text)text.textContent=referralWithoutTrailingDot(copy.text);
    offer.querySelectorAll('.ai-chat-referral-dot').forEach(function(dot,index){dot.classList.toggle('done',index<progress)});
    var share=offer.querySelector('.ai-chat-referral-share');
    var shareLabel=share&&share.querySelector('span');if(shareLabel)shareLabel.textContent=referralWithoutTrailingDot(copy.share);
    var buy=offer.querySelector('.ai-chat-referral-buy');
    var buyLabel=buy&&buy.querySelector('span');if(buyLabel)buyLabel.textContent=referralWithoutTrailingDot(copy.buy);
    if(share)share.addEventListener('click',async function(){
      if(referralShareBusy)return;
      referralActiveSection='ai_chat';
      share.disabled=true;share.classList.add('loading');if(shareLabel)shareLabel.textContent=referralWithoutTrailingDot(referralCopy().sharing);
      try{await referralShare()}finally{share.disabled=false;share.classList.remove('loading');if(shareLabel)shareLabel.textContent=referralWithoutTrailingDot(referralCopy().share)}
    });
    if(buy)buy.addEventListener('click',function(){referralOpenBuyCredits()});
    if(anchor&&anchor.parentNode===list)anchor.insertAdjacentElement('afterend',offer);else list.appendChild(offer);
    if(typeof syncAiChatEmptyState==='function')try{syncAiChatEmptyState()}catch(e){}
    requestAnimationFrame(function(){offer.scrollIntoView({block:'nearest',behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
  }

  function referralInstallAiChatMessageHook(){
    if(window.location.pathname.indexOf('/mini-app/chat')!==0||typeof appendAiChatMessage!=='function')return;
    if(appendAiChatMessage.__referralCreditHook)return;
    var originalAppendAiChatMessage=appendAiChatMessage;
    var hookedAppendAiChatMessage=function(role,text,animate,attachment){
      var creditError=role==='assistant'&&(String(text||'').indexOf('Not enough balance')===0||String(text||'').indexOf('Not enough credits')===0);
      var result=originalAppendAiChatMessage.apply(this,arguments);
      if(creditError){
        var list=document.getElementById('aiChatMessages');
        var messages=list?list.querySelectorAll('.ai-chat-message.assistant'):[];
        var anchor=messages&&messages.length?messages[messages.length-1]:null;
        if(anchor)anchor.setAttribute('data-referral-credit-error','true');
        Promise.resolve(result).then(function(){
          referralActiveSection='ai_chat';
          return referralLoadStatus();
        }).then(function(status){referralAppendAiChatOffer(status,anchor)}).catch(function(){referralAppendAiChatOffer(null,anchor)});
      }
      return result;
    };
    hookedAppendAiChatMessage.__referralCreditHook=true;
    appendAiChatMessage=hookedAppendAiChatMessage;
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
      if(path.indexOf('/mini-app/api/session')>=0&&response.ok){
        response.clone().json().then(function(data){referralApplyApiData(data);setTimeout(referralApplyLaunchSection,120)}).catch(function(){})
      }
      if(response.status===402&&path.indexOf('/mini-app/api/')>=0){
        var section=referralSectionForRequest(path,init);
        if(window.location.pathname.indexOf('/mini-app/chat')!==0)setTimeout(function(){referralSetOpen(true,section)},0)
      }
    }catch(e){}
    return response;
  };

  window.addEventListener('vexa:credits-balance',function(event){var detail=event&&event.detail||{};if(Number.isFinite(Number(detail.balance)))referralApplyBalance(detail.balance)});
  window.addEventListener('vexa:insufficient-credits',function(event){var detail=event&&event.detail||{};if(Number.isFinite(Number(detail.balance)))referralApplyBalance(detail.balance);referralSetOpen(true,'tts')});

  document.body.addEventListener('click',function(event){
    var currentBalance=referralCurrentBalance();
    if(currentBalance===null)return;
    var imageButton=event.target&&event.target.closest?event.target.closest('[data-action="generate-image"]'):null;
    if(imageButton&&currentBalance<referralImageCost){
      event.preventDefault();event.stopImmediatePropagation();
      var exploreSelected=!!document.querySelector('.image-composer.explore-selected,#exploreReferenceChip.show');
      referralSetOpen(true,exploreSelected?'explore':'image');return;
    }
    var ttsButton=event.target&&event.target.closest?event.target.closest('#convertButton,[data-action="generate-tts"]'):null;if(!ttsButton)return;
    var count=0;document.querySelectorAll('[data-dialogue-text]').forEach(function(input){count+=Array.from(String(input.value||'')).length});
    var cost=referralTtsCostForCharacters(count);
    if(cost>currentBalance){event.preventDefault();event.stopImmediatePropagation();referralSetOpen(true,'tts')}
  },true);

  referralInstallUi();
  referralInstallAiChatMessageHook();
  referralApplyBuyCreditsLaunch();
`;
