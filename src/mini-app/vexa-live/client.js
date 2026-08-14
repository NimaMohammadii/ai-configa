export const VEXA_LIVE_JS = `
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || "";
  const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
  const SCRIBE_MODEL = "scribe_v2";
  const TRANSLATION_BATCH_SIZE = 24;

  let videoUrl = "";
  let videoFile = null;
  let sourceLanguage = "";
  let targetLanguage = "";
  let toastTimer = null;
  let lockTimer = null;
  let generation = 0;
  let cues = [];
  let activeCueIndex = -1;
  let captionsReady = false;

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
    }, 3400);
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
    const wrap = q("captionPreview");
    const text = q("liveCaptionText");
    if (text) text.textContent = "";
    if (wrap) wrap.classList.remove("show");
  }

  function showCaption(value) {
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
      resetCaptions();
      updateReadyLanguageLabel();
      setPlaybackEnabled(false);
      if (videoFile && ready) {
        prepareCaptions(videoFile, generation).catch(handlePrepareError);
      } else {
        setStatus("Choose languages", false);
      }
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
      ? "CAPTIONS · " + targetName.toUpperCase()
      : sourceName.toUpperCase() + " → " + targetName.toUpperCase();
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
    resetVideoUrl();
    videoFile = file;
    videoUrl = URL.createObjectURL(file);

    const preview = q("videoPreview");
    const picker = q("videoPickerState");
    const ready = q("videoReadyState");
    const name = q("videoName");
    const meta = q("videoMeta");

    if (name) name.textContent = file.name || "Video";
    if (meta) meta.textContent = formatBytes(file.size) + " · Preparing captions";

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
    setStatus("Generating captions", true);
    haptic("medium");

    prepareCaptions(file, generation).catch(handlePrepareError);
  }

  function pickVideo() {
    if (!sourceLanguage || !targetLanguage) {
      toast("Choose both languages first");
      return;
    }
    const input = q("videoFile");
    if (input) input.click();
  }

  async function prepareCaptions(file, currentGeneration) {
    const tokenData = await api("/mini-app/live/api/scribe-token", {
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
    });

    if (currentGeneration !== generation || file !== videoFile) return;

    setStatus("Reading video", true);
    const transcript = await transcribeVideo(file, tokenData.token);

    if (currentGeneration !== generation || file !== videoFile) return;

    let nextCues = buildCues(transcript);
    if (!nextCues.length) {
      throw new Error("No speech was found in this video");
    }

    if (sourceLanguage !== targetLanguage) {
      setStatus("Translating captions", true);
      nextCues = await translateCues(nextCues, currentGeneration);
    }

    if (currentGeneration !== generation || file !== videoFile) return;

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
    form.append("model_id", SCRIBE_MODEL);
    form.append("language_code", sourceLanguage);
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    form.append("no_verbatim", "true");

    const response = await fetch(
      SCRIBE_URL + "?token=" + encodeURIComponent(String(token || "")),
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
      if (currentGeneration !== generation) return translated;

      const batch = sourceCues.slice(offset, offset + TRANSLATION_BATCH_SIZE);
      const data = await api("/mini-app/live/api/translate", {
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        segments: batch.map(function (cue) {
          return { id: cue.id, text: cue.text };
        }),
      });

      if (currentGeneration !== generation) return translated;

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
    if (!preview || !captionsReady || !cues.length) {
      clearCaption();
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

    showCaption(cues[index].text);
  }

  function handlePrepareError(error) {
    captionsReady = false;
    setPlaybackEnabled(true);
    setStatus("Captions failed", false);
    const message = String(error?.message || "Could not generate captions");
    toast(message.length > 180 ? "Could not generate captions" : message);
  }

  function configureVideoEvents() {
    const preview = q("videoPreview");
    if (!preview) return;

    preview.addEventListener("timeupdate", syncCaptionToVideo);
    preview.addEventListener("seeking", syncCaptionToVideo);
    preview.addEventListener("seeked", syncCaptionToVideo);
    preview.addEventListener("play", syncCaptionToVideo);
    preview.addEventListener("pause", syncCaptionToVideo);
    preview.addEventListener("ended", clearCaption);
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
    resetCaptions();
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
