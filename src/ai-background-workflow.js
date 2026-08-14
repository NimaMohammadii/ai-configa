import { NonRetryableError, WorkflowEntrypoint } from "cloudflare:workers";
import { runWithCreditIdempotency } from "./credit-idempotency.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { handleMiniAppRequest } from "./mini-app/server.js";

const TASK_PREFIX = "/mini-app/api/ai-tasks/";
const MAX_ACTIVE_TASKS_PER_USER = 4;
const MAX_TASK_MESSAGES = 20;
const MAX_TASK_PAYLOAD_BYTES = 700 * 1024;
const MAX_TASK_RESULT_CHARS = 500000;
const MAX_TASK_ERROR_CHARS = 1000;

export function isAiBackgroundTaskRequest(request) {
  return new URL(request.url).pathname.startsWith(TASK_PREFIX);
}

export async function handleAiBackgroundTaskRequest(request, env) {
  try {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    if (!env.AI_CODING_WORKFLOW) return json({ error: "Background AI tasks are not configured." }, 503);
    const path = new URL(request.url).pathname;
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    await ensureTaskTable(env);

    if (path === TASK_PREFIX + "start") return json(await startTask(env, user, payload));
    if (path === TASK_PREFIX + "status") return json(await getTaskStatus(env, user.id, payload.taskId));
    if (path === TASK_PREFIX + "list") return json(await listTasks(env, user.id));
    if (path === TASK_PREFIX + "cancel") return json(await cancelTask(env, user.id, payload.taskId));
    return json({ error: "Not Found" }, 404);
  } catch (error) {
    return json({ error: publicError(error) }, Number(error?.status || 500));
  }
}

export class AiCodingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    const taskId = cleanTaskId(payload.taskId || event?.instanceId);
    const userId = String(payload.userId || "").trim();
    if (!taskId || !userId) throw new NonRetryableError("Background AI task payload is invalid.");
    await ensureTaskTable(this.env);

    await step.do("mark task running", async () => {
      await updateTask(this.env, taskId, userId, {
        status: "running",
        startedAt: true,
        error: "",
      });
      return { taskId, status: "running" };
    });

    try {
      const result = await step.do(
        "run AI chat",
        { retries: { limit: 0, delay: "1 second" }, timeout: "10 minutes" },
        async () => {
          try {
            const initData = await createInternalInitData(payload.user || { id: userId }, this.env.BOT_TOKEN);
            const body = JSON.stringify({ initData, messages: payload.messages || [] });
            const internalRequest = new Request("https://vexa.internal/mini-app/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
            return await runWithCreditIdempotency(`ai-workflow:${taskId}`, async () => {
              const response = await handleMiniAppRequest(internalRequest, this.env);
              return parseAiChatResponse(response);
            });
          } catch (error) {
            throw new NonRetryableError(String(error?.message || "Background AI execution failed.").slice(0, MAX_TASK_ERROR_CHARS));
          }
        },
      );

      await step.do("store task result", async () => {
        await updateTask(this.env, taskId, userId, {
          status: "completed",
          result,
          completedAt: true,
          error: "",
        });
        return { taskId, status: "completed" };
      });

      return { taskId, status: "completed", result };
    } catch (error) {
      const message = String(error?.message || "Background AI task failed.").slice(0, MAX_TASK_ERROR_CHARS);
      await step.do("store task failure", async () => {
        await updateTask(this.env, taskId, userId, {
          status: "failed",
          completedAt: true,
          error: message,
        });
        return { taskId, status: "failed" };
      }).catch(() => null);
      throw new NonRetryableError(message);
    }
  }
}

async function startTask(env, user, payload) {
  const messages = normalizeTaskMessages(payload.messages);
  const serialized = JSON.stringify(messages);
  if (new TextEncoder().encode(serialized).byteLength > MAX_TASK_PAYLOAD_BYTES) {
    throw httpError("This task is too large for background mode. Remove large attachments or shorten the chat context.", 413);
  }
  const active = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM ai_background_tasks WHERE user_id = ? AND status IN ('queued','running')"
  ).bind(String(user.id)).first();
  if (Number(active?.count || 0) >= MAX_ACTIVE_TASKS_PER_USER) {
    throw httpError(`You can run up to ${MAX_ACTIVE_TASKS_PER_USER} background AI tasks at once.`, 429);
  }

  const taskId = `ai-${crypto.randomUUID()}`;
  const safeUser = {
    id: user.id,
    first_name: String(user.first_name || "").slice(0, 120),
    last_name: String(user.last_name || "").slice(0, 120),
    username: String(user.username || "").slice(0, 120),
    language_code: String(user.language_code || "").slice(0, 20),
  };
  await env.DB.prepare(
    "INSERT INTO ai_background_tasks (task_id, user_id, workflow_id, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(taskId, String(user.id), taskId).run();
  try {
    const instance = await env.AI_CODING_WORKFLOW.create({
      id: taskId,
      params: { taskId, userId: String(user.id), user: safeUser, messages },
      retention: { successRetention: "7 days", errorRetention: "7 days" },
    });
    return { taskId, workflowId: String(instance.id || taskId), status: "queued" };
  } catch (error) {
    await updateTask(env, taskId, String(user.id), {
      status: "failed",
      completedAt: true,
      error: String(error?.message || "Could not start background AI task.").slice(0, MAX_TASK_ERROR_CHARS),
    });
    throw error;
  }
}

async function getTaskStatus(env, userId, rawTaskId) {
  const taskId = cleanTaskId(rawTaskId);
  if (!taskId) throw httpError("Task not found.", 400);
  let row = await readTask(env, userId, taskId);
  if (!row) throw httpError("Task not found.", 404);
  const workflow = await readWorkflowStatus(env, taskId);
  if (workflow?.status) {
    const mapped = mapWorkflowStatus(workflow.status);
    if (mapped && mapped !== row.status && !isTerminalTaskStatus(row.status)) {
      await updateTask(env, taskId, String(userId), {
        status: mapped,
        completedAt: isTerminalTaskStatus(mapped),
        error: mapped === "failed" ? String(workflow?.error?.message || row.error || "Workflow failed.").slice(0, MAX_TASK_ERROR_CHARS) : row.error,
      });
      row = await readTask(env, userId, taskId) || row;
    }
  }
  return taskPublic(row, workflow);
}

async function listTasks(env, userId) {
  const rows = await env.DB.prepare(
    "SELECT task_id, status, result_json, error, created_at, started_at, completed_at, updated_at FROM ai_background_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(String(userId)).all();
  return { tasks: (rows.results || []).map((row) => taskPublic(row, null)) };
}

async function cancelTask(env, userId, rawTaskId) {
  const taskId = cleanTaskId(rawTaskId);
  if (!taskId) throw httpError("Task not found.", 400);
  const row = await readTask(env, userId, taskId);
  if (!row) throw httpError("Task not found.", 404);
  if (isTerminalTaskStatus(row.status)) return taskPublic(row, await readWorkflowStatus(env, taskId));
  try {
    const instance = await env.AI_CODING_WORKFLOW.get(taskId);
    await instance.terminate();
  } catch (error) {
    const status = await readWorkflowStatus(env, taskId);
    if (!status || !["complete", "errored", "terminated"].includes(String(status.status || ""))) throw error;
  }
  await updateTask(env, taskId, String(userId), { status: "cancelled", completedAt: true, error: "" });
  return taskPublic(await readTask(env, userId, taskId), await readWorkflowStatus(env, taskId));
}

async function parseAiChatResponse(response) {
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  const text = await response.text();
  if (!response.ok || contentType.includes("application/json")) {
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok) throw new Error(String(data?.error || text || "AI Chat request failed.").slice(0, MAX_TASK_ERROR_CHARS));
    return data;
  }

  let finalResult = null;
  let streamError = "";
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === "result") finalResult = event.data ?? event.result ?? null;
    if (event?.type === "error") streamError = String(event?.error || event?.message || "AI Chat stream failed.");
  }
  if (streamError && !finalResult) throw new Error(streamError.slice(0, MAX_TASK_ERROR_CHARS));
  if (!finalResult) throw new Error("Background AI task finished without a result.");
  const serialized = JSON.stringify(finalResult);
  if (serialized.length > MAX_TASK_RESULT_CHARS) {
    return {
      type: "text",
      message: String(finalResult?.message || "Background task completed, but the full result was too large to persist.").slice(0, 120000),
      codingActivity: finalResult?.codingActivity || null,
      truncated: true,
    };
  }
  return finalResult;
}

async function createInternalInitData(user, botToken) {
  if (!botToken) throw new Error("Telegram bot token is not configured.");
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify(user));
  const dataCheckString = Array.from(params.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const encoder = new TextEncoder();
  const telegramKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", telegramKey, encoder.encode(String(botToken)));
  const secretKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  params.set("hash", toHex(await crypto.subtle.sign("HMAC", secretKey, encoder.encode(dataCheckString))));
  return params.toString();
}

async function ensureTaskTable(env) {
  if (!env.DB) throw new Error("Database binding is missing.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_background_tasks (" +
      "task_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workflow_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', " +
      "result_json TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_created ON ai_background_tasks (user_id, created_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_status ON ai_background_tasks (user_id, status)"
  ).run();
}

async function updateTask(env, taskId, userId, patch = {}) {
  const status = String(patch.status || "").trim();
  const resultJson = Object.prototype.hasOwnProperty.call(patch, "result") ? JSON.stringify(patch.result) : null;
  const error = Object.prototype.hasOwnProperty.call(patch, "error") ? String(patch.error || "").slice(0, MAX_TASK_ERROR_CHARS) : null;
  await env.DB.prepare(
    "UPDATE ai_background_tasks SET " +
      "status = CASE WHEN ? <> '' THEN ? ELSE status END, " +
      "result_json = CASE WHEN ? IS NOT NULL THEN ? ELSE result_json END, " +
      "error = CASE WHEN ? IS NOT NULL THEN ? ELSE error END, " +
      "started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END, " +
      "completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END, " +
      "updated_at = CURRENT_TIMESTAMP WHERE task_id = ? AND user_id = ?"
  ).bind(
    status, status,
    resultJson, resultJson,
    error, error,
    patch.startedAt ? 1 : 0,
    patch.completedAt ? 1 : 0,
    taskId, String(userId),
  ).run();
}

async function readTask(env, userId, taskId) {
  return env.DB.prepare(
    "SELECT task_id, status, result_json, error, created_at, started_at, completed_at, updated_at FROM ai_background_tasks WHERE task_id = ? AND user_id = ?"
  ).bind(taskId, String(userId)).first();
}

async function readWorkflowStatus(env, taskId) {
  try {
    const instance = await env.AI_CODING_WORKFLOW.get(taskId);
    return await instance.status();
  } catch {
    return null;
  }
}

function taskPublic(row, workflow) {
  if (!row) return null;
  let result = null;
  try { result = row.result_json ? JSON.parse(String(row.result_json)) : null; } catch { result = null; }
  return {
    taskId: String(row.task_id || ""),
    status: String(row.status || "unknown"),
    result,
    error: String(row.error || ""),
    createdAt: String(row.created_at || ""),
    startedAt: String(row.started_at || ""),
    completedAt: String(row.completed_at || ""),
    updatedAt: String(row.updated_at || ""),
    workflowStatus: workflow ? String(workflow.status || "unknown") : "",
  };
}

function normalizeTaskMessages(value) {
  if (!Array.isArray(value) || !value.length) throw httpError("Type a message first.", 400);
  if (value.length > MAX_TASK_MESSAGES) throw httpError(`Background tasks support up to ${MAX_TASK_MESSAGES} recent messages.`, 400);
  return value.map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    content: String(message?.content || "").slice(0, 4000),
    ...(message?.preferredVoice ? { preferredVoice: String(message.preferredVoice).slice(0, 120) } : {}),
    ...(message?.attachment && typeof message.attachment === "object" ? { attachment: message.attachment } : {}),
  }));
}

function cleanTaskId(value) {
  const id = String(value || "").trim();
  return /^ai-[a-f0-9-]{36}$/i.test(id) ? id : "";
}

function mapWorkflowStatus(value) {
  const status = String(value || "");
  if (status === "complete") return "completed";
  if (status === "errored") return "failed";
  if (status === "terminated") return "cancelled";
  if (["queued", "running", "paused", "waiting", "waitingForPause"].includes(status)) return status === "queued" ? "queued" : "running";
  return "";
}

function isTerminalTaskStatus(value) {
  return ["completed", "failed", "cancelled"].includes(String(value || ""));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function publicError(error) {
  return String(error?.message || "Background AI task failed.").slice(0, MAX_TASK_ERROR_CHARS);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}
