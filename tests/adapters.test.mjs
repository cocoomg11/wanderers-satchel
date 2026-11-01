import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../scripts/adapters-model.mjs";
import { ADAPTERS } from "../scripts/adapters.mjs";

const fakeGame = (mods, { isGM = true, settings = {}, packs = [], journal = [], system = "dnd5e" } = {}) => ({
  user: { isGM },
  system: { id: system },
  modules: { get: id => mods[id] ?? undefined },
  settings: { get: (ns, k) => { const v = settings[`${ns}.${k}`]; if (v === undefined) throw new Error("not registered"); return v; } },
  packs: Object.assign([...packs], { get: k => packs.find(p => p.collection === k) }),
  journal: { find: fn => journal.find(fn) }
});
const byId = id => ADAPTERS.find(a => a.id === id);

test("adapters: the four known modules, none provisional, debug settings named", () => {
  assert.deepEqual(ADAPTERS.map(a => a.id), ["wayfarers-toolkit", "ringmaker", "loot-ledger", "red-book"]);
  assert.ok(ADAPTERS.every(a => !a.provisional));
  assert.deepEqual(byId("wayfarers-toolkit").debugSetting, { namespace: "wayfarers-toolkit", key: "debugLog" });
  assert.deepEqual(byId("ringmaker").debugSetting, { namespace: "ringmaker", key: "debugLog" });
  assert.equal(typeof byId("loot-ledger").health, "function");
  assert.ok(byId("wayfarers-toolkit").skipSettings.includes("lootHistoryData"));
  assert.deepEqual(byId("red-book").skipSettings, ["openSession", "boardPins", "onlineHudPos", "onlineHudCollapsed", "migrations", "nextSession", "showModuleData", "windowPlacement"]);
  for (const a of ADAPTERS) assert.ok(a.skipSettings.includes("showModuleData") && a.skipSettings.includes("windowPlacement"), `${a.id}: core 0.5.0 client records skipped`);
});

test("toolkit adapter: healthReport preferred, old health() fallback, no removed features", async () => {
  const calls = [];
  const api = { panel: tab => calls.push(["panel", tab]), health: async () => [{ title: "Features", lines: [{ level: "ok", text: "x" }] }] };
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api } });
  const t = byId("wayfarers-toolkit");
  t.openPanel("overview"); assert.deepEqual(calls, [["panel", "overview"]]);
  const h = await t.health();
  assert.equal(h[0].title, "Features"); assert.match(h.at(-1).lines[0].text, /whispered/);
  api.healthReport = () => [{ title: "Quiet", lines: [] }];
  assert.equal((await t.health())[0].title, "Quiet");
  // the Satchel's budget goes through to healthReport so the toolkit's per-section limit agrees with it
  let seen = "none"; api.healthReport = o => { seen = o; return []; };
  await t.health({ timeoutMs: 88000 }); assert.deepEqual(seen, { timeoutMs: 88000 });
  await t.health(); assert.deepEqual(seen, {});
  // 1.27: no settingsIO → read gives null and the Satchel checks the values itself
  assert.equal(t.importSettings.read({}), null);
  await assert.rejects(async () => t.importSettings.apply([1]), /isn't available/);
  // an older toolkit with its own import still uses it
  api.settingsIO = { read: d => ({ ok: true, rows: [{ key: "k", to: d.world.k }] }), apply: rows => ({ written: rows.length, reload: false }) };
  assert.equal((await t.importSettings.read({ world: { k: 1 } })).rows[0].to, 1);
  assert.equal((await t.importSettings.apply([1, 2])).written, 2);
  // nothing refers to the toolkit's moved or removed tools
  const src = JSON.stringify(t, (k, v) => typeof v === "function" ? v.toString() : v);
  assert.doesNotMatch(src, /sessionStart|api\??\.online|whosOnline/);
  assert.equal(t.extraActions[0].available(), false);
  api.cleanup = { open: () => 1 }; assert.equal(t.extraActions[0].available(), true);
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: false, api } });
  await assert.rejects(() => t.health());
});

test("adapters never call another module's API on a player's client", async () => {
  let called = 0; const spy = () => { called++; return []; };
  const api = { panel: spy, health: spy, healthReport: spy, status: spy, removePlan: spy, cleanup: { open: spy } };
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api }, ringmaker: { active: true, api }, "red-book": { active: true, api }, "loot-ledger": { active: true, api } }, { isGM: false });
  for (const a of ADAPTERS) {
    if (a.openPanel) a.openPanel("x");
    if (a.health) await assert.rejects(async () => a.health());
    for (const x of a.extraActions ?? []) { assert.equal(x.available(), false); x.run(); }
  }
  assert.equal(called, 0);
});

test("ringmaker adapter: health from status() and removePlan()", async () => {
  globalThis.game = fakeGame({ ringmaker: { active: true, api: { status: () => ({ image: "r.png", registered: true, active: true, front: true, shader: true, mode: "npc", size: 100, targetEffect: "off" }), removePlan: () => ({ actors: 2, tokens: 5 }) } } });
  const h = await byId("ringmaker").health();
  assert.equal(h[0].title, "Ring");
  assert.ok(h[0].lines.some(l => /actors 2, tokens 5/.test(l.text)));
  assert.ok(!h[0].lines.some(l => l.level === "bad" || l.level === "warn"));
});

test("loot ledger adapter: real check from compendiums and the build report", async () => {
  const mod = { active: true, api: {}, relationships: { requires: new Set([{ id: "src-items", type: "module" }]) } };
  const pk = (collection, pkg, size, type = "Item", label = collection) => ({ collection, documentName: type, metadata: { packageName: pkg, label }, index: { size } });
  globalThis.game = fakeGame({ "loot-ledger": mod }, {
    packs: [pk("src-items.items", "src-items", 900, "Item", "Items"), pk("world.loot-ledger-items", "world", 40), pk("world.loot-ledger-tables", "world", 12, "RollTable")],
    journal: [{ flags: { "loot-ledger": { buildReport: true } } }],
    settings: { "loot-ledger.convertOnBuild": false, "loot-ledger.reviewBoard": true }
  });
  const h = await byId("loot-ledger").health();
  assert.deepEqual(h.map(s => s.title), ["Sources", "Loot pools", "Options"]);
  assert.ok(!h.flatMap(s => s.lines).some(l => l.level === "bad" || l.level === "warn"));
  assert.match(h[0].lines[0].text, /900 items/);
  assert.match(h[2].lines[0].text, /Convert on build off, Review board on/);
  // nothing built, no source, another system
  globalThis.game = fakeGame({ "loot-ledger": mod }, { system: "pf2e" });
  const h2 = await byId("loot-ledger").health();
  const lv = h2.flatMap(s => s.lines).map(l => l.level);
  assert.equal(lv.filter(l => l === "bad").length, 2); assert.ok(lv.includes("warn"));
});

test("lootLedgerSections: junk and missing parts", () => {
  assert.equal(A.lootLedgerSections(null)[0].lines[0].level, "warn");
  const s = A.lootLedgerSections({ system: "dnd5e", sources: [{ label: "S", size: 0 }], packs: { items: { size: 1 }, tables: null }, report: false, api: false });
  const all = s.flatMap(x => x.lines);
  assert.ok(all.some(l => /index loads/.test(l.text)));
  assert.ok(all.some(l => l.level === "warn" && /tables compendium is missing/.test(l.text)));
  assert.ok(all.some(l => l.level === "warn" && /API isn't set/.test(l.text)));
  assert.equal(s.length, 2);
});

test("red book adapter: panel, health lines wrapped in a section, cleanup", async () => {
  globalThis.game = fakeGame({ "red-book": { active: true, api: {} } });
  const r = byId("red-book");
  assert.equal(r.openPanel(), false);          // falls back to the settings menu
  assert.equal(await r.health(), null);        // no check
  assert.equal(r.extraActions[0].available(), false);
  globalThis.game = fakeGame({ "red-book": { active: true, api: { panel: tab => `panel:${tab}`, health: () => [{ level: "ok", text: "fine" }], cleanup: { open: () => 1 } } } });
  assert.equal(r.openPanel("x"), "panel:x");
  const h = await r.health();
  assert.equal(h[0].title, "Checks"); assert.equal(h[0].lines[0].text, "fine");
  assert.equal(r.extraActions[0].available(), true);
  // a report of sections (core's shape) is passed on
  globalThis.game = fakeGame({ "red-book": { active: true, api: { health: () => [{ title: "S", lines: [] }] } } });
  assert.equal((await r.health())[0].title, "S");
  globalThis.game = fakeGame({ "red-book": { active: true } });
  await assert.rejects(async () => r.health(), /isn't available yet/);
});

test("toolkit flight network validator", () => {
  const v = A.VALIDATORS["wayfarers-toolkit"].flightNetwork;
  assert.equal(v({ points: [], routes: [] }), true);
  assert.match(String(v([])), /flight network/);
  assert.match(String(v({ points: {} , routes: [] })), /lists/);
  assert.match(String(v({ points: [1], routes: [] })), /aren't objects/);
});

test("ringmakerLines: no image, load error, inactive style, shader fallback", () => {
  assert.equal(A.ringmakerLines({ image: "" })[0].level, "off");
  assert.equal(A.ringmakerLines(null)[0].level, "warn");
  const l = A.ringmakerLines({ image: "a.png", error: "404", registered: false, active: false, front: true, shader: false, mode: "all" });
  assert.equal(l.filter(x => x.level === "bad").length, 2);
  assert.equal(l.filter(x => x.level === "warn").length, 2);
  assert.match(l.at(-1).text, /every token/);
});

test("dependencyLines: missing, inactive, active, other system", () => {
  const mods = { a: { active: true, version: "2.0" }, b: { active: false } };
  const lines = A.dependencyLines({ relationships: { requires: new Set([{ id: "a", type: "module" }, { id: "b" }, { id: "c" }]), systems: [{ id: "dnd5e" }] } }, id => mods[id] ?? null, "pf2e");
  assert.deepEqual(lines.map(l => l.level), ["ok", "bad", "bad", "warn"]);
  assert.match(lines[0].text, /2\.0/);
  assert.deepEqual(A.dependencyLines({}, () => null, "x"), []);
  assert.deepEqual(A.dependencyLines({ relationships: { systems: [{ id: "x" }] } }, () => null, "x"), []);
  assert.deepEqual(A.requiredIds({ relationships: { requires: [{ id: "a" }, { id: "s", type: "system" }] } }), ["a"]);
});

test("skip lists: toolkit adds api.settingsRecords() on a GM client, keeps the static list otherwise", () => {
  const api = { settingsRecords: () => ["lootHistoryData", "newRecord", 5, ""] };
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api } });
  const gm = byId("wayfarers-toolkit").skipSettings;
  assert.ok(gm.includes("newRecord") && gm.includes("onlineHudPos") && gm.includes("flightCache"));
  assert.equal(gm.filter(k => k === "lootHistoryData").length, 1);
  assert.ok(!gm.includes(5) && !gm.includes(""));
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api } }, { isGM: false });
  assert.ok(!byId("wayfarers-toolkit").skipSettings.includes("newRecord"));
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api: {} } });
  assert.deepEqual(byId("wayfarers-toolkit").skipSettings, A.SKIP["wayfarers-toolkit"]);
  assert.deepEqual(A.skipFor("wayfarers-toolkit", { settingsRecords: () => { throw new Error("x"); } }), A.SKIP["wayfarers-toolkit"]);
  assert.deepEqual(A.skipFor("ringmaker", { settingsRecords: () => ["x"] }), ["showModuleData", "windowPlacement"]);
});

test("toolkit adapter: title follows the installed module, with a Wanderer's fallback", () => {
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, title: "Wayfarer's Toolkit" } });
  assert.equal(byId("wayfarers-toolkit").title, "Wayfarer's Toolkit");
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, title: "Wanderer's Toolkit" } });
  assert.equal(byId("wayfarers-toolkit").title, "Wanderer's Toolkit");
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true } });
  assert.equal(byId("wayfarers-toolkit").title, "Wanderer's Toolkit");
  globalThis.game = undefined;
  assert.equal(byId("wayfarers-toolkit").title, "Wanderer's Toolkit");
});
