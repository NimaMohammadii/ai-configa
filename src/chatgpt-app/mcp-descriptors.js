import {
  OAUTH_SCOPES,
  VOICE_RESULT_RESOURCE_URI,
} from "./constants.js";
import { CHATGPT_TOOL_NAMES } from "./tools.js";

const READ_SECURITY_SCHEMES = Object.freeze([
  {
    type: "oauth2",
    scopes: [OAUTH_SCOPES.read],
  },
]);

const GENERATE_SECURITY_SCHEMES = Object.freeze([
  {
    type: "oauth2",
    scopes: [OAUTH_SCOPES.generate],
  },
]);

export function toolDescriptors() {
  return [
    {
      name: CHATGPT_TOOL_NAMES.listVoices,
      title: "List voices",
      description:
        "Use this when the user wants to browse available voices, see saved voices, or identify the currently selected voice.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          selected_voice: { type: "string" },
          saved_voices: {
            type: "array",
            items: { type: "string" },
          },
          voices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                selected: { type: "boolean" },
                saved: { type: "boolean" },
                available: { type: "boolean" },
              },
              required: ["name", "selected", "saved", "available"],
              additionalProperties: false,
            },
          },
        },
        required: ["selected_voice", "saved_voices", "voices"],
        additionalProperties: false,
      },
      securitySchemes: READ_SECURITY_SCHEMES,
      annotations: readOnlyAnnotations(),
      _meta: {
        securitySchemes: READ_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Loading voices…",
        "openai/toolInvocation/invoked": "Voices ready",
      },
    },
    {
      name: CHATGPT_TOOL_NAMES.getBalance,
      title: "Check voice balance",
      description:
        "Use this when the user asks how many voice credits remain or before a long voice generation.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          balance: { type: "integer", minimum: 0 },
          unit: { type: "string" },
        },
        required: ["balance", "unit"],
        additionalProperties: false,
      },
      securitySchemes: READ_SECURITY_SCHEMES,
      annotations: readOnlyAnnotations(),
      _meta: {
        securitySchemes: READ_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Checking balance…",
        "openai/toolInvocation/invoked": "Balance checked",
      },
    },
    {
      name: CHATGPT_TOOL_NAMES.getHistory,
      title: "Get voice history",
      description:
        "Use this when the user wants to review recent text-to-speech generations from their connected account.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 8,
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" },
                voice: { type: "string" },
                language: { type: "string" },
                credits: { type: "integer" },
                source: { type: "string" },
                created_at: { type: "string" },
                filename: { type: "string" },
                audio_url: {
                  anyOf: [
                    { type: "string", format: "uri" },
                    { type: "null" },
                  ],
                },
              },
              required: [
                "id",
                "text",
                "voice",
                "language",
                "credits",
                "source",
                "created_at",
                "filename",
                "audio_url",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
      securitySchemes: READ_SECURITY_SCHEMES,
      annotations: readOnlyAnnotations(),
      _meta: {
        securitySchemes: READ_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Loading voice history…",
        "openai/toolInvocation/invoked": "History ready",
      },
    },
    {
      name: CHATGPT_TOOL_NAMES.generateVoice,
      title: "Generate voice",
      description:
        "Convert user-provided text into an MP3 using a Vexa voice. Use list_voices first when the user has not chosen a voice.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            minLength: 1,
            maxLength: 5000,
            description: "The exact text to speak.",
          },
          voice: {
            type: "string",
            description:
              "Optional Vexa voice name. When omitted, the connected account's selected voice is used.",
          },
          language: {
            type: "string",
            description:
              "Optional language code such as fa, en, tr, ar, de, es, ru, hi, zh, or ja.",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          history_id: { type: "string" },
          text: { type: "string" },
          voice: { type: "string" },
          language: { type: "string" },
          characters: { type: "integer", minimum: 1 },
          credits_used: { type: "integer", minimum: 1 },
          balance: { type: "integer", minimum: 0 },
          filename: { type: "string" },
          audio_url: { type: "string", format: "uri" },
          mime_type: { type: "string" },
        },
        required: [
          "history_id",
          "text",
          "voice",
          "language",
          "characters",
          "credits_used",
          "balance",
          "filename",
          "audio_url",
          "mime_type",
        ],
        additionalProperties: false,
      },
      securitySchemes: GENERATE_SECURITY_SCHEMES,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false,
      },
      _meta: {
        securitySchemes: GENERATE_SECURITY_SCHEMES,
        ui: {
          resourceUri: VOICE_RESULT_RESOURCE_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": VOICE_RESULT_RESOURCE_URI,
        "openai/toolInvocation/invoking": "Generating voice…",
        "openai/toolInvocation/invoked": "Voice generated",
      },
    },
  ];
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  };
}
