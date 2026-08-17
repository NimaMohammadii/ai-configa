import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { DEFAULT_AI_CHAT_MODEL } from "../../ai-chat-model.js";
import { VOICES } from "../../voices.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const ROOT = "/mini-app/live/api/voice-agent";
const UPSTREAM_PATH = ROOT + "/speech-engine-upstream";
const SPEECH_ENGINE_NAME = "Vexa Voice V3";
const TTS_MODEL = "eleven_v3_conversational";
const VOICE_NAME = "Laura";
const VOICE_ID = VOICES[VOICE_NAME];
const MAX_HISTORY_ITEMS = 18;
const MAX_HISTORY_CHARS = 14000;
const OPENAI_TIMEOUT_MS = 45_000;
const SPEECH_ENGINE_CACHE = new Map();
const SPEECH_LANGUAGES = new Set(["en", "fa", "ru", "de", "tr", "ar", "es", "hi", "zh", "ja"]);

export function isVexaVoiceAgentRequest(request) {
  const path = new URL(request.url).pathname;
  return path === ROOT || path.startsWith(ROOT + "/");
}

export async function handleVexaVoiceAgentRequest(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === UPSTREAM_PATH) {
      return handleSpeechEngineUpstream(request, env);
    }

    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

    if (path === ROOT + "/session") {
      const { user, payload } = await authenticateRequest(request, env);
      const apiKey = await selectedElevenApiKey(env);
      if (!apiKey) throw httpError("ElevenLabs API is unavailable", 503);

      const language = normalizeSpeechLanguage(payload.language);
      const speechEngineId = await ensureSpeechEngine(request, apiKey, language);
      const signedUrl = await getSpeechEngineSignedUrl(apiKey, speechEngineId);

      return json({
        ok: true,
        userId: String(user.id),
        signedUrl,
        speechEngineId,
        engine: "speech_engine",
        ttsModel: TTS_MODEL,
        voiceName: VOICE_NAME,
        voiceId: VOICE_ID,
        inputAudioFormat: "pcm_16000",
        outputAudioFormat: "pcm_16000",
        turnEagerness: "eager",
        language,
      });
    }

    return json({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Vexa voice agent request failed", error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }
}

async function authenticateRequest(request, env) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  return { user, payload };
}

async function assertLiveAccess(env, userId) {
  const admin = await isAdmin(env, userId);
  if (admin) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    throw httpError("Vexa Live is updating", 423);
  }
}

async function selectedElevenApiKey(env) {
  const selectedKeyName = await getElevenApiSetting(env);
  return String(env[selectedKeyName] || "").trim();
}

function normalizeSpeechLanguage(value) {
  const raw = String(value || "").trim().toLowerCase().replace("_", "-");
  const base = raw.split("-")[0];
  return SPEECH_LANGUAGES.has(base) ? base : "en";
}

function speechEngineConfig(request, language) {
  const url = new URL(request.url);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  const upstreamUrl = wsProtocol + "//" + url.host + UPSTREAM_PATH;

  return {
    name: SPEECH_ENGINE_NAME + " " + language,
    speech_engine: {
      ws_url: upstreamUrl,
    },
    asr: {
      quality: "high",
      provider: "elevenlabs",
      user_input_audio_format: "pcm_16000",
      keywords: [],
    },
    tts: {
      model_id: TTS_MODEL,
      voice_id: VOICE_ID,
      agent_output_audio_format: "pcm_16000",
      optimize_streaming_latency: 3,
      stability: 0.48,
      speed: 1,
      similarity_boost: 0.82,
    },
    turn: {
      turn_timeout: 7,
      silence_end_call_timeout: -1,
      turn_eagerness: "eager",
      mode: "turn",
    },
    conversation: {
      max_duration_seconds: 600,
      client_events: ["audio", "interruption", "agent_response", "user_transcript"],
    },
    language,
    tags: ["vexa", "voice-v3", language],
  };
}

async function ensureSpeechEngine(request, apiKey, language) {
  const desired = speechEngineConfig(request, language);
  const cacheKey = desired.name + "|" + desired.speech_engine.ws_url;
  const cached = SPEECH_ENGINE_CACHE.get(cacheKey);
  if (cached) return cached;

  const listUrl =
    "https://api.elevenlabs.io/v1/speech-engine?page_size=20&search=" +
    encodeURIComponent(desired.name);
  const listed = await elevenJson(listUrl, apiKey, { method: "GET" });
  const summary = (Array.isArray(listed?.speech_engines) ? listed.speech_engines : []).find(
    (item) => String(item?.name || "") === desired.name,
  );

  let engineId = String(summary?.speech_engine_id || "");
  if (!engineId) {
    const created = await elevenJson("https://api.elevenlabs.io/v1/speech-engine", apiKey, {
      method: "POST",
      body: JSON.stringify(desired),
    }, 201);
    engineId = String(created?.speech_engine_id || "");
    if (!engineId) throw httpError("V3 voice engine could not be created", 502);
  } else {
    const current = await elevenJson(
      "https://api.elevenlabs.io/v1/speech-engine/" + encodeURIComponent(engineId),
      apiKey,
      { method: "GET" },
    );
    if (speechEngineNeedsUpdate(current, desired)) {
      await elevenJson(
        "https://api.elevenlabs.io/v1/speech-engine/" + encodeURIComponent(engineId),
        apiKey,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: desired.name,
            speech_engine: desired.speech_engine,
            asr: desired.asr,
            tts: desired.tts,
            turn: desired.turn,
            conversation: desired.conversation,
            language: desired.language,
            tags: desired.tags,
          }),
        },
      );
    }
  }

  SPEECH_ENGINE_CACHE.set(cacheKey, engineId);
  return engineId;
}

function speechEngineNeedsUpdate(current, desired) {
  return (
    String(current?.speech_engine?.ws_url || "") !== desired.speech_engine.ws_url ||
    String(current?.tts?.model_id || "") !== desired.tts.model_id ||
    String(current?.tts?.voice_id || "") !== desired.tts.voice_id ||
    String(current?.tts?.agent_output_audio_format || "") !== desired.tts.agent_output_audio_format ||
    String(current?.turn?.turn_eagerness || "") !== desired.turn.turn_eagerness ||
    String(current?.language || "") !== desired.language
  );
}

async function getSpeechEngineSignedUrl(apiKey, speechEngineId) {
  const endpoint =
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=" +
    encodeURIComponent(speechEngineId);
  const data = await elevenJson(endpoint, apiKey, { method: "GET" });
  const signedUrl = String(data?.signed_url || "");
  if (!signedUrl.startsWith("wss://")) throw httpError("V3 voice session is unavailable", 502);
  return signedUrl;
}

async function elevenJson(url, apiKey, options, expectedStatus = 200) {
  const headers = new Headers(options?.headers || {});
  headers.set("xi-api-key", apiKey);
  headers.set("accept", "application/json");
  if (options?.body) headers.set("content-type", "application/json");

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (expectedStatus && response.status !== expectedStatus && response.status >= 400)) {
    const detail = String(data?.detail?.message || data?.detail || data?.message || "unknown error");
    console.error("Vexa V3 ElevenLabs API failed", response.status, detail.slice(0, 700));
    throw httpError(detail.includes("model") ? detail : "V3 voice engine is unavailable", 502);
  }
  return data;
}

async function handleSpeechEngineUpstream(request, env) {
  const upgrade = String(request.headers.get("Upgrade") || "").toLowerCase();
  if (request.method !== "GET" || upgrade !== "websocket") {
    return new Response("WebSocket Required", { status: 426 });
  }

  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) return new Response("Unauthorized", { status: 401 });
  const token = String(request.headers.get("X-ElevenLabs-Speech-Engine-Authorization") || "");
  if (!(await verifySpeechEngineJwt(token, apiKey))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  attachSpeechEngineSocket(server, env);

  return new Response(null, { status: 101, webSocket: client });
}

function attachSpeechEngineSocket(socket, env) {
  let activeController = null;
  let latestEventId = -1;
  let conversationId = "";
  let closed = false;

  const send = (value) => {
    if (closed || socket.readyState !== 1) return;
    try { socket.send(JSON.stringify(value)); } catch (error) {}
  };

  const abortActive = () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  };

  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
    const type = String(message?.type || "");

    if (type === "init") {
      conversationId = String(message?.conversation_id || "");
      return;
    }

    if (type === "ping") {
      send({ type: "pong" });
      return;
    }

    if (type === "close") {
      abortActive();
      closed = true;
      try { socket.close(1000, "done"); } catch (error) {}
      return;
    }

    if (type === "error") {
      abortActive();
      return;
    }

    if (type !== "user_transcript") return;
    const eventId = Number(message?.event_id);
    if (!Number.isFinite(eventId)) return;
    if (eventId < latestEventId) return;

    latestEventId = eventId;
    abortActive();
    const controller = new AbortController();
    activeController = controller;
    const history = normalizeSpeechHistory(message?.user_transcript);

    streamSpeechEngineReply(env, history, eventId, conversationId, controller.signal, send)
      .catch((error) => {
        if (controller.signal.aborted || closed || eventId !== latestEventId) return;
        console.error("Vexa V3 upstream reply failed", error?.stack || error);
        send({
          type: "agent_response",
          content: "Sorry, I couldn't answer right now.",
          event_id: eventId,
          is_final: false,
        });
        send({ type: "agent_response", content: "", event_id: eventId, is_final: true });
      })
      .finally(() => {
        if (activeController === controller) activeController = null;
      });
  });

  socket.addEventListener("close", () => {
    closed = true;
    abortActive();
  });
  socket.addEventListener("error", () => {
    closed = true;
    abortActive();
  });
}

async function streamSpeechEngineReply(env, history, eventId, conversationId, signal, send) {
  if (!env.GPT_API) throw httpError("AI is unavailable", 503);
  if (!history.length) throw httpError("I didn't catch that", 400);

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_AI_CHAT_MODEL,
        instructions: [
          "You are Vexa, a natural realtime voice assistant.",
          "Reply in the same language as the user's latest spoken turn.",
          "Keep spoken answers conversational and concise: usually one to three short sentences unless the user explicitly asks for detail.",
          "Return only words that should be spoken aloud. Do not use Markdown, headings, bullet markers, citations, footnotes, or raw URLs.",
          "You are speaking through Eleven v3 Conversational. Let the delivery be warm and context-aware. Use expressive audio tags such as [laughs], [sighs], or [whispers] only when they are genuinely natural and useful; otherwise use plain speech.",
          "Make numbers, dates, abbreviations, symbols, and punctuation easy to pronounce naturally.",
        ].join(" "),
        input: history,
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: 700,
        store: false,
        stream: true,
        safety_identifier: await voiceSafetyIdentifier(conversationId || String(eventId)),
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
    if (controller.signal.aborted) throw httpError("Voice reply took too long", 504);
    throw error;
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
    const detail = await upstream.text().catch(() => "");
    console.error("Vexa V3 OpenAI failed", upstream.status, detail.slice(0, 700));
    throw httpError("AI couldn't answer right now", upstream.status === 429 ? 429 : 502);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pending = "";
  let completed = false;

  const flush = (force) => {
    if (signal?.aborted) return;
    const ready = splitSpeechChunks(pending, force);
    pending = ready.rest;
    for (const chunk of ready.chunks) {
      send({ type: "agent_response", content: chunk, event_id: eventId, is_final: false });
    }
  };

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.startsWith("data:")) continue;
        const body = line.slice(5).trim();
        if (!body || body === "[DONE]") continue;
        let event;
        try { event = JSON.parse(body); } catch (error) { continue; }
        if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
          pending += event.delta;
          flush(false);
        } else if (event?.type === "response.completed") {
          completed = true;
        } else if (event?.type === "error" || event?.type === "response.failed") {
          throw new Error(String(event?.error?.message || event?.response?.error?.message || "AI couldn't answer right now"));
        }
      }
      if (done) break;
    }

    if (signal?.aborted) return;
    flush(true);
    send({ type: "agent_response", content: "", event_id: eventId, is_final: true });
    completed = true;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
    if (!completed && !signal?.aborted) {
      try { reader.cancel("incomplete"); } catch (error) {}
    }
  }
}

function splitSpeechChunks(value, force) {
  let rest = String(value || "");
  const chunks = [];
  while (rest.trim()) {
    const boundary = findSpeechBoundary(rest);
    if (boundary >= 14) {
      chunks.push(rest.slice(0, boundary + 1).trim());
      rest = rest.slice(boundary + 1);
      continue;
    }
    if (rest.length >= 44) {
      let split = Math.min(rest.length - 1, 64);
      while (split > 24 && !/\s/.test(rest.charAt(split))) split -= 1;
      if (split > 24) {
        chunks.push(rest.slice(0, split).trim());
        rest = rest.slice(split);
        continue;
      }
    }
    if (force) {
      chunks.push(rest.trim());
      rest = "";
    }
    break;
  }
  return { chunks: chunks.filter(Boolean), rest };
}

function findSpeechBoundary(text) {
  const match = /[,.!?؟؛;:\n](?:\s|$)/g;
  let item;
  while ((item = match.exec(String(text || "")))) {
    if (item.index >= 14) return item.index;
  }
  return -1;
}

function normalizeSpeechHistory(value) {
  const source = Array.isArray(value) ? value.slice(-MAX_HISTORY_ITEMS) : [];
  const result = [];
  let total = 0;
  for (const item of source) {
    const role = item?.role === "agent" || item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    if (!role) continue;
    const content = cleanText(item?.content, 2200);
    if (!content) continue;
    total += content.length;
    if (total > MAX_HISTORY_CHARS) break;
    result.push({ role, content });
  }
  return result;
}

function cleanText(value, max) {
  return Array.from(String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim())
    .slice(0, max)
    .join("");
}

async function verifySpeechEngineJwt(token, apiKey) {
  try {
    let value = String(token || "").trim();
    if (value.toLowerCase().startsWith("bearer ")) value = value.slice(7).trim();
    const parts = value.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[1])));
    if (header?.alg !== "HS256") return false;
    if (payload?.iss !== "https://api.elevenlabs.io/convai/speech-engine") return false;
    if (payload?.sub !== "convai_speech_engine_upstream") return false;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < now - 60) return false;

    const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const key = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
  } catch (error) {
    return false;
  }
}

function base64UrlBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function voiceSafetyIdentifier(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("vexa-voice-agent:" + String(value || "")),
  );
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  if (error?.name === "AbortError") return "Voice connection was interrupted";
  return String(error?.message || "Voice connection failed").slice(0, 300);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}