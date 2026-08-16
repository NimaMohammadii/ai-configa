import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { getGitHubCreditAccess, githubCreditAccessMessage, requireGitHubCreditAccess } from "./github-access.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MAX_INSTALLATIONS = 20;
const MAX_REPOSITORIES = 500;
const MAX_TREE_ENTRIES = 4000;
const MAX_FILE_BYTES = 120 * 1024;
const MAX_COMMIT_FILES = 24;
const MAX_COMMIT_BYTES = 1024 * 1024;

export function isGitHubRequest(request) {
  const path = new URL(request.url).pathname;
  return path === "/mini-app/github/callback"
    || path === "/mini-app/github/webhook"
    || path.startsWith("/mini-app/api/github/");
}

export async function handleGitHubRequest(request, env) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/mini-app/github/callback") {
      return handleOAuthCallback(request, env);
    }
    if (request.method === "POST" && url.pathname === "/mini-app/github/webhook") {
      return handleWebhook(request, env);
    }
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

    const payload = await request.json().catch(() => ({}));
    const user = await authenticateMiniAppPayload(payload, env);
    if (url.pathname === "/mini-app/api/github/connect") {
      return json(await createConnectUrl(request, env, user.id));
    }
    if (url.pathname === "/mini-app/api/github/status") {
      return json(await getConnectionStatus(env, user.id));
    }
    if (url.pathname === "/mini-app/api/github/repositories") {
      return json(await getRepositoriesForUser(request, env, user.id));
    }
    if (url.pathname === "/mini-app/api/github/select") {
      return json(await selectRepository(env, user.id, payload));
    }
    if (url.pathname === "/mini-app/api/github/disconnect") {
      return json(await disconnectGitHub(env, user.id));
    }
    return json({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("github app request failed", error?.stack || error);
    return json({ error: publicError(error) }, error?.status || 500);
  }
}

export async function getSelectedGitHubRepository(env, userId) {
  await ensureGitHubTables(env);
  const row = await env.DB.prepare(
    "SELECT selected_installation_id, selected_repo_id, selected_repo_full_name, selected_default_branch "
      + "FROM github_connections WHERE user_id = ?",
  ).bind(String(userId)).first();
  if (!row?.selected_installation_id || !row?.selected_repo_full_name) return null;
  return {
    installationId: String(row.selected_installation_id),
    repoId: String(row.selected_repo_id || ""),
    fullName: String(row.selected_repo_full_name),
    defaultBranch: String(row.selected_default_branch || "main"),
  };
}

export async function listGitHubRepositoryTree(env, userId, options = {}) {
  const repository = await requireSelectedRepository(env, userId);
  const token = await createInstallationToken(env, repository.installationId);
  const branch = cleanBranch(options.branch || repository.defaultBranch);
  const data = await githubRequest(
    `/repos/${repoPath(repository.fullName)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { token },
  );
  const prefix = cleanOptionalPath(options.path);
  const entries = (Array.isArray(data.tree) ? data.tree : [])
    .filter((item) => !prefix || item.path === prefix || item.path.startsWith(prefix + "/"))
    .filter((item) => item.type === "blob" || item.type === "tree")
    .slice(0, MAX_TREE_ENTRIES)
    .map((item) => ({
      path: item.path,
      type: item.type === "tree" ? "directory" : "file",
      size: item.type === "blob" ? Number(item.size || 0) : undefined,
    }));
  return {
    repository: repository.fullName,
    branch,
    truncated: Boolean(data.truncated) || entries.length >= MAX_TREE_ENTRIES,
    entries,
  };
}

export async function readGitHubRepositoryFile(env, userId, options = {}) {
  const repository = await requireSelectedRepository(env, userId);
  const token = await createInstallationToken(env, repository.installationId);
  const path = cleanRequiredPath(options.path);
  const branch = cleanBranch(options.branch || repository.defaultBranch);
  const data = await githubRequest(
    `/repos/${repoPath(repository.fullName)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    { token },
  );
  if (Array.isArray(data) || data?.type !== "file") throw httpError("The requested path is not a file.", 400);
  if (Number(data.size || 0) > MAX_FILE_BYTES) {
    throw httpError("That file is too large to read in AI Chat.", 413);
  }
  const content = decodeGitHubContent(data.content, data.encoding);
  if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES || content.includes("\u0000")) {
    throw httpError("That file is binary or too large to read in AI Chat.", 413);
  }
  return {
    repository: repository.fullName,
    branch,
    path,
    sha: String(data.sha || ""),
    content,
  };
}

export async function commitGitHubRepositoryFiles(env, userId, options = {}) {
  const repository = await requireSelectedRepository(env, userId);
  const files = normalizeCommitFiles(options.files);
  const message = Array.from(String(options.message || "Update files with Vexa AI").trim())
    .slice(0, 180)
    .join("") || "Update files with Vexa AI";
  const baseBranch = cleanBranch(options.baseBranch || repository.defaultBranch);
  const token = await createInstallationToken(env, repository.installationId);
  const baseRef = await githubRequest(
    `/repos/${repoPath(repository.fullName)}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    { token },
  );
  const baseSha = String(baseRef?.object?.sha || "");
  if (!baseSha) throw new Error("GitHub did not return the base branch commit.");
  const expectedFiles = normalizeExpectedFiles(options.expectedFiles);
  for (const expected of expectedFiles) {
    const current = await githubRequest(
      `/repos/${repoPath(repository.fullName)}/contents/${expected.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(baseSha)}`,
      { token },
    );
    if (String(current?.sha || "") !== expected.sha) {
      throw httpError(`The file ${expected.path} changed while AI was working. Read it again before committing.`, 409);
    }
  }
  const baseCommit = await githubRequest(
    `/repos/${repoPath(repository.fullName)}/git/commits/${encodeURIComponent(baseSha)}`,
    { token },
  );
  const baseTreeSha = String(baseCommit?.tree?.sha || "");
  if (!baseTreeSha) throw new Error("GitHub did not return the base tree.");
  const baseTree = await githubRequest(
    `/repos/${repoPath(repository.fullName)}/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`,
    { token },
  );
  const existingModes = new Map(
    (Array.isArray(baseTree.tree) ? baseTree.tree : [])
      .filter((entry) => entry?.type === "blob" && entry?.path)
      .map((entry) => [String(entry.path), String(entry.mode || "100644")]),
  );

  const blobs = await Promise.all(files.map(async (file) => {
    if (file.delete) {
      if (!existingModes.has(file.path)) throw httpError(`The file ${file.path} does not exist.`, 404);
      return { path: file.path, mode: existingModes.get(file.path) || "100644", type: "blob", sha: null };
    }
    const blob = await githubRequest(`/repos/${repoPath(repository.fullName)}/git/blobs`, {
      method: "POST",
      token,
      body: { content: file.content, encoding: "utf-8" },
    });
    return { path: file.path, mode: existingModes.get(file.path) || "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubRequest(`/repos/${repoPath(repository.fullName)}/git/trees`, {
    method: "POST",
    token,
    body: { base_tree: baseTreeSha, tree: blobs },
  });
  const commit = await githubRequest(`/repos/${repoPath(repository.fullName)}/git/commits`, {
    method: "POST",
    token,
    body: { message, tree: tree.sha, parents: [baseSha] },
  });

  let branch = baseBranch;
  if (isVexaAiBranch(baseBranch)) {
    await githubRequest(`/repos/${repoPath(repository.fullName)}/git/refs/heads/${encodeURIComponent(baseBranch)}`, {
      method: "PATCH",
      token,
      body: { sha: commit.sha, force: false },
    });
  } else {
    branch = `vexa/ai-${Date.now().toString(36)}-${randomToken(4).toLowerCase()}`;
    await githubRequest(`/repos/${repoPath(repository.fullName)}/git/refs`, {
      method: "POST",
      token,
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  }

  return {
    repository: repository.fullName,
    baseBranch,
    branch,
    commitSha: String(commit.sha),
    changedFiles: files.map((file) => file.path),
    url: `https://github.com/${repository.fullName}/tree/${branch}`,
  };
}

async function createConnectUrl(request, env, userId) {
  assertGitHubConfigured(env);
  await ensureGitHubTables(env);
  await requireGitHubCreditAccess(env, userId, "connect GitHub");
  const state = randomToken(32);
  const stateHash = await sha256Hex(state);
  const expiresAt = Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS;
  await env.DB.prepare("DELETE FROM github_oauth_states WHERE expires_at < ?")
    .bind(Math.floor(Date.now() / 1000)).run();
  await env.DB.prepare(
    "INSERT INTO github_oauth_states (state_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(stateHash, String(userId), expiresAt).run();
  const callbackUrl = new URL("/mini-app/github/callback", request.url).toString();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", String(env.GITHUB_CLIENT_ID));
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  return { authorizeUrl: authorizeUrl.toString() };
}

async function handleOAuthCallback(request, env) {
  assertGitHubConfigured(env);
  await ensureGitHubTables(env);
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "");
  const state = String(url.searchParams.get("state") || "");
  if (!code || !state) return callbackPage("GitHub connection was cancelled.", false);
  const stateHash = await sha256Hex(state);
  const saved = await env.DB.prepare(
    "SELECT user_id, expires_at FROM github_oauth_states WHERE state_hash = ?",
  ).bind(stateHash).first();
  await env.DB.prepare("DELETE FROM github_oauth_states WHERE state_hash = ?").bind(stateHash).run();
  if (!saved || Number(saved.expires_at) < Math.floor(Date.now() / 1000)) {
    return callbackPage("This GitHub connection link has expired. Open AI Chat and try again.", false);
  }

  const userId = String(saved.user_id);
  const access = await getGitHubCreditAccess(env, userId);
  if (!access.allowed) {
    return callbackPage(githubCreditAccessMessage(access, "connect GitHub"), false);
  }

  const callbackUrl = new URL("/mini-app/github/callback", request.url).toString();
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: String(env.GITHUB_CLIENT_ID),
      client_secret: String(env.GITHUB_CLIENT_SECRET),
      code,
      redirect_uri: callbackUrl,
    }),
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  const userToken = String(tokenData.access_token || "");
  if (!tokenResponse.ok || !userToken) {
    return callbackPage("GitHub could not finish the connection. Please try again.", false);
  }
  const githubUser = await githubRequest("/user", { token: userToken });
  const installationsData = await githubRequest("/user/installations?per_page=100", { token: userToken });
  const installations = (Array.isArray(installationsData.installations) ? installationsData.installations : [])
    .slice(0, MAX_INSTALLATIONS);
  await env.DB.prepare(
    "INSERT INTO github_connections (user_id, github_user_id, github_login, connected_at, updated_at) "
      + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
      + "ON CONFLICT(user_id) DO UPDATE SET github_user_id = excluded.github_user_id, "
      + "github_login = excluded.github_login, updated_at = CURRENT_TIMESTAMP",
  ).bind(userId, String(githubUser.id), String(githubUser.login || "GitHub user")).run();
  await env.DB.prepare("DELETE FROM github_user_installations WHERE user_id = ?").bind(userId).run();
  for (const installation of installations) {
    await saveUserInstallation(env, userId, installation);
  }

  if (installations.length) {
    await selectFirstAvailableRepository(env, userId).catch((error) => {
      console.error("github automatic repository selection failed", error?.message || error);
    });
    return callbackPage("GitHub connected. Return to AI Chat and choose a repository.", true);
  }
  const app = await githubAppRequest(env, "/app");
  const slug = String(app.slug || "");
  const installUrl = slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : "";
  return callbackPage(
    "Your GitHub account is connected. Install the GitHub App on the repositories you want Vexa to access.",
    true,
    installUrl,
  );
}

async function getConnectionStatus(env, userId) {
  assertGitHubConfigured(env);
  await ensureGitHubTables(env);
  const row = await env.DB.prepare(
    "SELECT github_login, selected_repo_full_name, selected_default_branch FROM github_connections WHERE user_id = ?",
  ).bind(String(userId)).first();
  if (!row) return { connected: false, repository: null };
  return {
    connected: true,
    login: String(row.github_login || ""),
    repository: row.selected_repo_full_name ? {
      fullName: String(row.selected_repo_full_name),
      defaultBranch: String(row.selected_default_branch || "main"),
    } : null,
  };
}

async function getRepositoriesForUser(request, env, userId) {
  assertGitHubConfigured(env);
  const connection = await getConnectionStatus(env, userId);
  const repositories = connection.connected
    ? await listAccessibleRepositories(env, userId)
    : [];
  const authorizeUrl = !connection.connected || repositories.length === 0
    ? (await createConnectUrl(request, env, userId)).authorizeUrl
    : "";
  return { ...connection, repositories, authorizeUrl };
}

async function selectRepository(env, userId, payload) {
  const installationId = String(payload.installationId || "");
  const repoId = String(payload.repoId || "");
  if (!/^\d+$/.test(installationId) || !/^\d+$/.test(repoId)) {
    throw httpError("Choose a valid repository.", 400);
  }
  const repositories = await listAccessibleRepositories(env, userId);
  const selected = repositories.find((repo) => repo.installationId === installationId && repo.id === repoId);
  if (!selected) throw httpError("That repository is not available to this GitHub connection.", 404);
  await env.DB.prepare(
    "UPDATE github_connections SET selected_installation_id = ?, selected_repo_id = ?, "
      + "selected_repo_full_name = ?, selected_default_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
  ).bind(
    selected.installationId,
    selected.id,
    selected.fullName,
    selected.defaultBranch,
    String(userId),
  ).run();
  return { selected: true, repository: selected };
}

async function disconnectGitHub(env, userId) {
  await ensureGitHubTables(env);
  await env.DB.prepare("DELETE FROM github_user_installations WHERE user_id = ?").bind(String(userId)).run();
  await env.DB.prepare("DELETE FROM github_connections WHERE user_id = ?").bind(String(userId)).run();
  return { connected: false };
}

export async function listAccessibleGitHubRepositories(env, userId) {
  return listAccessibleRepositories(env, userId);
}

async function listAccessibleRepositories(env, userId) {
  await ensureGitHubTables(env);
  const rows = await env.DB.prepare(
    "SELECT installation_id FROM github_user_installations WHERE user_id = ? ORDER BY installation_id ASC",
  ).bind(String(userId)).all();
  const installationIds = (rows.results || []).map((row) => String(row.installation_id)).slice(0, MAX_INSTALLATIONS);
  const groups = await Promise.all(installationIds.map(async (installationId) => {
    try {
      const token = await createInstallationToken(env, installationId);
      const repositories = [];
      for (let page = 1; page <= 5 && repositories.length < MAX_REPOSITORIES; page += 1) {
        const data = await githubRequest(`/installation/repositories?per_page=100&page=${page}`, { token });
        const pageItems = Array.isArray(data.repositories) ? data.repositories : [];
        repositories.push(...pageItems);
        if (pageItems.length < 100) break;
      }
      return repositories.map((repo) => ({
        installationId,
        id: String(repo.id),
        fullName: String(repo.full_name),
        private: Boolean(repo.private),
        defaultBranch: String(repo.default_branch || "main"),
      }));
    } catch (error) {
      console.error("github installation repositories failed", installationId, error?.message || error);
      return [];
    }
  }));
  return groups.flat().slice(0, MAX_REPOSITORIES)
    .sort((first, second) => first.fullName.localeCompare(second.fullName));
}

async function selectFirstAvailableRepository(env, userId) {
  const connection = await getSelectedGitHubRepository(env, userId);
  if (connection) return;
  const first = (await listAccessibleRepositories(env, userId))[0];
  if (first) await selectRepository(env, userId, first);
}

async function handleWebhook(request, env) {
  if (!env.GITHUB_WEBHOOK_SECRET) return json({ error: "GitHub webhook is not configured." }, 503);
  const rawBody = await request.arrayBuffer();
  const signature = String(request.headers.get("X-Hub-Signature-256") || "");
  if (!(await verifyWebhookSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET))) {
    return json({ error: "Invalid signature" }, 401);
  }
  const payload = JSON.parse(new TextDecoder().decode(rawBody) || "{}");
  const event = String(request.headers.get("X-GitHub-Event") || "");
  const action = String(payload.action || "");
  const installationId = String(payload?.installation?.id || "");
  if (event === "installation" && installationId) {
    if (action === "deleted" || action === "suspend") {
      await removeInstallation(env, installationId);
    } else if (action === "created" || action === "unsuspend" || action === "new_permissions_accepted") {
      await attachWebhookInstallation(env, payload);
    }
  }
  if (event === "installation_repositories" && installationId) {
    const removedIds = (Array.isArray(payload.repositories_removed) ? payload.repositories_removed : [])
      .map((repo) => String(repo.id));
    if (removedIds.length) {
      const placeholders = removedIds.map(() => "?").join(",");
      await env.DB.prepare(
        `UPDATE github_connections SET selected_installation_id = NULL, selected_repo_id = NULL, `
          + `selected_repo_full_name = NULL, selected_default_branch = NULL, updated_at = CURRENT_TIMESTAMP `
          + `WHERE selected_installation_id = ? AND selected_repo_id IN (${placeholders})`,
      ).bind(installationId, ...removedIds).run();
    }
    const addedRepositories = Array.isArray(payload.repositories_added) ? payload.repositories_added : [];
    if (addedRepositories.length) {
      const users = await env.DB.prepare(
        "SELECT user_id FROM github_user_installations WHERE installation_id = ?",
      ).bind(installationId).all();
      for (const row of users.results || []) {
        await selectFirstAvailableRepository(env, row.user_id).catch((error) => {
          console.error("github repository auto-selection failed", error?.message || error);
        });
      }
    }
  }
  return json({ ok: true });
}

async function attachWebhookInstallation(env, payload) {
  await ensureGitHubTables(env);
  const githubUserId = String(payload?.sender?.id || "");
  const installation = payload?.installation;
  if (!githubUserId || !installation?.id) return;
  const users = await env.DB.prepare(
    "SELECT user_id FROM github_connections WHERE github_user_id = ?",
  ).bind(githubUserId).all();
  for (const row of users.results || []) {
    await saveUserInstallation(env, row.user_id, installation);
    await selectFirstAvailableRepository(env, row.user_id).catch(() => {});
  }
}

async function removeInstallation(env, installationId) {
  await ensureGitHubTables(env);
  await env.DB.prepare("DELETE FROM github_user_installations WHERE installation_id = ?")
    .bind(installationId).run();
  await env.DB.prepare(
    "UPDATE github_connections SET selected_installation_id = NULL, selected_repo_id = NULL, "
      + "selected_repo_full_name = NULL, selected_default_branch = NULL, updated_at = CURRENT_TIMESTAMP "
      + "WHERE selected_installation_id = ?",
  ).bind(installationId).run();
}

async function saveUserInstallation(env, userId, installation) {
  await env.DB.prepare(
    "INSERT INTO github_user_installations (user_id, installation_id, account_login, account_type, updated_at) "
      + "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) "
      + "ON CONFLICT(user_id, installation_id) DO UPDATE SET account_login = excluded.account_login, "
      + "account_type = excluded.account_type, updated_at = CURRENT_TIMESTAMP",
  ).bind(
    String(userId),
    String(installation.id),
    String(installation?.account?.login || ""),
    String(installation?.account?.type || ""),
  ).run();
}

async function requireSelectedRepository(env, userId) {
  const repository = await getSelectedGitHubRepository(env, userId);
  if (!repository) throw httpError("Connect GitHub and choose a repository first.", 409);
  return repository;
}

async function createInstallationToken(env, installationId) {
  const data = await githubAppRequest(env, `/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
  });
  if (!data?.token) throw new Error("GitHub did not return an installation token.");
  return String(data.token);
}

async function githubAppRequest(env, path, options = {}) {
  const jwt = await createAppJwt(env);
  return githubRequest(path, { ...options, token: jwt });
}

async function githubRequest(path, options = {}) {
  const response = await fetch(GITHUB_API + path, {
    method: options.method || "GET",
    headers: {
      "Accept": options.accept || "application/vnd.github+json",
      "Authorization": `Bearer ${options.token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "Vexa-AI-GitHub-App",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = httpError(githubApiError(response.status, data), response.status);
    error.github = data;
    throw error;
  }
  return data;
}

async function createAppJwt(env) {
  assertGitHubConfigured(env);
  const now = Math.floor(Date.now() / 1000);
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

async function verifyWebhookSignature(body, signature, secret) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = "sha256=" + toHex(await crypto.subtle.sign("HMAC", key, body));
  return timingSafeEqual(signature.toLowerCase(), expected.toLowerCase());
}

export async function ensureGitHubTables(env) {
  if (!env.DB) throw new Error("Database binding is missing.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS github_connections (user_id TEXT PRIMARY KEY, github_user_id TEXT NOT NULL, "
      + "github_login TEXT NOT NULL, selected_installation_id TEXT, selected_repo_id TEXT, "
      + "selected_repo_full_name TEXT, selected_default_branch TEXT, connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "
      + "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS github_user_installations (user_id TEXT NOT NULL, installation_id TEXT NOT NULL, "
      + "account_login TEXT, account_type TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "
      + "PRIMARY KEY (user_id, installation_id))",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS github_oauth_states (state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, "
      + "expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ).run();
}

function normalizeCommitFiles(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_COMMIT_FILES) {
    throw httpError(`A commit must contain between 1 and ${MAX_COMMIT_FILES} text files.`, 400);
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = value.map((item) => {
    const path = cleanRequiredPath(item?.path);
    if (path === ".git" || path.startsWith(".git/") || path.startsWith(".github/workflows/")) {
      throw httpError("That protected path cannot be changed from AI Chat.", 400);
    }
    if (seen.has(path)) throw httpError(`The file ${path} was included more than once.`, 400);
    seen.add(path);
    const deleteFile = item?.delete === true;
    const content = deleteFile ? "" : String(item?.content ?? "");
    if (content.includes("\u0000")) throw httpError("Binary files cannot be committed from AI Chat.", 400);
    if (!deleteFile) totalBytes += new TextEncoder().encode(content).byteLength;
    return { path, content, delete: deleteFile };
  });
  if (totalBytes > MAX_COMMIT_BYTES) throw httpError("The proposed commit is too large.", 413);
  return files;
}

function normalizeExpectedFiles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const path = cleanRequiredPath(item?.path);
    const sha = String(item?.sha || "").trim();
    if (!/^[a-f0-9]{40,64}$/i.test(sha)) throw httpError("An expected GitHub file SHA is invalid.", 400);
    return { path, sha };
  });
}

function cleanRequiredPath(value) {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 500 || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw httpError("Use a valid repository-relative file path.", 400);
  }
  return path;
}

function cleanOptionalPath(value) {
  const path = String(value || "").trim();
  return path ? cleanRequiredPath(path) : "";
}

function cleanBranch(value) {
  const branch = String(value || "main").trim();
  if (!branch || branch.length > 255 || branch.includes("..") || /[~^:?*[\\\s]/.test(branch)) {
    throw httpError("Use a valid Git branch name.", 400);
  }
  return branch;
}

function isVexaAiBranch(value) {
  const branch = String(value || "").trim();
  return branch.startsWith("vexa/ai-");
}

function decodeGitHubContent(content, encoding) {
  if (String(encoding || "base64") !== "base64") throw httpError("GitHub returned an unsupported file encoding.", 415);
  const binary = atob(String(content || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function repoPath(fullName) {
  const parts = String(fullName || "").split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error("Invalid repository name.");
  return parts.map(encodeURIComponent).join("/");
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
  const privateKey = derElement(0x04, pkcs1);
  return derElement(0x30, concatBytes(version, rsaAlgorithmIdentifier, privateKey));
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

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlBytes(bytes);
}

async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
}

function timingSafeEqual(first, second) {
  if (first.length !== second.length) return false;
  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) mismatch |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return mismatch === 0;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function assertGitHubConfigured(env) {
  const required = ["GITHUB_PRIVATE_KEY", "GITHUB_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_APP_ID"];
  if (required.some((key) => !env[key])) throw httpError("GitHub connection is not configured.", 503);
}

function githubApiError(status, data) {
  const message = String(data?.message || "");
  if (status === 401) return "GitHub authentication expired. Reconnect GitHub and try again.";
  if (status === 403) return "The GitHub App does not have permission for this operation.";
  if (status === 404) return "The repository, branch, or file was not found.";
  if (status === 409 || status === 422) return message || "GitHub could not apply that change.";
  return status >= 500 ? "GitHub is temporarily unavailable." : (message || "GitHub request failed.");
}

function publicError(error) {
  if (error?.status && error.status < 500) return String(error.message || "GitHub request failed.");
  return String(error?.message || "GitHub request failed.")
    .replace(/gh[opsu]_[A-Za-z0-9_]+/g, "[secret]")
    .slice(0, 300);
}

function callbackPage(message, success, installUrl = "") {
  const safeMessage = escapeHtml(message);
  const installButton = installUrl
    ? `<a class="button" href="${escapeHtml(installUrl)}">Install GitHub App</a>`
    : "";
  const githubIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.1 1.2a10.8 10.8 0 0 1 5.7 0C14.9 5 16 5.3 16 5.3c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"/></svg>';
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#000"><title>GitHub connection</title><style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}body{position:fixed;inset:0;display:grid;place-items:center;padding:24px max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}.content{width:min(420px,100%);text-align:center}.icon{width:54px;height:54px;margin:0 auto 20px;display:grid;place-items:center;color:#fff}.icon svg{display:block;width:54px;height:54px;fill:currentColor}h1{font-size:21px;line-height:1.2;margin:0 0 10px}p{color:#aaa;line-height:1.5;margin:0 0 22px}.button{display:block;width:100%;border:0;border-radius:14px;background:#fff;color:#000;padding:14px 18px;font:600 15px/1.2 inherit;text-decoration:none;margin-top:10px;cursor:pointer}.secondary{background:#1b1b1d;color:#fff}</style></head><body><main class="content"><div class="icon">${githubIcon}</div><h1>${success ? "GitHub connected" : "Connection failed"}</h1><p>${safeMessage}</p>${installButton}<a class="button secondary" href="/mini-app/chat">Return to AI Chat</a></main></body></html>`, {
    status: success ? 200 : 400,
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
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
