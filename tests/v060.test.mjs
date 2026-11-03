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
  const old = await /** @type {any} */ (globalThis).JournalEntry.create({ name: "Renamed by the GM", flags: { [ID]: { storeEntry: true, store: { v: 1, seen: { a: "1.0.0" }, backed: {}, updateBackup: "", snapshots: [] } } } });
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

test("cleanup: plan finds the store and our client records (showModuleData, windowPlacement); remove() goes through Store.remove()", async () => {
  const Store = await import("../scripts/store.mjs");
  const Cleanup = await import("../scripts/cleanup.mjs");
  const { registerWindowPlacement } = await import("../vendor/wanderers-core/foundry/index.mjs");
  const { S } = await import("../scripts/core.mjs");
  S.register(); registerWindowPlacement(ID);
  await Store.update(s => s);
  await /** @type {any} */ (globalThis).game.settings.set(ID, "showModuleData", true);
  await /** @type {any} */ (globalThis).game.settings.set(ID, "windowPlacement", { v: 1, windows: { hub: { left: 1, top: 2 } } });
  const p = Cleanup.plan();
  assert.equal(p.store.length, 1);
  assert.deepEqual(p.settings.map(c => c.key).sort(), ["showModuleData", "windowPlacement"]);
  const done = await Cleanup.remove({ store: true });
  assert.equal(done.store, 1);
  assert.equal(world.journal.contents.length, 0);
  assert.equal(world.folders.contents.length, 0, "the empty Module data folder goes with it");
});

test("dataFolderModel: own switch, other modules' switches read-only, shown when any is on", async () => {
  const HM = await import("../scripts/hub-model.mjs");
  const View = await import("../scripts/hub-view.mjs");
  const off = HM.dataFolderModel([{ id: ID, title: "Satchel", on: false }, { id: "red-book", title: "Red Book", on: false }], ID);
  assert.deepEqual(off, { own: false, others: [{ id: "red-book", title: "Red Book", on: false }], othersOn: [], shown: false });
  const other = HM.dataFolderModel([{ id: ID, title: "Satchel", on: false }, { id: "red-book", title: "Red <Book>", on: true }, { id: "wayfarers-toolkit", title: "Toolkit", on: true }], ID);
  assert.equal(other.shown, true); assert.deepEqual(other.othersOn, ["Red <Book>", "Toolkit"]);
  const html = View.maintenanceHtml({ store: 1 }, [["store", "S"]], "REMOVE", { dataFolder: other });
  assert.match(html, /data-change="showModuleData"(?! checked)/);
  assert.match(html, /Red &lt;Book&gt;: on/); assert.doesNotMatch(html, /Red <Book>/);
  assert.match(html, /because Red &lt;Book&gt;, Toolkit have their switch on/);
  assert.match(html, /data-action="resetWindows"/);
  assert.equal((html.match(/type="checkbox" data-change="showModuleData"/g) ?? []).length, 1, "only the Satchel's own switch is a control");
  const own = View.dataFolderHtml(HM.dataFolderModel([{ id: ID, title: "Satchel", on: true }], ID));
  assert.match(own, /data-change="showModuleData" checked/); assert.match(own, /No other active module/); assert.match(own, /shown in this browser\./);
  assert.match(View.maintenanceHtml({}, [], "REMOVE"), /data-action="resetWindows"/);
});

test("skip lists: core's client records are never exported or imported, for every entry and the Satchel", async () => {
  const M = await import("../scripts/settings-model.mjs");
  assert.deepEqual(M.CORE_RECORDS, ["showModuleData", "windowPlacement"]);
  assert.deepEqual(M.skipList({ skipSettings: ["a", "windowPlacement"] }), ["a", "windowPlacement", "showModuleData"]);
  assert.deepEqual(M.skipList(null), ["showModuleData", "windowPlacement"]);
  assert.deepEqual(M.OWN_SKIP, ["showModuleData", "windowPlacement", "showSceneButton", "keybindMigrated"]);
  const exp = M.buildModuleExport("x", [{ key: "a", scope: "world", value: 1 }, { key: "windowPlacement", scope: "client", value: {} }, { key: "showModuleData", scope: "client", value: true }], { skip: M.skipList({}) });
  assert.deepEqual(exp.world, { a: 1 }); assert.deepEqual(exp.client, {});
});

test("readFix and FIX_ID are core's; the Satchel's own fix ids still read", async () => {
  const H = await import("../scripts/health-model.mjs");
  const core = await import("../vendor/wanderers-core/index.mjs");
  const R = await import("../scripts/registry-model.mjs");
  const { FIX } = await import("../scripts/self-model.mjs");
  assert.equal(H.readFix, core.readFix);
  assert.equal(R.FIX_ID, core.FIX_ACTION_RE);
  for (const id of Object.values(FIX)) assert.deepEqual(H.readFix({ label: "Go", action: id }), { label: "Go", action: id });
});

test("source checks: remembered windows, the open key binding keeps its id (0.7.0: default Shift+G), the folder is hidden", async () => {
  const { readFileSync } = await import("node:fs");
  const src = (/** @type {string} */ f) => readFileSync(new URL(`../scripts/${f}`, import.meta.url), "utf8");
  assert.match(src("hub.mjs"), /class HubApp extends RememberedWindow\(foundry\.applications\.api\.ApplicationV2, \{ moduleId: ID, key: "hub" \}\)/);
  assert.match(src("health.mjs"), /class HealthApp extends RememberedWindow\(foundry\.applications\.api\.ApplicationV2, \{ moduleId: ID, key: "health" \}\)/);
  const main = src("main.mjs");
  assert.match(main, /registerOpenKeybinding\(\{ moduleId: ID, action: "open",/);
  assert.match(main, /editable: \[\{ key: OPEN_KEY\.key, modifiers: \[\.\.\.OPEN_KEY\.modifiers\] \}\]/);
  assert.doesNotMatch(main, /game\.keybindings\.register/);
  assert.match(main, /hideDataFolder\(ID, \{ shown: \(\) => S\.get\("showModuleData"\) === true \}\)/);
  assert.match(src("lifecycle.mjs"), /if \(Store\.isWriter\(\)\) await Store\.file\(\);/);
  const { defineOpenKeybinding } = await import("../vendor/wanderers-core/index.mjs");
  assert.deepEqual(defineOpenKeybinding({ action: "open", name: "Open", onDown: () => {}, gmOnly: true }).editable, []);
});
