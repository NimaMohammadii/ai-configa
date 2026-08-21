const LIQUID_GLASS_SHADOW = [
  "0 0 8px rgba(0,0,0,.03)",
  "0 2px 6px rgba(0,0,0,.08)",
  "inset 3px 3px .5px -3.5px rgba(255,255,255,.09)",
  "inset -3px -3px .5px -3.5px rgba(255,255,255,.85)",
  "inset 1px 1px 1px -.5px rgba(255,255,255,.6)",
  "inset -1px -1px 1px -.5px rgba(255,255,255,.6)",
  "inset 0 0 6px 6px rgba(255,255,255,.12)",
  "inset 0 0 2px 2px rgba(255,255,255,.06)",
  "0 0 12px rgba(0,0,0,.15)",
].join(",");

const LIQUID_GLASS_ACTIVE_SHADOW = [
  "0 0 10px rgba(255,255,255,.05)",
  "0 3px 8px rgba(0,0,0,.12)",
  "inset 3px 3px .5px -3.5px rgba(255,255,255,.16)",
  "inset -3px -3px .5px -3.5px rgba(255,255,255,.92)",
  "inset 1px 1px 1px -.5px rgba(255,255,255,.72)",
  "inset -1px -1px 1px -.5px rgba(255,255,255,.68)",
  "inset 0 0 8px 7px rgba(255,255,255,.15)",
  "inset 0 0 2px 2px rgba(255,255,255,.09)",
  "0 0 18px rgba(255,255,255,.08)",
].join(",");

export function liquidGlassMaterialCss({ active = false } = {}) {
  return [
    "background:" + (active ? "rgba(255,255,255,.075)" : "rgba(255,255,255,.018)") + "!important",
    "border:1px solid " + (active ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.075)") + "!important",
    "box-shadow:" + (active ? LIQUID_GLASS_ACTIVE_SHADOW : LIQUID_GLASS_SHADOW) + "!important",
    "backdrop-filter:blur(14px) saturate(1.22)!important",
    "-webkit-backdrop-filter:blur(14px) saturate(1.22)!important",
  ].join(";") + ";";
}

export const LIQUID_GLASS_HOVER_CSS = "filter:brightness(1.1);";
export const LIQUID_GLASS_FOCUS_RING = LIQUID_GLASS_SHADOW + ",0 0 0 3px rgba(255,255,255,.14)";

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
/* Canonical Liquid Glass material for the existing top controls. */
${TOP_CONTROL_SELECTOR}{
  ${liquidGlassMaterialCss()}
  color:#fff!important;
  transform:translateZ(0);
  transform-origin:center;
  will-change:transform,filter;
  transition:transform .3s cubic-bezier(.16,1,.3,1),filter .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease!important
}
.tts-head .mode-toggle[aria-pressed="true"]{
  ${liquidGlassMaterialCss({ active: true })}
  color:#fff!important
}
@media(hover:hover) and (pointer:fine){
  ${TOP_CONTROL_INTERACTIVE_SELECTOR}{transform:scale(1.05)!important;${LIQUID_GLASS_HOVER_CSS}}
}
${TOP_CONTROL_ACTIVE_SELECTOR}{transform:scale(.97)!important;filter:brightness(.9)!important}
${TOP_CONTROL_FOCUS_SELECTOR}{outline:none!important;box-shadow:${LIQUID_GLASS_FOCUS_RING}!important}
@media(prefers-reduced-motion:reduce){${TOP_CONTROL_SELECTOR}{transition:none!important}}
`;
