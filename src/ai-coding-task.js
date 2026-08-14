import { requireDb } from "./state.js";

const MAX_CONTEXT_FILES = 80;
const MAX_CONTEXT_EVENTS = 12;
const MAX_LISTED_TASKS = 20;

export async function getAiCodingTaskState(env, userId, githubContext = null, taskId = "") {
  if (!env?.DB || !userId) return null;
  requireDb(env);
  await ensureTables(env);
  await migrateLegacyTask(env, userId);
  const explicitTaskId = cleanOptionalTaskId(taskId);
  let row = null;
  if (explicitTaskId) {
    row = await env.DB.prepare(
      "SELECT task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at FROM ai_coding_tasks WHERE user_id = ? AND task_id = ?"
    ).bind(String(userId), explicitTaskId).first();
  } else {
    row = await env.DB.prepare(
      "SELECT t.task_id, t.repository, t.default_branch, t.branch, t.commit_sha, t.state_json, t.status, t.created_at, t.updated_at "
        + "FROM ai_coding_task_active a JOIN ai_coding_tasks t ON t.user_id = a.user_id AND t.task_id = a.task_id WHERE a.user_id = ?"
    ).bind(String(userId)).first();
    if (!row) {
      row = await env.DB.prepare(
        "SELECT task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at FROM ai_coding_tasks "
          + "WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1"
      ).bind(String(userId)).first();
    }
  }
  const task = normalizeTaskRow(row, githubContext);
  if (!task || task.status !== "active") return null;
  return task;
}

export async function listAiCodingTaskStates(env, userId, githubContext = null, limit = 12) {
  if (!env?.DB || !userId) return [];
  requireDb(env);
  await ensureTables(env);
  await migrateLegacyTask(env, userId);
  const safeLimit = Math.max(1, Math.min(MAX_LISTED_TASKS, Math.floor(Number(limit) || 12)));
  const repository = String(githubContext?.fullName || "").trim();
  const query = repository
    ? "SELECT task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at FROM ai_coding_tasks WHERE user_id = ? AND repository = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT ?"
    : "SELECT task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at FROM ai_coding_tasks WHERE user_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT ?";
  const rows = repository
    ? await env.DB.prepare(query).bind(String(userId), repository, safeLimit).all()
    : await env.DB.prepare(query).bind(String(userId), safeLimit).all();
  return (rows.results || []).map((row) => normalizeTaskRow(row, githubContext)).filter(Boolean);
}

export async function saveAiCodingTaskState(env, userId, activity) {
  if (!env?.DB || !userId || !activity) return null;
  const repository = String(activity.repository || "").trim();
  const defaultBranch = String(activity.defaultBranch || "").trim();
  const branch = cleanVexaBranch(activity.currentBranch);
  const commitSha = cleanCommitSha(activity.currentCommitSha);
  if (!repository || !branch || !commitSha) return null;
  requireDb(env);
  await ensureTables(env);
  await migrateLegacyTask(env, userId);
  const state = buildStoredState(activity);
  await env.DB.prepare(
    "INSERT INTO ai_coding_tasks (user_id, task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at) "
      + "VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
      + "ON CONFLICT(user_id, task_id) DO UPDATE SET repository = excluded.repository, default_branch = excluded.default_branch, "
      + "branch = excluded.branch, commit_sha = excluded.commit_sha, state_json = excluded.state_json, status = 'active', updated_at = CURRENT_TIMESTAMP"
  ).bind(
    String(userId),
    branch,
    repository,
    defaultBranch,
    branch,
    commitSha,
    JSON.stringify(state),
  ).run();
  await env.DB.prepare(
    "INSERT INTO ai_coding_task_active (user_id, task_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
      + "ON CONFLICT(user_id) DO UPDATE SET task_id = excluded.task_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), branch).run();
  return { taskId: branch, repository, defaultBranch, branch, commitSha, status: "active", ...state };
}

export async function clearAiCodingTaskState(env, userId, taskId = "") {
  if (!env?.DB || !userId) return;
  requireDb(env);
  await ensureTables(env);
  await migrateLegacyTask(env, userId);
  let target = cleanOptionalTaskId(taskId);
  if (!target) {
    const active = await env.DB.prepare("SELECT task_id FROM ai_coding_task_active WHERE user_id = ?")
      .bind(String(userId)).first();
    target = cleanOptionalTaskId(active?.task_id);
  }
  if (target) {
    await env.DB.prepare(
      "UPDATE ai_coding_tasks SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_id = ?"
    ).bind(String(userId), target).run();
    await env.DB.prepare("DELETE FROM ai_coding_task_active WHERE user_id = ? AND task_id = ?")
      .bind(String(userId), target).run();
  }
  await env.DB.prepare("DELETE FROM ai_coding_task_state WHERE user_id = ?").bind(String(userId)).run();
}

export function buildAiCodingTaskInstructions(state) {
  if (!state?.branch || !state?.commitSha) return "";
  const files = Array.isArray(state.changedFiles) && state.changedFiles.length
    ? ` Previous changed files: ${state.changedFiles.slice(0, 20).join(", ")}.`
    : "";
  const summary = state.summary ? ` Previous task summary: ${state.summary}.` : "";
  return [
    `A resumable previous coding task exists for this connected repository with task ID ${state.taskId || state.branch}, on branch ${state.branch} at commit ${state.commitSha}.`,
    summary,
    files,
    "Do not automatically continue that branch for an unrelated new request.",
    `If the latest user message clearly continues, corrects, tests, reviews, or asks follow-up work on that previous coding task, call github_resume_task with taskId ${state.taskId || state.branch} before reading or changing repository files.`,
    "If the user refers to another older coding task or asks what tasks exist, call github_list_tasks and select the matching active task instead of guessing.",
    "If the latest request is a new independent coding task, leave every previous task branch untouched and start from the repository default branch; its first write will create and persist a separate task branch.",
    "Only safe operational task state is persisted; never assume hidden reasoning or unrecorded test results survived across turns.",
  ].filter(Boolean).join(" ");
}

async function ensureTables(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_coding_tasks (user_id TEXT NOT NULL, task_id TEXT NOT NULL, repository TEXT NOT NULL, default_branch TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, task_id))"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ai_coding_tasks_user_repo_updated ON ai_coding_tasks (user_id, repository, updated_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_coding_task_active (user_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_coding_task_state (user_id TEXT PRIMARY KEY, repository TEXT NOT NULL, default_branch TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function migrateLegacyTask(env, userId) {
  const active = await env.DB.prepare("SELECT task_id FROM ai_coding_task_active WHERE user_id = ?")
    .bind(String(userId)).first();
  if (active?.task_id) return;
  const legacy = await env.DB.prepare(
    "SELECT repository, default_branch, branch, commit_sha, state_json, updated_at FROM ai_coding_task_state WHERE user_id = ?"
  ).bind(String(userId)).first();
  if (!legacy) return;
  const branch = cleanVexaBranch(legacy.branch);
  const commitSha = cleanCommitSha(legacy.commit_sha);
  const repository = String(legacy.repository || "").trim();
  if (!branch || !commitSha || !repository) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO ai_coding_tasks (user_id, task_id, repository, default_branch, branch, commit_sha, state_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(
    String(userId),
    branch,
    repository,
    String(legacy.default_branch || ""),
    branch,
    commitSha,
    String(legacy.state_json || "{}"),
  ).run();
  await env.DB.prepare(
    "INSERT INTO ai_coding_task_active (user_id, task_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET task_id = excluded.task_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(userId), branch).run();
}

function buildStoredState(activity) {
  const change = activity.change || {};
  return {
    summary: String(change.summary || "").slice(0, 500),
    changedFiles: normalizeStrings(change.changedFiles, 80),
    contextFiles: normalizeStrings(
      activity.filesRead instanceof Set ? Array.from(activity.filesRead) : activity.filesRead,
      MAX_CONTEXT_FILES,
    ),
    lastReview: normalizeReview(activity.lastReview),
    lastCi: normalizeCi(activity.lastCi),
    events: normalizeEvents(activity.events),
  };
}

function normalizeTaskRow(row, githubContext = null) {
  if (!row) return null;
  const repository = String(row.repository || "");
  if (githubContext?.fullName && repository !== String(githubContext.fullName)) return null;
  const branch = cleanVexaBranch(row.branch);
  const taskId = cleanVexaBranch(row.task_id || row.branch);
  const commitSha = cleanCommitSha(row.commit_sha);
  if (!repository || !branch || !taskId || !commitSha) return null;
  let state = {};
  try {
    state = JSON.parse(String(row.state_json || "{}"));
  } catch {
    state = {};
  }
  return {
    taskId,
    repository,
    defaultBranch: String(row.default_branch || githubContext?.defaultBranch || ""),
    branch,
    commitSha,
    status: String(row.status || "active") === "completed" ? "completed" : "active",
    summary: String(state.summary || "").slice(0, 500),
    changedFiles: normalizeStrings(state.changedFiles, 80),
    contextFiles: normalizeStrings(state.contextFiles, MAX_CONTEXT_FILES),
    lastReview: normalizeReview(state.lastReview),
    lastCi: normalizeCi(state.lastCi),
    events: normalizeEvents(state.events),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function cleanOptionalTaskId(value) {
  const raw = String(value || "").trim();
  return raw ? cleanVexaBranch(raw) : "";
}

function cleanVexaBranch(value) {
  const branch = String(value || "").trim();
  if (!branch.startsWith("vexa/ai-") || branch.length > 255 || branch.includes("..") || /[~^:?*[\\\s]/.test(branch)) return "";
  return branch;
}

function cleanCommitSha(value) {
  const sha = String(value || "").trim();
  return /^[a-f0-9]{40}$/i.test(sha) ? sha : "";
}

function normalizeStrings(value, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item || "").trim().slice(0, 500);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeReview(value) {
  if (!value || typeof value !== "object") return null;
  const commitSha = cleanCommitSha(value.commitSha);
  if (!commitSha) return null;
  return {
    branch: String(value.branch || "").slice(0, 255),
    commitSha,
    status: String(value.status || "").slice(0, 80),
    aheadBy: Math.max(0, Number(value.aheadBy || 0)),
    behindBy: Math.max(0, Number(value.behindBy || 0)),
    totals: {
      files: Math.max(0, Number(value.totals?.files || 0)),
      additions: Math.max(0, Number(value.totals?.additions || 0)),
      deletions: Math.max(0, Number(value.totals?.deletions || 0)),
    },
  };
}

function normalizeCi(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ref: String(value.ref || "").slice(0, 255),
    combinedState: String(value.combinedState || "unknown").slice(0, 80),
    evidenceAvailable: Boolean(value.evidenceAvailable),
    failing: countFailures(value),
    pending: countPending(value),
  };
}

function countFailures(value) {
  return [...(Array.isArray(value.checks) ? value.checks : []), ...(Array.isArray(value.workflows) ? value.workflows : [])]
    .filter((item) => ["failure", "cancelled", "timed_out", "action_required"].includes(String(item?.conclusion || item?.state || ""))).length;
}

function countPending(value) {
  return [...(Array.isArray(value.checks) ? value.checks : []), ...(Array.isArray(value.workflows) ? value.workflows : [])]
    .filter((item) => ["queued", "in_progress", "pending", "requested", "waiting"].includes(String(item?.status || item?.state || ""))).length;
}

function normalizeEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_CONTEXT_EVENTS).map((item) => ({
    state: String(item?.state || "").slice(0, 100),
    label: String(item?.label || "").slice(0, 160),
    detail: String(item?.detail || "").slice(0, 300),
  }));
}
