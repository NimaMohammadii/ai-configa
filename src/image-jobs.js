import { editImage, generateImage } from "./gpt.js";
import { deleteMessage, sendPhoto, sendPlainMessage } from "./telegram-actions.js";
import { downloadTelegramFile } from "./telegram-api.js";
import { escapeHtml } from "./ui.js";

const JOB_LIMIT = 3;
const STALE_JOB_SECONDS = 240;
const COMPLETED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export async function enqueueImageJob(env, job) {
  await ensureImageJobsTable(env);

  const now = unixNow();
  await env.DB.prepare(
    "INSERT INTO image_generation_jobs (chat_id, user_id, kind, prompt, source_file_id, language, wait_message_id, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)"
  ).bind(
    String(job.chatId),
    String(job.userId),
    job.kind === "edit" ? "edit" : "generate",
    String(job.prompt || ""),
    job.sourceFileId ? String(job.sourceFileId) : null,
    String(job.language || "en"),
    Number(job.waitMessageId || 0) || null,
    now,
    now,
  ).run();
}

export async function processPendingImageJobs(env) {
  await ensureImageJobsTable(env);

  const now = unixNow();
  await env.DB.prepare(
    "UPDATE image_generation_jobs SET status = 'pending', updated_at = ? WHERE status = 'processing' AND updated_at < ?"
  ).bind(now, now - STALE_JOB_SECONDS).run();

  const pending = await env.DB.prepare(
    "SELECT id, chat_id, user_id, kind, prompt, source_file_id, language, wait_message_id FROM image_generation_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT ?"
  ).bind(JOB_LIMIT).all();

  const claimed = [];
  for (const job of pending?.results || []) {
    const result = await env.DB.prepare(
      "UPDATE image_generation_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(now, job.id).run();

    if (Number(result?.meta?.changes || 0) > 0) {
      claimed.push(job);
    }
  }

  await Promise.allSettled(claimed.map((job) => processImageJob(env, job)));

  await env.DB.prepare(
    "DELETE FROM image_generation_jobs WHERE status IN ('completed', 'failed') AND updated_at < ?"
  ).bind(now - COMPLETED_JOB_RETENTION_SECONDS).run();
}

async function processImageJob(env, job) {
  try {
    let output;

    if (job.kind === "edit") {
      if (!job.source_file_id) throw new Error("The source image is missing.");
      const source = await downloadTelegramFile(env, job.source_file_id);
      output = await editImage(env, job.prompt, source.buffer, source.filename, source.mimeType);
    } else {
      output = await generateImage(env, job.prompt);
    }

    await sendPhoto(
      env,
      job.chat_id,
      output,
      job.kind === "edit" ? "vexa-edited-image.png" : "vexa-image.png",
      imageCaption(job.prompt, job.language),
    );

    await deleteWaitMessage(env, job);
    await finishJob(env, job.id, "completed", "");
  } catch (error) {
    const message = String(error?.message || localizedImageError(job.language)).slice(0, 1000);
    await deleteWaitMessage(env, job);
    await sendPlainMessage(env, job.chat_id, message).catch(() => null);
    await finishJob(env, job.id, "failed", message);
  }
}

async function deleteWaitMessage(env, job) {
  if (!job.wait_message_id) return;
  await deleteMessage(env, job.chat_id, Number(job.wait_message_id)).catch(() => null);
}

async function finishJob(env, id, status, errorMessage) {
  await env.DB.prepare(
    "UPDATE image_generation_jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?"
  ).bind(status, errorMessage || null, unixNow(), id).run();
}

async function ensureImageJobsTable(env) {
  if (!env.DB) throw new Error("Database is not configured.");

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS image_generation_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL, source_file_id TEXT, language TEXT NOT NULL DEFAULT 'en', wait_message_id INTEGER, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_status ON image_generation_jobs (status, id)"
  ).run();
}

function imageCaption(prompt, language) {
  const cleanPrompt = String(prompt || "").slice(0, 850);
  const label = language === "fa" ? "ساخته‌شده با GPT Image 2" : "Generated with GPT Image 2";
  return "🎨 " + label + "\n\n" + escapeHtml(cleanPrompt);
}

function localizedImageError(language) {
  return language === "fa"
    ? "ساخت یا ویرایش تصویر ناموفق بود. دوباره تلاش کن."
    : "Image generation or editing failed. Please try again.";
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}
