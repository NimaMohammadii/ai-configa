export const VEXA_LIVE_JS = `
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || "";
  const SCRIBE_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

  let videoUrl = "";
  let sourceLanguage = "";
  let targetLanguage = "";
  let toastTimer = null;
  let lockTimer = null;
  let captionTimer = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let scribeSocket = null;
  let startingSession = null;
  let sessionGeneration = 0;
  let translationQueue = Promise.resolve();
  let audioContext = null;
  let mediaSource = null;
  let captureNode = null;

  if (tg) {
    try {
      tg.ready && tg.ready();
      tg.expand && tg.expand();
      tg.disableVerticalSwipes && tg.disableVerticalSwipes();
      tg.setBackgroundColor && tg.setBackgroundColor("#000000");
      tg.setBottomBarColor && tg.setBottomBarColor("#000000");
    } catch (error) {}
  }

  function q(id) {
    return document.getElementById(id);
  }

  function toast(message) {
    const node = q("liveToast");
    if (!node) return;

    node.textContent = String(message || "");
    node.classList.remove("show");
    void node.offsetWidth;
    node.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("show");
    }, 3000);
  }

  async function api(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(Object.assign({ initData: initData }, body || {})),
    });

    const data = await response.json().catch(function () {
      return { error: "Invalid response" };
    });

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  function haptic(style) {
    if (!tg || !tg.HapticFeedback || !tg.HapticFeedback.impactOccurred) return;
    try {
      tg.HapticFeedback.impactOccurred(style || "light");
    } catch (error) {}
  }

  function showLock(data) {
    document.body.classList.add("is-locked");
    document.body.innerHTML =
      '<main class="lock-screen">' +
        '<section class="lock-card" aria-label="Mini app update">' +
          '<p class="lock-title">' +
            '<span>Updating</span>' +
            '<span class="lock-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '</p>' +
          '<div class="lock-bar" aria-hidden="true"><span id="lockFill"></span></div>' +
        '</section>' +
      '</main>';

    const fill = q("lockFill");
    const serverNow = Number(data.serverNow) || Math.floor(Date.now() / 1000);
    const lockedUntil = Number(data.lockedUntil) || serverNow + 60;
    const lockedFrom = Number(data.lockedFrom) || Math.max(serverNow, lockedUntil - 60);
    const total = Math.max(1, lockedUntil - lockedFrom);
    const offset = serverNow - Date.now() / 1000;

    function tick() {
      const now = Date.now() / 1000 + offset;
      const progress = Math.min(100, Math.max(0, (now - lockedFrom) / total * 100));
      if (fill) fill.style.width = progress + "%";

      if (now >= lockedUntil) {
        clearInterval(lockTimer);
        window.location.reload();
      }
    }

    tick();
    lockTimer = setInterval(tick, 500);
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024 * 1024) {
      return Math.max(1, Math.round(value / 1024)) + " KB";
    }
    return (value / (1024 * 1024)).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    }) + " MB";
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return minutes + ":" + String(rest).padStart(2, "0");
  }

  function selectedLabel(select) {
    if (!select || select.selectedIndex < 0) return "";
    const option = select.options[select.selectedIndex];
    return option && option.value ? String(option.textContent || "").trim() : "";
  }

  function updateLanguages() {
    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    sourceLanguage = source ? String(source.value || "") : "";
    targetLanguage = target ? String(target.value || "") : "";

    const choose = q("chooseVideoButton");
    const route = q("languageRoute");
    const ready = Boolean(sourceLanguage && targetLanguage);

    if (choose) choose.disabled = !ready;
    if (route) {
      route.textContent = ready
        ? selectedLabel(source) + " → " + selectedLabel(target)
        : "SELECT BOTH LANGUAGES FIRST";
    }

    if (q("videoReadyState")?.classList.contains("show")) {
      stopScribe();
      clearCaption();
      updateReadyLanguageLabel();
      setStatus("Play to start", false);
    }
  }

  function updateReadyLanguageLabel() {
    const label = q("captionModeLabel");
    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    if (!label) return;

    const sourceName = selectedLabel(source);
    const targetName = selectedLabel(target);
    label.textContent = sourceLanguage === targetLanguage
      ? "LIVE · " + targetName.toUpperCase()
      : sourceName.toUpperCase() + " → " + targetName.toUpperCase();
  }

  function setStatus(text, active) {
    const status = q("captionStatus");
    if (!status) return;
    const label = status.querySelector("b");
    if (label) label.textContent = text;
    status.classList.toggle("active", Boolean(active));
  }

  function clearCaption() {
    clearTimeout(captionTimer);
    const wrap = q("captionPreview");
    const text = q("liveCaptionText");
    if (text) text.textContent = "";
    if (wrap) wrap.classList.remove("show");
  }

  function showCaption(value, committed) {
    const textValue = String(value || "").trim();
    if (!textValue) return;

    const wrap = q("captionPreview");
    const text = q("liveCaptionText");
    if (!wrap || !text) return;

    text.textContent = textValue;
    text.dir = targetLanguage === "fa" || targetLanguage === "ar" ? "rtl" : "ltr";
    wrap.classList.add("show");

    if (committed) {
      clearTimeout(captionTimer);
      captionTimer = setTimeout(clearCaption, 4200);
    }
  }

  function resetVideoUrl() {
    if (!videoUrl) return;
    URL.revokeObjectURL(videoUrl);
    videoUrl = "";
  }

  function showVideo(file) {
    if (!sourceLanguage || !targetLanguage) {
      toast("Choose both languages first");
      return;
    }

    if (!file || !String(file.type || "").toLowerCase().startsWith("video/")) {
      toast("Choose a video file");
      return;
    }

    stopScribe();
    clearCaption();
    resetVideoUrl();
    videoUrl = URL.createObjectURL(file);

    const preview = q("videoPreview");
    const picker = q("videoPickerState");
    const ready = q("videoReadyState");
    const name = q("videoName");
    const meta = q("videoMeta");

    if (name) name.textContent = file.name || "Video";
    if (meta) meta.textContent = formatBytes(file.size) + " · Local preview";

    if (preview) {
      preview.src = videoUrl;
      preview.load();
      preview.addEventListener("loadedmetadata", function onMetadata() {
        preview.removeEventListener("loadedmetadata", onMetadata);
        if (meta) {
          meta.textContent = formatDuration(preview.duration) + " · " + formatBytes(file.size);
        }
      });
    }

    if (picker) picker.style.display = "none";
    if (ready) {
      ready.classList.add("show");
      ready.setAttribute("aria-hidden", "false");
    }

    updateReadyLanguageLabel();
    setStatus("Play to start", false);
    haptic("medium");
  }

  function pickVideo() {
    if (!sourceLanguage || !targetLanguage) {
      toast("Choose both languages first");
      return;
    }
    const input = q("videoFile");
    if (input) input.click();
  }

  async function ensureAudioCapture() {
    const preview = q("videoPreview");
    if (!preview) throw new Error("Video player is unavailable");

    if (audioContext && mediaSource && captureNode) {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !window.AudioWorkletNode) {
      throw new Error("Live captions need a newer browser");
    }

    audioContext = new AudioContextClass();
    const processorSource = [
      "class VexaLivePcmProcessor extends AudioWorkletProcessor {",
      "  constructor() {",
      "    super();",
      "    this.phase = 0;",
      "    this.sum = 0;",
      "    this.count = 0;",
      "    this.pending = [];",
      "  }",
      "  process(inputs, outputs) {",
      "    const input = inputs[0];",
      "    const output = outputs[0];",
      "    if (!input || !input.length || !input[0]) return true;",
      "    for (let channel = 0; channel < output.length; channel += 1) {",
      "      const source = input[Math.min(channel, input.length - 1)] || input[0];",
      "      if (source) output[channel].set(source);",
      "    }",
      "    const frames = input[0].length;",
      "    for (let index = 0; index < frames; index += 1) {",
      "      let sample = 0;",
      "      for (let channel = 0; channel < input.length; channel += 1) {",
      "        sample += input[channel][index] || 0;",
      "      }",
      "      sample /= Math.max(1, input.length);",
      "      this.sum += sample;",
      "      this.count += 1;",
      "      this.phase += 16000 / sampleRate;",
      "      if (this.phase >= 1) {",
      "        const averaged = this.count ? this.sum / this.count : 0;",
      "        const clipped = Math.max(-1, Math.min(1, averaged));",
      "        this.pending.push(clipped < 0 ? clipped * 32768 : clipped * 32767);",
      "        this.phase -= 1;",
      "        this.sum = 0;",
      "        this.count = 0;",
      "      }",
      "    }",
      "    while (this.pending.length >= 3200) {",
      "      const chunk = new Int16Array(3200);",
      "      for (let index = 0; index < chunk.length; index += 1) {",
      "        chunk[index] = this.pending[index];",
      "      }",
      "      this.pending.splice(0, chunk.length);",
      "      this.port.postMessage(chunk.buffer, [chunk.buffer]);",
      "    }",
      "    return true;",
      "  }",
      "}",
      "registerProcessor('vexa-live-pcm', VexaLivePcmProcessor);",
    ].join("\\n");

    const workletUrl = URL.createObjectURL(
      new Blob([processorSource], { type: "application/javascript" })
    );

    try {
      await audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    mediaSource = audioContext.createMediaElementSource(preview);
    captureNode = new AudioWorkletNode(audioContext, "vexa-live-pcm", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    captureNode.port.onmessage = function (event) {
      if (!scribeSocket || scribeSocket.readyState !== WebSocket.OPEN) return;
      if (preview.paused || preview.seeking || preview.ended) return;
      if (!(event.data instanceof ArrayBuffer)) return;

      try {
        scribeSocket.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: arrayBufferToBase64(event.data),
        }));
      } catch (error) {}
    };

    mediaSource.connect(captureNode);
    captureNode.connect(audioContext.destination);

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const step = 8192;

    for (let offset = 0; offset < bytes.length; offset += step) {
      const slice = bytes.subarray(offset, Math.min(bytes.length, offset + step));
      binary += String.fromCharCode.apply(null, slice);
    }

    return btoa(binary);
  }

  function scribeSocketUrl(token) {
    const params = new URLSearchParams();
    params.set("model_id", "scribe_v2_realtime");
    params.set("token", token);
    params.set("audio_format", "pcm_16000");
    params.set("language_code", sourceLanguage);
    params.set("commit_strategy", "vad");
    params.set("vad_threshold", "0.4");
    params.set("vad_silence_threshold_secs", "0.7");
    params.set("min_speech_duration_ms", "100");
    params.set("min_silence_duration_ms", "100");
    params.set("no_verbatim", "true");
    return SCRIBE_URL + "?" + params.toString();
  }

  async function ensureCaptionSession() {
    if (!sourceLanguage || !targetLanguage || !videoUrl) return;

    if (
      scribeSocket &&
      (scribeSocket.readyState === WebSocket.OPEN || scribeSocket.readyState === WebSocket.CONNECTING)
    ) {
      if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume().catch(function () {});
      }
      return;
    }

    if (startingSession) return startingSession;

    const generation = ++sessionGeneration;
    startingSession = startCaptionSession(generation).finally(function () {
      startingSession = null;
    });
    return startingSession;
  }

  async function startCaptionSession(generation) {
    setStatus("Connecting", true);

    const tokenData = await api("/mini-app/live/api/scribe-token", {
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
    });

    if (generation !== sessionGeneration) return;

    const socket = new WebSocket(scribeSocketUrl(tokenData.token));
    scribeSocket = socket;

    await new Promise(function (resolve, reject) {
      let settled = false;

      socket.onopen = function () {
        settled = true;
        resolve();
      };

      socket.onerror = function () {
        if (!settled) {
          settled = true;
          reject(new Error("Could not connect to live captions"));
        }
      };
    });

    if (generation !== sessionGeneration || scribeSocket !== socket) {
      try { socket.close(); } catch (error) {}
      return;
    }

    await ensureAudioCapture();
    reconnectAttempts = 0;
    setStatus("Listening", true);

    socket.onmessage = function (event) {
      handleScribeMessage(event, generation);
    };

    socket.onerror = function () {
      if (generation !== sessionGeneration) return;
      setStatus("Connection issue", false);
    };

    socket.onclose = function () {
      if (generation !== sessionGeneration || scribeSocket !== socket) return;
      scribeSocket = null;

      const preview = q("videoPreview");
      if (preview && !preview.paused && !preview.ended && reconnectAttempts < 1) {
        reconnectAttempts += 1;
        setStatus("Reconnecting", true);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(function () {
          ensureCaptionSession().catch(handleCaptionError);
        }, 700);
      } else if (preview && !preview.ended) {
        setStatus("Play to reconnect", false);
      }
    };
  }

  function handleScribeMessage(event, generation) {
    if (generation !== sessionGeneration) return;

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    const type = String(data.message_type || "");
    const text = String(data.text || "").trim();

    if (type === "session_started") {
      setStatus("Listening", true);
      return;
    }

    if (type === "partial_transcript") {
      if (sourceLanguage === targetLanguage && text) {
        showCaption(text, false);
      }
      return;
    }

    if (type === "committed_transcript") {
      if (!text) return;
      if (sourceLanguage === targetLanguage) {
        showCaption(text, true);
      } else {
        queueTranslation(text, generation);
      }
      return;
    }

    if (
      type === "auth_error" ||
      type === "quota_exceeded" ||
      type === "rate_limited" ||
      type === "transcriber_error" ||
      type === "input_error" ||
      type === "error"
    ) {
      const message = String(data.error || data.message || "Live captions stopped");
      toast(message);
      setStatus("Stopped", false);
    }
  }

  function queueTranslation(text, generation) {
    translationQueue = translationQueue.then(async function () {
      if (generation !== sessionGeneration) return;
      setStatus("Translating", true);

      const data = await api("/mini-app/live/api/translate", {
        text: text,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
      });

      if (generation !== sessionGeneration) return;
      showCaption(data.text, true);

      const preview = q("videoPreview");
      setStatus(preview && preview.paused ? "Paused" : "Listening", !preview || !preview.paused);
    }).catch(function (error) {
      if (generation !== sessionGeneration) return;
      toast(error.message || "Could not translate caption");
      setStatus("Translation issue", false);
    });
  }

  function handleCaptionError(error) {
    setStatus("Could not start", false);
    toast(error?.message || "Could not start live captions");
  }

  function stopScribe() {
    sessionGeneration += 1;
    clearTimeout(reconnectTimer);
    reconnectAttempts = 0;
    translationQueue = Promise.resolve();

    const socket = scribeSocket;
    scribeSocket = null;
    if (socket) {
      try {
        socket.onclose = null;
        socket.close();
      } catch (error) {}
    }
  }

  function configureVideoEvents() {
    const preview = q("videoPreview");
    if (!preview) return;

    preview.addEventListener("play", function () {
      ensureCaptionSession().catch(handleCaptionError);
    });

    preview.addEventListener("pause", function () {
      if (!preview.ended) setStatus("Paused", false);
    });

    preview.addEventListener("seeking", function () {
      stopScribe();
      clearCaption();
      setStatus("Seeking", false);
    });

    preview.addEventListener("seeked", function () {
      if (!preview.paused && !preview.ended) {
        ensureCaptionSession().catch(handleCaptionError);
      } else {
        setStatus("Play to start", false);
      }
    });

    preview.addEventListener("ended", function () {
      stopScribe();
      clearCaption();
      setStatus("Finished", false);
    });
  }

  function configureBackButton() {
    if (!tg || !tg.BackButton) return;

    try {
      tg.BackButton.show();
      tg.BackButton.onClick(function () {
        window.location.assign("/mini-app");
      });
    } catch (error) {}
  }

  async function initialize() {
    configureBackButton();
    configureVideoEvents();

    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    if (source) source.addEventListener("change", updateLanguages);
    if (target) target.addEventListener("change", updateLanguages);
    updateLanguages();

    try {
      const session = await api("/mini-app/live/api/session", {});
      if (session.locked) {
        showLock(session);
      }
    } catch (error) {
      toast(error.message || "Open Vexa Live inside Telegram");
    }
  }

  document.body.addEventListener("click", function (event) {
    const button = event.target && event.target.closest
      ? event.target.closest("[data-action]")
      : null;
    if (!button) return;

    const action = button.getAttribute("data-action");
    if (action === "pick-video" || action === "change-video") {
      event.preventDefault();
      pickVideo();
      return;
    }

    if (action === "back") {
      haptic("light");
    }
  });

  const input = q("videoFile");
  if (input) {
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (file) showVideo(file);
      input.value = "";
    });
  }

  window.addEventListener("pagehide", function () {
    stopScribe();
    resetVideoUrl();
    clearCaption();
    clearInterval(lockTimer);

    if (audioContext) {
      audioContext.close().catch(function () {});
    }

    if (tg && tg.BackButton) {
      try {
        tg.BackButton.hide();
      } catch (error) {}
    }
  });

  initialize();
})();
`;

export const VEXA_LIVE_INTEGRATION_JS = `
(function () {
  const STYLE_ID = "vexaLiveIntegrationStyle";
  const BUTTON_ID = "vexaLiveOpen";

  function requestedSection() {
    let raw = "";
    const tg = window.Telegram && window.Telegram.WebApp;

    try {
      raw = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || "";
    } catch (error) {}

    if (!raw) {
      try {
        const params = new URLSearchParams(window.location.search);
        raw = params.get("tgWebAppStartParam") ||
          params.get("startapp") ||
          params.get("section") ||
          "";
      } catch (error) {}
    }

    return String(raw || "").trim().toLowerCase();
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "/mini-app/live/integration.css?v=20260814-2";
    document.head.appendChild(link);
  }

  function installButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const wheel = document.getElementById("wheelOpenButton");
    if (!wheel || !wheel.parentElement) return;

    const button = document.createElement("a");
    button.id = BUTTON_ID;
    button.className = "vexa-live-open-button";
    button.href = "/mini-app/live";
    button.setAttribute("aria-label", "Open Vexa Live captions");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="4" y="5.25" width="16" height="13.5" rx="4" stroke="currentColor" stroke-width="1.55" />' +
        '<path d="M7.8 11h8.4M9.5 14.2h5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />' +
      '</svg>';

    button.addEventListener("click", function () {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) {
        try {
          tg.HapticFeedback.impactOccurred("light");
        } catch (error) {}
      }
    });

    wheel.insertAdjacentElement("afterend", button);
  }

  if (requestedSection() === "live") {
    window.location.replace("/mini-app/live");
    return;
  }

  installStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installButton, { once: true });
  } else {
    installButton();
  }
})();
`;
