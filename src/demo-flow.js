import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { getDemoText } from "./demo-texts.js";
import { textToSpeech } from "./elevenlabs.js";
import { trackUser } from "./admin.js";
import { normalizeLang, t } from "./i18n.js";
import { getState, saveState, setMenuMessageId } from "./state.js";
import { answerCallback, deleteMessage, sendDemoAudio, sendDemoDocument, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { languageKeyboard, languageText, userMainKeyboard, startText } from "./ui.js";
import { VOICES } from "./voices.js";

export function isDemoCallback(data) {
  return data === "demo";
}

export async function handleDemoCallback(query, env) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;

  if (!userId || !chatId || !messageId) return;

  await trackUser(env, query.from);
  const state = await getState(env, userId);
  state.menuMessageId = messageId;
  await saveState(env, userId, state);
  await answerCallback(env, query.id);

  if (!state.language) {
    await editAsNewMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }

  await makeAndSendDemo(env, chatId, userId, state);
}

async function makeAndSendDemo(env, chatId, userId, state) {
  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const lang = normalizeLang(state.language || "en");
  const text = getDemoText(lang, voiceName);
  let statusMessage = null;

  if (state.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
    state.menuMessageId = null;
    await saveState(env, userId, state);
  }

  try {
    statusMessage = await sendPlainMessage(env, chatId, t(lang, "generatingDemo"));

    let audio = await getDemoAudio(env, voiceName, lang, text);
    if (!audio) {
      audio = await textToSpeech(env, text, voiceId, lang);
      await saveDemoAudio(env, voiceName, lang, audio, text);
    }

    await sendCleanDemoAudio(env, chatId, audio);

    if (statusMessage?.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }

    await sendFreshMainMenu(env, chatId, userId);
  } catch (error) {
    if (statusMessage?.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }

    await sendMessage(env, chatId, t(lang, "ttsError") + ": " + safeError(error) + "\n\n" + startText(state), await userMainKeyboard(env, userId, state));
  }
}

async function sendFreshMainMenu(env, chatId, userId) {
  const state = await getState(env, userId);
  if (!state.language) {
    const menu = await sendMessage(env, chatId, languageText(), languageKeyboard());
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return;
  }

  const menu = await sendMessage(env, chatId, startText(state), await userMainKeyboard(env, userId, state));
  await setMenuMessageId(env, userId, menu?.message_id || null);
}

async function editAsNewMenu(env, chatId, userId, state, text, keyboard) {
  if (state.menuMessageId) {
    try {
      await deleteMessage(env, chatId, state.menuMessageId);
    } catch {}
  }

  const menu = await sendMessage(env, chatId, text, keyboard);
  await setMenuMessageId(env, userId, menu?.message_id || null);
}

async function sendCleanDemoAudio(env, chatId, audio) {
  try {
    await sendDemoAudio(env, chatId, audio);
  } catch {
    await sendDemoDocument(env, chatId, audio);
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 3000);
}
