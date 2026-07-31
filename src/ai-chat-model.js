import { requireDb } from "./state.js";

export const AI_CHAT_MODELS = Object.freeze([
  { id: "gpt-5.6-terra", label: "5.6 Terra" },
  { id: "gpt-5.6-luna", label: "5.6 Luna" },
]);

export const DEFAULT_AI_CHAT_MODEL = AI_CHAT_MODELS[0].id;
const AI_CHAT_MODEL_SETTING_KEY = "ai_chat_model";

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
  if (!AI_CHAT_MODELS.some((model) => model.id === modelId)) {
    throw new Error("Invalid AI chat model selection");
  }
  await ensureAppSettingsTable(env);
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(AI_CHAT_MODEL_SETTING_KEY, modelId).run();
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
