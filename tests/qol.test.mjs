import { test } from "node:test";
import assert from "node:assert/strict";
import * as SM from "../scripts/store-model.mjs";
import * as N from "../scripts/notes-model.mjs";
import * as V from "../scripts/version-model.mjs";
import * as H from "../scripts/health-model.mjs";
import * as R from "../scripts/registry-model.mjs";
import * as HM from "../scripts/hub-model.mjs";
import * as View from "../scripts/hub-view.mjs";
import { selfReport, FIX } from "../scripts/self-model.mjs";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------- update source
test("manifestFor / repoOf: own manifest first, else the GitHub project URL's latest release manifest", () => {
  assert.equal(V.manifestFor({ manifest: "https://example.org/m.json" }), "https://example.org/m.json");
  assert.equal(V.manifestFor({ manifest: "", url: "https://github.com/someone/thing" }), "https://github.com/someone/thing/releases/latest/download/module.json");
  assert.equal(V.manifestFor({ url: "https://github.com/someone/thing.git/" }), "https://github.com/someone/thing/releases/latest/download/module.json");
  assert.equal(V.manifestFor({ url: "https://example.org/x" }), null);
  assert.equal(V.repoOf({ manifest: "https://github.com/a/b/releases/latest/download/module.json" }), "a/b");
  assert.equal(V.repoOf({ url: "https://github.com/a/b" }), "a/b");
  assert.equal(V.repoOf({ manifest: "https://example.org/m.json" }), null);
});

test("checkUpdate uses the project URL when the module has no manifest", async () => {
  const calls = [];
  const fetch = async (/** @type {string} */ u) => { calls.push(u); return { ok: true, json: async () => ({ tag_name: "v2.0.0" }) }; };
  const r = await V.checkUpdate({ id: "x", version: "1.0.0", manifest: null, url: "https://github.com/a/b" }, { fetch });
  assert.equal(r.status, "update"); assert.equal(r.latest, "2.0.0");
  assert.deepEqual(calls, ["https://api.github.com/repos/a/b/releases/latest"]);
  assert.equal(V.updateText(r), "Update available: 1.0.0 → 2.0.0.");
});

// ---------------------------------------------------------------- store
test("normalizeStore: empty, bad values, caps, newest first", () => {
  assert.deepEqual(SM.normalizeStore(null), { v: 1, seen: {}, backed: {}, updateBackup: "", snapshots: [] });
  assert.deepEqual(SM.normalizeStore("x").snapshots, []);
  const snaps = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, at: i, reason: i ? "update" : "nonsense", text: "{}" }));
  const s = SM.normalizeStore({ v: 1, seen: { a: "1.0.0", "bad id!": "1", b: 3 }, snapshots: [...snaps, { id: "", text: "x" }, null] });
  assert.deepEqual(s.seen, { a: "1.0.0" });
  assert.equal(s.snapshots.length, SM.MAX_SNAPSHOTS);
  assert.deepEqual(s.snapshots.map(x => x.id), ["s7", "s6", "s5", "s4", "s3"]);
  assert.equal(s.snapshots[0].size, 2);
  assert.equal(SM.normalizeStore({ v: 1, snapshots: [snaps[0]] }).snapshots[0].reason, "manual");
  // A store from a newer version is not read (it could be written back damaged).
  assert.deepEqual(SM.normalizeStore({ v: 99, seen: { a: "1.0.0" } }).seen, {});
  // An old value without a version is upgraded.
  assert.deepEqual(SM.normalizeStore({ seen: { a: "1.0.0" } }).seen, { a: "1.0.0" });
});

test("changes: fresh, upgrade, downgrade, same; unreadable versions skipped", () => {
  const c = SM.changes({ a: "1.0.0", b: "2.0.0", c: "1.0.0" }, { a: "1.1.0", b: "1.0.0", c: "1.0.0", d: "0.1.0", e: "weird" });
  assert.deepEqual(c.map(x => [x.id, x.kind, x.from]), [["a", "upgrade", "1.0.0"], ["b", "downgrade", "2.0.0"], ["c", "same", "1.0.0"], ["d", "fresh", null]]);
  assert.deepEqual(SM.withVersions({ a: "1" }, { b: "2", "x y": "3" }), { a: "1", b: "2" });
});

test("snapshots: built from a bundle, size limit, capped at 5, removed by id", () => {
  const r = SM.makeSnapshot({ modules: { a: {} } }, { reason: "update", versions: { a: "1.0.0" }, now: 1000 });
  assert.equal(r.ok, true); assert.equal(r.snapshot.reason, "update"); assert.equal(JSON.parse(r.snapshot.text).modules.a !== undefined, true);
  const big = SM.makeSnapshot({ x: "y".repeat(SM.MAX_SNAPSHOT_BYTES + 1) });
  assert.equal(big.ok, false); assert.match(big.error, /too large/);
  const loop = /** @type {any} */ ({}); loop.self = loop;
  assert.equal(SM.makeSnapshot(loop).ok, false);
  let s = SM.normalizeStore(null);
  for (let i = 0; i < 7; i++) s = SM.normalizeStore(SM.addSnapshot(s, SM.makeSnapshot({ i }, { now: 100 + i }).snapshot));
  assert.equal(s.snapshots.length, 5); assert.equal(JSON.parse(s.snapshots[0].text).i, 6);
  s = SM.removeSnapshot(s, s.snapshots[0].id); assert.equal(s.snapshots.length, 4);
});

test("updateSetKey: only available updates, sorted, so the same set isn't backed up twice", () => {
  const m = new Map([["b", { status: "update", latest: "2.0.0" }], ["a", { status: "update", latest: "1.1.0" }], ["c", { status: "current", latest: "1.0.0" }], ["d", { status: "error" }]]);
  assert.equal(SM.updateSetKey(m), "a@1.1.0,b@2.0.0");
  assert.equal(SM.updateSetKey(new Map()), "");
});

// ---------------------------------------------------------------- release notes
test("notesSource: changelog file in the module folder, raw GitHub, else GitHub releases", () => {
  assert.deepEqual(N.notesSource({ id: "m", changelog: "CHANGELOG.md" }), { kind: "changelog", url: "modules/m/CHANGELOG.md" });
  assert.deepEqual(N.notesSource({ id: "m", changelog: "./docs/CHANGES.md" }), { kind: "changelog", url: "modules/m/docs/CHANGES.md" });
  assert.equal(N.notesSource({ id: "m", changelog: "../../etc/x.md", url: "https://github.com/a/b" })?.kind, "github");
  assert.equal(N.notesSource({ id: "m", changelog: "https://raw.githubusercontent.com/a/b/main/CHANGELOG.md" })?.kind, "changelog");
  assert.deepEqual(N.notesSource({ id: "m", changelog: "https://example.org/x.md", manifest: "https://github.com/a/b/releases/latest/download/module.json" }), { kind: "github", repo: "a/b", url: "https://api.github.com/repos/a/b/releases?per_page=30" });
  assert.equal(N.notesSource({ id: "m" }), null);
});

test("parseChangelog / between: version headings, unreleased tag, ranges newest first", () => {
  const text = "# Changelog\n\nIntro.\n\n## 0.5.0 (unreleased)\nnew\n\n## [0.4.1] - 2026-01-01\nfix\n### Fixed\n- a\n\n## v0.4.0\nolder\n\n## Notes\nnot a version\n\n## 0.3.0\nold";
  const s = N.parseChangelog(text);
  assert.deepEqual(s.map(x => x.version), ["0.5.0", "0.4.1", "0.4.0", "0.3.0"]);
  assert.match(s[1].body, /### Fixed/);
  assert.match(s[2].body, /## Notes/);
  assert.deepEqual(N.between(s, "0.4.0", "0.5.0").map(x => x.version), ["0.5.0", "0.4.1"]);
  assert.deepEqual(N.between(s, null, "0.4.1").map(x => x.version), ["0.4.1"]);
  assert.deepEqual(N.between(s, "0.5.0", "0.5.0"), []);
  assert.deepEqual(N.parseChangelog("# 1.0.0\nx\n# 0.9.0\ny").map(x => x.version), ["1.0.0", "0.9.0"]);
  assert.equal(N.headingVersion("Unreleased"), null);
  // This repository's own changelog reads.
  assert.ok(N.parseChangelog(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8")).length >= 5);
});

test("releaseSections: drafts left out, tags read", () => {
  const s = N.releaseSections([{ tag_name: "v1.1.0", name: "1.1.0", body: "b" }, { tag_name: "v1.2.0", draft: true }, { tag_name: "nightly" }, null]);
  assert.deepEqual(s, [{ version: "1.1.0", title: "1.1.0", body: "b" }]);
  assert.deepEqual(N.releaseSections("x"), []);
});

test("fetchNotes: changelog text or releases, failures quiet", async () => {
  const mod = { id: "m", changelog: "CHANGELOG.md" };
  const ok = await N.fetchNotes(mod, { from: "1.0.0", to: "1.1.0", fetch: async () => ({ ok: true, text: async () => "## 1.1.0\nnew\n## 1.0.0\nold" }) });
  assert.deepEqual([ok.ok, ok.source, ok.notes.map(n => n.version)], [true, "changelog", ["1.1.0"]]);
  const gh = await N.fetchNotes({ id: "m", url: "https://github.com/a/b" }, { from: null, to: "2.0.0", fetch: async () => ({ ok: true, json: async () => [{ tag_name: "v2.0.0", body: "x" }] }) });
  assert.deepEqual(gh.notes.map(n => n.body), ["x"]);
  const bad = await N.fetchNotes(mod, { from: null, to: "1.0.0", fetch: async () => ({ ok: false, status: 404 }) });
  assert.deepEqual([bad.ok, bad.error], [false, "the server answered 404"]);
  const thrown = await N.fetchNotes(mod, { from: null, to: "1.0.0", fetch: async () => { throw new Error("offline"); } });
  assert.equal(thrown.error, "offline");
  const slow = await N.fetchNotes(mod, { from: null, to: "1.0.0", timeoutMs: 10, fetch: () => new Promise(() => { }) });
  assert.match(slow.error, /no answer/);
  assert.equal((await N.fetchNotes({ id: "m" }, { from: null, to: "1" })).ok, false);
});

test("markdownHtml: a small subset, everything escaped, no tags or attributes from the notes", () => {
  const h = N.markdownHtml("### Added\n\n- **One** thing `x<y>`\n  - nested *it*\n- link [l](https://a.b/c?d=\"e) <script>alert(1)</script>\n\nPara one\nline two\n\n![img](javascript:alert(1))\n[bad](javascript:alert(1))\n<img src=x onerror=alert(1)>");
  assert.match(h, /<h4>Added<\/h4>/);
  assert.match(h, /<ul><li><strong>One<\/strong> thing <code>x&lt;y&gt;<\/code><ul><li>nested <em>it<\/em><\/li><\/ul><\/li><li>link <a href="https:\/\/a.b\/c\?d=&quot;e" target="_blank" rel="noopener noreferrer">l<\/a> &lt;script&gt;/);
  assert.match(h, /<p>Para one line two<\/p>/);
  assert.doesNotMatch(h, /<script|<img|href="javascript|onerror=[^&]*>/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const long = N.markdownHtml("x".repeat(N.MAX_NOTES_CHARS + 10));
  assert.match(long, /Cut short/);
  assert.equal(N.markdownHtml(""), "");
  // Lists open and close in balance.
  const lists = N.markdownHtml("- a\n  - b\n  - c\n- d\n\n1. e\n2. f");
  assert.equal((lists.match(/<ul>/g) ?? []).length, (lists.match(/<\/ul>/g) ?? []).length);
  assert.equal((lists.match(/<li>/g) ?? []).length, (lists.match(/<\/li>/g) ?? []).length);
});

// ---------------------------------------------------------------- health fix contract
test("readFix / normalizeReport: fixes on lines, keyed by place; bad ones dropped", () => {
  const run = () => "done";
  assert.deepEqual(H.readFix("rebuild"), { label: "Fix", action: "rebuild" });
  assert.deepEqual(H.readFix(run), { label: "Fix", run });
  assert.deepEqual(H.readFix({ label: "<b>Rebuild</b>", action: "rebuild", confirm: "Sure?" }), { label: "Rebuild", action: "rebuild", confirm: "Sure?" });
  assert.equal(H.readFix({ label: "x" }), null);
  assert.equal(H.readFix("bad id with spaces"), null);
  assert.equal(H.readFix(42), null);
  const rep = H.normalizeReport([{ title: "A", lines: [{ level: "ok", text: "fine" }, { level: "warn", text: "broken", fix: { label: "Repair", run } }] }, { title: "B", lines: [{ level: "bad", text: "x", fix: "act" }] }]);
  assert.equal(rep[0].lines[0].fix, undefined);
  assert.deepEqual([rep[0].lines[1].fix.key, rep[1].lines[0].fix.key], ["0:1", "1:0"]);
  // A line without a fix keeps the old shape (backward compatible).
  assert.deepEqual(H.normalizeReport([{ level: "ok", text: "a" }]), [{ title: "", lines: [{ level: "ok", text: "a" }] }]);
  const g = H.groupHealth([{ id: "m", state: "ran", report: rep }]).groups[0];
  assert.equal(H.findFix(g, "0:1")?.fix.run, run);
  assert.equal(H.findFix(g, "9:9"), null);
});

test("registration: fixes map, reserved and bad ids warned", () => {
  const r = R.normalizeRegistration({ id: "m", fixes: { rebuild: () => 1, "satchel:x": () => 1, "bad id": () => 1, other: 5 } });
  assert.deepEqual(Object.keys(r.entry.fixes), ["rebuild"]);
  assert.equal(r.warnings.length, 3);
  assert.equal(R.normalizeRegistration({ id: "m", fixes: [] }).warnings[0], "fixes should be { actionId: (ctx) => result }");
  assert.equal(R.normalizeRegistration({ id: "m" }).entry.fixes, undefined);
});

test("fix buttons: only in the hub's report when on, never on the chat card; escaped", () => {
  const rep = H.normalizeReport([{ level: "warn", text: "broken", fix: { label: "Re<pair", action: "a" } }]);
  const g = H.groupHealth([{ id: "m\"x", title: "M", state: "ran", report: rep }]);
  const on = View.healthHtml(g, { filter: new Set(), fixes: true });
  assert.match(on, /data-action="healthFix" data-id="m&quot;x" data-key="0:0"/);
  assert.match(on, /Re&lt;pair/);
  assert.doesNotMatch(View.healthHtml(g, { filter: new Set() }), /healthFix/);
  assert.doesNotMatch(View.healthHtml(g, { card: true, fixes: true }), /healthFix/);
});

test("selfReport: storage visible to players gets a fix; backups, update errors, debug", () => {
  const ok = selfReport({ store: { exists: true, playersCanSee: [], backups: 2 }, features: {}, debugOn: false, updateErrors: 0, updatesChecked: true });
  assert.deepEqual(ok.flatMap(s => s.lines.map(l => l.level)), ["ok", "ok", "ok"]);
  const bad = selfReport({ store: { exists: true, playersCanSee: ["Pat"], backups: 0 }, features: {}, debugOn: true, updateErrors: 2 });
  const fixes = bad.flatMap(s => s.lines).filter(l => l.fix).map(l => l.fix.action);
  assert.deepEqual(fixes, [FIX.storePrivate, FIX.backupNow, FIX.recheck, FIX.debugOff]);
  assert.match(bad[0].lines[0].text, /Pat/);
  const off = selfReport({ store: { exists: false }, features: { settingsBackup: false, updateCheck: false } });
  assert.deepEqual(off.flatMap(s => s.lines).map(l => l.level), ["info"]);
  assert.ok(Object.values(FIX).every(id => id.startsWith("satchel:") && H.readFix(id)));
});

// ---------------------------------------------------------------- hub: backups and What's new
test("backups page and router: needs both switches; list model; escaped HTML", () => {
  assert.equal(HM.resolvePage("backups"), "backups");
  assert.equal(HM.resolvePage("backups", { features: { settingsBackup: false } }), "overview");
  assert.equal(HM.resolvePage("backups", { features: { sharedSettings: false } }), "overview");
  const now = 10 * 86400000;
  const list = HM.backupsModel([{ id: "b<1", at: now - 3 * 86400000, reason: "update", size: 3000, versions: { a: "1.0.0", b: "2.0" } }], now, () => "DATE");
  assert.deepEqual(list[0], { id: "b<1", when: "DATE", ago: "3 days ago", reason: "update", text: "Updates found · 2 modules · 3 KB", versions: "a 1.0.0 · b 2.0" });
  const html = View.backupsHtml(list, { error: "x<y" });
  assert.match(html, /data-action="restoreBackup" data-id="b&lt;1"/);
  assert.match(html, /x&lt;y/);
  assert.match(View.backupsHtml([]), /No backups yet/);
  assert.equal(HM.backupsText([], 0).startsWith("None yet"), true);
  const ov = HM.overviewModel({ items: [], updates: new Map(), health: new Map(), features: {}, debug: null, now, backups: [{ at: now - 60_000 }] });
  assert.deepEqual(ov.tools.backups, { count: 1, text: "1 of 5 kept · last 1 min ago." });
  assert.equal(HM.overviewModel({ items: [], updates: new Map(), health: new Map(), features: { settingsBackup: false }, debug: null, now }).tools.backups, null);
});

test("whatsNewModel / whatsNewHtml: per module, loading / error / notes, dismiss, escaped", () => {
  const items = [{ id: "a", title: "Al<pha", docs: { changelog: "modules/a/CHANGELOG.md" } }, { id: "b", title: "B", docs: {} }];
  const notices = new Map([["a", { from: "1.0.0", to: "1.1.0", state: "ok", notes: [{ version: "1.1.0", title: "1.1.0", body: "- **new** <b>x</b>" }] }], ["b", { from: "1", to: "2", state: "error", error: "offline" }], ["gone", { to: "1", state: "loading" }]]);
  const list = HM.whatsNewModel(notices, items);
  assert.deepEqual(list.map(n => [n.id, n.state, n.changelog]), [["a", "ok", true], ["b", "error", false]]);
  const html = View.whatsNewHtml(list);
  assert.match(html, /What's new in Al&lt;pha/);
  assert.match(html, /<strong>new<\/strong> &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /data-action="dismissNews" data-id="a"/);
  assert.match(html, /couldn't be read \(offline\)/);
  assert.equal(View.whatsNewHtml([]), "");
});

test("update banner: x → y, Changelog and Back up settings buttons", () => {
  const item = { id: "a", title: "A", version: "1.0.0", active: true, installed: true, source: "adapter", docs: { changelog: "c" }, can: { docs: true, bugs: false, panel: true } };
  const m = HM.moduleModel({ item, entry: { id: "a" }, update: { status: "update", installed: "1.0.0", latest: "1.1.0" }, health: null, features: {}, debug: null, extras: [], now: 0 });
  assert.equal(m.canBackup, true);
  const h = View.moduleHtml(m);
  assert.match(h, /Update available <code>1.0.0<\/code> → <code>1.1.0<\/code>/);
  assert.match(h, /data-action="backupNow"/);
  assert.equal(HM.moduleModel({ item, entry: { id: "a" }, update: { status: "update", installed: "1.0.0", latest: "1.1.0" }, health: null, features: { settingsBackup: false }, debug: null, extras: [], now: 0 }).canBackup, false);
});

test("api.entries() is GM only; Remove Satchel data covers the new storage", () => {
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.match(main, /entries: \(\) => gmOnly\(/);
  const cleanup = readFileSync(new URL("../scripts/cleanup.mjs", import.meta.url), "utf8");
  assert.match(cleanup, /\["store", /);
  assert.match(cleanup, /clearChecked\(\)/);
  assert.match(cleanup, /storeEntry/);
});

test("overview: the Satchel's own update shows as a banner; Check now", () => {
  const ov = HM.overviewModel({ items: [], updates: new Map(), health: new Map(), features: {}, debug: null, now: 0 });
  const h = View.overviewHtml(ov, { updateCheck: true, combinedHealth: true, id: "wanderers-satchel", checkedHint: "checked 2 h ago", selfUpdate: { status: "update", installed: "0.5.0", latest: "0.6.0" } });
  assert.match(h, /update available <code>0.5.0<\/code> → <code>0.6.0<\/code>/);
  assert.match(h, /data-action="recheckUpdates"[^>]*title="Check for updates now \(checked 2 h ago\)"/);
  assert.doesNotMatch(View.overviewHtml(ov, { updateCheck: true, combinedHealth: true, id: "x", selfUpdate: { status: "current" } }), /update available/);
});
