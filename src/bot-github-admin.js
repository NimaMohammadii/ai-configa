import {
  MINI_APP_ENTRY_SECTIONS,
  adminMainKeyboard,
  adminMainText,
  adminMiniAppEntryKeyboard,
  adminUserKeyboard,
  adminUsersKeyboard,
  adminUsersText,
  adminUserText,
  clearAdminAction,
  getMiniAppDefaultSection,
  isAdmin,
  setMiniAppDefaultSection,
  trackUser,
} from "./admin.js";
import {
  adminGitHubUsersView,
  adminGitHubUserView,
  withAdminGitHubMainKeyboard,
  withAdminGitHubUserDetails,
  withAdminGitHubUserStatuses,
} from "./admin-github.js";
import { handleCallback as coreHandleCallback, handleMessage as coreHandleMessage } from "./bot.js";
import { ensureBalanceRow } from "./credits.js";
import { getState, setMenuMessageId } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendMessage } from "./telegram-actions.js";
import { tgJson } from "./telegram-api.js";

export async function handleMessage(message, env) {
  const text = String(message?.text || "").trim();
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  const directAdminOpen = /^\/admin(?:@\w+)?$/i.test(text) || text === "/support";

  if (userId && chatId && directAdminOpen && await isAdmin(env, userId)) {
    await Promise.all([
      trackUser(env, message.from).catch(() => null),
      ensureBalanceRow(env, userId).catch(() => null),
    ]);
    await deleteMessage(env, chatId, message?.message_id).catch(() => null);
    await clearAdminAction(env, userId);
    const state = await getState(env, userId);
    await upsertAdminMain(env, chatId, userId, state?.menuMessageId);
    return;
  }

  await coreHandleMessage(message, env);

  if (!userId || !chatId || !(text.startsWith("/admin") || text === "/support")) return;
  if (!(await isAdmin(env, userId))) return;

  const state = await getState(env, userId);
  const messageId = Number(state?.menuMessageId || 0);
  if (!messageId) return;
  await editAdminMenu(
    env,
    chatId,
    userId,
    messageId,
    await adminMainText(env),
    withAdminGitHubMainKeyboard(adminMainKeyboard()),
  );
}

export async function handleCallback(query, env) {
  const data = String(query?.data || "");
  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!userId || !chatId || !messageId) return coreHandleCallback(query, env);

  if (isMiniAppEntryCallback(data)) {
    if (!(await isAdmin(env, userId))) {
      await answerCallback(env, query.id, "Access denied", true);
      return;
    }
    await clearAdminAction(env, userId);
    if (data.startsWith("admin_mini_app_entry_set:")) {
      const section = data.slice("admin_mini_app_entry_set:".length);
      if (!MINI_APP_ENTRY_SECTIONS[section]) {
        await answerCallback(env, query.id, "Invalid Mini App section", true);
        return;
      }
      await setMiniAppDefaultSection(env, section);
      await answerCallback(env, query.id, "Default section updated");
    } else {
      await answerCallback(env, query.id);
    }
    await showMiniAppEntryPanel(env, chatId, userId, messageId);
    return;
  }

  const githubAdminCallback = data === "admin_main"
    || data.startsWith("admin_users:")
    || data.startsWith("admin_page:")
    || data.startsWith("admin_user:")
    || data.startsWith("admin_github_users:")
    || data.startsWith("admin_github_user:");
  if (!githubAdminCallback) return coreHandleCallback(query, env);
  if (!(await isAdmin(env, userId))) {
    await answerCallback(env, query.id, "Access denied", true);
    return;
  }

  if (data === "admin_main") {
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id);
    await editAdminMenu(
      env,
      chatId,
      userId,
      messageId,
      await adminMainText(env),
      withAdminGitHubMainKeyboard(adminMainKeyboard()),
    );
    return;
  }

  if (data.startsWith("admin_users:") || data.startsWith("admin_page:")) {
    await clearAdminAction(env, userId);
    const page = Math.max(0, Number(data.split(":")[1] || 0));
    const keyboard = await withAdminGitHubUserStatuses(env, await adminUsersKeyboard(env, page));
    await answerCallback(env, query.id);
    await editAdminMenu(env, chatId, userId, messageId, await adminUsersText(env, page), keyboard);
    return;
  }

  if (data.startsWith("admin_user:")) {
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const page = Math.max(0, Number(parts[2] || 0));
    const text = await withAdminGitHubUserDetails(env, targetUserId, await adminUserText(env, targetUserId));
    await answerCallback(env, query.id);
    await editAdminMenu(env, chatId, userId, messageId, text, adminUserKeyboard(targetUserId, page));
    return;
  }

  if (data.startsWith("admin_github_users:")) {
    await clearAdminAction(env, userId);
    const page = Math.max(0, Number(data.split(":")[1] || 0));
    const view = await adminGitHubUsersView(env, page);
    await answerCallback(env, query.id);
    await editAdminMenu(env, chatId, userId, messageId, view.text, view.keyboard);
    return;
  }

  if (data.startsWith("admin_github_user:")) {
    await clearAdminAction(env, userId);
    const parts = data.split(":");
    const targetUserId = parts[1];
    const usersPage = Math.max(0, Number(parts[2] || 0));
    const repoPage = Math.max(0, Number(parts[3] || 0));
    const view = await adminGitHubUserView(env, targetUserId, usersPage, repoPage);
    await answerCallback(env, query.id);
    await editAdminMenu(env, chatId, userId, messageId, view.text, view.keyboard);
  }
}

async function showMiniAppEntryPanel(env, chatId, userId, messageId) {
  const selected = await getMiniAppDefaultSection(env);
  const bot = await tgJson(env, "getMe", {}).catch(() => null);
  const username = String(bot?.username || env.BOT_USERNAME || "").replace(/^@/, "");
  const lines = [
    "🚪 <b>Mini App Entry Section</b>",
    "",
    "Default section for new users: <b>" + MINI_APP_ENTRY_SECTIONS[selected] + "</b>",
    "A saved user selection stays primary until the user changes it. A section-specific link explicitly changes that user's primary.",
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
      "",
    );
  }

  await editAdminMenu(
    env,
    chatId,
    userId,
    messageId,
    lines.join("\n").trim(),
    await adminMiniAppEntryKeyboard(env),
  );
}

function isMiniAppEntryCallback(data) {
  return data === "admin_mini_app_entry" || data.startsWith("admin_mini_app_entry_set:");
}

async function upsertAdminMain(env, chatId, userId, messageId) {
  const text = await adminMainText(env);
  const keyboard = withAdminGitHubMainKeyboard(adminMainKeyboard());
  const targetMessageId = Number(messageId || 0);
  if (targetMessageId) {
    try {
      await editMessage(env, chatId, targetMessageId, text, keyboard);
      await setMenuMessageId(env, userId, targetMessageId);
      return;
    } catch (error) {
      if (String(error?.message || error).toLowerCase().includes("message is not modified")) {
        await setMenuMessageId(env, userId, targetMessageId);
        return;
      }
    }
  }
  const menu = await sendMessage(env, chatId, text, keyboard);
  await setMenuMessageId(env, userId, menu?.message_id || null);
}

async function editAdminMenu(env, chatId, userId, messageId, text, keyboard) {
  try {
    await editMessage(env, chatId, messageId, text, keyboard);
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes("message is not modified")) throw error;
  }
  await setMenuMessageId(env, userId, messageId);
}
