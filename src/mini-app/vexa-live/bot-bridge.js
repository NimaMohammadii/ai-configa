import {
  MINI_APP_BROADCAST_SECTIONS,
  MINI_APP_TRACKED_SECTIONS,
  adminCancelKeyboard,
  adminMiniAppAccessKeyboard,
  adminMiniAppAccessText,
  clearAdminAction,
  getAdminAction,
  hasTrackedUser,
  isAdmin,
  setAdminAction,
  trackUser,
} from "../../admin.js";
import { handleCallback as handleBaseCallback } from "../../bot-github-admin.js";
import { handleMessage as handleSecureMessage } from "../../bot-secure.js";
import { ensureBalanceRow, getBalance } from "../../credits.js";
import { normalizeLang, t } from "../../i18n.js";
import {
  isFaChannelMember,
  isMandatoryFaMembershipEnabled,
} from "../../mandatory-channel.js";
import { getPendingPayment } from "../../payments.js";
import {
  buildReferralStartParam,
  parseReferralStartParam,
  registerReferralFromStartParam,
} from "../../referrals.js";
import { getState } from "../../state.js";
import {
  answerCallback,
  deleteMessage,
  editMessage,
  sendMessage,
} from "../../telegram-actions.js";
import { botMethodUrl, tgJson } from "../../telegram-api.js";
import { isLockedVoice } from "../../voices.js";
import {
  getVexaLiveAccessSettings,
  setVexaLiveAccessSettings,
} from "./access.js";
import {
  downloadTelegramYouTubeMedia,
  extractYouTubeUrl,
  getTelegramYouTubeOptions,
} from "./youtube-download-exec.js";

const SECTION_KEY = "live";
const SECTION_LABEL = "Vexa Live";
const LOCK_ACTION = "vexa_live_lock_minutes";
const YOUTUBE_CALLBACK_PREFIX = "ytdl:";
const YOUTUBE_WORKFLOW_KIND = "youtube_download";

let botUsernameCache = "";

MINI_APP_BROADCAST_SECTIONS[SECTION_KEY] = SECTION_LABEL;
MINI_APP_TRACKED_SECTIONS[SECTION_KEY] = SECTION_LABEL;

export async function handleCallback(query, env) {
  const data = String(query?.data || "");

  if (data.startsWith(YOUTUBE_CALLBACK_PREFIX)) {
    return handleYouTubeDownloadCallback(query, env);
  }

  if (data === "admin_mini_app_access") {
    return showAccessPanel(query, env);
  }

  if (data === "admin_vexa_live_lock_prompt") {
    return promptVexaLiveLock(query, env);
  }

  if (data === "admin_vexa_live_unlock") {
    return unlockVexaLive(query, env);
  }

  return handleBaseCallback(query, env);
}

export async function handleMessage(message, env) {
  const userId = message?.from?.id;
  const referralPayload = extractReferralPayload(message?.text);

  if (referralPayload) {
    await registerBotReferralStart(message, env, referralPayload).catch((error) => {
      console.error("bot referral registration failed", error?.message || error);
    });
    message = { ...message, text: "/start" };
  }

  if (await handleYouTubeLinkMessage(message, env)) {
    return;
  }

  if (!userId || !(await isAdmin(env, userId))) {
    const referralContext = await getInsufficientReferralContext(message, env).catch(() => null);
    await handleSecureMessage(message, env);
    if (referralContext) {
      await enhanceInsufficientCreditsMenu(env, referralContext).catch((error) => {
        console.error("bot insufficient-credit referral UI failed", error?.message || error);
      });
    }
    return;
  }

  const action = await getAdminAction(env, userId);
  if (action?.action !== LOCK_ACTION) {
    return handleSecureMessage(message, env);
  }

  return handleVexaLiveLockInput(message, env, action);
}

async function handleYouTubeLinkMessage(message, env) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  const sourceUrl = extractYouTubeUrl(text);
  if (!userId || !chatId || message?.chat?.type !== "private" || !sourceUrl) return false;

  const adminAction = await getAdminAction(env, userId).catch(() => null);
  if (adminAction) return false;

  const pending = await getPendingPayment(env, userId).catch(() => null);
  const pendingId = String(pending?.package_id || "");
  if (pendingId.startsWith("input") || pendingId.startsWith("custom:")) return false;

  const state = await getState(env, userId).catch(() => null);
  if (!state?.language) return false;

  const admin = await isAdmin(env, userId).catch(() => false);
  if (
    state.language === "fa" &&
    !admin &&
    await isMandatoryFaMembershipEnabled(env).catch(() => false)
  ) {
    const member = await isFaChannelMember(env, userId).catch(() => false);
    if (!member) return false;
  }

  await trackUser(env, message.from).catch(() => null);
  await ensureBalanceRow(env, userId).catch(() => null);

  const copy = youtubeDownloadCopy(state.language);
  try {
    const prepared = await getTelegramYouTubeOptions(env, userId, sourceUrl);
    const keyboard = youtubeDownloadKeyboard(prepared.options, copy);
    const details = prepared.options.length
      ? prepared.options.map((option) => option.label + " " + formatMegabytes(option.sizeBytes)).join(" · ")
      : "";
    await sendMessage(
      env,
      chatId,
      [
        "<b>" + escapeHtml(copy.title) + "</b>",
        "",
        escapeHtml(prepared.title),
        details ? escapeHtml(details) : "",
        "",
        escapeHtml(copy.choose),
        "",
        "<code>" + escapeHtml(prepared.sourceUrl) + "</code>",
      ].filter(Boolean).join("\n"),
      keyboard,
    );
  } catch (error) {
    console.error("bot YouTube inspect failed", error?.stack || error);
    await sendMessage(env, chatId, "⚠️ " + escapeHtml(publicYouTubeMessage(error, copy.failed)));
  }
  return true;
}

async function handleYouTubeDownloadCallback(query, env) {
  const context = callbackContext(query);
  const data = String(query?.data || "");
  const optionKey = data.slice(YOUTUBE_CALLBACK_PREFIX.length);
  const sourceUrl = extractYouTubeUrl(query?.message?.text || "");
  if (!context || !sourceUrl || !/^(?:a|v\d{2,4})$/u.test(optionKey)) {
    await answerCallback(env, query?.id, "Download selection expired", true).catch(() => null);
    return;
  }

  const state = await getState(env, context.userId).catch(() => null);
  const language = normalizeLang(state?.language || "en");
  const copy = youtubeDownloadCopy(language);
  await answerCallback(env, query.id, copy.preparing, false).catch(() => null);
  await editMessage(
    env,
    context.chatId,
    context.messageId,
    "⏳ " + escapeHtml(copy.preparing) + "\n\n<code>" + escapeHtml(sourceUrl) + "</code>",
    { inline_keyboard: [] },
  ).catch(() => null);

  try {
    if (!env.AI_CODING_WORKFLOW) {
      throw new Error("YouTube download is temporarily unavailable");
    }
    const workflowId = "yt-" + crypto.randomUUID();
    await env.AI_CODING_WORKFLOW.create({
      id: workflowId,
      params: {
        kind: YOUTUBE_WORKFLOW_KIND,
        userId: String(context.userId),
        chatId: Number(context.chatId),
        messageId: Number(context.messageId),
        sourceUrl,
        optionKey,
        language,
      },
      retention: { successRetention: "1 day", errorRetention: "1 day" },
    });
  } catch (error) {
    console.error("bot YouTube workflow enqueue failed", error?.stack || error);
    await editMessage(
      env,
      context.chatId,
      context.messageId,
      "⚠️ " + escapeHtml(publicYouTubeMessage(error, copy.failed)),
    ).catch(() => null);
  }
}

export async function runYouTubeDownloadWorkflowJob(env, payload) {
  const userId = String(payload?.userId || "").trim();
  const chatId = Number(payload?.chatId || 0);
  const messageId = Number(payload?.messageId || 0);
  const sourceUrl = extractYouTubeUrl(payload?.sourceUrl || "");
  const optionKey = String(payload?.optionKey || "").trim();
  const language = normalizeLang(payload?.language || "en");
  const copy = youtubeDownloadCopy(language);

  if (
    !userId ||
    !Number.isSafeInteger(chatId) ||
    !Number.isSafeInteger(messageId) ||
    !chatId ||
    messageId <= 0 ||
    !sourceUrl ||
    !/^(?:a|v\d{2,4})$/u.test(optionKey)
  ) {
    throw new Error("YouTube download workflow payload is invalid");
  }

  try {
    const media = await downloadTelegramYouTubeMedia(env, userId, sourceUrl, optionKey);
    await sendTelegramMediaStream(env, chatId, media);
    await editMessage(
      env,
      chatId,
      messageId,
      "✅ " + escapeHtml(copy.sent) + " · " + escapeHtml(media.label),
    ).catch(() => null);
    return { ok: true, label: media.label };
  } catch (error) {
    console.error("bot YouTube workflow download failed", error?.stack || error);
    await editMessage(
      env,
      chatId,
      messageId,
      "⚠️ " + escapeHtml(publicYouTubeMessage(error, copy.failed)),
    ).catch(() => null);
    throw error;
  }
}

async function sendTelegramMediaStream(env, chatId, media) {
  const method = media.kind === "audio" ? "sendAudio" : "sendVideo";
  const fileField = media.kind === "audio" ? "audio" : "video";
  const boundary = "----Vexa" + crypto.randomUUID().replace(/-/g, "");
  const encoder = new TextEncoder();
  const fields = [
    ["chat_id", String(chatId)],
  ];
  if (media.kind === "audio") {
    fields.push(["title", String(media.title || "YouTube audio").slice(0, 128)]);
  } else {
    fields.push(["supports_streaming", "true"]);
    fields.push(["caption", String(media.title || "YouTube video").slice(0, 1024)]);
  }

  let prefix = "";
  for (const [name, value] of fields) {
    prefix += "--" + boundary + "\r\n" +
      'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
      value + "\r\n";
  }
  prefix += "--" + boundary + "\r\n" +
    'Content-Disposition: form-data; name="' + fileField + '"; filename="' + media.filename + '"\r\n' +
    "Content-Type: " + media.mimeType + "\r\n\r\n";
  const suffix = "\r\n--" + boundary + "--\r\n";
  const source = media.stream.getReader();
  let sentBytes = 0;
  const maxBytes = 49 * 1024 * 1024;
  let sentPrefix = false;
  let sentSuffix = false;

  const body = new ReadableStream({
    async pull(controller) {
      if (!sentPrefix) {
        sentPrefix = true;
        controller.enqueue(encoder.encode(prefix));
        return;
      }
      const next = await source.read();
      if (!next.done) {
        if (next.value?.byteLength) {
          sentBytes += next.value.byteLength;
          if (sentBytes > maxBytes) {
            try { await source.cancel("telegram_file_limit"); } catch (error) {}
            controller.error(new Error("This download is too large for Telegram"));
            return;
          }
          controller.enqueue(next.value);
        }
        return;
      }
      if (!sentSuffix) {
        sentSuffix = true;
        controller.enqueue(encoder.encode(suffix));
        return;
      }
      controller.close();
    },
    async cancel(reason) {
      try { await source.cancel(reason); } catch (error) {}
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("telegram_media_timeout"), 120_000);
  try {
    const response = await fetch(botMethodUrl(env, method), {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
      body,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error("Telegram media upload failed");
    }
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Telegram media upload timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function youtubeDownloadKeyboard(options, copy) {
  const videoButtons = options
    .filter((option) => option.kind === "video")
    .map((option) => ({
      text: "🎬 " + option.label + " · " + formatMegabytes(option.sizeBytes),
      callback_data: YOUTUBE_CALLBACK_PREFIX + option.key,
    }));
  const rows = [];
  for (let index = 0; index < videoButtons.length; index += 2) {
    rows.push(videoButtons.slice(index, index + 2));
  }
  const audio = options.find((option) => option.kind === "audio");
  if (audio) {
    rows.push([{
      text: "🎵 " + copy.audioOnly + " · " + formatMegabytes(audio.sizeBytes),
      callback_data: YOUTUBE_CALLBACK_PREFIX + audio.key,
    }]);
  }
  return { inline_keyboard: rows };
}

function youtubeDownloadCopy(language) {
  if (normalizeLang(language || "en") === "fa") {
    return {
      title: "دانلود از یوتیوب",
      choose: "کیفیت ویدیو را انتخاب کن، یا فقط صدا را دانلود کن:",
      audioOnly: "فقط صدا",
      preparing: "در حال آماده‌سازی فایل…",
      sent: "فایل آماده شد",
      failed: "دانلود یوتیوب فعلاً انجام نشد",
    };
  }
  return {
    title: "YouTube download",
    choose: "Choose a video quality, or download audio only:",
    audioOnly: "Audio only",
    preparing: "Preparing the file…",
    sent: "File ready",
    failed: "YouTube download is temporarily unavailable",
  };
}

function formatMegabytes(bytes) {
  const value = Number(bytes || 0) / (1024 * 1024);
  if (!Number.isFinite(value) || value <= 0) return "";
  return "~" + (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + " MB";
}

function publicYouTubeMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  if (!message || message.length > 180) return fallback;
  return message;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractReferralPayload(value) {
  const match = String(value || "").trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  const payload = String(match?.[1] || "").trim();
  return parseReferralStartParam(payload) ? payload : "";
}

async function registerBotReferralStart(message, env, payload) {
  const userId = message?.from?.id;
  if (!userId || message?.chat?.type !== "private") return;

  const parsed = parseReferralStartParam(payload);
  if (!parsed) return;

  const alreadyTracked = await hasTrackedUser(env, userId).catch(() => true);
  if (alreadyTracked) return;

  const referrerExists = await hasTrackedUser(env, parsed.referrerUserId).catch(() => false);
  if (!referrerExists) return;

  await registerReferralFromStartParam(env, userId, payload);
}

async function getInsufficientReferralContext(message, env) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!userId || !chatId || !text || text.startsWith("/")) return null;
  if (
    message?.photo ||
    message?.audio ||
    message?.voice ||
    message?.video ||
    message?.video_note ||
    message?.document
  ) return null;

  const state = await getState(env, userId).catch(() => null);
  if (!state?.language) return null;

  const adminAction = await getAdminAction(env, userId).catch(() => null);
  if (adminAction) return null;

  const pending = await getPendingPayment(env, userId).catch(() => null);
  const pendingId = String(pending?.package_id || "");
  if (pendingId.startsWith("input") || pendingId.startsWith("custom:")) return null;

  const admin = await isAdmin(env, userId).catch(() => false);
  if (isLockedVoice(state.voice || "Nora") && !admin) return null;

  if (
    state.language === "fa" &&
    !admin &&
    await isMandatoryFaMembershipEnabled(env).catch(() => false)
  ) {
    const member = await isFaChannelMember(env, userId).catch(() => false);
    if (!member) return null;
  }

  const cost = Array.from(text).length;
  const balance = await getBalance(env, userId);
  if (balance >= cost) return null;

  return {
    userId,
    chatId,
    cost,
    balance,
    language: normalizeLang(state.language || message?.from?.language_code || "en"),
  };
}

async function enhanceInsufficientCreditsMenu(env, context) {
  const state = await getState(env, context.userId).catch(() => null);
  const messageId = Number(state?.menuMessageId || 0);
  if (!messageId) return;

  const copy = botReferralCopy(context.language);
  const username = await getBotUsername(env);
  const startParam = buildReferralStartParam(context.userId, "tts");
  const inviteUrl = `https://t.me/${username}?start=${encodeURIComponent(startParam)}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(copy.shareText)}`;

  const text = [
    t(context.language, "notEnough", { needed: context.cost, balance: context.balance }),
    "",
    t(context.language, "creditRule"),
    "",
    copy.offer,
  ].join("\n");

  await editMessage(env, context.chatId, messageId, text, {
    inline_keyboard: [[
      { text: t(context.language, "buyCredits"), callback_data: "insufficient_buy_credits" },
      { text: copy.invite, url: shareUrl },
    ]],
  });
}

async function getBotUsername(env) {
  if (botUsernameCache) return botUsernameCache;
  const me = await tgJson(env, "getMe");
  const username = String(me?.username || "").replace(/^@/, "").trim();
  if (!username) throw new Error("Bot username is unavailable");
  botUsernameCache = username;
  return username;
}

function botReferralCopy(language) {
  return BOT_REFERRAL_COPY[language] || BOT_REFERRAL_COPY.en;
}

const BOT_REFERRAL_COPY = Object.freeze({
  en: {
    offer: "Buy credits, or invite <b>3 friends</b> and get <b>300 free credits</b>.",
    invite: "Invite friends",
    shareText: "🎙 Try Vexa — turn any text into a natural AI voice in seconds 👇",
  },
  fa: {
    offer: "یا کردیت بخر، یا <b>۳ تا از دوستاتو دعوت کن</b> و <b>۳۰۰ کردیت رایگان</b> بگیر.",
    invite: "دعوت از دوستا",
    shareText: "🎙 وکسا رو امتحان کن — هر متنی رو تو چند ثانیه به صدای طبیعی AI تبدیل می‌کنه 👇",
  },
  ru: {
    offer: "Купи кредиты или пригласи <b>3 друзей</b> и получи <b>300 бесплатных кредитов</b>.",
    invite: "Пригласить друзей",
    shareText: "🎙 Попробуй Vexa — превращай любой текст в естественную AI-озвучку за секунды 👇",
  },
  de: {
    offer: "Kaufe Credits oder lade <b>3 Freunde</b> ein und erhalte <b>300 kostenlose Credits</b>.",
    invite: "Freunde einladen",
    shareText: "🎙 Probier Vexa aus — verwandle jeden Text in Sekunden in eine natürliche KI-Stimme 👇",
  },
  tr: {
    offer: "Kredi satın al veya <b>3 arkadaşını davet et</b> ve <b>300 ücretsiz kredi</b> kazan.",
    invite: "Arkadaş davet et",
    shareText: "🎙 Vexa'yı dene — istediğin metni saniyeler içinde doğal bir AI sesine dönüştür 👇",
  },
  ar: {
    offer: "اشترِ رصيدًا أو ادعُ <b>3 أصدقاء</b> واحصل على <b>300 رصيد مجاني</b>.",
    invite: "دعوة أصدقاء",
    shareText: "🎙 جرّب Vexa — حوّل أي نص إلى صوت AI طبيعي خلال ثوانٍ 👇",
  },
  zh: {
    offer: "购买积分，或邀请 <b>3 位好友</b>，获得 <b>300 免费积分</b>。",
    invite: "邀请好友",
    shareText: "🎙 试试 Vexa — 几秒钟把任意文字变成自然的 AI 语音 👇",
  },
  ja: {
    offer: "クレジットを購入するか、<b>友達を3人招待</b>して<b>300無料クレジット</b>を獲得できます。",
    invite: "友達を招待",
    shareText: "🎙 Vexaを試してみて — テキストを数秒で自然なAI音声に変換できるよ 👇",
  },
  es: {
    offer: "Compra créditos o invita a <b>3 amigos</b> y recibe <b>300 créditos gratis</b>.",
    invite: "Invitar amigos",
    shareText: "🎙 Prueba Vexa — convierte cualquier texto en una voz IA natural en segundos 👇",
  },
  hi: {
    offer: "Credits खरीदो, या <b>3 दोस्तों को invite करो</b> और <b>300 free credits</b> पाओ।",
    invite: "दोस्तों को invite करें",
    shareText: "🎙 Vexa try करो — किसी भी text को seconds में natural AI voice में बदलो 👇",
  },
});

async function showAccessPanel(query, env) {
  const context = callbackContext(query);
  if (!context || !(await isAdmin(env, context.userId))) {
    return handleBaseCallback(query, env);
  }

  await clearAdminAction(env, context.userId);
  await answerCallback(env, query.id);
  await editMessage(
    env,
    context.chatId,
    context.messageId,
    await accessPanelText(env),
    await accessPanelKeyboard(env),
  );
}

async function promptVexaLiveLock(query, env) {
  const context = callbackContext(query);
  if (!context || !(await isAdmin(env, context.userId))) {
    return handleBaseCallback(query, env);
  }

  await answerCallback(env, query.id);
  await setAdminAction(env, context.userId, LOCK_ACTION, {
    chatId: context.chatId,
    messageId: context.messageId,
  });
  await editMessage(
    env,
    context.chatId,
    context.messageId,
    vexaLiveLockPromptText(),
    adminCancelKeyboard("admin_mini_app_access"),
  );
}

async function unlockVexaLive(query, env) {
  const context = callbackContext(query);
  if (!context || !(await isAdmin(env, context.userId))) {
    return handleBaseCallback(query, env);
  }

  await setVexaLiveAccessSettings(env, false, 0, 0);
  await clearAdminAction(env, context.userId);
  await answerCallback(env, query.id, "Vexa Live opened", false);
  await editMessage(
    env,
    context.chatId,
    context.messageId,
    (await accessPanelText(env)) + "\n\n✅ Vexa Live is open for everyone.",
    await accessPanelKeyboard(env),
  );
}

async function handleVexaLiveLockInput(message, env, action) {
  const adminId = message.from.id;
  const inputMessageId = message.message_id;
  const minutes = Number.parseInt(String(message.text || "").trim(), 10);
  const chatId = action.chat_id || message.chat?.id;
  const menuMessageId = Number(action.message_id || 0);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    if (chatId && menuMessageId) {
      await editMessage(
        env,
        chatId,
        menuMessageId,
        vexaLiveLockPromptText() +
          "\n\nInvalid duration. Send a positive number like <code>15</code>.",
        adminCancelKeyboard("admin_mini_app_access"),
      );
    }
    return;
  }

  const lockedFrom = Math.floor(Date.now() / 1000);
  const lockedUntil = lockedFrom + minutes * 60;

  await setVexaLiveAccessSettings(env, true, lockedUntil, lockedFrom);
  await clearAdminAction(env, adminId);

  if (message.chat?.id && inputMessageId) {
    await deleteMessage(env, message.chat.id, inputMessageId).catch(() => null);
  }

  if (chatId && menuMessageId) {
    await editMessage(
      env,
      chatId,
      menuMessageId,
      (await accessPanelText(env)) +
        "\n\n✅ Vexa Live locked for " + minutes + " minutes.",
      await accessPanelKeyboard(env),
    );
  }
}

async function accessPanelText(env) {
  const [baseText, live] = await Promise.all([
    adminMiniAppAccessText(env),
    getVexaLiveAccessSettings(env),
  ]);

  const lines = [
    baseText,
    "",
    "<b>Vexa Live</b>",
    "Status: <b>" + (live.adminOnly ? "Admin only" : "Open for everyone") + "</b>",
  ];

  if (live.adminOnly && live.lockedUntil > 0) {
    lines.push(
      "Auto unlock in: <b>" + formatDuration(live.remainingSeconds) + "</b>"
    );
  }

  return lines.join("\n");
}

async function accessPanelKeyboard(env) {
  const [baseKeyboard, live] = await Promise.all([
    adminMiniAppAccessKeyboard(env),
    getVexaLiveAccessSettings(env),
  ]);

  const rows = (baseKeyboard.inline_keyboard || []).map((row) =>
    row.map((button) => ({ ...button }))
  );

  const liveRow = live.adminOnly
    ? [{ text: "🔓 Open Vexa Live now", callback_data: "admin_vexa_live_unlock" }]
    : [{ text: "🔒 Lock Vexa Live", callback_data: "admin_vexa_live_lock_prompt" }];

  const backIndex = rows.findIndex((row) =>
    row.some((button) => button.callback_data === "admin_main")
  );

  if (backIndex >= 0) {
    rows.splice(backIndex, 0, liveRow);
  } else {
    rows.push(liveRow);
  }

  return { inline_keyboard: rows };
}

function vexaLiveLockPromptText() {
  return [
    "<b>Lock Vexa Live</b>",
    "",
    "Send how many minutes Vexa Live should stay admin-only.",
    "Example: <code>15</code>",
    "",
    "It opens automatically when the timer ends. Admins always keep access.",
  ].join("\n");
}

function callbackContext(query) {
  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;

  if (!userId || !chatId || !messageId) return null;
  return { userId, chatId, messageId };
}

function formatDuration(totalSeconds) {
  const minutes = Math.max(0, Math.ceil(Number(totalSeconds || 0) / 60));
  if (minutes < 60) return minutes.toLocaleString("en-US") + " min";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours.toLocaleString("en-US") + "h" +
    (rest ? " " + rest.toLocaleString("en-US") + "m" : "");
}