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
  createVexaDownloadAttempt,
  updateVexaDownloadAttempt,
  markLatestVexaLinkSuccessful,
  recordVexaLinkEvent,
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
  downloadTelegramYouTubeMediaPart,
  extractYouTubeUrl,
  getTelegramYouTubeOptions,
  prepareTelegramYouTubeMedia,
  snapshotTelegramYouTubeMedia,
} from "./youtube-download-exec.js";

const SECTION_KEY = "live";
const SECTION_LABEL = "Vexa Live";
const LOCK_ACTION = "vexa_live_lock_minutes";
const YOUTUBE_CALLBACK_PREFIX = "ytdl:";
const YOUTUBE_WORKFLOW_KIND = "youtube_download";
const VEXA_HANDOFF_REMINDER_KIND = "vexa_download_handoff_reminder";
const PROGRESS_EDIT_MIN_INTERVAL_MS = 1_100;
const MEDIA_PART_PREPARE_MAX_ATTEMPTS = 3;
const VEXA_PUBLIC_MINI_APP_URL = "https://vexaai.space/mini-app";

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

  const copy = youtubeDownloadCopy(state.language);
  const attemptId = await createVexaDownloadAttempt(env, {
    userId,
    sourceUrl,
    provider: /pornhub\./i.test(sourceUrl) ? "pornhub" : "youtube",
    channel: "bot",
    status: "pending",
    stage: "inspecting",
  }).catch(() => 0);
  let statusMessageId = 0;
  try {
    const status = await sendMessage(env, chatId, linkInspectStatusText(copy));
    statusMessageId = Number(status?.message_id || 0);
  } catch (error) {
    console.warn("bot media initial status failed", error?.message || error);
  }

  const bookkeeping = Promise.all([
    trackUser(env, message.from).catch(() => null),
    ensureBalanceRow(env, userId).catch(() => null),
    recordVexaLinkEvent(env, userId, sourceUrl, "bot").catch(() => null),
  ]);

  try {
    const prepared = await getTelegramYouTubeOptions(env, userId, sourceUrl);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "ready",
      stage: "quality_selection",
    }).catch(() => null);
    const keyboard = youtubeDownloadKeyboard(prepared.options, copy, attemptId);
    const details = prepared.options.length
      ? prepared.options.map((option) => option.label + " " + formatMegabytes(option.sizeBytes)).join(" · ")
      : "";
    const resultText = [
      "<b>" + escapeHtml(copy.title) + "</b>",
      "",
      escapeHtml(prepared.title),
      details ? escapeHtml(details) : "",
      "",
      escapeHtml(copy.choose),
      "",
      "<code>" + escapeHtml(prepared.sourceUrl) + "</code>",
    ].filter(Boolean).join("\n");

    if (statusMessageId) {
      const edited = await editMessage(env, chatId, statusMessageId, resultText, keyboard)
        .then(() => true)
        .catch(() => false);
      if (!edited) await sendMessage(env, chatId, resultText, keyboard);
    } else {
      await sendMessage(env, chatId, resultText, keyboard);
    }
  } catch (error) {
    console.error("bot YouTube inspect failed", error?.stack || error);
    const publicError = publicYouTubeMessage(error, copy.failed);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: "inspecting",
      errorMessage: publicError,
    }).catch(() => null);
    const errorText = "⚠️ " + escapeHtml(publicError);
    if (statusMessageId) {
      const edited = await editMessage(env, chatId, statusMessageId, errorText)
        .then(() => true)
        .catch(() => false);
      if (!edited) await sendMessage(env, chatId, errorText);
    } else {
      await sendMessage(env, chatId, errorText);
    }
  }
  await bookkeeping.catch(() => null);
  return true;
}

async function handleYouTubeDownloadCallback(query, env) {
  const context = callbackContext(query);
  const data = String(query?.data || "");
  const callbackValue = data.slice(YOUTUBE_CALLBACK_PREFIX.length);
  const callbackParts = callbackValue.split(":");
  const attemptId = /^\d+$/u.test(callbackParts[0] || "") ? Number(callbackParts[0]) : 0;
  const optionKey = attemptId ? String(callbackParts[1] || "") : callbackValue;
  const sourceUrl = extractYouTubeUrl(query?.message?.text || "");
  if (!context || !sourceUrl || !/^(?:a|v\d{2,4})$/u.test(optionKey)) {
    await answerCallback(env, query?.id, "Download selection expired", true).catch(() => null);
    return;
  }

  const state = await getState(env, context.userId).catch(() => null);
  const language = normalizeLang(state?.language || "en");
  const copy = youtubeDownloadCopy(language);
  await answerCallback(env, query.id, copy.openInApp, false).catch(() => null);
  await updateVexaDownloadAttempt(env, attemptId, {
    status: "handed_off",
    stage: "handed_off",
    optionKey,
  }).catch(() => null);

  const handoff = await createVexaDownloadHandoff(env, {
    attemptId,
    userId: context.userId,
    chatId: context.chatId,
    sourceUrl,
    optionKey,
    language,
  });
  const text = vexaDownloadHandoffText(language, optionKey);
  const keyboard = vexaDownloadHandoffKeyboard(handoff.miniAppUrl, language, optionKey);
  const edited = await editMessage(
    env,
    context.chatId,
    context.messageId,
    text,
    keyboard,
  ).then(() => true).catch(() => false);
  if (!edited) {
    await sendMessage(env, context.chatId, text, keyboard).catch(() => null);
  }
}

export async function createVexaDownloadHandoff(env, input = {}) {
  const userId = String(input.userId || "").trim();
  const chatId = Number(input.chatId || 0);
  const attemptId = Math.max(0, Math.floor(Number(input.attemptId || 0)));
  const sourceUrl = String(input.sourceUrl || "").trim();
  const optionKey = String(input.optionKey || "").trim();
  const language = normalizeLang(input.language || "en");
  const fallbackUrl = buildVexaDownloadUrl(sourceUrl, optionKey);
  if (
    !env?.AI_CODING_WORKFLOW ||
    !userId ||
    !Number.isSafeInteger(chatId) ||
    !chatId ||
    !attemptId ||
    !sourceUrl ||
    !/^(?:a|v\d{2,4}|s\d{1,3})$/u.test(optionKey)
  ) {
    return { miniAppUrl: fallbackUrl, workflowId: "" };
  }

  const workflowId = "vexa-handoff-" + userId + "-" + attemptId + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const miniAppUrl = buildVexaDownloadUrl(sourceUrl, optionKey, workflowId);
  try {
    await env.AI_CODING_WORKFLOW.create({
      id: workflowId,
      params: {
        kind: VEXA_HANDOFF_REMINDER_KIND,
        userId,
        chatId,
        attemptId,
        sourceUrl,
        optionKey,
        language,
        miniAppUrl,
      },
      retention: { successRetention: "1 day", errorRetention: "1 day" },
    });
    return { miniAppUrl, workflowId };
  } catch (error) {
    console.warn("Vexa handoff reminder workflow create failed", error?.message || error);
    return { miniAppUrl: fallbackUrl, workflowId: "" };
  }
}

export function vexaDownloadHandoffText(language, optionKey = "") {
  const fa = normalizeLang(language || "en") === "fa";
  const audio = String(optionKey || "") === "a";
  if (fa) {
    return [
      "<b>" + (audio ? "🎵 صدا انتخاب شد" : "🎬 کیفیت ویدیو انتخاب شد") + "</b>",
      "",
      "📲 برای دریافت " + (audio ? "صدا" : "ویدیو") + "، دکمه زیر را بزن.",
      "✨ ادامه دانلود داخل Vexa انجام می‌شود.",
    ].join("\n");
  }
  return [
    "<b>" + (audio ? "🎵 Audio selected" : "🎬 Video quality selected") + "</b>",
    "",
    "📲 Tap the button below to receive your " + (audio ? "audio" : "video") + ".",
    "✨ The download continues inside Vexa.",
  ].join("\n");
}

export function vexaDownloadHandoffKeyboard(miniAppUrl, language, optionKey = "") {
  const fa = normalizeLang(language || "en") === "fa";
  const audio = String(optionKey || "") === "a";
  return {
    inline_keyboard: [[{
      text: fa
        ? (audio ? "▶️ دریافت صدا" : "🪼 دریافت ویدیو")
        : (audio ? "▶️ Get audio" : "🪼 Get video"),
      web_app: { url: String(miniAppUrl || VEXA_PUBLIC_MINI_APP_URL) },
    }]],
  };
}

export async function runVexaDownloadHandoffReminder(env, payload = {}) {
  const chatId = Number(payload.chatId || 0);
  const userId = String(payload.userId || "").trim();
  const optionKey = String(payload.optionKey || "").trim();
  const language = normalizeLang(payload.language || "en");
  const miniAppUrl = String(payload.miniAppUrl || "").trim();
  if (!userId || !Number.isSafeInteger(chatId) || !chatId || !miniAppUrl) {
    throw new Error("Vexa handoff reminder payload is invalid");
  }

  const fa = language === "fa";
  const audio = optionKey === "a";
  const text = fa
    ? [
        "<b>⏳ " + (audio ? "صدات هنوز منتظرته" : "ویدیوت هنوز منتظرته") + "</b>",
        "",
        (audio ? "🎵" : "🎬") + " برای دریافت " + (audio ? "صدا" : "ویدیو") + "، دکمه زیر را بزن.",
        "📲 Vexa را باز کن تا دانلود ادامه پیدا کند.",
      ].join("\n")
    : [
        "<b>⏳ Your " + (audio ? "audio" : "video") + " is still waiting</b>",
        "",
        (audio ? "🎵" : "🎬") + " Tap the button below to receive your " + (audio ? "audio" : "video") + ".",
        "📲 Open Vexa to continue the download.",
      ].join("\n");
  await sendMessage(env, chatId, text, vexaDownloadHandoffKeyboard(miniAppUrl, language, optionKey));
  return { ok: true, reminded: true, userId };
}

export async function runYouTubeDownloadWorkflowJob(env, payload) {
  const userId = String(payload?.userId || "").trim();
  const chatId = Number(payload?.chatId || 0);
  const messageId = Number(payload?.messageId || 0);
  const sourceUrl = extractYouTubeUrl(payload?.sourceUrl || "");
  const optionKey = String(payload?.optionKey || "").trim();
  const language = normalizeLang(payload?.language || "en");
  const attemptId = Number(payload?.attemptId || 0);
  const startSeconds = Math.max(0, Number(payload?.startSeconds || 0));
  const partNumber = Math.max(1, Math.floor(Number(payload?.partNumber || 1)));
  const copy = youtubeDownloadCopy(language);

  if (
    !userId ||
    !Number.isSafeInteger(chatId) ||
    !Number.isSafeInteger(messageId) ||
    !chatId ||
    messageId <= 0 ||
    !sourceUrl ||
    !/^(?:a|v\d{2,4})$/u.test(optionKey) ||
    !Number.isFinite(startSeconds) ||
    !Number.isSafeInteger(partNumber)
  ) {
    throw new Error("YouTube download workflow payload is invalid");
  }

  const progressEditor = createProgressEditor(env, chatId, messageId);

  try {
    await progressEditor.update({ phase: "preparing", partNumber, percent: 0 }, copy, true);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: "preparing",
      optionKey,
    }).catch(() => null);

    let prepared = null;
    let media = null;
    let lastPrepareError = null;

    for (let attempt = 1; attempt <= MEDIA_PART_PREPARE_MAX_ATTEMPTS; attempt += 1) {
      try {
        prepared = await prepareTelegramYouTubeMedia(
          env,
          userId,
          sourceUrl,
          optionKey,
          attempt === 1 ? payload?.prepared || null : null,
        );

        let shownPercent = 0;
        const prepareProgress = (progress) => {
          const percent = Math.min(99, Math.round(clampPercent(progress?.percent)));
          if (percent <= shownPercent) return;
          shownPercent = percent;
          progressEditor.update({
            phase: "preparing",
            partNumber,
            percent: shownPercent,
          }, copy).catch(() => null);
        };

        media = await downloadTelegramYouTubeMediaPart(
          env,
          userId,
          prepared,
          startSeconds,
          partNumber,
          prepareProgress,
        );
        lastPrepareError = null;
        break;
      } catch (error) {
        lastPrepareError = error;
        if (attempt >= MEDIA_PART_PREPARE_MAX_ATTEMPTS || !isRetriableMediaPartError(error)) {
          throw error;
        }
        console.warn("bot media part preparation retry", {
          partNumber,
          attempt,
          error: String(error?.message || error).slice(0, 300),
        });
        await progressEditor.update({
          phase: "preparing",
          partNumber,
          percent: 0,
        }, copy, true);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    if (!prepared || !media) {
      throw lastPrepareError || new Error("Media part preparation failed");
    }

    const workflowPrepared = snapshotTelegramYouTubeMedia(prepared);
    if (!workflowPrepared) throw new Error("Prepared media state is invalid");
    const showPart = !media.done || Number(media.partNumber || 0) > 1;

    await progressEditor.update({
      phase: "uploading",
      partNumber: media.partNumber,
      showPart,
      percent: 0,
    }, copy, true);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: "telegram_upload",
      totalBytes: Number(prepared.selected?.sizeBytes || media.sizeBytes || 0),
    }).catch(() => null);
    const telegramMessage = await sendTelegramMediaStream(env, chatId, media, (upload) => {
      return progressEditor.update({
        phase: "uploading",
        partNumber: media.partNumber,
        showPart,
        percent: clampPercent(upload?.percent),
      }, copy);
    });
    await progressEditor.update({
      phase: "uploading",
      partNumber: media.partNumber,
      showPart,
      percent: 100,
    }, copy, true);

    if (!media.done) {
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "downloading",
        stage: "preparing",
        totalBytes: Number(prepared.selected?.sizeBytes || media.sizeBytes || 0),
        deliveryMessageId: Number(telegramMessage?.message_id || 0),
      }).catch(() => null);
      const nextStart = Number(media.nextStart || 0);
      if (!Number.isFinite(nextStart) || nextStart <= startSeconds) {
        throw new Error("Could not continue the Telegram video download");
      }
      await progressEditor.update({
        phase: "preparing",
        partNumber: media.partNumber + 1,
        percent: 0,
      }, copy, true);
      return {
        ok: true,
        label: media.label,
        part: media.partNumber,
        continued: true,
        nextPayload: {
          kind: YOUTUBE_WORKFLOW_KIND,
          userId,
          chatId,
          messageId,
          sourceUrl,
          optionKey,
          language,
          attemptId,
          startSeconds: nextStart,
          partNumber: media.partNumber + 1,
          prepared: workflowPrepared,
        },
      };
    }

    await progressEditor.update({ phase: "complete", partNumber: media.partNumber, percent: 100 }, copy, true);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "delivered",
      stage: "delivered",
      totalBytes: Number(prepared.selected?.sizeBytes || media.sizeBytes || 0),
      transferredBytes: Number(prepared.selected?.sizeBytes || media.sizeBytes || 0),
      deliveryMessageId: Number(telegramMessage?.message_id || 0),
    }).catch(() => null);
    await markLatestVexaLinkSuccessful(env, userId, sourceUrl).catch(() => null);
    if (Number(media.partNumber || 1) > 1) {
      await sendMultipartDownloadLink(env, chatId, sourceUrl, optionKey, copy).catch((error) => {
        console.warn("bot full video download link failed", error?.message || error);
      });
    }
    return { ok: true, label: media.label, parts: media.partNumber || 1 };
  } catch (error) {
    console.error("bot YouTube workflow download failed", error?.stack || error);
    const publicError = publicYouTubeMessage(error, copy.failed);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: "telegram_upload",
      errorMessage: publicError,
    }).catch(() => null);
    await progressEditor.editRaw(
      "⚠️ " + escapeHtml(publicError),
      true,
    ).catch(() => null);
    throw error;
  }
}

function isRetriableMediaPartError(error) {
  const message = String(error?.message || "").trim();
  return message === "YouTube download is temporarily unavailable"
    || message === "PornHub download is temporarily unavailable"
    || message === "YouTube could not prepare this video"
    || message === "PornHub could not prepare this video"
    || message === "YouTube blocked the Cloudflare download request (403)"
    || message === "PornHub blocked the Cloudflare download request";
}

async function sendTelegramMediaStream(env, chatId, media, onProgress = null) {
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
    const width = Math.floor(Number(media.width || 0));
    const height = Math.floor(Number(media.height || 0));
    const duration = Math.round(Number(media.duration || 0));
    fields.push(["supports_streaming", "true"]);
    if (Number.isSafeInteger(width) && width > 0) fields.push(["width", String(width)]);
    if (Number.isSafeInteger(height) && height > 0) fields.push(["height", String(height)]);
    if (Number.isSafeInteger(duration) && duration > 0) fields.push(["duration", String(duration)]);
    const partNumber = Number(media.partNumber || 0);
    const partLabel = (!media.done || partNumber > 1) && partNumber > 0 ? "\nPart " + partNumber : "";
    fields.push(["caption", (String(media.title || "YouTube video") + partLabel).slice(0, 1024)]);
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
  const maxBytes = 49_000_000;
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
          const totalBytes = Number(media.sizeBytes || 0);
          if (typeof onProgress === "function" && Number.isFinite(totalBytes) && totalBytes > 0) {
            const percent = Math.min(99, (sentBytes / totalBytes) * 100);
            Promise.resolve(onProgress({ percent, sentBytes, totalBytes })).catch(() => null);
          }
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
    const responseText = await response.text();
    let data = null;
    try {
      data = JSON.parse(responseText);
    } catch (error) {}
    if (!response.ok || !data?.ok) {
      const description = String(data?.description || responseText || "").trim().slice(0, 500);
      const errorCode = Number(data?.error_code || response.status || 0);
      console.error("Telegram media upload rejected", {
        status: response.status,
        errorCode,
        description,
        sentBytes,
        expectedBytes: Number(media.sizeBytes || 0),
        kind: media.kind,
        mimeType: media.mimeType,
      });
      if (response.status === 413 || errorCode === 413) {
        throw new Error("This download is too large for Telegram");
      }
      if (/file is too big|request entity too large|payload too large/i.test(description)) {
        throw new Error("This download is too large for Telegram");
      }
      if (/wrong file type|video.*invalid|failed to process|can(?:not|'t) parse|not enough data|file.*invalid|media.*invalid/i.test(description)) {
        throw new Error("Telegram rejected this media file");
      }
      throw new Error(description
        ? "Telegram media upload failed: " + description
        : "Telegram media upload failed (HTTP " + response.status + ", " + sentBytes + " bytes sent)");
    }
    if (typeof onProgress === "function") {
      const totalBytes = Number(media.sizeBytes || 0);
      await onProgress({
        percent: 100,
        sentBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : sentBytes,
        totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : sentBytes,
      });
    }
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Telegram media upload timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function youtubeDownloadKeyboard(options, copy, attemptId = 0) {
  const videoButtons = options
    .filter((option) => option.kind === "video")
    .map((option) => ({
      text: "🎬 " + option.label + " · " + formatMegabytes(option.sizeBytes),
      callback_data: YOUTUBE_CALLBACK_PREFIX + (attemptId ? String(attemptId) + ":" : "") + option.key,
    }));
  const rows = [];
  for (let index = 0; index < videoButtons.length; index += 2) {
    rows.push(videoButtons.slice(index, index + 2));
  }
  const audio = options.find((option) => option.kind === "audio");
  if (audio) {
    rows.push([{
      text: "🎵 " + copy.audioOnly + " · " + formatMegabytes(audio.sizeBytes),
      callback_data: YOUTUBE_CALLBACK_PREFIX + (attemptId ? String(attemptId) + ":" : "") + audio.key,
    }]);
  }
  return { inline_keyboard: rows };
}

function buildVexaDownloadUrl(sourceUrl, optionKey, workflowId = "") {
  const url = new URL(VEXA_PUBLIC_MINI_APP_URL);
  url.searchParams.set("section", "live");
  url.searchParams.set("vexaDownload", "1");
  url.searchParams.set("vexaSource", sourceUrl);
  if (/^(?:a|v\d{2,4}|s\d{1,3})$/u.test(String(optionKey || ""))) {
    url.searchParams.set("vexaOption", String(optionKey));
  }
  if (/^vexa-handoff-\d{1,20}-\d{1,20}-[a-f0-9]{12}$/iu.test(String(workflowId || ""))) {
    url.searchParams.set("vexaHandoff", String(workflowId));
  }
  return url.toString();
}

function buildFullVideoDownloadUrl(sourceUrl, optionKey) {
  return buildVexaDownloadUrl(sourceUrl, optionKey);
}

function multipartDownloadKeyboard(sourceUrl, optionKey, copy) {
  return {
    inline_keyboard: [[{
      text: copy.fullDownloadButton,
      web_app: { url: buildFullVideoDownloadUrl(sourceUrl, optionKey) },
    }]],
  };
}

async function sendMultipartDownloadLink(env, chatId, sourceUrl, optionKey, copy) {
  await sendMessage(
    env,
    chatId,
    "<b>🫧 " + escapeHtml(copy.fullDownload) + "</b>",
    multipartDownloadKeyboard(sourceUrl, optionKey, copy),
  );
}

function youtubeDownloadCopy(language) {
  if (normalizeLang(language || "en") === "fa") {
    return {
      title: "دانلود از یوتیوب",
      choose: "کیفیت ویدیو را انتخاب کن، یا فقط صدا را دانلود کن:",
      audioOnly: "فقط صدا",
      preparing: "در حال آماده‌سازی ویدیو",
      uploading: "در حال ارسال ویدیو",
      sent: "ویدیو آماده شد",
      failed: "دانلود یوتیوب فعلاً انجام نشد",
      received: "لینک دریافت شد",
      inspecting: "در حال بررسی ویدیو",
      preparingPart: "در حال آماده‌سازی پارت",
      adjustingPart: "در حال تنظیم اندازه پارت",
      uploadingPart: "در حال ارسال پارت",
      partSent: "پارت ارسال شد",
      overall: "کل ویدیو",
      remaining: "باقی‌مانده",
      openInApp: "ادامه در Vexa",
      continueInApp: "کیفیت انتخاب شد. برای دریافت ویدیو، Vexa را باز کن.",
      fullDownload: "برای دریافت ویدیو، دکمه زیر را بزن.",
      fullDownloadButton: "🪼 دریافت ویدیو",
    };
  }
  return {
    title: "YouTube download",
    choose: "Choose a video quality, or download audio only:",
    audioOnly: "Audio only",
    preparing: "Preparing video",
    uploading: "Sending video",
    sent: "Video ready",
    failed: "YouTube download is temporarily unavailable",
    received: "Link received",
    inspecting: "Checking video",
    preparingPart: "Preparing part",
    adjustingPart: "Adjusting part size",
    uploadingPart: "Sending part",
    partSent: "Part sent",
    overall: "Whole video",
    remaining: "Remaining",
    openInApp: "Continue in Vexa",
    continueInApp: "Quality selected. Open Vexa to receive your video.",
    fullDownload: "Tap the button below to receive your video.",
    fullDownloadButton: "🪼 Get video",
  };
}

function linkInspectStatusText(copy) {
  return "<b>🫧 " + escapeHtml(copy.inspecting) + "...</b>";
}

function createProgressEditor(env, chatId, messageId) {
  let lastEditAt = 0;
  let lastText = "";
  let queue = Promise.resolve();

  const editRaw = (text, force = false) => {
    const value = String(text || "");
    const now = Date.now();
    if (!force && (value === lastText || now - lastEditAt < PROGRESS_EDIT_MIN_INTERVAL_MS)) {
      return queue;
    }
    lastText = value;
    lastEditAt = now;
    queue = queue
      .catch(() => null)
      .then(() => editMessage(env, chatId, messageId, value).catch((error) => {
        console.warn("bot media progress edit failed", error?.message || error);
      }));
    return queue;
  };

  return {
    update(state, copy, force = false) {
      return editRaw(downloadProgressText(copy, state), force);
    },
    editRaw,
  };
}

function downloadProgressText(copy, state = {}) {
  const phase = String(state.phase || "preparing");
  if (phase === "complete") {
    return "<b>✔️ " + escapeHtml(copy.sent) + "</b>";
  }
  const partNumber = Math.max(1, Math.floor(Number(state.partNumber || 1)));
  const percent = Math.round(clampPercent(state.percent));
  const showPart = Boolean(state.showPart) || partNumber > 1;
  const label = phase === "uploading"
    ? showPart ? copy.uploadingPart + " " + partNumber : copy.uploading
    : showPart ? copy.preparingPart + " " + partNumber : copy.preparing;
  const icon = phase === "uploading" ? "🫧" : "🪼";
  return "<b>" + icon + " " + escapeHtml(label) + "... " + percent + "%</b>";
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
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
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "Invite friends",
    shareText: "🎙 Try Vexa — turn any text into a natural AI voice in seconds 👇",
  },
  fa: {
    offer: "موجودی دلاری اضافه کن، یا <b>۳ دوست</b> دعوت کن و <b>$0.05 رایگان</b> بگیر.",
    invite: "دعوت از دوستا",
    shareText: "🎙 وکسا رو امتحان کن — هر متنی رو تو چند ثانیه به صدای طبیعی AI تبدیل می‌کنه 👇",
  },
  ru: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "Пригласить друзей",
    shareText: "🎙 Попробуй Vexa — превращай любой текст в естественную AI-озвучку за секунды 👇",
  },
  de: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "Freunde einladen",
    shareText: "🎙 Probier Vexa aus — verwandle jeden Text in Sekunden in eine natürliche KI-Stimme 👇",
  },
  tr: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "Arkadaş davet et",
    shareText: "🎙 Vexa'yı dene — istediğin metni saniyeler içinde doğal bir AI sesine dönüştür 👇",
  },
  ar: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "دعوة أصدقاء",
    shareText: "🎙 جرّب Vexa — حوّل أي نص إلى صوت AI طبيعي خلال ثوانٍ 👇",
  },
  zh: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "邀请好友",
    shareText: "🎙 试试 Vexa — 几秒钟把任意文字变成自然的 AI 语音 👇",
  },
  ja: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "友達を招待",
    shareText: "🎙 Vexaを試してみて — テキストを数秒で自然なAI音声に変換できるよ 👇",
  },
  es: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
    invite: "Invitar amigos",
    shareText: "🎙 Prueba Vexa — convierte cualquier texto en una voz IA natural en segundos 👇",
  },
  hi: {
    offer: "Add USD balance, or invite <b>3 friends</b> and get <b>$0.05 free</b>.",
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
