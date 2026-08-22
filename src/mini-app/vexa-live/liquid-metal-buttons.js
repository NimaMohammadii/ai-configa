export const LIQUID_METAL_BUTTONS_JS = String.raw`
import { liquidMetalFragmentShader, ShaderMount } from "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.80/+esm";

const STYLE_ID = "vexaLiquidMetalButtonStylesV3";
const READY_ATTR = "data-vexa-liquid-metal-v3";
const TARGET_SELECTOR = "#convertButton,#generateImageButton,#vexaSttRecord";

const TARGETS = [
  { id: "convertButton", labelSelector: ".tts-generate-label", fallback: "Generate Voice" },
  { id: "generateImageButton", labelSelector: "#generateImageLabel", fallback: "Generate image" },
  { id: "vexaSttRecord", labelSelector: "#vexaSttRecordLabel", fallback: "Tap to speak" },
];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    ".vexa-lm-shell{position:relative!important;width:100%!important;min-width:0!important;display:block!important;overflow:visible!important;isolation:isolate!important}",
    ".vexa-lm-perspective{position:relative!important;width:100%!important;height:100%!important;perspective:1000px!important;perspective-origin:50% 50%!important}",
    ".vexa-lm-root{position:relative!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;transform:none!important}",
    ".vexa-lm-content,.vexa-lm-inner-layer,.vexa-lm-shader-layer{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;transform-style:preserve-3d!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;pointer-events:none!important}",
    ".vexa-lm-content{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;transform:translateZ(20px)!important;z-index:30!important}",
    ".vexa-lm-label{font-size:14px!important;line-height:1!important;color:#666666!important;font-weight:400!important;text-shadow:0 1px 2px rgba(0,0,0,.5)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1)!important;transform:scale(1)!important;white-space:nowrap!important;font-family:inherit!important}",
    ".vexa-lm-inner-layer{transform:translateZ(10px) translateY(0) scale(1)!important;z-index:20!important}",
    ".vexa-lm-inner{position:absolute!important;inset:2px!important;border-radius:100px!important;background:linear-gradient(180deg,#202020 0%,#000000 100%)!important;box-shadow:none!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),box-shadow .15s cubic-bezier(.4,0,.2,1)!important}",
    ".vexa-lm-shader-layer{transform:translateZ(0) translateY(0) scale(1)!important;z-index:10!important}",
    ".vexa-lm-shader-frame{position:absolute!important;inset:0!important;border-radius:100px!important;background:rgb(0 0 0 / 0)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 36px 14px rgba(0,0,0,.02),0 20px 12px rgba(0,0,0,.08),0 9px 9px rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.15)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease,box-shadow .15s cubic-bezier(.4,0,.2,1)!important;overflow:hidden!important}",
    ".vexa-lm-shader{position:absolute!important;inset:0!important;width:100%!important;max-width:100%!important;height:100%!important;border-radius:100px!important;overflow:hidden!important;transition:width .4s ease,height .4s ease!important}",
    ".vexa-lm-shader canvas{width:100%!important;height:100%!important;display:block!important;position:absolute!important;top:0!important;left:0!important;border-radius:100px!important}",
    ".vexa-lm-shell.is-hovered .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 12px 6px rgba(0,0,0,.05),0 8px 5px rgba(0,0,0,.1),0 4px 4px rgba(0,0,0,.15),0 1px 2px rgba(0,0,0,.2)!important}",
    ".vexa-lm-shell.is-pressed .vexa-lm-inner-layer{transform:translateZ(10px) translateY(1px) scale(.98)!important}",
    ".vexa-lm-shell.is-pressed .vexa-lm-shader-layer{transform:translateZ(0) translateY(1px) scale(.98)!important}",
    ".vexa-lm-shell.is-pressed .vexa-lm-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.4),inset 0 1px 2px rgba(0,0,0,.3)!important}",
    ".vexa-lm-shell.is-pressed .vexa-lm-shader-frame{box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3)!important}",
    ".vexa-lm-shell.is-disabled{opacity:.45!important}",
    ".vexa-lm-shell.is-busy .vexa-lm-content{opacity:0!important;transform:translateZ(20px) scale(.96)!important}",
    ".vexa-lm-shell.no-shader .vexa-lm-shader-frame{background:linear-gradient(135deg,#2b2b2d 0%,#77797f 22%,#222326 45%,#8a8c92 68%,#292a2d 100%)!important}",
    "button.vexa-lm-click{position:absolute!important;top:0!important;left:0!important;width:100%!important;max-width:none!important;min-width:0!important;height:100%!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;background:transparent!important;border:none!important;box-shadow:none!important;color:transparent!important;cursor:pointer!important;outline:none!important;z-index:40!important;transform-style:preserve-3d!important;transform:translateZ(25px)!important;transition:all .8s cubic-bezier(.34,1.56,.64,1),width .4s ease,height .4s ease!important;overflow:hidden!important;border-radius:100px!important;opacity:1!important;-webkit-appearance:none!important;appearance:none!important}",
    "button.vexa-lm-click:active{transform:translateZ(25px)!important}",
    "button.vexa-lm-click> *{opacity:0!important;visibility:hidden!important;pointer-events:none!important}",
    "button.vexa-lm-click.loading .tts-generate-wave{opacity:1!important;visibility:visible!important}",
    "button.vexa-lm-click.loading .tts-generate-wave *{visibility:visible!important}",
    ".vexa-lm-ripple{position:absolute!important;width:20px!important;height:20px!important;border-radius:50%!important;background:radial-gradient(circle,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 70%)!important;pointer-events:none!important;animation:vexaLmRipple .6s ease-out!important;visibility:visible!important;opacity:1!important}",
    "@keyframes vexaLmRipple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(4);opacity:0}}"
  ].join("");
  document.head.appendChild(style);
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

function buttonHeight(button) {
  const rect = button.getBoundingClientRect();
  if (rect.height > 0) return rect.height;
  const computed = window.getComputedStyle(button);
  const parsed = Number.parseFloat(computed.height);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 46;
}

function mirrorLayout(button, shell) {
  const computed = window.getComputedStyle(button);
  shell.style.height = String(Math.max(1, Math.round(buttonHeight(button)))) + "px";
  shell.style.marginTop = computed.marginTop;
  shell.style.marginRight = computed.marginRight;
  shell.style.marginBottom = computed.marginBottom;
  shell.style.marginLeft = computed.marginLeft;
  shell.style.flex = computed.flex;
  shell.style.alignSelf = computed.alignSelf;
  shell.style.justifySelf = computed.justifySelf;
  shell.style.order = computed.order;
}

function decorate(button, target) {
  if (!button || button.getAttribute(READY_ATTR) === "1") return;
  const parent = button.parentNode;
  if (!parent) return;

  installStyles();

  const shell = createNode("vexa-lm-shell");
  shell.removeAttribute("aria-hidden");
  shell.setAttribute("data-vexa-liquid-target", target.id);
  mirrorLayout(button, shell);

  const perspective = createNode("vexa-lm-perspective");
  const root = createNode("vexa-lm-root");
  const content = createNode("vexa-lm-content");
  const label = createNode("vexa-lm-label");
  const innerLayer = createNode("vexa-lm-inner-layer");
  const inner = createNode("vexa-lm-inner");
  const shaderLayer = createNode("vexa-lm-shader-layer");
  const shaderFrame = createNode("vexa-lm-shader-frame");
  const shaderHost = createNode("vexa-lm-shader");

  label.textContent = currentLabel(button, target);
  content.appendChild(label);
  innerLayer.appendChild(inner);
  shaderFrame.appendChild(shaderHost);
  shaderLayer.appendChild(shaderFrame);
  root.appendChild(content);
  root.appendChild(innerLayer);
  root.appendChild(shaderLayer);
  perspective.appendChild(root);
  shell.appendChild(perspective);

  parent.insertBefore(shell, button);
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
    shell.classList.add("no-shader");
    console.error("[Vexa] Failed to load Liquid Metal shader", error);
  }

  function syncLabel() {
    const next = currentLabel(button, target);
    if (label.textContent !== next) label.textContent = next;
  }

  function syncState() {
    shell.classList.toggle("is-disabled", Boolean(button.disabled));
    shell.classList.toggle("is-busy", button.classList.contains("loading") || button.classList.contains("processing"));
    syncLabel();
  }

  const sourceLabel = button.querySelector(target.labelSelector);
  if (sourceLabel) {
    const labelObserver = new MutationObserver(syncLabel);
    labelObserver.observe(sourceLabel, { childList: true, subtree: true, characterData: true });
  }

  const stateObserver = new MutationObserver(syncState);
  stateObserver.observe(button, { attributes: true, attributeFilter: ["class", "disabled", "aria-label"] });
  syncState();

  button.addEventListener("pointerenter", function () {
    shell.classList.add("is-hovered");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(1);
  });

  button.addEventListener("pointerleave", function () {
    shell.classList.remove("is-hovered", "is-pressed");
    if (shaderMount && shaderMount.setSpeed) shaderMount.setSpeed(0.6);
  });

  button.addEventListener("pointerdown", function () {
    shell.classList.add("is-pressed");
  });

  function releasePress() {
    shell.classList.remove("is-pressed");
  }

  button.addEventListener("pointerup", releasePress);
  button.addEventListener("pointercancel", releasePress);

  button.addEventListener("click", function (event) {
    if (button.disabled) return;

    if (shaderMount && shaderMount.setSpeed) {
      shaderMount.setSpeed(2.4);
      window.setTimeout(function () {
        if (!shaderMount || !shaderMount.setSpeed) return;
        shaderMount.setSpeed(shell.classList.contains("is-hovered") ? 1 : 0.6);
      }, 300);
    }

    const rect = button.getBoundingClientRect();
    const ripple = createNode("vexa-lm-ripple");
    const clientX = Number(event.clientX);
    const clientY = Number(event.clientY);
    ripple.style.left = String(Number.isFinite(clientX) && clientX > 0 ? clientX - rect.left : rect.width / 2) + "px";
    ripple.style.top = String(Number.isFinite(clientY) && clientY > 0 ? clientY - rect.top : rect.height / 2) + "px";
    button.appendChild(ripple);
    window.setTimeout(function () { ripple.remove(); }, 600);
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(function () {
      const height = buttonHeight(button);
      const next = String(Math.max(1, Math.round(height))) + "px";
      if (shell.style.height !== next) shell.style.height = next;
    });
    resizeObserver.observe(shell);
  }

  window.addEventListener("pagehide", function () {
    try { stateObserver.disconnect(); } catch (error) {}
    if (shaderMount && typeof shaderMount.destroy === "function") shaderMount.destroy();
    shaderMount = null;
  }, { once: true });
}

function scan() {
  installStyles();
  TARGETS.forEach(function (target) {
    const button = document.getElementById(target.id);
    if (button) decorate(button, target);
  });
}

let scanQueued = false;
function scheduleScan() {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(function () {
    scanQueued = false;
    scan();
  });
}

function addedNodeContainsTarget(node) {
  if (!(node instanceof Element)) return false;
  if (node.matches(TARGET_SELECTOR)) return true;
  return Boolean(node.querySelector(TARGET_SELECTOR));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
else scan();

const observer = new MutationObserver(function (mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (addedNodeContainsTarget(node)) {
        scheduleScan();
        return;
      }
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
`;
