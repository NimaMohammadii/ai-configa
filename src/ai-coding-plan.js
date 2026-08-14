const PLAN_STATUSES = new Set(["pending", "in_progress", "completed", "blocked"]);
const MAX_PLAN_STEPS = 12;
const MAX_STEP_ID_CHARS = 48;
const MAX_STEP_TITLE_CHARS = 220;
const MAX_PLAN_EXPLANATION_CHARS = 500;

export async function getAiCodingTaskPlan(env, userId, taskId) {
  const cleanId = cleanTaskId(taskId);
  if (!env?.DB || !userId || !cleanId) return null;
  await ensureTable(env);
  const row = await env.DB.prepare(
    "SELECT plan_json, updated_at FROM ai_coding_task_plans WHERE user_id = ? AND task_id = ?"
  ).bind(String(userId), cleanId).first();
  if (!row?.plan_json) return null;
  try {
    const plan = normalizeCodingPlan(JSON.parse(String(row.plan_json)));
    return plan ? { ...plan, updatedAt: String(row.updated_at || "") } : null;
  } catch {
    return null;
  }
}

export async function saveAiCodingTaskPlan(env, userId, taskId, plan) {
  const cleanId = cleanTaskId(taskId);
  const normalized = normalizeCodingPlan(plan);
  if (!env?.DB || !userId || !cleanId || !normalized) return null;
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO ai_coding_task_plans (user_id, task_id, plan_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) "
      + "ON CONFLICT(user_id, task_id) DO UPDATE SET plan_json = excluded.plan_json, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), cleanId, JSON.stringify(normalized)).run();
  return normalized;
}

export async function deleteAiCodingTaskPlan(env, userId, taskId) {
  const cleanId = cleanTaskId(taskId);
  if (!env?.DB || !userId || !cleanId) return;
  await ensureTable(env);
  await env.DB.prepare(
    "DELETE FROM ai_coding_task_plans WHERE user_id = ? AND task_id = ?"
  ).bind(String(userId), cleanId).run();
}

export function normalizeCodingPlan(value) {
  if (!value || typeof value !== "object") return null;
  const explanation = Array.from(String(value.explanation || "").trim())
    .slice(0, MAX_PLAN_EXPLANATION_CHARS)
    .join("");
  const source = Array.isArray(value.steps) ? value.steps.slice(0, MAX_PLAN_STEPS) : [];
  if (!source.length) return null;
  const seen = new Set();
  const steps = [];
  let inProgress = 0;
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index] || {};
    const fallbackId = `step-${index + 1}`;
    const id = cleanStepId(item.id) || fallbackId;
    if (seen.has(id)) return null;
    seen.add(id);
    const title = Array.from(String(item.title || "").trim()).slice(0, MAX_STEP_TITLE_CHARS).join("");
    if (!title) return null;
    const status = PLAN_STATUSES.has(String(item.status || "")) ? String(item.status) : "pending";
    if (status === "in_progress") inProgress += 1;
    steps.push({ id, title, status });
  }
  if (inProgress > 1) return null;
  return { explanation, steps };
}

export function summarizeCodingPlan(plan) {
  const normalized = normalizeCodingPlan(plan);
  if (!normalized) return null;
  const counts = { pending: 0, inProgress: 0, completed: 0, blocked: 0 };
  for (const step of normalized.steps) {
    if (step.status === "pending") counts.pending += 1;
    else if (step.status === "in_progress") counts.inProgress += 1;
    else if (step.status === "completed") counts.completed += 1;
    else if (step.status === "blocked") counts.blocked += 1;
  }
  return {
    explanation: normalized.explanation,
    steps: normalized.steps,
    counts,
    complete: counts.pending === 0 && counts.inProgress === 0 && counts.blocked === 0,
  };
}

async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_coding_task_plans (user_id TEXT NOT NULL, task_id TEXT NOT NULL, plan_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, task_id))"
  ).run();
}

function cleanTaskId(value) {
  const id = String(value || "").trim();
  if (!id.startsWith("vexa/ai-") || id.length > 255 || id.includes("..") || /[~^:?*[\\\s]/.test(id)) return "";
  return id;
}

function cleanStepId(value) {
  const id = Array.from(String(value || "").trim()).slice(0, MAX_STEP_ID_CHARS).join("");
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) ? id : "";
}
