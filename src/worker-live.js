import worker from "./worker-voice.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { creditsForUsdMicros, getBalance, spendCredits, USD_MICROS_PER_CREDIT } from "./credits.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { textToSpeech } from "./elevenlabs.js";
import { VOICES } from "./voices.js";

const STT_TOKEN_PATH = "/mini-app/live/api/scribe-token";
const LIVE_INTEGRATION_PATH = "/mini-app/live/integration.js";
const VOICE_RUNTIME_PATH = "/mini-app/live/voice-agent-runtime.js";
const VOICE_ROOT = "/mini-app/live/api/voice-agent";
const VOICE_SESSION_PATH = VOICE_ROOT + "/session";
const VOICE_PROXY_PATH = VOICE_ROOT + "/connect";
const VOICE_LOCKED_PROMPT_PATH = VOICE_ROOT + "/locked-prompt";
const STT_CREDITS_PER_MINUTE = 5_000 / USD_MICROS_PER_CREDIT;
const VOICE_CREDITS_PER_MINUTE = 140_000 / USD_MICROS_PER_CREDIT;
const VOICE_MINIMUM_BALANCE = creditsForUsdMicros(150_000);
const VOICE_LOCKED_PROMPT_VERSION = "v2";
const VOICE_LOCKED_PROMPT_VOICE = "VexaVoiceLocked:Laura:" + VOICE_LOCKED_PROMPT_VERSION;
const VOICE_LOCKED_PROMPT_COUNT = 5;
const VOICE_LOCKED_PROMPT_VOICE_ID = VOICES.Laura;
const VOICE_SESSION_TTL_MS = 15 * 60 * 1000;
const VOICE_MAX_SESSION_MS = 10 * 60 * 1000;
const VOICE_MAX_SETTLE_INTERVAL_MS = 5000;
const BILLING_VERSION = "20260823-1";
const VOICE_LOCKED_LANGUAGES = new Set(["en", "fa", "ru", "de", "tr", "ar", "es", "hi", "zh", "ja"]);
const VOICE_LOCKED_PROMPTS = {
  en: [
    "[clears throat] To talk with me, you need at least fifteen cents in your balance.",
    "[sighs] Your balance is still below fifteen cents. Top it up a little, then we can talk.",
    "[laughs] You're still a little short. Once your balance reaches fifteen cents, I'm right here.",
    "Voice Agent unlocks when your balance reaches at least fifteen cents.",
    "[clears throat] Still below fifteen cents. Bring your balance up to fifteen cents and we can start.",
  ],
  fa: [
    "[clears throat] برای صحبت با من، باید حداقل پانزده سنت توی حسابت داشته باشی.",
    "[sighs] موجودیت هنوز کمتر از پانزده سنته. یکم حسابت رو شارژ کن تا بتونیم حرف بزنیم.",
    "[laughs] هنوز یکم موجودی کم داری. وقتی حسابت به پانزده سنت برسه، می‌تونیم شروع کنیم.",
    "برای فعال شدن ویس ایجنت، حداقل پانزده سنت موجودی لازمه.",
    "[clears throat] موجودیت هنوز زیر پانزده سنته. حسابت رو برسون به پانزده سنت تا شروع کنیم.",
  ],
  ru: [
    "[clears throat] Чтобы поговорить со мной, на балансе должно быть минимум пятнадцать центов.",
    "[sighs] На балансе пока меньше пятнадцати центов. Немного пополни его, и сможем поговорить.",
    "[laughs] Тебе совсем немного не хватает. Как только будет пятнадцать центов, я здесь.",
    "Голосовой агент откроется, когда на балансе будет минимум пятнадцать центов.",
    "[clears throat] Пока меньше пятнадцати центов. Пополни баланс до пятнадцати центов, и начнём.",
  ],
  de: [
    "[clears throat] Um mit mir zu sprechen, brauchst du mindestens fünfzehn Cent Guthaben.",
    "[sighs] Dein Guthaben liegt noch unter fünfzehn Cent. Lade es etwas auf, dann können wir reden.",
    "[laughs] Dir fehlt nur noch ein wenig. Sobald du fünfzehn Cent hast, bin ich da.",
    "Der Voice Agent wird freigeschaltet, sobald dein Guthaben mindestens fünfzehn Cent erreicht.",
    "[clears throat] Noch unter fünfzehn Cent. Lade dein Guthaben auf fünfzehn Cent auf, dann legen wir los.",
  ],
  tr: [
    "[clears throat] Benimle konuşmak için bakiyende en az on beş sent olmalı.",
    "[sighs] Bakiyen hâlâ on beş sentin altında. Biraz yükle, sonra konuşabiliriz.",
    "[laughs] Biraz daha bakiyeye ihtiyacın var. On beş sente ulaştığında ben buradayım.",
    "Sesli asistan, bakiyen en az on beş sente ulaştığında açılır.",
    "[clears throat] Hâlâ on beş sentin altındasın. Bakiyeni on beş sente çıkar, başlayalım.",
  ],
  ar: [
    "[clears throat] للتحدث معي، يجب أن يكون رصيدك خمسة عشر سنتًا على الأقل.",
    "[sighs] رصيدك ما زال أقل من خمسة عشر سنتًا. اشحنه قليلاً وبعدها نقدر نتكلم.",
    "[laughs] باقي لك شوية فقط. لما توصل لخمسة عشر سنتًا، أنا هنا.",
    "الوكيل الصوتي يفتح عندما يصل رصيدك إلى خمسة عشر سنتًا على الأقل.",
    "[clears throat] ما زلت تحت خمسة عشر سنتًا. ارفع رصيدك لخمسة عشر سنتًا ونبدأ.",
  ],
  es: [
    "[clears throat] Para hablar conmigo, necesitas al menos quince centavos en tu saldo.",
    "[sighs] Tu saldo todavía está por debajo de quince centavos. Recárgalo un poco y podremos hablar.",
    "[laughs] Te falta solo un poco. Cuando llegues a quince centavos, aquí estaré.",
    "El agente de voz se desbloquea cuando tu saldo llega al menos a quince centavos.",
    "[clears throat] Sigues por debajo de quince centavos. Sube tu saldo a quince centavos y empezamos.",
  ],
  hi: [
    "[clears throat] मुझसे बात करने के लिए तुम्हारे बैलेंस में कम से कम पंद्रह सेंट होने चाहिए।",
    "[sighs] तुम्हारा बैलेंस अभी पंद्रह सेंट से कम है। थोड़ा टॉप अप कर लो, फिर हम बात कर सकते हैं।",
    "[laughs] बस थोड़ा सा बैलेंस और चाहिए। पंद्रह सेंट होते ही मैं यहीं हूँ।",
    "वॉइस एजेंट तब खुलेगा जब तुम्हारे बैलेंस में कम से कम पंद्रह सेंट होंगे।",
    "[clears throat] अभी भी पंद्रह सेंट से कम है। बैलेंस पंद्रह सेंट तक कर लो, फिर शुरू करते हैं।",
  ],
  zh: [
    "[clears throat] 要和我语音聊天，你的余额至少需要十五美分。",
    "[sighs] 你的余额还不到十五美分。再充一点，我们就能聊天了。",
    "[laughs] 还差一点余额。到十五美分以后，我就在这里等你。",
    "余额达到至少十五美分后，语音助手就会解锁。",
    "[clears throat] 现在还不到十五美分。把余额补到十五美分，我们就开始吧。",
  ],
  ja: [
    "[clears throat] 私と話すには、残高が最低15セント必要です。",
    "[sighs] まだ15セントに届いていません。少しチャージしたら、話せます。",
    "[laughs] あと少し残高が必要です。15セントになったら、ここで待っています。",
    "残高が最低15セントになると、ボイスエージェントが使えるようになります。",
    "[clears throat] まだ15セント未満です。残高を15セントまでチャージして、始めましょう。",
  ],
};

let proxyTableReady = null;
const lockedPromptInflight = new Map();

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

      if (request.method === "POST" && path === VOICE_LOCKED_PROMPT_PATH) {
        return handleVoiceLockedPrompt(request, env);
      }

      if (request.method === "POST" && path === VOICE_SESSION_PATH) {
        return handleVoiceSessionBilling(request, env, ctx);
      }

      const response = await worker.fetch(request, env, ctx);
      if (request.method === "GET" && path === VOICE_RUNTIME_PATH) {
        return patchVoiceRuntime(response);
      }
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
      error: "Not enough USD balance",
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
      error: "Not enough USD balance",
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

async function handleVoiceLockedPrompt(request, env) {
  const payload = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const balance = await getBalance(env, user.id);

  if (balance >= VOICE_MINIMUM_BALANCE) {
    return json({
      ok: true,
      unlocked: true,
      balance,
      minimumBalance: VOICE_MINIMUM_BALANCE,
    }, 409);
  }

  const language = normalizeLockedVoiceLanguage(payload.language);
  const prompts = VOICE_LOCKED_PROMPTS[language] || VOICE_LOCKED_PROMPTS.en;
  const rawVariant = Math.trunc(Number(payload.variant || 0));
  const variant = ((Number.isFinite(rawVariant) ? rawVariant : 0) % prompts.length + prompts.length) % prompts.length;
  const text = prompts[variant];
  const cached = await lockedVoicePromptAudio(env, language, variant, text);

  return new Response(cached.audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Vexa-Locked-Voice": VOICE_LOCKED_PROMPT_VERSION,
      "X-Vexa-Locked-Voice-Cache": cached.cache,
      "X-Vexa-Locked-Voice-Variant": String(variant),
    },
  });
}

async function lockedVoicePromptAudio(env, language, variant, text) {
  let audio = await getDemoAudio(env, VOICE_LOCKED_PROMPT_VOICE, language, text);
  if (audio) return { audio, cache: "hit" };

  const key = language + ":" + String(variant) + ":" + VOICE_LOCKED_PROMPT_VERSION;
  let pending = lockedPromptInflight.get(key);
  if (!pending) {
    pending = (async () => {
      const existing = await getDemoAudio(env, VOICE_LOCKED_PROMPT_VOICE, language, text);
      if (existing) return { audio: existing, cache: "hit" };
      if (!VOICE_LOCKED_PROMPT_VOICE_ID) throw httpError("Voice is unavailable", 503);
      const generated = await textToSpeech(env, text, VOICE_LOCKED_PROMPT_VOICE_ID, language);
      await saveDemoAudio(env, VOICE_LOCKED_PROMPT_VOICE, language, generated, text);
      return { audio: generated, cache: "generated" };
    })().finally(() => lockedPromptInflight.delete(key));
    lockedPromptInflight.set(key, pending);
  }
  return pending;
}

async function handleVoiceSessionBilling(request, env, ctx) {
  const payload = await request.clone().json().catch(() => ({}));
  const user = await authenticateMiniAppPayload(payload, env);
  const balance = await getBalance(env, user.id);

  if (balance < VOICE_MINIMUM_BALANCE) {
    return json({
      ok: true,
      locked: true,
      balance,
      minimumBalance: VOICE_MINIMUM_BALANCE,
      creditsNeeded: Math.max(0, VOICE_MINIMUM_BALANCE - Number(balance || 0)),
      creditsPerMinute: VOICE_CREDITS_PER_MINUTE,
      lockedPromptCount: VOICE_LOCKED_PROMPT_COUNT,
      language: normalizeLockedVoiceLanguage(payload.language),
    });
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
    minimumBalance: VOICE_MINIMUM_BALANCE,
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

        closeBoth(4002, "Not enough USD balance");
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
      closeBoth(4002, "Not enough USD balance");
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

async function patchVoiceRuntime(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();

  source = replaceOrKeep(
    source,
    `    playbackTimer: 0,
  };`,
    `    playbackTimer: 0,
    lockedVoice: false,
    lockedMinimumBalance: ${VOICE_MINIMUM_BALANCE},
    lockedPromptCount: ${VOICE_LOCKED_PROMPT_COUNT},
    lockedPromptIndex: 0,
    lockedSpeechStartedAt: 0,
    lockedLastPromptAt: 0,
    lockedPromptBusy: false,
  };`,
    "locked voice runtime state",
  );

  source = replaceOrKeep(
    source,
    `      state.session = session;
      await Promise.all([connectSpeechEngine(), micPromise]);`,
    `      state.session = session;
      if (session?.locked) {
        state.lockedVoice = true;
        state.lockedMinimumBalance = Math.max(1, Number(session.minimumBalance || ${VOICE_MINIMUM_BALANCE}));
        state.lockedPromptCount = Math.max(1, Number(session.lockedPromptCount || ${VOICE_LOCKED_PROMPT_COUNT}));
        state.lockedPromptIndex = loadLockedVoicePromptIndex();
        await micPromise;
        if (!state.active) return;
        state.captureEnabled = false;
        setPhase("listening", "Listening", "");
        return;
      }
      state.lockedVoice = false;
      await Promise.all([connectSpeechEngine(), micPromise]);`,
    "locked voice session branch",
  );

  source = replaceOrKeep(
    source,
    `      state.micEnergy = rmsFloat(input);
      if (!state.captureEnabled || state.socket?.readyState !== WebSocket.OPEN) return;`,
    `      state.micEnergy = rmsFloat(input);
      if (state.lockedVoice) {
        handleLockedVoiceMic(state.micEnergy);
        return;
      }
      if (!state.captureEnabled || state.socket?.readyState !== WebSocket.OPEN) return;`,
    "locked voice local speech detector",
  );

  const lockedHelpers = `  function lockedVoicePromptStorageKey() {
    const userId = String(telegram()?.initDataUnsafe?.user?.id || "guest");
    const language = String(preferredLanguage() || "en").toLowerCase().replace("_", "-").split("-")[0] || "en";
    return "vexa_locked_voice_prompt_${VOICE_LOCKED_PROMPT_VERSION}:" + userId + ":" + language;
  }

  function loadLockedVoicePromptIndex() {
    const count = Math.max(1, Number(state.lockedPromptCount || ${VOICE_LOCKED_PROMPT_COUNT}));
    try {
      const stored = Math.trunc(Number(localStorage.getItem(lockedVoicePromptStorageKey()) || 0));
      if (Number.isFinite(stored)) return ((stored % count) + count) % count;
    } catch (error) {}
    return 0;
  }

  function saveLockedVoicePromptIndex(value) {
    try { localStorage.setItem(lockedVoicePromptStorageKey(), String(Math.max(0, Math.trunc(Number(value || 0))))); } catch (error) {}
  }

  function lockedVoiceNow() {
    try { return performance.now(); } catch (error) { return Date.now(); }
  }

  function handleLockedVoiceMic(energy) {
    if (!state.active || !state.lockedVoice) {
      state.lockedSpeechStartedAt = 0;
      return;
    }

    const now = lockedVoiceNow();
    if (state.lockedPromptBusy || state.phase === "speaking" || now - Number(state.lockedLastPromptAt || 0) < 1200) {
      state.lockedSpeechStartedAt = 0;
      return;
    }

    const level = Math.max(0, Number(energy || 0));
    if (level >= .065) {
      if (!state.lockedSpeechStartedAt) state.lockedSpeechStartedAt = now;
      if (now - state.lockedSpeechStartedAt >= 170) {
        state.lockedSpeechStartedAt = 0;
        state.lockedLastPromptAt = now;
        playLockedVoicePrompt().catch((error) => console.error("Vexa locked voice prompt", error));
      }
      return;
    }

    if (level < .042) state.lockedSpeechStartedAt = 0;
  }

  async function requestLockedVoicePrompt(variant) {
    const response = await fetch(API + "/locked-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "audio/mpeg,application/json" },
      cache: "no-store",
      body: JSON.stringify({
        initData: initData(),
        language: preferredLanguage(),
        variant: variant,
      }),
    });

    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      if (data?.unlocked) return { unlocked: true };
      throw new Error(String(data?.error || "Voice balance changed"));
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(String(data?.error || "Could not play voice message"));
    }

    const audio = await response.arrayBuffer();
    if (!audio.byteLength) throw new Error("Voice message is empty");
    return { audio };
  }

  async function playLockedVoiceAudio(bytes) {
    const context = await ensureAudioContext();
    const audioBuffer = await context.decodeAudioData(bytes.slice(0));
    if (!state.active || !state.lockedVoice) return;

    stopPlayback();
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.playbackGain || context.destination);
    state.playbackSources.add(source);
    state.nextPlaybackTime = context.currentTime + audioBuffer.duration;

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        state.playbackSources.delete(source);
        resolve();
      };
      source.addEventListener("ended", finish, { once: true });
      try { source.start(); } catch (error) {
        state.playbackSources.delete(source);
        reject(error);
      }
    });
  }

  async function activateUnlockedVoice() {
    const session = await api("/session", { language: preferredLanguage() });
    if (!state.active) return false;
    state.session = session;
    if (session?.locked) {
      state.lockedMinimumBalance = Math.max(1, Number(session.minimumBalance || ${VOICE_MINIMUM_BALANCE}));
      state.lockedPromptCount = Math.max(1, Number(session.lockedPromptCount || ${VOICE_LOCKED_PROMPT_COUNT}));
      return false;
    }

    state.lockedVoice = false;
    state.lockedSpeechStartedAt = 0;
    setPhase("connecting", "Preparing voice", "");
    await connectSpeechEngine();
    return true;
  }

  async function playLockedVoicePrompt() {
    if (!state.active || !state.lockedVoice || state.lockedPromptBusy) return;
    state.lockedPromptBusy = true;
    const count = Math.max(1, Number(state.lockedPromptCount || ${VOICE_LOCKED_PROMPT_COUNT}));
    const variant = ((Math.trunc(Number(state.lockedPromptIndex || 0)) % count) + count) % count;
    state.lockedPromptIndex = (variant + 1) % count;
    saveLockedVoicePromptIndex(state.lockedPromptIndex);

    try {
      setPhase("thinking", "…", "");
      const result = await requestLockedVoicePrompt(variant);
      if (!state.active) return;

      if (result?.unlocked) {
        const activated = await activateUnlockedVoice();
        if (!activated && state.active && state.lockedVoice) setPhase("listening", "Listening", "");
        return;
      }

      setPhase("speaking", "Speaking", "");
      await playLockedVoiceAudio(result.audio);
      if (state.active && state.lockedVoice) setPhase("listening", "Listening", "");
    } catch (error) {
      console.error("Vexa locked voice prompt", error);
      if (state.active && state.lockedVoice) setPhase("listening", "Listening", "");
    } finally {
      state.lockedPromptBusy = false;
    }
  }

`;

  source = replaceOrKeep(
    source,
    `  async function connectSpeechEngine() {`,
    lockedHelpers + `  async function connectSpeechEngine() {`,
    "locked voice helper injection",
  );

  source = replaceOrKeep(
    source,
    `    state.active = false;
    state.captureEnabled = false;`,
    `    state.active = false;
    state.captureEnabled = false;
    state.lockedVoice = false;
    state.lockedSpeechStartedAt = 0;
    state.lockedLastPromptAt = 0;
    state.lockedPromptBusy = false;`,
    "locked voice cleanup",
  );

  source = replaceOrKeep(
    source,
    `      if (!state.active) return;
      if (state.socket) {`,
    `      if (!state.active || state.lockedVoice) return;
      if (state.socket) {`,
    "locked voice protocol observer",
  );

  return cloneTextResponse(response, source);
}

async function patchLiveIntegration(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();

  source = replaceOrKeep(
    source,
    "Transcript</span><span id=\\\"vexaSttLanguage\\\"",
    "Transcript <small style=\\\"margin-left:5px;color:rgba(255,255,255,.28);font-size:8.5px;font-weight:620;letter-spacing:-.01em;text-transform:none\\\">· $0.005/min</small></span><span id=\\\"vexaSttLanguage\\\"",
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

function normalizeLockedVoiceLanguage(value) {
  const raw = String(value || "").trim().toLowerCase().replace("_", "-");
  const base = raw.split("-")[0];
  return VOICE_LOCKED_LANGUAGES.has(base) ? base : "en";
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