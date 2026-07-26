import assert from "node:assert/strict";
import test from "node:test";

import { grantInitialStartBonusOnce } from "../src/start-bonus.js";
import { grantFaJoinBonusOnce } from "../src/mandatory-channel.js";

function createEnv(initialCredits = 275) {
  const data = {
    settings: new Map([["initial_start_credits", String(initialCredits)]]),
    initialBonuses: new Map(),
    faBonuses: new Map(),
    balances: new Map(),
  };

  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          if (sql.includes("FROM app_settings")) {
            const value = data.settings.get(values[0]);
            return value == null ? null : { value };
          }
          if (sql.includes("FROM initial_start_bonuses")) {
            const row = data.initialBonuses.get(values[0]);
            return row ? { ...row } : null;
          }
          if (sql.includes("FROM fa_join_bonuses")) {
            const row = data.faBonuses.get(values[0]);
            return row ? { ...row } : null;
          }
          if (sql.includes("SELECT credits FROM user_credits")) {
            return { credits: data.balances.get(values[0]) || 0 };
          }
          throw new Error(`Unhandled first(): ${sql}`);
        },
        async run() {
          if (sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
          if (sql.startsWith("INSERT OR IGNORE INTO initial_start_bonuses")) {
            if (data.initialBonuses.has(values[0])) return { meta: { changes: 0 } };
            data.initialBonuses.set(values[0], { credits: values[1], language: values[2] });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT OR IGNORE INTO user_credits")) {
            if (!data.balances.has(values[0])) data.balances.set(values[0], 0);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE user_credits SET credits = credits +")) {
            data.balances.set(values[1], (data.balances.get(values[1]) || 0) + values[0]);
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unhandled run(): ${sql}`);
        },
      };
    },
  };

  return { env: { DB }, data };
}

test("all languages receive exactly the configured initial credit amount once", async () => {
  for (const language of ["en", "fa", "de", "ar"]) {
    const { env, data } = createEnv(275);
    const first = language === "fa"
      ? await grantFaJoinBonusOnce(env, `user-${language}`)
      : (await grantInitialStartBonusOnce(env, `user-${language}`, language)).granted;

    assert.equal(first, true);
    assert.equal(data.balances.get(`user-${language}`), 275);
  }
});

test("changing language or completing Persian onboarding cannot grant again", async () => {
  const { env, data } = createEnv(320);

  assert.equal((await grantInitialStartBonusOnce(env, "user-1", "en")).granted, true);
  assert.equal((await grantInitialStartBonusOnce(env, "user-1", "de")).granted, false);
  assert.equal(await grantFaJoinBonusOnce(env, "user-1"), false);
  assert.equal(data.balances.get("user-1"), 320);
});

test("legacy Persian bonus is recognized without adding credits again", async () => {
  const { env, data } = createEnv(500);
  data.faBonuses.set("legacy-user", { credits: 100 });
  data.balances.set("legacy-user", 100);

  const result = await grantInitialStartBonusOnce(env, "legacy-user", "en");

  assert.equal(result.granted, false);
  assert.equal(data.balances.get("legacy-user"), 100);
  assert.deepEqual(data.initialBonuses.get("legacy-user"), { credits: 100, language: "en" });
});
