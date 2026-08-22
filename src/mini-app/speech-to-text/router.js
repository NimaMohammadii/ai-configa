import {
  MINI_APP_BROADCAST_SECTIONS,
  MINI_APP_TRACKED_SECTIONS,
} from "../../admin.js";
import {
  handleMiniAppWithVexaLive as handleLegacyMiniAppWithSpeechToText,
  handleVexaLiveRequest as handleLegacySpeechToTextRequest,
} from "./router-legacy.js";

const LEGACY_ROOT = "/mini-app/live";
const SPEECH_ROOT = "/mini-app/speech-to-text";
const SECTION_KEY = "stt";
const SECTION_LABEL = "Speech to Text";

MINI_APP_BROADCAST_SECTIONS[SECTION_KEY] = SECTION_LABEL;
MINI_APP_TRACKED_SECTIONS[SECTION_KEY] = SECTION_LABEL;

export function isSpeechToTextRequest(request) {
  const path = new URL(request.url).pathname;
  return path === SPEECH_ROOT ||
    path === SPEECH_ROOT + "/" ||
    path.startsWith(SPEECH_ROOT + "/");
}

export async function handleSpeechToTextRequest(request, env) {
  const targetRequest = rewriteSpeechRequestToLegacy(request);
  const response = await handleLegacySpeechToTextRequest(targetRequest, env);
  return relabelSpeechToTextResponse(response);
}

export async function handleMiniAppWithSpeechToText(request, env) {
  return handleLegacyMiniAppWithSpeechToText(request, env);
}

function rewriteSpeechRequestToLegacy(request) {
  const url = new URL(request.url);
  url.pathname = LEGACY_ROOT + url.pathname.slice(SPEECH_ROOT.length);
  return new Request(url.toString(), request);
}

async function relabelSpeechToTextResponse(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript") && !contentType.includes("text/html")) {
    return response;
  }

  let source = await response.text();
  if (contentType.includes("text/html")) {
    source = source
      .replace("<title>Vexa Live</title>", "<title>Speech to Text</title>")
      .replace('aria-label="Vexa Live speech to text"', 'aria-label="Speech to Text"');
  } else {
    source = source
      .replace('const BUTTON_ID = "vexaLiveOpen";', 'const BUTTON_ID = "speechToTextOpen";')
      .replaceAll("Open Vexa Live speech to text", "Open Speech to Text")
      .replace(
        'if (button && requestedSection() === "live") setLiveOpen(true);',
        'if (button && (requestedSection() === "stt" || requestedSection() === "speech-to-text")) setLiveOpen(true);'
      )
      .replace('frame.src = "/mini-app/live";', 'frame.src = "/mini-app/speech-to-text";')
      .replace('frame.title = "Vexa Live";', 'frame.title = "Speech to Text";')
      .replace('frame.setAttribute("aria-label", "Vexa Live speech to text");', 'frame.setAttribute("aria-label", "Speech to Text");');
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Section", "speech-to-text");
  return new Response(source, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
