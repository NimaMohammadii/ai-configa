import {
  adminCancelKeyboard,
  adminMainKeyboard,
  adminMainText,
  clearAdminAction,
  getAdminAction,
  isAdmin,
  setAdminAction,
} from "./admin.js";
import { getState, requireDb, setMenuMessageId } from "./state.js";
import { answerCallback, deleteMessage, editMessage, sendMessage } from "./telegram-actions.js";
import { downloadTelegramFile } from "./telegram-api.js";

const PAYMENT_HERO_ACTION = "payment_hero_image";
const PAYMENT_HERO_SETTING_PREFIX = "payment_hero_file_id_";
const PAYMENT_HERO_TARGETS = Object.freeze({
  toman: Object.freeze({ key: "toman", label: "Toman checkout" }),
  card: Object.freeze({ key: "card", label: "Bank Card checkout" }),
});

export function isPaymentHeroAdminCallback(data) {
  const value = String(data || "");
  return value === "admin_main" ||
    value === "admin_payment_hero_images" ||
    value.startsWith("admin_payment_hero_upload:") ||
    value.startsWith("admin_payment_hero_delete:");
}

export async function handlePaymentHeroAdminCallback(query, env) {
  const data = String(query?.data || "");
  if (!isPaymentHeroAdminCallback(data)) return false;

  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!userId || !chatId || !messageId) return false;

  if (!(await isAdmin(env, userId))) {
    await answerCallback(env, query.id, "Access denied", true).catch(() => null);
    return true;
  }

  if (data === "admin_main") {
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id).catch(() => null);
    await editAdminMenu(env, chatId, userId, messageId, await adminMainText(env), paymentHeroAdminMainKeyboard());
    return true;
  }

  if (data === "admin_payment_hero_images") {
    await clearAdminAction(env, userId);
    await answerCallback(env, query.id).catch(() => null);
    await editAdminMenu(env, chatId, userId, messageId, await paymentHeroAdminText(env), paymentHeroAdminKeyboard());
    return true;
  }

  if (data.startsWith("admin_payment_hero_upload:")) {
    const target = paymentHeroTarget(data.slice("admin_payment_hero_upload:".length));
    if (!target) {
      await answerCallback(env, query.id, "Invalid image target", true).catch(() => null);
      return true;
    }

    await setAdminAction(env, userId, PAYMENT_HERO_ACTION, {
      targetUserId: target.key,
      chatId,
      messageId,
    });
    await answerCallback(env, query.id).catch(() => null);
    await editAdminMenu(
      env,
      chatId,
      userId,
      messageId,
      paymentHeroPromptText(target.key),
      adminCancelKeyboard("admin_payment_hero_images")
    );
    return true;
  }

  if (data.startsWith("admin_payment_hero_delete:")) {
    const target = paymentHeroTarget(data.slice("admin_payment_hero_delete:".length));
    if (!target) {
      await answerCallback(env, query.id, "Invalid image target", true).catch(() => null);
      return true;
    }

    await deletePaymentHeroImage(env, target.key);
    await answerCallback(env, query.id, "Header image deleted").catch(() => null);
    await editAdminMenu(
      env,
      chatId,
      userId,
      messageId,
      (await paymentHeroAdminText(env)) + "\n\n🗑 Header image removed.",
      paymentHeroAdminKeyboard()
    );
    return true;
  }

  return false;
}

export async function handlePaymentHeroAdminMessage(message, env) {
  const adminId = message?.from?.id;
  const chatId = message?.chat?.id;
  if (!adminId || !chatId || !(await isAdmin(env, adminId))) return false;

  const action = await getAdminAction(env, adminId);
  if (action?.action !== PAYMENT_HERO_ACTION) return false;

  const target = paymentHeroTarget(action.target_user_id);
  if (!target) {
    await clearAdminAction(env, adminId);
    return false;
  }

  const photo = Array.isArray(message.photo) ? message.photo.at(-1) : null;
  const inputMessageId = Number(message.message_id || 0);
  const menuChatId = Number(action.chat_id || chatId);
  const menuMessageId = Number(action.message_id || 0);

  if (!photo?.file_id) {
    if (inputMessageId) await deleteMessage(env, chatId, inputMessageId).catch(() => null);
    await editAdminMenu(
      env,
      menuChatId,
      adminId,
      menuMessageId,
      paymentHeroPromptText(target.key) + "\n\nSend a photo here — text and files are ignored.",
      adminCancelKeyboard("admin_payment_hero_images")
    );
    return true;
  }

  await setPaymentHeroImage(env, target.key, photo.file_id);
  if (inputMessageId) await deleteMessage(env, chatId, inputMessageId).catch(() => null);
  await clearAdminAction(env, adminId);
  await editAdminMenu(
    env,
    menuChatId,
    adminId,
    menuMessageId,
    (await paymentHeroAdminText(env)) + "\n\n✅ " + target.label + " header updated.",
    paymentHeroAdminKeyboard()
  );
  return true;
}

export async function refreshPaymentHeroAdminMain(message, env) {
  const text = String(message?.text || "").trim();
  if (!/^\/admin(?:@\w+)?(?:\s|$)/i.test(text)) return false;

  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  if (!userId || !chatId || !(await isAdmin(env, userId))) return false;

  const state = await getState(env, userId);
  if (!state.menuMessageId) return false;

  await editAdminMenu(env, chatId, userId, state.menuMessageId, await adminMainText(env), paymentHeroAdminMainKeyboard());
  return true;
}

export function isPaymentHeroImageRequest(request) {
  if (request.method !== "GET") return false;
  const path = new URL(request.url).pathname;
  return /^\/mini-app\/payment-hero\/(?:toman|card)$/.test(path);
}

export async function handlePaymentHeroImageRequest(request, env) {
  const target = paymentHeroTarget(new URL(request.url).pathname.split("/").pop());
  if (!target) return new Response("Not Found", { status: 404 });

  const fileId = await getPaymentHeroFileId(env, target.key);
  if (!fileId) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const file = await downloadTelegramFile(env, fileId);
    return new Response(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("payment hero image download failed", target.key, error?.message || error);
    return new Response("Image unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export function paymentHeroAdminMainKeyboard() {
  const source = adminMainKeyboard();
  const rows = Array.isArray(source?.inline_keyboard)
    ? source.inline_keyboard.map((row) => row.map((button) => ({ ...button })))
    : [];
  const existing = rows.some((row) => row.some((button) => button.callback_data === "admin_payment_hero_images"));
  if (!existing) {
    const iconsIndex = rows.findIndex((row) => row.some((button) => button.callback_data === "admin_mini_app_icons"));
    rows.splice(iconsIndex >= 0 ? iconsIndex + 1 : rows.length, 0, [
      { text: "🖼 Payment Hero Images", callback_data: "admin_payment_hero_images" },
    ]);
  }
  return { inline_keyboard: rows };
}

export async function paymentHeroAdminText(env) {
  const [toman, card] = await Promise.all([
    getPaymentHeroFileId(env, "toman"),
    getPaymentHeroFileId(env, "card"),
  ]);
  return [
    "🖼 <b>Payment Hero Images</b>",
    "",
    "Upload the two images used at the top of Buy Credits.",
    "Both use the same full-width hero layout as Telegram Stars.",
    "",
    (toman ? "✅" : "○") + " Toman checkout",
    (card ? "✅" : "○") + " Bank Card checkout",
  ].join("\n");
}

export function paymentHeroAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Upload Toman", callback_data: "admin_payment_hero_upload:toman" },
        { text: "Delete", callback_data: "admin_payment_hero_delete:toman" },
      ],
      [
        { text: "Upload Bank Card", callback_data: "admin_payment_hero_upload:card" },
        { text: "Delete", callback_data: "admin_payment_hero_delete:card" },
      ],
      [{ text: "← Back", callback_data: "admin_main" }],
    ],
  };
}

function paymentHeroPromptText(key) {
  const target = paymentHeroTarget(key);
  if (!target) throw new Error("Invalid payment hero target");
  return [
    "🖼 <b>Upload Payment Hero Image</b>",
    "",
    "Target: <b>" + target.label + "</b>",
    "Send one photo now.",
    "It replaces only this Buy Credits header image.",
  ].join("\n");
}

async function setPaymentHeroImage(env, key, fileId) {
  const target = paymentHeroTarget(key);
  if (!target || !fileId) throw new Error("Invalid payment hero image");
  await ensurePaymentHeroStorage(env);
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(paymentHeroSettingKey(target.key), String(fileId)).run();
}

async function deletePaymentHeroImage(env, key) {
  const target = paymentHeroTarget(key);
  if (!target) throw new Error("Invalid payment hero target");
  await ensurePaymentHeroStorage(env);
  await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind(paymentHeroSettingKey(target.key)).run();
}

async function getPaymentHeroFileId(env, key) {
  const target = paymentHeroTarget(key);
  if (!target) return "";
  await ensurePaymentHeroStorage(env);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(paymentHeroSettingKey(target.key)).first();
  return String(row?.value || "").trim();
}

function paymentHeroSettingKey(key) {
  return PAYMENT_HERO_SETTING_PREFIX + key;
}

function paymentHeroTarget(key) {
  return PAYMENT_HERO_TARGETS[String(key || "").trim()] || null;
}

async function ensurePaymentHeroStorage(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function editAdminMenu(env, chatId, userId, messageId, text, keyboard) {
  if (messageId) {
    try {
      await editMessage(env, chatId, messageId, text, keyboard);
      await setMenuMessageId(env, userId, messageId);
      return;
    } catch (error) {
      if (String(error?.message || error).toLowerCase().includes("message is not modified")) return;
    }
  }

  const sent = await sendMessage(env, chatId, text, keyboard);
  if (sent?.message_id) await setMenuMessageId(env, userId, sent.message_id);
}
