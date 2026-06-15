import {
  adminBroadcastPromptText,
  adminCancelKeyboard,
  adminCreditPromptText,
  adminBuyersKeyboard,
  adminBuyersText,
  adminMainKeyboard,
  adminMainText,
  adminStatsKeyboard,
  adminStatsText,
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
import { getDemoText } from "./demo-texts.js";
import { textToSpeech } from "./elevenlabs.js";
import { normalizeLang, t } from "./i18n.js";
import { clearPendingPayment, getPendingPayment, setPendingPayment } from "./payments.js";
import { getState, saveState, setMenuMessageId, setUserLanguage } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendAudio, sendAudioFileId, sendDocument, sendDocumentFileId, sendMessage, sendPlainMessage, sendTextDocument } from "./telegram-actions.js";
import { buildTtsHistoryFile, getTtsHistoryExport, getTtsHistoryItemByIndex, getTtsHistoryPage, saveTtsHistory, ttsAudioCaption, ttsHistoryItemKeyboard, ttsHistoryItemText, ttsHistoryKeyboard, ttsHistoryText } from "./tts-history.js";
import { buyCreditsKeyboard, buyCreditsText, languageKeyboard, languageText, mainKeyboard, paymentCancelKeyboard, paymentInstructionText, startText, tomanPackagesKeyboard, tomanPackagesText, TOMAN_PACKAGES } from "./ui.js";
import { VOICES } from "./voices.js";

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
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await handlePaymentScreenshot(env, chatId, userId, state);
    return;
  }

  if (!text) return;

  if (await handleAdminPendingInput(env, chatId, userId, messageId, text)) {
    return;
  }

  if (text === "/start") {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    if (!state.language) {
      await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
      return;
    }
    await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
    return;
  }

  if (text === "/language" || text === "/lang") {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }

  if (text.startsWith("/admin")) {
    await handleAdminCommand(env, chatId, userId, text, messageId, state);
    return;
  }

  if (text === "/debug") {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    if (!(await isAdmin(env, userId))) {
      await replaceMenu(env, chatId, userId, state, t(state.language, "accessDenied"), mainKeyboard(state));
      return;
    }
    await replaceMenu(env, chatId, userId, state, buildDebugText(env, state), mainKeyboard(state));
    return;
  }

  if (!state.language) {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }

  if (text.startsWith("/")) {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
    return;
  }

  await makeAndSendAudio(env, chatId, userId, messageId, text, state, false);
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
  state.menuMessageId = messageId;
  await saveState(env, userId, state);

  if (data === "noop") {
    await answerCallback(env, query.id);
    return;
  }

  if (data.startsWith("lang:")) {
    const lang = normalizeLang(data.slice(5));
    state.language = lang;
    await setUserLanguage(env, userId, lang);
    await answerCallback(env, query.id);
    const fresh = await getState(env, userId);
    await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), mainKeyboard(fresh));
    return;
  }

  if (data === "admin_main") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMainText(env), adminMainKeyboard());
    return;
  }

  if (data.startsWith("admin_users:") || data.startsWith("admin_page:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminUsersText(env, page), await adminUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_buyers:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminBuyersText(env, page), await adminBuyersKeyboard(env, page));
    return;
  }

  if (data === "admin_stats") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminStatsText(env), adminStatsKeyboard());
    return;
  }

  if (data.startsWith("admin_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminUserText(env, targetUserId), adminUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("admin_tts:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const historyPage = Number(parts[2] || 0);
    const backPage = Number(parts[3] || 0);
    const history = await getTtsHistoryPage(env, targetUserId, historyPage);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, ttsHistoryText(history, targetUserId), ttsHistoryKeyboard(history, targetUserId, backPage));
    return;
  }

  if (data.startsWith("admin_tts_download:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const rows = await getTtsHistoryExport(env, targetUserId);
    const content = buildTtsHistoryFile(targetUserId, rows);
    const filename = "tts-history-" + String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt";
    await answerCallback(env, query.id, rows.length ? "Sending text history..." : "Sending empty history file...", false);
    await sendTextDocument(env, chatId, content, filename, "📝 Text history for <code>" + targetUserId + "</code>");
    return;
  }

  if (data.startsWith("ath:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const historyPage = Number(parts[2] || 0);
    const backPage = Number(parts[3] || 0);
    const index = Number(parts[4] || 0);
    const item = await getTtsHistoryItemByIndex(env, targetUserId, historyPage, index);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, ttsHistoryItemText(item), ttsHistoryItemKeyboard(item, targetUserId, historyPage, backPage, index));
    return;
  }

  if (data.startsWith("atf:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const historyPage = Number(parts[2] || 0);
    const index = Number(parts[4] || 0);
    const item = await getTtsHistoryItemByIndex(env, targetUserId, historyPage, index);
    if (!item || !item.file_id) {
      await answerCallback(env, query.id, "Audio file is not stored", true);
      return;
    }
    await answerCallback(env, query.id, "Sending audio file...", false);
    const caption = ttsAudioCaption(item);
    if (item.file_type === "document") {
      await sendDocumentFileId(env, chatId, item.file_id, caption);
    } else {
      await sendAudioFileId(env, chatId, item.file_id, caption);
    }
    return;
  }

  if (data.startsWith("admin_tts_item:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id, "Please reopen TTS History", true);
    return;
  }

  if (data.startsWith("admin_tts_file:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id, "Please reopen TTS History", true);
    return;
  }

  if (data.startsWith("admin_reset_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await resetUser(env, targetUserId);
    await answerCallback(env, query.id, "User reset and deleted", true);
    await editCurrentMenu(env, chatId, userId, messageId, await adminUsersText(env, page), await adminUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_credit_prompt:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "credit", { targetUserId, page, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminCreditPromptText(), adminCancelKeyboard("admin_user:" + targetUserId + ":" + page));
    return;
  }

  if (data.startsWith("admin_msg_prompt:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "message", { targetUserId, page, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminMessagePromptText(), adminCancelKeyboard("admin_user:" + targetUserId + ":" + page));
    return;
  }

  if (data === "admin_broadcast") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "broadcast", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(), adminCancelKeyboard("admin_main"));
    return;
  }

  if (!state.language) {
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, languageText(), languageKeyboard());
    return;
  }

  if (data.startsWith("page:")) {
    await answerCallback(env, query.id);
    state.page = Number(data.split(":")[1] || 0);
    await saveState(env, userId, state);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data.startsWith("voice:")) {
    await answerCallback(env, query.id);
    const voice = data.slice(6);
    if (VOICES[voice]) state.voice = voice;
    await saveState(env, userId, state);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "balance") {
    const balance = await getBalance(env, userId);
    await answerCallback(env, query.id, t(state.language, "balancePopup", { balance }), true);
    return;
  }

  if (data === "buy_credits") {
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, buyCreditsText(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "buy_toman") {
    if (state.language !== "fa") {
      await answerCallback(env, query.id, t(state.language, "comingSoon"), true);
      return;
    }
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, tomanPackagesText(state), tomanPackagesKeyboard(state));
    return;
  }

  if (data.startsWith("toman_package:")) {
    if (state.language !== "fa") {
      await answerCallback(env, query.id, t(state.language, "comingSoon"), true);
      return;
    }
    await answerCallback(env, query.id);
    const packageId = data.slice("toman_package:".length);
    const pack = TOMAN_PACKAGES[packageId];

    if (!pack) {
      await answerCallback(env, query.id, t(state.language, "invalidPackage"), true);
      return;
    }

    await setPendingPayment(env, userId, packageId);
    await editCurrentMenu(env, chatId, userId, messageId, paymentInstructionText(pack, state), paymentCancelKeyboard(state));
    return;
  }

  if (data === "cancel_payment") {
    await answerCallback(env, query.id);
    await clearPendingPayment(env, userId);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "back_main") {
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), mainKeyboard(state));
    return;
  }

  if (data === "buy_stars") {
    await answerCallback(env, query.id, t(state.language, "comingSoon"), true);
    return;
  }

  if (data === "demo") {
    await answerCallback(env, query.id);
    await makeAndSendAudio(env, chatId, userId, null, getDemoText(state.language, state.voice || "Nora"), state, true);
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
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminCreditPromptText() + "\n\nInvalid amount. Use +2500 or -700", adminCancelKeyboard("admin_user:" + action.target_user_id + ":" + (action.page || 0)));
      return true;
    }

    amount > 0
      ? await addCredits(env, action.target_user_id, amount)
      : await removeCredits(env, action.target_user_id, Math.abs(amount));

    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
    return true;
  }

  if (action.action === "message") {
    await sendPlainMessage(env, action.target_user_id, text).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
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
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminMainText(env)) + "\n\nBroadcast sent to " + sent + " users", adminMainKeyboard());
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

async function denyCallback(env, callbackQueryId, state = {}) {
  await answerCallback(env, callbackQueryId, t(state.language, "accessDenied"), true);
}

async function handlePaymentScreenshot(env, chatId, userId, state) {
  const pending = await getPendingPayment(env, userId);

  if (!pending || !TOMAN_PACKAGES[pending.package_id]) {
    await upsertMenu(env, chatId, userId, state, t(state.language, "screenshotNoPackage"), mainKeyboard(state));
    return;
  }

  await upsertMenu(
    env,
    chatId,
    userId,
    state,
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
}

async function handleAdminCommand(env, chatId, userId, text, messageId, state) {
  const parts = text.split(/\s+/).filter(Boolean);
  const token = parts[1] || "";

  await deleteMessage(env, chatId, messageId).catch(() => null);

  if (token) {
    const loggedIn = await tryAdminLogin(env, userId, token);
    if (!loggedIn) {
      await upsertMenu(env, chatId, userId, state, "Invalid admin token", adminMainKeyboard());
      return;
    }
  }

  if (!(await isAdmin(env, userId))) {
    await upsertMenu(env, chatId, userId, state, "Admin login required. Use: /admin ADMIN_TOKEN", adminMainKeyboard());
    return;
  }

  await clearAdminAction(env, userId);
  await upsertMenu(env, chatId, userId, state, await adminMainText(env), adminMainKeyboard());
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

async function makeAndSendAudio(env, chatId, userId, inputMessageId, text, state, isDemo) {
  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const lang = normalizeLang(state.language || "en");
  const cost = countCredits(text);
  let statusMessage = null;

  if (inputMessageId) {
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
  }

  if (!isDemo) {
    const balance = await getBalance(env, userId);
    if (balance < cost) {
      await upsertMenu(env, chatId, userId, state, insufficientCreditsText(state, cost, balance), mainKeyboard(state));
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
      audio = await getDemoAudio(env, voiceName, lang, text);
      if (!audio) {
        audio = await textToSpeech(env, text, voiceId);
        await saveDemoAudio(env, voiceName, lang, audio, text);
      }
    } else {
      audio = await textToSpeech(env, text, voiceId);
    }

    const sentAudioMessage = await sendCleanAudio(env, chatId, audio);

    if (!isDemo) {
      await saveTtsHistory(env, userId, text, voiceName, lang, cost, sentAudioMessage).catch((error) => {
        console.error("save tts history failed", error && error.message ? error.message : error);
      });
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
    await upsertMenu(env, chatId, userId, state, t(state.language, "ttsError") + ": " + safeError(error) + "\n\n" + startText(state), mainKeyboard(state));
  }
}

export async function sendFreshMainMenu(env, chatId, userId) {
  const state = await getState(env, userId);
  if (!state.language) {
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }
  await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
}

async function replaceMenu(env, chatId, userId, state, text, keyboard) {
  if (state?.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
  }

  const menu = await sendMessage(env, chatId, text, keyboard);
  await setMenuMessageId(env, userId, menu?.message_id || null);
  return menu?.message_id || null;
}

async function upsertMenu(env, chatId, userId, state, text, keyboard) {
  const targetMessageId = state?.menuMessageId || null;
  if (targetMessageId) {
    try {
      await editMessage(env, chatId, targetMessageId, text, keyboard);
      await setMenuMessageId(env, userId, targetMessageId);
      return targetMessageId;
    } catch {}
  }

  const menu = await sendMessage(env, chatId, text, keyboard);
  await setMenuMessageId(env, userId, menu?.message_id || null);
  return menu?.message_id || null;
}

async function editCurrentMenu(env, chatId, userId, messageId, text, keyboard) {
  try {
    await editMessage(env, chatId, messageId, text, keyboard);
    await setMenuMessageId(env, userId, messageId);
    return messageId;
  } catch {
    const menu = await sendMessage(env, chatId, text, keyboard);
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return menu?.message_id || null;
  }
}

function localizedBuyCreditsKeyboard(state = {}) {
  const lang = state.language || "en";
  if (lang === "fa") return buyCreditsKeyboard(state);

  return {
    inline_keyboard: [
      [{ text: t(lang, "telegramStars"), callback_data: "buy_stars" }],
      [{ text: t(lang, "back"), callback_data: "back_main" }],
    ],
  };
}

function insufficientCreditsText(state, cost, balance) {
  const lang = state.language || "en";
  return [
    t(lang, "notEnough", { needed: cost, balance }),
    "",
    t(lang, "sendText"),
    t(lang, "creditRule"),
  ].join("\n");
}

function countCredits(text) {
  return Array.from(String(text || "")).length;
}

async function sendCleanAudio(env, chatId, audio) {
  try {
    return await sendAudio(env, chatId, audio);
  } catch (sendAudioError) {
    return await sendDocument(env, chatId, audio);
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 3000);
}
