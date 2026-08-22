export const LIQUID_METAL_BUTTONS_JS = String.raw`
import { liquidMetalFragmentShader, ShaderMount } from "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.80/+esm";

const STYLE_ID = "vexaLiquidMetalButtonStyles";
const READY_ATTR = "data-vexa-liquid-metal";
const BASE_SPEED = 0.6;
const HOVER_SPEED = 1;
const CLICK_SPEED = 2.4;

const TARGETS = [
  { id: "convertButton", labelSelector: ".tts-generate-label", fallback: "Generate Voice" },
  { id: "generateImageButton", labelSelector: "#generateImageLabel", fallback: "Generate image" },
  { id: "vexaSttRecord", labelSelector: "#vexaSttRecordLabel", fallback: "Tap to speak" },
];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent =
    "button.vexa-liquid-metal{position:relative!important;overflow:hidden!important;border-radius:100px!important;background:transparent!important;border:none!important;outline:none!important;isolation:isolate!important;transform-style:preserve-3d!important;box-shadow:none!important}" +
    "button.vexa-liquid-metal:before,button.vexa-liquid-metal:after{display:none!important;content:none!important}" +
    ".vexa-lm-original{position:absolute!important;inset:0!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
    ".vexa-lm-stage{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;pointer-events:none!important;transform-style:preserve-3d!important;z-index:1!important}" +
    ".vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important}" +
    ".vexa-lm-content{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;transform:translateZ(20px)!important;z-index:30!important;pointer-events:none!important}" +
    ".vexa-lm-label{font-size:14px!important;line-height:1!important;color:#666666!important;font-weight:400!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;white-space:nowrap!important;transition:all .8s cubic-bezier(.34,1.56,.64,1)!important;transform:scale(1)!important;font-family:inherit!important}" +
    ".vexa-lm-inner-layer{transform:translateZ(10px) translateY(0) scale(1)!important;z-index:20!important}" +
    ".vexa-lm-inner{position:absolute!important;inset:2px!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}" +
    ".vexa-lm-shader-layer{transform:translateZ(0) translateY(0) scale(1)!important;z-index:10!important}" +
    ".vexa-lm-shader-frame{position:absolute!important;inset:0!important;border-radius:100px!important;background:rgb(0 0 0 / 0)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}" +
    ".vexa-lm-shader{position:absolute!important;inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;transition:width .4s ease,height .4s ease!important}" +
    ".vexa-lm-shader canvas{width:100%!important;height:100%!important;display:block!important;position:absolute!important;top:0!important;left:0!important;border-radius:100px!important}" +
    "button.vexa-liquid-metal.vexa-lm-hover .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}" +
    "button.vexa-liquid-metal.vexa-lm-pressed .vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}" +
    "button.vexa-liquid-metal.vexa-lm-pressed .vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}" +
    "button.vexa-liquid-metal.vexa-lm-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}" +
    "button.vexa-liquid-metal.vexa-lm-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}" +
    "button.vexa-liquid-metal:disabled .vexa-lm-stage{opacity:.45!important}" +
    "button.vexa-liquid-metal.loading .vexa-lm-label{opacity:.5!important}" +
    ".vexa-lm-ripple{position:absolute!important;z-index:35!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important}" +
    "@keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}";
  document.head.appendChild(style);
}

function createLayer(className) {
  const node = document.createElement("span");
  node.className = className;
  node.setAttribute("aria-hidden", "true");
  return node;
}

function currentLabel(button, target) {
  const source = button.querySelector(target.labelSelector);
  const text = String(source && source.textContent || "").trim();
  return text || target.fallback;
}

function destroyShader(mount) {
  if (!mount) return;
  try {
    if (typeof mount.destroy === "function") mount.destroy();
    else if (typeof mount.dispose === "function") mount.dispose();
  } catch (error) {}
}

function decorate(button, target) {
  if (!button || button.getAttribute(READY_ATTR) === "1") return;
  button.setAttribute(READY_ATTR, "1");
  button.classList.add("vexa-liquid-metal");

  const original = createLayer("vexa-lm-original");
  while (button.firstChild) original.appendChild(button.firstChild);
  button.appendChild(original);

  const stage = createLayer("vexa-lm-stage");
  const shaderLayer = createLayer("vexa-lm-shader-layer");
  const shaderFrame = createLayer("vexa-lm-shader-frame");
  const shaderHost = createLayer("vexa-lm-shader");
  shaderFrame.appendChild(shaderHost);
  shaderLayer.appendChild(shaderFrame);

  const innerLayer = createLayer("vexa-lm-inner-layer");
  innerLayer.appendChild(createLayer("vexa-lm-inner"));

  const content = createLayer("vexa-lm-content");
  const label = createLayer("vexa-lm-label");
  label.textContent = currentLabel(button, target);
  content.appendChild(label);

  stage.appendChild(shaderLayer);
  stage.appendChild(innerLayer);
  stage.appendChild(content);
  button.appendChild(stage);

  let shaderMount = null;
  try {
    shaderMount = new ShaderMount(
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
      0.6,
    );
  } catch (error) {
    console.error("[Vexa] Failed to load Liquid Metal shader", error);
  }

  function syncLabel() {
    const text = currentLabel(button, target);
    if (label.textContent !== text) label.textContent = text;
  }

  const sourceLabel = button.querySelector(target.labelSelector);
  if (sourceLabel) {
    const labelObserver = new MutationObserver(syncLabel);
    labelObserver.observe(sourceLabel, { childList: true, subtree: true, characterData: true });
  }

  button.addEventListener("mouseenter", function () {
    button.classList.add("vexa-lm-hover");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(1);
  });

  button.addEventListener("mouseleave", function () {
    button.classList.remove("vexa-lm-hover", "vexa-lm-pressed");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(0.6);
  });

  button.addEventListener("mousedown", function () {
    button.classList.add("vexa-lm-pressed");
  });

  button.addEventListener("mouseup", function () {
    button.classList.remove("vexa-lm-pressed");
  });

  button.addEventListener("touchstart", function () {
    button.classList.add("vexa-lm-pressed");
  }, { passive: true });

  button.addEventListener("touchend", function () {
    button.classList.remove("vexa-lm-pressed");
  }, { passive: true });

  button.addEventListener("touchcancel", function () {
    button.classList.remove("vexa-lm-pressed");
  }, { passive: true });

  button.addEventListener("click", function (event) {
    if (button.disabled) return;
    if (shaderMount && shaderMount.setSpeed) {
      shaderMount.setSpeed(2.4);
      window.setTimeout(function () {
        if (!shaderMount || !shaderMount.setSpeed) return;
        shaderMount.setSpeed(button.classList.contains("vexa-lm-hover") ? 1 : 0.6);
      }, 300);
    }

    const rect = button.getBoundingClientRect();
    const ripple = createLayer("vexa-lm-ripple");
    ripple.style.left = String(event.clientX - rect.left) + "px";
    ripple.style.top = String(event.clientY - rect.top) + "px";
    button.appendChild(ripple);
    window.setTimeout(function () { ripple.remove(); }, 600);
  });

  const stateObserver = new MutationObserver(function () {
    syncLabel();
    if (!shaderMount || !shaderMount.setSpeed) return;
    if (button.classList.contains("loading")) shaderMount.setSpeed(2.4);
    else shaderMount.setSpeed(button.classList.contains("vexa-lm-hover") ? 1 : 0.6);
  });
  stateObserver.observe(button, { attributes: true, attributeFilter: ["class", "disabled"] });

  window.addEventListener("pagehide", function () { destroyShader(shaderMount); }, { once: true });
}

function scan() {
  installStyles();
  TARGETS.forEach(function (target) {
    const button = document.getElementById(target.id);
    if (button) decorate(button, target);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
else scan();

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
`;
