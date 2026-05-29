import { VOICE_NAMES, VOICES_PER_PAGE } from "./voices.js";

export const CREDIT_PRICE_PER_1000_USD = 0.24;
export const CREDIT_PER_CHARACTER = 1;

export function startText(state) {
  const selectedVoice = state.voice || "none";
  const output = state.output || "MP3";

  return [
    "🎧 <b>Text to Speech</b>",
    "",
    "Send your text.",
    "Each character uses <b>1 credit</b>.",
    `1000 credits = <b>$${CREDIT_PRICE_PER_1000_USD.toFixed(2)}</b>.`,
    "Demo is free.",
    "",
    `<b>Selected voice:</b> ${escapeHtml(selectedVoice)}`,
    `<b>Output:</b> ${escapeHtml(output)}`,
  ].join("\n");
}

export function mainKeyboard(state) {
  const page = Number(state.page || 0);
  const output = state.output || "MP3";
  const selectedVoice = state.voice || "Nora";
  const start = page * VOICES_PER_PAGE;
  const voices = VOICE_NAMES.slice(start, start + VOICES_PER_PAGE);
  const rows = [];

  for (let i = 0; i < 8; i += 2) {
    rows.push([
      voiceButton(voices[i], selectedVoice),
      voiceButton(voices[i + 1], selectedVoice),
    ]);
  }

  rows.push([
    voiceButton(voices[8], selectedVoice),
    page === 0
      ? { text: "Next →", callback_data: "page:1" }
      : { text: "← Previous", callback_data: "page:0" },
  ]);

  rows.push([{ text: "▶ Demo", callback_data: "demo" }]);

  rows.push([
    { text: output === "MP3" ? "✔️ MP3 📁" : "MP3 📁", callback_data: "output:MP3" },
    { text: output === "Voice" ? "✔️ Voice 🎙️" : "Voice 🎙️", callback_data: "output:Voice" },
  ]);

  rows.push([
    { text: "Balance", callback_data: "balance" },
    { text: "Buy Credits", callback_data: "buy_credits" },
  ]);

  return { inline_keyboard: rows };
}

export function buyCreditsText() {
  return [
    "💳 <b>Buy Credits</b>",
    "",
    `1000 credits = <b>$${CREDIT_PRICE_PER_1000_USD.toFixed(2)}</b>.`,
    "Each character uses <b>1 credit</b>.",
    "",
    "Choose a payment method:"
  ].join("\n");
}

export function buyCreditsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Buy with Toman", callback_data: "buy_toman" }],
      [{ text: "Telegram Stars", callback_data: "buy_stars" }],
      [{ text: "← Back", callback_data: "back_main" }],
    ],
  };
}

function voiceButton(name, selectedVoice) {
  if (!name) return { text: " ", callback_data: "noop" };
  const label = name === selectedVoice ? "✔️ " + name : name;
  return { text: label, callback_data: `voice:${name}` };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
