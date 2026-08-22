import { isAdmin } from "../admin.js";
import { getBalance } from "../credits.js";
import { getState } from "../state.js";
import { authenticateMiniAppPayload } from "./auth.js";

const ADMIN_TTS_CONFIG_PATH = "/mini-app/api/tts-model-test-config";
const MINI_APP_SCRIPT_PATH = "/mini-app/app.js";
const MINI_APP_TTS_PATH = "/mini-app/api/tts";
const DEFAULT_FISH_REFERENCE_ID = "933563129e564b19a115bedd57b7406a";
const DEFAULT_MINIMAX_VOICE_ID = "English_expressive_narrator";
const DEFAULT_GEMINI_VOICE = "Kore";
const DEFAULT_CARTESIA_VOICE_ID = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b";

const TTS_TEST_MODELS = Object.freeze([
  Object.freeze({ id: "elevenlabs", label: "ElevenLabs v3", provider: "ElevenLabs" }),
  Object.freeze({ id: "fish-s2.1-pro", label: "S2.1 Pro", provider: "Fish Audio" }),
  Object.freeze({ id: "minimax-speech-2.8-hd", label: "Speech 2.8 HD", provider: "MiniMax" }),
  Object.freeze({ id: "gemini-2.5-pro-tts", label: "Gemini 2.5 Pro TTS", provider: "Google" }),
  Object.freeze({ id: "cartesia-sonic-3.5", label: "Sonic 3.5", provider: "Cartesia" }),
]);

const CARTESIA_LANGUAGES = new Set([
  "en", "fr", "de", "es", "pt", "zh", "ja", "hi", "it", "ko", "nl", "pl", "ru", "sv", "tr", "tl",
  "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms", "sk", "da", "ta", "uk", "hu", "no", "vi", "bn",
  "th", "he", "ka", "id", "te", "gu", "kn", "ml", "mr", "pa",
]);

export async function handleAdminTtsTestingRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === ADMIN_TTS_CONFIG_PATH) {
    return handleAdminTtsConfig(request, env);
  }

  if (request.method !== "POST" || url.pathname !== MINI_APP_TTS_PATH) return null;

  const body = await request.clone().json().catch(() => ({}));
  const model = normalizeTtsTestModel(body.ttsModel);
  if (!model || model === "elevenlabs") return null;

  try {
    const user = await authenticateMiniAppPayload(body, env);
    if (!(await isAdmin(env, user.id))) return json({ error: "Admin-only TTS testing is not available for this account." }, 403);

    const inputs = normalizeInputs(body.inputs);
    if (!inputs.length) return json({ error: "Type text first." }, 400);
    if (inputs.length !== 1) {
      return json({ error: "External TTS model testing currently supports one speaker at a time. Use ElevenLabs v3 for dialogue." }, 400);
    }

    const text = inputs[0].text;
    if (Array.from(text).length > 5000) return json({ error: "Use up to 5,000 characters for this TTS test." }, 400);

    const state = await getState(env, user.id);
    const language = normalizeLanguage(state?.language || user?.language_code || "en");
    const generated = await generateExternalTts(env, { model, text, language, signal: request.signal });

    return json({
      audioBase64: arrayBufferToBase64(generated.buffer),
      filename: generated.filename,
      mimeType: generated.mimeType,
      dialogue: false,
      language,
      balance: await getBalance(env, user.id),
      historyId: null,
      revision: 0,
      text,
      alignment: null,
      editable: false,
      ttsModel: model,
      testMode: true,
    });
  } catch (error) {
    console.error("admin TTS model test failed", {
      model,
      status: error?.status || null,
      message: error?.message || String(error),
    });
    return json({ error: error?.publicMessage || error?.message || "TTS model test failed." }, Number(error?.status) || 500);
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
      models: TTS_TEST_MODELS,
      configured: {
        elevenlabs: !!env.ELEVEN_API,
        "fish-s2.1-pro": !!env.FISH_API_KEY,
        "minimax-speech-2.8-hd": !!env.MINIMAX_API_KEY,
        "gemini-2.5-pro-tts": !!env.GEMINI_API_KEY,
        "cartesia-sonic-3.5": !!env.CARTESIA_API_KEY,
      },
    });
  } catch {
    return json({ enabled: false });
  }
}

function normalizeInputs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ text: String(item?.text || "").trim() }))
    .filter((item) => item.text);
}

function normalizeTtsTestModel(value) {
  const model = String(value || "").trim().toLowerCase();
  return TTS_TEST_MODELS.some((item) => item.id === model) ? model : "";
}

async function generateExternalTts(env, options) {
  switch (options.model) {
    case "fish-s2.1-pro":
      return generateFishTts(env, options);
    case "minimax-speech-2.8-hd":
      return generateMiniMaxTts(env, options);
    case "gemini-2.5-pro-tts":
      return generateGeminiTts(env, options);
    case "cartesia-sonic-3.5":
      return generateCartesiaTts(env, options);
    default:
      throw publicError("Unknown TTS test model.", 400);
  }
}

async function generateFishTts(env, { text, signal }) {
  const apiKey = requiredSecret(env.FISH_API_KEY, "FISH_API_KEY", "Fish Audio");
  const model = String(env.FISH_TTS_MODEL || "s2.1-pro-free").trim();
  const referenceId = String(env.FISH_TTS_VOICE_ID || DEFAULT_FISH_REFERENCE_ID).trim();
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      model,
    },
    body: JSON.stringify({ text, reference_id: referenceId, format: "mp3" }),
    signal,
  });
  if (!response.ok) throw await providerError("Fish Audio", response);
  return {
    buffer: await response.arrayBuffer(),
    mimeType: response.headers.get("Content-Type")?.split(";")[0] || "audio/mpeg",
    filename: "vexa-fish-s2.1-pro.mp3",
  };
}

async function generateMiniMaxTts(env, { text, signal }) {
  const apiKey = requiredSecret(env.MINIMAX_API_KEY, "MINIMAX_API_KEY", "MiniMax");
  const voiceId = String(env.MINIMAX_TTS_VOICE_ID || DEFAULT_MINIMAX_VOICE_ID).trim();
  const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "speech-2.8-hd",
      text,
      stream: false,
      language_boost: "auto",
      output_format: "hex",
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    }),
    signal,
  });
  if (!response.ok) throw await providerError("MiniMax", response);
  const data = await response.json().catch(() => null);
  if (Number(data?.base_resp?.status_code || 0) !== 0) {
    throw publicError("MiniMax: " + String(data?.base_resp?.status_msg || "speech generation failed"), 502);
  }
  const hex = String(data?.data?.audio || "").trim();
  if (!hex) throw publicError("MiniMax did not return audio.", 502);
  return { buffer: hexToArrayBuffer(hex), mimeType: "audio/mpeg", filename: "vexa-minimax-speech-2.8-hd.mp3" };
}

async function generateGeminiTts(env, { text, signal }) {
  const apiKey = requiredSecret(env.GEMINI_API_KEY, "GEMINI_API_KEY", "Gemini");
  const voiceName = String(env.GEMINI_TTS_VOICE || DEFAULT_GEMINI_VOICE).trim();
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent",
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
      signal,
    },
  );
  if (!response.ok) throw await providerError("Gemini", response);
  const data = await response.json().catch(() => null);
  const part = data?.candidates?.[0]?.content?.parts?.find((item) => item?.inlineData?.data)?.inlineData;
  const audioBase64 = String(part?.data || "").replace(/\s/g, "");
  if (!audioBase64) throw publicError("Gemini did not return audio.", 502);
  const raw = base64ToArrayBuffer(audioBase64);
  const mime = String(part?.mimeType || "").toLowerCase();
  if (mime.includes("wav")) return { buffer: raw, mimeType: "audio/wav", filename: "vexa-gemini-2.5-pro-tts.wav" };
  return {
    buffer: pcm16ToWav(raw, sampleRateFromMime(mime) || 24000, 1),
    mimeType: "audio/wav",
    filename: "vexa-gemini-2.5-pro-tts.wav",
  };
}

async function generateCartesiaTts(env, { text, language, signal }) {
  const apiKey = requiredSecret(env.CARTESIA_API_KEY, "CARTESIA_API_KEY", "Cartesia");
  const languageCode = normalizeLanguage(language);
  if (languageCode === "fa") {
    throw publicError("Cartesia Sonic 3.5 does not currently support Persian. Choose another model for Persian testing.", 400);
  }
  const voiceId = String(env.CARTESIA_TTS_VOICE_ID || DEFAULT_CARTESIA_VOICE_ID).trim();
  const payload = {
    model_id: "sonic-3.5",
    transcript: text,
    voice: { mode: "id", id: voiceId },
    output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
  };
  if (CARTESIA_LANGUAGES.has(languageCode)) payload.language = languageCode;

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw await providerError("Cartesia", response);
  return {
    buffer: await response.arrayBuffer(),
    mimeType: response.headers.get("Content-Type")?.split(";")[0] || "audio/mpeg",
    filename: "vexa-cartesia-sonic-3.5.mp3",
  };
}

function requiredSecret(value, name, provider) {
  const secret = String(value || "").trim();
  if (secret) return secret;
  throw publicError(provider + " API key is not configured yet. Add the Cloudflare secret " + name + ".", 503);
}

async function providerError(provider, response) {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(raw);
    detail = String(parsed?.error?.message || parsed?.message || parsed?.base_resp?.status_msg || "").trim();
  } catch {
    detail = String(raw || "").trim().slice(0, 240);
  }
  const suffix = detail ? " · " + detail.slice(0, 180) : "";
  return publicError(provider + " TTS request failed" + suffix, response.status === 429 ? 429 : 502);
}

function normalizeLanguage(value) {
  return String(value || "en").trim().toLowerCase().split(/[-_]/)[0] || "en";
}

function sampleRateFromMime(value) {
  const match = String(value || "").match(/rate=(\d+)/i);
  return match ? Math.max(8000, Math.min(192000, Number(match[1]) || 24000)) : 0;
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

function hexToArrayBuffer(value) {
  const hex = String(value || "").replace(/\s/g, "");
  if (!hex || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw publicError("MiniMax returned invalid audio data.", 502);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes.buffer;
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
  var selectedModel=(function(){try{return localStorage.getItem('vexa-admin-tts-model')||'elevenlabs'}catch(error){return'elevenlabs'}})();
  var enabled=false;
  var models=[];
  var configured={};
  var baseFetch=window.fetch.bind(window);

  function modelMeta(id){return models.find(function(item){return item.id===id})||models[0]||{id:'elevenlabs',label:'ElevenLabs v3',provider:'ElevenLabs'}}
  function saveSelection(){try{localStorage.setItem('vexa-admin-tts-model',selectedModel)}catch(error){}}
  function ensureStyle(){if(document.getElementById('adminTtsModelStyles'))return;var style=document.createElement('style');style.id='adminTtsModelStyles';style.textContent='.admin-tts-model{position:relative;z-index:44;display:none;flex:0 0 auto}.admin-tts-model.ready{display:block}.image-mode .admin-tts-model{display:none!important}.admin-tts-model-toggle{height:36px;max-width:150px;padding:0 9px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.045);color:#fff;display:flex;align-items:center;gap:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.055);font:inherit}.admin-tts-model-toggle:active{transform:scale(.97)}.admin-tts-model-copy{min-width:0;display:flex;flex-direction:column;align-items:flex-start;line-height:1.02}.admin-tts-model-copy small{max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.34);font-size:7px;font-weight:760;letter-spacing:.065em}.admin-tts-model-copy strong{max-width:110px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.91);font-size:9.5px;font-weight:700}.admin-tts-model-toggle svg{width:11px;height:11px;flex:0 0 auto;color:rgba(255,255,255,.42);transition:transform .2s ease}.admin-tts-model.open .admin-tts-model-toggle svg{transform:rotate(180deg)}.admin-tts-model-menu{position:absolute;right:0;top:44px;width:min(280px,88vw);padding:6px;border:1px solid rgba(255,255,255,.095);border-radius:16px;background:rgba(13,13,13,.96);box-shadow:0 22px 52px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(20px) saturate(1.12);-webkit-backdrop-filter:blur(20px) saturate(1.12);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.985);transform-origin:top right;transition:opacity .18s ease,visibility .18s ease,transform .2s cubic-bezier(.2,.9,.2,1)}.admin-tts-model.open .admin-tts-model-menu{opacity:1;visibility:visible;transform:none}.admin-tts-model-option{width:100%;min-height:54px;padding:8px 9px;border:0;border-radius:11px;background:transparent;color:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left}.admin-tts-model-option.active,.admin-tts-model-option:active{background:rgba(255,255,255,.07)}.admin-tts-option-copy strong,.admin-tts-option-copy span{display:block}.admin-tts-option-copy strong{font-size:11px;font-weight:720}.admin-tts-option-copy span{margin-top:3px;color:rgba(255,255,255,.42);font-size:8px}.admin-tts-status{min-width:43px;text-align:center;padding:4px 5px;border-radius:999px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.42);font-size:6.5px;font-weight:800;letter-spacing:.04em}.admin-tts-status.live{background:rgba(255,255,255,.94);color:#080808}.admin-tts-model-option.active .admin-tts-status{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}@media(max-width:390px){.admin-tts-model-toggle{max-width:128px;padding:0 7px}.admin-tts-model-copy small{max-width:86px}.admin-tts-model-copy strong{max-width:90px}.admin-tts-model-menu{right:-42px}}';document.head.appendChild(style)}
  function sync(){var meta=modelMeta(selectedModel);var provider=document.getElementById('adminTtsModelProvider');var label=document.getElementById('adminTtsModelLabel');if(provider)provider.textContent=meta.provider;if(label)label.textContent=meta.label;document.querySelectorAll('[data-admin-tts-model]').forEach(function(button){var active=button.getAttribute('data-admin-tts-model')===selectedModel;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false')})}
  function select(id){if(!models.some(function(item){return item.id===id}))id='elevenlabs';selectedModel=id;saveSelection();sync();var wrap=document.getElementById('adminTtsModel');if(wrap)wrap.classList.remove('open');var toggle=document.getElementById('adminTtsModelToggle');if(toggle)toggle.setAttribute('aria-expanded','false');if(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback&&window.Telegram.WebApp.HapticFeedback.impactOccurred)try{window.Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(error){}}
  function render(){if(!enabled||!models.length)return;ensureStyle();if(!models.some(function(item){return item.id===selectedModel}))selectedModel='elevenlabs';var tools=document.querySelector('.mode-tools');var voice=document.getElementById('voiceWrap');if(!tools||!voice||document.getElementById('adminTtsModel'))return;var wrap=document.createElement('div');wrap.id='adminTtsModel';wrap.className='admin-tts-model ready';wrap.innerHTML='<button id="adminTtsModelToggle" class="admin-tts-model-toggle" type="button" aria-label="Choose TTS model" aria-haspopup="true" aria-expanded="false"><span class="admin-tts-model-copy"><small id="adminTtsModelProvider"></small><strong id="adminTtsModelLabel"></strong></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="admin-tts-model-menu" role="menu">'+models.map(function(item){var ready=!!configured[item.id];return '<button class="admin-tts-model-option" data-admin-tts-model="'+item.id+'" type="button" role="menuitem" aria-pressed="false"><span class="admin-tts-option-copy"><strong>'+item.label+'</strong><span>'+item.provider+'</span></span><span class="admin-tts-status'+(ready?' live':'')+'">'+(ready?'READY':'KEY NEEDED')+'</span></button>'}).join('')+'</div>';tools.insertBefore(wrap,voice);var toggle=document.getElementById('adminTtsModelToggle');toggle.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();var open=!wrap.classList.contains('open');wrap.classList.toggle('open',open);toggle.setAttribute('aria-expanded',open?'true':'false')});wrap.addEventListener('click',function(event){var option=event.target&&event.target.closest?event.target.closest('[data-admin-tts-model]'):null;if(!option)return;event.preventDefault();event.stopPropagation();select(option.getAttribute('data-admin-tts-model')||'elevenlabs')});document.addEventListener('click',function(event){if(!wrap.contains(event.target)){wrap.classList.remove('open');toggle.setAttribute('aria-expanded','false')}});sync()}

  window.fetch=async function(input,init){var path=typeof input==='string'?input:String(input&&input.url||'');if(enabled&&path.indexOf('/mini-app/api/tts')>=0&&path.indexOf('/mini-app/api/tts-model-test-config')<0&&init&&typeof init.body==='string'){try{var body=JSON.parse(init.body);body.ttsModel=selectedModel;var next={};Object.keys(init).forEach(function(key){next[key]=init[key]});next.body=JSON.stringify(body);init=next}catch(error){}}return baseFetch(input,init)};

  (async function(){try{var telegram=window.Telegram&&window.Telegram.WebApp;var initData=telegram&&telegram.initData||'';if(!initData)return;var response=await baseFetch('/mini-app/api/tts-model-test-config',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({initData:initData})});if(!response.ok)return;var data=await response.json();if(!data||data.enabled!==true)return;enabled=true;models=Array.isArray(data.models)?data.models:[];configured=data.configured||{};render()}catch(error){}})();
})();
`;
