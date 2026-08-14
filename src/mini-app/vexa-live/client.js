export const VEXA_LIVE_JS = `
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || "";
  let videoUrl = "";
  let toastTimer = null;
  let lockTimer = null;

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
    }, 2800);
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
    const app = document.querySelector(".live-app");
    if (app) app.setAttribute("aria-hidden", "true");

    const lock = document.createElement("main");
    lock.className = "live-lock";
    lock.innerHTML =
      '<section class="live-lock-card" aria-label="Vexa Live update">' +
        '<p class="live-lock-title">Updating Vexa Live</p>' +
        '<div class="live-lock-bar" aria-hidden="true"><span></span></div>' +
      '</section>';
    document.body.appendChild(lock);

    const fill = lock.querySelector(".live-lock-bar span");
    const serverNow = Number(data.serverNow) || Math.floor(Date.now() / 1000);
    const lockedFrom = Number(data.lockedFrom) || 0;
    const lockedUntil = Number(data.lockedUntil) || 0;

    if (!lockedUntil || lockedUntil <= serverNow) {
      lock.classList.add("indefinite");
      return;
    }

    const start = lockedFrom > 0 && lockedFrom < lockedUntil
      ? lockedFrom
      : serverNow;
    const total = Math.max(1, lockedUntil - start);
    const offset = serverNow - Date.now() / 1000;

    function tick() {
      const now = Date.now() / 1000 + offset;
      const progress = Math.min(100, Math.max(0, (now - start) / total * 100));
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

  function resetVideoUrl() {
    if (!videoUrl) return;
    URL.revokeObjectURL(videoUrl);
    videoUrl = "";
  }

  function showVideo(file) {
    if (!file || !String(file.type || "").toLowerCase().startsWith("video/")) {
      toast("Choose a video file");
      return;
    }

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

    haptic("medium");
  }

  function pickVideo() {
    const input = q("videoFile");
    if (input) input.click();
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
    link.href = "/mini-app/live/integration.css?v=20260814-1";
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
