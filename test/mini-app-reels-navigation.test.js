import test from "node:test";
import assert from "node:assert/strict";

import { MINI_APP_JS } from "../src/mini-app/client.js";

test("Reels explicitly start only the visible video", () => {
  assert.match(MINI_APP_JS, /function syncExploreReelPlayback\(\)/);
  assert.match(MINI_APP_JS, /Number\(reel\.getAttribute\('data-reel-offset'\)\)===0/);
  assert.match(MINI_APP_JS, /playing=video\.play\(\)/);
  assert.match(MINI_APP_JS, /var preload=active\|\|video\.dataset\.reelWarmed==='true'\?'auto':'metadata'/);
  assert.match(MINI_APP_JS, /video.loop=true/);
  assert.match(MINI_APP_JS, /var exploreReelAudioEnabled=readExploreReelAudioState()/);
  assert.match(MINI_APP_JS, /data-action="toggle-explore-reel-audio"/);
  assert.match(MINI_APP_JS, /function toggleExploreReelAudio\(button\)/);
  assert.match(MINI_APP_JS, /video.muted=muted;video.defaultMuted=muted/);
  assert.match(MINI_APP_JS, /saveExploreReelAudioState\(exploreReelAudioEnabled\)/);
  assert.match(MINI_APP_JS, /video\.networkState===0/);
  assert.match(MINI_APP_JS, /video\.addEventListener\('loadeddata',function\(\)\{markExploreReelReady\(video\)/);
  assert.match(MINI_APP_JS, /video\.addEventListener\('playing',function\(\)\{markExploreReelReady\(video\);warmNextExploreReelVideo\(video\)/);
  assert.match(MINI_APP_JS, /class="explore-reel-cover"/);
  assert.match(MINI_APP_JS, /poster=".*?"/s);
  assert.match(MINI_APP_JS, /function prepareExploreCardPoster\(video\)/);
  assert.match(MINI_APP_JS, /video\.currentTime=\.001/);
  assert.match(MINI_APP_JS, /requestAnimationFrame\(prepareExploreCardPosters\)/);
  assert.match(MINI_APP_JS, /function retryExploreReelSource\(video\)/);
  assert.match(MINI_APP_JS, /video\.addEventListener\('ended'/);
  assert.match(MINI_APP_JS, /video\._reelPlayRetry=setTimeout/);
  assert.match(MINI_APP_JS, /setExploreReelsPage\(true\);syncExploreReelPlayback\(\)/);
});

test("Reels audio stays muted outside the active Reels page", () => {
  assert.match(
    MINI_APP_JS,
    /class="explore-reel-media" src=".*?" muted loop playsinline/s,
  );
  assert.match(
    MINI_APP_JS,
    /var active=isActiveExploreReelVideo\(video\);var muted=!exploreReelAudioEnabled\|\|!active/,
  );
  assert.match(
    MINI_APP_JS,
    /function stopExploreReelVideo\(video,release\).*?video\.muted=true;video\.defaultMuted=true;video\.volume=0;video\.setAttribute\('muted',''\).*?video\.pause\(\)/s,
  );
  assert.match(MINI_APP_JS, /var exploreReelVideoRegistry=new Set\(\)/);
  assert.match(
    MINI_APP_JS,
    /function stopExploreReelVideo\(video,release\).*?video\.removeAttribute\('src'\).*?video\.load\(\)/s,
  );
  assert.match(
    MINI_APP_JS,
    /function renderExploreReels\(\).*?releaseExploreReelVideos\(\).*?feed\.innerHTML=/s,
  );
  assert.match(
    MINI_APP_JS,
    /function setExploreReelsPage\(open\).*?if\(!open\)releaseExploreReelVideos\(\)/s,
  );
});

test("the Reels voice profile navigates without previewing and returns to the same Reel", () => {
  assert.match(MINI_APP_JS, /data-action="open-reel-voice"/);
  assert.doesNotMatch(MINI_APP_JS, /explore-reel-sound" data-action="preview-voice"/);
  assert.match(MINI_APP_JS, /function openReelVoice\(button\)/);
  assert.match(MINI_APP_JS, /if\(returnToReels\)restoreExploreReels\(\)/);
  assert.doesNotMatch(MINI_APP_JS, /function restoreExploreReels\(\)\{[^}]*exploreReelIndex=0/);
});

test("the Voices BackButton replaces the underlying Explore handlers", () => {
  const setVoicesPage = MINI_APP_JS.match(
    /function setVoicesPage\(open\)\{.*?\n  function openVoicesPage\(\)/s,
  )?.[0];

  assert.ok(setVoicesPage, "setVoicesPage should be present");
  assert.match(setVoicesPage, /offClick\(closeExplorePage\)/);
  assert.match(setVoicesPage, /offClick\(closeExploreReels\)/);
  assert.match(
    setVoicesPage,
    /offClick\(closeExploreReels\).*?onClick\(closeVoicesPage\)/s,
  );
});
