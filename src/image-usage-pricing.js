import { getImageExploreItems, getMiniAppAccessSettings, isAdmin } from "./admin.js";
import { AI_CHAT_MARKUP_RATE, AI_CHAT_USD_PER_CREDIT } from "./ai-chat-model.js";
import { ensureBalanceRow, ensureCreditUsageLogTable, getBalance } from "./credits.js";
import { saveImageHistory } from "./image-history.js";
import { authenticateMiniAppPayload } from "./mini-app/auth.js";
import { tgForm, tgJson } from "./telegram-api.js";

const GPT_IMAGE_MODEL = "gpt-image-2";
const GPT_IMAGE_QUALITY = "low";
const GPT_IMAGE_TIMEOUT_MS = 180000;
const GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION = 5;
const GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION = 8;
const GPT_IMAGE_IMAGE_OUTPUT_USD_PER_MILLION = 30;
const MAX_SOURCE_IMAGES = 4;
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;

// A reservation is temporary, not a charge. It deliberately uses a conservative
// token ceiling so Vexa never starts a paid upstream image request without enough
// user credit available to cover a realistic worst case. Exact billing always
// comes from OpenAI's completed-event usage and the unused reserve is refunded.
const RESERVE_TEXT_TOKENS_PER_CHARACTER = 4;
const RESERVE_IMAGE_INPUT_TOKENS_PER_SOURCE = 9000;
const RESERVE_OUTPUT_TOKENS_LOW = 500;
const RESERVE_SAFETY_MULTIPLIER = 1.25;
const STALE_RESERVATION_MINUTES = 10;

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

    if (request.signal?.aborted) return errorResponse("Image request cancelled.", 499);

    const generated = await generateUsagePricedImage(env, {
      userId: user.id,
      prompt: effectivePrompt,
      sources,
      size: body.size,
      metadata: {
        surface: "mini_app",
        sourceCount: userSourceCount,
        totalInputSourceCount: sources.length,
        exploreId: exploreId || null,
      },
    });

    const filename = sources.length ? "vexa-edited-image.jpg" : "vexa-image.jpg";
    const fileId = await storeImageInTelegram(env, user.id, generated.buffer, filename).catch((error) => {
      console.error("store mini app image failed", error?.message || error);
      return null;
    });
    const history = await saveImageHistory(env, {
      userId: user.id,
      chatId: user.id,
      kind: generated.kind,
      prompt: prompt || "Explore reference " + exploreId,
      fileId,
      filename,
      mimeType: "image/jpeg",
      size: generated.size,
      sourceCount: userSourceCount,
    }).catch((error) => {
      console.error("save mini app image history failed", error?.message || error);
      return null;
    });

    return jsonResponse({
      imageBase64: arrayBufferToBase64(generated.buffer),
      filename,
      mimeType: "image/jpeg",
      kind: generated.kind,
      sourceCount: userSourceCount,
      size: generated.size,
      cost: generated.billing.credits,
      pricing: dynamicPricingPayload(generated.billing.credits),
      billing: generated.billing,
      balance: generated.balance,
      historyId: history?.id || null,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return errorResponse(error?.message || "AI image generation took too long. Please try again.", 504);
    }
    const status = Number(error?.status) || 500;
    return errorResponse(error?.publicMessage || error?.message || "Mini app error", status, {
      ...(Number.isFinite(Number(error?.balance)) ? { balance: Number(error.balance) } : {}),
      ...(Number.isFinite(Number(error?.creditsRequired)) ? { creditsRequired: Number(error.creditsRequired) } : {}),
      ...(error?.reserveOnly ? { reserveOnly: true } : {}),
    });
  }
}

export async function generateUsagePricedImage(env, options = {}) {
  const userId = String(options.userId || "").trim();
  const prompt = String(options.prompt || "").trim();
  const sources = Array.isArray(options.sources) ? options.sources.filter((source) => source?.buffer?.byteLength) : [];
  if (!userId) throw publicError("Image user is missing.", 400);
  if (!prompt) throw publicError("Image prompt is empty.", 400);
  if (Array.from(prompt).length > MAX_PROMPT_CHARS) throw publicError("Image prompt is too long. Please send a shorter prompt.", 400);
  if (sources.length > MAX_SOURCE_IMAGES + 1) throw publicError("Too many image inputs.", 400);
  if (sources.reduce((total, source) => total + Number(source.buffer.byteLength || 0), 0) > MAX_TOTAL_SOURCE_BYTES) {
    throw publicError("The selected images are too large together.", 413);
  }

  const size = normalizeImageSize(options.size);
  const kind = sources.length ? "edit" : "generate";
  const metadata = options.metadata && typeof options.metadata === "object" ? options.metadata : {};
  const reserveCredits = estimateImageReservationCredits(prompt, sources.length);
  let reservation = null;
  let settled = false;

  try {
    reservation = await reserveImageCredits(env, userId, reserveCredits, {
      model: GPT_IMAGE_MODEL,
      kind,
      size,
      sourceCount: sources.length,
      ...metadata,
    });
    if (!reservation.ok) {
      const error = publicError(
        "Not enough credits · Keep at least " + reserveCredits + " credits available for this image · final charge is based on actual API usage",
        402,
      );
      error.balance = reservation.balance;
      error.creditsRequired = reserveCredits;
      error.reserveOnly = true;
      throw error;
    }

    const upstream = await requestOpenAiImage(env, prompt, sources, size);
    const billing = calculateImageBilling(upstream.usage);
    const usageMetadata = {
      model: GPT_IMAGE_MODEL,
      kind,
      size,
      ...metadata,
      markupRate: billing.markupRate,
      baseUsd: billing.baseUsd,
      billedUsd: billing.billedUsd,
      inputTokens: billing.inputTokens,
      textInputTokens: billing.textInputTokens,
      imageInputTokens: billing.imageInputTokens,
      unclassifiedInputTokens: billing.unclassifiedInputTokens,
      outputTokens: billing.outputTokens,
      reservedCredits: reservation.reservedCredits,
    };

    const settlement = await settleImageReservation(env, reservation.id, userId, billing.credits, usageMetadata);
    if (!settlement.ok) {
      console.error("image credit reservation underestimated", {
        userId,
        reservedCredits: reservation.reservedCredits,
        actualCredits: billing.credits,
      });
      reservation = null;
      const error = publicError(
        "Not enough credits · This image needs " + billing.credits + " credits · Your temporary credit hold was released",
        402,
      );
      error.balance = settlement.balance;
      error.creditsRequired = billing.credits;
      throw error;
    }
    settled = true;

    return {
      buffer: upstream.buffer,
      billing,
      balance: settlement.balance,
      kind,
      size,
      sourceCount: sources.length,
    };
  } catch (error) {
    if (reservation && !settled) {
      await releaseImageReservation(env, reservation.id, reservation.userId, "request_failed").catch((releaseError) => {
        console.error("release image credit reservation failed", releaseError?.message || releaseError);
      });
    }
    throw error;
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
  const outputTokens = wholeTokens(usage?.output_tokens);
  const classifiedInputTokens = textInputTokens + imageInputTokens;
  const unclassifiedInputTokens = Math.max(0, inputTokens - classifiedInputTokens);

  if (inputTokens <= 0 && outputTokens <= 0) {
    throw publicError("Image billing data was unavailable. Please try again.", 502);
  }

  const baseUsd = (
    textInputTokens * GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION
    + imageInputTokens * GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION
    + unclassifiedInputTokens * GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION
    + outputTokens * GPT_IMAGE_IMAGE_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  const billedUsd = baseUsd * (1 + AI_CHAT_MARKUP_RATE);
  const credits = usdToCredits(billedUsd);

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

export function estimateImageReservationCredits(prompt, sourceCount = 0) {
  const characters = Math.max(1, Array.from(String(prompt || "")).length);
  const estimatedTextTokens = Math.max(32, characters * RESERVE_TEXT_TOKENS_PER_CHARACTER);
  const estimatedImageTokens = Math.max(0, Math.floor(Number(sourceCount || 0))) * RESERVE_IMAGE_INPUT_TOKENS_PER_SOURCE;
  const baseUsd = (
    estimatedTextTokens * GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION
    + estimatedImageTokens * GPT_IMAGE_IMAGE_INPUT_USD_PER_MILLION
    + RESERVE_OUTPUT_TOKENS_LOW * GPT_IMAGE_IMAGE_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  const reservedUsd = baseUsd * RESERVE_SAFETY_MULTIPLIER * (1 + AI_CHAT_MARKUP_RATE);
  return usdToCredits(reservedUsd);
}

async function requestOpenAiImage(env, prompt, sources, size) {
  if (!env.GPT_API) throw publicError("GPT image service is not configured.", 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GPT_IMAGE_TIMEOUT_MS);
  const completedType = sources.length ? "image_edit.completed" : "image_generation.completed";

  try {
    const response = sources.length
      ? await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: "Bearer " + env.GPT_API },
          body: imageEditForm(prompt, sources, size, true),
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
            stream: true,
            partial_images: 0,
          }),
          signal: controller.signal,
        });

    if (!response.ok) {
      const raw = await response.text();
      const error = new Error(friendlyOpenAiImageError(response.status, raw));
      error.status = response.status === 429 ? 429 : response.status >= 400 && response.status < 500 ? 400 : 502;
      throw error;
    }

    return await readCompletedImageResponse(response, completedType);
  } catch (error) {
    if (controller.signal.aborted) {
      const timedOut = abortError("AI image generation took too long. Please try again.");
      throw timedOut;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCompletedImageResponse(response, completedType) {
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();

  if (!contentType.includes("text/event-stream")) {
    const data = await response.json().catch(() => null);
    const base64 = String(data?.data?.[0]?.b64_json || data?.b64_json || "");
    if (!base64 || !hasUsableImageUsage(data?.usage)) {
      throw publicError("Image billing data was unavailable. Please try again.", 502);
    }
    return { buffer: base64ToArrayBuffer(base64), usage: data.usage };
  }

  if (!response.body) throw publicError("AI image stream was unavailable. Please try again.", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = null;

  const consumeBlock = (block) => {
    const dataText = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!dataText || dataText === "[DONE]") return;

    let event;
    try {
      event = JSON.parse(dataText);
    } catch {
      return;
    }
    if (event?.type === "error" || event?.error) {
      const message = String(event?.error?.message || event?.message || "AI image stream failed.");
      throw publicError(message, 502);
    }
    if (event?.type === completedType) completed = event;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) pending += decoder.decode(value, { stream: !done });
    let separator;
    while ((separator = pending.search(/\r?\n\r?\n/)) >= 0) {
      const match = pending.match(/\r?\n\r?\n/);
      const separatorLength = match ? match[0].length : 2;
      const block = pending.slice(0, separator);
      pending = pending.slice(separator + separatorLength);
      consumeBlock(block);
    }
    if (done) break;
  }
  pending += decoder.decode();
  if (pending.trim()) consumeBlock(pending);

  const base64 = String(completed?.b64_json || "");
  if (!base64) throw publicError("AI did not return a final image. Please try again.", 502);
  if (!hasUsableImageUsage(completed?.usage)) throw publicError("Image billing data was unavailable. Please try again.", 502);
  return { buffer: base64ToArrayBuffer(base64), usage: completed.usage };
}

function imageEditForm(prompt, sources, size, streaming = false) {
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
  if (streaming) {
    form.append("stream", "true");
    form.append("partial_images", "0");
  }
  return form;
}

async function ensureImageReservationTable(env) {
  if (!env.DB) throw new Error("Database is not configured.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS image_credit_reservations (" +
      "id TEXT PRIMARY KEY, user_id TEXT NOT NULL, reserved_credits INTEGER NOT NULL, actual_credits INTEGER, " +
      "status TEXT NOT NULL, metadata TEXT, release_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_image_credit_reservations_user_created ON image_credit_reservations (user_id, created_at DESC)"
  ).run();
}

async function reserveImageCredits(env, userId, reservedCredits, metadata = null) {
  await ensureBalanceRow(env, userId);
  await ensureImageReservationTable(env);
  await releaseStaleImageReservations(env, userId);
  const id = crypto.randomUUID();
  const user = String(userId);
  const amount = Math.max(1, Math.ceil(Number(reservedCredits || 0)));
  const serializedMetadata = metadata == null ? null : JSON.stringify(metadata);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO image_credit_reservations (id, user_id, reserved_credits, actual_credits, status, metadata, created_at, updated_at) " +
      "SELECT ?, ?, ?, NULL, 'reserved', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM user_credits WHERE user_id = ? AND credits >= ?"
    ).bind(id, user, amount, serializedMetadata, user, amount),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ? AND EXISTS (SELECT 1 FROM image_credit_reservations WHERE id = ? AND user_id = ? AND status = 'reserved')"
    ).bind(amount, user, id, user),
  ]);

  const row = await env.DB.prepare(
    "SELECT id, user_id, reserved_credits, status FROM image_credit_reservations WHERE id = ? AND user_id = ?"
  ).bind(id, user).first();
  const balance = await getBalance(env, user);
  if (!row || row.status !== "reserved") return { ok: false, balance, needed: amount };
  return { ok: true, id, userId: user, reservedCredits: Number(row.reserved_credits || amount), balance };
}

async function settleImageReservation(env, reservationId, userId, actualCredits, metadata = null) {
  await ensureImageReservationTable(env);
  await ensureCreditUsageLogTable(env);
  const id = String(reservationId || "");
  const user = String(userId);
  const actual = Math.max(1, Math.ceil(Number(actualCredits || 0)));
  const row = await env.DB.prepare(
    "SELECT reserved_credits, actual_credits, status FROM image_credit_reservations WHERE id = ? AND user_id = ?"
  ).bind(id, user).first();
  if (!row) return { ok: false, balance: await getBalance(env, user), needed: actual };
  if (row.status === "settled") {
    return { ok: true, balance: await getBalance(env, user), spent: Number(row.actual_credits || actual), replayed: true };
  }
  if (row.status !== "reserved") return { ok: false, balance: await getBalance(env, user), needed: actual };

  const reserved = Math.max(1, Number(row.reserved_credits || 0));
  const refund = Math.max(0, reserved - actual);
  const extra = Math.max(0, actual - reserved);
  const serializedMetadata = metadata == null ? null : JSON.stringify(metadata);

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE image_credit_reservations SET status = 'settling', actual_credits = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND user_id = ? AND status = 'reserved' AND " +
      "(? = 0 OR EXISTS (SELECT 1 FROM user_credits WHERE user_id = ? AND credits >= ?))"
    ).bind(actual, serializedMetadata, id, user, extra, user, extra),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + ? - ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ? AND EXISTS (SELECT 1 FROM image_credit_reservations WHERE id = ? AND user_id = ? AND status = 'settling')"
    ).bind(refund, extra, user, id, user),
    env.DB.prepare(
      "UPDATE image_credit_reservations SET status = 'settled', updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND user_id = ? AND status = 'settling'"
    ).bind(id, user),
    env.DB.prepare(
      "INSERT OR IGNORE INTO credit_usage_log (id, user_id, credits, reason, metadata, created_at) " +
      "SELECT 'image:' || id, user_id, actual_credits, 'mini_app_image', metadata, CURRENT_TIMESTAMP " +
      "FROM image_credit_reservations WHERE id = ? AND user_id = ? AND status = 'settled'"
    ).bind(id, user),
  ]);

  const saved = await env.DB.prepare(
    "SELECT status, actual_credits FROM image_credit_reservations WHERE id = ? AND user_id = ?"
  ).bind(id, user).first();
  if (saved?.status === "settled") {
    return { ok: true, balance: await getBalance(env, user), spent: Number(saved.actual_credits || actual) };
  }

  const released = await releaseImageReservation(env, id, user, "insufficient_for_settlement");
  return { ok: false, balance: released.balance, needed: actual };
}

async function releaseStaleImageReservations(env, userId) {
  const user = String(userId);
  const modifier = "-" + STALE_RESERVATION_MINUTES + " minutes";

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + COALESCE((SELECT SUM(reserved_credits) FROM image_credit_reservations " +
      "WHERE user_id = ? AND status = 'reserved' AND datetime(updated_at) <= datetime('now', ?)), 0), updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ?"
    ).bind(user, modifier, user),
    env.DB.prepare(
      "UPDATE image_credit_reservations SET status = 'released', release_reason = 'stale_recovery', updated_at = CURRENT_TIMESTAMP " +
      "WHERE user_id = ? AND status = 'reserved' AND datetime(updated_at) <= datetime('now', ?)"
    ).bind(user, modifier),
  ]);
}

async function releaseImageReservation(env, reservationId, userId, reason = "released") {
  await ensureImageReservationTable(env);
  const id = String(reservationId || "");
  const user = String(userId);
  const releaseReason = String(reason || "released").slice(0, 120);

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + COALESCE((SELECT reserved_credits FROM image_credit_reservations " +
      "WHERE id = ? AND user_id = ? AND status = 'reserved'), 0), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(id, user, user),
    env.DB.prepare(
      "UPDATE image_credit_reservations SET status = 'released', release_reason = ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND user_id = ? AND status = 'reserved'"
    ).bind(releaseReason, id, user),
  ]);

  return { ok: true, balance: await getBalance(env, user) };
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

function hasUsableImageUsage(usage) {
  return wholeTokens(usage?.input_tokens) > 0 || wholeTokens(usage?.output_tokens) > 0;
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

function usdToCredits(usd) {
  const value = Math.max(0, Number(usd || 0));
  return Math.max(1, Math.ceil((value / AI_CHAT_USD_PER_CREDIT) - 1e-12));
}

function publicError(message, status) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}

function abortError(message = "Image request cancelled.") {
  const error = new Error(message);
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
