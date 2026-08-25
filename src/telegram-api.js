const TG_HOST = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 25000;

export function botMethodUrl(env, method) {
  if (!env.BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  const tokenPart = ["bot", env.BOT_TOKEN].join("");
  return [TG_HOST, tokenPart, method].join("/");
}

export async function tgJson(env, method, payload = {}) {
  if (String(method) === "setChatMenuButton") {
    return true;
  }

  const res = await fetchWithTimeout(botMethodUrl(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(method + " failed: " + JSON.stringify(json));
  }
  return json.result;
}

export async function tgForm(env, method, form) {
  const res = await fetchWithTimeout(botMethodUrl(env, method), {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(method + " failed: " + JSON.stringify(json));
  }
  return json.result;
}

export async function downloadTelegramFile(env, fileId, options = {}) {
  const file = await tgJson(env, "getFile", { file_id: fileId });
  const filePath = String(file?.file_path || "");
  if (!filePath) {
    throw new Error("Telegram did not return the file.");
  }

  const tokenPart = ["bot", env.BOT_TOKEN].join("");
  const url = [TG_HOST, "file", tokenPart, filePath].join("/");
  const res = await fetchWithTimeout(url, { method: "GET" });
  if (!res.ok) {
    throw new Error("Telegram file download failed.");
  }

  const fallbackFilename = filePath.split("/").pop() || "telegram-file";
  const filename = String(options?.filename || fallbackFilename);
  const mimeType = normalizeTelegramMimeType(
    options?.mimeType || res.headers.get("content-type"),
    filename,
  );
  return {
    buffer: await res.arrayBuffer(),
    filename,
    mimeType,
  };
}

function normalizeTelegramMimeType(contentType, filename) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (value && value !== "application/octet-stream") return value;
  return mimeTypeFromFilename(filename);
}

function mimeTypeFromFilename(filename) {
  const value = String(filename || "").toLowerCase();
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  if (value.endsWith(".mp3") || value.endsWith(".mpga") || value.endsWith(".mpeg")) return "audio/mpeg";
  if (value.endsWith(".wav")) return "audio/wav";
  if (value.endsWith(".ogg") || value.endsWith(".oga")) return "audio/ogg";
  if (value.endsWith(".opus")) return "audio/opus";
  if (value.endsWith(".m4a")) return "audio/x-m4a";
  if (value.endsWith(".aac")) return "audio/aac";
  if (value.endsWith(".flac")) return "audio/flac";
  if (value.endsWith(".webm")) return "audio/webm";
  if (value.endsWith(".mp4")) return "video/mp4";
  if (value.endsWith(".mov")) return "video/quicktime";
  if (value.endsWith(".mkv")) return "video/x-matroska";
  if (value.endsWith(".avi")) return "video/x-msvideo";
  if (value.endsWith(".3gp")) return "video/3gpp";
  if (value.endsWith(".wmv")) return "video/x-ms-wmv";
  if (value.endsWith(".mpg")) return "video/mpeg";
  return "application/octet-stream";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("telegram_timeout"), TELEGRAM_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("telegram_timeout")) {
      throw new Error("Telegram request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
