import { MCP_PATH } from "./constants.js";
import { constantTimeEqual, sha256Base64Url } from "./crypto.js";
import {
  consumeAuthorizationCode,
  createTokenPair,
  getAuthorizationCode,
  getOauthClient,
  getRefreshTokenRecord,
  isExpired,
  revokeTokenRecord,
} from "./oauth-storage.js";
import { jsonResponse, oauthError, readBody } from "./http.js";

export async function handleTokenRequest(request, env) {
  const body = await readBody(request);
  const grantType = String(body.grant_type || "");

  if (grantType === "authorization_code") {
    return await exchangeAuthorizationCode(request, env, body);
  }

  if (grantType === "refresh_token") {
    return await exchangeRefreshToken(request, env, body);
  }

  return oauthError(
    "unsupported_grant_type",
    "Only authorization_code and refresh_token grants are supported.",
  );
}

async function exchangeAuthorizationCode(request, env, body) {
  const clientId = String(body.client_id || "");
  const code = String(body.code || "");
  const redirectUri = String(body.redirect_uri || "");
  const codeVerifier = String(body.code_verifier || "");
  const resource = String(body.resource || "");
  const expectedResource = canonicalResource(new URL(request.url).origin);

  const client = await getOauthClient(env, clientId);
  if (!client) {
    return oauthError("invalid_client", "The OAuth client is not registered.", 401);
  }

  if (!code || !codeVerifier) {
    return oauthError(
      "invalid_request",
      "The authorization code and PKCE verifier are required.",
    );
  }

  if (resource !== expectedResource) {
    return oauthError(
      "invalid_target",
      "The resource parameter does not match this MCP server.",
    );
  }

  const authorizationCode = await getAuthorizationCode(env, code);
  if (
    !authorizationCode ||
    authorizationCode.usedAt ||
    isExpired(authorizationCode.expiresAt)
  ) {
    return oauthError(
      "invalid_grant",
      "The authorization code is invalid or expired.",
    );
  }

  if (
    authorizationCode.clientId !== clientId ||
    authorizationCode.redirectUri !== redirectUri ||
    authorizationCode.resource !== resource
  ) {
    return oauthError(
      "invalid_grant",
      "The authorization code does not match this request.",
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return oauthError(
      "invalid_grant",
      "The redirect URI is not registered for this client.",
    );
  }

  if (authorizationCode.codeChallengeMethod !== "S256") {
    return oauthError("invalid_grant", "The PKCE method is invalid.");
  }

  const calculatedChallenge = await sha256Base64Url(codeVerifier);
  if (!constantTimeEqual(calculatedChallenge, authorizationCode.codeChallenge)) {
    return oauthError("invalid_grant", "The PKCE verifier is invalid.");
  }

  const consumed = await consumeAuthorizationCode(
    env,
    authorizationCode.codeHash,
  );
  if (!consumed) {
    return oauthError("invalid_grant", "The authorization code was already used.");
  }

  const pair = await createTokenPair(env, {
    clientId,
    userId: authorizationCode.userId,
    scope: authorizationCode.scope,
    resource: authorizationCode.resource,
  });

  return tokenResponse(pair, authorizationCode.scope);
}

async function exchangeRefreshToken(request, env, body) {
  const clientId = String(body.client_id || "");
  const refreshToken = String(body.refresh_token || "");
  const resource = String(body.resource || "");
  const expectedResource = canonicalResource(new URL(request.url).origin);

  const client = await getOauthClient(env, clientId);
  if (!client) {
    return oauthError("invalid_client", "The OAuth client is not registered.", 401);
  }

  if (!refreshToken) {
    return oauthError("invalid_request", "A refresh token is required.");
  }

  if (resource !== expectedResource) {
    return oauthError(
      "invalid_target",
      "The resource parameter does not match this MCP server.",
    );
  }

  const record = await getRefreshTokenRecord(env, refreshToken);
  if (
    !record ||
    record.revokedAt ||
    isExpired(record.refreshExpiresAt) ||
    record.clientId !== clientId ||
    record.resource !== resource
  ) {
    return oauthError("invalid_grant", "The refresh token is invalid or expired.");
  }

  const requestedScopes = normalizeRefreshScopes(body.scope, record.scope);
  if (!requestedScopes.ok) {
    return oauthError("invalid_scope", requestedScopes.description);
  }

  const revoked = await revokeTokenRecord(env, record.id);
  if (!revoked) {
    return oauthError("invalid_grant", "The refresh token was already used.");
  }

  const pair = await createTokenPair(env, {
    clientId,
    userId: record.userId,
    scope: requestedScopes.scopes.join(" "),
    resource: record.resource,
  });

  return tokenResponse(pair, requestedScopes.scopes.join(" "));
}

function tokenResponse(pair, scope) {
  return jsonResponse({
    access_token: pair.accessToken,
    token_type: "Bearer",
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope,
  });
}

function canonicalResource(origin) {
  return String(origin).replace(/\/$/, "") + MCP_PATH;
}

function normalizeRefreshScopes(value, originalScope) {
  const original = parseScopes(originalScope);
  const requested = String(value || "").trim()
    ? parseScopes(value)
    : original;
  const originalSet = new Set(original);

  if (!requested.length || requested.some((scope) => !originalSet.has(scope))) {
    return {
      ok: false,
      description: "The requested scope exceeds the original grant.",
    };
  }

  return {
    ok: true,
    scopes: [...new Set(requested)],
  };
}

function parseScopes(value) {
  return String(value || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
