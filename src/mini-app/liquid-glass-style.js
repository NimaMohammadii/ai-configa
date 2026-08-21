const LIQUID_GLASS_BACKGROUND = [
  "radial-gradient(145% 190% at 10% -18%,rgba(255,255,255,.19) 0%,rgba(255,255,255,.07) 25%,rgba(255,255,255,0) 51%)",
  "radial-gradient(125% 160% at 104% 112%,rgba(255,255,255,.095) 0%,rgba(255,255,255,.025) 36%,rgba(255,255,255,0) 64%)",
  "linear-gradient(142deg,rgba(255,255,255,.065) 0%,rgba(255,255,255,.018) 42%,rgba(255,255,255,.035) 68%,rgba(255,255,255,.055) 100%)",
].join(",");

const LIQUID_GLASS_ACTIVE_BACKGROUND = [
  "radial-gradient(145% 190% at 10% -18%,rgba(255,255,255,.255) 0%,rgba(255,255,255,.10) 26%,rgba(255,255,255,0) 52%)",
  "radial-gradient(125% 160% at 104% 112%,rgba(255,255,255,.14) 0%,rgba(255,255,255,.045) 38%,rgba(255,255,255,0) 66%)",
  "linear-gradient(142deg,rgba(255,255,255,.105) 0%,rgba(255,255,255,.032) 43%,rgba(255,255,255,.06) 70%,rgba(255,255,255,.085) 100%)",
].join(",");

const LIQUID_GLASS_SHADOW = [
  "0 1px 1px rgba(255,255,255,.035)",
  "0 3px 8px rgba(0,0,0,.12)",
  "0 10px 28px rgba(0,0,0,.17)",
  "inset 0 1px 0 rgba(255,255,255,.36)",
  "inset 0 -1px 0 rgba(255,255,255,.08)",
  "inset 1px 0 0 rgba(255,255,255,.11)",
  "inset -1px 0 0 rgba(255,255,255,.05)",
  "inset 0 0 0 .5px rgba(255,255,255,.08)",
  "inset 3px 3px .7px -3.5px rgba(255,255,255,.16)",
  "inset -3px -3px .7px -3.5px rgba(255,255,255,.72)",
  "inset 0 0 15px rgba(255,255,255,.045)",
].join(",");

const LIQUID_GLASS_ACTIVE_SHADOW = [
  "0 1px 1px rgba(255,255,255,.05)",
  "0 4px 10px rgba(0,0,0,.14)",
  "0 12px 32px rgba(0,0,0,.19)",
  "0 0 22px rgba(255,255,255,.055)",
  "inset 0 1px 0 rgba(255,255,255,.48)",
  "inset 0 -1px 0 rgba(255,255,255,.11)",
  "inset 1px 0 0 rgba(255,255,255,.15)",
  "inset -1px 0 0 rgba(255,255,255,.07)",
  "inset 0 0 0 .5px rgba(255,255,255,.11)",
  "inset 3px 3px .7px -3.5px rgba(255,255,255,.22)",
  "inset -3px -3px .7px -3.5px rgba(255,255,255,.82)",
  "inset 0 0 18px rgba(255,255,255,.065)",
].join(",");

export function liquidGlassMaterialCss({ active = false } = {}) {
  return [
    "background:" + (active ? LIQUID_GLASS_ACTIVE_BACKGROUND : LIQUID_GLASS_BACKGROUND) + "!important",
    "border:1px solid " + (active ? "rgba(255,255,255,.19)" : "rgba(255,255,255,.105)") + "!important",
    "box-shadow:" + (active ? LIQUID_GLASS_ACTIVE_SHADOW : LIQUID_GLASS_SHADOW) + "!important",
    "backdrop-filter:blur(22px) saturate(1.48) contrast(1.055) brightness(1.025)!important",
    "-webkit-backdrop-filter:blur(22px) saturate(1.48) contrast(1.055) brightness(1.025)!important",
  ].join(";") + ";";
}

export const LIQUID_GLASS_HOVER_CSS = "filter:brightness(1.07) saturate(1.06);";
export const LIQUID_GLASS_FOCUS_RING = LIQUID_GLASS_SHADOW + ",0 0 0 3px rgba(255,255,255,.16),0 0 24px rgba(255,255,255,.07)";

const TOP_CONTROL_SELECTOR = [
  ".tts-head .credit-pill",
  ".tts-head .wheel-open-button",
  ".tts-head .voice-btn",
  ".tts-head .mode-toggle",
].join(",");

const TOP_CONTROL_INTERACTIVE_SELECTOR = [
  ".tts-head .credit-pill",
  ".tts-head .wheel-open-button",
  ".tts-head .voice-btn",
  ".tts-head .mode-toggle",
].join(":hover,") + ":hover";

const TOP_CONTROL_ACTIVE_SELECTOR = [
  ".tts-head .credit-pill",
  ".tts-head .wheel-open-button",
  ".tts-head .voice-btn",
  ".tts-head .mode-toggle",
].join(":active,") + ":active";

const TOP_CONTROL_FOCUS_SELECTOR = [
  ".tts-head .credit-pill",
  ".tts-head .wheel-open-button",
  ".tts-head .voice-btn",
  ".tts-head .mode-toggle",
].join(":focus-visible,") + ":focus-visible";

export const LIQUID_GLASS_CONTROLS_CSS = String.raw`
/* Canonical high-fidelity Liquid Glass material for the existing top controls. */
${TOP_CONTROL_SELECTOR}{
  ${liquidGlassMaterialCss()}
  color:#fff!important;
  transform:translateZ(0);
  transform-origin:center;
  isolation:isolate;
  -webkit-font-smoothing:antialiased;
  text-rendering:geometricPrecision;
  text-shadow:0 1px 1px rgba(0,0,0,.24),0 0 8px rgba(255,255,255,.035);
  will-change:transform,filter;
  transition:transform .34s cubic-bezier(.16,1,.3,1),filter .22s ease,background .3s ease,border-color .3s ease,box-shadow .3s ease!important
}
${TOP_CONTROL_SELECTOR} svg{
  filter:drop-shadow(0 1px .6px rgba(0,0,0,.32)) drop-shadow(0 0 5px rgba(255,255,255,.05));
  shape-rendering:geometricPrecision
}
.tts-head .mode-toggle[aria-pressed="true"]{
  ${liquidGlassMaterialCss({ active: true })}
  color:#fff!important
}
@media(hover:hover) and (pointer:fine){
  ${TOP_CONTROL_INTERACTIVE_SELECTOR}{transform:translateY(-.5px) scale(1.045)!important;${LIQUID_GLASS_HOVER_CSS}}
}
${TOP_CONTROL_ACTIVE_SELECTOR}{transform:translateY(.5px) scale(.965)!important;filter:brightness(.91) saturate(.96)!important}
${TOP_CONTROL_FOCUS_SELECTOR}{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
@media(prefers-reduced-motion:reduce){${TOP_CONTROL_SELECTOR}{transition:none!important}}
`;
