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
    ".ai-chat-creature-stage {",
    "  position: relative;",
    "  width: 56px;",
    "  height: 56px;",
    "  transform-origin: center;",
    "  will-change: transform;",
    "}",
    ".ai-chat-creature canvas {",
    "  position: absolute;",
    "  inset: 0;",
    "  display: block;",
    "  width: 56px;",
    "  height: 56px;",
    "}",
    ".ai-chat-creature-face {",
    "  z-index: 2;",
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

  const stage = document.createElement("div");
  stage.className = "ai-chat-creature-stage";

  const sphereCanvas = document.createElement("canvas");
  sphereCanvas.className = "ai-chat-creature-sphere";

  const faceCanvas = document.createElement("canvas");
  faceCanvas.className = "ai-chat-creature-face";

  stage.appendChild(sphereCanvas);
  stage.appendChild(faceCanvas);
  host.appendChild(stage);

  const page = document.getElementById("aiChatPage");
  if (!page) return;

  page.appendChild(host);
  document.documentElement.classList.add("has-ai-chat-creature");

  const gl = sphereCanvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  });

  if (!gl) return;

  const faceContext = faceCanvas.getContext("2d", {
    alpha: true,
    desynchronized: true
  });

  if (!faceContext) return;

  const size = 56;
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
  let pixelRatio = 1;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const program = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Shader linking failed";
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }

  const vertexShaderSource = [
    "attribute vec2 aPosition;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPosition * 0.5 + 0.5;",
    "  gl_Position = vec4(aPosition, 0.0, 1.0);",
    "}"
  ].join("\\n");

  const fragmentShaderSource = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform float uTime;",
    "uniform float uState;",
    "uniform float uTouch;",
    "uniform float uHappy;",
    "",
    "void main() {",
    "  vec2 p = (vUv - 0.5) * 2.0 / 0.82;",
    "  float radiusSquared = dot(p, p);",
    "",
    "  if (radiusSquared > 1.0) discard;",
    "",
    "  float sphereZ = sqrt(max(0.0, 1.0 - radiusSquared));",
    "  vec3 normal = normalize(vec3(p.x, p.y, sphereZ));",
    "  vec3 viewDirection = vec3(0.0, 0.0, 1.0);",
    "  vec3 keyLight = normalize(vec3(-0.62, 0.72, 0.84));",
    "  vec3 fillLight = normalize(vec3(0.72, -0.55, 0.48));",
    "",
    "  float diffuse = max(dot(normal, keyLight), 0.0);",
    "  float fill = max(dot(normal, fillLight), 0.0);",
    "  float fresnel = pow(1.0 - sphereZ, 2.35);",
    "",
    "  float flowSpeed = 0.64 + uState * 1.45;",
    "  float flowA = sin(p.y * 7.2 + p.x * 2.1 + uTime * flowSpeed);",
    "  float flowB = sin(p.x * 8.4 - p.y * 3.6 - uTime * (0.48 + uState));",
    "  float flowC = sin((p.x + p.y) * 5.1 + uTime * 0.36);",
    "  float liquid = (flowA + flowB * 0.55 + flowC * 0.35) / 1.9;",
    "",
    "  vec3 deepPurple = vec3(0.105, 0.045, 0.18);",
    "  vec3 middlePurple = vec3(0.31, 0.13, 0.47);",
    "  vec3 softPurple = vec3(0.63, 0.43, 0.79);",
    "  vec3 glassPurple = vec3(0.82, 0.68, 0.94);",
    "",
    "  float volume = clamp(diffuse * 0.62 + sphereZ * 0.27, 0.0, 1.0);",
    "  vec3 color = mix(deepPurple, middlePurple, volume);",
    "  color = mix(color, softPurple, diffuse * diffuse * 0.38);",
    "  color += liquid * vec3(0.035, 0.018, 0.052) * (0.55 + uState);",
    "",
    "  vec3 halfDirection = normalize(keyLight + viewDirection);",
    "  float specular = pow(max(dot(normal, halfDirection), 0.0), 72.0);",
    "  float broadSpecular = pow(max(dot(normal, halfDirection), 0.0), 18.0);",
    "  color += glassPurple * specular * 0.9;",
    "  color += glassPurple * broadSpecular * 0.13;",
    "",
    "  float lowerReflection = pow(max(fill, 0.0), 3.2);",
    "  color += vec3(0.24, 0.12, 0.36) * lowerReflection * 0.42;",
    "",
    "  float innerRing = smoothstep(0.58, 0.98, radiusSquared);",
    "  color += vec3(0.21, 0.11, 0.32) * innerRing * 0.2;",
    "  color += glassPurple * fresnel * (0.19 + uHappy * 0.08);",
    "",
    "  float movingHighlight = smoothstep(",
    "    0.08,",
    "    0.0,",
    "    distance(p, vec2(-0.34 + sin(uTime * 0.34) * 0.025, 0.42))",
    "  );",
    "  color += glassPurple * movingHighlight * 0.42;",
    "",
    "  float touchWave = sin(radiusSquared * 24.0 - uTime * 8.0);",
    "  color += vec3(0.08, 0.04, 0.12) * touchWave * uTouch * 0.08;",
    "",
    "  float edge = 1.0 - smoothstep(0.965, 1.0, radiusSquared);",
    "  float alpha = edge * (0.9 + fresnel * 0.1);",
    "  gl_FragColor = vec4(color, alpha);",
    "}"
  ].join("\\n");

  const program = createProgram(
    vertexShaderSource,
    fragmentShaderSource
  );

  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const timeLocation = gl.getUniformLocation(program, "uTime");
  const stateLocation = gl.getUniformLocation(program, "uState");
  const touchLocation = gl.getUniformLocation(program, "uTouch");
  const happyLocation = gl.getUniformLocation(program, "uHappy");

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]),
    gl.STATIC_DRAW
  );

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(
    positionLocation,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resizeCanvases() {
    pixelRatio = Math.min(4, (window.devicePixelRatio || 1) * 1.65);
    const pixels = Math.round(size * pixelRatio);

    if (
      sphereCanvas.width !== pixels ||
      sphereCanvas.height !== pixels
    ) {
      sphereCanvas.width = pixels;
      sphereCanvas.height = pixels;
      faceCanvas.width = pixels;
      faceCanvas.height = pixels;
      gl.viewport(0, 0, pixels, pixels);
    }

    faceContext.setTransform(
      pixelRatio,
      0,
      0,
      pixelRatio,
      0,
      0
    );
    faceContext.imageSmoothingEnabled = true;
    faceContext.imageSmoothingQuality = "high";
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

  function stateValue() {
    if (creatureState === "searching") return 1;
    if (creatureState === "thinking") return 0.48;
    if (creatureState === "happy") return 0.26;
    return 0;
  }

  function renderSphere(seconds, touch, happy) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(timeLocation, seconds);
    gl.uniform1f(stateLocation, stateValue());
    gl.uniform1f(touchLocation, touch);
    gl.uniform1f(happyLocation, happy);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawEye(centerX, centerY, blink) {
    const width = 4.15;
    const openHeight = 8.7;
    const height = Math.max(0.7, openHeight * (1 - blink * 0.94));
    const x = centerX + gazeX * 1.85;
    const y = centerY + gazeY * 1.25;

    faceContext.fillStyle = "rgba(12, 6, 20, .34)";
    faceContext.beginPath();
    faceContext.roundRect(
      x - (width + 1.6) / 2,
      y - (openHeight + 1.8) / 2,
      width + 1.6,
      openHeight + 1.8,
      (width + 1.6) / 2
    );
    faceContext.fill();

    const gradient = faceContext.createLinearGradient(
      x,
      y - height / 2,
      x,
      y + height / 2
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.58, "rgba(246, 240, 251, .99)");
    gradient.addColorStop(1, "rgba(216, 203, 226, .97)");

    faceContext.fillStyle = gradient;
    faceContext.beginPath();
    faceContext.roundRect(
      x - width / 2,
      y - height / 2,
      width,
      height,
      Math.min(width / 2, height / 2)
    );
    faceContext.fill();

    if (height > 2.2) {
      faceContext.fillStyle = "rgba(255, 255, 255, .55)";
      faceContext.beginPath();
      faceContext.roundRect(
        x - width * 0.22,
        y - height * 0.38,
        width * 0.44,
        height * 0.45,
        width * 0.2
      );
      faceContext.fill();
    }
  }

  function renderFace(blink, breathe) {
    faceContext.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2 - 0.45 + breathe * 0.06;

    drawEye(centerX - 5.05, centerY, blink);
    drawEye(centerX + 5.05, centerY, blink);
  }

  function draw(now) {
    resizeCanvases();

    const elapsed = Math.min(40, now - lastTime);
    const gazeEase = 1 - Math.pow(0.7, elapsed / 16.67);
    const seconds = now / 1000;

    lastTime = now;
    updateGaze(now);
    gazeX += (targetGazeX - gazeX) * gazeEase;
    gazeY += (targetGazeY - gazeY) * gazeEase;

    const touch = touchAmount(now);
    const happy = happyAmount(now);
    const thinking = creatureState === "thinking";
    const searching = creatureState === "searching";
    const breathe = Math.sin(seconds * (thinking ? 2.55 : 1.82));
    const energy = searching ? 0.48 : thinking ? 0.24 : 0;

    const moveX =
      Math.sin(seconds * (1.1 + energy)) * (0.68 + energy * 0.42);
    const moveY =
      Math.sin(seconds * (1.36 + energy)) * (0.76 + energy * 0.4) -
      happy * 1.85;
    const uniformScale =
      1 +
      breathe * (thinking ? 0.012 : 0.007) +
      happy * 0.018;
    const scaleX = uniformScale + touch * 0.038;
    const scaleY = uniformScale - touch * 0.027;

    stage.style.transform =
      "translate3d(" + moveX.toFixed(2) + "px," +
      moveY.toFixed(2) + "px,0) " +
      "scale(" + scaleX.toFixed(4) + "," + scaleY.toFixed(4) + ")";

    renderSphere(seconds, touch, happy);
    renderFace(blinkAmount(now), breathe);

    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function updatePointerGaze(event) {
    const bounds = faceCanvas.getBoundingClientRect();
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

  resizeCanvases();
  chooseNextGaze(performance.now());
  draw(performance.now());
})();`;
