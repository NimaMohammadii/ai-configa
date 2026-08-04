import { isAdmin } from "../admin.js";
import { getBalance, spendCredits } from "../credits.js";
import { textToSpeech } from "../elevenlabs.js";
import { normalizeLang } from "../i18n.js";
import { getState } from "../state.js";
import {
  buildTtsAudioFileName,
  ensureTtsHistoryTable,
} from "../tts-history.js";
import { getUserVoices } from "../user-voices.js";
import {
  LOCKED_VOICE_NAMES,
  VOICES,
  isLockedVoice,
} from "../voices.js";
import {
  MAX_HISTORY_ITEMS,
  MAX_TTS_CHARACTERS,
} from "./constants.js";
import {
  createAudioLink,
  refundChatGptCredits,
  storeChatGptAudio,
} from "./audio-storage.js";

export const CHATGPT_TOOL_NAMES = Object.freeze({
  listVoices: "list_voices",
  getBalance: "get_balance",
  getHistory: "get_history",
  generateVoice: "generate_voice",
});

export async function executeChatGptTool(name, argumentsValue, context) {
  const args = isPlainObject(argumentsValue) ? argumentsValue : {};

  if (name === CHATGPT_TOOL_NAMES.listVoices) {
    return await listVoices(context.env, context.userId);
  }

  if (name === CHATGPT_TOOL_NAMES.getBalance) {
    return await readBalance(context.env, context.userId);
  }

  if (name === CHATGPT_TOOL_NAMES.getHistory) {
    return await readHistory(
      context.env,
      context.userId,
      context.origin,
      args,
    );
  }

  if (name === CHATGPT_TOOL_NAMES.generateVoice) {
    return await generateVoice(
      context.env,
      context.userId,
      context.origin,
      args,
    );
  }

  throw new ToolInputError("Tool not found.");
}

async function listVoices(env, userId) {
  const state = await getState(env, userId);
  const isUserAdmin = await isAdmin(env, userId);
  const selectedVoice = resolveVoiceName(state.voice) || "Nora";
  const savedVoices = await getUserVoices(env, userId, selectedVoice);
  const lockedVoices = isUserAdmin ? [] : [...LOCKED_VOICE_NAMES];

  const voices = Object.keys(VOICES).map((name) => ({
    name,
    selected: name === selectedVoice,
    saved: savedVoices.includes(name),
    available: !lockedVoices.includes(name),
  }));

  return {
    structuredContent: {
      selected_voice: selectedVoice,
      saved_voices: savedVoices,
      voices,
    },
    content: [
      {
        type: "text",
        text: `Found ${voices.length} voices. The selected voice is ${selectedVoice}.`,
      },
    ],
  };
}

async function readBalance(env, userId) {
  const balance = await getBalance(env, userId);

  return {
    structuredContent: {
      balance,
      unit: "characters",
    },
    content: [
      {
        type: "text",
        text: `The user has ${balance.toLocaleString("en-US")} voice credits.`,
      },
    ],
  };
}

async function readHistory(env, userId, origin, args) {
  await ensureTtsHistoryTable(env);

  const requestedLimit = Number(args.limit || 8);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(MAX_HISTORY_ITEMS, Math.max(1, requestedLimit))
    : 8;

  const result = await env.DB.prepare(
    "SELECT id, text, voice, language, credits, file_sequence, source, " +
      "audio_r2_key, audio_mime, created_at " +
    "FROM tts_history WHERE user_id = ? " +
    "ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ?"
  ).bind(
    String(userId),
    limit,
  ).all();

  const items = [];
  for (const row of result.results || []) {
    let audioUrl = null;

    if (row.audio_r2_key) {
      audioUrl = await createAudioLink(
        env,
        origin,
        userId,
        String(row.id),
      ).catch(() => null);
    }

    items.push({
      id: String(row.id),
      text: String(row.text || ""),
      voice: String(row.voice || ""),
      language: String(row.language || ""),
      credits: Number(row.credits || 0),
      source: String(row.source || "chatbot"),
      created_at: String(row.created_at || ""),
      filename: buildTtsAudioFileName(Number(row.file_sequence || 1)),
      audio_url: audioUrl,
    });
  }

  return {
    structuredContent: {
      items,
    },
    content: [
      {
        type: "text",
        text: items.length
          ? `Returned ${items.length} recent voice generations.`
          : "No voice history was found for this account.",
      },
    ],
  };
}

async function generateVoice(env, userId, origin, args) {
  const text = String(args.text || "").trim();
  if (!text) {
    throw new ToolInputError("Text is required.");
  }

  const characterCount = Array.from(text).length;
  if (characterCount > MAX_TTS_CHARACTERS) {
    throw new ToolInputError(
      `Text must be ${MAX_TTS_CHARACTERS.toLocaleString("en-US")} characters or fewer.`,
    );
  }

  const state = await getState(env, userId);
  const requestedVoice = args.voice == null
    ? String(state.voice || "Nora")
    : String(args.voice);
  const voiceName = resolveVoiceName(requestedVoice);

  if (!voiceName) {
    throw new ToolInputError(
      "Voice not found. Call list_voices to see the available voice names.",
    );
  }

  if (isLockedVoice(voiceName) && !(await isAdmin(env, userId))) {
    throw new ToolInputError(
      "This voice is currently available as a demo only. Choose another voice.",
    );
  }

  const language = normalizeLang(
    args.language || state.language || "en",
  );
  const balanceBefore = await getBalance(env, userId);

  if (balanceBefore < characterCount) {
    throw new ToolInputError(
      `Not enough credits. This voice needs ${characterCount.toLocaleString("en-US")} credits, but the account has ${balanceBefore.toLocaleString("en-US")}.`,
    );
  }

  const audio = await textToSpeech(
    env,
    text,
    VOICES[voiceName],
    language,
  );

  const spent = await spendCredits(
    env,
    userId,
    characterCount,
    "chatgpt_tts",
    {
      voice: voiceName,
      language,
      characters: characterCount,
    },
  );

  if (!spent.ok) {
    throw new ToolInputError(
      "The account no longer has enough credits for this voice generation.",
    );
  }

  try {
    const stored = await storeChatGptAudio(env, {
      userId,
      text,
      voice: voiceName,
      language,
      credits: characterCount,
      audio,
      origin,
    });

    return {
      structuredContent: {
        history_id: stored.historyId,
        text,
        voice: voiceName,
        language,
        characters: characterCount,
        credits_used: characterCount,
        balance: Number(spent.balance || 0),
        filename: stored.filename,
        audio_url: stored.audioUrl,
        mime_type: "audio/mpeg",
      },
      content: [
        {
          type: "text",
          text: `The voice was generated with ${voiceName}. Audio: ${stored.audioUrl}`,
        },
      ],
    };
  } catch (error) {
    await refundChatGptCredits(
      env,
      userId,
      characterCount,
      {
        voice: voiceName,
        language,
        reason: "audio_storage_failed",
      },
    ).catch((refundError) => {
      console.error(
        "chatgpt tts credit refund failed",
        refundError?.stack || refundError,
      );
    });

    throw error;
  }
}

function resolveVoiceName(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) {
    return null;
  }

  if (VOICES[cleanValue]) {
    return cleanValue;
  }

  const lowerValue = cleanValue.toLowerCase();
  return Object.keys(VOICES).find((name) => {
    return name.toLowerCase() === lowerValue || VOICES[name] === cleanValue;
  }) || null;
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

export class ToolInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolInputError";
  }
}
