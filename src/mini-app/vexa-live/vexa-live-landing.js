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
button{font:inherit}
.vexa-live-download{position:fixed;inset:0;display:grid;place-items:center;background:${LIVE_BACKGROUND};overflow:hidden}
.vexa-download-core{width:min(88vw,390px);display:flex;flex-direction:column;align-items:center;gap:18px;transform:translateY(-1.5vh)}
.vexa-download-percent{margin:0;color:#f5f5f5;font-size:44px;font-weight:620;line-height:.95;letter-spacing:-.055em;font-variant-numeric:tabular-nums;opacity:0;transform:translateY(8px) scale(.97);transition:opacity .32s ease,transform .55s cubic-bezier(.16,1,.3,1)}
.vexa-live-download[data-state="preparing"] .vexa-download-percent,.vexa-live-download[data-state="waiting"] .vexa-download-percent,.vexa-live-download[data-state="downloading"] .vexa-download-percent,.vexa-live-download[data-state="completed"] .vexa-download-percent,.vexa-live-download[data-state="error"] .vexa-download-percent{opacity:1;transform:none}
.vexa-download-track{position:relative;width:100%;height:7px;border-radius:999px;overflow:hidden;background:#111;box-shadow:inset 0 0 0 1px rgba(255,255,255,.065),0 0 0 1px rgba(0,0,0,.7)}
.vexa-download-fill{position:absolute;inset:0;transform:scaleX(var(--vexa-progress,0));transform-origin:left center;border-radius:inherit;background:linear-gradient(105deg,#626262 0%,#b7b7b7 18%,#fff 38%,#8f8f8f 55%,#fafafa 74%,#737373 100%);background-size:220% 100%;box-shadow:0 0 12px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.76),inset 0 -1px 0 rgba(0,0,0,.42);transition:transform .72s cubic-bezier(.16,1,.3,1);animation:vexaMetalFlow 2.4s linear infinite}
.vexa-download-fill:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.06) 32%,rgba(255,255,255,.72) 50%,rgba(255,255,255,.08) 68%,transparent 100%);transform:translateX(-120%);animation:vexaMetalShine 1.9s ease-in-out infinite}
.vexa-live-download[data-state="preparing"] .vexa-download-fill{transform:scaleX(.24);transform-origin:center;animation:vexaPrepare 1.35s cubic-bezier(.4,0,.2,1) infinite,vexaMetalFlow 2.4s linear infinite}
.vexa-live-download[data-state="completed"] .vexa-download-fill{box-shadow:0 0 18px rgba(255,255,255,.24),inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(0,0,0,.35)}
.vexa-download-copy{display:flex;flex-direction:column;align-items:center;gap:5px;min-height:35px;text-align:center}
.vexa-download-status{color:rgba(255,255,255,.72);font-size:12px;font-weight:610;line-height:1.2;letter-spacing:-.01em;transition:color .2s ease}
.vexa-download-detail{color:rgba(255,255,255,.31);font-size:10px;font-weight:560;line-height:1.2;font-variant-numeric:tabular-nums;min-height:12px}
.vexa-live-download[data-state="error"] .vexa-download-status{color:rgba(255,255,255,.55)}
.vexa-download-quality{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;width:100%;max-height:0;opacity:0;overflow:hidden;transform:translateY(8px) scale(.98);pointer-events:none;transition:max-height .55s cubic-bezier(.16,1,.3,1),opacity .3s ease,transform .5s cubic-bezier(.16,1,.3,1)}
.vexa-download-quality[data-ready="1"]{max-height:118px;opacity:1;transform:none;pointer-events:auto}
.vexa-quality-option{position:relative;min-width:64px;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));color:rgba(255,255,255,.56);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;outline:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:transform .35s cubic-bezier(.16,1,.3,1),color .25s ease,border-color .25s ease,background .35s ease,box-shadow .35s ease,opacity .25s ease}
.vexa-quality-option span{font-size:12px;font-weight:680;line-height:1;letter-spacing:-.02em}
.vexa-quality-option small{font-size:8px;font-weight:570;line-height:1;color:rgba(255,255,255,.27);font-variant-numeric:tabular-nums;transition:color .25s ease}
.vexa-quality-option[data-selected="1"]{color:#0a0a0a;border-color:rgba(255,255,255,.8);background:linear-gradient(120deg,#747474 0%,#f7f7f7 34%,#a7a7a7 58%,#fff 78%,#858585 100%);background-size:180% 100%;box-shadow:0 0 18px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.9);animation:vexaQualityMetal 3.2s linear infinite}
.vexa-quality-option[data-selected="1"] small{color:rgba(0,0,0,.48)}
@media(hover:hover) and (pointer:fine){.vexa-quality-option:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.82)}}
.vexa-quality-option:active{transform:scale(.96)}
.vexa-quality-option:focus-visible{outline:none;box-shadow:${LIQUID_GLASS_FOCUS_RING}}
.vexa-live-download[data-state="preparing"] .vexa-download-quality,.vexa-live-download[data-state="downloading"] .vexa-download-quality{opacity:.22;pointer-events:none}
.vexa-live-download-action{min-width:132px;height:48px;margin-top:2px;padding:0 24px;${liquidGlassMaterialCss()}outline:0!important;border-radius:999px;color:rgba(255,255,255,.92);font-size:13px;font-weight:650;letter-spacing:-.01em;line-height:1;appearance:none;-webkit-appearance:none;cursor:pointer;transform-origin:center;will-change:transform,filter,opacity;transition:opacity .24s ease,transform .38s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
@media(hover:hover) and (pointer:fine){.vexa-live-download-action:hover{transform:scale(1.045);${LIQUID_GLASS_HOVER_CSS}}}
.vexa-live-download-action:active{transform:scale(.965);filter:brightness(.9)}
.vexa-live-download-action:focus-visible{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
.vexa-live-download-action:disabled{opacity:.35;cursor:default}
.vexa-live-download[data-state="downloading"] .vexa-live-download-action{opacity:0;transform:translateY(8px) scale(.96);pointer-events:none}
.vexa-live-download[data-state="completed"] .vexa-live-download-action{opacity:.62}
@keyframes vexaMetalFlow{0%{background-position:0% 50%}100%{background-position:220% 50%}}
@keyframes vexaMetalShine{0%,15%{transform:translateX(-130%)}70%,100%{transform:translateX(130%)}}
@keyframes vexaPrepare{0%{transform:translateX(-145%) scaleX(.22)}50%{transform:translateX(0) scaleX(.34)}100%{transform:translateX(145%) scaleX(.22)}}
@keyframes vexaQualityMetal{0%{background-position:0% 50%}100%{background-position:180% 50%}}
@media(prefers-reduced-motion:reduce){.vexa-download-percent,.vexa-download-fill,.vexa-download-fill:after,.vexa-live-download-action,.vexa-download-quality,.vexa-quality-option{animation:none!important;transition:none!important}}
`;

const LANDING_BODY = '<body><main id="vexaLiveDownloadRoot" class="vexa-live-download" data-state="idle" style="--vexa-progress:0"><section class="vexa-download-core" aria-live="polite"><p id="vexaLivePercent" class="vexa-download-percent">0%</p><div id="vexaLiveProgressTrack" class="vexa-download-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="vexaLiveProgressFill" class="vexa-download-fill"></span></div><div class="vexa-download-copy"><span id="vexaLiveStatus" class="vexa-download-status">Preparing download</span><small id="vexaLiveDetail" class="vexa-download-detail"></small></div><div id="vexaLiveQuality" class="vexa-download-quality" role="group" aria-label="Video quality"></div><button id="vexaLiveDownload" class="vexa-live-download-action" type="button" disabled>Download</button></section></main></body>';

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
