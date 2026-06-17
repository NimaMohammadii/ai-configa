const GPT_TIMEOUT_MS = 45000;
const GPT_MODEL = "gpt-4o-mini";
const MAX_ENHANCE_CHARS = 5000;

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
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(language),
        },
        {
          role: "user",
          content: cleanText,
        },
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
  return [
    "You are an expert script editor for ElevenLabs v3 text-to-speech.",
    "Your only job is to improve the user's text by adding natural emotion and delivery tags.",
    "Keep the original language and meaning.",
    "Do not translate unless the user asked for translation.",
    "Do not add explanations, titles, markdown, bullets, quotes, or comments.",
    "Return only the final enhanced script.",
    "Use tags sparingly and naturally, only where useful.",
    "Allowed tags: [whispers], [laughs], [sighs], [excited], [sad], [angry], [pauses].",
    "Prefer [pauses] for dramatic spacing and [excited] for energetic promo lines.",
    "Do not overuse tags. Avoid putting a tag before every sentence.",
    "If the text is already good, make only small improvements.",
    "Language code: " + String(language || "en"),
  ].join("\n");
}

function cleanEnhancedText(value) {
  return String(value || "")
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .trim();
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gpt_timeout"), GPT_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("gpt_timeout")) {
      throw new Error("AI took too long. Please try a shorter text.");
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
