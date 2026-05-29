import { requireDb } from "./state.js";

export async function getDemoAudio(env, voice, language) {
  requireDb(env);

  const key = demoKey(voice, language);
  const row = await env.DB.prepare(
    "SELECT audio_base64 FROM demo_cache_v2 WHERE cache_key = ?"
  ).bind(key).first();

  if (!row || !row.audio_base64) return null;
  return base64ToArrayBuffer(row.audio_base64);
}

export async function saveDemoAudio(env, voice, language, audioBuffer) {
  requireDb(env);

  const key = demoKey(voice, language);
  const audioBase64 = arrayBufferToBase64(audioBuffer);

  await env.DB.prepare(
    "INSERT INTO demo_cache_v2 (cache_key, voice, language, audio_base64, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(cache_key) DO UPDATE SET audio_base64 = excluded.audio_base64, created_at = CURRENT_TIMESTAMP"
  ).bind(key, voice, normalizeLanguage(language), audioBase64).run();
}

function demoKey(voice, language) {
  return String(voice || "Nora") + ":" + normalizeLanguage(language);
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
