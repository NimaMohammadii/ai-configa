export const VEXA_LIVE_YOUTUBE_JS = `
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || "";
  const BATCH_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
  const BATCH_SCRIBE_MODEL = "scribe_v2";
  const TRANSLATION_BATCH_SIZE = 24;

  let youtubeSelected = false;
  let youtubeLiveActive = false;
  let youtubePlayToken = "";
  let youtubeTitle = "";
  let youtubeSocket = null;
  let youtubeSocketGeneration = 0;
  let translationQueue = Promise.resolve();
  let lastSettledText = "";
  let lastSettledAt = 0;
  let captionTimer = null;
  let fallbackObjectUrl = "";
  let fallbackCues = [];
  let fallbackCueIndex = -1;
  let fallbackStandardActive = false;

  function q(id) {
    return document.getElementById(id);
  }

  function currentMode() {
    const active = document.querySelector("[data-caption-mode].active");
    return active && active.getAttribute("data-caption-mode") === "live" ? "live" : "standard";
  }

  function sourceLanguage() {
    return String(q("sourceLanguage")?.value || "").trim();
  }

  function targetLanguage() {
    return String(q("subtitleLanguage")?.value || "").trim();
  }

  function toast(message) {
    const node = q("liveToast");
    if (!node) return;
    node.textContent = String(message || "");
    node.classList.remove("show");
    void node.offsetWidth;
    node.classList.add("show");
    setTimeout(function () { node.classList.remove("show"); }, 3800);
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
    fallbackCueIndex = -1;
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
    text.dir = targetLanguage() === "fa" || targetLanguage() === "ar" ? "rtl" : "ltr";
    wrap.classList.add("show");
    if (autoClear) {
      clearTimeout(captionTimer);
      captionTimer = setTimeout(clearCaption, 4200);
    }
  }

  async function postJson(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify(Object.assign({ initData: initData }, body || {})),
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function wsUrl(path) {
    const url = new URL(path, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  function safeFileName(value) {
    const base = String(value || "YouTube video")
      .replace(/[\\/:*?\"<>|]+/g, " ")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 100) || "YouTube video";
    return base + ".mp4";
  }

  function decodeTitleHeader(value) {
    const raw = String(value || "").trim();
    if (!raw) return "YouTube video";
    try {
      const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const bytes = Uint8Array.from(atob(padded), function (char) { return char.charCodeAt(0); });
      return new TextDecoder().decode(bytes) || "YouTube video";
    } catch (error) {
      return "YouTube video";
    }
  }

  function stopYoutubeLive() {
    youtubeSocketGeneration += 1;
    translationQueue = Promise.resolve();
    const socket = youtubeSocket;
    youtubeSocket = null;
    if (socket) {
      try {
        socket.onclose = null;
        socket.close();
      } catch (error) {}
    }
  }

  function resetPluginMedia() {
    stopYoutubeLive();
    youtubeLiveActive = false;
    youtubePlayToken = "";
    youtubeTitle = "";
    fallbackStandardActive = false;
    fallbackCues = [];
    clearCaption();
    if (fallbackObjectUrl) {
      URL.revokeObjectURL(fallbackObjectUrl);
      fallbackObjectUrl = "";
    }
  }

  function syncSourceUi() {
    const switcher = q("liveSourceSwitch");
    if (switcher) switcher.classList.add("show");

    document.querySelectorAll("[data-live-source]").forEach(function (button) {
      const isYoutube = button.getAttribute("data-live-source") === "youtube";
      const active = isYoutube ? youtubeSelected : !youtubeSelected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const choose = q("chooseVideoButton");
    const youtubeState = q("youtubeInputState");
    if (choose) choose.classList.toggle("is-hidden", youtubeSelected);
    if (youtubeState) youtubeState.classList.toggle("show", youtubeSelected);

    const note = youtubeState && youtubeState.querySelector(".youtube-note");
    if (note) {
      note.textContent = currentMode() === "live"
        ? "The YouTube video streams inside Vexa while Scribe Realtime generates captions. Use only videos you have permission to process."
        : "Vexa imports the YouTube video first, then runs the same Standard caption pipeline. Use only videos you have permission to process.";
    }

    const openButton = q("openYoutubeButton");
    if (openButton) {
      openButton.textContent = currentMode() === "live" ? "Start" : "Import";
      openButton.disabled = !(sourceLanguage() && targetLanguage());
    }

    const readyIframe = q("youtubeReadyState");
    if (readyIframe) {
      readyIframe.classList.remove("show");
      readyIframe.setAttribute("aria-hidden", "true");
    }
  }

  function setYoutubeSelected(value) {
    resetPluginMedia();
    youtubeSelected = Boolean(value);
    const picker = q("videoPickerState");
    if (picker) picker.style.display = "";
    syncSourceUi();
    try {
      tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light");
    } catch (error) {}
  }

  function showVideoStage(title, meta) {
    const picker = q("videoPickerState");
    const ready = q("videoReadyState");
    const name = q("videoName");
    const metaNode = q("videoMeta");
    const modeLabel = q("captionModeLabel");

    if (picker) picker.style.display = "none";
    if (ready) {
      ready.classList.add("show");
      ready.setAttribute("aria-hidden", "false");
    }
    if (name) name.textContent = title || "YouTube video";
    if (metaNode) metaNode.textContent = meta || "YouTube";
    if (modeLabel) {
      modeLabel.textContent = currentMode() === "live" ? "LIVE · YOUTUBE" : "CAPTIONS · YOUTUBE";
    }
  }

  async function importStandardYouTube(url) {
    resetPluginMedia();
    setStatus("Downloading YouTube video", true);

    const response = await fetch("/mini-app/live/api/youtube/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ initData: initData, url: url }),
    });

    if (!response.ok) {
      const data = await response.json().catch(function () { return {}; });
      throw new Error(data.error || "Could not import YouTube video");
    }

    const title = decodeTitleHeader(response.headers.get("X-Vexa-Title"));
    const blob = await response.blob();
    const file = new File([blob], safeFileName(title), { type: "video/mp4" });

    const input = q("videoFile");
    if (input && typeof DataTransfer === "function") {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        if (input.files && input.files.length === 1) {
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      } catch (error) {}
    }

    await runStandardFallback(file, title);
  }

  async function runStandardFallback(file, title) {
    resetPluginMedia();
    fallbackStandardActive = true;
    fallbackObjectUrl = URL.createObjectURL(file);
    const preview = q("videoPreview");
    if (!preview) throw new Error("Video player is unavailable");

    showVideoStage(title, "YouTube import · " + Math.max(1, Math.round(file.size / 1024 / 1024)) + " MB");
    preview.src = fallbackObjectUrl;
    preview.controls = false;
    preview.load();

    setStatus("Generating captions", true);
    const tokenData = await postJson("/mini-app/live/api/scribe-token", {
      mode: "standard",
      sourceLanguage: sourceLanguage(),
      targetLanguage: targetLanguage(),
    });

    const form = new FormData();
    form.append("file", file, file.name || "youtube.mp4");
    form.append("model_id", BATCH_SCRIBE_MODEL);
    form.append("language_code", sourceLanguage());
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    form.append("no_verbatim", "true");

    const transcription = await fetch(
      BATCH_SCRIBE_URL + "?token=" + encodeURIComponent(tokenData.token),
      { method: "POST", body: form }
    );
    const transcript = await transcription.json().catch(function () { return {}; });
    if (!transcription.ok) {
      throw new Error(transcript?.detail?.message || transcript?.message || "Could not generate captions");
    }

    let nextCues = buildCues(transcript);
    if (!nextCues.length) throw new Error("No speech was found in this video");
    if (sourceLanguage() !== targetLanguage()) {
      setStatus("Translating captions", true);
      nextCues = await translateCues(nextCues);
    }

    fallbackCues = nextCues;
    preview.controls = true;
    setStatus("Captions ready", false);
  }

  function buildCues(transcript) {
    const words = (Array.isArray(transcript?.words) ? transcript.words : [])
      .map(function (item) {
        return { text: String(item?.text || "").trim(), start: Number(item?.start), end: Number(item?.end) };
      })
      .filter(function (item) {
        return item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start;
      });
    const result = [];
    let group = [];

    function flush() {
      if (!group.length) return;
      const first = group[0];
      const last = group[group.length - 1];
      const text = joinTokens(group.map(function (item) { return item.text; }));
      if (text) {
        result.push({ id: result.length, start: Math.max(0, first.start - 0.06), end: last.end + 0.22, text: text });
      }
      group = [];
    }

    words.forEach(function (word, index) {
      group.push(word);
      const first = group[0];
      const next = words[index + 1];
      const duration = word.end - first.start;
      if (!next || next.start - word.end > 0.72 || group.length >= 10 || duration >= 3.15 || /[.!?؟。！？]$/.test(word.text)) {
        flush();
      }
    });
    return result;
  }

  function joinTokens(tokens) {
    if (sourceLanguage() === "zh" || sourceLanguage() === "ja") {
      return tokens.join("").replace(/\\s+/g, "").trim();
    }
    return tokens.join(" ")
      .replace(/\\s+([,.;:!?؟،؛。！？])/g, "$1")
      .replace(/\\s+/g, " ")
      .trim();
  }

  async function translateCues(sourceCues) {
    const translated = sourceCues.map(function (cue) { return Object.assign({}, cue); });
    for (let offset = 0; offset < sourceCues.length; offset += TRANSLATION_BATCH_SIZE) {
      const batch = sourceCues.slice(offset, offset + TRANSLATION_BATCH_SIZE);
      const data = await postJson("/mini-app/live/api/translate", {
        sourceLanguage: sourceLanguage(),
        targetLanguage: targetLanguage(),
        segments: batch.map(function (cue) { return { id: cue.id, text: cue.text }; }),
      });
      const byId = new Map((data.segments || []).map(function (item) {
        return [Number(item.id), String(item.text || "").trim()];
      }));
      batch.forEach(function (cue) {
        const text = byId.get(cue.id);
        if (!text) throw new Error("Could not translate captions");
        translated[cue.id].text = text;
      });
      setStatus("Translating " + Math.round(Math.min(sourceCues.length, offset + batch.length) / sourceCues.length * 100) + "%", true);
    }
    return translated;
  }

  function syncFallbackCaption() {
    if (!fallbackStandardActive || !fallbackCues.length || currentMode() !== "standard") return;
    const preview = q("videoPreview");
    if (!preview) return;
    const time = Number(preview.currentTime) || 0;
    let found = -1;
    for (let index = 0; index < fallbackCues.length; index += 1) {
      const cue = fallbackCues[index];
      if (time >= cue.start && time <= cue.end) {
        found = index;
        break;
      }
      if (cue.start > time) break;
    }
    if (found === fallbackCueIndex) return;
    fallbackCueIndex = found;
    if (found < 0) clearCaption();
    else showCaption(fallbackCues[found].text, false);
  }

  async function prepareLiveYouTube(url) {
    resetPluginMedia();
    setStatus("Preparing YouTube", true);
    const data = await postJson("/mini-app/live/api/youtube/prepare", { url: url });
    youtubeLiveActive = true;
    youtubePlayToken = String(data.playToken || "");
    youtubeTitle = String(data.title || "YouTube video");
    if (!youtubePlayToken || !data.mediaUrl) throw new Error("Could not prepare YouTube video");

    const preview = q("videoPreview");
    if (!preview) throw new Error("Video player is unavailable");
    showVideoStage(youtubeTitle, data.duration ? Math.round(Number(data.duration) / 60) + " min · YouTube Live" : "YouTube Live");
    preview.src = String(data.mediaUrl);
    preview.controls = true;
    preview.load();
    setStatus("Play for live captions", false);
  }

  async function startYoutubeRealtime(startTime) {
    if (!youtubeLiveActive || !youtubePlayToken || currentMode() !== "live") return;
    stopYoutubeLive();
    const socketGeneration = ++youtubeSocketGeneration;
    setStatus("Connecting live", true);

    const tokenData = await postJson("/mini-app/live/api/scribe-token", {
      mode: "live",
      sourceLanguage: sourceLanguage(),
      targetLanguage: targetLanguage(),
    });
    if (socketGeneration !== youtubeSocketGeneration || !youtubeLiveActive) return;

    const socket = new WebSocket(wsUrl("/mini-app/live/api/youtube/live?token=" + encodeURIComponent(youtubePlayToken)));
    youtubeSocket = socket;
    translationQueue = Promise.resolve();
    lastSettledText = "";
    lastSettledAt = 0;

    socket.onopen = function () {
      if (socketGeneration !== youtubeSocketGeneration) return;
      socket.send(JSON.stringify({
        scribeToken: tokenData.token,
        sourceLanguage: sourceLanguage(),
        startTime: Math.max(0, Number(startTime) || 0),
      }));
      setStatus("Live", true);
    };

    socket.onmessage = function (event) {
      if (socketGeneration !== youtubeSocketGeneration) return;
      handleRealtimeMessage(event, socketGeneration);
    };

    socket.onerror = function () {
      if (socketGeneration !== youtubeSocketGeneration) return;
      setStatus("Live connection issue", false);
    };

    socket.onclose = function () {
      if (socketGeneration !== youtubeSocketGeneration || youtubeSocket !== socket) return;
      youtubeSocket = null;
      const preview = q("videoPreview");
      if (preview && !preview.paused && !preview.ended && youtubeLiveActive) {
        setStatus("Tap play to reconnect", false);
      }
    };
  }

  function handleRealtimeMessage(event, socketGeneration) {
    let data;
    try { data = JSON.parse(event.data); } catch (error) { return; }
    const type = String(data.message_type || "");
    const text = String(data.text || "").trim();

    if (type === "session_started") {
      setStatus("Live", true);
      return;
    }
    if (type === "partial_transcript") {
      if (sourceLanguage() === targetLanguage() && text) showCaption(text, false);
      return;
    }
    if (
      type === "final_transcript" ||
      type === "final_transcript_with_timestamps" ||
      type === "committed_transcript" ||
      type === "committed_transcript_with_timestamps"
    ) {
      handleSettledText(text, socketGeneration);
      return;
    }
    if (type.endsWith("error") || type === "quota_exceeded" || type === "rate_limited" || type === "unaccepted_terms" || type === "resource_exhausted") {
      toast(String(data.error || data.message || "Live captions stopped"));
      setStatus("Live stopped", false);
    }
  }

  function handleSettledText(text, socketGeneration) {
    if (!text) return;
    const timestamp = Date.now();
    if (text === lastSettledText && timestamp - lastSettledAt < 2500) return;
    lastSettledText = text;
    lastSettledAt = timestamp;

    if (sourceLanguage() === targetLanguage()) {
      showCaption(text, true);
      return;
    }

    translationQueue = translationQueue.then(async function () {
      if (socketGeneration !== youtubeSocketGeneration || !youtubeLiveActive) return;
      const data = await postJson("/mini-app/live/api/translate", {
        sourceLanguage: sourceLanguage(),
        targetLanguage: targetLanguage(),
        text: text,
      });
      if (socketGeneration !== youtubeSocketGeneration || !youtubeLiveActive) return;
      showCaption(data.text, true);
    }).catch(function (error) {
      if (socketGeneration === youtubeSocketGeneration) toast(error.message || "Could not translate live caption");
    });
  }

  async function openYoutube() {
    if (!sourceLanguage() || !targetLanguage()) {
      toast("Choose both languages first");
      return;
    }
    const url = String(q("youtubeUrl")?.value || "").trim();
    if (!url) {
      toast("Paste a YouTube link");
      return;
    }
    try {
      if (currentMode() === "live") await prepareLiveYouTube(url);
      else await importStandardYouTube(url);
    } catch (error) {
      setStatus(currentMode() === "live" ? "YouTube unavailable" : "Import failed", false);
      toast(error.message || "Could not import YouTube video");
    }
  }

  function configureVideoEvents() {
    const preview = q("videoPreview");
    if (!preview) return;
    preview.addEventListener("timeupdate", syncFallbackCaption);
    preview.addEventListener("seeking", function () {
      if (!youtubeLiveActive || currentMode() !== "live") return;
      stopYoutubeLive();
      clearCaption();
      setStatus("Seeking", false);
    });
    preview.addEventListener("seeked", function () {
      if (!youtubeLiveActive || currentMode() !== "live") return;
      if (!preview.paused && !preview.ended) {
        startYoutubeRealtime(preview.currentTime).catch(function (error) { toast(error.message); });
      } else {
        setStatus("Play for live captions", false);
      }
    });
    preview.addEventListener("play", function () {
      if (!youtubeLiveActive || currentMode() !== "live") return;
      if (!youtubeSocket || youtubeSocket.readyState !== WebSocket.OPEN) {
        startYoutubeRealtime(preview.currentTime).catch(function (error) {
          setStatus("Live unavailable", false);
          toast(error.message || "Could not start live captions");
        });
      }
    });
    preview.addEventListener("pause", function () {
      if (!youtubeLiveActive || currentMode() !== "live") return;
      stopYoutubeLive();
      setStatus("Paused", false);
    });
    preview.addEventListener("ended", function () {
      if (!youtubeLiveActive) return;
      stopYoutubeLive();
      clearCaption();
      setStatus("Finished", false);
    });
  }

  function installStyles() {
    if (document.getElementById("vexaYoutubeImportStyles")) return;
    const style = document.createElement("style");
    style.id = "vexaYoutubeImportStyles";
    style.textContent =
      "#liveSourceSwitch{display:grid!important;opacity:1!important;transform:none!important}" +
      "#youtubeReadyState{display:none!important}";
    document.head.appendChild(style);
  }

  function initialize() {
    installStyles();
    configureVideoEvents();
    syncSourceUi();

    document.addEventListener("click", function (event) {
      const sourceButton = event.target && event.target.closest ? event.target.closest("[data-live-source]") : null;
      if (sourceButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setYoutubeSelected(sourceButton.getAttribute("data-live-source") === "youtube");
        return;
      }

      const openButton = event.target && event.target.closest ? event.target.closest("[data-action='open-youtube']") : null;
      if (openButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openYoutube();
      }
    }, true);

    document.addEventListener("click", function (event) {
      const modeButton = event.target && event.target.closest ? event.target.closest("[data-caption-mode]") : null;
      if (modeButton) {
        resetPluginMedia();
        setTimeout(syncSourceUi, 0);
      }
      const changeButton = event.target && event.target.closest ? event.target.closest("[data-action='change-video'],[data-action='change-youtube']") : null;
      if (changeButton) {
        resetPluginMedia();
        setTimeout(syncSourceUi, 0);
      }
    });

    const source = q("sourceLanguage");
    const target = q("subtitleLanguage");
    if (source) source.addEventListener("change", syncSourceUi);
    if (target) target.addEventListener("change", syncSourceUi);

    const youtubeInput = q("youtubeUrl");
    if (youtubeInput) {
      youtubeInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && youtubeSelected) {
          event.preventDefault();
          event.stopImmediatePropagation();
          openYoutube();
        }
      }, true);
    }

    window.addEventListener("pagehide", resetPluginMedia);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
`;
