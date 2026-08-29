import { getContainer } from "@cloudflare/containers";
import {
  getAdminAction,
  isAdmin,
  createVexaDownloadAttempt,
  updateVexaDownloadAttempt,
  markLatestVexaLinkSuccessful,
  recordVexaLinkEvent,
  trackUser,
} from "../../admin.js";
import {
  isFaChannelMember,
  isMandatoryFaMembershipEnabled,
} from "../../mandatory-channel.js";
import { getPendingPayment } from "../../payments.js";
import { getState } from "../../state.js";
import {
  answerCallback,
  editMessage,
  sendMessage,
} from "../../telegram-actions.js";
import { botMethodUrl } from "../../telegram-api.js";
import { normalizeInstagramUrl } from "./instagram-download.js";
import { normalizeInstagramStoryUrl } from "./instagram-story-download.js";

const INSTAGRAM_CALLBACK_PREFIX = "igdl:";
const INSTAGRAM_STORY_CALLBACK_PREFIX = "igstory:";
const INSTAGRAM_AUDIO_CALLBACK_PREFIX = "igaudio:";
const TELEGRAM_SAFE_FILE_BYTES = 45_000_000;
const TELEGRAM_HARD_FILE_BYTES = 49_000_000;
const TELEGRAM_UPLOAD_TIMEOUT_MS = 120_000;
const TELEGRAM_MEDIA_GROUP_MAX_ITEMS = 10;
const INSTAGRAM_FETCH_HEADERS = Object.freeze({
  "Referer": "https://www.instagram.com/",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
});

export async function handleInstagramLinkMessage(message, env) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  const sourceUrl = extractInstagramUrl(text);
  if (!userId || !chatId || message?.chat?.type !== "private" || !sourceUrl) return false;

  const context = await instagramUserContext(env, userId);
  if (!context) return false;

  const copy = instagramCopy(context.language);
  const isStory = Boolean(normalizeInstagramStoryUrl(sourceUrl));
  const attemptId = await createVexaDownloadAttempt(env, {
    userId,
    sourceUrl,
    provider: isStory ? "instagram_story" : "instagram",
    channel: "bot",
    kind: isStory ? "story" : "post",
    status: "pending",
    stage: "inspecting",
  }).catch(() => 0);
  let statusMessageId = 0;
  let lastStage = "inspecting";

  try {
    const status = await sendMessage(env, chatId, "<b>" + escapeHtml(copy.inspecting) + "</b>");
    statusMessageId = Number(status?.message_id || 0);
  } catch (error) {
    console.warn("Instagram bot initial status failed", error?.message || error);
  }

  const bookkeeping = Promise.all([
    trackUser(env, message.from).catch(() => null),
    recordVexaLinkEvent(env, userId, sourceUrl, "bot").catch(() => null),
  ]);

  try {
    const prepared = await inspectInstagram(env, userId, sourceUrl, isStory);

    if (!isStory) {
      const media = instagramPostMedia(prepared?.media);
      if (!media.length) throw new Error("Instagram did not expose downloadable media");
      const totalBytes = media.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes || 0)), 0);

      lastStage = "preparing";
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "downloading",
        stage: lastStage,
        totalBytes,
      }).catch(() => null);
      await editInstagramStatus(env, chatId, statusMessageId, "<b>🪼 " + escapeHtml(copy.preparingPost) + "</b>");

      lastStage = "telegram_upload";
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "downloading",
        stage: lastStage,
        totalBytes,
      }).catch(() => null);
      await editInstagramStatus(env, chatId, statusMessageId, "<b>🫧 " + escapeHtml(copy.uploadingPost) + "</b>\n\n" + escapeHtml(copy.keepOpen));

      const delivery = await sendInstagramPostMedia(
        env,
        chatId,
        media,
        String(prepared?.title || "Instagram post"),
        attemptId,
        copy,
      );
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "delivered",
        stage: "delivered",
        totalBytes,
        transferredBytes: Number(delivery.transferredBytes || totalBytes || 0),
        deliveryMessageId: Number(delivery.messageId || 0),
      }).catch(() => null);
      await markLatestVexaLinkSuccessful(env, userId, sourceUrl).catch(() => null);
      await editInstagramStatus(env, chatId, statusMessageId, "✅ <b>" + escapeHtml(copy.postComplete) + "</b>");
    } else {
      const options = Array.isArray(prepared?.options) ? prepared.options : [];
      if (!options.length) throw new Error("Instagram did not expose a downloadable Story video");

      lastStage = "quality_selection";
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "ready",
        stage: lastStage,
      }).catch(() => null);
      const keyboard = instagramDownloadKeyboard(options, sourceUrl, true, copy, attemptId);
      const title = prepared.type === "live"
        ? copy.liveTitle
        : prepared.type === "highlight" ? copy.highlightTitle : copy.storyTitle;
      const detail = prepared.type === "live" ? copy.chooseLive : copy.chooseStory;
      const resultText = [
        "<b>" + escapeHtml(title) + "</b>",
        "",
        prepared.title ? escapeHtml(prepared.title) : "",
        escapeHtml(detail),
        "",
        "<code>" + escapeHtml(sourceUrl) + "</code>",
      ].filter(Boolean).join("\n");

      if (statusMessageId) {
        const edited = await editMessage(env, chatId, statusMessageId, resultText, keyboard)
          .then(() => true)
          .catch(() => false);
        if (!edited) await sendMessage(env, chatId, resultText, keyboard);
      } else {
        await sendMessage(env, chatId, resultText, keyboard);
      }
    }
  } catch (error) {
    console.error("Instagram bot inspect/delivery failed", error?.stack || error);
    const publicError = publicInstagramBotError(error);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: lastStage,
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

export async function handleInstagramCallback(query, env) {
  const data = String(query?.data || "");
  if (data.startsWith(INSTAGRAM_AUDIO_CALLBACK_PREFIX)) {
    return handleInstagramAudioCallback(query, env);
  }

  const isStory = data.startsWith(INSTAGRAM_STORY_CALLBACK_PREFIX);
  const isMedia = data.startsWith(INSTAGRAM_CALLBACK_PREFIX);
  if (!isStory && !isMedia) return false;

  const prefix = isStory ? INSTAGRAM_STORY_CALLBACK_PREFIX : INSTAGRAM_CALLBACK_PREFIX;
  const callbackValue = data.slice(prefix.length);
  const callbackParts = callbackValue.split(":");
  const attemptId = /^\d+$/u.test(callbackParts[0] || "") ? Number(callbackParts[0]) : 0;
  const optionKey = attemptId ? String(callbackParts[1] || "") : callbackValue;
  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  const sourceUrl = extractInstagramUrl(query?.message?.text || "");
  const validOption = isStory ? /^s\d{1,3}$/u.test(optionKey) : /^v\d{2,4}$/u.test(optionKey);

  if (
    !userId ||
    !chatId ||
    !messageId ||
    query?.message?.chat?.type !== "private" ||
    !sourceUrl ||
    !validOption ||
    Boolean(normalizeInstagramStoryUrl(sourceUrl)) !== isStory
  ) {
    await answerCallback(env, query?.id, "Download selection expired", true).catch(() => null);
    return true;
  }

  const context = await instagramUserContext(env, userId);
  if (!context) {
    await answerCallback(env, query?.id, "Download is unavailable", true).catch(() => null);
    return true;
  }

  const copy = instagramCopy(context.language);
  await answerCallback(env, query.id, copy.preparing, false).catch(() => null);
  await editMessage(
    env,
    chatId,
    messageId,
    "<b>" + escapeHtml(copy.preparing) + "</b>\n\n" + escapeHtml(copy.keepOpen),
    { inline_keyboard: [] },
  ).catch(() => null);

  let lastStage = "preparing";
  try {
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: lastStage,
      optionKey,
    }).catch(() => null);
    const prepared = await inspectInstagram(env, userId, sourceUrl, isStory);
    const selected = (prepared.options || []).find((option) => option.key === optionKey) || null;
    if (!selected) throw new Error(copy.selectionExpired);

    if (selected?.kind === "live" || Number(selected.sizeBytes || 0) > TELEGRAM_SAFE_FILE_BYTES) {
      await updateVexaDownloadAttempt(env, attemptId, {
        status: "failed",
        stage: lastStage,
        optionKey,
        totalBytes: Number(selected.sizeBytes || 0),
        errorMessage: copy.tooLarge,
      }).catch(() => null);
      await editMessage(
        env,
        chatId,
        messageId,
        "<b>" + escapeHtml(copy.tooLargeTitle) + "</b>\n\n" + escapeHtml(copy.tooLarge),
        { inline_keyboard: [] },
      ).catch(() => null);
      return true;
    }

    const stream = isStory
      ? await prepared.container.streamInstagramStory(
          sourceUrl,
          String(selected.formatId),
          Number(selected.playlistIndex || 1),
        )
      : await prepared.container.streamInstagramVideo(sourceUrl, String(selected.formatId));

    await editMessage(
      env,
      chatId,
      messageId,
      "<b>" + escapeHtml(copy.uploading) + "</b>\n\n" + escapeHtml(formatMegabytes(selected.sizeBytes) + " · " + copy.keepOpen),
      { inline_keyboard: [] },
    ).catch(() => null);

    lastStage = "telegram_upload";
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: lastStage,
      optionKey,
      totalBytes: Number(selected.sizeBytes || 0),
    }).catch(() => null);
    const telegramMessage = await sendInstagramVideo(env, chatId, {
      stream,
      sizeBytes: Number(selected.sizeBytes || 0),
      filename: String(selected.filename || "Vexa-Instagram.mp4"),
      width: Number(selected.width || 0),
      height: Number(selected.height || 0),
      duration: Number(selected.duration || 0),
      title: String(prepared.title || (isStory ? "Instagram Story" : "Instagram video")),
    });

    await updateVexaDownloadAttempt(env, attemptId, {
      status: "delivered",
      stage: "delivered",
      optionKey,
      totalBytes: Number(selected.sizeBytes || 0),
      transferredBytes: Number(selected.sizeBytes || 0),
      deliveryMessageId: Number(telegramMessage?.message_id || 0),
    }).catch(() => null);
    await markLatestVexaLinkSuccessful(env, userId, sourceUrl).catch(() => null);
    await editMessage(
      env,
      chatId,
      messageId,
      "✅ <b>" + escapeHtml(copy.complete) + "</b>",
      { inline_keyboard: [] },
    ).catch(() => null);
  } catch (error) {
    console.error("Instagram bot download failed", error?.stack || error);
    const publicError = publicInstagramBotError(error);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: lastStage,
      errorMessage: publicError,
    }).catch(() => null);
    await editMessage(
      env,
      chatId,
      messageId,
      "⚠️ " + escapeHtml(publicError),
      { inline_keyboard: [] },
    ).catch(() => null);
  }

  return true;
}

async function handleInstagramAudioCallback(query, env) {
  const data = String(query?.data || "");
  const originalAttemptId = Number.parseInt(data.slice(INSTAGRAM_AUDIO_CALLBACK_PREFIX.length), 10);
  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  if (
    !Number.isSafeInteger(originalAttemptId) ||
    originalAttemptId <= 0 ||
    !userId ||
    !chatId ||
    query?.message?.chat?.type !== "private"
  ) {
    await answerCallback(env, query?.id, "Audio download expired", true).catch(() => null);
    return true;
  }

  const row = await env.DB.prepare(
    "SELECT user_id, source_url, provider FROM vexa_download_attempts WHERE id = ?"
  ).bind(originalAttemptId).first().catch(() => null);
  const sourceUrl = normalizeInstagramUrl(row?.source_url);
  if (
    !row ||
    String(row.user_id) !== String(userId) ||
    String(row.provider || "") !== "instagram" ||
    !sourceUrl
  ) {
    await answerCallback(env, query?.id, "Audio download expired", true).catch(() => null);
    return true;
  }

  const context = await instagramUserContext(env, userId);
  if (!context || !env.VEXA_INSTAGRAM) {
    await answerCallback(env, query?.id, "Audio download is unavailable", true).catch(() => null);
    return true;
  }

  const copy = instagramCopy(context.language);
  await answerCallback(env, query.id, copy.preparingAudio, false).catch(() => null);
  const attemptId = await createVexaDownloadAttempt(env, {
    userId,
    sourceUrl,
    provider: "instagram",
    channel: "bot",
    kind: "audio",
    status: "pending",
    stage: "preparing",
  }).catch(() => 0);
  let lastStage = "preparing";
  let statusMessageId = 0;
  try {
    const status = await sendMessage(env, chatId, "<b>🪼 " + escapeHtml(copy.preparingAudio) + "</b>");
    statusMessageId = Number(status?.message_id || 0);
  } catch (error) {}

  try {
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: lastStage,
    }).catch(() => null);
    const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + String(userId));
    const stream = await container.streamInstagramAudio(sourceUrl);

    lastStage = "telegram_upload";
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "downloading",
      stage: lastStage,
    }).catch(() => null);
    await editInstagramStatus(
      env,
      chatId,
      statusMessageId,
      "<b>🫧 " + escapeHtml(copy.uploadingAudio) + "</b>\n\n" + escapeHtml(copy.keepOpen),
    );
    const telegramMessage = await sendInstagramAudio(env, chatId, {
      stream,
      title: "Instagram Reel audio",
      filename: "Vexa-Instagram-audio.m4a",
    });
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "delivered",
      stage: "delivered",
      deliveryMessageId: Number(telegramMessage?.message_id || 0),
    }).catch(() => null);
    await editInstagramStatus(env, chatId, statusMessageId, "✅ <b>" + escapeHtml(copy.audioComplete) + "</b>");
  } catch (error) {
    console.error("Instagram audio download failed", error?.stack || error);
    const publicError = publicInstagramBotError(error);
    await updateVexaDownloadAttempt(env, attemptId, {
      status: "failed",
      stage: lastStage,
      errorMessage: publicError,
    }).catch(() => null);
    await editInstagramStatus(env, chatId, statusMessageId, "⚠️ " + escapeHtml(publicError));
  }
  return true;
}

export function extractInstagramUrl(value) {
  const matches = String(value || "").match(/https:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;!?]+$/u, "");
    const story = normalizeInstagramStoryUrl(candidate);
    if (story) return story;
    const media = normalizeInstagramUrl(candidate);
    if (media) return media;
  }
  return "";
}

async function instagramUserContext(env, userId) {
  const adminAction = await getAdminAction(env, userId).catch(() => null);
  if (adminAction) return null;

  const pending = await getPendingPayment(env, userId).catch(() => null);
  const pendingId = String(pending?.package_id || "");
  if (pendingId.startsWith("input") || pendingId.startsWith("custom:")) return null;

  const state = await getState(env, userId).catch(() => null);
  if (!state?.language) return null;

  const admin = await isAdmin(env, userId).catch(() => false);
  if (
    state.language === "fa" &&
    !admin &&
    await isMandatoryFaMembershipEnabled(env).catch(() => false)
  ) {
    const member = await isFaChannelMember(env, userId).catch(() => false);
    if (!member) return null;
  }

  return { language: state.language, admin };
}

async function inspectInstagram(env, userId, sourceUrl, isStory) {
  const containerKey = String(userId);
  if (isStory) {
    if (!env.VEXA_INSTAGRAM_STORY) {
      throw new Error("Instagram Story download is temporarily unavailable");
    }
    const container = getContainer(env.VEXA_INSTAGRAM_STORY, "instagram-story-" + containerKey);
    const catalog = await container.getInstagramStoryCatalog(sourceUrl);
    return { ...catalog, container, options: Array.isArray(catalog?.options) ? catalog.options : [] };
  }

  if (!env.VEXA_INSTAGRAM) {
    throw new Error("Instagram download is temporarily unavailable");
  }
  const container = getContainer(env.VEXA_INSTAGRAM, "instagram-" + containerKey);
  const catalog = await container.getInstagramCatalog(sourceUrl);
  return {
    ...catalog,
    container,
    options: Array.isArray(catalog?.options) ? catalog.options : [],
    media: Array.isArray(catalog?.media) ? catalog.media : [],
  };
}

function instagramPostMedia(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const kind = item?.kind === "photo" ? "photo" : item?.kind === "video" ? "video" : "";
    const url = String(item?.url || "").trim();
    if (!kind || !isSafeInstagramMediaUrl(url)) return null;
    return {
      kind,
      url,
      width: Math.max(0, Math.floor(Number(item?.width || 0))),
      height: Math.max(0, Math.floor(Number(item?.height || 0))),
      duration: Math.max(0, Number(item?.duration || 0)),
      sizeBytes: Math.max(0, Number(item?.sizeBytes || 0)),
      filename: sanitizeFilename(item?.filename || (kind === "photo"
        ? "Vexa-Instagram-" + String(index + 1).padStart(2, "0") + ".jpg"
        : "Vexa-Instagram-" + String(index + 1).padStart(2, "0") + ".mp4")),
    };
  }).filter(Boolean);
}

function instagramDownloadKeyboard(options, sourceUrl, isStory, copy, attemptId = 0) {
  const buttons = [];
  for (const option of options) {
    const key = String(option?.key || "");
    if (isStory ? !/^s\d{1,3}$/u.test(key) : !/^v\d{2,4}$/u.test(key)) continue;
    const tooLarge = option?.kind === "live" || Number(option?.sizeBytes || 0) > TELEGRAM_SAFE_FILE_BYTES;
    const text = isStory
      ? storyButtonText(option, tooLarge)
      : mediaButtonText(option, tooLarge);
    buttons.push({
      text,
      callback_data: (isStory ? INSTAGRAM_STORY_CALLBACK_PREFIX : INSTAGRAM_CALLBACK_PREFIX) + (attemptId ? String(attemptId) + ":" : "") + key,
    });
  }

  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return { inline_keyboard: rows };
}

function instagramAudioKeyboard(attemptId, copy) {
  const id = Math.max(0, Math.floor(Number(attemptId || 0)));
  if (!id) return null;
  return {
    inline_keyboard: [[{
      text: copy.audioButton,
      callback_data: INSTAGRAM_AUDIO_CALLBACK_PREFIX + String(id),
    }]],
  };
}

function mediaButtonText(option, tooLarge) {
  const label = String(option?.label || option?.key || "Video");
  const size = formatMegabytes(option?.sizeBytes);
  return (tooLarge ? "⚠️ " : "🎬 ") + label + (size ? " · " + size : "");
}

function storyButtonText(option, tooLarge) {
  if (option?.kind === "live") return "🔴 Instagram Live";
  const label = String(option?.label || option?.key || "Story");
  const height = Number(option?.height || 0);
  const size = formatMegabytes(option?.sizeBytes);
  const parts = [label];
  if (height > 0) parts.push(Math.floor(height) + "p");
  if (size) parts.push(size);
  return (tooLarge ? "⚠️ " : "🎞️ ") + parts.join(" · ");
}

async function sendInstagramPostMedia(env, chatId, media, title, attemptId = 0, copy = instagramCopy("en")) {
  const items = instagramPostMedia(media);
  if (!items.length) throw new Error("Instagram did not expose downloadable media");
  for (const item of items) {
    if (item.kind === "video" && item.sizeBytes > TELEGRAM_HARD_FILE_BYTES) {
      throw new Error("This Instagram video is too large for Telegram");
    }
  }

  const audioKeyboard = items.length === 1 && items[0].kind === "video"
    ? instagramAudioKeyboard(attemptId, copy)
    : null;
  const batches = instagramMediaBatches(items);
  let messageId = 0;
  let transferredBytes = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const caption = index === 0 ? String(title || "Instagram post").slice(0, 1024) : "";
    const delivery = batch.length === 1
      ? await sendInstagramRemoteSingle(env, chatId, batch[0], caption, index === 0 ? audioKeyboard : null)
      : await sendInstagramRemoteGroup(env, chatId, batch, caption);
    if (!messageId) messageId = Number(delivery.messageId || 0);
    transferredBytes += Number(delivery.transferredBytes || 0);
  }
  return { messageId, transferredBytes, count: items.length };
}

function instagramMediaBatches(items) {
  if (items.length <= TELEGRAM_MEDIA_GROUP_MAX_ITEMS) return [items];
  const batches = [];
  let offset = 0;
  while (offset < items.length) {
    const remaining = items.length - offset;
    let take = Math.min(TELEGRAM_MEDIA_GROUP_MAX_ITEMS, remaining);
    if (remaining > TELEGRAM_MEDIA_GROUP_MAX_ITEMS && remaining - take === 1) take -= 1;
    batches.push(items.slice(offset, offset + take));
    offset += take;
  }
  return batches;
}

async function sendInstagramRemoteSingle(env, chatId, item, caption, replyMarkup = null) {
  const isPhoto = item.kind === "photo";
  const fieldName = isPhoto ? "photo" : "video";
  const fields = [["chat_id", String(chatId)]];
  if (caption) fields.push(["caption", caption]);
  if (replyMarkup?.inline_keyboard?.length) {
    fields.push(["reply_markup", JSON.stringify(replyMarkup)]);
  }
  if (!isPhoto) {
    fields.push(["supports_streaming", "true"]);
    if (item.width > 0) fields.push(["width", String(item.width)]);
    if (item.height > 0) fields.push(["height", String(item.height)]);
    if (item.duration > 0) fields.push(["duration", String(Math.round(item.duration))]);
  }
  const delivery = await sendInstagramMultipartRequest(
    env,
    isPhoto ? "sendPhoto" : "sendVideo",
    fields,
    [{ fieldName, item }],
  );
  return {
    messageId: Number(delivery.result?.message_id || 0),
    transferredBytes: delivery.transferredBytes,
  };
}

async function sendInstagramRemoteGroup(env, chatId, items, caption) {
  const media = items.map((item, index) => {
    const entry = {
      type: item.kind === "photo" ? "photo" : "video",
      media: "attach://media" + index,
    };
    if (index === 0 && caption) entry.caption = caption;
    if (item.kind === "video") {
      entry.supports_streaming = true;
      if (item.width > 0) entry.width = item.width;
      if (item.height > 0) entry.height = item.height;
      if (item.duration > 0) entry.duration = Math.round(item.duration);
    }
    return entry;
  });
  const delivery = await sendInstagramMultipartRequest(
    env,
    "sendMediaGroup",
    [
      ["chat_id", String(chatId)],
      ["media", JSON.stringify(media)],
    ],
    items.map((item, index) => ({ fieldName: "media" + index, item })),
  );
  const messages = Array.isArray(delivery.result) ? delivery.result : [];
  return {
    messageId: Number(messages[0]?.message_id || 0),
    transferredBytes: delivery.transferredBytes,
  };
}

async function sendInstagramMultipartRequest(env, method, fields, files) {
  const boundary = "----VexaInstagram" + crypto.randomUUID().replace(/-/g, "");
  const encoder = new TextEncoder();
  let fieldPrefix = "";
  for (const [name, value] of fields) {
    fieldPrefix += "--" + boundary + "\r\n" +
      'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
      String(value) + "\r\n";
  }

  let phase = "fields";
  let fileIndex = 0;
  let reader = null;
  let currentBytes = 0;
  let transferredBytes = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (phase === "fields") {
          phase = "file_header";
          controller.enqueue(encoder.encode(fieldPrefix));
          return;
        }
        if (phase === "file_header") {
          if (fileIndex >= files.length) {
            phase = "closing";
            controller.enqueue(encoder.encode("--" + boundary + "--\r\n"));
            return;
          }
          const file = files[fileIndex];
          const opened = await openInstagramRemoteMedia(file.item);
          reader = opened.stream.getReader();
          currentBytes = 0;
          phase = "file_body";
          controller.enqueue(encoder.encode(
            "--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="' + file.fieldName + '"; filename="' + sanitizeFilename(file.item.filename) + '"\r\n' +
            "Content-Type: " + opened.mimeType + "\r\n\r\n"
          ));
          return;
        }
        if (phase === "file_body") {
          const next = await reader.read();
          if (!next.done) {
            if (next.value?.byteLength) {
              currentBytes += next.value.byteLength;
              transferredBytes += next.value.byteLength;
              if (currentBytes > TELEGRAM_HARD_FILE_BYTES) {
                try { await reader.cancel("telegram_file_limit"); } catch (error) {}
                throw new Error("This Instagram media is too large for Telegram");
              }
              controller.enqueue(next.value);
            }
            return;
          }
          reader = null;
          fileIndex += 1;
          phase = "file_header";
          controller.enqueue(encoder.encode("\r\n"));
          return;
        }
        if (phase === "closing") {
          phase = "done";
          controller.close();
        }
      } catch (error) {
        phase = "done";
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader?.cancel?.(reason); } catch (error) {}
    },
  });

  const controller = new AbortController();
  const timeoutMs = Math.min(10 * 60_000, TELEGRAM_UPLOAD_TIMEOUT_MS * Math.max(1, files.length));
  const timer = setTimeout(() => controller.abort("instagram_telegram_timeout"), timeoutMs);
  try {
    const response = await fetch(botMethodUrl(env, method), {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (error) {}
    if (!response.ok || !data?.ok) {
      const description = String(data?.description || text || "").trim().slice(0, 500);
      if (response.status === 413 || /file is too big|request entity too large|payload too large/i.test(description)) {
        throw new Error("This Instagram media is too large for Telegram");
      }
      throw new Error(description ? "Telegram media upload failed: " + description : "Telegram media upload failed");
    }
    return { result: data.result, transferredBytes };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Telegram media upload timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function openInstagramRemoteMedia(item) {
  if (!item || !isSafeInstagramMediaUrl(item.url)) throw new Error("Instagram media URL is unavailable");
  const response = await fetch(item.url, {
    method: "GET",
    headers: INSTAGRAM_FETCH_HEADERS,
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    try { await response.body?.cancel?.(); } catch (error) {}
    throw new Error("Instagram media is temporarily unavailable");
  }
  const contentLength = Math.max(0, Number(response.headers.get("Content-Length") || 0));
  if (contentLength > TELEGRAM_HARD_FILE_BYTES) {
    try { await response.body.cancel(); } catch (error) {}
    throw new Error("This Instagram media is too large for Telegram");
  }
  const rawType = String(response.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  const mimeType = item.kind === "photo"
    ? (rawType.startsWith("image/") ? rawType : "image/jpeg")
    : (rawType.startsWith("video/") ? rawType : "video/mp4");
  return { stream: response.body, mimeType };
}

function isSafeInstagramMediaUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (error) { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "instagram.com" || host.endsWith(".instagram.com") ||
    host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") ||
    host === "fbcdn.net" || host.endsWith(".fbcdn.net");
}

async function editInstagramStatus(env, chatId, messageId, text) {
  if (messageId) {
    const edited = await editMessage(env, chatId, messageId, text)
      .then(() => true)
      .catch(() => false);
    if (edited) return;
  }
  await sendMessage(env, chatId, text).catch(() => null);
}

async function sendInstagramVideo(env, chatId, media) {
  const blob = await readInstagramStream(media.stream, TELEGRAM_HARD_FILE_BYTES);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("supports_streaming", "true");
  const width = Math.floor(Number(media.width || 0));
  const height = Math.floor(Number(media.height || 0));
  const duration = Math.round(Number(media.duration || 0));
  if (width > 0) form.append("width", String(width));
  if (height > 0) form.append("height", String(height));
  if (duration > 0) form.append("duration", String(duration));
  const caption = String(media.title || "Instagram video").slice(0, 1024);
  if (caption) form.append("caption", caption);
  form.append("video", blob, sanitizeFilename(media.filename));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("instagram_telegram_timeout"), TELEGRAM_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(botMethodUrl(env, "sendVideo"), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (error) {}
    if (!response.ok || !data?.ok) {
      const description = String(data?.description || text || "").trim().slice(0, 500);
      if (response.status === 413 || /file is too big|request entity too large|payload too large/i.test(description)) {
        throw new Error("This Instagram video is too large for Telegram");
      }
      throw new Error(description ? "Telegram media upload failed: " + description : "Telegram media upload failed");
    }
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Telegram media upload timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendInstagramAudio(env, chatId, media) {
  const blob = await readInstagramStream(
    media.stream,
    TELEGRAM_HARD_FILE_BYTES,
    "audio/mp4",
    "Instagram returned an empty audio stream",
    "This Instagram audio is too large for Telegram",
  );
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("title", String(media.title || "Instagram audio").slice(0, 128));
  form.append("audio", blob, sanitizeFilename(media.filename || "Vexa-Instagram-audio.m4a"));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("instagram_audio_telegram_timeout"), TELEGRAM_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(botMethodUrl(env, "sendAudio"), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (error) {}
    if (!response.ok || !data?.ok) {
      const description = String(data?.description || text || "").trim().slice(0, 500);
      if (response.status === 413 || /file is too big|request entity too large|payload too large/i.test(description)) {
        throw new Error("This Instagram audio is too large for Telegram");
      }
      throw new Error(description ? "Telegram media upload failed: " + description : "Telegram media upload failed");
    }
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Telegram media upload timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readInstagramStream(
  stream,
  maxBytes,
  mimeType = "video/mp4",
  emptyMessage = "Instagram returned an empty video",
  tooLargeMessage = "This Instagram video is too large for Telegram",
) {
  if (!stream?.getReader) throw new Error("Could not start the Instagram download");
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      total += next.value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel("telegram_file_limit"); } catch (error) {}
        throw new Error(tooLargeMessage);
      }
      chunks.push(next.value);
    }
  } catch (error) {
    try { await reader.cancel("instagram_bot_read_failed"); } catch (cancelError) {}
    throw error;
  }
  if (!total) throw new Error(emptyMessage);
  return new Blob(chunks, { type: mimeType });
}

function sanitizeFilename(value) {
  const clean = String(value || "Vexa-Instagram.mp4").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
  return clean || "Vexa-Instagram.mp4";
}

function formatMegabytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  return (size / 1048576).toFixed(size >= 10 * 1048576 ? 0 : 1) + " MB";
}

function publicInstagramBotError(error) {
  const message = String(error?.message || "").trim();
  if (
    /^Instagram /i.test(message) ||
    /^This Instagram /i.test(message) ||
    /^Could not start the Instagram /i.test(message) ||
    /^Telegram media upload /i.test(message)
  ) return message;
  return "Instagram download is temporarily unavailable";
}

function instagramCopy(language) {
  if (String(language || "").toLowerCase() === "fa") {
    return {
      inspecting: "در حال بررسی لینک اینستاگرام…",
      instagramTitle: "دانلود از اینستاگرام",
      storyTitle: "دانلود استوری اینستاگرام",
      highlightTitle: "دانلود هایلایت اینستاگرام",
      liveTitle: "ضبط لایو اینستاگرام",
      chooseQuality: "کیفیت ویدیو را انتخاب کن:",
      chooseStory: "استوری یا کلیپ هایلایت را انتخاب کن:",
      chooseLive: "ضبط لایو داخل چت پشتیبانی نمی‌شود.",
      preparing: "در حال آماده‌سازی ویدیو…",
      uploading: "در حال ارسال ویدیو به تلگرام…",
      preparingPost: "در حال آماده‌سازی پست اینستاگرام…",
      uploadingPost: "در حال ارسال پست به تلگرام…",
      preparingAudio: "در حال آماده‌سازی صدا…",
      uploadingAudio: "در حال ارسال صدا به تلگرام…",
      audioButton: "🎵 دانلود صدا",
      audioComplete: "صدا ارسال شد",
      keepOpen: "تا پایان ارسال صبر کن.",
      complete: "ویدیو ارسال شد",
      postComplete: "پست ارسال شد",
      selectionExpired: "انتخاب دانلود منقضی شده است",
      tooLargeTitle: "ویدیو برای ارسال مستقیم بزرگ است",
      tooLarge: "این ویدیو در چت تلگرام قابل ارسال نیست.",
    };
  }
  return {
    inspecting: "Inspecting Instagram link…",
    instagramTitle: "Instagram download",
    storyTitle: "Instagram Story download",
    highlightTitle: "Instagram Highlight download",
    liveTitle: "Instagram Live recording",
    chooseQuality: "Choose video quality:",
    chooseStory: "Choose a Story or Highlight clip:",
    chooseLive: "Live recording is not supported in chat.",
    preparing: "Preparing video…",
    uploading: "Sending video to Telegram…",
    preparingPost: "Preparing Instagram post…",
    uploadingPost: "Sending post to Telegram…",
    preparingAudio: "Preparing audio…",
    uploadingAudio: "Sending audio to Telegram…",
    audioButton: "🎵 Download audio",
    audioComplete: "Audio sent",
    keepOpen: "Keep the chat open until it finishes.",
    complete: "Video sent",
    postComplete: "Post sent",
    selectionExpired: "Download selection expired",
    tooLargeTitle: "Video is too large for direct bot upload",
    tooLarge: "This video cannot be sent directly in Telegram chat.",
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
