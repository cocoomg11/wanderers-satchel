import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../scripts/notes-model.mjs";
import * as HM from "../scripts/hub-model.mjs";
import * as View from "../scripts/hub-view.mjs";

// ---------------------------------------------------------------- 1. What's new: GM summary, developer notes folded

const NOTES = `Two fixes and one new window.

### Added
- **Quest board.** A new window lists the open quests. It also shows rewards and who took them.
  - Details for scripts: \`api.board.open()\`.
- Under the hood: CI now runs the shared checks.

### Fixed
- Prices no longer show twice.

### Tests
- \`tests/board.test.mjs\` covers the board.

**Tests**: \`tests/price.test.mjs\`.

### Untested in Foundry
- Open the board as a GM.

## Not a version heading but level 2
- Kept.`;

test("splitNotes: developer headings, bold labels and 'Under the hood:' bullets go to developer notes", () => {
  const { summary, developer } = N.splitNotes(NOTES);
  assert.match(summary, /Two fixes and one new window\./);
  assert.match(summary, /### Added/); assert.match(summary, /Quest board/); assert.match(summary, /### Fixed/); assert.match(summary, /Prices no longer/);
  assert.match(summary, /Not a version heading/); assert.match(summary, /- Kept\./);
  assert.doesNotMatch(summary, /Under the hood|tests\/|Untested|Open the board as a GM/);
  assert.match(developer, /Under the hood: CI/); assert.match(developer, /### Tests/); assert.match(developer, /\*\*Tests\*\*: `tests\/price/); assert.match(developer, /### Untested in Foundry\n- Open the board/);
});

test("splitNotes: the rule is data (DEV_NOTES), case and marks ignored, ends at the same heading level", () => {
  assert.ok(Object.isFrozen(N.DEV_NOTES) && N.DEV_NOTES.headings.length > 5);
  for (const h of ["Under the hood", "Developers", "For developers", "Developer notes", "Tests", "CI", "Untested in Foundry", "Live test checklist (Untested in Foundry)", "Not yet tested live", "Decisions", "For other modules"]) {
    assert.equal(N.splitNotes(`### ${h}\n- x`).developer, `### ${h}\n- x`, h);
    assert.equal(N.splitNotes(`**${h}**\n- x`).summary, "", `label ${h}`);
  }
  for (const h of ["Added", "Changed", "Fixed", "Security", "Renamed", "Testimonials"]) assert.equal(N.splitNotes(`### ${h}\n- x`).developer, "", h);
  // Nested heading under a developer heading stays there; the next same-level heading ends it.
  const r = N.splitNotes("### Tests\n#### Unit\n- a\n### Changed\n- b");
  assert.equal(r.developer, "### Tests\n#### Unit\n- a"); assert.equal(r.summary, "### Changed\n- b");
  // A label runs to the next label: **Untested in Foundry** then **Fixed**.
  const l = N.splitNotes("**Untested in Foundry** (live)\n- check it\n\n**Fixed**\n- a bug");
  assert.equal(l.summary, "**Fixed**\n- a bug"); assert.match(l.developer, /check it/);
  // Own rules can be passed in.
  assert.equal(N.splitNotes("### Fixed\n- a", { headings: [/^fixed$/i], bullets: [] }).summary, "");
});

test("splitNotes: notes with no developer headings come back unchanged; only developer notes → empty summary", () => {
  const plain = "Small fix.\n\n- The button works again.\n- Typo fixed.";
  assert.deepEqual(N.splitNotes(plain), { summary: plain, developer: "" });
  assert.deepEqual(N.splitNotes(""), { summary: "", developer: "" });
  assert.equal(N.splitNotes("### Changed\n- Under the hood: CI bump.").summary, "");
  // A wrapped "Under the hood" bullet keeps its continuation lines with it.
  const w = N.splitNotes("- Under the hood: a long\n  wrapped line.\n- Visible change.");
  assert.equal(w.summary, "- Visible change."); assert.match(w.developer, /wrapped line/);
});

test("firstSentence / shortSummary: top-level bullets to their first sentence, nested detail left out, wrapped lines joined", () => {
  assert.equal(N.firstSentence("**Board.** A new window. More."), "**Board.**");
  assert.equal(N.firstSentence("Fixed (see e.g. the docs. Really) the thing. Next."), "Fixed (see e.g. the docs. Really) the thing.");
  assert.equal(N.firstSentence("Code `a. B` stays. Next."), "Code `a. B` stays.");
  assert.equal(N.firstSentence("No full stop here"), "No full stop here");
  const long = N.firstSentence(`**Bold ${"word ".repeat(80)}`);
  assert.ok(long.length <= N.SHORT_BULLET_CHARS + 3 && long.endsWith("…")); assert.equal((long.match(/\*\*/g) ?? []).length % 2, 0);
  const s = N.shortSummary("Intro line.\n\n### Added\n- **Board.** Lists quests. Shows rewards.\n  - nested detail\n- One-liner.\n- Wrapped\n  over two lines. Second sentence.");
  assert.equal(s.text, "Intro line.\n\n### Added\n- **Board.**\n- One-liner.\n- Wrapped over two lines.");
  assert.equal(s.shortened, true);
  assert.deepEqual(N.shortSummary("- a.\n- b."), { text: "- a.\n- b.", shortened: false });
});

test("notesHtml: short summary first, Full notes and Developer notes folded (closed), escaped", () => {
  const h = N.notesHtml(NOTES);
  assert.match(h, /<strong>Quest board\.<\/strong><\/li>/);
  assert.doesNotMatch(h.split("<details")[0], /It also shows rewards|Under the hood|tests\//);
  assert.match(h, /<details class="ws-notes-more"><summary>Full notes<\/summary>.*It also shows rewards/s);
  assert.match(h, /<details class="ws-notes-more ws-dev-notes"><summary>Developer notes<\/summary>.*Under the hood/s);
  assert.doesNotMatch(h, /<details[^>]* open/);
  // Nothing to fold: exactly markdownHtml.
  assert.equal(N.notesHtml("- One.\n- Two."), N.markdownHtml("- One.\n- Two."));
  // Only developer notes.
  assert.match(N.notesHtml("### Tests\n- x"), /only developer notes in this version.*<summary>Developer notes/s);
  // Escaping holds in every part.
  const x = N.notesHtml("- <img src=x> one. Two.\n\n### Tests\n- <script>alert(1)</script>");
  assert.doesNotMatch(x, /<img|<script/); assert.match(x, /&lt;script&gt;/);
  assert.equal(N.notesHtml(""), "");
});

test("whatsNewHtml uses the summary with folded developer notes", () => {
  const items = [{ id: "a", title: "A", docs: {} }];
  const list = HM.whatsNewModel(new Map([["a", { from: "1.0.0", to: "1.1.0", state: "ok", notes: [{ version: "1.1.0", title: "1.1.0", body: NOTES }] }]]), items);
  const html = View.whatsNewHtml(list);
  assert.match(html, /<summary>Developer notes<\/summary>/);
  assert.doesNotMatch(html.split("<details")[0], /Under the hood/);
});

// ---------------------------------------------------------------- 2. Health page: default filter, Show all (N OK), All N checks OK
import * as Fm from "../scripts/filter-model.mjs";
import { groupHealth } from "../scripts/health-model.mjs";

const lines = (/** @type {string[]} */ lv) => [{ title: "S", lines: lv.map((level, i) => ({ level, text: `${level} ${i}` })) }];

test("default filter: warnings, problems, still checking; OK hidden behind 'Show all (N OK)'", () => {
  assert.deepEqual([...Fm.defaultFilter()], ["warn", "bad", "pending"]);
  assert.ok(Object.isFrozen(Fm.DEFAULT_FILTER));
  const g = groupHealth([
    { id: "a", title: "A", state: "ran", report: lines(["ok", "ok", "ok", "warn"]) },
    { id: "b", title: "B", state: "ran", report: lines(["ok", "ok"]) },
    { id: "c", title: "C", state: "ran", report: lines(["bad", "ok"]) }
  ]);
  const f = Fm.defaultFilter();
  assert.deepEqual(Fm.okFold(g, f), { hiddenOk: 6, allOk: false, total: 6 });
  const html = View.healthHtml(g, { filter: f });
  assert.match(html, /data-filter="all" title="Show every line, OK ones too">Show all \(6 OK\)</);
  assert.match(html, /warn 3/); assert.match(html, /bad 0/); assert.doesNotMatch(html, />ok 0</);
  assert.doesNotMatch(html, /All 6 checks OK/);
  // All, or OK pressed: no fold, no chip.
  assert.deepEqual(Fm.okFold(g, new Set()), { hiddenOk: 0, allOk: false, total: 0 });
  assert.equal(Fm.okFold(g, new Set(["ok", "warn"])).hiddenOk, 0);
  assert.doesNotMatch(View.healthHtml(g, { filter: new Set() }), /Show all \(/);
});

test("nothing to look at: one 'All N checks OK' line plus the Show all chip; a running or failed check is not 'all OK'", () => {
  const g = groupHealth([{ id: "a", title: "A", state: "ran", report: lines(["ok", "ok"]) }, { id: "b", title: "B", state: "ran", report: lines(["ok", "info"]) }]);
  const f = Fm.defaultFilter();
  assert.deepEqual(Fm.okFold(g, f), { hiddenOk: 3, allOk: true, total: 3 });
  const html = View.healthHtml(g, { filter: f });
  assert.match(html, /class="wc-lines ws-all-ok"/); assert.match(html, /All 3 checks OK/); assert.match(html, /Show all \(3 OK\)/);
  assert.doesNotMatch(html, /hidden by the filter/);
  assert.equal(Fm.allOkText(1), "All 1 check OK");
  for (const state of ["pending", "slow", "timeout", "failed"]) {
    const r = groupHealth([{ id: "a", title: "A", state: "ran", report: lines(["ok"]) }, { id: "b", title: "B", state, error: "x" }]);
    assert.equal(Fm.okFold(r, f).allOk, false, state);
  }
});

test("module page: the same fold and all-OK line", () => {
  const group = groupHealth([{ id: "m", title: "M", state: "ran", report: lines(["ok", "ok"]) }]).groups[0];
  const model = { id: "m", title: "M", version: "1", badges: [], update: { banner: false, level: "ok" }, installed: true, health: { available: true, group, hint: "" }, transfer: null, debug: null, links: [], extras: [], notes: [], canPanel: true };
  const html = View.moduleHtml(/** @type {any} */ (model), { filter: Fm.defaultFilter() });
  assert.match(html, /All 2 checks OK/); assert.match(html, /Show all \(2 OK\)/); assert.doesNotMatch(html, /No lines match/);
});

// ---------------------------------------------------------------- 3. Launcher: an Open button per module that has one
import * as R from "../scripts/registry-model.mjs";
import { readFileSync } from "node:fs";

test("registration: open() and openLabel are read; bad types warn", () => {
  const fn = () => {};
  const r = R.normalizeRegistration({ id: "m", open: fn, openLabel: "  Quest board  " });
  assert.equal(r.entry.open, fn); assert.equal(r.entry.openLabel, "Quest board"); assert.deepEqual(r.warnings, []);
  const bad = R.normalizeRegistration({ id: "m", open: "x", openLabel: 3 });
  assert.equal(bad.entry.open, undefined); assert.equal(bad.entry.openLabel, undefined);
  assert.deepEqual(bad.warnings, ["open should be a function", "openLabel should be text"]);
  assert.equal(R.normalizeRegistration({ id: "m", openLabel: "x".repeat(99) }).entry.openLabel.length, R.OPEN_LABEL_MAX);
});

test("launcherOf: entry open() first, else the module's api.open(), only when active; none otherwise", () => {
  const open = () => {};
  assert.deepEqual(R.launcherOf({ open, openLabel: "Board" }, { active: true }), { label: "Board", how: "entry" });
  assert.deepEqual(R.launcherOf({ open }, { active: true }), { label: "Open", how: "entry" });
  assert.deepEqual(R.launcherOf({}, { active: true, apiOpen: true }), { label: "Open", how: "api" });
  assert.equal(R.launcherOf({}, { active: true, apiOpen: false }), null, "no open: no button (e.g. a module with no window)");
  assert.equal(R.launcherOf({ open }, { active: false, apiOpen: true }), null);
  assert.equal(R.launcherOf({ open }, null), null);
  const card = R.cardModel({ id: "m", source: "registered", open, openLabel: "Board" }, { id: "m", title: "M", version: "1", active: true });
  assert.deepEqual(card.launcher, { label: "Board", how: "entry" });
});

test("launcher buttons on the Overview rows and the module page header, escaped, wired to the launch action", () => {
  const items = [
    { ...R.cardModel({ id: "a", source: "registered", open: () => {}, openLabel: "Board<x>" }, { id: "a", title: "A<b>", version: "1", active: true }) },
    { ...R.cardModel({ id: "b", source: "adapter" }, { id: "b", title: "B", version: "1", active: true }) }
  ];
  const ov = View.overviewHtml(HM.overviewModel({ items, updates: new Map(), health: new Map(), features: {}, debug: null, now: 0 }), { updateCheck: false, combinedHealth: false, id: "wanderers-satchel" });
  assert.equal((ov.match(/data-action="launch"/g) ?? []).length, 1);
  assert.match(ov, /data-action="launch" data-id="a" aria-label="A&lt;b&gt;: Board&lt;x&gt;"/);
  assert.doesNotMatch(ov, /<b>|<x>/);
  const m = HM.moduleModel({ item: items[0], entry: { id: "a" }, update: null, health: null, features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 });
  const page = View.moduleHtml(m);
  assert.match(page, /wc-btn wc-btn-primary ws-launch" data-action="launch" data-id="a"/);
  assert.match(page, /data-action="panel" data-id="a"[^>]*><i class="fa-solid fa-sliders" aria-hidden="true"><\/i><span>Settings</);
  const none = View.moduleHtml(HM.moduleModel({ item: items[1], entry: { id: "b" }, update: null, health: null, features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 }));
  assert.doesNotMatch(none, /data-action="launch"/); assert.match(none, /Open control panel/);
});

test("launcher wiring (source checks): GM-gated action, adapters for the toolkit, Ringmaker and Red Book, none for Loot Ledger", () => {
  const hub = readFileSync(new URL("../scripts/hub.mjs", import.meta.url), "utf8");
  assert.match(hub, /launch: HubApp\.#onLaunch/); assert.match(hub, /static #onLaunch\(_ev, target\) \{ if \(game\.user\?\.isGM\) Reg\.launch/);
  const reg = readFileSync(new URL("../scripts/registry.mjs", import.meta.url), "utf8");
  assert.match(reg, /export async function launch\(id\) \{\n {2}if \(!game\.user\?\.isGM\) return;/);
  assert.match(reg, /apiOpen = !!game\.user\?\.isGM && !!m\.active && typeof m\.api\?\.open === "function"/);
  const ad = readFileSync(new URL("../scripts/adapters.mjs", import.meta.url), "utf8");
  for (const id of ["wayfarers-toolkit", "ringmaker", "red-book"]) assert.match(ad, new RegExp(`open: \\(\\) => \\{ const api = apiOf\\("${id}"\\)`), id);
  const ll = ad.slice(ad.indexOf("const lootLedger"), ad.indexOf("const redBook"));
  assert.doesNotMatch(ll, /\bopen:/);
});

// ---------------------------------------------------------------- 4. Key binding and the scene control button
import { OPEN_KEY } from "../scripts/const.mjs";
import { defineOpenKeybinding } from "../vendor/wanderers-core/index.mjs";
import { SETTING_ROWS } from "../scripts/features-model.mjs";

test("default key Shift+G: valid for core, not one of core's / dnd5e's / the toolkit's / Red Book's Shift keys", () => {
  assert.deepEqual(OPEN_KEY, { key: "KeyG", modifiers: ["Shift"] });
  const def = defineOpenKeybinding({ action: "open", name: "Open", onDown: () => {}, gmOnly: true, editable: [{ key: OPEN_KEY.key, modifiers: [...OPEN_KEY.modifiers] }] });
  assert.deepEqual(def.editable, [{ key: "KeyG", modifiers: ["Shift"] }]); assert.equal(def.gmOnly, true);
  // Core: Shift+W/A/S/D (facing), Shift+C (chat), Shift+T (target). dnd5e: Shift+B, Shift+E. Toolkit: Shift+K. Red Book: Shift+R.
  for (const k of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyT", "KeyB", "KeyE", "KeyK", "KeyR"]) assert.notEqual(OPEN_KEY.key, k);
  return import("../scripts/settings-model.mjs").then(M => assert.ok(M.OWN_SKIP.includes("showSceneButton"), "a per-browser choice is never exported"));
});

test("scene control button: per-browser switch (client, default on), checked in the hook; v14 tool shape", () => {
  const row = SETTING_ROWS.find(r => r.key === "showSceneButton");
  assert.ok(row); assert.equal(row.client, true); assert.equal(row.default, true); assert.equal(typeof row.onChange, "function");
  assert.doesNotThrow(() => row.onChange?.(false), "no ui in Node: harmless");
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.match(main, /if \(F\.on\("sceneButton"\)\) Hooks\.on\("getSceneControlButtons"/);
  assert.match(main, /if \(!game\.user\?\.isGM \|\| S\.get\("showSceneButton"\) === false\) return;/);
  assert.match(main, /tokens\.tools\.wanderersSatchel = \{ name: "wanderersSatchel", title: TITLE, icon: "fa-solid fa-bag-shopping", order: \d+, button: true, visible: true, onChange: \(\) => Hub\.open\(\) \}/);
  // The Maintenance page shows the switch (this browser) and the key in use; the world feature off says so.
  const on = View.maintenanceHtml({}, [], "REMOVE", { browser: { sceneButton: true, key: "Shift+G" } });
  assert.match(on, /data-change="showSceneButton" checked/); assert.match(on, /<kbd>Shift\+G<\/kbd>/);
  assert.match(View.maintenanceHtml({}, [], "REMOVE", { browser: { sceneButton: null, key: "" } }), /off for this world.*<kbd>none<\/kbd>/s);
  const hub = readFileSync(new URL("../scripts/hub.mjs", import.meta.url), "utf8");
  assert.match(hub, /if \(kind === "showSceneButton"\) \{/);
});
