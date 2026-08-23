import worker from "./worker-live.js";
import { getElevenApiSetting } from "./admin.js";
import {
  creditsForUsdMicros,
  getBalance,
  spendCredits,
  VOICE_AGENT_MINIMUM_USD_MICROS,
  VOICE_AGENT_USD_MICROS_PER_MINUTE,
} from "./credits.js";

const MINI_APP_RUNTIME_PATH = "/mini-app/app.js";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";
const VOICE_ROOT = "/mini-app/live/api/voice-agent";
const VOICE_SESSION_PATH = VOICE_ROOT + "/session";
const VOICE_PROXY_PATH = VOICE_ROOT + "/connect";
const VOICE_MINIMUM_BALANCE = creditsForUsdMicros(VOICE_AGENT_MINIMUM_USD_MICROS);
const VOICE_SESSION_TTL_MS = 15 * 60 * 1000;
const VOICE_MAX_SESSION_MS = 10 * 60 * 1000;
const VAD_SPEECH_START = 0.55;
const VAD_SPEECH_RESET = 0.35;
const BILLING_VERSION = "20260823-2-usd-pricing";
const REQUIRED_CLIENT_EVENTS = [
  "audio",
  "interruption",
  "agent_response",
  "user_transcript",
  "vad_score",
  "agent_response_complete",
];

export { AiCodingWorkflow } from "./worker-live.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "POST" && path === VOICE_SESSION_PATH) {
        return handleVoiceSession(request, env, ctx);
      }

      if (request.method === "GET" && path === VOICE_PROXY_PATH) {
        return handleEventBilledVoiceProxy(request, env, ctx);
      }

      const response = await worker.fetch(request, env, ctx);
      if (request.method === "GET" && path === MINI_APP_RUNTIME_PATH) {
        return patchMiniAppBalanceRuntime(response);
      }
      if (request.method === "GET" && path === LIVE_INTEGRATION_PATH) {
        return patchLiveBalanceIntegration(response);
      }
      if (request.method === "GET" && path === VOICE_RUNTIME_PATH) {
        return patchVoiceBalanceRuntime(response);
      }
      return response;
    } catch (error) {
      console.error("Vexa Live event billing failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

async function patchMiniAppBalanceRuntime(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  if (source.includes("vexa:credits-balance")) return cloneTextResponse(response, source);

  const marker = "  startAiChatButtonOrb();";
  if (!source.includes(marker)) {
    console.error("Vexa Live balance patch target missing", "mini-app runtime");
    return cloneTextResponse(response, source);
  }

  const listener = `  window.addEventListener('vexa:credits-balance',function(event){var detail=event&&event.detail||{};var value=Number(detail.balance);if(!Number.isFinite(value))return;updateCreditsBalanceUi(Math.max(0,value))});\n`;
  source = source.replace(marker, listener + marker);
  return cloneTextResponse(response, source);
}

async function patchLiveBalanceIntegration(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  if (source.includes("syncVexaLiveBalance(tokenData")) return cloneTextResponse(response, source);

  const helperMarker = "  async function sttApi(path, body) {";
  if (source.includes(helperMarker)) {
    source = source.replace(
      helperMarker,
      `  function syncVexaLiveBalance(value) {\n    const balance = Number(value);\n    if (!Number.isFinite(balance)) return;\n    try {\n      window.dispatchEvent(new CustomEvent("vexa:credits-balance", { detail: { balance: Math.max(0, balance), source: "vexa_live_stt" } }));\n    } catch (error) {}\n  }\n\n${helperMarker}`
    );
  } else {
    console.error("Vexa Live balance patch target missing", "STT helper");
  }

  const billedTokenRequest = `      const tokenData = await sttApi("/mini-app/live/api/scribe-token", { mode: "transcribe", durationMs: durationMs });`;
  if (source.includes(billedTokenRequest)) {
    source = source.replace(
      billedTokenRequest,
      billedTokenRequest + `\n      syncVexaLiveBalance(tokenData && tokenData.balance);`
    );
  } else {
    console.error("Vexa Live balance patch target missing", "STT billed token");
  }

  return cloneTextResponse(response, source);
}

async function patchVoiceBalanceRuntime(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  if (source.includes("source: \"vexa_voice_agent\"")) return cloneTextResponse(response, source);

  const marker = `    if (type === "ping") {`;
  if (!source.includes(marker)) {
    console.error("Vexa Live balance patch target missing", "voice runtime");
    return cloneTextResponse(response, source);
  }

  const handler = `    if (type === "vexa_billing") {\n      const nextBalance = Number(message?.vexa_billing_event?.balance);\n      if (Number.isFinite(nextBalance)) {\n        try {\n          const target = window.parent && window.parent !== window ? window.parent : window;\n          target.dispatchEvent(new target.CustomEvent("vexa:credits-balance", { detail: { balance: Math.max(0, nextBalance), source: "vexa_voice_agent" } }));\n        } catch (error) {}\n      }\n      return;\n    }\n\n`;
  source = source.replace(marker, handler + marker);
  return cloneTextResponse(response, source);
}

function cloneTextResponse(response, source) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("X-Vexa-Live-Billing", BILLING_VERSION);
  return new Response(source, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleVoiceSession(request, env, ctx) {
  const response = await worker.fetch(request, env, ctx);
  if (!response?.ok) return response;

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || data.locked) {
    return json(data || { error: "V3 voice session is unavailable" }, response.status || 200);
  }

  const speechEngineId = String(data.speechEngineId || "").trim();
  const billingSessionId = normalizeSessionId(data.billingSessionId);
  if (!speechEngineId || !billingSessionId) {
    await failPendingSession(env, billingSessionId).catch(() => null);
    return json({ error: "V3 voice billing session is unavailable" }, 502);
  }

  try {
    const apiKey = await selectedElevenApiKey(env);
    if (!apiKey) throw httpError("ElevenLabs API is unavailable", 503);

    await ensureBillingClientEvents(apiKey, speechEngineId);
    const signedUrl = await getSpeechEngineSignedUrl(apiKey, speechEngineId);
    const updated = await env.DB.prepare(
      "UPDATE vexa_voice_proxy_sessions SET signed_url = ?, updated_at_ms = ? WHERE id = ? AND status = 'pending'"
    ).bind(signedUrl, Date.now(), billingSessionId).run();

    if (changedRows(updated) <= 0) {
      throw httpError("V3 voice billing session is unavailable", 409);
    }
  } catch (error) {
    await failPendingSession(env, billingSessionId).catch(() => null);
    throw error;
  }

  return json(data);
}

async function ensureBillingClientEvents(apiKey, speechEngineId) {
  const endpoint =
    "https://api.elevenlabs.io/v1/speech-engine/" + encodeURIComponent(speechEngineId);
  const current = await elevenJson(endpoint, apiKey, { method: "GET" });
  const conversation = current?.conversation && typeof current.conversation === "object"
    ? { ...current.conversation }
    : {};
  const existing = Array.isArray(conversation.client_events)
    ? conversation.client_events.map((value) => String(value || "")).filter(Boolean)
    : [];
  const next = Array.from(new Set([...existing, ...REQUIRED_CLIENT_EVENTS]));
  const hasAll = REQUIRED_CLIENT_EVENTS.every((event) => existing.includes(event));
  if (hasAll) return;

  conversation.client_events = next;
  await elevenJson(endpoint, apiKey, {
    method: "PATCH",
    body: JSON.stringify({ conversation }),
  });
}

async function getSpeechEngineSignedUrl(apiKey, speechEngineId) {
  const endpoint =
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=" +
    encodeURIComponent(speechEngineId);
  const data = await elevenJson(endpoint, apiKey, { method: "GET" });
  const signedUrl = String(data?.signed_url || "");
  if (!signedUrl.startsWith("wss://")) {
    throw httpError("V3 voice session is unavailable", 502);
  }
  return signedUrl;
}

async function selectedElevenApiKey(env) {
  const selectedKeyName = await getElevenApiSetting(env);
  return String(env[selectedKeyName] || "").trim();
}

async function elevenJson(url, apiKey, options) {
  const headers = new Headers(options?.headers || {});
  headers.set("xi-api-key", apiKey);
  headers.set("accept", "application/json");
  if (options?.body) headers.set("content-type", "application/json");

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data?.detail?.message || data?.detail || data?.message || "unknown error");
    console.error("Vexa Voice billing event configuration failed", response.status, detail.slice(0, 500));
    throw httpError("V3 voice billing events are unavailable", 502);
  }
  return data;
}

async function handleEventBilledVoiceProxy(request, env, ctx) {
  const upgrade = String(request.headers.get("Upgrade") || "").toLowerCase();
  if (upgrade !== "websocket") {
    return new Response("WebSocket Required", { status: 426 });
  }

  const url = new URL(request.url);
  const sessionId = normalizeSessionId(url.searchParams.get("sid"));
  const token = normalizeSessionId(url.searchParams.get("token"));
  if (!sessionId || !token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT user_id, connect_token, signed_url, status, created_at_ms FROM vexa_voice_proxy_sessions WHERE id = ?"
  ).bind(sessionId).first();

  if (!row || String(row.connect_token || "") !== token) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (String(row.status || "") !== "pending") {
    return new Response("Voice session unavailable", { status: 409 });
  }
  if (now - Number(row.created_at_ms || 0) > VOICE_SESSION_TTL_MS) {
    await markProxySession(env, sessionId, "expired", 0, true).catch(() => null);
    return new Response("Voice session expired", { status: 410 });
  }

  const userId = String(row.user_id || "");
  const balance = await getBalance(env, userId);
  if (balance < VOICE_MINIMUM_BALANCE) {
    await markProxySession(env, sessionId, "insufficient", 0, true).catch(() => null);
    return new Response("Not enough USD balance", { status: 402 });
  }

  const claimed = await env.DB.prepare(
    "UPDATE vexa_voice_proxy_sessions SET status = 'connecting', connect_token = '', updated_at_ms = ? " +
    "WHERE id = ? AND status = 'pending' AND connect_token = ?"
  ).bind(now, sessionId, token).run();
  if (changedRows(claimed) <= 0) {
    return new Response("Voice session unavailable", { status: 409 });
  }

  let upstreamResponse;
  try {
    const signedUrl = String(row.signed_url || "");
    const upstreamFetchUrl = signedUrl
      .replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:");
    if (!/^https?:\/\//i.test(upstreamFetchUrl)) {
      throw new Error("Invalid upstream WebSocket URL");
    }
    upstreamResponse = await fetch(upstreamFetchUrl, {
      headers: { Upgrade: "websocket" },
    });
  } catch (error) {
    await markProxySession(env, sessionId, "failed", 0, true).catch(() => null);
    console.error("Vexa Voice upstream WebSocket failed", error?.message || error);
    return new Response("Voice connection failed", { status: 502 });
  }

  const upstream = upstreamResponse?.webSocket;
  if (!upstream || upstreamResponse.status !== 101) {
    await markProxySession(env, sessionId, "failed", 0, true).catch(() => null);
    return new Response("Voice connection failed", { status: 502 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  const startedAt = Date.now();

  try {
    upstream.accept({ allowHalfOpen: true });
    server.accept({ allowHalfOpen: true });
  } catch (error) {
    try { upstream.close(1011, "Proxy setup failed"); } catch (ignore) {}
    await markProxySession(env, sessionId, "failed", 0, true).catch(() => null);
    return new Response("Voice connection failed", { status: 502 });
  }

  await env.DB.prepare(
    "UPDATE vexa_voice_proxy_sessions SET status = 'active', started_at_ms = ?, charged_credits = 0, updated_at_ms = ? WHERE id = ?"
  ).bind(startedAt, startedAt, sessionId).run();

  attachEventBilledVoiceProxy({
    server,
    upstream,
    env,
    ctx,
    sessionId,
    userId,
    startedAt,
    startingBalance: balance,
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: { "X-Vexa-Live-Billing": BILLING_VERSION },
  });
}

function attachEventBilledVoiceProxy({ server, upstream, env, ctx, sessionId, userId, startedAt, startingBalance }) {
  let closed = false;
  let chargedCredits = 0;
  let billedDurationMs = 0;
  let balance = Math.max(0, Number(startingBalance || 0));
  let activeTurnStartedAt = 0;
  let pendingTurn = null;
  let vadSpeaking = false;
  let lastCompleteEventId = "";
  let billingQueue = Promise.resolve(true);
  let sessionLimitTimer = 0;

  const closeSocket = (socket, code, reason) => {
    if (!socket) return;
    try {
      if (socket.readyState !== 3) socket.close(code, reason);
    } catch (error) {}
  };

  const closeBoth = (code, reason) => {
    closeSocket(server, code, reason);
    closeSocket(upstream, code, reason);
  };

  const persistActive = async () => {
    await env.DB.prepare(
      "UPDATE vexa_voice_proxy_sessions SET charged_credits = ?, status = 'active', updated_at_ms = ? WHERE id = ?"
    ).bind(chargedCredits, Date.now(), sessionId).run().catch(() => null);
  };

  const sendBillingEvent = (turn, credits) => {
    if (server.readyState !== 1) return;
    try {
      server.send(JSON.stringify({
        type: "vexa_billing",
        vexa_billing_event: {
          credits_spent: credits,
          charged_credits: chargedCredits,
          balance,
          turn_duration_ms: turn.durationMs,
        },
      }));
    } catch (error) {}
  };

  const chargeTurn = async (turn, trigger) => {
    if (!turn || turn.charged) return true;
    turn.charged = true;
    const durationMs = Math.max(1, Math.min(VOICE_MAX_SESSION_MS, Number(turn.durationMs || 0)));
    const nextBilledDurationMs = Math.min(VOICE_MAX_SESSION_MS, billedDurationMs + durationMs);
    const targetCredits = creditsForDuration(nextBilledDurationMs, VOICE_AGENT_USD_MICROS_PER_MINUTE);
    const credits = Math.max(0, targetCredits - chargedCredits);
    billedDurationMs = nextBilledDurationMs;
    if (credits <= 0) return true;

    const spent = await spendCredits(env, userId, credits, "vexa_voice_agent", {
      billingSessionId: sessionId,
      billingMode: "completed_turn",
      trigger,
      turnDurationMs: durationMs,
      billedDurationMs,
      turnStartedAtMs: Number(turn.startedAt || 0),
      agentCompletedAtMs: Number(turn.completedAt || 0),
      agentResponseEventId: String(turn.eventId || ""),
      usdMicrosPerMinute: VOICE_AGENT_USD_MICROS_PER_MINUTE,
    });

    if (!spent.ok) {
      const available = Math.max(0, Number(spent.balance || 0));
      if (available > 0) {
        const remainder = await spendCredits(env, userId, available, "vexa_voice_agent", {
          billingSessionId: sessionId,
          billingMode: "completed_turn",
          trigger,
          turnDurationMs: durationMs,
          billedDurationMs,
          partial: true,
          usdMicrosPerMinute: VOICE_AGENT_USD_MICROS_PER_MINUTE,
        });
        if (remainder.ok) {
          chargedCredits += Number(remainder.spent || available);
          balance = Math.max(0, Number(remainder.balance || 0));
        } else {
          balance = Math.max(0, Number(remainder.balance || 0));
        }
      } else {
        balance = 0;
      }

      await markProxySession(env, sessionId, "insufficient", chargedCredits, true).catch(() => null);
      if (!closed) {
        closed = true;
        if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
        sessionLimitTimer = 0;
        closeBoth(4002, "Not enough USD balance");
      }
      return false;
    }

    chargedCredits += credits;
    balance = Math.max(0, Number(spent.balance || 0));
    await persistActive();
    sendBillingEvent(turn, credits);
    if (balance <= 0 && !closed) {
      closed = true;
      if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
      sessionLimitTimer = 0;
      await markProxySession(env, sessionId, "insufficient", chargedCredits, true).catch(() => null);
      closeBoth(4002, "Not enough USD balance");
      return false;
    }
    return true;
  };

  const queueTurnCharge = (turn, trigger) => {
    billingQueue = billingQueue
      .catch(() => false)
      .then((previousOk) => previousOk === false ? false : chargeTurn(turn, trigger))
      .catch(async (error) => {
        console.error("Vexa Voice turn billing failed", error?.stack || error);
        if (!closed) {
          closed = true;
          if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
          sessionLimitTimer = 0;
          await markProxySession(env, sessionId, "failed", chargedCredits, true).catch(() => null);
          closeBoth(1011, "Billing unavailable");
        }
        return false;
      });
    try { ctx?.waitUntil?.(billingQueue); } catch (error) {}
    return billingQueue;
  };

  const onUserSpeechStart = (now) => {
    if (closed) return;
    if (pendingTurn) {
      const completed = pendingTurn;
      pendingTurn = null;
      queueTurnCharge(completed, "next_user_speech");
    }
    activeTurnStartedAt = now;
  };

  const onAgentResponseComplete = (message, now) => {
    if (closed || !activeTurnStartedAt) return;
    const eventId = String(message?.agent_response_complete_event?.event_id ?? "");
    if (eventId && eventId === lastCompleteEventId) return;
    if (eventId) lastCompleteEventId = eventId;
    vadSpeaking = false;
    pendingTurn = {
      startedAt: activeTurnStartedAt,
      completedAt: now,
      durationMs: Math.max(1, now - activeTurnStartedAt),
      eventId,
      charged: false,
    };
    activeTurnStartedAt = 0;
  };

  const inspectUpstreamMessage = (data) => {
    const message = parseVoiceEvent(data);
    if (!message) return;
    const type = String(message.type || "");
    const now = Date.now();

    if (type === "vad_score") {
      const score = Number(message?.vad_score_event?.vad_score);
      if (!Number.isFinite(score)) return;
      if (score <= VAD_SPEECH_RESET) {
        vadSpeaking = false;
        return;
      }
      if (score >= VAD_SPEECH_START && !vadSpeaking) {
        vadSpeaking = true;
        onUserSpeechStart(now);
      }
      return;
    }

    if (type === "user_transcript" && !activeTurnStartedAt) {
      onUserSpeechStart(now);
      return;
    }

    if (type === "agent_response_complete") {
      onAgentResponseComplete(message, now);
      return;
    }

    if (type === "interruption") {
      pendingTurn = null;
    }
  };

  const finalize = (status, code, reason) => {
    if (closed) return;
    closed = true;
    if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
    sessionLimitTimer = 0;
    closeBoth(code, reason);

    const finalTurn = pendingTurn;
    pendingTurn = null;
    const work = billingQueue
      .catch(() => false)
      .then(async (ok) => {
        if (ok !== false && finalTurn) await chargeTurn(finalTurn, "session_close");
        const finalStatus = balance <= 0 ? "insufficient" : status;
        await markProxySession(env, sessionId, finalStatus, chargedCredits, true).catch(() => null);
      })
      .catch(async (error) => {
        console.error("Vexa Voice final turn billing failed", error?.stack || error);
        await markProxySession(env, sessionId, "failed", chargedCredits, true).catch(() => null);
      });
    try { ctx?.waitUntil?.(work); } catch (error) {}
  };

  server.addEventListener("message", (event) => {
    if (closed || upstream.readyState !== 1) return;
    try { upstream.send(event.data); } catch (error) { finalize("failed", 1011, "Voice relay failed"); }
  });

  upstream.addEventListener("message", (event) => {
    if (closed || server.readyState !== 1) return;
    inspectUpstreamMessage(event.data);
    try { server.send(event.data); } catch (error) { finalize("failed", 1011, "Voice relay failed"); }
  });

  server.addEventListener("close", (event) => {
    finalize("ended", normalizeCloseCode(event?.code), "Client closed");
  });
  upstream.addEventListener("close", (event) => {
    finalize("ended", normalizeCloseCode(event?.code), "Voice closed");
  });
  server.addEventListener("error", () => {
    finalize("failed", 1011, "Client connection failed");
  });
  upstream.addEventListener("error", () => {
    finalize("failed", 1011, "Voice connection failed");
  });

  sessionLimitTimer = setTimeout(() => {
    finalize("ended", 4000, "Voice session limit reached");
  }, Math.max(1000, VOICE_MAX_SESSION_MS - Math.max(0, Date.now() - startedAt)));
}

function parseVoiceEvent(data) {
  let text = "";
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    try { text = new TextDecoder().decode(data); } catch (error) { return null; }
  } else if (ArrayBuffer.isView(data)) {
    try { text = new TextDecoder().decode(data); } catch (error) { return null; }
  } else {
    return null;
  }
  if (!text || text.charCodeAt(0) !== 123) return null;
  try { return JSON.parse(text); } catch (error) { return null; }
}

async function failPendingSession(env, sessionId) {
  if (!sessionId) return;
  await env.DB.prepare(
    "UPDATE vexa_voice_proxy_sessions SET status = 'failed', signed_url = '', connect_token = '', updated_at_ms = ? WHERE id = ? AND status = 'pending'"
  ).bind(Date.now(), sessionId).run();
}

async function markProxySession(env, sessionId, status, chargedCredits, clearSignedUrl) {
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE vexa_voice_proxy_sessions SET status = ?, charged_credits = ?, signed_url = CASE WHEN ? THEN '' ELSE signed_url END, connect_token = '', updated_at_ms = ? WHERE id = ?"
  ).bind(String(status), Math.max(0, Number(chargedCredits || 0)), clearSignedUrl ? 1 : 0, now, sessionId).run();
}

function creditsForDuration(durationMs, usdMicrosPerMinute) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const rate = Math.max(0, Number(usdMicrosPerMinute) || 0);
  return duration > 0 && rate > 0 ? creditsForUsdMicros((duration * rate) / 60000) : 0;
}

function normalizeSessionId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f-]{20,80}$/i.test(id) ? id : "";
}

function normalizeCloseCode(value) {
  const code = Number(value || 1000);
  return Number.isInteger(code) && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006
    ? code
    : 1000;
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
      "X-Vexa-Live-Billing": BILLING_VERSION,
    },
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  return String(error?.message || "Vexa Live billing error").slice(0, 300);
}
