export const VOICE_INTRO_REFERRAL_UI_PATCH = String.raw`
  (function(){
    var STYLE_ID='vexaVoiceReferralCardStyles';

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
        '#vexaVoiceIntroSheet .vexa-voice-intro-x.referral-credit-x{position:absolute!important;z-index:6!important;top:15px!important;right:15px!important;width:32px!important;height:32px!important;flex:0 0 32px!important;padding:0!important;border:0!important;border-radius:11px!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.055)!important;color:rgba(255,255,255,.68)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)!important;filter:none!important;transition:transform .2s ease,background .2s ease,color .2s ease!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-card[dir="rtl"] .vexa-voice-intro-x.referral-credit-x{right:auto!important;left:15px!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-x.referral-credit-x svg{width:20px!important;height:20px!important}' +
        '#vexaVoiceIntroSheet .vexa-voice-intro-x.referral-credit-x:active{transform:scale(.88)!important;background:rgba(255,255,255,.11)!important;color:#fff!important}' +
        '@media(max-width:350px){#vexaVoiceIntroSheet .vexa-voice-intro-actions.referral-credit-actions{gap:6px!important}#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy{font-size:11px!important;padding:0 8px!important}}' +
        '@media(prefers-reduced-motion:reduce){#vexaVoiceIntroSheet .vexa-voice-intro-card.referral-credit-card,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-share,#vexaVoiceIntroSheet .vexa-voice-intro-action.referral-credit-buy{transition:none!important}}';
      document.head.appendChild(style);
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

      if(!card.querySelector('.vexa-voice-intro-x')){
        var close=document.createElement('button');
        close.type='button';
        close.className='referral-credit-x vexa-voice-intro-x';
        close.setAttribute('aria-label',(backdrop&&backdrop.getAttribute('aria-label'))||'Close');
        close.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        close.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();if(backdrop)backdrop.click()});
        card.appendChild(close);
      }
    }

    installVoiceReferralCardStyles();
    if(document.body){
      new MutationObserver(function(){syncVoiceReferralCard()}).observe(document.body,{childList:true,subtree:true});
      syncVoiceReferralCard();
    }
  })();
`;
