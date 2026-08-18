import worker from "./worker-voice.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { getBalance, spendCredits } from "./credits.js";

const STT_TOKEN_PATH = "/mini-app/live/api/scribe-token";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const VOICE_ROOT = "/mini-app/live/api/voice-agent";
const VOICE_SESSION_PATH = VOICE_ROOT + "/session";
const VOICE_PROXY_PATH = VOICE_ROOT + "/connect";
const STT_CREDITS_PER_MINUTE = 30;
const VOICE_CREDITS_PER_MINUTE = 800;
const VOICE_SESSION_TTL_MS = 15 * 60 * 1000;
const VOICE_MAX_SESSION_MS = 10 * 60 * 1000;
const VOICE_MAX_SETTLE_INTERVAL_MS = 5000;
const BILLING_VERSION = "20260818-4";

let proxyTableReady = null;

export { AiCodingWorkflow } from "./worker-voice.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "GET" && path === VOICE_PROXY_PATH) {
        return handleVoiceProxy(request, env, ctx);
      }

      if (request.method === "POST" && path === STT_TOKEN_PATH) {
        return handleScribeTokenBilling(request, env, ctx);
      }

      if (request.method === "POST" && path === VOICE_SESSION_PATH) {
        return handleVoiceSessionBilling(request, env, ctx);
      }

      const response = await worker.fetch(request, env, ctx);
      if (request.method === "GET" && path === LIVE_INTEGRATION_PATH) {
        return patchLiveIntegration(response);
      }
      return response;
    } catch (error) {
      console.error("Vexa Live billing failed", error?.stack || error);
      return json({ error: publicError(error) }, error?.status || 500);
    }
  },
};

async function handleScribeTokenBilling(request, env, ctx) {
  const payload = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const durationMs = normalizeDurationMs(payload.durationMs);
  const credits = creditsForDuration(durationMs, STT_CREDITS_PER_MINUTE);

  const balance = await getBalance(env, user.id);
  if (balance < credits) {
    return json({
      error: "Not enough credits",
      balance,
      needed: credits,
      creditsPerMinute: STT_CREDITS_PER_MINUTE,
    }, 402);
  }

  const upstream = await worker.fetch(request, env, ctx);
  if (!upstream.ok) return upstream;

  const data = await upstream.json().catch(() => null);
  if (!data || typeof data !== "object" || !data.token) {
    return json({ error: "Could not start transcription" }, 502);
  }

  const spent = await spendCredits(env, user.id, credits, "vexa_live_stt", {
    durationMs,
    creditsPerMinute: STT_CREDITS_PER_MINUTE,
    model: String(data.modelId || "scribe_v2"),
  });

  if (!spent.ok) {
    return json({
      error: "Not enough credits",
      balance: spent.balance,
      needed: credits,
      creditsPerMinute: STT_CREDITS_PER_MINUTE,
    }, 402);
  }

  return json({
    ...data,
    creditsSpent: credits,
    creditsPerMinute: STT_CREDITS_PER_MINUTE,
    durationMs,
    balance: spent.balance,
  });
}

async function handleVoiceSessionBilling(request, env, ctx) {
  const payload = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const balance = await getBalance(env, user.id);

  if (balance <= 0) {
    return json({
      error: "Not enough credits",
      balance,
      needed: 1,
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    }, 402);
  }

  const upstream = await worker.fetch(request, env, ctx);
  if (!upstream.ok) return upstream;

  const data = await upstream.json().catch(() => null);
  const upstreamSignedUrl = String(data?.signedUrl || "");
  if (!data || typeof data !== "object" || !upstreamSignedUrl.startsWith("wss://")) {
    return json({ error: "V3 voice session is unavailable" }, 502);
  }

  const proxy = await createVoiceProxySession(env, user.id, upstreamSignedUrl);
  const requestUrl = new URL(request.url);
  const proxyProtocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
  const proxyUrl =
    proxyProtocol +
    "//" +
    requestUrl.host +
    VOICE_PROXY_PATH +
    "?sid=" +
    encodeURIComponent(proxy.id) +
    "&token=" +
    encodeURIComponent(proxy.token);

  const { signedUrl: _privateSignedUrl, ...publicData } = data;
  return json({
    ...publicData,
    signedUrl: proxyUrl,
    billingSessionId: proxy.id,
    creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    balance,
  });
}

async function handleVoiceProxy(request, env, ctx) {
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

  await ensureVoiceProxyTable(env);
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
  if (balance <= 0) {
    await markProxySession(env, sessionId, "insufficient", 0, true).catch(() => null);
    return new Response("Not enough credits", { status: 402 });
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

  attachVoiceProxy({
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
    headers: {
      "X-Vexa-Live-Billing": BILLING_VERSION,
    },
  });
}

function attachVoiceProxy({ server, upstream, env, ctx, sessionId, userId, startedAt, startingBalance }) {
  let closed = false;
  let timer = 0;
  let chargedCredits = 0;
  let balance = Math.max(0, Number(startingBalance || 0));
  let settlement = Promise.resolve(true);

  const clearBillingTimer = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
  };

  const closeSocket = (socket, code, reason) => {
    if (!socket) return;
    try {
      if (socket.readyState !== 3) socket.close(code, reason);
    } catch (error) {}
  };

  const closeBoth = (code, reason) => {
    if (closed) return;
    closed = true;
    clearBillingTimer();
    closeSocket(server, code, reason);
    closeSocket(upstream, code, reason);
  };

  const settleOnce = async (finalize, status = "active") => {
    const now = Date.now();
    const elapsedMs = Math.max(1, Math.min(VOICE_MAX_SESSION_MS, now - startedAt));
    const targetCredits = creditsForDuration(elapsedMs, VOICE_CREDITS_PER_MINUTE);
    const delta = Math.max(0, targetCredits - chargedCredits);

    if (delta > 0) {
      const spent = await spendCredits(env, userId, delta, "vexa_voice_agent", {
        billingSessionId: sessionId,
        elapsedMs,
        targetCredits,
        creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
      });

      if (!spent.ok) {
        const available = Math.max(0, Number(spent.balance || 0));
        if (available > 0) {
          const remainder = await spendCredits(env, userId, available, "vexa_voice_agent", {
            billingSessionId: sessionId,
            elapsedMs,
            partial: true,
            creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
          });
          if (remainder.ok) {
            chargedCredits += Number(remainder.spent || available);
            balance = Number(remainder.balance || 0);
          } else {
            balance = Number(remainder.balance || 0);
          }
        } else {
          balance = 0;
        }

        await env.DB.prepare(
          "UPDATE vexa_voice_proxy_sessions SET charged_credits = ?, status = 'insufficient', signed_url = '', updated_at_ms = ? WHERE id = ?"
        ).bind(chargedCredits, now, sessionId).run().catch(() => null);

        closeBoth(4002, "Not enough credits");
        return false;
      }

      chargedCredits = targetCredits;
      balance = Math.max(0, Number(spent.balance || 0));
    }

    const nextStatus = finalize ? status : "active";
    await env.DB.prepare(
      "UPDATE vexa_voice_proxy_sessions SET charged_credits = ?, status = ?, signed_url = CASE WHEN ? THEN '' ELSE signed_url END, updated_at_ms = ? WHERE id = ?"
    ).bind(chargedCredits, nextStatus, finalize ? 1 : 0, now, sessionId).run().catch(() => null);

    if (!finalize && balance <= 0) {
      await markProxySession(env, sessionId, "insufficient", chargedCredits, true).catch(() => null);
      closeBoth(4002, "Not enough credits");
      return false;
    }
    if (!finalize && elapsedMs >= VOICE_MAX_SESSION_MS) {
      await markProxySession(env, sessionId, "ended", chargedCredits, true).catch(() => null);
      closeBoth(4000, "Voice session limit reached");
      return false;
    }
    return true;
  };

  const queueSettlement = (finalize, status) => {
    settlement = settlement
      .catch(() => false)
      .then(() => settleOnce(finalize, status))
      .catch(async (error) => {
        console.error("Vexa Voice billing settlement failed", error?.stack || error);
        if (!finalize) {
          await markProxySession(env, sessionId, "failed", chargedCredits, true).catch(() => null);
          closeBoth(1011, "Billing unavailable");
        }
        return false;
      });
    return settlement;
  };

  const scheduleNextSettlement = () => {
    if (closed) return;
    clearBillingTimer();

    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const maximumAffordableElapsedMs = Math.floor(
      ((chargedCredits + Math.max(0, balance)) * 60000) / VOICE_CREDITS_PER_MINUTE
    );
    const affordableDelayMs = maximumAffordableElapsedMs - elapsedMs;

    if (affordableDelayMs <= 0) {
      timer = setTimeout(async () => {
        timer = 0;
        const ok = await queueSettlement(false, "active");
        if (ok && !closed) scheduleNextSettlement();
      }, 0);
      return;
    }

    const delay = Math.max(25, Math.min(VOICE_MAX_SETTLE_INTERVAL_MS, affordableDelayMs));
    timer = setTimeout(async () => {
      timer = 0;
      const ok = await queueSettlement(false, "active");
      if (ok && !closed) scheduleNextSettlement();
    }, delay);
  };

  const finalize = (status, code, reason) => {
    if (closed) return;
    closed = true;
    clearBillingTimer();
    closeSocket(server, code, reason);
    closeSocket(upstream, code, reason);
    const work = queueSettlement(true, status);
    try { ctx?.waitUntil?.(work); } catch (error) {}
  };

  server.addEventListener("message", (event) => {
    if (closed || upstream.readyState !== 1) return;
    try { upstream.send(event.data); } catch (error) { finalize("failed", 1011, "Voice relay failed"); }
  });

  upstream.addEventListener("message", (event) => {
    if (closed || server.readyState !== 1) return;
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

  scheduleNextSettlement();
}

async function ensureVoiceProxyTable(env) {
  if (!proxyTableReady) {
    proxyTableReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_voice_proxy_sessions (" +
        "id TEXT PRIMARY KEY, user_id TEXT NOT NULL, connect_token TEXT NOT NULL, signed_url TEXT NOT NULL, " +
        "status TEXT NOT NULL DEFAULT 'pending', created_at_ms INTEGER NOT NULL, started_at_ms INTEGER, " +
        "charged_credits INTEGER NOT NULL DEFAULT 0, updated_at_ms INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_vexa_voice_proxy_user_created ON vexa_voice_proxy_sessions (user_id, created_at_ms DESC)"
      ).run();
      await env.DB.prepare(
        "DELETE FROM vexa_voice_proxy_sessions WHERE created_at_ms < ?"
      ).bind(Date.now() - 24 * 60 * 60 * 1000).run().catch(() => null);
    })().catch((error) => {
      proxyTableReady = null;
      throw error;
    });
  }
  return proxyTableReady;
}

async function createVoiceProxySession(env, userId, signedUrl) {
  await ensureVoiceProxyTable(env);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(
    "INSERT INTO vexa_voice_proxy_sessions " +
    "(id, user_id, connect_token, signed_url, status, created_at_ms, started_at_ms, charged_credits, updated_at_ms) " +
    "VALUES (?, ?, ?, ?, 'pending', ?, NULL, 0, ?)"
  ).bind(id, String(userId), token, String(signedUrl), now, now).run();

  return { id, token };
}

async function markProxySession(env, sessionId, status, chargedCredits, clearSignedUrl) {
  await ensureVoiceProxyTable(env);
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE vexa_voice_proxy_sessions SET status = ?, charged_credits = ?, signed_url = CASE WHEN ? THEN '' ELSE signed_url END, connect_token = '', updated_at_ms = ? WHERE id = ?"
  ).bind(String(status), Math.max(0, Number(chargedCredits || 0)), clearSignedUrl ? 1 : 0, now, sessionId).run();
}

async function patchLiveIntegration(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();

  source = replaceOrKeep(
    source,
    "Transcript</span><span id=\"vexaSttLanguage\"",
    "Transcript <small style=\"margin-left:5px;color:rgba(255,255,255,.28);font-size:8.5px;font-weight:620;letter-spacing:-.01em;text-transform:none\">· 30 credits/min</small></span><span id=\"vexaSttLanguage\"",
    "STT rate label",
  );

  const transcribeStart = `  async function transcribeFile(file, doc) {
    if (transcribing || !file) return;
    const type = String(file.type || "").toLowerCase();
    if (type && !type.startsWith("audio/") && !type.startsWith("video/")) {
      throw new Error("Choose an audio or video file");
    }

    transcribing = true;`;

  const transcribeReplacement = `  function vexaMediaDurationMs(file) {
    return new Promise(function (resolve, reject) {
      const media = document.createElement(String(file && file.type || "").toLowerCase().startsWith("video/") ? "video" : "audio");
      const objectUrl = URL.createObjectURL(file);
      let settled = false;
      const finish = function (error, value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        media.removeAttribute("src");
        try { media.load(); } catch (loadError) {}
        URL.revokeObjectURL(objectUrl);
        if (error) reject(error); else resolve(value);
      };
      const timer = window.setTimeout(function () {
        finish(new Error("Could not read media duration"));
      }, 8000);
      media.preload = "metadata";
      media.muted = true;
      media.onloadedmetadata = function () {
        const seconds = Number(media.duration || 0);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          finish(new Error("Could not read media duration"));
          return;
        }
        finish(null, Math.max(1, Math.ceil(seconds * 1000)));
      };
      media.onerror = function () { finish(new Error("Could not read media duration")); };
      media.src = objectUrl;
      try { media.load(); } catch (error) { finish(error); }
    });
  }

  async function transcribeFile(file, doc, knownDurationMs) {
    if (transcribing || !file) return;
    const type = String(file.type || "").toLowerCase();
    if (type && !type.startsWith("audio/") && !type.startsWith("video/")) {
      throw new Error("Choose an audio or video file");
    }
    const durationMs = Math.max(1, Math.ceil(Number(knownDurationMs) || await vexaMediaDurationMs(file)));

    transcribing = true;`;

  source = replaceOrKeep(source, transcribeStart, transcribeReplacement, "STT duration measurement");

  source = replaceOrKeep(
    source,
    `const tokenData = await sttApi("/mini-app/live/api/scribe-token", { mode: "transcribe" });`,
    `const tokenData = await sttApi("/mini-app/live/api/scribe-token", { mode: "transcribe", durationMs: durationMs });`,
    "STT billed token request",
  );

  source = replaceOrKeep(
    source,
    `    const chunks = recorderChunks.slice();
    cleanupRecording(true);`,
    `    const chunks = recorderChunks.slice();
    const recordedDurationMs = Math.max(1, Date.now() - recorderStartedAt);
    cleanupRecording(true);`,
    "recording duration capture",
  );

  source = replaceOrKeep(
    source,
    `    const file = new File([blob], "vexa-recording." + extension, { type: mime });
    await transcribeFile(file, doc);`,
    `    const file = new File([blob], "vexa-recording." + extension, { type: mime });
    await transcribeFile(file, doc, recordedDurationMs);`,
    "recording billed duration",
  );

  return cloneTextResponse(response, source);
}

function creditsForDuration(durationMs, creditsPerMinute) {
  return Math.max(1, Math.ceil((Number(durationMs) * Number(creditsPerMinute)) / 60000));
}

function normalizeDurationMs(value) {
  const durationMs = Math.ceil(Number(value || 0));
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw httpError("Could not read media duration", 400);
  }
  return Math.min(durationMs, 24 * 60 * 60 * 1000);
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

function replaceOrKeep(source, before, after, label) {
  if (!source.includes(before)) {
    console.error("Vexa Live billing patch target missing", label);
    return source;
  }
  return source.replace(before, after);
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