import { Container, getContainer } from "@cloudflare/containers";
import {
  getElevenApiSetting,
  getMiniAppAccessSettings,
  isAdmin,
} from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";

const SOCKET_PATH = "/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH = "/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION = "20260819-7";
const TRANSLATION_MODEL = "gpt-5.6-luna";
const TRANSLATE_TIMEOUT_MS = 12_000;
const LIVE_TRANSLATE_MIN_INTERVAL_MS = 850;
const MANUAL_COMMIT_SECONDS = 24;
const CONTEXT_CHAR_LIMIT = 1_200;
const LIVE_CONTEXT_CHAR_LIMIT = 900;
const LIVE_TAIL_MAX_WORDS = 16;
const LIVE_TAIL_MAX_CHARS = 150;
const PCM_SAMPLE_RATE = 16_000;
const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2;
const PCM_FRAME_BYTES = 3_200;
const ORIGINAL_AHEAD_SECONDS = 2.8;
const TRANSLATED_AHEAD_SECONDS = 4.8;
const FAST_CATCHUP_UNTIL_SECONDS = 2.8;

const TARGET_LANGUAGES = Object.freeze({
  original: "Original",
  en: "English",
  fa: "Persian",
  ru: "Russian",
  de: "German",
  tr: "Turkish",
  es: "Spanish",
  ar: "Arabic",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
});

const FATAL_SCRIBE_ERRORS = new Set([
  "auth_error",
  "quota_exceeded",
  "input_error",
  "unaccepted_terms",
  "chunk_size_exceeded",
  "invalid_request",
]);

const RETRYABLE_SCRIBE_ERRORS = new Set([
  "error",
  "transcriber_error",
  "commit_throttled",
  "rate_limited",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "insufficient_audio_activity",
]);

export class VexaSubtitleContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudioProcesses = new Map();

  async streamAudioPcm(mediaUrl, startSeconds, streamId) {
    if (!this.ctx.container.running) await this.start();
    const id = cleanStreamId(streamId);
    if (!id) throw new Error("Subtitle audio stream id is invalid");

    const prior = this.activeAudioProcesses.get(id);
    if (prior) {
      try { prior.kill(); } catch (error) {}
      this.activeAudioProcesses.delete(id);
    }

    const process = await this.ctx.container.exec([
      "ffmpeg",
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      Number(startSeconds || 0).toFixed(3),
      "-i",
      String(mediaUrl),
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(PCM_SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      "-f",
      "s16le",
      "pipe:1",
    ]);

    if (!process.stdout) {
      try { process.kill(); } catch (error) {}
      throw new Error("Could not start realtime subtitle audio");
    }

    this.activeAudioProcesses.set(id, process);
    process.exitCode
      .catch(() => -1)
      .finally(() => {
        if (this.activeAudioProcesses.get(id) === process) {
          this.activeAudioProcesses.delete(id);
        }
      });
    return process.stdout;
  }

  async stopAudioStream(streamId) {
    const id = cleanStreamId(streamId);
    if (!id) return false;
    const process = this.activeAudioProcesses.get(id);
    if (!process) return false;
    this.activeAudioProcesses.delete(id);
    try { process.kill(); } catch (error) {}
    return true;
  }
}

export function isVexaLiveSubtitlesRequest(request) {
  const path = new URL(request.url).pathname;
  return path === SOCKET_PATH || path === RUNTIME_PATH;
}

export async function handleVexaLiveSubtitlesRequest(request, env, ctx) {
  const path = new URL(request.url).pathname;

  if (request.method === "GET" && path === RUNTIME_PATH) {
    return new Response(LIVE_SUBTITLES_RUNTIME_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (request.method === "GET" && path === SOCKET_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("WebSocket Required", { status: 426 });
    }
    return createRealtimeSubtitleSocket(request, env, ctx);
  }

  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendVexaLiveSubtitlesRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const tag = '<script src="' + RUNTIME_PATH + '?v=' + RUNTIME_VERSION + '"></script>';
  const html = source.includes(RUNTIME_PATH)
    ? source
    : source.includes("</body>")
      ? source.replace("</body>", tag + "\n</body>")
      : source + tag;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createRealtimeSubtitleSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const abortController = new AbortController();
  let started = false;
  let control = null;

  const send = (value) => {
    if (server.readyState !== WebSocket.OPEN) return;
    try { server.send(JSON.stringify(value)); } catch (error) {}
  };

  const abort = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };

  const fail = (error) => {
    if (abortController.signal.aborted) return;
    console.error("Vexa realtime subtitle session failed", error?.stack || error);
    send({
      type: "error",
      error: publicError(error),
      retryable: isRetryableSessionError(error),
    });
    abort();
    try { server.close(1011, "subtitle session failed"); } catch (closeError) {}
  };

  server.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
    const type = String(message?.type || "");

    if (type === "start") {
      if (started) return;
      started = true;
      control = {
        playbackTime: finiteNumber(message.currentTime, 0, 86_400) ?? 0,
        partialText: "",
      };
      runRealtimeSubtitleSession({
        request,
        env,
        server,
        payload: message,
        control,
        signal: abortController.signal,
        send,
        abort,
      }).catch(fail);
      return;
    }

    if (type === "sync" && control) {
      const currentTime = finiteNumber(message.currentTime, 0, 86_400);
      if (currentTime !== null) control.playbackTime = currentTime;
      return;
    }

    if (type === "stop") {
      abort();
      try { server.close(1000, "stopped"); } catch (error) {}
    }
  });

  server.addEventListener("close", abort);
  server.addEventListener("error", abort);
  return new Response(null, { status: 101, webSocket: client });
}

async function runRealtimeSubtitleSession({
  request,
  env,
  server,
  payload,
  control,
  signal,
  send,
  abort,
}) {
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);

  const token = cleanToken(payload.playbackToken);
  if (!token) throw httpError("Video session is invalid", 400);
  const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
  if (!targetLanguage || targetLanguage === "off") {
    throw httpError("Subtitle language is invalid", 400);
  }
  const start = finiteNumber(payload.currentTime, 0, 86_400);
  if (start === null) throw httpError("Subtitle start time is invalid", 400);
  control.playbackTime = start;

  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?"
  ).bind(token).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) {
    throw httpError("Video session expired. Open the video again.", 410);
  }
  if (String(row.user_id) !== String(user.id)) {
    throw httpError("Video session does not belong to this user", 403);
  }
  if (!env.VEXA_SUBTITLES) throw httpError("Live subtitles are unavailable", 503);

  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw httpError("Speech-to-text is unavailable", 503);

  const scribeUrl = new URL("https://api.elevenlabs.io/v1/speech-to-text/realtime");
  scribeUrl.searchParams.set("model_id", "scribe_v2_realtime");
  scribeUrl.searchParams.set("audio_format", "pcm_16000");
  scribeUrl.searchParams.set("commit_strategy", "manual");

  const upstreamResponse = await fetch(scribeUrl, {
    headers: {
      Upgrade: "websocket",
      "xi-api-key": apiKey,
    },
  });
  const upstream = upstreamResponse.webSocket;
  if (!upstream || upstreamResponse.status !== 101) {
    throw httpError("Realtime transcription connection is unavailable", 502);
  }
  upstream.accept();

  const streamId = crypto.randomUUID();
  const playbackUrl = new URL(
    "/mini-app/live/api/youtube-playback?token=" + encodeURIComponent(token),
    request.url,
  ).href;
  const container = getContainer(env.VEXA_SUBTITLES, "subtitle-" + safeContainerKey(user.id));
  const maxAheadSeconds = targetLanguage === "original"
    ? ORIGINAL_AHEAD_SECONDS
    : TRANSLATED_AHEAD_SECONDS;

  let audioStream = null;
  let audioSecondsSent = 0;
  let sourceContext = "";
  let segmentIndex = 0;
  let segmentStartAudio = 0;
  let lastCommitSentAudio = 0;
  let commitPending = false;
  let revision = 0;
  let latestPreviewJob = null;
  let previewLoopPromise = null;
  let lastPreviewRequestAt = 0;
  let lastRequestedSource = "";
  let lastRequestedSlot = "";
  let lastTranslation = "";
  let upstreamEndedNormally = false;
  let currentLiveSlot = "";
  let currentLiveSource = "";
  let currentLiveStart = 0;
  let currentLiveEnd = 0;

  const closeUpstream = () => {
    try { upstream.close(1000, "done"); } catch (error) {}
  };
  signal.addEventListener("abort", closeUpstream, { once: true });

  const startPreviewLoop = () => {
    if (previewLoopPromise || signal.aborted) return;
    previewLoopPromise = (async () => {
      while (latestPreviewJob && !signal.aborted && server.readyState === WebSocket.OPEN) {
        const job = latestPreviewJob;
        latestPreviewJob = null;

        if (
          job.sourceText === lastRequestedSource &&
          job.slot === lastRequestedSlot &&
          lastTranslation
        ) {
          if (job.revision === revision) {
            send({
              type: "preview",
              slot: job.slot,
              start: job.start,
              end: job.end,
              text: lastTranslation,
              revision: job.revision,
              complete: true,
            });
          }
          continue;
        }

        const waitMs = Math.max(
          0,
          LIVE_TRANSLATE_MIN_INTERVAL_MS - (Date.now() - lastPreviewRequestAt),
        );
        if (waitMs > 0) await sleep(waitMs, signal);
        if (signal.aborted) break;
        lastPreviewRequestAt = Date.now();

        let finalText = "";
        try {
          finalText = await streamLiveSubtitleTranslation({
            env,
            sourceText: job.sourceText,
            context: job.context,
            targetLanguage,
            signal,
            stillRelevant: () => liveJobStillRelevant(job, currentLiveSlot, currentLiveSource),
            onText: (text) => {
              if (signal.aborted || !text || !liveJobStillRelevant(job, currentLiveSlot, currentLiveSource)) return;
              send({
                type: "preview",
                slot: job.slot,
                start: currentLiveSlot === job.slot ? Math.min(job.start, currentLiveStart || job.start) : job.start,
                end: currentLiveSlot === job.slot ? Math.max(job.end, currentLiveEnd || job.end) : job.end,
                text,
                revision: job.revision,
                complete: false,
              });
            },
          });
        } catch (error) {
          if (!signal.aborted) {
            console.error("Vexa live Luna preview translation failed", error?.stack || error);
          }
          continue;
        }

        if (finalText) {
          lastRequestedSource = job.sourceText;
          lastRequestedSlot = job.slot;
          lastTranslation = finalText;
        }
        if (finalText && liveJobStillRelevant(job, currentLiveSlot, currentLiveSource)) {
          send({
            type: "preview",
            slot: job.slot,
            start: currentLiveSlot === job.slot ? Math.min(job.start, currentLiveStart || job.start) : job.start,
            end: currentLiveSlot === job.slot ? Math.max(job.end, currentLiveEnd || job.end) : job.end,
            text: finalText,
            revision: job.revision,
            complete: true,
          });
        }
      }
    })().finally(() => {
      previewLoopPromise = null;
      if (latestPreviewJob && !signal.aborted) startPreviewLoop();
    });
  };

  const publishLiveText = (rawText) => {
    const text = cleanSubtitleText(rawText);
    if (!text) return;
    control.partialText = text;
    const tail = extractLiveTail(text);
    if (!tail.text) return;

    revision += 1;
    const timing = estimateLiveTiming({
      baseStart: start,
      audioSecondsSent,
      segmentStartAudio,
      text: tail.text,
    });
    const slot = String(segmentIndex) + ":" + String(tail.clauseIndex);
    currentLiveSlot = slot;
    currentLiveSource = tail.text;
    currentLiveStart = timing.start;
    currentLiveEnd = timing.end;

    if (targetLanguage === "original") {
      send({
        type: "preview",
        slot,
        start: timing.start,
        end: timing.end,
        text: tail.text,
        revision,
        complete: true,
      });
      return;
    }

    latestPreviewJob = {
      slot,
      revision,
      start: timing.start,
      end: timing.end,
      sourceText: tail.text,
      context: appendContext(sourceContext, tail.prefix).slice(-LIVE_CONTEXT_CHAR_LIMIT),
    };
    startPreviewLoop();
  };

  upstream.addEventListener("message", (event) => {
    if (signal.aborted) return;
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
    const type = String(message?.message_type || "");

    if (type === "session_started") return;

    if (type === "partial_transcript" || type === "final_transcript") {
      publishLiveText(message?.text);
      return;
    }

    if (type === "committed_transcript") {
      const committed = cleanSubtitleText(message?.text);
      if (committed) {
        publishLiveText(committed);
        sourceContext = appendContext(sourceContext, committed);
      }
      control.partialText = "";
      if (commitPending) {
        segmentStartAudio = lastCommitSentAudio;
        segmentIndex += 1;
        commitPending = false;
      }
      return;
    }

    if (type === "committed_transcript_with_timestamps") return;

    if (FATAL_SCRIBE_ERRORS.has(type) || RETRYABLE_SCRIBE_ERRORS.has(type) || type === "error") {
      const detail = String(message?.error || message?.message || "Realtime transcription failed");
      const retryable = !FATAL_SCRIBE_ERRORS.has(type);
      send({ type: "error", error: publicScribeError(type, detail), retryable });
      abort();
      try { upstream.close(1011, "scribe error"); } catch (error) {}
      try { server.close(1011, "scribe error"); } catch (error) {}
    }
  });

  upstream.addEventListener("error", () => {
    if (signal.aborted) return;
    send({ type: "error", error: "Realtime transcription connection failed", retryable: true });
    abort();
    try { server.close(1011, "scribe connection failed"); } catch (error) {}
  });

  upstream.addEventListener("close", () => {
    if (signal.aborted || upstreamEndedNormally) return;
    send({ type: "error", error: "Realtime transcription connection closed", retryable: true });
    abort();
    try { server.close(1011, "scribe connection closed"); } catch (error) {}
  });

  try {
    audioStream = await container.streamAudioPcm(playbackUrl, start, streamId);
    if (!audioStream) throw httpError("Could not start realtime subtitle audio", 502);

    audioSecondsSent = await streamPcmToScribe({
      audioStream,
      upstream,
      control,
      baseStart: start,
      maxAheadSeconds,
      signal,
      onProgress: (seconds) => { audioSecondsSent = seconds; },
      shouldCommit: (nextAudioSeconds) => {
        if (commitPending || !control.partialText) return false;
        if (nextAudioSeconds - lastCommitSentAudio < MANUAL_COMMIT_SECONDS) return false;
        commitPending = true;
        lastCommitSentAudio = nextAudioSeconds;
        return true;
      },
    });

    if (!signal.aborted && upstream.readyState === WebSocket.OPEN) {
      if (!commitPending && (control.partialText || audioSecondsSent - lastCommitSentAudio > 0.5)) {
        commitPending = true;
        lastCommitSentAudio = audioSecondsSent;
        const silence = new Uint8Array(PCM_FRAME_BYTES);
        upstream.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: bytesToBase64(silence),
          sample_rate: PCM_SAMPLE_RATE,
          commit: true,
        }));
      }
      await sleep(1_100, signal).catch(() => null);
      if (previewLoopPromise) await previewLoopPromise.catch(() => null);
      upstreamEndedNormally = true;
      if (!signal.aborted) send({ type: "ended" });
    }
  } finally {
    signal.removeEventListener("abort", closeUpstream);
    if (audioStream) {
      try { await audioStream.cancel(); } catch (error) {}
    }
    try { await container.stopAudioStream(streamId); } catch (error) {}
    closeUpstream();
  }
}

async function streamPcmToScribe({
  audioStream,
  upstream,
  control,
  baseStart,
  maxAheadSeconds,
  signal,
  onProgress,
  shouldCommit,
}) {
  const reader = audioStream.getReader();
  let pending = new Uint8Array(0);
  let bytesSent = 0;

  const abortReader = () => {
    try { reader.cancel(); } catch (error) {}
  };
  signal.addEventListener("abort", abortReader, { once: true });

  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      pending = concatBytes(pending, next.value);

      while (pending.byteLength >= PCM_FRAME_BYTES && !signal.aborted) {
        const frame = pending.slice(0, PCM_FRAME_BYTES);
        pending = pending.slice(PCM_FRAME_BYTES);

        await waitForSubtitleLead({
          control,
          absoluteAudioTime: baseStart + bytesSent / PCM_BYTES_PER_SECOND,
          frameSeconds: frame.byteLength / PCM_BYTES_PER_SECOND,
          maxAheadSeconds,
          signal,
        });
        if (signal.aborted) return bytesSent / PCM_BYTES_PER_SECOND;
        if (upstream.readyState !== WebSocket.OPEN) {
          throw httpError("Realtime transcription connection closed", 502);
        }

        const nextAudioSeconds = (bytesSent + frame.byteLength) / PCM_BYTES_PER_SECOND;
        const message = {
          message_type: "input_audio_chunk",
          audio_base_64: bytesToBase64(frame),
          sample_rate: PCM_SAMPLE_RATE,
        };
        if (shouldCommit?.(nextAudioSeconds)) message.commit = true;
        upstream.send(JSON.stringify(message));
        bytesSent += frame.byteLength;
        onProgress?.(bytesSent / PCM_BYTES_PER_SECOND);
      }
    }

    if (pending.byteLength && !signal.aborted && upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: bytesToBase64(pending),
        sample_rate: PCM_SAMPLE_RATE,
      }));
      bytesSent += pending.byteLength;
      onProgress?.(bytesSent / PCM_BYTES_PER_SECOND);
    }
    return bytesSent / PCM_BYTES_PER_SECOND;
  } finally {
    signal.removeEventListener("abort", abortReader);
    try { await reader.cancel(); } catch (error) {}
  }
}

async function waitForSubtitleLead({
  control,
  absoluteAudioTime,
  frameSeconds,
  maxAheadSeconds,
  signal,
}) {
  while (!signal.aborted) {
    const ahead = absoluteAudioTime - Number(control.playbackTime || 0);
    if (ahead <= maxAheadSeconds) {
      const speed = ahead < FAST_CATCHUP_UNTIL_SECONDS ? 2.0 : 1.04;
      await sleep(Math.max(20, (frameSeconds / speed) * 1000), signal);
      return;
    }
    await sleep(60, signal);
  }
}

function liveJobStillRelevant(job, currentSlot, currentSource) {
  if (!job || !currentSlot || job.slot !== currentSlot) return false;
  const previous = cleanSubtitleText(job.sourceText);
  const current = cleanSubtitleText(currentSource);
  if (!previous || !current) return false;
  if (previous === current || current.startsWith(previous) || previous.startsWith(current)) return true;
  const limit = Math.min(previous.length, current.length);
  let common = 0;
  while (common < limit && previous[common] === current[common]) common += 1;
  return common >= Math.min(12, Math.floor(limit * 0.55));
}

function extractLiveTail(value) {
  const text = cleanSubtitleText(value);
  if (!text) return { text: "", prefix: "", clauseIndex: 0 };

  const boundaryRegex = /[.!?…؟。！]\s*/gu;
  const boundaries = [];
  let match;
  while ((match = boundaryRegex.exec(text))) {
    boundaries.push(match.index + match[0].length);
  }

  let start = boundaries.length ? boundaries[boundaries.length - 1] : 0;
  let live = text.slice(start).trim();
  let prefix = text.slice(0, start).trim();
  let clauseIndex = boundaries.length;

  if (!live && boundaries.length) {
    const previousStart = boundaries.length > 1 ? boundaries[boundaries.length - 2] : 0;
    live = text.slice(previousStart).trim();
    prefix = text.slice(0, previousStart).trim();
    clauseIndex = Math.max(0, boundaries.length - 1);
  }

  const words = live.split(/\s+/u).filter(Boolean);
  if (words.length > LIVE_TAIL_MAX_WORDS) {
    const kept = words.slice(-LIVE_TAIL_MAX_WORDS).join(" ");
    const cut = live.lastIndexOf(kept);
    if (cut > 0) prefix = appendContext(prefix, live.slice(0, cut));
    live = kept;
  }
  if (live.length > LIVE_TAIL_MAX_CHARS) {
    const cut = live.length - LIVE_TAIL_MAX_CHARS;
    prefix = appendContext(prefix, live.slice(0, cut));
    live = live.slice(cut).replace(/^\S*\s*/u, "").trim() || live.slice(cut).trim();
  }

  return { text: live, prefix, clauseIndex };
}

function estimateLiveTiming({ baseStart, audioSecondsSent, segmentStartAudio, text }) {
  const words = String(text || "").trim().split(/\s+/u).filter(Boolean).length;
  const estimatedDuration = Math.min(4.8, Math.max(1.1, words * 0.36 + 0.45));
  const relativeStart = Math.max(
    Number(segmentStartAudio || 0),
    Number(audioSecondsSent || 0) - estimatedDuration,
  );
  return {
    start: roundTime(Number(baseStart || 0) + relativeStart),
    end: roundTime(Number(baseStart || 0) + Number(audioSecondsSent || 0) + 1.25),
  };
}

async function streamLiveSubtitleTranslation({
  env,
  sourceText,
  context,
  targetLanguage,
  signal,
  stillRelevant,
  onText,
}) {
  if (!env.GPT_API) throw httpError("AI translation is unavailable", 503);
  const languageName = TARGET_LANGUAGES[targetLanguage];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  const abortFromSession = () => controller.abort();
  signal?.addEventListener?.("abort", abortFromSession, { once: true });

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GPT_API,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        instructions: [
          "Translate ONLY the current live video subtitle into " + languageName + ".",
          "Write like natural everyday speech. Never sound formal, literary, bureaucratic, or bookish.",
          "Preserve the speaker's tone, slang, jokes, names, numbers, and implied meaning.",
          "The context is only for understanding pronouns and meaning. Never repeat context that is not in the current subtitle.",
          "The current subtitle may be incomplete because it is live. Translate only what is actually present and never invent the missing ending.",
          "Keep it short and easy to read on a phone.",
          "Use very light punctuation. Do not add a period or full stop at the end. Keep question or exclamation marks only when they carry meaning.",
          "Return only the translation. No quotes, labels, markdown, explanations, or alternatives.",
        ].join(" "),
        input: JSON.stringify({
          previous_source_context: String(context || "").slice(-LIVE_CONTEXT_CHAR_LIMIT),
          current_live_subtitle: String(sourceText || "").slice(0, LIVE_TAIL_MAX_CHARS),
          target_language: languageName,
        }),
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: 120,
        store: false,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("Vexa Luna live translation request failed", response.status, detail.slice(0, 900));
      throw httpError("AI translation is temporarily unavailable", 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let output = "";

    while (!controller.signal.aborted) {
      if (typeof stillRelevant === "function" && !stillRelevant()) {
        try { await reader.cancel(); } catch (error) {}
        return "";
      }
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true }).replace(/\r\n/g, "\n");

      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = block.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          let event;
          try { event = JSON.parse(raw); } catch (error) { continue; }
          if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
            output += event.delta;
            const cleaned = cleanLiveTranslatedSubtitle(output);
            if (cleaned) onText?.(cleaned);
          } else if (event?.type === "error") {
            throw new Error(String(event?.error?.message || event?.message || "Live translation failed"));
          }
        }
      }
    }

    return cleanTranslatedSubtitle(output);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw httpError("Live translation timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abortFromSession);
  }
}

async function selectedElevenApiKey(env) {
  const selectedKeyName = await getElevenApiSetting(env);
  return String(env[selectedKeyName] || "").trim();
}

async function assertLiveAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
  const [globalAccess, liveAccess] = await Promise.all([
    getMiniAppAccessSettings(env),
    getVexaLiveAccessSettings(env),
  ]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) {
    throw httpError("Vexa Live is updating", 423);
  }
}

function normalizeTargetLanguage(value) {
  const key = String(value || "original").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES, key) ? key : "";
}

function cleanToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
}

function cleanStreamId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : "";
}

function safeContainerKey(value) {
  const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "anonymous").slice(0, 80);
}

function finiteNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function roundTime(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function cleanSubtitleText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?،؛؟])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLiveTranslatedSubtitle(value) {
  return cleanSubtitleText(value)
    .replace(/^["“”'‘’]+/u, "")
    .replace(/["“”'‘’]+$/u, "")
    .replace(/([!?؟])\1+/g, "$1")
    .replace(/\s*[.。\u06D4]+$/u, "")
    .trim();
}

function cleanTranslatedSubtitle(value) {
  return cleanLiveTranslatedSubtitle(value)
    .replace(/\s*[;؛]+\s*$/u, "")
    .trim();
}

function appendContext(current, next) {
  return cleanSubtitleText((String(current || "") + " " + String(next || "")).trim())
    .slice(-CONTEXT_CHAR_LIMIT);
}

function publicScribeError(type, detail) {
  if (type === "quota_exceeded") return "Speech-to-text quota is unavailable";
  if (type === "rate_limited") return "Live subtitles are temporarily rate limited";
  if (type === "unaccepted_terms") return "Scribe realtime terms must be accepted in ElevenLabs";
  if (type === "session_time_limit_exceeded") return "Live subtitle session reached its time limit";
  if (type === "auth_error") return "Realtime transcription authentication failed";
  console.error("Vexa Scribe realtime error", type, String(detail || "").slice(0, 700));
  return "Realtime transcription is temporarily unavailable";
}

function isRetryableSessionError(error) {
  const message = String(error?.message || "");
  if (message === "AI translation is unavailable" || message === "Speech-to-text is unavailable") return false;
  const status = Number(error?.status || 500);
  return status >= 500 || status === 429;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(bytes.byteLength, offset + 0x8000)),
    );
  }
  return btoa(binary);
}

function concatBytes(left, right) {
  if (!left.byteLength) return right.slice();
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.("abort", onAbort);
      fn();
    };
    const timer = setTimeout(() => finish(resolve), Math.max(0, Number(ms || 0)));
    const onAbort = () => {
      clearTimeout(timer);
      finish(() => reject(new Error("aborted")));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicError(error) {
  const status = Number(error?.status || 500);
  if (status >= 400 && status < 500) return String(error?.message || "Request failed");
  const message = String(error?.message || "");
  if (/translation|transcription|speech-to-text/i.test(message)) return message;
  return "Live subtitles are temporarily unavailable";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const LIVE_SUBTITLES_RUNTIME_JS = String.raw`
(function () {
  const SOCKET_PATH = "/mini-app/live/api/youtube-subtitles/realtime";
  const PLAYER_ID = "vexaCustomPlayer";
  const STYLE_ID = "vexaLiveSubtitlesStyle";
  const LANGUAGES = [
    ["off", "Off", ""],
    ["original", "Original audio", "Auto"],
    ["en", "English", "EN"],
    ["fa", "فارسی", "FA"],
    ["ru", "Русский", "RU"],
    ["de", "Deutsch", "DE"],
    ["tr", "Türkçe", "TR"],
    ["es", "Español", "ES"],
    ["ar", "العربية", "AR"],
    ["fr", "Français", "FR"],
    ["pt", "Português", "PT"],
    ["it", "Italiano", "IT"],
    ["hi", "हिन्दी", "HI"],
    ["zh", "中文", "ZH"],
    ["ja", "日本語", "JA"],
    ["ko", "한국어", "KO"],
  ];

  let enabled = false;
  let targetLanguage = "original";
  let socket = null;
  let socketGeneration = 0;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let syncTimer = 0;
  let renderTimer = 0;
  const slots = new Map();

  function hostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) {
        return window.parent;
      }
    } catch (error) {}
    return window;
  }

  function telegram() {
    const host = hostWindow();
    return window.Telegram?.WebApp || host.Telegram?.WebApp || null;
  }

  function initData() { return String(telegram()?.initData || ""); }
  function haptic(style) {
    try { telegram()?.HapticFeedback?.impactOccurred?.(style || "light"); } catch (error) {}
  }

  function playbackToken(video) {
    try {
      const token = new URL(
        String(video?.currentSrc || video?.src || ""),
        window.location.origin,
      ).searchParams.get("token") || "";
      return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : "";
    } catch (error) {
      return "";
    }
  }

  function websocketUrl() {
    const url = new URL(SOCKET_PATH, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#vexaCustomPlayer .vexa-subtitle-toggle.is-active{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}" +
      "#vexaCustomPlayer .vexa-subtitle-layer{position:absolute;left:7%;right:7%;bottom:70px;z-index:8;display:flex;justify-content:center;pointer-events:none;transition:bottom .2s ease}" +
      "#vexaCustomPlayer.is-controls-hidden .vexa-subtitle-layer{bottom:28px}" +
      "#vexaCustomPlayer .vexa-subtitle-text{max-width:min(780px,92%);padding:7px 11px;border-radius:10px;color:#fff;background:rgba(0,0,0,.66);box-shadow:0 7px 28px rgba(0,0,0,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:clamp(15px,3.8vw,22px);line-height:1.32;font-weight:760;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.75);opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}" +
      "#vexaCustomPlayer .vexa-subtitle-text.show{opacity:1;transform:none}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.46);opacity:0;pointer-events:none;transition:opacity .2s ease}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-backdrop.show{opacity:1;pointer-events:auto}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer{position:absolute;z-index:31;left:10px;right:10px;bottom:10px;max-height:min(70%,520px);display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(15,15,17,.96);box-shadow:0 22px 60px rgba(0,0,0,.52);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);transform:translateY(calc(100% + 18px));transition:transform .32s cubic-bezier(.16,1,.3,1);overflow:hidden}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer.show{transform:none}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-head{padding:14px 15px 11px;border-bottom:1px solid rgba(255,255,255,.08)}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-title{font-size:15px;font-weight:820}" +
      "#vexaCustomPlayer .vexa-subtitle-drawer-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:10px;font-weight:650}" +
      "#vexaCustomPlayer .vexa-subtitle-language-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:7px}" +
      "#vexaCustomPlayer .vexa-subtitle-language{width:100%;height:43px;padding:0 10px;border:0;border-radius:12px;display:flex;align-items:center;gap:10px;color:#fff;background:transparent;text-align:left}" +
      "#vexaCustomPlayer .vexa-subtitle-language:active,#vexaCustomPlayer .vexa-subtitle-language.is-selected{background:rgba(255,255,255,.09)}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-code{width:34px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:820}" +
      "#vexaCustomPlayer .vexa-subtitle-lang-name{flex:1;font-size:12px;font-weight:720}" +
      "#vexaCustomPlayer .vexa-subtitle-check{opacity:0;font-size:15px}.vexa-subtitle-language.is-selected .vexa-subtitle-check{opacity:1}" +
      "#vexaCustomPlayer.is-fullscreen .vexa-subtitle-drawer{bottom:calc(10px + env(safe-area-inset-bottom))}";
    document.head.appendChild(style);
  }

  function installUI(player) {
    if (player.querySelector("[data-vexa-subtitles]")) return;
    const row = player.querySelector(".vexa-player-row");
    const spacer = row?.querySelector(".vexa-player-spacer");
    if (!row || !spacer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vexa-player-small vexa-subtitle-toggle";
    button.setAttribute("data-vexa-subtitles", "1");
    button.setAttribute("aria-label", "Live subtitles");
    button.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2 2 0 1 0 0 4M18 10a2 2 0 1 0 0 4"/></svg>';
    row.insertBefore(button, spacer);

    const layer = document.createElement("div");
    layer.className = "vexa-subtitle-layer";
    layer.innerHTML = '<div class="vexa-subtitle-text" data-subtitle-text></div>';
    player.appendChild(layer);

    const backdrop = document.createElement("div");
    backdrop.className = "vexa-subtitle-drawer-backdrop";
    backdrop.setAttribute("data-subtitle-backdrop", "1");
    player.appendChild(backdrop);

    const drawer = document.createElement("div");
    drawer.className = "vexa-subtitle-drawer";
    drawer.setAttribute("data-subtitle-drawer", "1");
    drawer.innerHTML =
      '<div class="vexa-subtitle-drawer-head"><div class="vexa-subtitle-drawer-title">Live subtitles</div><div class="vexa-subtitle-drawer-sub">Translate to</div></div>' +
      '<div class="vexa-subtitle-language-list">' +
      LANGUAGES.map(function (item) {
        return '<button type="button" class="vexa-subtitle-language" data-language="' + item[0] + '">' +
          '<span class="vexa-subtitle-lang-code">' + (item[2] || "—") + '</span>' +
          '<span class="vexa-subtitle-lang-name">' + item[1] + '</span>' +
          '<span class="vexa-subtitle-check">✓</span></button>';
      }).join("") + "</div>";
    player.appendChild(drawer);

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openDrawer(player);
    });
    backdrop.addEventListener("click", function () { closeDrawer(player); });
    drawer.addEventListener("click", function (event) {
      const option = event.target?.closest?.("[data-language]");
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      chooseLanguage(player, String(option.dataset.language || "off"));
    });
    updateLanguageSelection(player);
  }

  function openDrawer(player) {
    updateLanguageSelection(player);
    player.querySelector("[data-subtitle-backdrop]")?.classList.add("show");
    player.querySelector("[data-subtitle-drawer]")?.classList.add("show");
    haptic("light");
  }

  function closeDrawer(player) {
    player.querySelector("[data-subtitle-backdrop]")?.classList.remove("show");
    player.querySelector("[data-subtitle-drawer]")?.classList.remove("show");
  }

  function updateLanguageSelection(player) {
    const selected = enabled ? targetLanguage : "off";
    player.querySelectorAll("[data-language]").forEach(function (node) {
      node.classList.toggle("is-selected", String(node.dataset.language) === selected);
    });
    player.querySelector("[data-vexa-subtitles]")?.classList.toggle("is-active", enabled);
  }

  function chooseLanguage(player, language) {
    closeDrawer(player);
    if (language === "off") stopSubtitles(player);
    else startSubtitles(player, language);
    updateLanguageSelection(player);
    haptic("medium");
  }

  function clearLiveSlots() {
    slots.clear();
  }

  function stopSubtitles(player) {
    enabled = false;
    targetLanguage = "original";
    socketGeneration += 1;
    reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    closeSocket(true);
    clearLiveSlots();
    hideCaption(player);
  }

  function startSubtitles(player, language) {
    const video = player.querySelector("video");
    if (!video || !playbackToken(video)) return;
    enabled = true;
    targetLanguage = language;
    reconnectAttempt = 0;
    socketGeneration += 1;
    clearLiveSlots();
    hideCaption(player);
    if (!video.paused && !video.ended) connectRealtime(player, socketGeneration);
  }

  function closeSocket(intentional) {
    clearInterval(syncTimer);
    syncTimer = 0;
    const active = socket;
    socket = null;
    if (!active) return;
    active.__vexaIntentionalClose = Boolean(intentional);
    try {
      if (active.readyState === WebSocket.OPEN) {
        active.send(JSON.stringify({ type: "stop" }));
      }
    } catch (error) {}
    try { active.close(1000, "restart"); } catch (error) {}
  }

  function scheduleReconnect(player, generation) {
    if (!enabled || generation !== socketGeneration) return;
    const video = player.querySelector("video");
    if (!video || video.paused || video.ended) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(5_000, 500 * Math.pow(2, Math.min(3, reconnectAttempt++)));
    reconnectTimer = setTimeout(function () {
      connectRealtime(player, generation);
    }, delay);
  }

  function applyPreview(data, video) {
    const slot = String(data?.slot || "");
    const start = Number(data?.start);
    const end = Number(data?.end);
    const text = String(data?.text || "").trim();
    const revision = Number(data?.revision || 0);
    const complete = Boolean(data?.complete);
    if (!slot || !Number.isFinite(start) || !Number.isFinite(end) || !text || !revision) return;

    const existing = slots.get(slot);
    if (!existing) {
      const visible = complete || text.length >= 3 ? text : "";
      slots.set(slot, {
        start,
        end: Math.max(end, start + 0.3),
        text: visible,
        revision: visible ? revision : 0,
        pendingRevision: visible ? 0 : revision,
        pendingText: visible ? "" : text,
      });
    } else {
      existing.start = Math.min(existing.start, start);
      existing.end = Math.max(existing.end, end, start + 0.3);

      if (revision === existing.revision) {
        existing.text = text;
      } else if (revision > existing.revision) {
        if (existing.pendingRevision !== revision) {
          existing.pendingRevision = revision;
          existing.pendingText = text;
        } else {
          existing.pendingText = text;
        }

        const threshold = existing.text
          ? Math.max(4, Math.min(14, Math.floor(existing.text.length * 0.45)))
          : 3;
        if (complete || existing.pendingText.length >= threshold) {
          existing.text = existing.pendingText;
          existing.revision = revision;
          existing.pendingRevision = 0;
          existing.pendingText = "";
        }
      }
    }

    const current = Number(video.currentTime || 0);
    for (const [key, value] of slots) {
      if (value.end < current - 8 || value.start > current + 18) slots.delete(key);
    }
  }

  function connectRealtime(player, generation) {
    if (!enabled || generation !== socketGeneration) return;
    const video = player.querySelector("video");
    if (!video || video.paused || video.ended) return;
    const token = playbackToken(video);
    if (!token) return;

    closeSocket(true);
    const ws = new WebSocket(websocketUrl());
    socket = ws;

    ws.addEventListener("open", function () {
      if (!enabled || generation !== socketGeneration || socket !== ws) {
        try { ws.close(); } catch (error) {}
        return;
      }
      ws.send(JSON.stringify({
        type: "start",
        initData: initData(),
        playbackToken: token,
        currentTime: Math.max(0, Number(video.currentTime || 0)),
        targetLanguage,
      }));
      clearInterval(syncTimer);
      syncTimer = setInterval(function () {
        if (socket !== ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(JSON.stringify({
            type: "sync",
            currentTime: Math.max(0, Number(video.currentTime || 0)),
          }));
        } catch (error) {}
      }, 350);
    });

    ws.addEventListener("message", function (event) {
      if (!enabled || generation !== socketGeneration || socket !== ws) return;
      let data;
      try { data = JSON.parse(String(event.data || "{}")); } catch (error) { return; }
      const type = String(data?.type || "");

      if (type === "preview") {
        applyPreview(data, video);
        reconnectAttempt = 0;
        return;
      }

      if (type === "error") {
        if (data?.retryable !== false) {
          try { ws.close(); } catch (error) {}
        } else {
          console.error("Vexa live subtitles stopped", String(data?.error || "Live subtitles unavailable"));
          enabled = false;
          updateLanguageSelection(player);
          closeSocket(true);
          clearLiveSlots();
          hideCaption(player);
        }
        return;
      }

      if (type === "ended") closeSocket(true);
    });

    ws.addEventListener("close", function () {
      if (socket === ws) socket = null;
      clearInterval(syncTimer);
      syncTimer = 0;
      const shouldReconnect =
        enabled &&
        generation === socketGeneration &&
        !ws.__vexaIntentionalClose &&
        !video.paused &&
        !video.ended;
      if (shouldReconnect) scheduleReconnect(player, generation);
    });

    ws.addEventListener("error", function () {
      if (socket !== ws) return;
      try { ws.close(); } catch (error) {}
    });
  }

  function restartFromCurrentTime(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    socketGeneration += 1;
    const generation = socketGeneration;
    reconnectAttempt = 0;
    closeSocket(true);
    clearLiveSlots();
    hideCaption(player);
    if (!video.paused && !video.ended) connectRealtime(player, generation);
  }

  function renderCaption(player) {
    if (!enabled) return;
    const video = player.querySelector("video");
    if (!video) return;
    const now = Number(video.currentTime || 0);
    let active = null;
    for (const value of slots.values()) {
      if (!value.text) continue;
      if (value.start <= now + 0.1 && value.end >= now - 0.3) {
        if (!active || value.start >= active.start) active = value;
      }
    }
    if (active) showCaption(player, active.text);
    else hideCaption(player);
  }

  function showCaption(player, text) {
    const node = player.querySelector("[data-subtitle-text]");
    if (!node) return;
    node.textContent = String(text || "");
    node.style.color = "#fff";
    node.dir = targetLanguage === "fa" || targetLanguage === "ar" ? "rtl" : "auto";
    node.classList.toggle("show", Boolean(text));
  }

  function hideCaption(player) {
    const node = player.querySelector("[data-subtitle-text]");
    if (!node) return;
    node.textContent = "";
    node.classList.remove("show");
  }

  function bindPlayer(player) {
    if (player.dataset.vexaLiveSubtitles === "5") return;
    player.dataset.vexaLiveSubtitles = "5";
    installStyle();
    installUI(player);
    const video = player.querySelector("video");
    if (!video) return;

    video.addEventListener("play", function () {
      if (!enabled) return;
      socketGeneration += 1;
      reconnectAttempt = 0;
      connectRealtime(player, socketGeneration);
    });
    video.addEventListener("pause", function () {
      if (!enabled) return;
      closeSocket(true);
      renderCaption(player);
    });
    video.addEventListener("seeked", function () { restartFromCurrentTime(player); });
    video.addEventListener("loadedmetadata", function () {
      if (enabled) restartFromCurrentTime(player);
    });
    video.addEventListener("emptied", function () {
      if (!enabled) return;
      closeSocket(true);
      clearLiveSlots();
      hideCaption(player);
    });
    video.addEventListener("ended", function () {
      if (!enabled) return;
      closeSocket(true);
      hideCaption(player);
    });

    if (renderTimer) clearInterval(renderTimer);
    renderTimer = setInterval(function () { renderCaption(player); }, 70);
  }

  function install() {
    const player = document.getElementById(PLAYER_ID);
    if (!player || !player.querySelector("video")) return false;
    bindPlayer(player);
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(function () {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;
