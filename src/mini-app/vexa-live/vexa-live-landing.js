import {
  LIQUID_GLASS_FOCUS_RING,
  LIQUID_GLASS_HOVER_CSS,
  liquidGlassMaterialCss,
} from "../liquid-glass-style.js";

const LIVE_ROOT = "/mini-app/vexa-live";
const LIVE_BACKGROUND = "#000000";

const LANDING_STYLE = String.raw`
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;min-height:100%;overflow:hidden;overscroll-behavior:none;background:${LIVE_BACKGROUND};color:#fff}
body{position:fixed;inset:0;min-height:100dvh;font-family:"SF Pro Display","SF Pro Text",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
button,select{font:inherit}
.vexa-live-download{position:fixed;inset:0;display:grid;place-items:center;background:${LIVE_BACKGROUND};overflow:hidden}
.vexa-download-core{width:min(88vw,390px);display:flex;flex-direction:column;align-items:center;gap:18px;transform:translateY(-1.5vh)}
.vexa-download-percent{margin:0;color:#f5f5f5;font-size:44px;font-weight:620;line-height:.95;letter-spacing:-.055em;font-variant-numeric:tabular-nums;opacity:0;transform:translateY(8px) scale(.97);transition:opacity .32s ease,transform .55s cubic-bezier(.16,1,.3,1)}
.vexa-live-download[data-state="preparing"] .vexa-download-percent,.vexa-live-download[data-state="waiting"] .vexa-download-percent,.vexa-live-download[data-state="downloading"] .vexa-download-percent,.vexa-live-download[data-state="completed"] .vexa-download-percent,.vexa-live-download[data-state="error"] .vexa-download-percent{opacity:1;transform:none}
.vexa-download-track{position:relative;width:100%;height:7px;border-radius:999px;overflow:hidden;background:#111;box-shadow:inset 0 0 0 1px rgba(255,255,255,.065),0 0 0 1px rgba(0,0,0,.7)}
.vexa-download-fill{position:absolute;inset:0;transform:scaleX(var(--vexa-progress,0));transform-origin:left center;border-radius:inherit;background:linear-gradient(105deg,#626262 0%,#b7b7b7 18%,#fff 38%,#8f8f8f 55%,#fafafa 74%,#737373 100%);box-shadow:0 0 12px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.76),inset 0 -1px 0 rgba(0,0,0,.42);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.vexa-live-download[data-state="completed"] .vexa-download-fill{box-shadow:0 0 18px rgba(255,255,255,.24),inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(0,0,0,.35)}
.vexa-download-copy{display:flex;flex-direction:column;align-items:center;gap:5px;min-height:35px;text-align:center}
.vexa-download-status{color:rgba(255,255,255,.72);font-size:12px;font-weight:610;line-height:1.2;letter-spacing:-.01em;transition:color .2s ease}
.vexa-download-detail{color:rgba(255,255,255,.31);font-size:10px;font-weight:560;line-height:1.2;font-variant-numeric:tabular-nums;min-height:12px}
.vexa-live-download[data-state="error"] .vexa-download-status{color:rgba(255,255,255,.55)}
.vexa-download-quality{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;width:100%;max-height:0;opacity:0;overflow:hidden;transform:translateY(8px) scale(.98);pointer-events:none;transition:max-height .55s cubic-bezier(.16,1,.3,1),opacity .3s ease,transform .5s cubic-bezier(.16,1,.3,1)}
.vexa-download-quality[data-ready="1"]{max-height:176px;opacity:1;transform:none;pointer-events:auto;overflow-y:auto;padding:2px}
.vexa-quality-option{position:relative;min-width:64px;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));color:rgba(255,255,255,.56);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;outline:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:transform .35s cubic-bezier(.16,1,.3,1),color .25s ease,border-color .25s ease,background .35s ease,box-shadow .35s ease,opacity .25s ease}
.vexa-quality-option span{font-size:12px;font-weight:680;line-height:1;letter-spacing:-.02em}
.vexa-quality-option small{font-size:8px;font-weight:570;line-height:1;color:rgba(255,255,255,.27);font-variant-numeric:tabular-nums;transition:color .25s ease}
.vexa-quality-option[data-selected="1"]{color:#0a0a0a;border-color:rgba(255,255,255,.8);background:linear-gradient(120deg,#747474 0%,#f7f7f7 34%,#a7a7a7 58%,#fff 78%,#858585 100%);box-shadow:0 0 18px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.9)}
.vexa-quality-option[data-selected="1"] small{color:rgba(0,0,0,.48)}
@media(hover:hover) and (pointer:fine){.vexa-quality-option:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.82)}}
.vexa-quality-option:active{transform:scale(.96)}
.vexa-quality-option:focus-visible{outline:none;box-shadow:${LIQUID_GLASS_FOCUS_RING}}
.vexa-download-subtitles{width:100%;max-height:0;opacity:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px;transform:translateY(7px) scale(.985);pointer-events:none;transition:max-height .48s cubic-bezier(.16,1,.3,1),opacity .28s ease,transform .44s cubic-bezier(.16,1,.3,1)}
.vexa-download-subtitles[data-ready="1"]{max-height:46px;opacity:1;transform:none;pointer-events:auto}
.vexa-subtitle-label{color:rgba(255,255,255,.34);font-size:9px;font-weight:670;letter-spacing:.02em;white-space:nowrap}
.vexa-subtitle-select-shell{position:relative;min-width:148px;height:36px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:opacity .22s ease,border-color .22s ease,background .22s ease}
.vexa-subtitle-select{position:absolute;inset:0;width:100%;height:100%;padding:0 31px 0 11px;border:0;outline:0;background:transparent;color:rgba(255,255,255,.72);font-size:10.5px;font-weight:630;appearance:none;-webkit-appearance:none;cursor:pointer}
.vexa-subtitle-select option{background:#111;color:#fff}
.vexa-subtitle-chevron{position:absolute;right:11px;top:50%;transform:translateY(-52%);color:rgba(255,255,255,.34);font-size:13px;line-height:1;pointer-events:none}
.vexa-subtitle-select:focus-visible{outline:none}
.vexa-subtitle-select-shell:has(.vexa-subtitle-select:focus-visible){box-shadow:${LIQUID_GLASS_FOCUS_RING}}
.vexa-download-subtitles[data-disabled="1"]{opacity:.28;pointer-events:none}
.vexa-live-download[data-state="preparing"] .vexa-download-quality,.vexa-live-download[data-state="downloading"] .vexa-download-quality,.vexa-live-download[data-state="preparing"] .vexa-download-subtitles,.vexa-live-download[data-state="downloading"] .vexa-download-subtitles{opacity:.22;pointer-events:none}
.vexa-download-actions{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:2px}
.vexa-live-download-action{position:relative;overflow:hidden;min-width:132px;height:48px;margin:0;padding:0 24px;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.92);font-size:13px;font-weight:650;letter-spacing:-.01em;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:0;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter,opacity;transition:opacity .3s ease,transform .5s cubic-bezier(.16,1,.3,1),filter .3s ease,background .35s ease,border-color .35s ease,box-shadow .35s ease,gap .28s ease;animation:vexaActionEnter .58s cubic-bezier(.16,1,.3,1)}
.vexa-upload-action{position:relative;overflow:hidden;width:48px;min-width:48px;height:48px;padding:0;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.92);display:grid;place-items:center;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter,opacity;transition:opacity .3s ease,transform .5s cubic-bezier(.16,1,.3,1),filter .3s ease,background .35s ease,border-color .35s ease,box-shadow .35s ease;animation:vexaActionEnter .58s .07s cubic-bezier(.16,1,.3,1)}
.vexa-live-download-action::after,.vexa-upload-action::after{content:"";position:absolute;z-index:0;top:-45%;bottom:-45%;left:-42%;width:30%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent);transform:skewX(-18deg) translateX(-260%);animation:vexaActionSheen 3.6s 1s cubic-bezier(.16,1,.3,1) infinite}
.vexa-download-action-label,.vexa-upload-plus,.vexa-download-action-loader{position:relative;z-index:1}
.vexa-download-action-label{display:inline-block;transition:transform .4s cubic-bezier(.16,1,.3,1),letter-spacing .35s ease,opacity .25s ease}
.vexa-download-action-loader{width:15px;height:15px;flex:0 0 15px;border-radius:50%;border:1.5px solid rgba(255,255,255,.2);border-top-color:rgba(255,255,255,.92);border-right-color:rgba(255,255,255,.48);opacity:0;transform:scale(.7);margin-right:-15px;pointer-events:none;transition:opacity .2s ease,transform .32s cubic-bezier(.16,1,.3,1),margin-right .28s ease}
.vexa-upload-plus{display:block;width:20px;height:20px;font-size:0;line-height:0;transform-origin:center;transition:transform .5s cubic-bezier(.16,1,.3,1)}
.vexa-upload-plus::before,.vexa-upload-plus::after{content:"";position:absolute;left:50%;top:50%;display:block;background:currentColor;border-radius:999px;transform:translate(-50%,-50%);box-shadow:0 0 7px rgba(255,255,255,.12)}
.vexa-upload-plus::before{width:20px;height:3px}
.vexa-upload-plus::after{width:3px;height:20px}
.vexa-upload-input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;clip:rect(0 0 0 0)!important}
@keyframes vexaActionEnter{from{opacity:0;transform:translateY(10px) scale(.92)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes vexaActionSheen{0%,58%{transform:skewX(-18deg) translateX(-260%);opacity:0}66%{opacity:1}86%,100%{transform:skewX(-18deg) translateX(620%);opacity:0}}
@keyframes vexaButtonSpin{to{transform:rotate(360deg)}}
@keyframes vexaButtonLabelWait{0%,100%{opacity:.56;transform:translateY(1px)}50%{opacity:1;transform:translateY(-1px)}}
@media(hover:hover) and (pointer:fine){.vexa-live-download-action:hover,.vexa-upload-action:hover{transform:translateY(-1px) scale(1.045);${LIQUID_GLASS_HOVER_CSS}}.vexa-live-download-action:hover .vexa-download-action-label{transform:translateY(-1px);letter-spacing:.012em}.vexa-upload-action:hover .vexa-upload-plus{transform:rotate(90deg) scale(1.06)}}
.vexa-live-download-action:active,.vexa-upload-action:active{transform:scale(.955);filter:brightness(.88);transition-duration:.14s}
.vexa-live-download-action:active .vexa-download-action-label{transform:scale(.96)}
.vexa-upload-action:active .vexa-upload-plus{transform:rotate(135deg) scale(.88)}
.vexa-live-download-action:focus-visible,.vexa-upload-action:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-live-download-action:disabled,.vexa-upload-action:disabled{opacity:.35;cursor:default}
.vexa-live-download-action:disabled::after,.vexa-upload-action:disabled::after{display:none}
.vexa-live-download[data-state="downloading"] .vexa-live-download-action,.vexa-live-download[data-state="downloading"] .vexa-upload-action{opacity:0;transform:translateY(8px) scale(.96);pointer-events:none}
.vexa-live-download[data-button-loading="1"] .vexa-live-download-action{opacity:.82!important;transform:none!important;pointer-events:none!important;gap:8px}
.vexa-live-download[data-button-loading="1"] .vexa-download-action-loader{opacity:1;transform:scale(1);margin-right:0;animation:vexaButtonSpin .74s linear infinite}
.vexa-live-download[data-button-loading="1"] .vexa-download-action-label{animation:vexaButtonLabelWait 1.15s ease-in-out infinite}
.vexa-live-download[data-button-loading="1"] .vexa-upload-action{opacity:.18;pointer-events:none}
.vexa-live-download[data-state="completed"] .vexa-live-download-action,.vexa-live-download[data-state="completed"] .vexa-upload-action{opacity:.62}
@media(prefers-reduced-motion:reduce){.vexa-download-percent,.vexa-download-fill,.vexa-live-download-action,.vexa-upload-action,.vexa-download-action-label,.vexa-download-action-loader,.vexa-upload-plus,.vexa-download-quality,.vexa-quality-option,.vexa-download-subtitles{transition:none!important;animation:none!important}.vexa-live-download-action::after,.vexa-upload-action::after{animation:none!important}}
`;

const SUBTITLE_PREFERENCE_SCRIPT = String.raw`(function(){
  'use strict';
  const COOKIE='vexa_download_subtitle';
  const STORAGE='vexaDownloadSubtitle';
  const allowed=new Set(['off','original','en','fa','ru','de','tr','es','ar','fr','pt','it','hi','zh','ja','ko']);
  const root=document.getElementById('vexaLiveDownloadRoot');
  const quality=document.getElementById('vexaLiveQuality');
  const shell=document.getElementById('vexaDownloadSubtitle');
  const select=document.getElementById('vexaDownloadSubtitleLanguage');
  const button=document.getElementById('vexaLiveDownload');
  const percent=document.getElementById('vexaLivePercent');
  if(!root||!quality||!shell||!select||!button||!percent)return;
  function saveValue(value){const next=allowed.has(value)?value:'off';try{localStorage.setItem(STORAGE,next);}catch(error){}const secure=location.protocol==='https:'?'; Secure':'';document.cookie=COOKIE+'='+encodeURIComponent(next)+'; Max-Age=31536000; Path=/; SameSite=Lax'+secure;}
  function ensureButtonChrome(){let label=button.querySelector('.vexa-download-action-label');let loader=button.querySelector('.vexa-download-action-loader');if(label&&loader)return{label,loader};const text=String(button.textContent||'Download').trim()||'Download';button.replaceChildren();loader=document.createElement('span');loader.className='vexa-download-action-loader';loader.setAttribute('aria-hidden','true');label=document.createElement('span');label.className='vexa-download-action-label';label.textContent=text;button.append(loader,label);return{label,loader};}
  function percentValue(){const value=Number.parseFloat(String(percent.textContent||'0').replace('%',''));return Number.isFinite(value)?value:0;}
  function sync(){const ready=quality.dataset.ready==='1'||root.dataset.localUpload==='1';const active=quality.querySelector('[data-quality-key][data-selected="1"]');const audio=String(active?.dataset?.qualityKey||'')==='a'&&root.dataset.localUpload!=='1';shell.dataset.ready=ready?'1':'0';shell.dataset.disabled=audio?'1':'0';select.disabled=audio;const chrome=ensureButtonChrome();const state=String(root.dataset.state||'');const loading=(state==='preparing'||state==='downloading')&&percentValue()<=0;root.dataset.buttonLoading=loading?'1':'0';if(loading){const text=state==='preparing'?'Preparing…':'Starting…';if(chrome.label.textContent!==text)chrome.label.textContent=text;}}
  function haptic(){try{const host=window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin?window.parent:window;(window.Telegram?.WebApp||host.Telegram?.WebApp)?.HapticFeedback?.impactOccurred?.('light');}catch(error){}}
  select.value='off';saveValue('off');select.addEventListener('change',function(){saveValue(String(select.value||'off'));haptic();});
  const observer=new MutationObserver(sync);observer.observe(quality,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ready','data-selected']});observer.observe(root,{attributes:true,attributeFilter:['data-local-upload','data-state']});observer.observe(percent,{childList:true,subtree:true,characterData:true});observer.observe(button,{childList:true,subtree:true,characterData:true});sync();
})();`;

const LANDING_BODY = '<body><main id="vexaLiveDownloadRoot" class="vexa-live-download" data-state="idle" data-local-upload="0" style="--vexa-progress:0"><section class="vexa-download-core" aria-live="polite"><p id="vexaLivePercent" class="vexa-download-percent">0%</p><div id="vexaLiveProgressTrack" class="vexa-download-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="vexaLiveProgressFill" class="vexa-download-fill"></span></div><div class="vexa-download-copy"><span id="vexaLiveStatus" class="vexa-download-status">Preparing download</span><small id="vexaLiveDetail" class="vexa-download-detail"></small></div><div id="vexaLiveQuality" class="vexa-download-quality" role="group" aria-label="Video quality"></div><div id="vexaDownloadSubtitle" class="vexa-download-subtitles" data-ready="0" data-disabled="0"><span class="vexa-subtitle-label">Subtitles</span><label class="vexa-subtitle-select-shell"><select id="vexaDownloadSubtitleLanguage" class="vexa-subtitle-select" aria-label="Burned-in subtitle language"><option value="off">Off</option><option value="original">Original audio</option><option value="en">English</option><option value="fa">فارسی</option><option value="ru">Русский</option><option value="de">Deutsch</option><option value="tr">Türkçe</option><option value="es">Español</option><option value="ar">العربية</option><option value="fr">Français</option><option value="pt">Português</option><option value="it">Italiano</option><option value="hi">हिन्दी</option><option value="zh">中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select><span class="vexa-subtitle-chevron">⌄</span></label></div><div class="vexa-download-actions"><button id="vexaLiveDownload" class="vexa-live-download-action" type="button" disabled><span class="vexa-download-action-loader" aria-hidden="true"></span><span class="vexa-download-action-label">Download</span></button><button id="vexaLiveUpload" class="vexa-upload-action" type="button" aria-label="Upload video"><span class="vexa-upload-plus" aria-hidden="true">+</span></button><input id="vexaLiveUploadInput" class="vexa-upload-input" type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" aria-hidden="true" tabindex="-1"></div></section></main><script>' + SUBTITLE_PREFERENCE_SCRIPT + '</script></body>';

export async function appendVexaLiveLandingRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== LIVE_ROOT && path !== LIVE_ROOT + "/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  let source = await response.text();
  source = source.replace(/<meta name="theme-color" content="[^"]*" \/>/i, '<meta name="theme-color" content="' + LIVE_BACKGROUND + '" />');
  source = source.replace(/<style>[\s\S]*?<\/style>/i, '<style>' + LANDING_STYLE + '</style>');
  source = /<body[\s\S]*?<\/body>/i.test(source)
    ? source.replace(/<body[\s\S]*?<\/body>/i, LANDING_BODY)
    : source + LANDING_BODY;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(source, { status: response.status, statusText: response.statusText, headers });
}
