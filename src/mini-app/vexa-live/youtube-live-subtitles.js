import { Container, getContainer } from "@cloudflare/containers";
import { getElevenApiSetting, getMiniAppAccessSettings, isAdmin } from "../../admin.js";
import { authenticateMiniAppPayload } from "../auth.js";
import { getVexaLiveAccessSettings } from "./access.js";
import { LIVE_SUBTITLES_RUNTIME_JS } from "./youtube-live-subtitles-runtime.js";

const SOCKET_PATH = "/mini-app/live/api/youtube-subtitles/realtime";
const RUNTIME_PATH = "/mini-app/vexa-live/live-subtitles.js";
const RUNTIME_VERSION = "20260821-clean-2";

const TRANSLATION_MODEL = "gpt-5.6-terra";
const TRANSLATE_TIMEOUT_MS = 12000;
const PCM_SAMPLE_RATE = 16000;
const PCM_BYTES_PER_SECOND = 32000;
const PCM_FRAME_BYTES = 3200;
const INITIAL_AUDIO_BURST_SECONDS = 5;
const WARMUP_TARGET_LEAD_SECONDS = 4.0;
const WARMUP_MAX_AUDIO_LEAD_SECONDS = 4.7;
const PLAYBACK_AUDIO_LEAD_SECONDS = 4.2;
const WARMUP_NO_SPEECH_GRACE_MS = 650;
const WARMUP_MAX_WAIT_MS = 12000;
const PARTIAL_FALLBACK_INTERVAL_SECONDS = 2.4;
const TIMESTAMP_WAIT_MS = 150;
const VAD_SILENCE_SECONDS = 0.3;
const VAD_THRESHOLD = 0.4;
const VAD_MIN_SPEECH_MS = 100;
const VAD_MIN_SILENCE_MS = 100;
const EOF_FLUSH_FRAMES = 5;
const EOF_FLUSH_GRACE_MS = 900;
const LIVE_SOURCE_MAX_WORDS = 14;
const LIVE_SOURCE_MAX_CHARS = 180;

const TARGET_LANGUAGES = Object.freeze({
  original: "Original", en: "English", fa: "Persian", ru: "Russian", de: "German", tr: "Turkish", es: "Spanish", ar: "Arabic",
  fr: "French", pt: "Portuguese", it: "Italian", hi: "Hindi", zh: "Chinese", ja: "Japanese", ko: "Korean",
});
const SCRIBE_ERROR_TYPES = new Set([
  "error", "auth_error", "quota_exceeded", "transcriber_error", "input_error", "invalid_request", "unaccepted_terms",
  "commit_throttled", "rate_limited", "queue_overflow", "resource_exhausted", "session_time_limit_exceeded",
  "chunk_size_exceeded", "insufficient_audio_activity",
]);

export class VexaSubtitleContainer extends Container {
  sleepAfter = "2m";
  enableInternet = true;
  entrypoint = ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"];
  activeAudio = null;

  async ensureAudioReady() {
    if (!this.ctx.container.running) await this.start();
    try { this.renewActivityTimeout(); } catch {}
  }

  async onActivityExpired() {
    if (this.activeAudio?.process) {
      try { this.renewActivityTimeout(); } catch {}
      return;
    }
    return super.onActivityExpired();
  }

  async streamAudioPcm(mediaUrl, startSeconds, playbackRate, streamId) {
    await this.ensureAudioReady();
    const id = cleanStreamId(streamId);
    if (!id) throw new Error("Subtitle audio stream id is invalid");
    if (this.activeAudio?.process) {
      try { this.activeAudio.process.kill(); } catch {}
      this.activeAudio = null;
    }
    const rate = Math.max(0.25, Math.min(4, Number(playbackRate) || 1));
    const process = await this.ctx.container.exec([
      "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
      "-readrate", rate.toFixed(3),
      "-readrate_initial_burst", String(INITIAL_AUDIO_BURST_SECONDS),
      "-readrate_catchup", Math.max(1.25, rate * 1.5).toFixed(3),
      "-ss", Number(startSeconds || 0).toFixed(3), "-i", String(mediaUrl),
      "-vn", "-ac", "1", "-ar", String(PCM_SAMPLE_RATE), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1",
    ]);
    if (!process.stdout) {
      try { process.kill(); } catch {}
      throw new Error("Could not start realtime subtitle audio");
    }
    this.activeAudio = { id, process };
    try { this.renewActivityTimeout(); } catch {}
    process.exitCode.catch(() => -1).finally(() => {
      if (this.activeAudio?.id === id && this.activeAudio?.process === process) this.activeAudio = null;
    });
    return process.stdout;
  }

  async stopAudioStream(streamId) {
    const id = cleanStreamId(streamId);
    if (!id || this.activeAudio?.id !== id) return false;
    const process = this.activeAudio.process;
    this.activeAudio = null;
    try { process.kill(); } catch {}
    return true;
  }
}

export function isVexaLiveSubtitlesRequest(request) {
  const path = new URL(request.url).pathname;
  return path === SOCKET_PATH || path === RUNTIME_PATH;
}

export async function handleVexaLiveSubtitlesRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === RUNTIME_PATH) {
    return new Response(LIVE_SUBTITLES_RUNTIME_JS, { headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    }});
  }
  if (request.method === "GET" && path === SOCKET_PATH) {
    if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return new Response("WebSocket Required", { status: 426 });
    return createRealtimeSubtitleSocket(request, env);
  }
  return json({ error: "Method Not Allowed" }, 405);
}

export async function appendVexaLiveSubtitlesRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const path = new URL(request.url).pathname;
  if (path !== "/mini-app/vexa-live" && path !== "/mini-app/vexa-live/") return response;
  if (!String(response.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) return response;
  const source = await response.text();
  const tag = '<script src="' + RUNTIME_PATH + '?v=' + RUNTIME_VERSION + '"></script>';
  const html = source.includes(RUNTIME_PATH) ? source : source.includes("</body>") ? source.replace("</body>", tag + "\n</body>") : source + tag;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

function createRealtimeSubtitleSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  const controller = new AbortController();
  const playbackStart = { value: null, resolve: null };
  const playbackControl = { playbackTime: 0, playbackRate: 1, playing: false, warming: false, updatedAt: Date.now(), version: 0, waiters: new Set() };
  let started = false;
  let errorSent = false;

  const send = value => { if (server.readyState === WebSocket.OPEN) try { server.send(JSON.stringify(value)); } catch {} };
  const sendError = message => {
    if (errorSent) return;
    errorSent = true;
    send({ type: "error", error: String(message || "Live subtitles are temporarily unavailable") });
  };
  const abort = () => { if (!controller.signal.aborted) controller.abort(); };
  const fail = error => {
    if (controller.signal.aborted) return;
    console.error("Vexa subtitle session failed", error?.stack || error);
    sendError(publicError(error));
    abort();
    try { server.close(1011, "subtitle session failed"); } catch {}
  };

  server.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(String(event.data || "{}")); } catch { return; }
    if (message?.type === "start") {
      if (started) return;
      started = true;
      runRealtimeSubtitleSession({ request, env, server, payload: message, playbackStart, playbackControl, signal: controller.signal, send, sendError, abort }).catch(fail);
      return;
    }
    if (message?.type === "playback_start" && started && !playbackStart.value) {
      const state = normalizePlaybackState(message);
      playbackStart.value = state;
      updatePlaybackControl(playbackControl, state);
      playbackStart.resolve?.(state);
      return;
    }
    if (message?.type === "warmup_complete" && started) {
      updatePlaybackControl(playbackControl, { ...normalizePlaybackState(message), warming: false });
      return;
    }
    if (message?.type === "playback_state" && started) {
      updatePlaybackControl(playbackControl, normalizePlaybackState(message));
      return;
    }
    if (message?.type === "stop") {
      abort();
      try { server.close(1000, "stopped"); } catch {}
    }
  });
  server.addEventListener("close", abort);
  server.addEventListener("error", abort);
  return new Response(null, { status: 101, webSocket: client });
}

async function runRealtimeSubtitleSession({ request, env, server, payload, playbackStart, playbackControl, signal, send, sendError, abort }) {
  const user = await authenticateMiniAppPayload(payload, env);
  await assertLiveAccess(env, user.id);
  const token = cleanToken(payload.playbackToken);
  if (!token) throw httpError("Video session is invalid", 400);
  const targetLanguage = normalizeTargetLanguage(payload.targetLanguage);
  if (!targetLanguage || targetLanguage === "off") throw httpError("Subtitle language is invalid", 400);

  const row = await env.DB.prepare("SELECT user_id, expires_at FROM vexa_youtube_playback_tokens WHERE token = ?").bind(token).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || Number(row.expires_at || 0) <= now) throw httpError("Video session expired. Open the video again.", 410);
  if (String(row.user_id) !== String(user.id)) throw httpError("Video session does not belong to this user", 403);
  if (!env.VEXA_SUBTITLES) throw httpError("Live subtitles are unavailable", 503);
  const apiKey = await selectedElevenApiKey(env);
  if (!apiKey) throw httpError("Speech-to-text is unavailable", 503);

  const streamId = crypto.randomUUID();
  const playbackUrl = new URL("/mini-app/live/api/youtube-playback?token=" + encodeURIComponent(token), request.url).href;
  const container = getContainer(env.VEXA_SUBTITLES, "subtitle-" + safeContainerKey(user.id));
  let audioStream = null, upstream = null, upstreamEndedNormally = false, completed = false, scribeFailure = "";
  let baseStart = 0, latestAudioMediaTime = 0, audioLeadSeconds = 0, warmupReadySent = false, sawSpeech = false;
  let latestPartial = null, lastSegmentMediaTime = 0, segmentSequence = 0, preparedCount = 0;
  let pendingSettled = null, settledTimer = 0, noSpeechTimer = 0, warmupMaxTimer = 0;
  const segmentQueue = [];
  let activeTranslation = null;
  const translationCache = new Map();
  const seenSegments = new Set();
  const timestampState = { offset: 0, lastEnd: 0 };

  const clearSettledTimer = () => { if (settledTimer) { clearTimeout(settledTimer); settledTimer = 0; } };
  const clearNoSpeechTimer = () => { if (noSpeechTimer) { clearTimeout(noSpeechTimer); noSpeechTimer = 0; } };
  const clearWarmupMaxTimer = () => { if (warmupMaxTimer) { clearTimeout(warmupMaxTimer); warmupMaxTimer = 0; } };
  const clearTimers = () => { clearSettledTimer(); clearNoSpeechTimer(); clearWarmupMaxTimer(); };
  signal.addEventListener("abort", clearTimers, { once: true });

  const sendWarmupReady = prepared => {
    if (warmupReadySent || signal.aborted || !playbackControl.warming) return;
    warmupReadySent = true;
    clearNoSpeechTimer();
    clearWarmupMaxTimer();
    send({ type: "warmup_ready", leadSeconds: roundTime(audioLeadSeconds), prepared: Boolean(prepared) });
  };

  const maybeWarmupReady = () => {
    if (warmupReadySent || signal.aborted || !playbackControl.warming || audioLeadSeconds < WARMUP_TARGET_LEAD_SECONDS) return;
    if (preparedCount > 0) return sendWarmupReady(true);
    if (sawSpeech) return;
    if (!noSpeechTimer) {
      noSpeechTimer = setTimeout(() => {
        noSpeechTimer = 0;
        if (!sawSpeech && playbackControl.warming && !warmupReadySent) sendWarmupReady(false);
      }, WARMUP_NO_SPEECH_GRACE_MS);
    }
  };

  const enqueueSegment = (sourceText, timing, sourceMediaTime) => {
    const text = liveSubtitleWindow(sourceText);
    if (!text || !timing) return;
    const signature = text + "|" + Math.round(timing.start * 10) + "|" + Math.round(timing.end * 10);
    if (seenSegments.has(signature)) return;
    seenSegments.add(signature);
    while (seenSegments.size > 80) seenSegments.delete(seenSegments.values().next().value);
    lastSegmentMediaTime = Math.max(lastSegmentMediaTime, Number(sourceMediaTime || timing.end || baseStart));
    segmentQueue.push({ id: String(++segmentSequence), sourceText: text, start: timing.start, end: timing.end });
    pumpTranslationQueue();
  };

  const flushPendingSettled = timingOverride => {
    clearSettledTimer();
    const item = pendingSettled;
    pendingSettled = null;
    if (!item) return;
    const timing = timingOverride || approximateLiveTiming(item.text, item.audioMediaTime, baseStart);
    enqueueSegment(item.text, timing, item.audioMediaTime);
  };

  const queueSettled = value => {
    const text = liveSubtitleWindow(value);
    if (!text) return;
    sawSpeech = true;
    clearNoSpeechTimer();
    latestPartial = { text, audioMediaTime: latestAudioMediaTime };
    if (pendingSettled?.text === text) {
      pendingSettled.audioMediaTime = latestAudioMediaTime;
      return;
    }
    if (pendingSettled) flushPendingSettled(null);
    pendingSettled = { text, audioMediaTime: latestAudioMediaTime };
    settledTimer = setTimeout(() => { settledTimer = 0; flushPendingSettled(null); }, TIMESTAMP_WAIT_MS);
  };

  const handleTimedTranscript = message => {
    const text = liveSubtitleWindow(message?.text);
    const raw = rawTimingFromScribeWords(message);
    if (!text || !raw) return;
    sawSpeech = true;
    clearNoSpeechTimer();
    const timing = mapScribeTiming(raw, baseStart, timestampState);
    if (!timing) return;
    if (pendingSettled?.text === text) {
      const mediaTime = pendingSettled.audioMediaTime;
      flushPendingSettled(timing);
      lastSegmentMediaTime = Math.max(lastSegmentMediaTime, mediaTime);
      return;
    }
    enqueueSegment(text, timing, latestAudioMediaTime);
  };

  const maybeSnapshotPartial = () => {
    if (!latestPartial?.text) return;
    if (latestAudioMediaTime - lastSegmentMediaTime < PARTIAL_FALLBACK_INTERVAL_SECONDS) return;
    enqueueSegment(latestPartial.text, approximateLiveTiming(latestPartial.text, latestAudioMediaTime, baseStart), latestAudioMediaTime);
  };

  const publishTranslatedSegment = (job, text) => {
    const clean = cleanTranslatedText(text);
    if (!clean || signal.aborted || server.readyState !== WebSocket.OPEN) return;
    const current = estimatedControlTime(playbackControl);
    if (!playbackControl.warming && job.end < current - 0.18) return;
    preparedCount += 1;
    send({ type: "caption_segment", id: job.id, text: clean, start: job.start, end: job.end, revision: Number(job.id) || 0 });
    maybeWarmupReady();
  };

  function pumpTranslationQueue() {
    if (activeTranslation || signal.aborted || server.readyState !== WebSocket.OPEN) return;
    while (segmentQueue.length) {
      const candidate = segmentQueue.shift();
      if (!playbackControl.warming && candidate.end < estimatedControlTime(playbackControl) - 0.18) continue;
      let task;
      task = (async () => {
        try {
          let text = candidate.sourceText;
          if (targetLanguage !== "original") {
            text = translationCache.get(candidate.sourceText) || await translateLiveSubtitle({ env, sourceText: candidate.sourceText, targetLanguage, signal });
            if (text) translationCache.set(candidate.sourceText, text);
          }
          publishTranslatedSegment(candidate, text);
        } catch (error) {
          if (signal.aborted) return;
          console.error("Vexa live subtitle translation failed", error?.stack || error);
          sendError(publicError(error));
          abort();
          try { server.close(1011, "translation failed"); } catch {}
        }
      })().finally(() => {
        if (activeTranslation === task) activeTranslation = null;
        pumpTranslationQueue();
      });
      activeTranslation = task;
      return;
    }
  }

  try {
    await container.ensureAudioReady();
    send({ type: "audio_ready" });
    const playback = await waitForPlaybackStart(playbackStart, signal);
    baseStart = finiteNumber(playback.currentTime, 0, 86400);
    if (baseStart === null) throw httpError("Subtitle start time is invalid", 400);
    latestAudioMediaTime = baseStart;
    lastSegmentMediaTime = baseStart;
    const playbackRate = finiteNumber(playback.playbackRate, 0.25, 4) ?? 1;
    updatePlaybackControl(playbackControl, { currentTime: baseStart, playbackRate, playing: Boolean(playback.playing), warming: Boolean(playback.warming) });

    warmupMaxTimer = setTimeout(() => {
      warmupMaxTimer = 0;
      if (!playbackControl.warming || warmupReadySent || signal.aborted) return;
      if (!sawSpeech) return sendWarmupReady(false);
      sendError("Subtitle preparation timed out");
      abort();
      try { server.close(1011, "warmup timeout"); } catch {}
    }, WARMUP_MAX_WAIT_MS);

    audioStream = await container.streamAudioPcm(playbackUrl, baseStart, playbackRate, streamId);

    const scribeUrl = new URL("https://api.elevenlabs.io/v1/speech-to-text/realtime");
    scribeUrl.searchParams.set("model_id", "scribe_v2_realtime");
    scribeUrl.searchParams.set("audio_format", "pcm_16000");
    scribeUrl.searchParams.set("commit_strategy", "vad");
    scribeUrl.searchParams.set("vad_silence_threshold_secs", String(VAD_SILENCE_SECONDS));
    scribeUrl.searchParams.set("vad_threshold", String(VAD_THRESHOLD));
    scribeUrl.searchParams.set("min_speech_duration_ms", String(VAD_MIN_SPEECH_MS));
    scribeUrl.searchParams.set("min_silence_duration_ms", String(VAD_MIN_SILENCE_MS));
    scribeUrl.searchParams.set("include_timestamps", "true");

    const upstreamResponse = await fetch(scribeUrl, { headers: { Upgrade: "websocket", "xi-api-key": apiKey } });
    upstream = upstreamResponse.webSocket;
    if (!upstream || upstreamResponse.status !== 101) throw httpError("Realtime transcription connection is unavailable", 502);
    upstream.accept();

    let readyResolve, readyReject;
    const scribeReady = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const readyTimer = setTimeout(() => readyReject(httpError("Realtime transcription did not start", 504)), 10000);
    const closeUpstream = () => { try { upstream?.close(1000, "stopped"); } catch {} };
    signal.addEventListener("abort", closeUpstream, { once: true });

    upstream.addEventListener("message", event => {
      if (signal.aborted) return;
      let message;
      try { message = JSON.parse(String(event.data || "{}")); } catch { return; }
      const type = String(message?.message_type || "");
      if (type === "session_started") {
        clearTimeout(readyTimer);
        readyResolve();
        return;
      }
      if (type === "partial_transcript") {
        const text = liveSubtitleWindow(message?.text);
        if (text) {
          sawSpeech = true;
          clearNoSpeechTimer();
          latestPartial = { text, audioMediaTime: latestAudioMediaTime };
        }
        return;
      }
      if (type === "final_transcript" || type === "committed_transcript") {
        queueSettled(message?.text);
        return;
      }
      if (type === "final_transcript_with_timestamps" || type === "committed_transcript_with_timestamps") {
        handleTimedTranscript(message);
        return;
      }
      if (SCRIBE_ERROR_TYPES.has(type)) {
        scribeFailure = publicScribeError(type, message);
        clearTimeout(readyTimer);
        readyReject(httpError(scribeFailure, 502));
        sendError(scribeFailure);
        console.error("Vexa Scribe realtime error", type, String(message?.error || message?.message || "").slice(0, 700));
        abort();
        try { server.close(1011, "scribe error"); } catch {}
      }
    });
    upstream.addEventListener("error", event => {
      if (signal.aborted) return;
      if (!scribeFailure) scribeFailure = "Realtime transcription connection failed";
      clearTimeout(readyTimer);
      readyReject(httpError(scribeFailure, 502));
      sendError(scribeFailure);
      console.error("Vexa Scribe websocket error", event?.message || event);
      abort();
    });
    upstream.addEventListener("close", event => {
      clearTimeout(readyTimer);
      if (signal.aborted || upstreamEndedNormally) return;
      const code = Number(event?.code || 0), reason = String(event?.reason || "").trim();
      console.error("Vexa Scribe websocket closed", code, reason);
      if (!scribeFailure) scribeFailure = "Realtime transcription connection closed" + (code ? " (" + code + ")" : "");
      sendError(scribeFailure);
      readyReject(httpError(scribeFailure, 502));
      abort();
    });

    await scribeReady;
    if (signal.aborted) throw new Error("aborted");
    send({ type: "ready" });

    const audioEndTime = await streamPcmToScribe({
      audioStream, upstream, control: playbackControl, baseStart, signal,
      onProgress: absoluteAudioTime => {
        latestAudioMediaTime = absoluteAudioTime;
        audioLeadSeconds = Math.max(0, absoluteAudioTime - estimatedControlTime(playbackControl));
        maybeSnapshotPartial();
        maybeWarmupReady();
      },
    });

    await flushScribeTail(upstream, signal);
    await sleepWithSignal(EOF_FLUSH_GRACE_MS, signal);
    flushPendingSettled(null);
    if (latestPartial?.text) maybeSnapshotPartial();
    while ((activeTranslation || segmentQueue.length) && !signal.aborted) {
      pumpTranslationQueue();
      if (activeTranslation) await Promise.allSettled([activeTranslation]);
      else break;
    }
    upstreamEndedNormally = true;
    signal.removeEventListener("abort", closeUpstream);
    closeUpstream();
    await waitForPlaybackDrain(playbackControl, audioEndTime, signal);
    if (!signal.aborted) {
      completed = true;
      send({ type: "ended" });
    }
  } finally {
    upstreamEndedNormally = true;
    clearTimers();
    signal.removeEventListener("abort", clearTimers);
    if (audioStream) try { await audioStream.cancel(); } catch {}
    try { await container.stopAudioStream(streamId); } catch {}
    try { upstream?.close(1000, "stopped"); } catch {}
    if (completed) try { server.close(1000, "ended"); } catch {}
  }
}

function waitForPlaybackStart(control, signal) {
  if (control.value) return Promise.resolve(control.value);
  return new Promise((resolve, reject) => {
    const finish = value => { signal.removeEventListener("abort", onAbort); control.resolve = null; resolve(value); };
    const onAbort = () => { control.resolve = null; reject(new Error("aborted")); };
    control.resolve = finish;
    signal.addEventListener("abort", onAbort, { once: true });
    if (control.value) finish(control.value);
  });
}

async function streamPcmToScribe({ audioStream, upstream, control, baseStart, signal, onProgress }) {
  const reader = audioStream.getReader();
  let pending = new Uint8Array(0), bytesSent = 0;
  const cancelReader = () => { try { reader.cancel(); } catch {} };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      pending = concatBytes(pending, next.value);
      while (pending.byteLength >= PCM_FRAME_BYTES && !signal.aborted) {
        const frame = pending.slice(0, PCM_FRAME_BYTES);
        pending = pending.slice(PCM_FRAME_BYTES);
        const absoluteAudioTime = Number(baseStart || 0) + (bytesSent + frame.byteLength) / PCM_BYTES_PER_SECOND;
        await waitForFeedPermission(control, absoluteAudioTime, signal);
        if (upstream.readyState !== WebSocket.OPEN) throw httpError("Realtime transcription connection closed", 502);
        upstream.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: bytesToBase64(frame), sample_rate: PCM_SAMPLE_RATE }));
        bytesSent += frame.byteLength;
        onProgress?.(Number(baseStart || 0) + bytesSent / PCM_BYTES_PER_SECOND);
      }
    }
    if (pending.byteLength && !signal.aborted && upstream.readyState === WebSocket.OPEN) {
      const absoluteAudioTime = Number(baseStart || 0) + (bytesSent + pending.byteLength) / PCM_BYTES_PER_SECOND;
      await waitForFeedPermission(control, absoluteAudioTime, signal);
      upstream.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: bytesToBase64(pending), sample_rate: PCM_SAMPLE_RATE }));
      bytesSent += pending.byteLength;
      onProgress?.(Number(baseStart || 0) + bytesSent / PCM_BYTES_PER_SECOND);
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    try { await reader.cancel(); } catch {}
  }
  return Number(baseStart || 0) + bytesSent / PCM_BYTES_PER_SECOND;
}

async function waitForFeedPermission(control, absoluteAudioTime, signal) {
  while (!signal.aborted) {
    const mediaTime = estimatedControlTime(control);
    const lead = absoluteAudioTime - mediaTime;
    if (control?.warming) {
      if (lead <= WARMUP_MAX_AUDIO_LEAD_SECONDS) return;
      const version = Number(control?.version || 0);
      await waitForControlChange(control, version, signal);
      continue;
    }
    if (control?.playing) {
      if (lead <= PLAYBACK_AUDIO_LEAD_SECONDS) return;
      const rate = Math.max(0.25, Number(control?.playbackRate || 1));
      const waitMs = Math.max(12, Math.ceil(((lead - PLAYBACK_AUDIO_LEAD_SECONDS) / rate) * 1000));
      const version = Number(control?.version || 0);
      await waitForControlChange(control, version, signal, waitMs);
      continue;
    }
    const version = Number(control?.version || 0);
    await waitForControlChange(control, version, signal);
  }
  throw new Error("aborted");
}

async function waitForPlaybackDrain(control, audioEndTime, signal) {
  const target = Number(audioEndTime);
  if (!Number.isFinite(target)) return;
  while (!signal.aborted) {
    const current = estimatedControlTime(control);
    if (!control?.warming && control?.playing && current >= target - 0.08) return;
    if (control?.playing && !control?.warming) {
      const rate = Math.max(0.25, Number(control?.playbackRate || 1));
      const waitMs = Math.max(25, Math.ceil(Math.max(0, target - current - 0.08) / rate * 1000));
      const version = Number(control?.version || 0);
      await waitForControlChange(control, version, signal, Math.min(waitMs, 30000));
    } else {
      const version = Number(control?.version || 0);
      await waitForControlChange(control, version, signal);
    }
  }
  throw new Error("aborted");
}

async function flushScribeTail(upstream, signal) {
  if (signal.aborted || upstream?.readyState !== WebSocket.OPEN) return;
  const silence = new Uint8Array(PCM_FRAME_BYTES), payload = bytesToBase64(silence);
  for (let i = 0; i < EOF_FLUSH_FRAMES && !signal.aborted && upstream.readyState === WebSocket.OPEN; i += 1) {
    upstream.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: payload, sample_rate: PCM_SAMPLE_RATE }));
  }
}

async function sleepWithSignal(ms, signal) {
  if (signal.aborted) throw new Error("aborted");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal.removeEventListener("abort", onAbort); resolve(); }
    function onAbort() { clearTimeout(timer); signal.removeEventListener("abort", onAbort); reject(new Error("aborted")); }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function estimatedControlTime(control) {
  const base = Number(control?.playbackTime || 0);
  if (control?.warming || !control?.playing) return base;
  return base + Math.max(0, (Date.now() - Number(control?.updatedAt || Date.now())) / 1000) * Number(control?.playbackRate || 1);
}

function normalizePlaybackState(value) {
  return {
    currentTime: finiteNumber(value?.currentTime, 0, 86400) ?? 0,
    playbackRate: finiteNumber(value?.playbackRate, 0.25, 4) ?? 1,
    playing: Boolean(value?.playing),
    warming: Boolean(value?.warmup ?? value?.warming),
  };
}

function updatePlaybackControl(control, state) {
  const currentTime = finiteNumber(state?.currentTime, 0, 86400), playbackRate = finiteNumber(state?.playbackRate, 0.25, 4);
  if (currentTime !== null) control.playbackTime = currentTime;
  if (playbackRate !== null) control.playbackRate = playbackRate;
  control.playing = Boolean(state?.playing);
  if (Object.prototype.hasOwnProperty.call(state || {}, "warming")) control.warming = Boolean(state.warming);
  control.updatedAt = Date.now();
  control.version += 1;
  notifyControl(control);
}

function notifyControl(control) {
  if (!control?.waiters?.size) return;
  const waiters = [...control.waiters];
  control.waiters.clear();
  for (const wake of waiters) try { wake(); } catch {}
}

function waitForControlChange(control, version, signal, timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    if (Number(control?.version || 0) !== Number(version || 0)) return resolve();
    let done = false, timer = 0;
    const finish = fn => {
      if (done) return;
      done = true;
      control?.waiters?.delete(wake);
      signal?.removeEventListener?.("abort", onAbort);
      if (timer) clearTimeout(timer);
      fn();
    };
    const wake = () => finish(resolve), onAbort = () => finish(() => reject(new Error("aborted")));
    control?.waiters?.add(wake);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    if (timeoutMs > 0) timer = setTimeout(() => finish(resolve), timeoutMs);
    if (Number(control?.version || 0) !== Number(version || 0)) wake();
  });
}

function approximateLiveTiming(text, audioMediaTime, baseStart) {
  const endMedia = Number(audioMediaTime);
  if (!Number.isFinite(endMedia)) return null;
  const clean = cleanSubtitleText(text);
  if (!clean) return null;
  const words = clean.split(/\s+/u).filter(Boolean).length;
  const chars = Array.from(clean).length;
  const speechSpan = words > 1 ? words * 0.38 : chars * 0.1;
  const span = Math.max(0.9, Math.min(3.6, speechSpan || 0.9));
  const start = Math.max(Number(baseStart || 0), endMedia - span);
  return { start: roundTime(start), end: roundTime(Math.max(start + 0.55, endMedia + 0.18)) };
}

function rawTimingFromScribeWords(message) {
  const words = (Array.isArray(message?.words) ? message.words : []).filter(word => Number.isFinite(Number(word?.start)) && Number.isFinite(Number(word?.end)));
  if (!words.length) return null;
  return { start: Number(words[0].start), end: Number(words[words.length - 1].end) };
}

function mapScribeTiming(raw, baseStart, state) {
  const first = Number(raw?.start), last = Number(raw?.end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
  if (first + state.offset < state.lastEnd - 0.25) state.offset = Math.max(0, state.lastEnd + 0.05 - first);
  const relativeStart = Math.max(0, state.offset + first);
  const relativeEnd = Math.max(relativeStart + 0.2, state.offset + last);
  state.lastEnd = Math.max(state.lastEnd, relativeEnd);
  return { start: roundTime(Number(baseStart || 0) + relativeStart), end: roundTime(Number(baseStart || 0) + relativeEnd) };
}

async function translateLiveSubtitle({ env, sourceText, targetLanguage, signal }) {
  if (!env.GPT_API) throw httpError("AI translation is unavailable", 503);
  const languageName = TARGET_LANGUAGES[targetLanguage];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  const abortFromSession = () => controller.abort();
  signal.addEventListener("abort", abortFromSession, { once: true });
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.GPT_API, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        instructions: "Translate this live-video subtitle into " + languageName + ". Preserve meaning, names, numbers and tone. Keep it concise and natural for at most two subtitle lines. Return only the complete translation with no label, explanation, quotes or markdown.",
        input: sourceText,
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: 90,
        stream: true,
        store: false,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Vexa subtitle translation failed", response.status, JSON.stringify(data).slice(0, 900));
      throw httpError("AI translation is temporarily unavailable", 502);
    }
    const text = await readTranslationStream(response, signal);
    if (!text) throw httpError("AI translation returned an empty result", 502);
    return text;
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw httpError("Subtitle translation timed out", 504);
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortFromSession);
  }
}

async function readTranslationStream(response, signal) {
  if (!response.body) throw httpError("AI translation stream is unavailable", 502);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", output = "";
  const consume = frame => {
    const data = frame.split(/\r?\n/u).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event?.type === "response.output_text.delta" && typeof event.delta === "string") { output += event.delta; return; }
    if (event?.type === "response.output_text.done" && typeof event.text === "string") { output = event.text; return; }
    if (event?.type === "error" || event?.type === "response.failed") throw httpError("AI translation is temporarily unavailable", 502);
  };
  try {
    while (!signal.aborted) {
      const next = await reader.read();
      buffer += decoder.decode(next.value || new Uint8Array(), { stream: !next.done });
      let match;
      while ((match = /\r?\n\r?\n/u.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consume(frame);
      }
      if (next.done) break;
    }
    if (buffer.trim()) consume(buffer);
  } finally { try { reader.releaseLock(); } catch {} }
  return cleanTranslatedText(output);
}

async function selectedElevenApiKey(env) {
  const name = await getElevenApiSetting(env);
  return String(env[name] || "").trim();
}

async function assertLiveAccess(env, userId) {
  if (await isAdmin(env, userId)) return;
  const [globalAccess, liveAccess] = await Promise.all([getMiniAppAccessSettings(env), getVexaLiveAccessSettings(env)]);
  if (globalAccess.adminOnly || liveAccess.adminOnly) throw httpError("Vexa Live is updating", 423);
}

function normalizeTargetLanguage(value) {
  const key = String(value || "original").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES, key) ? key : "";
}
function cleanToken(value) { const token = String(value || "").trim(); return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : ""; }
function cleanStreamId(value) { const id = String(value || "").trim(); return /^[A-Za-z0-9-]{20,80}$/.test(id) ? id : ""; }
function safeContainerKey(value) { const raw = String(value || "anonymous").replace(/[^A-Za-z0-9_-]/g, ""); return (raw || "anonymous").slice(0, 80); }
function finiteNumber(value, min, max) { const number = Number(value); return Number.isFinite(number) && number >= min && number <= max ? number : null; }
function roundTime(value) { return Math.round(Number(value || 0) * 1000) / 1000; }
function cleanSubtitleText(value) { return String(value || "").replace(/\s+([,.;:!?،؛؟])/g, "$1").replace(/\s+/g, " ").trim(); }
function liveSubtitleWindow(value) {
  const text = cleanSubtitleText(value);
  if (!text) return "";
  const words = text.split(/\s+/u);
  const wordWindow = words.length > LIVE_SOURCE_MAX_WORDS ? words.slice(-LIVE_SOURCE_MAX_WORDS).join(" ") : text;
  const chars = Array.from(wordWindow);
  if (chars.length <= LIVE_SOURCE_MAX_CHARS) return wordWindow;
  const tail = chars.slice(-LIVE_SOURCE_MAX_CHARS).join("");
  return tail.replace(/^\S+\s+/u, "").trim() || tail.trim();
}
function cleanTranslatedText(value) { return cleanSubtitleText(value).replace(/^["“”'‘’]+/u, "").replace(/["“”'‘’]+$/u, "").trim(); }
function publicScribeError(type, message) {
  if (type === "quota_exceeded") return "Speech-to-text quota is unavailable";
  if (type === "rate_limited") return "Realtime transcription is rate limited";
  if (type === "auth_error") return "Realtime transcription authentication failed";
  if (type === "unaccepted_terms") return "Scribe realtime terms must be accepted";
  if (type === "insufficient_audio_activity") return "Realtime transcription did not receive enough audio";
  if (type === "session_time_limit_exceeded") return "Realtime transcription session time limit was reached";
  const detail = String(message?.error || message?.message || "");
  console.error("Vexa Scribe realtime error", type, detail.slice(0, 700));
  return "Realtime transcription is temporarily unavailable";
}
function bytesToBase64(bytes) { let binary = ""; for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.byteLength, offset + 0x8000))); return btoa(binary); }
function concatBytes(left, right) { if (!left.byteLength) return right.slice(); const merged = new Uint8Array(left.byteLength + right.byteLength); merged.set(left, 0); merged.set(right, left.byteLength); return merged; }
function httpError(message, status) { const error = new Error(message); error.status = status; return error; }
function publicError(error) {
  const status = Number(error?.status || 500);
  if (status >= 400 && status < 500) return String(error?.message || "Request failed");
  const message = String(error?.message || "");
  if (/translation/i.test(message)) return message;
  if (/transcription|speech-to-text|subtitle preparation/i.test(message)) return message;
  return "Live subtitles are temporarily unavailable";
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
