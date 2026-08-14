import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { runWithCreditIdempotency } from "./credit-idempotency.js";
import { getAiCodingTaskState } from "./ai-coding-task.js";
import { summarizeCodingPlan } from "./ai-coding-plan.js";
import { handleMiniAppRequest } from "./mini-app/server.js";

const MAX_BACKGROUND_PHASES = 12;
const MAX_TASK_ERROR_CHARS = 1000;
const MAX_TASK_RESULT_CHARS = 500000;
const PHASE_TIMEOUT = "10 minutes";

export class AiCodingWorkflowV2 extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    const taskId = cleanWorkflowTaskId(payload.taskId || event?.instanceId);
    const userId = String(payload.userId || "").trim();
    if (!taskId || !userId) throw new NonRetryableError("Background AI task payload is invalid.");

    await step.do("mark task running", async () => {
      await updateTask(this.env, taskId, userId, { status: "running", startedAt: true, error: "" });
      return { taskId, status: "running" };
    });

    let phaseMessages = addBackgroundExecutionInstruction(payload.messages || []);
    let currentCodingTaskId = "";
    let finalResult = null;
    let lastCheckpoint = null;

    try {
      for (let phase = 1; phase <= MAX_BACKGROUND_PHASES; phase += 1) {
        const before = await step.do(`snapshot phase ${phase} task`, async () => {
          return taskFingerprint(await readCodingTask(this.env, userId, currentCodingTaskId));
        });

        const phaseResult = await step.do(
          `run AI phase ${phase}`,
          { retries: { limit: 0, delay: "1 second" }, timeout: PHASE_TIMEOUT },
          async () => {
            try {
              const result = await runOneAiPhase(this.env, payload.user || { id: userId }, phaseMessages, taskId, phase);
              return { ok: true, result };
            } catch (error) {
              return {
                ok: false,
                error: String(error?.message || "Background AI execution failed.").slice(0, MAX_TASK_ERROR_CHARS),
              };
            }
          },
        );

        if (!phaseResult?.ok) {
          const recoverable = Boolean(currentCodingTaskId) && isRecoverablePhaseError(phaseResult?.error);
          const recovered = recoverable
            ? await step.do(`recover phase ${phase} checkpoint`, async () => {
                const exactTask = await readCodingTask(this.env, userId, currentCodingTaskId);
                const after = taskFingerprint(exactTask);
                return hasTaskProgress(before, after) ? checkpointFromTask(exactTask) : null;
              })
            : null;
          if (!recovered?.taskId) throw new Error(phaseResult?.error || "Background AI phase failed.");
          currentCodingTaskId = recovered.taskId;
          lastCheckpoint = recovered;
          phaseMessages = continuationMessages(currentCodingTaskId, recovered.plan, phase, phaseResult.error);
          continue;
        }

        finalResult = phaseResult.result;
        currentCodingTaskId = extractCodingTaskId(finalResult) || currentCodingTaskId;
        lastCheckpoint = await step.do(`inspect phase ${phase} checkpoint`, async () => {
          const task = await readCodingTask(this.env, userId, currentCodingTaskId);
          return checkpointFromTask(task, finalResult);
        });

        if (lastCheckpoint.done) break;
        if (!lastCheckpoint.taskId) break;
        currentCodingTaskId = lastCheckpoint.taskId;
        phaseMessages = continuationMessages(currentCodingTaskId, lastCheckpoint.plan, phase, "");
      }

      if (lastCheckpoint && !lastCheckpoint.done) {
        throw new Error(
          `Background task reached the ${MAX_BACKGROUND_PHASES}-phase safety limit with plan steps still remaining. The coding branch was preserved and can be resumed.`
        );
      }
      if (!finalResult) throw new Error("Background AI task finished without a result.");

      await step.do("store task result", async () => {
        await updateTask(this.env, taskId, userId, {
          status: "completed",
          result: finalResult,
          completedAt: true,
          error: "",
        });
        return { taskId, status: "completed" };
      });
      return { taskId, status: "completed", result: finalResult };
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

async function runOneAiPhase(env, user, messages, workflowTaskId, phase) {
  const initData = await createInternalInitData(user, env.BOT_TOKEN);
  const request = new Request("https://vexa.internal/mini-app/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, messages }),
  });
  return runWithCreditIdempotency(`ai-workflow:${workflowTaskId}:phase:${phase}`, async () => {
    const response = await handleMiniAppRequest(request, env);
    return parseAiChatResponse(response);
  });
}

async function readCodingTask(env, userId, exactTaskId = "") {
  const taskId = cleanCodingTaskId(exactTaskId);
  if (!taskId) return null;
  return getAiCodingTaskState(env, userId, null, taskId).catch(() => null);
}

function checkpointFromTask(task, result = null) {
  const taskId = cleanCodingTaskId(task?.taskId || extractCodingTaskId(result));
  const plan = summarizeCodingPlan(task?.plan);
  if (!taskId || !plan) return { taskId, done: true, plan: plan || null };
  const hasBlocked = Number(plan.counts?.blocked || 0) > 0;
  return {
    taskId,
    commitSha: String(task?.commitSha || ""),
    done: Boolean(plan.complete) || hasBlocked,
    blocked: hasBlocked,
    plan,
  };
}

function taskFingerprint(task) {
  if (!task) return null;
  return {
    taskId: cleanCodingTaskId(task.taskId),
    commitSha: String(task.commitSha || ""),
    planUpdatedAt: String(task.plan?.updatedAt || ""),
  };
}

function hasTaskProgress(before, after) {
  if (!after?.taskId) return false;
  if (!before?.taskId) return true;
  if (before.taskId !== after.taskId) return true;
  if (before.commitSha !== after.commitSha) return true;
  return Boolean(after.planUpdatedAt && before.planUpdatedAt !== after.planUpdatedAt);
}

function addBackgroundExecutionInstruction(messages) {
  const source = Array.isArray(messages) ? messages.slice(-19) : [];
  return [
    ...source,
    {
      role: "user",
      content: [
        "Execute the requested coding work as a durable background task.",
        "For non-trivial work, create and maintain the structured coding plan before the first write.",
        "Work in coherent milestones, preserve the exact Vexa task branch, validate each material code change, and update plan statuses after real progress.",
        "If the whole task is too large for one execution phase, stop only at a safe coherent checkpoint with unfinished plan steps left pending rather than pretending the task is complete.",
        "Do not merge or apply changes to the default branch unless the user's original request explicitly authorized that action.",
      ].join(" "),
    },
  ];
}

function continuationMessages(taskId, plan, phase, previousError) {
  const remaining = Array.isArray(plan?.steps)
    ? plan.steps.filter((step) => step.status === "pending" || step.status === "in_progress")
      .map((step) => `${step.id}: ${step.title}`)
      .slice(0, 12)
    : [];
  return [{
    role: "user",
    content: [
      `Continue the exact durable coding task ${taskId}.`,
      "Call github_resume_task with that exact taskId before repository work and continue from its saved branch and structured plan.",
      remaining.length ? `Remaining plan steps: ${remaining.join(" | ")}.` : "Read the saved plan and continue unfinished work.",
      previousError ? `The previous execution phase ended with: ${String(previousError).slice(0, 300)}. Recover from saved evidence instead of repeating completed work.` : "Do not repeat completed plan steps.",
      `This is background phase ${phase + 1}; finish as many coherent remaining milestones as can be safely validated.`,
    ].join(" "),
  }];
}

function extractCodingTaskId(result) {
  return cleanCodingTaskId(
    result?.codingActivity?.currentBranch
      || result?.codingActivity?.change?.branch
      || ""
  );
}

function cleanCodingTaskId(value) {
  const id = String(value || "").trim();
  return id.startsWith("vexa/ai-") && id.length <= 255 && !id.includes("..") && !/[~^:?*[\\\s]/.test(id)
    ? id
    : "";
}

function cleanWorkflowTaskId(value) {
  const id = String(value || "").trim();
  return /^ai-[a-f0-9-]{36}$/i.test(id) ? id : "";
}

function isRecoverablePhaseError(value) {
  const message = String(value || "").toLowerCase();
  return message.includes("too long")
    || message.includes("too many tool steps")
    || message.includes("request cancelled")
    || message.includes("temporarily unavailable");
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
  if (!finalResult) throw new Error("Background AI phase finished without a result.");
  const serialized = JSON.stringify(finalResult);
  if (serialized.length > MAX_TASK_RESULT_CHARS) {
    return {
      type: "text",
      message: String(finalResult?.message || "Background phase completed, but the full result was too large to persist.").slice(0, 120000),
      codingActivity: finalResult?.codingActivity || null,
      truncated: true,
    };
  }
  return finalResult;
}

async function updateTask(env, taskId, userId, patch = {}) {
  if (!env.DB) throw new Error("Database binding is missing.");
  const status = String(patch.status || "").trim();
  const resultJson = Object.prototype.hasOwnProperty.call(patch, "result") ? JSON.stringify(patch.result) : null;
  const error = Object.prototype.hasOwnProperty.call(patch, "error") ? String(patch.error || "").slice(0, MAX_TASK_ERROR_CHARS) : null;
  await env.DB.prepare(
    "UPDATE ai_background_tasks SET "
      + "status = CASE WHEN ? <> '' THEN ? ELSE status END, "
      + "result_json = CASE WHEN ? IS NOT NULL THEN ? ELSE result_json END, "
      + "error = CASE WHEN ? IS NOT NULL THEN ? ELSE error END, "
      + "started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END, "
      + "completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END, "
      + "updated_at = CURRENT_TIMESTAMP WHERE task_id = ? AND user_id = ?"
  ).bind(
    status, status,
    resultJson, resultJson,
    error, error,
    patch.startedAt ? 1 : 0,
    patch.completedAt ? 1 : 0,
    taskId, String(userId),
  ).run();
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

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
