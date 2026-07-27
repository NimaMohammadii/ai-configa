import { getImageExploreItems } from "./admin.js";
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
  if (!item?.fileId) return new Response("Not Found", { status: 404 });
  return proxyTelegramExploreFile(request, env, item.fileId, item.mediaType);
}

export async function proxyTelegramExploreFile(request, env, fileId, mediaType = "image") {
  const file = await tgJson(env, "getFile", { file_id: fileId });
  const filePath = String(file?.file_path || "");
  if (!filePath) return new Response("Not Found", { status: 404 });

  const telegramUrl = [
    "https://api.telegram.org",
    "file",
    "bot" + env.BOT_TOKEN,
    filePath,
  ].join("/");
  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);

  const upstream = await fetch(telegramUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: upstreamHeaders,
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Not Found", { status: upstream.status === 416 ? 416 : 404 });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", mediaType === "video" ? "video/mp4" : "image/jpeg");
  }
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
