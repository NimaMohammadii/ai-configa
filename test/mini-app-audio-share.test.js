import test from "node:test";
import assert from "node:assert/strict";

import { MINI_APP_JS } from "../src/mini-app/client.js";

test("audio sharing sends only the generated audio file", () => {
  const audioShare = MINI_APP_JS.slice(
    MINI_APP_JS.indexOf("async function shareAudioSource"),
    MINI_APP_JS.indexOf("async function shareHistory"),
  );

  assert.match(audioShare, /navigator\.share\(\{files:\[file\]\}\)/);
  assert.doesNotMatch(audioShare, /(?:title|text|url):/);
});

test("audio sharing falls back to a direct download when file sharing fails", () => {
  assert.match(MINI_APP_JS, /catch\(error\)\{if\(error&&error\.name==='AbortError'\)throw error\}\}downloadAudioBlob\(blob,audioName\)/);
  assert.match(MINI_APP_JS, /link\.download=filename\|\|'vexa-voice\.mp3'/);
});
