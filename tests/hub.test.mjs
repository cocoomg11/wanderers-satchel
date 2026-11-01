import { test } from "node:test";
import assert from "node:assert/strict";
import * as HM from "../scripts/hub-model.mjs";
import * as View from "../scripts/hub-view.mjs";

const ctx = (ids = ["a", "b"], features = {}) => () => ({ ids, features });

// ---------------------------------------------------------------- router
test("parsePage / resolvePage: module ids, tool pages, fallbacks", () => {
  assert.deepEqual(HM.parsePage("module:red-book"), { kind: "module", id: "red-book" });
  assert.deepEqual(HM.parsePage("health"), { kind: "health" });
  assert.deepEqual(HM.parsePage("module:"), { kind: "overview" });
  assert.deepEqual(HM.parsePage(42), { kind: "overview" });
  assert.equal(HM.resolvePage("module:a", { ids: ["a"] }), "module:a");
  assert.equal(HM.resolvePage("module:zz", { ids: ["a"] }), "overview");
  assert.equal(HM.resolvePage("transfer", { features: { sharedSettings: false } }), "overview");
  assert.equal(HM.resolvePage("health", { features: { combinedHealth: false } }), "overview");
  assert.equal(HM.resolvePage("maintenance", { features: { combinedHealth: false, sharedSettings: false } }), "maintenance");
  assert.equal(HM.resolvePage("nonsense"), "overview");
});

test("createRouter: go, previous, refresh after a module goes away", () => {
  let ids = ["a", "b"];
  const r = HM.createRouter(() => ({ ids, features: {} }), "module:b");
  assert.equal(r.page, "module:b");
  assert.equal(r.go("module:b"), false);
  assert.equal(r.go("health"), true);
  assert.equal(r.previous, "module:b");
  assert.equal(r.go("module:a"), true);
  ids = ["b"];
  assert.equal(r.refresh(), true);
  assert.equal(r.page, "overview");
  assert.equal(HM.createRouter(ctx(), "module:nope").page, "overview");
});

test("moveFocus: arrows wrap, Home/End, other keys ignored", () => {
  const order = HM.navOrder({ modules: [{ page: "module:a" }, { page: "module:b" }], tools: [{ page: "health" }, { page: "maintenance" }] });
  assert.deepEqual(order, ["overview", "module:a", "module:b", "health", "maintenance"]);
  assert.equal(HM.moveFocus(order, "overview", "ArrowDown"), "module:a");
  assert.equal(HM.moveFocus(order, "overview", "ArrowUp"), "maintenance");
  assert.equal(HM.moveFocus(order, "maintenance", "ArrowDown"), "overview");
  assert.equal(HM.moveFocus(order, "module:b", "Home"), "overview");
  assert.equal(HM.moveFocus(order, "module:b", "End"), "maintenance");
  assert.equal(HM.moveFocus(order, "module:b", "Enter"), null);
  assert.equal(HM.moveFocus([], "x", "ArrowDown"), null);
});

// ---------------------------------------------------------------- health index, dots, badges
const ran = (lines, ms = 1200) => ({ id: "a", title: "A", state: "ran", report: [{ title: "S", lines }], ms });
const idx = (/** @type {Record<string, any>} */ o) => HM.healthIndex(new Map(Object.entries(o).map(([k, v]) => [k, { result: { ...v, id: k }, at: 1000 }])));

test("healthIndex / dotOf / healthBadge", () => {
  const h = idx({ a: ran([{ level: "ok", text: "x" }, { level: "warn", text: "y" }, { level: "warn", text: "z" }]), b: { state: "slow" }, c: { state: "failed", error: "boom" }, d: ran([{ level: "ok", text: "x" }]) });
  assert.equal(h.get("a").worst, "warn"); assert.equal(h.get("a").counts.warn, 2); assert.equal(h.get("a").ms, 1200);
  assert.equal(h.get("b").running, true);
  assert.equal(HM.dotOf({ active: true }, h.get("a")), "warn");
  assert.equal(HM.dotOf({ active: true }, h.get("b")), "pending");
  assert.equal(HM.dotOf({ active: false }, h.get("a")), "off");
  assert.equal(HM.dotOf({ active: true }, undefined), "none");
  assert.deepEqual(HM.healthBadge({ active: true }, h.get("a")), { level: "warn", text: "2 warnings" });
  assert.deepEqual(HM.healthBadge({ active: true }, h.get("b")), { level: "pending", text: "Still checking…" });
  assert.deepEqual(HM.healthBadge({ active: true }, h.get("c")), { level: "bad", text: "Check failed" });
  assert.deepEqual(HM.healthBadge({ active: true }, h.get("d")), { level: "ok", text: "1 ok" });
  assert.deepEqual(HM.healthBadge({ active: false }, h.get("a")), { level: "off", text: "Not active" });
  assert.deepEqual(HM.healthBadge({ active: true }, undefined), { level: "off", text: "Not checked" });
  assert.deepEqual(HM.healthBadge({ active: true }, idx({ t: { state: "timeout", limitMs: 1 } }).get("t")), { level: "warn", text: "No answer yet" });
});

test("updateView: banner only for an update; ahead and errors are one muted line", () => {
  assert.equal(HM.updateView({ status: "update", latest: "2.0.0", installed: "1.0.0" }).banner, true);
  assert.equal(HM.updateView({ status: "update", latest: "2.0.0", installed: "1.0.0" }).text, "2.0.0 available");
  assert.equal(HM.updateView({ status: "ahead", latest: "1.0.0" }).banner, false);
  assert.deepEqual([HM.updateView({ status: "error", error: "x" }).text, HM.updateView({ status: "error", error: "x" }).level], ["Couldn't check", "off"]);
  assert.equal(HM.updateView(null).level, "pending");
  assert.equal(HM.updateView(null, { enabled: false }).text, "Update check off");
  assert.equal(HM.updateView(null, { installed: false }).text, "Not installed");
  assert.equal(HM.updateView({ status: "current" }).level, "ok");
});

test("timeAgo", () => {
  assert.equal(HM.timeAgo(0, 10_000), "just now");
  assert.equal(HM.timeAgo(0, 4 * 60_000), "4 min ago");
  assert.equal(HM.timeAgo(0, 3 * 3600_000), "3 h ago");
  assert.equal(HM.timeAgo(null, 1), "");
});

// ---------------------------------------------------------------- page models
const items = [
  { id: "a", title: "Alpha", version: "1.0.0", active: true, installed: true, source: "adapter", provisional: false, docs: { changelog: "modules/a/CHANGELOG.md" }, can: { panel: true, docs: true, bugs: true } },
  { id: "b", title: "Beta", version: "0.3.0", active: false, installed: true, source: "registered", provisional: false, docs: {}, can: { panel: false, docs: false, bugs: false } }
];

test("navModel: dots, issue counts, inactive, tools by feature", () => {
  const h = idx({ a: ran([{ level: "warn", text: "y" }, { level: "bad", text: "z" }]) });
  const n = HM.navModel({ items, health: h, features: {}, version: "0.3.0", page: "module:a" });
  assert.deepEqual(n.modules.map(m => [m.page, m.dot, m.issues, m.issueLevel, m.active]), [["module:a", "bad", 2, "bad", true], ["module:b", "off", 0, "warn", false]]);
  assert.deepEqual(n.tools.map(t => t.page), ["health", "transfer", "maintenance"]);
  assert.deepEqual(HM.navModel({ items, health: h, features: { combinedHealth: false, sharedSettings: false }, version: "", page: "overview" }).tools.map(t => t.page), ["maintenance"]);
});

test("overviewModel: stats, rows, tool cards", () => {
  const h = idx({ a: ran([{ level: "warn", text: "y" }]) });
  const ups = new Map([["a", { status: "update", latest: "1.1.0", installed: "1.0.0" }], ["b", { status: "error", error: "x" }]]);
  const ov = HM.overviewModel({ items, updates: ups, health: h, features: {}, debug: { rows: [{ id: "a" }], state: "off" }, now: 1000 + 4 * 60_000 });
  assert.equal(ov.stats.active, 1); assert.equal(ov.stats.total, 2);
  assert.deepEqual([ov.stats.updates.level, ov.stats.updates.text], ["warn", "1 available"]);
  assert.deepEqual([ov.stats.health.level, ov.stats.health.text, ov.stats.health.hint], ["warn", "1 warning", "4 min ago · 0 problems"]);
  assert.equal(ov.rows[0].page, "module:a"); assert.equal(ov.rows[0].update.text, "1.1.0 available"); assert.equal(ov.rows[1].health.text, "Not active");
  assert.deepEqual(ov.tools.debug, { state: "off", count: 1 });
  const none = HM.overviewModel({ items, updates: new Map(), health: new Map(), features: { updateCheck: false, debugAll: false, sharedSettings: false }, debug: null, now: 0 });
  assert.equal(none.stats.updates.text, "Check off"); assert.equal(none.stats.health.text, "Not run yet");
  assert.equal(none.tools.debug, null); assert.equal(none.tools.transfer, false);
  const allOk = HM.overviewModel({ items, updates: new Map([["a", { status: "current" }], ["b", { status: "current" }]]), health: new Map(), features: {}, debug: null, now: 0 });
  assert.equal(allOk.stats.updates.text, "All up to date");
});

test("moduleModel: badges, banner, debug row, links, extras only when active", () => {
  const m = HM.moduleModel({ item: items[0], entry: { id: "a", notes: [] }, update: { status: "update", latest: "1.1.0", installed: "1.0.0" }, health: null, features: {}, debug: { rows: [{ id: "a", on: true }], missing: [] }, extras: [{ i: 0, label: "Remove A data…", icon: "x" }], now: 0 });
  assert.deepEqual(m.badges.map(b => b.text), ["Active", "Built-in adapter"]);
  assert.equal(m.update.banner, true);
  assert.deepEqual(m.debug, { available: true, on: true, text: "on" });
  assert.deepEqual(m.links.map(l => l.act), ["docs", "changelog", "bugs"]);
  assert.equal(m.extras.length, 1); assert.equal(m.transfer.text, "read by the Satchel");
  assert.equal(m.health.available, true); assert.equal(m.health.group, null);
  const b = HM.moduleModel({ item: items[1], entry: { id: "b", exportSettings() { } }, update: null, health: null, features: {}, debug: { rows: [], missing: [] }, extras: [{ i: 0, label: "x", icon: "x" }], now: 0 });
  assert.deepEqual(b.badges.map(x => x.text), ["Not active", "Registered"]);
  assert.equal(b.debug, null); assert.equal(b.transfer, null); assert.equal(b.extras.length, 0); assert.equal(b.canPanel, false);
  const missing = HM.moduleModel({ item: items[0], entry: { id: "a" }, update: null, health: null, features: { combinedHealth: false }, debug: { rows: [], missing: ["a"] }, extras: [], now: 0 });
  assert.equal(missing.debug.text, "this version has no debug logging setting"); assert.equal(missing.health, null);
});

test("importModel: facts, refused rows, skipped modules, ticks, reload hint", () => {
  const result = { modules: [
    { id: "a", title: "Alpha", version: "1.0.0", how: "satchel", ok: true, rows: [{ key: "x", label: "X", from: 1, to: 2, changed: true, reload: true }, { key: "y", label: "Y", from: 1, to: 1, changed: false }], invalid: [{ key: "z", reason: "isn't one of the choices" }], unknown: ["old"], skipped: ["rec"] },
    { id: "b", title: "Beta", version: "0.3.0", how: "satchel", ok: false, error: "not active in this world", rows: [], invalid: [], unknown: [], skipped: [] }
  ] };
  const ticks = HM.initialTicks(result);
  assert.deepEqual([...ticks], ["0:0"]);
  const m = HM.importModel(result, ticks);
  assert.deepEqual(m.facts.map(f => f.text), ["1 setting would change", "1 value refused", "1 module skipped", "1 record never imported"]);
  assert.equal(m.ticked, 1); assert.equal(m.reload, 1); assert.equal(m.button, "Import 1 setting");
  assert.match(m.hint, /1 ticked · 1 needs a reload/);
  const a = m.modules[0];
  assert.deepEqual(a.badges.map(b => b.text), ["1 of 2 ticked", "1 refused"]);
  assert.equal(a.rows.length, 3); assert.equal(a.rows[2].refused, "isn't one of the choices"); assert.equal(a.rows[2].ticked, false);
  assert.deepEqual(a.issues.map(i => i.level), ["info", "off"]);
  assert.deepEqual(m.modules[1].badges.map(b => b.text), ["Skipped"]);
  assert.match(m.modules[1].issues[0].text, /not active/);
  const none = HM.importModel(result, new Set());
  assert.equal(none.ticked, 0); assert.equal(none.button, "Import");
});

// ---------------------------------------------------------------- HTML
test("views: escaped, actions wired, no status characters, roving tabindex", () => {
  const h = idx({ a: ran([{ level: "warn", text: "<b>y</b>" }]) });
  const evil = [{ ...items[0], title: "<img src=x>" }, items[1]];
  const nav = View.navHtml(HM.navModel({ items: evil, health: h, features: {}, version: "0.3.0", page: "module:a" }));
  assert.ok(!nav.includes("<img")); assert.match(nav, /class="wc-nav active" data-action="nav" data-page="module:a" aria-current="page" tabindex="0"/);
  assert.match(nav, /class="wc-nav wc-muted"/); assert.match(nav, /wc-badge wc-warn wc-badge-sm">1</); assert.match(nav, /class="wc-side-foot"/);
  assert.equal((nav.match(/tabindex="0"/g) ?? []).length, 1);
  const ov = View.overviewHtml(HM.overviewModel({ items: evil, updates: new Map(), health: h, features: {}, debug: null, now: 0 }), { updateCheck: true, combinedHealth: true, id: "wanderers-satchel" });
  assert.match(ov, /data-action="checkAll"/); assert.match(ov, /aria-label="Open &lt;img src=x&gt;"/);
  const mod = View.moduleHtml(HM.moduleModel({ item: items[0], entry: { id: "a" }, update: { status: "error", error: "x" }, health: h.get("a"), features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 }));
  assert.ok(!mod.includes("<b>")); assert.match(mod, /ws-muted-line/); assert.ok(!mod.includes("wc-banner"));
  assert.match(mod, /class="wc-pagehead"/); assert.match(mod, /class="wc-panel"/); assert.match(mod, /class="wc-cols"/);
  assert.match(ov, /class="wc-table-box"/); assert.match(ov, /class="wc-stats"/); assert.match(ov, /wc-btn wc-btn-primary/);
  for (const html of [nav, ov, mod]) assert.ok(!/[✓⚠✗]/.test(html));
  const tr = View.transferHtml({ tab: "import", error: { name: "big.json", text: "the file is too large (over 5 MB)." }, file: null, result: null, model: null });
  assert.match(tr, /class="wc-alert wc-bad" role="alert"/); assert.match(tr, /data-action="tab" data-group="transfer" data-tab="import" role="tab" aria-selected="true"/);
  const mt = View.maintenanceHtml({ messages: 2, cache: 0, settings: 1 }, [["messages", "M"], ["cache", "C"], ["settings", "S"]], "REMOVE");
  assert.match(mt, /name="settings" >/); assert.match(mt, /class="wc-btn wc-btn-danger" data-action="removeData"/);
  for (const html of [nav, ov, mod, tr, mt]) assert.doesNotMatch(html, /\bws-(badge|dot|icon|sr|grow|row|end|btn|nav|side|main|shell|panel|ph|pb|banner|notice|lines|stat|k|v|val|table|table-box|pagehead|mhead|meta|lbl)(?![\w-])/, "old Satchel copies of the shared classes are gone");
});

// ---------------------------------------------------------------- health report: filter chips, hidden modules, chat card
import { groupHealth } from "../scripts/health-model.mjs";

const report = () => groupHealth([
  { id: "a", title: "Alpha", state: "ran", report: [{ title: "S", lines: [{ level: "ok", text: "fine" }, { level: "warn", text: "hmm" }, { level: "info", text: "fyi" }] }] },
  { id: "b", title: "Beta", state: "ran", report: [{ title: "S", lines: [{ level: "ok", text: "fine too" }] }] },
  { id: "c", title: "Gamma", state: "ran", report: [{ title: "S", lines: [{ level: "bad", text: "broken" }] }, { title: "T", lines: [{ level: "ok", text: "t ok" }] }] },
  { id: "d", title: "Delta", state: "inactive" },
  { id: "e", title: "Eps", state: "slow" }
]);

test("healthHtml: chips are toggle buttons with aria-pressed; hidden note; static badges without a filter", () => {
  const g = report();
  const page = View.healthHtml(g, { filter: new Set(["bad"]) });
  assert.match(page, /role="group" aria-label="Filter health lines"/);
  assert.match(page, /<button type="button" class="wc-badge wc-bad ws-filter" data-action="healthFilter" data-filter="bad" aria-pressed="true">/);
  assert.match(page, /data-filter="all" aria-pressed="false">All</);
  assert.match(page, /4 modules hidden by the filter/);
  assert.ok(page.includes("broken") && !page.includes("hmm") && !page.includes("fine too"));
  const all = View.healthHtml(g, { filter: new Set() });
  assert.match(all, /data-filter="all" aria-pressed="true"/); assert.ok(!all.includes("hidden by the filter"));
  const none = View.healthHtml(g, { filter: new Set(["off", "ok"]) });
  assert.ok(none.includes("Delta") && none.includes("fine too"));
  const stat = View.healthHtml(g);
  assert.ok(!stat.includes("<button")); assert.match(stat, /class="wc-badge wc-ok"/);
  assert.match(stat, /class="wc-lines"/); assert.match(stat, /class="wc-status wc-warn"/);
  assert.match(stat, /class="ws-group-title">Alpha</); assert.match(stat, /class="ws-counts">1 ok · 1 warn · 0 bad</);
  assert.ok(!/[✓⚠✗]/.test(page + all + stat));
});

test("chat card: wrapped in the shared look's root classes; values escaped", () => {
  const g = groupHealth([{ id: "x", title: "<script>", state: "ran", report: [{ title: "", lines: [{ level: "ok", text: "<b>x</b>" }] }] }]);
  const card = View.healthHtml(g, { card: true });
  assert.match(card, new RegExp(`^<div class="${View.ROOT} ws-card"><div class="ws-health">`));
  assert.match(View.ROOT, /^wc-ui wc-r\d+$/);
  assert.ok(!card.includes("<script>") && !card.includes("<b>"));
});

test("module page health panel: the same filter", () => {
  const h = HM.healthIndex(new Map([["a", { result: { id: "a", title: "A", state: "ran", report: [{ title: "S", lines: [{ level: "ok", text: "fine" }, { level: "warn", text: "hmm" }] }] }, at: 0 }]]));
  const model = HM.moduleModel({ item: items[0], entry: { id: "a" }, update: { status: "current" }, health: h.get("a"), features: {}, debug: { rows: [], missing: [] }, extras: [], now: 0 });
  const on = View.moduleHtml(model, { filter: new Set(["warn"]) });
  assert.match(on, /data-filter="warn" aria-pressed="true"/); assert.ok(on.includes("hmm") && !on.includes(">fine<"));
  const bad = View.moduleHtml(model, { filter: new Set(["bad"]) });
  assert.match(bad, /No lines match the filter/);
  assert.ok(View.moduleHtml(model).includes(">fine<"));
});

// ---------------------------------------------------------------- filter chip keys
const fakeKey = (type, key, repeat = false) => ({ type, key, repeat, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });

test("chipKey: Space and Enter toggle on press, Space release is swallowed, other keys ignored", () => {
  assert.equal(HM.chipKey("keydown", " "), "toggle");
  assert.equal(HM.chipKey("keydown", "Enter"), "toggle");
  assert.equal(HM.chipKey("keyup", " "), "swallow");
  assert.equal(HM.chipKey("keyup", "Enter"), null);
  assert.equal(HM.chipKey("keydown", "a"), null);
  assert.equal(HM.chipKey("keydown", "Tab"), null);
});

test("handleChipKey: Space / Enter toggle once, never reach Foundry (default cancelled, propagation stopped)", () => {
  for (const key of [" ", "Enter"]) {
    let n = 0; const down = fakeKey("keydown", key);
    assert.equal(HM.handleChipKey(down, () => n++), true);
    assert.equal(n, 1); assert.ok(down.prevented && down.stopped);
  }
  // Space released: no second toggle, but the browser's click and Foundry both blocked.
  let n = 0; const up = fakeKey("keyup", " ");
  assert.equal(HM.handleChipKey(up, () => n++), true);
  assert.equal(n, 0); assert.ok(up.prevented && up.stopped);
  // Holding the key does not flicker the chip, but still stays away from Foundry.
  const rep = fakeKey("keydown", " ", true);
  HM.handleChipKey(rep, () => n++);
  assert.equal(n, 0); assert.ok(rep.prevented && rep.stopped);
  // Other keys pass through untouched (Tab must still move focus).
  const tab = fakeKey("keydown", "Tab");
  assert.equal(HM.handleChipKey(tab, () => n++), false);
  assert.ok(!tab.prevented && !tab.stopped && n === 0);
});
