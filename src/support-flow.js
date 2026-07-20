import { trackUser } from "./admin.js";
import { getState, requireDb } from "./state.js";
import { copyMessage, sendMessage, sendPlainMessage } from "./telegram-actions.js";

const SUPPORT_END_LABELS = {
  en: "End chat",
  fa: "اتمام چت",
  ru: "Завершить чат",
  de: "Chat beenden",
  tr: "Sohbeti bitir",
  ar: "إنهاء المحادثة",
  zh: "结束聊天",
  ja: "チャット終了",
  es: "Finalizar chat",
  hi: "चैट समाप्त करें",
};

const SUPPORT_TEXTS = {
  en: {
    start: "💬 Support chat is open.\n\nWrite anything you need here. If the chat is closed, you can still reply to a support message to continue the conversation.\n\nTo close the chat, tap the “End chat” button.",
    end: "✅ Support chat closed.",
    sent: "✅ Your message was sent to support.",
    noAdmin: "Support is not available right now. Please try again later.",
    adminSent: "✅ Reply sent to user.",
  },
  ru: {
    start: "💬 Чат с поддержкой открыт.\n\nНапишите здесь всё, что нужно. Если чат закроется, вы можете ответить на сообщение поддержки, чтобы продолжить разговор.\n\nЧтобы закрыть чат, нажмите кнопку «Завершить чат».",
  },
  de: {
    start: "💬 Der Support-Chat ist geöffnet.\n\nSchreib hier alles, was du brauchst. Wenn der Chat geschlossen wird, kannst du auf eine Support-Nachricht antworten, um das Gespräch fortzusetzen.\n\nWenn du den Chat schließen möchtest, tippe auf „Chat beenden“.",
  },
  tr: {
    start: "💬 Destek sohbeti açıldı.\n\nİhtiyacın olan her şeyi buraya yaz. Sohbet kapanırsa, konuşmaya devam etmek için bir destek mesajını yanıtlayabilirsin.\n\nSohbeti kapatmak istersen “Sohbeti bitir” düğmesine dokun.",
  },
  ar: {
    start: "💬 تم فتح محادثة الدعم.\n\nاكتب هنا أي شيء تحتاجه. إذا أُغلقت المحادثة، يمكنك الرد على رسالة الدعم لمتابعة المحادثة.\n\nإذا أردت إغلاق المحادثة، اضغط زر «إنهاء المحادثة».",
  },
  zh: {
    start: "💬 支持聊天已打开。\n\n你需要什么都可以在这里写。如果聊天关闭了，你仍然可以回复支持消息来继续对话。\n\n如果想关闭聊天，请点击“结束聊天”按钮。",
  },
  ja: {
    start: "💬 サポートチャットが開きました。\n\n必要なことをここに書いてください。チャットが閉じられた場合でも、サポートメッセージに返信すると会話を続けられます。\n\nチャットを閉じたい場合は、「チャット終了」ボタンをタップしてください。",
  },
  es: {
    start: "💬 El chat de soporte está abierto.\n\nEscribe aquí lo que necesites. Si el chat se cierra, puedes responder a un mensaje de soporte para continuar la conversación.\n\nSi quieres cerrar el chat, toca el botón “Finalizar chat”.",
  },
  hi: {
    start: "💬 सहायता चैट खुल गई है।\n\nआपको जो भी चाहिए, यहीं लिखें। अगर चैट बंद हो जाए, तो बातचीत जारी रखने के लिए सहायता संदेश का जवाब दे सकते हैं।\n\nअगर आप चैट बंद करना चाहते हैं, तो “चैट समाप्त करें” बटन पर टैप करें।",
  },
  fa: {
    start: "💬 چت با پشتیبانی باز شد.\n\nهرچی می‌خوای همینجا بنویس. اگر چت بسته شد، می‌تونی با ریپلای روی پیام پشتیبانی دوباره جواب بدی.\n\nاگر خواستی چت رو ببندی، روی دکمه‌ی «اتمام چت» بزن.",
    end: "✅ چت با پشتیبانی بسته شد.",
    sent: "✅ پیام شما برای پشتیبانی ارسال شد.",
    noAdmin: "پشتیبانی فعلاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کن.",
    adminSent: "✅ پاسخ برای کاربر ارسال شد.",
  },
};

export async function handleSupportMessage(message, env) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  if (!chatId || !userId) return false;

  await ensureSupportTables(env);
  await trackUser(env, message.from);

  const text = message.text ? message.text.trim() : "";

  if (await activateSupportAdmin(env, userId, text)) {
    return false;
  }

  if (await handleAdminSupportReply(env, message)) return true;

  const state = await getState(env, userId);
  const lang = state.language || "en";
  const endLabel = supportEndLabel(lang);
  const session = await getSupportSession(env, userId);

  if (text === "/support") {
    await openSupportSession(env, userId, lang);
    await sendMessage(env, chatId, supportText(lang, "start"), supportKeyboard(lang));
    return true;
  }

  if (session?.is_open && text === endLabel) {
    await closeSupportSession(env, userId);
    await sendMessage(env, chatId, supportText(lang, "end"), removeKeyboard());
    return true;
  }

  if (session?.is_open) {
    const delivered = await sendUserMessageToAdmins(env, message, lang);
    if (delivered) await sendPlainMessage(env, chatId, supportText(lang, "sent"));
    return true;
  }

  return false;
}

async function activateSupportAdmin(env, userId, text) {
  const parts = String(text || "").split(/\s+/).filter(Boolean);
  if (parts[0] !== "/admin") return false;

  const token = parts[1] || "";
  const validByToken = env.ADMIN_TOKEN && String(env.ADMIN_TOKEN) === String(token);
  const validById = env.ADMIN_TOKEN && extractAdminIds(env.ADMIN_TOKEN).includes(String(userId));

  if (!validByToken && !validById) return false;

  await env.DB.prepare(
    "INSERT OR IGNORE INTO admin_users (user_id, created_at) VALUES (?, CURRENT_TIMESTAMP)"
  ).bind(String(userId)).run();

  return true;
}

async function handleAdminSupportReply(env, message) {
  const adminId = message.from && message.from.id;
  const chatId = message.chat && message.chat.id;
  const replyMessageId = message.reply_to_message && message.reply_to_message.message_id;
  if (!adminId || !chatId || !replyMessageId) return false;

  if (!(await isSupportAdmin(env, adminId))) return false;

  const row = await env.DB.prepare(
    "SELECT user_id FROM support_admin_messages WHERE admin_chat_id = ? AND admin_message_id = ?"
  ).bind(String(chatId), Number(replyMessageId)).first();

  if (!row?.user_id) return false;

  const userId = String(row.user_id);
  const state = await getState(env, userId);
  const lang = state.language || "en";

  if (message.text) {
    await sendMessage(env, userId, "💬 <b>Support</b>\n\n" + escapeHtml(message.text));
  } else {
    await copyMessage(env, userId, chatId, message.message_id, "💬 Support");
  }

  await openSupportSession(env, userId, lang);
  await sendPlainMessage(env, chatId, supportText("en", "adminSent"));
  return true;
}

async function sendUserMessageToAdmins(env, message, lang) {
  const admins = await getSupportAdminIds(env);
  const chatId = message.chat && message.chat.id;
  const user = message.from || {};

  if (!admins.length) {
    await sendPlainMessage(env, chatId, supportText(lang, "noAdmin"));
    return false;
  }

  const header = buildAdminHeader(user, message);
  let delivered = 0;

  for (const adminId of admins) {
    try {
      if (message.text) {
        const sent = await sendMessage(env, adminId, header + "\n\n<b>Message:</b>\n" + escapeHtml(message.text));
        await rememberAdminSupportMessage(env, adminId, sent?.message_id, user.id);
      } else {
        const headerMessage = await sendMessage(env, adminId, header + "\n\n<b>Message:</b>");
        await rememberAdminSupportMessage(env, adminId, headerMessage?.message_id, user.id);
        const copied = await copyMessage(env, adminId, chatId, message.message_id, "Reply to this message to answer the user.");
        await rememberAdminSupportMessage(env, adminId, copied?.message_id, user.id);
      }
      delivered++;
    } catch (error) {
      console.error("support message to admin failed", adminId, error && error.message ? error.message : error);
    }
  }

  if (!delivered) {
    await sendPlainMessage(env, chatId, supportText(lang, "noAdmin"));
    return false;
  }

  return true;
}

function buildAdminHeader(user, message) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "No name";
  const username = user.username ? "@" + user.username : "No username";
  return [
    "🆘 <b>Support Message</b>",
    "",
    "Name: <b>" + escapeHtml(name) + "</b>",
    "Username: <b>" + escapeHtml(username) + "</b>",
    "User ID: <code>" + escapeHtml(user.id) + "</code>",
    "Chat ID: <code>" + escapeHtml(message.chat?.id) + "</code>",
  ].join("\n");
}

async function getSupportAdminIds(env) {
  const rows = await env.DB.prepare("SELECT user_id FROM admin_users").all().catch(() => ({ results: [] }));
  const ids = new Set((rows.results || []).map((row) => String(row.user_id)).filter(Boolean));

  for (const id of extractAdminIds(env.ADMIN_TOKEN)) {
    ids.add(id);
  }

  return Array.from(ids);
}

function extractAdminIds(value) {
  if (!value) return [];
  const matches = String(value).match(/\d{5,}/g) || [];
  return matches.map((id) => String(id));
}

async function isSupportAdmin(env, userId) {
  const admins = await getSupportAdminIds(env);
  return admins.includes(String(userId));
}

async function getSupportSession(env, userId) {
  const row = await env.DB.prepare(
    "SELECT is_open FROM support_sessions WHERE user_id = ?"
  ).bind(String(userId)).first();

  if (!row) return null;
  return { is_open: Number(row.is_open || 0) === 1 };
}

async function openSupportSession(env, userId, lang) {
  await env.DB.prepare(
    "INSERT INTO support_sessions (user_id, is_open, language, created_at, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET is_open = 1, language = excluded.language, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), lang || "en").run();
}

async function closeSupportSession(env, userId) {
  await env.DB.prepare(
    "UPDATE support_sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
  ).bind(String(userId)).run();
}

async function rememberAdminSupportMessage(env, adminChatId, adminMessageId, userId) {
  if (!adminChatId || !adminMessageId || !userId) return;

  await env.DB.prepare(
    "INSERT OR REPLACE INTO support_admin_messages (admin_chat_id, admin_message_id, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(adminChatId), Number(adminMessageId), String(userId)).run();
}

async function ensureSupportTables(env) {
  requireDb(env);

  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS support_sessions (user_id TEXT PRIMARY KEY, is_open INTEGER NOT NULL DEFAULT 0, language TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS support_admin_messages (admin_chat_id TEXT NOT NULL, admin_message_id INTEGER NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (admin_chat_id, admin_message_id))"
    ),
  ]);
}

function supportKeyboard(lang) {
  return {
    keyboard: [[{ text: supportEndLabel(lang) }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function removeKeyboard() {
  return { remove_keyboard: true };
}

function supportEndLabel(lang) {
  return SUPPORT_END_LABELS[lang] || SUPPORT_END_LABELS.en;
}

function supportText(lang, key) {
  const pack = SUPPORT_TEXTS[lang] || SUPPORT_TEXTS.en;
  return pack[key] || SUPPORT_TEXTS.en[key] || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
