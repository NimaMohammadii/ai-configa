import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { MINI_APP_JS } from "../src/mini-app/client.js";

test("the composed Mini App client remains valid JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(MINI_APP_JS));
});

test("patch source containing dollar replacement tokens is injected literally", () => {
  const usdFormatter =
    "function purchaseFormatUsd(credits){return '$'+(Math.max(0,Number(credits)||0)*.000178)";

  assert.equal(MINI_APP_JS.split(usdFormatter).length - 1, 1);
  assert.equal(MINI_APP_JS.split("function purchaseRenderPrices()").length - 1, 1);
});
