export * from "./ui.js";
import { mainKeyboard as baseMainKeyboard } from "./ui.js";

export function mainKeyboard(state = {}) {
  const keyboard = baseMainKeyboard(state);
  const rows = keyboard.inline_keyboard || [];
  return {
    inline_keyboard: rows.filter((row) => {
      return !row.some((button) => button && button.callback_data === "emotion_on");
    }),
  };
}
