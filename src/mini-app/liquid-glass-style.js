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

export const LIQUID_GLASS_HOVER_CSS =
  "filter:brightness(1.1);";

export const LIQUID_GLASS_FOCUS_RING =
  LIQUID_GLASS_SHADOW + ",0 0 0 3px rgba(255,255,255,.14)";
