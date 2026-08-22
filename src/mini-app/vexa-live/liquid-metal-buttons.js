export const LIQUID_METAL_BUTTONS_JS = String.raw`
import { liquidMetalFragmentShader, ShaderMount } from "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.80/+esm";

const STYLE_ID = "vexaLiquidMetalButtonStyles";
const READY_ATTR = "data-vexa-liquid-metal-v2";

const TARGETS = [
  { id: "convertButton", labelSelector: ".tts-generate-label", fallback: "Generate Voice" },
  { id: "generateImageButton", labelSelector: "#generateImageLabel", fallback: "Generate image" },
  { id: "vexaSttRecord", labelSelector: "#vexaSttRecordLabel", fallback: "Tap to speak" },
];

function installStyles() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent =
    ".vexa-lm-shell{position:relative!important;width:100%!important;min-width:0!important;display:block!important;overflow:visible!important}" +
    ".vexa-lm-perspective{position:relative!important;width:100%!important;height:100%!important;perspective:1000px!important;perspective-origin:50% 50%!important}" +
    ".vexa-lm-root{position:relative!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;transform:none!important}" +
    ".vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;pointer-events:none!important}" +
    ".vexa-lm-content{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;transform:translateZ(20px)!important;z-index:30!important}" +
    ".vexa-lm-label{font-size:14px!important;line-height:1!important;color:#666666!important;font-weight:400!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1)!important;transform:scale(1)!important;white-space:nowrap!important;font-family:inherit!important}" +
    ".vexa-lm-inner-layer{transform:translateZ(10px) translateY(0) scale(1)!important;z-index:20!important}" +
    ".vexa-lm-inner{position:absolute!important;inset:2px!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}" +
    ".vexa-lm-shader-layer{transform:translateZ(0) translateY(0) scale(1)!important;z-index:10!important}" +
    ".vexa-lm-shader-frame{position:absolute!important;inset:0!important;border-radius:100px!important;background:rgb(0 0 0 / 0)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}" +
    ".vexa-lm-shader{position:absolute!important;inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;transition:width .4s ease,height .4s ease!important}" +
    ".vexa-lm-shader canvas{width:100%!important;height:100%!important;display:block!important;position:absolute!important;top:0!important;left:0!important;border-radius:100px!important}" +
    ".vexa-lm-shell.is-hovered .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}" +
    ".vexa-lm-shell.is-pressed .vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}" +
    ".vexa-lm-shell.is-pressed .vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}" +
    ".vexa-lm-shell.is-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}" +
    ".vexa-lm-shell.is-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}" +
    "button.vexa-lm-click{position:absolute!important;top:0!important;left:0!important;width:100%!important;max-width:none!important;min-width:0!important;height:100%!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;background:transparent!important;border:none!important;box-shadow:none!important;color:transparent!important;cursor:pointer!important;outline:none!important;z-index:40!important;transform-style:preserve-3d!important;transform:translateZ(25px)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;overflow:hidden!important;border-radius:100px!important;opacity:1!important;-webkit-appearance:none!important;appearance:none!important}" +
    "button.vexa-lm-click:active{transform:translateZ(25px)!important}" +
    "button.vexa-lm-click> :not(.vexa-lm-ripple){opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
    ".vexa-lm-ripple{position:absolute!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important}" +
    "@keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}";
}

function createNode(className) {
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

function restoreOldDecoration(button) {
  const original = button.querySelector(":scope > .vexa-lm-original");
  if (original) {
    while (original.firstChild) button.insertBefore(original.firstChild, original);
    original.remove();
  }
  const oldStage = button.querySelector(":scope > .vexa-lm-stage");
  if (oldStage) oldStage.remove();
  const oldRipple = button.querySelector(":scope > .vexa-lm-ripple-clip");
  if (oldRipple) oldRipple.remove();
  button.classList.remove("vexa-liquid-metal", "vexa-lm-hover", "vexa-lm-pressed");
  button.removeAttribute("data-vexa-liquid-metal");
}

function decorate(button, target) {
  if (!button || button.getAttribute(READY_ATTR) === "1") return;
  const parent = button.parentNode;
  if (!parent) return;

  restoreOldDecoration(button);

  const rect = button.getBoundingClientRect();
  const computed = window.getComputedStyle(button);
  const shell = document.createElement("span");
  shell.className = "vexa-lm-shell";
  shell.setAttribute("data-vexa-liquid-target", target.id);
  shell.style.height = String(Math.max(1, Math.round(rect.height || parseFloat(computed.height) || 46))) + "px";
  shell.style.marginTop = computed.marginTop;
  shell.style.marginRight = computed.marginRight;
  shell.style.marginBottom = computed.marginBottom;
  shell.style.marginLeft = computed.marginLeft;
  shell.style.alignSelf = computed.alignSelf;
  shell.style.justifySelf = computed.justifySelf;

  parent.insertBefore(shell, button);

  const perspective = createNode("vexa-lm-perspective");
  const root = createNode("vexa-lm-root");
  const content = createNode("vexa-lm-content");
  const label = createNode("vexa-lm-label");
  label.textContent = currentLabel(button, target);
  content.appendChild(label);

  const innerLayer = createNode("vexa-lm-inner-layer");
  const inner = createNode("vexa-lm-inner");
  innerLayer.appendChild(inner);

  const shaderLayer = createNode("vexa-lm-shader-layer");
  const shaderFrame = createNode("vexa-lm-shader-frame");
  const shaderHost = createNode("vexa-lm-shader");
  shaderFrame.appendChild(shaderHost);
  shaderLayer.appendChild(shaderFrame);

  root.appendChild(content);
  root.appendChild(innerLayer);
  root.appendChild(shaderLayer);
  perspective.appendChild(root);
  shell.appendChild(perspective);

  button.setAttribute(READY_ATTR, "1");
  button.classList.add("vexa-lm-click");
  root.appendChild(button);

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
    const next = currentLabel(button, target);
    if (label.textContent !== next) label.textContent = next;
  }

  const sourceLabel = button.querySelector(target.labelSelector);
  if (sourceLabel) {
    const labelObserver = new MutationObserver(syncLabel);
    labelObserver.observe(sourceLabel, { childList: true, subtree: true, characterData: true });
  }

  button.addEventListener("mouseenter", function () {
    shell.classList.add("is-hovered");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(1);
  });

  button.addEventListener("mouseleave", function () {
    shell.classList.remove("is-hovered", "is-pressed");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(0.6);
  });

  button.addEventListener("mousedown", function () {
    shell.classList.add("is-pressed");
  });

  button.addEventListener("mouseup", function () {
    shell.classList.remove("is-pressed");
  });

  button.addEventListener("touchstart", function () {
    shell.classList.add("is-pressed");
  }, { passive: true });

  button.addEventListener("touchend", function () {
    shell.classList.remove("is-pressed");
  }, { passive: true });

  button.addEventListener("touchcancel", function () {
    shell.classList.remove("is-pressed");
  }, { passive: true });

  button.addEventListener("click", function (event) {
    if (button.disabled) return;

    if (shaderMount && shaderMount.setSpeed) {
      shaderMount.setSpeed(2.4);
      window.setTimeout(function () {
        if (!shaderMount || !shaderMount.setSpeed) return;
        shaderMount.setSpeed(shell.classList.contains("is-hovered") ? 1 : 0.6);
      }, 300);
    }

    const buttonRect = button.getBoundingClientRect();
    const ripple = createNode("vexa-lm-ripple");
    ripple.style.left = String(event.clientX - buttonRect.left) + "px";
    ripple.style.top = String(event.clientY - buttonRect.top) + "px";
    button.appendChild(ripple);
    window.setTimeout(function () { ripple.remove(); }, 600);
  });

  const stateObserver = new MutationObserver(syncLabel);
  stateObserver.observe(button, { attributes: true, attributeFilter: ["class", "disabled", "aria-label"] });

  window.addEventListener("pagehide", function () {
    if (shaderMount && typeof shaderMount.destroy === "function") shaderMount.destroy();
  }, { once: true });
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
