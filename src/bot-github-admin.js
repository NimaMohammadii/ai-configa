import {
  adminMainKeyboard,
  adminMainText,
  adminUserKeyboard,
  adminUsersKeyboard,
  adminUsersText,
  adminUserText,
  clearAdminAction,
  isAdmin,
} from "./admin.js";
import {
  adminGitHubUsersView,
  adminGitHubUserView,
  withAdminGitHubMainKeyboard,
  withAdminGitHubUserDetails,
  withAdminGitHubUserStatuses,
} from "./admin-github.js";
import { handleCallback as coreHandleCallback, handleMessage as coreHandleMessage } from "./bot.js";
import { getState, setMenuMessageId } from "./state.js";
import { answerCallback, editMessage } from "./telegram-actions.js";

export async function handleMessage(message, env) {
  await coreHandleMessage(message, env);

  const text = String(message?.text || "").trim();
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
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

async function editAdminMenu(env, chatId, userId, messageId, text, keyboard) {
  try {
    await editMessage(env, chatId, messageId, text, keyboard);
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes("message is not modified")) throw error;
  }
  await setMenuMessageId(env, userId, messageId);
}
