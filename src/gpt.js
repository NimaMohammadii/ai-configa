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
