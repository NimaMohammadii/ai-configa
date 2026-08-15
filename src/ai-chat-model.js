import { requireDb } from "./state.js";
import { CUSTOM_STARS_USD_PER_1000_CREDITS, MINI_APP_STAR_PACKAGES } from "./stars.js";

export const AI_CHAT_MODELS = Object.freeze([
  Object.freeze({ id: "gpt-5.6-luna", label: "Luna", inputUsd: 1.00, cachedInputUsd: 0.10, cacheWriteUsd: 1.25, outputUsd: 6.00 }),
  Object.freeze({ id: "gpt-5.6-terra", label: "Terra", inputUsd: 2.50, cachedInputUsd: 0.25, cacheWriteUsd: 3.125, outputUsd: 15.00 }),
  Object.freeze({ id: "gpt-5.6-sol", label: "Sol", inputUsd: 5.00, cachedInputUsd: 0.50, cacheWriteUsd: 6.25, outputUsd: 30.00 }),
]);

export const DEFAULT_AI_CHAT_MODEL = "gpt-5.6-terra";
export const AI_CHAT_REASONING_EFFORTS = Object.freeze([
  Object.freeze({ id: "low", label: "Light" }),
  Object.freeze({ id: "medium", label: "Medium" }),
  Object.freeze({ id: "high", label: "High" }),
  Object.freeze({ id: "max", label: "Max" }),
]);
export const DEFAULT_AI_CHAT_REASONING_EFFORT = "medium";
export const AI_CHAT_MARKUP_RATE = 0.15;
export const AI_CHAT_WEB_SEARCH_USD_PER_CALL = 0.01;
export const AI_CHAT_FILE_SEARCH_USD_PER_CALL = 0.0025;
export const AI_CHAT_CONTAINER_1GB_USD_PER_SESSION = 0.03;
export const AI_CHAT_VECTOR_STORAGE_USD_PER_GB_DAY = 0.10;
export const AI_CHAT_BROWSER_USD_PER_HOUR = 0.09;
export const AI_CHAT_USD_PER_CREDIT = Math.min(
  CUSTOM_STARS_USD_PER_1000_CREDITS / 1000,
  ...Object.values(MINI_APP_STAR_PACKAGES).map((pack) => Number(pack.usd) / Number(pack.totalCredits)),
);
const AI_CHAT_MODEL_SETTING_KEY = "ai_chat_model";
const LONG_CONTEXT_TOKEN_THRESHOLD = 272000;
const AI_CHAT_REQUEST_PREFERENCES_KEY = "__VEXA_AI_CHAT_REQUEST_PREFERENCES";

export function normalizeAiChatModel(modelId) {
  const value = String(modelId || "").trim().toLowerCase();
  return AI_CHAT_MODELS.some((model) => model.id === value)
    ? value
    : DEFAULT_AI_CHAT_MODEL;
}

export function normalizeAiChatReasoningEffort(effort) {
  const value = String(effort || "").trim().toLowerCase();
  return AI_CHAT_REASONING_EFFORTS.some((item) => item.id === value)
    ? value
    : DEFAULT_AI_CHAT_REASONING_EFFORT;
}

export function setAiChatRequestPreferences(env, userId, preferences = {}) {
  if (!env || typeof env !== "object") return false;
  const model = String(preferences.model || "").trim().toLowerCase();
  const reasoningEffort = String(preferences.reasoningEffort || "").trim().toLowerCase();
  if (!AI_CHAT_MODELS.some((item) => item.id === model)) return false;
  if (!AI_CHAT_REASONING_EFFORTS.some((item) => item.id === reasoningEffort)) return false;
  env[AI_CHAT_REQUEST_PREFERENCES_KEY] = {
    userId: String(userId),
    model,
    reasoningEffort,
  };
  return true;
}

export async function getAiChatModel(env) {
  requireDb(env);
  await ensureAppSettingsTable(env);
  const row = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = ?"
  ).bind(AI_CHAT_MODEL_SETTING_KEY).first();
  return AI_CHAT_MODELS.some((model) => model.id === row?.value)
    ? row.value
    : DEFAULT_AI_CHAT_MODEL;
}

export async function setAiChatModel(env, modelId) {
  requireDb(env);
  const cleanModel = String(modelId || "").trim().toLowerCase();
  if (!AI_CHAT_MODELS.some((model) => model.id === cleanModel)) {
    throw new Error("Invalid AI chat model selection");
  }
  await ensureAppSettingsTable(env);
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(AI_CHAT_MODEL_SETTING_KEY, cleanModel).run();
}

export async function getUserAiChatModel(env, userId) {
  return (await getUserAiChatPreferences(env, userId)).model;
}

export async function getUserAiChatPreferences(env, userId) {
  const requestPreferences = getAiChatRequestPreferences(env, userId);
  if (requestPreferences) return requestPreferences;

  requireDb(env);
  await ensureAiChatPreferencesTable(env);
  await ensureAiChatReasoningPreferencesTable(env);
  const [modelRow, reasoningRow] = await Promise.all([
    env.DB.prepare("SELECT model FROM ai_chat_preferences WHERE user_id = ?").bind(String(userId)).first(),
    env.DB.prepare("SELECT reasoning_effort FROM ai_chat_reasoning_preferences WHERE user_id = ?").bind(String(userId)).first(),
  ]);
  const model = modelRow?.model && AI_CHAT_MODELS.some((item) => item.id === modelRow.model)
    ? modelRow.model
    : await getAiChatModel(env);
  return {
    model,
    reasoningEffort: normalizeAiChatReasoningEffort(reasoningRow?.reasoning_effort),
  };
}

export async function setUserAiChatModel(env, userId, modelId) {
  return (await setUserAiChatPreferences(env, userId, { model: modelId })).model;
}

export async function setUserAiChatPreferences(env, userId, preferences = {}) {
  requireDb(env);
  await ensureAiChatPreferencesTable(env);
  await ensureAiChatReasoningPreferencesTable(env);
  const current = await getUserAiChatPreferences(env, userId);
  const cleanModel = preferences.model == null
    ? current.model
    : String(preferences.model || "").trim().toLowerCase();
  if (!AI_CHAT_MODELS.some((model) => model.id === cleanModel)) {
    throw new Error("Invalid AI chat model selection");
  }
  const reasoningEffort = preferences.reasoningEffort == null
    ? current.reasoningEffort
    : String(preferences.reasoningEffort || "").trim().toLowerCase();
  if (!AI_CHAT_REASONING_EFFORTS.some((item) => item.id === reasoningEffort)) {
    throw new Error("Invalid reasoning effort selection");
  }
  await env.DB.prepare(
    "INSERT INTO ai_chat_preferences (user_id, model, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET model = excluded.model, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanModel).run();
  await env.DB.prepare(
    "INSERT INTO ai_chat_reasoning_preferences (user_id, reasoning_effort, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET reasoning_effort = excluded.reasoning_effort, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), reasoningEffort).run();
  return { model: cleanModel, reasoningEffort };
}

export function calculateAiChatBilling(modelId, billing = {}) {
  const model = AI_CHAT_MODELS.find((item) => item.id === normalizeAiChatModel(modelId));
  const usageEntries = Array.isArray(billing.usage) ? billing.usage : [];
  const totals = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const webSearchCalls = wholeCount(billing.webSearchCalls);
  const fileSearchCalls = wholeCount(billing.fileSearchCalls);
  const containerSessions = wholeCount(billing.containerSessions);
  const vectorStorageGbDays = nonNegativeNumber(billing.vectorStorageGbDays);
  const browserDurationMs = nonNegativeNumber(billing.browserDurationMs);
  const webSearchUsd = webSearchCalls * AI_CHAT_WEB_SEARCH_USD_PER_CALL;
  const fileSearchUsd = fileSearchCalls * AI_CHAT_FILE_SEARCH_USD_PER_CALL;
  const containerUsd = containerSessions * AI_CHAT_CONTAINER_1GB_USD_PER_SESSION;
  const vectorStorageUsd = vectorStorageGbDays * AI_CHAT_VECTOR_STORAGE_USD_PER_GB_DAY;
  const browserUsd = browserDurationMs / 3600000 * AI_CHAT_BROWSER_USD_PER_HOUR;
  let baseUsd = webSearchUsd + fileSearchUsd + containerUsd + vectorStorageUsd + browserUsd;

  for (const usage of usageEntries) {
    const inputTokens = wholeTokenCount(usage?.input_tokens);
    const cachedInputTokens = Math.min(inputTokens, wholeTokenCount(usage?.input_tokens_details?.cached_tokens));
    const cacheWriteTokens = Math.min(
      Math.max(0, inputTokens - cachedInputTokens),
      wholeTokenCount(usage?.input_tokens_details?.cache_write_tokens),
    );
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
    const outputTokens = wholeTokenCount(usage?.output_tokens);
    const reasoningTokens = Math.min(outputTokens, wholeTokenCount(usage?.output_tokens_details?.reasoning_tokens));
    const longContext = inputTokens > LONG_CONTEXT_TOKEN_THRESHOLD;
    const inputMultiplier = longContext ? 2 : 1;
    const outputMultiplier = longContext ? 1.5 : 1;

    baseUsd += (
      uncachedInputTokens * model.inputUsd * inputMultiplier
      + cachedInputTokens * model.cachedInputUsd * inputMultiplier
      + cacheWriteTokens * model.cacheWriteUsd * inputMultiplier
      + outputTokens * model.outputUsd * outputMultiplier
    ) / 1000000;

    totals.inputTokens += inputTokens;
    totals.cachedInputTokens += cachedInputTokens;
    totals.cacheWriteTokens += cacheWriteTokens;
    totals.outputTokens += outputTokens;
    totals.reasoningTokens += reasoningTokens;
  }

  const billedUsd = baseUsd * (1 + AI_CHAT_MARKUP_RATE);
  const credits = Math.max(1, Math.ceil((billedUsd / AI_CHAT_USD_PER_CREDIT) - 1e-12));
  return {
    model: model.id,
    credits,
    baseUsd,
    billedUsd,
    markupRate: AI_CHAT_MARKUP_RATE,
    webSearchCalls,
    fileSearchCalls,
    containerSessions,
    vectorStorageGbDays,
    browserDurationMs,
    webSearchUsd,
    fileSearchUsd,
    containerUsd,
    vectorStorageUsd,
    browserUsd,
    ...totals,
  };
}

function getAiChatRequestPreferences(env, userId) {
  const preferences = env?.[AI_CHAT_REQUEST_PREFERENCES_KEY];
  if (!preferences || typeof preferences !== "object") return null;
  if (String(preferences.userId || "") !== String(userId)) return null;
  const model = String(preferences.model || "").trim().toLowerCase();
  const reasoningEffort = String(preferences.reasoningEffort || "").trim().toLowerCase();
  if (!AI_CHAT_MODELS.some((item) => item.id === model)) return null;
  if (!AI_CHAT_REASONING_EFFORTS.some((item) => item.id === reasoningEffort)) return null;
  return { model, reasoningEffort };
}

function wholeTokenCount(value) {
  return wholeCount(value);
}

function wholeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function ensureAiChatPreferencesTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_chat_preferences (user_id TEXT PRIMARY KEY, model TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function ensureAiChatReasoningPreferencesTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_chat_reasoning_preferences (user_id TEXT PRIMARY KEY, reasoning_effort TEXT NOT NULL DEFAULT 'medium', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
