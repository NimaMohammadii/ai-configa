import { ensureCreditUsageLogTable, getBalance } from "./credits.js";
import { LANGUAGES, normalizeLang } from "./i18n.js";
import { requireDb } from "./state.js";
import { getDailyRewardCredits } from "./daily-reward.js";
import { getInitialStartCredits } from "./start-bonus.js";
import { getMandatoryFaMembershipSettings } from "./mandatory-channel.js";
import { ensureTtsHistoryTable } from "./tts-history.js";
import { VOICE_NAMES } from "./voices.js";

export async function hasTrackedUser(env, userId) {
  requireDb(env);
  if (!userId) return false;

  const row = await env.DB.prepare(
    "SELECT user_id FROM bot_users WHERE user_id = ?"
  ).bind(String(userId)).first();

  return Boolean(row);
}

export async function trackUser(env, user) {
  requireDb(env);
  if (!user || !user.id) return;

  await env.DB.prepare(
    "INSERT INTO bot_users (user_id, username, first_name, last_name, last_seen_at, created_at, return_count) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0) " +
    "ON CONFLICT(user_id) DO UPDATE SET " +
    "username = excluded.username, " +
    "first_name = excluded.first_name, " +
    "last_name = excluded.last_name, " +
    "return_count = COALESCE(bot_users.return_count, 0) + CASE WHEN datetime(COALESCE(bot_users.last_returned_at, bot_users.created_at, bot_users.last_seen_at)) <= datetime('now', '-3 hours') THEN 1 ELSE 0 END, " +
    "last_returned_at = CASE WHEN datetime(COALESCE(bot_users.last_returned_at, bot_users.created_at, bot_users.last_seen_at)) <= datetime('now', '-3 hours') THEN CURRENT_TIMESTAMP ELSE bot_users.last_returned_at END, " +
    "last_seen_at = CURRENT_TIMESTAMP"
  ).bind(
    String(user.id),
    user.username || null,
    user.first_name || null,
    user.last_name || null
  ).run();
}


export async function recordUserReturn(env, userId) {
  requireDb(env);
  if (!userId) return;

  await trackUser(env, { id: userId });
}

export async function isAdmin(env, userId) {
  requireDb(env);
  if (!userId) return false;

  if (env.ADMIN_TOKEN && String(env.ADMIN_TOKEN) === String(userId)) {
    return true;
  }

  const row = await env.DB.prepare(
    "SELECT user_id FROM admin_users WHERE user_id = ?"
  ).bind(String(userId)).first();

  return Boolean(row);
}

export async function tryAdminLogin(env, userId, token) {
  requireDb(env);
  if (!env.ADMIN_TOKEN) throw new Error("ADMIN_TOKEN secret is missing");

  if (String(env.ADMIN_TOKEN) !== String(token) && String(env.ADMIN_TOKEN) !== String(userId)) {
    return false;
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO admin_users (user_id, created_at) VALUES (?, CURRENT_TIMESTAMP)"
  ).bind(String(userId)).run();

  return true;
}

export async function adminMainText(env = null) {
  const stats = env ? await getAdminDashboardStats(env).catch(() => null) : null;
  const lines = ["👑 <b>Admin Panel</b>", ""];

  if (stats) {
    lines.push(
      "📊 <b>Usage</b>",
      "24h: <b>" + formatNumber(stats.credits24h) + " credits</b> / " + formatNumber(stats.requests24h) + " requests",
      "3 days: <b>" + formatNumber(stats.credits3d) + " credits</b> / " + formatNumber(stats.requests3d) + " requests",
      "7 days: <b>" + formatNumber(stats.credits7d) + " credits</b> / " + formatNumber(stats.requests7d) + " requests",
      "30 days: <b>" + formatNumber(stats.credits30d) + " credits</b> / " + formatNumber(stats.requests30d) + " requests",
      "",
      "🟢 <b>Online users</b>",
      "24h: <b>" + formatNumber(stats.online24h) + "</b>",
      "7 days: <b>" + formatNumber(stats.online7d) + "</b>",
      ""
    );
  }

  lines.push("Choose an option:");
  return lines.join("\n");
}

export function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Users", callback_data: "admin_users:0" }, { text: "🔎 Search User", callback_data: "admin_user_search_prompt" }],
      [{ text: "💳 Buyers", callback_data: "admin_buyers:0" }, { text: "↩️ Return Users", callback_data: "admin_returns" }],
      [{ text: "🟢 Online Users", callback_data: "admin_online:0" }, { text: "🌍 Users by Language", callback_data: "admin_language_stats" }],
      [{ text: "📊 Usage Stats", callback_data: "admin_stats" }, { text: "🌐 Language Settings", callback_data: "admin_lang_settings" }],
      [{ text: "🎧 First Start Audio", callback_data: "admin_welcome_audio" }, { text: "🎁 Daily Reward", callback_data: "admin_daily_reward" }],
      [{ text: "🆕 Initial Start Credits", callback_data: "admin_initial_start" }, { text: "🔐 Mini App Access", callback_data: "admin_mini_app_access" }],
      [{ text: "🔒 Mandatory Membership", callback_data: "admin_mandatory_membership" }, { text: "🖼 Voice Profiles", callback_data: "admin_voice_profiles" }],
      [{ text: "Broadcast Message", callback_data: "admin_broadcast" }, { text: "Pin Text for All Users", callback_data: "admin_pin_all" }],
    ],
  };
}



export async function adminDailyRewardText(env) {
  const credits = await getDailyRewardCredits(env);
  const due = await countDueDailyRewards(env);
  return [
    "🎁 <b>Daily Reward Settings</b>",
    "",
    "Current gift: <b>" + formatNumber(credits) + " credits</b>",
    "Users ready to claim now: <b>" + formatNumber(due) + "</b>",
    "",
    "Use <b>Change Gift Credits</b> to set the daily gift amount.",
    "Daily reward reminder notifications are currently disabled."
  ].join("\n");
}

export function adminDailyRewardKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Change Gift Credits", callback_data: "admin_daily_reward_prompt" }],
      [{ text: "← Back", callback_data: "admin_main" }],
    ],
  };
}

export function adminDailyRewardPromptText() {
  return [
    "🎁 <b>Change Daily Gift Credits</b>",
    "",
    "Send the new positive credit amount.",
    "Example: <code>120</code>",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export async function adminInitialStartText(env) {
  const credits = await getInitialStartCredits(env);
  return [
    "🆕 <b>Initial Start Credits</b>",
    "",
    "Current new-user gift: <b>" + formatNumber(credits) + " credits</b>",
    "",
    "This gift is sent once to new non-Persian users after their menu is shown.",
    "Persian users still receive their onboarding credit through the channel-join flow.",
    "",
    "Use <b>Change Initial Credits</b> to set the amount for all languages, including the Persian channel-join amount shown in admin settings."
  ].join("\n");
}

export function adminInitialStartKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Change Initial Credits", callback_data: "admin_initial_start_prompt" }],
      [{ text: "← Back", callback_data: "admin_main" }],
    ],
  };
}

export function adminInitialStartPromptText() {
  return [
    "🆕 <b>Change Initial Start Credits</b>",
    "",
    "Send the new positive credit amount.",
    "Example: <code>100</code>",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export async function adminMandatoryMembershipText(env) {
  const settings = await getMandatoryFaMembershipSettings(env);
  return [
    "🔒 <b>Mandatory Membership Settings</b>",
    "",
    "Status: <b>" + (settings.enabled ? "Enabled" : "Disabled") + "</b>",
    "Required channel: <b>" + escapeHtml(settings.channel) + "</b>",
    "",
    "When enabled, Persian users must join the configured channel before using the bot.",
    "Admins are always allowed to bypass this check."
  ].join("\n");
}

export async function adminMandatoryMembershipKeyboard(env) {
  const settings = await getMandatoryFaMembershipSettings(env);
  return {
    inline_keyboard: [
      [{ text: (settings.enabled ? "✅" : "❌") + " Mandatory channel membership", callback_data: "admin_mandatory_membership_toggle" }],
      [{ text: "← Back", callback_data: "admin_main" }],
    ],
  };
}

export async function getMiniAppAccessSettings(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  const rows = await env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('mini_app_admin_only', 'mini_app_locked_until', 'mini_app_locked_from')"
  ).all();
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  const lockedUntil = Number.parseInt(values.mini_app_locked_until || "0", 10) || 0;
  const lockedFrom = Number.parseInt(values.mini_app_locked_from || "0", 10) || 0;
  const now = Math.floor(Date.now() / 1000);
  const isTimedLockActive = lockedUntil > now;

  if (values.mini_app_admin_only === "1" && lockedUntil > 0 && !isTimedLockActive) {
    await setMiniAppAccessSettings(env, false, 0, 0);
    return { adminOnly: false, lockedFrom: 0, lockedUntil: 0, remainingSeconds: 0 };
  }

  return {
    adminOnly: values.mini_app_admin_only === "1",
    lockedFrom,
    lockedUntil,
    remainingSeconds: isTimedLockActive ? lockedUntil - now : 0,
  };
}

export async function setMiniAppAccessSettings(env, adminOnly, lockedUntil = 0, lockedFrom = 0) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  await Promise.all([
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mini_app_admin_only', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(adminOnly ? "1" : "0").run(),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mini_app_locked_until', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(String(Math.max(0, Number(lockedUntil) || 0))).run(),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mini_app_locked_from', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(String(Math.max(0, Number(lockedFrom) || 0))).run(),
  ]);
}

export async function adminMiniAppAccessText(env) {
  const settings = await getMiniAppAccessSettings(env);
  const lines = [
    "🔐 <b>Mini App Access</b>",
    "",
    "Status: <b>" + (settings.adminOnly ? "Admin only" : "Open for everyone") + "</b>",
  ];
  if (settings.adminOnly && settings.lockedUntil > 0) {
    lines.push("Auto unlock in: <b>" + formatDuration(settings.remainingSeconds) + "</b>");
  }
  lines.push("", "Locking shows non-admin users a black update page with a centered progress bar until the selected minutes pass.");
  return lines.join("\n");
}

export async function adminMiniAppAccessKeyboard(env) {
  const settings = await getMiniAppAccessSettings(env);
  const rows = [];
  if (settings.adminOnly) {
    rows.push([{ text: "🔓 Open for everyone now", callback_data: "admin_mini_app_unlock" }]);
  } else {
    rows.push([{ text: "🔒 Lock with timer", callback_data: "admin_mini_app_lock_prompt" }]);
  }
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminMiniAppLockPromptText() {
  return [
    "🔒 <b>Lock Mini App</b>",
    "",
    "Send how many minutes the mini app should stay admin-only.",
    "Example: <code>15</code>",
    "",
    "After this time, it automatically opens for all users. You can also unlock manually sooner."
  ].join("\n");
}

function formatDuration(totalSeconds) {
  const minutes = Math.max(0, Math.ceil(Number(totalSeconds || 0) / 60));
  if (minutes < 60) return formatNumber(minutes) + " min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return formatNumber(hours) + "h" + (rest ? " " + formatNumber(rest) + "m" : "");
}

export async function countDueDailyRewards(env) {
  requireDb(env);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM daily_rewards WHERE last_claimed_at IS NOT NULL AND datetime(last_claimed_at, '+24 hours') <= CURRENT_TIMESTAMP"
  ).first();
  return Number(row?.total || 0);
}

export async function getLanguageSettings(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  const rows = await env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('language_prompt_enabled', 'default_language', 'language_command_enabled')"
  ).all();

  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  return {
    languagePromptEnabled: values.language_prompt_enabled !== "0",
    defaultLanguage: values.default_language ? normalizeLang(values.default_language) : null,
    languageCommandEnabled: values.language_command_enabled !== "0",
  };
}

export async function setLanguageSetting(env, key, value) {
  requireDb(env);
  await ensureAppSettingsTable(env);

  const allowed = new Set(["language_prompt_enabled", "default_language", "language_command_enabled"]);
  if (!allowed.has(key)) throw new Error("Invalid language setting key");

  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(key, value == null ? null : String(value)).run();
}

export async function resolveStartLanguage(env, currentLanguage) {
  if (currentLanguage) return currentLanguage;
  const settings = await getLanguageSettings(env);
  if (!settings.languagePromptEnabled && settings.defaultLanguage) return settings.defaultLanguage;
  return null;
}

export async function adminLanguageSettingsText(env) {
  const settings = await getLanguageSettings(env);
  return [
    "🌐 <b>Language Settings</b>",
    "",
    "Start language prompt: <b>" + (settings.languagePromptEnabled ? "Enabled" : "Disabled") + "</b>",
    "Default direct language: <b>" + escapeHtml(formatLanguage(settings.defaultLanguage)) + "</b>",
    "/language command: <b>" + (settings.languageCommandEnabled ? "Enabled" : "Disabled") + "</b>",
    "",
    "If the prompt is disabled and a default language is selected, new users go directly to the bot menu in that language."
  ].join("\n");
}

export async function adminLanguageSettingsKeyboard(env) {
  const settings = await getLanguageSettings(env);
  const rows = [
    [{ text: (settings.languagePromptEnabled ? "✅" : "❌") + " Show language prompt on /start", callback_data: "admin_lang_toggle_prompt" }],
    [{ text: (settings.languageCommandEnabled ? "✅" : "❌") + " /language command", callback_data: "admin_lang_toggle_command" }],
    [{ text: "Default: " + formatLanguage(settings.defaultLanguage), callback_data: "noop" }],
  ];

  const entries = Object.entries(LANGUAGES);
  for (let i = 0; i < entries.length; i += 2) {
    rows.push(entries.slice(i, i + 2).map(([code, label]) => ({
      text: (settings.defaultLanguage === code ? "✔️ " : "") + label,
      callback_data: "admin_lang_default:" + code,
    })));
  }

  rows.push([{ text: "Clear default language", callback_data: "admin_lang_default:none" }]);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

export async function getAdminLanguageStats(env) {
  requireDb(env);

  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM bot_users").first();
  const rows = await env.DB.prepare(
    "SELECT COALESCE(NULLIF(s.language, ''), 'not_selected') AS language, COUNT(*) AS total " +
    "FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id " +
    "GROUP BY COALESCE(NULLIF(s.language, ''), 'not_selected') ORDER BY total DESC, language ASC"
  ).all();

  return {
    total: Number(totalRow?.total || 0),
    languages: (rows.results || []).map((row) => ({
      language: row.language,
      total: Number(row.total || 0),
    })),
  };
}

export async function adminLanguageStatsText(env) {
  const stats = await getAdminLanguageStats(env);
  const lines = [
    "🌍 <b>Users by Language</b>",
    "",
    "Total users: <b>" + formatNumber(stats.total) + "</b>",
    "",
  ];

  if (!stats.languages.length) {
    lines.push("No users yet.");
  } else {
    lines.push(...stats.languages.map((row, index) => {
      const percent = stats.total > 0 ? (Number(row.total || 0) * 100 / stats.total).toFixed(1) : "0.0";
      return (index + 1) + ". " + escapeHtml(formatLanguage(row.language)) + ": <b>" + formatNumber(row.total) + "</b> users (" + percent + "%)";
    }));
  }

  return lines.join("\n");
}

export function adminLanguageStatsKeyboard() {
  return { inline_keyboard: [[{ text: "← Back", callback_data: "admin_main" }]] };
}

export async function getAdminDashboardStats(env) {
  requireDb(env);

  const [credits24h, credits3d, credits7d, credits30d, requests24h, requests3d, requests7d, requests30d, online24h, online7d] = await Promise.all([
    sumCreditsSince(env, "-1 day"),
    sumCreditsSince(env, "-3 days"),
    sumCreditsSince(env, "-7 days"),
    sumCreditsSince(env, "-30 days"),
    countTtsRequestsSince(env, "-1 day"),
    countTtsRequestsSince(env, "-3 days"),
    countTtsRequestsSince(env, "-7 days"),
    countTtsRequestsSince(env, "-30 days"),
    countUsersSeenSince(env, "-1 day"),
    countUsersSeenSince(env, "-7 days"),
  ]);

  return { credits24h, credits3d, credits7d, credits30d, requests24h, requests3d, requests7d, requests30d, online24h, online7d };
}

export async function adminStatsText(env) {
  const stats = await getAdminDashboardStats(env);
  const heavy24h = await getHeavyUsageUsers(env, "-1 day", 10);
  const heavy7d = await getHeavyUsageUsers(env, "-7 days", 10);
  const heavy30d = await getHeavyUsageUsers(env, "-30 days", 10);

  return [
    "📊 <b>Usage Stats</b>",
    "",
    "Credits used in 24h: <b>" + formatNumber(stats.credits24h) + "</b>",
    "Credits used in 3 days: <b>" + formatNumber(stats.credits3d) + "</b>",
    "Credits used in 7 days: <b>" + formatNumber(stats.credits7d) + "</b>",
    "Credits used in 30 days: <b>" + formatNumber(stats.credits30d) + "</b>",
    "TTS requests in 24h: <b>" + formatNumber(stats.requests24h) + "</b>",
    "TTS requests in 3 days: <b>" + formatNumber(stats.requests3d) + "</b>",
    "TTS requests in 7 days: <b>" + formatNumber(stats.requests7d) + "</b>",
    "TTS requests in 30 days: <b>" + formatNumber(stats.requests30d) + "</b>",
    "",
    "Online users in 24h: <b>" + formatNumber(stats.online24h) + "</b>",
    "Online users in 7 days: <b>" + formatNumber(stats.online7d) + "</b>",
    "",
    "🔥 <b>Heavy users - 24h</b>",
    formatHeavyUsers(heavy24h),
    "",
    "🔥 <b>Heavy users - 7 days</b>",
    formatHeavyUsers(heavy7d),
    "",
    "🔥 <b>Heavy users - 30 days</b>",
    formatHeavyUsers(heavy30d),
  ].join("\n");
}

export function adminStatsKeyboard() {
  return { inline_keyboard: [[{ text: "← Back", callback_data: "admin_main" }]] };
}

export async function getAdminOnlineUsersPage(env, page = 0, limit = 8) {
  requireDb(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM bot_users WHERE datetime(last_seen_at) >= datetime('now', '-1 day')"
  ).first();
  const users = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at FROM bot_users " +
    "WHERE datetime(last_seen_at) >= datetime('now', '-1 day') ORDER BY datetime(last_seen_at) DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function adminOnlineText(env, page = 0) {
  const data = await getAdminOnlineUsersPage(env, page);
  const lines = [
    "🟢 <b>Online Users</b>",
    "",
    "Seen in last 24h: <b>" + formatNumber(data.total) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
  ];

  if (!data.users.length) {
    lines.push("No users seen in the last 24 hours.");
  } else {
    lines.push(...data.users.map((user, index) => {
      const number = data.page * data.limit + index + 1;
      return number + ". " + escapeHtml(userLabel(user)) + "\nLast seen: <b>" + escapeHtml(formatTehranTime(user.last_seen_at)) + "</b>";
    }));
  }

  return lines.join("\n");
}

export async function adminOnlineKeyboard(env, page = 0) {
  const data = await getAdminOnlineUsersPage(env, page);
  const rows = data.users.map((user) => [{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_online:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_online:" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function getAdminUsersPage(env, page = 0, limit = 8) {
  requireDb(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM bot_users").first();
  const users = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, return_count FROM bot_users ORDER BY last_seen_at DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}


export async function getAdminBuyersPage(env, page = 0, limit = 8) {
  requireDb(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM (" +
      "SELECT user_id FROM payment_receipts WHERE status = 'approved' " +
      "UNION SELECT user_id FROM star_payments" +
    ") buyers"
  ).first();

  const rows = await env.DB.prepare(
    "SELECT b.user_id, u.username, u.first_name, u.last_name, u.last_seen_at, " +
      "COALESCE(r.approved_receipts, 0) AS approved_receipts, COALESCE(r.total_receipt_credits, 0) AS total_receipt_credits, COALESCE(r.total_paid_toman, 0) AS total_paid_toman, " +
      "COALESCE(s.star_payments, 0) AS star_payments, COALESCE(s.total_star_credits, 0) AS total_star_credits, COALESCE(s.total_paid_stars, 0) AS total_paid_stars " +
    "FROM (SELECT user_id FROM payment_receipts WHERE status = 'approved' UNION SELECT user_id FROM star_payments) b " +
    "LEFT JOIN bot_users u ON u.user_id = b.user_id " +
    "LEFT JOIN (SELECT user_id, COUNT(*) AS approved_receipts, SUM(credits) AS total_receipt_credits, SUM(CAST(REPLACE(REPLACE(amount, ',', ''), ' ', '') AS INTEGER)) AS total_paid_toman FROM payment_receipts WHERE status = 'approved' GROUP BY user_id) r ON r.user_id = b.user_id " +
    "LEFT JOIN (SELECT user_id, COUNT(*) AS star_payments, SUM(credits) AS total_star_credits, SUM(stars) AS total_paid_stars FROM star_payments GROUP BY user_id) s ON s.user_id = b.user_id " +
    "ORDER BY (COALESCE(r.total_receipt_credits, 0) + COALESCE(s.total_star_credits, 0)) DESC, b.user_id LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return { total: Number(countRow?.total || 0), page: Number(page), limit: Number(limit), users: rows.results || [] };
}

export async function adminBuyersText(env, page = 0) {
  const data = await getAdminBuyersPage(env, page);
  const totals = data.users.reduce((acc, user) => {
    acc.toman += Number(user.total_paid_toman || 0);
    acc.stars += Number(user.total_paid_stars || 0);
    acc.credits += Number(user.total_receipt_credits || 0) + Number(user.total_star_credits || 0);
    return acc;
  }, { toman: 0, stars: 0, credits: 0 });

  return [
    "💳 <b>Buyers</b>",
    "",
    "Total buyers: <b>" + formatNumber(data.total) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "This page bought: <b>" + formatNumber(totals.credits) + " credits</b>",
    "This page paid: <b>" + formatToman(totals.toman) + "</b> / <b>" + formatStars(totals.stars) + "</b>",
    "",
    data.users.length ? "Select a buyer (Toman / Stars shown on each row):" : "No buyers yet."
  ].join("\n");
}

export async function adminBuyersKeyboard(env, page = 0) {
  const data = await getAdminBuyersPage(env, page);
  const rows = data.users.map((user) => [{ text: buyerLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_buyers:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_buyers:" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function getAllUserIds(env) {
  requireDb(env);
  const users = await env.DB.prepare("SELECT user_id FROM bot_users").all();
  return (users.results || []).map((user) => String(user.user_id));
}

export async function getAdminUserDetails(env, userId) {
  requireDb(env);

  const user = await env.DB.prepare(
    "SELECT b.user_id, b.username, b.first_name, b.last_name, b.last_seen_at, b.created_at, COALESCE(b.return_count, 0) AS return_count, b.last_returned_at, s.language " +
    "FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE b.user_id = ?"
  ).bind(String(userId)).first();

  if (!user) return null;

  const balance = await getBalance(env, userId);
  const purchases = await getUserPurchaseSummary(env, userId);
  const usage = await getUserUsageSummary(env, userId);
  return { ...user, balance, purchases, usage };
}

async function getUserUsageSummary(env, userId) {
  await ensureUsageStatsStorage(env);

  const sourceTable = (await shouldUseCreditUsageLog(env, userId)) ? "credit_usage_log" : "tts_history";
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(credits), 0) AS total_credits, COUNT(*) AS total_requests, MAX(created_at) AS last_tts_at, " +
      "COALESCE(SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 day') THEN credits ELSE 0 END), 0) AS credits_24h, " +
      "COALESCE(SUM(CASE WHEN datetime(created_at) >= datetime('now', '-7 days') THEN credits ELSE 0 END), 0) AS credits_7d, " +
      "COALESCE(SUM(CASE WHEN datetime(created_at) >= datetime('now', '-30 days') THEN credits ELSE 0 END), 0) AS credits_30d " +
    "FROM " + sourceTable + " WHERE user_id = ?"
  ).bind(String(userId)).first();

  return {
    totalCredits: Number(row?.total_credits || 0),
    totalRequests: Number(row?.total_requests || 0),
    credits24h: Number(row?.credits_24h || 0),
    credits7d: Number(row?.credits_7d || 0),
    credits30d: Number(row?.credits_30d || 0),
    lastTtsAt: row?.last_tts_at || null,
  };
}

async function ensureUsageStatsStorage(env) {
  await ensureTtsHistoryTable(env);
  await ensureCreditUsageLogTable(env);
}

async function shouldUseCreditUsageLog(env, userId = null) {
  await ensureUsageStatsStorage(env);
  const query = userId
    ? env.DB.prepare("SELECT 1 AS exists_flag FROM credit_usage_log WHERE user_id = ? LIMIT 1").bind(String(userId))
    : env.DB.prepare("SELECT 1 AS exists_flag FROM credit_usage_log LIMIT 1");
  const row = await query.first();
  return Boolean(row?.exists_flag);
}

async function getUserPurchaseSummary(env, userId) {
  const receipts = await env.DB.prepare(
    "SELECT amount, credits FROM payment_receipts WHERE user_id = ? AND status = 'approved'"
  ).bind(String(userId)).all();

  let totalPaidToman = 0;
  let totalBoughtCredits = 0;
  let approvedReceipts = 0;

  for (const receipt of receipts.results || []) {
    approvedReceipts++;
    totalPaidToman += parseMoneyAmount(receipt.amount);
    totalBoughtCredits += Number(receipt.credits || 0);
  }

  const stars = await env.DB.prepare(
    "SELECT stars, credits FROM star_payments WHERE user_id = ?"
  ).bind(String(userId)).all().catch(() => ({ results: [] }));

  let totalPaidStars = 0;
  let totalStarCredits = 0;
  let starPayments = 0;

  for (const payment of stars.results || []) {
    starPayments++;
    totalPaidStars += Number(payment.stars || 0);
    totalStarCredits += Number(payment.credits || 0);
  }

  return {
    approvedReceipts,
    totalPaidToman,
    totalBoughtCredits,
    starPayments,
    totalPaidStars,
    totalStarCredits,
  };
}

export async function resetUser(env, userId) {
  requireDb(env);
  const id = String(userId);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM payment_receipt_messages WHERE receipt_id IN (SELECT id FROM payment_receipts WHERE user_id = ?)").bind(id),
    env.DB.prepare("DELETE FROM payment_receipts WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM star_payments WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM pending_star_credit_inputs WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM pending_payments WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tts_history WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM credit_usage_log WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM daily_rewards WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM fa_join_bonuses WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM initial_start_bonuses WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM user_credits WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM admin_actions WHERE admin_id = ? OR target_user_id = ?").bind(id, id),
    env.DB.prepare("DELETE FROM admin_users WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM bot_users WHERE user_id = ?").bind(id),
  ]);
}

export async function adminUsersText(env, page = 0) {
  const data = await getAdminUsersPage(env, page);
  return [
    "👥 <b>Users</b>",
    "",
    "Total: <b>" + data.total + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    "Select a user:"
  ].join("\n");
}

export async function adminUsersKeyboard(env, page = 0) {
  const data = await getAdminUsersPage(env, page);
  const rows = [];

  rows.push([{ text: "🔎 Search by username or ID", callback_data: "admin_user_search_prompt" }]);

  for (const user of data.users) {
    rows.push([{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  }

  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_users:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_users:" + (data.page + 1) });
  if (nav.length) rows.push(nav);

  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function adminUserText(env, userId) {
  const user = await getAdminUserDetails(env, userId);
  if (!user) return "User not found.";

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "No name";
  const username = user.username ? "@" + user.username : "No username";
  const purchases = user.purchases || {};
  const usage = user.usage || {};

  return [
    "👤 <b>User</b>",
    "",
    "Name: <b>" + escapeHtml(name) + "</b>",
    "Username: <b>" + escapeHtml(username) + "</b>",
    "ID: <code>" + escapeHtml(user.user_id) + "</code>",
    "Language: <b>" + escapeHtml(formatLanguage(user.language)) + "</b>",
    "Balance: <b>" + Number(user.balance || 0).toLocaleString("en-US") + " credits</b>",
    "",
    "💳 <b>Purchases</b>",
    "Approved receipts: <b>" + Number(purchases.approvedReceipts || 0).toLocaleString("en-US") + "</b>",
    "Total paid: <b>" + formatToman(purchases.totalPaidToman || 0) + "</b>",
    "Bought credits: <b>" + Number(purchases.totalBoughtCredits || 0).toLocaleString("en-US") + " credits</b>",
    "Stars payments: <b>" + Number(purchases.starPayments || 0).toLocaleString("en-US") + "</b>",
    "Stars paid: <b>" + Number(purchases.totalPaidStars || 0).toLocaleString("en-US") + " XTR</b>",
    "Stars credits: <b>" + Number(purchases.totalStarCredits || 0).toLocaleString("en-US") + " credits</b>",
    "",
    "📊 <b>Usage</b>",
    "Total used: <b>" + Number(usage.totalCredits || 0).toLocaleString("en-US") + " credits</b>",
    "Requests: <b>" + Number(usage.totalRequests || 0).toLocaleString("en-US") + "</b>",
    "24h: <b>" + Number(usage.credits24h || 0).toLocaleString("en-US") + " credits</b>",
    "7 days: <b>" + Number(usage.credits7d || 0).toLocaleString("en-US") + " credits</b>",
    "30 days: <b>" + Number(usage.credits30d || 0).toLocaleString("en-US") + " credits</b>",
    "Last TTS: <b>" + escapeHtml(formatTehranTime(usage.lastTtsAt)) + "</b>",
    "",
    "Returns to bot: <b>" + Number(user.return_count || 0).toLocaleString("en-US") + "</b>",
    "Last return: <b>" + escapeHtml(formatTehranTime(user.last_returned_at)) + "</b>",
    "Last seen: <b>" + escapeHtml(formatTehranTime(user.last_seen_at)) + "</b>",
    "Created: <b>" + escapeHtml(formatTehranTime(user.created_at)) + "</b>",
  ].join("\n");
}

export function adminUserKeyboard(userId, page = 0) {
  return {
    inline_keyboard: [
      [{ text: "TTS History", callback_data: "admin_tts:" + userId + ":0:" + page }],
      [{ text: "📥 Download Text History", callback_data: "admin_tts_download:" + userId + ":" + page }],
      [{ text: "Change Credits", callback_data: "admin_credit_prompt:" + userId + ":" + page }],
      [{ text: "Send Message", callback_data: "admin_msg_prompt:" + userId + ":" + page }],
      [{ text: "Reset User", callback_data: "admin_reset_user:" + userId + ":" + page }],
      [{ text: "← Back to Users", callback_data: "admin_users:" + page }],
    ],
  };
}

export function adminUserSearchPromptText() {
  return [
    "🔎 <b>Search User</b>",
    "",
    "Send a Telegram user ID or username.",
    "Examples: <code>123456789</code> or <code>@username</code>",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export async function searchAdminUsers(env, query, limit = 8) {
  requireDb(env);
  const raw = String(query || "").trim().replace(/^@/, "");
  if (!raw) return [];
  const like = "%" + raw.toLowerCase() + "%";
  const rows = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, return_count FROM bot_users " +
    "WHERE user_id = ? OR LOWER(COALESCE(username, '')) LIKE ? ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, last_seen_at DESC LIMIT ?"
  ).bind(raw, like, raw, Number(limit)).all();
  return rows.results || [];
}

export function adminUserSearchResultsText(query, users) {
  return [
    "🔎 <b>User Search</b>",
    "",
    "Query: <code>" + escapeHtml(query) + "</code>",
    "Results: <b>" + formatNumber(users.length) + "</b>",
    "",
    users.length ? "Select a user:" : "No matching users found."
  ].join("\n");
}

export function adminUserSearchResultsKeyboard(users) {
  const rows = users.map((user) => [{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":0" }]);
  rows.push([{ text: "🔎 Search Again", callback_data: "admin_user_search_prompt" }]);
  rows.push([{ text: "← Back to Users", callback_data: "admin_users:0" }]);
  return { inline_keyboard: rows };
}

export async function adminReturnUsersText(env, threshold = null, page = 0) {
  if (threshold == null) {
    const stats = await getReturnUserStats(env);
    return [
      "↩️ <b>Return Users</b>",
      "",
      "Users returned more than 3 times: <b>" + formatNumber(stats.gt3) + "</b>",
      "Users returned more than 4 times: <b>" + formatNumber(stats.gt4) + "</b>",
      "Users returned more than 6 times: <b>" + formatNumber(stats.gt6) + "</b>",
      "",
      "Choose a segment:"
    ].join("\n");
  }
  const data = await getReturnUsersPage(env, threshold, page);
  return [
    "↩️ <b>Users returned more than " + Number(threshold) + " times</b>",
    "",
    "Total: <b>" + formatNumber(data.total) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    data.users.length ? "Select a user:" : "No users in this segment yet."
  ].join("\n");
}

export async function adminReturnUsersKeyboard(env, threshold = null, page = 0) {
  if (threshold == null) {
    return { inline_keyboard: [
      [{ text: "> 3 returns", callback_data: "admin_returns:3:0" }, { text: "> 4 returns", callback_data: "admin_returns:4:0" }],
      [{ text: "> 6 returns", callback_data: "admin_returns:6:0" }, { text: "← Back", callback_data: "admin_main" }],
    ] };
  }
  const data = await getReturnUsersPage(env, threshold, page);
  const rows = data.users.map((user) => [{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_returns:" + threshold + ":" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_returns:" + threshold + ":" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Segments", callback_data: "admin_returns" }, { text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

async function getReturnUserStats(env) {
  requireDb(env);
  const row = await env.DB.prepare(
    "SELECT SUM(CASE WHEN COALESCE(return_count, 0) > 3 THEN 1 ELSE 0 END) AS gt3, " +
    "SUM(CASE WHEN COALESCE(return_count, 0) > 4 THEN 1 ELSE 0 END) AS gt4, " +
    "SUM(CASE WHEN COALESCE(return_count, 0) > 6 THEN 1 ELSE 0 END) AS gt6 FROM bot_users"
  ).first();
  return { gt3: Number(row?.gt3 || 0), gt4: Number(row?.gt4 || 0), gt6: Number(row?.gt6 || 0) };
}

async function getReturnUsersPage(env, threshold, page = 0, limit = 8) {
  requireDb(env);
  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM bot_users WHERE COALESCE(return_count, 0) > ?").bind(Number(threshold)).first();
  const rows = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, return_count FROM bot_users " +
    "WHERE COALESCE(return_count, 0) > ? ORDER BY return_count DESC, datetime(last_returned_at) DESC LIMIT ? OFFSET ?"
  ).bind(Number(threshold), Number(limit), Number(offset)).all();
  return { total: Number(countRow?.total || 0), page: Number(page), limit: Number(limit), users: rows.results || [] };
}

export function adminCreditPromptText() {
  return [
    "✏️ <b>Change Credits</b>",
    "",
    "Send the amount you want:",
    "",
    "Examples:",
    "<code>+2500</code>",
    "<code>-700</code>",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export function adminMessagePromptText() {
  return [
    "✉️ <b>Send Message</b>",
    "",
    "Send the message text for this user.",
    "Your message will be deleted after sending."
  ].join("\n");
}

export async function adminWelcomeAudioText(env) {
  const audios = await getWelcomeAudios(env);
  const lines = [
    "🎧 <b>First Start Audio</b>",
    "",
    "Choose a language, upload/replace its audio, or delete it from first-start sending.",
    "",
    "Configured languages:"
  ];
  for (const [code, label] of Object.entries(LANGUAGES)) {
    lines.push((audios[code]?.fileId ? "✅ " : "❌ ") + escapeHtml(label) + " (<code>" + code + "</code>)");
  }
  return lines.join("\n");
}

export function adminWelcomeAudioKeyboard() {
  const rows = [];
  for (const [code, label] of Object.entries(LANGUAGES)) {
    rows.push([{ text: "Upload " + label, callback_data: "admin_welcome_audio_upload:" + code }, { text: "Delete", callback_data: "admin_welcome_audio_delete:" + code }]);
  }
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminWelcomeAudioPromptText(language = "en") {
  return [
    "🎧 <b>Upload First Start Audio</b>",
    "",
    "Target language: <b>" + escapeHtml(formatLanguage(language)) + "</b>",
    "Send one audio file now.",
    "The new file will replace the old one for this language only."
  ].join("\n");
}

export async function setWelcomeAudio(env, language, fileId, fileType = "audio") {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const lang = normalizeLang(language);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("welcome_audio_file_id_" + lang, String(fileId)),
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("welcome_audio_file_type_" + lang, String(fileType)),
  ]);
}

export async function deleteWelcomeAudio(env, language) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const lang = normalizeLang(language);
  await env.DB.prepare("DELETE FROM app_settings WHERE key IN (?, ?)").bind("welcome_audio_file_id_" + lang, "welcome_audio_file_type_" + lang).run();
}

export async function getWelcomeAudio(env, language = null) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const lang = language ? normalizeLang(language) : null;
  const keys = lang
    ? ["welcome_audio_file_id_" + lang, "welcome_audio_file_type_" + lang]
    : ["welcome_audio_file_id", "welcome_audio_file_type"];
  const rows = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key IN (?, ?)").bind(keys[0], keys[1]).all();
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  if (!values[keys[0]]) return null;
  return { fileId: values[keys[0]], fileType: values[keys[1]] || "audio", language: lang };
}

export async function getWelcomeAudios(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const rows = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'welcome_audio_file_%'").all();
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  const result = {};
  for (const code of Object.keys(LANGUAGES)) {
    const fileId = values["welcome_audio_file_id_" + code];
    if (fileId) result[code] = { fileId, fileType: values["welcome_audio_file_type_" + code] || "audio", language: code };
  }
  return result;
}

export async function adminVoiceProfilesText(env) {
  const profiles = await getVoiceProfiles(env);
  const lines = [
    "🖼 <b>Voice Profiles</b>",
    "",
    "Upload a photo for each voice. The photo appears in the left circle of the mini app voice menu.",
    "",
    "Configured voices:"
  ];
  for (const name of VOICE_NAMES) {
    lines.push((profiles[name]?.fileId ? "✅ " : "❌ ") + escapeHtml(name));
  }
  return lines.join("\n");
}

export function adminVoiceProfilesKeyboard() {
  const rows = [];
  for (const name of VOICE_NAMES) {
    rows.push([{ text: "Upload " + name, callback_data: "admin_voice_profile_upload:" + name }, { text: "Delete", callback_data: "admin_voice_profile_delete:" + name }]);
  }
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminVoiceProfilePromptText(voiceName = "Nora") {
  return [
    "🖼 <b>Upload Voice Profile</b>",
    "",
    "Target voice: <b>" + escapeHtml(voiceName) + "</b>",
    "Send one photo now.",
    "The new photo will replace the old profile image for this voice in the mini app."
  ].join("\n");
}

export async function setVoiceProfile(env, voiceName, fileId) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const name = normalizeVoiceProfileName(voiceName);
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("voice_profile_file_id_" + name, String(fileId)).run();
}

export async function deleteVoiceProfile(env, voiceName) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const name = normalizeVoiceProfileName(voiceName);
  await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind("voice_profile_file_id_" + name).run();
}

export async function getVoiceProfiles(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const rows = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'voice_profile_file_id_%'").all();
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  const result = {};
  for (const name of VOICE_NAMES) {
    const fileId = values["voice_profile_file_id_" + name];
    if (fileId) result[name] = { fileId, voiceName: name };
  }
  return result;
}

export async function getVoiceProfile(env, voiceName) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const name = normalizeVoiceProfileName(voiceName);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("voice_profile_file_id_" + name).first();
  return row?.value ? { fileId: row.value, voiceName: name } : null;
}

function normalizeVoiceProfileName(voiceName) {
  const raw = String(voiceName || "").trim();
  const match = VOICE_NAMES.find((name) => name.toLowerCase() === raw.toLowerCase());
  if (!match) throw new Error("Invalid voice name");
  return match;
}

export function adminBroadcastPromptText() {
  return [
    "📣 <b>Broadcast Message</b>",
    "",
    "Send the message text or an audio file for all users.",
    "Progress is updated live with sent, failed, and skipped counts.",
    "Your message will be deleted after sending."
  ].join("\n");
}

export function adminCancelKeyboard(backData = "admin_main") {
  return { inline_keyboard: [[{ text: "Cancel", callback_data: backData }]] };
}

export async function setAdminAction(env, adminId, action, options = {}) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO admin_actions (admin_id, action, target_user_id, page, chat_id, message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(admin_id) DO UPDATE SET action = excluded.action, target_user_id = excluded.target_user_id, page = excluded.page, chat_id = excluded.chat_id, message_id = excluded.message_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(
    String(adminId),
    action,
    options.targetUserId ? String(options.targetUserId) : null,
    Number(options.page || 0),
    options.chatId ? String(options.chatId) : null,
    options.messageId ? Number(options.messageId) : null
  ).run();
}

export async function getAdminAction(env, adminId) {
  requireDb(env);
  return await env.DB.prepare(
    "SELECT action, target_user_id, page, chat_id, message_id FROM admin_actions WHERE admin_id = ?"
  ).bind(String(adminId)).first();
}

export async function clearAdminAction(env, adminId) {
  requireDb(env);
  await env.DB.prepare("DELETE FROM admin_actions WHERE admin_id = ?").bind(String(adminId)).run();
}

async function sumCreditsSince(env, modifier) {
  const sourceTable = (await shouldUseCreditUsageLog(env)) ? "credit_usage_log" : "tts_history";
  const row = await env.DB.prepare("SELECT COALESCE(SUM(credits), 0) AS total FROM " + sourceTable + " WHERE datetime(created_at) >= datetime('now', ?)").bind(modifier).first();
  return Number(row?.total || 0);
}

async function countTtsRequestsSince(env, modifier) {
  const sourceTable = (await shouldUseCreditUsageLog(env)) ? "credit_usage_log" : "tts_history";
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM " + sourceTable + " WHERE datetime(created_at) >= datetime('now', ?)").bind(modifier).first();
  return Number(row?.total || 0);
}

async function countUsersSeenSince(env, modifier) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM bot_users WHERE datetime(last_seen_at) >= datetime('now', ?)").bind(modifier).first();
  return Number(row?.total || 0);
}

async function getHeavyUsageUsers(env, modifier, limit) {
  const sourceTable = (await shouldUseCreditUsageLog(env)) ? "credit_usage_log" : "tts_history";
  const rows = await env.DB.prepare(
    "SELECT h.user_id, SUM(h.credits) AS credits, COUNT(*) AS requests, b.username, b.first_name, b.last_name " +
    "FROM " + sourceTable + " h LEFT JOIN bot_users b ON b.user_id = h.user_id " +
    "WHERE datetime(h.created_at) >= datetime('now', ?) " +
    "GROUP BY h.user_id ORDER BY credits DESC, requests DESC LIMIT ?"
  ).bind(modifier, Number(limit)).all();
  return rows.results || [];
}

function formatHeavyUsers(users) {
  if (!users.length) return "No usage yet.";
  return users.map((user, index) => (index + 1) + ". " + escapeHtml(compactUserName(user)) + " — <b>" + formatNumber(user.credits) + "</b> credits / " + formatNumber(user.requests) + " requests").join("\n");
}

function buyerLabel(user) {
  const totalCredits = Number(user.total_receipt_credits || 0) + Number(user.total_star_credits || 0);
  return userLabel(user) + " • " + formatNumber(totalCredits) + " cr • " + formatToman(user.total_paid_toman) + " • " + formatStars(user.total_paid_stars);
}

function compactUserName(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const username = user.username ? "@" + user.username : "";
  return name || username || user.user_id;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function userLabel(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const username = user.username ? "@" + user.username : "";
  const label = name || username || user.user_id;
  const returns = Number(user.return_count || 0);
  return label + " • " + user.user_id + (returns > 0 ? " • ↩️ " + formatNumber(returns) : "");
}

function parseMoneyAmount(value) {
  const normalized = String(value || "").replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatToman(value) {
  return Number(value || 0).toLocaleString("en-US") + " Toman";
}

function formatStars(value) {
  return Number(value || 0).toLocaleString("en-US") + " Stars";
}

function formatLanguage(language) {
  const labels = {
    en: "English",
    fa: "Persian",
    ru: "Russian",
    de: "German",
    tr: "Turkish",
    ar: "Arabic",
    zh: "Chinese",
    ja: "Japanese",
    es: "Spanish",
    hi: "Hindi",
  };
  if (language === "not_selected") return "Not selected";
  return labels[language] || language || "Not selected";
}

function formatTehranTime(value) {
  if (!value) return "-";
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date) + " Tehran";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
