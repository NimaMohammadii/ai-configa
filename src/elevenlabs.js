const ELEVEN_TIMEOUT_MS = 35000;
const LONG_TEXT_CHUNK_SIZE = 600;
const MAX_TTS_CHARS = 2400;

export async function textToSpeech(env, text, voiceId) {
  if (!env.ELEVEN_API) {
    throw new Error("سرویس تبدیل صدا هنوز تنظیم نشده است. لطفاً بعداً دوباره امتحان کنید.");
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("متن خالی است.");
  }

  if (Array.from(cleanText).length > MAX_TTS_CHARS) {
    throw new Error("متن خیلی طولانی است. لطفاً متن کوتاه‌تری بفرستید.");
  }

  const chunks = splitText(cleanText, LONG_TEXT_CHUNK_SIZE);
  if (chunks.length === 1) {
    return await synthesizeChunk(env, chunks[0], voiceId);
  }

  const parts = await Promise.all(chunks.map((chunk) => synthesizeChunk(env, chunk, voiceId)));
  return concatArrayBuffers(parts);
}

async function synthesizeChunk(env, text, voiceId) {
  const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": env.ELEVEN_API,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyElevenLabsError(response.status, errorBody));
  }

  return await response.arrayBuffer();
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("elevenlabs_timeout"), ELEVEN_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("elevenlabs_timeout")) {
      throw new Error("ساخت صدا بیش از حد طول کشید. لطفاً متن کوتاه‌تری بفرستید یا دوباره امتحان کنید.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function splitText(text, maxChars) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text.trim();

  while (Array.from(remaining).length > maxChars) {
    const slice = Array.from(remaining).slice(0, maxChars).join("");
    const breakAt = Math.max(
      slice.lastIndexOf("\n"),
      slice.lastIndexOf("."),
      slice.lastIndexOf("!"),
      slice.lastIndexOf("?"),
      slice.lastIndexOf("،"),
      slice.lastIndexOf(" ")
    );

    const cut = breakAt > Math.floor(maxChars * 0.55) ? breakAt + 1 : maxChars;
    const chunk = Array.from(remaining).slice(0, cut).join("").trim();
    if (chunk) chunks.push(chunk);
    remaining = Array.from(remaining).slice(cut).join("").trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function concatArrayBuffers(buffers) {
  const totalLength = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return merged.buffer;
}

function toFriendlyElevenLabsError(status, errorBody) {
  let code = "";
  let message = "";

  try {
    const parsed = JSON.parse(errorBody);
    code = parsed?.detail?.code || parsed?.detail?.type || "";
    message = parsed?.detail?.message || parsed?.message || "";
  } catch {
    message = errorBody || "";
  }

  const raw = `${code} ${message}`.toLowerCase();

  if (raw.includes("quota_exceeded") || raw.includes("quota") || raw.includes("credits remaining")) {
    return "سرویس تبدیل صدا موقتاً ظرفیت ندارد. لطفاً کمی بعد دوباره امتحان کنید.";
  }

  if (status === 401 || raw.includes("unauthorized") || raw.includes("invalid_api_key")) {
    return "خطای اتصال به سرویس صدا. لطفاً کمی بعد دوباره امتحان کنید.";
  }

  if (status === 429 || raw.includes("rate") || raw.includes("too many")) {
    return "درخواست‌ها زیاد شده است. لطفاً چند لحظه بعد دوباره امتحان کنید.";
  }

  if (status >= 500) {
    return "سرویس تبدیل صدا موقتاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کنید.";
  }

  return "تبدیل صدا انجام نشد. لطفاً متن کوتاه‌تری بفرستید یا دوباره امتحان کنید.";
}
