function vexaLiveEditorBootstrap() {
  const tg = window.Telegram && window.Telegram.WebApp;
  const originalFetch = window.fetch.bind(window);
  const state = {
    active: false,
    cues: [],
    selectedId: -1,
    captionX: 50,
    captionY: 72,
    pixelsPerSecond: 44,
    dragType: "",
    dragCueId: -1,
    pointerId: null,
    panelOpen: true,
    manualScrollUntil: 0,
    lastLiveText: "",
    liveTimer: 0,
  };

  const q = (id) => document.getElementById(id);
  const mode = () =>
    document.querySelector("[data-caption-mode].active")?.getAttribute("data-caption-mode") === "live"
      ? "live"
      : "standard";
  const sourceLanguage = () => String(q("sourceLanguage")?.value || "");
  const targetLanguage = () => String(q("subtitleLanguage")?.value || "");

  function haptic() {
    try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch (error) {}
  }

  function formatTime(value) {
    const seconds = Math.max(0, Number(value) || 0);
    return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  }

  function keepVideoInline(video) {
    if (!video) return;
    video.controls = false;
    video.removeAttribute("controls");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("controlsList", "nofullscreen noremoteplayback nodownload");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("disableremoteplayback", "");
    video.setAttribute("x-webkit-airplay", "deny");
    video.setAttribute("tabindex", "-1");
    try { video.disablePictureInPicture = true; } catch (error) {}
    try { video.disableRemotePlayback = true; } catch (error) {}
  }

  function installStyles() {
    if (q("vexaLiveEditorStyles")) return;
    const style = document.createElement("style");
    style.id = "vexaLiveEditorStyles";
    style.textContent = `
      #youtubeReadyState{display:none!important}
      .vexa-native-caption-hidden{opacity:0!important;pointer-events:none!important}
      body.vexa-live-editing{overflow:hidden!important;background:#000!important}
      body.vexa-live-editing .live-app{position:fixed!important;inset:0!important;width:100%!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important}
      body.vexa-live-editing .live-header,
      body.vexa-live-editing .live-hero,
      body.vexa-live-editing #videoPickerState,
      body.vexa-live-editing .live-footer{display:none!important}
      body.vexa-live-editing #videoReadyState.show{display:flex!important;position:fixed!important;inset:0!important;z-index:120!important;width:100%!important;height:100dvh!important;min-height:0!important;flex-direction:column!important;align-items:center!important;background:#000!important;overflow:hidden!important;animation:none!important}
      body.vexa-live-editing #videoReadyState>.video-ready-head,
      body.vexa-live-editing #videoReadyState>.video-meta-row{display:none!important}

      .vexa-editor-top{position:fixed;z-index:145;top:0;left:0;right:0;height:calc(58px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 14px 0;display:flex;align-items:center;gap:10px;pointer-events:none}
      .vexa-editor-top>*{pointer-events:auto}
      .vexa-editor-back{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;padding:0;color:#fff;background:rgba(13,13,13,.54);border:1px solid rgba(255,255,255,.105);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.045),0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);font-size:21px;transition:transform .18s cubic-bezier(.16,.86,.22,1)}
      .vexa-editor-back:active{transform:scale(.9)}
      .vexa-editor-title{min-width:0;flex:1;text-align:center}
      .vexa-editor-title b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;font-weight:680;letter-spacing:-.025em}
      .vexa-editor-title small{display:block;margin-top:1px;color:rgba(255,255,255,.52);font-size:8px;font-weight:520}
      .vexa-editor-done{height:34px;padding:0 12px;border-radius:11px;color:#050505;background:#fff;border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 22px rgba(0,0,0,.25);font-size:10px;font-weight:720;transition:transform .18s cubic-bezier(.16,.86,.22,1)}
      .vexa-editor-done:active{transform:scale(.95)}

      body.vexa-live-editing #videoReadyState .video-stage{position:relative!important;flex:0 0 auto!important;min-width:0!important;min-height:0!important;margin:0 auto!important;overflow:hidden!important;border-radius:22px!important;background:rgba(13,13,13,.54)!important;border:1px solid rgba(255,255,255,.105)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 22px rgba(255,255,255,.04),0 18px 46px rgba(0,0,0,.28)!important;backdrop-filter:blur(10px) saturate(1.12)!important;-webkit-backdrop-filter:blur(10px) saturate(1.12)!important;transition:width .3s cubic-bezier(.16,.86,.22,1),height .3s cubic-bezier(.16,.86,.22,1)}
      body.vexa-live-editing #videoReadyState .video-stage video{display:block!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center!important;background:#050505!important;pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important}
      #videoPreview::-webkit-media-controls,#videoPreview::-webkit-media-controls-enclosure,#videoPreview::-webkit-media-controls-panel,#videoPreview::-webkit-media-controls-start-playback-button{display:none!important;-webkit-appearance:none!important;opacity:0!important;pointer-events:none!important}

      .vexa-player-surface{position:absolute;z-index:132;inset:0;padding:0;border:0;background:transparent;color:#fff;touch-action:manipulation;-webkit-touch-callout:none}
      .vexa-player-center{position:absolute;left:50%;top:50%;width:48px;height:48px;border-radius:18px;display:grid;place-items:center;transform:translate(-50%,-50%);color:#050505;background:rgba(255,255,255,.96);box-shadow:0 12px 34px rgba(0,0,0,.34);font-size:16px;font-weight:850;opacity:1;transition:opacity .18s ease,transform .22s cubic-bezier(.16,.86,.22,1)}
      .vexa-player-surface.is-playing .vexa-player-center{opacity:0;transform:translate(-50%,-50%) scale(.88)}
      .vexa-player-surface:active .vexa-player-center{transform:translate(-50%,-50%) scale(.92)}

      .vexa-editor-caption{position:absolute;z-index:136;left:50%;top:72%;max-width:84%;transform:translate(-50%,-50%);display:none;padding:7px 10px;border-radius:9px;color:#fff;text-align:center;font-size:clamp(17px,4.8vw,28px);font-weight:760;line-height:1.08;letter-spacing:-.035em;text-shadow:0 2px 3px #000,0 0 12px #000;touch-action:none;user-select:none}
      .vexa-editor-caption.show{display:block;animation:vexaCaptionIn .2s cubic-bezier(.16,.86,.22,1) both}
      .vexa-editor-caption.dragging{background:rgba(0,0,0,.42);box-shadow:0 0 0 1px rgba(255,255,255,.24)}
      .vexa-caption-grab{position:absolute;right:-6px;top:-6px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.42);opacity:.82}
      .vexa-caption-grab:after{content:"";position:absolute;inset:5px;border-radius:50%;background:#111}
      .vexa-guide{position:absolute;z-index:134;display:none;pointer-events:none;background:rgba(255,255,255,.42)}
      .vexa-guide.vertical{left:50%;top:7%;bottom:7%;width:1px}
      .vexa-guide.horizontal{top:50%;left:7%;right:7%;height:1px}
      body.vexa-guide-x .vexa-guide.vertical,body.vexa-guide-y .vexa-guide.horizontal{display:block}

      .vexa-editor-panel{position:relative;z-index:138;flex:0 0 auto;width:min(calc(100% - 24px),560px);height:220px;margin:auto auto calc(10px + env(safe-area-inset-bottom));padding:9px;border-radius:22px;background:rgba(13,13,13,.62);border:1px solid rgba(255,255,255,.105);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 22px rgba(255,255,255,.045),0 16px 36px rgba(0,0,0,.24);backdrop-filter:blur(16px) saturate(1.12);-webkit-backdrop-filter:blur(16px) saturate(1.12);transition:height .25s cubic-bezier(.16,.86,.22,1)}
      .vexa-panel-grip{display:none}
      .vexa-editor-controls{height:36px;display:flex;align-items:center;gap:8px}
      .vexa-editor-play{width:34px;height:34px;border-radius:12px;color:#050505;background:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 7px 20px rgba(0,0,0,.25);font-size:13px;font-weight:850;transition:transform .18s cubic-bezier(.16,.86,.22,1)}
      .vexa-editor-play:active{transform:scale(.9)}
      .vexa-editor-time{min-width:78px;color:rgba(255,255,255,.7);font-size:9px;font-weight:650;font-variant-numeric:tabular-nums}
      .vexa-editor-hint{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.32);font-size:8px;text-align:right}
      .vexa-fit-button{display:none!important}

      .vexa-caption-timeline{position:relative;height:72px;margin-top:6px;overflow-x:auto;overflow-y:hidden;border-radius:14px;background:rgba(0,0,0,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 0 0 1px rgba(255,255,255,.055);scrollbar-width:none;touch-action:pan-x}
      .vexa-caption-timeline::-webkit-scrollbar{display:none}
      .vexa-timeline-lane{position:relative;height:100%;min-width:100%}
      .vexa-wave{position:absolute;left:0;right:0;top:8px;height:24px;display:flex;align-items:center;gap:2px;padding:0 8px;opacity:.18;overflow:hidden;pointer-events:none}
      .vexa-wave i{flex:1 0 2px;min-width:2px;max-width:2px;border-radius:99px;background:#fff}
      .vexa-cue-track{position:absolute;left:0;right:0;bottom:7px;height:31px}
      .vexa-cue{position:absolute;top:0;height:31px;min-width:42px;padding:0 8px;border-radius:9px;color:rgba(255,255,255,.58);background:rgba(255,255,255,.065);box-shadow:inset 0 0 0 1px rgba(255,255,255,.055);overflow:hidden;text-align:left;touch-action:none;transition:background .18s ease,color .18s ease,transform .18s ease}
      .vexa-cue.active{color:#050505;background:#fff;transform:translateY(-1px)}
      .vexa-cue span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:7.5px;font-weight:680;pointer-events:none}
      .vexa-cue-handle{position:absolute;top:0;bottom:0;width:13px;display:none;touch-action:none}
      .vexa-cue.active .vexa-cue-handle{display:block}
      .vexa-cue-handle.start{left:0}.vexa-cue-handle.end{right:0}
      .vexa-cue-handle:after{content:"";position:absolute;top:8px;bottom:8px;width:2px;border-radius:99px;background:#111}
      .vexa-cue-handle.start:after{left:3px}.vexa-cue-handle.end:after{right:3px}
      .vexa-playhead{position:absolute;z-index:8;top:4px;bottom:4px;width:1px;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.24);pointer-events:none}
      .vexa-playhead:before{content:"";position:absolute;top:-1px;left:-4px;width:9px;height:5px;border-radius:4px;background:#fff}

      .vexa-caption-editor{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr;column-gap:7px;margin-top:6px}
      .vexa-caption-meta{grid-column:1/3;height:16px;display:flex;justify-content:space-between;padding:0 3px;color:rgba(255,255,255,.28);font-size:7px;font-weight:650}
      .vexa-caption-meta b{color:rgba(255,255,255,.46);font-weight:620}
      .vexa-caption-input{height:47px;resize:none;border:0;outline:0;border-radius:12px;padding:9px 10px;color:#fff;background:rgba(255,255,255,.052);box-shadow:inset 0 1px 0 rgba(255,255,255,.055),inset 0 0 0 1px rgba(255,255,255,.06);font-family:inherit;font-size:11px;font-weight:620;line-height:1.35;transition:background .2s ease,box-shadow .2s ease}
      .vexa-caption-input:focus{background:rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px rgba(255,255,255,.12)}
      .vexa-reset-position{width:68px;height:47px;border-radius:12px;color:rgba(255,255,255,.52);background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.055);font-size:7px;font-weight:680}
      body.vexa-editor-collapsed .vexa-caption-timeline,body.vexa-editor-collapsed .vexa-caption-editor{display:none}
      body.vexa-editor-keyboard .vexa-caption-timeline{display:none}
      @keyframes vexaCaptionIn{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
      @media(orientation:landscape) and (max-height:560px){.vexa-caption-editor{display:none}.vexa-editor-panel{height:112px}.vexa-caption-timeline{height:58px}}
    `;
    document.head.appendChild(style);
  }

  function buildCues(transcript) {
    const words = (Array.isArray(transcript?.words) ? transcript.words : [])
      .map((item) => ({ text:String(item?.text || "").trim(), start:Number(item?.start), end:Number(item?.end) }))
      .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start);
    if (!words.length) return [];
    const result = [];
    let group = [];
    const join = (tokens) =>
      sourceLanguage() === "zh" || sourceLanguage() === "ja"
        ? tokens.join("").replace(/\s+/g, "").trim()
        : tokens.join(" ").replace(/\s+([,.;:!?؟،؛。！？])/g, "$1").replace(/\s+/g, " ").trim();
    const flush = () => {
      if (!group.length) return;
      const first = group[0], last = group[group.length - 1];
      const text = join(group.map((item) => item.text));
      if (text) result.push({ id:result.length, start:Math.max(0, first.start - .06), end:Math.max(first.start + .15, last.end + .22), text });
      group = [];
    };
    words.forEach((word, index) => {
      group.push(word);
      const first = group[0], next = words[index + 1], duration = word.end - first.start;
      if (!next || next.start - word.end > .72 || group.length >= 10 || duration >= 3.15 || (/[.!?؟。！？]$/.test(word.text) && duration >= 1)) flush();
    });
    return result;
  }

  function installFetchObserver() {
    if (window.__vexaLiveEditorFetchObserver) return;
    window.__vexaLiveEditorFetchObserver = true;
    window.fetch = async function (input, init) {
      const response = await originalFetch(input, init);
      try {
        const url = typeof input === "string" ? input : String(input?.url || "");
        if (response.ok && url.includes("/v1/speech-to-text") && !url.includes("/realtime")) {
          response.clone().json().then((data) => {
            const next = buildCues(data);
            if (next.length) setCues(next);
          }).catch(() => {});
        }
        if (response.ok && url.includes("/mini-app/live/api/translate")) {
          let body = null;
          try { body = init && typeof init.body === "string" ? JSON.parse(init.body) : null; } catch (error) {}
          response.clone().json().then((data) => {
            if (body && Array.isArray(body.segments) && Array.isArray(data?.segments)) applyTranslations(data.segments);
          }).catch(() => {});
        }
      } catch (error) {}
      return response;
    };
  }

  function setCues(cues) {
    state.cues = cues
      .map((cue, index) => ({ id:Number.isInteger(Number(cue.id)) ? Number(cue.id) : index, start:Math.max(0, Number(cue.start) || 0), end:Math.max(Number(cue.start) || 0, Number(cue.end) || 0), text:String(cue.text || "").trim() }))
      .filter((cue) => cue.text && cue.end >= cue.start)
      .sort((a, b) => a.start - b.start);
    if (!state.cues.some((cue) => cue.id === state.selectedId)) state.selectedId = state.cues[0]?.id ?? -1;
    renderTimeline(); syncEditor(); syncCaption();
    if (q("vexaEditorHint")) q("vexaEditorHint").textContent = "Tap a caption to edit";
  }

  function applyTranslations(items) {
    const byId = new Map((items || []).map((item) => [Number(item?.id), String(item?.text || "").trim()]));
    let changed = false;
    state.cues.forEach((cue) => {
      const text = byId.get(cue.id);
      if (text) { cue.text = text; changed = true; }
    });
    if (changed) { renderTimeline(); syncEditor(); syncCaption(); }
  }

  function appendLiveCue(text) {
    if (mode() !== "live") return;
    const clean = String(text || "").trim();
    if (!clean) return;
    const video = q("videoPreview"), time = Math.max(0, Number(video?.currentTime) || 0);
    const last = state.cues[state.cues.length - 1];
    if (last && time - last.start < 2.2) {
      last.text = clean;
      last.end = Math.max(last.end, time + 2.2);
    } else {
      const id = last ? last.id + 1 : 0;
      state.cues.push({ id, start:Math.max(0, time - .35), end:time + 2.8, text:clean });
      state.selectedId = id;
    }
    renderTimeline(); syncEditor(); syncCaption();
  }

  function activeCue() { return state.cues.find((cue) => cue.id === state.selectedId) || null; }

  function cueAt(time) {
    let low = 0, high = state.cues.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1, cue = state.cues[mid];
      if (time < cue.start) high = mid - 1;
      else if (time > cue.end) low = mid + 1;
      else return cue;
    }
    return null;
  }

  function createEditor() {
    if (q("vexaEditorPanel")) return;
    const ready = q("videoReadyState"), stage = ready?.querySelector(".video-stage");
    if (!ready || !stage) return;

    const top = document.createElement("div");
    top.className = "vexa-editor-top";
    top.innerHTML = '<button class="vexa-editor-back" data-vexa-editor="back" aria-label="Back">‹</button><div class="vexa-editor-title"><b id="vexaEditorTitle">Vexa Live</b><small id="vexaEditorStatus">Preparing captions</small></div><button class="vexa-editor-done" data-vexa-editor="done">Done</button>';
    ready.insertBefore(top, stage);

    const surface = document.createElement("button");
    surface.type = "button";
    surface.id = "vexaPlayerSurface";
    surface.className = "vexa-player-surface";
    surface.setAttribute("aria-label", "Play or pause video");
    surface.innerHTML = '<span class="vexa-player-center" aria-hidden="true">▶</span>';
    stage.appendChild(surface);

    const caption = document.createElement("div");
    caption.id = "vexaEditorCaption";
    caption.className = "vexa-editor-caption";
    caption.innerHTML = '<span id="vexaEditorCaptionText"></span><i class="vexa-caption-grab"></i>';
    stage.appendChild(caption);

    const vertical = document.createElement("i"); vertical.className = "vexa-guide vertical"; stage.appendChild(vertical);
    const horizontal = document.createElement("i"); horizontal.className = "vexa-guide horizontal"; stage.appendChild(horizontal);

    const panel = document.createElement("section");
    panel.id = "vexaEditorPanel";
    panel.className = "vexa-editor-panel";
    panel.innerHTML = '<div class="vexa-editor-controls"><button id="vexaEditorPlay" class="vexa-editor-play" aria-label="Play">▶</button><span id="vexaEditorTime" class="vexa-editor-time">0:00 / 0:00</span><span id="vexaEditorHint" class="vexa-editor-hint">Captions will appear here</span></div><div id="vexaCaptionTimeline" class="vexa-caption-timeline"><div id="vexaTimelineLane" class="vexa-timeline-lane"><div id="vexaWave" class="vexa-wave"></div><div id="vexaCueTrack" class="vexa-cue-track"></div><i id="vexaPlayhead" class="vexa-playhead"></i></div></div><div class="vexa-caption-editor"><div class="vexa-caption-meta"><span>CAPTION</span><b id="vexaCaptionMeta">—</b></div><textarea id="vexaCaptionInput" class="vexa-caption-input" rows="2" spellcheck="true" placeholder="Tap a caption to edit it"></textarea><button class="vexa-reset-position" data-vexa-editor="reset-position">Reset</button></div>';
    ready.appendChild(panel);
    restoreCaptionPosition();
    bindEditorEvents();
  }

  function restoreCaptionPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem("vexa-live-caption-position-v1") || "null");
      if (saved) {
        state.captionX = Math.max(8, Math.min(92, Number(saved.x) || 50));
        state.captionY = Math.max(10, Math.min(88, Number(saved.y) || 72));
      }
    } catch (error) {}
    applyCaptionPosition();
  }

  function saveCaptionPosition() {
    try { localStorage.setItem("vexa-live-caption-position-v1", JSON.stringify({ x:state.captionX, y:state.captionY })); } catch (error) {}
  }

  function applyCaptionPosition() {
    const caption = q("vexaEditorCaption");
    if (caption) { caption.style.left = state.captionX + "%"; caption.style.top = state.captionY + "%"; }
  }

  function bindEditorEvents() {
    const timeline = q("vexaCaptionTimeline"), lane = q("vexaTimelineLane");
    q("vexaEditorPlay")?.addEventListener("click", togglePlayback);
    q("vexaPlayerSurface")?.addEventListener("click", togglePlayback);
    q("vexaPlayerSurface")?.addEventListener("contextmenu", (event) => event.preventDefault());
    timeline?.addEventListener("scroll", () => { state.manualScrollUntil = Date.now() + 900; }, { passive:true });
    lane?.addEventListener("pointerdown", onTimelinePointerDown);

    const input = q("vexaCaptionInput");
    input?.addEventListener("input", () => {
      const cue = activeCue();
      if (!cue) return;
      cue.text = String(input.value || "");
      const label = document.querySelector('[data-vexa-cue="' + cue.id + '"] span');
      if (label) label.textContent = cue.text;
      syncCaption();
    });
    input?.addEventListener("focus", () => { document.body.classList.add("vexa-editor-keyboard"); applyEditorLayout(); });
    input?.addEventListener("blur", () => { document.body.classList.remove("vexa-editor-keyboard"); applyEditorLayout(); });

    q("vexaEditorCaption")?.addEventListener("pointerdown", (event) => {
      if (!state.active) return;
      state.dragType = "caption";
      state.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.classList.add("dragging");
      event.preventDefault();
    });
    document.addEventListener("pointermove", onPointerMove, { passive:false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("click", onEditorAction);
  }

  function onEditorAction(event) {
    const button = event.target?.closest?.("[data-vexa-editor]");
    if (!button) return;
    const action = button.getAttribute("data-vexa-editor");
    if (action === "back") {
      event.preventDefault();
      document.querySelector("#videoReadyState [data-action='change-video']")?.click();
    } else if (action === "done") {
      event.preventDefault();
      state.panelOpen = !state.panelOpen;
      document.body.classList.toggle("vexa-editor-collapsed", !state.panelOpen);
      button.textContent = state.panelOpen ? "Done" : "Edit";
      applyEditorLayout();
    } else if (action === "reset-position") {
      event.preventDefault();
      state.captionX = 50; state.captionY = 72; applyCaptionPosition(); saveCaptionPosition(); haptic();
    }
  }

  function onTimelinePointerDown(event) {
    if (!state.active) return;
    const block = event.target.closest?.("[data-vexa-cue]"), handle = event.target.closest?.("[data-vexa-handle]");
    if (block) {
      const id = Number(block.getAttribute("data-vexa-cue"));
      if (Number.isInteger(id)) selectCue(id, true);
    }
    if (handle && block) {
      state.dragType = String(handle.getAttribute("data-vexa-handle") || "");
      state.dragCueId = Number(block.getAttribute("data-vexa-cue"));
      state.pointerId = event.pointerId;
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault(); event.stopPropagation(); return;
    }
    if (!block) seekTimeline(event);
  }

  function seekTimeline(event) {
    const timeline = q("vexaCaptionTimeline"), video = q("videoPreview");
    if (!timeline || !video) return;
    const rect = timeline.getBoundingClientRect();
    const time = Math.max(0, (event.clientX - rect.left + timeline.scrollLeft) / state.pixelsPerSecond);
    video.currentTime = Math.min(Number(video.duration) || time, time);
    syncPlayback();
  }

  function onPointerMove(event) {
    if (!state.dragType || event.pointerId !== state.pointerId) return;
    if (state.dragType === "caption") {
      const stage = q("videoReadyState")?.querySelector(".video-stage");
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      state.captionX = Math.max(8, Math.min(92, (event.clientX - rect.left) / Math.max(1, rect.width) * 100));
      state.captionY = Math.max(10, Math.min(88, (event.clientY - rect.top) / Math.max(1, rect.height) * 100));
      if (Math.abs(state.captionX - 50) < 2.3) state.captionX = 50;
      if (Math.abs(state.captionY - 50) < 2.3) state.captionY = 50;
      document.body.classList.toggle("vexa-guide-x", state.captionX === 50);
      document.body.classList.toggle("vexa-guide-y", state.captionY === 50);
      applyCaptionPosition(); event.preventDefault(); return;
    }

    const cue = state.cues.find((item) => item.id === state.dragCueId), timeline = q("vexaCaptionTimeline");
    if (!cue || !timeline) return;
    const rect = timeline.getBoundingClientRect();
    const time = Math.max(0, (event.clientX - rect.left + timeline.scrollLeft) / state.pixelsPerSecond);
    const index = state.cues.indexOf(cue), previous = index > 0 ? state.cues[index - 1] : null, next = index < state.cues.length - 1 ? state.cues[index + 1] : null;
    if (state.dragType === "start") cue.start = Math.max(previous ? previous.end + .02 : 0, Math.min(cue.end - .15, time));
    else if (state.dragType === "end") cue.end = Math.min(next ? next.start - .02 : Math.max(cue.end, Number(q("videoPreview")?.duration) || cue.end), Math.max(cue.start + .15, time));
    placeCue(cue); syncEditor(); syncCaption(); event.preventDefault();
  }

  function onPointerUp(event) {
    if (!state.dragType || event.pointerId !== state.pointerId) return;
    if (state.dragType === "caption") saveCaptionPosition();
    q("vexaEditorCaption")?.classList.remove("dragging");
    state.dragType = ""; state.dragCueId = -1; state.pointerId = null;
    document.body.classList.remove("vexa-guide-x", "vexa-guide-y");
  }

  function selectCue(id, seek) {
    const cue = state.cues.find((item) => item.id === id);
    if (!cue) return;
    state.selectedId = id; syncSelectedCue(); syncEditor();
    if (seek) { const video = q("videoPreview"); if (video) video.currentTime = cue.start + .01; syncPlayback(); }
    haptic();
  }

  function syncSelectedCue() {
    document.querySelectorAll("[data-vexa-cue]").forEach((node) => node.classList.toggle("active", Number(node.dataset.vexaCue) === state.selectedId));
  }

  function syncEditor() {
    const cue = activeCue(), input = q("vexaCaptionInput"), meta = q("vexaCaptionMeta");
    if (input) {
      input.disabled = !cue;
      if (document.activeElement !== input) input.value = cue ? cue.text : "";
    }
    if (meta) meta.textContent = cue ? (state.cues.indexOf(cue) + 1) + " / " + state.cues.length + " · " + formatTime(cue.start) + "–" + formatTime(cue.end) : "—";
  }

  function syncCaption() {
    const wrap = q("vexaEditorCaption"), text = q("vexaEditorCaptionText"), video = q("videoPreview");
    if (!wrap || !text || !video || !state.active) return;
    const time = Math.max(0, Number(video.currentTime) || 0);
    let cue = cueAt(time);
    if (!cue && mode() === "live") {
      const last = state.cues[state.cues.length - 1];
      if (last && time <= last.end + 1.2) cue = last;
    }
    const value = String(cue?.text || "").trim();
    text.textContent = value;
    text.dir = targetLanguage() === "fa" || targetLanguage() === "ar" ? "rtl" : "ltr";
    wrap.classList.toggle("show", Boolean(value));
    if (cue && cue.id !== state.selectedId && document.activeElement !== q("vexaCaptionInput")) {
      state.selectedId = cue.id; syncEditor(); syncSelectedCue();
    }
  }

  function renderTimeline() {
    const track = q("vexaCueTrack"), lane = q("vexaTimelineLane"), wave = q("vexaWave"), video = q("videoPreview"), timeline = q("vexaCaptionTimeline");
    if (!track || !lane || !wave || !video || !timeline) return;
    const duration = Math.max(Number(video.duration) || 0, state.cues.length ? Math.max(...state.cues.map((cue) => cue.end)) : 0, 1);
    const baseWidth = Math.max(320, Number(timeline.clientWidth) || 320);
    state.pixelsPerSecond = Math.max(32, Math.min(72, 1500 / Math.max(18, duration)));
    const width = Math.max(baseWidth, Math.min(24000, duration * state.pixelsPerSecond + 36));
    lane.style.width = width + "px";

    const bars = Math.max(45, Math.min(360, Math.round(width / 8)));
    if (Number(wave.dataset.bars) !== bars) {
      wave.innerHTML = ""; wave.dataset.bars = String(bars);
      for (let index = 0; index < bars; index += 1) {
        const bar = document.createElement("i");
        bar.style.height = Math.min(86, 20 + Math.abs(Math.sin(index * 1.37) * 44 + Math.cos(index * .61) * 18)) + "%";
        wave.appendChild(bar);
      }
    }

    track.innerHTML = "";
    state.cues.forEach((cue) => {
      const block = document.createElement("button");
      block.type = "button";
      block.className = "vexa-cue" + (cue.id === state.selectedId ? " active" : "");
      block.dataset.vexaCue = String(cue.id);
      block.innerHTML = '<span></span><i class="vexa-cue-handle start" data-vexa-handle="start"></i><i class="vexa-cue-handle end" data-vexa-handle="end"></i>';
      block.querySelector("span").textContent = cue.text;
      track.appendChild(block);
      placeCue(cue);
    });
    syncPlayback();
  }

  function placeCue(cue) {
    const node = document.querySelector('[data-vexa-cue="' + cue.id + '"]');
    if (!node) return;
    node.style.left = cue.start * state.pixelsPerSecond + "px";
    node.style.width = Math.max(42, (cue.end - cue.start) * state.pixelsPerSecond) + "px";
  }

  function syncPlayback() {
    const video = q("videoPreview");
    if (!video) return;
    keepVideoInline(video);
    const current = Math.max(0, Number(video.currentTime) || 0), duration = Math.max(0, Number(video.duration) || 0);
    const playhead = q("vexaPlayhead"), time = q("vexaEditorTime"), timeline = q("vexaCaptionTimeline"), play = q("vexaEditorPlay"), surface = q("vexaPlayerSurface");
    const playing = !video.paused && !video.ended;
    if (playhead) playhead.style.left = current * state.pixelsPerSecond + "px";
    if (time) time.textContent = formatTime(current) + " / " + formatTime(duration);
    if (play) { play.textContent = playing ? "Ⅱ" : "▶"; play.setAttribute("aria-label", playing ? "Pause" : "Play"); }
    surface?.classList.toggle("is-playing", playing);
    syncCaption();
    if (timeline && playing && Date.now() > state.manualScrollUntil) {
      const x = current * state.pixelsPerSecond, margin = timeline.clientWidth * .36;
      if (x - timeline.scrollLeft > timeline.clientWidth - margin || x - timeline.scrollLeft < margin) timeline.scrollLeft = Math.max(0, x - timeline.clientWidth * .44);
    }
  }

  function togglePlayback(event) {
    event?.preventDefault?.();
    const video = q("videoPreview");
    if (!video) return;
    keepVideoInline(video);
    if (video.paused || video.ended) {
      const result = video.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } else {
      video.pause();
    }
  }

  function intrinsicRatio(video) {
    const width = Number(video?.videoWidth) || 0;
    const height = Number(video?.videoHeight) || 0;
    if (width > 0 && height > 0) return Math.max(.2, Math.min(5, width / height));
    return 9 / 16;
  }

  function applyEditorLayout() {
    const ready = q("videoReadyState"), stage = ready?.querySelector(".video-stage"), video = q("videoPreview"), panel = q("vexaEditorPanel");
    if (!ready || !stage || !panel) return;

    const viewportWidth = Math.max(280, Number(window.innerWidth) || 390);
    const viewportHeight = Math.max(480, Number(window.innerHeight) || 780);
    const keyboardOpen = document.body.classList.contains("vexa-editor-keyboard");
    const shortViewport = viewportHeight <= 700;
    const panelHeight = !state.panelOpen ? 54 : keyboardOpen ? 132 : shortViewport ? 186 : 220;
    const maxWidth = Math.max(180, Math.min(560, viewportWidth - 28));
    const reservedTop = 72;
    const reservedBottom = panelHeight + 30;
    const maxHeight = Math.max(130, Math.min(520, viewportHeight * .57, viewportHeight - reservedTop - reservedBottom));
    const ratio = intrinsicRatio(video);

    let frameWidth = maxWidth;
    let frameHeight = frameWidth / ratio;
    if (frameHeight > maxHeight) {
      frameHeight = maxHeight;
      frameWidth = frameHeight * ratio;
    }
    if (frameWidth > maxWidth) {
      frameWidth = maxWidth;
      frameHeight = frameWidth / ratio;
    }
    frameWidth = Math.max(120, Math.round(frameWidth));
    frameHeight = Math.max(90, Math.round(frameHeight));

    ready.style.setProperty("padding", "calc(62px + env(safe-area-inset-top)) 14px calc(4px + env(safe-area-inset-bottom))", "important");
    ready.style.setProperty("justify-content", "flex-start", "important");
    ready.style.setProperty("align-items", "center", "important");
    ready.style.setProperty("gap", "10px", "important");

    stage.style.setProperty("width", frameWidth + "px", "important");
    stage.style.setProperty("height", frameHeight + "px", "important");
    stage.style.setProperty("aspect-ratio", String(ratio), "important");
    stage.dataset.vexaVideoRatio = String(ratio);

    if (video) {
      keepVideoInline(video);
      video.style.setProperty("pointer-events", "none", "important");
      video.style.setProperty("touch-action", "none", "important");
    }

    panel.style.setProperty("height", panelHeight + "px", "important");
    panel.style.setProperty("flex-basis", panelHeight + "px", "important");
    panel.style.setProperty("margin-top", "auto", "important");
    q("vexaCaptionTimeline")?.style.setProperty("height", shortViewport ? "60px" : "72px", "important");
    q("vexaCaptionInput")?.style.setProperty("height", keyboardOpen ? "56px" : "47px", "important");
    document.querySelector(".vexa-reset-position")?.style.setProperty("height", keyboardOpen ? "56px" : "47px", "important");
  }

  function syncEditorVisibility() {
    const ready = q("videoReadyState");
    if (!ready) return;
    const visible = ready.classList.contains("show") && ready.getAttribute("aria-hidden") !== "true";
    state.active = visible;
    document.body.classList.toggle("vexa-live-editing", visible);
    if (visible) {
      createEditor();
      keepVideoInline(q("videoPreview"));
      applyEditorLayout();
      if (q("vexaEditorTitle")) q("vexaEditorTitle").textContent = String(q("videoName")?.textContent || "Vexa Live");
      q("captionPreview")?.classList.add("vexa-native-caption-hidden");
      renderTimeline(); syncPlayback();
    } else {
      document.body.classList.remove("vexa-editor-collapsed", "vexa-editor-keyboard");
      state.panelOpen = true;
      q("captionPreview")?.classList.remove("vexa-native-caption-hidden");
    }
  }

  function installObservers() {
    const ready = q("videoReadyState"), nativeCaption = q("liveCaptionText"), status = q("captionStatus")?.querySelector("b"), video = q("videoPreview");
    if (ready) new MutationObserver(syncEditorVisibility).observe(ready, { attributes:true, attributeFilter:["class", "aria-hidden"] });
    if (nativeCaption) new MutationObserver(() => {
      const text = String(nativeCaption.textContent || "").trim();
      if (!text || text === state.lastLiveText) return;
      state.lastLiveText = text;
      clearTimeout(state.liveTimer);
      state.liveTimer = setTimeout(() => { if (mode() === "live") appendLiveCue(text); }, 260);
    }).observe(nativeCaption, { characterData:true, childList:true, subtree:true });
    if (status) new MutationObserver(() => { if (q("vexaEditorStatus")) q("vexaEditorStatus").textContent = String(status.textContent || ""); }).observe(status, { characterData:true, childList:true, subtree:true });
    if (video) new MutationObserver(() => { if (video.controls || video.hasAttribute("controls")) keepVideoInline(video); }).observe(video, { attributes:true, attributeFilter:["controls"] });
    syncEditorVisibility();
  }

  function installVideoEvents() {
    const video = q("videoPreview");
    if (!video) return;
    keepVideoInline(video);
    video.addEventListener("contextmenu", (event) => event.preventDefault());
    ["timeupdate", "seeked", "play", "pause", "ended"].forEach((name) =>
      video.addEventListener(name, () => syncPlayback())
    );
    ["loadedmetadata", "durationchange", "loadeddata"].forEach((name) =>
      video.addEventListener(name, () => { applyEditorLayout(); renderTimeline(); syncPlayback(); })
    );
    video.addEventListener("webkitbeginfullscreen", () => { try { video.webkitExitFullscreen?.(); } catch (error) {} });
  }

  function initialize() {
    installStyles();
    installFetchObserver();
    createEditor();
    installVideoEvents();
    installObservers();
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-action='change-video'],[data-action='change-youtube'],[data-caption-mode],[data-live-source]")) {
        setTimeout(() => { state.cues = []; state.selectedId = -1; renderTimeline(); syncEditor(); syncEditorVisibility(); }, 0);
      }
    });
    window.addEventListener("resize", () => { if (state.active) { applyEditorLayout(); renderTimeline(); } });
    window.addEventListener("orientationchange", () => setTimeout(() => { if (state.active) { applyEditorLayout(); renderTimeline(); } }, 80));
    window.addEventListener("pagehide", () => { window.fetch = originalFetch; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once:true });
  else initialize();
}

export const VEXA_LIVE_EDITOR_JS = "(" + vexaLiveEditorBootstrap.toString() + ")();";