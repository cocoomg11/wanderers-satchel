import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../scripts/adapters-model.mjs";
import { ADAPTERS } from "../scripts/adapters.mjs";

const fakeGame = mods => ({ modules: { get: id => mods[id] ?? undefined } });
const byId = id => ADAPTERS.find(a => a.id === id);

test("adapters: the four known modules, Red Book marked provisional", () => {
  assert.deepEqual(ADAPTERS.map(a => a.id), ["wayfarers-toolkit", "ringmaker", "loot-ledger", "red-book"]);
  assert.equal(byId("red-book").provisional, true);
  assert.deepEqual(byId("wayfarers-toolkit").debugSetting, { namespace: "wayfarers-toolkit", key: "debugLog" });
  assert.equal(byId("ringmaker").debugSetting, undefined);
  assert.equal(byId("loot-ledger").health, undefined);
  assert.ok(byId("wayfarers-toolkit").skipSettings.includes("lootHistoryData"));
});

test("toolkit adapter: panel, health sections, settings import through its own API", async () => {
  const calls = [];
  const api = {
    panel: tab => calls.push(["panel", tab]),
    health: async () => [{ title: "Features", lines: [{ level: "ok", text: "x" }] }],
    settingsIO: { read: d => ({ ok: true, rows: [{ key: "k", to: d.world.k }] }), apply: rows => ({ written: rows.length, reload: false }) }
  };
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: true, api } });
  const t = byId("wayfarers-toolkit");
  t.openPanel("overview"); assert.deepEqual(calls, [["panel", "overview"]]);
  const h = await t.health();
  assert.equal(h[0].title, "Features"); assert.match(h.at(-1).lines[0].text, /whispered/);
  assert.equal((await t.importSettings.read({ world: { k: 1 } })).rows[0].to, 1);
  assert.equal((await t.importSettings.apply([1, 2])).written, 2);
  // a future healthReport() is preferred (no chat card)
  api.healthReport = () => [{ title: "Quiet", lines: [] }];
  assert.equal((await t.health())[0].title, "Quiet");
  // settings IO off: read gives null (the Satchel then checks values itself)
  delete api.settingsIO;
  assert.equal(t.importSettings.read({}), null);
  // module inactive: health throws (reported as a failed check)
  globalThis.game = fakeGame({ "wayfarers-toolkit": { active: false, api } });
  await assert.rejects(() => t.health());
});

test("ringmaker adapter: health from status() and removePlan()", async () => {
  globalThis.game = fakeGame({ ringmaker: { active: true, api: { status: () => ({ image: "r.png", registered: true, active: true, front: true, shader: true, mode: "npc", size: 100, targetEffect: "off" }), removePlan: () => ({ actors: 2, tokens: 5 }) } } });
  const h = await byId("ringmaker").health();
  assert.equal(h[0].title, "Ring");
  assert.ok(h[0].lines.some(l => /actors 2, tokens 5/.test(l.text)));
  assert.ok(!h[0].lines.some(l => l.level === "bad" || l.level === "warn"));
});

test("red book adapter (provisional): uses only what its api has", async () => {
  globalThis.game = fakeGame({ "red-book": { active: true, api: {} } });
  const r = byId("red-book");
  assert.equal(r.openPanel(), false);          // falls back to the settings menu
  assert.equal(await r.health(), null);        // no check yet
  assert.equal(r.importSettings.read({}), null);
  assert.equal(r.extraActions[0].available(), false);
  globalThis.game = fakeGame({ "red-book": { active: true, api: { panel: tab => `panel:${tab}`, health: () => [{ title: "S", lines: [] }], cleanup: { open: () => 1 } } } });
  assert.equal(r.openPanel("x"), "panel:x");
  assert.equal((await r.health())[0].title, "S");
  assert.equal(r.extraActions[0].available(), true);
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
});
