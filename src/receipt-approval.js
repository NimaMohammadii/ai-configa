import { trackUser } from "./admin.js";
import { addCredits } from "./credits.js";
import { getAllAdminIds } from "./receipt-admins.js";
import { clearPendingPayment, getPendingPayment } from "./payments.js";
import { requireDb } from "./state.js";
import { answerCallback, copyMessage, deleteMessage, editMessageCaption, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { createCustomTomanPackage, mainKeyboard, startText, TOMAN_PACKAGES } from "./ui.js";
import { getState, setMenuMessageId } from "./state.js";

export function isReceiptCallback(data) {
  return String(data || "").startsWith("receipt_approve:") || String(data || "").startsWith("receipt_reject:");
}

export async function handleReceiptPhoto(message, env) {
  const chatId = message.chat && message.chat.id;
  const user = message.from || {};
  const userId = user.id;
  if (!chatId || !userId) return false;

  await trackUser(env, user);
  const state = await getState(env, userId);
  const pending = await getPendingPayment(env, userId);

  if (state.menuMessageId) {
    await deleteMessage(env, chatId, state.menuMessageId).catch(() => null);
    await setMenuMessageId(env, userId, null);
  }

  if (!pending || !pendingPackage(pending)) {
    const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
    await setMenuMessageId(env, userId, menu?.message_id || null);
    await notifyUser(env, chatId, "⚠️ <b>Screenshot received</b>\n\nPlease choose a credit package first", "⚠️ Screenshot received\n\nPlease choose a credit package first");
    return true;
  }

  const pack = pendingPackage(pending);
  const totalCredits = Number(pack.credits || 0) + Number(pack.bonus || 0);
  const receiptId = await createReceipt(env, user, pending.package_id, pack.amount, totalCredits);
  const caption = receiptCaption({ user, amount: pack.amount, credits: totalCredits });
  const admins = await getAllAdminIds(env);

  let sentToAdmin = 0;
  for (const adminId of admins) {
    try {
      const copied = await copyMessage(env, adminId, chatId, message.message_id, caption, receiptKeyboard(receiptId));
      await saveReceiptAdminMessage(env, receiptId, adminId, copied.message_id, caption);
      sentToAdmin++;
    } catch (error) {
      console.error("copy receipt to admin failed", adminId, error && error.message ? error.message : error);
    }
  }

  const menu = await sendMessage(env, chatId, startText(state), mainKeyboard(state));
  await setMenuMessageId(env, userId, menu?.message_id || null);

  if (sentToAdmin > 0) {
    await notifyUser(env, chatId, "✅ <b>Payment receipt received</b>\n\nYour receipt was sent for admin review. After approval, credits will be added to your balance", "✅ Payment receipt received\n\nYour receipt was sent for admin review. After approval, credits will be added to your balance");
  } else {
    await notifyUser(env, chatId, "⚠️ <b>Payment receipt received</b>\n\nAdmin chat is not configured yet. Please contact support", "⚠️ Payment receipt received\n\nAdmin chat is not configured yet. Please contact support");
  }

  return true;
}


function pendingPackage(pending) {
  const packageId = pending?.package_id || "";
  if (TOMAN_PACKAGES[packageId]) return TOMAN_PACKAGES[packageId];
  if (!String(packageId).startsWith("custom:")) return null;
  const [, credits, amount] = String(packageId).split(":");
  const pack = createCustomTomanPackage(Number(credits));
  return Number(amount) === Number(pack.amountValue) ? pack : null;
}

export async function handleReceiptCallback(query, env) {
  const data = query.data || "";
  const adminId = query.from && query.from.id;
  const chatId = query.message && query.message.chat && query.message.chat.id;
  const messageId = query.message && query.message.message_id;
  if (!adminId || !chatId || !messageId) return;

  const approved = data.startsWith("receipt_approve:");
  const receiptId = data.split(":")[1];
  const receipt = await getReceipt(env, receiptId);

  if (!receipt) {
    await answerCallback(env, query.id, "Receipt not found", true);
    return;
  }

  if (receipt.status !== "pending") {
    await removeButtonsFromClickedReceipt(env, query, receipt.status);
    await answerCallback(env, query.id, "Already reviewed", true);
    return;
  }

  if (approved) {
    const balance = await addCredits(env, receipt.user_id, receipt.credits);
    await markReceipt(env, receiptId, "approved", adminId);
    await clearPendingPayment(env, receipt.user_id);
    await updateClickedReceiptCaption(env, query, "approved");
    await updateAllReceiptCaptions(env, receiptId, "approved", chatId, messageId);
    await sendPaymentApprovedMessage(env, receipt.user_id, receipt.credits, balance);
    await answerCallback(env, query.id, "Approved", true);
    return;
  }

  await markReceipt(env, receiptId, "rejected", adminId);
  await clearPendingPayment(env, receipt.user_id);
  await updateClickedReceiptCaption(env, query, "rejected");
  await updateAllReceiptCaptions(env, receiptId, "rejected", chatId, messageId);
  await sendPaymentRejectedMessage(env, receipt.user_id);
  await answerCallback(env, query.id, "Rejected", true);
}

async function sendPaymentApprovedMessage(env, userId, credits, balance) {
  const state = await getState(env, userId).catch(() => ({ language: "en" }));
  const message = paymentApprovedMessage(state.language, credits, balance);
  await notifyUser(env, userId, message.html, message.plain);
}

async function sendPaymentRejectedMessage(env, userId) {
  const state = await getState(env, userId).catch(() => ({ language: "en" }));
  const message = paymentRejectedMessage(state.language);
  await notifyUser(env, userId, message.html, message.plain);
}

function paymentApprovedMessage(language, credits, balance) {
  const lang = normalizeReceiptLanguage(language);
  const text = PAYMENT_TEXTS[lang] || PAYMENT_TEXTS.en;
  const creditText = Number(credits).toLocaleString("en-US");
  const balanceText = Number(balance).toLocaleString("en-US");

  const html = [
    "✅ <b>" + text.approvedTitle + "</b>",
    "",
    text.approvedVerifiedHtml,
    "<b>" + creditText + " " + text.credits + "</b> " + text.addedToBalance,
    text.currentBalance + ": <b>" + balanceText + " " + text.credits + "</b>",
    "",
    text.readyHtml,
  ].join("\n");

  return { html, plain: stripHtml(html) };
}

function paymentRejectedMessage(language) {
  const lang = normalizeReceiptLanguage(language);
  const text = PAYMENT_TEXTS[lang] || PAYMENT_TEXTS.en;
  const html = [
    "❌ <b>" + text.rejectedTitle + "</b>",
    "",
    text.rejectedBody1,
    text.rejectedBody2,
  ].join("\n");

  return { html, plain: stripHtml(html) };
}

function normalizeReceiptLanguage(language) {
  return PAYMENT_TEXTS[language] ? language : "en";
}

const PAYMENT_TEXTS = {
  en: {
    credits: "credits",
    approvedTitle: "Payment approved",
    approvedVerifiedHtml: "Your payment was <b>verified successfully</b>",
    addedToBalance: "have been added to your balance",
    currentBalance: "Current balance",
    readyHtml: "You can now <b>send your text</b> to create voice",
    rejectedTitle: "Payment rejected",
    rejectedBody1: "Your receipt could not be verified",
    rejectedBody2: "Please check the payment details and send a valid screenshot again",
  },
  fa: {
    credits: "کردیت",
    approvedTitle: "پرداختت تایید شد",
    approvedVerifiedHtml: "پرداختت <b>با موفقیت تایید شد</b>",
    addedToBalance: "به موجودیت اضافه شد",
    currentBalance: "موجودی فعلیت",
    readyHtml: "حالا میتونی <b>متنت رو بفرستی</b> تا صدا ساخته بشه",
    rejectedTitle: "پرداختت رد شد",
    rejectedBody1: "رسید پرداختت قابل تایید نبود",
    rejectedBody2: "لطفاً اطلاعات پرداخت رو چک کن و اسکرین‌شات معتبر دوباره بفرست",
  },
  ru: {
    credits: "кредитов",
    approvedTitle: "Платеж подтвержден",
    approvedVerifiedHtml: "Ваш платеж <b>успешно подтвержден</b>",
    addedToBalance: "добавлено на ваш баланс",
    currentBalance: "Текущий баланс",
    readyHtml: "Теперь вы можете <b>отправить текст</b>, чтобы создать голос",
    rejectedTitle: "Платеж отклонен",
    rejectedBody1: "Ваш чек не удалось подтвердить",
    rejectedBody2: "Проверьте данные платежа и отправьте корректный скриншот еще раз",
  },
  de: {
    credits: "Credits",
    approvedTitle: "Zahlung bestätigt",
    approvedVerifiedHtml: "Deine Zahlung wurde <b>erfolgreich bestätigt</b>",
    addedToBalance: "wurden deinem Guthaben hinzugefügt",
    currentBalance: "Aktuelles Guthaben",
    readyHtml: "Du kannst jetzt <b>deinen Text senden</b>, um eine Stimme zu erstellen",
    rejectedTitle: "Zahlung abgelehnt",
    rejectedBody1: "Dein Beleg konnte nicht verifiziert werden",
    rejectedBody2: "Bitte prüfe die Zahlungsdetails und sende erneut einen gültigen Screenshot",
  },
  tr: {
    credits: "kredi",
    approvedTitle: "Ödeme onaylandı",
    approvedVerifiedHtml: "Ödemeniz <b>başarıyla doğrulandı</b>",
    addedToBalance: "bakiyenize eklendi",
    currentBalance: "Güncel bakiye",
    readyHtml: "Artık ses oluşturmak için <b>metninizi gönderebilirsiniz</b>",
    rejectedTitle: "Ödeme reddedildi",
    rejectedBody1: "Dekontunuz doğrulanamadı",
    rejectedBody2: "Lütfen ödeme bilgilerini kontrol edip geçerli bir ekran görüntüsü tekrar gönderin",
  },
  ar: {
    credits: "رصيد",
    approvedTitle: "تم تأكيد الدفع",
    approvedVerifiedHtml: "تم <b>التحقق من الدفع بنجاح</b>",
    addedToBalance: "تمت إضافتها إلى رصيدك",
    currentBalance: "الرصيد الحالي",
    readyHtml: "يمكنك الآن <b>إرسال النص</b> لإنشاء الصوت",
    rejectedTitle: "تم رفض الدفع",
    rejectedBody1: "تعذر التحقق من إيصال الدفع",
    rejectedBody2: "يرجى التحقق من تفاصيل الدفع وإرسال لقطة شاشة صالحة مرة أخرى",
  },
  zh: {
    credits: "credits",
    approvedTitle: "付款已通过",
    approvedVerifiedHtml: "你的付款已<b>成功验证</b>",
    addedToBalance: "已添加到你的余额",
    currentBalance: "当前余额",
    readyHtml: "现在你可以<b>发送文本</b>来生成语音",
    rejectedTitle: "付款被拒绝",
    rejectedBody1: "你的付款截图无法验证",
    rejectedBody2: "请检查付款信息并重新发送有效截图",
  },
  ja: {
    credits: "credits",
    approvedTitle: "支払いが承認されました",
    approvedVerifiedHtml: "支払いは<b>正常に確認されました</b>",
    addedToBalance: "が残高に追加されました",
    currentBalance: "現在の残高",
    readyHtml: "これで<b>テキストを送信</b>して音声を作成できます",
    rejectedTitle: "支払いが拒否されました",
    rejectedBody1: "領収書を確認できませんでした",
    rejectedBody2: "支払い情報を確認し、有効なスクリーンショットをもう一度送信してください",
  },
  es: {
    credits: "créditos",
    approvedTitle: "Pago aprobado",
    approvedVerifiedHtml: "Tu pago fue <b>verificado correctamente</b>",
    addedToBalance: "se han añadido a tu saldo",
    currentBalance: "Saldo actual",
    readyHtml: "Ahora puedes <b>enviar tu texto</b> para crear voz",
    rejectedTitle: "Pago rechazado",
    rejectedBody1: "No se pudo verificar tu recibo",
    rejectedBody2: "Revisa los detalles del pago y envía otra captura válida",
  },
  hi: {
    credits: "credits",
    approvedTitle: "पेमेंट अप्रूव हो गया",
    approvedVerifiedHtml: "आपका पेमेंट <b>सफलतापूर्वक वेरिफाई हो गया</b>",
    addedToBalance: "आपके बैलेंस में जोड़ दिए गए हैं",
    currentBalance: "मौजूदा बैलेंस",
    readyHtml: "अब आप आवाज़ बनाने के लिए <b>अपना टेक्स्ट भेज सकते हैं</b>",
    rejectedTitle: "पेमेंट रिजेक्ट हो गया",
    rejectedBody1: "आपकी रसीद वेरिफाई नहीं हो सकी",
    rejectedBody2: "कृपया पेमेंट डिटेल्स चेक करें और सही स्क्रीनशॉट फिर से भेजें",
  },
};

async function notifyUser(env, chatId, htmlText, plainText) {
  try {
    return await sendMessage(env, chatId, htmlText, null);
  } catch (htmlError) {
    console.error("send html notification failed", chatId, htmlError && htmlError.message ? htmlError.message : htmlError);
    try {
      return await sendPlainMessage(env, chatId, plainText || stripHtml(htmlText));
    } catch (plainError) {
      console.error("send plain notification failed", chatId, plainError && plainError.message ? plainError.message : plainError);
      return null;
    }
  }
}

async function createReceipt(env, user, packageId, amount, credits) {
  requireDb(env);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO payment_receipts (id, user_id, username, first_name, last_name, package_id, amount, credits, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)"
  ).bind(id, String(user.id), user.username || null, user.first_name || null, user.last_name || null, packageId, String(amount), Number(credits)).run();
  return id;
}

async function getReceipt(env, id) {
  requireDb(env);
  return await env.DB.prepare("SELECT * FROM payment_receipts WHERE id = ?").bind(String(id)).first();
}

async function markReceipt(env, id, status, adminId) {
  requireDb(env);
  await env.DB.prepare(
    "UPDATE payment_receipts SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(status, String(adminId), String(id)).run();
}

async function saveReceiptAdminMessage(env, receiptId, adminId, messageId, caption) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO payment_receipt_messages (receipt_id, admin_id, message_id, caption, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(receiptId), String(adminId), Number(messageId), caption).run();
}

async function updateClickedReceiptCaption(env, query, status) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const currentCaption = query.message?.caption || "";
  if (!chatId || !messageId || !currentCaption) return;

  const cleanCaption = stripReviewStatus(currentCaption);
  await editMessageCaption(env, chatId, messageId, cleanCaption + statusSuffix(status), emptyKeyboard()).catch((error) => {
    console.error("clicked receipt caption update failed", error && error.message ? error.message : error);
  });
}

async function removeButtonsFromClickedReceipt(env, query, status) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const currentCaption = query.message?.caption || "";
  if (!chatId || !messageId || !currentCaption) return;

  const cleanCaption = stripReviewStatus(currentCaption);
  await editMessageCaption(env, chatId, messageId, cleanCaption + statusSuffix(status), emptyKeyboard()).catch(() => null);
}

async function updateAllReceiptCaptions(env, receiptId, status, skipChatId = null, skipMessageId = null) {
  requireDb(env);
  const rows = await env.DB.prepare(
    "SELECT admin_id, message_id, caption FROM payment_receipt_messages WHERE receipt_id = ?"
  ).bind(String(receiptId)).all();

  for (const row of rows.results || []) {
    if (String(row.admin_id) === String(skipChatId) && Number(row.message_id) === Number(skipMessageId)) continue;
    const cleanCaption = stripReviewStatus(row.caption || "");
    await editMessageCaption(env, row.admin_id, row.message_id, cleanCaption + statusSuffix(status), emptyKeyboard()).catch((error) => {
      console.error("receipt caption update failed", row.admin_id, row.message_id, error && error.message ? error.message : error);
    });
  }
}

function statusSuffix(status) {
  return status === "approved" ? "\n\n<b>✅ تأیید شده توسط ادمین</b>" : "\n\n<b>❌ رد شده توسط ادمین</b>";
}

function stripReviewStatus(caption) {
  return String(caption || "").replace(/\n\n✅ تأیید شده توسط ادمین/g, "").replace(/\n\n❌ رد شده توسط ادمین/g, "").trim();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function emptyKeyboard() {
  return { inline_keyboard: [] };
}

function receiptKeyboard(receiptId) {
  return {
    inline_keyboard: [[
      { text: "✅ تأیید", callback_data: "receipt_approve:" + receiptId },
      { text: "❌ رد", callback_data: "receipt_reject:" + receiptId },
    ]],
  };
}

function receiptCaption({ user, amount, credits }) {
  const username = user.username ? "@" + escapeHtml(user.username) : "@";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "-";
  return [
    "🧾 <b>رسید پرداخت جدید</b>",
    `• User ID: <code>${escapeHtml(user.id)}</code>`,
    `• Username: ${username}`,
    `• Name: ${escapeHtml(name)}`,
    "",
    `• مبلغ: <b>${escapeHtml(amount)} تومان</b>`,
    `• کردیت: <b>${Number(credits).toLocaleString("en-US")}</b>`,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
