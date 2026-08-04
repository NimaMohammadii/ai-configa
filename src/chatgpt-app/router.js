import {
  AUDIO_PATH_PREFIX,
  AUTHORIZATION_SERVER_METADATA_PATH,
  MCP_PATH,
  OAUTH_PATH_PREFIX,
  PROTECTED_RESOURCE_MCP_PATH,
  PROTECTED_RESOURCE_PATH,
} from "./constants.js";
import {
  handleChatGptAudioRequest,
  isChatGptAudioRequest,
} from "./audio-storage.js";
import { emptyResponse, jsonResponse } from "./http.js";
import { handleMcpRequest } from "./mcp.js";
import {
  handleOauthOrMetadataRequest,
  isOauthOrMetadataRequest,
} from "./oauth.js";

export function isChatGptAppRequest(request) {
  const pathname = new URL(request.url).pathname;

  return pathname === MCP_PATH ||
    pathname === PROTECTED_RESOURCE_PATH ||
    pathname === PROTECTED_RESOURCE_MCP_PATH ||
    pathname === AUTHORIZATION_SERVER_METADATA_PATH ||
    pathname.startsWith(OAUTH_PATH_PREFIX) ||
    pathname.startsWith(AUDIO_PATH_PREFIX);
}

export async function handleChatGptAppRequest(request, env) {
  if (request.method === "OPTIONS") {
    return emptyResponse(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": [
        "Authorization",
        "Content-Type",
        "MCP-Protocol-Version",
      ].join(", "),
      "Access-Control-Max-Age": "600",
    });
  }

  try {
    if (isOauthOrMetadataRequest(request)) {
      return await handleOauthOrMetadataRequest(request, env);
    }

    if (isChatGptAudioRequest(request)) {
      return await handleChatGptAudioRequest(request, env);
    }

    if (new URL(request.url).pathname === MCP_PATH) {
      return await handleMcpRequest(request, env);
    }

    return jsonResponse({ error: "not_found" }, 404);
  } catch (error) {
    console.error("chatgpt app request failed", error?.stack || error);

    return jsonResponse(
      {
        error: "internal_error",
        error_description: "The ChatGPT app request could not be completed.",
      },
      500,
    );
  }
}
