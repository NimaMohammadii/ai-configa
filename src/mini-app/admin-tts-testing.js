import { isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { getState } from "../state.js";
import { authenticateMiniAppPayload } from "./auth.js";

const ADMIN_TTS_CONFIG_PATH = "/mini-app/api/tts-model-test-config";
const MINI_APP_SCRIPT_PATH = "/mini-app/app.js";
const MINI_APP_TTS_PATH = "/mini-app/api/tts";
const DEFAULT_GATEWAY_ID = "default";
const DEFAULT_ELEVEN_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MINIMAX_VOICE_ID = "English_expressive_narrator";
const DEFAULT_GEMINI_VOICE = "Kore";
const DEFAULT_INWORLD_VOICE = "Dennis";
const DEFAULT_OPENAI_VOICE = "alloy";
const DEFAULT_GROK_VOICE = "eve";

const TTS_TEST_MODELS = Object.freeze([
  Object.freeze({ id: "elevenlabs/eleven-v3", label: "Eleven v3", provider: "ElevenLabs", transport: "Unified" }),
  Object.freeze({ id: "minimax/speech-2.8-hd", label: "Speech 2.8 HD", provider: "MiniMax", transport: "Unified" }),
  Object.freeze({ id: "google/gemini-3.1-flash-tts", label: "Gemini 3.1 Flash TTS", provider: "Google", transport: "Unified" }),
  Object.freeze({ id: "inworld/tts-2", label: "TTS 2", provider: "Inworld", transport: "Unified" }),
  Object.freeze({ id: "xai/grok-tts", label: "Grok TTS", provider: "xAI", transport: "Unified" }),
  Object.freeze({ id: "openai/tts-1-hd", label: "TTS-1 HD", provider: "OpenAI", transport: "Unified" }),
  Object.freeze({ id: "elevenlabs/eleven-multilingual-v2", label: "Eleven Multilingual v2", provider: "ElevenLabs", transport: "Unified" }),
  Object.freeze({ id: "elevenlabs/eleven-turbo-v2-5", label: "Eleven Turbo v2.5", provider: "ElevenLabs", transport: "Unified" }),
  Object.freeze({ id: "elevenlabs/eleven-flash-v2-5", label: "Eleven Flash v2.5", provider: "ElevenLabs", transport: "Unified" }),
  Object.freeze({ id: "minimax/speech-2.8-turbo", label: "Speech 2.8 Turbo", provider: "MiniMax", transport: "Unified" }),
  Object.freeze({ id: "inworld/tts-1.5-max", label: "TTS 1.5 Max", provider: "Inworld", transport: "Unified" }),
  Object.freeze({ id: "openai/tts-1", label: "TTS-1", provider: "OpenAI", transport: "Unified" }),
  Object.freeze({ id: "inworld/tts-1.5-mini", label: "TTS 1.5 Mini", provider: "Inworld", transport: "Unified" }),
  Object.freeze({ id: "@cf/deepgram/aura-2-en", label: "Aura-2 English", provider: "Deepgram", transport: "Hosted" }),
  Object.freeze({ id: "@cf/deepgram/aura-2-es", label: "Aura-2 Spanish", provider: "Deepgram", transport: "Hosted" }),
  Object.freeze({ id: "@cf/deepgram/aura-1", label: "Aura", provider: "Deepgram", transport: "Hosted" }),
  Object.freeze({ id: "@cf/myshell-ai/melotts", label: "MeloTTS", provider: "MyShell", transport: "Hosted" }),
]);

const MODEL_ALIASES = Object.freeze({
  elevenlabs: "elevenlabs/eleven-v3",
  "minimax-speech-2.8-hd": "minimax/speech-2.8-hd",
  "gemini-2.5-pro-tts": "google/gemini-3.1-flash-tts",
});

export async function handleAdminTtsTestingRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === ADMIN_TTS_CONFIG_PATH) {
    return handleAdminTtsConfig(request, env);
  }

  if (request.method !== "POST" || url.pathname !== MINI_APP_TTS_PATH) return null;

  const body = await request.clone().json().catch(() => ({}));
  const model = normalizeTtsTestModel(body.ttsModel);
  if (!model) return null;

  try {
    const user = await authenticateMiniAppPayload(body, env);
    if (!(await isAdmin(env, user.id))) {
      return json({ error: "Admin-only TTS testing is not available for this account." }, 403);
    }
    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ error: "Cloudflare AI binding is not available yet." }, 503);
    }

    const inputs = normalizeInputs(body.inputs);
    if (!inputs.length) return json({ error: "Type text first." }, 400);
    if (inputs.length !== 1) {
      return json({ error: "Cloudflare TTS model testing currently supports one speaker at a time." }, 400);
    }

    const input = inputs[0];
    const limit = modelCharacterLimit(model);
    if (Array.from(input.text).length > limit) {
      return json({ error: "Use up to " + limit.toLocaleString("en-US") + " characters for this model test." }, 400);
    }

    const state = await getState(env, user.id);
    const language = normalizeLanguage(state?.language || user?.language_code || "en");
    const generated = await generateCloudflareTts(env, {
      model,
      text: input.text,
      voiceId: input.voice,
      language,
    });

    return json({
      audioBase64: arrayBufferToBase64(generated.buffer),
      filename: generated.filename,
      mimeType: generated.mimeType,
      dialogue: false,
      language,
      balance: await getBalance(env, user.id),
      historyId: null,
      revision: 0,
      text: input.text,
      alignment: null,
      editable: false,
      ttsModel: model,
      testMode: true,
      cloudflareAi: true,
    });
  } catch (error) {
    console.error("admin Cloudflare TTS model test failed", {
      model,
      status: error?.status || null,
      message: error?.message || String(error),
    });
    return json(
      { error: error?.publicMessage || publicCloudflareError(error) },
      Number(error?.status) || 500,
    );
  }
}

export async function appendAdminTtsTestingRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const url = new URL(request.url);
  if (url.pathname !== MINI_APP_SCRIPT_PATH) return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("javascript")) return response;

  let source = await response.text();
  source = source.replaceAll(
    "'data:audio/mpeg;base64,'+data.audioBase64",
    "'data:'+(data.mimeType||'audio/mpeg')+';base64,'+data.audioBase64",
  );
  return cloneTextResponse(response, source + "\n" + ADMIN_TTS_MODEL_UI_PATCH);
}

async function handleAdminTtsConfig(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(body, env);
    if (!(await isAdmin(env, user.id))) return json({ enabled: false });
    return json({
      enabled: true,
      cloudflareAiReady: !!(env.AI && typeof env.AI.run === "function"),
      models: TTS_TEST_MODELS,
    });
  } catch {
    return json({ enabled: false });
  }
}

function normalizeInputs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      text: String(item?.text || "").trim(),
      voice: String(item?.voice || "").trim(),
    }))
    .filter((item) => item.text);
}

function normalizeTtsTestModel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const aliased = MODEL_ALIASES[raw.toLowerCase()] || raw;
  return TTS_TEST_MODELS.some((item) => item.id === aliased) ? aliased : "";
}

function modelCharacterLimit(model) {
  if (model.startsWith("inworld/")) return 2000;
  if (model.startsWith("openai/tts-")) return 4096;
  return 10000;
}

async function generateCloudflareTts(env, { model, text, voiceId, language }) {
  if (model.startsWith("elevenlabs/")) {
    return runUnifiedAudio(
      env,
      model,
      {
        text,
        voice_id: voiceId || DEFAULT_ELEVEN_VOICE_ID,
        output_format: "mp3_44100_128",
        ...(language ? { language_code: language } : {}),
      },
      filenameFor(model, "mp3"),
    );
  }

  if (model.startsWith("minimax/")) {
    return runUnifiedAudio(
      env,
      model,
      {
        text,
        voice_id: DEFAULT_MINIMAX_VOICE_ID,
        speed: 1,
        volume: 1,
        pitch: 0,
        format: "mp3",
        sample_rate: 44100,
      },
      filenameFor(model, "mp3"),
    );
  }

  if (model === "google/gemini-3.1-flash-tts") {
    return runUnifiedAudio(
      env,
      model,
      { text, voice: DEFAULT_GEMINI_VOICE, temperature: 1 },
      filenameFor(model, "wav"),
      { pcmSampleRate: 24000 },
    );
  }

  if (model.startsWith("inworld/")) {
    return runUnifiedAudio(
      env,
      model,
      {
        text,
        voice_id: DEFAULT_INWORLD_VOICE,
        output_format: "mp3",
        temperature: 1,
        timestamp_type: "none",
      },
      filenameFor(model, "mp3"),
    );
  }

  if (model.startsWith("openai/tts-")) {
    return runUnifiedAudio(
      env,
      model,
      { text, voice: DEFAULT_OPENAI_VOICE, response_format: "mp3", speed: 1 },
      filenameFor(model, "mp3"),
    );
  }

  if (model === "xai/grok-tts") {
    return runUnifiedAudio(
      env,
      model,
      {
        text,
        language: "auto",
        voice_id: DEFAULT_GROK_VOICE,
        output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 192000 },
      },
      filenameFor(model, "mp3"),
    );
  }

  if (model === "@cf/deepgram/aura-2-en") {
    return runHostedRawAudio(
      env,
      model,
      { text, speaker: "luna", encoding: "mp3" },
      filenameFor(model, "mp3"),
    );
  }

  if (model === "@cf/deepgram/aura-2-es") {
    return runHostedRawAudio(
      env,
      model,
      { text, speaker: "aquila", encoding: "mp3" },
      filenameFor(model, "mp3"),
    );
  }

  if (model === "@cf/deepgram/aura-1") {
    return runHostedRawAudio(env, model, { text }, filenameFor(model, "mp3"));
  }

  if (model === "@cf/myshell-ai/melotts") {
    return runHostedRawAudio(
      env,
      model,
      { prompt: text, lang: language || "en" },
      filenameFor(model, "mp3"),
    );
  }

  throw publicError("Unknown Cloudflare TTS model.", 400);
}

async function runUnifiedAudio(env, model, input, filename, options = {}) {
  let result;
  try {
    result = await env.AI.run(model, input, { gateway: { id: DEFAULT_GATEWAY_ID } });
  } catch (error) {
    throw cloudflareRunError(model, error);
  }
  return materializeAudio(result, filename, options);
}

async function runHostedRawAudio(env, model, input, filename) {
  let result;
  try {
    result = await env.AI.run(model, input, { returnRawResponse: true });
  } catch (error) {
    throw cloudflareRunError(model, error);
  }
  return materializeAudio(result, filename);
}

async function materializeAudio(value, filename, options = {}) {
  if (value instanceof Response) {
    if (!value.ok) {
      const detail = await value.text().catch(() => "");
      throw publicError("Cloudflare AI request failed" + (detail ? " · " + detail.slice(0, 180) : ""), value.status || 502);
    }
    const contentType = String(value.headers.get("Content-Type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      return materializeAudio(await value.json(), filename, options);
    }
    return normalizeAudioBuffer(
      await value.arrayBuffer(),
      contentType || "audio/mpeg",
      filename,
      options,
    );
  }

  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
    const response = new Response(value);
    return normalizeAudioBuffer(await response.arrayBuffer(), "audio/mpeg", filename, options);
  }

  const audio = findAudioValue(value);
  if (!audio) throw publicError("Cloudflare AI did not return audio.", 502);

  if (typeof audio !== "string") {
    if (audio instanceof ArrayBuffer) return normalizeAudioBuffer(audio, "audio/mpeg", filename, options);
    if (ArrayBuffer.isView(audio)) {
      const copy = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
      return normalizeAudioBuffer(copy, "audio/mpeg", filename, options);
    }
    throw publicError("Cloudflare AI returned an unsupported audio payload.", 502);
  }

  if (/^https:\/\//i.test(audio)) {
    const response = await fetch(audio);
    if (!response.ok) throw publicError("Could not fetch the generated Cloudflare audio.", 502);
    return normalizeAudioBuffer(
      await response.arrayBuffer(),
      response.headers.get("Content-Type") || "audio/mpeg",
      filename,
      options,
    );
  }

  if (/^data:/i.test(audio)) return decodeDataAudio(audio, filename, options);

  if (looksLikeBase64(audio)) {
    return normalizeAudioBuffer(base64ToArrayBuffer(audio), "audio/mpeg", filename, options);
  }

  throw publicError("Cloudflare AI returned an unsupported audio reference.", 502);
}

function findAudioValue(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  return (
    value.audio ||
    value.result?.audio ||
    value.data?.audio ||
    value.output?.audio ||
    value.result?.data?.audio ||
    null
  );
}

function decodeDataAudio(dataUri, filename, options) {
  const match = String(dataUri).match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/is);
  if (!match) throw publicError("Cloudflare AI returned invalid audio data.", 502);
  const mimeType = String(match[1] || "audio/mpeg").toLowerCase();
  return normalizeAudioBuffer(base64ToArrayBuffer(match[2].replace(/\s/g, "")), mimeType, filename, options);
}

function normalizeAudioBuffer(buffer, mimeType, filename, options = {}) {
  const cleanMime = String(mimeType || "audio/mpeg").split(";")[0].toLowerCase();
  const bytes = new Uint8Array(buffer);
  if ((cleanMime.includes("l16") || cleanMime.includes("pcm")) && !looksLikeWav(bytes)) {
    return {
      buffer: pcm16ToWav(buffer, Number(options.pcmSampleRate) || 24000, 1),
      mimeType: "audio/wav",
      filename: replaceExtension(filename, "wav"),
    };
  }
  if (looksLikeWav(bytes)) {
    return { buffer, mimeType: "audio/wav", filename: replaceExtension(filename, "wav") };
  }
  return { buffer, mimeType: cleanMime || "audio/mpeg", filename };
}

function cloudflareRunError(model, error) {
  const raw = String(error?.message || error || "Cloudflare AI request failed");
  const message = raw.length > 220 ? raw.slice(0, 220) : raw;
  const status = Number(error?.status || error?.statusCode || 0) || 502;
  return publicError("Cloudflare AI · " + model + " · " + message, status);
}

function publicCloudflareError(error) {
  const raw = String(error?.message || error || "Cloudflare TTS test failed");
  return raw.length > 240 ? raw.slice(0, 240) : raw;
}

function normalizeLanguage(value) {
  return String(value || "en").trim().toLowerCase().split(/[-_]/)[0] || "en";
}

function filenameFor(model, extension) {
  const safe = String(model || "tts")
    .replace(/^@cf\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return "vexa-" + (safe || "tts") + "." + extension;
}

function replaceExtension(filename, extension) {
  return String(filename || "vexa-voice.mp3").replace(/\.[^.]+$/, "") + "." + extension;
}

function looksLikeBase64(value) {
  const clean = String(value || "").replace(/\s/g, "");
  return clean.length >= 16 && clean.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(clean);
}

function looksLikeWav(bytes) {
  return (
    bytes?.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

function pcm16ToWav(buffer, sampleRate, channels) {
  const pcm = new Uint8Array(buffer);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const output = new Uint8Array(44 + pcm.byteLength);
  output.set(new Uint8Array(header), 0);
  output.set(pcm, 44);
  return output.buffer;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let output = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(output);
}

function publicError(message, status = 500) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}

function cloneTextResponse(response, text) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(text, { status: response.status, statusText: response.statusText, headers });
}

const ADMIN_TTS_MODEL_UI_PATCH = String.raw`
(function(){
  var selectedModel=(function(){try{return localStorage.getItem('vexa-admin-tts-model')||'elevenlabs/eleven-v3'}catch(error){return'elevenlabs/eleven-v3'}})();
  var enabled=false;
  var aiReady=false;
  var models=[];
  var baseFetch=window.fetch.bind(window);

  function modelMeta(id){return models.find(function(item){return item.id===id})||models[0]||{id:'elevenlabs/eleven-v3',label:'Eleven v3',provider:'ElevenLabs',transport:'Unified'}}
  function saveSelection(){try{localStorage.setItem('vexa-admin-tts-model',selectedModel)}catch(error){}}
  function ensureStyle(){if(document.getElementById('adminTtsModelStyles'))return;var style=document.createElement('style');style.id='adminTtsModelStyles';style.textContent='.admin-tts-model{position:relative;z-index:44;display:none;flex:0 0 auto}.admin-tts-model.ready{display:block}.image-mode .admin-tts-model{display:none!important}.admin-tts-model-toggle{height:36px;max-width:158px;padding:0 9px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.045);color:#fff;display:flex;align-items:center;gap:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.055);font:inherit}.admin-tts-model-toggle:active{transform:scale(.97)}.admin-tts-model-copy{min-width:0;display:flex;flex-direction:column;align-items:flex-start;line-height:1.02}.admin-tts-model-copy small{max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.34);font-size:7px;font-weight:760;letter-spacing:.065em}.admin-tts-model-copy strong{max-width:118px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.91);font-size:9.5px;font-weight:700}.admin-tts-model-toggle svg{width:11px;height:11px;flex:0 0 auto;color:rgba(255,255,255,.42);transition:transform .2s ease}.admin-tts-model.open .admin-tts-model-toggle svg{transform:rotate(180deg)}.admin-tts-model-menu{position:absolute;right:0;top:44px;width:min(310px,90vw);max-height:min(64vh,520px);overflow-y:auto;overscroll-behavior:contain;padding:6px;border:1px solid rgba(255,255,255,.095);border-radius:16px;background:rgba(13,13,13,.97);box-shadow:0 22px 52px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(20px) saturate(1.12);-webkit-backdrop-filter:blur(20px) saturate(1.12);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.985);transform-origin:top right;transition:opacity .18s ease,visibility .18s ease,transform .2s cubic-bezier(.2,.9,.2,1)}.admin-tts-model.open .admin-tts-model-menu{opacity:1;visibility:visible;transform:none}.admin-tts-model-option{width:100%;min-height:52px;padding:8px 9px;border:0;border-radius:11px;background:transparent;color:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left}.admin-tts-model-option.active,.admin-tts-model-option:active{background:rgba(255,255,255,.07)}.admin-tts-option-copy strong,.admin-tts-option-copy span{display:block}.admin-tts-option-copy strong{font-size:11px;font-weight:720}.admin-tts-option-copy span{margin-top:3px;color:rgba(255,255,255,.42);font-size:8px}.admin-tts-status{min-width:48px;text-align:center;padding:4px 5px;border-radius:999px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.42);font-size:6.5px;font-weight:800;letter-spacing:.04em}.admin-tts-status.live{background:rgba(255,255,255,.94);color:#080808}.admin-tts-model-option.active .admin-tts-status{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}@media(max-width:390px){.admin-tts-model-toggle{max-width:132px;padding:0 7px}.admin-tts-model-copy small{max-width:90px}.admin-tts-model-copy strong{max-width:94px}.admin-tts-model-menu{right:-42px;width:min(300px,92vw)}}';document.head.appendChild(style)}
  function sync(){var meta=modelMeta(selectedModel);var provider=document.getElementById('adminTtsModelProvider');var label=document.getElementById('adminTtsModelLabel');if(provider)provider.textContent=meta.provider;if(label)label.textContent=meta.label;document.querySelectorAll('[data-admin-tts-model]').forEach(function(button){var active=button.getAttribute('data-admin-tts-model')===selectedModel;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')})}
  function select(id){if(!models.some(function(item){return item.id===id}))id=models[0]&&models[0].id||'elevenlabs/eleven-v3';selectedModel=id;saveSelection();sync();var wrap=document.getElementById('adminTtsModel');if(wrap)wrap.classList.remove('open');var toggle=document.getElementById('adminTtsModelToggle');if(toggle)toggle.setAttribute('aria-expanded','false');if(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback&&window.Telegram.WebApp.HapticFeedback.impactOccurred)try{window.Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(error){}}
  function render(){if(!enabled||!models.length)return;ensureStyle();if(selectedModel==='elevenlabs')selectedModel='elevenlabs/eleven-v3';if(!models.some(function(item){return item.id===selectedModel}))selectedModel=models[0].id;var tools=document.querySelector('.mode-tools');var voice=document.getElementById('voiceWrap');if(!tools||!voice||document.getElementById('adminTtsModel'))return;var wrap=document.createElement('div');wrap.id='adminTtsModel';wrap.className='admin-tts-model ready';wrap.innerHTML='<button id="adminTtsModelToggle" class="admin-tts-model-toggle" type="button" aria-label="Choose Cloudflare TTS model" aria-haspopup="true" aria-expanded="false"><span class="admin-tts-model-copy"><small id="adminTtsModelProvider"></small><strong id="adminTtsModelLabel"></strong></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="admin-tts-model-menu" role="menu">'+models.map(function(item){var status=aiReady?(item.transport==='Hosted'?'HOSTED':'UNIFIED'):'AI OFF';return '<button class="admin-tts-model-option" data-admin-tts-model="'+item.id+'" type="button" role="menuitem" aria-pressed="false"><span class="admin-tts-option-copy"><strong>'+item.label+'</strong><span>'+item.provider+'</span></span><span class="admin-tts-status'+(aiReady?' live':'')+'">'+status+'</span></button>'}).join('')+'</div>';tools.insertBefore(wrap,voice);var toggle=document.getElementById('adminTtsModelToggle');toggle.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();var open=!wrap.classList.contains('open');wrap.classList.toggle('open',open);toggle.setAttribute('aria-expanded',open?'true':'false')});wrap.addEventListener('click',function(event){var option=event.target&&event.target.closest?event.target.closest('[data-admin-tts-model]'):null;if(!option)return;event.preventDefault();event.stopPropagation();select(option.getAttribute('data-admin-tts-model')||'')});document.addEventListener('click',function(event){if(!wrap.contains(event.target)){wrap.classList.remove('open');toggle.setAttribute('aria-expanded','false')}});sync()}

  window.fetch=async function(input,init){var path=typeof input==='string'?input:String(input&&input.url||'');if(enabled&&path.indexOf('/mini-app/api/tts')>=0&&path.indexOf('/mini-app/api/tts-model-test-config')<0&&init&&typeof init.body==='string'){try{var body=JSON.parse(init.body);body.ttsModel=selectedModel;var next={};Object.keys(init).forEach(function(key){next[key]=init[key]});next.body=JSON.stringify(body);init=next}catch(error){}}return baseFetch(input,init)};

  (async function(){try{var telegram=window.Telegram&&window.Telegram.WebApp;var initData=telegram&&telegram.initData||'';if(!initData)return;var response=await baseFetch('/mini-app/api/tts-model-test-config',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData})});if(!response.ok)return;var data=await response.json();if(!data||data.enabled!==true)return;enabled=true;aiReady=!!data.cloudflareAiReady;models=Array.isArray(data.models)?data.models:[];render()}catch(error){}})();
})();
`;
