import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { DEFAULT_AI_CHAT_MODEL } from "../../ai-chat-model.js";
import { VOICES } from "../../voices.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const ROOT = "/mini-app/live/api/voice-agent";
const SCRIBE_MODEL = "scribe_v2_realtime";
const TTS_MODEL = "eleven_flash_v2_5";
const VOICE_NAME = "Laura";
const VOICE_ID = VOICES[VOICE_NAME];
const MAX_TURN_CHARS = 2500;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_CHARS = 10000;
const OPENAI_TIMEOUT_MS = 45_000;

export function isVexaVoiceAgentRequest(request) {
  const path = new URL(request.url).pathname;
  return path === ROOT || path.startsWith(ROOT + "/");
}

export async function handleVexaVoiceAgentRequest(request, env) {
  try {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const path = new URL(request.url).pathname;

    if (path === ROOT + "/session") {
      const { user } = await authenticateRequest(request, env);
      const token = await createElevenSingleUseToken(env, "realtime_scribe");
      return json({
        ok: true,
        userId: String(user.id),
        scribeToken: token,
        scribeModel: SCRIBE_MODEL,
        scribeAudioFormat: "pcm_16000",
        voiceName: VOICE_NAME,
        voiceId: VOICE_ID,
        ttsModel: TTS_MODEL,
      });
    }

    if (path === ROOT + "/tts-token") {
      await authenticateRequest(request, env);
      const token = await createElevenSingleUseToken(env, "tts_websocket");
      return json({
        ok: true,
        token,
        voiceName: VOICE_NAME,
        voiceId: VOICE_ID,
        modelId: TTS_MODEL,
        outputFormat: "pcm_24000",
      });
    }

    if (path === ROOT + "/chat") {
      return streamChat(request, env);
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

async function createElevenSingleUseToken(env, type) {
  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw httpError("ElevenLabs API is unavailable", 503);

  const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/" + type, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "accept": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    console.error(
      "Vexa voice agent ElevenLabs token failed",
      type,
      response.status,
      String(data?.detail?.message || data?.detail || data?.message || "unknown error"),
    );
    throw httpError("Voice connection is unavailable", 502);
  }
  return String(data.token);
}

async function streamChat(request, env) {
  const { user, payload } = await authenticateRequest(request, env);
  if (!env.GPT_API) throw httpError("AI is unavailable", 503);

  const text = cleanText(payload.text, MAX_TURN_CHARS);
  if (!text) throw httpError("I didn't catch that", 400);
  const history = normalizeHistory(payload.history);
  const input = history.concat([{ role: "user", content: text }]);
  const safetyIdentifier = await voiceSafetyIdentifier(user.id);
  const controller = new AbortController();
  const requestSignal = request.signal;
  const abort = () => controller.abort();
  if (requestSignal?.aborted) controller.abort();
  else requestSignal?.addEventListener?.("abort", abort, { once: true });
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
          "Return only words that should be spoken aloud. Do not use Markdown, headings, bullet markers, citations, footnotes, raw URLs, or stage directions.",
          "Make numbers, dates, abbreviations, symbols, and punctuation easy to pronounce naturally.",
          "Do not mention transcription, speech recognition, or internal processing unless the user asks about it.",
        ].join(" "),
        input,
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: 700,
        store: false,
        stream: true,
        safety_identifier: safetyIdentifier,
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    requestSignal?.removeEventListener?.("abort", abort);
    if (controller.signal.aborted) throw httpError("Voice reply took too long", 504);
    throw error;
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    requestSignal?.removeEventListener?.("abort", abort);
    const detail = await upstream.text().catch(() => "");
    console.error("Vexa voice agent OpenAI failed", upstream.status, detail.slice(0, 700));
    throw httpError("AI couldn't answer right now", upstream.status === 429 ? 429 : 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";
  let closed = false;
  let doneSent = false;

  const stream = new ReadableStream({
    async start(streamController) {
      const send = (value) => {
        if (closed) return;
        streamController.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      const finish = () => {
        if (closed) return;
        if (!doneSent) {
          doneSent = true;
          send({ type: "done" });
        }
        closed = true;
        clearTimeout(timer);
        requestSignal?.removeEventListener?.("abort", abort);
        try { streamController.close(); } catch (error) {}
      };
      const handleEvent = (raw) => {
        const line = String(raw || "").trim();
        if (!line.startsWith("data:")) return;
        const body = line.slice(5).trim();
        if (!body || body === "[DONE]") {
          if (body === "[DONE]") finish();
          return;
        }
        let event;
        try { event = JSON.parse(body); } catch (error) { return; }
        if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
          send({ type: "delta", delta: event.delta });
          return;
        }
        if (event?.type === "response.completed" || event?.type === "response.output_text.done") {
          if (event?.type === "response.completed") finish();
          return;
        }
        if (event?.type === "error" || event?.type === "response.failed") {
          const message = String(event?.error?.message || event?.response?.error?.message || "AI couldn't answer right now");
          send({ type: "error", error: message.slice(0, 240) });
          finish();
        }
      };

      try {
        while (!closed) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          let newline = buffer.indexOf("\n");
          while (newline >= 0 && !closed) {
            handleEvent(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
          if (done) break;
        }
        if (!closed && buffer.trim()) handleEvent(buffer);
        finish();
      } catch (error) {
        if (!closed) {
          send({ type: "error", error: "Voice connection was interrupted" });
          finish();
        }
      }
    },
    cancel(reason) {
      closed = true;
      clearTimeout(timer);
      requestSignal?.removeEventListener?.("abort", abort);
      controller.abort();
      return reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson;charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeHistory(value) {
  const source = Array.isArray(value) ? value.slice(-MAX_HISTORY_ITEMS) : [];
  const result = [];
  let total = 0;
  for (const item of source) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    if (!role) continue;
    const content = cleanText(item?.content, 1800);
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

async function voiceSafetyIdentifier(userId) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("vexa-voice-agent:" + String(userId || "")),
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
