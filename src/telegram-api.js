const TG_HOST = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 25000;

export function botMethodUrl(env, method) {
  if (!env.BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  const tokenPart = ["bot", env.BOT_TOKEN].join("");
  return [TG_HOST, tokenPart, method].join("/");
}

export async function tgJson(env, method, payload = {}) {
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

export async function downloadTelegramFile(env, fileId) {
  const file = await tgJson(env, "getFile", { file_id: fileId });
  const filePath = String(file?.file_path || "");
  if (!filePath) {
    throw new Error("Telegram did not return the image file.");
  }

  const tokenPart = ["bot", env.BOT_TOKEN].join("");
  const url = [TG_HOST, "file", tokenPart, filePath].join("/");
  const res = await fetchWithTimeout(url, { method: "GET" });
  if (!res.ok) {
    throw new Error("Telegram image download failed.");
  }

  const filename = filePath.split("/").pop() || "telegram-image.jpg";
  const mimeType = res.headers.get("content-type") || mimeTypeFromFilename(filename);
  return {
    buffer: await res.arrayBuffer(),
    filename,
    mimeType,
  };
}

function mimeTypeFromFilename(filename) {
  const value = String(filename || "").toLowerCase();
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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
