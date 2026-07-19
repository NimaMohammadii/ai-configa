import { getMiniAppAccessSettings, getVoiceProfile, getVoiceProfiles, isAdmin, trackMiniAppOpen } from "../admin.js";
import { getBalance, spendCredits } from "../credits.js";
import { getDemoAudio, saveDemoAudio } from "../demo-cache.js";
import { getDemoText } from "../demo-texts.js";
import { textToSpeech } from "../elevenlabs.js";
import { editImages, generateImage } from "../gpt.js";
import { normalizeLang } from "../i18n.js";
import { getState, saveState } from "../state.js";
import { buildTtsAudioFileName, getMiniAppTtsHistory, getMiniAppTtsHistoryAudio, getNextTtsFileSequence, saveTtsHistory } from "../tts-history.js";
import { VOICES } from "../voices.js";
import { getUserVoiceSettings, saveUserVoiceSettings } from "../voice-settings.js";
import { tgJson } from "../telegram-api.js";
import { MINI_APP_JS } from "./client.js";
import { MINI_APP_HTML } from "./html.js";
import { MINI_APP_CSS } from "./styles.js";

const MAX_TTS_CHARS = 5000;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_EDIT_INPUTS = 4;
const MAX_IMAGE_UPLOAD_TOTAL_BYTES = 24 * 1024 * 1024;

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
    if (request.method === "GET" && url.pathname.startsWith("/mini-app/api/voice-profile/")) {
      return await serveVoiceProfileImage(url.pathname.slice("/mini-app/api/voice-profile/".length), env);
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/session") {
      return json(await sessionPayload(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/tts") {
      return json(await createTts(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/image") {
      return json(await createImage(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/voice-settings") {
      return json(await updateVoiceSettings(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/history") {
      return json(await historyPayload(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/history-audio") {
      return json(await historyAudioPayload(request, env));
    }
    if (request.method === "POST" && url.pathname === "/mini-app/api/voice-demo") {
      return json(await createVoiceDemo(request, env));
    }

    return json({ error: "Not Found" }, 404);
  } catch (error) {
    return json({ error: error?.message || "Mini app error" }, error?.status || 500);
  }
}

async function createImage(request, env) {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return responseError("Describe the image you want first.", 400);

  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);

  const size = resolveImageSize(body.size);
  const requestedImages = Array.isArray(body.images)
    ? body.images
    : body.imageData
      ? [{ data: body.imageData, name: body.imageName }]
      : [];
  if (requestedImages.length > MAX_IMAGE_EDIT_INPUTS) {
    return responseError("You can edit up to 4 images together.", 400);
  }
  const sources = requestedImages.map((item) => decodeImageData(item?.data, item?.name)).filter(Boolean);
  const totalSourceBytes = sources.reduce((total, source) => total + source.buffer.byteLength, 0);
  if (totalSourceBytes > MAX_IMAGE_UPLOAD_TOTAL_BYTES) {
    return responseError("The selected images are too large together.", 413);
  }
  const output = sources.length
    ? await editImages(env, prompt, sources, { size })
    : await generateImage(env, prompt, { size });

  return {
    imageBase64: arrayBufferToBase64(output),
    filename: sources.length ? "vexa-edited-image.png" : "vexa-image.png",
    kind: sources.length ? "edit" : "generate",
    sourceCount: sources.length,
    size,
  };
}

function resolveImageSize(value) {
  const size = String(value || "").trim().toLowerCase();
  return ["1024x1024", "1024x1536", "1536x1024"].includes(size) ? size : "1024x1024";
}

function decodeImageData(value, filename) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return responseError("Use a JPG, PNG, or WebP image.", 400);

  let binary;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    return responseError("The selected image could not be read.", 400);
  }
  if (!binary.length || binary.length > MAX_IMAGE_UPLOAD_BYTES) {
    return responseError("The selected image is too large.", 413);
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const safeName = String(filename || "reference" + extension).split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "_");
  return { buffer: bytes.buffer, filename: safeName || "reference" + extension, mimeType };
}

async function sessionPayload(request, env) {
  const user = await authenticateMiniAppUser(request, env);
  await trackMiniAppOpen(env, user);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return { locked: true, lockedFrom: access.lockedFrom, lockedUntil: access.lockedUntil, serverNow: Math.floor(Date.now() / 1000) };
  const state = await getState(env, user.id);
  const profiles = await getVoiceProfiles(env);
  return {
    userId: user.id,
    voice: state.voice || "Nora",
    language: normalizeLang(state.language || user.language_code || "en"),
    balance: await getBalance(env, user.id),
    voiceSettings: await getUserVoiceSettings(env, user.id),
    voiceProfiles: Object.fromEntries(Object.keys(profiles).map((name) => [name, "/mini-app/api/voice-profile/" + encodeURIComponent(name) + "?v=" + encodeURIComponent(profiles[name].fileId)])),
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
  const requestedVoice = resolveVoiceName(body.voice);
  const voiceName = requestedVoice || state.voice || "Nora";
  if (requestedVoice && state.voice !== requestedVoice) {
    state.voice = requestedVoice;
    await saveState(env, user.id, state);
  }
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const lang = normalizeLang(state.language || user.language_code || "en");
  const cost = Array.from(text).length;
  const balance = await getBalance(env, user.id);
  if (balance < cost) return responseError("اعتبار کافی نیست.", 402);

  const voiceSettings = await getUserVoiceSettings(env, user.id);
  const audio = await textToSpeech(env, text, voiceId, lang, voiceSettings);
  await spendCredits(env, user.id, cost, "mini_app_tts", { voice: voiceName, language: lang });

  const sequence = await getNextTtsFileSequence(env, user.id);
  const audioBase64 = arrayBufferToBase64(audio);
  await saveTtsHistory(env, user.id, text, voiceName, lang, cost, null, sequence, audioBase64).catch((error) => {
    console.error("save mini app tts history failed", error && error.message ? error.message : error);
  });

  return {
    audioBase64,
    filename: buildTtsAudioFileName(sequence),
    voice: voiceName,
    language: lang,
    balance: balance - cost,
  };
}

async function updateVoiceSettings(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);

  return {
    voiceSettings: await saveUserVoiceSettings(env, user.id, body.settings || {}),
  };
}

async function historyPayload(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);
  return { items: await getMiniAppTtsHistory(env, user.id, 30) };
}

async function historyAudioPayload(request, env) {
  const body = await request.json().catch(() => ({}));
  const historyId = String(body.id || "").trim();
  if (!historyId) return responseError("History item not found.", 400);

  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);

  const item = await getMiniAppTtsHistoryAudio(env, user.id, historyId);
  if (!item) return responseError("History item not found.", 404);

  let audioBase64 = String(item.audio_base64 || "");
  if (!audioBase64 && item.file_id) {
    const file = await tgJson(env, "getFile", { file_id: item.file_id });
    if (file?.file_path) {
      const response = await fetch("https://api.telegram.org/file/bot" + env.BOT_TOKEN + "/" + file.file_path);
      if (response.ok) audioBase64 = arrayBufferToBase64(await response.arrayBuffer());
    }
  }

  if (!audioBase64) return responseError("Audio is not available for this older item.", 404);
  return {
    id: item.id,
    audioBase64,
    filename: buildTtsAudioFileName(item.file_sequence),
  };
}

async function createVoiceDemo(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await authenticateMiniAppUserFromBody(body, env);
  const access = await getMiniAppAccessForUser(env, user.id);
  if (access.locked) return responseError("Mini app is updating.", 423);

  const state = await getState(env, user.id);
  const voiceName = resolveVoiceName(body.voice);
  if (!voiceName) return responseError("Voice not found.", 404);

  const voiceId = VOICES[voiceName];
  const lang = normalizeLang(state.language || user.language_code || "en");
  const text = getDemoText(lang, voiceName);
  let audio = await getDemoAudio(env, voiceName, lang, text);

  if (!audio) {
    audio = await textToSpeech(env, text, voiceId, lang);
    await saveDemoAudio(env, voiceName, lang, audio, text);
  }

  return {
    audioBase64: arrayBufferToBase64(audio),
    voice: voiceName,
    language: lang,
  };
}

async function serveVoiceProfileImage(rawVoiceName, env) {
  const voiceName = resolveVoiceName(decodeURIComponent(String(rawVoiceName || "")));
  if (!voiceName) return new Response("Not Found", { status: 404 });

  const profile = await getVoiceProfile(env, voiceName);
  if (!profile?.fileId) return new Response("Not Found", { status: 404 });

  const file = await tgJson(env, "getFile", { file_id: profile.fileId });
  if (!file?.file_path) return new Response("Not Found", { status: 404 });

  const response = await fetch("https://api.telegram.org/file/bot" + env.BOT_TOKEN + "/" + file.file_path);
  if (!response.ok) return new Response("Not Found", { status: 404 });

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
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
  return new Response(body, { headers: noStoreHeaders("text/html;charset=utf-8") });
}

function asset(body, contentType) {
  return new Response(body, { headers: noStoreHeaders(contentType) });
}

function noStoreHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json;charset=utf-8" } });
}
