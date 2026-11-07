import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY, familyOf, missingMembers } from "../scripts/family-model.mjs";
import { ADAPTERS } from "../scripts/adapters.mjs";
import { SKIP } from "../scripts/adapters-model.mjs";
import { mergeEntries, cardModel } from "../scripts/registry-model.mjs";
import * as HM from "../scripts/hub-model.mjs";
import * as View from "../scripts/hub-view.mjs";

const IDS = ["wayfarers-toolkit", "red-book", "ringmaker", "loot-ledger", "wanderers-guild", "wanderers-path"];
const fakeGame = (mods, { isGM = true } = {}) => ({ user: { isGM }, modules: { get: id => mods[id] ?? undefined } });
const byId = id => ADAPTERS.find(a => a.id === id);

// ---------------------------------------------------------------- the family list
test("FAMILY: every suite module once, ids as in their module.json, plain one-line descriptions, GitHub links", () => {
  assert.deepEqual(FAMILY.map(m => m.id), IDS);
  assert.ok(!FAMILY.some(m => m.id === "wanderers-satchel"), "the hub is not listed in its own family panel");
  assert.equal(familyOf("wanderers-guild").description, "Professions, crafting and gathering from tool proficiencies.");
  assert.equal(familyOf("wanderers-path").description, "Customizable talent trees and spec boards.");
  assert.equal(familyOf("wanderers-guild").title, "Wanderer's Guild"); assert.equal(familyOf("wanderers-path").title, "Wanderer's Path");
  assert.equal(familyOf("nope"), null);
  for (const m of FAMILY) {
    assert.ok(m.description && !m.description.includes("\n") && m.description.length <= 120, m.id);
    assert.doesNotMatch(m.description, /D&D|Dungeons|Wizards|Warcraft|Blizzard|WoW\b/i, `${m.id}: no game-publisher wording`);
    assert.equal(m.url, `https://github.com/cocoomg11/${m.id}`);
    assert.equal(m.manifest, `https://github.com/cocoomg11/${m.id}/releases/latest/download/module.json`);
    assert.ok(Object.isFrozen(m));
  }
  // every family member has a built-in adapter, so it shows as soon as it is installed
  for (const id of IDS) assert.ok(byId(id), `${id}: adapter`);
});

test("missingMembers: the ones not installed, in family order, copies", () => {
  assert.deepEqual(missingMembers([]).map(m => m.id), IDS);
  assert.deepEqual(missingMembers(["red-book", "wanderers-guild", "other"]).map(m => m.id), ["wayfarers-toolkit", "ringmaker", "loot-ledger", "wanderers-path"]);
  assert.deepEqual(missingMembers(new Set(IDS)), []);
  const one = missingMembers([])[0]; one.title = "x"; assert.equal(FAMILY[0].title, "Wanderer's Toolkit");
});

// ---------------------------------------------------------------- the two new adapters
test("Guild and Path adapters: installed → listed (inactive too); a registration replaces them", () => {
  const list = mergeEntries(ADAPTERS, [], ["wanderers-guild", "wanderers-path"]);
  assert.deepEqual(list.map(e => e.id), ["wanderers-guild", "wanderers-path"]);
  assert.ok(list.every(e => e.source === "adapter"));
  const reg = mergeEntries(ADAPTERS, [{ id: "wanderers-guild", title: "Wanderer's Guild", notes: [] }], ["wanderers-guild"]);
  assert.equal(reg[0].source, "registered"); assert.equal(reg[0].health, undefined, "the registration replaces the adapter entirely");
  assert.deepEqual(mergeEntries(ADAPTERS, [], []), []);
  const card = cardModel(list[0], { id: "wanderers-guild", title: "Wanderer's Guild", active: false });
  assert.equal(card.installed, true); assert.equal(card.active, false); assert.equal(card.launcher, null);
});

test("Guild adapter: setup window as Open and Settings, health passes the budget, GM only", async () => {
  const calls = [];
  const api = { setup: page => { calls.push(["setup", page]); return "win"; }, health: o => { calls.push(["health", o]); return [{ title: "Professions", lines: [] }]; }, open: () => { throw new Error("api.open(actor) is the Professions window, never used"); } };
  globalThis.game = fakeGame({ "wanderers-guild": { active: true, api } });
  const g = byId("wanderers-guild");
  assert.equal(g.title, "Wanderer's Guild"); assert.equal(g.openLabel, "Professions setup");
  assert.equal(typeof g.open, "function"); assert.equal(g.open(), "win");
  assert.equal(g.openPanel(), "win");
  assert.deepEqual(calls.slice(0, 2), [["setup", undefined], ["setup", "settings"]]);
  assert.equal((await g.health({ timeoutMs: 5000 }))[0].title, "Professions");
  assert.deepEqual(calls[2], ["health", { timeoutMs: 5000 }]);
  assert.deepEqual(g.debugSetting, { namespace: "wanderers-guild", key: "debugLog" });
  for (const k of ["professionList", "rankTable", "recipeBook", "craftRules", "gatherRules", "gatherReset", "showModuleData", "windowPlacement"]) assert.ok(g.skipSettings.includes(k), k);
  // Professions feature off: api.setup undefined → no Open button, Settings falls back
  globalThis.game = fakeGame({ "wanderers-guild": { active: true, api: { health: () => [] } } });
  assert.equal(g.open, undefined); assert.equal(g.openPanel(), false);
  // a player's client: nothing called
  let n = 0; globalThis.game = fakeGame({ "wanderers-guild": { active: true, api: { setup: () => n++, health: () => n++ } } }, { isGM: false });
  assert.equal(g.open, undefined); assert.equal(g.openPanel(), false); await assert.rejects(async () => g.health()); assert.equal(n, 0);
});

test("Path adapter (scaffold): no check and no Open until it has them; uses healthReport / health / open when there", async () => {
  const p = byId("wanderers-path");
  globalThis.game = fakeGame({ "wanderers-path": { active: true, api: { version: "0.0.1", isReady: true, features: {} } } });
  assert.equal(p.title, "Wanderer's Path");
  assert.equal(p.open, undefined); assert.equal(await p.health(), null, "no check of its own: dependencies only");
  assert.deepEqual(p.skipSettings, SKIP["wanderers-path"]);
  assert.deepEqual(p.debugSetting, { namespace: "wanderers-path", key: "debugLog" });
  let seen = null;
  globalThis.game = fakeGame({ "wanderers-path": { active: true, api: { open: () => "board", healthReport: o => { seen = o; return [{ title: "Boards", lines: [] }]; } } } });
  assert.equal(p.open(), "board");
  assert.equal((await p.health({ timeoutMs: 7000 }))[0].title, "Boards"); assert.deepEqual(seen, { timeoutMs: 7000 });
  globalThis.game = fakeGame({ "wanderers-path": { active: true, api: { health: () => [{ level: "ok", text: "x" }] } } });
  assert.equal((await p.health())[0].text, "x");
  let n = 0; globalThis.game = fakeGame({ "wanderers-path": { active: true, api: { open: () => n++, healthReport: () => n++ } } }, { isGM: false });
  assert.equal(p.open, undefined); await assert.rejects(async () => p.health()); assert.equal(n, 0);
});

// ---------------------------------------------------------------- the Overview's family panel and the module page line
test("familyHtml: one row per missing member, Get it link in a new tab, manifest URL, escaped; empty when all installed", () => {
  assert.equal(View.familyHtml([]), ""); assert.equal(View.familyHtml(/** @type {any} */ (null)), "");
  const html = View.familyHtml(missingMembers(["wayfarers-toolkit", "red-book", "ringmaker", "loot-ledger"]));
  assert.equal((html.match(/<tr class="ws-inactive">/g) ?? []).length, 2);
  assert.match(html, /Wanderer&#39;s Guild|Wanderer&apos;s Guild|Wanderer's Guild/);
  assert.match(html, /Professions, crafting and gathering from tool proficiencies\./);
  assert.match(html, /Customizable talent trees and spec boards\./);
  assert.match(html, /href="https:\/\/github\.com\/cocoomg11\/wanderers-path" target="_blank" rel="noopener"/);
  assert.match(html, /releases\/latest\/download\/module\.json/);
  assert.match(html, /Not installed/); assert.match(html, /Get it/);
  assert.ok(!/[✓⚠✗]/.test(html));
  const evil = View.familyHtml([{ id: "x", title: "<img src=x>", description: "<b>d</b>", url: "https://e/\"x", manifest: "m" }]);
  assert.ok(!evil.includes("<img") && !evil.includes("<b>") && !evil.includes('/"x'));
  const ov = View.overviewHtml(HM.overviewModel({ items: [], updates: new Map(), health: new Map(), features: {}, debug: null, now: 0 }), { updateCheck: true, combinedHealth: true, id: "wanderers-satchel", family: html });
  assert.ok(ov.includes(html)); assert.ok(ov.indexOf(html) < ov.indexOf('class="ws-tools"'));
});

test("module page: the family member's one-line description under the heading; none for other modules", () => {
  const item = { id: "wanderers-guild", title: "Wanderer's Guild", version: "0.3.1", active: true, installed: true, source: "adapter", provisional: false, docs: {}, can: { docs: false, bugs: false, panel: true } };
  const m = HM.moduleModel({ item, entry: { id: item.id }, update: null, health: null, features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 });
  assert.equal(m.description, "Professions, crafting and gathering from tool proficiencies.");
  assert.match(View.moduleHtml(m), /<p class="wc-hint ws-about">Professions, crafting and gathering from tool proficiencies\.<\/p>/);
  const other = HM.moduleModel({ item: { ...item, id: "someone-else" }, entry: { id: "someone-else" }, update: null, health: null, features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 });
  assert.equal(other.description, ""); assert.doesNotMatch(View.moduleHtml(other), /ws-about/);
});

test("hub wiring (source check): the Overview gets the missing members of the installed modules", () => {
  const hub = readFileSync(new URL("../scripts/hub.mjs", import.meta.url), "utf8");
  assert.match(hub, /family: View\.familyHtml\(missingMembers\(game\.modules\.keys\(\)\)\)/);
});
