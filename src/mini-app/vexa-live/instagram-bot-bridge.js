import { getContainer } from "@cloudflare/containers";
import {
  getAdminAction,
  isAdmin,
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

const VEXA_PUBLIC_MINI_APP_URL = "https://vexaai.space/mini-app";
const INSTAGRAM_CALLBACK_PREFIX = "igdl:";
const INSTAGRAM_STORY_CALLBACK_PREFIX = "igstory:";
const TELEGRAM_SAFE_FILE_BYTES = 45_000_000;
const TELEGRAM_HARD_FILE_BYTES = 49_000_000;
const TELEGRAM_UPLOAD_TIMEOUT_MS = 120_000;

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
  let statusMessageId = 0;

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
    const options = Array.isArray(prepared?.options) ? prepared.options : [];
    if (!options.length) throw new Error(isStory
      ? "Instagram did not expose a downloadable Story video"
      : "Instagram did not expose a downloadable MP4 video");

    const keyboard = instagramDownloadKeyboard(options, sourceUrl, isStory, copy);
    const title = isStory
      ? (prepared.type === "live"
          ? copy.liveTitle
          : prepared.type === "highlight" ? copy.highlightTitle : copy.storyTitle)
      : copy.instagramTitle;
    const detail = isStory
      ? (prepared.type === "live" ? copy.chooseLive : copy.chooseStory)
      : copy.chooseQuality;
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
  } catch (error) {
    console.error("Instagram bot inspect failed", error?.stack || error);
    const errorText = "⚠️ " + escapeHtml(publicInstagramBotError(error));
    const fallback = instagramOpenKeyboard(sourceUrl, "", copy);
    if (statusMessageId) {
      const edited = await editMessage(env, chatId, statusMessageId, errorText, fallback)
        .then(() => true)
        .catch(() => false);
      if (!edited) await sendMessage(env, chatId, errorText, fallback);
    } else {
      await sendMessage(env, chatId, errorText, fallback);
    }
  }

  await bookkeeping.catch(() => null);
  return true;
}

export async function handleInstagramCallback(query, env) {
  const data = String(query?.data || "");
  const isStory = data.startsWith(INSTAGRAM_STORY_CALLBACK_PREFIX);
  const isMedia = data.startsWith(INSTAGRAM_CALLBACK_PREFIX);
  if (!isStory && !isMedia) return false;

  const prefix = isStory ? INSTAGRAM_STORY_CALLBACK_PREFIX : INSTAGRAM_CALLBACK_PREFIX;
  const optionKey = data.slice(prefix.length);
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

  try {
    const prepared = await inspectInstagram(env, userId, sourceUrl, isStory);
    const selected = (prepared.options || []).find((option) => option.key === optionKey) || null;
    if (!selected) throw new Error(copy.selectionExpired);

    if (Number(selected.sizeBytes || 0) > TELEGRAM_SAFE_FILE_BYTES) {
      await editMessage(
        env,
        chatId,
        messageId,
        "<b>" + escapeHtml(copy.tooLargeTitle) + "</b>\n\n" + escapeHtml(copy.tooLarge),
        instagramOpenKeyboard(sourceUrl, optionKey, copy),
      );
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

    await sendInstagramVideo(env, chatId, {
      stream,
      sizeBytes: Number(selected.sizeBytes || 0),
      filename: String(selected.filename || "Vexa-Instagram.mp4"),
      width: Number(selected.width || 0),
      height: Number(selected.height || 0),
      duration: Number(selected.duration || 0),
      title: String(prepared.title || (isStory ? "Instagram Story" : "Instagram video")),
    });

    await markLatestVexaLinkSuccessful(env, userId, sourceUrl).catch(() => null);
    await editMessage(
      env,
      chatId,
      messageId,
      "✅ <b>" + escapeHtml(copy.complete) + "</b>",
      instagramOpenKeyboard(sourceUrl, optionKey, copy),
    ).catch(() => null);
  } catch (error) {
    console.error("Instagram bot download failed", error?.stack || error);
    await editMessage(
      env,
      chatId,
      messageId,
      "⚠️ " + escapeHtml(publicInstagramBotError(error)),
      instagramOpenKeyboard(sourceUrl, optionKey, copy),
    ).catch(() => null);
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
  return { ...catalog, container, options: Array.isArray(catalog?.options) ? catalog.options : [] };
}

function instagramDownloadKeyboard(options, sourceUrl, isStory, copy) {
  const buttons = [];
  for (const option of options) {
    const key = String(option?.key || "");
    if (isStory ? !/^s\d{1,3}$/u.test(key) : !/^v\d{2,4}$/u.test(key)) continue;
    const tooLarge = option?.kind === "live" || Number(option?.sizeBytes || 0) > TELEGRAM_SAFE_FILE_BYTES;
    const text = isStory
      ? storyButtonText(option, tooLarge)
      : mediaButtonText(option, tooLarge);
    if (tooLarge) {
      buttons.push({
        text,
        web_app: { url: buildInstagramMiniAppUrl(sourceUrl, key) },
      });
    } else {
      buttons.push({
        text,
        callback_data: (isStory ? INSTAGRAM_STORY_CALLBACK_PREFIX : INSTAGRAM_CALLBACK_PREFIX) + key,
      });
    }
  }

  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  rows.push([{
    text: copy.openDownloader,
    web_app: { url: buildInstagramMiniAppUrl(sourceUrl) },
  }]);
  return { inline_keyboard: rows };
}

function instagramOpenKeyboard(sourceUrl, optionKey, copy) {
  return {
    inline_keyboard: [[{
      text: copy.openDownloader,
      web_app: { url: buildInstagramMiniAppUrl(sourceUrl, optionKey) },
    }]],
  };
}

function mediaButtonText(option, tooLarge) {
  const label = String(option?.label || option?.key || "Video");
  const size = formatMegabytes(option?.sizeBytes);
  return (tooLarge ? "↗️ " : "🎬 ") + label + (size ? " · " + size : "");
}

function storyButtonText(option, tooLarge) {
  if (option?.kind === "live") return "🔴 Record Instagram Live";
  const label = String(option?.label || option?.key || "Story");
  const height = Number(option?.height || 0);
  const size = formatMegabytes(option?.sizeBytes);
  const parts = [label];
  if (height > 0) parts.push(Math.floor(height) + "p");
  if (size) parts.push(size);
  return (tooLarge ? "↗️ " : "🎞️ ") + parts.join(" · ");
}

function buildInstagramMiniAppUrl(sourceUrl, optionKey = "") {
  const url = new URL(VEXA_PUBLIC_MINI_APP_URL);
  url.searchParams.set("section", "live");
  url.searchParams.set("vexaDownload", "1");
  url.searchParams.set("vexaSource", sourceUrl);
  if (/^(?:v\d{2,4}|s\d{1,3})$/u.test(String(optionKey || ""))) {
    url.searchParams.set("vexaOption", String(optionKey));
  }
  return url.toString();
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

async function readInstagramStream(stream, maxBytes) {
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
        throw new Error("This Instagram video is too large for Telegram");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    try { await reader.cancel("instagram_bot_read_failed"); } catch (cancelError) {}
    throw error;
  }
  if (!total) throw new Error("Instagram returned an empty video");
  return new Blob(chunks, { type: "video/mp4" });
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
      chooseLive: "برای شروع ضبط لایو، دانلودر را باز کن:",
      preparing: "در حال آماده‌سازی دانلود…",
      uploading: "در حال ارسال به تلگرام…",
      keepOpen: "تا پایان ارسال صبر کن.",
      complete: "دانلود ارسال شد",
      selectionExpired: "انتخاب دانلود منقضی شده است",
      tooLargeTitle: "فایل برای ارسال مستقیم بزرگ است",
      tooLarge: "این فایل از سقف امن ارسال مستقیم ربات بزرگ‌تر است. از دانلودر اینستاگرام بازش کن.",
      openDownloader: "🫧 باز کردن دانلودر اینستاگرام",
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
    chooseLive: "Open the downloader to start recording this Live:",
    preparing: "Preparing download…",
    uploading: "Sending to Telegram…",
    keepOpen: "Keep the chat open until it finishes.",
    complete: "Download sent",
    selectionExpired: "Download selection expired",
    tooLargeTitle: "File is too large for direct bot upload",
    tooLarge: "Open the Instagram downloader to download this file.",
    openDownloader: "🫧 Open Instagram downloader",
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
