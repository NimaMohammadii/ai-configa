function vexaVoiceAgentBootstrap() {
  const API = "/mini-app/live/api/voice-agent";
  const SCRIBE_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
  const TTS_URL = "wss://api.elevenlabs.io/v1/text-to-speech/";
  const TARGET_SAMPLE_RATE = 16000;
  const TTS_SAMPLE_RATE = 24000;
  const MAX_HISTORY = 10;

  const state = {
    installed: false,
    active: false,
    phase: "idle",
    history: [],
    session: null,
    scribeSocket: null,
    mediaStream: null,
    audioContext: null,
    micSource: null,
    micProcessor: null,
    silentGain: null,
    playbackGain: null,
    playbackAnalyser: null,
    playbackData: null,
    playbackSources: new Set(),
    nextPlaybackTime: 0,
    captureEnabled: false,
    micEnergy: 0,
    turnBusy: false,
    turnAbort: null,
    ttsSocket: null,
    ttsFinalResolve: null,
    ttsFinalReject: null,
    orb: null,
    workspaceObserver: null,
    installObserver: null,
    lastCommitted: "",
    lastCommittedAt: 0,
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
      else if (kind === "error") tg?.HapticFeedback?.notificationOccurred?.("error");
      else tg?.HapticFeedback?.impactOccurred?.(kind || "light");
    } catch (error) {}
  }

  async function api(path, body, options = {}) {
    const response = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": options.accept || "application/json" },
      cache: "no-store",
      signal: options.signal,
      body: JSON.stringify(Object.assign({ initData: initData() }, body || {})),
    });
    if (options.raw) {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data?.error || "Voice connection failed"));
      }
      return response;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || "Voice connection failed"));
    return data;
  }

  function installStyles() {
    if (q("vexaVoiceAgentStyles")) return;
    const style = document.createElement("style");
    style.id = "vexaVoiceAgentStyles";
    style.textContent = `
      body.vexa-stt-embedded .vexa-stt-controls{grid-template-columns:minmax(0,1fr) 42px 42px!important}
      .vexa-voice-open{position:relative;width:42px;height:42px;padding:0;display:grid;place-items:center;border:0;border-radius:13px;color:#fff;background:rgba(13,13,13,.62);box-shadow:inset 0 1px 0 rgba(255,255,255,.105),inset 0 -1px 0 rgba(255,255,255,.06),inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22);backdrop-filter:blur(10px) saturate(1.12);-webkit-backdrop-filter:blur(10px) saturate(1.12);overflow:hidden;transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .2s ease,background .2s ease}
      .vexa-voice-open:active{transform:scale(.88)}
      .vexa-voice-open-orb{width:17px;height:17px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%);box-shadow:0 0 10px rgba(134,82,255,.34),0 0 3px rgba(255,208,240,.38);animation:vexaVoiceButtonBreath 2.8s ease-in-out infinite}
      body.vexa-stt-embedded .vexa-stt.recording .vexa-voice-open,body.vexa-stt-embedded .vexa-stt.processing .vexa-voice-open{opacity:.25;pointer-events:none;transform:scale(.92)}
      .vexa-voice-overlay{position:fixed;z-index:40;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom));background:#080808;color:#fff;opacity:0;visibility:hidden;pointer-events:none;transform:scale(1.018);transition:opacity .34s ease,transform .5s cubic-bezier(.16,.86,.22,1),visibility 0s linear .5s;overflow:hidden}
      .vexa-voice-overlay.open{opacity:1;visibility:visible;pointer-events:auto;transform:scale(1);transition-delay:0s}
      .vexa-voice-close{position:absolute;z-index:4;top:calc(14px + env(safe-area-inset-top));left:14px;width:38px;height:38px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:50%;color:#fff;background:rgba(255,255,255,.05);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 9px 24px rgba(0,0,0,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:20px;font-weight:300;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease}
      .vexa-voice-close:active{transform:scale(.9);background:rgba(255,255,255,.08)}
      .vexa-voice-stage{position:relative;width:min(82vw,390px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:scale(.74);filter:blur(8px);transition:opacity .48s .06s ease,transform .72s .04s cubic-bezier(.16,1,.3,1),filter .5s .04s ease}
      .vexa-voice-overlay.open .vexa-voice-stage{opacity:1;transform:scale(1);filter:blur(0)}
      .vexa-voice-canvas{display:block;width:100%;height:100%;touch-action:manipulation;cursor:pointer}
      .vexa-voice-copy{width:min(88vw,420px);min-height:70px;margin-top:-8px;display:flex;flex-direction:column;align-items:center;text-align:center;opacity:0;transform:translateY(10px);transition:opacity .34s .23s ease,transform .48s .2s cubic-bezier(.16,1,.3,1)}
      .vexa-voice-overlay.open .vexa-voice-copy{opacity:1;transform:none}
      .vexa-voice-status{height:22px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.72);font-size:12px;font-weight:650;letter-spacing:-.015em}
      .vexa-voice-transcript{max-width:100%;min-height:36px;margin-top:3px;color:rgba(255,255,255,.34);font-size:10.5px;font-weight:480;line-height:1.45;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:opacity .18s ease}
      .vexa-voice-hint{position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));transform:translateX(-50%);color:rgba(255,255,255,.22);font-size:8.5px;font-weight:560;white-space:nowrap;opacity:0;transition:opacity .2s ease}
      .vexa-voice-overlay.speaking .vexa-voice-hint,.vexa-voice-overlay.thinking .vexa-voice-hint{opacity:1}
      .vexa-voice-overlay.error .vexa-voice-status{color:rgba(255,210,220,.72)}
      @keyframes vexaVoiceButtonBreath{0%,100%{transform:scale(.92);filter:brightness(.88)}50%{transform:scale(1.06);filter:brightness(1.14)}}
      @media(max-height:650px){.vexa-voice-stage{width:min(62vh,330px)}.vexa-voice-copy{margin-top:-18px}}
      @media(prefers-reduced-motion:reduce){.vexa-voice-open-orb{animation:none}.vexa-voice-overlay,.vexa-voice-stage,.vexa-voice-copy,.vexa-voice-open{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    const shell = q("vexaStt");
    const controls = shell?.querySelector(".vexa-stt-controls");
    const upload = q("vexaSttUpload");
    if (!shell || !controls || !upload) return false;
    installStyles();

    if (!q("vexaVoiceAgentOpen")) {
      const button = document.createElement("button");
      button.id = "vexaVoiceAgentOpen";
      button.className = "vexa-voice-open";
      button.type = "button";
      button.setAttribute("aria-label", "Talk to Vexa");
      button.innerHTML = '<span class="vexa-voice-open-orb" aria-hidden="true"></span>';
      controls.insertBefore(button, upload);
      button.addEventListener("click", () => {
        if (shell.classList.contains("recording") || shell.classList.contains("processing")) return;
        haptic("medium");
        openVoiceMode().catch((error) => fail(error));
      });
    }

    if (!q("vexaVoiceAgent")) {
      const overlay = document.createElement("section");
      overlay.id = "vexaVoiceAgent";
      overlay.className = "vexa-voice-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML =
        '<button id="vexaVoiceAgentClose" class="vexa-voice-close" type="button" aria-label="Close voice conversation">×</button>' +
        '<div class="vexa-voice-stage">' +
          '<canvas id="vexaVoiceOrb" class="vexa-voice-canvas" aria-label="Voice activity orb"></canvas>' +
        '</div>' +
        '<div class="vexa-voice-copy">' +
          '<div id="vexaVoiceStatus" class="vexa-voice-status">Ready</div>' +
          '<div id="vexaVoiceTranscript" class="vexa-voice-transcript"></div>' +
        '</div>' +
        '<div class="vexa-voice-hint">Tap the orb to interrupt</div>';
      shell.appendChild(overlay);
      q("vexaVoiceAgentClose")?.addEventListener("click", () => {
        haptic("light");
        closeVoiceMode();
      });
      q("vexaVoiceOrb")?.addEventListener("click", () => {
        if (!state.active) return;
        if (state.phase === "speaking" || state.phase === "thinking") {
          haptic("light");
          interruptReply();
        }
      });
    }
    bindWorkspaceVisibility();
    state.installed = true;
    return true;
  }

  function bindWorkspaceVisibility() {
    if (state.workspaceObserver) return;
    try {
      const host = hostWindow();
      const workspace = host.document?.getElementById?.("vexaLiveWorkspace");
      if (!workspace) return;
      state.workspaceObserver = new MutationObserver(() => {
        if (workspace.getAttribute("aria-hidden") === "true" && state.active) closeVoiceMode();
      });
      state.workspaceObserver.observe(workspace, { attributes: true, attributeFilter: ["aria-hidden"] });
    } catch (error) {}
  }

  function setPhase(phase, status, transcript) {
    state.phase = phase;
    const overlay = q("vexaVoiceAgent");
    if (overlay) {
      overlay.classList.remove("connecting", "listening", "thinking", "speaking", "error");
      if (phase && phase !== "idle") overlay.classList.add(phase);
    }
    const statusNode = q("vexaVoiceStatus");
    const transcriptNode = q("vexaVoiceTranscript");
    if (statusNode) statusNode.textContent = String(status || phaseLabel(phase));
    if (transcriptNode && transcript !== undefined) transcriptNode.textContent = String(transcript || "");
  }

  function phaseLabel(phase) {
    if (phase === "connecting") return "Connecting";
    if (phase === "listening") return "Listening";
    if (phase === "thinking") return "Thinking";
    if (phase === "speaking") return "Laura";
    if (phase === "error") return "Connection issue";
    return "Ready";
  }

  async function openVoiceMode() {
    if (state.active) return;
    if (!ensureUi()) throw new Error("Voice mode is unavailable");
    state.active = true;
    state.history = [];
    state.lastCommitted = "";
    state.lastCommittedAt = 0;
    const overlay = q("vexaVoiceAgent");
    overlay?.classList.add("open");
    overlay?.setAttribute("aria-hidden", "false");
    setPhase("connecting", "Connecting to Laura", "");
    startOrb();

    try {
      state.session = await api("/session", {});
      if (!state.active) return;
      await ensureAudioContext();
      await Promise.all([startMicrophone(), connectScribe()]);
    } catch (error) {
      if (!state.active) return;
      fail(error);
      throw error;
    }
  }

  async function ensureAudioContext() {
    if (state.audioContext && state.audioContext.state !== "closed") {
      if (state.audioContext.state === "suspended") await state.audioContext.resume();
      return state.audioContext;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Live voice is not supported on this device");
    const context = new AudioContextClass();
    state.audioContext = context;
    if (context.state === "suspended") await context.resume();

    state.playbackGain = context.createGain();
    state.playbackAnalyser = context.createAnalyser();
    state.playbackAnalyser.fftSize = 256;
    state.playbackAnalyser.smoothingTimeConstant = .62;
    state.playbackData = new Uint8Array(state.playbackAnalyser.fftSize);
    state.playbackGain.connect(state.playbackAnalyser);
    state.playbackAnalyser.connect(context.destination);
    return context;
  }

  async function startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is not available on this device");
    if (state.mediaStream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (!state.active) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.mediaStream = stream;
    const context = await ensureAudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    state.micSource = source;
    state.micProcessor = processor;
    state.silentGain = silent;

    processor.onaudioprocess = (event) => {
      if (!state.active) return;
      const input = event.inputBuffer.getChannelData(0);
      state.micEnergy = rmsFloat(input);
      if (!state.captureEnabled || state.scribeSocket?.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleToPcm16(input, context.sampleRate, TARGET_SAMPLE_RATE);
      if (!pcm.length) return;
      try {
        state.scribeSocket.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: bytesToBase64(new Uint8Array(pcm.buffer)),
        }));
      } catch (error) {}
    };
  }

  async function connectScribe() {
    const token = String(state.session?.scribeToken || "");
    if (!token) throw new Error("Speech connection is unavailable");
    closeScribe();
    const params = new URLSearchParams({
      model_id: String(state.session?.scribeModel || "scribe_v2_realtime"),
      token,
      audio_format: "pcm_16000",
      commit_strategy: "vad",
      vad_silence_threshold_secs: "0.65",
      vad_threshold: "0.4",
      min_speech_duration_ms: "100",
      min_silence_duration_ms: "100",
      no_verbatim: "true",
    });
    const socket = new WebSocket(SCRIBE_URL + "?" + params.toString());
    state.scribeSocket = socket;

    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Speech connection timed out"));
        try { socket.close(); } catch (error) {}
      }, 10000);

      socket.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.captureEnabled = true;
        setPhase("listening", "Listening", "Start speaking naturally");
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("Could not connect to realtime speech"));
      }, { once: true });
    });

    socket.addEventListener("message", (event) => {
      if (!state.active) return;
      let message;
      try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
      const type = String(message?.message_type || "");
      if (type === "partial_transcript" || type === "final_transcript") {
        if (!state.turnBusy && state.captureEnabled) {
          const text = String(message?.text || "").trim();
          if (text) setPhase("listening", "Listening", text);
        }
        return;
      }
      if (type === "committed_transcript") {
        const text = String(message?.text || "").trim();
        if (!text || state.turnBusy) return;
        const now = Date.now();
        if (text === state.lastCommitted && now - state.lastCommittedAt < 2500) return;
        state.lastCommitted = text;
        state.lastCommittedAt = now;
        handleUserTurn(text).catch((error) => fail(error));
        return;
      }
      if (type.includes("error") || type === "rate_limited" || type === "quota_exceeded") {
        fail(new Error(String(message?.error || "Realtime speech was interrupted")));
      }
    });
    socket.addEventListener("close", () => {
      if (state.active && state.phase !== "error" && !state.turnBusy) {
        fail(new Error("Realtime speech connection closed"));
      }
    });
  }

  async function handleUserTurn(text) {
    if (!state.active || state.turnBusy) return;
    state.turnBusy = true;
    state.captureEnabled = false;
    state.micEnergy = 0;
    const userText = String(text || "").trim();
    setPhase("thinking", "Thinking", userText);
    haptic("light");

    const historyForRequest = state.history.slice(-MAX_HISTORY);
    state.history.push({ role: "user", content: userText });
    const aborter = new AbortController();
    state.turnAbort = aborter;

    try {
      const ttsPromise = openTtsSocket(aborter.signal);
      const chatPromise = api("/chat", { text: userText, history: historyForRequest }, {
        raw: true,
        accept: "application/x-ndjson",
        signal: aborter.signal,
      });
      const [tts, response] = await Promise.all([ttsPromise, chatPromise]);
      if (!state.active || aborter.signal.aborted) return;

      let assistantText = "";
      let speechPending = "";
      let streamError = "";
      const reader = response.body?.getReader();
      if (!reader) throw new Error("AI response stream is unavailable");
      const decoder = new TextDecoder();
      let buffer = "";

      const sendSpeechChunk = (force) => {
        const chunks = extractSpeakableChunks(speechPending, force);
        speechPending = chunks.rest;
        for (const chunk of chunks.ready) tts.sendText(chunk);
      };

      while (!aborter.signal.aborted) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          let event;
          try { event = JSON.parse(line); } catch (error) { continue; }
          if (event?.type === "delta" && typeof event.delta === "string") {
            assistantText += event.delta;
            speechPending += event.delta;
            setPhase(state.phase === "speaking" ? "speaking" : "thinking", state.phase === "speaking" ? "Laura" : "Thinking", cleanPreview(assistantText));
            sendSpeechChunk(false);
          } else if (event?.type === "error") {
            streamError = String(event.error || "AI couldn't answer right now");
          }
        }
        if (done) break;
      }

      if (aborter.signal.aborted || !state.active) return;
      sendSpeechChunk(true);
      tts.finish();
      if (streamError && !assistantText.trim()) throw new Error(streamError);
      if (!assistantText.trim()) throw new Error("AI didn't return a reply");
      state.history.push({ role: "assistant", content: assistantText.trim() });
      state.history = state.history.slice(-MAX_HISTORY);
      await tts.done;
      if (!state.active || aborter.signal.aborted) return;
      await waitForPlayback();
      if (!state.active || aborter.signal.aborted) return;
      state.turnBusy = false;
      state.turnAbort = null;
      state.captureEnabled = true;
      setPhase("listening", "Listening", "");
    } catch (error) {
      if (aborter.signal.aborted || !state.active) return;
      state.turnBusy = false;
      state.turnAbort = null;
      state.captureEnabled = true;
      throw error;
    }
  }

  async function openTtsSocket(signal) {
    const tokenData = await api("/tts-token", {}, { signal });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const voiceId = String(tokenData?.voiceId || state.session?.voiceId || "");
    const token = String(tokenData?.token || "");
    if (!voiceId || !token) throw new Error("Laura is unavailable");

    closeTts(false);
    const params = new URLSearchParams({
      model_id: String(tokenData?.modelId || "eleven_flash_v2_5"),
      single_use_token: token,
      output_format: String(tokenData?.outputFormat || "pcm_24000"),
      inactivity_timeout: "60",
      apply_text_normalization: "auto",
    });
    const socket = new WebSocket(TTS_URL + encodeURIComponent(voiceId) + "/stream-input?" + params.toString());
    state.ttsSocket = socket;

    const opened = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Laura connection timed out")), 10000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        try {
          socket.send(JSON.stringify({
            text: " ",
            voice_settings: { stability: 0.48, similarity_boost: 0.82, speed: 1.0 },
          }));
        } catch (error) {
          reject(error);
          return;
        }
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to Laura"));
      }, { once: true });
    });
    await opened;

    const done = new Promise((resolve, reject) => {
      state.ttsFinalResolve = resolve;
      state.ttsFinalReject = reject;
    });

    socket.addEventListener("message", (event) => {
      if (!state.active) return;
      let message;
      try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
      if (message?.audio) {
        try {
          schedulePcmAudio(String(message.audio));
          if (state.phase !== "speaking") setPhase("speaking", "Laura", q("vexaVoiceTranscript")?.textContent || "");
        } catch (error) {}
      }
      if (message?.is_final) {
        const resolve = state.ttsFinalResolve;
        state.ttsFinalResolve = null;
        state.ttsFinalReject = null;
        if (resolve) resolve();
        try { socket.close(1000, "done"); } catch (error) {}
      }
    });
    socket.addEventListener("close", (event) => {
      if (state.ttsFinalResolve && event.code !== 1000) {
        const reject = state.ttsFinalReject;
        state.ttsFinalResolve = null;
        state.ttsFinalReject = null;
        if (reject) reject(new Error("Laura audio connection closed"));
      }
    });
    socket.addEventListener("error", () => {
      const reject = state.ttsFinalReject;
      state.ttsFinalResolve = null;
      state.ttsFinalReject = null;
      if (reject) reject(new Error("Laura audio was interrupted"));
    });

    return {
      done,
      sendText(text) {
        const value = String(text || "").trim();
        if (!value || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ text: value + " " }));
      },
      finish() {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ text: "" }));
      },
    };
  }

  function extractSpeakableChunks(value, force) {
    let rest = String(value || "");
    const ready = [];
    while (rest.trim()) {
      const punctuation = findSpeechBoundary(rest);
      if (punctuation >= 18) {
        ready.push(rest.slice(0, punctuation + 1).trim());
        rest = rest.slice(punctuation + 1);
        continue;
      }
      if (rest.length >= 64) {
        let split = Math.min(rest.length, 76);
        while (split > 30 && !/\s/.test(rest.charAt(split))) split -= 1;
        if (split > 30) {
          ready.push(rest.slice(0, split).trim());
          rest = rest.slice(split);
          continue;
        }
      }
      if (force) {
        ready.push(rest.trim());
        rest = "";
      }
      break;
    }
    return { ready: ready.filter(Boolean), rest };
  }

  function findSpeechBoundary(text) {
    const source = String(text || "");
    const match = /[.!?؟؛;:\n](?:\s|$)/g;
    let found = -1;
    let item;
    while ((item = match.exec(source))) {
      if (item.index >= 18) { found = item.index; break; }
    }
    return found;
  }

  function schedulePcmAudio(base64) {
    const context = state.audioContext;
    const output = state.playbackGain;
    if (!context || !output) return;
    const bytes = base64ToBytes(base64);
    if (bytes.byteLength < 2) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
    const audioBuffer = context.createBuffer(1, count, TTS_SAMPLE_RATE);
    audioBuffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(output);
    const now = context.currentTime;
    if (!state.nextPlaybackTime || state.nextPlaybackTime < now + .025) state.nextPlaybackTime = now + .025;
    source.start(state.nextPlaybackTime);
    state.nextPlaybackTime += audioBuffer.duration;
    state.playbackSources.add(source);
    source.addEventListener("ended", () => state.playbackSources.delete(source), { once: true });
  }

  async function waitForPlayback() {
    const context = state.audioContext;
    if (!context) return;
    const delay = Math.max(0, (state.nextPlaybackTime - context.currentTime) * 1000 + 55);
    if (!delay) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 60000)));
  }

  function interruptReply() {
    state.turnAbort?.abort();
    state.turnAbort = null;
    state.turnBusy = false;
    closeTts(true);
    stopPlayback();
    state.captureEnabled = true;
    setPhase("listening", "Listening", "");
  }

  function closeTts(rejectPending) {
    const socket = state.ttsSocket;
    state.ttsSocket = null;
    if (socket) {
      try { socket.close(1000, "closed"); } catch (error) {}
    }
    if (rejectPending && state.ttsFinalReject) state.ttsFinalReject(new DOMException("Aborted", "AbortError"));
    state.ttsFinalResolve = null;
    state.ttsFinalReject = null;
  }

  function stopPlayback() {
    for (const source of Array.from(state.playbackSources)) {
      try { source.stop(); } catch (error) {}
      try { source.disconnect(); } catch (error) {}
    }
    state.playbackSources.clear();
    state.nextPlaybackTime = state.audioContext?.currentTime || 0;
  }

  function closeScribe() {
    state.captureEnabled = false;
    if (state.scribeSocket) {
      try { state.scribeSocket.close(1000, "closed"); } catch (error) {}
    }
    state.scribeSocket = null;
  }

  function stopMicrophone() {
    if (state.micProcessor) {
      state.micProcessor.onaudioprocess = null;
      try { state.micProcessor.disconnect(); } catch (error) {}
    }
    if (state.micSource) {
      try { state.micSource.disconnect(); } catch (error) {}
    }
    if (state.silentGain) {
      try { state.silentGain.disconnect(); } catch (error) {}
    }
    state.micProcessor = null;
    state.micSource = null;
    state.silentGain = null;
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (error) {}
      });
    }
    state.mediaStream = null;
    state.micEnergy = 0;
  }

  function closeVoiceMode() {
    if (!state.active) return;
    state.active = false;
    state.captureEnabled = false;
    state.turnAbort?.abort();
    state.turnAbort = null;
    state.turnBusy = false;
    closeScribe();
    closeTts(true);
    stopPlayback();
    stopMicrophone();
    stopOrb();
    const overlay = q("vexaVoiceAgent");
    overlay?.classList.remove("open", "connecting", "listening", "thinking", "speaking", "error");
    overlay?.setAttribute("aria-hidden", "true");
    setPhase("idle", "Ready", "");
  }

  function fail(error) {
    if (!state.active) return;
    console.error("Vexa voice agent", error);
    state.captureEnabled = false;
    state.turnBusy = false;
    const message = cleanError(error);
    setPhase("error", "Connection issue", message);
    haptic("error");
    window.setTimeout(() => {
      if (state.active && state.phase === "error") closeVoiceMode();
    }, 2600);
  }

  function cleanError(error) {
    const raw = String(error?.message || "Voice connection failed").replace(/\s+/g, " ").trim();
    if (/permission|notallowed/i.test(raw)) return "Microphone permission is required";
    return Array.from(raw).slice(0, 120).join("");
  }

  function cleanPreview(value) {
    return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(-170).join("");
  }

  function rmsFloat(values) {
    if (!values?.length) return 0;
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += values[i] * values[i];
    return Math.min(1, Math.sqrt(sum / values.length) * 4.2);
  }

  function playbackEnergy() {
    if (state.phase !== "speaking" || !state.playbackAnalyser || !state.playbackData) return 0;
    state.playbackAnalyser.getByteTimeDomainData(state.playbackData);
    let sum = 0;
    for (let i = 0; i < state.playbackData.length; i += 1) {
      const value = (state.playbackData[i] - 128) / 128;
      sum += value * value;
    }
    return Math.min(1, Math.sqrt(sum / state.playbackData.length) * 3.6);
  }

  function downsampleToPcm16(input, inputRate, outputRate) {
    if (!input?.length || !inputRate || inputRate < outputRate) return new Int16Array(0);
    const ratio = inputRate / outputRate;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const output = new Int16Array(length);
    for (let i = 0; i < length; i += 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += input[j];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      output[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    }
    return output;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + chunk)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function startOrb() {
    const canvas = q("vexaVoiceOrb");
    if (!canvas) return;
    stopOrb();
    state.orb = createOrbRenderer(canvas);
    state.orb?.start();
  }

  function stopOrb() {
    state.orb?.stop?.();
    state.orb = null;
  }

  function createOrbRenderer(canvas) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, powerPreference: "high-performance" }) ||
      canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "high-performance" }) ||
      canvas.getContext("experimental-webgl", { alpha: false, antialias: true });
    if (!gl) {
      canvas.style.background = "radial-gradient(circle at 50% 50%,#08080a 0 55%,#2d145f 68%,#7048e8 82%,#f4c6eb 96%,#080808 100%)";
      canvas.style.borderRadius = "50%";
      return { start() {}, stop() {} };
    }

    const vertex = `
      attribute vec2 aPosition;
      attribute vec2 aUv;
      varying vec2 vUv;
      void main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}
    `;
    const fragment = `
      precision highp float;
      uniform float iTime;
      uniform vec3 iResolution;
      uniform float hue;
      uniform float rot;
      uniform float noiseScale;
      uniform float innerRadius;
      uniform float energy;
      uniform float phase;
      varying vec2 vUv;
      vec3 rgb2yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
      vec3 yiq2rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
      vec3 adjustHue(vec3 color,float hueDeg){float a=radians(hueDeg);vec3 y=rgb2yiq(color);float c=cos(a),s=sin(a);y.yz=vec2(y.y*c-y.z*s,y.y*s+y.z*c);return yiq2rgb(y);}
      vec3 hash33(vec3 p){p=fract(p*vec3(.1031,.11369,.13787));p+=dot(p,p.yxz+19.19);return -1.0+2.0*fract(vec3(p.x+p.y,p.x+p.z,p.y+p.z)*p.zyx);}
      float snoise3(vec3 p){const float K1=.333333333;const float K2=.166666667;vec3 i=floor(p+(p.x+p.y+p.z)*K1);vec3 d0=p-(i-(i.x+i.y+i.z)*K2);vec3 e=step(vec3(0.0),d0-d0.yzx);vec3 i1=e*(1.0-e.zxy);vec3 i2=1.0-e.zxy*(1.0-e);vec3 d1=d0-(i1-K2);vec3 d2=d0-(i2-K1);vec3 d3=d0-.5;vec4 h=max(.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.0);vec4 n=h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.0)));return dot(vec4(31.316),n);}
      vec4 extractAlpha(vec3 c){float a=max(max(c.r,c.g),c.b);return vec4(c/(a+1e-5),a);}
      const vec3 baseColor0=vec3(.239,.353,1.0);
      const vec3 baseColor1=vec3(.616,0.0,1.0);
      const vec3 baseColor2=vec3(1.0,.373,.122);
      const vec3 baseColor3=vec3(0.0);
      float light1(float i,float a,float d){return i/(1.0+d*a);}
      float light2(float i,float a,float d){return i/(1.0+d*d*a);}
      vec4 draw(vec2 uv){
        vec3 c0=adjustHue(baseColor0,hue),c1=adjustHue(baseColor1,hue),c2=adjustHue(baseColor2,hue),c3=baseColor3;
        float len=length(uv),invLen=len>0.0?1.0/len:0.0;
        float pulse=sin(iTime*1.5)*.018+energy*.055+phase*.003;
        float n0=snoise3(vec3(uv*(noiseScale+energy*.08),iTime*(.46+phase*.08)))*.5+.5;
        float r0=mix(mix(innerRadius+pulse,1.0,.4),mix(innerRadius+pulse,1.0,.6),n0);
        float d0=distance(uv,(r0*invLen)*uv);
        float v0=light1(1.0+energy*.18,10.0,d0);v0*=smoothstep(r0*1.05,r0,len);
        float cl=cos(atan(uv.y,uv.x)+iTime*(2.0+phase*.18))*.5+.5;
        float a=iTime*(-1.0-phase*.08);vec2 pos=vec2(cos(a),sin(a))*r0;float d=distance(uv,pos);
        float v1=light2(1.5+energy*.5,5.0,d);v1*=light1(1.0,50.0,d0);
        float v2=smoothstep(1.0,mix(innerRadius,1.0,n0*.5),len);
        float v3=smoothstep(innerRadius,mix(innerRadius,1.0,.5),len);
        vec3 col=mix(c1,c2,cl);col=mix(col,c0,n0);col=mix(c3,col,v0);col=(col+v1)*v2*v3;col=clamp(col,0.0,1.0);
        return extractAlpha(col);
      }
      void main(){
        vec2 center=iResolution.xy*.5;float size=min(iResolution.x,iResolution.y);vec2 uv=(vUv*iResolution.xy-center)/size*2.0;
        float s=sin(rot),c=cos(rot);uv=vec2(c*uv.x-s*uv.y,s*uv.x+c*uv.y);
        vec4 col=draw(uv);vec3 rgb=col.rgb*col.a;gl_FragColor=vec4(rgb,1.0);
      }
    `;

    const program = createProgram(gl, vertex, fragment);
    if (!program) return { start() {}, stop() {} };
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,2,0,0,2]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "aPosition");
    const uvLoc = gl.getAttribLocation(program, "aUv");
    const uniforms = {
      time: gl.getUniformLocation(program, "iTime"),
      resolution: gl.getUniformLocation(program, "iResolution"),
      hue: gl.getUniformLocation(program, "hue"),
      rot: gl.getUniformLocation(program, "rot"),
      noise: gl.getUniformLocation(program, "noiseScale"),
      inner: gl.getUniformLocation(program, "innerRadius"),
      energy: gl.getUniformLocation(program, "energy"),
      phase: gl.getUniformLocation(program, "phase"),
    };
    let raf = 0;
    let startAt = performance.now();
    let lastAt = startAt;
    let rotation = 0;
    let smoothEnergy = 0;
    let running = false;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1));
      const width = Math.max(2, Math.round(rect.width * dpr));
      const height = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      return { width, height };
    }

    function frame(now) {
      if (!running || !state.active) return;
      const dt = Math.min(.05, Math.max(0, (now - lastAt) / 1000));
      lastAt = now;
      const phase = state.phase === "speaking" ? 2 : state.phase === "thinking" ? 1 : 0;
      const targetEnergy = state.phase === "speaking" ? playbackEnergy() : state.phase === "listening" ? state.micEnergy : .03;
      smoothEnergy += (targetEnergy - smoothEnergy) * Math.min(1, dt * (targetEnergy > smoothEnergy ? 12 : 5));
      rotation += dt * (.27 + phase*.08 + smoothEnergy*.16);
      const size = resize();
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);gl.enableVertexAttribArray(positionLoc);gl.vertexAttribPointer(positionLoc,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);gl.enableVertexAttribArray(uvLoc);gl.vertexAttribPointer(uvLoc,2,gl.FLOAT,false,0,0);
      gl.uniform1f(uniforms.time,(now-startAt)/1000);
      gl.uniform3f(uniforms.resolution,size.width,size.height,size.width/Math.max(1,size.height));
      gl.uniform1f(uniforms.hue,0.0);
      gl.uniform1f(uniforms.rot,rotation);
      gl.uniform1f(uniforms.noise,.65);
      gl.uniform1f(uniforms.inner,.1);
      gl.uniform1f(uniforms.energy,Math.min(1,smoothEnergy));
      gl.uniform1f(uniforms.phase,phase);
      gl.drawArrays(gl.TRIANGLES,0,3);
      raf=requestAnimationFrame(frame);
    }

    return {
      start(){if(running)return;running=true;startAt=performance.now();lastAt=startAt;raf=requestAnimationFrame(frame);},
      stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0;try{gl.deleteBuffer(positionBuffer);gl.deleteBuffer(uvBuffer);gl.deleteProgram(program);}catch(error){}},
    };
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Vexa orb shader", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Vexa orb program", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function initialize() {
    if (ensureUi()) return;
    if (state.installObserver) return;
    state.installObserver = new MutationObserver(() => {
      if (ensureUi()) {
        state.installObserver?.disconnect();
        state.installObserver = null;
      }
    });
    state.installObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.active) closeVoiceMode();
  });
  window.addEventListener("pagehide", () => closeVoiceMode());
  window.addEventListener("beforeunload", () => closeVoiceMode());

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}

export const VEXA_VOICE_AGENT_JS = "(" + vexaVoiceAgentBootstrap.toString() + ")();";
