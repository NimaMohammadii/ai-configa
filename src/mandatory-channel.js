import { addCredits } from "./credits.js";
import { requireDb } from "./state.js";
import { tgJson } from "./telegram-api.js";

export const FA_REQUIRED_CHANNEL_URL = "https://t.me/VexaOrder";
export const FA_REQUIRED_CHANNEL = "@VexaOrder";
export const FA_JOIN_BONUS_CREDITS = 100;

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

export function faJoinText() {
  return [
    "🔒 <b>عضویت در کانال وکسا الزامی است</b>",
    "",
    "برای استفاده از ربات اول عضو کانال زیر شو.",
    "اگر عضو بشی <b>۱۰۰ کردیت رایگان</b> هم بهت داده میشه 🎁",
    "",
    "بعد از عضویت، دکمه «عضو شدم» را بزن."
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
  requireDb(env);

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO fa_join_bonuses (user_id, credits, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).bind(String(userId), FA_JOIN_BONUS_CREDITS).run();

  if (Number(inserted?.meta?.changes || 0) > 0) {
    await addCredits(env, userId, FA_JOIN_BONUS_CREDITS);
    return true;
  }

  return false;
}
