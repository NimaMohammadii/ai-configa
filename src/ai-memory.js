import { waitUntil } from "cloudflare:workers";
import { requireDb } from "./state.js";

export const AI_MEMORY_MAX_BYTES = 64 * 1024;
const AI_MEMORY_MAX_ITEMS = 200;
const AI_MEMORY_MAX_KEY_CHARS = 80;
const AI_MEMORY_MAX_VALUE_CHARS = 500;
const AI_MEMORY_CONTEXT_MAX_ITEMS = 8;
const AI_MEMORY_CONTEXT_MAX_CHARS = 2600;
const AI_MEMORY_INVENTORY_MAX_ITEMS = 24;
const AI_MEMORY_INVENTORY_MAX_CHARS = 6000;
const AI_MEMORY_QUERY_MAX_CHARS = 6000;
const AI_MEMORY_RELEVANCE_MIN_SCORE = 4;
const SENSITIVE_MEMORY_PATTERN = /(?:password|passcode|api[ _-]?key|private[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|webhook[ _-]?secret|seed phrase|recovery phrase|credit card|card number|\bcvv\b|\botp\b|رمز(?: عبور)?|کد یکبار مصرف|توکن|کلید خصوصی|شماره کارت)/i;
const MEMORY_INVENTORY_PATTERN = /(?:what\s+(?:do|can)\s+you\s+(?:remember|know)(?:\s+about\s+me)?|show\s+(?:me\s+)?(?:my\s+)?memor(?:y|ies)|list\s+(?:my\s+)?memor(?:y|ies)|چی\s+از\s+من\s+یادت|چه\s+چیز(?:هایی)?\s+از\s+من\s+یادت|مموری(?:‌|\s)*(?:هام|های\s+من).*(?:نشون|لیست|بگو)|حافظه(?:‌|\s)*(?:ت|هات).*(?:من|چی|چه))/i;
const MEMORY_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were", "be", "been", "being", "this", "that", "it", "as", "at", "by", "from", "my", "your", "you", "me", "i", "we", "our", "app",
  "این", "اون", "آن", "و", "یا", "که", "به", "از", "در", "با", "برای", "رو", "را", "یه", "یک", "هست", "است", "بود", "شده", "میشه", "میخوام", "من", "تو", "شما", "ما", "اپ",
]);

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
  try {
    const memories = await getUserAiMemory(env, userId);
    return memoryStatus(memories);
  } catch (error) {
    console.error("read AI memory status failed", error?.message || error);
    return memoryStatus([]);
  }
}

export function selectRelevantAiMemories(memories = [], contextText = "") {
  const safeMemories = normalizeMemoryList(memories);
  if (!safeMemories.length) return [];

  const query = cleanText(contextText, AI_MEMORY_QUERY_MAX_CHARS);
  if (!query) return [];

  if (MEMORY_INVENTORY_PATTERN.test(query)) {
    return fitMemoryContext(
      safeMemories.slice().sort(compareMemoryRecency),
      AI_MEMORY_INVENTORY_MAX_ITEMS,
      AI_MEMORY_INVENTORY_MAX_CHARS,
    );
  }

  const normalizedQuery = normalizeMemorySearchText(query);
  const queryTokens = tokenizeMemorySearchText(normalizedQuery);
  if (!queryTokens.length) return [];
  const queryTokenSet = new Set(queryTokens);

  const scored = safeMemories.map((memory, index) => ({
    memory,
    index,
    score: scoreMemoryRelevance(memory, normalizedQuery, queryTokenSet),
  }))
    .filter((entry) => entry.score >= AI_MEMORY_RELEVANCE_MIN_SCORE)
    .sort((a, b) => b.score - a.score || compareMemoryRecency(a.memory, b.memory) || a.index - b.index)
    .map((entry) => entry.memory);

  return fitMemoryContext(scored, AI_MEMORY_CONTEXT_MAX_ITEMS, AI_MEMORY_CONTEXT_MAX_CHARS);
}

export function buildAiMemoryInstructions(memories = []) {
  const safeMemories = fitMemoryContext(
    normalizeMemoryList(memories),
    AI_MEMORY_INVENTORY_MAX_ITEMS,
    AI_MEMORY_INVENTORY_MAX_CHARS,
  );
  if (!safeMemories.length) {
    return [
      "You have private long-term memory, but no relevant saved memory was selected for this request; other memories may exist.",
      "Use update_user_memory only for durable user-specific facts or preferences the user clearly states or asks to remember or forget. Never store temporary request details, repository source, credentials, financial data, health data, exact locations, or other secrets.",
    ].join(" ");
  }
  const context = safeMemories.map((item) => `- ${item.key}: ${item.value}`).join("\n");
  return [
    "You have private long-term memory. Only memories relevant to the current request are included below; other saved memories may exist.",
    "Use these memories only when they materially improve the answer and do not mention the memory system unless the user asks.",
    "Use update_user_memory only for durable user-specific facts or preferences the user clearly states or asks to remember or forget. Never store temporary request details, repository source, credentials, financial data, health data, exact locations, or other secrets.",
    "Relevant saved memories:\n" + context,
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

export function saveUserAiMemory(env, userId, memories) {
  const safeMemories = normalizeMemoryList(memories)
    .slice(0, AI_MEMORY_MAX_ITEMS);
  while (safeMemories.length && jsonBytes(safeMemories) > AI_MEMORY_MAX_BYTES) safeMemories.pop();
  const status = memoryStatus(safeMemories);

  waitUntil(
    persistUserAiMemory(env, userId, safeMemories).catch((error) => {
      console.error("save AI memory failed", error?.message || error);
    }),
  );

  return status;
}

async function persistUserAiMemory(env, userId, safeMemories) {
  requireDb(env);
  await ensureAiMemoryTable(env);
  const encoded = JSON.stringify(safeMemories);
  await env.DB.prepare(
    "INSERT INTO ai_user_memory (user_id, memories_json, memory_bytes, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET memories_json = excluded.memories_json, memory_bytes = excluded.memory_bytes, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), encoded, safeMemories.length ? utf8Bytes(encoded) : 0).run();
}

export async function clearUserAiMemory(env, userId) {
  requireDb(env);
  await ensureAiMemoryTable(env);
  await env.DB.prepare("DELETE FROM ai_user_memory WHERE user_id = ?").bind(String(userId)).run();
  return memoryStatus([]);
}

function scoreMemoryRelevance(memory, normalizedQuery, queryTokenSet) {
  const normalizedKey = normalizeMemorySearchText(memory.key);
  const normalizedValue = normalizeMemorySearchText(memory.value);
  const keyTokens = tokenizeMemorySearchText(normalizedKey);
  const valueTokens = tokenizeMemorySearchText(normalizedValue);
  let score = 0;

  if (normalizedKey.length >= 3 && normalizedQuery.includes(normalizedKey)) score += 14;
  if (normalizedValue.length >= 6 && normalizedValue.length <= 180 && normalizedQuery.includes(normalizedValue)) score += 10;

  for (const token of keyTokens) {
    if (queryTokenSet.has(token)) score += 6;
    else if (hasRelatedToken(token, queryTokenSet)) score += 2;
  }
  for (const token of valueTokens) {
    if (queryTokenSet.has(token)) score += 2;
    else if (hasRelatedToken(token, queryTokenSet)) score += 0.75;
  }

  const memoryTokens = new Set([...keyTokens, ...valueTokens]);
  let matchedQueryTokens = 0;
  for (const token of queryTokenSet) {
    if (memoryTokens.has(token) || hasRelatedToken(token, memoryTokens)) matchedQueryTokens += 1;
  }
  if (matchedQueryTokens >= 2) score += Math.min(6, matchedQueryTokens * 1.5);

  return score;
}

function fitMemoryContext(memories, maxItems, maxChars) {
  const result = [];
  let usedChars = 0;
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (result.length >= maxItems) break;
    const lineChars = Array.from(`${memory.key}: ${memory.value}\n`).length;
    if (lineChars > maxChars && !result.length) {
      const availableValueChars = Math.max(0, maxChars - Array.from(memory.key).length - 4);
      if (availableValueChars > 0) {
        result.push({
          ...memory,
          value: Array.from(memory.value).slice(0, availableValueChars).join(""),
        });
      }
      break;
    }
    if (usedChars + lineChars > maxChars) break;
    result.push(memory);
    usedChars += lineChars;
  }
  return result;
}

function normalizeMemorySearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200c_\-/]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMemorySearchText(value) {
  const matches = normalizeMemorySearchText(value).match(/[\p{L}\p{N}]{2,}/gu) || [];
  const result = [];
  const seen = new Set();
  for (const token of matches) {
    if (token.length < 2 || MEMORY_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}

function hasRelatedToken(token, candidates) {
  if (!token || token.length < 4) return false;
  for (const candidate of candidates) {
    if (!candidate || candidate.length < 4) continue;
    if (token.startsWith(candidate) || candidate.startsWith(token)) return true;
  }
  return false;
}

function compareMemoryRecency(a, b) {
  return String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""));
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
