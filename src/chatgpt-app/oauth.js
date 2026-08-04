import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  DEFAULT_OAUTH_SCOPES,
  MCP_PATH,
  PROTECTED_RESOURCE_MCP_PATH,
  PROTECTED_RESOURCE_PATH,
} from "./constants.js";
import { getAccessTokenRecord, isExpired } from "./oauth-storage.js";
import { jsonResponse, methodNotAllowed } from "./http.js";
import {
  handleAuthorizationRequest,
  handleClientRegistration,
  handleTelegramStatus,
} from "./oauth-authorization.js";
import { handleTokenRequest } from "./oauth-token.js";

const AUTHORIZATION_PATH = "/oauth/authorize";
const TOKEN_PATH = "/oauth/token";
const REGISTRATION_PATH = "/oauth/register";
const TELEGRAM_STATUS_PATH = "/oauth/telegram/status";

export function isOauthOrMetadataRequest(request) {
  const pathname = new URL(request.url).pathname;

  return pathname === PROTECTED_RESOURCE_PATH ||
    pathname === PROTECTED_RESOURCE_MCP_PATH ||
    pathname === AUTHORIZATION_SERVER_METADATA_PATH ||
    pathname === AUTHORIZATION_PATH ||
    pathname === TOKEN_PATH ||
    pathname === REGISTRATION_PATH ||
    pathname === TELEGRAM_STATUS_PATH;
}

export async function handleOauthOrMetadataRequest(request, env) {
  const url = new URL(request.url);

  if (
    url.pathname === PROTECTED_RESOURCE_PATH ||
    url.pathname === PROTECTED_RESOURCE_MCP_PATH
  ) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return protectedResourceMetadata(request);
  }

  if (url.pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return authorizationServerMetadata(request);
  }

  if (url.pathname === REGISTRATION_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    return await handleClientRegistration(request, env);
  }

  if (url.pathname === AUTHORIZATION_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return await handleAuthorizationRequest(request, env);
  }

  if (url.pathname === TELEGRAM_STATUS_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    return await handleTelegramStatus(request, env);
  }

  if (url.pathname === TOKEN_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    return await handleTokenRequest(request, env);
  }

  return jsonResponse({ error: "not_found" }, 404);
}

export function protectedResourceMetadata(request) {
  const origin = new URL(request.url).origin;
  const resource = canonicalResource(origin);

  return jsonResponse({
    resource,
    authorization_servers: [origin],
    scopes_supported: [...DEFAULT_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: origin + "/",
  });
}

export function authorizationServerMetadata(request) {
  const origin = new URL(request.url).origin;

  return jsonResponse({
    issuer: origin,
    authorization_endpoint: origin + AUTHORIZATION_PATH,
    token_endpoint: origin + TOKEN_PATH,
    registration_endpoint: origin + REGISTRATION_PATH,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...DEFAULT_OAUTH_SCOPES],
  });
}

export async function authenticateAccessTokenWithEnv(request, env) {
  const authorization = String(request.headers.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    return {
      ok: false,
      error: "invalid_token",
      description: "No access token was provided.",
    };
  }

  const record = await getAccessTokenRecord(env, match[1]);
  if (!record) {
    return {
      ok: false,
      error: "invalid_token",
      description: "The access token is invalid.",
    };
  }

  return validateAccessTokenRecord(record, new URL(request.url).origin);
}

export function hasRequiredScopes(authentication, requiredScopes) {
  if (!authentication?.ok) {
    return false;
  }

  const available = new Set(authentication.scopes);
  return requiredScopes.every((scope) => available.has(scope));
}

export function buildWwwAuthenticate(
  origin,
  scopes,
  error = "invalid_token",
  description = "Connect your Telegram account to continue.",
) {
  const metadataUrl = origin + PROTECTED_RESOURCE_MCP_PATH;
  const scopeText = scopes.join(" ");

  return [
    "Bearer",
    `resource_metadata="${escapeHeaderValue(metadataUrl)}"`,
    `scope="${escapeHeaderValue(scopeText)}"`,
    `error="${escapeHeaderValue(error)}"`,
    `error_description="${escapeHeaderValue(description)}"`,
  ].join(", ");
}

export function authenticationRequiredToolResult(origin, scopes, authentication = null) {
  const error = authentication?.error || "invalid_token";
  const description = authentication?.description ||
    "Connect your Telegram account to continue.";
  const challenge = buildWwwAuthenticate(
    origin,
    scopes,
    error,
    description,
  );

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "Connect your Telegram account to use this voice tool.",
      },
    ],
    _meta: {
      "mcp/www_authenticate": [challenge],
    },
  };
}

function validateAccessTokenRecord(record, expectedOrigin) {
  if (record.revokedAt || isExpired(record.accessExpiresAt)) {
    return {
      ok: false,
      error: "invalid_token",
      description: "The access token has expired or was revoked.",
    };
  }

  const expectedResource = canonicalResource(expectedOrigin);
  if (record.resource !== expectedResource) {
    return {
      ok: false,
      error: "invalid_token",
      description: "The access token was issued for a different resource.",
    };
  }

  return {
    ok: true,
    clientId: record.clientId,
    userId: record.userId,
    scopes: parseScopes(record.scope),
    resource: record.resource,
  };
}

function canonicalResource(origin) {
  return String(origin).replace(/\/$/, "") + MCP_PATH;
}

function escapeHeaderValue(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[\r\n]/g, " ");
}

function parseScopes(value) {
  return String(value || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
