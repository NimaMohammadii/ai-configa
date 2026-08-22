export const LIQUID_METAL_BUTTONS_JS = String.raw`
import { liquidMetalFragmentShader, ShaderMount } from "https://esm.sh/@paper-design/shaders@0.0.80?bundle";

const STYLE_ID = "vexaLiquidMetalButtonStyles";
const DECORATED = "vexaLiquidMetalReady";
const WIDTH = 142;
const HEIGHT = 46;
const INNER_WIDTH = 138;
const INNER_HEIGHT = 42;
const BASE_SPEED = 0.6;
const HOVER_SPEED = 1;
const CLICK_SPEED = 2.4;
const MIN_PIXEL_RATIO = 3;
const MAX_PIXEL_COUNT = 1000000;

const TARGETS = [
  { id: "convertButton", labelSelector: ".tts-generate-label", fallback: "Generate Voice" },
  { id: "generateImageButton", labelSelector: "#generateImageLabel", fallback: "Generate image" },
  { id: "vexaSttRecord", labelSelector: "#vexaSttRecordLabel", fallback: "Tap to speak" },
];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .vexa-lm-shell{
      width:${WIDTH}px!important;height:${HEIGHT}px!important;min-width:${WIDTH}px!important;min-height:${HEIGHT}px!important;
      display:block!important;justify-self:center!important;align-self:center!important;margin-left:auto!important;margin-right:auto!important;
      perspective:1000px!important;perspective-origin:50% 50%!important;overflow:visible!important;
    }
    button.vexa-liquid-metal-button{
      position:relative!important;width:${WIDTH}px!important;max-width:${WIDTH}px!important;min-width:${WIDTH}px!important;
      height:${HEIGHT}px!important;max-height:${HEIGHT}px!important;min-height:${HEIGHT}px!important;
      margin:0!important;padding:0!important;display:block!important;overflow:hidden!important;border:0!important;border-radius:100px!important;
      outline:0!important;background:transparent!important;color:transparent!important;box-shadow:none!important;cursor:pointer!important;
      transform-style:preserve-3d!important;transform:translateZ(25px)!important;
      transition:all .8s cubic-bezier(.34,1.56,.64,1),opacity .2s ease!important;
      isolation:isolate!important;-webkit-appearance:none!important;appearance:none!important;
    }
    button.vexa-liquid-metal-button:active{transform:translateZ(25px)!important}
    button.vexa-liquid-metal-button:disabled{cursor:default!important}
    button.vexa-liquid-metal-button>${"*:not(.vexa-lm-stage):not(.vexa-lm-ripple)"}{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
    .vexa-lm-original{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important}
    .vexa-lm-stage{position:absolute!important;inset:0!important;width:${WIDTH}px!important;height:${HEIGHT}px!important;display:block!important;pointer-events:none!important;transform-style:preserve-3d!important;z-index:1!important}
    .vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer{
      position:absolute!important;inset:0!important;width:${WIDTH}px!important;height:${HEIGHT}px!important;transform-style:preserve-3d!important;
      transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important;
    }
    .vexa-lm-content{z-index:30!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;transform:translateZ(20px)!important}
    .vexa-lm-label{font-size:14px!important;line-height:1!important;color:#666!important;font-weight:400!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;white-space:nowrap!important;transition:all .8s cubic-bezier(.34,1.56,.64,1)!important;transform:scale(1)!important;font-family:inherit!important}
    .vexa-lm-inner-layer{z-index:20!important;transform:translateZ(10px) translateY(0) scale(1)!important}
    .vexa-lm-inner{width:${INNER_WIDTH}px!important;height:${INNER_HEIGHT}px!important;margin:2px!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}
    .vexa-lm-shader-layer{z-index:10!important;transform:translateZ(0) translateY(0) scale(1)!important}
    .vexa-lm-shader-frame{width:${WIDTH}px!important;height:${HEIGHT}px!important;border-radius:100px!important;background:rgb(0 0 0 / 0)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}
    .vexa-lm-shader{position:relative!important;width:${WIDTH}px!important;max-width:${WIDTH}px!important;height:${HEIGHT}px!important;border-radius:100px!important;overflow:hidden!important;background:linear-gradient(115deg,#ececf0 0%,#353537 18%,#f7f7fa 36%,#18181a 56%,#e7e7eb 76%,#3b3b3e 100%)!important}
    .vexa-lm-shader canvas{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;display:block!important;border-radius:100px!important}
    button.vexa-liquid-metal-button.is-hovered .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}
    button.vexa-liquid-metal-button.is-pressed .vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}
    button.vexa-liquid-metal-button.is-pressed .vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}
    button.vexa-liquid-metal-button.is-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}
    button.vexa-liquid-metal-button.is-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}
    button.vexa-liquid-metal-button.loading .vexa-lm-label{opacity:.5!important}
    button.vexa-liquid-metal-button:disabled .vexa-lm-stage{opacity:.55!important}
    .vexa-lm-ripple{position:absolute!important;z-index:35!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important}
    .tts-generate-row>.vexa-lm-shell{margin-top:0!important;margin-bottom:0!important}
    .image-workspace>.vexa-lm-shell{flex:0 0 ${HEIGHT}px!important;margin-top:0!important;margin-bottom:0!important}
    .vexa-stt-controls>.vexa-lm-shell{width:100%!important;min-width:0!important;display:flex!important;align-items:center!important;justify-content:center!important}
    @keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}
    @media(prefers-reduced-motion:reduce){button.vexa-liquid-metal-button,.vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer,.vexa-lm-inner,.vexa-lm-shader-frame{transition:none!important}.vexa-lm-ripple{animation:none!important}}
  `;
  document.head.appendChild(style);
}

function releaseMount(mount) {
  if (!mount) return;
  try {
    if (typeof mount.dispose === "function") mount.dispose();
    else if (typeof mount.destroy === "function") mount.destroy();
  } catch (error) {}
}

function labelFor(button, target) {
  const node = button.querySelector(target.labelSelector);
  const value = String(node?.textContent || "").trim();
  return value || target.fallback;
}

function makeLayer(className) {
  const node = document.createElement("span");
  node.className = className;
  node.setAttribute("aria-hidden", "true");
  return node;
}

function addRipple(button, event) {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
  const rect = button.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "vexa-lm-ripple";
  ripple.style.left = String(event.clientX - rect.left) + "px";
  ripple.style.top = String(event.clientY - rect.top) + "px";
  ripple.setAttribute("aria-hidden", "true");
  button.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 600);
}

function decorate(button, target) {
  if (!button || button.dataset[DECORATED] === "1") return;
  button.dataset[DECORATED] = "1";
  installStyles();

  const original = makeLayer("vexa-lm-original");
  while (button.firstChild) original.appendChild(button.firstChild);
  button.appendChild(original);

  const shell = document.createElement("span");
  shell.className = "vexa-lm-shell";
  const parent = button.parentNode;
  if (!parent) return;
  parent.insertBefore(shell, button);
  shell.appendChild(button);
  button.classList.add("vexa-liquid-metal-button");

  const stage = makeLayer("vexa-lm-stage");
  const content = makeLayer("vexa-lm-content");
  const label = makeLayer("vexa-lm-label");
  label.textContent = labelFor(button, target);
  content.appendChild(label);

  const innerLayer = makeLayer("vexa-lm-inner-layer");
  innerLayer.appendChild(makeLayer("vexa-lm-inner"));

  const shaderLayer = makeLayer("vexa-lm-shader-layer");
  const shaderFrame = makeLayer("vexa-lm-shader-frame");
  const shaderHost = makeLayer("vexa-lm-shader");
  shaderFrame.appendChild(shaderHost);
  shaderLayer.appendChild(shaderFrame);

  stage.appendChild(shaderLayer);
  stage.appendChild(innerLayer);
  stage.appendChild(content);
  button.appendChild(stage);

  let mount = null;
  try {
    mount = new ShaderMount(
      shaderHost,
      liquidMetalFragmentShader,
      {
        u_repetition: 4,
        u_softness: 0.5,
        u_shiftRed: 0.3,
        u_shiftBlue: 0.3,
        u_distortion: 0,
        u_contour: 0,
        u_angle: 45,
        u_scale: 8,
        u_shape: 1,
        u_offsetX: 0.1,
        u_offsetY: -0.1,
      },
      undefined,
      BASE_SPEED,
      0,
      MIN_PIXEL_RATIO,
      MAX_PIXEL_COUNT,
    );
  } catch (error) {
    console.error("[Vexa] Liquid Metal shader failed", error);
  }

  const syncLabel = () => {
    const next = labelFor(button, target);
    if (label.textContent !== next) label.textContent = next;
  };
  const labelNode = button.querySelector(target.labelSelector);
  if (labelNode) {
    const labelObserver = new MutationObserver(syncLabel);
    labelObserver.observe(labelNode, { childList: true, subtree: true, characterData: true });
  }

  button.addEventListener("pointerenter", () => {
    if (button.disabled) return;
    button.classList.add("is-hovered");
    mount?.setSpeed?.(HOVER_SPEED);
  });
  button.addEventListener("pointerleave", () => {
    button.classList.remove("is-hovered", "is-pressed");
    mount?.setSpeed?.(BASE_SPEED);
  });
  button.addEventListener("pointerdown", () => {
    if (!button.disabled) button.classList.add("is-pressed");
  });
  const release = () => button.classList.remove("is-pressed");
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("click", (event) => {
    if (button.disabled) return;
    addRipple(button, event);
    mount?.setSpeed?.(CLICK_SPEED);
    window.setTimeout(() => {
      mount?.setSpeed?.(button.classList.contains("is-hovered") ? HOVER_SPEED : BASE_SPEED);
    }, 300);
  });

  const stateObserver = new MutationObserver(() => {
    syncLabel();
    if (button.classList.contains("loading")) mount?.setSpeed?.(CLICK_SPEED);
  });
  stateObserver.observe(button, { attributes: true, attributeFilter: ["class", "disabled"] });

  window.addEventListener("pagehide", () => releaseMount(mount), { once: true });
}

function scan() {
  for (const target of TARGETS) {
    const button = document.getElementById(target.id);
    if (button) decorate(button, target);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scan, { once: true });
} else {
  scan();
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
`;
