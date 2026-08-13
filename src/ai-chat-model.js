import { requireDb } from "./state.js";
import { CUSTOM_STARS_USD_PER_1000_CREDITS } from "./stars.js";

export const AI_CHAT_MODELS = Object.freeze([
  Object.freeze({ id: "gpt-5.6-luna", label: "Luna", inputUsd: 0.20, cachedInputUsd: 0.02, cacheWriteUsd: 0.25, outputUsd: 1.20 }),
  Object.freeze({ id: "gpt-5.6-terra", label: "Terra", inputUsd: 2.00, cachedInputUsd: 0.20, cacheWriteUsd: 2.50, outputUsd: 12.00 }),
  Object.freeze({ id: "gpt-5.6-sol", label: "Sol", inputUsd: 5.00, cachedInputUsd: 0.50, cacheWriteUsd: 6.25, outputUsd: 30.00 }),
]);

export const DEFAULT_AI_CHAT_MODEL = "gpt-5.6-terra";
export const AI_CHAT_MARKUP_RATE = 0.15;
export const AI_CHAT_WEB_SEARCH_USD_PER_CALL = 0.01;
const AI_CHAT_MODEL_SETTING_KEY = "ai_chat_model";
const LONG_CONTEXT_TOKEN_THRESHOLD = 272000;

export function normalizeAiChatModel(modelId) {
  const value = String(modelId || "").trim().toLowerCase();
  return AI_CHAT_MODELS.some((model) => model.id === value)
    ? value
    : DEFAULT_AI_CHAT_MODEL;
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
  requireDb(env);
  await ensureAiChatPreferencesTable(env);
  const row = await env.DB.prepare(
    "SELECT model FROM ai_chat_preferences WHERE user_id = ?"
  ).bind(String(userId)).first();
  return row?.model && AI_CHAT_MODELS.some((model) => model.id === row.model)
    ? row.model
    : getAiChatModel(env);
}

export async function setUserAiChatModel(env, userId, modelId) {
  requireDb(env);
  const cleanModel = String(modelId || "").trim().toLowerCase();
  if (!AI_CHAT_MODELS.some((model) => model.id === cleanModel)) {
    throw new Error("Invalid AI chat model selection");
  }
  await ensureAiChatPreferencesTable(env);
  await env.DB.prepare(
    "INSERT INTO ai_chat_preferences (user_id, model, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET model = excluded.model, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanModel).run();
  return cleanModel;
}

export function calculateAiChatBilling(modelId, billing = {}) {
  const model = AI_CHAT_MODELS.find((item) => item.id === normalizeAiChatModel(modelId));
  const usageEntries = Array.isArray(billing.usage) ? billing.usage : [];
  const totals = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  let baseUsd = Math.max(0, Math.floor(Number(billing.webSearchCalls || 0))) * AI_CHAT_WEB_SEARCH_USD_PER_CALL;

  for (const usage of usageEntries) {
    const inputTokens = wholeTokenCount(usage?.input_tokens);
    const cachedInputTokens = Math.min(inputTokens, wholeTokenCount(usage?.input_tokens_details?.cached_tokens));
    const cacheWriteTokens = Math.min(
      Math.max(0, inputTokens - cachedInputTokens),
      wholeTokenCount(usage?.input_tokens_details?.cache_write_tokens),
    );
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
    const outputTokens = wholeTokenCount(usage?.output_tokens);
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
  }

  const billedUsd = baseUsd * (1 + AI_CHAT_MARKUP_RATE);
  const usdPerCredit = CUSTOM_STARS_USD_PER_1000_CREDITS / 1000;
  const credits = Math.max(1, Math.ceil((billedUsd / usdPerCredit) - 1e-12));
  return {
    model: model.id,
    credits,
    baseUsd,
    billedUsd,
    markupRate: AI_CHAT_MARKUP_RATE,
    webSearchCalls: Math.max(0, Math.floor(Number(billing.webSearchCalls || 0))),
    ...totals,
  };
}

function wholeTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
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
