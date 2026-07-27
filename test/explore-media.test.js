import test from "node:test";
import assert from "node:assert/strict";

import { proxyTelegramExploreFile } from "../src/explore-media.js";

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
