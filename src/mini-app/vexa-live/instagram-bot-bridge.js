import {
  getAdminAction,
  isAdmin,
  recordVexaLinkEvent,
  trackUser,
} from "../../admin.js";
import {
  isFaChannelMember,
  isMandatoryFaMembershipEnabled,
} from "../../mandatory-channel.js";
import { getPendingPayment } from "../../payments.js";
import { getState } from "../../state.js";
import { sendMessage } from "../../telegram-actions.js";
import { normalizeInstagramUrl } from "./instagram-download.js";
import { normalizeInstagramStoryUrl } from "./instagram-story-download.js";

const VEXA_PUBLIC_MINI_APP_URL = "https://vexaai.space/mini-app";

export async function handleInstagramLinkMessage(message, env) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  const sourceUrl = extractInstagramUrl(text);
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

  const fa = state.language === "fa";
  const isStory = Boolean(normalizeInstagramStoryUrl(sourceUrl));
  const title = isStory
    ? (fa ? "دانلود استوری / هایلایت اینستاگرام" : "Instagram Story / Highlight")
    : (fa ? "دانلود از اینستاگرام" : "Instagram download");
  const detail = fa
    ? "برای انتخاب و دانلود، دکمه زیر را بزن."
    : "Tap below to choose and download.";
  const button = fa ? "🫧 باز کردن دانلودر" : "🫧 Open downloader";

  await sendMessage(
    env,
    chatId,
    "<b>" + escapeHtml(title) + "</b>\n\n" + escapeHtml(detail),
    {
      inline_keyboard: [[{
        text: button,
        web_app: { url: buildInstagramMiniAppUrl(sourceUrl) },
      }]],
    },
  );

  await Promise.all([
    trackUser(env, message.from).catch(() => null),
    recordVexaLinkEvent(env, userId, sourceUrl, "bot").catch(() => null),
  ]);
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

function buildInstagramMiniAppUrl(sourceUrl) {
  const url = new URL(VEXA_PUBLIC_MINI_APP_URL);
  url.searchParams.set("section", "live");
  url.searchParams.set("vexaDownload", "1");
  url.searchParams.set("vexaSource", sourceUrl);
  return url.toString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
