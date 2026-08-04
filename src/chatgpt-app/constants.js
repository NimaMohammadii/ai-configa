export const CHATGPT_APP_NAME = "Vexa Voice";
export const CHATGPT_APP_VERSION = "1.0.0";

export const MCP_PATH = "/mcp";
export const AUDIO_PATH_PREFIX = "/chatgpt/audio/";
export const OAUTH_PATH_PREFIX = "/oauth/";

export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const PROTECTED_RESOURCE_MCP_PATH = "/.well-known/oauth-protected-resource/mcp";
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

export const OAUTH_SCOPES = Object.freeze({
  read: "tts:read",
  generate: "tts:generate",
});

export const DEFAULT_OAUTH_SCOPES = Object.freeze([
  OAUTH_SCOPES.read,
  OAUTH_SCOPES.generate,
]);

export const LOGIN_SESSION_TTL_SECONDS = 10 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUDIO_LINK_TTL_SECONDS = 24 * 60 * 60;

export const MAX_TTS_CHARACTERS = 5000;
export const MAX_HISTORY_ITEMS = 20;

export const VOICE_RESULT_RESOURCE_URI = "ui://vexa/voice-result-v1.html";
export const VOICE_RESULT_RESOURCE_MIME = "text/html;profile=mcp-app";
