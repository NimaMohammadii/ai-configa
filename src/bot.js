import { adminPanelText, adminUserKeyboard, adminUsersKeyboard, adminUserText, isAdmin, trackUser, tryAdminLogin } from "./admin.js";
import { addCredits, ensureBalanceRow, getBalance, removeCredits } from "./credits.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { textToSpeech } from "./elevenlabs.js";
import { clearPendingPayment, getPendingPayment, setPendingPayment } from "./payments.js";
import { getState, saveState } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendAudio, sendDocument, sendHtmlMessage, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { buyCreditsKeyboard, buyCreditsText, mainKeyboard, paymentCancelKeyboard, paymentInstructionText, startText, tomanPackagesKeyboard, tomanPackagesText, TOMAN_PACKAGES } from "./ui.js";
import { VOICES } from "./voices.js";

const DEMO_TEXT = "Hello, this is a free demo voice from Vexa text to speech.";

export async function handleMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const messageId = message.message_id;
  const text = message.text ? message.text.trim() : "";
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;

  if (!chatId || !userId) return;

  await trackUser(env, message.from);
  await ensureBalanceRow(env, userId);

  const state = await getState(env, userId);

  if (hasPhoto) {
    await handlePaymentScreenshot(env, chatId, userId, state);
    return;
  }

  if (!text) return;

  if (text === "/start") {
    await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    return;
  }

  if (text.startsWith("/admin")) {
    await handleAdminCommand(env, chatId, userId, text, messageId);
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
  await ensureBalanceRow(env, userId);

  const state = await getState(env, userId);

  if (data === "noop") {
    await answerCallback(env, query.id);
    return;
  }

  if (data.startsWith("admin_page:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, await adminPanelText(env, page), await adminUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, await adminUserText(env, targetUserId), adminUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("admin_credit:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id);

    const parts = data.split(":");
    const action = parts[1];
    const targetUserId = parts[2];
    const amount = Number(parts[3] || 0);
    const page = Number(parts[4] || 0);

    if (!targetUserId || !amount || !["add", "remove"].includes(action)) {
      await answerCallback(env, query.id, "Invalid action", true);
      return;
    }

    const newBalance = action === "add"
      ? await addCredits(env, targetUserId, amount)
      : await removeCredits(env, targetUserId, amount);

    await answerCallback(env, query.id, `Done. New balance: ${newBalance} credits`, true);
    await editMessage(env, chatId, messageId, await adminUserText(env, targetUserId), adminUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("page:")) {
    await answerCallback(env, query.id);
    state.page = Number(data.split(":")[1] || 0);
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("voice:")) {
    await answerCallback(env, query.id);
    const voice = data.slice(6);
    if (VOICES[voice]) state.voice = voice;
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("output:")) {
    await answerCallback(env, query.id);
    const output = data.slice(7);
    state.output = output === "Voice" ? "Voice" : "MP3";
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "balance") {
    const balance = await getBalance(env, userId);
    await answerCallback(env, query.id, "Your balance:\n\n" + balance + " credits", true);
    return;
  }

  if (data === "buy_credits") {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, buyCreditsText(), buyCreditsKeyboard());
    return;
  }

  if (data === "buy_toman") {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, tomanPackagesText(), tomanPackagesKeyboard());
    return;
  }

  if (data.startsWith("toman_package:")) {
    await answerCallback(env, query.id);
    const packageId = data.slice("toman_package:".length);
    const pack = TOMAN_PACKAGES[packageId];

    if (!pack) {
      await answerCallback(env, query.id, "Invalid package", true);
      return;
    }

    await setPendingPayment(env, userId, packageId);
    await sendHtmlMessage(env, chatId, paymentInstructionText(pack), paymentCancelKeyboard());
    return;
  }

  if (data === "cancel_payment") {
    await answerCallback(env, query.id);
    await clearPendingPayment(env, userId);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "back_main") {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "buy_stars") {
    await answerCallback(env, query.id, "Coming soon", true);
    return;
  }

  if (data === "demo") {
    await answerCallback(env, query.id);
    await makeAndSendAudio(env, chatId, DEMO_TEXT, state, true);
  }
}

async function denyCallback(env, callbackQueryId) {
  await answerCallback(env, callbackQueryId, "Access denied.", true);
}

async function handlePaymentScreenshot(env, chatId, userId, state) {
  const pending = await getPendingPayment(env, userId);

  if (!pending || !TOMAN_PACKAGES[pending.package_id]) {
    await sendPlainMessage(env, chatId, "Screenshot received. If this is for a credit purchase, please choose a package first.");
    return;
  }

  const pack = TOMAN_PACKAGES[pending.package_id];
  await sendHtmlMessage(
    env,
    chatId,
    [
      "✅ <b>Payment screenshot received!</b>",
      "",
      "Your receipt is now waiting for admin verification.",
      "After approval, your credits will be added to your balance.",
      "",
      "You can keep using the bot or choose another option below."
    ].join("\n"),
    mainKeyboard(state)
  );

  await sendHtmlMessage(env, chatId, paymentInstructionText(pack), paymentCancelKeyboard());
}

async function handleAdminCommand(env, chatId, userId, text, messageId) {
  const parts = text.split(/\s+/).filter(Boolean);
  const token = parts[1] || "";

  if (token) {
    const loggedIn = await tryAdminLogin(env, userId, token);
    await deleteMessage(env, chatId, messageId).catch(() => null);

    if (!loggedIn) {
      const msg = await sendPlainMessage(env, chatId, "Invalid admin token.");
      if (msg?.message_id) await deleteMessage(env, chatId, msg.message_id).catch(() => null);
      return;
    }
  }

  if (!(await isAdmin(env, userId))) {
    const msg = await sendPlainMessage(env, chatId, "Admin login required. Use: /admin ADMIN_TOKEN");
    if (msg?.message_id) await deleteMessage(env, chatId, msg.message_id).catch(() => null);
    return;
  }

  await sendMessage(env, chatId, await adminPanelText(env, 0), await adminUsersKeyboard(env, 0));
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
