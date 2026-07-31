import assert from "node:assert/strict";
import test from "node:test";

import { getAiChatModel, setAiChatModel } from "../src/ai-chat-model.js";
import { chatWithAi } from "../src/gpt.js";

function fakeDb(initialValue = null) {
  let value = initialValue;
  return {
    prepare(sql) {
      const bindings = [];
      return {
        bind(...values) {
          bindings.push(...values);
          return this;
        },
        async first() {
          assert.match(sql, /SELECT value FROM app_settings/);
          return value == null ? null : { value };
        },
        async run() {
          if (/INSERT INTO app_settings/.test(sql)) value = bindings[1];
          return { success: true };
        },
      };
    },
  };
}

test("Terra is the safe default and invalid stored values are ignored", async () => {
  assert.equal(await getAiChatModel({ DB: fakeDb() }), "gpt-5.6-terra");
  assert.equal(await getAiChatModel({ DB: fakeDb("unknown-model") }), "gpt-5.6-terra");
});

test("the selected model is persisted and validated", async () => {
  const env = { DB: fakeDb() };
  await setAiChatModel(env, "gpt-5.6-luna");
  assert.equal(await getAiChatModel(env), "gpt-5.6-luna");
  await assert.rejects(() => setAiChatModel(env, "gpt-5.6-other"), /Invalid AI chat model/);
});

test("AI Chat sends the admin-selected Luna model to the Responses API", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const completed = { type: "response.completed", response: { output_text: "hello" } };
    return new Response("event: response.completed\ndata: " + JSON.stringify(completed) + "\n\n", { status: 200 });
  };

  try {
    const result = await chatWithAi(
      { DB: fakeDb("gpt-5.6-luna"), GPT_API: "test-key" },
      [{ role: "user", content: "Hi" }],
    );
    assert.equal(requestBody.model, "gpt-5.6-luna");
    assert.equal(result.message, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
