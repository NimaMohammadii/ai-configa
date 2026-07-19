import { getMiniAppAccessSettings, isAdmin } from "../admin.js";
import { getBalance, spendCredits } from "../credits.js";
import { textToSpeech } from "../elevenlabs.js";
import { normalizeLang } from "../i18n.js";
import { getState, saveState } from "../state.js";
import { buildTtsAudioFileName, getNextTtsFileSequence, saveTtsHistory } from "../tts-history.js";
import { VOICES } from "../voices.js";
import { MINI_APP_JS } from "./client.js";
import { MINI_APP_HTML } from "./html.js";
import { MINI_APP_CSS } from "./styles.js";

const MAX_TTS_CHARS = 5000;

export function isMiniAppRequest(request) {
  return new URL(request.url).pathname.startsWith("/mini-app");
}

export async function handleMiniAppRequest(request, env) {
  try {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/mini-app" || url.pathname === "/mini-app/")) {
      return html(MINI_APP_HTML);
    }
    if (request.method === "GET" && url.pathname === "/mini-app/styles.css") {
      return asset(MINI_APP_CSS, "text/css;charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/mini-app/app.js") {
      return asset(MINI_APP_JS, "application/javascript;charset=utf-8");
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/session") {
      return json(await sessionPayload(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/tts") {
      return json(await createTts(request, env));
    }

    return json({ error: "Not Found" }, 404);
  } catch (error) {
    return json({ error: error?.message || "Mini app error" }, error?.status || 500);
  }
}

async function sessionPayload(request, env) {
  const user = await authenticateMiniAppUser(request, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return { locked: true, lockedFrom: access.lockedFrom, lockedUntil: access.lockedUntil, serverNow: Math.floor(Date.now() / 1000) };
  const state = await getState(env, user.id);
  return {
    userId: user.id,
    voice: state.voice || "Nora",
    language: normalizeLang(state.language || user.language_code || "en"),
    balance: await getBalance(env, user.id),
  };
}

async function createTts(request, env) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text) return responseError("متن خالی است.", 400);
  if (Array.from(text).length > MAX_TTS_CHARS) return responseError("متن خیلی طولانی است.", 400);

  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);
  const state = await getState(env, user.id);
  const requestedVoiceName = resolveVoiceName(body.voice);
  const voiceName = requestedVoiceName || (VOICES[state.voice] ? state.voice : "Nora");
  if (requestedVoiceName && state.voice !== voiceName) {
    state.voice = voiceName;
    await saveState(env, user.id, state);
  }
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const lang = normalizeLang(state.language || user.language_code || "en");
  const cost = Array.from(text).length;
  const balance = await getBalance(env, user.id);
  if (balance < cost) return responseError("اعتبار کافی نیست.", 402);

  const audio = await textToSpeech(env, text, voiceId, lang);
  await spendCredits(env, user.id, cost, "mini_app_tts", { voice: voiceName, language: lang });

  const sequence = await getNextTtsFileSequence(env, user.id);
  await saveTtsHistory(env, user.id, text, voiceName, lang, cost, null, sequence).catch((error) => {
    console.error("save mini app tts history failed", error && error.message ? error.message : error);
  });

  return {
    audioBase64: arrayBufferToBase64(audio),
    filename: buildTtsAudioFileName(sequence),
    voice: voiceName,
    language: lang,
    balance: balance - cost,
  };
}

function resolveVoiceName(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (VOICES[raw]) return raw;
  return Object.keys(VOICES).find((name) => VOICES[name] === raw) || null;
}

async function getMiniAppAccessForUser(env, userId) {
  const settings = await getMiniAppAccessSettings(env);
  if (!settings.adminOnly) return { locked: false, lockedFrom: 0, lockedUntil: 0 };
  if (await isAdmin(env, userId)) return { locked: false, lockedFrom: settings.lockedFrom, lockedUntil: settings.lockedUntil };
  const now = Math.floor(Date.now() / 1000);
  const lockedUntil = settings.lockedUntil || now + 60;
  const lockedFrom = settings.lockedFrom > 0 ? settings.lockedFrom : Math.max(now, lockedUntil - 60);
  return { locked: true, lockedFrom, lockedUntil };
}

async function authenticateMiniAppUser(request, env) {
  const body = await request.json().catch(() => ({}));
  return authenticateMiniAppUserFromBody(body, env);
}

async function authenticateMiniAppUserFromBody(body, env) {
  const initData = String(body.initData || "");
  const params = new URLSearchParams(initData);
  const userJson = params.get("user");
  if (!userJson) throw httpError("ورود تلگرام معتبر نیست.", 401);
  if (env.BOT_TOKEN && !(await isValidTelegramInitData(initData, env.BOT_TOKEN))) {
    throw httpError("امضای تلگرام معتبر نیست.", 401);
  }
  const user = JSON.parse(userJson);
  if (!user?.id) throw httpError("کاربر تلگرام پیدا نشد.", 401);
  return user;
}

async function isValidTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const encoder = new TextEncoder();
  const webAppKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secretBytes = await crypto.subtle.sign("HMAC", webAppKey, encoder.encode(botToken));
  const secret = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", secret, encoder.encode(dataCheckString));
  return timingSafeEqual(hash, toHex(signature));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function responseError(message, status) {
  throw httpError(message, status);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function html(body) {
  return new Response(body, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

function asset(body, contentType) {
  return new Response(body, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" } });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json;charset=utf-8" } });
}
