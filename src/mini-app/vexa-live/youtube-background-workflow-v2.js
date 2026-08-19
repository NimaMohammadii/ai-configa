import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { handleYouTubePlaybackRequest } from "./youtube-range-playback.js";

const PLAYBACK_PATH = "/mini-app/live/api/youtube-playback";
const STORAGE_PREFIX = "vexa-downloads/";
const FILE_NAME = "Vexa-YouTube-video.mp4";
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const PROGRESS_REPORT_BYTES = 2 * 1024 * 1024;
const PROGRESS_REPORT_MS = 900;

export class VexaYouTubeDownloadWorkflowV2 extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    const session = cleanToken(payload.session);
    const playbackToken = cleanToken(payload.playbackToken);
    const userId = String(payload.userId || "").trim();
    const totalBytes = positiveInteger(payload.totalBytes);

    if (!session || !playbackToken || !userId || !totalBytes) {
      throw new NonRetryableError("YouTube download workflow payload is invalid");
    }
    if (!this.env.EXPLORE_MEDIA) {
      throw new NonRetryableError("R2 media storage is unavailable");
    }

    const r2Key = storageKey(session);

    try {
      await step.do("mark video staging v2", async () => {
        await writeProgress(this.env, session, 0, "staging", "");
        return { session, status: "staging" };
      });

      await step.do(
        "stage YouTube video in R2 v2",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "linear" },
          timeout: "30 minutes",
        },
        async () => {
          await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);

          const internalRequest = new Request(
            "https://vexa.internal" + PLAYBACK_PATH + "?token=" + encodeURIComponent(playbackToken),
            { method: "GET", headers: { Accept: "video/mp4" } },
          );
          const upstream = await handleYouTubePlaybackRequest(internalRequest, this.env);
          if (!upstream.ok || !upstream.body) {
            let detail = "";
            try { detail = await upstream.text(); } catch (error) {}
            throw new Error(detail || "Could not read the prepared YouTube video");
          }

          let received = 0;
          let lastReportedBytes = 0;
          let lastReportedAt = Date.now();
          const env = this.env;

          const counted = upstream.body.pipeThrough(new TransformStream({
            async transform(chunk, controller) {
              const size = Number(chunk?.byteLength || 0);
              if (!size) return;
              received += size;
              if (received > totalBytes) {
                throw new Error("YouTube stream exceeded the expected video size");
              }

              const nowMs = Date.now();
              if (
                (received - lastReportedBytes) >= PROGRESS_REPORT_BYTES ||
                (nowMs - lastReportedAt) >= PROGRESS_REPORT_MS
              ) {
                lastReportedBytes = received;
                lastReportedAt = nowMs;
                await writeProgress(
                  env,
                  session,
                  Math.min(received, totalBytes),
                  "staging",
                  "",
                );
              }
              controller.enqueue(chunk);
            },
          }));

          // R2 needs a stream whose length is known by the Workers runtime.
          // We already know the exact media size from the playback preparation step,
          // so enforce that byte count here. FixedLengthStream also rejects truncated
          // or oversized upstream data instead of allowing a corrupt object into R2.
          const fixed = new FixedLengthStream(totalBytes);
          const pumpPromise = counted.pipeTo(fixed.writable);
          const putPromise = this.env.EXPLORE_MEDIA.put(r2Key, fixed.readable, {
            httpMetadata: {
              contentType: "video/mp4",
              contentDisposition: 'attachment; filename="' + FILE_NAME + '"',
              cacheControl: "private, max-age=3600",
            },
            customMetadata: {
              vexaSession: session,
              vexaUser: userId,
              expectedBytes: String(totalBytes),
            },
          });

          let object;
          try {
            [object] = await Promise.all([putPromise, pumpPromise]);
          } catch (error) {
            await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
            throw error;
          }

          if (!object || Number(object.size || 0) !== totalBytes || received !== totalBytes) {
            await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
            throw new Error(
              "Staged video size mismatch: expected " + totalBytes + ", received " + received,
            );
          }

          const readyUntil = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
          await markReady(this.env, session, totalBytes, readyUntil);
          return { key: r2Key, size: totalBytes };
        },
      );

      await step.sleep("keep staged video available v2", "2 hours");

      await step.do("expire staged video v2", async () => {
        await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
        await markExpired(this.env, session);
        return { session, status: "expired" };
      });

      return { session, status: "expired" };
    } catch (error) {
      const raw = String(error?.stack || error?.message || error || "");
      console.error("Vexa YouTube background workflow v2 failed", raw);
      const message = publicWorkflowError(error);
      await this.env.EXPLORE_MEDIA.delete(r2Key).catch(() => null);
      await writeProgress(this.env, session, 0, "failed", message).catch(() => null);
      throw new NonRetryableError(message);
    }
  }
}

async function writeProgress(env, session, downloadedBytes, status, error) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET downloaded_bytes = ?, status = ?, error = ?, updated_at = ? WHERE session = ?"
  ).bind(
    Math.max(0, Number(downloadedBytes || 0)),
    String(status || "queued"),
    error ? String(error).slice(0, 500) : null,
    now,
    session,
  ).run();
}

async function markReady(env, session, totalBytes, expiresAt) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET downloaded_bytes = ?, status = 'ready', error = NULL, updated_at = ?, expires_at = ? " +
    "WHERE session = ?"
  ).bind(totalBytes, now, expiresAt, session).run();
}

async function markExpired(env, session) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE vexa_youtube_download_progress " +
    "SET status = 'expired', updated_at = ?, expires_at = ? WHERE session = ?"
  ).bind(now, now, session).run();
}

function storageKey(session) {
  return STORAGE_PREFIX + session + ".mp4";
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function publicWorkflowError(error) {
  const message = String(error?.message || "");
  if (/10033|known length|content.?length/i.test(message)) {
    return "R2 rejected the video stream length";
  }
  if (/403|forbidden|blocked/i.test(message)) {
    return "YouTube blocked the download request";
  }
  if (/authorization|po token|proof.of.origin/i.test(message)) {
    return "YouTube requires additional playback authorization";
  }
  if (/fixed.?length|size mismatch|expected video size|ended before|exceeded|too few|too many/i.test(message)) {
    return "Video download ended before the complete file was prepared";
  }
  if (/expired/i.test(message)) {
    return "Video session expired. Open the video again.";
  }
  return "Background video preparation failed";
}
