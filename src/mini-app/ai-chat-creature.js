export const AI_CHAT_CREATURE_JS = `(function () {
  "use strict";

  const creatureId = "aiChatCreature";

  if (document.getElementById(creatureId)) return;

  const style = document.createElement("style");
  style.textContent = [
    ".ai-chat-creature {",
    "  position: absolute;",
    "  z-index: 4;",
    "  top: calc(12px + env(safe-area-inset-top));",
    "  left: 15px;",
    "  width: 52px;",
    "  height: 52px;",
    "  pointer-events: none;",
    "  opacity: 0;",
    "  transform: translate3d(-5px, -3px, 0) scale(.84);",
    "  filter: drop-shadow(0 7px 14px rgba(54, 12, 34, .32));",
    "  animation: aiCreatureArrive .82s cubic-bezier(.16, 1, .3, 1) .14s forwards;",
    "}",
    ".ai-chat-creature canvas {",
    "  display: block;",
    "  width: 52px;",
    "  height: 52px;",
    "}",
    "html.has-ai-chat-creature .ai-chat-messages {",
    "  padding-top: calc(80px + env(safe-area-inset-top));",
    "}",
    "@keyframes aiCreatureArrive {",
    "  0% { opacity: 0; transform: translate3d(-5px, -3px, 0) scale(.84); }",
    "  68% { opacity: 1; transform: translate3d(0, 1px, 0) scale(1.035); }",
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
  host.appendChild(canvas);

  const page = document.getElementById("aiChatPage");
  if (!page) return;

  page.appendChild(host);
  document.documentElement.classList.add("has-ai-chat-creature");

  const context = canvas.getContext("2d");
  if (!context) return;

  const size = 52;
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
  let nextBlinkAt = lastTime + 1900 + Math.random() * 1500;
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

  function blinkAmount(now) {
    if (blinkStartedAt < 0 && now >= nextBlinkAt) {
      blinkStartedAt = now;
    }

    if (blinkStartedAt < 0) return 0;

    const progress = (now - blinkStartedAt) / 180;

    if (progress >= 1) {
      blinkStartedAt = -1;
      nextBlinkAt = now + 2700 + Math.random() * 2500;
      return 0;
    }

    return Math.sin(progress * Math.PI);
  }

  function updateAutomaticGaze(seconds, now) {
    if (now < pointerUntil) return;

    targetGazeX =
      Math.sin(seconds * 0.57) * 0.72 +
      Math.sin(seconds * 0.21 + 1.4) * 0.15;
    targetGazeY =
      Math.sin(seconds * 0.39 + 2.3) * 0.42;
  }

  function drawEye(centerX, centerY, blink) {
    const width = 3.8;
    const openHeight = 8.3;
    const height = Math.max(0.75, openHeight * (1 - blink * 0.93));
    const x = centerX + gazeX * 1.35;
    const y = centerY + gazeY * 0.85;

    context.save();
    context.shadowColor = "rgba(255, 240, 244, .34)";
    context.shadowBlur = 2.8;

    const eyeGradient = context.createLinearGradient(
      x,
      y - height / 2,
      x,
      y + height / 2
    );
    eyeGradient.addColorStop(0, "rgba(255, 255, 255, .98)");
    eyeGradient.addColorStop(1, "rgba(244, 230, 234, .94)");

    context.fillStyle = eyeGradient;
    context.beginPath();
    context.roundRect(
      x - width / 2,
      y - height / 2,
      width,
      height,
      Math.min(width / 2, height / 2)
    );
    context.fill();
    context.restore();
  }

  function drawBody(centerX, centerY, radiusX, radiusY, seconds) {
    context.save();

    context.shadowColor = "rgba(218, 67, 115, .25)";
    context.shadowBlur = 7;

    const bodyGradient = context.createRadialGradient(
      centerX - radiusX * 0.34,
      centerY - radiusY * 0.4,
      radiusX * 0.08,
      centerX,
      centerY,
      radiusX * 1.08
    );
    bodyGradient.addColorStop(0, "rgba(255, 190, 197, 1)");
    bodyGradient.addColorStop(0.28, "rgba(239, 104, 133, 1)");
    bodyGradient.addColorStop(0.7, "rgba(177, 48, 96, 1)");
    bodyGradient.addColorStop(1, "rgba(83, 23, 55, 1)");

    context.fillStyle = bodyGradient;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      radiusX - 0.55,
      radiusY - 0.55,
      0,
      0,
      Math.PI * 2
    );
    context.clip();

    const topSheen = context.createRadialGradient(
      centerX - radiusX * 0.34,
      centerY - radiusY * 0.54,
      0,
      centerX - radiusX * 0.2,
      centerY - radiusY * 0.35,
      radiusX * 0.72
    );
    topSheen.addColorStop(0, "rgba(255, 255, 255, .34)");
    topSheen.addColorStop(0.42, "rgba(255, 255, 255, .09)");
    topSheen.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = topSheen;
    context.fillRect(0, 0, size, size);

    const lowerGlow = context.createRadialGradient(
      centerX,
      centerY + radiusY * 0.9,
      0,
      centerX,
      centerY + radiusY * 0.82,
      radiusX * 0.92
    );
    lowerGlow.addColorStop(0, "rgba(255, 137, 151, .5)");
    lowerGlow.addColorStop(0.36, "rgba(255, 113, 138, .16)");
    lowerGlow.addColorStop(1, "rgba(255, 113, 138, 0)");

    context.fillStyle = lowerGlow;
    context.fillRect(0, 0, size, size);

    const movingSheenX =
      centerX - radiusX * 0.52 + Math.sin(seconds * 0.68) * 1.1;
    const movingSheen = context.createLinearGradient(
      movingSheenX,
      centerY - radiusY,
      movingSheenX + radiusX * 0.75,
      centerY + radiusY
    );
    movingSheen.addColorStop(0, "rgba(255, 255, 255, .05)");
    movingSheen.addColorStop(0.5, "rgba(255, 255, 255, .015)");
    movingSheen.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = movingSheen;
    context.fillRect(0, 0, size, size);
    context.restore();

    context.strokeStyle = "rgba(255, 205, 211, .22)";
    context.lineWidth = 0.75;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.stroke();
  }

  function drawGroundGlow(centerX, centerY, radiusX) {
    context.save();
    context.globalAlpha = 0.58;
    context.filter = "blur(3px)";

    const glow = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radiusX
    );
    glow.addColorStop(0, "rgba(233, 84, 126, .42)");
    glow.addColorStop(0.5, "rgba(185, 47, 98, .16)");
    glow.addColorStop(1, "rgba(95, 22, 57, 0)");

    context.fillStyle = glow;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, 3.2, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
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

    const breathe = Math.sin(seconds * 1.85);
    const bob = Math.sin(seconds * 1.28) * 0.62;
    const centerX = size / 2 + Math.sin(seconds * 0.71) * 0.2;
    const centerY = 24.8 + bob;
    const radiusX = 19.4 + breathe * 0.24;
    const radiusY = 19.4 - breathe * 0.18;

    drawGroundGlow(centerX, centerY + radiusY + 3.8, radiusX * 0.76);
    drawBody(centerX, centerY, radiusX, radiusY, seconds);

    const blink = blinkAmount(now);
    const eyeY = centerY - 0.6;
    drawEye(centerX - 5.6, eyeY, blink);
    drawEye(centerX + 5.6, eyeY, blink);

    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function updatePointerGaze(event) {
    const bounds = canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    targetGazeX = Math.max(
      -1,
      Math.min(1, (event.clientX - centerX) / (window.innerWidth * 0.18))
    );
    targetGazeY = Math.max(
      -0.85,
      Math.min(0.85, (event.clientY - centerY) / (window.innerHeight * 0.18))
    );
    pointerUntil = performance.now() + 1350;
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
