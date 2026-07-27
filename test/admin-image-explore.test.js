import test from "node:test";
import assert from "node:assert/strict";

import { adminImageExploreKeyboard } from "../src/admin.js";

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
  assert.equal(second[1][0].text, "11");
  assert.deepEqual(first.at(-2), [{ text: "Next →", callback_data: "admin_image_explore:1" }]);
  assert.deepEqual(last.at(-2), [{ text: "← Prev", callback_data: "admin_image_explore:1" }]);
});
