const CUSTOM_PLAYER_PATH = "/mini-app/vexa-live/custom-player.js";
const CUSTOM_PLAYER_VERSION = "20260819-1";

const CUSTOM_PLAYER_CSS = String.raw`
#vexaCustomPlayer{position:absolute;inset:0;overflow:hidden;background:#000;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#vexaCustomPlayer .vexa-live-video{position:absolute;inset:0;width:100%;height:100%;min-height:0!important;object-fit:contain;background:#000;pointer-events:none}
#vexaCustomPlayer .vexa-player-controls{position:absolute;inset:0;z-index:4;opacity:1;transition:opacity .2s ease;pointer-events:none}
#vexaCustomPlayer.is-controls-hidden .vexa-player-controls{opacity:0}
#vexaCustomPlayer.is-controls-hidden .vexa-player-interactive{pointer-events:none!important}
#vexaCustomPlayer .vexa-player-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28),transparent 27%,transparent 55%,rgba(0,0,0,.68));pointer-events:none}
#vexaCustomPlayer .vexa-player-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:15px;pointer-events:auto}
#vexaCustomPlayer .vexa-player-btn{width:42px;height:42px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(13,13,15,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 8px 24px rgba(0,0,0,.28);transition:transform .14s ease,background .14s ease}
#vexaCustomPlayer .vexa-player-btn:active{transform:scale(.91);background:rgba(35,35,38,.76)}
#vexaCustomPlayer .vexa-player-btn svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
#vexaCustomPlayer .vexa-player-main{width:58px;height:58px;background:rgba(255,255,255,.94);color:#050505;box-shadow:0 12px 34px rgba(0,0,0,.36),inset 0 -1px 0 rgba(0,0,0,.16)}
#vexaCustomPlayer .vexa-player-main svg{width:25px;height:25px;stroke-width:2.1}
#vexaCustomPlayer .vexa-icon-pause{display:none}
#vexaCustomPlayer.is-playing .vexa-icon-play{display:none}
#vexaCustomPlayer.is-playing .vexa-icon-pause{display:block}
#vexaCustomPlayer .vexa-player-bottom{position:absolute;left:0;right:0;bottom:0;padding:0 13px calc(11px + env(safe-area-inset-bottom));pointer-events:none}
#vexaCustomPlayer .vexa-seek{position:relative;height:24px;display:flex;align-items:center;cursor:pointer;touch-action:none;pointer-events:auto;--played:0%;--buffered:0%}
#vexaCustomPlayer .vexa-seek-track{position:absolute;left:0;right:0;height:3px;border-radius:99px;background:rgba(255,255,255,.23);overflow:hidden;transition:height .14s ease}
#vexaCustomPlayer .vexa-seek:hover .vexa-seek-track,#vexaCustomPlayer .vexa-seek.is-dragging .vexa-seek-track{height:5px}
#vexaCustomPlayer .vexa-seek-buffer{position:absolute;left:0;top:0;bottom:0;width:var(--buffered);background:rgba(255,255,255,.34)}
#vexaCustomPlayer .vexa-seek-played{position:absolute;left:0;top:0;bottom:0;width:var(--played);background:#fff}
#vexaCustomPlayer .vexa-seek-thumb{position:absolute;left:var(--played);top:50%;width:12px;height:12px;border-radius:50%;background:#fff;transform:translate(-50%,-50%) scale(.74);box-shadow:0 1px 8px rgba(0,0,0,.42);transition:transform .14s ease}
#vexaCustomPlayer .vexa-seek:hover .vexa-seek-thumb,#vexaCustomPlayer .vexa-seek.is-dragging .vexa-seek-thumb{transform:translate(-50%,-50%) scale(1)}
#vexaCustomPlayer .vexa-player-row{height:36px;display:flex;align-items:center;gap:9px;pointer-events:auto}
#vexaCustomPlayer .vexa-player-small{width:32px;height:32px;border:0;padding:0;border-radius:9px;display:grid;place-items:center;color:#fff;background:transparent}
#vexaCustomPlayer .vexa-player-small:active{background:rgba(255,255,255,.12)}
#vexaCustomPlayer .vexa-player-small svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
#vexaCustomPlayer .vexa-player-time{font-size:10.5px;font-weight:700;letter-spacing:.01em;color:rgba(255,255,255,.88);font-variant-numeric:tabular-nums;white-space:nowrap}
#vexaCustomPlayer .vexa-player-spacer{flex:1}
#vexaCustomPlayer .vexa-volume{display:flex;align-items:center;gap:5px}
#vexaCustomPlayer .vexa-volume-slider{width:68px;height:24px;accent-color:#fff}
#vexaCustomPlayer[data-ios="1"] .vexa-volume-slider{display:none}
#vexaCustomPlayer .vexa-icon-volume-off{display:none}
#vexaCustomPlayer.is-muted .vexa-icon-volume{display:none}
#vexaCustomPlayer.is-muted .vexa-icon-volume-off{display:block}
#vexaCustomPlayer .vexa-icon-compress{display:none}
#vexaCustomPlayer.is-fullscreen .vexa-icon-expand{display:none}
#vexaCustomPlayer.is-fullscreen .vexa-icon-compress{display:block}
#vexaCustomPlayer .vexa-player-buffer{position:absolute;left:50%;top:50%;z-index:5;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(255,255,255,.22);border-top-color:#fff;opacity:0;pointer-events:none;animation:vexaPlayerSpin .8s linear infinite;transition:opacity .14s ease}
#vexaCustomPlayer.is-buffering .vexa-player-buffer{opacity:1}
#vexaCustomPlayer.is-buffering .vexa-player-center{opacity:.25}
#vexaCustomPlayer .vexa-skip-flash{position:absolute;top:50%;z-index:3;min-width:74px;height:74px;margin-top:-37px;border-radius:50%;display:flex;align-items:center;justify-content:center;gap:2px;color:#fff;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:12px;font-weight:820;opacity:0;transform:scale(.82);pointer-events:none}
#vexaCustomPlayer .vexa-skip-flash.left{left:11%}
#vexaCustomPlayer .vexa-skip-flash.right{right:11%}
#vexaCustomPlayer .vexa-skip-flash.show{animation:vexaSkipFlash .52s cubic-bezier(.16,1,.3,1)}
#vexaCustomPlayer.is-fullscreen{position:fixed;inset:0;z-index:2147483000;border-radius:0;background:#000}
html.vexa-player-fullscreen-page,html.vexa-player-fullscreen-page body{overflow:hidden!important;background:#000!important}
html.vexa-player-fullscreen-page .vexa-live-stage{overflow:visible!important;border-radius:0!important}
@keyframes vexaPlayerSpin{to{transform:rotate(360deg)}}
@keyframes vexaSkipFlash{0%{opacity:0;transform:scale(.76)}22%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.08)}}
@media(max-width:430px){#vexaCustomPlayer .vexa-player-center{gap:12px}#vexaCustomPlayer .vexa-player-btn{width:40px;height:40px}#vexaCustomPlayer .vexa-player-main{width:56px;height:56px}#vexaCustomPlayer .vexa-player-bottom{padding-left:11px;padding-right:11px}#vexaCustomPlayer .vexa-volume-slider{width:54px}}
@media(prefers-reduced-motion:reduce){#vexaCustomPlayer *{transition:none!important}#vexaCustomPlayer .vexa-player-buffer{animation-duration:1.25s}}
`;

export function isVexaCustomPlayerRequest(request) {
  return new URL(request.url).pathname === CUSTOM_PLAYER_PATH;
}

export function handleVexaCustomPlayerRequest(request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return new Response(VEXA_CUSTOM_PLAYER_RUNTIME_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function appendVexaCustomPlayerRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + CUSTOM_PLAYER_PATH + '?v=' + CUSTOM_PLAYER_VERSION + '"></script>';
  const html = source.includes(CUSTOM_PLAYER_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const VEXA_CUSTOM_PLAYER_RUNTIME_JS = String.raw`
(function () {
  const PLAYER_ID = "vexaCustomPlayer";
  const STYLE_ID = "vexaCustomPlayerStyle";
  const HIDE_DELAY = 2600;
  let hideTimer = 0;
  let singleTapTimer = 0;
  let lastTapAt = 0;
  let lastTapSide = "";
  let parentRestore = null;

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) return window.parent;
    } catch (error) {}
    return window;
  }

  function telegram() {
    const host = hostWindow();
    return window.Telegram?.WebApp || host.Telegram?.WebApp || null;
  }

  function haptic(style) {
    try { telegram()?.HapticFeedback?.impactOccurred?.(style || "light"); } catch (error) {}
  }

  function isIOS() {
    const ua = String(navigator.userAgent || "");
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ${JSON.stringify(CUSTOM_PLAYER_CSS)};
    document.head.appendChild(style);
  }

  function iconMarkup() {
    return '' +
      '<div class="vexa-player-buffer" aria-hidden="true"></div>' +
      '<div class="vexa-skip-flash left" data-skip-left aria-hidden="true">−10s</div>' +
      '<div class="vexa-skip-flash right" data-skip-right aria-hidden="true">+10s</div>' +
      '<div class="vexa-player-controls">' +
        '<div class="vexa-player-shade"></div>' +
        '<div class="vexa-player-center vexa-player-interactive">' +
          '<button class="vexa-player-btn" type="button" data-back aria-label="Back 10 seconds">' +
            '<svg viewBox="0 0 24 24"><path d="M9 8H5V4"/><path d="M5.5 8.5A8 8 0 1 1 4 15"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>' +
          '</button>' +
          '<button class="vexa-player-btn vexa-player-main" type="button" data-play aria-label="Play">' +
            '<svg class="vexa-icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
            '<svg class="vexa-icon-pause" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>' +
          '</button>' +
          '<button class="vexa-player-btn" type="button" data-forward aria-label="Forward 10 seconds">' +
            '<svg viewBox="0 0 24 24"><path d="M15 8h4V4"/><path d="M18.5 8.5A8 8 0 1 0 20 15"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="vexa-player-bottom vexa-player-interactive">' +
          '<div class="vexa-seek" data-seek role="slider" tabindex="0" aria-label="Video progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
            '<div class="vexa-seek-track"><div class="vexa-seek-buffer"></div><div class="vexa-seek-played"></div></div>' +
            '<div class="vexa-seek-thumb"></div>' +
          '</div>' +
          '<div class="vexa-player-row">' +
            '<div class="vexa-player-time"><span data-current>0:00</span><span aria-hidden="true"> / </span><span data-duration>0:00</span></div>' +
            '<div class="vexa-player-spacer"></div>' +
            '<div class="vexa-volume">' +
              '<button class="vexa-player-small" type="button" data-mute aria-label="Mute">' +
                '<svg class="vexa-icon-volume" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>' +
                '<svg class="vexa-icon-volume-off" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 5M21 9l-5 5"/></svg>' +
              '</button>' +
              '<input class="vexa-volume-slider" data-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />' +
            '</div>' +
            '<button class="vexa-player-small" type="button" data-fullscreen aria-label="Full screen">' +
              '<svg class="vexa-icon-expand" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>' +
              '<svg class="vexa-icon-compress" viewBox="0 0 24 24"><path d="M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function formatTime(value) {
    const seconds = Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function showControls(player, sticky) {
    player.classList.remove("is-controls-hidden");
    clearTimeout(hideTimer);
    if (!sticky) scheduleHide(player);
  }

  function scheduleHide(player) {
    clearTimeout(hideTimer);
    const video = player.querySelector("video");
    if (!video || video.paused || video.ended) return;
    hideTimer = setTimeout(function () {
      if (!video.paused && !video.ended && !player.querySelector(".vexa-seek.is-dragging")) {
        player.classList.add("is-controls-hidden");
      }
    }, HIDE_DELAY);
  }

  function updatePlayState(player, video) {
    const playing = !video.paused && !video.ended;
    player.classList.toggle("is-playing", playing);
    const button = player.querySelector("[data-play]");
    if (button) button.setAttribute("aria-label", playing ? "Pause" : "Play");
    if (playing) scheduleHide(player); else showControls(player, true);
  }

  function updateVolumeState(player, video) {
    const muted = video.muted || Number(video.volume) === 0;
    player.classList.toggle("is-muted", muted);
    const button = player.querySelector("[data-mute]");
    if (button) button.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    const slider = player.querySelector("[data-volume]");
    if (slider && !isIOS()) slider.value = muted ? "0" : String(clamp(Number(video.volume || 1), 0, 1));
  }

  function updateTimeline(player, video, forcedTime) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = forcedTime == null ? Math.max(0, Number(video.currentTime || 0)) : Math.max(0, Number(forcedTime || 0));
    const ratio = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    const seek = player.querySelector("[data-seek]");
    if (seek) {
      seek.style.setProperty("--played", (ratio * 100) + "%");
      seek.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      seek.setAttribute("aria-valuetext", formatTime(current) + " of " + formatTime(duration));
    }
    const currentNode = player.querySelector("[data-current]");
    const durationNode = player.querySelector("[data-duration]");
    if (currentNode) currentNode.textContent = formatTime(current);
    if (durationNode) durationNode.textContent = formatTime(duration);
  }

  function updateBuffered(player, video) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    let end = 0;
    try {
      if (video.buffered && video.buffered.length) end = video.buffered.end(video.buffered.length - 1);
    } catch (error) {}
    const ratio = duration > 0 ? clamp(end / duration, 0, 1) : 0;
    const seek = player.querySelector("[data-seek]");
    if (seek) seek.style.setProperty("--buffered", (ratio * 100) + "%");
  }

  async function togglePlay(player, video) {
    showControls(player, true);
    if (video.paused || video.ended) {
      try { await video.play(); } catch (error) {}
    } else {
      try { video.pause(); } catch (error) {}
    }
    updatePlayState(player, video);
    haptic("light");
  }

  function seekBy(player, video, delta) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    const target = clamp(Number(video.currentTime || 0) + delta, 0, duration);
    try { video.currentTime = target; } catch (error) {}
    updateTimeline(player, video, target);
    showControls(player, false);
    flashSkip(player, delta < 0 ? "left" : "right");
    haptic("light");
  }

  function flashSkip(player, side) {
    const node = player.querySelector(side === "left" ? "[data-skip-left]" : "[data-skip-right]");
    if (!node) return;
    node.classList.remove("show");
    void node.offsetWidth;
    node.classList.add("show");
  }

  function ratioFromPointer(element, event) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0;
  }

  function setFullscreen(player, active) {
    const next = active == null ? !player.classList.contains("is-fullscreen") : Boolean(active);
    player.classList.toggle("is-fullscreen", next);
    document.documentElement.classList.toggle("vexa-player-fullscreen-page", next);
    document.body.classList.toggle("vexa-player-fullscreen-page", next);
    const button = player.querySelector("[data-fullscreen]");
    if (button) button.setAttribute("aria-label", next ? "Exit full screen" : "Full screen");

    try {
      const host = hostWindow();
      if (host !== window) {
        const workspace = host.document.getElementById("vexaMediaWorkspace");
        const frame = host.document.getElementById("vexaMediaInlineFrame");
        if (next && workspace && !parentRestore) {
          parentRestore = {
            top: workspace.style.top,
            bottom: workspace.style.bottom,
            left: workspace.style.left,
            right: workspace.style.right,
            zIndex: workspace.style.zIndex,
            frameHeight: frame ? frame.style.height : "",
          };
          workspace.style.top = "0";
          workspace.style.bottom = "0";
          workspace.style.left = "0";
          workspace.style.right = "0";
          workspace.style.zIndex = "2147483000";
          if (frame) frame.style.height = "100%";
        } else if (!next && workspace && parentRestore) {
          workspace.style.top = parentRestore.top;
          workspace.style.bottom = parentRestore.bottom;
          workspace.style.left = parentRestore.left;
          workspace.style.right = parentRestore.right;
          workspace.style.zIndex = parentRestore.zIndex;
          if (frame) frame.style.height = parentRestore.frameHeight;
          parentRestore = null;
        }
      }
    } catch (error) {}

    showControls(player, true);
    haptic("medium");
  }

  function bindSeek(player, video) {
    const seek = player.querySelector("[data-seek]");
    if (!seek || seek.dataset.bound === "1") return;
    seek.dataset.bound = "1";
    let dragging = false;

    function apply(event, commit) {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!duration) return;
      const ratio = ratioFromPointer(seek, event);
      const target = ratio * duration;
      updateTimeline(player, video, target);
      if (commit) {
        try { video.currentTime = target; } catch (error) {}
      }
    }

    seek.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      seek.classList.add("is-dragging");
      clearTimeout(hideTimer);
      try { seek.setPointerCapture(event.pointerId); } catch (error) {}
      apply(event, true);
    });
    seek.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      event.preventDefault();
      apply(event, true);
    });
    function finish(event) {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove("is-dragging");
      if (event) apply(event, true);
      scheduleHide(player);
    }
    seek.addEventListener("pointerup", finish);
    seek.addEventListener("pointercancel", finish);
    seek.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      if (event.key === "Home") {
        try { video.currentTime = 0; } catch (error) {}
      } else if (event.key === "End" && Number.isFinite(video.duration)) {
        try { video.currentTime = video.duration; } catch (error) {}
      } else {
        seekBy(player, video, event.key === "ArrowLeft" ? -10 : 10);
      }
      updateTimeline(player, video);
    });
  }

  function bindSurfaceTaps(player, video) {
    if (player.dataset.tapBound === "1") return;
    player.dataset.tapBound = "1";
    player.addEventListener("pointerup", function (event) {
      const target = event.target;
      if (target && target.closest && target.closest("button,input,[data-seek]")) return;
      const rect = player.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      const side = ratio < 0.42 ? "left" : ratio > 0.58 ? "right" : "center";
      const now = Date.now();
      if ((side === "left" || side === "right") && side === lastTapSide && (now - lastTapAt) < 320) {
        clearTimeout(singleTapTimer);
        singleTapTimer = 0;
        lastTapAt = 0;
        lastTapSide = "";
        seekBy(player, video, side === "left" ? -10 : 10);
        return;
      }
      lastTapAt = now;
      lastTapSide = side;
      clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(function () {
        if (player.classList.contains("is-controls-hidden")) showControls(player, false);
        else if (!video.paused) player.classList.add("is-controls-hidden");
        lastTapAt = 0;
        lastTapSide = "";
      }, 260);
    });
  }

  function bindPlayer(player, video) {
    if (player.dataset.bound === "1") return;
    player.dataset.bound = "1";

    const play = player.querySelector("[data-play]");
    const back = player.querySelector("[data-back]");
    const forward = player.querySelector("[data-forward]");
    const mute = player.querySelector("[data-mute]");
    const volume = player.querySelector("[data-volume]");
    const fullscreen = player.querySelector("[data-fullscreen]");

    play?.addEventListener("click", function (event) { event.stopPropagation(); togglePlay(player, video); });
    back?.addEventListener("click", function (event) { event.stopPropagation(); seekBy(player, video, -10); });
    forward?.addEventListener("click", function (event) { event.stopPropagation(); seekBy(player, video, 10); });
    mute?.addEventListener("click", function (event) {
      event.stopPropagation();
      try { video.muted = !video.muted; } catch (error) {}
      updateVolumeState(player, video);
      showControls(player, false);
      haptic("light");
    });
    volume?.addEventListener("input", function (event) {
      if (isIOS()) return;
      const value = clamp(Number(event.target.value || 0), 0, 1);
      try { video.volume = value; video.muted = value === 0; } catch (error) {}
      updateVolumeState(player, video);
      showControls(player, false);
    });
    fullscreen?.addEventListener("click", function (event) {
      event.stopPropagation();
      setFullscreen(player);
    });

    bindSeek(player, video);
    bindSurfaceTaps(player, video);

    video.addEventListener("loadedmetadata", function () { updateTimeline(player, video); updateBuffered(player, video); showControls(player, true); });
    video.addEventListener("durationchange", function () { updateTimeline(player, video); });
    video.addEventListener("timeupdate", function () {
      if (!player.querySelector(".vexa-seek.is-dragging")) updateTimeline(player, video);
    });
    video.addEventListener("progress", function () { updateBuffered(player, video); });
    video.addEventListener("play", function () { updatePlayState(player, video); });
    video.addEventListener("playing", function () { player.classList.remove("is-buffering"); updatePlayState(player, video); });
    video.addEventListener("pause", function () { updatePlayState(player, video); });
    video.addEventListener("ended", function () { updatePlayState(player, video); updateTimeline(player, video); });
    video.addEventListener("waiting", function () { player.classList.add("is-buffering"); showControls(player, true); });
    video.addEventListener("stalled", function () { player.classList.add("is-buffering"); });
    video.addEventListener("seeking", function () { player.classList.add("is-buffering"); });
    video.addEventListener("seeked", function () { player.classList.remove("is-buffering"); updateTimeline(player, video); scheduleHide(player); });
    video.addEventListener("canplay", function () { player.classList.remove("is-buffering"); });
    video.addEventListener("volumechange", function () { updateVolumeState(player, video); });
    video.addEventListener("error", function () { player.classList.remove("is-buffering"); showControls(player, true); });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && player.classList.contains("is-fullscreen")) setFullscreen(player, false);
      if ((event.key === " " || event.key === "k") && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        togglePlay(player, video);
      }
    });

    updatePlayState(player, video);
    updateVolumeState(player, video);
    updateTimeline(player, video);
    updateBuffered(player, video);
  }

  function installPlayer() {
    installStyle();
    const video = document.getElementById("vexaLiveVideo");
    if (!video || video.tagName !== "VIDEO") return false;
    if (document.getElementById(PLAYER_ID)) return true;

    video.controls = false;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    video.setAttribute("disablepictureinpicture", "");
    try { video.disablePictureInPicture = true; } catch (error) {}
    try { video.disableRemotePlayback = true; } catch (error) {}

    const parent = video.parentElement;
    if (!parent) return false;
    const player = document.createElement("div");
    player.id = PLAYER_ID;
    player.dataset.ios = isIOS() ? "1" : "0";
    parent.insertBefore(player, video);
    player.appendChild(video);
    player.insertAdjacentHTML("beforeend", iconMarkup());
    bindPlayer(player, video);
    document.documentElement.dataset.vexaCustomPlayer = "1";
    return true;
  }

  if (!installPlayer()) {
    const observer = new MutationObserver(function () {
      if (installPlayer()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;