import { getState } from "./state.js";
import { editMessage } from "./telegram-actions.js";
import { mainKeyboard, startText } from "./ui-status.js";

export async function normalizeMainMenu(env, chatId, userId) {
  if (!chatId || !userId) return;
  const state = await getState(env, userId).catch(() => null);
  if (!state || !state.language || !state.menuMessageId) return;
  await editMessage(env, chatId, state.menuMessageId, startText(state), mainKeyboard(state)).catch(() => null);
}
