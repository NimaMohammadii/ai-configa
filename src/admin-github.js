import { ensureGitHubTables, listAccessibleGitHubRepositories } from "./github-app.js";

const ADMIN_GITHUB_USERS_PER_PAGE = 8;
const ADMIN_GITHUB_REPOS_PER_PAGE = 8;

export function withAdminGitHubMainKeyboard(keyboard) {
  const rows = Array.isArray(keyboard?.inline_keyboard)
    ? keyboard.inline_keyboard.map((row) => Array.isArray(row) ? row.slice() : [])
    : [];
  const exists = rows.some((row) => row.some((button) => button?.callback_data === "admin_github_users:0"));
  if (!exists) {
    const backIndex = rows.findIndex((row) => row.some((button) => button?.callback_data === "admin_broadcast"));
    const insertAt = backIndex >= 0 ? backIndex : rows.length;
    rows.splice(insertAt, 0, [{ text: "🐙 GitHub Connections", callback_data: "admin_github_users:0" }]);
  }
  return { ...(keyboard || {}), inline_keyboard: rows };
}

export async function withAdminGitHubUserStatuses(env, keyboard) {
  const rows = Array.isArray(keyboard?.inline_keyboard)
    ? keyboard.inline_keyboard.map((row) => Array.isArray(row) ? row.map((button) => ({ ...button })) : [])
    : [];
  return { ...(keyboard || {}), inline_keyboard: rows };
}

export async function withAdminGitHubUserDetails(env, userId, text) {
  await ensureGitHubTables(env);
  const row = await env.DB.prepare(
    "SELECT github_login, selected_repo_full_name, connected_at FROM github_connections WHERE user_id = ?",
  ).bind(String(userId)).first();

  const lines = [String(text || ""), "", "🐙 <b>GitHub</b>"];
  if (!row) {
    lines.push("Status: <b>❌ Not connected</b>");
    return lines.join("\n");
  }
  lines.push(
    "Status: <b>✅ Connected</b>",
    "Account: <b>@" + escapeHtml(row.github_login || "GitHub") + "</b>",
    "Selected repo: <code>" + escapeHtml(row.selected_repo_full_name || "None") + "</code>",
    "Connected: <b>" + escapeHtml(formatTehranTime(row.connected_at)) + "</b>",
  );
  return lines.join("\n");
}

export async function adminGitHubUsersView(env, page = 0) {
  await ensureGitHubTables(env);
  const safePage = Math.max(0, Math.floor(Number(page) || 0));
  const offset = safePage * ADMIN_GITHUB_USERS_PER_PAGE;
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM github_connections c INNER JOIN bot_users b ON b.user_id = c.user_id",
  ).first();
  const result = await env.DB.prepare(
    "SELECT c.user_id, c.github_login, c.selected_repo_full_name, c.connected_at, c.updated_at, " +
      "b.username, b.first_name, b.last_name, b.last_seen_at " +
      "FROM github_connections c INNER JOIN bot_users b ON b.user_id = c.user_id " +
      "ORDER BY datetime(c.updated_at) DESC LIMIT ? OFFSET ?",
  ).bind(ADMIN_GITHUB_USERS_PER_PAGE, offset).all();
  const total = Math.max(0, Number(countRow?.total || 0));
  const users = result.results || [];

  const text = [
    "🐙 <b>GitHub Connections</b>",
    "",
    "Connected users: <b>" + formatNumber(total) + "</b>",
    "Page: <b>" + formatNumber(safePage + 1) + "</b>",
    "",
    users.length ? "Select a user to see their GitHub repositories:" : "No GitHub connections yet.",
  ].join("\n");

  const rows = users.map((user) => [{
    text: userLabel(user) + " • @" + String(user.github_login || "GitHub"),
    callback_data: "admin_github_user:" + user.user_id + ":" + safePage + ":0",
  }]);
  const nav = [];
  if (safePage > 0) nav.push({ text: "← Prev", callback_data: "admin_github_users:" + (safePage - 1) });
  if ((safePage + 1) * ADMIN_GITHUB_USERS_PER_PAGE < total) {
    nav.push({ text: "Next →", callback_data: "admin_github_users:" + (safePage + 1) });
  }
  if (nav.length) rows.push(nav);
  rows.push([{ text: "← Back", callback_data: "admin_main" }]);
  return { text, keyboard: { inline_keyboard: rows } };
}

export async function adminGitHubUserView(env, userId, usersPage = 0, repoPage = 0) {
  await ensureGitHubTables(env);
  const user = await env.DB.prepare(
    "SELECT c.user_id, c.github_login, c.selected_repo_full_name, c.connected_at, c.updated_at, " +
      "b.username, b.first_name, b.last_name " +
      "FROM github_connections c LEFT JOIN bot_users b ON b.user_id = c.user_id WHERE c.user_id = ?",
  ).bind(String(userId)).first();

  if (!user) {
    return {
      text: "🐙 <b>GitHub Connection</b>\n\nThis user is not connected to GitHub.",
      keyboard: { inline_keyboard: [[{ text: "← GitHub Users", callback_data: "admin_github_users:" + Math.max(0, Number(usersPage) || 0) }]] },
    };
  }

  const repositories = await listAccessibleGitHubRepositories(env, userId);
  const safeRepoPage = Math.max(0, Math.floor(Number(repoPage) || 0));
  const start = safeRepoPage * ADMIN_GITHUB_REPOS_PER_PAGE;
  const pageRepos = repositories.slice(start, start + ADMIN_GITHUB_REPOS_PER_PAGE);
  const totalRepoPages = Math.max(1, Math.ceil(repositories.length / ADMIN_GITHUB_REPOS_PER_PAGE));
  const lines = [
    "🐙 <b>GitHub Connection</b>",
    "",
    "User: <b>" + escapeHtml(userLabel(user)) + "</b>",
    "Telegram ID: <code>" + escapeHtml(user.user_id) + "</code>",
    "GitHub: <b>@" + escapeHtml(user.github_login || "GitHub") + "</b>",
    "Connected: <b>" + escapeHtml(formatTehranTime(user.connected_at)) + "</b>",
    "Selected repo: <code>" + escapeHtml(user.selected_repo_full_name || "None") + "</code>",
    "",
    "Accessible repositories: <b>" + formatNumber(repositories.length) + "</b>",
    "Repo page: <b>" + formatNumber(Math.min(safeRepoPage + 1, totalRepoPages)) + "/" + formatNumber(totalRepoPages) + "</b>",
  ];
  if (!pageRepos.length) {
    lines.push("", "No accessible repositories were returned by GitHub.");
  } else {
    pageRepos.forEach((repo, index) => {
      lines.push(
        "",
        formatNumber(start + index + 1) + ". <code>" + escapeHtml(repo.fullName) + "</code>" +
          (repo.private ? " · 🔒 private" : " · public") +
          (String(repo.fullName) === String(user.selected_repo_full_name) ? " · ✅ selected" : ""),
      );
    });
  }

  const rows = [];
  const repoNav = [];
  if (safeRepoPage > 0) {
    repoNav.push({
      text: "← Repos",
      callback_data: "admin_github_user:" + user.user_id + ":" + Math.max(0, Number(usersPage) || 0) + ":" + (safeRepoPage - 1),
    });
  }
  if ((safeRepoPage + 1) * ADMIN_GITHUB_REPOS_PER_PAGE < repositories.length) {
    repoNav.push({
      text: "Repos →",
      callback_data: "admin_github_user:" + user.user_id + ":" + Math.max(0, Number(usersPage) || 0) + ":" + (safeRepoPage + 1),
    });
  }
  if (repoNav.length) rows.push(repoNav);
  rows.push([{ text: "👤 Open User", callback_data: "admin_user:" + user.user_id + ":0" }]);
  rows.push([
    { text: "← GitHub Users", callback_data: "admin_github_users:" + Math.max(0, Number(usersPage) || 0) },
    { text: "← Back", callback_data: "admin_main" },
  ]);

  return { text: lines.join("\n"), keyboard: { inline_keyboard: rows } };
}

function userLabel(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  const username = user?.username ? "@" + user.username : "";
  return name || username || String(user?.user_id || "User");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatTehranTime(value) {
  if (!value) return "-";
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date) + " Tehran";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
