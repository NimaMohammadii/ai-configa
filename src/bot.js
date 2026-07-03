import {
  adminBroadcastPromptText,
  adminCancelKeyboard,
  adminCreditPromptText,
  adminDailyRewardKeyboard,
  adminDailyRewardPromptText,
  adminDailyRewardText,
  adminBuyersKeyboard,
  adminBuyersText,
  adminMainKeyboard,
  adminMainText,
  adminInitialStartKeyboard,
  adminInitialStartPromptText,
  adminInitialStartText,
  adminLanguageSettingsKeyboard,
  adminLanguageSettingsText,
  adminStatsKeyboard,
  adminStatsText,
  adminWelcomeAudioKeyboard,
  adminWelcomeAudioPromptText,
  adminWelcomeAudioText,
  adminOnlineKeyboard,
  adminOnlineText,
  adminMessagePromptText,
  adminUserKeyboard,
  adminUsersKeyboard,
  adminUsersText,
  adminUserText,
  clearAdminAction,
  deleteWelcomeAudio,
  getAdminAction,
  getAllUserIds,
  isAdmin,
  resetUser,
  resolveStartLanguage,
  setAdminAction,
  setLanguageSetting,
  setWelcomeAudio,
  getLanguageSettings,
  getWelcomeAudio,
  hasTrackedUser,
  trackUser,
  tryAdminLogin,
} from "./admin.js";
import { addCredits, ensureBalanceRow, getBalance, removeCredits, spendCredits } from "./credits.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { claimDailyReward, dailyRewardMessage, setDailyRewardCredits } from "./daily-reward.js";
import { grantInitialStartBonusOnce, initialStartBonusText, setInitialStartCredits } from "./start-bonus.js";
import { getDemoText } from "./demo-texts.js";
import { textToSpeech } from "./elevenlabs.js";
import { normalizeLang, t } from "./i18n.js";
import { faJoinKeyboard, faJoinText, grantFaJoinBonusOnce, isFaChannelMember } from "./mandatory-channel.js";
import { clearPendingPayment, getPendingPayment, setPendingPayment } from "./payments.js";
import { getState, saveState, setMenuMessageId, setUserLanguage } from "./state.js";
import { answerCallback, copyMessage, deleteMessage, editMessage, sendAudio, sendAudioFileId, sendDocument, sendDocumentFileId, sendMessage, sendPlainMessage, sendVoiceFileId, sendTextDocument } from "./telegram-actions.js";
import { buildTtsHistoryFile, getTtsHistoryExport, getTtsHistoryItemByIndex, getTtsHistoryPage, saveTtsHistory, ttsAudioCaption, ttsHistoryItemKeyboard, ttsHistoryItemText, ttsHistoryKeyboard, ttsHistoryText } from "./tts-history.js";
import { buyCreditsKeyboard, buyCreditsText, createCustomTomanPackage, customTomanConfirmKeyboard, customTomanInstructionText, languageKeyboard, languageText, mainKeyboard, paymentCancelKeyboard, paymentInstructionText, startText, tomanPackagesKeyboard, tomanPackagesText, TOMAN_MIN_PURCHASE_AMOUNT, TOMAN_PACKAGES } from "./ui.js";
import { VOICES } from "./voices.js";

export async function handleMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const messageId = message.message_id;
  const text = message.text ? message.text.trim() : "";
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  const audioAttachment = getAudioAttachment(message);

  if (!chatId || !userId) return;

  const isFirstStart = text === "/start" && !(await hasTrackedUser(env, userId));

  await trackUser(env, message.from);
  await ensureBalanceRow(env, userId);

  const state = await getState(env, userId);

  if (audioAttachment && await handleAdminAudioInput(env, chatId, userId, messageId, audioAttachment)) {
    return;
  }

  if (hasPhoto && await requireFaMembership(env, chatId, userId, messageId, state, false)) {
    return;
  }

  if (hasPhoto) {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await handlePaymentScreenshot(env, chatId, userId, state);
    return;
  }

  if (!text) return;

  if (await handleAdminPendingInput(env, chatId, userId, messageId, text)) {
    return;
  }

  if (await handleTomanCreditInput(env, chatId, userId, messageId, text, state)) {
    return;
  }

  if (text === "/start") {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    const startLanguage = await resolveStartLanguage(env, state.language);
    if (!startLanguage) {
      await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
      return;
    }
    if (startLanguage !== state.language) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
    }
    await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
    await sendInitialStartBonusOnFirstStart(env, chatId, userId, isFirstStart, state.language);
    await sendWelcomeAudioOnFirstStart(env, chatId, isFirstStart, state.language);
    return;
  }

  if (text === "/language" || text === "/lang") {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    const settings = await getLanguageSettings(env);
    if (!settings.languageCommandEnabled) {
      const startLanguage = await resolveStartLanguage(env, state.language);
      if (startLanguage && startLanguage !== state.language) {
        state.language = startLanguage;
        await setUserLanguage(env, userId, startLanguage);
      }
      await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
      return;
    }
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
    const startLanguage = await resolveStartLanguage(env, state.language);
    await deleteMessage(env, chatId, messageId).catch(() => null);
    if (startLanguage) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
      await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));
      return;
    }
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }

  if (await requireFaMembership(env, chatId, userId, messageId, state, false)) {
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
    const shouldSendWelcomeAudio = !state.language;
    state.language = lang;
    await setUserLanguage(env, userId, lang);
    await answerCallback(env, query.id);
    const fresh = await getState(env, userId);
    if (await requireFaMembership(env, chatId, userId, null, fresh, false, null, messageId)) {
      return;
    }
    await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), mainKeyboard(fresh));
    await sendInitialStartBonusOnFirstStart(env, chatId, userId, shouldSendWelcomeAudio, fresh.language);
    await sendWelcomeAudioOnFirstStart(env, chatId, shouldSendWelcomeAudio, fresh.language);
    return;
  }

  if (data === "check_fa_join") {
    const member = await isFaChannelMember(env, userId);
    if (!member) {
      await answerCallback(env, query.id, "هنوز عضو کانال نیستی", true);
      await editCurrentMenu(env, chatId, userId, messageId, faJoinText(), faJoinKeyboard());
      return;
    }
    await grantFaJoinBonusOnce(env, userId);
    const fresh = await getState(env, userId);
    await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), mainKeyboard(fresh));
    return;
  }

  if (await requireFaMembership(env, chatId, userId, null, state, true, query.id, messageId)) {
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

  if (data.startsWith("admin_online:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminOnlineText(env, page), await adminOnlineKeyboard(env, page));
    return;
  }

  if (data === "admin_stats") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminStatsText(env), adminStatsKeyboard());
    return;
  }

  if (data === "admin_welcome_audio") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminWelcomeAudioText(env), adminWelcomeAudioKeyboard());
    return;
  }

  if (data.startsWith("admin_welcome_audio_upload:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const language = normalizeLang(data.slice("admin_welcome_audio_upload:".length));
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "welcome_audio", { targetUserId: language, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminWelcomeAudioPromptText(language), adminCancelKeyboard("admin_welcome_audio"));
    return;
  }

  if (data.startsWith("admin_welcome_audio_delete:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const language = normalizeLang(data.slice("admin_welcome_audio_delete:".length));
    await deleteWelcomeAudio(env, language);
    await answerCallback(env, query.id, "First-start audio deleted for " + language, false);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminWelcomeAudioText(env)) + "\n\n🗑 Deleted for " + language + ".", adminWelcomeAudioKeyboard());
    return;
  }

  if (data === "admin_lang_settings") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminLanguageSettingsText(env), await adminLanguageSettingsKeyboard(env));
    return;
  }

  if (data === "admin_lang_toggle_prompt" || data === "admin_lang_toggle_command") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const settings = await getLanguageSettings(env);
    const key = data === "admin_lang_toggle_prompt" ? "language_prompt_enabled" : "language_command_enabled";
    const current = data === "admin_lang_toggle_prompt" ? settings.languagePromptEnabled : settings.languageCommandEnabled;
    await setLanguageSetting(env, key, current ? "0" : "1");
    await answerCallback(env, query.id, current ? "Disabled" : "Enabled", false);
    await editCurrentMenu(env, chatId, userId, messageId, await adminLanguageSettingsText(env), await adminLanguageSettingsKeyboard(env));
    return;
  }

  if (data.startsWith("admin_lang_default:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const lang = data.slice("admin_lang_default:".length);
    await setLanguageSetting(env, "default_language", lang === "none" ? null : normalizeLang(lang));
    await answerCallback(env, query.id, "Default language updated", false);
    await editCurrentMenu(env, chatId, userId, messageId, await adminLanguageSettingsText(env), await adminLanguageSettingsKeyboard(env));
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


  if (data === "admin_daily_reward") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminDailyRewardText(env), adminDailyRewardKeyboard());
    return;
  }

  if (data === "admin_daily_reward_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "daily_reward_credits", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminDailyRewardPromptText(), adminCancelKeyboard("admin_daily_reward"));
    return;
  }

  if (data === "admin_initial_start") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminInitialStartText(env), adminInitialStartKeyboard());
    return;
  }

  if (data === "admin_initial_start_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "initial_start_credits", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminInitialStartPromptText(), adminCancelKeyboard("admin_initial_start"));
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
    const startLanguage = await resolveStartLanguage(env, state.language);
    await answerCallback(env, query.id);
    if (startLanguage) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
      await editCurrentMenu(env, chatId, userId, messageId, startText(state), mainKeyboard(state));
      return;
    }
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

  if (data === "daily_reward") {
    const result = await claimDailyReward(env, userId);
    await answerCallback(env, query.id, dailyRewardMessage(state.language, result), true);
    return;
  }

  if (data === "buy_credits") {
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, buyCreditsText(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "insufficient_buy_credits") {
    await answerCallback(env, query.id);
    await deleteMessage(env, chatId, messageId).catch(() => null);
    state.menuMessageId = null;
    await replaceMenu(env, chatId, userId, state, buyCreditsText(state), localizedBuyCreditsKeyboard(state));
    return;
  }

  if (data === "buy_toman") {
    await setPendingPayment(env, userId, "input");
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, tomanPackagesText(state), tomanPackagesKeyboard(state));
    return;
  }

  if (data === "toman_confirm") {
    const pending = await getPendingPayment(env, userId);
    const pack = pendingPackage(pending);
    if (!pack) {
      await answerCallback(env, query.id, state.language === "fa" ? "اول مقدار کردیت را بفرست" : "Send a credit amount first", true);
      return;
    }
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, customTomanInstructionText(pack, state), paymentCancelKeyboard(state));
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

async function handleAdminAudioInput(env, chatId, adminId, inputMessageId, audioAttachment) {
  if (!(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  if (!action) return false;

  if (action.action === "welcome_audio") {
    const language = normalizeLang(action.target_user_id || "en");
    await setWelcomeAudio(env, language, audioAttachment.fileId, audioAttachment.fileType);
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminWelcomeAudioText(env)) + "\n\n✅ Audio updated for " + language + ".", adminWelcomeAudioKeyboard());
    return true;
  }

  if (action.action === "broadcast") {
    await runBroadcast(env, adminId, action, { kind: "copy", fromChatId: chatId, messageId: inputMessageId });
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    return true;
  }

  return false;
}

async function handleAdminPendingInput(env, chatId, adminId, inputMessageId, text) {
  if (!(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  if (!action) return false;

  await deleteMessage(env, chatId, inputMessageId).catch(() => null);

  if (action.action === "welcome_audio") {
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminWelcomeAudioPromptText(action.target_user_id || "en") + "\n\nPlease send an audio file, not text.", adminCancelKeyboard("admin_welcome_audio"));
    return true;
  }


  if (action.action === "initial_start_credits") {
    const credits = Number.parseInt(String(text).trim(), 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminInitialStartPromptText() + "\n\nInvalid amount. Send a positive number like <code>100</code>.", adminCancelKeyboard("admin_initial_start"));
      return true;
    }

    await setInitialStartCredits(env, credits);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminInitialStartText(env)) + "\n\n✅ Initial start credits updated.", adminInitialStartKeyboard());
    return true;
  }

  if (action.action === "daily_reward_credits") {
    const credits = Number.parseInt(String(text).trim(), 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminDailyRewardPromptText() + "\n\nInvalid amount. Send a positive number like <code>120</code>.", adminCancelKeyboard("admin_daily_reward"));
      return true;
    }

    await setDailyRewardCredits(env, credits);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminDailyRewardText(env)) + "\n\n✅ Daily gift updated.", adminDailyRewardKeyboard());
    return true;
  }

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
    await runBroadcast(env, adminId, action, { kind: "text", text });
    return true;
  }

  await clearAdminAction(env, adminId);
  return true;
}

async function runBroadcast(env, adminId, action, payload) {
  const userIds = await getAllUserIds(env);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const total = userIds.length;
  const menuChatId = action.chat_id;
  const menuMessageId = Number(action.message_id);

  await editBroadcastProgress(env, menuChatId, adminId, menuMessageId, total, sent, failed, skipped, false);

  for (let index = 0; index < userIds.length; index++) {
    const id = userIds[index];
    if (String(id) === String(adminId)) {
      skipped++;
      continue;
    }

    try {
      if (payload.kind === "copy") {
        await copyMessage(env, id, payload.fromChatId, payload.messageId);
      } else {
        await sendPlainMessage(env, id, payload.text);
      }
      sent++;
    } catch {
      failed++;
    }

    if ((index + 1) % 10 === 0 || index + 1 === userIds.length) {
      await editBroadcastProgress(env, menuChatId, adminId, menuMessageId, total, sent, failed, skipped, false);
    }
  }

  await clearAdminAction(env, adminId);
  await editBroadcastProgress(env, menuChatId, adminId, menuMessageId, total, sent, failed, skipped, true);
}

async function editBroadcastProgress(env, chatId, adminId, messageId, total, sent, failed, skipped, done) {
  const processed = sent + failed + skipped;
  const text = [
    done ? "✅ <b>Broadcast completed</b>" : "📣 <b>Broadcast sending…</b>",
    "",
    "Processed: <b>" + processed + "/" + total + "</b>",
    "Sent: <b>" + sent + "</b>",
    "Failed: <b>" + failed + "</b>",
    "Skipped: <b>" + skipped + "</b>"
  ].join("\n");
  await editCurrentMenu(env, chatId, adminId, messageId, text, done ? adminMainKeyboard() : null).catch(() => null);
}

function parseCreditAmount(text) {
  const match = String(text).trim().match(/^([+-])(\d+)$/);
  if (!match) return null;

  const value = Number(match[2]);
  if (!Number.isFinite(value) || value <= 0) return null;

  return match[1] === "+" ? value : -value;
}

async function requireFaMembership(env, chatId, userId, inputMessageId, state, isCallback = false, callbackQueryId = null, callbackMessageId = null) {
  if (state?.language !== "fa") return false;
  if (await isAdmin(env, userId)) return false;
  if (await isFaChannelMember(env, userId)) {
    await grantFaJoinBonusOnce(env, userId);
    return false;
  }

  if (inputMessageId) {
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
  }

  if (isCallback && callbackQueryId) {
    await answerCallback(env, callbackQueryId, "اول باید عضو کانال بشی", true);
  }

  if (callbackMessageId) {
    await editCurrentMenu(env, chatId, userId, callbackMessageId, faJoinText(), faJoinKeyboard());
  } else {
    await upsertMenu(env, chatId, userId, state, faJoinText(), faJoinKeyboard());
  }

  return true;
}

async function denyCallback(env, callbackQueryId, state = {}) {
  await answerCallback(env, callbackQueryId, t(state.language, "accessDenied"), true);
}


async function handleTomanCreditInput(env, chatId, userId, messageId, text, state) {
  const pending = await getPendingPayment(env, userId);
  const pendingPackageId = String(pending?.package_id || "");
  const isAwaitingCustomTomanInput = pendingPackageId.startsWith("input") || pendingPackageId.startsWith("custom:");
  if (!pending || !isAwaitingCustomTomanInput) return false;

  const credits = parseTomanCreditAmount(text);
  await deleteMessage(env, chatId, messageId).catch(() => null);

  if (!credits) {
    await editCurrentMenu(env, chatId, userId, state.menuMessageId, tomanPackagesText(state) + "\n\n" + (state.language === "fa" ? "لطفاً یک عدد مثبت مثل <code>1000</code> بفرست" : "Please send a positive number like <code>1000</code>"), tomanPackagesKeyboard(state));
    return true;
  }

  const pack = createCustomTomanPackage(credits);
  await setPendingPayment(env, userId, customTomanPaymentId(pack));
  await editCurrentMenu(env, chatId, userId, state.menuMessageId, customTomanPreviewText(pack, state), customTomanConfirmKeyboard(state));
  return true;
}

function customTomanPreviewText(pack, state = {}) {
  const lang = state.language || "en";
  const lines = [
    lang === "fa" ? "🇮🇷 <b>پرداخت با تومان</b>" : t(lang, "buyTomanTitle"),
    "",
    `${t(lang, "package")}: <b>${Number(pack.credits).toLocaleString("en-US")} credits</b>`,
    `${t(lang, "amount")}: <b>${pack.amount} تومان</b>`,
  ];

  if (pack.minimumApplied) {
    lines.push(
      lang === "fa"
        ? `حداقل خرید <b>${Number(TOMAN_MIN_PURCHASE_AMOUNT).toLocaleString("en-US")} تومان</b> است`
        : `Minimum purchase is <b>${Number(TOMAN_MIN_PURCHASE_AMOUNT).toLocaleString("en-US")} Toman</b>`
    );
  }

  lines.push("", lang === "fa" ? "برای نمایش شماره کارت تایید کن" : "Confirm to show the card number");
  return lines.join("\n");
}

function customTomanPaymentId(pack) {
  return `custom:${Number(pack.credits || 0)}:${Number(pack.amountValue || 0)}`;
}

function pendingPackage(pending) {
  const packageId = pending?.package_id || "";
  if (TOMAN_PACKAGES[packageId]) return TOMAN_PACKAGES[packageId];
  if (!String(packageId).startsWith("custom:")) return null;
  const [, credits, amount] = String(packageId).split(":");
  const pack = createCustomTomanPackage(Number(credits));
  return Number(amount) === Number(pack.amountValue) ? pack : null;
}

function parseTomanCreditAmount(text) {
  const normalized = String(text || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

async function handlePaymentScreenshot(env, chatId, userId, state) {
  const pending = await getPendingPayment(env, userId);

  if (!pending || !pendingPackage(pending)) {
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
  const originalCost = countCredits(text);
  let finalText = text;
  let finalCost = originalCost;
  let statusMessage = null;

  if (!isDemo) {
    const balance = await getBalance(env, userId);
    if (balance < originalCost) {
      await replaceMenu(env, chatId, userId, state, insufficientCreditsText(state, originalCost, balance), insufficientCreditsKeyboard(state));
      return;
    }
  }

  try {
    statusMessage = await sendPlainMessage(env, chatId, isDemo ? t(state.language, "generatingDemo") : t(state.language, "generatingVoice"));

    let audio = null;

    if (isDemo) {
      audio = await getDemoAudio(env, voiceName, lang, finalText);
      if (!audio) {
        audio = await textToSpeech(env, finalText, voiceId);
        await saveDemoAudio(env, voiceName, lang, audio, finalText);
      }
    } else {
      audio = await textToSpeech(env, finalText, voiceId);
    }

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
      statusMessage = null;
    }

    await replaceMenu(env, chatId, userId, state, startText(state), mainKeyboard(state));

    const sentAudioMessage = await sendCleanAudio(env, chatId, audio);

    await saveTtsHistory(env, userId, finalText, voiceName, lang, isDemo ? 0 : finalCost, sentAudioMessage).catch((error) => {
      console.error("save tts history failed", error && error.message ? error.message : error);
    });

    if (!isDemo) {
      await spendCredits(env, userId, finalCost);
    }

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
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
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        await setMenuMessageId(env, userId, targetMessageId);
        return targetMessageId;
      }
    }
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
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      await setMenuMessageId(env, userId, messageId);
      return messageId;
    }

    const menu = await sendMessage(env, chatId, text, keyboard);
    await setMenuMessageId(env, userId, menu?.message_id || null);
    return menu?.message_id || null;
  }
}

function isMessageNotModifiedError(error) {
  return String(error?.message || error).toLowerCase().includes("message is not modified");
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
    t(lang, "creditRule"),
  ].join("\n");
}

function insufficientCreditsKeyboard(state = {}) {
  const lang = state.language || "en";
  return { inline_keyboard: [[{ text: t(lang, "buyCredits"), callback_data: "insufficient_buy_credits" }]] };
}

function countCredits(text) {
  return Array.from(String(text || "")).length;
}

async function sendInitialStartBonusOnFirstStart(env, chatId, userId, isFirstStart, language) {
  if (!isFirstStart) return;
  const result = await grantInitialStartBonusOnce(env, userId, language);
  if (result.granted) {
    await sendMessage(env, chatId, initialStartBonusText(language, result.credits)).catch(() => null);
  }
}

async function sendWelcomeAudioOnFirstStart(env, chatId, isFirstStart, language = null) {
  if (!isFirstStart) return;
  const audio = await getWelcomeAudio(env, language).catch(() => null);
  if (!audio?.fileId) return;

  if (audio.fileType === "document") {
    await sendDocumentFileId(env, chatId, audio.fileId).catch(() => null);
    return;
  }

  if (audio.fileType === "voice") {
    await sendVoiceFileId(env, chatId, audio.fileId).catch(() => null);
    return;
  }

  await sendAudioFileId(env, chatId, audio.fileId).catch(() => null);
}

function getAudioAttachment(message) {
  if (message?.audio?.file_id) return { fileId: message.audio.file_id, fileType: "audio" };
  if (message?.voice?.file_id) return { fileId: message.voice.file_id, fileType: "voice" };
  if (message?.document?.file_id && String(message.document.mime_type || "").startsWith("audio/")) {
    return { fileId: message.document.file_id, fileType: "document" };
  }
  return null;
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
