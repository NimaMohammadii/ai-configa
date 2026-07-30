import test from "node:test";
import assert from "node:assert/strict";

import { adminImageExploreKeyboard, adminImageExploreVoiceKeyboard, adminVoiceProfilesKeyboard } from "../src/admin.js";

function items(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    fileId: "file-" + index,
    mediaType: index === 10 ? "video" : "image",
    size: "1024x1024",
    tags: [],
    order: index + 1,
  }));
}

test("Explore admin content is paginated ten items at a time", () => {
  const first = adminImageExploreKeyboard(items(21), 0).inline_keyboard;
  const second = adminImageExploreKeyboard(items(21), 1).inline_keyboard;
  const last = adminImageExploreKeyboard(items(21), 2).inline_keyboard;

  assert.equal(first.filter((row) => row.length === 6).length, 10);
  assert.equal(second.filter((row) => row.length === 6).length, 10);
  assert.equal(last.filter((row) => row.length === 6).length, 1);
  assert.equal(second[1][0].text, "🔊 Voice");
  assert.equal(second[1][1].text, "#11 Upload");
  assert.deepEqual(first.at(-2), [{ text: "Next →", callback_data: "admin_image_explore:1" }]);
  assert.deepEqual(last.at(-2), [{ text: "← Prev", callback_data: "admin_image_explore:1" }]);
});


test("Explore video voice picker displays four voices per row", () => {
  const rows = adminImageExploreVoiceKeyboard("video-1", "Nora").inline_keyboard;
  const voiceRows = rows.slice(0, -1);

  assert.ok(voiceRows.length > 1);
  assert.ok(voiceRows.every((row, index) => row.length === 4 || index === voiceRows.length - 1));
  assert.ok(voiceRows.flat().some((button) => button.text === "✅ Nora"));
  assert.ok(voiceRows.flat().every((button) => button.callback_data.startsWith("admin_image_explore_set_voice:video-1:")));
});

test("Explore videos keep an accessible voice selector after upload", () => {
  const rows = adminImageExploreKeyboard(items(11), 1).inline_keyboard;
  assert.equal(rows[1][0].callback_data, "admin_image_explore_voice:11");
  assert.equal(rows[1][1].text, "#11 Upload");
});


test("Admin voice profiles are paginated ten voices at a time", () => {
  const first = adminVoiceProfilesKeyboard(0).inline_keyboard;
  const second = adminVoiceProfilesKeyboard(1).inline_keyboard;

  const firstVoiceRows = first.slice(0, -2);
  assert.equal(firstVoiceRows.length, 10);
  assert.ok(firstVoiceRows.every((row) => row.length === 2));
  assert.ok(firstVoiceRows.every((row) => row[0].callback_data.startsWith("admin_voice_profile_upload:0:")));
  assert.deepEqual(first.at(-2), [{ text: "Next →", callback_data: "admin_voice_profiles:1" }]);
  assert.equal(second[0][0].callback_data.startsWith("admin_voice_profile_upload:1:"), true);
  assert.equal(second.at(-2)[0].callback_data, "admin_voice_profiles:0");
});
