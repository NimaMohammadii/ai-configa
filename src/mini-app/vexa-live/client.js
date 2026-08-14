export const VEXA_LIVE_JS = `
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || "";
  const BATCH_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
  const REALTIME_SCRIBE_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
  const BATCH_SCRIBE_MODEL = "scribe_v2";
  const REALTIME_SCRIBE_MODEL = "scribe_v2_realtime";
  const LIVE_SAMPLE_RATE = 16000;
  const LIVE_CHUNK_SAMPLES = 3200;
  const TRANSLATION_BATCH_SIZE = 24;

  let mode = "standard";
  let liveSource = "file";
  let videoUrl = "";
  let videoFile = null;
  let sourceLanguage = "";
  let targetLanguage = "";
  let toastTimer = null;
  let lockTimer = null;
  let liveCaptionTimer = null;
  let generation = 0;
  let cues = [];
  let activeCueIndex = -1;
  let captionsReady = false;

  let liveAudioContext = null;
  let liveAudioBuffer = null;
  let liveSocket = null;
  let liveSocketGeneration = 0;
  let liveCursorSeconds = 0;
  let livePumpFrame = 0;
  let liveTranslationQueue = Promise.resolve();
  let lastLiveSettledText = "";
  let lastLiveSettledAt = 0;

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
    }, 3600);
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

  function setStatus(text, active) {
    const status = q("captionStatus");
    if (!status) return;
    const label = status.querySelector("b");
    if (label) label.textContent = text;
    status.classList.toggle("active", Boolean(active));
  }

  function setPlaybackEnabled(enabled) {
    const preview = q("videoPreview");
    if (!preview) return;
    preview.controls = Boolean(enabled);
    if (!enabled) {
      try { preview.pause(); } catch (error) {}
    }
  }

  function clearCaption() {
    activeCueIndex = -1;
    clearTimeout(liveCaptionTimer);
    const wrap = q("captionPreview");
    const text = q("liveCaptionText");
    if (text) text.textContent = "";
    if (wrap) wrap.classList.remove("show");
  }

  function showCaption(value, autoClear) {
    const textValue = String(value || "").trim();
    if (!textValue) {
      clearCaption();
      return;
    }

    const wrap = q("captionPreview");
    const text = q("liveCaptionText");
    if (!wrap || !text) return;

    text.textContent = textValue;
    text.dir = targetLanguage === "fa" || targetLanguage === "ar" ? "rtl" : "ltr";
    wrap.classList.add("show");

    if (autoClear) {
      clearTimeout(liveCaptionTimer);
      liveCaptionTimer = setTimeout(clearCaption, 4200);
    }
  }

  function resetVideoUrl() {
    if (!videoUrl) return;
    URL.revokeObjectURL(videoUrl);
    videoUrl = "";
  }

  function resetCaptions() {
    generation += 1;
    captionsReady = false;
    cues = [];
    clearCaption();
    stopLiveSession();
  }

  function closeLiveAudio() {
    liveAudioBuffer = null;
    if (liveAudioContext) {
      try {
        liveAudioContext.close().catch(function () {});
      } catch (error) {}
    }
    liveAudioContext = null;
  }

  function resetMedia() {
    resetCaptions();
    closeLiveAudio();
    resetVideoUrl();
    videoFile = null;

    const preview = q("videoPreview");
    if (preview) {
      try { preview.pause(); } catch (error) {}
      preview.removeAttribute("src");
      preview.load();
    }

    const ready = q("videoReadyState");
    if (ready) {
      ready.classList.remove("show");
      ready.setAttribute("aria-hidden", "true");
    }

    const youtubeReady = q("youtubeReadyState");
    if (youtubeReady) {
      youtubeReady.classList.remove("show");
      youtubeReady.setAttribute("aria-hidden", "true");
    }

    const iframe = q("youtubePlayer");
    if (iframe) iframe.src = "about:blank";

    const picker = q("videoPickerState");
    if (picker) picker.style.display = "";

    const youtubeInput = q("youtubeUrl");
    if (youtubeInput) youtubeInput.value = "";
  }

  function updateLanguages() {
    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    sourceLanguage = source ? String(source.value || "") : "";
    targetLanguage = target ? String(target.value || "") : "";

    const ready = Boolean(sourceLanguage && targetLanguage);
    const choose = q("chooseVideoButton");
    const youtubeButton = q("openYoutubeButton");
    const route = q("languageRoute");

    if (choose) choose.disabled = !ready;
    if (youtubeButton) youtubeButton.disabled = !ready;
    if (route) {
      route.textContent = ready
        ? selectedLabel(source) + " → " + selectedLabel(target)
        : "SELECT BOTH LANGUAGES FIRST";
    }

    updateReadyLanguageLabel();

    if (mode === "standard" && videoFile && q("videoReadyState")?.classList.contains("show")) {
      resetCaptions();
      setPlaybackEnabled(false);
      if (ready) {
        prepareStandardCaptions(videoFile, generation).catch(handlePrepareError);
      } else {
        setStatus("Choose languages", false);
      }
      return;
    }

    if (mode === "live" && videoFile && q("videoReadyState")?.classList.contains("show")) {
      stopLiveSession();
      clearCaption();
      setStatus(ready && liveAudioBuffer ? "Live ready" : "Choose languages", false);
    }
  }

  function updateReadyLanguageLabel() {
    const label = q("captionModeLabel");
    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    if (!label) return;

    const sourceName = selectedLabel(source);
    const targetName = selectedLabel(target);
    const route = sourceLanguage === targetLanguage
      ? targetName.toUpperCase()
      : sourceName.toUpperCase() + " → " + targetName.toUpperCase();

    label.textContent = mode === "live"
      ? "LIVE · " + route
      : "CAPTIONS · " + route;
  }

  function setMode(nextMode) {
    const next = nextMode === "live" ? "live" : "standard";
    if (mode === next) return;

    mode = next;
    resetMedia();

    document.querySelectorAll("[data-caption-mode]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-caption-mode") === mode);
      button.setAttribute(
        "aria-pressed",
        button.getAttribute("data-caption-mode") === mode ? "true" : "false"
      );
    });

    const sourceSwitch = q("liveSourceSwitch");
    if (sourceSwitch) sourceSwitch.classList.toggle("show", mode === "live");

    const engine = q("engineLabel");
    if (engine) engine.textContent = mode === "live" ? "Scribe v2 Realtime" : "Scribe v2";

    liveSource = "file";
    updateLiveSourceUi();
    updateLanguages();
    haptic("light");
  }

  function setLiveSource(nextSource) {
    liveSource = nextSource === "youtube" ? "youtube" : "file";
    resetMedia();
    updateLiveSourceUi();
    haptic("light");
  }

  function updateLiveSourceUi() {
    document.querySelectorAll("[data-live-source]").forEach(function (button) {
      const active = button.getAttribute("data-live-source") === liveSource;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const choose = q("chooseVideoButton");
    const youtubeInput = q("youtubeInputState");

    if (mode !== "live") {
      if (choose) choose.classList.remove("is-hidden");
      if (youtubeInput) youtubeInput.classList.remove("show");
      return;
    }

    if (choose) choose.classList.toggle("is-hidden", liveSource !== "file");
    if (youtubeInput) youtubeInput.classList.toggle("show", liveSource === "youtube");
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

    resetCaptions();
    closeLiveAudio();
    resetVideoUrl();
    videoFile = file;
    videoUrl = URL.createObjectURL(file);

    const preview = q("videoPreview");
    const picker = q("videoPickerState");
    const ready = q("videoReadyState");
    const name = q("videoName");
    const meta = q("videoMeta");

    if (name) name.textContent = file.name || "Video";
    if (meta) {
      meta.textContent = formatBytes(file.size) +
        (mode === "live" ? " · Preparing live audio" : " · Preparing captions");
    }

    if (preview) {
      preview.src = videoUrl;
      preview.controls = false;
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
    haptic("medium");

    if (mode === "live") {
      setStatus("Preparing live audio", true);
      prepareLiveFile(file, generation).catch(handleLivePrepareError);
    } else {
      setStatus("Generating captions", true);
      prepareStandardCaptions(file, generation).catch(handlePrepareError);
    }
  }

  function pickVideo() {
    if (!sourceLanguage || !targetLanguage) {
      toast("Choose both languages first");
      return;
    }
    const input = q("videoFile");
    if (input) input.click();
  }

  async function prepareStandardCaptions(file, currentGeneration) {
    const tokenData = await api("/mini-app/live/api/scribe-token", {
      mode: "standard",
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
    });

    if (currentGeneration !== generation || file !== videoFile || mode !== "standard") return;

    setStatus("Reading video", true);
    const transcript = await transcribeVideo(file, tokenData.token);

    if (currentGeneration !== generation || file !== videoFile || mode !== "standard") return;

    let nextCues = buildCues(transcript);
    if (!nextCues.length) {
      throw new Error("No speech was found in this video");
    }

    if (sourceLanguage !== targetLanguage) {
      setStatus("Translating captions", true);
      nextCues = await translateCues(nextCues, currentGeneration);
    }

    if (currentGeneration !== generation || file !== videoFile || mode !== "standard") return;

    cues = nextCues;
    captionsReady = true;
    setPlaybackEnabled(true);
    setStatus("Captions ready", false);
    syncCaptionToVideo();
    haptic("light");
  }

  async function transcribeVideo(file, token) {
    const form = new FormData();
    form.append("file", file, file.name || "video");
    form.append("model_id", BATCH_SCRIBE_MODEL);
    form.append("language_code", sourceLanguage);
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    form.append("no_verbatim", "true");

    const response = await fetch(
      BATCH_SCRIBE_URL + "?token=" + encodeURIComponent(String(token || "")),
      {
        method: "POST",
        body: form,
      }
    );

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      const detail =
        data?.detail?.message ||
        data?.detail ||
        data?.message ||
        data?.error ||
        "Could not generate captions";
      throw new Error(typeof detail === "string" ? detail : "Could not generate captions");
    }

    return data;
  }

  async function prepareLiveFile(file, currentGeneration) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Live mode is not supported in this browser");
    }

    const arrayBuffer = await file.arrayBuffer();
    if (currentGeneration !== generation || file !== videoFile || mode !== "live") return;

    let context;
    try {
      context = new AudioContextClass({ sampleRate: LIVE_SAMPLE_RATE });
    } catch (error) {
      context = new AudioContextClass();
    }

    liveAudioContext = context;

    let decoded;
    try {
      decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
      throw new Error("Live mode cannot decode this video. Use Standard mode.");
    }

    if (currentGeneration !== generation || file !== videoFile || mode !== "live") return;

    if (!decoded || !decoded.length || !decoded.numberOfChannels) {
      throw new Error("No readable audio was found in this video");
    }

    liveAudioBuffer = decoded;
    setPlaybackEnabled(true);
    setStatus("Live ready", false);
    haptic("light");
  }

  function buildLiveChunk(startSeconds) {
    if (!liveAudioBuffer) return null;

    const sourceRate = Number(liveAudioBuffer.sampleRate) || LIVE_SAMPLE_RATE;
    const channels = Math.max(1, Number(liveAudioBuffer.numberOfChannels) || 1);
    const output = new Int16Array(LIVE_CHUNK_SAMPLES);
    const sourceDuration = Number(liveAudioBuffer.duration) || 0;

    if (startSeconds >= sourceDuration) return null;

    for (let outIndex = 0; outIndex < output.length; outIndex += 1) {
      const time = startSeconds + outIndex / LIVE_SAMPLE_RATE;
      if (time >= sourceDuration) break;

      const sourcePosition = time * sourceRate;
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(liveAudioBuffer.length - 1, leftIndex + 1);
      const mix = sourcePosition - leftIndex;
      let sample = 0;

      for (let channel = 0; channel < channels; channel += 1) {
        const data = liveAudioBuffer.getChannelData(channel);
        const left = data[leftIndex] || 0;
        const right = data[rightIndex] || left;
        sample += left + (right - left) * mix;
      }

      sample /= channels;
      sample = Math.max(-1, Math.min(1, sample));
      output[outIndex] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    return output.buffer;
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

  function realtimeSocketUrl(token) {
    const params = new URLSearchParams();
    params.set("model_id", REALTIME_SCRIBE_MODEL);
    params.set("token", token);
    params.set("audio_format", "pcm_16000");
    params.set("language_code", sourceLanguage);
    params.set("commit_strategy", "vad");
    params.set("vad_threshold", "0.4");
    params.set("vad_silence_threshold_secs", "0.65");
    params.set("min_speech_duration_ms", "100");
    params.set("min_silence_duration_ms", "100");
    params.set("no_verbatim", "true");
    return REALTIME_SCRIBE_URL + "?" + params.toString();
  }

  async function startLiveSessionAt(startSeconds) {
    if (
      mode !== "live" ||
      liveSource !== "file" ||
      !videoFile ||
      !liveAudioBuffer ||
      !sourceLanguage ||
      !targetLanguage
    ) {
      return;
    }

    stopLiveSession();
    const sessionGeneration = ++liveSocketGeneration;
    const localGeneration = generation;

    setStatus("Connecting live", true);

    const tokenData = await api("/mini-app/live/api/scribe-token", {
      mode: "live",
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
    });

    if (
      sessionGeneration !== liveSocketGeneration ||
      localGeneration !== generation ||
      mode !== "live"
    ) {
      return;
    }

    const socket = new WebSocket(realtimeSocketUrl(tokenData.token));
    liveSocket = socket;
    liveCursorSeconds = Math.max(0, Number(startSeconds) || 0);
    lastLiveSettledText = "";
    lastLiveSettledAt = 0;
    liveTranslationQueue = Promise.resolve();

    socket.onmessage = function (event) {
      handleRealtimeMessage(event, sessionGeneration, localGeneration);
    };

    socket.onerror = function () {
      if (sessionGeneration !== liveSocketGeneration) return;
      setStatus("Live connection issue", false);
    };

    socket.onclose = function () {
      if (sessionGeneration !== liveSocketGeneration || liveSocket !== socket) return;
      liveSocket = null;
      cancelAnimationFrame(livePumpFrame);
      const preview = q("videoPreview");
      if (preview && !preview.paused && !preview.ended && mode === "live") {
        setStatus("Tap play to reconnect", false);
      }
    };

    await new Promise(function (resolve, reject) {
      let settled = false;

      socket.addEventListener("open", function () {
        if (settled) return;
        settled = true;
        resolve();
      }, { once: true });

      socket.addEventListener("error", function () {
        if (settled) return;
        settled = true;
        reject(new Error("Could not connect live captions"));
      }, { once: true });

      socket.addEventListener("close", function () {
        if (settled) return;
        settled = true;
        reject(new Error("Live captions connection closed"));
      }, { once: true });
    });

    if (
      sessionGeneration !== liveSocketGeneration ||
      localGeneration !== generation ||
      liveSocket !== socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    setStatus("Live", true);
    pumpLiveAudio(sessionGeneration, localGeneration);
  }

  function pumpLiveAudio(sessionGeneration, localGeneration) {
    cancelAnimationFrame(livePumpFrame);

    function tick() {
      if (
        sessionGeneration !== liveSocketGeneration ||
        localGeneration !== generation ||
        mode !== "live" ||
        !liveSocket ||
        liveSocket.readyState !== WebSocket.OPEN ||
        !liveAudioBuffer
      ) {
        return;
      }

      const preview = q("videoPreview");
      if (!preview || preview.ended) return;

      if (!preview.paused && !preview.seeking) {
        const duration = Number(liveAudioBuffer.duration) || 0;
        const targetTime = Math.min(
          duration,
          (Number(preview.currentTime) || 0) + 0.34
        );

        while (liveCursorSeconds + 0.2 <= targetTime + 0.001) {
          const chunk = buildLiveChunk(liveCursorSeconds);
          if (!chunk) break;

          try {
            liveSocket.send(JSON.stringify({
              message_type: "input_audio_chunk",
              audio_base_64: arrayBufferToBase64(chunk),
            }));
          } catch (error) {
            break;
          }

          liveCursorSeconds += LIVE_CHUNK_SAMPLES / LIVE_SAMPLE_RATE;
        }
      }

      livePumpFrame = requestAnimationFrame(tick);
    }

    livePumpFrame = requestAnimationFrame(tick);
  }

  function handleRealtimeMessage(event, sessionGeneration, localGeneration) {
    if (
      sessionGeneration !== liveSocketGeneration ||
      localGeneration !== generation ||
      mode !== "live"
    ) {
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    const type = String(data.message_type || "");
    const text = String(data.text || "").trim();

    if (type === "session_started") {
      setStatus("Live", true);
      return;
    }

    if (type === "partial_transcript") {
      if (sourceLanguage === targetLanguage && text) {
        showCaption(text, false);
      }
      return;
    }

    if (
      type === "final_transcript" ||
      type === "final_transcript_with_timestamps" ||
      type === "committed_transcript" ||
      type === "committed_transcript_with_timestamps"
    ) {
      handleLiveSettledText(text, sessionGeneration, localGeneration);
      return;
    }

    if (
      type === "auth_error" ||
      type === "quota_exceeded" ||
      type === "rate_limited" ||
      type === "transcriber_error" ||
      type === "input_error" ||
      type === "error" ||
      type === "commit_throttled" ||
      type === "unaccepted_terms" ||
      type === "queue_overflow" ||
      type === "resource_exhausted" ||
      type === "session_time_limit_exceeded" ||
      type === "chunk_size_exceeded" ||
      type === "insufficient_audio_activity"
    ) {
      const message = String(data.error || data.message || "Live captions stopped");
      toast(message);
      setStatus("Live stopped", false);
    }
  }

  function handleLiveSettledText(text, sessionGeneration, localGeneration) {
    if (!text) return;

    const now = Date.now();
    if (text === lastLiveSettledText && now - lastLiveSettledAt < 2500) return;
    lastLiveSettledText = text;
    lastLiveSettledAt = now;

    if (sourceLanguage === targetLanguage) {
      showCaption(text, true);
      return;
    }

    liveTranslationQueue = liveTranslationQueue.then(async function () {
      if (
        sessionGeneration !== liveSocketGeneration ||
        localGeneration !== generation ||
        mode !== "live"
      ) {
        return;
      }

      const data = await api("/mini-app/live/api/translate", {
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        text: text,
      });

      if (
        sessionGeneration !== liveSocketGeneration ||
        localGeneration !== generation ||
        mode !== "live"
      ) {
        return;
      }

      showCaption(data.text, true);
    }).catch(function (error) {
      if (sessionGeneration !== liveSocketGeneration) return;
      toast(error.message || "Could not translate live caption");
    });
  }

  function stopLiveSession() {
    liveSocketGeneration += 1;
    cancelAnimationFrame(livePumpFrame);
    livePumpFrame = 0;
    liveTranslationQueue = Promise.resolve();

    const socket = liveSocket;
    liveSocket = null;

    if (socket) {
      try {
        socket.onclose = null;
        socket.close();
      } catch (error) {}
    }
  }

  function buildCues(transcript) {
    const rawWords = Array.isArray(transcript?.words) ? transcript.words : [];
    const words = rawWords
      .map(function (item) {
        return {
          text: String(item?.text || "").trim(),
          start: Number(item?.start),
          end: Number(item?.end),
        };
      })
      .filter(function (item) {
        return item.text &&
          Number.isFinite(item.start) &&
          Number.isFinite(item.end) &&
          item.end >= item.start;
      });

    if (!words.length) {
      const fallbackText = String(transcript?.text || "").trim();
      const preview = q("videoPreview");
      const duration = Number(preview?.duration);
      if (fallbackText && Number.isFinite(duration) && duration > 0) {
        return [{ id: 0, start: 0, end: duration, text: fallbackText }];
      }
      return [];
    }

    const result = [];
    let group = [];

    function flush() {
      if (!group.length) return;
      const first = group[0];
      const last = group[group.length - 1];
      const text = joinTokens(group.map(function (item) { return item.text; }));
      if (text) {
        result.push({
          id: result.length,
          start: Math.max(0, first.start - 0.06),
          end: Math.max(first.start + 0.15, last.end + 0.22),
          text: text,
        });
      }
      group = [];
    }

    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      group.push(word);

      const first = group[0];
      const duration = word.end - first.start;
      const next = words[index + 1];
      const hasPause = Boolean(next && next.start - word.end > 0.72);
      const endsSentence = /[.!?؟。！？]$/.test(word.text);
      const tooManyWords = group.length >= 10;
      const longEnough = duration >= 3.15;
      const sentenceReady = endsSentence && duration >= 1.0;

      if (!next || hasPause || tooManyWords || longEnough || sentenceReady) {
        flush();
      }
    }

    return result;
  }

  function joinTokens(tokens) {
    if (sourceLanguage === "zh" || sourceLanguage === "ja") {
      return tokens.join("")
        .replace(/\\s+/g, "")
        .trim();
    }

    return tokens.join(" ")
      .replace(/\\s+([,.;:!?؟،؛。！？])/g, "$1")
      .replace(/([([{«])\\s+/g, "$1")
      .replace(/\\s+([)\\]}»])/g, "$1")
      .replace(/\\s+/g, " ")
      .trim();
  }

  async function translateCues(sourceCues, currentGeneration) {
    const translated = sourceCues.map(function (cue) {
      return Object.assign({}, cue);
    });

    for (let offset = 0; offset < sourceCues.length; offset += TRANSLATION_BATCH_SIZE) {
      if (currentGeneration !== generation || mode !== "standard") return translated;

      const batch = sourceCues.slice(offset, offset + TRANSLATION_BATCH_SIZE);
      const data = await api("/mini-app/live/api/translate", {
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        segments: batch.map(function (cue) {
          return { id: cue.id, text: cue.text };
        }),
      });

      if (currentGeneration !== generation || mode !== "standard") return translated;

      const items = Array.isArray(data?.segments) ? data.segments : [];
      const byId = new Map(items.map(function (item) {
        return [Number(item.id), String(item.text || "").trim()];
      }));

      for (const cue of batch) {
        const text = byId.get(cue.id);
        if (!text) {
          throw new Error("Could not translate captions");
        }
        translated[cue.id].text = text;
      }

      const done = Math.min(sourceCues.length, offset + batch.length);
      const percent = Math.round(done / sourceCues.length * 100);
      setStatus("Translating " + percent + "%", true);
    }

    return translated;
  }

  function findCueIndex(time) {
    let low = 0;
    let high = cues.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = cues[mid];

      if (time < cue.start) {
        high = mid - 1;
      } else if (time > cue.end) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return -1;
  }

  function syncCaptionToVideo() {
    const preview = q("videoPreview");
    if (
      mode !== "standard" ||
      !preview ||
      !captionsReady ||
      !cues.length
    ) {
      return;
    }

    const index = findCueIndex(Number(preview.currentTime) || 0);
    if (index === activeCueIndex) return;

    activeCueIndex = index;
    if (index < 0) {
      const wrap = q("captionPreview");
      const text = q("liveCaptionText");
      if (text) text.textContent = "";
      if (wrap) wrap.classList.remove("show");
      return;
    }

    showCaption(cues[index].text, false);
  }

  function handlePrepareError(error) {
    captionsReady = false;
    setPlaybackEnabled(true);
    setStatus("Captions failed", false);
    const message = String(error?.message || "Could not generate captions");
    toast(message.length > 180 ? "Could not generate captions" : message);
  }

  function handleLivePrepareError(error) {
    setPlaybackEnabled(true);
    setStatus("Live unavailable", false);
    const message = String(error?.message || "Could not prepare live captions");
    toast(message.length > 180 ? "Live mode is unavailable for this video" : message);
  }

  function parseYouTubeId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\\./i, "").toLowerCase();

      if (host === "youtu.be") {
        const id = url.pathname.split("/").filter(Boolean)[0] || "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
      }

      if (
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com"
      ) {
        const queryId = url.searchParams.get("v") || "";
        if (/^[A-Za-z0-9_-]{11}$/.test(queryId)) return queryId;

        const parts = url.pathname.split("/").filter(Boolean);
        const marker = parts[0];
        if (marker === "shorts" || marker === "embed" || marker === "live") {
          const id = parts[1] || "";
          if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
        }
      }
    } catch (error) {}

    return "";
  }

  function openYouTubeVideo() {
    if (mode !== "live" || liveSource !== "youtube") return;

    if (!sourceLanguage || !targetLanguage) {
      toast("Choose both languages first");
      return;
    }

    const input = q("youtubeUrl");
    const id = parseYouTubeId(input?.value || "");
    if (!id) {
      toast("Paste a valid YouTube link");
      return;
    }

    resetCaptions();
    closeLiveAudio();
    resetVideoUrl();
    videoFile = null;

    const picker = q("videoPickerState");
    const youtubeReady = q("youtubeReadyState");
    const iframe = q("youtubePlayer");
    const title = q("youtubeVideoName");

    if (picker) picker.style.display = "none";
    if (youtubeReady) {
      youtubeReady.classList.add("show");
      youtubeReady.setAttribute("aria-hidden", "false");
    }
    if (title) title.textContent = "YouTube · " + id;

    if (iframe) {
      const params = new URLSearchParams();
      params.set("playsinline", "1");
      params.set("controls", "1");
      params.set("rel", "0");
      params.set("cc_load_policy", "1");
      params.set("cc_lang_pref", targetLanguage);
      params.set("hl", targetLanguage);
      params.set("enablejsapi", "1");
      params.set("origin", window.location.origin);

      iframe.src =
        "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(id) +
        "?" +
        params.toString();
    }

    haptic("medium");
  }

  function changeMedia() {
    resetMedia();
    updateLiveSourceUi();
    updateLanguages();
  }

  function configureVideoEvents() {
    const preview = q("videoPreview");
    if (!preview) return;

    preview.addEventListener("timeupdate", syncCaptionToVideo);
    preview.addEventListener("seeking", function () {
      if (mode === "standard") {
        syncCaptionToVideo();
        return;
      }

      if (mode === "live") {
        stopLiveSession();
        clearCaption();
        setStatus("Seeking", false);
      }
    });

    preview.addEventListener("seeked", function () {
      if (mode === "standard") {
        syncCaptionToVideo();
        return;
      }

      if (mode === "live" && liveAudioBuffer) {
        if (!preview.paused && !preview.ended) {
          startLiveSessionAt(preview.currentTime).catch(handleLivePrepareError);
        } else {
          setStatus("Live ready", false);
        }
      }
    });

    preview.addEventListener("play", function () {
      if (mode === "standard") {
        syncCaptionToVideo();
        return;
      }

      if (mode === "live" && liveSource === "file") {
        if (!liveAudioBuffer) {
          try { preview.pause(); } catch (error) {}
          toast("Live audio is still preparing");
          return;
        }

        if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
          startLiveSessionAt(preview.currentTime).catch(handleLivePrepareError);
        } else {
          pumpLiveAudio(liveSocketGeneration, generation);
        }
      }
    });

    preview.addEventListener("pause", function () {
      if (mode === "standard") syncCaptionToVideo();
    });

    preview.addEventListener("ended", function () {
      if (mode === "live") stopLiveSession();
      clearCaption();
      setStatus(mode === "live" ? "Finished" : "Captions ready", false);
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
    updateLiveSourceUi();

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
      ? event.target.closest("[data-action], [data-caption-mode], [data-live-source]")
      : null;
    if (!button) return;

    const captionMode = button.getAttribute("data-caption-mode");
    if (captionMode) {
      event.preventDefault();
      setMode(captionMode);
      return;
    }

    const sourceMode = button.getAttribute("data-live-source");
    if (sourceMode) {
      event.preventDefault();
      setLiveSource(sourceMode);
      return;
    }

    const action = button.getAttribute("data-action");
    if (action === "pick-video") {
      event.preventDefault();
      pickVideo();
      return;
    }

    if (action === "change-video" || action === "change-youtube") {
      event.preventDefault();
      changeMedia();
      return;
    }

    if (action === "open-youtube") {
      event.preventDefault();
      openYouTubeVideo();
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

  const youtubeUrl = q("youtubeUrl");
  if (youtubeUrl) {
    youtubeUrl.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        openYouTubeVideo();
      }
    });
  }

  window.addEventListener("pagehide", function () {
    resetCaptions();
    closeLiveAudio();
    resetVideoUrl();
    clearInterval(lockTimer);

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
