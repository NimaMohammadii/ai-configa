import { mainKeyboard as baseMainKeyboard, startText } from "./ui.js";

export { startText };

export function mainKeyboard(state = {}) {
  const keyboard = baseMainKeyboard(state);
  const rows = keyboard.inline_keyboard || [];

  moveSinglePaginationButton(rows);
  updateEmotionButton(rows, state);

  return { inline_keyboard: rows };
}

function moveSinglePaginationButton(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== 1) continue;

    const data = row[0]?.callback_data || "";
    if (!data.startsWith("page:")) continue;

    const previous = rows[i - 1];
    if (Array.isArray(previous) && previous.length === 1) {
      previous.push(row[0]);
      rows.splice(i, 1);
    }
    return;
  }
}

function updateEmotionButton(rows, state) {
  const lang = state.language || "en";
  const active = Boolean(state.emotionActive);

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (button?.callback_data !== "emotion_on") continue;
      button.text = emotionLabel(lang, active);
      return;
    }
  }
}

function emotionLabel(lang, active) {
  const status = active ? "ON" : "OFF";
  if (lang === "fa") return `🎭 احساس‌ساز: ${active ? "روشن" : "خاموش"}`;
  return `🎭 Emotion: ${status}`;
}
