export const AI_CHAT_CREATURE_JS = `(function () {
  "use strict";

  const creatureId = "aiChatCreature";

  if (document.getElementById(creatureId)) return;

  const style = document.createElement("style");
  style.textContent = [
    ".ai-chat-creature {",
    "  position: absolute;",
    "  z-index: 4;",
    "  top: calc(11px + env(safe-area-inset-top));",
    "  left: 14px;",
    "  width: 56px;",
    "  height: 56px;",
    "  pointer-events: none;",
    "  opacity: 0;",
    "  transform: translate3d(-4px, -3px, 0) scale(.88);",
    "  animation: aiCreatureArrive .82s cubic-bezier(.16, 1, .3, 1) .14s forwards;",
    "}",
    ".ai-chat-creature canvas {",
    "  display: block;",
    "  width: 56px;",
    "  height: 56px;",
    "}",
    "html.has-ai-chat-creature .ai-chat-messages {",
    "  padding-top: calc(84px + env(safe-area-inset-top));",
    "}",
    "@keyframes aiCreatureArrive {",
    "  0% { opacity: 0; transform: translate3d(-4px, -3px, 0) scale(.88); }",
    "  68% { opacity: 1; transform: translate3d(0, 1px, 0) scale(1.025); }",
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

  const size = 56;
  const particleCount = 380;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const reducedMotion = Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const gazePositions = [
    [-0.92, -0.4],
    [0.88, -0.36],
    [-0.74, 0.28],
    [0.78, 0.34],
    [0.08, -0.56],
    [-0.1, 0.12],
    [0.56, -0.1]
  ];

  const particles = createParticles();

  let animationFrame = 0;
  let lastTime = performance.now();
  let creatureState = "idle";
  let stateUntil = 0;
  let happyStartedAt = -1;
  let touchStartedAt = -1;
  let gazeX = 0;
  let gazeY = 0;
  let targetGazeX = 0;
  let targetGazeY = 0;
  let nextGazeAt = lastTime + 420;
  let pointerUntil = 0;
  let nextBlinkAt = lastTime + 1700 + Math.random() * 1300;
  let blinkStartedAt = -1;
  let secondBlinkAt = -1;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function mix(from, to, amount) {
    return from + (to - from) * amount;
  }

  function seededValue(index) {
    const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function createParticles() {
    const items = [];

    for (let index = 0; index < particleCount; index += 1) {
      const y = 1 - 2 * (index + 0.5) / particleCount;
      const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * goldenAngle;

      items.push({
        x: Math.cos(angle) * ringRadius,
        y,
        z: Math.sin(angle) * ringRadius,
        phase: seededValue(index) * Math.PI * 2,
        weight: 0.72 + seededValue(index + 91) * 0.48
      });
    }

    return items;
  }

  function resizeCanvas() {
    const dpr = Math.min(4, (window.devicePixelRatio || 1) * 1.65);
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
    const searching = creatureState === "searching";

    targetGazeX = choice[0] + (Math.random() - 0.5) * 0.1;
    targetGazeY = choice[1] + (Math.random() - 0.5) * 0.08;
    nextGazeAt = now + (
      searching
        ? 230 + Math.random() * 390
        : 620 + Math.random() * 1050
    );
  }

  function updateGaze(now) {
    if (stateUntil > 0 && now >= stateUntil) {
      creatureState = "idle";
      stateUntil = 0;
      nextGazeAt = now;
    }

    if (now < pointerUntil) return;

    if (creatureState === "thinking") {
      targetGazeX = Math.sin(now / 940) * 0.22;
      targetGazeY = -0.58;
      return;
    }

    if (creatureState === "happy") {
      targetGazeX = 0;
      targetGazeY = 0.16;
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
        secondBlinkAt = now + 250;
      }
    }

    if (blinkStartedAt < 0) return 0;

    const progress = (now - blinkStartedAt) / 165;

    if (progress >= 1) {
      blinkStartedAt = -1;

      if (secondBlinkAt < 0) {
        nextBlinkAt = now + 2300 + Math.random() * 2500;
      }

      return 0;
    }

    return Math.sin(progress * Math.PI);
  }

  function touchAmount(now) {
    if (touchStartedAt < 0) return 0;

    const progress = (now - touchStartedAt) / 480;

    if (progress >= 1) {
      touchStartedAt = -1;
      return 0;
    }

    return Math.sin(progress * Math.PI) * (1 - progress * 0.28);
  }

  function happyAmount(now) {
    if (happyStartedAt < 0) return 0;

    const progress = (now - happyStartedAt) / 980;

    if (progress >= 1) {
      happyStartedAt = -1;
      return 0;
    }

    return Math.sin(progress * Math.PI) * (1 - progress * 0.2);
  }

  function rotatePoint(point, yaw, pitch, twist) {
    const localYaw = yaw + point.y * twist;
    const sinYaw = Math.sin(localYaw);
    const cosYaw = Math.cos(localYaw);

    const yawX = point.x * cosYaw + point.z * sinYaw;
    const yawZ = -point.x * sinYaw + point.z * cosYaw;

    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);

    return {
      x: yawX,
      y: point.y * cosPitch - yawZ * sinPitch,
      z: point.y * sinPitch + yawZ * cosPitch
    };
  }

  function particleColor(light, alpha) {
    const amount = clamp(light, 0, 1);
    const red = Math.round(mix(68, 213, amount));
    const green = Math.round(mix(38, 181, amount));
    const blue = Math.round(mix(111, 242, amount));

    return "rgba(" + red + "," + green + "," + blue + "," + alpha + ")";
  }

  function projectParticles(seconds, centerX, centerY, radiusX, radiusY) {
    const searching = creatureState === "searching";
    const thinking = creatureState === "thinking";
    const rotationSpeed = searching ? 0.82 : thinking ? 0.31 : 0.19;
    const waveStrength = searching ? 0.055 : thinking ? 0.07 : 0.032;
    const twist = searching
      ? Math.sin(seconds * 1.7) * 0.7
      : Math.sin(seconds * 0.42) * 0.12;
    const yaw = seconds * rotationSpeed + Math.sin(seconds * 0.31) * 0.16;
    const pitch = 0.15 + Math.sin(seconds * 0.29) * 0.11;
    const projected = [];

    for (const particle of particles) {
      const rotated = rotatePoint(particle, yaw, pitch, twist);
      const wave = 1 + waveStrength * Math.sin(
        seconds * (searching ? 5.4 : 2.35) +
        particle.phase +
        rotated.y * 4.2
      );
      const perspective = 1 + rotated.z * 0.075;
      const depth = (rotated.z + 1) / 2;
      const rim = Math.pow(1 - Math.abs(rotated.z), 5);
      const light = clamp(
        0.2 +
        depth * 0.58 +
        (-rotated.x - rotated.y) * 0.11 +
        rim * 0.13,
        0,
        1
      );
      const alpha = clamp(
        0.14 + depth * 0.77 + rim * 0.08,
        0.12,
        0.98
      );
      const dotRadius = (
        0.24 +
        depth * 0.72 +
        rim * 0.11
      ) * particle.weight;

      projected.push({
        x: centerX + rotated.x * radiusX * wave * perspective,
        y: centerY - rotated.y * radiusY * wave * perspective,
        z: rotated.z,
        light,
        alpha,
        radius: dotRadius
      });
    }

    projected.sort(function (first, second) {
      return first.z - second.z;
    });

    return projected;
  }

  function drawParticleGlow(projected) {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.filter = "blur(.75px)";

    for (const particle of projected) {
      if (particle.light < 0.7 || particle.z < 0.05) continue;

      context.fillStyle = particleColor(
        particle.light,
        particle.alpha * 0.16
      );
      context.beginPath();
      context.arc(
        particle.x,
        particle.y,
        particle.radius * 2.45,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    context.restore();
  }

  function drawParticleCores(projected) {
    context.save();

    for (const particle of projected) {
      context.fillStyle = particleColor(
        particle.light,
        particle.alpha
      );
      context.beginPath();
      context.arc(
        particle.x,
        particle.y,
        Math.max(0.18, particle.radius),
        0,
        Math.PI * 2
      );
      context.fill();

      if (particle.light > 0.86 && particle.z > 0.25) {
        context.fillStyle = "rgba(242, 227, 255, " +
          (particle.alpha * 0.5) + ")";
        context.beginPath();
        context.arc(
          particle.x - particle.radius * 0.18,
          particle.y - particle.radius * 0.2,
          Math.max(0.12, particle.radius * 0.32),
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }

    context.restore();
  }

  function clearEyeSpace(centerX, centerY, width, height) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0, 0, 0, .94)";
    context.beginPath();
    context.roundRect(
      centerX - width / 2,
      centerY - height / 2,
      width,
      height,
      width / 2
    );
    context.fill();
    context.restore();
  }

  function drawEye(centerX, centerY, blink) {
    const width = 4.15;
    const openHeight = 8.7;
    const height = Math.max(0.7, openHeight * (1 - blink * 0.94));
    const x = centerX + gazeX * 1.85;
    const y = centerY + gazeY * 1.25;

    clearEyeSpace(x, y, width + 1.65, openHeight + 1.8);

    const gradient = context.createLinearGradient(
      x,
      y - height / 2,
      x,
      y + height / 2
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.58, "rgba(246, 240, 251, .99)");
    gradient.addColorStop(1, "rgba(216, 203, 226, .97)");

    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(
      x - width / 2,
      y - height / 2,
      width,
      height,
      Math.min(width / 2, height / 2)
    );
    context.fill();

    if (height > 2.2) {
      context.fillStyle = "rgba(255, 255, 255, .55)";
      context.beginPath();
      context.roundRect(
        x - width * 0.22,
        y - height * 0.38,
        width * 0.44,
        height * 0.45,
        width * 0.2
      );
      context.fill();
    }
  }

  function draw(now) {
    resizeCanvas();

    const elapsed = Math.min(40, now - lastTime);
    const gazeEase = 1 - Math.pow(0.7, elapsed / 16.67);
    const seconds = now / 1000;

    lastTime = now;
    updateGaze(now);
    gazeX += (targetGazeX - gazeX) * gazeEase;
    gazeY += (targetGazeY - gazeY) * gazeEase;

    context.clearRect(0, 0, size, size);

    const searching = creatureState === "searching";
    const thinking = creatureState === "thinking";
    const touch = touchAmount(now);
    const happy = happyAmount(now);
    const breathe = Math.sin(seconds * (thinking ? 2.6 : 1.85));
    const energy = searching ? 0.52 : thinking ? 0.28 : 0;

    const centerX =
      size / 2 +
      Math.sin(seconds * (1.12 + energy)) * (0.72 + energy * 0.5);
    const centerY =
      size / 2 +
      Math.sin(seconds * (1.38 + energy)) * (0.78 + energy * 0.42) -
      happy * 1.9;

    const pulse = breathe * (thinking ? 0.68 : 0.32);
    const radiusX =
      19.7 +
      pulse +
      touch * 1.45 +
      happy * 0.75;
    const radiusY =
      19.7 -
      pulse * 0.55 -
      touch * 1.05 +
      happy * 0.32;

    const projected = projectParticles(
      seconds,
      centerX,
      centerY,
      radiusX,
      radiusY
    );

    drawParticleGlow(projected);
    drawParticleCores(projected);

    const blink = blinkAmount(now);
    const eyeY = centerY - 0.55 + breathe * 0.06;

    drawEye(centerX - 5.05, eyeY, blink);
    drawEye(centerX + 5.05, eyeY, blink);

    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function updatePointerGaze(event) {
    const bounds = canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const now = performance.now();

    targetGazeX = clamp(
      (event.clientX - centerX) / (window.innerWidth * 0.16),
      -1,
      1
    );
    targetGazeY = clamp(
      (event.clientY - centerY) / (window.innerHeight * 0.16),
      -0.88,
      0.88
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
      touchStartedAt = now;
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
      touchStartedAt = now;
      stateUntil = now + 980;
    } else {
      happyStartedAt = -1;
      stateUntil = 0;
    }
  }

  function resume() {
    cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    draw(lastTime);
  }

  window.aiChatCreatureSetState = setCreatureState;

  window.addEventListener("pointermove", updatePointerGaze, {
    passive: true
  });
  window.addEventListener("pointerdown", updatePointerGaze, {
    passive: true
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !reducedMotion) resume();
  });

  resizeCanvas();
  chooseNextGaze(performance.now());
  draw(performance.now());
})();`;
