import { getAdminAction, isAdmin, resolveStartLanguage, trackUser } from "./admin.js";
import { creditsForTtsCharacters, ensureBalanceRow, formatUsdBalanceFromCredits, formatUsdChargeFromCredits, getBalance, refundCredits, spendCredits } from "./credits.js";
import { getSelectedElevenApiKey, textToSpeech } from "./elevenlabs.js";
import { normalizeLang } from "./i18n.js";
import {
  faJoinKeyboard,
  faJoinText,
  grantFaJoinBonusOnce,
  isFaChannelMember,
  isMandatoryFaMembershipEnabled,
} from "./mandatory-channel.js";
import { getState, setUserLanguage } from "./state.js";
import { deleteMessage, sendAudio, sendMessage, sendPlainMessage } from "./telegram-actions.js";
import { downloadTelegramFile } from "./telegram-api.js";
import { buildTtsAudioFileName, getNextTtsFileSequence, saveTtsHistory } from "./tts-history.js";
import { VOICES, isLockedVoice } from "./voices.js";
import { saveUserAudioUpload } from "./user-audio-uploads.js";

const MAX_TELEGRAM_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_KNOWN_DURATION_SECONDS = 180;
const MAX_TRANSCRIPT_CHARS = 4600;
const SCRIBE_TIMEOUT_MS = 90_000;
const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";

const MEDIA_EXTENSIONS = new Set([
  "aac", "aiff", "aif", "flac", "m4a", "mp3", "mpeg", "mpga", "ogg", "oga", "opus", "wav", "webm",
  "3gp", "avi", "mkv", "mov", "mp4", "mpg", "wmv",
]);

export async function handleVoiceTransformMessage(message, env) {
  const attachment = getVoiceTransformAttachment(message);
  if (!attachment) return false;

  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  if (!chatId || !userId) return false;

  await trackUser(env, message.from);
  await ensureBalanceRow(env, userId);

  // Preserve existing admin media flows. If an admin action is waiting for media,
  // let the normal bot handler own the message.
  if (await isAdmin(env, userId)) {
    const action = await getAdminAction(env, userId);
    if (action) return false;
  }

  await saveUserAudioUpload(env, userId, message?.message_id, attachment).catch((error) => {
    console.error("save user audio upload failed", error?.message || error);
  });

  const state = await getState(env, userId);
  if (!state.language) {
    const resolved = await resolveStartLanguage(env, state.language);
    if (!resolved) {
      await sendPlainMessage(env, chatId, "اول /start رو بزن و زبان ربات رو انتخاب کن.");
      return true;
    }
    state.language = resolved;
    await setUserLanguage(env, userId, resolved);
  }

  if (await requireVoiceTransformMembership(env, chatId, userId, state)) return true;

  const voiceName = state.voice || "Nora";
  const voiceId = VOICES[voiceName] || VOICES.Nora;
  const lang = normalizeLang(state.language || "en");

  if (isLockedVoice(voiceName) && !(await isAdmin(env, userId))) {
    await sendPlainMessage(
      env,
      chatId,
      lang === "fa"
        ? "این صدا فعلاً قفل است. اول یک صدای فعال انتخاب کن."
        : "This voice is currently locked. Choose an available voice first.",
    );
    return true;
  }

  if (attachment.fileSize > MAX_TELEGRAM_DOWNLOAD_BYTES) {
    await sendPlainMessage(
      env,
      chatId,
      lang === "fa"
        ? "فایل برای دانلود مستقیم ربات بزرگ‌تر از ۲۰ مگابایت است. یک فایل کوچک‌تر بفرست."
        : "This file is larger than Telegram's 20 MB bot download limit. Send a smaller file.",
    );
    return true;
  }

  if (attachment.duration > MAX_KNOWN_DURATION_SECONDS) {
    await sendPlainMessage(
      env,
      chatId,
      lang === "fa"
        ? "فعلاً برای تست V3 ویس‌های تا ۳ دقیقه رو بفرست."
        : "For this V3 test, send audio up to 3 minutes long.",
    );
    return true;
  }

  const balance = await getBalance(env, userId);
  if (balance <= 0) {
    await sendPlainMessage(
      env,
      chatId,
      lang === "fa"
        ? "موجودیت تموم شده. اول حسابت رو شارژ کن و دوباره ویس رو بفرست."
        : "Your balance is empty. Add balance and send the audio again.",
    );
    return true;
  }

  let statusMessage = null;
  try {
    statusMessage = await sendPlainMessage(
      env,
      chatId,
      lang === "fa"
        ? `🎙 دارم مکث‌ها، سرعت و اجرای صدات رو تحلیل می‌کنم و با ${voiceName} V3 می‌سازم...`
        : `🎙 Analyzing your pauses and delivery and rebuilding it with ${voiceName} V3...`,
    );

    const media = await downloadTelegramFile(env, attachment.fileId, {
      filename: attachment.fileName,
      mimeType: attachment.mimeType,
    });

    const transformed = await transformVoiceMediaForV3(env, {
      buffer: media.buffer,
      filename: media.filename,
      mimeType: media.mimeType,
      voiceId,
      lang,
      beforeGenerate: async ({ chargeCredits }) => {
        const currentBalance = await getBalance(env, userId);
        if (currentBalance < chargeCredits) {
          throw insufficientCreditsError(lang, chargeCredits, currentBalance);
        }
      },
    });
    const { transcript, cleanTranscript, chargeCredits, outputAudio } = transformed;

    const spent = await spendCredits(env, userId, chargeCredits, "voice_v3", {
      voice: voiceName,
      language: transcript?.language_code || lang,
      sourceType: attachment.fileType,
      duration: attachment.duration || null,
    });
    if (!spent?.ok) {
      throw insufficientCreditsError(lang, chargeCredits, spent?.balance || 0);
    }

    if (statusMessage?.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
      statusMessage = null;
    }

    let sequence;
    let filename;
    let sent;
    try {
      sequence = await getNextTtsFileSequence(env, userId);
      filename = buildTtsAudioFileName(sequence);
      sent = await sendAudio(env, chatId, outputAudio, filename, filename.replace(/\.mp3$/i, ""));
    } catch (deliveryError) {
      await refundCredits(
        env,
        userId,
        chargeCredits,
        "voice_v3_delivery_refund",
        {
          voice: voiceName,
          language: transcript?.language_code || lang,
          sourceType: attachment.fileType,
          telegramMessageId: message?.message_id || null,
        },
        `voice_v3_delivery:${userId}:${message?.message_id || attachment.fileId}`,
      ).catch((refundError) => {
        console.error("Voice Transform delivery refund failed", refundError?.stack || refundError);
      });
      throw deliveryError;
    }

    await saveTtsHistory(
      env,
      userId,
      cleanTranscript,
      voiceName,
      String(transcript?.language_code || lang),
      chargeCredits,
      sent,
      sequence,
      "",
      "chatbot",
    ).catch((error) => {
      console.error("save V3 voice history failed", error?.message || error);
    });

    return true;
  } catch (error) {
    if (statusMessage?.message_id) {
      await deleteMessage(env, chatId, statusMessage.message_id).catch(() => null);
    }
    await sendPlainMessage(
      env,
      chatId,
      error?.message || (lang === "fa" ? "تبدیل ویس انجام نشد. دوباره امتحان کن." : "Voice conversion failed. Please try again."),
    ).catch(() => null);
    return true;
  }
}

export async function transformVoiceMediaForV3(env, options = {}) {
  const lang = normalizeLang(options.lang || "en");
  const media = {
    buffer: options.buffer,
    filename: String(options.filename || "voice-recording.webm"),
    mimeType: String(options.mimeType || "application/octet-stream"),
  };
  if (!(media.buffer instanceof ArrayBuffer) || !media.buffer.byteLength) {
    throw new Error(lang === "fa" ? "فایل صوتی خالی است." : "The audio recording is empty.");
  }

  const voiceId = String(options.voiceId || "").trim();
  if (!voiceId) throw new Error("Voice not found.");

  const transcript = await transcribeForV3(env, media);
  const cleanTranscript = String(transcript?.text || "").trim();
  if (!cleanTranscript) {
    throw new Error(lang === "fa" ? "گفتار قابل تشخیصی داخل فایل پیدا نشد." : "No recognizable speech was found in the file.");
  }

  const transcriptChars = Array.from(cleanTranscript).length;
  if (transcriptChars > MAX_TRANSCRIPT_CHARS) {
    throw new Error(
      lang === "fa"
        ? "این فایل برای نسخه آزمایشی V3 طولانیه. یک ویس کوتاه‌تر بفرست."
        : "This file is too long for the current V3 test. Send a shorter recording.",
    );
  }
  const chargeCredits = creditsForTtsCharacters(transcriptChars);

  if (typeof options.beforeGenerate === "function") {
    await options.beforeGenerate({ transcript, cleanTranscript, transcriptChars, chargeCredits });
  }

  const performancePrompt = buildV3PerformancePrompt(transcript);
  if (!performancePrompt || Array.from(performancePrompt).length > 5000) {
    throw new Error(
      lang === "fa"
        ? "اجرای این ویس برای V3 زیادی طولانی شد. یک ویس کوتاه‌تر بفرست."
        : "This recording is too long to rebuild with V3. Send a shorter recording.",
    );
  }

  const outputAudio = await textToSpeech(env, performancePrompt, voiceId, lang);
  return {
    transcript,
    cleanTranscript,
    transcriptChars,
    chargeCredits,
    performancePrompt,
    outputAudio,
  };
}

function getVoiceTransformAttachment(message) {
  if (message?.voice?.file_id) return mediaAttachment(message.voice, "voice", "voice.ogg", "audio/ogg");
  if (message?.audio?.file_id) return mediaAttachment(message.audio, "audio", message.audio.file_name || "audio", message.audio.mime_type || "audio/mpeg");
  if (message?.video?.file_id) return mediaAttachment(message.video, "video", message.video.file_name || "video.mp4", message.video.mime_type || "video/mp4");
  if (message?.video_note?.file_id) return mediaAttachment(message.video_note, "video_note", "video-note.mp4", "video/mp4");

  const document = message?.document;
  if (!document?.file_id) return null;
  const mimeType = String(document.mime_type || "").toLowerCase();
  const fileName = String(document.file_name || "telegram-file");
  if (!isSupportedMedia(mimeType, fileName)) return null;
  return mediaAttachment(document, "document", fileName, mimeType || mimeTypeFromName(fileName));
}

function mediaAttachment(file, fileType, fileName, mimeType) {
  return {
    fileId: String(file?.file_id || ""),
    fileType,
    fileName: String(fileName || "telegram-media"),
    mimeType: String(mimeType || "application/octet-stream"),
    fileSize: Math.max(0, Number(file?.file_size || 0)),
    duration: Math.max(0, Number(file?.duration || 0)),
  };
}

function isSupportedMedia(mimeType, fileName) {
  if (String(mimeType || "").startsWith("audio/") || String(mimeType || "").startsWith("video/")) return true;
  const extension = String(fileName || "").toLowerCase().split(".").pop();
  return MEDIA_EXTENSIONS.has(extension);
}

function mimeTypeFromName(fileName) {
  const value = String(fileName || "").toLowerCase();
  if (value.endsWith(".mp3")) return "audio/mpeg";
  if (value.endsWith(".wav")) return "audio/wav";
  if (value.endsWith(".ogg") || value.endsWith(".oga")) return "audio/ogg";
  if (value.endsWith(".opus")) return "audio/opus";
  if (value.endsWith(".m4a")) return "audio/x-m4a";
  if (value.endsWith(".aac")) return "audio/aac";
  if (value.endsWith(".flac")) return "audio/flac";
  if (value.endsWith(".webm")) return "audio/webm";
  if (value.endsWith(".mov")) return "video/quicktime";
  if (value.endsWith(".mkv")) return "video/x-matroska";
  if (value.endsWith(".avi")) return "video/x-msvideo";
  if (value.endsWith(".3gp")) return "video/3gpp";
  if (value.endsWith(".wmv")) return "video/x-ms-wmv";
  if (value.endsWith(".mp4")) return "video/mp4";
  if (value.endsWith(".mpeg") || value.endsWith(".mpg")) return "video/mpeg";
  return "application/octet-stream";
}

async function transcribeForV3(env, media) {
  const apiKey = await getSelectedElevenApiKey(env);
  if (!apiKey) throw new Error("ElevenLabs API is unavailable.");

  const form = new FormData();
  form.append(
    "file",
    new Blob([media.buffer], { type: media.mimeType || "application/octet-stream" }),
    media.filename || "telegram-media",
  );
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "true");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "false");
  form.append("num_speakers", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRIBE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(SCRIBE_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "accept": "application/json" },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Speech analysis took too long. Send a shorter recording.");
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const detail = String(payload?.detail?.message || payload?.detail || payload?.message || "Speech analysis failed");
    throw new Error(detail.slice(0, 500));
  }
  return payload;
}

function buildV3PerformancePrompt(transcript) {
  const tokens = Array.isArray(transcript?.words) ? transcript.words : [];
  const words = tokens.filter((token) => token?.type === "word" && String(token?.text || "").trim());
  if (!words.length) return String(transcript?.text || "").trim();

  let output = "";
  const pace = globalPaceTag(words, transcript?.language_code);
  if (pace) output += pace + " ";

  let previousSpeechEnd = null;
  for (const token of tokens) {
    const type = String(token?.type || "");
    if (type === "audio_event") {
      const eventTag = vocalEventTag(token?.text);
      if (eventTag) output = appendWithSpace(output, eventTag);
      continue;
    }

    if (type === "spacing") {
      output += String(token?.text || " ");
      continue;
    }

    if (type !== "word") continue;

    const start = Number(token?.start);
    if (Number.isFinite(start) && Number.isFinite(previousSpeechEnd)) {
      const gap = Math.max(0, start - previousSpeechEnd);
      output = insertPauseCue(output, gap);
    }

    output += String(token?.text || "");
    const end = Number(token?.end);
    if (Number.isFinite(end)) previousSpeechEnd = end;
  }

  const normalized = output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return normalized || String(transcript?.text || "").trim();
}

function globalPaceTag(words, languageCode) {
  const language = String(languageCode || "").toLowerCase();
  if (language === "zh" || language === "ja" || language === "ko") return "";
  const first = Number(words[0]?.start);
  const last = Number(words[words.length - 1]?.end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return "";
  const rate = words.length / (last - first);
  if (rate >= 3.25) return "[quickly]";
  if (rate <= 1.45) return "[slowly]";
  return "";
}

function insertPauseCue(output, gap) {
  if (gap < 0.42) return output;
  const trimmed = output.replace(/[ \t]+$/g, "");
  if (!trimmed) return output;
  const hasEndingPunctuation = /[.!?…,:;،؛؟]$/u.test(trimmed);
  if (gap >= 1.35) return trimmed + (hasEndingPunctuation ? "\n" : "...\n");
  if (gap >= 0.75) return trimmed + (hasEndingPunctuation ? " " : "... ");
  if (hasEndingPunctuation) return trimmed + " ";
  return trimmed + ", ";
}

function vocalEventTag(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (/(laugh|laughter|chuckle|giggle)/.test(text)) return "[laughs]";
  if (/(sigh)/.test(text)) return "[sighs]";
  if (/(gasp)/.test(text)) return "[gasps]";
  if (/(cough)/.test(text)) return "[coughs]";
  if (/(clear.*throat|throat.*clear)/.test(text)) return "[clears throat]";
  if (/(sob|cry|crying)/.test(text)) return "[crying]";
  if (/(whisper)/.test(text)) return "[whispers]";
  return "";
}

function appendWithSpace(output, value) {
  const left = String(output || "").replace(/[ \t]+$/g, "");
  return (left ? left + " " : "") + value + " ";
}

async function requireVoiceTransformMembership(env, chatId, userId, state) {
  if (state?.language !== "fa") return false;
  if (!(await isMandatoryFaMembershipEnabled(env))) return false;
  if (await isAdmin(env, userId)) return false;
  if (await isFaChannelMember(env, userId)) {
    await grantFaJoinBonusOnce(env, userId);
    return false;
  }
  await sendMessage(env, chatId, faJoinText(), faJoinKeyboard());
  return true;
}

function insufficientCreditsError(lang, needed, balance) {
  const error = new Error(
    lang === "fa"
      ? `موجودی کافی نیست. برای این ویس ${formatUsdChargeFromCredits(needed)} لازم داری و موجودی تو ${formatUsdBalanceFromCredits(balance)} است.`
      : `Not enough balance. This voice needs ${formatUsdChargeFromCredits(needed)}; your balance is ${formatUsdBalanceFromCredits(balance)}.`,
  );
  error.status = 402;
  return error;
}
