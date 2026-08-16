import { getImageExploreItems, getMiniAppAccessSettings, isAdmin } from "./admin.js";
import { AI_CHAT_MARKUP_RATE, AI_CHAT_USD_PER_CREDIT } from "./ai-chat-model.js";
import { getBalance, spendCredits } from "./credits.js";
import { saveImageHistory } from "./image-history.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { tgForm, tgJson } from "./telegram-api.js";

const GPT_IMAGE_MODEL = "gpt-image-2";
const GPT_IMAGE_QUALITY = "low";
const GPT_IMAGE_TIMEOUT_MS = 150000;
const GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION = 5;
const GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION = 8;
const GPT_IMAGE_IMAGE_OUTPUT_USD_PER_MILLION = 30;
const MAX_SOURCE_IMAGES = 4;
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;
const IMAGE_SIZES = new Set([
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

const EXPLORE_EDIT_PROMPT = "Use the first uploaded image or images as the user's source subject, face, person, product, object, or scene. Use the final uploaded image only as the visual reference. Recreate the user's source in the reference image's composition, pose, framing, lighting, styling, colors, materials, background, camera perspective, and overall art direction. Replace the reference image's main subject or product with the user's source while preserving the user's identity and defining details. Do not retain the reference subject's identity. Produce one polished coherent image without text unless text is essential to the user's source.";

export function isUsagePricedImageRequest(request) {
  if (!request || request.method !== "POST") return false;
  return new URL(request.url).pathname === "/mini-app/api/image";
}

export async function handleUsagePricedImageRequest(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    const exploreId = String(body.exploreId || "").trim();
    if (!prompt && !exploreId) return errorResponse("Describe the image you want first.", 400);
    if (Array.from(prompt).length > MAX_PROMPT_CHARS) return errorResponse("Image prompt is too long. Please send a shorter prompt.", 400);

    const user = await authenticateMiniAppPayload(body, env);
    if (await isMiniAppLocked(env, user.id)) return errorResponse("Mini app is updating.", 423);

    // Match AI Chat's post-usage billing model, while refusing a zero-balance request
    // before paying the upstream API cost.
    const startingBalance = await getBalance(env, user.id);
    if (startingBalance < 1) return errorResponse("Not enough credits", 402, { balance: startingBalance });

    const requestedSources = Array.isArray(body.images)
      ? body.images
      : body.imageData
        ? [{ data: body.imageData, name: body.imageName }]
        : [];
    if (requestedSources.length > MAX_SOURCE_IMAGES) return errorResponse("You can edit up to 4 images together.", 400);
    if (exploreId && !requestedSources.length) return errorResponse("Upload your image before using an Explore reference.", 400);

    const sources = requestedSources.map((source) => decodeImageSource(source?.data, source?.name)).filter(Boolean);
    const userSourceCount = sources.length;
    let effectivePrompt = prompt;

    if (exploreId) {
      const explore = (await getImageExploreItems(env)).find((item) => item.id === exploreId);
      if (!explore?.fileId) return errorResponse("Explore reference not found.", 404);
      const telegramFile = await tgJson(env, "getFile", { file_id: explore.fileId });
      if (!telegramFile?.file_path) return errorResponse("Explore reference is unavailable.", 404);
      const referenceResponse = await fetch("https://api.telegram.org/file/bot" + env.BOT_TOKEN + "/" + telegramFile.file_path);
      if (!referenceResponse.ok) return errorResponse("Explore reference is unavailable.", 502);
      sources.push({
        buffer: await referenceResponse.arrayBuffer(),
        filename: "explore-reference.jpg",
        mimeType: referenceResponse.headers.get("Content-Type") || "image/jpeg",
      });
      effectivePrompt = EXPLORE_EDIT_PROMPT;
    }

    if (sources.reduce((total, source) => total + source.buffer.byteLength, 0) > MAX_TOTAL_SOURCE_BYTES) {
      return errorResponse("The selected images are too large together.", 413);
    }

    if (request.signal?.aborted) throw abortError();
    const size = normalizeImageSize(body.size);
    const kind = sources.length ? "edit" : "generate";
    const upstream = await requestOpenAiImage(env, effectivePrompt, sources, size, request.signal);
    if (request.signal?.aborted) throw abortError();

    const billing = calculateImageBilling(upstream.usage);
    const usageMetadata = {
      model: GPT_IMAGE_MODEL,
      kind,
      sourceCount: userSourceCount,
      totalInputSourceCount: sources.length,
      size,
      exploreId: exploreId || null,
      markupRate: billing.markupRate,
      baseUsd: billing.baseUsd,
      billedUsd: billing.billedUsd,
      inputTokens: billing.inputTokens,
      textInputTokens: billing.textInputTokens,
      imageInputTokens: billing.imageInputTokens,
      unclassifiedInputTokens: billing.unclassifiedInputTokens,
      outputTokens: billing.outputTokens,
    };

    let spend = await spendCredits(env, user.id, billing.credits, "mini_app_image", usageMetadata);
    if (!spend.ok) {
      const partialCredits = Math.max(0, Math.floor(Number(spend.balance || 0)));
      if (partialCredits > 0) {
        spend = await spendCredits(env, user.id, partialCredits, "mini_app_image_partial", {
          ...usageMetadata,
          creditsRequired: billing.credits,
        });
      }
      const balance = Math.max(0, Math.floor(Number(spend.balance || 0)));
      return errorResponse(
        "Not enough credits · This image used " + billing.credits + " credits · Balance " + balance + " credits",
        402,
        { balance, creditsRequired: billing.credits },
      );
    }

    if (request.signal?.aborted) throw abortError();
    const filename = sources.length ? "vexa-edited-image.jpg" : "vexa-image.jpg";
    const fileId = await storeImageInTelegram(env, user.id, upstream.buffer, filename).catch((error) => {
      console.error("store mini app image failed", error?.message || error);
      return null;
    });
    const history = await saveImageHistory(env, {
      userId: user.id,
      chatId: user.id,
      kind,
      prompt: prompt || "Explore reference " + exploreId,
      fileId,
      filename,
      mimeType: "image/jpeg",
      size,
      sourceCount: userSourceCount,
    });

    return jsonResponse({
      imageBase64: arrayBufferToBase64(upstream.buffer),
      filename,
      mimeType: "image/jpeg",
      kind,
      sourceCount: userSourceCount,
      size,
      cost: billing.credits,
      pricing: dynamicPricingPayload(billing.credits),
      billing,
      balance: spend.balance,
      historyId: history?.id || null,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const cancelledByClient = Boolean(request.signal?.aborted);
      return errorResponse(error?.message || "Image request cancelled.", cancelledByClient ? 499 : 504);
    }
    const status = Number(error?.status) || 500;
    return errorResponse(error?.publicMessage || error?.message || "Mini app error", status);
  }
}

export function dynamicPricingPayload(lastCost = 0) {
  return {
    mode: "api_usage",
    model: GPT_IMAGE_MODEL,
    markupRate: AI_CHAT_MARKUP_RATE,
    usdPerCredit: AI_CHAT_USD_PER_CREDIT,
    lastCost: Math.max(0, Math.floor(Number(lastCost || 0))),
    baseCost: 1,
    activeCost: 1,
    discountEnabled: false,
    discountCost: 0,
    discountUntil: 0,
    discountPercent: 0,
    serverNow: Math.floor(Date.now() / 1000),
  };
}

export function calculateImageBilling(usage = {}) {
  const inputTokens = wholeTokens(usage?.input_tokens);
  const textInputTokens = wholeTokens(usage?.input_tokens_details?.text_tokens);
  const imageInputTokens = wholeTokens(usage?.input_tokens_details?.image_tokens);
  const outputTokens = wholeTokens(usage?.output_tokens || usage?.output_tokens_details?.image_tokens);
  const classifiedInputTokens = textInputTokens + imageInputTokens;
  const unclassifiedInputTokens = Math.max(0, inputTokens - classifiedInputTokens);

  if (inputTokens <= 0 && outputTokens <= 0) {
    const error = new Error("OpenAI did not return image usage data, so the request could not be billed safely.");
    error.publicMessage = "Image billing data was unavailable. Please try again.";
    error.status = 502;
    throw error;
  }

  // OpenAI's Images response separates text and image input tokens. If an
  // unexpected future response leaves any input tokens unclassified, bill the
  // remainder at the higher image-input rate so Vexa never undercharges it.
  const baseUsd = (
    textInputTokens * GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION
    + imageInputTokens * GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION
    + unclassifiedInputTokens * GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION
    + outputTokens * GPT_IMAGE_IMAGE_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  const billedUsd = baseUsd * (1 + AI_CHAT_MARKUP_RATE);
  const credits = Math.max(1, Math.ceil((billedUsd / AI_CHAT_USD_PER_CREDIT) - 1e-12));

  return {
    model: GPT_IMAGE_MODEL,
    credits,
    baseUsd,
    billedUsd,
    markupRate: AI_CHAT_MARKUP_RATE,
    usdPerCredit: AI_CHAT_USD_PER_CREDIT,
    inputTokens,
    textInputTokens,
    imageInputTokens,
    unclassifiedInputTokens,
    outputTokens,
  };
}

async function requestOpenAiImage(env, prompt, sources, size, requestSignal) {
  if (!env.GPT_API) {
    const error = new Error("GPT image service is not configured.");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GPT_IMAGE_TIMEOUT_MS);
  const abortUpstream = () => controller.abort();
  if (requestSignal) requestSignal.addEventListener("abort", abortUpstream, { once: true });

  try {
    const response = sources.length
      ? await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: "Bearer " + env.GPT_API },
          body: imageEditForm(prompt, sources, size),
          signal: controller.signal,
        })
      : await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.GPT_API,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GPT_IMAGE_MODEL,
            prompt,
            size,
            quality: GPT_IMAGE_QUALITY,
            moderation: "low",
            output_format: "jpeg",
            output_compression: 90,
          }),
          signal: controller.signal,
        });

    if (!response.ok) {
      const raw = await response.text();
      const error = new Error(friendlyOpenAiImageError(response.status, raw));
      error.status = response.status === 429 ? 429 : response.status >= 400 && response.status < 500 ? 400 : 502;
      throw error;
    }

    const data = await response.json();
    const base64 = String(data?.data?.[0]?.b64_json || "");
    if (!base64) {
      const error = new Error("AI did not return an image. Please try again.");
      error.status = 502;
      throw error;
    }
    return { buffer: base64ToArrayBuffer(base64), usage: data?.usage || null };
  } catch (error) {
    if (controller.signal.aborted) {
      const aborted = abortError();
      if (!requestSignal?.aborted) aborted.message = "AI image generation took too long. Please try again.";
      throw aborted;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (requestSignal) requestSignal.removeEventListener("abort", abortUpstream);
  }
}

function imageEditForm(prompt, sources, size) {
  const form = new FormData();
  form.append("model", GPT_IMAGE_MODEL);
  form.append("prompt", prompt);
  for (const source of sources) {
    form.append("image[]", new Blob([source.buffer], { type: normalizeMime(source.mimeType, source.filename) }), safeFilename(source.filename));
  }
  form.append("size", size);
  form.append("quality", GPT_IMAGE_QUALITY);
  form.append("moderation", "low");
  form.append("output_format", "jpeg");
  form.append("output_compression", "90");
  return form;
}

async function isMiniAppLocked(env, userId) {
  const access = await getMiniAppAccessSettings(env);
  if (!access.adminOnly) return false;
  return !(await isAdmin(env, userId));
}

async function storeImageInTelegram(env, chatId, buffer, filename) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("disable_notification", "true");
  form.append("photo", new Blob([buffer], { type: "image/jpeg" }), filename);
  const sent = await tgForm(env, "sendPhoto", form);
  try {
    const fileId = (Array.isArray(sent?.photo) ? sent.photo : []).at(-1)?.file_id;
    if (!fileId) throw new Error("Telegram did not return an image file id");
    return fileId;
  } finally {
    if (sent?.message_id) {
      await tgJson(env, "deleteMessage", { chat_id: String(chatId), message_id: sent.message_id }).catch((error) => {
        console.error("delete stored mini app image message failed", error?.message || error);
      });
    }
  }
}

function decodeImageSource(data, name) {
  const raw = String(data || "").trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw publicError("Use a JPG, PNG, or WebP image.", 400);
  let binary;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    throw publicError("The selected image could not be read.", 400);
  }
  if (!binary.length || binary.length > MAX_SOURCE_IMAGE_BYTES) throw publicError("The selected image is too large.", 413);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  return {
    buffer: bytes.buffer,
    filename: safeFilename(name || "reference" + extension),
    mimeType,
  };
}

function normalizeImageSize(value) {
  const size = String(value || "").trim().toLowerCase();
  return IMAGE_SIZES.has(size) ? size : "1024x1024";
}

function normalizeMime(value, filename) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return mime;
  const name = String(filename || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function safeFilename(value) {
  const filename = String(value || "telegram-image.jpg").split("/").pop();
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "telegram-image.jpg";
}

function friendlyOpenAiImageError(status, raw) {
  const lower = String(raw || "").toLowerCase();
  if (status === 429) return "AI image service is busy. Please try again shortly.";
  if (status === 401 || status === 403) return "AI image service is temporarily unavailable.";
  if (lower.includes("moderation") || lower.includes("safety") || lower.includes("policy")) return "That image request could not be processed. Try a different prompt or image.";
  if (status >= 500) return "AI image service is temporarily unavailable. Please try again.";
  return "AI image couldn't complete that request. Please try again.";
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let output = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(output);
}

function wholeTokens(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function publicError(message, status) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}

function abortError() {
  const error = new Error("Image request cancelled.");
  error.name = "AbortError";
  return error;
}

function errorResponse(message, status = 500, extra = {}) {
  return jsonResponse({ error: message, ...extra }, status);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}
