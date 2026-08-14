import {
  clearAiCodingTaskState,
  getAiCodingTaskState,
  listAiCodingTaskStates,
  saveAiCodingTaskState,
} from "./ai-coding-task.js";
import { normalizeCodingPlan, summarizeCodingPlan } from "./ai-coding-plan.js";
import { getGitHubAiCumulativeDiff, requestGitHubAiApproval } from "./github-ai-approval.js";
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
    "For a non-trivial coding task with multiple files, independent workstreams, or several validation stages, create a concise structured plan with github_update_plan before the first write. Keep steps outcome-focused, update the plan after meaningful milestones, and keep at most one step in_progress. Include a final validation/review outcome in that plan. Simple focused edits do not need a plan.",
    "For non-trivial or multi-file changes when Multi-Agent is available, delegate at least one independent read-only review after the final diff is available and before completing the final validation/review plan step. Ask that reviewer to look specifically for regressions, missing edge cases, security issues, scope creep, stale API assumptions, and weak or missing tests. The root coordinator must independently reconcile that critique with real diff, shell, CI, browser, docs, or observability evidence and remains the only agent allowed to write.",
    "The coding plan is visible operational state, not hidden reasoning. Mark a step completed only after its concrete work is done, and use blocked only when a real external or technical blocker prevents completion. Do not finish a planned task while pending or in_progress steps remain.",
    "Every code write is deterministically gated by github_project_instructions for the exact target paths. If a write is rejected for missing project-instruction resolution, resolve those target paths on the current working branch and retry; after each successful write or branch sync, resolve instructions again before another write.",
    "The final github_review_branch result is expanded into the cumulative default-branch-to-task-branch diff, so the user-facing report must describe the whole task rather than only the most recent commit.",
    "github_merge_pull_request and github_apply_branch_to_default never change the default branch immediately. They can only prepare a short-lived, single-use approval bound to the exact reviewed branch/base SHAs. Tell the user to confirm the action in the AI Chat approval card; only that authenticated UI confirmation can execute the default-branch change.",
    "Starting a new independent request from the default branch does not overwrite older task state; the first write creates a separate persisted task branch.",
  ].join(" ");
}

export function getGitHubAiTools(context) {
  const tools = core.getGitHubAiTools(context);
  if (!context) return tools;
  const withoutLegacyResume = tools.filter((tool) => tool?.name !== "github_resume_task");
  return [
    {
      type: "function",
      name: "github_list_tasks",
      description: "List recent isolated Vexa coding tasks for the connected repository, including exact task IDs, branches, commits, summaries, changed files, status, plan progress, and review state. Use this before resuming an older or ambiguous task.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      strict: true,
      defer_loading: true,
      allowed_callers: ["direct", "programmatic"],
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
      description: "Create or update the structured operational plan for the current non-trivial coding task. Use outcome-focused steps and keep at most one step in_progress. This does not change repository files.",
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
    ...withoutLegacyResume,
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
        clearResolvedInstructionTargets(activity);
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

  if (item?.name === "github_commit_changes") {
    const targets = githubCommitTargetPaths(item);
    const missing = unresolvedInstructionTargets(activity, targets);
    if (missing.length) {
      return JSON.stringify({
        error: "Project instructions were not resolved on the current working branch for every write target. Call github_project_instructions for these exact paths before writing: " + missing.slice(0, 12).join(", "),
        missingProjectInstructionTargets: missing,
      });
    }
  }

  if (item?.name === "github_merge_pull_request" || item?.name === "github_apply_branch_to_default") {
    return prepareSensitiveGitHubApproval(env, userId, item, activity);
  }

  let output = await core.executeGitHubAiTool(env, userId, item, onStatus, activity);

  if (item?.name === "github_project_instructions") {
    recordResolvedInstructionTargets(activity, output);
  }

  if (item?.name === "github_review_branch") {
    output = applyPlanReviewGate(output, activity);
    output = await attachCumulativeReviewDiff(env, userId, output, activity);
  }

  if (
    (item?.name === "github_commit_changes" || item?.name === "github_sync_task_branch")
    && toolOutputSucceeded(output)
  ) {
    clearResolvedInstructionTargets(activity);
  }

  return output;
}

async function prepareSensitiveGitHubApproval(env, userId, item, activity) {
  if (!isRootAgentItem(item)) {
    return JSON.stringify({ error: "Only the root coordinator may prepare a default-branch approval." });
  }
  let args = {};
  try {
    args = JSON.parse(String(item.arguments || "{}"));
  } catch {
    return JSON.stringify({ error: "The GitHub action arguments were invalid." });
  }
  try {
    const approval = await requestGitHubAiApproval(env, userId, item.name === "github_merge_pull_request"
      ? { type: "merge_pull_request", number: args.number }
      : { type: "apply_branch", branch: args.branch });
    if (activity) {
      activity.used = true;
      if (item.name === "github_merge_pull_request") activity.merge = approval;
      else activity.applied = approval;
      markActivity(
        activity,
        "finalizing",
        approval.confirmationRequired ? "Waiting for your confirmation" : "GitHub action already complete",
        approval.confirmationRequired ? String(approval.title || "Default branch approval") : String(approval.commitSha || "").slice(0, 12),
      );
      if (activity.currentBranch) await saveAiCodingTaskState(env, userId, activity).catch(() => null);
    }
    if (!approval.confirmationRequired && approval.alreadyCompleted && isVexaTaskId(approval.branch)) {
      await clearAiCodingTaskState(env, userId, approval.branch).catch(() => null);
    }
    return JSON.stringify(approval);
  } catch (error) {
    return JSON.stringify({ error: String(error?.message || "Could not prepare GitHub approval.").slice(0, 500) });
  }
}

async function attachCumulativeReviewDiff(env, userId, output, activity) {
  let review;
  try { review = JSON.parse(String(output || "{}")); } catch { return output; }
  if (!review || review.error || !activity?.currentBranch) return output;
  try {
    const cumulative = await getGitHubAiCumulativeDiff(env, userId, activity.currentBranch);
    const previous = activity.change || {};
    const summary = String(previous.summary || "Code changes prepared");
    cumulative.summary = summary;
    activity.change = {
      ...previous,
      branch: activity.currentBranch,
      commitSha: activity.currentCommitSha || cumulative.commitSha,
      changedFiles: cumulative.files.map((file) => file.path).filter(Boolean),
      summary,
      diff: cumulative,
    };
    markActivity(
      activity,
      "finalizing",
      "Cumulative task diff ready",
      `${cumulative.totals.files} files · +${cumulative.totals.additions} −${cumulative.totals.deletions}`,
    );
    await saveAiCodingTaskState(env, userId, activity).catch(() => null);
    return JSON.stringify({
      ...review,
      cumulativeDiff: {
        totals: cumulative.totals,
        changedFiles: activity.change.changedFiles,
        truncated: cumulative.truncated,
        fileListLimitReached: cumulative.fileListLimitReached,
        patchBudgetTruncated: cumulative.patchBudgetTruncated,
        url: cumulative.url,
      },
    });
  } catch (error) {
    console.error("cumulative GitHub review diff failed", error?.message || error);
    return output;
  }
}

function applyPlanReviewGate(output, activity) {
  if (!activity?.plan) return output;
  const plan = summarizeCodingPlan(activity.plan);
  if (!plan) return output;
  const passed = Boolean(plan.complete);
  if (!passed) {
    activity.needsReview = true;
    activity.reviewCompleted = false;
    if (activity.lastReview && typeof activity.lastReview === "object") {
      activity.lastReview = { ...activity.lastReview, commitSha: "" };
    }
    markActivity(
      activity,
      "finalizing",
      "Plan still has unfinished steps",
      `${plan.counts.pending + plan.counts.inProgress} remaining`,
    );
  }
  try {
    const parsed = JSON.parse(String(output || "{}"));
    if (!passed) parsed.commitSha = "";
    parsed.planGate = {
      passed,
      pending: plan.counts.pending,
      inProgress: plan.counts.inProgress,
      completed: plan.counts.completed,
      blocked: plan.counts.blocked,
    };
    return JSON.stringify(parsed);
  } catch {
    return output;
  }
}

function recordResolvedInstructionTargets(activity, output) {
  if (!activity) return;
  let result;
  try { result = JSON.parse(String(output || "{}")); } catch { return; }
  if (!result || result.error || !Array.isArray(result.targets)) return;
  if (!(activity.resolvedProjectInstructionTargets instanceof Set)) {
    activity.resolvedProjectInstructionTargets = new Set();
  }
  for (const target of result.targets) {
    const path = cleanRepoPath(target?.path);
    if (!path) continue;
    const chain = Array.isArray(target?.chain) ? target.chain : [];
    const complete = chain.every((entry) => !entry?.error && !entry?.truncated);
    if (complete) activity.resolvedProjectInstructionTargets.add(path);
    else activity.resolvedProjectInstructionTargets.delete(path);
  }
}

function githubCommitTargetPaths(item) {
  let args = {};
  try { args = JSON.parse(String(item?.arguments || "{}")); } catch { return []; }
  return (Array.isArray(args.files) ? args.files : [])
    .map((file) => cleanRepoPath(file?.path))
    .filter(Boolean);
}

function unresolvedInstructionTargets(activity, paths) {
  const resolved = activity?.resolvedProjectInstructionTargets instanceof Set
    ? activity.resolvedProjectInstructionTargets
    : new Set();
  return Array.from(new Set((Array.isArray(paths) ? paths : []).filter(Boolean)))
    .filter((path) => !resolved.has(path));
}

function clearResolvedInstructionTargets(activity) {
  if (!activity) return;
  activity.resolvedProjectInstructionTargets = new Set();
}

function toolOutputSucceeded(output) {
  try {
    const value = JSON.parse(String(output || "{}"));
    return value && !value.error;
  } catch {
    return false;
  }
}

function cleanRepoPath(value) {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 500 || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return path;
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
