import { VOICE_NAMES, VOICES_PER_PAGE } from "./voices.js";

export const CREDIT_PRICE_PER_1000_USD = 0.24;
export const CREDIT_PER_CHARACTER = 1;
export const CARD_NUMBER = "5859831205085201";

export const TOMAN_PACKAGES = {
  p400: { credits: 400, bonus: 0, amount: "50,000", label: "400 Credit -> 50,000 T" },
  p1000: { credits: 1000, bonus: 0, amount: "95,000", label: "1,000 Credit -> 95,000 T" },
  p1900: { credits: 1900, bonus: 0, amount: "150,000", label: "1,900 Credit -> 150,000 T" },
  p4000: { credits: 4000, bonus: 0, amount: "280,000", label: "4,000 Credit -> 280,000 T" },
  p8000: { credits: 8000, bonus: 0, amount: "510,000", label: "8,000 Credit -> 510,000 T" },
  p18500: { credits: 18500, bonus: 3500, amount: "999,000", label: "18,500 + 3,500 🎁 -> 999,000 T" },
};

export function startText(state) {
  const selectedVoice = state.voice || "none";

  return [
    "🎧 <b>Text to Speech</b>",
    "",
    "Send your text",
    "Each character uses <b>1 credit</b>",
    "",
    `<b>Selected voice:</b> ${escapeHtml(selectedVoice)}`,
  ].join("\n");
}

export function mainKeyboard(state) {
  const page = Number(state.page || 0);
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
    { text: "💎 Balance", callback_data: "balance" },
    { text: "⚡ Buy Credits", callback_data: "buy_credits" },
  ]);

  return { inline_keyboard: rows };
}

export function buyCreditsText() {
  return [
    "💳 <b>Buy Credits</b>",
    "",
    `1000 credits = <b>$${CREDIT_PRICE_PER_1000_USD.toFixed(2)}</b>`,
    "Each character uses <b>1 credit</b>",
    "",
    "Choose a payment method"
  ].join("\n");
}

export function buyCreditsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🇮🇷 Buy with Toman", callback_data: "buy_toman" }],
      [{ text: "⭐ Telegram Stars", callback_data: "buy_stars" }],
      [{ text: "← Back", callback_data: "back_main" }],
    ],
  };
}

export function tomanPackagesText() {
  return [
    "🇮🇷 <b>Buy with Toman</b>",
    "",
    "Choose your credit package"
  ].join("\n");
}

export function tomanPackagesKeyboard() {
  return {
    inline_keyboard: [
      ...Object.entries(TOMAN_PACKAGES).map(([id, pack]) => ([
        { text: pack.label, callback_data: "toman_package:" + id },
      ])),
      [{ text: "← Back", callback_data: "buy_credits" }],
    ],
  };
}

export function paymentInstructionText(pack) {
  const totalCredits = pack.credits + pack.bonus;
  return [
    "🔥 <b>Almost there!</b>",
    "",
    `Package: <b>${formatNumber(totalCredits)} credits</b>`,
    `Amount: <b>${pack.amount} T</b>`,
    "",
    "Please transfer the exact amount to this card number:",
    `<code>${CARD_NUMBER}</code>`,
    "",
    "Then send your payment screenshot right here",
    "Your credits will be added after verification"
  ].join("\n");
}

export function paymentCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Cancel", callback_data: "cancel_payment" }],
    ],
  };
}

function voiceButton(name, selectedVoice) {
  if (!name) return { text: " ", callback_data: "noop" };
  const label = name === selectedVoice ? "✔️ " + name : name;
  return { text: label, callback_data: `voice:${name}` };
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
