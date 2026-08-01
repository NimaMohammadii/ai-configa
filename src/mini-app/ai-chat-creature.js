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
  let creatureState = "idle";
  let stateUntil = 0;
  let happyStartedAt = -1;
  let touchSquishStartedAt = -1;
  let journey = null;
  let journeyStarted = false;
  let profileAmount = 0;


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
    const searching = creatureState === "searching";
    const choice = gazePositions[
      Math.floor(Math.random() * gazePositions.length)
    ];

    targetGazeX = choice[0] + (Math.random() - 0.5) * 0.12;
    targetGazeY = choice[1] + (Math.random() - 0.5) * 0.1;
    nextGazeAt = now + (
      searching
        ? 260 + Math.random() * 410
        : 620 + Math.random() * 1050
    );
  }

  function updateAutomaticGaze(now) {
    if (stateUntil > 0 && now >= stateUntil) {
      creatureState = "idle";
      stateUntil = 0;
      nextGazeAt = now;
    }

    if (journey || now < pointerUntil) return;

    if (creatureState === "thinking") {
      targetGazeX = Math.sin(now / 920) * 0.24;
      targetGazeY = -0.56;
      return;
    }

    if (creatureState === "happy") {
      targetGazeX = 0;
      targetGazeY = 0.18;
      return;
    }

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

  function drawEye(
    centerX,
    centerY,
    blink,
    tilt,
    widthScale,
    opacity
  ) {
    const width = 4.15 * widthScale;
    const openHeight = 8.75;
    const height = Math.max(0.72, openHeight * (1 - blink * 0.94));
    const x = centerX + gazeX * 2.05;
    const y = centerY + gazeY * 1.45;

    context.save();
    context.globalAlpha = opacity;
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
      centerX - radiusX * 0.3,
      centerY - radiusY * 0.38,
      radiusX * 0.03,
      centerX + radiusX * 0.12,
      centerY + radiusY * 0.16,
      radiusX * 1.34
    );
    base.addColorStop(0, "rgba(190, 160, 226, 1)");
    base.addColorStop(0.24, "rgba(126, 84, 174, 1)");
    base.addColorStop(0.54, "rgba(77, 45, 119, 1)");
    base.addColorStop(0.78, "rgba(49, 27, 79, 1)");
    base.addColorStop(1, "rgba(20, 12, 34, 1)");

    context.fillStyle = base;
    context.fillRect(0, 0, size, size);

    const upperVolume = context.createRadialGradient(
      centerX - radiusX * 0.35,
      centerY - radiusY * 0.5,
      0,
      centerX - radiusX * 0.2,
      centerY - radiusY * 0.34,
      radiusX * 0.82
    );
    upperVolume.addColorStop(0, "rgba(255, 255, 255, .31)");
    upperVolume.addColorStop(0.22, "rgba(229, 211, 249, .16)");
    upperVolume.addColorStop(0.58, "rgba(203, 175, 235, .045)");
    upperVolume.addColorStop(1, "rgba(203, 175, 235, 0)");

    context.fillStyle = upperVolume;
    context.fillRect(0, 0, size, size);

    const centerVolume = context.createRadialGradient(
      centerX - radiusX * 0.12,
      centerY - radiusY * 0.12,
      0,
      centerX,
      centerY,
      radiusX * 0.82
    );
    centerVolume.addColorStop(0, "rgba(165, 121, 207, .16)");
    centerVolume.addColorStop(0.48, "rgba(127, 82, 172, .07)");
    centerVolume.addColorStop(1, "rgba(89, 48, 132, 0)");

    context.fillStyle = centerVolume;
    context.fillRect(0, 0, size, size);

    const lowerReflection = context.createRadialGradient(
      centerX,
      centerY + radiusY * 0.94,
      0,
      centerX,
      centerY + radiusY * 0.8,
      radiusX * 0.9
    );
    lowerReflection.addColorStop(0, "rgba(155, 111, 199, .42)");
    lowerReflection.addColorStop(0.3, "rgba(118, 75, 163, .17)");
    lowerReflection.addColorStop(0.68, "rgba(88, 49, 130, .035)");
    lowerReflection.addColorStop(1, "rgba(72, 39, 110, 0)");

    context.fillStyle = lowerReflection;
    context.fillRect(0, 0, size, size);

    const sideShade = context.createLinearGradient(
      centerX - radiusX,
      centerY,
      centerX + radiusX,
      centerY
    );
    sideShade.addColorStop(0, "rgba(16, 8, 29, .12)");
    sideShade.addColorStop(0.24, "rgba(16, 8, 29, 0)");
    sideShade.addColorStop(0.64, "rgba(16, 8, 29, .025)");
    sideShade.addColorStop(1, "rgba(10, 5, 19, .27)");

    context.fillStyle = sideShade;
    context.fillRect(0, 0, size, size);

    const edgeDepth = context.createRadialGradient(
      centerX - radiusX * 0.08,
      centerY - radiusY * 0.1,
      radiusX * 0.48,
      centerX,
      centerY,
      radiusX * 1.03
    );
    edgeDepth.addColorStop(0, "rgba(9, 4, 17, 0)");
    edgeDepth.addColorStop(0.72, "rgba(9, 4, 17, .025)");
    edgeDepth.addColorStop(0.9, "rgba(9, 4, 17, .15)");
    edgeDepth.addColorStop(1, "rgba(7, 3, 13, .42)");

    context.fillStyle = edgeDepth;
    context.fillRect(0, 0, size, size);

    const sheenOffset = Math.sin(seconds * 0.72) * 0.85;
    const movingSheen = context.createLinearGradient(
      centerX - radiusX * 0.85 + sheenOffset,
      centerY - radiusY,
      centerX + radiusX * 0.38 + sheenOffset,
      centerY + radiusY
    );
    movingSheen.addColorStop(0, "rgba(255, 255, 255, .075)");
    movingSheen.addColorStop(0.34, "rgba(255, 255, 255, .022)");
    movingSheen.addColorStop(0.6, "rgba(255, 255, 255, 0)");
    movingSheen.addColorStop(1, "rgba(255, 255, 255, .016)");

    context.fillStyle = movingSheen;
    context.fillRect(0, 0, size, size);

    context.save();
    context.globalAlpha = 0.48;
    context.filter = "blur(1.1px)";
    context.fillStyle = "rgba(255, 255, 255, .16)";
    context.beginPath();
    context.ellipse(
      centerX - radiusX * 0.34,
      centerY - radiusY * 0.52,
      radiusX * 0.22,
      radiusY * 0.09,
      -0.52,
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();

    context.restore();
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function mix(from, to, amount) {
    return from + (to - from) * amount;
  }

  function smoothStep(value) {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function updateJourney(now) {
    if (!journey) {
      profileAmount += (0 - profileAmount) * 0.16;
      return;
    }

    const duration = 4300;
    const elapsed = now - journey.startedAt;

    if (elapsed < 0) return;

    const time = clamp(elapsed / duration, 0, 1);
    let x = 0;
    let y = 0;
    let scaleX = 1;
    let scaleY = 1;
    let rotation = 0;

    if (time < 0.3) {
      const progress = smoothStep(time / 0.3);
      const stretch = Math.sin(progress * Math.PI);

      x = journey.x * progress;
      y = journey.y * progress - Math.sin(progress * Math.PI) * 7;
      scaleX = 1 + stretch * 0.18;
      scaleY = 1 - stretch * 0.11;
      rotation = stretch * 0.055;
      profileAmount = mix(0, 1, smoothStep(progress * 1.35));
      targetGazeX = 0.86;
      targetGazeY = -0.08;
    } else if (time < 0.47) {
      const progress = smoothStep((time - 0.3) / 0.17);

      x = journey.x;
      y = journey.y + mix(-4.5, -1.5, progress);
      scaleX = 1 - Math.sin(progress * Math.PI) * 0.035;
      scaleY = 1 + Math.sin(progress * Math.PI) * 0.045;
      profileAmount = 1;
      targetGazeX = 0.62;
      targetGazeY = mix(-0.78, -0.3, progress);
    } else if (time < 0.61) {
      const progress = smoothStep((time - 0.47) / 0.14);

      x = journey.x;
      y = journey.y + mix(-1.5, 4.5, progress);
      scaleX = 1 + Math.sin(progress * Math.PI) * 0.025;
      scaleY = 1 - Math.sin(progress * Math.PI) * 0.02;
      profileAmount = 1;
      targetGazeX = 0.58;
      targetGazeY = mix(-0.3, 0.78, progress);
    } else if (time < 0.73) {
      const progress = smoothStep((time - 0.61) / 0.12);

      x = journey.x - Math.sin(progress * Math.PI) * 1.8;
      y = journey.y + mix(4.5, 0, progress);
      scaleX = 1;
      scaleY = 1;
      profileAmount = mix(1, 0, progress);
      targetGazeX = mix(0.58, 0, progress);
      targetGazeY = mix(0.78, 0, progress);
    } else if (time < 0.81) {
      const progress = smoothStep((time - 0.73) / 0.08);

      x = journey.x;
      y = journey.y;
      scaleX = mix(1, 0.88, Math.sin(progress * Math.PI));
      scaleY = mix(1, 1.1, Math.sin(progress * Math.PI));
      rotation = mix(0, -0.045, progress);
      profileAmount = mix(0, -1, progress);
      targetGazeX = mix(0, -0.82, progress);
      targetGazeY = 0;
    } else {
      const progress = smoothStep((time - 0.81) / 0.19);
      const stretch = Math.sin(progress * Math.PI);

      x = journey.x * (1 - progress);
      y = journey.y * (1 - progress) - stretch * 6;
      scaleX = 1 + stretch * 0.15;
      scaleY = 1 - stretch * 0.09;
      rotation = -stretch * 0.052;
      profileAmount = mix(-1, 0, smoothStep(clamp((progress - 0.62) / 0.38, 0, 1)));
      targetGazeX = mix(-0.82, 0, progress);
      targetGazeY = -0.05;
    }

    host.style.transform =
      "translate3d(" + x.toFixed(2) + "px," +
      y.toFixed(2) + "px,0) " +
      "rotate(" + rotation.toFixed(4) + "rad) " +
      "scale(" + scaleX.toFixed(3) + "," + scaleY.toFixed(3) + ")";

    if (time >= 1) {
      journey = null;
      profileAmount = 0;
      host.style.transform = "none";
      targetGazeX = 0;
      targetGazeY = 0;
      nextGazeAt = now + 520;
    }
  }

  function touchSquish(now) {
    if (touchSquishStartedAt < 0) return 0;

    const progress = (now - touchSquishStartedAt) / 430;

    if (progress >= 1) {
      touchSquishStartedAt = -1;
      return 0;
    }

    return Math.sin(progress * Math.PI) * (1 - progress * 0.34);
  }

  function draw(now) {
    resizeCanvas();
    updateJourney(now);

    const elapsed = Math.min(40, now - lastTime);
    const gazeEase = 1 - Math.pow(0.7, elapsed / 16.67);
    const seconds = now / 1000;

    lastTime = now;
    updateAutomaticGaze(now);
    gazeX += (targetGazeX - gazeX) * gazeEase;
    gazeY += (targetGazeY - gazeY) * gazeEase;

    context.clearRect(0, 0, size, size);

    const breathe = Math.sin(seconds * 2.05);
    const thinkingPuff = creatureState === "thinking" ? 0.5 : 0;
    const searchingEnergy = creatureState === "searching" ? 0.42 : 0;
    const squish = touchSquish(now);

    const happyProgress = happyStartedAt < 0
      ? 1
      : clamp((now - happyStartedAt) / 940, 0, 1);
    const happyBounce = creatureState === "happy"
      ? -Math.abs(Math.sin(happyProgress * Math.PI * 2)) *
        (1 - happyProgress) * 3.2
      : 0;

    const sway =
      Math.sin(seconds * (1.16 + searchingEnergy)) * (0.92 + searchingEnergy) +
      Math.sin(seconds * 2.47 + 0.8) * 0.24;
    const bob =
      Math.sin(seconds * (1.48 + searchingEnergy)) * (1.02 + searchingEnergy) +
      Math.sin(seconds * 2.72) * 0.18 +
      happyBounce;

    const centerX = size / 2 + sway;
    const centerY = size / 2 + bob;
    const radiusX =
      19.15 +
      breathe * (0.38 + thinkingPuff) +
      squish * 1.45;
    const radiusY =
      19.15 -
      breathe * (0.3 + thinkingPuff * 0.55) -
      squish * 1.15;
    const faceTilt = Math.sin(seconds * 1.16) * 0.024;

    drawOrb(centerX, centerY, radiusX, radiusY, seconds);

    const blink = blinkAmount(now);
    const eyeY = centerY - 0.55 + breathe * 0.08;
    const profile = clamp(profileAmount, -1, 1);
    const profileStrength = Math.abs(profile);

    const leftOffset = profile >= 0
      ? mix(-5, 1.45, profileStrength)
      : mix(-5, -5.8, profileStrength);
    const rightOffset = profile >= 0
      ? mix(5, 5.8, profileStrength)
      : mix(5, -1.45, profileStrength);

    const leftScale = profile >= 0
      ? mix(1, 0.58, profileStrength)
      : 1;
    const rightScale = profile >= 0
      ? 1
      : mix(1, 0.58, profileStrength);

    const leftOpacity = profile >= 0
      ? mix(1, 0.72, profileStrength)
      : 1;
    const rightOpacity = profile >= 0
      ? 1
      : mix(1, 0.72, profileStrength);

    drawEye(
      centerX + leftOffset,
      eyeY,
      blink,
      faceTilt,
      leftScale,
      leftOpacity
    );
    drawEye(
      centerX + rightOffset,
      eyeY,
      blink,
      faceTilt,
      rightScale,
      rightOpacity
    );

    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function updatePointerGaze(event) {
    const bounds = canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const now = performance.now();

    targetGazeX = Math.max(
      -1,
      Math.min(1, (event.clientX - centerX) / (window.innerWidth * 0.16))
    );
    targetGazeY = Math.max(
      -0.88,
      Math.min(0.88, (event.clientY - centerY) / (window.innerHeight * 0.16))
    );
    pointerUntil = now + 1200;
    nextGazeAt = pointerUntil + 260;

    const padding = 12;
    const touchesCreature =
      event.clientX >= bounds.left - padding &&
      event.clientX <= bounds.right + padding &&
      event.clientY >= bounds.top - padding &&
      event.clientY <= bounds.bottom + padding;

    if (event.type === "pointerdown" && touchesCreature) {
      touchSquishStartedAt = now;
    }
  }

  function setCreatureState(state) {
    const next = ["thinking", "searching", "happy"].includes(state)
      ? state
      : "idle";
    const now = performance.now();

    creatureState = next;
    nextGazeAt = now;

    if (next === "happy") {
      happyStartedAt = now;
      stateUntil = now + 980;
      touchSquishStartedAt = now;
    } else {
      happyStartedAt = -1;
      stateUntil = 0;
    }
  }

  function visitMessage(messageElement) {
    if (
      reducedMotion ||
      journeyStarted ||
      !messageElement ||
      !messageElement.getBoundingClientRect
    ) {
      return;
    }

    const bubble =
      messageElement.querySelector(".ai-chat-message-content") ||
      messageElement;
    const origin = host.getBoundingClientRect();
    const target = bubble.getBoundingClientRect();

    const targetLeft = clamp(
      target.left - size - 8,
      8,
      window.innerWidth - size - 8
    );
    const targetTop = clamp(
      target.top + Math.min(target.height / 2, 28) - size / 2,
      8,
      window.innerHeight - size - 72
    );

    journeyStarted = true;
    host.style.animation = "none";
    host.style.opacity = "1";
    host.style.transform = "none";

    journey = {
      startedAt: performance.now() + 90,
      x: targetLeft - origin.left,
      y: targetTop - origin.top
    };
  }

  function resume() {
    cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    draw(lastTime);
  }

  window.aiChatCreatureSetState = setCreatureState;
  window.aiChatCreatureVisitMessage = visitMessage;

  window.addEventListener("pointermove", updatePointerGaze, { passive: true });
  window.addEventListener("pointerdown", updatePointerGaze, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !reducedMotion) resume();
  });

  resizeCanvas();
  chooseNextGaze(performance.now());
  draw(performance.now());
})();`;
