import { requireDb } from "./state.js";

export async function getDemoAudio(env, voice) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT audio_base64 FROM demo_cache WHERE voice = ?"
  ).bind(voice).first();

  if (!row || !row.audio_base64) return null;
  return base64ToArrayBuffer(row.audio_base64);
}

export async function saveDemoAudio(env, voice, audioBuffer) {
  requireDb(env);

  const audioBase64 = arrayBufferToBase64(audioBuffer);

  await env.DB.prepare(
    "INSERT INTO demo_cache (voice, audio_base64, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(voice) DO UPDATE SET audio_base64 = excluded.audio_base64, created_at = CURRENT_TIMESTAMP"
  ).bind(voice, audioBase64).run();
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
