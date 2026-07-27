import { getImageExploreItems, setImageExploreStorageKey } from "./admin.js";
import { tgJson } from "./telegram-api.js";

const EXPLORE_MEDIA_PATH = "/mini-app/api/explore-image/";

export function isExploreMediaRequest(request) {
  const url = new URL(request.url);
  return (request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith(EXPLORE_MEDIA_PATH);
}

export async function handleExploreMediaRequest(request, env) {
  const url = new URL(request.url);
  const itemId = decodeURIComponent(url.pathname.slice(EXPLORE_MEDIA_PATH.length));
  const item = (await getImageExploreItems(env)).find((entry) => entry.id === itemId);
  if (!item || (!item.fileId && !item.storageKey)) return new Response("Not Found", { status: 404 });
  if (env.EXPLORE_MEDIA) {
    let storageKey = item.storageKey;
    if (!storageKey && item.fileId) {
      storageKey = await storeTelegramExploreMedia(env, item.id, item.fileId, item.mediaType).catch(() => "");
      if (storageKey) await setImageExploreStorageKey(env, item.id, storageKey).catch(() => null);
    }
    if (storageKey) {
      const response = await serveExploreMediaFromR2(request, env.EXPLORE_MEDIA, storageKey, item.mediaType);
      if (response) return response;
    }
  }
  return proxyTelegramExploreFile(request, env, item.fileId, item.mediaType);
}

export async function storeTelegramExploreMedia(env, itemId, fileId, mediaType = "image") {
  if (!env.EXPLORE_MEDIA) return "";
  const { response, filePath } = await fetchTelegramExploreFile(env, fileId);
  if (!response.ok) throw new Error("Explore media download failed");
  const contentType = normalizedContentType(response.headers.get("content-type"), mediaType);
  const extension = mediaType === "video" ? "mp4" : contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storageKey = "explore/" + String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_") + "." + extension;
  await env.EXPLORE_MEDIA.put(storageKey, await response.arrayBuffer(), {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: "inline",
    },
    customMetadata: {
      telegramFileId: String(fileId),
      telegramFilePath: filePath,
      mediaType: mediaType === "video" ? "video" : "image",
    },
  });
  return storageKey;
}

export async function serveExploreMediaFromR2(request, bucket, storageKey, mediaType = "image") {
  const range = request.headers.get("range");
  const object = request.method === "HEAD"
    ? await bucket.head(storageKey)
    : await bucket.get(storageKey, range ? { range: request.headers } : undefined);
  if (!object) return null;

  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") object.writeHttpMetadata(headers);
  headers.set("content-type", normalizedContentType(headers.get("content-type"), mediaType));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-disposition", "inline");
  headers.set("accept-ranges", "bytes");
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  let status = 200;
  if (range && object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    const start = object.range.offset;
    const length = object.range.length;
    headers.set("content-range", "bytes " + start + "-" + (start + length - 1) + "/" + object.size);
    headers.set("content-length", String(length));
    status = 206;
  } else if (Number.isFinite(object.size)) {
    headers.set("content-length", String(object.size));
  }

  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}

export async function proxyTelegramExploreFile(request, env, fileId, mediaType = "image") {
  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);
  const { response: upstream } = await fetchTelegramExploreFile(env, fileId, request.method === "HEAD" ? "HEAD" : "GET", upstreamHeaders);
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Not Found", { status: upstream.status === 416 ? 416 : 404 });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-type", normalizedContentType(headers.get("content-type"), mediaType));
  if (mediaType === "video" && !headers.has("accept-ranges")) {
    headers.set("accept-ranges", "bytes");
  }
  headers.set("cache-control", "public, max-age=86400");
  headers.set("content-disposition", "inline");
  headers.set("vary", "Range");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function fetchTelegramExploreFile(env, fileId, method = "GET", headers = undefined) {
  const file = await tgJson(env, "getFile", { file_id: fileId });
  const filePath = String(file?.file_path || "");
  if (!filePath) throw new Error("Explore media not found");
  const telegramUrl = [
    "https://api.telegram.org",
    "file",
    "bot" + env.BOT_TOKEN,
    filePath,
  ].join("/");
  return {
    filePath,
    response: await fetch(telegramUrl, { method, headers }),
  };
}

function normalizedContentType(value, mediaType) {
  const contentType = String(value || "").toLowerCase();
  if (!contentType || contentType === "application/octet-stream" || contentType === "binary/octet-stream") {
    return mediaType === "video" ? "video/mp4" : "image/jpeg";
  }
  return contentType;
}
