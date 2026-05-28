import { VOICE_NAMES, VOICES_PER_PAGE } from "./voices.js";

export const PRICE_PER_CHARACTER_TON = 0.00012;

export function startText(state) {
  const selectedVoice = state.voice || "none";
  const output = state.output || "MP3";

  return [
    "🎧 <b>Text to Speech</b>",
    "",
    "Send your text.",
    `Price: <b>${PRICE_PER_CHARACTER_TON.toFixed(5)} TON</b> per character.`,
    "1000 characters = <b>0.12 TON</b>.",
    "Demo is free.",
    "",
    `<b>Selected voice:</b> ${escapeHtml(selectedVoice)}`,
    `<b>Output:</b> ${escapeHtml(output)}`,
  ].join("\n");
}

export function mainKeyboard(state) {
  const page = Number(state.page || 0);
  const output = state.output || "MP3";
  const start = page * VOICES_PER_PAGE;
  const voices = VOICE_NAMES.slice(start, start + VOICES_PER_PAGE);
  const rows = [];

  for (let i = 0; i < 8; i += 2) {
    rows.push([
      voiceButton(voices[i]),
      voiceButton(voices[i + 1]),
    ]);
  }

  rows.push([
    voiceButton(voices[8]),
    page === 0
      ? { text: "Next →", callback_data: "page:1" }
      : { text: "← Previous", callback_data: "page:0" },
  ]);

  rows.push([{ text: "▶ Demo", callback_data: "demo" }]);

  rows.push([
    { text: output === "MP3" ? "✅ MP3 📁" : "MP3 📁", callback_data: "output:MP3" },
    { text: output === "Voice" ? "✅ Voice 🎙️" : "Voice 🎙️", callback_data: "output:Voice" },
  ]);

  return { inline_keyboard: rows };
}

function voiceButton(name) {
  if (!name) return { text: " ", callback_data: "noop" };
  return { text: name, callback_data: `voice:${name}` };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
