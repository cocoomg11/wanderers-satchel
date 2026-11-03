import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldResetKeybinding, storedBinding } from "../scripts/keybind-model.mjs";
import { OWN_SKIP } from "../scripts/settings-model.mjs";
import { SETTING_ROWS } from "../scripts/features-model.mjs";

test("shouldResetKeybinding: only a stored empty list, once", () => {
  assert.equal(shouldResetKeybinding([], false), true);
  assert.equal(shouldResetKeybinding([], true), false);
  assert.equal(shouldResetKeybinding([{ key: "KeyH", modifiers: [] }], false), false, "a user's key is never touched");
  assert.equal(shouldResetKeybinding(undefined, false), false);
  assert.equal(shouldResetKeybinding(null, false), false);
  assert.equal(shouldResetKeybinding({}, false), false);
});

test("storedBinding reads one action out of any shape", () => {
  assert.deepEqual(storedBinding({ "wanderers-satchel.open": [] }, "wanderers-satchel.open"), []);
  assert.equal(storedBinding({}, "wanderers-satchel.open"), undefined);
  for (const bad of [null, undefined, "x", 3, []]) assert.equal(storedBinding(bad, "a.b"), undefined);
});

test("keybindMigrated is a client row, never exported, and main.mjs repairs on ready", () => {
  const row = SETTING_ROWS.find(r => r.key === "keybindMigrated");
  assert.ok(row && row.client === true && row.default === false);
  assert.ok(OWN_SKIP.includes("keybindMigrated"));
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.match(main, /game\.keybindings\.set\(ID, "open"/);
  assert.match(main, /repairKeybinding\(\);/);
});
