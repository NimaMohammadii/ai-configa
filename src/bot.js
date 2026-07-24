import {
  adminBroadcastPromptText,
  adminBroadcastKeyboard,
  adminBroadcastLanguageKeyboard,
  adminBroadcastSectionKeyboard,
  decodeBroadcastConfig,
  encodeBroadcastConfig,
  adminCancelKeyboard,
  adminChannelPostPromptText,
  adminChannelPostSectionKeyboard,
  adminChannelPostsKeyboard,
  adminChannelPostsText,
  adminCreditPromptText,
  adminBuyersKeyboard,
  adminBuyersText,
  adminMainKeyboard,
  adminMainText,
  adminImageUserKeyboard,
  adminImageUserText,
  adminImageUsersKeyboard,
  adminImageUsersText,
  adminImagePricingKeyboard,
  adminImagePricingText,
  adminImagePricePromptText,
  adminImageDiscountPromptText,
  adminImageExploreKeyboard,
  adminImageExplorePromptText,
  adminImageExploreText,
  adminImageExploreUploadText,
  adminImageExploreTagsText,
  adminImageExploreTagsKeyboard,
  adminImageExploreMoveText,
  adminInitialStartKeyboard,
  adminInitialStartPromptText,
  adminInitialStartText,
  adminLanguageSettingsKeyboard,
  adminLanguageSettingsText,
  adminLanguageStatsKeyboard,
  adminLanguageStatsText,
  adminLanguageUsersKeyboard,
  adminLanguageUsersText,
  adminMandatoryMembershipKeyboard,
  adminMandatoryMembershipText,
  adminMiniAppAccessKeyboard,
  adminMiniAppAccessText,
  adminMiniAppIconsKeyboard,
  adminMiniAppIconsText,
  adminMiniAppIconPromptText,
  adminMiniAppUsersKeyboard,
  adminMiniAppUsersText,
  adminWheelUsersKeyboard,
  adminWheelUsersText,
  adminMiniAppLockPromptText,
  adminSectionOpensKeyboard,
  adminSectionOpensText,
  adminStatsKeyboard,
  adminStatsText,
  adminVoiceProfilePromptText,
  adminVoiceProfilesKeyboard,
  adminVoiceProfilesText,
  adminWelcomeAudioKeyboard,
  adminWelcomeAudioPromptText,
  adminWelcomeAudioText,
  adminOnlineKeyboard,
  adminOnlineText,
  adminMessagePromptText,
  adminUserKeyboard,
  adminUsersKeyboard,
  adminUsersText,
  adminUserSearchPromptText,
  adminUserSearchResultsKeyboard,
  adminUserSearchResultsText,
  adminReturnUsersKeyboard,
  adminReturnUsersText,
  adminUserText,
  buildMiniAppUrl,
  channelPostMiniAppKeyboard,
  clearAdminAction,
  deleteWelcomeAudio,
  deleteVoiceProfile,
  deleteMiniAppButtonIcon,
  deleteImageExploreItem,
  getAdminAction,
  getChannelPostLanguageSettings,
  isAdmin,
  resetUser,
  resolveStartLanguage,
  setAdminAction,
  setLanguageSetting,
  setMiniAppAccessSettings,
  setMiniAppButtonIcon,
  getImagePricingSettings,
  getImageExploreItems,
  setImageCreditCost,
  setImageDiscountOffer,
  setImageDiscountEnabled,
  addImageExplorePrompt,
  cycleImageExploreSize,
  imageExploreSizeLabel,
  setImageExploreImage,
  setImageExplorePosition,
  toggleImageExploreTag,
  moveImageExploreItemToPosition,
  setWelcomeAudio,
  setVoiceProfile,
  getLanguageSettings,
  searchAdminUsers,
  getWelcomeAudio,
  hasTrackedUser,
  trackUser,
  tryAdminLogin,
} from "./admin.js";
import { addCredits, ensureBalanceRow, getBalance, removeCredits, spendCredits } from "./credits.js";
import { getDemoAudio, saveDemoAudio } from "./demo-cache.js";
import { grantInitialStartBonusOnce, initialStartBonusText, setInitialStartCredits } from "./start-bonus.js";
import { getDemoText } from "./demo-texts.js";
import { enqueueImageJob } from "./image-jobs.js";
import { enqueueBroadcastJob } from "./broadcast-jobs.js";
import { buildImageHistoryFile, getUserImageHistory, sendImageHistoryDocuments } from "./image-history.js";
import { textToSpeech } from "./elevenlabs.js";
import { normalizeLang, t } from "./i18n.js";
import { faJoinKeyboard, faJoinText, grantFaJoinBonusOnce, isFaChannelMember, isMandatoryFaMembershipEnabled, setMandatoryFaMembershipEnabled } from "./mandatory-channel.js";
import { clearPendingPayment, getPendingPayment, setPendingPayment } from "./payments.js";
import { getActiveWheelPurchaseDiscount } from "./reward-wheel.js";
import { getState, saveState, setMenuMessageId, setUserLanguage } from "./state.js";
import { answerCallback, copyMessage, deleteMessage, editMessage, sendAudio, sendAudioFileId, sendDocument, sendDocumentFileId, sendMessage, sendPhoto, sendPlainMessage, sendVoiceFileId, sendTextDocument } from "./telegram-actions.js";
import { buildTtsAudioFileName, buildTtsHistoryFile, getNextTtsFileSequence, getTtsHistoryExport, getTtsHistoryItemByIndex, getTtsHistoryPage, saveTtsHistory, ttsAudioCaption, ttsHistoryItemKeyboard, ttsHistoryItemText, ttsHistoryKeyboard, ttsHistoryText } from "./tts-history.js";
import { buyCreditsKeyboard, buyCreditsText, createCustomTomanPackage, customTomanConfirmKeyboard, customTomanInstructionText, languageKeyboard, languageText, userMainKeyboard, paymentCancelKeyboard, paymentInstructionText, startText, tomanPackagesKeyboard, tomanPackagesText, TOMAN_MIN_PURCHASE_AMOUNT, TOMAN_PACKAGES } from "./ui.js";
import { VOICES, isLockedVoice } from "./voices.js";

export async function handleMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const messageId = message.message_id;
  const text = message.text ? message.text.trim() : "";
  const caption = message.caption ? message.caption.trim() : "";
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

  if (hasPhoto && await handleAdminPhotoInput(env, chatId, userId, message)) {
    return;
  }

  if (hasPhoto && await requireFaMembership(env, chatId, userId, messageId, state, false)) {
    return;
  }

  if (hasPhoto && isImageCommand(caption)) {
    await handleImageEditCommand(env, chatId, userId, messageId, caption, message, state);
    return;
  }

  if (hasPhoto) {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await handlePaymentScreenshot(env, chatId, userId, state);
    return;
  }

  if (!text) return;

  if (await handleAdminPendingInput(env, chatId, userId, messageId, text, message)) {
    return;
  }

  if (await handleTomanCreditInput(env, chatId, userId, messageId, text, state)) {
    return;
  }

  if (text === "/start") {
    if (!isFirstStart) {
      await deleteMessage(env, chatId, messageId).catch(() => null);
    }
    const startLanguage = await resolveStartLanguage(env, state.language);
    if (!startLanguage) {
      await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
      return;
    }
    if (startLanguage !== state.language) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
    }
    if (await requireFaMembership(env, chatId, userId, null, state, false)) {
      return;
    }
    await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));
    await sendInitialStartBonusOnce(env, chatId, userId, state.language);
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
      if (await requireFaMembership(env, chatId, userId, null, state, false)) {
        return;
      }
      await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));
      await sendInitialStartBonusOnce(env, chatId, userId, state.language);
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
      await replaceMenu(env, chatId, userId, state, t(state.language, "accessDenied"), await userMainKeyboard(env, userId, state));
      return;
    }
    await replaceMenu(env, chatId, userId, state, buildDebugText(env, state), await userMainKeyboard(env, userId, state));
    return;
  }

  if (!state.language) {
    const startLanguage = await resolveStartLanguage(env, state.language);
    await deleteMessage(env, chatId, messageId).catch(() => null);
    if (startLanguage) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
      if (await requireFaMembership(env, chatId, userId, null, state, false)) {
        return;
      }
      await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));
      await sendInitialStartBonusOnce(env, chatId, userId, state.language);
      return;
    }
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }

  if (await requireFaMembership(env, chatId, userId, messageId, state, false)) {
    return;
  }

  if (isImageCommand(text)) {
    await handleImageCommand(env, chatId, userId, messageId, text, state);
    return;
  }

  if (text.startsWith("/")) {
    await deleteMessage(env, chatId, messageId).catch(() => null);
    await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));
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
    await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), await userMainKeyboard(env, userId, fresh));
    await sendInitialStartBonusOnce(env, chatId, userId, fresh.language);
    await sendWelcomeAudioOnFirstStart(env, chatId, shouldSendWelcomeAudio, fresh.language);
    return;
  }

  if (data === "check_fa_join") {
    if (!(await isMandatoryFaMembershipEnabled(env))) {
      const fresh = await getState(env, userId);
      await answerCallback(env, query.id, "عضویت اجباری غیرفعال است", false);
      await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), await userMainKeyboard(env, userId, fresh));
      return;
    }
    const member = await isFaChannelMember(env, userId);
    if (!member) {
      await answerCallback(env, query.id, "هنوز عضو کانال نیستی", true);
      await editCurrentMenu(env, chatId, userId, messageId, faJoinText(), faJoinKeyboard());
      return;
    }
    await grantFaJoinBonusOnce(env, userId);
    const fresh = await getState(env, userId);
    await editCurrentMenu(env, chatId, userId, messageId, startText(fresh), await userMainKeyboard(env, userId, fresh));
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


  if (data === "admin_user_search_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "user_search", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminUserSearchPromptText(), adminCancelKeyboard("admin_users:0"));
    return;
  }

  if (data === "admin_returns" || data.startsWith("admin_returns:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const threshold = parts.length > 1 ? Number(parts[1]) : null;
    const page = parts.length > 2 ? Number(parts[2] || 0) : 0;
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminReturnUsersText(env, threshold, page), await adminReturnUsersKeyboard(env, threshold, page));
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

  if (data === "admin_language_stats") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminLanguageStatsText(env), await adminLanguageStatsKeyboard(env));
    return;
  }


  if (data.startsWith("admin_language_users:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const language = parts[1] || "not_selected";
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminLanguageUsersText(env, language, page), await adminLanguageUsersKeyboard(env, language, page));
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

  if (data === "admin_mandatory_membership") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMandatoryMembershipText(env), await adminMandatoryMembershipKeyboard(env));
    return;
  }

  if (data.startsWith("admin_mini_app_users:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMiniAppUsersText(env, page), await adminMiniAppUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_wheel_users:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminWheelUsersText(env, page), await adminWheelUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_image_users:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const page = Number(data.split(":")[1] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminImageUsersText(env, page), await adminImageUsersKeyboard(env, page));
    return;
  }

  if (data.startsWith("admin_image_user:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Number(parts[2] || 0);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminImageUserText(env, targetUserId), adminImageUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("admin_image_download:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const rows = await getUserImageHistory(env, targetUserId, 100);
    const content = buildImageHistoryFile(targetUserId, rows);
    const filename = "image-history-" + String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt";
    await answerCallback(env, query.id, rows.length ? "Sending image history..." : "Sending empty image history...", false);
    await sendTextDocument(env, chatId, content, filename, "🎨 Image prompts for <code>" + targetUserId + "</code>");
    const sent = await sendImageHistoryDocuments(env, chatId, rows, sendDocumentFileId);
    if (rows.length && !sent) {
      await sendPlainMessage(env, chatId, "No Telegram image files are stored for this user yet. Prompts were sent as a text file.");
    }
    return;
  }


  if (data === "admin_image_pricing") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    const settings = await getImagePricingSettings(env);
    await editCurrentMenu(env, chatId, userId, messageId, await adminImagePricingText(env), adminImagePricingKeyboard(settings));
    return;
  }

  if (data === "admin_image_price_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "image_base_price", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminImagePricePromptText(), adminCancelKeyboard("admin_image_pricing"));
    return;
  }

  if (data === "admin_image_discount_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "image_discount_offer", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminImageDiscountPromptText(), adminCancelKeyboard("admin_image_pricing"));
    return;
  }

  if (data === "admin_image_discount_cancel") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await setImageDiscountEnabled(env, false);
    await answerCallback(env, query.id, "Discount canceled", false);
    const settings = await getImagePricingSettings(env);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminImagePricingText(env)) + "\n\n⛔ Discount canceled.", adminImagePricingKeyboard(settings));
    return;
  }
  if (data === "admin_image_explore") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, chatId, userId, messageId, await adminImageExploreText(env), adminImageExploreKeyboard(items));
    return;
  }


  if (data === "admin_image_explore_noop") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    return;
  }

  if (data === "admin_image_explore_add") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "image_explore_prompt", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminImageExplorePromptText(), adminCancelKeyboard("admin_image_explore"));
    return;
  }

  if (data.startsWith("admin_image_explore_upload:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const itemId = data.slice("admin_image_explore_upload:".length);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "image_explore_image", { targetUserId: itemId, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminImageExploreUploadText(), adminCancelKeyboard("admin_image_explore"));
    return;
  }



  if (data.startsWith("admin_image_explore_tag:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const [, itemId, encodedTag] = data.match(/^admin_image_explore_tag:([^:]+):(.+)$/) || [];
    if (!itemId || !encodedTag) return answerCallback(env, query.id, "Invalid tag", true);
    const tags = await toggleImageExploreTag(env, itemId, decodeURIComponent(encodedTag));
    await answerCallback(env, query.id, tags.includes(decodeURIComponent(encodedTag)) ? "Tag selected" : "Tag removed", false);
    const item = (await getImageExploreItems(env)).find((entry) => entry.id === itemId);
    await editCurrentMenu(env, chatId, userId, messageId, adminImageExploreTagsText(item), adminImageExploreTagsKeyboard(itemId, item?.tags || []));
    return;
  }

  if (data.startsWith("admin_image_explore_tags_done:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const itemId = data.slice("admin_image_explore_tags_done:".length);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id, "Explore tags saved", false);
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminImageExploreText(env)) + "\n\n✅ Explore card is ready with tags.", adminImageExploreKeyboard(items));
    return;
  }

  if (data.startsWith("admin_image_explore_move:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const itemId = data.slice("admin_image_explore_move:".length);
    const items = await getImageExploreItems(env);
    const index = items.findIndex((item) => item.id === itemId) + 1;
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "image_explore_move", { targetUserId: itemId, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminImageExploreMoveText(index || null), adminCancelKeyboard("admin_image_explore"));
    return;
  }

  if (data.startsWith("admin_image_explore_delete:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await deleteImageExploreItem(env, data.slice("admin_image_explore_delete:".length));
    await answerCallback(env, query.id, "Explore card deleted", false);
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminImageExploreText(env)) + "\n\n🗑 Deleted card.", adminImageExploreKeyboard(items));
    return;
  }

  if (data.startsWith("admin_image_explore_size:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    const size = await cycleImageExploreSize(env, data.slice("admin_image_explore_size:".length));
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminImageExploreText(env)) + "\n\n📐 Card size set to " + imageExploreSizeLabel(size) + ".", adminImageExploreKeyboard(items));
    return;
  }

  if (data.startsWith("admin_image_explore_position:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const [, itemId, position] = data.match(/^admin_image_explore_position:([^:]+):(top|bottom)$/) || [];
    if (!itemId) return answerCallback(env, query.id, "Invalid position", true);
    const newPosition = await setImageExplorePosition(env, itemId, position);
    await answerCallback(env, query.id, position === "top" ? "Card moved to first" : "Card moved to last", false);
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminImageExploreText(env)) + "\n\n↕️ Card moved to #" + newPosition + ".", adminImageExploreKeyboard(items));
    return;
  }

  if (data === "admin_section_opens") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminSectionOpensText(env), adminSectionOpensKeyboard());
    return;
  }

  if (data === "admin_mini_app_access") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMiniAppAccessText(env), await adminMiniAppAccessKeyboard(env));
    return;
  }


  if (data === "admin_mini_app_icons") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMiniAppIconsText(env), adminMiniAppIconsKeyboard());
    return;
  }

  if (data.startsWith("admin_mini_app_icon_upload:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const iconKey = data.slice("admin_mini_app_icon_upload:".length);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "mini_app_icon", { targetUserId: iconKey, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminMiniAppIconPromptText(iconKey), adminCancelKeyboard("admin_mini_app_icons"));
    return;
  }

  if (data.startsWith("admin_mini_app_icon_delete:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const iconKey = data.slice("admin_mini_app_icon_delete:".length);
    await deleteMiniAppButtonIcon(env, iconKey);
    await answerCallback(env, query.id, "Mini app icon deleted", false);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminMiniAppIconsText(env)) + "\n\n🗑 Deleted icon.", adminMiniAppIconsKeyboard());
    return;
  }

  if (data === "admin_voice_profiles") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, await adminVoiceProfilesText(env), adminVoiceProfilesKeyboard());
    return;
  }

  if (data.startsWith("admin_voice_profile_upload:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const voiceName = data.slice("admin_voice_profile_upload:".length);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "voice_profile", { targetUserId: voiceName, chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminVoiceProfilePromptText(voiceName), adminCancelKeyboard("admin_voice_profiles"));
    return;
  }

  if (data.startsWith("admin_voice_profile_delete:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const voiceName = data.slice("admin_voice_profile_delete:".length);
    await deleteVoiceProfile(env, voiceName);
    await answerCallback(env, query.id, "Voice profile deleted", false);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminVoiceProfilesText(env)) + "\n\n🗑 Deleted for " + voiceName + ".", adminVoiceProfilesKeyboard());
    return;
  }

  if (data === "admin_mini_app_lock_prompt") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "mini_app_lock_minutes", { chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminMiniAppLockPromptText(), adminCancelKeyboard("admin_mini_app_access"));
    return;
  }

  if (data === "admin_mini_app_unlock") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await setMiniAppAccessSettings(env, false, 0, 0);
    await answerCallback(env, query.id, "Mini app opened", false);
    await editCurrentMenu(env, chatId, userId, messageId, (await adminMiniAppAccessText(env)) + "\n\n✅ Mini app is open for everyone.", await adminMiniAppAccessKeyboard(env));
    return;
  }

  if (data === "admin_mandatory_membership_toggle") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const current = await isMandatoryFaMembershipEnabled(env);
    await setMandatoryFaMembershipEnabled(env, !current);
    await answerCallback(env, query.id, current ? "Disabled" : "Enabled", false);
    await editCurrentMenu(env, chatId, userId, messageId, await adminMandatoryMembershipText(env), await adminMandatoryMembershipKeyboard(env));
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
    const action = await getAdminAction(env, userId);
    const config = action?.action === "broadcast" ? decodeBroadcastConfig(action.target_user_id) : decodeBroadcastConfig();
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "broadcast", { targetUserId: encodeBroadcastConfig(config), chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastKeyboard(config));
    return;
  }

  if (data === "admin_broadcast_lang") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const action = await getAdminAction(env, userId);
    const config = decodeBroadcastConfig(action?.target_user_id);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastLanguageKeyboard(config));
    return;
  }

  if (data.startsWith("admin_broadcast_lang_set:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const language = data.split(":")[1] || "all";
    const action = await getAdminAction(env, userId);
    const config = { ...decodeBroadcastConfig(action?.target_user_id), language };
    await answerCallback(env, query.id, "Language updated");
    await setAdminAction(env, userId, "broadcast", { targetUserId: encodeBroadcastConfig(config), chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastKeyboard(config));
    return;
  }

  if (data === "admin_broadcast_button") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const action = await getAdminAction(env, userId);
    const current = decodeBroadcastConfig(action?.target_user_id);
    const config = { ...current, button: !current.button };
    await answerCallback(env, query.id, config.button ? "Button enabled" : "Button disabled");
    await setAdminAction(env, userId, "broadcast", { targetUserId: encodeBroadcastConfig(config), chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastKeyboard(config));
    return;
  }

  if (data === "admin_broadcast_section") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const action = await getAdminAction(env, userId);
    const config = decodeBroadcastConfig(action?.target_user_id);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastSectionKeyboard(config));
    return;
  }

  if (data.startsWith("admin_broadcast_section_set:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const section = data.split(":")[1] || "home";
    const action = await getAdminAction(env, userId);
    const config = { ...decodeBroadcastConfig(action?.target_user_id), section };
    await answerCallback(env, query.id, "Section updated");
    await setAdminAction(env, userId, "broadcast", { targetUserId: encodeBroadcastConfig(config), chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminBroadcastPromptText(config), adminBroadcastKeyboard(config));
    return;
  }

  if (data === "admin_broadcast_cancel") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const action = await getAdminAction(env, userId);
    if (action?.action !== "broadcast_sending") {
      await answerCallback(env, query.id, "Broadcast is not sending", true);
      return;
    }
    await setAdminAction(env, userId, "broadcast_cancelled", { targetUserId: action.target_user_id, chatId, messageId });
    await answerCallback(env, query.id, "Cancelling broadcast…");
    return;
  }

  if (data === "admin_channel_posts") {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, adminChannelPostsText(), adminChannelPostsKeyboard());
    return;
  }

  if (data.startsWith("admin_channel_post_section:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const language = parts[1] || "fa";
    const section = parts[2] || "home";
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, adminChannelPostsText(), adminChannelPostSectionKeyboard(language, section));
    return;
  }

  if (data.startsWith("admin_channel_post_section_set:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const language = parts[1] || "fa";
    const section = parts[2] || "home";
    await answerCallback(env, query.id, "Section updated");
    await editCurrentMenu(env, chatId, userId, messageId, adminChannelPostsText(), adminChannelPostsKeyboard(section));
    return;
  }

  if (data.startsWith("admin_channel_post_prompt:")) {
    if (!(await isAdmin(env, userId))) return denyCallback(env, query.id, state);
    const parts = data.split(":");
    const language = parts[1] || "fa";
    const section = parts[2] || "home";
    await answerCallback(env, query.id);
    await setAdminAction(env, userId, "channel_post", { targetUserId: JSON.stringify({ language, section }), chatId, messageId });
    await editCurrentMenu(env, chatId, userId, messageId, adminChannelPostPromptText(language, section), adminCancelKeyboard("admin_channel_posts"));
    return;
  }

  if (!state.language) {
    const startLanguage = await resolveStartLanguage(env, state.language);
    await answerCallback(env, query.id);
    if (startLanguage) {
      state.language = startLanguage;
      await setUserLanguage(env, userId, startLanguage);
      await editCurrentMenu(env, chatId, userId, messageId, startText(state), await userMainKeyboard(env, userId, state));
      return;
    }
    await editCurrentMenu(env, chatId, userId, messageId, languageText(), languageKeyboard());
    return;
  }

  if (data.startsWith("page:")) {
    await answerCallback(env, query.id);
    state.page = Number(data.split(":")[1] || 0);
    await saveState(env, userId, state);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), await userMainKeyboard(env, userId, state));
    return;
  }

  if (data.startsWith("voice:")) {
    const voice = data.slice(6);
    if (VOICES[voice]) state.voice = voice;
    await answerCallback(env, query.id);
    await saveState(env, userId, state);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), await userMainKeyboard(env, userId, state));
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
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), await userMainKeyboard(env, userId, state));
    return;
  }

  if (data === "back_main") {
    await answerCallback(env, query.id);
    await editCurrentMenu(env, chatId, userId, messageId, startText(state), await userMainKeyboard(env, userId, state));
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

function isImageCommand(text) {
  return /^\/image(?:@\w+)?(?:\s|$)/i.test(String(text || ""));
}

function getImagePrompt(text) {
  return String(text || "").replace(/^\/image(?:@\w+)?/i, "").trim();
}

async function handleImageCommand(env, chatId, userId, messageId, text, state) {
  const prompt = getImagePrompt(text);
  await deleteMessage(env, chatId, messageId).catch(() => null);

  if (!prompt) {
    await sendMessage(env, chatId, imageUsageText(state), await userMainKeyboard(env, userId, state));
    return;
  }

  const waitMessage = await sendMessage(env, chatId, imageWaitText(state));

  try {
    await enqueueImageJob(env, {
      chatId,
      userId,
      kind: "generate",
      prompt,
      language: state.language,
      waitMessageId: waitMessage?.message_id,
    });
  } catch (error) {
    await deleteMessage(env, chatId, waitMessage?.message_id).catch(() => null);
    await sendMessage(env, chatId, error?.message || imageErrorText(state), await userMainKeyboard(env, userId, state));
  }
}

async function handleImageEditCommand(env, chatId, userId, messageId, caption, message, state) {
  const prompt = getImagePrompt(caption);
  await deleteMessage(env, chatId, messageId).catch(() => null);

  if (!prompt) {
    await sendMessage(env, chatId, imageEditUsageText(state), await userMainKeyboard(env, userId, state));
    return;
  }

  const fileId = getLargestPhotoFileId(message);
  if (!fileId) {
    await sendMessage(env, chatId, imageErrorText(state), await userMainKeyboard(env, userId, state));
    return;
  }

  const waitMessage = await sendMessage(env, chatId, imageEditWaitText(state));

  try {
    await enqueueImageJob(env, {
      chatId,
      userId,
      kind: "edit",
      prompt,
      sourceFileId: fileId,
      language: state.language,
      waitMessageId: waitMessage?.message_id,
    });
  } catch (error) {
    await deleteMessage(env, chatId, waitMessage?.message_id).catch(() => null);
    await sendMessage(env, chatId, error?.message || imageErrorText(state), await userMainKeyboard(env, userId, state));
  }
}

function imageEditUsageText(state) {
  return state.language === "fa"
    ? "برای ادیت تصویر، عکس را با کپشن زیر بفرست:\n\n<code>/image دستور ادیت تصویر</code>"
    : "To edit an image, send the photo with this caption:\n\n<code>/image describe the edit</code>";
}

function imageEditWaitText(state) {
  return state.language === "fa" ? "🎨 دارم تصویر را ادیت می‌کنم..." : "🎨 Editing your image...";
}

function imageUsageText(state) {
  return state.language === "fa"
    ? "🎨 برای ساخت تصویر، دستور را همراه توضیح تصویر بفرست:\n\n<code>/image یک گربه فضانورد روی ماه، سبک سینمایی</code>"
    : "🎨 To create an image, send /image followed by your prompt:\n\n<code>/image a cinematic astronaut cat on the moon</code>";
}

function imageWaitText(state) {
  return state.language === "fa" ? "🎨 دارم تصویر را می‌سازم..." : "🎨 Generating your image...";
}

function imageErrorText(state) {
  return state.language === "fa" ? "ساخت تصویر ناموفق بود. دوباره تلاش کن." : "Image generation failed. Please try again.";
}

async function handleAdminPhotoInput(env, chatId, adminId, message) {
  if (!(await isAdmin(env, adminId))) return false;
  const action = await getAdminAction(env, adminId);
  if (!action) return false;

  const inputMessageId = message.message_id;


  if (action.action === "image_explore_image" || action.action === "image_explore_prompt") {
    const fileId = getLargestPhotoFileId(message);
    if (!fileId) return false;
    const itemId = action.action === "image_explore_prompt" ? await addImageExplorePrompt(env, "") : action.target_user_id;
    await setImageExploreImage(env, itemId, fileId);
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await setAdminAction(env, adminId, "image_explore_tags", { targetUserId: itemId, chatId: action.chat_id || chatId, messageId: Number(action.message_id) });
    const item = (await getImageExploreItems(env)).find((entry) => entry.id === itemId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageExploreTagsText(item) + "\n\n✅ Image uploaded. Now choose tags.", adminImageExploreTagsKeyboard(itemId, item?.tags || []));
    return true;
  }

  if (action.action === "mini_app_icon") {
    const fileId = getLargestPhotoFileId(message);
    if (!fileId) return false;

    const iconKey = action.target_user_id || "history";
    await setMiniAppButtonIcon(env, iconKey, fileId);
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminMiniAppIconsText(env)) + "\n\n✅ Mini app icon updated.", adminMiniAppIconsKeyboard());
    return true;
  }

  if (action.action === "voice_profile") {
    const fileId = getLargestPhotoFileId(message);
    if (!fileId) return false;

    const voiceName = action.target_user_id || "Nora";
    await setVoiceProfile(env, voiceName, fileId);
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminVoiceProfilesText(env)) + "\n\n✅ Profile image updated for " + voiceName + ".", adminVoiceProfilesKeyboard());
    return true;
  }

  if (action.action === "message") {
    await copyMessage(env, action.target_user_id, chatId, inputMessageId).catch(() => null);
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
    return true;
  }

  if (action.action === "broadcast") {
    await runBroadcast(env, adminId, action, {
      kind: "photo",
      fileId: getLargestPhotoFileId(message),
      caption: String(message.caption || ""),
      captionEntities: Array.isArray(message.caption_entities) ? message.caption_entities : undefined,
    });
    await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    return true;
  }

  if (action.action === "channel_post") {
    let channelPostConfig;
    try { channelPostConfig = JSON.parse(action.target_user_id || "{}"); } catch { channelPostConfig = { language: action.target_user_id || "fa", section: "home" }; }
    const language = channelPostConfig.language || "fa";
    const section = channelPostConfig.section || "home";
    const settings = getChannelPostLanguageSettings(language);

    try {
      const miniAppUrl = await buildMiniAppUrl(env, section);
      await copyMessage(env, settings.channel, chatId, inputMessageId, undefined, channelPostMiniAppKeyboard(miniAppUrl));
      await deleteMessage(env, chatId, inputMessageId).catch(() => null);
      await clearAdminAction(env, adminId);
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminChannelPostsText() + "\n\n✅ Post sent to " + settings.channel + ".", adminChannelPostsKeyboard());
    } catch (error) {
      await deleteMessage(env, chatId, inputMessageId).catch(() => null);
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminChannelPostPromptText(language, section) + "\n\n❌ " + escapeForAdminError(error), adminCancelKeyboard("admin_channel_posts"));
    }
    return true;
  }

  return false;
}

function getLargestPhotoFileId(message) {
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  if (!photos.length) return null;
  return photos[photos.length - 1]?.file_id || null;
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
    return true;
  }

  return false;
}

async function handleAdminPendingInput(env, chatId, adminId, inputMessageId, text, message = null) {
  if (!(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  if (!action) return false;

  await deleteMessage(env, chatId, inputMessageId).catch(() => null);


  if (action.action === "user_search") {
    const users = await searchAdminUsers(env, text);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminUserSearchResultsText(text, users), adminUserSearchResultsKeyboard(users));
    return true;
  }

  if (action.action === "voice_profile") {
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminVoiceProfilePromptText(action.target_user_id || "Nora") + "\n\nPlease send a photo, not text.", adminCancelKeyboard("admin_voice_profiles"));
    return true;
  }

  if (action.action === "image_explore_image") {
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageExploreUploadText() + "\n\nPlease send a photo, not text.", adminCancelKeyboard("admin_image_explore"));
    return true;
  }

  if (action.action === "mini_app_icon") {
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminMiniAppIconPromptText(action.target_user_id || "history") + "\n\nPlease send a photo, not text.", adminCancelKeyboard("admin_mini_app_icons"));
    return true;
  }

  if (action.action === "welcome_audio") {
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminWelcomeAudioPromptText(action.target_user_id || "en") + "\n\nPlease send an audio file, not text.", adminCancelKeyboard("admin_welcome_audio"));
    return true;
  }




  if (action.action === "image_explore_move") {
    const position = Number.parseInt(String(text).trim(), 10);
    const itemsBefore = await getImageExploreItems(env);
    if (!Number.isFinite(position) || position < 1 || position > itemsBefore.length) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageExploreMoveText() + "\n\nInvalid number. Send a number from 1 to " + itemsBefore.length + ".", adminCancelKeyboard("admin_image_explore"));
      return true;
    }
    const newPosition = await moveImageExploreItemToPosition(env, action.target_user_id, position);
    await clearAdminAction(env, adminId);
    const items = await getImageExploreItems(env);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminImageExploreText(env)) + "\n\n↕️ Card moved to #" + newPosition + ".", adminImageExploreKeyboard(items));
    return true;
  }

  if (action.action === "image_explore_prompt") {
    const prompt = String(text || "").trim();
    if (!prompt) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageExplorePromptText() + "\n\nSend a prompt text, or upload a photo to skip prompt text.", adminCancelKeyboard("admin_image_explore"));
      return true;
    }
    const itemId = await addImageExplorePrompt(env, prompt);
    await setAdminAction(env, adminId, "image_explore_image", { targetUserId: itemId, chatId: action.chat_id || chatId, messageId: Number(action.message_id) });
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageExploreUploadText() + "\n\n✅ Prompt saved. Now send the card photo.", adminCancelKeyboard("admin_image_explore"));
    return true;
  }

  if (action.action === "image_base_price") {
    const credits = Number.parseInt(String(text).trim(), 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImagePricePromptText() + "\n\nInvalid amount. Send a positive number like <code>188</code>.", adminCancelKeyboard("admin_image_pricing"));
      return true;
    }
    await setImageCreditCost(env, credits);
    await clearAdminAction(env, adminId);
    const settings = await getImagePricingSettings(env);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminImagePricingText(env)) + "\n\n✅ Image base price updated.", adminImagePricingKeyboard(settings));
    return true;
  }

  if (action.action === "image_discount_offer") {
    const parts = String(text).trim().split(/\s+/);
    const discountCost = Number.parseInt(parts[0], 10);
    const minutes = parts[1] == null ? 0 : Number.parseInt(parts[1], 10);
    const current = await getImagePricingSettings(env);
    if (!Number.isFinite(discountCost) || discountCost <= 0 || discountCost >= current.baseCost || !Number.isFinite(minutes) || minutes < 0) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminImageDiscountPromptText() + "\n\nInvalid offer. Send a lower price like <code>99</code>, or add positive minutes like <code>99 30</code>.", adminCancelKeyboard("admin_image_pricing"));
      return true;
    }
    await setImageDiscountOffer(env, discountCost, minutes);
    await clearAdminAction(env, adminId);
    const settings = await getImagePricingSettings(env);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminImagePricingText(env)) + "\n\n✅ Discount started" + (minutes > 0 ? " for " + minutes + " minutes." : " without a timer."), adminImagePricingKeyboard(settings));
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

  if (action.action === "mini_app_lock_minutes") {
    const minutes = Number.parseInt(String(text).trim(), 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminMiniAppLockPromptText() + "\n\nInvalid duration. Send a positive number like <code>15</code>.", adminCancelKeyboard("admin_mini_app_access"));
      return true;
    }

    const lockedFrom = Math.floor(Date.now() / 1000);
    const lockedUntil = lockedFrom + (minutes * 60);
    await setMiniAppAccessSettings(env, true, lockedUntil, lockedFrom);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), (await adminMiniAppAccessText(env)) + "\n\n✅ Mini app locked for " + minutes + " minutes.", await adminMiniAppAccessKeyboard(env));
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
    const richText = getRichTextPayload(message, text);
    await sendPlainMessage(env, action.target_user_id, richText.text, null, { entities: richText.entities }).catch(() => null);
    await clearAdminAction(env, adminId);
    await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), await adminUserText(env, action.target_user_id), adminUserKeyboard(action.target_user_id, action.page || 0));
    return true;
  }

  if (action.action === "broadcast") {
    const richText = getRichTextPayload(message, text);
    await runBroadcast(env, adminId, action, { kind: "text", text: richText.text, entities: richText.entities });
    return true;
  }

  if (action.action === "channel_post") {
    let channelPostConfig;
    try { channelPostConfig = JSON.parse(action.target_user_id || "{}"); } catch { channelPostConfig = { language: action.target_user_id || "fa", section: "home" }; }
    const language = channelPostConfig.language || "fa";
    const section = channelPostConfig.section || "home";
    const settings = getChannelPostLanguageSettings(language);

    try {
      const miniAppUrl = await buildMiniAppUrl(env, section);
      const richText = getRichTextPayload(message, text);
      await sendPlainMessage(env, settings.channel, richText.text, channelPostMiniAppKeyboard(miniAppUrl), { entities: richText.entities });
      await clearAdminAction(env, adminId);
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminChannelPostsText() + "\n\n✅ Post sent to " + settings.channel + ".", adminChannelPostsKeyboard());
    } catch (error) {
      await editCurrentMenu(env, action.chat_id || chatId, adminId, Number(action.message_id), adminChannelPostPromptText(language, section) + "\n\n❌ " + escapeForAdminError(error), adminCancelKeyboard("admin_channel_posts"));
    }
    return true;
  }

  await clearAdminAction(env, adminId);
  return true;
}

function getRichTextPayload(message, fallbackText) {
  const rawText = typeof message?.text === "string" ? message.text : String(fallbackText || "");
  const entities = Array.isArray(message?.entities) ? message.entities : [];
  return { text: rawText.trim(), entities: trimMessageEntities(rawText, entities) };
}

function trimMessageEntities(text, entities) {
  if (!Array.isArray(entities) || !entities.length) return undefined;
  const leading = String(text || "").match(/^\s*/)?.[0]?.length || 0;
  const trailingStart = String(text || "").replace(/\s+$/u, "").length;
  const trimmedLength = Math.max(0, trailingStart - leading);
  const adjusted = entities.map((entity) => {
    const start = Number(entity.offset);
    const length = Number(entity.length);
    if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) return null;
    const end = start + length;
    const clippedStart = Math.max(start, leading);
    const clippedEnd = Math.min(end, trailingStart);
    if (clippedEnd <= clippedStart) return null;
    return { ...entity, offset: clippedStart - leading, length: Math.min(clippedEnd - clippedStart, trimmedLength) };
  }).filter(Boolean);
  return adjusted.length ? adjusted : undefined;
}

async function runBroadcast(env, adminId, action, payload) {
  const config = decodeBroadcastConfig(action.target_user_id);
  const sendingToken = JSON.stringify({ ...config, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) });
  await setAdminAction(env, adminId, "broadcast_sending", { targetUserId: sendingToken, chatId: action.chat_id, messageId: Number(action.message_id) });
  await enqueueBroadcastJob(env, {
    token: sendingToken,
    adminId,
    chatId: action.chat_id,
    menuMessageId: Number(action.message_id),
    config,
    payload,
    replyMarkup: await broadcastReplyMarkup(env, config),
  });
}

async function broadcastReplyMarkup(env, config) {
  if (!config.button) return null;
  const url = await buildMiniAppUrl(env, config.section);
  return channelPostMiniAppKeyboard(url);
}

function escapeForAdminError(error) {
  return String(error?.message || error).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]));
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
  if (!(await isMandatoryFaMembershipEnabled(env))) return false;
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

  const pack = createCustomTomanPackage(credits, await getActiveWheelPurchaseDiscount(env, userId));
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
    customTomanAmountLine(pack, lang),
  ];

  if (Number(pack.discountPercent || 0) > 0) {
    lines.push(lang === "fa" ? "این مبلغ با تخفیف گردونه محاسبه شده و جایزه فقط ۲۴ ساعت اعتبار دارد." : "This amount is calculated with your wheel discount, which is valid for 24 hours.");
  }

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

function customTomanAmountLine(pack, lang) {
  if (Number(pack.discountPercent || 0) > 0) {
    const percent = Number(pack.discountPercent).toLocaleString("en-US");
    const note = lang === "fa" ? `با ${percent}٪ تخفیف گردونه حساب می‌شود` : `calculated with ${percent}% wheel discount`;
    return `${t(lang, "amount")}: <s>${Number(pack.originalAmountValue).toLocaleString("en-US")} تومان</s> → <b>${pack.amount} تومان</b> (${note})`;
  }
  return `${t(lang, "amount")}: <b>${pack.amount} تومان</b>`;
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
  if (Number(amount) === Number(pack.amountValue)) return pack;
  if (Number(amount) > 0 && Number(amount) < Number(pack.amountValue)) {
    const percent = Math.round((1 - Number(amount) / Number(pack.amountValue)) * 100);
    return createCustomTomanPackage(Number(credits), { percent });
  }
  return null;
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
    await upsertMenu(env, chatId, userId, state, t(state.language, "screenshotNoPackage"), await userMainKeyboard(env, userId, state));
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
    await userMainKeyboard(env, userId, state)
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

  if (!isDemo && isLockedVoice(voiceName) && !(await isAdmin(env, userId))) {
    await replaceMenu(env, chatId, userId, state, "این صدا فعلاً قفل است و فقط دموی آن برای کاربران عادی قابل پخش است.", await userMainKeyboard(env, userId, state));
    return;
  }

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
        audio = await textToSpeech(env, finalText, voiceId, lang);
        await saveDemoAudio(env, voiceName, lang, audio, finalText);
      }
    } else {
      audio = await textToSpeech(env, finalText, voiceId, lang);
    }

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
      statusMessage = null;
    }

    await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));

    const outputFileSequence = isDemo ? null : await getNextTtsFileSequence(env, userId);
    const outputFileName = isDemo ? null : buildTtsAudioFileName(outputFileSequence);
    const sentAudioMessage = await sendCleanAudio(env, chatId, audio, outputFileName);

    await saveTtsHistory(env, userId, finalText, voiceName, lang, isDemo ? 0 : finalCost, sentAudioMessage, outputFileSequence).catch((error) => {
      console.error("save tts history failed", error && error.message ? error.message : error);
    });

    if (!isDemo) {
      await spendCredits(env, userId, finalCost, "tts", { voice: voiceName, language: lang });
    }

    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
  } catch (error) {
    if (statusMessage && statusMessage.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await upsertMenu(env, chatId, userId, state, t(state.language, "ttsError") + ": " + safeError(error) + "\n\n" + startText(state), await userMainKeyboard(env, userId, state));
  }
}

export async function sendFreshMainMenu(env, chatId, userId) {
  const state = await getState(env, userId);
  if (!state.language) {
    await replaceMenu(env, chatId, userId, state, languageText(), languageKeyboard());
    return;
  }
  await replaceMenu(env, chatId, userId, state, startText(state), await userMainKeyboard(env, userId, state));
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

async function sendInitialStartBonusOnce(env, chatId, userId, language) {
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

async function sendCleanAudio(env, chatId, audio, filename = null) {
  const audioFileName = filename || "vexa-voice.mp3";
  const title = audioFileName.replace(/\.mp3$/i, "");

  try {
    return await sendAudio(env, chatId, audio, audioFileName, title);
  } catch (sendAudioError) {
    return await sendDocument(env, chatId, audio, audioFileName);
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 3000);
}
