export const AI_CHAT_CREATURE_JS = `(function () {
  "use strict";

  const creatureId = "aiChatCreature";
  const canvasId = "aiChatCreatureCanvas";

  if (document.getElementById(creatureId)) return;

  const style = document.createElement("style");
  style.textContent = [
    ".ai-chat-creature {",
    "  position: absolute;",
    "  z-index: 4;",
    "  top: calc(11px + env(safe-area-inset-top));",
    "  left: 14px;",
    "  width: 54px;",
    "  height: 54px;",
    "  pointer-events: none;",
    "  opacity: 0;",
    "  transform: translate3d(-7px, -4px, 0) scale(.86);",
    "  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .34));",
    "  animation: aiCreatureArrive .82s cubic-bezier(.16, 1, .3, 1) .14s forwards;",
    "}",
    ".ai-chat-creature canvas {",
    "  display: block;",
    "  width: 54px;",
    "  height: 54px;",
    "}",
    "html.has-ai-chat-creature .ai-chat-messages {",
    "  padding-top: calc(82px + env(safe-area-inset-top));",
    "}",
    "@keyframes aiCreatureArrive {",
    "  0% { opacity: 0; transform: translate3d(-7px, -4px, 0) scale(.86); }",
    "  68% { opacity: 1; transform: translate3d(1px, 1px, 0) scale(1.035); }",
    "  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .ai-chat-creature {",
    "    opacity: 1;",
    "    transform: none;",
    "    animation: none;",
    "  }",
    "}"
  ].join("\\n");
  document.head.appendChild(style);

  const host = document.createElement("div");
  host.id = creatureId;
  host.className = "ai-chat-creature";
  host.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  canvas.id = canvasId;
  host.appendChild(canvas);

  const page = document.getElementById("aiChatPage");
  if (!page) return;

  page.appendChild(host);
  document.documentElement.classList.add("has-ai-chat-creature");

  const context = canvas.getContext("2d");
  if (!context) return;

  const size = 54;
  const reducedMotion = Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  let animationFrame = 0;
  let lastTime = performance.now();
  let gazeX = 0;
  let gazeY = 0;
  let targetGazeX = 0;
  let targetGazeY = 0;
  let pointerUntil = 0;
  let nextBlinkAt = lastTime + 1800 + Math.random() * 1700;
  let blinkStartedAt = -1;

  function resizeCanvas() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const pixels = Math.round(size * dpr);

    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundedBlobPath(centerX, centerY, width, height, time) {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const top = centerY - height / 2;
    const bottom = centerY + height / 2;
    const wobble = Math.sin(time * 1.45) * 0.65;

    context.beginPath();
    context.moveTo(centerX, top - wobble * 0.35);
    context.bezierCurveTo(
      right - width * 0.16,
      top - 0.8,
      right + 0.7 + wobble,
      centerY - height * 0.16,
      right - wobble * 0.2,
      centerY + height * 0.1
    );
    context.bezierCurveTo(
      right - 0.6,
      bottom - height * 0.13,
      centerX + width * 0.18,
      bottom + 0.8,
      centerX,
      bottom + wobble * 0.25
    );
    context.bezierCurveTo(
      left + width * 0.16,
      bottom + 0.8,
      left - 0.7 - wobble,
      centerY + height * 0.14,
      left + wobble * 0.2,
      centerY - height * 0.1
    );
    context.bezierCurveTo(
      left + 0.6,
      top + height * 0.1,
      centerX - width * 0.18,
      top - 0.8,
      centerX,
      top - wobble * 0.35
    );
    context.closePath();
  }

  function blinkAmount(now) {
    if (blinkStartedAt < 0 && now >= nextBlinkAt) {
      blinkStartedAt = now;
    }

    if (blinkStartedAt < 0) return 0;

    const progress = (now - blinkStartedAt) / 170;

    if (progress >= 1) {
      blinkStartedAt = -1;
      nextBlinkAt = now + 2500 + Math.random() * 2700;
      return 0;
    }

    return Math.sin(progress * Math.PI);
  }

  function updateAutomaticGaze(seconds, now) {
    if (now < pointerUntil) return;

    targetGazeX =
      Math.sin(seconds * 0.63) * 0.62 +
      Math.sin(seconds * 0.19 + 1.3) * 0.18;
    targetGazeY =
      Math.sin(seconds * 0.41 + 2.1) * 0.33;
  }

  function drawEye(centerX, centerY, blink, seconds) {
    const eyeWidth = 8.7;
    const eyeHeight = Math.max(0.8, 11.4 * (1 - blink * 0.94));
    const pupilX = centerX + gazeX * 1.8;
    const pupilY = centerY + gazeY * 1.45;
    const pupilRadius = 2.35;

    context.save();
    context.beginPath();
    context.ellipse(centerX, centerY, eyeWidth / 2, eyeHeight / 2, 0, 0, Math.PI * 2);
    context.clip();

    const eyeGradient = context.createLinearGradient(
      centerX,
      centerY - eyeHeight / 2,
      centerX,
      centerY + eyeHeight / 2
    );
    eyeGradient.addColorStop(0, "rgba(255, 255, 255, .98)");
    eyeGradient.addColorStop(1, "rgba(222, 218, 229, .92)");
    context.fillStyle = eyeGradient;
    context.fillRect(
      centerX - eyeWidth / 2,
      centerY - eyeHeight / 2,
      eyeWidth,
      eyeHeight
    );

    context.fillStyle = "rgba(10, 9, 12, .96)";
    context.beginPath();
    context.arc(pupilX, pupilY, pupilRadius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(255, 255, 255, .88)";
    context.beginPath();
    context.arc(
      pupilX - 0.72,
      pupilY - 0.85,
      0.62 + Math.sin(seconds * 0.8) * 0.03,
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();

    if (blink > 0.78) {
      context.strokeStyle = "rgba(12, 11, 14, .72)";
      context.lineWidth = 1.15;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(centerX - 3.3, centerY);
      context.quadraticCurveTo(centerX, centerY + 0.9, centerX + 3.3, centerY);
      context.stroke();
    }
  }

  function draw(now) {
    resizeCanvas();

    const elapsed = Math.min(40, now - lastTime);
    const ease = 1 - Math.pow(0.82, elapsed / 16.67);
    const seconds = now / 1000;

    lastTime = now;
    updateAutomaticGaze(seconds, now);
    gazeX += (targetGazeX - gazeX) * ease;
    gazeY += (targetGazeY - gazeY) * ease;

    context.clearRect(0, 0, size, size);

    const breathe = Math.sin(seconds * 2.05);
    const bob = Math.sin(seconds * 1.34) * 0.72;
    const centerX = size / 2 + Math.sin(seconds * 0.72) * 0.34;
    const centerY = size / 2 + bob;
    const bodyWidth = 42.5 + breathe * 0.7;
    const bodyHeight = 40.5 - breathe * 0.45;

    context.save();
    context.globalAlpha = 0.42;
    context.filter = "blur(4px)";
    context.fillStyle = "rgba(86, 48, 105, .32)";
    context.beginPath();
    context.ellipse(centerX, centerY + 16.5, 14.2, 3.9, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    roundedBlobPath(centerX, centerY, bodyWidth, bodyHeight, seconds);

    const bodyGradient = context.createRadialGradient(
      centerX - 8,
      centerY - 10,
      3,
      centerX,
      centerY,
      bodyWidth * 0.62
    );
    bodyGradient.addColorStop(0, "rgba(72, 68, 77, 1)");
    bodyGradient.addColorStop(0.48, "rgba(35, 32, 40, 1)");
    bodyGradient.addColorStop(1, "rgba(13, 12, 16, 1)");
    context.fillStyle = bodyGradient;
    context.fill();

    context.strokeStyle = "rgba(181, 145, 201, .18)";
    context.lineWidth = 0.9;
    context.stroke();

    context.save();
    roundedBlobPath(centerX, centerY, bodyWidth - 3, bodyHeight - 3, seconds);
    context.clip();

    const sheen = context.createLinearGradient(
      centerX - 16,
      centerY - 18,
      centerX + 12,
      centerY + 16
    );
    sheen.addColorStop(0, "rgba(255, 255, 255, .13)");
    sheen.addColorStop(0.33, "rgba(255, 255, 255, .025)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = sheen;
    context.fillRect(5, 4, 42, 42);
    context.restore();

    const blink = blinkAmount(now);
    const eyeY = centerY - 0.6 + breathe * 0.14;
    drawEye(centerX - 6.3, eyeY, blink, seconds);
    drawEye(centerX + 6.3, eyeY, blink, seconds);

    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function updatePointerGaze(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - (bounds.left + bounds.width / 2)) / window.innerWidth;
    const y = (event.clientY - (bounds.top + bounds.height / 2)) / window.innerHeight;

    targetGazeX = Math.max(-1, Math.min(1, x * 4.2));
    targetGazeY = Math.max(-0.8, Math.min(0.8, y * 4.2));
    pointerUntil = performance.now() + 1300;
  }

  function resume() {
    cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    draw(lastTime);
  }

  window.addEventListener("pointermove", updatePointerGaze, { passive: true });
  window.addEventListener("pointerdown", updatePointerGaze, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !reducedMotion) resume();
  });

  resizeCanvas();
  draw(performance.now());
})();`;
