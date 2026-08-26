import { MINI_APP_ENTRY_SECTIONS, adminMiniAppEntryKeyboard, getMiniAppDefaultSection, hasTrackedUser, isAdmin } from "./admin.js";
import { handleCallback as baseHandleCallback, handleMessage as baseHandleMessage } from "./bot.js";
import { getState, setAppMode } from "./state.js";
import { editMessage } from "./telegram-actions.js";
import { tgJson } from "./telegram-api.js";
import { userMainKeyboard, startText } from "./ui.js";

const MINI_APP_START_MODES = new Set(["tts", "image", "explore", "ai_chat", "stt", "live"]);

export async function handleMessage(message, env) {
  const text = String(message?.text || "").trim();
  const requestedMode = miniAppStartMode(text);
  const plainStart = /^\/start(?:@\w+)?$/i.test(text);
  if (!plainStart && !requestedMode) {
    await baseHandleMessage(message, env);
    return;
  }

  const userId = message?.from?.id;
  if (userId) {
    let mode = requestedMode;
    if (!mode && !(await hasTrackedUser(env, userId))) {
      mode = await getMiniAppDefaultSection(env).catch(() => "tts");
    }
    if (mode) await setAppMode(env, userId, mode);
  }

  const startMessage = text === "/start" ? message : { ...message, text: "/start" };
  await baseHandleMessage(startMessage, env);
}

export function isMiniAppEntryStart(text) {
  const value = String(text || "").trim();
  return /^\/start(?:@\w+)?$/i.test(value) || Boolean(miniAppStartMode(value));
}

function miniAppStartMode(text) {
  const match = String(text || "").trim().match(/^\/start(?:@\w+)?\s+app_([a-z0-9_-]+)$/i);
  if (!match) return "";
  const mode = String(match[1] || "").toLowerCase();
  return MINI_APP_START_MODES.has(mode) ? mode : "";
}

export async function handleCallback(query, env) {
  await baseHandleCallback(query, env);
  const data = query.data || "";
  if (isMiniAppEntryCallback(data)) {
    if (await isAdmin(env, query.from && query.from.id)) {
      await refreshMiniAppEntryPanel(query, env);
    }
    return;
  }
  if (!shouldRefresh(data)) return;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const userId = query.from && query.from.id;
  await refreshMainMenu(chatId, userId, env);
}

async function refreshMiniAppEntryPanel(query, env) {
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!chatId || !messageId) return;

  const selected = await getMiniAppDefaultSection(env);
  const bot = await tgJson(env, "getMe", {}).catch(() => null);
  const username = String(bot?.username || env.BOT_USERNAME || "").replace(/^@/, "");
  const lines = [
    "🚪 <b>Mini App Entry Section</b>",
    "",
    "Default section for new users: <b>" + MINI_APP_ENTRY_SECTIONS[selected] + "</b>",
    "A saved user selection stays primary until the user changes it. A section link explicitly changes the user's primary.",
    "",
    "<b>Section links</b>",
  ];

  for (const [section, label] of Object.entries(MINI_APP_ENTRY_SECTIONS)) {
    const miniAppLink = username ? `https://t.me/${username}?startapp=${section}` : `?startapp=${section}`;
    const botStartLink = username ? `https://t.me/${username}?start=app_${section}` : `?start=app_${section}`;
    lines.push(
      "<b>" + label + "</b>",
      "Mini App: <code>" + miniAppLink + "</code>",
      "Bot Start: <code>" + botStartLink + "</code>",
      ""
    );
  }

  await editMessage(env, chatId, messageId, lines.join("\n").trim(), await adminMiniAppEntryKeyboard(env)).catch(() => null);
}

function isMiniAppEntryCallback(data) {
  return data === "admin_mini_app_entry" || data.startsWith("admin_mini_app_entry_set:");
}

async function refreshMainMenu(chatId, userId, env) {
  if (!chatId || !userId) return;
  const state = await getState(env, userId).catch(() => null);
  if (!state || !state.language || !state.menuMessageId) return;
  await editMessage(env, chatId, state.menuMessageId, startText(state), await userMainKeyboard(env, userId, state)).catch(() => null);
}

function shouldRefresh(data) {
  return data.startsWith("lang:") || data.startsWith("page:") || data.startsWith("voice:") || data === "back_main" || data === "cancel_payment";
}
