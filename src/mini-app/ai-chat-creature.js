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

  const context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true
  });
  if (!context) return;

  const size = 52;
  const reducedMotion = Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const gazePositions = [
    [-0.9, -0.42],
    [0.84, -0.34],
    [-0.72, 0.26],
    [0.76, 0.35],
    [0.06, -0.52],
    [-0.12, 0.12],
    [0.52, -0.08]
  ];

  let animationFrame = 0;
  let lastTime = performance.now();
  let gazeX = 0;
  let gazeY = 0;
  let targetGazeX = 0;
  let targetGazeY = 0;
  let nextGazeAt = lastTime + 420;
  let pointerUntil = 0;
  let nextBlinkAt = lastTime + 1600 + Math.random() * 1200;
  let blinkStartedAt = -1;
  let secondBlinkAt = -1;

  function resizeCanvas() {
    const dpr = Math.min(4, (window.devicePixelRatio || 1) * 1.5);
    const pixels = Math.round(size * dpr);

    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
  }

  function chooseNextGaze(now) {
    const choice = gazePositions[
      Math.floor(Math.random() * gazePositions.length)
    ];

    targetGazeX = choice[0] + (Math.random() - 0.5) * 0.12;
    targetGazeY = choice[1] + (Math.random() - 0.5) * 0.1;
    nextGazeAt = now + 620 + Math.random() * 1050;
  }

  function updateAutomaticGaze(now) {
    if (now < pointerUntil) return;
    if (now >= nextGazeAt) chooseNextGaze(now);
  }

  function blinkAmount(now) {
    if (blinkStartedAt < 0 && secondBlinkAt > 0 && now >= secondBlinkAt) {
      blinkStartedAt = now;
      secondBlinkAt = -1;
    }

    if (blinkStartedAt < 0 && now >= nextBlinkAt) {
      blinkStartedAt = now;

      if (Math.random() < 0.24) {
        secondBlinkAt = now + 255;
      }
    }

    if (blinkStartedAt < 0) return 0;

    const progress = (now - blinkStartedAt) / 165;

    if (progress >= 1) {
      blinkStartedAt = -1;

      if (secondBlinkAt < 0) {
        nextBlinkAt = now + 2200 + Math.random() * 2600;
      }

      return 0;
    }

    return Math.sin(progress * Math.PI);
  }

  function orbPath(centerX, centerY, radiusX, radiusY) {
    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      radiusX,
      radiusY,
      0,
      0,
      Math.PI * 2
    );
  }

  function drawEye(centerX, centerY, blink, tilt) {
    const width = 3.75;
    const openHeight = 8.35;
    const height = Math.max(0.72, openHeight * (1 - blink * 0.94));
    const x = centerX + gazeX * 2.05;
    const y = centerY + gazeY * 1.45;

    context.save();
    context.translate(x, y);
    context.rotate(tilt);

    const eyeGradient = context.createLinearGradient(
      0,
      -height / 2,
      0,
      height / 2
    );
    eyeGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    eyeGradient.addColorStop(0.62, "rgba(244, 239, 249, .98)");
    eyeGradient.addColorStop(1, "rgba(222, 211, 231, .96)");

    context.fillStyle = eyeGradient;
    context.beginPath();
    context.roundRect(
      -width / 2,
      -height / 2,
      width,
      height,
      Math.min(width / 2, height / 2)
    );
    context.fill();

    if (height > 2.4) {
      const eyeSheen = context.createLinearGradient(
        -width / 2,
        0,
        width / 2,
        0
      );
      eyeSheen.addColorStop(0, "rgba(255, 255, 255, .12)");
      eyeSheen.addColorStop(0.45, "rgba(255, 255, 255, .72)");
      eyeSheen.addColorStop(1, "rgba(255, 255, 255, .08)");

      context.fillStyle = eyeSheen;
      context.beginPath();
      context.roundRect(
        -width * 0.34,
        -height * 0.4,
        width * 0.68,
        height * 0.8,
        width * 0.34
      );
      context.fill();
    }

    context.restore();
  }

  function drawOrb(centerX, centerY, radiusX, radiusY, seconds) {
    context.save();
    orbPath(centerX, centerY, radiusX, radiusY);
    context.clip();

    const base = context.createRadialGradient(
      centerX - radiusX * 0.34,
      centerY - radiusY * 0.43,
      radiusX * 0.05,
      centerX + radiusX * 0.06,
      centerY + radiusY * 0.08,
      radiusX * 1.22
    );
    base.addColorStop(0, "rgba(190, 158, 229, 1)");
    base.addColorStop(0.25, "rgba(116, 76, 166, 1)");
    base.addColorStop(0.63, "rgba(67, 37, 105, 1)");
    base.addColorStop(1, "rgba(27, 16, 45, 1)");

    context.fillStyle = base;
    context.fillRect(0, 0, size, size);

    const glassLight = context.createRadialGradient(
      centerX - radiusX * 0.38,
      centerY - radiusY * 0.58,
      0,
      centerX - radiusX * 0.25,
      centerY - radiusY * 0.42,
      radiusX * 0.76
    );
    glassLight.addColorStop(0, "rgba(255, 255, 255, .34)");
    glassLight.addColorStop(0.28, "rgba(231, 215, 250, .15)");
    glassLight.addColorStop(0.72, "rgba(221, 199, 248, .035)");
    glassLight.addColorStop(1, "rgba(221, 199, 248, 0)");

    context.fillStyle = glassLight;
    context.fillRect(0, 0, size, size);

    const lowerLight = context.createRadialGradient(
      centerX,
      centerY + radiusY * 0.92,
      0,
      centerX,
      centerY + radiusY * 0.78,
      radiusX * 0.92
    );
    lowerLight.addColorStop(0, "rgba(143, 100, 195, .46)");
    lowerLight.addColorStop(0.38, "rgba(105, 66, 151, .15)");
    lowerLight.addColorStop(1, "rgba(77, 42, 119, 0)");

    context.fillStyle = lowerLight;
    context.fillRect(0, 0, size, size);

    const innerShade = context.createRadialGradient(
      centerX,
      centerY,
      radiusX * 0.58,
      centerX,
      centerY,
      radiusX * 1.04
    );
    innerShade.addColorStop(0, "rgba(16, 8, 28, 0)");
    innerShade.addColorStop(0.78, "rgba(16, 8, 28, .08)");
    innerShade.addColorStop(1, "rgba(10, 5, 18, .38)");

    context.fillStyle = innerShade;
    context.fillRect(0, 0, size, size);

    const sheenOffset = Math.sin(seconds * 0.72) * 1.2;
    const movingSheen = context.createLinearGradient(
      centerX - radiusX + sheenOffset,
      centerY - radiusY,
      centerX + radiusX * 0.5 + sheenOffset,
      centerY + radiusY
    );
    movingSheen.addColorStop(0, "rgba(255, 255, 255, .08)");
    movingSheen.addColorStop(0.36, "rgba(255, 255, 255, .02)");
    movingSheen.addColorStop(0.62, "rgba(255, 255, 255, 0)");
    movingSheen.addColorStop(1, "rgba(255, 255, 255, .025)");

    context.fillStyle = movingSheen;
    context.fillRect(0, 0, size, size);
    context.restore();

    context.save();
    orbPath(
      centerX,
      centerY,
      radiusX - 0.45,
      radiusY - 0.45
    );
    context.strokeStyle = "rgba(213, 190, 240, .2)";
    context.lineWidth = 0.7;
    context.stroke();
    context.restore();
  }

  function draw(now) {
    resizeCanvas();

    const elapsed = Math.min(40, now - lastTime);
    const gazeEase = 1 - Math.pow(0.7, elapsed / 16.67);
    const seconds = now / 1000;

    lastTime = now;
    updateAutomaticGaze(now);
    gazeX += (targetGazeX - gazeX) * gazeEase;
    gazeY += (targetGazeY - gazeY) * gazeEase;

    context.clearRect(0, 0, size, size);

    const breathe = Math.sin(seconds * 2.05);
    const sway =
      Math.sin(seconds * 1.16) * 0.92 +
      Math.sin(seconds * 2.47 + 0.8) * 0.24;
    const bob =
      Math.sin(seconds * 1.48 + 0.35) * 1.02 +
      Math.sin(seconds * 2.72) * 0.18;

    const centerX = size / 2 + sway;
    const centerY = size / 2 + bob;
    const radiusX = 19.15 + breathe * 0.38;
    const radiusY = 19.15 - breathe * 0.3;
    const faceTilt = Math.sin(seconds * 1.16) * 0.024;

    drawOrb(centerX, centerY, radiusX, radiusY, seconds);

    const blink = blinkAmount(now);
    const eyeY = centerY - 0.55 + breathe * 0.08;

    drawEye(centerX - 5.6, eyeY, blink, faceTilt);
    drawEye(centerX + 5.6, eyeY, blink, faceTilt);

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
      Math.min(1, (event.clientX - centerX) / (window.innerWidth * 0.16))
    );
    targetGazeY = Math.max(
      -0.88,
      Math.min(0.88, (event.clientY - centerY) / (window.innerHeight * 0.16))
    );
    pointerUntil = performance.now() + 1200;
    nextGazeAt = pointerUntil + 260;
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
  chooseNextGaze(performance.now());
  draw(performance.now());
})();`;
