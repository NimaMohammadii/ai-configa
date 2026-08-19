export const VOICE_INTRO_REFERRAL_UI_PATCH = String.raw`
  (function(){
    var STYLE_ID='vexaVoiceReferralCardStyles';
    var LIVE_STYLE_ID='vexaLiveRoundedPolishStyles';
    var voiceSelectedLanguage='';
    var voiceIntroBaseFetch=window.fetch.bind(window);

    var voiceCopies={
      en:{title:'Vexa Voice Agent',body:'Talk naturally with Vexa in real time. It listens, understands, and replies by voice.',price:'800 credits / minute',okay:'Got it',never:'Don’t show again',close:'Close',dir:'ltr'},
      fa:{title:'ایجنت صوتی وکسا',body:'زنده و طبیعی با وکسا صحبت کن؛ صدایت را می‌شنود، می‌فهمد و صوتی پاسخ می‌دهد.',price:'۸۰۰ کردیت / دقیقه',okay:'باشه',never:'دیگر نشانم نده',close:'بستن',dir:'rtl'},
      ru:{title:'Голосовой агент Vexa',body:'Говорите с Vexa в реальном времени. Он слушает, понимает и отвечает голосом.',price:'800 кредитов / минута',okay:'Понятно',never:'Больше не показывать',close:'Закрыть',dir:'ltr'},
      de:{title:'Vexa Sprachagent',body:'Sprich in Echtzeit ganz natürlich mit Vexa. Vexa hört zu, versteht und antwortet per Stimme.',price:'800 Credits / Minute',okay:'Verstanden',never:'Nicht mehr anzeigen',close:'Schließen',dir:'ltr'},
      tr:{title:'Vexa Sesli Asistan',body:'Vexa ile gerçek zamanlı ve doğal konuş. Seni dinler, anlar ve sesli yanıt verir.',price:'Dakikada 800 kredi',okay:'Tamam',never:'Bir daha gösterme',close:'Kapat',dir:'ltr'},
      ar:{title:'وكيل Vexa الصوتي',body:'تحدث مع Vexa بشكل طبيعي وفوري. يستمع إليك ويفهمك ويرد بصوت.',price:'٨٠٠ رصيد / دقيقة',okay:'حسنًا',never:'لا تظهرها مجددًا',close:'إغلاق',dir:'rtl'},
      es:{title:'Agente de voz Vexa',body:'Habla con Vexa de forma natural y en tiempo real. Te escucha, entiende y responde por voz.',price:'800 créditos / minuto',okay:'Entendido',never:'No volver a mostrar',close:'Cerrar',dir:'ltr'},
      hi:{title:'Vexa वॉइस एजेंट',body:'Vexa से रियल टाइम में स्वाभाविक रूप से बात करें। यह सुनता, समझता और आवाज़ में जवाब देता है।',price:'800 क्रेडिट / मिनट',okay:'ठीक है',never:'फिर न दिखाएँ',close:'बंद करें',dir:'ltr'},
      zh:{title:'Vexa 语音助手',body:'与 Vexa 实时自然对话。它会聆听、理解并用语音回复。',price:'800 积分 / 分钟',okay:'知道了',never:'不再显示',close:'关闭',dir:'ltr'},
      ja:{title:'Vexa ボイスエージェント',body:'Vexa とリアルタイムで自然に会話できます。音声を聞き取り、理解して声で返答します。',price:'800 クレジット / 分',okay:'了解',never:'今後表示しない',close:'閉じる',dir:'ltr'}
    };

    function normalizeVoiceLanguage(value){
      var clean=String(value||'').trim().toLowerCase().replace('_','-').split('-')[0];
      return voiceCopies[clean]?clean:'';
    }

    function fallbackVoiceLanguage(){
      var value='';
      try{value=window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initDataUnsafe&&window.Telegram.WebApp.initDataUnsafe.user&&window.Telegram.WebApp.initDataUnsafe.user.language_code||''}catch(error){}
      return normalizeVoiceLanguage(value)||'en';
    }

    function currentVoiceCopy(){
      var language=voiceSelectedLanguage||normalizeVoiceLanguage(window.__vexaSelectedLanguage)||fallbackVoiceLanguage();
      return voiceCopies[language]||voiceCopies.en;
    }

    function rememberVoiceLanguage(value){
      var language=normalizeVoiceLanguage(value);
      if(!language)return;
      voiceSelectedLanguage=language;
      window.__vexaSelectedLanguage=language;
      try{localStorage.setItem('vexa_selected_language_v1',language)}catch(error){}
      syncVoiceReferralCard();
    }

    try{
      var storedLanguage=normalizeVoiceLanguage(localStorage.getItem('vexa_selected_language_v1'));
      if(storedLanguage){voiceSelectedLanguage=storedLanguage;window.__vexaSelectedLanguage=storedLanguage}
    }catch(error){}

    window.fetch=async function(input,init){
      var path=typeof input==='string'?input:String(input&&input.url||'');
      var response=await voiceIntroBaseFetch(input,init);
      try{
        if(path.indexOf('/mini-app/api/session')>=0&&response.ok){
          response.clone().json().then(function(data){rememberVoiceLanguage(data&&data.language)}).catch(function(){});
        }
      }catch(error){}
      return response;
    };

    function installVoiceReferralCardStyles(){
      if(document.getElementById(STYLE_ID))return;
      var style=document.createElement('style');
      style.id=STYLE_ID;
      style.textContent=
        '#vexaVoiceIntroSheet.referral-credit-sheet{z-index:2147483000!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card{width:min(calc(100% - 24px),480px)!important;max-width:480px!important;margin:0 12px calc(12px + env(safe-area-inset-bottom,0px))!important;padding:15px!important;border:0!important;border-radius:22px!important;background:rgba(13,13,13,.62)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)!important;backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important;text-align:left!important;transform:translate3d(0,112%,0) scale(.985)!important;opacity:.35!important;transition:transform .46s cubic-bezier(.16,.86,.22,1),opacity .24s ease!important}' +
        '#vexaVoiceIntroSheet.open .vexa-voice-intro-card.referral-credit-card{transform:translate3d(0,0,0) scale(1)!important;opacity:1!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card[dir="rtl"]{text-align:right!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card h3{margin:11px 38px 5px 0!important;color:#fff!important;font-size:19px!important;line-height:1.08!important;font-weight:840!important;letter-spacing:-.04em!important;text-align:inherit!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card[dir="rtl"] h3{margin-left:38px!important;margin-right:0!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card p{max-width:370px!important;margin:0!important;color:rgba(255,255,255,.64)!important;font-size:12.5px!important;line-height:1.5!important;font-weight:620!important;letter-spacing:-.012em!important;text-align:inherit!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-price.referral-credit-progress-card{width:100%!important;max-width:none!important;min-height:46px!important;margin:14px 0 0!important;padding:11px 12px!important;border-radius:16px!important;display:flex!important;align-items:center!important;justify-content:center!important;color:#fff!important;background:rgba(13,13,13,.62)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)!important;backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important;font-size:11px!important;font-weight:820!important;letter-spacing:0!important;white-space:normal!important;text-align:center!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-actions.referral-credit-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;width:100%!important;margin-top:9px!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy{position:relative!important;min-width:0!important;width:100%!important;height:44px!important;margin:0!important;padding:0 10px!important;border:0!important;border-radius:14px!important;background:linear-gradient(145deg,#fff 0%,#f5f5f5 21%,#d8d8d8 47%,#bdbdbd 68%,#f7f7f7 100%)!important;color:#050505!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;font-size:12px!important;font-weight:840!important;letter-spacing:-.018em!important;filter:none!important;text-shadow:none!important;outline:0!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.98),inset 0 -1px 0 rgba(0,0,0,.24),inset 1px 0 0 rgba(255,255,255,.4),0 6px 14px rgba(0,0,0,.2)!important;transition:transform .2s cubic-bezier(.2,.9,.2,1),opacity .2s ease,background .2s ease!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share:before,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share:after,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy:before,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy:after{content:none!important;display:none!important;animation:none!important;background:none!important;box-shadow:none!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share:active,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy:active{transform:scale(.975)!important;background:linear-gradient(145deg,#efefef 0%,#e0e0e0 28%,#bdbdbd 62%,#ececec 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.96),inset 0 -1px 0 rgba(0,0,0,.28),inset 1px 0 0 rgba(255,255,255,.34),0 4px 10px rgba(0,0,0,.2)!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-x{position:absolute!important;z-index:6!important;top:15px!important;right:15px!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card[dir="rtl"] .vexa-voice-intro-x{right:auto!important;left:15px!important}' +
        '@media(max-width:350px){#vexaVoiceIntroSheet .vexa-voice-intro-actions.referral-credit-actions{gap:6px!important}#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy{font-size:11px!important;padding:0 8px!important}}' +
        '@media(prefers-reduced-motion:reduce){#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy{transition:none!important}}';
      document.head.appendChild(style);
    }

    function setVoiceText(node,value){
      if(node&&node.textContent!==value)node.textContent=value;
    }

    function applyVoiceCopy(sheet,card){
      var copy=currentVoiceCopy();
      if(card.getAttribute('dir')!==copy.dir)card.setAttribute('dir',copy.dir);
      var title=card.querySelector('h3');setVoiceText(title,copy.title);
      var text=card.querySelector('p');setVoiceText(text,copy.body);
      var price=card.querySelector('.vexa-voice-intro-price');setVoiceText(price,copy.price);
      var okay=card.querySelector('.vexa-voice-intro-okay');if(okay){setVoiceText(okay,copy.okay);okay.setAttribute('aria-label',copy.okay)}
      var never=card.querySelector('.vexa-voice-intro-never');if(never){setVoiceText(never,copy.never);never.setAttribute('aria-label',copy.never)}
      var backdrop=sheet.querySelector('.limit-backdrop');if(backdrop)backdrop.setAttribute('aria-label',copy.close);
      var close=card.querySelector('.vexa-voice-intro-x');if(close)close.setAttribute('aria-label',copy.close);
    }

    function createExactReferralClose(card,backdrop){
      if(card.querySelector('.vexa-voice-intro-x'))return;
      var original=document.querySelector('#referralCreditSheet .referral-credit-x');
      var close=original&&original.cloneNode?original.cloneNode(true):null;
      if(!close){
        close=document.createElement('button');
        close.type='button';
        close.className='referral-credit-x';
        close.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      }
      close.removeAttribute('id');
      close.removeAttribute('data-referral-action');
      close.classList.add('vexa-voice-intro-x');
      close.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();if(backdrop)backdrop.click()});
      card.appendChild(close);
    }

    function syncVoiceReferralCard(){
      var sheet=document.getElementById('vexaVoiceIntroSheet');
      if(!sheet)return;
      installVoiceReferralCardStyles();

      sheet.classList.add('referral-credit-sheet');
      var backdrop=sheet.querySelector('.limit-backdrop');
      if(backdrop)backdrop.classList.add('referral-credit-backdrop');

      var card=sheet.querySelector('.vexa-voice-intro-card');
      if(!card)return;
      card.classList.add('referral-credit-card');

      var price=card.querySelector('.vexa-voice-intro-price');
      if(price)price.classList.add('referral-credit-progress-card');

      var actions=card.querySelector('.vexa-voice-intro-actions');
      if(actions)actions.classList.add('referral-credit-actions');

      var okay=card.querySelector('.vexa-voice-intro-okay');
      if(okay)okay.classList.add('referral-credit-share');
      var never=card.querySelector('.vexa-voice-intro-never');
      if(never)never.classList.add('referral-credit-buy');

      createExactReferralClose(card,backdrop);
      applyVoiceCopy(sheet,card);
    }

    function syncRewardWheelPlacement(){
      var wheel=document.getElementById('wheelOpenButton');
      var liveButton=document.getElementById('vexaLiveOpen');
      var creditsHead=document.querySelector('#creditsPage .credits-page-head');
      if(!wheel||!liveButton||!creditsHead||wheel.parentElement===creditsHead)return;
      creditsHead.appendChild(wheel);
      wheel.style.position='absolute';
      wheel.style.right='18px';
      wheel.style.bottom='18px';
      wheel.style.zIndex='3';
    }

    function installLiveFramePolish(){
      var frame=document.getElementById('vexaLiveInlineFrame');
      if(!frame)return;
      if(!frame.dataset.vexaRoundedPolishBound){
        frame.dataset.vexaRoundedPolishBound='1';
        frame.addEventListener('load',function(){installLiveFramePolish()});
      }
      try{
        var doc=frame.contentDocument;
        if(!doc||!doc.head||doc.getElementById(LIVE_STYLE_ID))return;
        var style=doc.createElement('style');
        style.id=LIVE_STYLE_ID;
        style.textContent=
          '.vexa-stt,.vexa-stt button,.vexa-stt textarea,.vexa-voice-status{font-family:ui-rounded,"SF Pro Rounded","SF Pro Display",-apple-system,BlinkMacSystemFont,"SF Arabic","Geeza Pro",Tahoma,"Segoe UI",Arial,sans-serif!important}' +
          '.vexa-stt textarea{font-weight:520!important;line-height:1.5!important;letter-spacing:-.028em!important}' +
          '.vexa-stt-record{font-weight:780!important;letter-spacing:-.022em!important}' +
          '.vexa-stt-label{font-weight:720!important;letter-spacing:-.012em!important;text-transform:none!important}' +
          '.vexa-stt-language,.vexa-stt-wave-caption{font-weight:650!important;letter-spacing:-.01em!important;text-transform:none!important}' +
          '.vexa-voice-status{font-weight:640!important;letter-spacing:-.018em!important}' +
          '.vexa-voice-stage{width:164px!important;height:164px!important;flex:0 0 164px!important}' +
          '.vexa-voice-canvas{width:164px!important;height:164px!important}' +
          '.vexa-voice-overlay.open .vexa-voice-stage{transform:translateY(-12px) scale(1)!important}';
        doc.head.appendChild(style);
      }catch(error){}
    }

    installVoiceReferralCardStyles();
    if(document.body){
      new MutationObserver(function(){syncVoiceReferralCard();installLiveFramePolish();syncRewardWheelPlacement()}).observe(document.body,{childList:true,subtree:true});
      syncVoiceReferralCard();
      installLiveFramePolish();
      syncRewardWheelPlacement();
    }
  })();
`;