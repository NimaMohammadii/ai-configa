import { AsyncLocalStorage } from "node:async_hooks";

const creditIdempotencyStorage = new AsyncLocalStorage();
const MAX_IDEMPOTENCY_CONTEXT_CHARS = 240;

export function runWithCreditIdempotency(contextKey, callback) {
  const key = cleanContextKey(contextKey);
  if (!key || typeof callback !== "function") return callback();
  return creditIdempotencyStorage.run({ key }, callback);
}

export function getCreditIdempotencyKey(reason = "") {
  const store = creditIdempotencyStorage.getStore();
  const key = cleanContextKey(store?.key);
  if (!key) return "";
  const cleanReason = String(reason || "credit").trim().slice(0, 120) || "credit";
  return `${key}:${cleanReason}`;
}

function cleanContextKey(value) {
  return String(value || "").trim().slice(0, MAX_IDEMPOTENCY_CONTEXT_CHARS);
}
