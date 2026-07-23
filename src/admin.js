import { ensureCreditUsageLogTable, getBalance } from "./credits.js";
import { LANGUAGES, normalizeLang } from "./i18n.js";
import { requireDb } from "./state.js";
import { getInitialStartCredits } from "./start-bonus.js";
import { getMandatoryFaMembershipSettings } from "./mandatory-channel.js";
import { ensureTtsHistoryTable } from "./tts-history.js";
import { tgJson } from "./telegram-api.js";
import { VOICE_NAMES } from "./voices.js";
import { getImageUsersPage, getUserImageHistory } from "./image-history.js";
import { ensureWheelTable } from "./reward-wheel.js";

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

export async function trackMiniAppOpen(env, user) {
  requireDb(env);
  if (!user || !user.id) return;

  await env.DB.prepare(
    "INSERT INTO bot_users (user_id, username, first_name, last_name, last_seen_at, created_at, return_count, mini_app_open_count, last_mini_app_opened_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 1, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET " +
    "username = COALESCE(excluded.username, bot_users.username), " +
    "first_name = COALESCE(excluded.first_name, bot_users.first_name), " +
    "last_name = COALESCE(excluded.last_name, bot_users.last_name), " +
    "mini_app_open_count = COALESCE(bot_users.mini_app_open_count, 0) + 1, " +
    "last_mini_app_opened_at = CURRENT_TIMESTAMP, " +
    "last_seen_at = CURRENT_TIMESTAMP"
  ).bind(
    String(user.id),
    user.username || null,
    user.first_name || null,
    user.last_name || null
  ).run();
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
      [{ text: "🎧 First Start Audio", callback_data: "admin_welcome_audio" }],
      [{ text: "🆕 Initial Start Credits", callback_data: "admin_initial_start" }, { text: "📱 Mini App Users", callback_data: "admin_mini_app_users:0" }],
      [{ text: "🎡 Wheel Users", callback_data: "admin_wheel_users:0" }],
      [{ text: "🔐 Mini App Access", callback_data: "admin_mini_app_access" }, { text: "🖼 Mini App Icons", callback_data: "admin_mini_app_icons" }],
      [{ text: "🎨 Image Users", callback_data: "admin_image_users:0" }],
      [{ text: "🖼 Voice Profiles", callback_data: "admin_voice_profiles" }],
      [{ text: "💸 Image Pricing", callback_data: "admin_image_pricing" }, { text: "🐙 Explore Prompts", callback_data: "admin_image_explore" }],
      [{ text: "🔒 Mandatory Membership", callback_data: "admin_mandatory_membership" }],
      [{ text: "Broadcast Message", callback_data: "admin_broadcast" }, { text: "📢 Channel Posts", callback_data: "admin_channel_posts" }],
      [{ text: "Pin Text for All Users", callback_data: "admin_pin_all" }],
    ],
  };
}


export const DEFAULT_IMAGE_CREDIT_COST = 188;

export async function getImagePricingSettings(env) {
  requireDb(env);
  const rows = await env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('image_credit_cost', 'image_discount_enabled', 'image_discount_cost', 'image_discount_until')"
  ).all().catch(() => ({ results: [] }));
  const values = Object.fromEntries((rows?.results || []).map((row) => [row.key, row.value]));
  const baseCost = parsePositiveInt(values.image_credit_cost, DEFAULT_IMAGE_CREDIT_COST);
  const discountCost = parsePositiveInt(values.image_discount_cost, 0);
  const discountUntil = parsePositiveInt(values.image_discount_until, 0);
  const now = Math.floor(Date.now() / 1000);
  const enabled = values.image_discount_enabled === "1" && discountCost > 0 && discountCost < baseCost && (discountUntil === 0 || discountUntil > now);
  if (values.image_discount_enabled === "1" && discountUntil > 0 && discountUntil <= now) {
    await setImageDiscountEnabled(env, false);
  }
  return {
    baseCost,
    activeCost: enabled ? discountCost : baseCost,
    discountEnabled: enabled,
    discountCost: enabled ? discountCost : 0,
    discountUntil: enabled && discountUntil > now ? discountUntil : 0,
    serverNow: now,
    discountPercent: enabled ? Math.max(1, Math.round((baseCost - discountCost) / baseCost * 100)) : 0,
  };
}

export async function setImageCreditCost(env, credits) {
  const value = Number.parseInt(credits, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Image credit cost must be a positive number");
  await setAppSetting(env, "image_credit_cost", String(value));
}

export async function setImageDiscountOffer(env, discountCost, minutes) {
  const cost = Number.parseInt(discountCost, 10);
  const duration = minutes == null || String(minutes).trim() === "" ? 0 : Number.parseInt(minutes, 10);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("Discount cost must be a positive number");
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Discount duration must be a positive number");
  const until = duration > 0 ? Math.floor(Date.now() / 1000) + duration * 60 : 0;
  await Promise.all([
    setAppSetting(env, "image_discount_cost", String(cost)),
    setAppSetting(env, "image_discount_until", String(until)),
    setAppSetting(env, "image_discount_enabled", "1"),
  ]);
}

export async function setImageDiscountEnabled(env, enabled) {
  await setAppSetting(env, "image_discount_enabled", enabled ? "1" : "0");
}

export async function adminImagePricingText(env) {
  const settings = await getImagePricingSettings(env);
  const lines = [
    "💸 <b>Image Credit Pricing</b>",
    "",
    "Base price: <b>" + formatNumber(settings.baseCost) + " credits</b>",
    "Active price: <b>" + formatNumber(settings.activeCost) + " credits</b>",
  ];
  if (settings.discountEnabled) {
    lines.push("Discount: <b>ON</b> · <b>" + settings.discountPercent + "% OFF</b>");
    if (settings.discountUntil > 0) lines.push("Ends in: <b>" + formatImageOfferDuration(settings.discountUntil - settings.serverNow) + "</b>");
    else lines.push("Timer: <b>OFF</b>");
  } else {
    lines.push("Discount: <b>OFF</b>");
  }
  lines.push("", "Use Set Base Price for the normal image cost, or Start Discount with: <code>discount_price</code> or <code>discount_price minutes</code>.");
  return lines.join("\n");
}

export function adminImagePricingKeyboard(settings = null) {
  const rows = [
    [{ text: "✏️ Set Base Price", callback_data: "admin_image_price_prompt" }],
    [{ text: "🔥 Start Discount", callback_data: "admin_image_discount_prompt" }],
  ];
  if (settings?.discountEnabled) rows.push([{ text: "⛔ Cancel Discount", callback_data: "admin_image_discount_cancel" }]);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminImagePricePromptText() {
  return ["💸 <b>Set Image Base Price</b>", "", "Send the new positive credit cost per image.", "Example: <code>188</code>"].join("\n");
}

export function adminImageDiscountPromptText() {
  return ["🔥 <b>Start Image Discount</b>", "", "Send discount price, optionally followed by duration in minutes.", "Examples: <code>99</code> or <code>99 30</code>", "", "If you omit minutes, the discount stays active until you cancel it."].join("\n");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function setAppSetting(env, key, value) {
  requireDb(env);
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(key, value == null ? null : String(value)).run();
}

function formatImageOfferDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  return minutes + "m " + secs + "s";
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

export async function adminLanguageStatsKeyboard(env) {
  const stats = await getAdminLanguageStats(env);
  const rows = [];
  for (const row of stats.languages) {
    rows.push([{ text: "👥 " + formatLanguage(row.language) + " (" + formatNumber(row.total) + ")", callback_data: "admin_language_users:" + row.language + ":0" }]);
  }
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function getAdminLanguageUsersPage(env, language, page = 0, limit = 8) {
  requireDb(env);
  const selectedLanguage = normalizeLanguageSegment(language);
  const offset = Number(page) * Number(limit);
  const where = selectedLanguage === "not_selected"
    ? "COALESCE(NULLIF(s.language, ''), 'not_selected') = 'not_selected'"
    : "s.language = ?";
  const countSql = "SELECT COUNT(*) AS total FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE " + where;
  const usersSql = "SELECT b.user_id, b.username, b.first_name, b.last_name, b.last_seen_at, b.return_count, b.mini_app_open_count " +
    "FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE " + where +
    " ORDER BY datetime(b.last_seen_at) DESC LIMIT ? OFFSET ?";
  const countRow = selectedLanguage === "not_selected"
    ? await env.DB.prepare(countSql).first()
    : await env.DB.prepare(countSql).bind(selectedLanguage).first();
  const users = selectedLanguage === "not_selected"
    ? await env.DB.prepare(usersSql).bind(Number(limit), Number(offset)).all()
    : await env.DB.prepare(usersSql).bind(selectedLanguage, Number(limit), Number(offset)).all();

  return {
    language: selectedLanguage,
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function adminLanguageUsersText(env, language, page = 0) {
  const data = await getAdminLanguageUsersPage(env, language, page);
  const lines = [
    "🌍 <b>" + escapeHtml(formatLanguage(data.language)) + " Users</b>",
    "",
    "Total: <b>" + formatNumber(data.total) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
  ];

  if (!data.users.length) {
    lines.push("No users in this language yet.");
  } else {
    lines.push(...data.users.map((user, index) => {
      const number = data.page * data.limit + index + 1;
      return number + ". " + escapeHtml(userLabel(user)) + "\nLast seen: <b>" + escapeHtml(formatTehranTime(user.last_seen_at)) + "</b>";
    }));
  }

  return lines.join("\n");
}

export async function adminLanguageUsersKeyboard(env, language, page = 0) {
  const data = await getAdminLanguageUsersPage(env, language, page);
  const rows = data.users.map((user) => [{ text: userLabel(user), callback_data: "admin_user:" + user.user_id + ":0" }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_language_users:" + data.language + ":" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_language_users:" + data.language + ":" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Languages", callback_data: "admin_language_stats" }, { text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

function normalizeLanguageSegment(language) {
  const raw = String(language || "not_selected").trim();
  if (raw === "not_selected") return raw;
  return normalizeLang(raw);
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
    "SELECT user_id, username, first_name, last_name, last_seen_at, return_count, mini_app_open_count FROM bot_users ORDER BY last_seen_at DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function getAdminMiniAppUsersPage(env, page = 0, limit = 8) {
  requireDb(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM bot_users WHERE COALESCE(mini_app_open_count, 0) > 0"
  ).first();
  const users = await env.DB.prepare(
    "SELECT user_id, username, first_name, last_name, last_seen_at, COALESCE(mini_app_open_count, 0) AS mini_app_open_count, last_mini_app_opened_at FROM bot_users " +
    "WHERE COALESCE(mini_app_open_count, 0) > 0 " +
    "ORDER BY datetime(COALESCE(last_mini_app_opened_at, last_seen_at)) DESC, mini_app_open_count DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function adminMiniAppUsersText(env, page = 0) {
  const data = await getAdminMiniAppUsersPage(env, page);
  const totalOpens = data.users.reduce((sum, user) => sum + Number(user.mini_app_open_count || 0), 0);
  return [
    "📱 <b>Mini App Users</b>",
    "",
    "Users opened mini app: <b>" + formatNumber(data.total) + "</b>",
    "This page opens: <b>" + formatNumber(totalOpens) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    data.users.length ? "Select a user (most recent mini app activity first):" : "No mini app opens yet."
  ].join("\n");
}

export async function adminMiniAppUsersKeyboard(env, page = 0) {
  const data = await getAdminMiniAppUsersPage(env, page);
  const rows = data.users.map((user) => [{ text: miniAppUserLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_mini_app_users:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_mini_app_users:" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

function miniAppUserLabel(user) {
  return userLabel(user) + " • 📱 " + formatNumber(user.mini_app_open_count || 0);
}


export async function getAdminWheelUsersPage(env, page = 0, limit = 8) {
  requireDb(env);
  await ensureWheelTable(env);

  const offset = Number(page) * Number(limit);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM mini_app_wheel_spins WHERE COALESCE(spin_count, 0) > 0"
  ).first();
  const users = await env.DB.prepare(
    "SELECT w.user_id, u.username, u.first_name, u.last_name, u.last_seen_at, w.last_spin_at, w.reward, COALESCE(w.spin_count, 0) AS spin_count, COALESCE(w.total_reward, 0) AS total_reward " +
    "FROM mini_app_wheel_spins w LEFT JOIN bot_users u ON u.user_id = w.user_id " +
    "WHERE COALESCE(w.spin_count, 0) > 0 " +
    "ORDER BY w.last_spin_at DESC, w.updated_at DESC LIMIT ? OFFSET ?"
  ).bind(Number(limit), Number(offset)).all();

  return {
    total: Number(countRow?.total || 0),
    page: Number(page),
    limit: Number(limit),
    users: users.results || [],
  };
}

export async function adminWheelUsersText(env, page = 0) {
  const data = await getAdminWheelUsersPage(env, page);
  const pageSpins = data.users.reduce((sum, user) => sum + Number(user.spin_count || 0), 0);
  const pageRewards = data.users.reduce((sum, user) => sum + Number(user.total_reward || 0), 0);
  return [
    "🎡 <b>Reward Wheel Users</b>",
    "",
    "Users spun wheel: <b>" + formatNumber(data.total) + "</b>",
    "This page spins: <b>" + formatNumber(pageSpins) + "</b>",
    "This page rewards: <b>" + formatNumber(pageRewards) + " credits</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    data.users.length ? "Select a user from the buttons below (latest wheel activity first):" : "No wheel spins have been recorded yet."
  ].join("\n");
}

export async function adminWheelUsersKeyboard(env, page = 0) {
  const data = await getAdminWheelUsersPage(env, page);
  const rows = data.users.map((user) => [{ text: wheelUserLabel(user), callback_data: "admin_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_wheel_users:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_wheel_users:" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

function wheelUserLabel(user) {
  return userLabel(user) + " • 🎡 #" + formatNumber(user.spin_count || 0) + " • 🏆 " + formatNumber(user.total_reward || 0);
}

export async function adminImageUsersText(env, page = 0) {
  const data = await getImageUsersPage(env, page);
  const pageImages = data.users.reduce((sum, user) => sum + Number(user.image_count || 0), 0);
  return [
    "🎨 <b>Image Generation Users</b>",
    "",
    "Users with images: <b>" + formatNumber(data.total) + "</b>",
    "This page images: <b>" + formatNumber(pageImages) + "</b>",
    "Page: <b>" + (data.page + 1) + "</b>",
    "",
    data.users.length ? "Select a user to view details or download their image history:" : "No image generations have been recorded yet."
  ].join("\n");
}

export async function adminImageUsersKeyboard(env, page = 0) {
  const data = await getImageUsersPage(env, page);
  const rows = data.users.map((user) => [{ text: imageUserLabel(user), callback_data: "admin_image_user:" + user.user_id + ":" + data.page }]);
  const nav = [];
  if (data.page > 0) nav.push({ text: "← Prev", callback_data: "admin_image_users:" + (data.page - 1) });
  if ((data.page + 1) * data.limit < data.total) nav.push({ text: "Next →", callback_data: "admin_image_users:" + (data.page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export async function adminImageUserText(env, userId) {
  const rows = await getUserImageHistory(env, userId, 100);
  const latest = rows.slice(0, 5);
  const lines = [
    "🎨 <b>User Image History</b>",
    "",
    "User ID: <code>" + escapeHtml(userId) + "</code>",
    "Recorded images: <b>" + formatNumber(rows.length) + "</b>",
    "",
    latest.length ? "Latest prompts:" : "No image history for this user."
  ];
  latest.forEach((item, index) => {
    lines.push("", (index + 1) + ". <b>" + escapeHtml(formatTehranTime(item.created_at)) + "</b> · " + escapeHtml(item.kind || "generate"));
    lines.push(escapeHtml(String(item.prompt || "").slice(0, 260)));
  });
  return lines.join("\n");
}

export function adminImageUserKeyboard(userId, page = 0) {
  return { inline_keyboard: [
    [{ text: "📥 Download Images + Prompts", callback_data: "admin_image_download:" + userId + ":" + page }],
    [{ text: "← Back to Image Users", callback_data: "admin_image_users:" + page }],
  ] };
}

function imageUserLabel(user) {
  return userLabel(user) + " • 🎨 " + formatNumber(user.image_count || 0);
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
  return getUserIdsByLanguage(env, "all");
}

export async function getUserIdsByLanguage(env, language = "all") {
  requireDb(env);
  const normalized = language === "all" ? "all" : normalizeLang(language);
  const query = normalized === "all"
    ? "SELECT user_id FROM bot_users"
    : "SELECT b.user_id FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id WHERE COALESCE(s.language, 'en') = ?";
  const statement = env.DB.prepare(query);
  const users = normalized === "all" ? await statement.all() : await statement.bind(normalized).all();
  return (users.results || []).map((user) => String(user.user_id));
}

export async function getAdminUserDetails(env, userId) {
  requireDb(env);
  await ensureWheelTable(env);

  const user = await env.DB.prepare(
    "SELECT b.user_id, b.username, b.first_name, b.last_name, b.last_seen_at, b.created_at, COALESCE(b.return_count, 0) AS return_count, b.last_returned_at, COALESCE(b.mini_app_open_count, 0) AS mini_app_open_count, b.last_mini_app_opened_at, s.language, " +
    "COALESCE(w.spin_count, 0) AS wheel_spin_count, COALESCE(w.reward, 0) AS wheel_last_reward, COALESCE(w.total_reward, 0) AS wheel_total_reward, w.last_spin_at AS wheel_last_spin_at " +
    "FROM bot_users b LEFT JOIN user_state s ON s.user_id = b.user_id LEFT JOIN mini_app_wheel_spins w ON w.user_id = b.user_id WHERE b.user_id = ?"
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
    "Mini app opens: <b>" + Number(user.mini_app_open_count || 0).toLocaleString("en-US") + "</b>",
    "Last mini app open: <b>" + escapeHtml(formatTehranTime(user.last_mini_app_opened_at)) + "</b>",
    "Wheel spins: <b>" + Number(user.wheel_spin_count || 0).toLocaleString("en-US") + "</b>",
    "Last wheel prize: <b>" + Number(user.wheel_last_reward || 0).toLocaleString("en-US") + " credits</b>",
    "Total wheel prizes: <b>" + Number(user.wheel_total_reward || 0).toLocaleString("en-US") + " credits</b>",
    "Last wheel spin: <b>" + escapeHtml(formatUnixTehranTime(user.wheel_last_spin_at)) + "</b>",
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

const MINI_APP_ICON_TARGETS = [
  { key: "history", label: "History button" },
  { key: "emotions", label: "Emotions button" },
  { key: "image_mode", label: "Create image mode icon" },
  { key: "voice_mode", label: "Text to voice mode icon" },
  { key: "image_generate", label: "Generate image button" },
];

export async function adminMiniAppIconsText(env) {
  const icons = await getMiniAppButtonIcons(env);
  return [
    "🖼 <b>Mini App Button Icons</b>",
    "",
    "Upload custom photos for the mini app buttons. Uploaded images are shown as circular icons with the current button border/line.",
    "",
    "Configured icons:",
    ...MINI_APP_ICON_TARGETS.map((item) => (icons[item.key]?.fileId ? "✅ " : "❌ ") + escapeHtml(item.label))
  ].join("\n");
}

export function adminMiniAppIconsKeyboard() {
  const rows = MINI_APP_ICON_TARGETS.map((item) => [
    { text: "Upload " + item.label, callback_data: "admin_mini_app_icon_upload:" + item.key },
    { text: "Delete", callback_data: "admin_mini_app_icon_delete:" + item.key }
  ]);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminMiniAppIconPromptText(iconKey = "history") {
  const target = miniAppIconTarget(iconKey);
  return [
    "🖼 <b>Upload Mini App Icon</b>",
    "",
    "Target: <b>" + escapeHtml(target.label) + "</b>",
    "Send one photo now.",
    "The new photo will replace the current mini app button icon."
  ].join("\n");
}

export async function setMiniAppButtonIcon(env, iconKey, fileId) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const target = miniAppIconTarget(iconKey);
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("mini_app_icon_file_id_" + target.key, String(fileId)).run();
}

export async function deleteMiniAppButtonIcon(env, iconKey) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const target = miniAppIconTarget(iconKey);
  await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind("mini_app_icon_file_id_" + target.key).run();
}

export async function getMiniAppButtonIcons(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const rows = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'mini_app_icon_file_id_%'").all();
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
  const result = {};
  for (const item of MINI_APP_ICON_TARGETS) {
    const fileId = values["mini_app_icon_file_id_" + item.key];
    if (fileId) result[item.key] = { fileId, key: item.key, label: item.label };
  }
  return result;
}

export async function getMiniAppButtonIcon(env, iconKey) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const target = miniAppIconTarget(iconKey);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("mini_app_icon_file_id_" + target.key).first();
  return row?.value ? { fileId: row.value, key: target.key, label: target.label } : null;
}

function miniAppIconTarget(iconKey) {
  const key = String(iconKey || "").trim();
  const target = MINI_APP_ICON_TARGETS.find((item) => item.key === key);
  if (!target) throw new Error("Invalid mini app icon");
  return target;
}


export const IMAGE_EXPLORE_SIZE_OPTIONS = [
  { size: "1024x1024", label: "Square" },
  { size: "1024x1280", label: "Social portrait" },
  { size: "960x1344", label: "Photo portrait" },
  { size: "1152x1536", label: "Classic portrait" },
  { size: "1024x1536", label: "Portrait" },
  { size: "1152x2048", label: "Story" },
  { size: "768x1792", label: "Mobile tall" },
  { size: "1024x2048", label: "Tall" },
  { size: "864x2592", label: "Ultra tall" },
  { size: "1280x1024", label: "Social landscape" },
  { size: "1344x960", label: "Photo landscape" },
  { size: "1536x1152", label: "Classic landscape" },
  { size: "1536x1024", label: "Wide" },
  { size: "2048x1152", label: "Cinema" },
  { size: "1792x768", label: "Ultrawide" },
  { size: "2048x1024", label: "Panorama" },
  { size: "2592x864", label: "Banner" },
];


export const IMAGE_EXPLORE_TAGS = [
  "Trending", "Portrait", "Profile", "Cinematic", "Realistic", "Studio", "Fashion", "Luxury", "Lifestyle", "Street",
  "Travel", "Nature", "Fantasy", "Business", "Couple", "Family", "Product", "Advertising", "E-commerce", "Food",
  "Beauty", "Technology", "Automotive", "Indoor", "Outdoor", "Night", "Minimal", "Colorful", "Instagram", "Story",
];

function normalizeImageExploreTags(tags) {
  const allowed = new Set(IMAGE_EXPLORE_TAGS);
  const values = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return Array.from(new Set(values.map((tag) => String(tag || "").trim()).filter((tag) => allowed.has(tag))));
}

function imageExploreTagsLabel(tags) {
  const clean = normalizeImageExploreTags(tags);
  return clean.length ? clean.join(", ") : "No tags";
}

export function normalizeImageExploreSize(size) {
  const clean = String(size || "").trim().toLowerCase();
  return IMAGE_EXPLORE_SIZE_OPTIONS.some((item) => item.size === clean) ? clean : "1024x1024";
}

export function imageExploreSizeLabel(size) {
  const clean = normalizeImageExploreSize(size);
  const option = IMAGE_EXPLORE_SIZE_OPTIONS.find((item) => item.size === clean);
  return (option ? option.label : "Square") + " · " + clean.replace("x", "×");
}

export function imageExploreSizeShortLabel(size) {
  const clean = normalizeImageExploreSize(size);
  const [width, height] = clean.split("x").map((value) => Number.parseInt(value, 10));
  if (!width || !height) return clean.replace("x", ":");
  const divisor = greatestCommonDivisor(width, height);
  return (width / divisor) + ":" + (height / divisor);
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export async function cycleImageExploreSize(env, itemId) {
  const items = await readImageExploreItems(env);
  const item = items.find((entry) => entry.id === String(itemId));
  if (!item) throw new Error("Explore card not found");
  const current = normalizeImageExploreSize(item.size);
  const index = IMAGE_EXPLORE_SIZE_OPTIONS.findIndex((option) => option.size === current);
  item.size = IMAGE_EXPLORE_SIZE_OPTIONS[(index + 1) % IMAGE_EXPLORE_SIZE_OPTIONS.length].size;
  await saveImageExploreItems(env, normalizeImageExploreOrder(items));
  return item.size;
}

export async function setImageExplorePosition(env, itemId, position = "bottom") {
  const targetIndex = position === "top" ? 1 : Number.MAX_SAFE_INTEGER;
  return moveImageExploreItemToPosition(env, itemId, targetIndex);
}

export async function moveImageExploreItemToPosition(env, itemId, position) {
  const id = String(itemId);
  const items = (await readImageExploreItems(env)).sort((a, b) => a.order - b.order);
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("Explore card not found");
  const target = Math.max(1, Math.min(Number.parseInt(String(position), 10) || 1, items.length));
  const [item] = items.splice(index, 1);
  items.splice(target - 1, 0, item);
  const ordered = normalizeImageExploreOrder(items);
  await saveImageExploreItems(env, ordered);
  return ordered.findIndex((entry) => entry.id === id) + 1;
}

export async function getImageExploreItems(env) {
  const items = await readImageExploreItems(env);
  return items.filter((item) => item.prompt || item.fileId).sort((a, b) => a.order - b.order).slice(0, 50);
}

async function readImageExploreItems(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("image_explore_items").first();
  let items = [];
  try { items = JSON.parse(row?.value || "[]"); } catch { items = []; }
  return Array.isArray(items) ? items.map((item, index) => ({
    id: String(item.id || index + 1),
    prompt: String(item.prompt || ""),
    fileId: String(item.fileId || ""),
    order: Number(item.order || index + 1),
    size: normalizeImageExploreSize(item.size),
    tags: normalizeImageExploreTags(item.tags),
  })) : [];
}

function normalizeImageExploreOrder(items) {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

async function saveImageExploreItems(env, items) {
  await ensureAppSettingsTable(env);
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("image_explore_items", JSON.stringify(normalizeImageExploreOrder(items))).run();
}

export async function addImageExplorePrompt(env, prompt) {
  const clean = String(prompt || "").trim();
  const items = await readImageExploreItems(env);
  const id = String(Date.now());
  items.push({ id, prompt: clean, fileId: "", size: "1024x1024", tags: [], order: items.length + 1 });
  await saveImageExploreItems(env, items);
  return id;
}

export async function setImageExploreImage(env, itemId, fileId) {
  const items = await readImageExploreItems(env);
  const item = items.find((entry) => entry.id === String(itemId));
  if (!item) throw new Error("Explore card not found");
  item.fileId = String(fileId);
  await saveImageExploreItems(env, items);
}

export async function setImageExploreTags(env, itemId, tags) {
  const items = await readImageExploreItems(env);
  const item = items.find((entry) => entry.id === String(itemId));
  if (!item) throw new Error("Explore card not found");
  item.tags = normalizeImageExploreTags(tags);
  await saveImageExploreItems(env, items);
  return item.tags;
}

export async function toggleImageExploreTag(env, itemId, tag) {
  const items = await readImageExploreItems(env);
  const item = items.find((entry) => entry.id === String(itemId));
  if (!item) throw new Error("Explore card not found");
  const cleanTag = normalizeImageExploreTags([tag])[0];
  if (!cleanTag) throw new Error("Invalid explore tag");
  const tags = new Set(normalizeImageExploreTags(item.tags));
  if (tags.has(cleanTag)) tags.delete(cleanTag);
  else tags.add(cleanTag);
  item.tags = normalizeImageExploreTags(Array.from(tags));
  await saveImageExploreItems(env, items);
  return item.tags;
}

export async function deleteImageExploreItem(env, itemId) {
  const items = (await readImageExploreItems(env)).filter((item) => item.id !== String(itemId)).map((item, index) => ({ ...item, order: index + 1 }));
  await saveImageExploreItems(env, items);
}

export async function adminImageExploreText(env) {
  const items = await getImageExploreItems(env);
  return [
    "🐙 <b>Image Explore References</b>",
    "",
    "Upload visual reference cards for the mini app Explore row. Users provide their own image; no card prompt is shown or required.",
    "",
    items.length ? "Cards:" : "No cards yet.",
    ...items.map((item, index) => "#" + (index + 1) + " · " + imageExploreSizeLabel(item.size) + (item.fileId ? " · 🖼 Ready" : " · <i>Needs image</i>") + " · 🏷 " + imageExploreTagsLabel(item.tags))
  ].join("\n");
}

export function adminImageExploreKeyboard(items = []) {
  const rows = [[{ text: "Add", callback_data: "admin_image_explore_add" }]];
  items.forEach((item, index) => {
    const position = index === 0 ? "bottom" : "top";
    const edgeText = index === 0 ? "Last" : "First";
    rows.push([
      { text: String(index + 1), callback_data: "admin_image_explore_noop" },
      { text: "Upload", callback_data: "admin_image_explore_upload:" + item.id },
      { text: "Delete", callback_data: "admin_image_explore_delete:" + item.id },
      { text: imageExploreSizeShortLabel(item.size), callback_data: "admin_image_explore_size:" + item.id },
      { text: edgeText, callback_data: "admin_image_explore_position:" + item.id + ":" + position },
      { text: "Move", callback_data: "admin_image_explore_move:" + item.id }
    ]);
  });
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminImageExplorePromptText() {
  return "🐙 <b>Add Explore Reference</b>\n\nSend one photo. It will be used as a visual reference; no text prompt is needed.";
}

export function adminImageExploreUploadText() {
  return "🖼 <b>Upload Explore Card Image</b>\n\nSend one photo for this card.";
}

export function adminImageExploreTagsText(item = null) {
  return [
    "🏷 <b>Choose Explore Tags</b>",
    "",
    "Select any number of tags for this image, then tap Confirm.",
    "",
    "Selected: <b>" + imageExploreTagsLabel(item?.tags) + "</b>",
  ].join("\n");
}

export function adminImageExploreTagsKeyboard(itemId, selectedTags = []) {
  const selected = new Set(normalizeImageExploreTags(selectedTags));
  const rows = [];
  for (let index = 0; index < IMAGE_EXPLORE_TAGS.length; index += 3) {
    rows.push(IMAGE_EXPLORE_TAGS.slice(index, index + 3).map((tag) => ({
      text: (selected.has(tag) ? "✅ " : "") + tag,
      callback_data: "admin_image_explore_tag:" + itemId + ":" + encodeURIComponent(tag),
    })));
  }
  rows.push([{ text: "✅ Confirm", callback_data: "admin_image_explore_tags_done:" + itemId }]);
  rows.push([{ text: "← Back", callback_data: "admin_image_explore" }]);
  return { inline_keyboard: rows };
}

export function adminImageExploreMoveText(index = null) {
  const card = index ? " #" + index : "";
  return "↕️ <b>Move Explore Card" + card + "</b>\n\nSend the destination card number. For example, send <code>3</code> to place this card at position 3 in the list.";
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


const CHANNEL_POST_LANGUAGE_SETTINGS = {
  fa: { label: "فارسی", channel: "@VexaOrder" },
};

export function adminChannelPostsText() {
  return [
    "📢 <b>Channel Posts</b>",
    "",
    "Send a post to a language-specific Telegram channel with an inline Mini App button under it.",
    "",
    "Configured channels:",
    ...Object.entries(CHANNEL_POST_LANGUAGE_SETTINGS).map(([code, settings]) => "• <b>" + settings.label + "</b> (<code>" + code + "</code>): <b>" + escapeHtml(settings.channel) + "</b>"),
    "",
    "Button text: <b>Open Mini App</b>"
  ].join("\n");
}

export function adminChannelPostsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🇮🇷 Send Persian Post", callback_data: "admin_channel_post_prompt:fa" }],
      [{ text: "← Back", callback_data: "admin_main" }],
    ],
  };
}

export function adminChannelPostPromptText(language = "fa") {
  const settings = getChannelPostLanguageSettings(language);
  return [
    "📢 <b>Send Channel Post</b>",
    "",
    "Language: <b>" + settings.label + "</b>",
    "Channel: <b>" + escapeHtml(settings.channel) + "</b>",
    "",
    "Send the text, photo, or photo with caption that you want to publish.",
    "Photo-only posts are allowed, and photo captions will be kept.",
    "It will be posted with an inline button named <b>Open Mini App</b> below it.",
    "",
    "Your message will be deleted after processing."
  ].join("\n");
}

export function getChannelPostLanguageSettings(language = "fa") {
  const normalized = normalizeLang(language);
  return CHANNEL_POST_LANGUAGE_SETTINGS[normalized] || CHANNEL_POST_LANGUAGE_SETTINGS.fa;
}

export async function buildMiniAppUrl(env, section = "home") {
  const configuredDeepLink = String(env.CHANNEL_POST_MINI_APP_DEEP_LINK || "").trim();
  if (configuredDeepLink) {
    if (!/^https:\/\/t\.me\//i.test(configuredDeepLink)) {
      throw new Error("CHANNEL_POST_MINI_APP_DEEP_LINK must be a https://t.me Mini App link.");
    }
    return appendMiniAppSection(configuredDeepLink, section);
  }

  const bot = await tgJson(env, "getMe");
  const username = String(bot?.username || "").trim();
  if (!username) throw new Error("Telegram did not return the bot username.");

  const shortName = String(env.CHANNEL_POST_MINI_APP_SHORT_NAME || "").trim();
  if (shortName) {
    if (!/^[A-Za-z0-9_-]+$/.test(shortName)) {
      throw new Error("CHANNEL_POST_MINI_APP_SHORT_NAME is invalid.");
    }
    return appendMiniAppSection("https://t.me/" + username + "/" + shortName, section);
  }

  return appendMiniAppSection("https://t.me/" + username + "?startapp", section);
}

function appendMiniAppSection(url, section = "home") {
  const target = normalizeMiniAppSection(section);
  if (!target || target === "home") return url;
  if (/([?&])startapp($|[=&])/i.test(url)) {
    return url.replace(/([?&])startapp(?:=[^&]*)?/i, "$1startapp=" + encodeURIComponent(target));
  }
  const separator = url.includes("?") ? "&" : "?";
  return url + separator + "startapp=" + encodeURIComponent(target);
}

export const MINI_APP_BROADCAST_SECTIONS = {
  home: "Home",
  wheel: "Reward Wheel",
  image: "Image Generator",
  explore: "Explore",
  tts: "Text to Speech",
};

export function normalizeMiniAppSection(section = "home") {
  return MINI_APP_BROADCAST_SECTIONS[section] ? section : "home";
}

export function channelPostMiniAppKeyboard(miniAppUrl) {
  return {
    inline_keyboard: [[{ text: "Open Mini App", url: miniAppUrl }]],
  };
}

export function adminBroadcastPromptText(options = {}) {
  const config = normalizeBroadcastConfig(options);
  return [
    "📣 <b>Broadcast Message</b>",
    "",
    "Language: <b>" + broadcastLanguageLabel(config.language) + "</b>",
    "Mini App button: <b>" + (config.button ? "ON" : "OFF") + "</b>",
    "Open section: <b>" + MINI_APP_BROADCAST_SECTIONS[config.section] + "</b>",
    "",
    "Send text, photo with caption, or photo-only content.",
    "Your message will be deleted after sending."
  ].join("\n");
}

export function adminBroadcastKeyboard(options = {}) {
  const config = normalizeBroadcastConfig(options);
  const rows = [[{ text: "🌍 Language: " + broadcastLanguageLabel(config.language), callback_data: "admin_broadcast_lang" }]];
  rows.push([{ text: config.button ? "✅ Mini App Button: ON" : "Mini App Button: OFF", callback_data: "admin_broadcast_button" }]);
  if (config.button) rows.push([{ text: "📱 Opens: " + MINI_APP_BROADCAST_SECTIONS[config.section], callback_data: "admin_broadcast_section" }]);
  rows.push([{ text: "Cancel", callback_data: "admin_main" }]);
  return { inline_keyboard: rows };
}

export function adminBroadcastLanguageKeyboard(options = {}) {
  const config = normalizeBroadcastConfig(options);
  const rows = [[{ text: (config.language === "all" ? "✅ " : "") + "All languages", callback_data: "admin_broadcast_lang_set:all" }]];
  for (const [code, label] of Object.entries(LANGUAGES)) {
    rows.push([{ text: (config.language === code ? "✅ " : "") + label + " (" + code + ")", callback_data: "admin_broadcast_lang_set:" + code }]);
  }
  rows.push([{ text: "← Back", callback_data: "admin_broadcast" }]);
  return { inline_keyboard: rows };
}

export function adminBroadcastSectionKeyboard(options = {}) {
  const config = normalizeBroadcastConfig(options);
  const rows = Object.entries(MINI_APP_BROADCAST_SECTIONS).map(([key, label]) => [{ text: (config.section === key ? "✅ " : "") + label, callback_data: "admin_broadcast_section_set:" + key }]);
  rows.push([{ text: "← Back", callback_data: "admin_broadcast" }]);
  return { inline_keyboard: rows };
}

export function normalizeBroadcastConfig(options = {}) {
  return {
    language: options.language === "all" ? "all" : normalizeLang(options.language || "all"),
    button: options.button === true || options.button === "1",
    section: normalizeMiniAppSection(options.section || "home"),
  };
}

export function encodeBroadcastConfig(config) {
  return JSON.stringify(normalizeBroadcastConfig(config));
}

export function decodeBroadcastConfig(value) {
  try { return normalizeBroadcastConfig(JSON.parse(value || "{}")); } catch { return normalizeBroadcastConfig(); }
}

function broadcastLanguageLabel(language) {
  return language === "all" ? "All languages" : (LANGUAGES[normalizeLang(language)] + " (" + normalizeLang(language) + ")");
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

function formatUnixTehranTime(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  return formatTehranTime(new Date(seconds * 1000).toISOString());
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
