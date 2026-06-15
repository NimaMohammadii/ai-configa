import { handleSupportMessage as handleSupportMessageV2 } from "./support-flow-v2.js";

export async function handleSupportMessage(message, env) {
  const adminId = getAdminId(env);
  const fromId = String(message.from?.id || "");
  const chatId = String(message.chat?.id || "");
  const text = message.text?.trim() || "";

  const isAdmin = adminId && (fromId === adminId || chatId === adminId);
  const hasReply = Boolean(message.reply_to_message?.message_id);
  const isCommand = text.startsWith("/");

  if (isAdmin && !hasReply && !isCommand) {
    return true;
  }

  return handleSupportMessageV2(message, env);
}

function getAdminId(env) {
  const value = String(env.ADMIN_TOKEN || "");
  const match = value.match(/-?\d{5,}/);
  return match ? match[0] : "";
}
