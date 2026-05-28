import { textToSpeech } from "./elevenlabs.js";
import { getState, saveState } from "./state.js";
import { answerCallback, editMessage, sendAudio, sendDocument, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { startText, mainKeyboard, PRICE_PER_CHARACTER_TON } from "./ui.js";
import { VOICES } from "./voices.js";

const DEMO_TEXT = "Hello, this is a free demo voice from Vexa text to speech.";

export async function handleMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const text = message.text ? message.text.trim() : "";

  if (!chatId || !userId || !text) return;

  const state = await getState(env, userId);

  if (text === "/start") {
    await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    return;
  }

  if (text === "/debug") {
    await sendPlainMessage(env, chatId, buildDebugText(env, state));
    return;
  }

  await makeAndSendAudio(env, chatId, text, state, false);
}

export async function handleCallback(query, env) {
  const data = query.data || "";
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;

  if (!userId || !chatId || !messageId) return;

  await answerCallback(env, query.id);

  const state = await getState(env, userId);

  if (data === "noop") return;

  if (data.startsWith("page:")) {
    state.page = Number(data.split(":")[1] || 0);
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("voice:")) {
    const voice = data.slice(6);
    if (VOICES[voice]) state.voice = voice;
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("output:")) {
    const output = data.slice(7);
    state.output = output === "Voice" ? "Voice" : "MP3";
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "demo") {
    await makeAndSendAudio(env, chatId, DEMO_TEXT, state, true);
  }
}

function buildDebugText(env, state) {
  return [
    "Debug:",
    "BOT_TOKEN: " + (env.BOT_TOKEN ? "OK" : "MISSING"),
    "ELEVEN_API: " + (env.ELEVEN_API ? "OK" : "MISSING"),
    "USER_STATE: " + (env.USER_STATE ? "OK" : "not connected"),
    "voice: " + (state.voice || "none"),
    "output: " + (state.output || "MP3"),
  ].join("\n");
}

async function makeAndSendAudio(env, chatId, text, state, isDemo) {
  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const cost = isDemo ? "0" : (text.length * PRICE_PER_CHARACTER_TON).toFixed(5);
  const filename = voiceName + ".mp3";
  const caption = "Voice: " + voiceName + "\nCost: " + cost + " TON";

  try {
    await sendPlainMessage(env, chatId, isDemo ? "Generating demo..." : "Generating voice...");

    const audio = await textToSpeech(env, text, voiceId);
    await sendPlainMessage(env, chatId, "Audio created. Size: " + audio.byteLength + " bytes. Sending...");

    try {
      await sendAudio(env, chatId, audio, filename, caption);
    } catch (sendAudioError) {
      await sendPlainMessage(env, chatId, "sendAudio failed, trying document: " + safeError(sendAudioError));
      await sendDocument(env, chatId, audio, filename, caption);
    }
  } catch (error) {
    await sendPlainMessage(env, chatId, "TTS Error: " + safeError(error));
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 3000);
}
