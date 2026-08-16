import { getUserAiChatPreferences } from "./ai-chat-model.js";
import { getAiChatAccessSettings, getMiniAppAccessSettings, isAdmin } from "./admin.js";
import { addCredits, getBalance, spendCredits } from "./credits.js";
import { textToSpeechWithTimestamps } from "./elevenlabs.js";
import { normalizeLang } from "./i18n.js";
import { getReferralStatus } from "./referrals.js";
import { getRewardWheelStatus } from "./reward-wheel.js";
import { getState } from "./state.js";
import { sendAudio, sendAudioFileId, sendDocument, sendDocumentFileId } from "./telegram-actions.js";
import { tgJson } from "./telegram-api.js";
import { buildTtsAudioFileName } from "./tts-history.js";
import { getUserVoices } from "./user-voices.js";
import { LOCKED_VOICE_NAMES, VOICES, isLockedVoice } from "./voices.js";

const MAX_AUDIO = 30;
const MAX_IMAGES = 30;
const MAX_USAGE = 50;
const MAX_CHAT = 30;
const MAX_EDIT_CHARS = 5000;
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

const N = Object.freeze({
  account: "vexa_get_account",
  voices: "vexa_list_voices",
  audioList: "vexa_list_audio",
  audioGet: "vexa_get_audio",
  audioSend: "vexa_send_audio_to_bot",
  audioEdit: "vexa_edit_audio_text",
  images: "vexa_list_images",
  usage: "vexa_get_credit_usage",
  chat: "vexa_get_chat_history",
});
const ALL = new Set(Object.values(N));
const WRITES = new Set([N.audioSend, N.audioEdit]);

export function buildAiAppInstructions() {
  return [
    "Private Vexa app tools are available for the currently authenticated user.",
    "Use them whenever an answer depends on live app or bot data: credits, profile/settings, voices, TTS/audio files and duration, image history, section activity, locks, reward wheel, referrals, payment state, credit usage, or saved AI Chat history. Never guess those values from memory.",
    "Tool execution is already scoped to the authenticated user. Never ask for or invent a Telegram user ID and never claim access to another user's data.",
    "When a file reference is ambiguous, call vexa_list_audio first, then use the returned history ID with the appropriate audio tool.",
    "If the user says an audio file will not download, will not open, cannot be retrieved, or asks how to get the file, proactively offer to send that exact file to their private bot chat. Do not send it until the user explicitly asks you to send it or clearly accepts that offer.",
    "When the user explicitly asks to send an owned audio file to the bot chat, call vexa_send_audio_to_bot. Do not ask for a Telegram user ID or chat ID; the tool securely uses the authenticated user's own bot chat.",
    "Call vexa_edit_audio_text only on an explicit request to change an existing audio file. It updates the same owned single-speaker Mini App TTS history item by fully regenerating the updated text with the same voice; credit cost equals the full updated text length. Ownership, balance, storage and revision are checked before commit.",
    "Never expose R2 keys, Telegram file IDs, secrets or raw database internals. Report only user-facing information.",
  ].join(" ");
}

export function getAiAppTools() {
  return [
    tool(N.account, "Read a fresh comprehensive snapshot of the current user's Vexa account: balance, profile, selected/saved voice, language, Mini App and AI Chat lock state, section activity, reward wheel, referrals, AI preferences, content counts and payment summary.", {}, []),
    tool(N.voices, "List Vexa voices with selected, saved, locked and available status for the current user.", {}, []),
    tool(N.audioList, "List the current user's recent TTS/audio history with history ID, filename, current text, voice, language, credits, source, time, revision, editability and duration when stored alignment provides it.", { limit: { type: "integer", minimum: 1, maximum: MAX_AUDIO } }, ["limit"]),
    tool(N.audioGet, "Read one owned TTS/audio history item in detail and derive its duration from timestamps or the stored WAV/MP3 when needed.", { historyId: { type: "string", minLength: 1, maxLength: 100 } }, ["historyId"]),
    tool(N.audioSend, "Send one exact owned TTS/audio history item to the current user's private Telegram bot chat. Use only after an explicit send request or a clear acceptance of an earlier offer to send the file. The authenticated user/chat is fixed server-side and is never supplied by the model.", { historyId: { type: "string", minLength: 1, maxLength: 100 } }, ["historyId"]),
    tool(N.audioEdit, "Replace an exact text segment in one owned single-speaker editable Mini App TTS item and regenerate the full updated audio with the same voice. This updates the same history item, increments revision, and spends credits equal to the full updated text length. Use only on explicit user intent.", {
      historyId: { type: "string", minLength: 1, maxLength: 100 },
      findText: { type: "string", minLength: 1, maxLength: MAX_EDIT_CHARS },
      replacement: { type: "string", maxLength: MAX_EDIT_CHARS },
      replaceAll: { type: "boolean" },
    }, ["historyId", "findText", "replacement", "replaceAll"]),
    tool(N.images, "List the current user's recent AI image generations and edits with user-facing history metadata. Internal Telegram file IDs are not returned.", { limit: { type: "integer", minimum: 1, maximum: MAX_IMAGES } }, ["limit"]),
    tool(N.usage, "Read recent credit spending for the current user with amount, reason, safe metadata and time.", { limit: { type: "integer", minimum: 1, maximum: MAX_USAGE } }, ["limit"]),
    tool(N.chat, "Read recent saved Vexa AI Chat exchanges for the current user when they ask about an earlier in-app conversation.", { limit: { type: "integer", minimum: 1, maximum: MAX_CHAT } }, ["limit"]),
  ];
}

export function isAiAppToolCall(item) {
  return item?.type === "function_call" && ALL.has(String(item?.name || ""));
}
export function isAiAppWriteToolCall(item) {
  return isAiAppToolCall(item) && WRITES.has(String(item?.name || ""));
}

export async function executeAiAppTool(env, userId, item) {
  let args = {};
  try { args = JSON.parse(String(item?.arguments || "{}")); }
  catch { return JSON.stringify({ ok: false, error: "Invalid app-tool arguments." }); }
  try {
    const name = String(item?.name || "");
    if (name === N.account) return json(await account(env, userId));
    if (name === N.voices) return json(await voices(env, userId));
    if (name === N.audioList) return json(await audioList(env, userId, args.limit));
    if (name === N.audioGet) return json(await audioGet(env, userId, args.historyId));
    if (name === N.audioSend) return json(await audioSend(env, userId, args.historyId));
    if (name === N.audioEdit) return json(await audioEdit(env, userId, args));
    if (name === N.images) return json(await images(env, userId, args.limit));
    if (name === N.usage) return json(await usage(env, userId, args.limit));
    if (name === N.chat) return json(await chatHistory(env, userId, args.limit));
    return json({ ok: false, error: "App tool not found." });
  } catch (error) {
    console.error("AI app tool failed", { name: String(item?.name || ""), userId: String(userId || ""), message: String(error?.message || error).slice(0, 500) });
    return json({ ok: false, error: String(error?.publicMessage || error?.message || "Could not complete that app action.").slice(0, 500) });
  }
}

function tool(name, description, properties, required) {
  return { type: "function", name, description, parameters: { type: "object", properties, required, additionalProperties: false }, strict: true, defer_loading: true, allowed_callers: ["direct"] };
}

async function account(env, userId) {
  const uid = String(userId);
  const admin = await isAdmin(env, uid);
  const [profile, state, balance, saved, miniLock, chatLock, wheel, referral, prefs, sections, counts, payments] = await Promise.all([
    first(env, "SELECT username,first_name,last_name,last_seen_at,return_count,mini_app_open_count,last_mini_app_opened_at,created_at FROM bot_users WHERE user_id=?", [uid]),
    getState(env, uid), getBalance(env, uid), getUserVoices(env, uid).catch(() => []),
    getMiniAppAccessSettings(env), getAiChatAccessSettings(env),
    getRewardWheelStatus(env, uid, admin).catch(() => null), getReferralStatus(env, uid).catch(() => null),
    getUserAiChatPreferences(env, uid).catch(() => null), sectionActivity(env, uid), contentCounts(env, uid), paymentSummary(env, uid),
  ]);
  const voice = String(state?.voice || "Nora");
  const miniLocked = Boolean(miniLock?.adminOnly && !admin);
  const aiLocked = Boolean(chatLock?.adminOnly && !admin);
  return {
    ok: true,
    profile: { username: profile?.username || null, firstName: profile?.first_name || null, lastName: profile?.last_name || null, createdAt: profile?.created_at || null, lastSeenAt: profile?.last_seen_at || null, returnCount: Number(profile?.return_count || 0), miniAppOpenCount: Number(profile?.mini_app_open_count || 0), lastMiniAppOpenedAt: profile?.last_mini_app_opened_at || null, isAdmin: admin },
    credits: { balance: Number(balance || 0), unit: "credits" },
    preferences: { selectedVoice: voice, savedVoices: saved, selectedVoiceLocked: !admin && isLockedVoice(voice), output: String(state?.output || "MP3"), language: normalizeLang(state?.language || "en"), demoLanguage: normalizeLang(state?.demoLanguage || state?.language || "en"), aiModel: prefs?.model || null, aiReasoningEffort: prefs?.reasoningEffort || null },
    access: { miniApp: access(miniLock, miniLocked), aiChat: access(chatLock, aiLocked), inheritedSectionLocks: miniLocked ? ["home","wheel","image","explore","voices","tts"] : [], lockedVoices: admin ? [] : [...LOCKED_VOICE_NAMES] },
    sectionActivity: sections, rewardWheel: wheel, referrals: referral, content: counts, payments, serverNow: Math.floor(Date.now() / 1000),
  };
}

function access(settings, locked) {
  const now = Math.floor(Date.now() / 1000), until = Number(settings?.lockedUntil || 0);
  return { locked: Boolean(locked), lockedFrom: Number(settings?.lockedFrom || 0), lockedUntil: until, remainingSeconds: locked && until > now ? until - now : 0 };
}

async function voices(env, userId) {
  const [state, saved, admin] = await Promise.all([getState(env, userId), getUserVoices(env, userId).catch(() => []), isAdmin(env, userId)]);
  const selected = String(state?.voice || "Nora"), set = new Set(saved);
  return { ok: true, selected, saved, voices: Object.keys(VOICES).map((name) => ({ name, selected: name === selected, saved: set.has(name), locked: !admin && isLockedVoice(name), available: admin || !isLockedVoice(name) })) };
}

async function audioList(env, userId, requested) {
  const limit = clamp(requested, 1, MAX_AUDIO, 12);
  const rows = await all(env,
    "SELECT id,text,voice,language,credits,file_sequence,source,created_at,audio_base64,file_id,file_type,audio_r2_key,audio_mime,alignment_json,edit_revision FROM tts_history WHERE user_id=? ORDER BY datetime(created_at) DESC,rowid DESC LIMIT ?",
    [String(userId), limit]);
  return { ok: true, items: rows.map(audioView) };
}

async function audioGet(env, userId, historyId) {
  const row = await audioRow(env, userId, historyId);
  if (!row) return { ok: false, error: "Audio history item not found." };
  return { ok: true, item: { ...audioView(row), durationSeconds: await durationFor(env, row).catch(() => durationFromAlignment(parse(row.alignment_json))) } };
}

async function audioSend(env, userId, historyId) {
  const uid = String(userId), row = await audioRow(env, uid, historyId);
  if (!row) throw pub("That audio file was not found in your account.");
  if (!row.audio_base64 && !row.file_id && !row.audio_r2_key) throw pub("That audio file is no longer available to send.");

  const filename = audioDeliveryFilename(row);
  let sent;
  try {
    if (row.file_id) {
      sent = String(row.file_type || "") === "document"
        ? await sendDocumentFileId(env, uid, String(row.file_id), "")
        : await sendAudioFileId(env, uid, String(row.file_id), "");
    } else {
      const loaded = await loadStoredAudio(env, row);
      if (!loaded?.buffer?.byteLength) throw pub("That audio file is no longer available to send.");
      if (loaded.buffer.byteLength > MAX_AUDIO_BYTES) throw pub("That audio file is too large to send through the bot.");
      sent = loaded.mime.includes("wav")
        ? await sendDocument(env, uid, loaded.buffer, filename)
        : await sendAudio(env, uid, loaded.buffer, filename, "Vexa Voice");
    }
  } catch (error) {
    if (error?.publicMessage) throw error;
    const message = String(error?.message || error);
    if (/chat not found|bot was blocked|forbidden|user is deactivated|can't initiate|cannot initiate/i.test(message)) {
      throw pub("I couldn't send the file to your bot chat. Open the bot, press Start, then ask me to send it again.");
    }
    throw pub("I couldn't send that audio to your bot chat right now. Please try again.");
  }

  return {
    ok: true,
    sent: true,
    destination: "private_bot_chat",
    id: String(row.id),
    filename,
    messageId: Number(sent?.message_id || 0) || null,
  };
}

function audioView(row) {
  return {
    id: String(row.id), filename: buildTtsAudioFileName(row.file_sequence), text: String(row.text || ""), voice: String(row.voice || ""), language: String(row.language || ""), credits: Number(row.credits || 0), source: String(row.source || ""), createdAt: row.created_at || null, revision: Number(row.edit_revision || 0), editable: Boolean(row.source === "mini_app" && row.audio_r2_key && row.alignment_json), hasAudio: Boolean(row.audio_base64 || row.file_id || row.audio_r2_key), mimeType: String(row.audio_mime || "audio/mpeg"), durationSeconds: durationFromAlignment(parse(row.alignment_json)),
  };
}

async function audioEdit(env, userId, args) {
  const uid = String(userId), id = cleanId(args.historyId), findText = String(args.findText || ""), replacement = String(args.replacement || ""), replaceAll = args.replaceAll === true;
  if (!findText) throw pub("Tell me exactly which text segment to replace.");
  const row = await audioRow(env, uid, id);
  if (!row) throw pub("That audio file was not found in your account.");
  if (String(row.source || "") !== "mini_app" || !row.audio_r2_key) throw pub("That older audio file cannot be edited by AI yet. Create it from the Mini App TTS section first.");
  const voice = String(row.voice || ""), voiceId = VOICES[voice];
  if (!voiceId || voice === "Dialogue") throw pub("AI text editing currently supports single-speaker TTS files only.");
  const oldText = String(row.text || ""), matches = occurrences(oldText, findText);
  if (!matches) throw pub("I couldn't find that exact text in the selected audio. Use an exact segment from its current text.");
  if (matches > 1 && !replaceAll) throw pub("That text appears more than once. Use a longer unique segment or explicitly replace all occurrences.");
  const newText = replaceAll ? oldText.split(findText).join(replacement) : replaceOnce(oldText, findText, replacement);
  const cost = Array.from(newText).length;
  if (!newText.trim()) throw pub("The edited TTS text cannot be empty.");
  if (cost > MAX_EDIT_CHARS) throw pub("The edited TTS text is too long.");
  if (newText === oldText) return { ok: true, unchanged: true, id, revision: Number(row.edit_revision || 0) };
  const balance = await getBalance(env, uid);
  if (balance < cost) throw pub(`Not enough credits. This AI audio edit needs ${cost} credits, but your balance is ${balance}.`);

  const generated = await textToSpeechWithTimestamps(env, newText, voiceId, String(row.language || "en"));
  if (!env.EXPLORE_MEDIA) throw pub("Audio storage is not configured.");
  const oldRevision = Number(row.edit_revision || 0), revision = oldRevision + 1;
  const key = `tts-audio/${encodeURIComponent(uid)}/${id}/revision-${revision}.mp3`;
  await env.EXPLORE_MEDIA.put(key, generated.audio, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { kind: "tts-editable-audio" } });
  const spent = await spendCredits(env, uid, cost, "ai_chat_tts_edit", { historyId: id, revision: oldRevision, voice, language: String(row.language || "en"), mode: "full_regeneration" });
  if (!spent?.ok) { await env.EXPLORE_MEDIA.delete(key).catch(() => null); throw pub("Your credit balance changed before the edit could be saved. Try again."); }
  const alignment = generated.alignment || generated.normalizedAlignment || null;
  const result = await env.DB.prepare("UPDATE tts_history SET text=?,credits=credits+?,audio_base64='',audio_r2_key=?,audio_mime='audio/mpeg',alignment_json=?,edit_revision=? WHERE id=? AND user_id=? AND source='mini_app' AND edit_revision=?")
    .bind(newText, cost, key, alignment ? JSON.stringify(alignment) : "", revision, id, uid, oldRevision).run();
  if (Number(result?.meta?.changes ?? result?.changes ?? 0) <= 0) {
    await env.EXPLORE_MEDIA.delete(key).catch(() => null); await addCredits(env, uid, cost).catch(() => null); throw pub("This audio changed while I was editing it. Read the latest revision and try again.");
  }
  if (row.audio_r2_key && String(row.audio_r2_key) !== key) await env.EXPLORE_MEDIA.delete(String(row.audio_r2_key)).catch(() => null);
  return { ok: true, id, filename: buildTtsAudioFileName(row.file_sequence), voice, language: String(row.language || "en"), revision, text: newText, replacements: replaceAll ? matches : 1, creditsUsed: cost, balance: Number(spent.balance || 0), durationSeconds: durationFromAlignment(alignment), editMode: "full_regeneration" };
}

async function images(env, userId, requested) {
  const rows = await all(env, "SELECT id,kind,prompt,filename,mime_type,size,source_count,file_id,created_at FROM image_generation_history WHERE user_id=? ORDER BY id DESC LIMIT ?", [String(userId), clamp(requested,1,MAX_IMAGES,12)]);
  return { ok: true, items: rows.map((r) => ({ id: Number(r.id), kind: String(r.kind || "generate"), prompt: String(r.prompt || ""), filename: r.filename || null, mimeType: String(r.mime_type || "image/jpeg"), size: r.size || null, sourceCount: Number(r.source_count || 0), createdAt: r.created_at || null, hasImage: Boolean(r.file_id) })) };
}

async function usage(env, userId, requested) {
  const rows = await all(env, "SELECT credits,reason,metadata,created_at FROM credit_usage_log WHERE user_id=? ORDER BY datetime(created_at) DESC,rowid DESC LIMIT ?", [String(userId), clamp(requested,1,MAX_USAGE,20)]);
  return { ok: true, balance: await getBalance(env, userId), items: rows.map((r) => ({ credits: Number(r.credits || 0), reason: String(r.reason || ""), metadata: safeMetadata(r.metadata), createdAt: r.created_at || null })) };
}

async function chatHistory(env, userId, requested) {
  const rows = await all(env, "SELECT id,user_message,assistant_message,attachment_name,response_type,created_at FROM ai_chat_history WHERE user_id=? ORDER BY id DESC LIMIT ?", [String(userId), clamp(requested,1,MAX_CHAT,12)]);
  return { ok: true, items: rows.reverse().map((r) => ({ id: Number(r.id), userMessage: String(r.user_message || ""), assistantMessage: String(r.assistant_message || ""), attachmentName: r.attachment_name || null, responseType: String(r.response_type || "text"), createdAt: r.created_at || null })) };
}

async function sectionActivity(env, userId) {
  return (await all(env, "SELECT section,open_count,last_opened_at FROM mini_app_section_opens WHERE user_id=? ORDER BY datetime(last_opened_at) DESC", [String(userId)])).map((r) => ({ section: String(r.section || ""), openCount: Number(r.open_count || 0), lastOpenedAt: r.last_opened_at || null }));
}
async function contentCounts(env, userId) {
  const uid = String(userId), [a,i,c] = await Promise.all([
    first(env,"SELECT COUNT(*) total,MAX(created_at) latest FROM tts_history WHERE user_id=?",[uid]),
    first(env,"SELECT COUNT(*) total,MAX(created_at) latest FROM image_generation_history WHERE user_id=?",[uid]),
    first(env,"SELECT COUNT(*) total,MAX(created_at) latest FROM ai_chat_history WHERE user_id=?",[uid]),
  ]);
  return { audioCount:Number(a?.total||0),latestAudioAt:a?.latest||null,imageCount:Number(i?.total||0),latestImageAt:i?.latest||null,aiChatCount:Number(c?.total||0),latestAiChatAt:c?.latest||null };
}
async function paymentSummary(env, userId) {
  const uid=String(userId), [s,t,m]=await Promise.all([
    first(env,"SELECT COUNT(*) total,COALESCE(SUM(stars),0) stars,COALESCE(SUM(credits),0) credits,MAX(created_at) latest FROM star_payments WHERE user_id=?",[uid]),
    first(env,"SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN credited_at IS NOT NULL THEN credits ELSE 0 END),0) credits,MAX(created_at) latest FROM tribute_payments WHERE user_id=?",[uid]),
    first(env,"SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status='approved' THEN credits ELSE 0 END),0) credits,MAX(created_at) latest FROM payment_receipts WHERE user_id=?",[uid]),
  ]);
  return { stars:{purchases:Number(s?.total||0),starsSpent:Number(s?.stars||0),creditsPurchased:Number(s?.credits||0),latestAt:s?.latest||null}, tribute:{orders:Number(t?.total||0),creditedCredits:Number(t?.credits||0),latestAt:t?.latest||null}, toman:{receipts:Number(m?.total||0),approvedCredits:Number(m?.credits||0),latestAt:m?.latest||null} };
}

async function audioRow(env, userId, historyId) {
  return env.DB.prepare("SELECT id,user_id,text,voice,language,credits,file_sequence,source,created_at,audio_base64,file_id,file_type,audio_r2_key,audio_mime,alignment_json,edit_revision FROM tts_history WHERE id=? AND user_id=?").bind(cleanId(historyId),String(userId)).first();
}
async function loadStoredAudio(env, row) {
  if (row.audio_r2_key && env.EXPLORE_MEDIA) {
    const object = await env.EXPLORE_MEDIA.get(String(row.audio_r2_key));
    if (object) {
      if (Number(object.size || 0) > MAX_AUDIO_BYTES) throw pub("That audio file is too large to send through the bot.");
      return { buffer: await object.arrayBuffer(), mime: String(object.httpMetadata?.contentType || row.audio_mime || "audio/mpeg").toLowerCase() };
    }
  }
  if (row.audio_base64) {
    const raw = String(row.audio_base64);
    if (raw.length * 0.75 > MAX_AUDIO_BYTES) throw pub("That audio file is too large to send through the bot.");
    return { buffer: decode64(raw), mime: String(row.audio_mime || "audio/mpeg").toLowerCase() };
  }
  return null;
}
function audioDeliveryFilename(row) {
  const base = buildTtsAudioFileName(row.file_sequence);
  return String(row.audio_mime || "").toLowerCase().includes("wav") ? base.replace(/\.mp3$/i, ".wav") : base;
}
async function durationFor(env, row) {
  const aligned=durationFromAlignment(parse(row.alignment_json)); if (aligned) return aligned;
  let buffer=null, mime=String(row.audio_mime||"").toLowerCase();
  if (row.audio_r2_key && env.EXPLORE_MEDIA) { const o=await env.EXPLORE_MEDIA.get(String(row.audio_r2_key)); if(o){ if(Number(o.size||0)>MAX_AUDIO_BYTES)return null; buffer=await o.arrayBuffer(); mime=String(o.httpMetadata?.contentType||mime).toLowerCase(); } }
  if (!buffer && row.audio_base64) { const raw=String(row.audio_base64); if(raw.length*0.75>MAX_AUDIO_BYTES)return null; buffer=decode64(raw); }
  if (!buffer && row.file_id) { const f=await tgJson(env,"getFile",{file_id:String(row.file_id)}), path=String(f?.file_path||""); if(path){ const r=await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`); if(r.ok){ const len=Number(r.headers.get("content-length")||0); if(len>MAX_AUDIO_BYTES)return null; buffer=await r.arrayBuffer(); mime=String(r.headers.get("content-type")||mime).toLowerCase(); } } }
  if(!buffer||!buffer.byteLength||buffer.byteLength>MAX_AUDIO_BYTES)return null;
  const d = mime.includes("wav") || text4(new Uint8Array(buffer),0,4)==="RIFF" ? wav(new Uint8Array(buffer)) : mp3(new Uint8Array(buffer));
  return d ? round(d) : null;
}
function durationFromAlignment(a){const e=Array.isArray(a?.character_end_times_seconds)?a.character_end_times_seconds:[];for(let i=e.length-1;i>=0;i--){const n=Number(e[i]);if(Number.isFinite(n)&&n>0)return round(n)}return null}
function wav(b){if(b.length<44||text4(b,0,4)!=="RIFF"||text4(b,8,4)!=="WAVE")return null;const v=new DataView(b.buffer,b.byteOffset,b.byteLength);let o=12,rate=0,data=0;while(o+8<=b.length){const id=text4(b,o,4),n=v.getUint32(o+4,true),p=o+8;if(p+n>b.length)break;if(id==="fmt "&&n>=16)rate=v.getUint32(p+8,true);if(id==="data")data+=n;o=p+n+(n%2)}return rate&&data?data/rate:null}
function mp3(b){let o=id3(b),sec=0,frames=0;while(o+4<=b.length){const f=frame(b,o);if(!f){o++;continue}sec+=f.samples/f.rate;frames++;o+=f.len}return frames?sec:null}
function frame(b,o){const x=b[o],y=b[o+1],z=b[o+2];if(x!==255||(y&224)!==224)return null;const vb=(y>>3)&3,lb=(y>>1)&3,bi=(z>>4)&15,si=(z>>2)&3;if(vb===1||lb!==1||!bi||bi===15||si===3)return null;const ver=vb===3?1:vb===2?2:2.5,br=(ver===1?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bi]*1000,rate=[44100,48000,32000][si]/(ver===1?1:ver===2?2:4),pad=(z>>1)&1,samples=ver===1?1152:576,len=Math.floor((ver===1?144:72)*br/rate+pad);return len>=24&&o+len<=b.length+1?{rate,samples,len}:null}
function id3(b){if(b.length<10||text4(b,0,3)!=="ID3")return 0;return Math.min(b.length,10+((b[6]&127)<<21|((b[7]&127)<<14)|((b[8]&127)<<7)|(b[9]&127)))}
function text4(b,o,n){let s="";for(let i=0;i<n&&o+i<b.length;i++)s+=String.fromCharCode(b[o+i]);return s}
function decode64(s){const x=atob(s.replace(/\s+/g,"")),b=new Uint8Array(x.length);for(let i=0;i<x.length;i++)b[i]=x.charCodeAt(i);return b.buffer}

function safeMetadata(value){const p=parse(value);if(!p||typeof p!=="object"||Array.isArray(p))return null;const out={},blocked=/(token|secret|password|api.?key|file.?id|r2|telegram)/i;for(const[k,v]of Object.entries(p))if(!blocked.test(k)&&(["string","number","boolean"].includes(typeof v)||v==null))out[k]=v;return out}
function occurrences(s,n){let c=0,o=0;while(o<=s.length){const i=s.indexOf(n,o);if(i<0)break;c++;o=i+Math.max(1,n.length)}return c}
function replaceOnce(s,n,r){const i=s.indexOf(n);return i<0?s:s.slice(0,i)+r+s.slice(i+n.length)}
function cleanId(v){const id=String(v||"").trim();if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw pub("Audio history ID is invalid.");return id}
function clamp(v,min,max,fallback){const n=Number.parseInt(String(v??""),10);return Math.min(max,Math.max(min,Number.isFinite(n)?n:fallback))}
function parse(v){if(!v)return null;if(typeof v==="object")return v;try{return JSON.parse(String(v))}catch{return null}}
function round(v){return Math.round(Number(v)*1000)/1000}
function json(v){return JSON.stringify(v)}
async function first(env,sql,args=[]){try{let q=env.DB.prepare(sql);if(args.length)q=q.bind(...args);return await q.first()}catch{return null}}
async function all(env,sql,args=[]){try{let q=env.DB.prepare(sql);if(args.length)q=q.bind(...args);return (await q.all())?.results||[]}catch{return []}}
function pub(message){const e=new Error(String(message));e.publicMessage=e.message;return e}