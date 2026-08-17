function vexaSttExportBootstrap() {
  const API = "/mini-app/live/api/projects";
  const MAX_EXPORT_SOURCE_BYTES = 1536 * 1024 * 1024;
  const state = {
    selection: 0,
    file: null,
    uploadId: "",
    uploadPromise: null,
    sourceKey: "",
    cues: [],
    language: "en",
    projectId: "",
    exportUrl: "",
    filename: "",
    exporting: false,
    lastError: "",
  };

  const q = (id) => document.getElementById(id);

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) {
        return window.parent;
      }
    } catch (error) {}
    return window;
  }

  function telegram() {
    const host = hostWindow();
    return window.Telegram?.WebApp || host.Telegram?.WebApp || null;
  }

  function initData() {
    return String(telegram()?.initData || "");
  }

  function haptic(kind) {
    const tg = telegram();
    try {
      if (kind === "success") tg?.HapticFeedback?.notificationOccurred?.("success");
      else tg?.HapticFeedback?.impactOccurred?.(kind || "light");
    } catch (error) {}
  }

  function installStyles() {
    if (q("vexaSttExportStyles")) return;
    const style = document.createElement("style");
    style.id = "vexaSttExportStyles";
    style.textContent = `
      .vexa-video-export{position:fixed;z-index:8;left:16px;right:16px;bottom:calc(68px + env(safe-area-inset-bottom));min-height:48px;display:flex;align-items:center;gap:10px;padding:6px;border-radius:15px;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 14px 34px rgba(0,0,0,.3);backdrop-filter:blur(12px) saturate(1.12);-webkit-backdrop-filter:blur(12px) saturate(1.12);opacity:0;transform:translateY(8px) scale(.985);pointer-events:none;transition:opacity .2s ease,transform .34s cubic-bezier(.16,1,.3,1)}
      .vexa-video-export.show{opacity:1;transform:none;pointer-events:auto}
      .vexa-video-export-copy{position:relative;min-width:0;flex:1;height:36px;display:flex;align-items:center;padding:0 10px;overflow:hidden;color:rgba(255,255,255,.68);font-size:10.5px;font-weight:650;letter-spacing:-.01em}
      .vexa-video-export-copy::after{content:"";position:absolute;left:10px;right:10px;bottom:4px;height:1px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
      .vexa-video-export.busy .vexa-video-export-copy::before{content:"";position:absolute;z-index:2;left:10px;bottom:4px;width:42px;height:1px;border-radius:99px;background:rgba(255,255,255,.76);box-shadow:0 0 8px rgba(255,255,255,.18);animation:vexaExportProgress 1.45s cubic-bezier(.4,0,.2,1) infinite}
      .vexa-video-export-button{height:36px;min-width:114px;padding:0 13px;border:0;border-radius:11px;display:none;align-items:center;justify-content:center;gap:7px;background:#fff;color:#050505;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(0,0,0,.1),0 8px 20px rgba(0,0,0,.28);font-size:10.5px;font-weight:760;letter-spacing:-.015em;transition:transform .2s cubic-bezier(.16,1,.3,1),opacity .2s ease}
      .vexa-video-export-button:active{transform:scale(.96)}
      .vexa-video-export.ready .vexa-video-export-copy{display:none}
      .vexa-video-export.ready .vexa-video-export-button{display:flex;flex:1}
      .vexa-video-export.error .vexa-video-export-copy{color:rgba(255,255,255,.5)}
      .vexa-video-export.error .vexa-video-export-copy::before,.vexa-video-export.error .vexa-video-export-copy::after{display:none}
      .vexa-video-export.error .vexa-video-export-button{display:flex;min-width:88px;background:rgba(255,255,255,.09);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
      body.vexa-stt-embedded .vexa-stt.processing .vexa-video-export{opacity:0!important;transform:translateY(8px) scale(.985)!important;pointer-events:none!important}
      @keyframes vexaExportProgress{0%{left:10px;opacity:0}18%{opacity:1}82%{opacity:1}100%{left:calc(100% - 52px);opacity:0}}
      @media(prefers-reduced-motion:reduce){.vexa-video-export,.vexa-video-export-button,.vexa-video-export.busy .vexa-video-export-copy::before{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    const shell = q("vexaStt");
    if (!shell) return null;
    let card = q("vexaVideoExport");
    if (card) return card;

    card = document.createElement("section");
    card.id = "vexaVideoExport";
    card.className = "vexa-video-export";
    card.setAttribute("aria-live", "polite");
    card.innerHTML =
      '<div class="vexa-video-export-copy" id="vexaVideoExportCopy">Preparing captioned video</div>' +
      '<button class="vexa-video-export-button" id="vexaVideoExportButton" type="button">Download video</button>';
    shell.appendChild(card);

    q("vexaVideoExportButton")?.addEventListener("click", async () => {
      if (state.lastError) {
        state.lastError = "";
        await maybeExport(state.selection, true);
        return;
      }
      if (!state.exportUrl) return;
      haptic("medium");
      const link = document.createElement("a");
      link.href = state.exportUrl;
      link.download = state.filename || "Vexa.mp4";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    return card;
  }

  function setCard(mode, text) {
    installStyles();
    const card = ensureCard();
    if (!card) return;
    const copy = q("vexaVideoExportCopy");
    const button = q("vexaVideoExportButton");
    card.classList.remove("busy", "ready", "error");
    if (!mode) {
      card.classList.remove("show");
      return;
    }
    card.classList.add("show", mode);
    if (copy) copy.textContent = String(text || "Preparing captioned video");
    if (button) button.textContent = mode === "error" ? "Try again" : "Download video";
    const nativeStatus = q("vexaSttStatus");
    nativeStatus?.classList.remove("show");
  }

  async function api(path, body) {
    const response = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify(Object.assign({ initData: initData() }, body || {})),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || "Video export failed"));
    return data;
  }

  async function uploadVideo(file, selection) {
    const start = await api("/upload/start", {
      name: file.name || "video.mp4",
      mime: file.type || "video/mp4",
      size: file.size,
    });
    if (selection !== state.selection) throw new Error("Video changed");
    state.uploadId = String(start.uploadId || "");
    const partSize = Math.max(1024 * 1024, Number(start.partSize) || 8 * 1024 * 1024);
    const parts = [];

    try {
      const totalParts = Math.max(1, Math.ceil(file.size / partSize));
      for (let index = 0; index < totalParts; index += 1) {
        if (selection !== state.selection) throw new Error("Video changed");
        const partNumber = index + 1;
        const chunk = file.slice(index * partSize, Math.min(file.size, (index + 1) * partSize));
        const response = await fetch(
          API + "/upload/part?uploadId=" + encodeURIComponent(state.uploadId) + "&partNumber=" + partNumber,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Telegram-Init-Data": initData(),
            },
            body: chunk,
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error || "Could not upload video"));
        parts.push({ partNumber: Number(data.partNumber), etag: String(data.etag || "") });
        const percent = Math.round((partNumber / totalParts) * 100);
        if (q("vexaVideoExport")?.classList.contains("show")) {
          setCard("busy", "Uploading video · " + percent + "%");
        }
      }

      const completed = await api("/upload/complete", { uploadId: state.uploadId, parts });
      if (selection !== state.selection) throw new Error("Video changed");
      state.sourceKey = String(completed.sourceKey || start.sourceKey || "");
      return state.sourceKey;
    } catch (error) {
      if (state.uploadId) {
        api("/upload/abort", { uploadId: state.uploadId }).catch(() => {});
      }
      throw error;
    }
  }

  function normalizeLanguage(value) {
    const code = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(code) ? code : "en";
  }

  function buildCues(data) {
    const language = normalizeLanguage(data?.language_code || data?.language || "en");
    const cjk = language === "zh" || language === "ja";
    const words = (Array.isArray(data?.words) ? data.words : [])
      .map((item) => ({
        text: String(item?.text || item?.word || "").trim(),
        start: Number(item?.start),
        end: Number(item?.end),
      }))
      .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start);
    if (!words.length) return [];

    const result = [];
    let group = [];
    const join = (items) => {
      const text = cjk ? items.join("") : items.join(" ");
      return text.replace(/\s+([,.;:!?؟،؛。！？])/g, "$1").replace(/\s+/g, " ").trim();
    };
    const flush = () => {
      if (!group.length) return;
      const first = group[0];
      const last = group[group.length - 1];
      const text = join(group.map((item) => item.text));
      if (text) {
        result.push({
          id: result.length,
          start: Math.max(0, first.start - 0.06),
          end: Math.max(first.start + 0.15, last.end + 0.2),
          text,
        });
      }
      group = [];
    };

    words.forEach((word, index) => {
      group.push(word);
      const first = group[0];
      const next = words[index + 1];
      const duration = word.end - first.start;
      const textLength = join(group.map((item) => item.text)).length;
      if (
        !next ||
        next.start - word.end > 0.72 ||
        group.length >= 9 ||
        duration >= 3.0 ||
        textLength >= 48 ||
        (/[.!?؟。！？]$/.test(word.text) && duration >= 0.9)
      ) flush();
    });
    return result;
  }

  function titleFromFile(file) {
    return String(file?.name || "Vexa video").replace(/\.[^.]+$/, "").trim().slice(0, 100) || "Vexa video";
  }

  async function maybeExport(selection, force) {
    if (selection !== state.selection || !state.file || !state.cues.length || !state.uploadPromise) return;
    if (state.exporting && !force) return;
    state.exporting = true;
    state.lastError = "";
    setCard("busy", "Preparing captioned video");

    try {
      const sourceKey = await state.uploadPromise;
      if (selection !== state.selection) return;
      if (!sourceKey) throw new Error("Uploaded video was not found");
      setCard("busy", "Rendering captions");

      const saved = await api("/save", {
        title: titleFromFile(state.file),
        sourceKind: "local",
        sourceName: state.file.name || "video.mp4",
        sourceMime: state.file.type || "video/mp4",
        sourceSize: state.file.size,
        sourceDuration: 0,
        sourceKey,
        sourceLanguage: state.language,
        targetLanguage: state.language,
        mode: "standard",
        cues: state.cues,
        style: {
          x: 50,
          y: 76,
          fontSize: 54,
          background: false,
          fontWeight: "bold",
          textColor: "#ffffff",
        },
      });
      if (selection !== state.selection) return;
      state.projectId = String(saved.projectId || "");
      if (!state.projectId) throw new Error("Could not create video project");

      const exported = await api("/export", { projectId: state.projectId });
      if (selection !== state.selection) return;
      state.exportUrl = String(exported.exportUrl || "");
      state.filename = String(exported.filename || "Vexa.mp4");
      if (!state.exportUrl) throw new Error("Exported video is unavailable");
      setCard("ready", "");
      haptic("success");
    } catch (error) {
      if (selection !== state.selection) return;
      state.lastError = String(error?.message || "Could not create captioned video");
      setCard("error", state.lastError);
      haptic("light");
    } finally {
      if (selection === state.selection) state.exporting = false;
    }
  }

  function handleTranscript(data) {
    if (!state.file || !String(state.file.type || "").toLowerCase().startsWith("video/")) return;
    const cues = buildCues(data);
    if (!cues.length) {
      state.lastError = "No timed speech was found in this video";
      setCard("error", state.lastError);
      return;
    }
    state.language = normalizeLanguage(data?.language_code || data?.language || data?.detected_language || "en");
    state.cues = cues;
    maybeExport(state.selection).catch(() => {});
  }

  function installParentFetchObserver() {
    const host = hostWindow();
    if (!host.__vexaSttExportListeners) host.__vexaSttExportListeners = new Set();
    host.__vexaSttExportListeners.add(handleTranscript);

    if (host.__vexaSttExportFetchPatched) return;
    host.__vexaSttExportFetchPatched = true;
    const original = host.fetch.bind(host);
    host.__vexaSttExportOriginalFetch = original;
    host.fetch = async function (input, init) {
      const response = await original(input, init);
      try {
        const url = typeof input === "string" ? input : String(input?.url || "");
        if (response.ok && url.includes("/v1/speech-to-text") && !url.includes("/realtime")) {
          response.clone().json().then((data) => {
            const listeners = Array.from(host.__vexaSttExportListeners || []);
            listeners.forEach((listener) => {
              try { listener(data); } catch (error) {}
            });
          }).catch(() => {});
        }
      } catch (error) {}
      return response;
    };
  }

  function resetForFile(file) {
    const previousProject = state.projectId;
    state.selection += 1;
    state.file = file;
    state.uploadId = "";
    state.sourceKey = "";
    state.cues = [];
    state.language = "en";
    state.projectId = "";
    state.exportUrl = "";
    state.filename = "";
    state.exporting = false;
    state.lastError = "";
    setCard(null, "");

    if (previousProject) {
      api("/delete", { projectId: previousProject }).catch(() => {});
    }

    if (!file || !String(file.type || "").toLowerCase().startsWith("video/")) {
      state.file = null;
      state.uploadPromise = null;
      return;
    }
    if (file.size > MAX_EXPORT_SOURCE_BYTES) {
      state.lastError = "Video is too large to export";
      setCard("error", state.lastError);
      state.uploadPromise = null;
      return;
    }

    const selection = state.selection;
    state.uploadPromise = uploadVideo(file, selection).catch((error) => {
      if (selection === state.selection) {
        state.lastError = String(error?.message || "Could not upload video");
        setCard("error", state.lastError);
      }
      throw error;
    });
  }

  function installFileCapture() {
    document.addEventListener("change", (event) => {
      const input = event.target;
      if (!input || input.id !== "vexaSttFile") return;
      const file = input.files && input.files[0];
      if (!file) return;
      resetForFile(file);
    }, true);
  }

  function installDomObserver() {
    const observer = new MutationObserver(() => {
      if (q("vexaStt")) {
        installStyles();
        ensureCard();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (q("vexaStt")) {
      installStyles();
      ensureCard();
    }
  }

  function initialize() {
    installParentFetchObserver();
    installFileCapture();
    installDomObserver();
    window.addEventListener("pagehide", () => {
      try { hostWindow().__vexaSttExportListeners?.delete(handleTranscript); } catch (error) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}

export const VEXA_STT_EXPORT_JS = "(" + vexaSttExportBootstrap.toString() + ")();";
