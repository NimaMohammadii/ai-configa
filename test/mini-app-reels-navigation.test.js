import test from "node:test";
import assert from "node:assert/strict";

import { MINI_APP_JS } from "../src/mini-app/client.js";

test("Reels explicitly start only the visible video", () => {
  assert.match(MINI_APP_JS, /function syncExploreReelPlayback\(\)/);
  assert.match(MINI_APP_JS, /Number\(reel\.getAttribute\('data-reel-offset'\)\)===0/);
  assert.match(MINI_APP_JS, /playing=video\.play\(\)/);
  assert.match(MINI_APP_JS, /setExploreReelsPage\(true\);syncExploreReelPlayback\(\)/);
});

test("the Reels voice profile navigates without previewing and returns to the same Reel", () => {
  assert.match(MINI_APP_JS, /data-action="open-reel-voice"/);
  assert.doesNotMatch(MINI_APP_JS, /explore-reel-sound" data-action="preview-voice"/);
  assert.match(MINI_APP_JS, /function openReelVoice\(button\)/);
  assert.match(MINI_APP_JS, /if\(returnToReels\)restoreExploreReels\(\)/);
  assert.doesNotMatch(MINI_APP_JS, /function restoreExploreReels\(\)\{[^}]*exploreReelIndex=0/);
});
