import { requireDb } from "./state.js";

export async function getDemoAudio(env, voice, language, text) {
  requireDb(env);

  const key = demoKey(voice, language, text);
  const row = await env.DB.prepare(
    "SELECT audio_base64 FROM demo_cache_v2 WHERE cache_key = ?"
  ).bind(key).first();

  if (!row || !row.audio_base64) return null;
  return base64ToArrayBuffer(row.audio_base64);
}

export async function saveDemoAudio(env, voice, language, audioBuffer, text) {
  requireDb(env);

  const key = demoKey(voice, language, text);
  const audioBase64 = arrayBufferToBase64(audioBuffer);

  await env.DB.prepare(
    "INSERT INTO demo_cache_v2 (cache_key, voice, language, audio_base64, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(cache_key) DO UPDATE SET audio_base64 = excluded.audio_base64, created_at = CURRENT_TIMESTAMP"
  ).bind(key, voice, normalizeLanguage(language), audioBase64).run();
}

function demoKey(voice, language, text) {
  const baseKey = String(voice || "Nora") + ":" + normalizeLanguage(language);
  return text ? baseKey + ":" + hashText(text) : baseKey;
}

function hashText(text) {
  let hash = 5381;
  const value = String(text);

  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
}

function normalizeLanguage(language) {
  return String(language || "en");
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}
