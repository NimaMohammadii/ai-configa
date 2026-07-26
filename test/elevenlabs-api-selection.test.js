import assert from "node:assert/strict";
import test from "node:test";

import { getSelectedElevenApiKey, textToSpeech } from "../src/elevenlabs.js";

function fakeDb(selectedKey) {
  return {
    prepare(sql) {
      return {
        async run() {
          assert.match(sql, /CREATE TABLE IF NOT EXISTS app_settings/);
        },
        async first() {
          assert.match(sql, /eleven_api_key_name/);
          return selectedKey ? { value: selectedKey } : null;
        },
      };
    },
  };
}

test("the legacy ELEVEN_API remains the default", async () => {
  const key = await getSelectedElevenApiKey({ DB: fakeDb(null), ELEVEN_API: "legacy-key" });
  assert.equal(key, "legacy-key");
});

test("text-to-speech uses the ElevenLabs key selected by the admin", async () => {
  const originalFetch = globalThis.fetch;
  let sentApiKey = null;
  globalThis.fetch = async (_url, options) => {
    sentApiKey = options.headers["xi-api-key"];
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  try {
    const audio = await textToSpeech({
      DB: fakeDb("ELEVEN_API_2v"),
      ELEVEN_API: "legacy-key",
      ELEVEN_API_2v: "selected-key",
    }, "hello", "voice-id");

    assert.equal(sentApiKey, "selected-key");
    assert.deepEqual([...new Uint8Array(audio)], [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an invalid stored selection safely falls back to ELEVEN_API", async () => {
  const key = await getSelectedElevenApiKey({
    DB: fakeDb("UNSUPPORTED_KEY"),
    ELEVEN_API: "legacy-key",
    UNSUPPORTED_KEY: "should-not-be-used",
  });
  assert.equal(key, "legacy-key");
});
