import test from "node:test";
import assert from "node:assert/strict";

import {
  adminCreditPageImageKeyboard,
  adminMainKeyboard,
} from "../src/admin.js";
import { MINI_APP_HTML } from "../src/mini-app/html.js";
import { MINI_APP_JS } from "../src/mini-app/client.js";
import { MINI_APP_CSS } from "../src/mini-app/styles.js";

test("admin panel exposes credit page image upload and deletion controls", () => {
  const mainCallbacks = adminMainKeyboard().inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(mainCallbacks.includes("admin_credit_page_image"));

  const emptyCallbacks = adminCreditPageImageKeyboard(false).inline_keyboard.flat().map((button) => button.callback_data);
  assert.deepEqual(emptyCallbacks, ["admin_credit_page_image_upload", "admin_main"]);

  const configuredCallbacks = adminCreditPageImageKeyboard(true).inline_keyboard.flat().map((button) => button.callback_data);
  assert.deepEqual(configuredCallbacks, ["admin_credit_page_image_upload", "admin_credit_page_image_delete", "admin_main"]);
});

test("credit purchase page includes and initializes the configurable hero image", () => {
  const heroIndex = MINI_APP_HTML.indexOf('id="creditsHero"');
  const headerIndex = MINI_APP_HTML.indexOf('class="credits-page-head"');
  assert.ok(heroIndex >= 0 && heroIndex < headerIndex, "hero should be above the credit page header");
  assert.match(MINI_APP_JS, /applyCreditsPageImage\(data\.creditPageImageUrl\)/);
  assert.match(MINI_APP_CSS, /\.credits-hero\.show\{display:block\}/);
});
