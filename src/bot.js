import { textToSpeech } from "./elevenlabs.js";
import { getState, saveState } from "./state.js";
import { answerCallback, editMessage, sendAudio, sendMessage, sendVoice } from "./telegram-actions.js";
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

  if (!state.voice) {
    await sendMessage(env, chatId, "First select a voice.");
    await sendMessage(env, chatId, startText(state), mainKeyboard(state));
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
    if (!state.voice) {
      await sendMessage(env, chatId, "First select a voice.");
      return;
    }
    await makeAndSendAudio(env, chatId, DEMO_TEXT, state, true);
  }
}

async function makeAndSendAudio(env, chatId, text, state, isDemo) {
  const voiceId = VOICES[state.voice];
  const cost = isDemo ? "0" : (text.length * PRICE_PER_CHARACTER_TON).toFixed(5);
  const filename = state.voice + ".mp3";
  const caption = "Voice: " + state.voice + "\nCost: " + cost + " TON";

  await sendMessage(env, chatId, isDemo ? "Generating demo..." : "Generating voice...");

  try {
    const audio = await textToSpeech(env, text, voiceId);
    if (state.output === "Voice") {
      await sendVoice(env, chatId, audio, filename, caption);
    } else {
      await sendAudio(env, chatId, audio, filename, caption);
    }
  } catch (error) {
    await sendMessage(env, chatId, "Error: " + error.message);
  }
}
