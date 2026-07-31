const GPT_TIMEOUT_MS = 45000;
const GPT_CHAT_TIMEOUT_MS = 90000;
const GPT_IMAGE_TIMEOUT_MS = 150000;
const GPT_MODEL = "gpt-5.6-terra";
const MAX_ENHANCE_CHARS = 5000;

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
    },
    GPT_IMAGE_TIMEOUT_MS,
    "AI image generation took too long. Please try again with a simpler prompt.",
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyGptImageError(response.status, errorBody));
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
    throw new Error("GPT image service is not configured.");
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
    },
    GPT_IMAGE_TIMEOUT_MS,
    "AI image editing took too long. Please try again with a simpler instruction.",
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyGptImageError(response.status, errorBody));
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
    throw new Error(toFriendlyGptError(response.status, errorBody));
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

export async function chatWithAi(env, messages, onStatus) {
  if (!env.GPT_API) throw new Error("GPT service is not configured.");

  const cleanMessages = (Array.isArray(messages) ? messages : [])
    .slice(-20)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      return {
        role,
        content: Array.from(String(message?.content || "").trim()).slice(0, 4000).join(""),
        attachment: role === "user" ? normalizeChatAttachment(message?.attachment) : null,
      };
    })
    .filter((message) => message.content || message.attachment);

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== "user") {
    throw new Error("Type a message first.");
  }
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gpt_chat_timeout"), GPT_CHAT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GPT_MODEL,
        instructions: "You are Vexa AI, a capable and friendly assistant inside Telegram. Reply in the same language as the user's latest message. Give accurate, clear, practical answers. Use readable plain text and keep answers focused unless the user asks for detail.",
        input: inputMessages,
        tools: [
          { type: "web_search" },
          {
            type: "function",
            name: "generate_image",
            description: "Generate one image with the app's image generator.",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                size: {
                  type: "string",
                  enum: Array.from(GPT_IMAGE_SIZES),
                },
              },
              required: ["prompt", "size"],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
        tool_choice: "auto",
        max_output_tokens: 1400,
        store: false,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(toFriendlyGptError(response.status, errorBody));
    }

    const data = await readChatResponseStream(response, onStatus);
    return buildChatResult(data, cleanMessages);
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("gpt_chat_timeout")) {
      throw new Error("AI took too long. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readChatResponseStream(response, onStatus) {
  if (!response.body) throw new Error("AI did not return a response. Please try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const searchingCalls = new Set();
  let buffer = "";
  let completedResponse = null;

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
    if (type === "response.completed") {
      completedResponse = event?.response || null;
      return;
    }
    if (type === "error" || type === "response.failed") {
      const message = event?.error?.message || event?.response?.error?.message || "";
      throw new Error(toFriendlyGptError(502, JSON.stringify({ error: { message } })));
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
  if (!completedResponse) throw new Error("AI did not return a response. Please try again.");
  return completedResponse;
}

function buildChatResult(data, cleanMessages) {
  const imageCall = (Array.isArray(data?.output) ? data.output : [])
    .find((item) => item?.type === "function_call" && item?.name === "generate_image");

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
    };
  }

  const answer = extractResponseText(data);
  if (!answer) throw new Error("AI did not return a response. Please try again.");
  return {
    type: "text",
    message: answer,
    sources: extractResponseSources(data),
  };
}

function extractResponseText(data) {
  if (String(data?.output_text || "").trim()) return String(data.output_text).trim();
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && String(content.text || "").trim()) {
        parts.push(String(content.text).trim());
      }
    }
  }
  return parts.join("\n\n").trim();
}

function extractResponseSources(data) {
  const seen = new Set();
  const sources = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message") continue;
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

async function fetchWithTimeout(
  url,
  options,
  timeoutMs = GPT_TIMEOUT_MS,
  timeoutMessage = "AI took too long. Please try a shorter text.",
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gpt_timeout"), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("gpt_timeout")) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toFriendlyGptError(status, errorBody) {
  let message = "";

  try {
    const parsed = JSON.parse(errorBody);
    message = parsed?.error?.message || parsed?.message || "";
  } catch {
    message = errorBody || "";
  }

  const raw = String(message || "").toLowerCase();
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

function toFriendlyGptImageError(status, errorBody) {
  let message = "";

  try {
    const parsed = JSON.parse(errorBody);
    message = parsed?.error?.message || parsed?.message || "";
  } catch {
    message = errorBody || "";
  }

  const raw = String(message || "").toLowerCase();
  console.error("OpenAI image API error", {
    status,
    message: String(message || "").slice(0, 1000),
  });


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

  if (status === 400 && message) {
    return "AI image request error: " + String(message).replace(/\s+/g, " ").slice(0, 300);
  }

  if (status >= 500) {
    return "AI image service is temporarily unavailable. Please try again later.";
  }

  return "AI could not generate this image. Please try again.";
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
