import {
  clearAiCodingTaskState,
  getAiCodingTaskState,
  listAiCodingTaskStates,
  saveAiCodingTaskState,
} from "./ai-coding-task.js";
import { normalizeCodingPlan, summarizeCodingPlan } from "./ai-coding-plan.js";
import * as core from "./github-ai-core.js";

const MULTI_TASK_TOOL_NAMES = new Set(["github_list_tasks", "github_resume_task", "github_update_plan"]);

export const getGitHubAiContext = core.getGitHubAiContext;
export const getGitHubRepositorySnapshot = core.getGitHubRepositorySnapshot;

export function buildGitHubAiInstructions(context) {
  const base = core.buildGitHubAiInstructions(context);
  if (!context) return base;
  return [
    base,
    "Multiple isolated Vexa coding tasks can exist for the same user and repository. Each task ID is its vexa/ai-* branch and keeps an independent commit history and saved operational context.",
    "Use github_list_tasks when the user asks what coding tasks exist, refers to an older task, or the intended task is ambiguous. Never guess a task ID.",
    "Use github_resume_task with the exact taskId returned by github_list_tasks or supplied in the saved task instructions. Resuming a task changes the active coding workspace, so only the root coordinator may do it.",
    "github_update_plan is optional operational state. Use it only when the task is complex enough that explicit progress tracking materially helps; do not create a plan as ceremony for focused work.",
    "Read-only subagents and github_review_branch are optional quality tools. Use them when task complexity, risk, or the configured reasoning effort makes the extra verification worthwhile; do not force the same review workflow on every coding request.",
    "If a coding plan is used, keep its state accurate, keep at most one step in_progress, and do not report a planned task complete while its own pending, in_progress, or blocked steps remain. A blocked task should stop with a clear blocker report while preserving its task branch and plan for later resumption.",
    "When the user explicitly asks to merge a pull request, first resume the exact task that owns that PR, validate and review its current commit, then call github_merge_pull_request with that exact taskId. Never merge one task while another task is active.",
    "Starting a new independent request from the default branch does not overwrite older task state; the first write creates a separate persisted task branch.",
  ].join(" ");
}

export function getGitHubAiTools(context) {
  const tools = core.getGitHubAiTools(context).map(forceDirectToolCalling);
  if (!context) return tools;
  const withoutFacadeOverrides = tools.filter((tool) => !["github_resume_task", "github_merge_pull_request"].includes(tool?.name));
  return [
    {
      type: "function",
      name: "github_list_tasks",
      description: "List recent isolated Vexa coding tasks for the connected repository, including exact task IDs, branches, commits, summaries, changed files, status, plan progress, and review state. Use this before resuming an older or ambiguous task.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      strict: true,
      defer_loading: true,
      allowed_callers: ["direct"],
    },
    {
      type: "function",
      name: "github_resume_task",
      description: "Resume one exact active Vexa coding task from a previous chat turn. Use the exact taskId returned by github_list_tasks or the saved task instructions. Never guess the ID and never use this for an unrelated new request.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Exact vexa/ai-* task ID returned by github_list_tasks or supplied by saved task instructions.",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
      strict: true,
      defer_loading: true,
    },
    {
      type: "function",
      name: "github_update_plan",
      description: "Create or update optional structured operational state for a coding task when explicit progress tracking is useful. Use outcome-focused steps and keep at most one step in_progress. This does not change repository files.",
      parameters: {
        type: "object",
        properties: {
          explanation: {
            type: "string",
            description: "Short reason for the current plan or what changed since the previous plan.",
          },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable short step ID such as inspect-auth or validate-build." },
                title: { type: "string", description: "Concrete outcome for this step." },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
              },
              required: ["id", "title", "status"],
              additionalProperties: false,
            },
          },
        },
        required: ["explanation", "steps"],
        additionalProperties: false,
      },
      strict: true,
      defer_loading: true,
    },
    {
      type: "function",
      name: "github_merge_pull_request",
      description: "Merge a Vexa AI pull request into the connected repository's default branch only after the user explicitly requested the merge, the exact owning task is resumed, its current commit is reviewed, and any structured plan is complete.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "integer", minimum: 1, description: "Pull request number in the connected repository." },
          taskId: { type: "string", description: "Exact resumed vexa/ai-* task ID that owns this pull request." },
        },
        required: ["number", "taskId"],
        additionalProperties: false,
      },
      strict: true,
      defer_loading: true,
    },
    ...withoutFacadeOverrides,
  ];
}

export function isGitHubAiToolCall(item) {
  return item?.type === "function_call"
    && (MULTI_TASK_TOOL_NAMES.has(String(item.name || "")) || core.isGitHubAiToolCall(item));
}

export async function executeGitHubAiTool(env, userId, item, onStatus, activity = null) {
  if (item?.name === "github_list_tasks") {
    try {
      const repository = await core.getGitHubAiContext(env, userId);
      if (!repository) return JSON.stringify({ error: "Connect GitHub and choose a repository first." });
      const tasks = await listAiCodingTaskStates(env, userId, repository, 12);
      markActivity(activity, "analyzing_code", "Coding tasks loaded", `${tasks.length} tasks`);
      return JSON.stringify({
        repository: repository.fullName,
        tasks: tasks.map((task) => ({
          taskId: task.taskId,
          branch: task.branch,
          commitSha: task.commitSha,
          status: task.status,
          summary: task.summary,
          changedFiles: task.changedFiles,
          plan: summarizeCodingPlan(task.plan),
          reviewCompleted: Boolean(task.lastReview?.commitSha && task.lastReview.commitSha === task.commitSha),
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: String(error?.message || "Could not list coding tasks.").slice(0, 500) });
    }
  }

  if (item?.name === "github_resume_task") {
    if (!isRootAgentItem(item)) {
      return JSON.stringify({ error: "Only the root coordinator may change the active coding task." });
    }
    let args = {};
    try {
      args = JSON.parse(String(item.arguments || "{}"));
    } catch {
      return JSON.stringify({ error: "The task resume arguments were invalid." });
    }
    try {
      const repository = await core.getGitHubAiContext(env, userId);
      if (!repository) return JSON.stringify({ error: "Connect GitHub and choose a repository first." });
      const saved = await getAiCodingTaskState(env, userId, repository, args.taskId);
      if (!saved) return JSON.stringify({ error: "That active coding task was not found for this repository." });
      if (activity) {
        activity.used = true;
        activity.currentBranch = saved.branch;
        activity.currentCommitSha = saved.commitSha;
        activity.lastReview = saved.lastReview;
        activity.lastCi = saved.lastCi;
        activity.plan = saved.plan || null;
        activity.reviewCompleted = false;
        activity.needsReview = true;
        activity.postWriteShellUsed = false;
        if (!(activity.filesRead instanceof Set)) activity.filesRead = new Set(activity.filesRead || []);
        for (const path of saved.contextFiles || []) activity.filesRead.add(path);
        activity.change = {
          branch: saved.branch,
          commitSha: saved.commitSha,
          changedFiles: saved.changedFiles || [],
          summary: saved.summary || "Resumed previous coding task",
        };
        markActivity(activity, "analyzing_code", "Resumed isolated coding task", saved.taskId);
        await saveAiCodingTaskState(env, userId, activity);
      }
      return JSON.stringify({
        ok: true,
        taskId: saved.taskId,
        repository: saved.repository,
        branch: saved.branch,
        commitSha: saved.commitSha,
        summary: saved.summary,
        changedFiles: saved.changedFiles,
        plan: summarizeCodingPlan(saved.plan),
        previousReviewAvailable: Boolean(saved.lastReview),
        reviewNeedsRefresh: true,
      });
    } catch (error) {
      return JSON.stringify({ error: String(error?.message || "Could not resume coding task.").slice(0, 500) });
    }
  }

  if (item?.name === "github_update_plan") {
    if (!isRootAgentItem(item)) {
      return JSON.stringify({ error: "Only the root coordinator may update the coding plan." });
    }
    let args = {};
    try {
      args = JSON.parse(String(item.arguments || "{}"));
    } catch {
      return JSON.stringify({ error: "The coding plan arguments were invalid." });
    }
    const plan = normalizeCodingPlan(args);
    if (!plan) {
      return JSON.stringify({ error: "Use 1-12 valid plan steps, unique stable IDs, and at most one in_progress step." });
    }
    if (activity) {
      activity.plan = plan;
      markActivity(activity, "analyzing_code", "Coding plan updated", `${plan.steps.length} steps`);
      if (activity.currentBranch) await saveAiCodingTaskState(env, userId, activity);
    }
    return JSON.stringify({ ok: true, plan: summarizeCodingPlan(plan) });
  }

  if (item?.name === "github_merge_pull_request") {
    if (!isRootAgentItem(item)) {
      return JSON.stringify({ error: "Only the root coordinator may merge a pull request." });
    }
    let args = {};
    try {
      args = JSON.parse(String(item.arguments || "{}"));
    } catch {
      return JSON.stringify({ error: "The pull request merge arguments were invalid." });
    }
    const taskId = String(args.taskId || "").trim();
    if (!isVexaTaskId(taskId)) return JSON.stringify({ error: "Use the exact vexa/ai-* task ID that owns this pull request." });
    if (!activity || String(activity.currentBranch || "") !== taskId) {
      return JSON.stringify({ error: "Resume the exact owning coding task before merging this pull request." });
    }
    const repository = await core.getGitHubAiContext(env, userId);
    const saved = repository ? await getAiCodingTaskState(env, userId, repository, taskId) : null;
    if (!saved || String(saved.commitSha || "") !== String(activity.currentCommitSha || "")) {
      return JSON.stringify({ error: "The owning task changed or is not active. Resume it again and review the current commit before merging." });
    }
    const plan = summarizeCodingPlan(activity.plan);
    if (plan && !plan.complete) {
      return JSON.stringify({ error: "The coding plan is not complete. Resolve pending, in-progress, or blocked steps before merging." });
    }
    if (activity.needsReview || !activity.reviewCompleted || String(activity.lastReview?.commitSha || "") !== String(activity.currentCommitSha || "")) {
      return JSON.stringify({ error: "Review the exact current task commit before merging this pull request." });
    }
    const coreItem = {
      ...item,
      arguments: JSON.stringify({ number: args.number }),
    };
    const output = await core.executeGitHubAiTool(env, userId, coreItem, onStatus, activity);
    try {
      const parsed = JSON.parse(String(output || "{}"));
      if (parsed?.merged === true) await clearAiCodingTaskState(env, userId, taskId);
    } catch {
      // Keep the original tool output; no task is cleared unless merge success is explicit.
    }
    return output;
  }

  let output = await core.executeGitHubAiTool(env, userId, item, onStatus, activity);
  if (item?.name === "github_review_branch" && activity?.plan) {
    const plan = summarizeCodingPlan(activity.plan);
    if (plan) {
      try {
        const parsed = JSON.parse(String(output || "{}"));
        parsed.planGate = {
          passed: plan.counts.blocked === 0,
          complete: Boolean(plan.complete),
          pending: plan.counts.pending,
          inProgress: plan.counts.inProgress,
          completed: plan.counts.completed,
          blocked: plan.counts.blocked,
        };
        output = JSON.stringify(parsed);
      } catch {
        // Keep the original tool output if it is not JSON.
      }
    }
  }
  await completeExactTaskAfterTerminalAction(env, userId, item, activity).catch((error) => {
    console.error("complete exact coding task failed", error?.message || error);
  });
  return output;
}

async function completeExactTaskAfterTerminalAction(env, userId, item, activity) {
  if (item?.name === "github_apply_branch_to_default") {
    let args = {};
    try { args = JSON.parse(String(item.arguments || "{}")); } catch { args = {}; }
    if (isVexaTaskId(args.branch)) await clearAiCodingTaskState(env, userId, args.branch);
    return;
  }
  if (item?.name !== "github_merge_pull_request") return;
  let args = {};
  try { args = JSON.parse(String(item.arguments || "{}")); } catch { args = {}; }
  const pullRequest = activity?.pullRequest;
  if (
    Number(pullRequest?.number || 0) === Number(args.number || 0)
    && isVexaTaskId(pullRequest?.branch)
  ) {
    await clearAiCodingTaskState(env, userId, pullRequest.branch);
  }
}

function forceDirectToolCalling(tool) {
  if (!tool || typeof tool !== "object" || !Array.isArray(tool.allowed_callers)) return tool;
  return { ...tool, allowed_callers: ["direct"] };
}

function isVexaTaskId(value) {
  const id = String(value || "").trim();
  return id.startsWith("vexa/ai-") && id.length <= 255 && !id.includes("..") && !/[~^:?*[\\\s]/.test(id);
}

function isRootAgentItem(item) {
  const name = String(item?.agent?.agent_name || item?.agent_name || "").trim();
  return !name || name === "/root" || name === "root";
}

function markActivity(activity, state, label, detail) {
  if (!activity) return;
  activity.used = true;
  activity.events = Array.isArray(activity.events) ? activity.events : [];
  activity.events.push({ state, label, detail: String(detail || ""), at: Date.now() });
  if (activity.events.length > 16) activity.events.shift();
}
