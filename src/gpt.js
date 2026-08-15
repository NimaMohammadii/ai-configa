import { normalizeAiChatModel, normalizeAiChatReasoningEffort } from "./ai-chat-model.js";
import { applyAiMemoryToolCall, buildAiMemoryInstructions, getAiMemoryTools, getUserAiMemory, isAiMemoryToolCall, selectRelevantAiMemories } from "./ai-memory.js";
import { buildGitHubAiInstructions, executeGitHubAiTool, getGitHubAiContext, getGitHubAiTools, isGitHubAiToolCall } from "./github-ai.js";
import { buildAiMcpInstructions, getAiMcpTools } from "./ai-mcp.js";
import { buildAiComputerInstructions, createAiComputerSession, getAiComputerTools, isAiComputerCall, isAiComputerFunctionCall } from "./ai-computer.js";
import {
  buildOpenAiAgentInstructions,
  executeOpenAiApplyPatchCalls,
  inspectOpenAiShellUsage,
  isOpenAiApplyPatchCall,
  prepareOpenAiAgentTools,
  prepareOpenAiToolReplayItems,
  refreshOpenAiCodingWorkspace,
  reuseOpenAiShellContainer,
} from "./openai-agent-tools.js";
import { VOICE_NAMES } from "./voices.js";
import { EMOTION_TAGS } from "./mini-app/emotion-tags.js";

const GPT_TIMEOUT_MS = 45000;
const GPT_CHAT_TIMEOUT_MS = 90000;
const GPT_CODING_TIMEOUT_MS = 45 * 60 * 1000;
const GPT_IMAGE_TIMEOUT_MS = 150000;
const GPT_MODEL = "gpt-5.6-terra";
const AI_CHAT_CONTEXT_WINDOW = 1050000;
const AI_CHAT_COMPACTION_THRESHOLD = 200000;
const AI_CHAT_RATE_LIMIT_MAX_RETRIES = 1;
const AI_CHAT_RATE_LIMIT_MAX_WAIT_MS = 60 * 1000;
const MAX_ENHANCE_CHARS = 5000;
const ADVANCED_CODING_TOOLS_TOOL = "enable_advanced_coding_tools";
const MEDIUM_ADVANCED_MIN_BASE_ACTIONS = 2;
const ADVANCED_CODING_CAPABILITIES = Object.freeze(["shell", "ci_review", "browser", "mcp"]);
const ADVANCED_GITHUB_TOOL_NAMES = new Set([
  "github_sync_task_branch",
  "github_read_ci",
  "github_read_ci_failure_logs",
  "github_review_branch",
]);
const AI_CHAT_EFFORT_PROFILES = Object.freeze({
  low: Object.freeze({
    verbosity: "low",
    maxAgentToolRounds: 5,
    maxCodingAgentToolRounds: 8,
    codingTimeoutMs: 5 * 60 * 1000,
    advancedTools: "base",
    automaticReview: false,
    multiAgent: false,
  }),
  medium: Object.freeze({
    verbosity: "medium",
    maxAgentToolRounds: 8,
    maxCodingAgentToolRounds: 24,
    codingTimeoutMs: 15 * 60 * 1000,
    advancedTools: "last_resort",
    automaticReview: false,
    multiAgent: false,
  }),
  high: Object.freeze({
    verbosity: "high",
    maxAgentToolRounds: 20,
    maxCodingAgentToolRounds: 90,
    codingTimeoutMs: GPT_CODING_TIMEOUT_MS,
    advancedTools: "full",
    automaticReview: true,
    multiAgent: true,
  }),
  max: Object.freeze({
    verbosity: "high",
    maxAgentToolRounds: 28,
    maxCodingAgentToolRounds: 120,
    codingTimeoutMs: GPT_CODING_TIMEOUT_MS,
    advancedTools: "full",
    automaticReview: true,
    multiAgent: true,
  }),
});
const AI_CHAT_PUBLIC_ERROR = "AI couldn't complete that request. Please try again.";
const AI_CHAT_PUBLIC_BUSY_ERROR = "AI is temporarily busy. Please try again later.";
const AI_CHAT_PUBLIC_UNAVAILABLE_ERROR = "AI service is temporarily unavailable. Please try again later.";
const AI_IMAGE_PUBLIC_ERROR = "AI image couldn't complete that request. Please try again.";

const AI_CHAT_AUDIO_TAGS = EMOTION_TAGS.map((item) => {
  const category = item[0];
  const tag = item[1];
  const description = item[2];
  return "[" + tag + "] (" + category + ": " + description + ")";
}).join("; ");

const ELEVENLABS_ENHANCE_PROMPT = "# Instructions\n## 1. Role and Goal\nYou are an AI assistant specializing in enhancing dialogue text for speech generation.\nYour **PRIMARY GOAL** is to dynamically integrate **audio tags** (e.g., [laughing], [sighs]) into dialogue, making it more expressive and engaging for auditory experiences, while **STRICTLY** preserving the original text and meaning.\nIt is imperative that you follow these system instructions to the fullest.\n## 2. Core Directives\nFollow these directives meticulously to ensure high-quality output.\n### Positive Imperatives (DO):\n* DO integrate **audio tags** from the \"Audio Tags\" list (or similar contextually appropriate **audio tags**) to add expression, emotion, and realism to the dialogue. These tags MUST describe something auditory.\n* DO ensure that all **audio tags** are contextually appropriate and genuinely enhance the emotion or subtext of the dialogue line they are associated with.\n* DO strive for a diverse range of emotional expressions (e.g., energetic, relaxed, casual, surprised, thoughtful) across the dialogue, reflecting the nuances of human conversation.\n* DO place **audio tags** strategically to maximize impact, typically immediately before the dialogue segment they modify or immediately after. (e.g., [annoyed] This is hard. or This is hard. [sighs]).\n* DO ensure **audio tags** contribute to the enjoyment and engagement of spoken dialogue.\n### Negative Imperatives (DO NOT):\n* DO NOT alter, add, or remove any words from the original dialogue text itself. Your role is to *prepend* **audio tags**, not to *edit* the speech. **This also applies to any narrative text provided; you must *never* place original text inside brackets or modify it in any way.**\n* DO NOT create **audio tags** from existing narrative descriptions. **Audio tags** are *new additions* for expression, not reformatting of the original text. (e.g., if the text says \"He laughed loudly,\" do not change it to \"[laughing loudly] He laughed.\" Instead, add a tag if appropriate, e.g., \"He laughed loudly [chuckles].\")\n* DO NOT use tags such as [standing], [grinning], [pacing], [music].\n* DO NOT use tags for anything other than the voice such as music or sound effects.\n* DO NOT invent new dialogue lines.\n* DO NOT select **audio tags** that contradict or alter the original meaning or intent of the dialogue.\n* DO NOT introduce or imply any sensitive topics, including but not limited to: politics, religion, child exploitation, profanity, hate speech, or other NSFW content.\n## 3. Workflow\n1. **Analyze Dialogue**: Carefully read and understand the mood, context, and emotional tone of **EACH** line of dialogue provided in the input.\n2. **Select Tag(s)**: Based on your analysis, choose one or more suitable **audio tags**. Ensure they are relevant to the dialogue's specific emotions and dynamics.\n3. **Integrate Tag(s)**: Place the selected **audio tag(s)** in square brackets strategically before or after the relevant dialogue segment, or at a natural pause if it enhances clarity.\n4. **Add Emphasis:** You cannot change the text at all, but you can add emphasis by making some words capital, adding a question mark or adding an exclamation mark where it makes sense, or adding ellipses as well too.\n5. **Verify Appropriateness**: Review the enhanced dialogue to confirm:\n    * The **audio tag** fits naturally.\n    * It enhances meaning without altering it.\n    * It adheres to all Core Directives.\n## 4. Output Format\n* Present ONLY the enhanced dialogue text in a conversational format.\n* **Audio tags** **MUST** be enclosed in square brackets (e.g., [laughing]).\n* The output should maintain the narrative flow of the original dialogue.\n## 5. Audio Tags (Non-Exhaustive)\nUse these as a guide. You can infer similar, contextually appropriate **audio tags**.\n**Directions:**\n* [happy]\n* [sad]\n* [excited]\n* [angry]\n* [whisper]\n* [annoyed]\n* [appalled]\n* [thoughtful]\n* [surprised]\n* *(and similar emotional/delivery directions)*\n**Non-verbal:**\n* [laughing]\n* [chuckles]\n* [sighs]\n* [clears throat]\n* [short pause]\n* [long pause]\n* [exhales sharply]\n* [inhales deeply]\n* *(and similar non-verbal sounds)*\n## 6. Examples of Enhancement\n**Input**:\n\"Are you serious? I can't believe you did that!\"\n**Enhanced Output**:\n\"[appalled] Are you serious? [sighs] I can't believe you did that!\"\n---\n**Input**:\n\"That's amazing, I didn't know you could sing!\"\n**Enhanced Output**:\n\"[laughing] That's amazing, [singing] I didn't know you could sing!\"\n---\n**Input**:\n\"I guess you're right. It's just... difficult.\"\n**Enhanced Output**:\n\"I guess you're right. [sighs] It's just... [muttering] difficult.\"\n# Instructions Summary\n1. Add audio tags from the audio tags list. These must describe something auditory but only for the voice.\n2. Enhance emphasis without altering meaning or text.\n3. Reply ONLY with the enhanced text.";

const GPT_IMAGE_MODEL = "gpt-image-2";
const GPT_IMAGE_SIZE = "1024x1024";
const GPT_IMAGE_QUALITY = "low";
const GPT_IMAGE_SIZES = new Set([
  "1024x1024",
  "1024x1280",
  "960x1344",
  "1152x1536",
  "1024x1536",
  "1152x2048",
  "768x1792",
  "1024x2048",
  "864x2592",
  "1280x1024",
  "1344x960",
  "1536x1152",
  "1536x1024",
  "2048x1152",
  "1792x768",
  "2048x1024",
  "2592x864",
]);
const MAX_IMAGE_PROMPT_CHARS = 2000;
const MAX_IMAGE_EDIT_INPUTS = 5;
const GPT_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_SPEECH_CHARS = 5000;
const GPT_CHAT_ATTACHMENT_MIME = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  xml: "text/xml",
  csv: "text/csv",
  tsv: "text/tsv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/x-typescript",
  tsx: "text/tsx",
  jsx: "text/jsx",
  py: "text/x-python",
  css: "text/css",
  sql: "text/x-sql",
  log: "text/plain",
  yaml: "text/x-yaml",
  yml: "text/x-yaml",
  toml: "application/toml",
  eml: "message/rfc822",
  ics: "text/calendar",
  srt: "application/x-subrip",
  vtt: "text/vtt",
});

export async function generateImage(env, prompt, options = {}) {
  if (!env.GPT_API) {
    throw new Error("GPT image service is not configured.");
  }

  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    throw new Error("Image prompt is empty.");
  }

  if (Array.from(cleanPrompt).length > MAX_IMAGE_PROMPT_CHARS) {
    throw new Error("Image prompt is too long. Please send a shorter prompt.");
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GPT_IMAGE_MODEL,
        prompt: cleanPrompt,
        size: resolveImageSize(options.size),
        quality: GPT_IMAGE_QUALITY,
        moderation: "low",
        output_format: "jpeg",
        output_compression: 90,
      }),
      signal: options.signal,
    },
    GPT_IMAGE_TIMEOUT_MS,
    "AI image generation took too long. Please try again with a simpler prompt.",
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyGptImageError(response.status, errorBody, response.headers));
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json || "";
  if (!b64) {
    throw new Error("AI did not return an image. Please try again.");
  }

  return base64ToArrayBuffer(b64);
}

export async function editImage(env, prompt, imageBuffer, filename = "telegram-image.jpg", mimeType = "image/jpeg", options = {}) {
  return editImages(env, prompt, [{ buffer: imageBuffer, filename, mimeType }], options);
}

export async function editImages(env, prompt, images, options = {}) {
  if (!env.GPT_API) {
    throw new Error("GPT service is not configured.");
  }

  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    throw new Error("Image edit prompt is empty.");
  }

  if (Array.from(cleanPrompt).length > MAX_IMAGE_PROMPT_CHARS) {
    throw new Error("Image prompt is too long. Please send a shorter prompt.");
  }

  const sources = Array.isArray(images) ? images.slice(0, MAX_IMAGE_EDIT_INPUTS) : [];
  if (!sources.length) {
    throw new Error("Add at least one source image.");
  }

  const form = new FormData();

  form.append("model", GPT_IMAGE_MODEL);
  form.append("prompt", cleanPrompt);
  for (const source of sources) {
    const imageBuffer = source?.buffer;
    if (!imageBuffer || !imageBuffer.byteLength) {
      throw new Error("One of the source images is empty.");
    }
    const uploadFilename = safeImageFilename(source.filename);
    const uploadMimeType = normalizeImageMimeType(source.mimeType, uploadFilename);
    form.append("image[]", new Blob([imageBuffer], { type: uploadMimeType }), uploadFilename);
  }
  form.append("size", resolveImageSize(options.size));
  form.append("quality", GPT_IMAGE_QUALITY);
  form.append("moderation", "low");
  form.append("output_format", "jpeg");
  form.append("output_compression", "90");

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/images/edits",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
      },
      body: form,
      signal: options.signal,
    },
    GPT_IMAGE_TIMEOUT_MS,
    "AI image editing took too long. Please try again with a simpler instruction.",
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyGptImageError(response.status, errorBody, response.headers));
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json || "";
  if (!b64) {
    throw new Error("AI did not return an edited image. Please try again.");
  }

  return base64ToArrayBuffer(b64);
}

function resolveImageSize(value) {
  const size = String(value || "").trim().toLowerCase();
  return GPT_IMAGE_SIZES.has(size) ? size : GPT_IMAGE_SIZE;
}

function safeImageFilename(value) {
  const filename = String(value || "telegram-image.jpg").split("/").pop();
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "telegram-image.jpg";
}

function normalizeImageMimeType(mimeType, filename) {
  const value = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") {
    return value;
  }

  const name = String(filename || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function enhanceTextWithEmotion(env, text, language = "en") {
  if (!env.GPT_API) {
    throw new Error("GPT service is not configured.");
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Text is empty.");
  }

  if (Array.from(cleanText).length > MAX_ENHANCE_CHARS) {
    throw new Error("Text is too long. Please send a shorter text.");
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.GPT_API,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(language) },
        { role: "user", content: cleanText },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyGptError(response.status, errorBody, response.headers));
  }

  const data = await response.json();
  const output = cleanEnhancedText(data?.choices?.[0]?.message?.content || "");
  return output && preservesOriginalSpeech(cleanText, output) ? output : cleanText;
}

function normalizeChatAttachment(raw) {
  if (!raw || typeof raw !== "object") return null;

  const name = Array.from(String(raw.name || "attachment").split(/[\\/]/).pop() || "attachment")
    .slice(0, 120)
    .join("");
  const extension = String(name.split(".").pop() || "").toLowerCase();
  const mimeType = GPT_CHAT_ATTACHMENT_MIME[extension];
  if (!mimeType) throw new Error("This file type is not supported.");

  const source = String(raw.dataUrl || "");
  if (source.length > Math.ceil(GPT_CHAT_ATTACHMENT_MAX_BYTES * 4 / 3) + 1024) {
    throw new Error("File is too large. Maximum size is 10 MB.");
  }
  const match = source.match(/^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("The uploaded file is invalid.");

  const payload = match[1];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor(payload.length * 3 / 4) - padding;
  if (byteLength <= 0 || byteLength > GPT_CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error("File is too large. Maximum size is 10 MB.");
  }

  return {
    name,
    kind: mimeType.startsWith("image/") ? "image" : "file",
    dataUrl: "data:" + mimeType + ";base64," + payload,
  };
}

function getAiChatEffortProfile(effort) {
  const normalized = normalizeAiChatReasoningEffort(effort);
  return AI_CHAT_EFFORT_PROFILES[normalized] || AI_CHAT_EFFORT_PROFILES.medium;
}

function selectGitHubToolsForCapabilities(tools, capabilities, fullAdvanced) {
  if (fullAdvanced) return Array.isArray(tools) ? tools.slice() : [];
  const ciReviewEnabled = capabilities instanceof Set && capabilities.has("ci_review");
  return (Array.isArray(tools) ? tools : []).filter((tool) => {
    const name = String(tool?.name || "");
    return !ADVANCED_GITHUB_TOOL_NAMES.has(name) || ciReviewEnabled;
  });
}

function buildImageGenerationTool(options = {}) {
  return {
    type: "function",
    name: "generate_image",
    description: "Generate one image with the app's image generator when the user explicitly asks to create an image.",
    ...(options.deferLoading ? { defer_loading: true } : {}),
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        size: { type: "string", enum: Array.from(GPT_IMAGE_SIZES) },
      },
      required: ["prompt", "size"],
      additionalProperties: false,
    },
    strict: true,
  };
}

function buildSpeechGenerationTool(preferredVoice, options = {}) {
  const selectedVoice = VOICE_NAMES.includes(preferredVoice) ? preferredVoice : "Nora";
  const description = options.deferredDetail
    ? [
        "Create spoken audio only when the user explicitly asks for text-to-speech, narration, dubbing, or a voice reading.",
        `The voice must be exactly ${selectedVoice}.`,
        "Pass only the text that should be spoken, without setup text, explanations, quotation marks, or Markdown.",
        "Preserve the user's spoken words. Preserve audio tags already supplied by the user and do not add random tags or overuse them.",
        "When the user requests a specific emotion, delivery, reaction, vocal sound, pacing, pause, accent, or performance, add only supported audio tags in square brackets where contextually appropriate.",
        "Supported audio tags: " + AI_CHAT_AUDIO_TAGS + ".",
      ].join(" ")
    : "Create spoken audio when the user asks for text-to-speech, narration, dubbing, or a voice reading. Add supported repository audio tags when the requested emotion, delivery, reaction, sound, pause, accent, or performance calls for them.";
  return {
    type: "function",
    name: "generate_speech",
    description,
    ...(options.deferLoading ? { defer_loading: true } : {}),
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The exact text to speak, without explanations or Markdown. Include only contextually requested supported audio tags in square brackets.",
        },
        voice: {
          type: "string",
          enum: [selectedVoice],
          description: "The exact voice currently selected in the user’s voice card.",
        },
      },
      required: ["text", "voice"],
      additionalProperties: false,
    },
    strict: true,
  };
}

function buildDeferredMediaNamespace(preferredVoice) {
  return {
    type: "namespace",
    name: "media",
    description: "Image and spoken-audio generation. Load only when the user explicitly asks to generate an image or create spoken audio.",
    tools: [
      buildImageGenerationTool({ deferLoading: true }),
      buildSpeechGenerationTool(preferredVoice, { deferLoading: true, deferredDetail: true }),
    ],
  };
}

function hasDeferredToolDefinitions(tools) {
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.defer_loading === true) return true;
    if (tool?.type === "namespace" && hasDeferredToolDefinitions(tool.tools)) return true;
  }
  return false;
}

function buildAdvancedCodingToolsGate(enabledCapabilities) {
  const enabled = enabledCapabilities instanceof Set ? enabledCapabilities : new Set();
  const remaining = ADVANCED_CODING_CAPABILITIES.filter((capability) => !enabled.has(capability));
  if (!remaining.length) return null;
  return {
    type: "function",
    name: ADVANCED_CODING_TOOLS_TOOL,
    description: "Medium-mode last resort. Enable exactly one advanced coding capability only after ordinary GitHub read/search/edit tools have been used and cannot safely provide the required evidence or validation.",
    parameters: {
      type: "object",
      properties: {
        capability: { type: "string", enum: remaining },
        reason: { type: "string", minLength: 20, maxLength: 500 },
      },
      required: ["capability", "reason"],
      additionalProperties: false,
    },
    strict: true,
  };
}

function isAdvancedCodingToolsCall(item) {
  return item?.type === "function_call" && item?.name === ADVANCED_CODING_TOOLS_TOOL;
}

function buildAiChatInstructions(preferredVoice, githubContext, memories, model, agentInstructions = "", mcpInstructions = "", runtimeInstructions = "", includeMediaInstructions = true) {
  const selectedVoice = VOICE_NAMES.includes(preferredVoice) ? preferredVoice : "Nora";
  const selectedModel = normalizeAiChatModel(model);
  const mediaInstructions = includeMediaInstructions ? [
    "Use the generate_speech tool only when the user clearly asks to create, read, narrate, dub, or convert text into spoken audio.",
    "Do not generate speech for ordinary questions, explanations, or messages that merely mention audio.",
    "Pass only the text that should be spoken. Do not include setup text, explanations, quotation marks, or Markdown.",
    "For speech requests, infer the exact emotion, delivery, reaction, sound, pacing, pause, accent, or performance requested by the user.",
    "Insert supported audio tags in square brackets directly into the speech text when the user explicitly requests that performance or when it is clearly required by their wording.",
    "Preserve audio tags already supplied by the user. Do not add random tags, do not overuse tags, and do not replace or rewrite the user’s spoken words merely to add expression.",
    "Use only tags from this complete repository catalog: " + AI_CHAT_AUDIO_TAGS + ".",
    "All 69 catalog tags are available; choose the most contextually accurate tag or combination of tags for the user’s request.",
    "Always use the user’s currently selected voice for speech: " + selectedVoice + ".",
    "Never choose a different voice inside AI Chat; the voice card is the single source of truth.",
  ] : [];
  return [
    "Your exact model identifier for this conversation is " + selectedModel + ". If the user asks which model you are, answer with this exact model identifier.",
    "Reply in the same language as the user's latest message.",
    "Answer naturally at the level of detail requested by the user; otherwise let the configured response verbosity control the default amount of detail.",
    "Use the format that best fits the request. Do not force every answer into the same paragraph, list, or template style.",
    ...mediaInstructions,
    "For web-search answers, do not add sources, citation links, raw URLs, or footnote markers unless the user asks for them.",
    "If subagents are used, keep them limited to independent read-only work. The root coordinator alone may make code writes, create or merge pull requests, apply branches to default, or perform other side-effecting actions.",
    agentInstructions,
    mcpInstructions,
    runtimeInstructions,
    buildGitHubAiInstructions(githubContext),
    buildAiMemoryInstructions(memories),
  ].filter(Boolean).join(" ");
}

async function buildAiChatSafetyIdentifier(userId) {
  const value = String(userId || "").trim();
  if (!value) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("vexa-ai-chat:" + value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeAiChatAbortError() {
  const error = new Error("AI request cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAiChatAborted(signal) {
  if (signal?.aborted) throw makeAiChatAbortError();
}

function pruneAiChatInputAfterCompaction(items) {
  if (!Array.isArray(items) || items.length < 2) return 0;
  let compactionIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.type === "compaction") {
      compactionIndex = index;
      break;
    }
  }
  if (compactionIndex <= 0) return 0;
  items.splice(0, compactionIndex);
  return compactionIndex;
}

function parseOpenAiDurationMs(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  let total = 0;
  let matched = false;
  for (const match of raw.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    matched = true;
    total += amount * (match[2] === "h" ? 3600000 : match[2] === "m" ? 60000 : match[2] === "s" ? 1000 : 1);
  }
  return matched ? Math.ceil(total) : 0;
}

function readOpenAiRateLimitHeaders(headers) {
  const retryAfter = String(headers?.get?.("retry-after") || "").trim();
  let retryAfterMs = parseOpenAiDurationMs(retryAfter);
  if (!retryAfterMs && retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) retryAfterMs = Math.max(0, retryAt - Date.now());
  }
  return {
    limitTokens: Math.max(0, Number(headers?.get?.("x-ratelimit-limit-tokens") || 0)),
    remainingTokens: Math.max(0, Number(headers?.get?.("x-ratelimit-remaining-tokens") || 0)),
    resetTokens: String(headers?.get?.("x-ratelimit-reset-tokens") || "").trim(),
    resetTokensMs: parseOpenAiDurationMs(headers?.get?.("x-ratelimit-reset-tokens")),
    retryAfter,
    retryAfterMs,
  };
}

function resolveOpenAiRateLimitWaitMs(headers, attempt) {
  const rateLimit = readOpenAiRateLimitHeaders(headers);
  const serverDelay = Math.max(rateLimit.retryAfterMs, rateLimit.resetTokensMs);
  const fallbackDelay = 5000 * (2 ** Math.max(0, Number(attempt || 0)));
  const waitMs = serverDelay > 0 ? serverDelay : fallbackDelay;
  if (waitMs <= 0 || waitMs > AI_CHAT_RATE_LIMIT_MAX_WAIT_MS) return 0;
  return Math.max(1000, Math.ceil(waitMs + 250));
}

function waitWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAiChatAbortError());
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
      reject(makeAiChatAbortError());
    };
    const timer = setTimeout(finish, Math.max(0, Number(ms || 0)));
    if (signal) signal.addEventListener("abort", abort, { once: true });
  });
}

async function fetchAiChatResponseWithRateLimitRetry(url, init, context = {}) {
  for (let attempt = 0; attempt <= AI_CHAT_RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    const errorBody = await response.text();
    const rateLimit = readOpenAiRateLimitHeaders(response.headers);
    const upstreamError = createAiChatUpstreamError(response.status, errorBody, {
      ...context,
      requestId: response.headers.get("x-request-id") || "",
      rateLimit,
    });
    if (response.status !== 429 || attempt >= AI_CHAT_RATE_LIMIT_MAX_RETRIES) throw upstreamError;
    const waitMs = resolveOpenAiRateLimitWaitMs(response.headers, attempt);
    if (!waitMs) throw upstreamError;
    console.warn("AI_CHAT_RATE_LIMIT_BACKOFF", {
      internalCode: upstreamError.internalCode,
      attempt: attempt + 1,
      waitMs,
      rateLimit,
    });
    await waitWithAbort(waitMs, init.signal);
  }
  throw new Error(AI_CHAT_PUBLIC_BUSY_ERROR);
}

export async function chatWithAi(env, messages, onStatus, options = {}) {
  if (!env.GPT_API) throw new Error("GPT service is not configured.");

  const cleanMessages = (Array.isArray(messages) ? messages : [])
    .slice(-20)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      return {
        role,
        content: Array.from(String(message?.content || "").trim()).slice(0, 4000).join(""),
        attachment: role === "user" ? normalizeChatAttachment(message?.attachment) : null,
        preferredVoice: role === "user" && VOICE_NAMES.includes(message?.preferredVoice)
          ? message.preferredVoice
          : "",
      };
    })
    .filter((message) => message.content || message.attachment);

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== "user") {
    throw new Error("Type a message first.");
  }
  const latestPreferredVoice = [...cleanMessages]
    .reverse()
    .find((message) => message.role === "user" && message.preferredVoice)
    ?.preferredVoice || "Nora";
  const totalCharacters = cleanMessages.reduce((total, message) => total + Array.from(message.content).length, 0);
  if (totalCharacters > 12000) throw new Error("This conversation is too long.");

  const inputMessages = cleanMessages.map((message) => {
    if (!message.attachment) return { role: message.role, content: message.content };
    const prompt = message.content || "Analyze this attachment.";
    if (message.attachment.kind === "image") {
      return {
        role: message.role,
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: message.attachment.dataUrl, detail: "auto" },
        ],
      };
    }
    return {
      role: message.role,
      content: [
        { type: "input_file", filename: message.attachment.name, file_data: message.attachment.dataUrl },
        { type: "input_text", text: prompt },
      ],
    };
  });

  const model = normalizeAiChatModel(options.model);
  const reasoningEffort = normalizeAiChatReasoningEffort(options.reasoningEffort);
  const effortProfile = getAiChatEffortProfile(reasoningEffort);
  const fullAdvanced = effortProfile.advancedTools === "full";
  const includeMediaInstructions = fullAdvanced;
  const advancedCapabilities = new Set(fullAdvanced ? ADVANCED_CODING_CAPABILITIES : []);
  const hasAdvancedCapability = (capability) => fullAdvanced || advancedCapabilities.has(capability);
  const safetyIdentifier = await buildAiChatSafetyIdentifier(options.userId);
  const githubContext = await getGitHubAiContext(env, options.userId);
  const fullGithubTools = getGitHubAiTools(githubContext);
  const fullMcpTools = getAiMcpTools(env);
  const fullComputerTools = getAiComputerTools(env);
  let githubTools = selectGitHubToolsForCapabilities(fullGithubTools, advancedCapabilities, fullAdvanced);
  let mcpTools = hasAdvancedCapability("mcp") ? fullMcpTools : [];
  let computerTools = hasAdvancedCapability("browser") ? fullComputerTools : [];
  const computerSession = createAiComputerSession(env);
  let openAiAgent = await prepareOpenAiAgentTools(env, options.userId, {
    attachment: cleanMessages[cleanMessages.length - 1]?.attachment || null,
    githubContext,
    reasoningEffort,
    shellEnabled: hasAdvancedCapability("shell"),
  });
  let openAiAgentInstructions = buildOpenAiAgentInstructions(openAiAgent, githubContext);
  let mcpInstructions = buildAiMcpInstructions(mcpTools);
  const codingActivity = githubContext ? {
    used: false,
    repository: githubContext.fullName,
    defaultBranch: githubContext.defaultBranch,
    currentBranch: "",
    currentCommitSha: String(openAiAgent.repositorySnapshot?.commitSha || ""),
    workspaceCommitSha: String(openAiAgent.repositorySnapshot?.commitSha || ""),
    model,
    reasoningEffort,
    contextWindow: AI_CHAT_CONTEXT_WINDOW,
    contextTokens: 0,
    filesRead: new Set(),
    events: [],
    change: null,
    pullRequest: null,
    merge: null,
    applied: null,
    lastCi: null,
    lastReview: null,
    needsReview: false,
    reviewCompleted: false,
  } : null;
  const memoryTools = getAiMemoryTools();
  let memoryEntries = await getUserAiMemory(env, options.userId);
  const memoryContextText = cleanMessages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n");
  let promptMemoryEntries = selectRelevantAiMemories(memoryEntries, memoryContextText);
  let memoryChanged = false;
  const requestSignal = options.signal && typeof options.signal.addEventListener === "function"
    ? options.signal
    : null;
  const controller = new AbortController();
  let requestAborted = false;
  let timedOut = false;
  const abortFromRequest = () => {
    requestAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };
  if (requestSignal) {
    if (requestSignal.aborted) abortFromRequest();
    else requestSignal.addEventListener("abort", abortFromRequest, { once: true });
  }
  const timer = setTimeout(
    () => {
      timedOut = true;
      if (!controller.signal.aborted) controller.abort();
    },
    githubContext
      ? effortProfile.codingTimeoutMs
      : reasoningEffort === "high" || reasoningEffort === "max"
        ? 300000
        : GPT_CHAT_TIMEOUT_MS,
  );

  try {
    throwIfAiChatAborted(controller.signal);
    const mediaTools = fullAdvanced
      ? [buildImageGenerationTool(), buildSpeechGenerationTool(latestPreferredVoice)]
      : [buildDeferredMediaNamespace(latestPreferredVoice)];
    const coreTools = [
      { type: "web_search" },
      ...mediaTools,
    ];
    let mediumBaseActionCount = 0;
    let mediumAdvancedEligible = false;
    const buildRuntimeTools = () => {
      const gate = reasoningEffort === "medium" && githubContext && mediumAdvancedEligible
        ? buildAdvancedCodingToolsGate(advancedCapabilities)
        : null;
      const delegatedTools = [
        ...openAiAgent.tools,
        ...githubTools,
        ...mcpTools,
        ...computerTools,
        ...memoryTools,
        ...(gate ? [gate] : []),
      ];
      const hasDeferredTools = hasDeferredToolDefinitions(coreTools) || hasDeferredToolDefinitions(delegatedTools);
      return [
        ...coreTools,
        ...(hasDeferredTools ? [{ type: "tool_search" }] : []),
        ...delegatedTools,
      ];
    };
    let tools = buildRuntimeTools();
    const responseInput = inputMessages.slice();
    let webSearchUsed = false;
    let webSearchCalls = 0;
    let fileSearchCalls = 0;
    let unidentifiedContainerSessions = 0;
    let activeShellContainerId = "";
    const shellContainerIds = new Set();
    const usage = [];
    let reviewRequested = false;
    let reviewedCommitSha = "";
    let multiAgentFallbackDisabled = false;
    const maxAgentToolRounds = githubContext
      ? effortProfile.maxCodingAgentToolRounds
      : effortProfile.maxAgentToolRounds;
    const resultOptions = () => ({
      webSearchUsed,
      webSearchCalls,
      fileSearchCalls,
      containerSessions: shellContainerIds.size + unidentifiedContainerSessions,
      vectorStorageGbDays: Math.max(0, Number(openAiAgent.vectorStorageGbDays || 0)),
      browserDurationMs: computerSession.usage().durationMs,
      usage,
      model,
      reasoningEffort,
      memoryChanged,
      memoryEntries,
      codingActivity,
    });

    const refreshWorkspaceIfNeeded = async () => {
      if (!codingActivity?.currentCommitSha || codingActivity.currentCommitSha === codingActivity.workspaceCommitSha) return;
      const snapshot = await refreshOpenAiCodingWorkspace(
        env,
        options.userId,
        tools,
        openAiAgent,
        codingActivity.currentCommitSha,
      );
      if (!snapshot) return;
      codingActivity.workspaceCommitSha = codingActivity.currentCommitSha;
      codingActivity.lastReview = null;
      codingActivity.reviewCompleted = false;
      activeShellContainerId = "";
      reviewRequested = false;
      reviewedCommitSha = "";
      if (Array.isArray(codingActivity.events)) {
        codingActivity.events.push({
          state: "analyzing_code",
          label: "Workspace refreshed",
          detail: codingActivity.currentCommitSha.slice(0, 12),
          at: Date.now(),
        });
      }
    };

    const updateMediumAdvancedEligibility = () => {
      if (reasoningEffort !== "medium" || !githubContext || mediumAdvancedEligible) return;
      const hasRepositoryEvidence = Boolean(
        (codingActivity?.filesRead instanceof Set && codingActivity.filesRead.size > 0)
        || codingActivity?.change
      );
      if (mediumBaseActionCount >= MEDIUM_ADVANCED_MIN_BASE_ACTIONS && hasRepositoryEvidence) {
        mediumAdvancedEligible = true;
        tools = buildRuntimeTools();
      }
    };

    const recordMediumBaseAction = (name) => {
      if (reasoningEffort !== "medium" || !githubContext) return;
      if (ADVANCED_GITHUB_TOOL_NAMES.has(String(name || ""))) return;
      mediumBaseActionCount += 1;
      updateMediumAdvancedEligibility();
    };

    const enableAdvancedCodingCapability = async (call) => {
      if (reasoningEffort !== "medium" || !githubContext) {
        return { ok: false, error: "Advanced coding escalation is only available in Medium coding mode." };
      }
      if (!mediumAdvancedEligible) {
        return { ok: false, error: "Use the ordinary GitHub tools first and gather repository evidence before requesting advanced tooling." };
      }
      let args = {};
      try { args = JSON.parse(String(call?.arguments || "{}")); } catch { args = {}; }
      const capability = String(args.capability || "").trim();
      const reason = String(args.reason || "").replace(/\s+/g, " ").trim();
      if (!ADVANCED_CODING_CAPABILITIES.includes(capability)) {
        return { ok: false, error: "Choose one supported advanced capability." };
      }
      if (reason.length < 20) {
        return { ok: false, error: "Explain the concrete evidence or validation gap before enabling an advanced capability." };
      }
      if (advancedCapabilities.has(capability)) {
        return { ok: true, alreadyEnabled: true, capability };
      }

      if (capability === "shell") {
        const previousAgent = openAiAgent;
        const previousUploadedFileId = String(previousAgent?.uploadedFileId || "").trim();
        const upgradedAgent = await prepareOpenAiAgentTools(env, options.userId, {
          attachment: null,
          githubContext,
          reasoningEffort,
          shellEnabled: true,
        });
        if (previousUploadedFileId && !upgradedAgent.uploadedFileId) {
          upgradedAgent.uploadedFileId = previousUploadedFileId;
        }
        upgradedAgent.runtimeInstructions = String(previousAgent?.runtimeInstructions || "");
        openAiAgent = upgradedAgent;
        advancedCapabilities.add("shell");
        openAiAgentInstructions = buildOpenAiAgentInstructions(openAiAgent, githubContext);
      } else if (capability === "ci_review") {
        advancedCapabilities.add("ci_review");
        githubTools = selectGitHubToolsForCapabilities(fullGithubTools, advancedCapabilities, false);
      } else if (capability === "browser") {
        advancedCapabilities.add("browser");
        computerTools = fullComputerTools;
      } else if (capability === "mcp") {
        advancedCapabilities.add("mcp");
        mcpTools = fullMcpTools;
        mcpInstructions = buildAiMcpInstructions(mcpTools);
      }
      tools = buildRuntimeTools();

      if (capability === "shell") {
        const targetCommitSha = String(
          codingActivity?.currentCommitSha || openAiAgent.repositorySnapshot?.commitSha || "",
        );
        if (
          /^[a-f0-9]{40}$/i.test(targetCommitSha)
          && String(openAiAgent.repositorySnapshot?.commitSha || "") !== targetCommitSha
        ) {
          const snapshot = await refreshOpenAiCodingWorkspace(
            env,
            options.userId,
            tools,
            openAiAgent,
            targetCommitSha,
          );
          if (snapshot && codingActivity) codingActivity.workspaceCommitSha = targetCommitSha;
        } else if (/^[a-f0-9]{40}$/i.test(targetCommitSha) && codingActivity) {
          codingActivity.workspaceCommitSha = targetCommitSha;
        }
      }
      if (codingActivity && Array.isArray(codingActivity.events)) {
        codingActivity.events.push({
          state: "analyzing_code",
          label: "Advanced capability enabled",
          detail: `${capability}: ${reason.slice(0, 140)}`,
          at: Date.now(),
        });
      }
      return { ok: true, capability };
    };

    for (let toolRound = 0; toolRound < maxAgentToolRounds; toolRound += 1) {
      throwIfAiChatAborted(controller.signal);
      const prunedItems = pruneAiChatInputAfterCompaction(responseInput);
      if (prunedItems > 0) {
        console.info("AI_CHAT_CONTEXT_COMPACTED", {
          round: toolRound + 1,
          prunedItems,
          remainingItems: responseInput.length,
        });
      }
      if (toolRound > 0 && codingActivity?.used && typeof onStatus === "function") {
        onStatus({
          state: reviewRequested ? "finalizing" : "analyzing_code",
          label: reviewRequested ? "Reviewing final changes" : "Analyzing code context",
          detail: `${codingActivity.filesRead.size} files in context`,
          repository: codingActivity.repository,
          context: codingContextSnapshot(codingActivity),
        });
      }
      const reviewInstruction = reviewRequested
        ? "FINAL CODING REVIEW: Review the current code-changing task before the final answer. Use github_review_branch when it materially helps inspect the real diff. Re-read critical changed files and run relevant available deterministic validation when useful. If you find a defect, fix only that defect and review the new commit again. Never claim a check succeeded unless a tool actually showed it."
        : "";
      const mediumComputerInstructions = reasoningEffort === "medium" && advancedCapabilities.has("browser")
        ? buildAiComputerInstructions(env)
        : "";
      const runtimeInstructions = [reviewInstruction, mediumComputerInstructions].filter(Boolean).join(" ");
      const multiAgentEnabled = Boolean(
        effortProfile.multiAgent
        && githubContext
        && codingActivity?.plan
        && !multiAgentFallbackDisabled
      );
      const responseUrl = multiAgentEnabled
        ? "https://api.openai.com/v1/responses?beta=true"
        : "https://api.openai.com/v1/responses";
      const requestInit = {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.GPT_API,
          "Content-Type": "application/json",
          ...(multiAgentEnabled ? { "OpenAI-Beta": "responses_multi_agent=v1" } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          instructions: buildAiChatInstructions(
            latestPreferredVoice,
            githubContext,
            promptMemoryEntries,
            model,
            openAiAgentInstructions,
            mcpInstructions,
            runtimeInstructions,
            includeMediaInstructions,
          ),
          input: responseInput,
          tools,
          tool_choice: "auto",
          reasoning: {
            effort: reasoningEffort,
            context: "all_turns",
          },
          text: { verbosity: effortProfile.verbosity },
          ...(multiAgentEnabled ? { multi_agent: { enabled: true } } : {}),
          ...(safetyIdentifier ? {
            safety_identifier: safetyIdentifier,
            prompt_cache_key: safetyIdentifier,
          } : {}),
          prompt_cache_options: { mode: "implicit", ttl: "30m" },
          context_management: [{
            type: "compaction",
            compact_threshold: AI_CHAT_COMPACTION_THRESHOLD,
          }],
          store: false,
          stream: true,
        }),
      };

      let response;
      try {
        response = await fetchAiChatResponseWithRateLimitRetry(responseUrl, requestInit, {
          phase: "responses_http",
          model,
          multiAgent: multiAgentEnabled,
        });
      } catch (error) {
        if (multiAgentEnabled && error?.name === "AiChatUpstreamError" && error?.retryWithoutMultiAgent) {
          multiAgentFallbackDisabled = true;
          console.warn("AI_CHAT_INTERNAL_FALLBACK", {
            internalCode: "MULTI_AGENT_TO_DIRECT",
            cause: error.internalCode || "OPENAI_RESPONSES_HTTP_FAILURE",
          });
          continue;
        }
        throw error;
      }

      let data;
      try {
        data = await readChatResponseStream(response, onStatus, { model, multiAgent: multiAgentEnabled });
      } catch (error) {
        if (multiAgentEnabled && error?.name === "AiChatUpstreamError" && error?.retryWithoutMultiAgent) {
          multiAgentFallbackDisabled = true;
          console.warn("AI_CHAT_INTERNAL_FALLBACK", {
            internalCode: "MULTI_AGENT_TO_DIRECT",
            cause: error.internalCode || "OPENAI_STREAM_FAILURE",
          });
          continue;
        }
        throw error;
      }
      throwIfAiChatAborted(controller.signal);
      const output = Array.isArray(data?.output) ? data.output : [];
      const roundWebSearchCalls = output.filter((item) => item?.type === "web_search_call").length;
      const roundFileSearchCalls = output.filter((item) => item?.type === "file_search_call").length;
      webSearchCalls += roundWebSearchCalls;
      fileSearchCalls += roundFileSearchCalls;
      webSearchUsed = webSearchUsed || roundWebSearchCalls > 0;
      if (roundWebSearchCalls && codingActivity && Array.isArray(codingActivity.events)) {
        codingActivity.events.push({ state: "analyzing_code", label: "Web research used", detail: `${roundWebSearchCalls} searches`, at: Date.now() });
      }
      const shellUsage = inspectOpenAiShellUsage(output);
      if (shellUsage.containerIds.length) {
        if (!activeShellContainerId && unidentifiedContainerSessions > 0) {
          unidentifiedContainerSessions -= 1;
        }
        for (const containerId of shellUsage.containerIds) shellContainerIds.add(containerId);
        const reusableContainerId = shellUsage.containerIds[shellUsage.containerIds.length - 1];
        if (reuseOpenAiShellContainer(tools, reusableContainerId)) activeShellContainerId = reusableContainerId;
      } else if (shellUsage.used && !activeShellContainerId) {
        unidentifiedContainerSessions += 1;
      }
      if (shellUsage.used && codingActivity?.currentCommitSha && codingActivity.currentCommitSha === codingActivity.workspaceCommitSha) {
        codingActivity.postWriteShellUsed = true;
      }
      if (data?.usage && typeof data.usage === "object") usage.push(data.usage);
      if (codingActivity) {
        codingActivity.contextTokens = Math.max(
          codingActivity.contextTokens,
          Math.max(0, Number(data?.usage?.input_tokens || 0)),
        );
      }
      if (githubContext && data?.usage && typeof data.usage === "object") {
        console.info("AI_CHAT_TOKEN_USAGE", {
          round: toolRound + 1,
          model,
          reasoningEffort,
          verbosity: effortProfile.verbosity,
          inputTokens: Math.max(0, Number(data.usage.input_tokens || 0)),
          outputTokens: Math.max(0, Number(data.usage.output_tokens || 0)),
          cachedTokens: Math.max(0, Number(data.usage.input_tokens_details?.cached_tokens || 0)),
          cacheWriteTokens: Math.max(0, Number(data.usage.input_tokens_details?.cache_write_tokens || 0)),
          advancedTools: fullAdvanced ? "full" : Array.from(advancedCapabilities).sort(),
          multiAgent: multiAgentEnabled,
        });
      }

      const terminalCall = output.find(
        (item) => isRootAgentItem(item)
          && item?.type === "function_call"
          && (item?.name === "generate_image" || item?.name === "generate_speech"),
      );
      const advancedCodingCalls = output.filter((item) => isRootAgentItem(item) && isAdvancedCodingToolsCall(item));
      const githubCalls = output.filter(isGitHubAiToolCall);
      const memoryCalls = output.filter(isAiMemoryToolCall);
      const patchCalls = output.filter(isOpenAiApplyPatchCall);
      const browserOpenCalls = output.filter(isAiComputerFunctionCall);
      const computerCalls = output.filter(isAiComputerCall);
      const hasClientCalls = advancedCodingCalls.length || githubCalls.length || memoryCalls.length || patchCalls.length || browserOpenCalls.length || computerCalls.length;
      const hasRootMessage = output.some((item) => item?.type === "message" && isRootAgentItem(item));

      if (terminalCall && !hasClientCalls) {
        throwIfAiChatAborted(controller.signal);
        return buildChatResult(data, cleanMessages, resultOptions());
      }

      if (!hasClientCalls && hasRootMessage) {
        throwIfAiChatAborted(controller.signal);
        if (codingActivity?.needsReview && effortProfile.automaticReview) {
          const currentSha = String(codingActivity.currentCommitSha || "");
          const reviewedCurrentCommit = Boolean(
            codingActivity.lastReview
            && currentSha
            && String(codingActivity.lastReview.commitSha || "") === currentSha,
          );
          if (!reviewRequested || !reviewedCurrentCommit || reviewedCommitSha !== currentSha) {
            responseInput.push(...prepareOpenAiToolReplayItems(output));
            reviewRequested = true;
            reviewedCommitSha = reviewedCurrentCommit ? currentSha : "";
            if (typeof onStatus === "function") {
              onStatus({
                state: "finalizing",
                label: "Running final review",
                detail: codingActivity.currentBranch || "Vexa branch",
                repository: codingActivity.repository,
                context: codingContextSnapshot(codingActivity),
              });
            }
            continue;
          }
          codingActivity.needsReview = false;
          codingActivity.reviewCompleted = true;
        }
        if (codingActivity?.used && typeof onStatus === "function") {
          onStatus({
            state: "finalizing",
            label: "Finalizing result",
            detail: codingActivity.change ? "Preparing change report" : "Preparing answer",
            repository: codingActivity.repository,
            context: codingContextSnapshot(codingActivity),
          });
        }
        return buildChatResult(data, cleanMessages, resultOptions());
      }

      if (!hasClientCalls && !hasRootMessage) {
        responseInput.push(...prepareOpenAiToolReplayItems(output));
        continue;
      }

      responseInput.push(...prepareOpenAiToolReplayItems(output));
      for (const call of advancedCodingCalls) {
        throwIfAiChatAborted(controller.signal);
        try {
          const result = await enableAdvancedCodingCapability(call);
          responseInput.push(functionCallOutput(call, JSON.stringify(result)));
        } catch (error) {
          responseInput.push(functionCallOutput(call, JSON.stringify({
            error: String(error?.message || "Advanced coding capability could not be enabled.").slice(0, 500),
          })));
        }
      }
      for (const call of memoryCalls) {
        throwIfAiChatAborted(controller.signal);
        const update = applyAiMemoryToolCall(memoryEntries, call);
        memoryEntries = update.memories;
        promptMemoryEntries = selectRelevantAiMemories(memoryEntries, memoryContextText);
        memoryChanged = memoryChanged || update.changed;
        responseInput.push(functionCallOutput(call, JSON.stringify(update.output)));
      }
      for (const call of browserOpenCalls) {
        throwIfAiChatAborted(controller.signal);
        let args = {};
        try { args = JSON.parse(String(call.arguments || "{}")); } catch { args = {}; }
        let toolOutput;
        try {
          toolOutput = JSON.stringify(await computerSession.openUrl(args.url));
          if (codingActivity && Array.isArray(codingActivity.events)) {
            codingActivity.used = true;
            codingActivity.events.push({ state: "analyzing_code", label: "Browser preview opened", detail: String(args.url || "").slice(0, 180), at: Date.now() });
          }
        } catch (error) {
          toolOutput = JSON.stringify({ error: String(error?.message || "Browser could not open the URL.").slice(0, 500) });
        }
        responseInput.push(functionCallOutput(call, toolOutput));
      }
      for (const call of computerCalls) {
        throwIfAiChatAborted(controller.signal);
        try {
          const computerOutput = await computerSession.executeComputerCall(call);
          responseInput.push(computerOutput);
          if (codingActivity && Array.isArray(codingActivity.events)) {
            codingActivity.used = true;
            const actionCount = Array.isArray(call.actions) ? call.actions.length : call.action ? 1 : 0;
            codingActivity.events.push({ state: "analyzing_code", label: "UI verified in browser", detail: `${actionCount} actions`, at: Date.now() });
          }
        } catch (error) {
          throw new Error("Computer Use failed: " + String(error?.message || "browser action failed").slice(0, 500));
        }
      }
      for (const call of githubCalls) {
        throwIfAiChatAborted(controller.signal);
        if (!isRootAgentItem(call) && isGitHubWriteCall(call)) {
          responseInput.push(functionCallOutput(call, JSON.stringify({ error: "Only the root coordinator may perform GitHub write actions." })));
          continue;
        }
        const beforeSha = String(codingActivity?.currentCommitSha || "");
        const toolOutput = await executeGitHubAiTool(env, options.userId, call, onStatus, codingActivity);
        throwIfAiChatAborted(controller.signal);
        responseInput.push(functionCallOutput(call, toolOutput));
        recordMediumBaseAction(call?.name);
        const afterSha = String(codingActivity?.currentCommitSha || "");
        if (afterSha && afterSha !== beforeSha) {
          await refreshWorkspaceIfNeeded();
        }
      }
      if (patchCalls.length) {
        const rootPatchCalls = patchCalls.filter(isRootAgentItem);
        const delegatedPatchCalls = patchCalls.filter((call) => !isRootAgentItem(call));
        for (const call of delegatedPatchCalls) {
          responseInput.push({
            type: "apply_patch_call_output",
            call_id: call.call_id,
            status: "failed",
            output: "Only the root coordinator may perform code writes.",
          });
        }
        if (rootPatchCalls.length) {
          throwIfAiChatAborted(controller.signal);
          const beforeSha = String(codingActivity?.currentCommitSha || "");
          const patchOutputs = await executeOpenAiApplyPatchCalls(
            env,
            options.userId,
            rootPatchCalls,
            onStatus,
            codingActivity,
          );
          throwIfAiChatAborted(controller.signal);
          responseInput.push(...patchOutputs);
          recordMediumBaseAction("apply_patch");
          const afterSha = String(codingActivity?.currentCommitSha || "");
          if (afterSha && afterSha !== beforeSha) {
            await refreshWorkspaceIfNeeded();
          }
        }
      }
      if (terminalCall) {
        throwIfAiChatAborted(controller.signal);
        return buildChatResult(data, cleanMessages, resultOptions());
      }
    }
    throw new Error("AI used too many tool steps for the selected reasoning level. Choose a higher level or continue with a smaller task.");
  } catch (error) {
    if (requestAborted || requestSignal?.aborted) {
      throw makeAiChatAbortError();
    }
    if (timedOut) {
      throw new Error("AI took too long. Please try again.");
    }
    if (error?.name === "AbortError") throw error;
    throw error;
  } finally {
    clearTimeout(timer);
    if (requestSignal) requestSignal.removeEventListener("abort", abortFromRequest);
    await computerSession.close();
  }
}

function functionCallOutput(call, output) {
  return {
    type: "function_call_output",
    call_id: call.call_id,
    output: String(output ?? ""),
    ...(call?.caller ? { caller: call.caller } : {}),
  };
}

function isRootAgentItem(item) {
  const name = String(item?.agent?.agent_name || item?.agent_name || "").trim();
  return !name || name === "/root" || name === "root";
}

function isGitHubWriteCall(item) {
  return [
    "github_commit_changes",
    "github_create_pull_request",
    "github_merge_pull_request",
    "github_apply_branch_to_default",
  ].includes(String(item?.name || ""));
}

async function readChatResponseStream(response, onStatus, context = {}) {
  if (!response.body) throw new Error("AI did not return a response. Please try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const searchingCalls = new Set();
  let buffer = "";
  let completedResponse = null;
  let incompleteResponse = null;

  const emitStatus = (status) => {
    if (typeof onStatus === "function") onStatus(status);
  };

  const handleBlock = (block) => {
    let eventName = "";
    const dataLines = [];
    for (const line of String(block || "").split(/\r?\n/)) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    const rawData = dataLines.join("\n").trim();
    if (!rawData || rawData === "[DONE]") return;

    let event;
    try {
      event = JSON.parse(rawData);
    } catch {
      return;
    }

    const type = String(event?.type || eventName || "");
    if (type === "response.web_search_call.in_progress" || type === "response.web_search_call.searching") {
      const callId = String(event?.item_id || event?.call_id || event?.output_index || "web-search");
      const wasSearching = searchingCalls.size > 0;
      searchingCalls.add(callId);
      if (!wasSearching) emitStatus("searching");
      return;
    }
    if (type === "response.web_search_call.completed") {
      const callId = String(event?.item_id || event?.call_id || event?.output_index || "web-search");
      searchingCalls.delete(callId);
      if (!searchingCalls.size) emitStatus("thinking");
      return;
    }
    if (type === "response.incomplete") {
      incompleteResponse = event?.response || null;
      return;
    }
    if (type === "response.completed") {
      const finalResponse = event?.response || null;
      if (String(finalResponse?.status || "").toLowerCase() === "incomplete") {
        incompleteResponse = finalResponse;
      } else {
        completedResponse = finalResponse;
      }
      return;
    }
    if (type === "error" || type === "response.failed") {
      const upstream = event?.error || event?.response?.error || {};
      throw createAiChatUpstreamError(0, JSON.stringify({ error: upstream }), {
        phase: type || "responses_stream_failed",
        requestId: event?.request_id || event?.response?.id || "",
        model: context.model || "",
        multiAgent: Boolean(context.multiAgent),
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let boundary = buffer.match(/\r?\n\r?\n/);
    while (boundary && boundary.index !== undefined) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      handleBlock(block);
      boundary = buffer.match(/\r?\n\r?\n/);
    }

    if (done) break;
  }

  if (buffer.trim()) handleBlock(buffer);
  if (incompleteResponse) {
    const reason = String(incompleteResponse?.incomplete_details?.reason || "unknown").trim().toLowerCase();
    console.warn("AI_CHAT_RESPONSE_INCOMPLETE", {
      reason,
      requestId: String(incompleteResponse?.id || "").slice(0, 160),
      model: String(context.model || "").slice(0, 80),
      multiAgent: Boolean(context.multiAgent),
    });
    const error = new Error(
      reason === "max_output_tokens"
        ? "AI reached the model output limit before finishing. Continue with a smaller request."
        : AI_CHAT_PUBLIC_ERROR,
    );
    error.name = "AiChatIncompleteError";
    error.incompleteReason = reason;
    throw error;
  }
  if (!completedResponse) throw new Error("AI did not return a response. Please try again.");
  return completedResponse;
}

function buildChatResult(data, cleanMessages, options = {}) {
  const webSearchUsed = Boolean(options.webSearchUsed) || (Array.isArray(data?.output) ? data.output : [])
    .some((item) => item?.type === "web_search_call");
  const imageCall = (Array.isArray(data?.output) ? data.output : [])
    .find((item) => isRootAgentItem(item) && item?.type === "function_call" && item?.name === "generate_image");

  const speechCall = (Array.isArray(data?.output) ? data.output : [])
    .find((item) => isRootAgentItem(item) && item?.type === "function_call" && item?.name === "generate_speech");
  const billing = {
    model: normalizeAiChatModel(options.model),
    reasoningEffort: normalizeAiChatReasoningEffort(options.reasoningEffort),
    usage: Array.isArray(options.usage) ? options.usage : [],
    webSearchCalls: Math.max(0, Math.floor(Number(options.webSearchCalls || 0))),
    fileSearchCalls: Math.max(0, Math.floor(Number(options.fileSearchCalls || 0))),
    containerSessions: Math.max(0, Math.floor(Number(options.containerSessions || 0))),
    vectorStorageGbDays: Math.max(0, Number(options.vectorStorageGbDays || 0)),
    browserDurationMs: Math.max(0, Number(options.browserDurationMs || 0)),
  };
  const memoryUpdate = options.memoryChanged && Array.isArray(options.memoryEntries)
    ? options.memoryEntries
    : null;
  const codingActivity = finalizeCodingActivity(options.codingActivity);

  if (speechCall) {
    let args = {};
    try {
      args = JSON.parse(String(speechCall.arguments || "{}"));
    } catch {
      args = {};
    }

    const text = Array.from(String(args.text || "").trim())
      .slice(0, MAX_CHAT_SPEECH_CHARS)
      .join("");
    if (!text) {
      throw new Error("Speech text is empty.");
    }

    const requestedVoice = String(args.voice || "").trim();
    const voice = VOICE_NAMES.includes(requestedVoice) ? requestedVoice : "Nora";

    return {
      type: "speech_request",
      text,
      voice,
      webSearchUsed,
      billing,
      memoryUpdate,
      codingActivity,
    };
  }

  if (imageCall) {
    let args = {};
    try {
      args = JSON.parse(String(imageCall.arguments || "{}"));
    } catch {
      args = {};
    }
    const latestUserText = cleanMessages[cleanMessages.length - 1].content;
    const prompt = Array.from(String(args.prompt || latestUserText).trim()).slice(0, MAX_IMAGE_PROMPT_CHARS).join("");
    if (!prompt) throw new Error("Image prompt is empty.");
    return {
      type: "image_request",
      prompt,
      size: resolveImageSize(args.size),
      webSearchUsed,
      billing,
      memoryUpdate,
      codingActivity,
    };
  }

  const answer = extractResponseText(data);
  if (!answer) throw new Error("AI did not return a response. Please try again.");
  return {
    type: "text",
    message: answer,
    sources: extractResponseSources(data),
    webSearchUsed,
    billing,
    memoryUpdate,
    codingActivity,
  };
}

function codingContextSnapshot(activity) {
  const tokens = Math.max(0, Math.floor(Number(activity?.contextTokens || 0)));
  const window = Math.max(1, Math.floor(Number(activity?.contextWindow || AI_CHAT_CONTEXT_WINDOW)));
  return {
    tokens,
    window,
    percent: Math.min(100, tokens / window * 100),
    files: Array.from(activity?.filesRead instanceof Set ? activity.filesRead : activity?.filesRead || []),
  };
}

function finalizeCodingActivity(activity) {
  if (!activity?.used) return null;
  return {
    repository: String(activity.repository || ""),
    defaultBranch: String(activity.defaultBranch || ""),
    currentBranch: String(activity.currentBranch || ""),
    currentCommitSha: String(activity.currentCommitSha || ""),
    workspaceCommitSha: String(activity.workspaceCommitSha || ""),
    model: String(activity.model || ""),
    reasoningEffort: String(activity.reasoningEffort || ""),
    reviewCompleted: Boolean(activity.reviewCompleted),
    postWriteShellUsed: Boolean(activity.postWriteShellUsed),
    context: codingContextSnapshot(activity),
    events: (Array.isArray(activity.events) ? activity.events : []).slice(-12),
    change: activity.change || null,
    lastCi: activity.lastCi || null,
    lastReview: activity.lastReview || null,
    pullRequest: activity.pullRequest || null,
    merge: activity.merge || null,
    applied: activity.applied || null,
  };
}

function cleanChatAnswer(value) {
  return String(value || "")
    .replace(/cite[^]+/g, "")
    .replace(/【\d+†[^】]+】/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractResponseText(data) {
  const rootParts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message" || !isRootAgentItem(item)) continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && String(content.text || "").trim()) {
        rootParts.push(String(content.text).trim());
      }
    }
  }
  if (rootParts.length) return cleanChatAnswer(rootParts.join("\n\n"));
  if (String(data?.output_text || "").trim()) return cleanChatAnswer(data.output_text);
  return "";
}

function extractResponseSources(data) {
  const seen = new Set();
  const sources = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message" || !isRootAgentItem(item)) continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        const citation = annotation?.url_citation || annotation;
        const url = String(citation?.url || "").trim();
        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        sources.push({
          title: String(citation?.title || "Source").trim() || "Source",
          url,
        });
      }
    }
  }
  return sources.slice(0, 6);
}

function buildSystemPrompt() {
  return ELEVENLABS_ENHANCE_PROMPT;
}

function cleanEnhancedText(value) {
  return String(value || "")
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .trim();
}

function preservesOriginalSpeech(original, enhanced) {
  const speechOnly = String(enhanced || "").replace(/\[[^\]\r\n]{1,120}\]/g, "");
  const normalize = (value) => String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return normalize(original) === normalize(speechOnly);
}

function requestAbortError(message = "AI request cancelled.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMs = GPT_TIMEOUT_MS,
  timeoutMessage = "AI took too long. Please try a shorter text.",
) {
  const externalSignal = options?.signal && typeof options.signal.addEventListener === "function"
    ? options.signal
    : null;
  const controller = new AbortController();
  let externalAborted = false;
  let timedOut = false;
  const abortFromExternal = () => {
    externalAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) controller.abort();
  }, timeoutMs);

  try {
    if (externalAborted || externalSignal?.aborted) throw requestAbortError();
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (externalAborted || externalSignal?.aborted) throw requestAbortError();
    if (timedOut) throw new Error(timeoutMessage);
    if (error?.name === "AbortError") throw error;
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}

function parseOpenAiError(errorBody) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(errorBody || ""));
  } catch {
    parsed = null;
  }
  const source = parsed?.error || parsed?.response?.error || parsed || {};
  return {
    message: String(source?.message || parsed?.message || errorBody || "").trim(),
    code: String(source?.code || parsed?.code || "").trim(),
    type: String(source?.type || parsed?.type || "").trim(),
    param: String(source?.param || parsed?.param || "").trim(),
    requestId: String(source?.request_id || parsed?.request_id || "").trim(),
  };
}

function redactAiInternalText(value) {
  return String(value || "")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[secret]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [secret]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function logAiUpstreamError(phase, status, errorBody, context = {}) {
  const details = parseOpenAiError(errorBody);
  const phaseCode = String(phase || "unknown").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  const upstreamCode = String(details.code || (status ? `HTTP_${status}` : "UNKNOWN"))
    .replace(/[^a-z0-9]+/gi, "_")
    .toUpperCase()
    .slice(0, 80);
  const internalCode = `OPENAI_${phaseCode}_${upstreamCode}`;
  console.error("AI_CHAT_INTERNAL_ERROR", {
    internalCode,
    phase: String(phase || "unknown"),
    status: Math.max(0, Number(status || 0)),
    openAiCode: details.code,
    openAiType: details.type,
    param: details.param,
    requestId: String(context.requestId || details.requestId || "").slice(0, 160),
    model: String(context.model || "").slice(0, 80),
    multiAgent: Boolean(context.multiAgent),
    rateLimit: context.rateLimit || null,
    message: redactAiInternalText(details.message),
  });
  return { ...details, internalCode };
}

function publicAiUpstreamMessage(status, details) {
  const raw = `${details?.code || ""} ${details?.type || ""} ${details?.message || ""}`.toLowerCase();
  if (status === 429 || raw.includes("rate limit") || raw.includes("quota") || raw.includes("rate_limit")) {
    return AI_CHAT_PUBLIC_BUSY_ERROR;
  }
  if (
    status === 401
    || status === 403
    || status >= 500
    || raw.includes("server_error")
    || raw.includes("internal_error")
    || raw.includes("service_unavailable")
  ) {
    return AI_CHAT_PUBLIC_UNAVAILABLE_ERROR;
  }
  return AI_CHAT_PUBLIC_ERROR;
}

function createAiChatUpstreamError(status, errorBody, context = {}) {
  const details = logAiUpstreamError(context.phase || "responses", status, errorBody, context);
  const error = new Error(publicAiUpstreamMessage(status, details));
  error.name = "AiChatUpstreamError";
  error.internalCode = details.internalCode;
  error.upstreamStatus = Math.max(0, Number(status || 0));
  error.retryWithoutMultiAgent = status === 0 || status === 400 || status === 408 || status >= 500;
  return error;
}

function toFriendlyGptError(status, errorBody, headers = null) {
  const details = logAiUpstreamError("enhance_http", status, errorBody, {
    requestId: headers?.get?.("x-request-id") || "",
    model: GPT_MODEL,
  });
  const raw = `${details.code} ${details.type} ${details.message}`.toLowerCase();
  if (status === 401 || raw.includes("invalid api key") || raw.includes("unauthorized")) {
    return "AI connection error. Please try again later.";
  }

  if (status === 429 || raw.includes("rate limit") || raw.includes("quota")) {
    return "AI is temporarily busy. Please try again later.";
  }

  if (status >= 500) {
    return "AI service is temporarily unavailable. Please try again later.";
  }

  return "AI could not enhance this text. Please try again.";
}

function toFriendlyGptImageError(status, errorBody, headers = null) {
  const details = logAiUpstreamError("image_http", status, errorBody, {
    requestId: headers?.get?.("x-request-id") || "",
    model: GPT_IMAGE_MODEL,
  });
  const raw = `${details.code} ${details.type} ${details.message}`.toLowerCase();

  if (status === 401 || raw.includes("invalid api key") || raw.includes("unauthorized")) {
    return "AI image connection error. Please try again later.";
  }

  if (status === 429 || raw.includes("rate limit") || raw.includes("quota")) {
    return "AI image service is temporarily busy. Please try again later.";
  }

  if (status === 400 && (raw.includes("policy") || raw.includes("safety") || raw.includes("moderation"))) {
    return "This image request cannot be generated. Please try a different prompt.";
  }

  if (status === 400 && (raw.includes("image") || raw.includes("mime") || raw.includes("format") || raw.includes("file"))) {
    return "The uploaded image could not be processed. Please send it as a Telegram photo and try again.";
  }

  if (status === 403 || raw.includes("verification") || raw.includes("permission")) {
    return "AI image editing is not enabled for this API account.";
  }

  if (status >= 500) {
    return "AI image service is temporarily unavailable. Please try again later.";
  }

  return AI_IMAGE_PUBLIC_ERROR;
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}