import { grantInitialStartBonusOnce } from "./start-bonus.js";
import { requireDb } from "./state.js";
import { tgJson } from "./telegram-api.js";

export const FA_REQUIRED_CHANNEL_URL = "https://t.me/VexaOrder";
export const FA_REQUIRED_CHANNEL = "@VexaOrder";
const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

export function faJoinText() {
  return [
    "🔒 <b>برای استفاده از وکسا، اول عضو کانال شو</b>",
    "",
    "فقط کافیه عضو کانال زیر بشی تا بتونی از ربات استفاده کنی.",
    "بعد از عضویت هم یه <b>هدیه شروع</b> می‌گیری 🎁",
    "",
    "وقتی عضو شدی، دکمه «عضو شدم» رو بزن."
  ].join("\n");
}

export function faJoinKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📢 عضویت در کانال", url: FA_REQUIRED_CHANNEL_URL }],
      [{ text: "✅ عضو شدم", callback_data: "check_fa_join" }],
    ],
  };
}

export async function getMandatoryFaMembershipSettings(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  const row = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'fa_mandatory_membership_enabled'"
  ).first();

  return {
    enabled: row?.value !== "0",
    channel: env.FA_REQUIRED_CHANNEL || FA_REQUIRED_CHANNEL,
    channelUrl: env.FA_REQUIRED_CHANNEL_URL || FA_REQUIRED_CHANNEL_URL,
  };
}

export async function isMandatoryFaMembershipEnabled(env) {
  const settings = await getMandatoryFaMembershipSettings(env);
  return settings.enabled;
}

export async function setMandatoryFaMembershipEnabled(env, enabled) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('fa_mandatory_membership_enabled', ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(enabled ? "1" : "0").run();
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

export async function isFaChannelMember(env, userId) {
  try {
    const member = await tgJson(env, "getChatMember", {
      chat_id: env.FA_REQUIRED_CHANNEL || FA_REQUIRED_CHANNEL,
      user_id: userId,
    });
    return MEMBER_STATUSES.has(member?.status);
  } catch (error) {
    console.error("getChatMember failed", error && error.message ? error.message : error);
    return false;
  }
}

export async function grantFaJoinBonusOnce(env, userId) {
  const result = await grantInitialStartBonusOnce(env, userId, "fa");
  return result.granted;
}
