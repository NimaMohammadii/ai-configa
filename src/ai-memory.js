import { requireDb } from "./state.js";

export const AI_MEMORY_MAX_BYTES = 64 * 1024;
const AI_MEMORY_MAX_ITEMS = 200;
const AI_MEMORY_MAX_KEY_CHARS = 80;
const AI_MEMORY_MAX_VALUE_CHARS = 500;
const SENSITIVE_MEMORY_PATTERN = /(?:password|passcode|api[ _-]?key|private[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|webhook[ _-]?secret|seed phrase|recovery phrase|credit card|card number|\bcvv\b|\botp\b|رمز(?: عبور)?|کد یکبار مصرف|توکن|کلید خصوصی|شماره کارت)/i;

export function getAiMemoryTools() {
  return [{
    type: "function",
    name: "update_user_memory",
    description: "Save or forget durable, user-specific facts and preferences. Never save credentials, secrets, payment data, one-time codes, or temporary request details.",
    parameters: {
      type: "object",
      properties: {
        remember: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "A short stable key such as preferred_language or project_goal." },
              value: { type: "string", description: "The durable fact or preference to remember." },
            },
            required: ["key", "value"],
            additionalProperties: false,
          },
        },
        forgetKeys: {
          type: "array",
          maxItems: 8,
          items: { type: "string" },
          description: "Keys the user explicitly asked to forget or facts that are no longer true.",
        },
      },
      required: ["remember", "forgetKeys"],
      additionalProperties: false,
    },
    strict: true,
  }];
}

export function isAiMemoryToolCall(item) {
  return item?.type === "function_call" && item?.name === "update_user_memory";
}

export async function getUserAiMemory(env, userId) {
  requireDb(env);
  await ensureAiMemoryTable(env);
  const row = await env.DB.prepare(
    "SELECT memories_json FROM ai_user_memory WHERE user_id = ?"
  ).bind(String(userId)).first();
  return normalizeStoredMemory(row?.memories_json);
}

export async function getUserAiMemoryStatus(env, userId) {
  const memories = await getUserAiMemory(env, userId);
  return memoryStatus(memories);
}

export function buildAiMemoryInstructions(memories = []) {
  const safeMemories = normalizeMemoryList(memories);
  const context = safeMemories.length
    ? safeMemories.map((item) => `- ${item.key}: ${item.value}`).join("\n")
    : "- No durable user memories have been saved yet.";
  return [
    "You have private long-term memory scoped only to this authenticated user.",
    "Use saved memories when they materially improve the answer, but do not mention the memory system unless the user asks.",
    "Call update_user_memory when the user states a durable preference, identity detail, recurring goal, ongoing project constraint, or explicitly asks you to remember or forget something.",
    "Do not save temporary requests, guesses, chat filler, repository source code, credentials, authentication data, financial data, health identifiers, exact locations, or other secrets.",
    "Prefer updating an existing key over creating duplicates. If the user corrects a fact, replace it. If they ask to forget it, use forgetKeys.",
    "Current saved memories:\n" + context,
  ].join(" ");
}

export function applyAiMemoryToolCall(memories, item) {
  let args;
  try {
    args = JSON.parse(String(item?.arguments || "{}"));
  } catch {
    return { memories: normalizeMemoryList(memories), changed: false, output: { ok: false, error: "Invalid memory update." } };
  }

  const current = normalizeMemoryList(memories);
  const byKey = new Map(current.map((entry) => [entry.key.toLowerCase(), entry]));
  let changed = false;

  for (const rawKey of Array.isArray(args.forgetKeys) ? args.forgetKeys : []) {
    const key = cleanText(rawKey, AI_MEMORY_MAX_KEY_CHARS).toLowerCase();
    if (key && byKey.delete(key)) changed = true;
  }

  for (const raw of Array.isArray(args.remember) ? args.remember : []) {
    const entry = normalizeMemoryEntry(raw);
    if (!entry) continue;
    const lookup = entry.key.toLowerCase();
    const previous = byKey.get(lookup);
    if (!previous || previous.value !== entry.value) changed = true;
    byKey.set(lookup, entry);
  }

  let next = Array.from(byKey.values())
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, AI_MEMORY_MAX_ITEMS);

  while (next.length && jsonBytes(next) > AI_MEMORY_MAX_BYTES) next.pop();
  const status = memoryStatus(next);
  return {
    memories: next,
    changed,
    output: { ok: true, savedItems: status.itemCount, usedBytes: status.usedBytes, maxBytes: status.maxBytes },
  };
}

export async function saveUserAiMemory(env, userId, memories) {
  requireDb(env);
  await ensureAiMemoryTable(env);
  const safeMemories = normalizeMemoryList(memories)
    .slice(0, AI_MEMORY_MAX_ITEMS);
  while (safeMemories.length && jsonBytes(safeMemories) > AI_MEMORY_MAX_BYTES) safeMemories.pop();
  const encoded = JSON.stringify(safeMemories);
  await env.DB.prepare(
    "INSERT INTO ai_user_memory (user_id, memories_json, memory_bytes, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET memories_json = excluded.memories_json, memory_bytes = excluded.memory_bytes, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), encoded, safeMemories.length ? utf8Bytes(encoded) : 0).run();
  return memoryStatus(safeMemories);
}

export async function clearUserAiMemory(env, userId) {
  requireDb(env);
  await ensureAiMemoryTable(env);
  await env.DB.prepare("DELETE FROM ai_user_memory WHERE user_id = ?").bind(String(userId)).run();
  return memoryStatus([]);
}

function normalizeStoredMemory(value) {
  try {
    return normalizeMemoryList(JSON.parse(String(value || "[]")));
  } catch {
    return [];
  }
}

function normalizeMemoryList(value) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const entry = normalizeMemoryEntry(raw);
    if (!entry) continue;
    const lookup = entry.key.toLowerCase();
    if (seen.has(lookup)) continue;
    seen.add(lookup);
    result.push(entry);
  }
  return result;
}

function normalizeMemoryEntry(raw) {
  const key = cleanText(raw?.key, AI_MEMORY_MAX_KEY_CHARS);
  const value = cleanText(raw?.value, AI_MEMORY_MAX_VALUE_CHARS);
  if (!key || !value || SENSITIVE_MEMORY_PATTERN.test(key + " " + value)) return null;
  const updatedAt = /^\d{4}-\d{2}-\d{2}T/.test(String(raw?.updatedAt || ""))
    ? String(raw.updatedAt)
    : new Date().toISOString();
  return { key, value, updatedAt };
}

function cleanText(value, maxChars) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxChars).join("");
}

function memoryStatus(memories) {
  return {
    usedBytes: Array.isArray(memories) && memories.length ? jsonBytes(memories) : 0,
    maxBytes: AI_MEMORY_MAX_BYTES,
    itemCount: Array.isArray(memories) ? memories.length : 0,
  };
}

function jsonBytes(value) {
  return utf8Bytes(JSON.stringify(Array.isArray(value) ? value : []));
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

async function ensureAiMemoryTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_user_memory (user_id TEXT PRIMARY KEY, memories_json TEXT NOT NULL DEFAULT '[]', memory_bytes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
