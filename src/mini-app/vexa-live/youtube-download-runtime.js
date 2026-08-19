export const YOUTUBE_DOWNLOAD_RUNTIME = String.raw`
(function () {
  const PREPARE_URL = "/mini-app/live/api/youtube-download/prepare";
  const STYLE_ID = "vexaYoutubeDownloadStyle";
  const PANEL_ID = "vexaYoutubeDownload";
  let scanTimer = 0;

  function telegram() {
    try { return window.Telegram && window.Telegram.WebApp || null; } catch (error) { return null; }
  }

  function telegramInitData() {
    try { return String(telegram()?.initData || ""); } catch (error) { return ""; }
  }

  function validYouTubeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (
        host === "youtube.com" ||
        host === "www.youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtu.be"
      );
    } catch (error) {
      return false;
    }
  }

  function setPanelState(panel, busy, message, error) {
    const button = panel && panel.querySelector("button");
    const input = panel && panel.querySelector("input");
    const status = panel && panel.querySelector(".vexa-youtube-status");
    if (button) {
      button.disabled = Boolean(busy);
      button.textContent = busy ? "Preparing…" : "Download";
    }
    if (input) input.disabled = Boolean(busy);
    if (status) {
      status.textContent = String(message || "");
      status.classList.toggle("error", Boolean(error));
      status.classList.toggle("show", Boolean(message));
    }
  }

  function fallbackDownload(doc, absoluteUrl) {
    const link = doc.createElement("a");
    link.href = absoluteUrl;
    link.download = "";
    link.rel = "noopener";
    link.style.display = "none";
    doc.body.appendChild(link);
    link.click();
    window.setTimeout(function () { link.remove(); }, 3000);
  }

  function requestNativeDownload(doc, downloadUrl) {
    const absoluteUrl = new URL(String(downloadUrl), window.location.origin).href;
    const tg = telegram();
    if (tg && typeof tg.downloadFile === "function") {
      let callbackCalled = false;
      try {
        tg.downloadFile({
          url: absoluteUrl,
          file_name: "Vexa YouTube video",
        }, function (accepted) {
          callbackCalled = true;
          if (!accepted) fallbackDownload(doc, absoluteUrl);
        });
        return;
      } catch (error) {
        if (callbackCalled) return;
      }
    }
    fallbackDownload(doc, absoluteUrl);
  }

  async function beginDownload(panel) {
    if (!panel || panel.dataset.busy === "1") return;
    const input = panel.querySelector("input");
    const value = String(input && input.value || "").trim();
    if (!validYouTubeUrl(value)) {
      setPanelState(panel, false, "Paste a valid YouTube link", true);
      return;
    }

    panel.dataset.busy = "1";
    setPanelState(panel, true, "Creating download…", false);
    try {
      const response = await fetch(PREPARE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ initData: telegramInitData(), url: value }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.downloadUrl) {
        throw new Error(String(data.error || "Could not prepare this video"));
      }

      setPanelState(panel, false, "Download ready", false);
      requestNativeDownload(panel.ownerDocument, data.downloadUrl);
      try { telegram()?.HapticFeedback?.notificationOccurred?.("success"); } catch (error) {}
    } catch (error) {
      setPanelState(panel, false, String(error && error.message || "Download failed"), true);
      try { telegram()?.HapticFeedback?.notificationOccurred?.("error"); } catch (ignore) {}
    } finally {
      panel.dataset.busy = "0";
    }
  }

  function install(frame) {
    let doc;
    try { doc = frame && frame.contentDocument; } catch (error) { return false; }
    if (!doc) return false;
    const shell = doc.getElementById("vexaStt");
    if (!shell) return false;
    if (doc.getElementById(PANEL_ID)) return true;

    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent =
        ".vexa-youtube-download{flex:0 0 auto;margin:4px 0 8px;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}" +
        ".vexa-youtube-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}" +
        ".vexa-youtube-input{width:100%;height:40px;border:1px solid rgba(255,255,255,.08);border-radius:11px;outline:0;background:#0c0c0d;color:#fff;padding:0 11px;font:500 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;caret-color:#fff}" +
        ".vexa-youtube-input::placeholder{color:rgba(255,255,255,.26)}" +
        ".vexa-youtube-button{height:40px;min-width:86px;border:0;border-radius:11px;padding:0 13px;background:#fff;color:#050505;font:760 11.5px/1 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;transition:transform .16s ease,opacity .16s ease}" +
        ".vexa-youtube-button:active{transform:scale(.96)}.vexa-youtube-button:disabled{opacity:.5}" +
        ".vexa-youtube-status{height:0;margin:0 3px;color:rgba(255,255,255,.42);font:600 8.5px/1.2 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;opacity:0;overflow:hidden;transition:height .18s ease,margin .18s ease,opacity .18s ease}" +
        ".vexa-youtube-status.show{height:12px;margin-top:6px;opacity:1}.vexa-youtube-status.error{color:rgba(255,180,190,.74)}";
      doc.head.appendChild(style);
    }

    const panel = doc.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "vexa-youtube-download";
    panel.dataset.busy = "0";
    panel.innerHTML =
      '<div class="vexa-youtube-row">' +
        '<input class="vexa-youtube-input" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste YouTube link" aria-label="YouTube link">' +
        '<button class="vexa-youtube-button" type="button">Download</button>' +
      '</div>' +
      '<div class="vexa-youtube-status" role="status" aria-live="polite"></div>';

    const editor = shell.querySelector(".vexa-stt-editor");
    if (editor) shell.insertBefore(panel, editor);
    else shell.prepend(panel);

    const input = panel.querySelector("input");
    const button = panel.querySelector("button");
    button?.addEventListener("click", function () { beginDownload(panel); });
    input?.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      beginDownload(panel);
    });
    return true;
  }

  function scan() {
    if (scanTimer) window.clearTimeout(scanTimer);
    const frame = document.getElementById("vexaLiveInlineFrame");
    if (frame && install(frame)) return;
    scanTimer = window.setTimeout(scan, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (error) {}
})();
`;
