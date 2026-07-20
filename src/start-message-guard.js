const protectedStartMessages = new Set();

function key(chatId, messageId) {
  return String(chatId) + ":" + String(messageId);
}

export function protectStartMessage(chatId, messageId) {
  if (!chatId || !messageId) return;
  const messageKey = key(chatId, messageId);
  protectedStartMessages.add(messageKey);
  const timer = setTimeout(() => protectedStartMessages.delete(messageKey), 60000);
  timer?.unref?.();
}

export function consumeStartMessageProtection(chatId, messageId) {
  const messageKey = key(chatId, messageId);
  if (!protectedStartMessages.has(messageKey)) return false;
  protectedStartMessages.delete(messageKey);
  return true;
}
