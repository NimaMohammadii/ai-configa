import worker from "./worker-voice.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { getBalance, spendCredits } from "./credits.js";

const STT_TOKEN_PATH = "/mini-app/live/api/scribe-token";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";
const VOICE_ROOT = "/mini-app/live/api/voice-agent";
const VOICE_SESSION_PATH = VOICE_ROOT + "/session";
const VOICE_BILLING_START_PATH = VOICE_ROOT + "/billing-start";
const VOICE_BILLING_TICK_PATH = VOICE_ROOT + "/billing-tick";
const VOICE_BILLING_CLOSE_PATH = VOICE_ROOT + "/billing-close";
const STT_CREDITS_PER_MINUTE = 30;
const VOICE_CREDITS_PER_MINUTE = 800;
const VOICE_BILLING_MAX_AGE_MS = 15 * 60 * 1000;
const BILLING_VERSION = "20260818-1";

let billingTableReady = null;

export { AiCodingWorkflow } from "./worker-voice.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "POST" && path === STT_TOKEN_PATH) {
        return handleScribeTokenBilling(request, env, ctx);
      }
      if (request.method === "POST" && path === VOICE_SESSION_PATH) {
        return handleVoiceSessionBilling(request, env, ctx);
      }
      if (request.method === "POST" && path === VOICE_BILLING_START_PATH) {
        return handleVoiceBillingAction(request, env, "start");
      }
      if (request.method === "POST" && path === VOICE_BILLING_TICK_PATH) {
        return handleVoiceBillingAction(request, env, "tick");
      }
      if (request.method === "POST" && path === VOICE_BILLING_CLOSE_PATH) {
        return handleVoiceBillingAction(request, env, "close");
      }

      const response = await worker.fetch(request, env, ctx);
      if (request.method === "GET" && path === LIVE_INTEGRATION_PATH) {
        return patchLiveIntegration(response);
      }
      if (request.method === "GET" && path === VOICE_RUNTIME_PATH) {
        return patchVoiceRuntime(response);
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
  if (balance < VOICE_CREDITS_PER_MINUTE) {
    return json({
      error: "Vexa Voice needs at least 800 credits to start",
      balance,
      needed: VOICE_CREDITS_PER_MINUTE,
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    }, 402);
  }

  const upstream = await worker.fetch(request, env, ctx);
  if (!upstream.ok) return upstream;
  const data = await upstream.json().catch(() => null);
  if (!data || typeof data !== "object" || !data.signedUrl) {
    return json({ error: "V3 voice session is unavailable" }, 502);
  }

  const billingSessionId = await createVoiceBillingSession(env, user.id, data.signedUrl);
  const { signedUrl: _signedUrl, ...publicData } = data;
  return json({
    ...publicData,
    billingSessionId,
    creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    balance,
  });
}

async function handleVoiceBillingAction(request, env, action) {
  const payload = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const billingSessionId = normalizeBillingSessionId(payload.billingSessionId);
  if (!billingSessionId) throw httpError("Voice billing session is unavailable", 400);

  if (action === "start") {
    const balance = await getBalance(env, user.id);
    if (balance < VOICE_CREDITS_PER_MINUTE) {
      return json({
        error: "Not enough credits",
        balance,
        needed: VOICE_CREDITS_PER_MINUTE,
        creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
      }, 402);
    }
    const started = await startVoiceBillingSession(env, billingSessionId, user.id);
    const result = await settleVoiceBillingSession(env, billingSessionId, user.id, false);
    if (!result.ok) {
      return json({
        error: "Not enough credits",
        balance: result.balance,
        needed: result.needed,
        creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
      }, 402);
    }
    return json({
      ok: true,
      signedUrl: started.signedUrl,
      balance: result.balance,
      creditsSpent: result.chargedCredits,
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
      elapsedMs: result.elapsedMs,
      ended: false,
    });
  }

  const result = await settleVoiceBillingSession(env, billingSessionId, user.id, action === "close");
  if (!result.ok) {
    return json({
      error: "Not enough credits",
      balance: result.balance,
      needed: result.needed,
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    }, 402);
  }

  return json({
    ok: true,
    balance: result.balance,
    creditsSpent: result.chargedCredits,
    creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    elapsedMs: result.elapsedMs,
    ended: action === "close",
  });
}

async function ensureVoiceBillingTable(env) {
  if (!billingTableReady) {
    billingTableReady = (async () => {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS vexa_voice_billing_sessions (" +
          "id TEXT PRIMARY KEY, user_id TEXT NOT NULL, signed_url TEXT NOT NULL, started_at_ms INTEGER, charged_credits INTEGER NOT NULL DEFAULT 0, " +
          "status TEXT NOT NULL DEFAULT 'pending', created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL)"
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_vexa_voice_billing_user_created ON vexa_voice_billing_sessions (user_id, created_at_ms DESC)"
      ).run();
      await env.DB.prepare(
        "DELETE FROM vexa_voice_billing_sessions WHERE status != 'active' AND created_at_ms < ?"
      ).bind(Date.now() - 24 * 60 * 60 * 1000).run().catch(() => null);
    })().catch((error) => {
      billingTableReady = null;
      throw error;
    });
  }
  return billingTableReady;
}

async function createVoiceBillingSession(env, userId, signedUrl) {
  await ensureVoiceBillingTable(env);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO vexa_voice_billing_sessions (id, user_id, signed_url, started_at_ms, charged_credits, status, created_at_ms, updated_at_ms) " +
      "VALUES (?, ?, ?, NULL, 0, 'pending', ?, ?)"
  ).bind(id, String(userId), String(signedUrl || ""), now, now).run();
  return id;
}

async function startVoiceBillingSession(env, sessionId, userId) {
  await ensureVoiceBillingTable(env);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT status, created_at_ms, signed_url FROM vexa_voice_billing_sessions WHERE id = ? AND user_id = ?"
  ).bind(sessionId, String(userId)).first();
  if (!row) throw httpError("Voice billing session is unavailable", 404);
  if (now - Number(row.created_at_ms || 0) > VOICE_BILLING_MAX_AGE_MS) {
    throw httpError("Voice billing session expired", 410);
  }
  if (String(row.status || "") === "ended") throw httpError("Voice billing session ended", 409);

  await env.DB.prepare(
    "UPDATE vexa_voice_billing_sessions SET started_at_ms = COALESCE(started_at_ms, ?), status = 'active', updated_at_ms = ? " +
      "WHERE id = ? AND user_id = ? AND status IN ('pending','active')"
  ).bind(now, now, sessionId, String(userId)).run();
  return { signedUrl: String(row.signed_url || "") };
}

async function settleVoiceBillingSession(env, sessionId, userId, close) {
  await ensureVoiceBillingTable(env);
  const row = await env.DB.prepare(
    "SELECT started_at_ms, charged_credits, status FROM vexa_voice_billing_sessions WHERE id = ? AND user_id = ?"
  ).bind(sessionId, String(userId)).first();
  if (!row) throw httpError("Voice billing session is unavailable", 404);
  const startedAt = Number(row.started_at_ms || 0);
  if (!startedAt) throw httpError("Voice billing session has not started", 409);
  if (String(row.status || "") === "ended") {
    return {
      ok: true,
      balance: await getBalance(env, userId),
      chargedCredits: Number(row.charged_credits || 0),
      elapsedMs: 0,
    };
  }

  const now = Date.now();
  const elapsedMs = Math.max(1, now - startedAt);
  const targetCredits = creditsForDuration(elapsedMs, VOICE_CREDITS_PER_MINUTE);
  const alreadyCharged = Math.max(0, Number(row.charged_credits || 0));
  const delta = Math.max(0, targetCredits - alreadyCharged);
  let balance = await getBalance(env, userId);

  if (delta > 0) {
    const spent = await spendCredits(env, userId, delta, "vexa_voice_agent", {
      billingSessionId: sessionId,
      elapsedMs,
      targetCredits,
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
    });
    if (!spent.ok) {
      await env.DB.prepare(
        "UPDATE vexa_voice_billing_sessions SET status = 'insufficient', signed_url = '', updated_at_ms = ? WHERE id = ? AND user_id = ?"
      ).bind(now, sessionId, String(userId)).run();
      return { ok: false, balance: spent.balance, needed: delta, chargedCredits: alreadyCharged, elapsedMs };
    }
    balance = spent.balance;
    await env.DB.prepare(
      "UPDATE vexa_voice_billing_sessions SET charged_credits = ?, status = ?, signed_url = CASE WHEN ? = 'ended' THEN '' ELSE signed_url END, updated_at_ms = ? WHERE id = ? AND user_id = ?"
    ).bind(targetCredits, close ? "ended" : "active", close ? "ended" : "active", now, sessionId, String(userId)).run();
  } else if (close) {
    await env.DB.prepare(
      "UPDATE vexa_voice_billing_sessions SET status = 'ended', signed_url = '', updated_at_ms = ? WHERE id = ? AND user_id = ?"
    ).bind(now, sessionId, String(userId)).run();
  }

  return { ok: true, balance, chargedCredits: Math.max(alreadyCharged, targetCredits), elapsedMs };
}

async function patchLiveIntegration(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;
  let source = await response.text();

  source = replaceOrKeep(
    source,
    "Transcript</span><span id=\\\"vexaSttLanguage\\\"",
    "Transcript <small style=\\\"margin-left:5px;color:rgba(255,255,255,.28);font-size:8.5px;font-weight:620;letter-spacing:-.01em;text-transform:none\\\">· 30 credits/min</small></span><span id=\\\"vexaSttLanguage\\\"",
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

async function patchVoiceRuntime(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;
  let source = await response.text();

  const openMarker = "  async function openVoiceMode() {";
  if (source.includes(openMarker) && !source.includes("function startVexaVoiceBillingSession()")) {
    const helpers = `  let vexaVoiceBillingTimer = 0;
  let vexaVoiceBillingChain = Promise.resolve();

  function queueVexaVoiceBilling(finalize) {
    const billingSessionId = String(state.session?.billingSessionId || "");
    if (!billingSessionId) return Promise.resolve(null);
    vexaVoiceBillingChain = vexaVoiceBillingChain
      .catch(() => null)
      .then(() => api(finalize ? "/billing-close" : "/billing-tick", { billingSessionId }))
      .then((data) => {
        if (!finalize && state.active && data && Number(data.balance) <= 0) closeVoiceMode();
        return data;
      })
      .catch((error) => {
        if (!finalize && state.active) {
          fail(error);
          window.setTimeout(() => { if (state.active) closeVoiceMode(); }, 220);
        }
        return null;
      });
    return vexaVoiceBillingChain;
  }

  async function startVexaVoiceBillingSession() {
    const billingSessionId = String(state.session?.billingSessionId || "");
    if (!billingSessionId) throw new Error("Voice billing session is unavailable");
    const data = await api("/billing-start", { billingSessionId });
    state.session = Object.assign({}, state.session || {}, { signedUrl: String(data?.signedUrl || "") });
    if (!state.session.signedUrl.startsWith("wss://")) throw new Error("V3 voice session is unavailable");
    if (vexaVoiceBillingTimer) window.clearInterval(vexaVoiceBillingTimer);
    vexaVoiceBillingTimer = window.setInterval(() => {
      if (state.active) queueVexaVoiceBilling(false);
    }, 5000);
    return data;
  }

  function stopVexaVoiceBilling(finalize) {
    if (vexaVoiceBillingTimer) window.clearInterval(vexaVoiceBillingTimer);
    vexaVoiceBillingTimer = 0;
    if (finalize && state.session?.billingSessionId) queueVexaVoiceBilling(true);
  }

`;
    source = source.replace(openMarker, helpers + openMarker);
  }

  source = replaceOrKeep(
    source,
    `      state.session = session;
      await Promise.all([connectSpeechEngine(), micPromise]);`,
    `      state.session = session;
      await startVexaVoiceBillingSession();
      await Promise.all([connectSpeechEngine(), micPromise]);`,
    "Voice billing session gate",
  );
  source = replaceOrKeep(
    source,
    `        trySend({ type: "conversation_initiation_client_data" });
        state.captureEnabled = true;
        setPhase("listening", "Listening", "");
        resolve();`,
    `        trySend({ type: "conversation_initiation_client_data" });
        state.captureEnabled = false;
        setPhase("connecting", "Preparing voice", "");
        resolve();`,
    "Voice billing pre-capture gate",
  );

  if (!source.includes("stopVexaVoiceBilling(true);")) {
    source = source.replace(
      /(function closeVoiceMode\(\) \{[\s\S]*?state\.captureEnabled = false;)/,
      "$1\n    stopVexaVoiceBilling(true);",
    );
  }

  return cloneTextResponse(response, source);
}

function normalizeDurationMs(value) {
  const durationMs = Math.ceil(Number(value || 0));
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw httpError("Could not read media duration", 400);
  }
  return durationMs;
}

function creditsForDuration(durationMs, creditsPerMinute) {
  return Math.max(1, Math.ceil((Number(durationMs) * Number(creditsPerMinute)) / 60000));
}

function normalizeBillingSessionId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f-]{20,80}$/i.test(id) ? id : "";
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
