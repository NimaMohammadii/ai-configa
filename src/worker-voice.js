import worker from "./worker-tribute.js";
import {
  handleVexaVoiceAgentRequest,
  isVexaVoiceAgentRequest,
} from "./mini-app/vexa-live/voice-agent.js";
import VEXA_VOICE_AGENT_SOURCE from "./mini-app/vexa-live/voice-agent-runtime.txt";
import VEXA_VOICE_ORB_SOURCE from "./mini-app/vexa-live/voice-orb-original.txt";

const VEXA_VOICE_AGENT_VERSION = "20260818-1";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";

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

    return worker.fetch(request, env, ctx);
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

function polishVoiceUi(source) {
  let polished = String(source || "");

  polished = polished.replace(
    "background:#080808;color:#fff;opacity:0;visibility:hidden",
    "background:#000000;color:#fff;opacity:0;visibility:hidden",
  );

  polished = polished.replace(
    ".vexa-voice-close{position:absolute;z-index:4;top:calc(14px + env(safe-area-inset-top));left:14px;width:38px;height:38px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:50%;color:#fff;background:rgba(255,255,255,.05);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 9px 24px rgba(0,0,0,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:20px;font-weight:300;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease}",
    ".vexa-voice-close{position:absolute;z-index:4;top:calc(14px + env(safe-area-inset-top));left:14px;width:38px;height:38px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;color:#fff;background:rgba(13,13,13,.66);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -1px 0 rgba(255,255,255,.045),0 10px 26px rgba(0,0,0,.28);backdrop-filter:blur(12px) saturate(1.08);-webkit-backdrop-filter:blur(12px) saturate(1.08);font-size:21px;line-height:1;font-weight:800;letter-spacing:-.04em;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s ease}",
  );

  polished = polished.replace(
    ".vexa-voice-stage{position:relative;width:min(82vw,390px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:scale(.74);filter:blur(8px);transition:opacity .48s .06s ease,transform .72s .04s cubic-bezier(.16,1,.3,1),filter .5s .04s ease}",
    ".vexa-voice-stage{position:relative;width:min(82vw,390px);aspect-ratio:1;display:grid;place-items:center;opacity:0;transform:translateY(-42px) scale(.74);filter:blur(8px);transition:opacity .48s .06s ease,transform .72s .04s cubic-bezier(.16,1,.3,1),filter .5s .04s ease}",
  );

  polished = polished.replace(
    ".vexa-voice-overlay.open .vexa-voice-stage{opacity:1;transform:scale(1);filter:blur(0)}",
    ".vexa-voice-overlay.open .vexa-voice-stage{opacity:1;transform:translateY(-42px) scale(1);filter:blur(0)}",
  );

  return polished;
}

function makeVoiceOrbOnly(source) {
  let result = String(source || "");

  result = result.replace(
    "      @media(max-height:650px)",
    "      .vexa-voice-close,.vexa-voice-copy,.vexa-voice-hint{display:none!important}\n      @media(max-height:650px)",
  );

  const openMarker = "  async function openVoiceMode() {";
  if (result.includes(openMarker)) {
    const helpers = `  let vexaVoiceBackHandler = null;

  function setVoiceHostActive(active) {
    try {
      const host = hostWindow();
      const doc = host?.document;
      if (!doc || doc === document) return;
      let style = doc.getElementById("vexaVoiceHostModeStyle");
      if (!style) {
        style = doc.createElement("style");
        style.id = "vexaVoiceHostModeStyle";
        style.textContent =
          '.vexa-voice-host-active .tts-head{opacity:0!important;visibility:hidden!important;pointer-events:none!important}' +
          '.vexa-voice-host-active #vexaLiveWorkspace{top:0!important;z-index:2147483000!important}';
        doc.head?.appendChild(style);
      }
      doc.documentElement?.classList.toggle("vexa-voice-host-active", Boolean(active));
    } catch (error) {}
  }

  function showTelegramBackButton() {
    const backButton = hostWindow()?.Telegram?.WebApp?.BackButton || telegram()?.BackButton;
    if (!backButton) return;
    if (!vexaVoiceBackHandler) {
      vexaVoiceBackHandler = () => {
        if (!state.active) return;
        haptic("light");
        closeVoiceMode();
      };
    }
    try { backButton.offClick?.(vexaVoiceBackHandler); } catch (error) {}
    try { backButton.onClick?.(vexaVoiceBackHandler); } catch (error) {}
    try { backButton.show?.(); } catch (error) {}
  }

  function hideTelegramBackButton() {
    const backButton = hostWindow()?.Telegram?.WebApp?.BackButton || telegram()?.BackButton;
    if (!backButton) return;
    if (vexaVoiceBackHandler) {
      try { backButton.offClick?.(vexaVoiceBackHandler); } catch (error) {}
    }
    try { backButton.hide?.(); } catch (error) {}
  }
`;
    result = result.replace(openMarker, helpers + "\n" + openMarker);
  }

  result = result.replace(
    "    state.captureEnabled = false;\n    state.outputSampleRate = DEFAULT_OUTPUT_SAMPLE_RATE;",
    "    state.captureEnabled = false;\n    state.outputSampleRate = DEFAULT_OUTPUT_SAMPLE_RATE;\n    setVoiceHostActive(true);\n    showTelegramBackButton();",
  );

  result = result.replace(
    "    state.active = false;\n    state.captureEnabled = false;\n    closeSpeechEngine();",
    "    state.active = false;\n    state.captureEnabled = false;\n    hideTelegramBackButton();\n    setVoiceHostActive(false);\n    closeSpeechEngine();",
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

  result = result.replace(
    ".vexa-voice-status{height:24px!important;color:rgba(255,255,255,.68)!important;font-size:12px!important;font-weight:650!important;letter-spacing:-.015em!important}",
    ".vexa-voice-status{min-height:24px!important;height:auto!important;max-width:min(88vw,420px)!important;color:rgba(255,255,255,.68)!important;font-size:12px!important;font-weight:650!important;line-height:1.35!important;letter-spacing:-.015em!important;text-align:center!important;white-space:normal!important}",
  );

  return result;
}

function browserVoiceRuntimeSource() {
  const raw = diagnoseVoiceFailures(
    makeVoiceOrbOnly(
      polishVoiceUi(
        restoreOriginalOrb(VEXA_VOICE_AGENT_SOURCE),
      ),
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
