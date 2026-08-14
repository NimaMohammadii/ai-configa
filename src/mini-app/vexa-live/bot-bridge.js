import {
  MINI_APP_BROADCAST_SECTIONS,
  MINI_APP_TRACKED_SECTIONS,
  adminCancelKeyboard,
  adminMiniAppAccessKeyboard,
  adminMiniAppAccessText,
  clearAdminAction,
  getAdminAction,
  isAdmin,
  setAdminAction,
} from "../../admin.js";
import { handleCallback as handleBaseCallback } from "../../bot.js";
import { handleMessage as handleSecureMessage } from "../../bot-secure.js";
import {
  answerCallback,
  deleteMessage,
  editMessage,
} from "../../telegram-actions.js";
import {
  getVexaLiveAccessSettings,
  setVexaLiveAccessSettings,
} from "./access.js";

const SECTION_KEY = "live";
const SECTION_LABEL = "Vexa Live";
const LOCK_ACTION = "vexa_live_lock_minutes";

MINI_APP_BROADCAST_SECTIONS[SECTION_KEY] = SECTION_LABEL;
MINI_APP_TRACKED_SECTIONS[SECTION_KEY] = SECTION_LABEL;

export async function handleCallback(query, env) {
  const data = String(query?.data || "");

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
  const adminId = message?.from?.id;
  if (!adminId || !(await isAdmin(env, adminId))) {
    return handleSecureMessage(message, env);
  }

  const action = await getAdminAction(env, adminId);
  if (action?.action !== LOCK_ACTION) {
    return handleSecureMessage(message, env);
  }

  return handleVexaLiveLockInput(message, env, action);
}

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
