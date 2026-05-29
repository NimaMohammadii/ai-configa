import { adminPanelText, isAdmin, trackUser, tryAdminLogin } from "./admin.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { textToSpeech } from "./elevenlabs.js";
import { getState, saveState } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendAudio, sendDocument, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { startText, mainKeyboard } from "./ui.js";
import { VOICES } from "./voices.js";

const DEMO_TEXT = "Hello, this is a free demo voice from Vexa text to speech.";

export async function handleMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const text = message.text ? message.text.trim() : "";

  if (!chatId || !userId || !text) return;

  await trackUser(env, message.from);

  const state = await getState(env, userId);

  if (text === "/start") {
    await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    return;
  }

  if (text.startsWith("/admin")) {
    await handleAdminCommand(env, chatId, userId, text);
    return;
  }

  if (text === "/debug") {
    if (!(await isAdmin(env, userId))) {
      await sendPlainMessage(env, chatId, "Access denied.");
      return;
    }
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

  await trackUser(env, query.from);
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

async function handleAdminCommand(env, chatId, userId, text) {
  const parts = text.split(/\s+/).filter(Boolean);
  const token = parts[1] || "";

  if (token) {
    const loggedIn = await tryAdminLogin(env, userId, token);
    if (!loggedIn) {
      await sendPlainMessage(env, chatId, "Invalid admin token.");
      return;
    }
  }

  if (!(await isAdmin(env, userId))) {
    await sendPlainMessage(env, chatId, "Admin login required. Use: /admin ADMIN_TOKEN");
    return;
  }

  await sendPlainMessage(env, chatId, await adminPanelText(env));
}

function buildDebugText(env, state) {
  return [
    "Debug:",
    "BOT_TOKEN: " + (env.BOT_TOKEN ? "OK" : "MISSING"),
    "ELEVEN_API: " + (env.ELEVEN_API ? "OK" : "MISSING"),
    "ADMIN_TOKEN: " + (env.ADMIN_TOKEN ? "OK" : "MISSING"),
    "DB: " + (env.DB ? "OK" : "MISSING"),
    "voice: " + (state.voice || "none"),
    "output: " + (state.output || "MP3"),
  ].join("\n");
}

async function makeAndSendAudio(env, chatId, text, state, isDemo) {
  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  let statusMessage = null;

  try {
    statusMessage = await sendPlainMessage(env, chatId, isDemo ? "Generating demo..." : "Generating voice...");

    let audio = null;

    if (isDemo) {
      audio = await getDemoAudio(env, voiceName);
      if (!audio) {
        audio = await textToSpeech(env, text, voiceId);
        await saveDemoAudio(env, voiceName, audio);
      }
    } else {
      audio = await textToSpeech(env, text, voiceId);
    }

    await sendCleanAudio(env, chatId, audio);

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
  } catch (error) {
    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await sendPlainMessage(env, chatId, "TTS Error: " + safeError(error));
  }
}

async function sendCleanAudio(env, chatId, audio) {
  try {
    await sendAudio(env, chatId, audio);
  } catch (sendAudioError) {
    await sendDocument(env, chatId, audio);
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 3000);
}
