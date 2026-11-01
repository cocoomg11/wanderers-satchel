// 0.6.0: the move to wanderers-core 0.5.0 (store on createStore, Module data folder, remembered windows, open key binding,
// skip lists, core's readFix). The Foundry halves run against core's fakes only (not Foundry).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeWorld, installFakes, actAs } from "../vendor/wanderers-core/testing/index.mjs";

const ID = "wanderers-satchel";
/** @type {any} */ let world; /** @type {() => void} */ let restore; /** @type {any} */ let gm; /** @type {any} */ let player;
beforeEach(() => {
  world = fakeWorld({ users: [{ name: "GM", isGM: true }, { name: "Pat" }], modules: [{ id: ID }] });
  [gm, player] = world.users.contents;
  restore = installFakes(world, gm);
});
afterEach(() => restore());

test("store: a 0.5.0 entry is found by its marker flag, read as before, filed in Module data once", async () => {
  const Store = await import("../scripts/store.mjs");
  const old = await JournalEntry.create({ name: "Renamed by the GM", flags: { [ID]: { storeEntry: true, store: { v: 1, seen: { a: "1.0.0" }, backed: {}, updateBackup: "", snapshots: [] } } } });
  assert.equal(Store.entry(), old);
  assert.deepEqual(Store.read().seen, { a: "1.0.0" });
  assert.equal(old.folder, null);
  assert.equal(await Store.file(), true);
  const folder = world.folders.contents[0];
  assert.equal(folder.name, "Module data");
  assert.equal(old.folder, folder.id);
  assert.equal(old.getFlag(ID, "dataFolderFiled"), true);
  assert.equal(old.name, "Renamed by the GM");
  // A GM who moves it back to the root keeps their choice.
  await old.update({ folder: null });
  assert.equal(await Store.file(), false);
  assert.equal(old.folder, null);
});

test("store: update keeps the shape; players read nothing and can't write; remove deletes the entry and the empty folder", async () => {
  const Store = await import("../scripts/store.mjs");
  const next = await Store.update(s => ({ ...s, seen: { x: "2.0.0" } }));
  assert.deepEqual(next.seen, { x: "2.0.0" });
  const j = Store.entry();
  assert.equal(j.getFlag(ID, "storeEntry"), true);
  assert.equal(j.name, Store.NAME);
  assert.ok(j.folder, "a new entry is created inside Module data");
  assert.deepEqual(Store.status().playersCanSee, []);
  actAs(world, player);
  assert.equal(Store.entry(), null);
  assert.deepEqual(Store.read().seen, {});
  await assert.rejects(Store.update(s => s));
  actAs(world, gm);
  assert.equal(await Store.remove(), 1);
  assert.equal(world.journal.contents.length, 0);
  assert.equal(world.folders.contents.length, 0);
});

test("store: the health fix's input sees players who can read the journal", async () => {
  const Store = await import("../scripts/store.mjs");
  await Store.update(s => s);
  await Store.entry().update({ ownership: { default: 0, [player.id]: 2 } });
  assert.deepEqual(Store.status().playersCanSee, ["Pat"]);
});
