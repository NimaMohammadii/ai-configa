import { requireDb } from "../state.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  LOGIN_SESSION_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./constants.js";
import { randomToken, sha256Hex } from "./crypto.js";

export async function registerOauthClient(env, metadata) {
  requireDb(env);

  const clientId = "vexa_" + randomToken(24);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO chatgpt_oauth_clients (" +
      "client_id, client_name, redirect_uris_json, grant_types_json, response_types_json, " +
      "token_endpoint_auth_method, created_at, updated_at" +
    ") VALUES (?, ?, ?, ?, ?, 'none', ?, ?)"
  ).bind(
    clientId,
    metadata.clientName || null,
    JSON.stringify(metadata.redirectUris),
    JSON.stringify(["authorization_code", "refresh_token"]),
    JSON.stringify(["code"]),
    now,
    now,
  ).run();

  return {
    clientId,
    clientIdIssuedAt: Math.floor(Date.now() / 1000),
  };
}

export async function getOauthClient(env, clientId) {
  requireDb(env);

  const row = await env.DB.prepare(
    "SELECT client_id, client_name, redirect_uris_json, token_endpoint_auth_method " +
    "FROM chatgpt_oauth_clients WHERE client_id = ?"
  ).bind(String(clientId || "")).first();

  if (!row) {
    return null;
  }

  return {
    clientId: String(row.client_id),
    clientName: row.client_name ? String(row.client_name) : null,
    redirectUris: parseStringArray(row.redirect_uris_json),
    tokenEndpointAuthMethod: String(row.token_endpoint_auth_method || "none"),
  };
}

export async function createLoginSession(env, input) {
  requireDb(env);

  const sessionId = randomToken(32);
  const browserSecret = randomToken(32);
  const sessionIdHash = await sha256Hex(sessionId);
  const browserSecretHash = await sha256Hex(browserSecret);
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + LOGIN_SESSION_TTL_SECONDS * 1000,
  );

  await env.DB.prepare(
    "INSERT INTO chatgpt_oauth_login_sessions (" +
      "session_id_hash, browser_secret_hash, client_id, redirect_uri, oauth_state, scope, resource, " +
      "code_challenge, code_challenge_method, status, created_at, expires_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'S256', 'pending', ?, ?)"
  ).bind(
    sessionIdHash,
    browserSecretHash,
    input.clientId,
    input.redirectUri,
    input.state,
    input.scope,
    input.resource,
    input.codeChallenge,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  ).run();

  return {
    sessionId,
    browserSecret,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function approveLoginSession(env, sessionId, telegramUserId) {
  requireDb(env);

  const sessionIdHash = await sha256Hex(sessionId);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT status, expires_at, telegram_user_id " +
    "FROM chatgpt_oauth_login_sessions WHERE session_id_hash = ?"
  ).bind(sessionIdHash).first();

  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (isExpired(row.expires_at)) {
    await env.DB.prepare(
      "UPDATE chatgpt_oauth_login_sessions SET status = 'expired' " +
      "WHERE session_id_hash = ? AND status IN ('pending', 'approved')"
    ).bind(sessionIdHash).run();

    return { ok: false, reason: "expired" };
  }

  if (String(row.status) === "completed") {
    if (String(row.telegram_user_id || "") === String(telegramUserId)) {
      return { ok: true, alreadyApproved: true };
    }

    return { ok: false, reason: "already_used" };
  }

  const result = await env.DB.prepare(
    "UPDATE chatgpt_oauth_login_sessions " +
    "SET telegram_user_id = ?, status = 'approved', approved_at = ? " +
    "WHERE session_id_hash = ? AND status = 'pending'"
  ).bind(
    String(telegramUserId),
    now,
    sessionIdHash,
  ).run();

  if (changedRows(result) > 0) {
    return { ok: true, alreadyApproved: false };
  }

  const current = await env.DB.prepare(
    "SELECT status, telegram_user_id FROM chatgpt_oauth_login_sessions WHERE session_id_hash = ?"
  ).bind(sessionIdHash).first();

  if (
    current &&
    ["approved", "completing", "completed"].includes(String(current.status)) &&
    String(current.telegram_user_id || "") === String(telegramUserId)
  ) {
    return { ok: true, alreadyApproved: true };
  }

  return { ok: false, reason: "already_used" };
}

export async function getLoginSessionForBrowser(env, sessionId, browserSecret) {
  requireDb(env);

  const sessionIdHash = await sha256Hex(sessionId);
  const browserSecretHash = await sha256Hex(browserSecret);

  const row = await env.DB.prepare(
    "SELECT session_id_hash, client_id, redirect_uri, oauth_state, scope, resource, " +
      "code_challenge, code_challenge_method, telegram_user_id, status, expires_at, completion_url " +
    "FROM chatgpt_oauth_login_sessions " +
    "WHERE session_id_hash = ? AND browser_secret_hash = ?"
  ).bind(
    sessionIdHash,
    browserSecretHash,
  ).first();

  return row ? normalizeLoginSession(row) : null;
}

export async function claimApprovedLoginSession(env, sessionIdHash) {
  requireDb(env);

  const result = await env.DB.prepare(
    "UPDATE chatgpt_oauth_login_sessions SET status = 'completing' " +
    "WHERE session_id_hash = ? AND status = 'approved'"
  ).bind(sessionIdHash).run();

  return changedRows(result) > 0;
}

export async function releaseLoginSessionClaim(env, sessionIdHash) {
  requireDb(env);

  await env.DB.prepare(
    "UPDATE chatgpt_oauth_login_sessions SET status = 'approved' " +
    "WHERE session_id_hash = ? AND status = 'completing'"
  ).bind(sessionIdHash).run();
}

export async function completeLoginSession(env, sessionIdHash, completionUrl) {
  requireDb(env);

  await env.DB.prepare(
    "UPDATE chatgpt_oauth_login_sessions " +
    "SET status = 'completed', completed_at = ?, completion_url = ? " +
    "WHERE session_id_hash = ? AND status = 'completing'"
  ).bind(
    new Date().toISOString(),
    String(completionUrl || ""),
    sessionIdHash,
  ).run();
}

export async function createAuthorizationCode(env, session) {
  requireDb(env);

  const code = randomToken(32);
  const codeHash = await sha256Hex(code);
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1000,
  );

  await env.DB.prepare(
    "INSERT INTO chatgpt_oauth_authorization_codes (" +
      "code_hash, client_id, user_id, redirect_uri, scope, resource, code_challenge, " +
      "code_challenge_method, created_at, expires_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    codeHash,
    session.clientId,
    session.telegramUserId,
    session.redirectUri,
    session.scope,
    session.resource,
    session.codeChallenge,
    session.codeChallengeMethod,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  ).run();

  return code;
}

export async function getAuthorizationCode(env, code) {
  requireDb(env);

  const codeHash = await sha256Hex(code);
  const row = await env.DB.prepare(
    "SELECT code_hash, client_id, user_id, redirect_uri, scope, resource, code_challenge, " +
      "code_challenge_method, expires_at, used_at " +
    "FROM chatgpt_oauth_authorization_codes WHERE code_hash = ?"
  ).bind(codeHash).first();

  if (!row) {
    return null;
  }

  return {
    codeHash: String(row.code_hash),
    clientId: String(row.client_id),
    userId: String(row.user_id),
    redirectUri: String(row.redirect_uri),
    scope: String(row.scope || ""),
    resource: String(row.resource || ""),
    codeChallenge: String(row.code_challenge || ""),
    codeChallengeMethod: String(row.code_challenge_method || ""),
    expiresAt: String(row.expires_at || ""),
    usedAt: row.used_at ? String(row.used_at) : null,
  };
}

export async function consumeAuthorizationCode(env, codeHash) {
  requireDb(env);

  const result = await env.DB.prepare(
    "UPDATE chatgpt_oauth_authorization_codes SET used_at = ? " +
    "WHERE code_hash = ? AND used_at IS NULL"
  ).bind(
    new Date().toISOString(),
    codeHash,
  ).run();

  return changedRows(result) > 0;
}

export async function createTokenPair(env, input) {
  requireDb(env);

  const accessToken = randomToken(40);
  const refreshToken = randomToken(48);
  const accessTokenHash = await sha256Hex(accessToken);
  const refreshTokenHash = await sha256Hex(refreshToken);
  const createdAt = new Date();
  const accessExpiresAt = new Date(
    createdAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000,
  );
  const refreshExpiresAt = new Date(
    createdAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  await env.DB.prepare(
    "INSERT INTO chatgpt_oauth_tokens (" +
      "id, client_id, user_id, scope, resource, access_token_hash, access_expires_at, " +
      "refresh_token_hash, refresh_expires_at, created_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    input.clientId,
    input.userId,
    input.scope,
    input.resource,
    accessTokenHash,
    accessExpiresAt.toISOString(),
    refreshTokenHash,
    refreshExpiresAt.toISOString(),
    createdAt.toISOString(),
  ).run();

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function getAccessTokenRecord(env, accessToken) {
  requireDb(env);

  const tokenHash = await sha256Hex(accessToken);
  const row = await env.DB.prepare(
    "SELECT id, client_id, user_id, scope, resource, access_expires_at, revoked_at " +
    "FROM chatgpt_oauth_tokens WHERE access_token_hash = ?"
  ).bind(tokenHash).first();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    clientId: String(row.client_id),
    userId: String(row.user_id),
    scope: String(row.scope || ""),
    resource: String(row.resource || ""),
    accessExpiresAt: String(row.access_expires_at || ""),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

export async function getRefreshTokenRecord(env, refreshToken) {
  requireDb(env);

  const tokenHash = await sha256Hex(refreshToken);
  const row = await env.DB.prepare(
    "SELECT id, client_id, user_id, scope, resource, refresh_expires_at, revoked_at " +
    "FROM chatgpt_oauth_tokens WHERE refresh_token_hash = ?"
  ).bind(tokenHash).first();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    clientId: String(row.client_id),
    userId: String(row.user_id),
    scope: String(row.scope || ""),
    resource: String(row.resource || ""),
    refreshExpiresAt: String(row.refresh_expires_at || ""),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

export async function revokeTokenRecord(env, tokenId) {
  requireDb(env);

  const result = await env.DB.prepare(
    "UPDATE chatgpt_oauth_tokens SET revoked_at = ? " +
    "WHERE id = ? AND revoked_at IS NULL"
  ).bind(
    new Date().toISOString(),
    String(tokenId),
  ).run();

  return changedRows(result) > 0;
}

export async function cleanupOauthStorage(env) {
  requireDb(env);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM chatgpt_oauth_login_sessions WHERE expires_at < ?"
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM chatgpt_oauth_authorization_codes " +
      "WHERE expires_at < ? OR used_at IS NOT NULL"
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM chatgpt_oauth_tokens " +
      "WHERE refresh_expires_at < ? OR revoked_at IS NOT NULL"
    ).bind(now),
  ]).catch(() => null);
}

export function isExpired(value) {
  const timestamp = Date.parse(String(value || ""));
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function normalizeLoginSession(row) {
  return {
    sessionIdHash: String(row.session_id_hash),
    clientId: String(row.client_id),
    redirectUri: String(row.redirect_uri),
    state: String(row.oauth_state || ""),
    scope: String(row.scope || ""),
    resource: String(row.resource || ""),
    codeChallenge: String(row.code_challenge || ""),
    codeChallengeMethod: String(row.code_challenge_method || ""),
    telegramUserId: row.telegram_user_id ? String(row.telegram_user_id) : null,
    status: String(row.status || "pending"),
    expiresAt: String(row.expires_at || ""),
    completionUrl: row.completion_url ? String(row.completion_url) : null,
  };
}

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}
