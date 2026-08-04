import { tgJson } from "../telegram-api.js";
import {
  DEFAULT_OAUTH_SCOPES,
  MCP_PATH,
} from "./constants.js";
import {
  claimApprovedLoginSession,
  cleanupOauthStorage,
  completeLoginSession,
  createAuthorizationCode,
  createLoginSession,
  getLoginSessionForBrowser,
  getOauthClient,
  isExpired,
  registerOauthClient,
  releaseLoginSessionClaim,
} from "./oauth-storage.js";
import {
  jsonResponse,
  oauthError,
  readBody,
} from "./http.js";
import { renderTelegramLoginPage } from "./oauth-login-page.js";

export async function handleClientRegistration(request, env) {
  const body = await readBody(request);
  const redirectUris = normalizeRedirectUris(body.redirect_uris);

  if (!redirectUris.length) {
    return oauthError(
      "invalid_client_metadata",
      "At least one valid HTTPS redirect URI is required.",
    );
  }

  const requestedAuthMethod = String(
    body.token_endpoint_auth_method || "none",
  );
  if (requestedAuthMethod !== "none") {
    return oauthError(
      "invalid_client_metadata",
      "This authorization server accepts public clients with PKCE.",
    );
  }

  const client = await registerOauthClient(env, {
    clientName: cleanOptionalText(body.client_name, 120),
    redirectUris,
  });

  return jsonResponse(
    {
      client_id: client.clientId,
      client_id_issued_at: client.clientIdIssuedAt,
      client_name: cleanOptionalText(body.client_name, 120) || undefined,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export async function handleAuthorizationRequest(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const responseType = url.searchParams.get("response_type");
  const clientId = String(url.searchParams.get("client_id") || "");
  const redirectUri = String(url.searchParams.get("redirect_uri") || "");
  const state = String(url.searchParams.get("state") || "");
  const codeChallenge = String(url.searchParams.get("code_challenge") || "");
  const codeChallengeMethod = String(
    url.searchParams.get("code_challenge_method") || "",
  );
  const resource = String(url.searchParams.get("resource") || "");

  if (responseType !== "code") {
    return oauthError(
      "unsupported_response_type",
      "Only the authorization code flow is supported.",
    );
  }

  const client = await getOauthClient(env, clientId);
  if (!client) {
    return oauthError("invalid_client", "The OAuth client is not registered.", 401);
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return oauthError(
      "invalid_request",
      "The redirect URI does not match the registered client.",
    );
  }

  if (!state || state.length > 2048) {
    return oauthError("invalid_request", "A valid state parameter is required.");
  }

  if (
    codeChallengeMethod !== "S256" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  ) {
    return oauthError(
      "invalid_request",
      "PKCE with the S256 code challenge method is required.",
    );
  }

  const expectedResource = canonicalResource(origin);
  if (resource !== expectedResource) {
    return oauthError(
      "invalid_target",
      "The resource parameter does not match this MCP server.",
    );
  }

  const requestedScopes = normalizeScopes(url.searchParams.get("scope"));
  if (!requestedScopes.ok) {
    return oauthError("invalid_scope", requestedScopes.description);
  }

  const botUsername = await resolveTelegramBotUsername(env);
  if (!botUsername) {
    return oauthError(
      "temporarily_unavailable",
      "Telegram login is not configured.",
      503,
    );
  }

  const session = await createLoginSession(env, {
    clientId,
    redirectUri,
    state,
    scope: requestedScopes.scopes.join(" "),
    resource,
    codeChallenge,
  });

  cleanupOauthStorage(env).catch(() => null);

  return renderTelegramLoginPage({
    botUsername,
    sessionId: session.sessionId,
    browserSecret: session.browserSecret,
    expiresAt: session.expiresAt,
    scopes: requestedScopes.scopes,
  });
}

export async function handleTelegramStatus(request, env) {
  const body = await readBody(request);
  const sessionId = String(body.session_id || "");
  const browserSecret = String(body.browser_secret || "");

  if (!sessionId || !browserSecret) {
    return oauthError("invalid_request", "The login session is missing.");
  }

  const session = await getLoginSessionForBrowser(
    env,
    sessionId,
    browserSecret,
  );

  if (!session) {
    return oauthError("invalid_request", "The login session is invalid.", 401);
  }

  if (isExpired(session.expiresAt) || session.status === "expired") {
    return jsonResponse({ status: "expired" }, 410);
  }

  if (session.status === "pending") {
    return jsonResponse({ status: "pending" });
  }

  if (session.status === "completed" && session.completionUrl) {
    return jsonResponse({
      status: "approved",
      redirect_url: session.completionUrl,
    });
  }

  if (session.status === "completing") {
    return jsonResponse({ status: "pending" });
  }

  if (session.status !== "approved" || !session.telegramUserId) {
    return jsonResponse({ status: "invalid" }, 409);
  }

  const claimed = await claimApprovedLoginSession(env, session.sessionIdHash);
  if (!claimed) {
    return jsonResponse({ status: "pending" });
  }

  try {
    const code = await createAuthorizationCode(env, session);
    const redirectUrl = new URL(session.redirectUri);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", session.state);

    await completeLoginSession(
      env,
      session.sessionIdHash,
      redirectUrl.toString(),
    );

    return jsonResponse({
      status: "approved",
      redirect_url: redirectUrl.toString(),
    });
  } catch (error) {
    await releaseLoginSessionClaim(env, session.sessionIdHash).catch(() => null);
    throw error;
  }
}

async function resolveTelegramBotUsername(env) {
  const configured = String(env.TELEGRAM_BOT_USERNAME || "")
    .trim()
    .replace(/^@/, "");

  if (/^[A-Za-z0-9_]{5,32}$/.test(configured)) {
    return configured;
  }

  try {
    const bot = await tgJson(env, "getMe");
    const username = String(bot?.username || "").trim();
    return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : "";
  } catch {
    return "";
  }
}

function canonicalResource(origin) {
  return String(origin).replace(/\/$/, "") + MCP_PATH;
}

function normalizeRedirectUris(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set();

  for (const item of value.slice(0, 10)) {
    const raw = String(item || "").trim();
    if (!raw || raw.length > 2048) {
      continue;
    }

    try {
      const url = new URL(raw);
      const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
        url.hostname,
      );

      if (url.hash || (url.protocol !== "https:" && !isLocalhost)) {
        continue;
      }

      unique.add(url.toString());
    } catch {
      continue;
    }
  }

  return [...unique];
}

function normalizeScopes(value) {
  const raw = String(value || "").trim();
  const requested = raw ? parseScopes(raw) : [...DEFAULT_OAUTH_SCOPES];
  const allowed = new Set(DEFAULT_OAUTH_SCOPES);

  if (!requested.length || requested.some((scope) => !allowed.has(scope))) {
    return {
      ok: false,
      description: "One or more requested scopes are not supported.",
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

function cleanOptionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}
