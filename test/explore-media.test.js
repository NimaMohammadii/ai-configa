import test from "node:test";
import assert from "node:assert/strict";

import { proxyTelegramExploreFile, serveExploreMediaFromR2, storeTelegramExploreMedia } from "../src/explore-media.js";

test("Explore video proxy forwards byte ranges and preserves partial response headers", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return Response.json({ ok: true, result: { file_path: "videos/demo.mp4" } });
    }
    return new Response("partial-video", {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-length": "13",
        "content-range": "bytes 0-12/100",
        "accept-ranges": "bytes",
      },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request("https://example.com/mini-app/api/explore-image/1", {
    headers: { Range: "bytes=0-12" },
  });
  const response = await proxyTelegramExploreFile(request, { BOT_TOKEN: "secret" }, "video-file", "video");

  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[1].options.headers).get("range"), "bytes=0-12");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-range"), "bytes 0-12/100");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(await response.text(), "partial-video");
});

test("Explore video proxy exposes generic Telegram files as MP4", async (t) => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return Response.json({ ok: true, result: { file_path: "videos/demo.mp4" } });
    return new Response("video", {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "5",
      },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await proxyTelegramExploreFile(
    new Request("https://example.com/mini-app/api/explore-image/1"),
    { BOT_TOKEN: "secret" },
    "video-file",
    "video",
  );

  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
});

test("Explore media uploads are copied from Telegram into R2", async (t) => {
  const originalFetch = globalThis.fetch;
  const puts = [];
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return Response.json({ ok: true, result: { file_path: "videos/demo.mp4" } });
    return new Response("video-data", { headers: { "content-type": "application/octet-stream" } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const env = {
    BOT_TOKEN: "secret",
    EXPLORE_MEDIA: {
      async put(key, body, options) {
        puts.push({ key, body: new Uint8Array(body), options });
      },
    },
  };
  const key = await storeTelegramExploreMedia(env, "item-1", "video-file", "video");

  assert.equal(key, "explore/item-1.mp4");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].options.httpMetadata.contentType, "video/mp4");
  assert.equal(new TextDecoder().decode(puts[0].body), "video-data");
});

test("R2 Explore videos support byte range playback", async () => {
  const bucket = {
    async get(key, options) {
      assert.equal(key, "explore/item-1.mp4");
      assert.equal(new Headers(options.range).get("range"), "bytes=5-9");
      return {
        body: "chunk",
        size: 100,
        range: { offset: 5, length: 5 },
        httpEtag: '"etag"',
        writeHttpMetadata(headers) {
          headers.set("content-type", "video/mp4");
        },
      };
    },
  };
  const response = await serveExploreMediaFromR2(
    new Request("https://example.com/mini-app/api/explore-image/1", { headers: { Range: "bytes=5-9" } }),
    bucket,
    "explore/item-1.mp4",
    "video",
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 5-9/100");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await response.text(), "chunk");
});
