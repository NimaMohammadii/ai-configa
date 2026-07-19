const GPT_TIMEOUT_MS = 45000;
const GPT_IMAGE_TIMEOUT_MS = 150000;
const GPT_MODEL = "gpt-4o-mini";
const MAX_ENHANCE_CHARS = 5000;

const GPT_IMAGE_MODEL = "gpt-image-2";
const GPT_IMAGE_SIZE = "1024x1024";
const GPT_IMAGE_QUALITY = "low";
const GPT_IMAGE_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024"]);
const MAX_IMAGE_PROMPT_CHARS = 2000;
const MAX_IMAGE_EDIT_INPUTS = 4;

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
        output_format: "png",
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
  form.append("output_format", "png");

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
      temperature: 0.55,
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
  const output = data?.choices?.[0]?.message?.content || "";
  return cleanEnhancedText(output) || cleanText;
}

function buildSystemPrompt(language) {
  const allowedAudioTags = [
    "[whispers]",
    "[laughs]",
    "[sighs]",
    "[excited]",
    "[sad]",
    "[angry]",
    "[pauses]",
    "[slow]",
    "[sarcastic]",
    "[curious]",
    "[tired]",
    "[nervous]",
    "[frustrated]",
    "[shouting]",
    "[quietly]",
    "[loudly]",
    "[awe]",
    "[dramatic tone]",
    "[gasps]",
    "[gulps]",
    "[stammers]",
    "[rushed]",
  ];

  return [
    "You prepare scripts for ElevenLabs v3 text-to-speech.",
    "Analyze the entire user text before adding any audio tag.",
    "Keep the same language, same meaning, and same message.",
    "Do not translate unless the user explicitly asks.",
    "Return only the final script. No explanations, no markdown, no quotes.",
    "Use only these audio tags: " + allowedAudioTags.join(", ") + ".",
    "Add a tag only when the text clearly supports that exact emotion, reaction, pace, or delivery style.",
    "Never invent emotions or make neutral text sound excited, sad, angry, scary, funny, or dramatic unless the words imply it.",
    "For neutral or informational text, keep tags minimal or use no tags at all; prefer punctuation cleanup over fake emotion.",
    "Choose the shortest accurate tag for each moment, and place it close to the words it should affect.",
    "For happy, energetic, or promotional text, use [excited], [loudly], or [rushed] only if the wording truly has that energy.",
    "For sad or exhausted text, use [sad], [sighs], [tired], [slow], or [pauses] only where the sadness or fatigue is explicit or strongly implied.",
    "For secret, scary, intimate, or low-volume text, use [whispers], [quietly], [nervous], [gasps], or [pauses] only when context supports it.",
    "For funny text, use [laughs] or [sarcastic] only when humor or sarcasm is present.",
    "For angry or intense text, use [angry], [frustrated], [shouting], [loudly], or [dramatic tone] carefully and only when justified.",
    "For uncertainty or hesitation, use [curious], [nervous], [stammers], [gulps], or [pauses] only when the text implies it.",
    "Do not put a tag before every sentence. Avoid decorative, random, or excessive tags.",
    "Keep punctuation natural for speech. Add ellipses only when they improve delivery.",
    "Example input: سلام عزیزم با خوشحالی چطوری چیکار میکنی",
    "Example output: سلام عزیزم! [excited] با خوشحالی می‌پرسم... چطوری؟ چیکار می‌کنی؟",
    "Example input: جلسه فردا ساعت ده برگزار می‌شود",
    "Example output: جلسه فردا ساعت ده برگزار می‌شود.",
    "Language code: " + String(language || "en"),
  ].join("\n");
}

function cleanEnhancedText(value) {
  return String(value || "")
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .trim();
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
