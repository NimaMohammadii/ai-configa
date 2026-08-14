import { clearAiCodingTaskState, getAiCodingTaskState } from "./ai-coding-task.js";
import { summarizeCodingPlan } from "./ai-coding-plan.js";
import { getSelectedGitHubRepository } from "./github-app.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const APPROVAL_TTL_SECONDS = 10 * 60;
const MAX_PENDING_APPROVALS = 6;
const MAX_CUMULATIVE_FILES = 300;
const MAX_CUMULATIVE_PATCH_CHARS = 12000;
const MAX_CUMULATIVE_DIFF_CHARS = 120000;
const APPROVAL_PREFIX = "/mini-app/api/github-ai-approvals/";

export function isGitHubAiApprovalRequest(request) {
  return new URL(request.url).pathname.startsWith(APPROVAL_PREFIX);
}

export async function handleGitHubAiApprovalRequest(request, env) {
  try {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    const path = new URL(request.url).pathname;
    if (path === APPROVAL_PREFIX + "list") {
      return json(await listPendingGitHubAiApprovals(env, user.id));
    }
    if (path === APPROVAL_PREFIX + "approve") {
      return json(await approveGitHubAiAction(env, user.id, payload.approvalId));
    }
    if (path === APPROVAL_PREFIX + "reject") {
      return json(await rejectGitHubAiAction(env, user.id, payload.approvalId));
    }
    return json({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("GitHub AI approval request failed", error?.stack || error);
    return json({ error: publicError(error) }, Number(error?.status || 500));
  }
}

export async function requestGitHubAiApproval(env, userId, action = {}) {
  if (!env?.DB) throw new Error("Database binding is missing.");
  const repository = await requireSelectedRepository(env, userId);
  const token = await createInstallationToken(env, repository.installationId);
  const repo = repoPath(repository.fullName);
  await ensureApprovalTable(env);
  await expireOldApprovals(env, userId);

  const type = String(action.type || "");
  let payload;
  let target;

  if (type === "merge_pull_request") {
    const number = Number(action.number);
    if (!Number.isInteger(number) || number <= 0) throw httpError("Use a valid pull request number.", 400);
    const pull = await githubRequest(`/repos/${repo}/pulls/${number}`, { token });
    if (pull?.merged) {
      return {
        confirmationRequired: false,
        alreadyCompleted: true,
        actionType: type,
        repository: repository.fullName,
        baseBranch: repository.defaultBranch,
        branch: String(pull?.head?.ref || ""),
        pullRequestNumber: number,
        merged: true,
        commitSha: String(pull?.merge_commit_sha || ""),
        url: String(pull?.html_url || `https://github.com/${repository.fullName}/pull/${number}`),
      };
    }
    if (String(pull?.base?.ref || "") !== repository.defaultBranch) {
      throw httpError(`That pull request does not target ${repository.defaultBranch}.`, 409);
    }
    if (String(pull?.head?.repo?.full_name || "") !== repository.fullName) {
      throw httpError("Only pull requests from the connected repository can be approved here.", 409);
    }
    const branch = cleanVexaBranch(pull?.head?.ref);
    const expectedHeadSha = cleanCommitSha(pull?.head?.sha);
    const defaultRef = await githubRequest(
      `/repos/${repo}/git/ref/heads/${encodeURIComponent(repository.defaultBranch)}`,
      { token },
    );
    const expectedBaseSha = cleanCommitSha(defaultRef?.object?.sha);
    await assertBranchReadyForApproval(env, userId, repository, token, branch, expectedHeadSha);
    payload = {
      type,
      number,
      branch,
      baseBranch: repository.defaultBranch,
      expectedHeadSha,
      expectedBaseSha,
      pullRequestUrl: String(pull?.html_url || `https://github.com/${repository.fullName}/pull/${number}`),
    };
    target = `pr:${number}`;
  } else if (type === "apply_branch") {
    const branch = cleanVexaBranch(action.branch);
    const [branchRef, defaultRef] = await Promise.all([
      githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token }),
      githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(repository.defaultBranch)}`, { token }),
    ]);
    const expectedHeadSha = cleanCommitSha(branchRef?.object?.sha);
    const expectedBaseSha = cleanCommitSha(defaultRef?.object?.sha);
    if (expectedHeadSha === expectedBaseSha) {
      return {
        confirmationRequired: false,
        alreadyCompleted: true,
        actionType: type,
        repository: repository.fullName,
        baseBranch: repository.defaultBranch,
        branch,
        applied: true,
        commitSha: expectedHeadSha,
        url: `https://github.com/${repository.fullName}/commit/${expectedHeadSha}`,
      };
    }
    await assertBranchReadyForApproval(env, userId, repository, token, branch, expectedHeadSha);
    payload = { type, branch, baseBranch: repository.defaultBranch, expectedHeadSha, expectedBaseSha };
    target = `branch:${branch}`;
  } else {
    throw httpError("Unsupported GitHub approval action.", 400);
  }

  const existing = await env.DB.prepare(
    "SELECT approval_id, payload_json, expires_at FROM ai_github_action_approvals "
      + "WHERE user_id = ? AND repository = ? AND action_type = ? AND target = ? AND status = 'pending' "
      + "ORDER BY created_at DESC LIMIT 1"
  ).bind(String(userId), repository.fullName, type, target).first();
  if (existing && Number(existing.expires_at || 0) > nowSeconds()) {
    const saved = parseJson(existing.payload_json);
    if (
      String(saved?.expectedHeadSha || "") === payload.expectedHeadSha
      && String(saved?.expectedBaseSha || "") === payload.expectedBaseSha
    ) {
      return approvalPublic({
        approval_id: existing.approval_id,
        repository: repository.fullName,
        action_type: type,
        target,
        payload_json: existing.payload_json,
        expires_at: existing.expires_at,
        status: "pending",
      }, repository.defaultBranch);
    }
    await env.DB.prepare(
      "UPDATE ai_github_action_approvals SET status = 'stale', updated_at = CURRENT_TIMESTAMP "
        + "WHERE approval_id = ? AND user_id = ? AND status = 'pending'"
    ).bind(String(existing.approval_id), String(userId)).run();
  }

  const approvalId = `gha-${crypto.randomUUID()}`;
  const expiresAt = nowSeconds() + APPROVAL_TTL_SECONDS;
  await env.DB.prepare(
    "INSERT INTO ai_github_action_approvals "
      + "(approval_id, user_id, repository, action_type, target, payload_json, status, expires_at, created_at, updated_at) "
      + "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).bind(
    approvalId,
    String(userId),
    repository.fullName,
    type,
    target,
    JSON.stringify(payload),
    expiresAt,
  ).run();

  return approvalPublic({
    approval_id: approvalId,
    repository: repository.fullName,
    action_type: type,
    target,
    payload_json: JSON.stringify(payload),
    expires_at: expiresAt,
    status: "pending",
  }, repository.defaultBranch);
}

export async function getGitHubAiCumulativeDiff(env, userId, rawBranch) {
  const repository = await requireSelectedRepository(env, userId);
  const branch = cleanVexaBranch(rawBranch);
  const token = await createInstallationToken(env, repository.installationId);
  const repo = repoPath(repository.fullName);
  const [data, branchRef] = await Promise.all([
    githubRequest(
      `/repos/${repo}/compare/${encodeURIComponent(repository.defaultBranch)}...${encodeURIComponent(branch)}?per_page=100&page=1`,
      { token },
    ),
    githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token }),
  ]);
  const sourceFiles = Array.isArray(data?.files) ? data.files.slice(0, MAX_CUMULATIVE_FILES) : [];
  let remainingPatchChars = MAX_CUMULATIVE_DIFF_CHARS;
  let patchBudgetTruncated = false;
  const files = sourceFiles.map((file) => {
    const patch = String(file?.patch || "");
    const allowed = Math.max(0, Math.min(MAX_CUMULATIVE_PATCH_CHARS, remainingPatchChars));
    const clipped = allowed ? patch.slice(0, allowed) : "";
    remainingPatchChars -= clipped.length;
    const truncated = patch.length > clipped.length;
    patchBudgetTruncated = patchBudgetTruncated || truncated;
    return {
      path: String(file?.filename || ""),
      previousPath: String(file?.previous_filename || ""),
      status: String(file?.status || "modified"),
      additions: Math.max(0, Number(file?.additions || 0)),
      deletions: Math.max(0, Number(file?.deletions || 0)),
      changes: Math.max(0, Number(file?.changes || 0)),
      hunks: parsePatchHunks(clipped),
      truncated,
    };
  });
  const totals = files.reduce((sum, file) => ({
    files: sum.files + 1,
    additions: sum.additions + file.additions,
    deletions: sum.deletions + file.deletions,
  }), { files: 0, additions: 0, deletions: 0 });
  const commitSha = cleanCommitSha(branchRef?.object?.sha);
  return {
    repository: repository.fullName,
    baseBranch: repository.defaultBranch,
    branch,
    commitSha,
    status: String(data?.status || ""),
    aheadBy: Math.max(0, Number(data?.ahead_by || 0)),
    behindBy: Math.max(0, Number(data?.behind_by || 0)),
    totalCommits: Math.max(0, Number(data?.total_commits || 0)),
    totals,
    files,
    truncated: sourceFiles.length >= MAX_CUMULATIVE_FILES || patchBudgetTruncated,
    fileListLimitReached: sourceFiles.length >= MAX_CUMULATIVE_FILES,
    patchBudgetTruncated,
    url: String(data?.html_url || `https://github.com/${repository.fullName}/compare/${repository.defaultBranch}...${branch}`),
  };
}

async function listPendingGitHubAiApprovals(env, userId) {
  await ensureApprovalTable(env);
  await expireOldApprovals(env, userId);
  const repository = await getSelectedGitHubRepository(env, userId).catch(() => null);
  if (!repository?.fullName) return { approvals: [] };
  const rows = await env.DB.prepare(
    "SELECT approval_id, repository, action_type, target, payload_json, status, expires_at, created_at, updated_at "
      + "FROM ai_github_action_approvals WHERE user_id = ? AND repository = ? AND status = 'pending' AND expires_at > ? "
      + "ORDER BY created_at DESC LIMIT ?"
  ).bind(String(userId), repository.fullName, nowSeconds(), MAX_PENDING_APPROVALS).all();
  return {
    approvals: (rows.results || []).map((row) => approvalPublic(row, repository.defaultBranch || "main")),
  };
}

async function approveGitHubAiAction(env, userId, rawApprovalId) {
  await ensureApprovalTable(env);
  await expireOldApprovals(env, userId);
  const approvalId = cleanApprovalId(rawApprovalId);
  const row = await env.DB.prepare(
    "SELECT approval_id, repository, action_type, target, payload_json, status, expires_at, result_json "
      + "FROM ai_github_action_approvals WHERE approval_id = ? AND user_id = ?"
  ).bind(approvalId, String(userId)).first();
  if (!row) throw httpError("This approval request was not found.", 404);
  if (row.status === "approved") {
    const result = parseJson(row.result_json) || {};
    return { approvalId, status: "approved", ...result };
  }
  if (row.status !== "pending") throw httpError("This approval request is no longer active.", 409);
  if (Number(row.expires_at || 0) <= nowSeconds()) {
    await setApprovalStatus(env, approvalId, userId, "expired");
    throw httpError("This approval request expired. Ask AI to prepare it again.", 410);
  }

  const claim = await env.DB.prepare(
    "UPDATE ai_github_action_approvals SET status = 'processing', updated_at = CURRENT_TIMESTAMP "
      + "WHERE approval_id = ? AND user_id = ? AND status = 'pending'"
  ).bind(approvalId, String(userId)).run();
  if (Number(claim?.meta?.changes || 0) !== 1) {
    throw httpError("This approval is already being processed.", 409);
  }

  const payload = parseJson(row.payload_json) || {};
  try {
    const result = row.action_type === "merge_pull_request"
      ? await executeApprovedPullRequestMerge(env, userId, row.repository, payload)
      : row.action_type === "apply_branch"
        ? await executeApprovedBranchApply(env, userId, row.repository, payload)
        : (() => { throw httpError("Unsupported GitHub approval action.", 400); })();

    await env.DB.prepare(
      "UPDATE ai_github_action_approvals SET status = 'approved', result_json = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
        + "WHERE approval_id = ? AND user_id = ?"
    ).bind(JSON.stringify(result), approvalId, String(userId)).run();
    if (isVexaBranch(payload.branch)) {
      await clearAiCodingTaskState(env, userId, payload.branch).catch((error) => {
        console.error("clear approved coding task failed", error?.message || error);
      });
    }
    return { approvalId, status: "approved", ...result };
  } catch (error) {
    const stale = Boolean(error?.stale);
    await setApprovalStatus(env, approvalId, userId, stale ? "stale" : "pending").catch(() => null);
    throw error;
  }
}

async function rejectGitHubAiAction(env, userId, rawApprovalId) {
  await ensureApprovalTable(env);
  const approvalId = cleanApprovalId(rawApprovalId);
  const result = await env.DB.prepare(
    "UPDATE ai_github_action_approvals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
      + "WHERE approval_id = ? AND user_id = ? AND status = 'pending'"
  ).bind(approvalId, String(userId)).run();
  if (Number(result?.meta?.changes || 0) !== 1) {
    throw httpError("This approval request is no longer active.", 409);
  }
  return { approvalId, status: "rejected" };
}

async function assertBranchReadyForApproval(env, userId, repository, token, branch, expectedHeadSha) {
  const repo = repoPath(repository.fullName);
  const [compare, branchRef] = await Promise.all([
    githubRequest(
      `/repos/${repo}/compare/${encodeURIComponent(repository.defaultBranch)}...${encodeURIComponent(branch)}?per_page=1&page=1`,
      { token },
    ),
    githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token }),
  ]);
  if (Math.max(0, Number(compare?.behind_by || 0)) > 0) {
    throw httpError(
      `The Vexa branch is behind ${repository.defaultBranch}. Sync it, validate the synced commit, and review again before approval.`,
      409,
    );
  }
  const currentHeadSha = cleanCommitSha(branchRef?.object?.sha);
  if (currentHeadSha !== expectedHeadSha) {
    throw staleError("The Vexa branch changed after the approval request was prepared. Review the latest commit first.");
  }
  const task = await getAiCodingTaskState(env, userId, repository, branch).catch(() => null);
  if (!task || task.commitSha !== expectedHeadSha || task.lastReview?.commitSha !== expectedHeadSha) {
    throw httpError("Run the final validated branch review for this exact commit before asking for approval.", 409);
  }
  const plan = summarizeCodingPlan(task.plan);
  if (plan && !plan.complete) {
    throw httpError("Finish the active coding plan before applying or merging this task.", 409);
  }
}

async function executeApprovedPullRequestMerge(env, userId, expectedRepository, payload) {
  const repository = await requireSelectedRepository(env, userId);
  if (repository.fullName !== String(expectedRepository || "")) {
    throw staleError("The selected GitHub repository changed. This approval was cancelled.");
  }
  if (String(payload.baseBranch || "") !== repository.defaultBranch) {
    throw staleError("The repository default branch changed. Review the task again before merging.");
  }
  const token = await createInstallationToken(env, repository.installationId);
  const repo = repoPath(repository.fullName);
  const number = Number(payload.number);
  const pull = await githubRequest(`/repos/${repo}/pulls/${number}`, { token });
  if (pull?.merged) {
    return {
      actionType: "merge_pull_request",
      repository: repository.fullName,
      baseBranch: repository.defaultBranch,
      branch: String(pull?.head?.ref || payload.branch || ""),
      pullRequestNumber: number,
      merged: true,
      commitSha: String(pull?.merge_commit_sha || ""),
      url: String(pull?.html_url || `https://github.com/${repository.fullName}/pull/${number}`),
    };
  }
  if (
    String(pull?.base?.ref || "") !== repository.defaultBranch
    || String(pull?.head?.repo?.full_name || "") !== repository.fullName
    || String(pull?.head?.ref || "") !== String(payload.branch || "")
    || cleanCommitSha(pull?.head?.sha) !== cleanCommitSha(payload.expectedHeadSha)
  ) {
    throw staleError("The pull request changed after you were asked to confirm it. Review it again before merging.");
  }
  const defaultRef = await githubRequest(
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(repository.defaultBranch)}`,
    { token },
  );
  if (cleanCommitSha(defaultRef?.object?.sha) !== cleanCommitSha(payload.expectedBaseSha)) {
    throw staleError(`${repository.defaultBranch} changed after approval was prepared. Sync and review the task again.`);
  }
  await assertBranchReadyForApproval(env, userId, repository, token, payload.branch, payload.expectedHeadSha);
  const repoInfo = await githubRequest(`/repos/${repo}`, { token });
  const mergeMethod = repoInfo.allow_merge_commit
    ? "merge"
    : repoInfo.allow_squash_merge
      ? "squash"
      : repoInfo.allow_rebase_merge
        ? "rebase"
        : "merge";
  const result = await githubRequest(`/repos/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    token,
    body: { merge_method: mergeMethod },
  });
  if (!result?.merged) throw httpError(String(result?.message || "GitHub could not merge that pull request."), 409);
  return {
    actionType: "merge_pull_request",
    repository: repository.fullName,
    baseBranch: repository.defaultBranch,
    branch: payload.branch,
    pullRequestNumber: number,
    merged: true,
    mergeMethod,
    commitSha: String(result.sha || ""),
    url: String(pull?.html_url || `https://github.com/${repository.fullName}/pull/${number}`),
  };
}

async function executeApprovedBranchApply(env, userId, expectedRepository, payload) {
  const repository = await requireSelectedRepository(env, userId);
  if (repository.fullName !== String(expectedRepository || "")) {
    throw staleError("The selected GitHub repository changed. This approval was cancelled.");
  }
  if (String(payload.baseBranch || "") !== repository.defaultBranch) {
    throw staleError("The repository default branch changed. Review the task again before applying it.");
  }
  const branch = cleanVexaBranch(payload.branch);
  const token = await createInstallationToken(env, repository.installationId);
  const repo = repoPath(repository.fullName);
  const [branchRef, defaultRef] = await Promise.all([
    githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token }),
    githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(repository.defaultBranch)}`, { token }),
  ]);
  const branchSha = cleanCommitSha(branchRef?.object?.sha);
  const defaultSha = cleanCommitSha(defaultRef?.object?.sha);
  const expectedHeadSha = cleanCommitSha(payload.expectedHeadSha);
  const expectedBaseSha = cleanCommitSha(payload.expectedBaseSha);
  if (branchSha === expectedHeadSha && defaultSha === expectedHeadSha) {
    return {
      actionType: "apply_branch",
      repository: repository.fullName,
      applied: true,
      alreadyApplied: true,
      branch,
      baseBranch: repository.defaultBranch,
      commitSha: branchSha,
      url: `https://github.com/${repository.fullName}/commit/${branchSha}`,
    };
  }
  if (branchSha !== expectedHeadSha || defaultSha !== expectedBaseSha) {
    throw staleError("The branch or default branch changed after approval was prepared. Review the latest state again.");
  }
  await assertBranchReadyForApproval(env, userId, repository, token, branch, branchSha);
  await githubRequest(`/repos/${repo}/git/refs/heads/${encodeURIComponent(repository.defaultBranch)}`, {
    method: "PATCH",
    token,
    body: { sha: branchSha, force: false },
  });
  return {
    actionType: "apply_branch",
    repository: repository.fullName,
    applied: true,
    branch,
    baseBranch: repository.defaultBranch,
    commitSha: branchSha,
    url: `https://github.com/${repository.fullName}/commit/${branchSha}`,
  };
}

async function ensureApprovalTable(env) {
  if (!env?.DB) throw new Error("Database binding is missing.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS ai_github_action_approvals ("
      + "approval_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, repository TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT NOT NULL, "
      + "payload_json TEXT NOT NULL, result_json TEXT, status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL, "
      + "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ai_github_action_approvals_user_status "
      + "ON ai_github_action_approvals (user_id, status, expires_at DESC)"
  ).run();
}

async function expireOldApprovals(env, userId) {
  await env.DB.prepare(
    "UPDATE ai_github_action_approvals SET status = 'pending', updated_at = CURRENT_TIMESTAMP "
      + "WHERE user_id = ? AND status = 'processing' AND expires_at > ? AND updated_at <= datetime('now','-2 minutes')"
  ).bind(String(userId), nowSeconds()).run();
  await env.DB.prepare(
    "UPDATE ai_github_action_approvals SET status = 'expired', updated_at = CURRENT_TIMESTAMP "
      + "WHERE user_id = ? AND status IN ('pending','processing') AND expires_at <= ?"
  ).bind(String(userId), nowSeconds()).run();
}

async function setApprovalStatus(env, approvalId, userId, status) {
  await env.DB.prepare(
    "UPDATE ai_github_action_approvals SET status = ?, updated_at = CURRENT_TIMESTAMP "
      + "WHERE approval_id = ? AND user_id = ?"
  ).bind(String(status), String(approvalId), String(userId)).run();
}

function approvalPublic(row, defaultBranch) {
  const payload = parseJson(row?.payload_json) || {};
  const actionType = String(row?.action_type || payload.type || "");
  const branch = String(payload.branch || "");
  const baseBranch = String(payload.baseBranch || defaultBranch || "main");
  const pullRequestNumber = Math.max(0, Number(payload.number || 0));
  return {
    confirmationRequired: true,
    approvalId: String(row?.approval_id || ""),
    status: String(row?.status || "pending"),
    actionType,
    repository: String(row?.repository || ""),
    baseBranch,
    branch,
    pullRequestNumber,
    expiresAt: Math.max(0, Number(row?.expires_at || 0)),
    title: actionType === "merge_pull_request"
      ? `Merge PR #${pullRequestNumber} into ${baseBranch}`
      : `Apply ${branch} to ${baseBranch}`,
    message: "No default-branch change has happened yet. The user must confirm this action in AI Chat.",
    url: String(payload.pullRequestUrl || ""),
  };
}

function parsePatchHunks(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const hunks = [];
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  for (const rawLine of lines) {
    const header = rawLine.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { oldStart: oldLine, newStart: newLine, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk || !rawLine) continue;
    if (rawLine.startsWith("\\ No newline at end of file")) continue;
    const prefix = rawLine[0];
    const text = rawLine.slice(1, 1401);
    if (prefix === " ") {
      hunk.lines.push({ type: "context", oldLine, newLine, text });
      oldLine += 1;
      newLine += 1;
    } else if (prefix === "-") {
      hunk.lines.push({ type: "remove", oldLine, newLine: null, text });
      oldLine += 1;
    } else if (prefix === "+") {
      hunk.lines.push({ type: "add", oldLine: null, newLine, text });
      newLine += 1;
    }
  }
  return hunks;
}

async function requireSelectedRepository(env, userId) {
  const repository = await getSelectedGitHubRepository(env, userId);
  if (!repository) throw httpError("Connect GitHub and choose a repository first.", 409);
  return repository;
}

async function createInstallationToken(env, installationId) {
  const jwt = await createAppJwt(env);
  const data = await githubRequest(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    token: jwt,
  });
  if (!data?.token) throw new Error("GitHub did not return an installation token.");
  return String(data.token);
}

async function githubRequest(path, options = {}) {
  const response = await fetch(GITHUB_API + path, {
    method: options.method || "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${options.token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "Vexa-AI-GitHub-Approval",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const message = String(data?.message || "GitHub request failed.");
    if (response.status === 403) throw httpError("GitHub blocked this action because permissions or branch rules are not satisfied.", 403);
    if (response.status === 404) throw httpError("The repository, branch, pull request, or commit was not found.", 404);
    throw httpError(message, response.status >= 500 ? 502 : 409);
  }
  return data;
}

async function createAppJwt(env) {
  if (!env?.GITHUB_PRIVATE_KEY || !env?.GITHUB_APP_ID) throw new Error("GitHub connection is not configured.");
  const now = nowSeconds();
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({ iat: now - 60, exp: now + 9 * 60, iss: String(env.GITHUB_APP_ID) });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GITHUB_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function pemToArrayBuffer(value) {
  const pem = String(value || "").replace(/\\n/g, "\n");
  const isPkcs1 = pem.includes("-----BEGIN RSA PRIVATE KEY-----");
  const base64 = pem.replace(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g,
    "",
  );
  if (!base64) throw new Error("GitHub private key is invalid.");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return isPkcs1 ? wrapPkcs1AsPkcs8(bytes).buffer : bytes.buffer;
}

function wrapPkcs1AsPkcs8(pkcs1) {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithmIdentifier = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  return derElement(0x30, concatBytes(version, rsaAlgorithmIdentifier, derElement(0x04, pkcs1)));
}

function derElement(tag, content) {
  return concatBytes(new Uint8Array([tag]), derLength(content.length), content);
}

function derLength(length) {
  if (length < 128) return new Uint8Array([length]);
  const bytes = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...arrays) {
  const output = new Uint8Array(arrays.reduce((total, array) => total + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function cleanVexaBranch(value) {
  const branch = String(value || "").trim();
  if (!isVexaBranch(branch)) throw httpError("Only a valid Vexa AI branch can be approved.", 400);
  return branch;
}

function isVexaBranch(value) {
  const branch = String(value || "").trim();
  return branch.startsWith("vexa/ai-")
    && branch.length <= 255
    && !branch.includes("..")
    && !/[~^:?*[\\\s]/.test(branch);
}

function cleanCommitSha(value) {
  const sha = String(value || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw httpError("GitHub did not return a valid commit SHA.", 409);
  return sha;
}

function cleanApprovalId(value) {
  const id = String(value || "").trim();
  if (!/^gha-[a-f0-9-]{36}$/i.test(id)) throw httpError("Invalid approval request.", 400);
  return id;
}

function parseJson(value) {
  try { return JSON.parse(String(value || "{}")); } catch { return null; }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function staleError(message) {
  const error = httpError(message, 409);
  error.stale = true;
  return error;
}

function publicError(error) {
  return String(error?.message || "GitHub approval failed.")
    .replace(/gh[opsu]_[A-Za-z0-9_]+/g, "[secret]")
    .slice(0, 500);
}

function httpError(message, status) {
  const error = new Error(String(message || "GitHub approval failed."));
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
