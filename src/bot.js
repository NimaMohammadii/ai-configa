import {
  adminBroadcastPromptText,
  adminCancelKeyboard,
  adminCreditPromptText,
  adminMainKeyboard,
  adminMainText,
  adminMessagePromptText,
  adminUserKeyboard,
  adminUsersKeyboard,
  adminUsersText,
  adminUserText,
  clearAdminAction,
  getAdminAction,
  getAllUserIds,
  isAdmin,
  resetUser,
  setAdminAction,
  trackUser,
  tryAdminLogin,
} from "./admin.js";
import { addCredits, ensureBalanceRow, getBalance, removeCredits, spendCredits } from "./credits.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { textToSpeech } from "./elevenlabs.js";
import { normalizeLang, t } from "./i18n.js";
import { clearPendingPayment, getPendingPayment, setPendingPayment } from "./payments.js";
import { getState, saveState, setMenuMessageId, setUserLanguage } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendAudio, sendDocument, sendHtmlMessage, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { buyCreditsKeyboard, buyCreditsText, languageKeyboard, languageText, mainKeyboard, paymentCancelKeyboard, paymentInstructionText, startText, tomanPackagesKeyboard, tomanPackagesText, TOMAN_PACKAGES } from "./ui.js";
import { VOICES } from "./voices.js";

const DEMO_TEXT = "Hello, this is a free demo voice from Vexa text to speech";

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

  if (await handleAdminPendingInput(env, chatId, userId, messageId, text)) {
    return;
  }

  if (text === "/start") {
    if (!state.language) {
      const menu = await sendMessage(env, chatId, languageText(), languageKeyboard());
      await setMenuMessageId(env, userId, menu?.message_id || null);
      return;
    }
    const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return;
  }

  if (text === "/language" || text === "/lang") {
    if (state.menuMessageId) {
      await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
    }
    const menu = await sendMessage(env, chatId, languageText(), languageKeyboard());
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return;
  }

  if (text.startsWith("/admin")) {
    await handleAdminCommand(env, chatId, userId, text, messageId);
    return;
  }

  if (text === "/debug") {
    if (!(await isAdmin(env, userId))) {
      await sendPlainMessage(env, chatId, t(state.language, "accessDenied"));
      return;
    }
    await sendPlainMessage(env, chatId, buildDebugText(env, state));
    return;
  }

  if (!state.language) {
    const menu = await sendMessage(env, chatId, languageText(), languageKeyboard());
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return;
  }

  await makeAndSendAudio(env, chatId, userId, text, state, false);
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

  if (data.startsWith("lang:")) {
    const lang = normalizeLang(data.slice(5));
    state.language = lang;
    state.menuMessageId = messageId;
    await setUserLanguage(env, userId, lang);
    await answerCallback(env, query.id);
    const fresh = await getState(env, userId);
    await editMessage(env, chatId, messageId, startText(fresh), mainKeyboard(fresh));
    return;
  }

  if (data === "admin_main") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, adminMainText(), adminMainKeyboard());
    return;
  }

  if (data.startsWith("admin_users:") || data.startsWith("admin_page:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, await adminUsersText(env, page), await adminUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, await adminUserText(env, targetUserId), adminUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("admin_reset_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await resetUser(env, targetUserId);
    await answerCallback(env, query.id, "User reset and deleted", true);
    await editMessage(env, chatId, messageId, await adminUsersText(env, page), await adminUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_credit_prompt:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "credit", { targetUserId, page, chatId, messageId });
    await editMessage(env, chatId, messageId, adminCreditPromptText(), adminCancelKeyboard("admin_user:" + targetUserId + ":" + page));
    return;
  }

  if (data.startsWith("admin_msg_prompt:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "message", { targetUserId, page, chatId, messageId });
    await editMessage(env, chatId, messageId, adminMessagePromptText(), adminCancelKeyboard("admin_user:" + targetUserId + ":" + page));
    return;
  }

  if (data === "admin_broadcast") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "broadcast", { chatId, messageId });
    await editMessage(env, chatId, messageId, adminBroadcastPromptText(), adminCancelKeyboard("admin_main"));
    return;
  }

  if (!state.language) {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, languageText(), languageKeyboard());
    return;
  }

  if (data.startsWith("page:")) {
    await answerCallback(env, query.id);
    state.page = Number(data.split(":")[1] || 0);
    state.menuMessageId = messageId;
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("voice:")) {
    await answerCallback(env, query.id);
    const voice = data.slice(6);
    if (VOICES[voice]) state.voice = voice;
    state.menuMessageId = messageId;
    await saveState(env, userId, state);
    await editMessage(env, chatId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "balance") {
    const balance = await getBalance(env, userId);
    await answerCallback(env, query.id, t(state.language, "balancePopup", { balance }), true);
    return;
  }

  if (data === "buy_credits") {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, buyCreditsText(state), buyCreditsKeyboard(state));
    return;
  }

  if (data === "buy_toman") {
    await answerCallback(env, query.id);
    await editMessage(env, chatId, messageId, tomanPackagesText(state), tomanPackagesKeyboard(state));
    return;
  }

  if (data.startsWith("toman_package:")) {
    await answerCallback(env, query.id);
    const packageId = data.slice("toman_package:".length);
    const pack = TOMAN_PACKAGES[packageId];

    if (!pack) {
      await answerCallback(env, query.id, t(state.language, "invalidPackage"), true);
      return;
    }

    await setPendingPayment(env, userId, packageId);
    await sendHtmlMessage(env, chatId, paymentInstructionText(pack, state), paymentCancelKeyboard(state));
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
    await answerCallback(env, query.id, t(state.language, "comingSoon"), true);
    return;
  }

  if (data === "demo") {
    await answerCallback(env, query.id);
    await makeAndSendAudio(env, chatId, userId, DEMO_TEXT, state, true);
  }
}

async function handleAdminPendingInput(env, chatId, adminId, inputMessageId, text) {
  if (!(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  if (!action) return false;

  await deleteMessage(env, chatId, inputMessageId).catch(() => null);

  if (action.action === "credit") {
    const amount = parseCreditAmount(text);
    if (!amount) {
      await answerAdminAction(env, chatId, "Invalid amount. Use +2500 or -700");
      return true;
    }

    const newBalance = amount > 0
      ? await addCredits(env, action.target_user_id, amount)
      : await removeCredits(env, action.target_user_id, Math.abs(amount));

    await clearAdminAction(env, adminId);
    await editMessage(env, action.chat_id || chatId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
    const notice = await sendPlainMessage(env, chatId, "Done. New balance: " + newBalance + " credits");
    if (notice?.message_id) await deleteMessage(env, chatId, notice.message_id).catch(() => null);
    return true;
  }

  if (action.action === "message") {
    await sendPlainMessage(env, action.target_user_id, text).catch(() => null);
    await clearAdminAction(env, adminId);
    await editMessage(env, action.chat_id || chatId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
    const notice = await sendPlainMessage(env, chatId, "Message sent");
    if (notice?.message_id) await deleteMessage(env, chatId, notice.message_id).catch(() => null);
    return true;
  }

  if (action.action === "broadcast") {
    const userIds = await getAllUserIds(env);
    let sent = 0;

    for (const id of userIds) {
      if (String(id) === String(adminId)) continue;
      try {
        await sendPlainMessage(env, id, text);
        sent++;
      } catch {}
    }

    await clearAdminAction(env, adminId);
    await editMessage(env, action.chat_id || chatId, Number(action.message_id), adminMainText(), adminMainKeyboard());
    const notice = await sendPlainMessage(env, chatId, "Broadcast sent to " + sent + " users");
    if (notice?.message_id) await deleteMessage(env, chatId, notice.message_id).catch(() => null);
    return true;
  }

  await clearAdminAction(env, adminId);
  return true;
}

function parseCreditAmount(text) {
  const match = String(text).trim().match(/^([+-])(\d+)$/);
  if (!match) return null;

  const value = Number(match[2]);
  if (!Number.isFinite(value) || value <= 0) return null;

  return match[1] === "+" ? value : -value;
}

async function answerAdminAction(env, chatId, text) {
  const msg = await sendPlainMessage(env, chatId, text);
  if (msg?.message_id) await deleteMessage(env, chatId, msg.message_id).catch(() => null);
}

async function denyCallback(env, callbackQueryId, state = {}) {
  await answerCallback(env, callbackQueryId, t(state.language, "accessDenied"), true);
}

async function handlePaymentScreenshot(env, chatId, userId, state) {
  const pending = await getPendingPayment(env, userId);

  if (!pending || !TOMAN_PACKAGES[pending.package_id]) {
    await sendPlainMessage(env, chatId, t(state.language, "screenshotNoPackage"));
    return;
  }

  const pack = TOMAN_PACKAGES[pending.package_id];
  await sendHtmlMessage(
    env,
    chatId,
    [
      t(state.language, "screenshotReceived"),
      "",
      t(state.language, "receiptWaiting"),
      t(state.language, "creditsAfterApproval"),
      "",
      t(state.language, "keepUsing")
    ].join("\n"),
    mainKeyboard(state)
  );

  await sendHtmlMessage(env, chatId, paymentInstructionText(pack, state), paymentCancelKeyboard(state));
}

async function handleAdminCommand(env, chatId, userId, text, messageId) {
  const parts = text.split(/\s+/).filter(Boolean);
  const token = parts[1] || "";

  if (token) {
    const loggedIn = await tryAdminLogin(env, userId, token);
    await deleteMessage(env, chatId, messageId).catch(() => null);

    if (!loggedIn) {
      const msg = await sendPlainMessage(env, chatId, "Invalid admin token");
      if (msg?.message_id) await deleteMessage(env, chatId, msg.message_id).catch(() => null);
      return;
    }
  }

  if (!(await isAdmin(env, userId))) {
    const msg = await sendPlainMessage(env, chatId, "Admin login required. Use: /admin ADMIN_TOKEN");
    if (msg?.message_id) await deleteMessage(env, chatId, msg.message_id).catch(() => null);
    return;
  }

  await clearAdminAction(env, userId);
  await sendMessage(env, chatId, adminMainText(), adminMainKeyboard());
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
    "language: " + (state.language || "none"),
    "menuMessageId: " + (state.menuMessageId || "none"),
  ].join("\n");
}

async function makeAndSendAudio(env, chatId, userId, text, state, isDemo) {
  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const cost = countCredits(text);
  let statusMessage = null;

  if (!isDemo) {
    const balance = await getBalance(env, userId);
    if (balance < cost) {
      await sendPlainMessage(env, chatId, t(state.language, "notEnough", { needed: cost, balance }));
      return;
    }
  }

  if (state.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
    state.menuMessageId = null;
    await saveState(env, userId, state);
  }

  try {
    statusMessage = await sendPlainMessage(env, chatId, isDemo ? t(state.language, "generatingDemo") : t(state.language, "generatingVoice"));

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

    if (!isDemo) {
      await spendCredits(env, userId, cost);
    }

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }

    await sendFreshMainMenu(env, chatId, userId);
  } catch (error) {
    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await sendPlainMessage(env, chatId, t(state.language, "ttsError") + ": " + safeError(error));
    await sendFreshMainMenu(env, chatId, userId);
  }
}

async function sendFreshMainMenu(env, chatId, userId) {
  const state = await getState(env, userId);
  if (!state.language) {
    const menu = await sendMessage(env, chatId, languageText(), languageKeyboard());
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return;
  }
  if (state.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
  }
  const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
  await setMenuMessageId(env, userId, menu?.message_id || null);
}

function countCredits(text) {
  return Array.from(String(text || "")).length;
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
