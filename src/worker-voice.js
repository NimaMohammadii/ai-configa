import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import VEXA_VOICE_AGENT_SOURCE from "./mini-app/vexa-live/voice-agent-runtime.txt";
import VEXA_VOICE_ORB_SOURCE from "./mini-app/vexa-live/voice-orb-original.txt";

const VEXA_VOICE_AGENT_VERSION = "20260818-4";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";

export { AiCodingWorkflow } from "./worker-tribute.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isVexaVoiceAgentRequest(request)) {
      return handleVexaVoiceAgentRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === VOICE_RUNTIME_PATH) {
      return voiceRuntimeResponse();
    }

    const response = await worker.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === LIVE_INTEGRATION_PATH) {
      return refineLiveIntegration(response);
    }

    return response;
  },
};

function restoreOriginalOrb(source) {
  let restored = String(source || "");
  const rendererStart = restored.indexOf("  function createOrbRenderer(canvas) {");
  const initializeStart = restored.indexOf("  function initialize() {", rendererStart);

  if (rendererStart >= 0 && initializeStart > rendererStart) {
    restored =
      restored.slice(0, rendererStart) +
      String(VEXA_VOICE_ORB_SOURCE || "").trimEnd() +
      "\n\n" +
      restored.slice(initializeStart);
  }

  return restored.replace(
    "radial-gradient(circle at 50% 50%,#08080a 0 54%,rgba(54,22,118,.62) 67%,#8352ff 80%,#ffc7ea 97%)",
    "radial-gradient(circle at 50% 50%,#08080a 0 55%,rgba(58,25,120,.55) 68%,#8c5cff 81%,#ffd1f2 98%)",
  );
}

function makeInlineVoice(source) {
  let result = String(source || "");

  // Preserve the exact Orb shader/look; only raise its render-buffer density.
  result = result.replace(
    "const dpr = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1));",
    "const dpr = Math.min(2.75, Math.max(1.5, window.devicePixelRatio || 1));",
  );

  // The status style is installed by the Orb runtime after the base stylesheet,
  // so remove its old fullscreen-era vertical offset.
  result = result.replace(
    ".vexa-voice-copy{display:flex!important;min-height:24px!important;margin-top:-8px!important;transform:translateY(-42px)!important;opacity:1!important}",
    ".vexa-voice-copy{display:flex!important;min-height:24px!important;margin-top:-2px!important;transform:none!important;opacity:1!important}",
  );
  result = result.replace(
    ".vexa-voice-overlay.open .vexa-voice-copy{display:flex!important;transform:translateY(-42px)!important;opacity:1!important}",
    ".vexa-voice-overlay.open .vexa-voice-copy{display:flex!important;transform:none!important;opacity:1!important}",
  );

  // Replace the old mini Orb button mark with a compact three-bar Voice mark.
  result = result.replace(
    `      button.innerHTML = '<span class="vexa-voice-open-orb" aria-hidden="true"></span>';`,
    `      button.innerHTML = '<span class="vexa-voice-button-icon" aria-hidden="true"><i class="vexa-voice-button-bar vexa-voice-button-bar-a"></i><i class="vexa-voice-button-bar vexa-voice-button-bar-b"></i><i class="vexa-voice-button-bar vexa-voice-button-bar-c"></i></span>';`,
  );

  // Replace the fullscreen presentation with one compact, in-page voice surface.
  const cssMarker = "      @keyframes vexaVoiceButtonBreath";
  if (result.includes(cssMarker)) {
    const inlineCss = `      .vexa-voice-close,.vexa-voice-hint,.vexa-voice-transcript{display:none!important}
      .vexa-voice-overlay{position:absolute!important;z-index:9!important;left:50%!important;right:auto!important;top:auto!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;inset:auto auto calc(72px + env(safe-area-inset-bottom)) 50%!important;width:188px!important;height:190px!important;min-height:0!important;padding:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-end!important;background:transparent!important;overflow:visible!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translate(-50%,30px) scale(.72)!important;transform-origin:50% 100%!important;filter:blur(8px)!important;transition:opacity .28s ease,transform .58s cubic-bezier(.16,1,.3,1),filter .4s ease,visibility 0s linear .58s!important}
      .vexa-voice-overlay.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translate(-50%,0) scale(1)!important;filter:blur(0)!important;transition-delay:0s!important}
      .vexa-voice-stage{width:150px!important;height:150px!important;flex:0 0 150px!important;aspect-ratio:1!important;opacity:0!important;transform:translateY(20px) scale(.68)!important;filter:blur(7px)!important;transition:opacity .32s .04s ease,transform .62s .02s cubic-bezier(.16,1,.3,1),filter .36s .02s ease!important}
      .vexa-voice-overlay.open .vexa-voice-stage{opacity:1!important;transform:translateY(0) scale(1)!important;filter:blur(0)!important}
      .vexa-voice-canvas{width:150px!important;height:150px!important;image-rendering:auto!important}
      .vexa-voice-copy{width:188px!important;min-height:24px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:center!important;opacity:0!important;transform:translateY(8px)!important;transition:opacity .28s .16s ease,transform .42s .12s cubic-bezier(.16,1,.3,1)!important}
      .vexa-voice-overlay.open .vexa-voice-copy{opacity:1!important;transform:none!important}
      .vexa-voice-status{min-height:22px!important;height:auto!important;max-width:184px!important;color:rgba(255,255,255,.68)!important;font-size:10.5px!important;font-weight:650!important;line-height:1.3!important;letter-spacing:-.01em!important;text-align:center!important;white-space:normal!important}
      .vexa-voice-button-icon{position:relative;width:20px;height:20px;display:block;transform:scale(.96);transition:transform .34s cubic-bezier(.16,1,.3,1)}
      .vexa-voice-button-bar{position:absolute;left:50%;top:50%;display:block;width:2.8px;border-radius:999px;background:currentColor;transform-origin:50% 50%;transition:left .38s cubic-bezier(.16,1,.3,1),height .38s cubic-bezier(.16,1,.3,1),opacity .22s ease,transform .42s cubic-bezier(.16,1,.3,1)}
      .vexa-voice-button-bar-a{height:8px;transform:translate(-7px,-50%)}
      .vexa-voice-button-bar-b{height:15px;transform:translate(-50%,-50%)}
      .vexa-voice-button-bar-c{height:10px;transform:translate(4.2px,-50%)}
      .vexa-voice-open:not([aria-pressed="true"]) .vexa-voice-button-icon{animation:vexaVoiceMarkBreath 2.5s ease-in-out infinite}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-icon{transform:scale(1)}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-a{left:50%;height:18px;width:3.2px;transform:translate(-50%,-50%) rotate(45deg)}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-b{height:3px;opacity:0;transform:translate(-50%,-50%) scale(.35)}
      .vexa-voice-open[aria-pressed="true"] .vexa-voice-button-bar-c{left:50%;height:18px;width:3.2px;transform:translate(-50%,-50%) rotate(-45deg)}
      .vexa-stt.voice-active .vexa-stt-record,.vexa-stt.voice-active .vexa-stt-upload{opacity:.2!important;pointer-events:none!important;transform:scale(.94)!important}
      .vexa-stt.voice-active .vexa-voice-open{opacity:1!important;pointer-events:auto!important;transform:none!important;background:rgba(20,20,20,.82)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(255,255,255,.07),0 0 0 1px rgba(255,255,255,.1),0 10px 24px rgba(0,0,0,.28)!important}
      @keyframes vexaVoiceMarkBreath{0%,100%{transform:scale(.93);opacity:.72}50%{transform:scale(1.04);opacity:1}}
`;
    result = result.replace(cssMarker, inlineCss + cssMarker);
  }

  // The same Voice button becomes the close/toggle control; no back button needed.
  result = result.replace(
    `      button.addEventListener("click", () => {
        if (shell.classList.contains("recording") || shell.classList.contains("processing")) return;
        haptic("medium");
        openVoiceMode().catch((error) => fail(error));
      });`,
    `      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (shell.classList.contains("recording") || shell.classList.contains("processing")) return;
        haptic("medium");
        if (state.active) {
          closeVoiceMode();
          return;
        }
        openVoiceMode().catch((error) => fail(error));
      });`,
  );

  result = result.replace(
    `    state.active = true;
    state.captureEnabled = false;`,
    `    state.active = true;
    state.captureEnabled = false;
    q("vexaStt")?.classList.add("voice-active");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-pressed", "true");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-label", "Stop Vexa Voice");`,
  );

  result = result.replace(
    `    state.active = false;
    state.captureEnabled = false;
    closeSpeechEngine();`,
    `    state.active = false;
    state.captureEnabled = false;
    q("vexaStt")?.classList.remove("voice-active");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-pressed", "false");
    q("vexaVoiceAgentOpen")?.setAttribute("aria-label", "Talk to Vexa");
    closeSpeechEngine();`,
  );

  return result;
}

function diagnoseVoiceFailures(source) {
  let result = String(source || "");

  result = result.replace(
    `  function fail(error) {
    if (!state.active) return;
    console.error("Vexa voice agent", error);
    state.captureEnabled = false;
    setPhase("error", "Connection issue", cleanError(error));
    haptic("error");
    window.setTimeout(() => {
      if (state.active && state.phase === "error") closeVoiceMode();
    }, 3200);
  }`,
    `  function fail(error) {
    if (!state.active) return;
    console.error("Vexa voice agent", error);
    state.captureEnabled = false;
    const message = cleanError(error);
    setPhase("error", "Error · " + message, "");
    haptic("error");
  }`,
  );

  result = result.replace(
    `    socket.addEventListener("close", () => {
      if (state.active && state.phase !== "error") fail(new Error("V3 voice connection closed"));
    });`,
    `    socket.addEventListener("close", (event) => {
      if (state.active && state.phase !== "error") {
        const code = Number(event?.code || 0);
        const reason = String(event?.reason || "").trim();
        const detail = reason || (code ? "WebSocket closed · " + code : "V3 voice connection closed");
        fail(new Error(detail));
      }
    });`,
  );

  result = result.replace(
    `    if (type.includes("error")) {
      fail(new Error(String(message?.message || message?.error || "V3 voice was interrupted")));
    }`,
    `    if (type.includes("error")) {
      const nested = message?.client_error_event || message?.error_event || {};
      const value = nested?.message ?? nested?.error ?? nested?.reason ?? nested?.code ?? message?.message ?? message?.error ?? "V3 voice was interrupted";
      let detail = "";
      try { detail = typeof value === "string" ? value : JSON.stringify(value); } catch (error) { detail = String(value || ""); }
      fail(new Error(detail || "V3 voice was interrupted"));
    }`,
  );

  result = result.replace(
    `      if (type.includes("error")) {
        clearVoiceResponseWatchdog();
        const messageText = String(message?.message || message?.error || "Voice connection failed");
        fail(new Error(messageText));
      }`,
    `      if (type.includes("error")) {
        clearVoiceResponseWatchdog();
        const nested = message?.client_error_event || message?.error_event || {};
        const value = nested?.message ?? nested?.error ?? nested?.reason ?? nested?.code ?? message?.message ?? message?.error ?? "Voice connection failed";
        let messageText = "";
        try { messageText = typeof value === "string" ? value : JSON.stringify(value); } catch (error) { messageText = String(value || ""); }
        fail(new Error(messageText || "Voice connection failed"));
      }`,
  );

  return result;
}

function browserVoiceRuntimeSource() {
  const raw = diagnoseVoiceFailures(
    makeInlineVoice(
      restoreOriginalOrb(VEXA_VOICE_AGENT_SOURCE),
    ),
  );
  const exportMarker = "\nexport const VEXA_VOICE_AGENT_JS";
  const exportIndex = raw.lastIndexOf(exportMarker);
  const browserBody = exportIndex >= 0 ? raw.slice(0, exportIndex) : raw;

  return (
    "try{window.__vexaVoiceRuntimeVersion=" +
    JSON.stringify(VEXA_VOICE_AGENT_VERSION) +
    ";window.__vexaVoiceRuntimeError=\"\";window.__vexaVoiceRuntimeStarted=false;}catch(error){}\n" +
    browserBody +
    "\n;try{vexaVoiceAgentBootstrap();window.__vexaVoiceRuntimeStarted=true;}catch(error){" +
    "try{window.__vexaVoiceRuntimeError=String(error&&error.message||error||\"Voice runtime failed\");}catch(ignore){}" +
    "try{console.error(\"Vexa voice runtime\",error);}catch(ignore){}" +
    "}"
  );
}

function voiceRuntimeResponse() {
  return new Response(browserVoiceRuntimeSource(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Vexa-Voice-Agent": VEXA_VOICE_AGENT_VERSION,
    },
  });
}

async function refineLiveIntegration(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();

  // Put the transcript/editor content lower without moving the bottom controls.
  source = source.replace(
    "margin-top:-4px;transition:opacity",
    "margin-top:18px;transition:opacity",
  );

  // During transcription: no waveform/center line. Only a spinner on the main button.
  source = source.replace(
    '".vexa-stt.recording .vexa-stt-wave-stage,.vexa-stt.processing .vexa-stt-wave-stage{opacity:1;transform:translate(-50%,0) scale(1)}",',
    '".vexa-stt.recording .vexa-stt-wave-stage{opacity:1;transform:translate(-50%,0) scale(1)}",',
  );
  source = source.replace(
    '".vexa-stt-spinner{display:none!important}",',
    '".vexa-stt-spinner{position:absolute;z-index:2;width:18px;height:18px;border-radius:50%;border:1.8px solid rgba(0,0,0,.16);border-top-color:#050505;opacity:0;animation:vexaSttSpin .7s linear infinite}",\n      ".vexa-stt.processing .vexa-stt-spinner{opacity:1}",',
  );
  source = source.replace(
    /      "\.vexa-stt\.processing \.vexa-stt-record::after\{[^\n]*\}",\n/,
    '      ".vexa-stt.processing .vexa-stt-record::after{content:none!important}",\n',
  );
  source = source.replace(
    /      "\.vexa-stt\.processing \.vexa-stt-wave-stage\{[^\n]*\}",\n/,
    '      ".vexa-stt.processing .vexa-stt-wave-stage{display:none!important}",\n',
  );
  source = source
    .split("\n")
    .filter((line) => {
      if (line.includes('".vexa-stt.processing .vexa-stt-wave-track')) return false;
      if (line.includes('".vexa-stt.processing .vexa-stt-wave-caption')) return false;
      if (line.includes('"@keyframes vexaSttProcessingTravel')) return false;
      if (line.includes('"@keyframes vexaSttProcessingPulse')) return false;
      if (line.includes('"@keyframes vexaSttProcessing{')) return false;
      if (line.includes('"@keyframes vexaSttButtonState')) return false;
      return true;
    })
    .join("\n");
  source = source.replace(
    '      "@keyframes vexaSttTextIn{0%{opacity:.08;transform:translateY(9px)}100%{opacity:1;transform:none}}",',
    '      "@keyframes vexaSttTextIn{0%{opacity:.08;transform:translateY(9px)}100%{opacity:1;transform:none}}",\n      "@keyframes vexaSttSpin{to{transform:rotate(360deg)}}",',
  );

  // Prime the analyser AudioContext from the tap gesture for iOS/Telegram WebView.
  source = source.replace(
    `    cleanupRecording(false);
    setStatus(doc, "Requesting microphone…", true);`,
    `    cleanupRecording(false);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        recorderContext = new AudioContextClass();
        if (recorderContext.state === "suspended") {
          const resumed = recorderContext.resume();
          if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
        }
      } catch (error) {
        recorderContext = null;
      }
    }

    setStatus(doc, "Requesting microphone…", true);`,
  );

  source = source.replace(
    `      recorderContext = new AudioContextClass();
      recorderAnalyser = recorderContext.createAnalyser();`,
    `      recorderContext = recorderContext && recorderContext.state !== "closed"
        ? recorderContext
        : new AudioContextClass();
      if (recorderContext.state === "suspended") {
        try {
          const resumed = recorderContext.resume();
          if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
        } catch (error) {}
      }
      recorderAnalyser = recorderContext.createAnalyser();`,
  );

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Live-Fix", VEXA_VOICE_AGENT_VERSION);

  return new Response(source, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
