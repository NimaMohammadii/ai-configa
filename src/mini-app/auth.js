import { normalizeLang } from "../i18n.js";
import { getState } from "../state.js";

export async function authenticateMiniAppPayload(payload, env) {
  const initData = String(payload?.initData || "");
  const userJson = new URLSearchParams(initData).get("user");
  if (!userJson) throw httpError("ورود تلگرام معتبر نیست.", 401);
  if (env.BOT_TOKEN && !(await verifyTelegramInitData(initData, env.BOT_TOKEN))) {
    throw httpError("امضای تلگرام معتبر نیست.", 401);
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw httpError("کاربر تلگرام پیدا نشد.", 401);
  }
  if (!user?.id) throw httpError("کاربر تلگرام پیدا نشد.", 401);

  // Only Vexa Voice should force the language saved in the app. Other Mini App
  // features, especially the independent voice-demo language picker, must keep
  // the explicit language sent by the user.
  const isVexaVoiceRequest = Boolean(
    payload &&
    typeof payload === "object" &&
    (payload.vexaVoice === true || Object.prototype.hasOwnProperty.call(payload, "variant"))
  );
  if (
    isVexaVoiceRequest &&
    Object.prototype.hasOwnProperty.call(payload, "language")
  ) {
    let savedLanguage = "";
    try {
      const state = await getState(env, user.id);
      savedLanguage = String(state?.language || "");
    } catch (error) {
      console.error("Mini app saved language lookup failed", error?.message || error);
    }
    payload.language = normalizeLang(savedLanguage || user.language_code || payload.language || "en");
  }

  return user;
}

async function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash");
  if (!suppliedHash) return false;
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const encoder = new TextEncoder();
  const telegramKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", telegramKey, encoder.encode(botToken));
  const secretKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(await crypto.subtle.sign("HMAC", secretKey, encoder.encode(dataCheckString)));
  return timingSafeEqual(suppliedHash, expected);
}

function timingSafeEqual(first, second) {
  if (first.length !== second.length) return false;
  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) {
    mismatch |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return mismatch === 0;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
