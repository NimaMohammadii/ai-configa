import { tgJson } from "./telegram-api.js";
import { buildTtsAudioFileName } from "./tts-history.js";

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const MIN_EDIT_SECONDS = 0.05;
const SELECT_AUDIO = "SELECT id,user_id,text,voice,language,credits,file_sequence,source,created_at,audio_base64,file_id,file_type,telegram_message_id,audio_r2_key,audio_mime,alignment_json,edit_revision FROM tts_history";

const N = Object.freeze({
  find: "vexa_find_audio",
  trim: "vexa_trim_audio",
  split: "vexa_split_audio",
});
const ALL = new Set(Object.values(N));
const WRITES = new Set([N.trim, N.split]);

export function buildAiAudioFileInstructions() {
  return [
    "Every Vexa audio history item has a stable user-facing file code such as Vexa 0042 and a filename such as Vexa 0042.mp3.",
    "When the user gives a file code, filename, numeric sequence, or exact history ID, use vexa_find_audio so files outside the recent-history window can still be resolved exactly.",
    "vexa_trim_audio keeps only the requested time range and updates that same history item/file code without spending TTS credits.",
    "vexa_split_audio divides one file at one timestamp into two new history files with new Vexa file codes and leaves the original untouched.",
    "Never invent timestamps. If the requested time is outside the file, report the real duration returned by the tool.",
  ].join(" ");
}

export function getAiAudioFileTools() {
  return [
    tool(N.find, "Find one exact owned audio history item by stable file code such as Vexa 0042, filename such as Vexa 0042.mp3 or Vexa 0042.wav, numeric sequence such as 0042, or exact history ID.", {
      reference: { type: "string", minLength: 1, maxLength: 160 },
    }, ["reference"]),
    tool(N.trim, "Trim one owned audio file by time. Keep only audio between startSeconds and endSeconds and update the same history item/file code. Accurate character timing is cropped when available. This does not spend TTS credits.", {
      reference: { type: "string", minLength: 1, maxLength: 160 },
      startSeconds: { type: "number", minimum: 0, maximum: 86400 },
      endSeconds: { type: "number", minimum: 0, maximum: 86400 },
    }, ["reference", "startSeconds", "endSeconds"]),
    tool(N.split, "Split one owned audio file at atSeconds into two new history files with new file codes, leaving the original unchanged. Use only on explicit user intent.", {
      reference: { type: "string", minLength: 1, maxLength: 160 },
      atSeconds: { type: "number", minimum: 0, maximum: 86400 },
    }, ["reference", "atSeconds"]),
  ];
}

export function isAiAudioFileToolCall(item) {
  return item?.type === "function_call" && ALL.has(String(item?.name || ""));
}

export function isAiAudioFileWriteToolCall(item) {
  return isAiAudioFileToolCall(item) && WRITES.has(String(item?.name || ""));
}

export async function executeAiAudioFileTool(env, userId, item) {
  let args = {};
  try { args = JSON.parse(String(item?.arguments || "{}")); }
  catch { return JSON.stringify({ ok: false, error: "Invalid audio-tool arguments." }); }
  try {
    const name = String(item?.name || "");
    if (name === N.find) return JSON.stringify(await findAudio(env, userId, args.reference));
    if (name === N.trim) return JSON.stringify(await trimAudio(env, userId, args));
    if (name === N.split) return JSON.stringify(await splitAudio(env, userId, args));
    return JSON.stringify({ ok: false, error: "Audio tool not found." });
  } catch (error) {
    console.error("AI audio file tool failed", {
      name: String(item?.name || ""),
      userId: String(userId || ""),
      message: String(error?.message || error).slice(0, 500),
    });
    return JSON.stringify({ ok: false, error: String(error?.publicMessage || error?.message || "Could not complete that audio action.").slice(0, 500) });
  }
}

function tool(name, description, properties, required) {
  return {
    type: "function",
    name,
    description,
    parameters: { type: "object", properties, required, additionalProperties: false },
    strict: true,
    defer_loading: true,
    allowed_callers: ["direct"],
  };
}

async function findAudio(env, userId, reference) {
  const row = await resolveAudio(env, userId, reference);
  if (!row) return { ok: false, error: "No audio file with that code, filename, sequence, or history ID was found in your account." };
  const loaded = await loadAudio(env, row).catch(() => null);
  const duration = loaded ? durationFromLoaded(loaded) : durationFromAlignment(parse(row.alignment_json));
  return { ok: true, item: audioView(row, duration) };
}

async function trimAudio(env, userId, args) {
  const uid = String(userId), row = await resolveAudio(env, uid, args.reference);
  if (!row) throw pub("That audio file was not found in your account.");
  const loaded = await loadAudio(env, row);
  if (!loaded?.buffer?.byteLength) throw pub("That audio file is no longer available to trim.");
  const duration = durationFromLoaded(loaded);
  if (!duration) throw pub("I couldn't read this audio format accurately enough to trim it.");

  const start = Number(args.startSeconds), end = Number(args.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw pub("Give me a valid trim range with an end time after the start time.");
  }
  if (start >= duration || end > duration + 0.25) {
    throw pub(`That trim range is outside this ${round(duration)} second audio file.`);
  }

  const sliced = sliceAudioRange(loaded.buffer, loaded.mime, start, Math.min(end, duration));
  if (!sliced || sliced.duration < MIN_EDIT_SECONDS) throw pub("That trim would leave too little audio.");
  if (!env.EXPLORE_MEDIA) throw pub("Audio storage is not configured.");

  const oldRevision = Number(row.edit_revision || 0), revision = oldRevision + 1;
  const ext = sliced.mime.includes("wav") ? "wav" : "mp3";
  const key = `tts-audio/${encodeURIComponent(uid)}/${row.id}/revision-${revision}.${ext}`;
  await putAudio(env, key, sliced.buffer, sliced.mime, "ai-trimmed-audio");

  const cropped = cropAlignment(parse(row.alignment_json), sliced.actualStart, sliced.actualEnd);
  const nextText = cropped?.text || String(row.text || "");
  const alignmentJson = cropped ? JSON.stringify(cropped.alignment) : "";
  const result = await env.DB.prepare(
    "UPDATE tts_history SET text=?,audio_base64='',file_id=NULL,file_type=NULL,telegram_message_id=NULL,audio_r2_key=?,audio_mime=?,alignment_json=?,edit_revision=? WHERE id=? AND user_id=? AND edit_revision=?"
  ).bind(nextText, key, sliced.mime, alignmentJson, revision, String(row.id), uid, oldRevision).run();

  if (Number(result?.meta?.changes ?? result?.changes ?? 0) <= 0) {
    await env.EXPLORE_MEDIA.delete(key).catch(() => null);
    throw pub("This audio changed while I was trimming it. Read the latest revision and try again.");
  }
  if (row.audio_r2_key && String(row.audio_r2_key) !== key) {
    await env.EXPLORE_MEDIA.delete(String(row.audio_r2_key)).catch(() => null);
  }

  const updated = {
    ...row,
    text: nextText,
    audio_base64: "",
    file_id: null,
    file_type: null,
    telegram_message_id: null,
    audio_r2_key: key,
    audio_mime: sliced.mime,
    alignment_json: alignmentJson,
    edit_revision: revision,
  };
  return {
    ok: true,
    trimmed: true,
    item: audioView(updated, sliced.duration),
    keptRange: { startSeconds: round(sliced.actualStart), endSeconds: round(sliced.actualEnd) },
  };
}

async function splitAudio(env, userId, args) {
  const uid = String(userId), row = await resolveAudio(env, uid, args.reference);
  if (!row) throw pub("That audio file was not found in your account.");
  const loaded = await loadAudio(env, row);
  if (!loaded?.buffer?.byteLength) throw pub("That audio file is no longer available to split.");
  const duration = durationFromLoaded(loaded);
  if (!duration) throw pub("I couldn't read this audio format accurately enough to split it.");

  const at = Number(args.atSeconds);
  if (!Number.isFinite(at) || at < MIN_EDIT_SECONDS || at > duration - MIN_EDIT_SECONDS) {
    throw pub(`Choose a split point inside the audio. This file is ${round(duration)} seconds long.`);
  }
  const split = splitAudioAt(loaded.buffer, loaded.mime, at);
  if (!split?.left?.byteLength || !split?.right?.byteLength) throw pub("I couldn't split this audio cleanly at that point.");
  if (!env.EXPLORE_MEDIA) throw pub("Audio storage is not configured.");

  const sequenceRow = await env.DB.prepare("SELECT COALESCE(MAX(file_sequence),0) AS value FROM tts_history WHERE user_id=?").bind(uid).first();
  const firstSequence = Math.max(1, Number(sequenceRow?.value || 0) + 1);
  if (firstSequence > 9998) throw pub("Your audio file sequence has reached its current limit.");
  const secondSequence = firstSequence + 1;
  const firstId = crypto.randomUUID(), secondId = crypto.randomUUID();
  const ext = split.mime.includes("wav") ? "wav" : "mp3";
  const firstKey = `tts-audio/${encodeURIComponent(uid)}/${firstId}/revision-0.${ext}`;
  const secondKey = `tts-audio/${encodeURIComponent(uid)}/${secondId}/revision-0.${ext}`;

  await putAudio(env, firstKey, split.left, split.mime, "ai-split-audio");
  try {
    await putAudio(env, secondKey, split.right, split.mime, "ai-split-audio");
  } catch (error) {
    await env.EXPLORE_MEDIA.delete(firstKey).catch(() => null);
    throw error;
  }

  const alignment = parse(row.alignment_json);
  const leftCrop = cropAlignment(alignment, 0, split.actualAt);
  const rightCrop = cropAlignment(alignment, split.actualAt, duration);
  const leftText = leftCrop?.text || String(row.text || "");
  const rightText = rightCrop?.text || String(row.text || "");
  const insert = "INSERT INTO tts_history (id,user_id,text,voice,language,credits,file_sequence,audio_base64,file_id,file_type,telegram_message_id,source,audio_r2_key,audio_mime,alignment_json,edit_revision,created_at) VALUES (?,?,?,?,?,?,?,'',NULL,NULL,NULL,'mini_app',?,?,?,0,CURRENT_TIMESTAMP)";

  try {
    await env.DB.prepare(insert).bind(firstId, uid, leftText, String(row.voice || ""), String(row.language || "en"), 0, firstSequence, firstKey, split.mime, leftCrop ? JSON.stringify(leftCrop.alignment) : "").run();
    await env.DB.prepare(insert).bind(secondId, uid, rightText, String(row.voice || ""), String(row.language || "en"), 0, secondSequence, secondKey, split.mime, rightCrop ? JSON.stringify(rightCrop.alignment) : "").run();
  } catch (error) {
    await env.DB.prepare("DELETE FROM tts_history WHERE id IN (?,?) AND user_id=?").bind(firstId, secondId, uid).run().catch(() => null);
    await Promise.all([
      env.EXPLORE_MEDIA.delete(firstKey).catch(() => null),
      env.EXPLORE_MEDIA.delete(secondKey).catch(() => null),
    ]);
    throw pub("I couldn't save the split files. The original file was not changed.");
  }

  const createdAt = new Date().toISOString();
  const leftRow = { ...row, id:firstId, text:leftText, credits:0, file_sequence:firstSequence, source:"mini_app", audio_base64:"", file_id:null, file_type:null, telegram_message_id:null, audio_r2_key:firstKey, audio_mime:split.mime, alignment_json:leftCrop ? JSON.stringify(leftCrop.alignment) : "", edit_revision:0, created_at:createdAt };
  const rightRow = { ...row, id:secondId, text:rightText, credits:0, file_sequence:secondSequence, source:"mini_app", audio_base64:"", file_id:null, file_type:null, telegram_message_id:null, audio_r2_key:secondKey, audio_mime:split.mime, alignment_json:rightCrop ? JSON.stringify(rightCrop.alignment) : "", edit_revision:0, created_at:createdAt };

  return {
    ok: true,
    split: true,
    original: { id:String(row.id), fileCode:fileCode(row), filename:filename(row) },
    splitAtSeconds: round(split.actualAt),
    parts: [audioView(leftRow, split.leftDuration), audioView(rightRow, split.rightDuration)],
  };
}

async function resolveAudio(env, userId, reference) {
  const uid = String(userId), ref = String(reference || "").trim();
  if (!ref) return null;
  let row = await env.DB.prepare(`${SELECT_AUDIO} WHERE user_id=? AND id=? LIMIT 1`).bind(uid, ref).first().catch(() => null);
  if (row) return row;
  const sequence = sequenceFromReference(ref);
  if (sequence == null) return null;
  return env.DB.prepare(`${SELECT_AUDIO} WHERE user_id=? AND file_sequence=? ORDER BY datetime(created_at) DESC,rowid DESC LIMIT 1`).bind(uid, sequence).first().catch(() => null);
}

function sequenceFromReference(value) {
  const ref = String(value || "").trim();
  if (/^\d{1,4}$/.test(ref)) {
    const valueNumber = Number.parseInt(ref, 10);
    return valueNumber > 0 ? valueNumber : null;
  }
  const match = ref.match(/^vexa[\s_-]*0*(\d{1,4})(?:[\s_-]*(?:edited|fine[\s_-]*tuned))?(?:\.(?:mp3|wav|mpeg))?$/i);
  if (!match) return null;
  const valueNumber = Number.parseInt(match[1], 10);
  return valueNumber > 0 ? valueNumber : null;
}

function fileCode(row) {
  const sequence = Number.parseInt(String(row?.file_sequence || 0), 10);
  return Number.isFinite(sequence) && sequence > 0 ? "Vexa " + String(Math.min(9999, sequence)).padStart(4, "0") : "Vexa file";
}

function filename(row) {
  const base = buildTtsAudioFileName(row?.file_sequence);
  return String(row?.audio_mime || "").toLowerCase().includes("wav") ? base.replace(/\.mp3$/i, ".wav") : base;
}

function audioView(row, duration = null) {
  return {
    id: String(row.id),
    fileCode: fileCode(row),
    filename: filename(row),
    sequence: Number(row.file_sequence || 0) || null,
    text: String(row.text || ""),
    voice: String(row.voice || ""),
    language: String(row.language || ""),
    source: String(row.source || ""),
    revision: Number(row.edit_revision || 0),
    editableText: Boolean(row.source === "mini_app" && row.audio_r2_key && row.alignment_json),
    hasAudio: Boolean(row.audio_base64 || row.file_id || row.audio_r2_key),
    mimeType: String(row.audio_mime || "audio/mpeg"),
    durationSeconds: duration ? round(duration) : durationFromAlignment(parse(row.alignment_json)),
    createdAt: row.created_at || null,
  };
}

async function loadAudio(env, row) {
  if (row.audio_r2_key && env.EXPLORE_MEDIA) {
    const object = await env.EXPLORE_MEDIA.get(String(row.audio_r2_key));
    if (object) {
      if (Number(object.size || 0) > MAX_AUDIO_BYTES) throw pub("That audio file is too large to process.");
      return { buffer:await object.arrayBuffer(), mime:String(object.httpMetadata?.contentType || row.audio_mime || "audio/mpeg").toLowerCase() };
    }
  }
  if (row.audio_base64) {
    const raw = String(row.audio_base64);
    if (raw.length * 0.75 > MAX_AUDIO_BYTES) throw pub("That audio file is too large to process.");
    return { buffer:decode64(raw), mime:String(row.audio_mime || "audio/mpeg").toLowerCase() };
  }
  if (row.file_id) {
    const file = await tgJson(env, "getFile", { file_id:String(row.file_id) });
    const path = String(file?.file_path || "");
    if (path) {
      const response = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`);
      if (response.ok) {
        const length = Number(response.headers.get("content-length") || 0);
        if (length > MAX_AUDIO_BYTES) throw pub("That audio file is too large to process.");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_AUDIO_BYTES) throw pub("That audio file is too large to process.");
        return { buffer, mime:String(response.headers.get("content-type") || row.audio_mime || "audio/mpeg").toLowerCase() };
      }
    }
  }
  return null;
}

async function putAudio(env, key, buffer, mime, kind) {
  if (!env.EXPLORE_MEDIA) throw pub("Audio storage is not configured.");
  if (!buffer?.byteLength || buffer.byteLength > MAX_AUDIO_BYTES) throw pub("The edited audio is too large.");
  await env.EXPLORE_MEDIA.put(key, buffer, { httpMetadata:{ contentType:mime }, customMetadata:{ kind } });
}

function durationFromLoaded(loaded) {
  if (!loaded?.buffer) return null;
  const bytes = new Uint8Array(loaded.buffer), info = wavInfo(bytes);
  if (loaded.mime.includes("wav") || info) return info?.duration || null;
  const frames = mp3Frames(bytes);
  return frames.length ? frames[frames.length - 1].end : null;
}

function sliceAudioRange(buffer, mime, start, end) {
  const bytes = new Uint8Array(buffer), info = wavInfo(bytes);
  return mime.includes("wav") || info ? wavSlice(bytes, start, end, info) : mp3Slice(bytes, start, end);
}

function splitAudioAt(buffer, mime, at) {
  const bytes = new Uint8Array(buffer), info = wavInfo(bytes);
  return mime.includes("wav") || info ? wavSplit(bytes, at, info) : mp3Split(bytes, at);
}

function wavInfo(bytes) {
  if (bytes.length < 44 || text(bytes,0,4) !== "RIFF" || text(bytes,8,4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset=12, format=null, dataOffset=0, dataSize=0;
  while (offset+8<=bytes.length) {
    const id=text(bytes,offset,4), size=view.getUint32(offset+4,true), payload=offset+8;
    if (payload+size>bytes.length) break;
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat:view.getUint16(payload,true), channels:view.getUint16(payload+2,true), sampleRate:view.getUint32(payload+4,true),
        blockAlign:view.getUint16(payload+12,true), bitsPerSample:view.getUint16(payload+14,true),
      };
    } else if (id === "data") { dataOffset=payload; dataSize=size; break; }
    offset=payload+size+(size%2);
  }
  if (!format || !dataOffset || !dataSize || format.audioFormat !== 1 || format.bitsPerSample !== 16 || !format.channels || !format.sampleRate || !format.blockAlign) return null;
  const frames = Math.floor(Math.min(dataSize, bytes.length-dataOffset) / format.blockAlign);
  return frames ? { ...format, dataOffset, dataSize:frames*format.blockAlign, frames, duration:frames/format.sampleRate } : null;
}

function wavSlice(bytes, start, end, info) {
  if (!info) return null;
  const startFrame=Math.max(0,Math.min(info.frames-1,Math.floor(start*info.sampleRate)));
  const endFrame=Math.max(startFrame+1,Math.min(info.frames,Math.ceil(end*info.sampleRate)));
  const data=bytes.subarray(info.dataOffset+startFrame*info.blockAlign, info.dataOffset+endFrame*info.blockAlign);
  const output=makeWav(data,info);
  return { buffer:output.buffer, mime:"audio/wav", actualStart:startFrame/info.sampleRate, actualEnd:endFrame/info.sampleRate, duration:(endFrame-startFrame)/info.sampleRate };
}

function wavSplit(bytes, at, info) {
  if (!info) return null;
  const boundary=Math.max(1,Math.min(info.frames-1,Math.round(at*info.sampleRate)));
  const byteBoundary=info.dataOffset+boundary*info.blockAlign;
  const left=makeWav(bytes.subarray(info.dataOffset,byteBoundary),info);
  const right=makeWav(bytes.subarray(byteBoundary,info.dataOffset+info.dataSize),info);
  const actualAt=boundary/info.sampleRate;
  return { mime:"audio/wav", actualAt, left:left.buffer, right:right.buffer, leftDuration:actualAt, rightDuration:info.duration-actualAt };
}

function makeWav(data, info) {
  const output=new Uint8Array(44+data.length), view=new DataView(output.buffer);
  ascii(view,0,"RIFF"); view.setUint32(4,36+data.length,true); ascii(view,8,"WAVE"); ascii(view,12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,info.channels,true); view.setUint32(24,info.sampleRate,true);
  view.setUint32(28,info.sampleRate*info.blockAlign,true); view.setUint16(32,info.blockAlign,true); view.setUint16(34,16,true);
  ascii(view,36,"data"); view.setUint32(40,data.length,true); output.set(data,44); return output;
}

function ascii(view, offset, value) { for (let index=0; index<value.length; index++) view.setUint8(offset+index,value.charCodeAt(index)); }

function mp3Frames(bytes) {
  let offset=id3(bytes), time=0; const frames=[];
  while (offset+4<=bytes.length) {
    const parsed=frame(bytes,offset);
    if (!parsed || offset+parsed.len>bytes.length) { offset++; continue; }
    const duration=parsed.samples/parsed.rate;
    frames.push({ offset, len:parsed.len, start:time, end:time+duration });
    time+=duration; offset+=parsed.len;
  }
  return frames;
}

function mp3Slice(bytes, start, end) {
  const frames=mp3Frames(bytes); if (!frames.length) return null;
  let first=frames.findIndex((item)=>item.end>start); if (first<0) return null;
  let last=first; while (last<frames.length && frames[last].start<end) last++;
  if (last<=first) last=first+1;
  const actualStart=frames[first].start, actualEnd=frames[last-1].end;
  const output=bytes.slice(frames[first].offset,frames[last-1].offset+frames[last-1].len);
  return { buffer:output.buffer, mime:"audio/mpeg", actualStart, actualEnd, duration:actualEnd-actualStart };
}

function mp3Split(bytes, at) {
  const frames=mp3Frames(bytes); if (frames.length<2) return null;
  let boundary=1, best=Infinity;
  for (let index=1; index<frames.length; index++) {
    const distance=Math.abs(frames[index].start-at); if (distance<best) { best=distance; boundary=index; }
  }
  const actualAt=frames[boundary].start, firstOffset=frames[0].offset, splitOffset=frames[boundary].offset, endOffset=frames[frames.length-1].offset+frames[frames.length-1].len;
  if (splitOffset<=firstOffset || splitOffset>=endOffset) return null;
  const left=bytes.slice(firstOffset,splitOffset), right=bytes.slice(splitOffset,endOffset), total=frames[frames.length-1].end;
  return { mime:"audio/mpeg", actualAt, left:left.buffer, right:right.buffer, leftDuration:actualAt, rightDuration:total-actualAt };
}

function cropAlignment(value, start, end) {
  const alignment=parse(value), characters=Array.isArray(alignment?.characters)?alignment.characters:[];
  const starts=Array.isArray(alignment?.character_start_times_seconds)?alignment.character_start_times_seconds:[];
  const ends=Array.isArray(alignment?.character_end_times_seconds)?alignment.character_end_times_seconds:[];
  if (!characters.length || characters.length!==starts.length || characters.length!==ends.length) return null;
  const outChars=[], outStarts=[], outEnds=[];
  for (let index=0; index<characters.length; index++) {
    const s=Number(starts[index]), e=Number(ends[index]);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e<=start || s>=end) continue;
    outChars.push(String(characters[index] ?? ""));
    outStarts.push(round(Math.max(0,s-start)));
    outEnds.push(round(Math.max(0,Math.min(end,e)-start)));
  }
  return outChars.length ? { text:outChars.join(""), alignment:{ characters:outChars, character_start_times_seconds:outStarts, character_end_times_seconds:outEnds } } : null;
}

function durationFromAlignment(value) { const alignment=parse(value), ends=Array.isArray(alignment?.character_end_times_seconds)?alignment.character_end_times_seconds:[]; for (let index=ends.length-1; index>=0; index--) { const n=Number(ends[index]); if (Number.isFinite(n)&&n>0) return round(n); } return null; }
function frame(bytes,offset){const x=bytes[offset],y=bytes[offset+1],z=bytes[offset+2];if(x!==255||(y&224)!==224)return null;const vb=(y>>3)&3,lb=(y>>1)&3,bi=(z>>4)&15,si=(z>>2)&3;if(vb===1||lb!==1||!bi||bi===15||si===3)return null;const ver=vb===3?1:vb===2?2:2.5,br=(ver===1?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bi]*1000,rate=[44100,48000,32000][si]/(ver===1?1:ver===2?2:4),pad=(z>>1)&1,samples=ver===1?1152:576,len=Math.floor((ver===1?144:72)*br/rate+pad);return len>=24&&offset+len<=bytes.length?{rate,samples,len}:null}
function id3(bytes){if(bytes.length<10||text(bytes,0,3)!=="ID3")return 0;return Math.min(bytes.length,10+((bytes[6]&127)<<21|((bytes[7]&127)<<14)|((bytes[8]&127)<<7)|(bytes[9]&127)))}
function text(bytes,offset,count){let value="";for(let index=0;index<count&&offset+index<bytes.length;index++)value+=String.fromCharCode(bytes[offset+index]);return value}
function decode64(value){const binary=atob(String(value||"").replace(/\s+/g,"")),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes.buffer}
function parse(value){if(!value)return null;if(typeof value==="object")return value;try{return JSON.parse(String(value))}catch{return null}}
function round(value){return Math.round(Number(value)*1000)/1000}
function pub(message){const error=new Error(String(message));error.publicMessage=error.message;return error}
