import { requireDb } from "./state.js";

const MAX_CONTEXT_FILES = 80;
const MAX_CONTEXT_EVENTS = 12;

export async function getAiCodingTaskState(env, userId, githubContext = null) {
  if (!env?.DB || !userId) return null;
  requireDb(env);
  await ensureTable(env);
  const row = await env.DB.prepare(
    "SELECT repository, default_branch, branch, commit_sha, state_json, updated_at FROM ai_coding_task_state WHERE user_id = ?"
  ).bind(String(userId)).first();
  if (!row) return null;
  const repository = String(row.repository || "");
  if (githubContext?.fullName && repository !== String(githubContext.fullName)) return null;
  const branch = cleanVexaBranch(row.branch);
  const commitSha = cleanCommitSha(row.commit_sha);
  if (!repository || !branch || !commitSha) return null;
  let state = {};
  try {
    state = JSON.parse(String(row.state_json || "{}"));
  } catch {
    state = {};
  }
  return {
    repository,
    defaultBranch: String(row.default_branch || githubContext?.defaultBranch || ""),
    branch,
    commitSha,
    summary: String(state.summary || "").slice(0, 500),
    changedFiles: normalizeStrings(state.changedFiles, 80),
    contextFiles: normalizeStrings(state.contextFiles, MAX_CONTEXT_FILES),
    lastReview: normalizeReview(state.lastReview),
    lastCi: normalizeCi(state.lastCi),
    events: normalizeEvents(state.events),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function saveAiCodingTaskState(env, userId, activity) {
  if (!env?.DB || !userId || !activity) return null;
  const repository = String(activity.repository || "").trim();
  const defaultBranch = String(activity.defaultBranch || "").trim();
  const branch = cleanVexaBranch(activity.currentBranch);
  const commitSha = cleanCommitSha(activity.currentCommitSha);
  if (!repository || !branch || !commitSha) return null;
  requireDb(env);
  await ensureTable(env);
  const change = activity.change || {};
  const state = {
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
  await env.DB.prepare(
    "INSERT INTO ai_coding_task_state (user_id, repository, default_branch, branch, commit_sha, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(user_id) DO UPDATE SET repository = excluded.repository, default_branch = excluded.default_branch, branch = excluded.branch, commit_sha = excluded.commit_sha, state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP"
  ).bind(
    String(userId),
    repository,
    defaultBranch,
    branch,
    commitSha,
    JSON.stringify(state),
  ).run();
  return { repository, defaultBranch, branch, commitSha, ...state };
}

export async function clearAiCodingTaskState(env, userId) {
  if (!env?.DB || !userId) return;
  requireDb(env);
  await ensureTable(env);
  await env.DB.prepare("DELETE FROM ai_coding_task_state WHERE user_id = ?").bind(String(userId)).run();
}

export function buildAiCodingTaskInstructions(state) {
  if (!state?.branch || !state?.commitSha) return "";
  const files = Array.isArray(state.changedFiles) && state.changedFiles.length
    ? ` Previous changed files: ${state.changedFiles.slice(0, 20).join(", ")}.`
    : "";
  const summary = state.summary ? ` Previous task summary: ${state.summary}.` : "";
  return [
    `A resumable previous coding task exists for this connected repository on branch ${state.branch} at commit ${state.commitSha}.`,
    summary,
    files,
    "Do not automatically continue that branch for an unrelated new request.",
    "If the latest user message clearly continues, corrects, tests, reviews, or asks follow-up work on that previous coding task, call github_resume_task before reading or changing repository files.",
    "If the latest request is a new independent coding task, leave the previous task untouched and start from the repository default branch.",
    "Only safe operational task state is persisted; never assume hidden reasoning or unrecorded test results survived across turns.",
  ].filter(Boolean).join(" ");
}

async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_coding_task_state (user_id TEXT PRIMARY KEY, repository TEXT NOT NULL, default_branch TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
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
  return {
    branch: String(value.branch || "").slice(0, 255),
    commitSha: cleanCommitSha(value.commitSha),
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
