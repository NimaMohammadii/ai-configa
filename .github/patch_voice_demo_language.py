from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/mini-app/client.js",
    "  var currentLanguage='en';\n  var creationMode='voice';",
    "  var currentLanguage='en';\n  var demoLanguage='en';\n  var demoLanguageMenuOpen=false;\n  var demoLanguageNames={en:'English',ru:'Русский',de:'Deutsch',fa:'فارسی',tr:'Türkçe',ar:'العربية',zh:'中文',ja:'日本語',es:'Español',hi:'हिन्दी'};\n  var creationMode='voice';"
)

replace_once(
    "src/mini-app/client.js",
    "  function openVoicesPage(){voicesReturnToReels=false;setVoicesPage(true)}\n",
    """  function openVoicesPage(){voicesReturnToReels=false;setVoicesPage(true)}
  function normalizeDemoLanguage(value){var code=String(value||'').trim().toLowerCase();return demoLanguageNames[code]?code:'en'}
  function syncDemoLanguagePicker(){var label=q('demoLanguageLabel');if(label)label.textContent=demoLanguageNames[demoLanguage]||demoLanguageNames.en;document.querySelectorAll('[data-demo-language]').forEach(function(option){var active=option.getAttribute('data-demo-language')===demoLanguage;option.classList.toggle('active',active);option.setAttribute('aria-pressed',active?'true':'false')})}
  function setDemoLanguageMenu(open){var wrap=q('demoLanguageWrap');demoLanguageMenuOpen=!!open;if(wrap)wrap.classList.toggle('open',demoLanguageMenuOpen);var button=q('demoLanguageButton');if(button)button.setAttribute('aria-expanded',demoLanguageMenuOpen?'true':'false')}
  function applyDemoLanguage(value){demoLanguage=normalizeDemoLanguage(value);stopPreview();syncDemoLanguagePicker()}
  async function chooseDemoLanguage(value){var next=normalizeDemoLanguage(value);if(next===demoLanguage){setDemoLanguageMenu(false);return}var previous=demoLanguage;applyDemoLanguage(next);setDemoLanguageMenu(false);if(tg&&tg.HapticFeedback&&tg.HapticFeedback.impactOccurred)try{tg.HapticFeedback.impactOccurred('light')}catch(error){}try{var data=await api('/mini-app/api/demo-language',{language:next});applyDemoLanguage(data.demoLanguage||next)}catch(error){applyDemoLanguage(previous);toast(error.message||'Could not update demo language')}}
  function initializeDemoLanguagePicker(){var page=q('voicesPage');if(!page||q('demoLanguageWrap'))return;var title=page.querySelector('.voices-page-head h2');if(!title||!title.parentNode)return;var titleRow=document.createElement('div');titleRow.className='demo-language-title-row';title.parentNode.insertBefore(titleRow,title);titleRow.appendChild(title);var wrap=document.createElement('div');wrap.id='demoLanguageWrap';wrap.className='voice-wrap demo-language-wrap';var rows=Object.keys(demoLanguageNames).map(function(code){return '<div class=\"voice-option demo-language-option\"><span class=\"voice-avatar demo-language-avatar\" aria-hidden=\"true\">'+code.toUpperCase()+'</span><button class=\"voice-select\" data-demo-language=\"'+code+'\" type=\"button\" aria-pressed=\"false\"><span>'+demoLanguageNames[code]+'</span></button></div>'}).join('');wrap.innerHTML='<button id=\"demoLanguageButton\" class=\"voice-btn\" type=\"button\" aria-label=\"Choose demo language\" aria-haspopup=\"true\" aria-expanded=\"false\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8.5\" stroke=\"currentColor\" stroke-width=\"1.7\"/><path d=\"M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.7 8.6 8.7 12s1.1 6.2 3.3 8.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg><span id=\"demoLanguageLabel\">English</span><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></button><div class=\"voice-menu demo-language-menu\"><div class=\"my-voice-rows\">'+rows+'</div></div>';titleRow.appendChild(wrap);var style=document.createElement('style');style.textContent='.demo-language-title-row{display:flex;align-items:center;gap:10px;position:relative}.demo-language-wrap{z-index:12}.demo-language-title-row .voice-btn{min-width:116px}.demo-language-wrap .voice-menu{left:0;right:auto;top:44px;width:210px;max-height:min(390px,58vh)}.demo-language-avatar{display:grid!important;place-items:center!important;background:rgba(255,255,255,.055)!important;border-color:rgba(255,255,255,.1)!important;color:rgba(255,255,255,.62);font-size:8px;font-weight:800;letter-spacing:.03em}.demo-language-option .voice-select{height:34px}.demo-language-title-row .voice-btn>svg:first-child{color:rgba(255,255,255,.72)}@media(max-width:390px){.demo-language-title-row{gap:7px}.demo-language-title-row .voice-btn{min-width:104px;padding-left:10px!important;padding-right:10px!important;font-size:12px}.demo-language-wrap .voice-menu{width:195px}}';document.head.appendChild(style);var button=q('demoLanguageButton');if(button)button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();setDemoLanguageMenu(!demoLanguageMenuOpen)});wrap.addEventListener('click',function(event){var option=event.target&&event.target.closest?event.target.closest('[data-demo-language]'):null;if(!option)return;event.preventDefault();event.stopPropagation();chooseDemoLanguage(option.getAttribute('data-demo-language'))});document.addEventListener('click',function(event){if(demoLanguageMenuOpen&&!wrap.contains(event.target))setDemoLanguageMenu(false)});syncDemoLanguagePicker()}
"""
)

replace_once(
    "src/mini-app/client.js",
    "availableCredits=Math.max(0,Number(data.balance)||0);updateCreditsBalanceUi(availableCredits);currentLanguage=String(data.language||'en');applySavedVoices(data.savedVoices);",
    "availableCredits=Math.max(0,Number(data.balance)||0);updateCreditsBalanceUi(availableCredits);currentLanguage=String(data.language||'en');applyDemoLanguage(data.demoLanguage||currentLanguage);applySavedVoices(data.savedVoices);"
)

replace_once(
    "src/mini-app/client.js",
    """  async function previewVoice(button){var voiceId=button.getAttribute('data-preview-voice')||'';var voiceName=button.getAttribute('data-preview-name')||'Voice';var audio=q('voicePreviewAudio');if(!voiceId||!audio)return;
    if(activePreviewButton===button&&activePreviewVoice===voiceId&&!audio.paused){audio.pause();return}
    stopPreview();
    activePreviewButton=button;activePreviewVoice=voiceId;button.classList.add('loading');
    try{var data=await api('/mini-app/api/voice-demo',{voice:voiceId});if(activePreviewButton!==button)return;audio.src='data:audio/mpeg;base64,'+data.audioBase64;button.classList.remove('loading');button.classList.add('playing');await audio.play()}catch(error){button.classList.remove('loading','playing');activePreviewButton=null;activePreviewVoice='';toast(error.message||('Could not play '+voiceName))}
  }
""",
    """  async function previewVoice(button){var voiceId=button.getAttribute('data-preview-voice')||'';var voiceName=button.getAttribute('data-preview-name')||'Voice';var audio=q('voicePreviewAudio');var requestLanguage=demoLanguage;var requestKey=voiceId+'|'+requestLanguage;if(!voiceId||!audio)return;
    if(activePreviewButton===button&&activePreviewVoice===requestKey&&!audio.paused){audio.pause();return}
    stopPreview();
    activePreviewButton=button;activePreviewVoice=requestKey;button.classList.add('loading');
    try{var data=await api('/mini-app/api/voice-demo',{voice:voiceId,language:requestLanguage});if(activePreviewButton!==button||activePreviewVoice!==requestKey||demoLanguage!==requestLanguage)return;audio.src='data:audio/mpeg;base64,'+data.audioBase64;button.classList.remove('loading');button.classList.add('playing');await audio.play()}catch(error){button.classList.remove('loading','playing');activePreviewButton=null;activePreviewVoice='';toast(error.message||('Could not play '+voiceName))}
  }
"""
)

replace_once(
    "src/mini-app/client.js",
    "  startAiChatButtonOrb();initializeWaveSeek();initializeDialogueEditor();setWavePlaying(false);",
    "  startAiChatButtonOrb();initializeDemoLanguagePicker();initializeWaveSeek();initializeDialogueEditor();setWavePlaying(false);"
)

replace_once(
    "src/mini-app/server.js",
    'import{normalizeLang as M}from"../i18n.js";',
    'import{LANGUAGES as LG,normalizeLang as M}from"../i18n.js";'
)

replace_once(
    "src/mini-app/server.js",
    'i.method==="POST"&&t.pathname==="/mini-app/api/user-voices"?f(await Ue(i,e)):i.method==="POST"&&t.pathname==="/mini-app/api/stars-invoice"?',
    'i.method==="POST"&&t.pathname==="/mini-app/api/user-voices"?f(await Ue(i,e)):i.method==="POST"&&t.pathname==="/mini-app/api/demo-language"?f(await DL(i,e)):i.method==="POST"&&t.pathname==="/mini-app/api/stars-invoice"?'
)

replace_once(
    "src/mini-app/server.js",
    'language:M(o.language||t.language_code||"en"),balance:',
    'language:M(o.language||t.language_code||"en"),demoLanguage:M(o.demoLanguage||o.language||t.language_code||"en"),balance:'
)

replace_once(
    "src/mini-app/server.js",
    'async function SI(i,e){',
    'async function DL(i,e){const t=await i.json().catch(()=>({})),a=await h(t,e);if((await w(e,a.id)).locked)return u("Mini app is updating.",423);const o=String(t.language||"").trim().toLowerCase();if(!LG[o])return u("Demo language is not supported.",400);const n=await F(e,a.id);return n.demoLanguage=o,await U(e,a.id,n),{demoLanguage:o}}async function SI(i,e){'
)

replace_once(
    "src/mini-app/server.js",
    'const s=C[n],c=M(o.language||a.language_code||"en"),r=ie(c,n);',
    'const s=C[n],c=M(t.language||o.demoLanguage||o.language||a.language_code||"en"),r=ie(c,n);'
)

replace_once(
    "src/state.js",
    '  language: null,\n  emotionActive: false,',
    '  language: null,\n  demoLanguage: null,\n  emotionActive: false,'
)

replace_once(
    "src/state.js",
    '    "SELECT voice, output, page, menu_message_id, language FROM user_state WHERE user_id = ?"',
    '    "SELECT voice, output, page, menu_message_id, language, demo_language FROM user_state WHERE user_id = ?"'
)

replace_once(
    "src/state.js",
    '    language: row.language || null,\n    emotionActive: false,',
    '    language: row.language || null,\n    demoLanguage: row.demo_language || null,\n    emotionActive: false,'
)

replace_once(
    "src/state.js",
    '    language: state.language || null,\n  };',
    '    language: state.language || null,\n    demoLanguage: state.demoLanguage || null,\n  };'
)

replace_once(
    "src/state.js",
    '    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, language, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +\n    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, language = excluded.language, updated_at = CURRENT_TIMESTAMP"\n  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId, cleanState.language).run();',
    '    "INSERT INTO user_state (user_id, voice, output, page, menu_message_id, language, demo_language, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +\n    "ON CONFLICT(user_id) DO UPDATE SET voice = excluded.voice, output = excluded.output, page = excluded.page, menu_message_id = excluded.menu_message_id, language = excluded.language, demo_language = excluded.demo_language, updated_at = CURRENT_TIMESTAMP"\n  ).bind(String(userId), cleanState.voice, cleanState.output, cleanState.page, cleanState.menuMessageId, cleanState.language, cleanState.demoLanguage).run();'
)

replace_once(
    "src/demo-texts.js",
    '  return DEMO_TEXTS[voice]?.[lang] || DEMO_TEXTS[voice]?.en || DEMO_TEXTS.Nora[lang] || DEMO_TEXTS.Nora.en;',
    '  return DEMO_TEXTS[voice]?.[lang] || DEMO_TEXTS.Nora[lang] || DEMO_TEXTS[voice]?.en || DEMO_TEXTS.Nora.en;'
)

Path("migrations/0024_demo_language.sql").write_text("ALTER TABLE user_state ADD COLUMN demo_language TEXT;\n")
