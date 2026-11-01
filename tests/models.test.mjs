import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "../scripts/version-model.mjs";
import * as R from "../scripts/registry-model.mjs";
import * as H from "../scripts/health-model.mjs";
import * as S from "../scripts/settings-model.mjs";
import * as FM from "../scripts/features-model.mjs";
import { defineFeatures, defineSettings } from "../vendor/wanderers-core/index.mjs";

// ---------------------------------------------------------------- versions
test("compareVersions: v prefix, missing parts, pre-releases, missing values", () => {
  assert.equal(V.compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(V.compareVersions("1.2", "1.2.0"), 0);
  assert.equal(V.compareVersions("1.9.0", "1.10.0"), -1);
  assert.equal(V.compareVersions("2.0.0", "v1.99.99"), 1);
  assert.equal(V.compareVersions("1.2.0-beta.1", "1.2.0"), -1);
  assert.equal(V.compareVersions("1.2.0", "1.2.0-rc"), 1);
  assert.equal(V.compareVersions(undefined, "1.0.0"), null);
  assert.equal(V.compareVersions("1.0.0", ""), null);
  assert.equal(V.compareVersions("latest", "1.0.0"), null);
});

test("updateSource: GitHub release manifests use the API, others the manifest", () => {
  const g = V.updateSource("https://github.com/someone/thing/releases/latest/download/module.json");
  assert.deepEqual(g, { kind: "github", repo: "someone/thing", url: "https://api.github.com/repos/someone/thing/releases/latest" });
  assert.equal(V.updateSource("https://github.com/a/b/releases/download/v1.0.0/module.json").kind, "github");
  assert.deepEqual(V.updateSource("https://example.org/module.json"), { kind: "manifest", url: "https://example.org/module.json" });
  assert.equal(V.updateSource(""), null);
  assert.equal(V.updateSource(undefined), null);
  assert.equal(V.updateSource("modules/x/module.json"), null);
});

const fakeStorage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m }; };
const okFetch = (body, calls = []) => async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => body }; };
const MOD = { id: "thing", version: "1.0.0", manifest: "https://github.com/a/thing/releases/latest/download/module.json" };

test("checkUpdate: update, current, ahead, unknown", async () => {
  assert.equal((await V.checkUpdate(MOD, { fetch: okFetch({ tag_name: "v1.1.0" }) })).status, "update");
  assert.equal((await V.checkUpdate(MOD, { fetch: okFetch({ tag_name: "v1.0.0" }) })).status, "current");
  assert.equal((await V.checkUpdate(MOD, { fetch: okFetch({ tag_name: "0.9.0" }) })).status, "ahead");
  assert.equal((await V.checkUpdate({ ...MOD, version: "dev" }, { fetch: okFetch({ tag_name: "1.0.0" }) })).status, "unknown");
  const none = await V.checkUpdate({ id: "x", version: "1" }, { fetch: okFetch({}) });
  assert.equal(none.status, "unknown"); assert.match(none.error, /no manifest/);
  const other = await V.checkUpdate({ id: "o", version: "1.0.0", manifest: "https://example.org/m.json" }, { fetch: okFetch({ version: "1.0.1" }) });
  assert.equal(other.status, "update"); assert.equal(other.latest, "1.0.1");
});

test("checkUpdate: failures are 'couldn't check', never throw", async () => {
  const r404 = await V.checkUpdate(MOD, { fetch: async () => ({ ok: false, status: 404 }) });
  assert.equal(r404.status, "error"); assert.match(r404.error, /404/);
  const thrown = await V.checkUpdate(MOD, { fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(thrown.status, "error"); assert.match(thrown.error, /Failed to fetch/);
  const noTag = await V.checkUpdate(MOD, { fetch: okFetch({}) });
  assert.equal(noTag.status, "error");
  const noFetch = await V.checkUpdate(MOD, {});
  assert.equal(noFetch.status, "error");
  assert.match(V.updateText(thrown), /^Couldn't check/);
});

test("checkUpdate: times out", async () => {
  let aborted = false;
  const slow = (url, opts) => new Promise((res, rej) => { opts?.signal?.addEventListener?.("abort", () => { aborted = true; rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }); });
  const t0 = Date.now();
  const r = await V.checkUpdate(MOD, { fetch: slow, timeoutMs: 30 });
  assert.equal(r.status, "error");
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(aborted);
});

test("update cache: hits within the time, failures kept shorter, broken storage tolerated", async () => {
  let now = 1_000_000; const st = fakeStorage();
  const cache = V.createCache(st, { now: () => now });
  const calls = [];
  const f = okFetch({ tag_name: "v1.1.0" }, calls);
  await V.checkUpdate(MOD, { fetch: f, cache });
  const again = await V.checkUpdate(MOD, { fetch: f, cache });
  assert.equal(calls.length, 1); assert.equal(again.cached, true); assert.equal(again.status, "update");
  // installed version changes: verdict recomputed from the cached latest
  assert.equal((await V.checkUpdate({ ...MOD, version: "1.1.0" }, { fetch: f, cache })).status, "current");
  await V.checkUpdate(MOD, { fetch: f, cache, force: true }); assert.equal(calls.length, 2);
  now += V.CACHE_OK_MS + 1; await V.checkUpdate(MOD, { fetch: f, cache }); assert.equal(calls.length, 3);
  // failure cache is shorter
  const fail = async () => { calls.push("x"); throw new Error("down"); };
  const m2 = { ...MOD, id: "other" };
  await V.checkUpdate(m2, { fetch: fail, cache }); await V.checkUpdate(m2, { fetch: fail, cache });
  assert.equal(calls.filter(c => c === "x").length, 1);
  now += V.CACHE_FAIL_MS + 1; await V.checkUpdate(m2, { fetch: fail, cache });
  assert.equal(calls.filter(c => c === "x").length, 2);
  assert.ok(cache.keys().length >= 2);
  cache.clear(); assert.equal(st._m.size, 0);
  // storage that throws on every call
  const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); }, key() { throw new Error("no"); }, get length() { throw new Error("no"); } };
  const c2 = V.createCache(bad, { now: () => now });
  const calls2 = [];
  await V.checkUpdate(MOD, { fetch: okFetch({ tag_name: "1.0.0" }, calls2), cache: c2 });
  const hit = await V.checkUpdate(MOD, { fetch: okFetch({ tag_name: "1.0.0" }, calls2), cache: c2 });
  assert.equal(calls2.length, 1); assert.equal(hit.cached, true);
});

// ---------------------------------------------------------------- registry
test("normalizeRegistration: id required, bad fields dropped with warnings", () => {
  assert.equal(R.normalizeRegistration(null).ok, false);
  assert.equal(R.normalizeRegistration({}).ok, false);
  assert.equal(R.normalizeRegistration({ id: "has space" }).ok, false);
  const fn = () => 1;
  const r = R.normalizeRegistration({ id: "my-mod", title: "Mine", openPanel: fn, health: "nope", debugSetting: "debugLog", docs: { readme: "README.md", bad: 1 }, importSettings: { read: fn }, extra: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.entry.title, "Mine"); assert.equal(r.entry.openPanel, fn); assert.equal(r.entry.health, undefined);
  assert.deepEqual(r.entry.debugSetting, { namespace: "my-mod", key: "debugLog" });
  assert.deepEqual(r.entry.docs, { readme: "README.md" });
  assert.equal(r.entry.importSettings, undefined);
  assert.ok(r.warnings.some(w => /health/.test(w)));
  assert.ok(r.warnings.some(w => /importSettings/.test(w)));
  assert.ok(r.warnings.some(w => /extra/.test(w)));
  assert.deepEqual(R.debugRef({ namespace: "core", key: "x" }, "m"), { namespace: "core", key: "x" });
  assert.equal(R.debugRef({ key: "" }, "m"), null);
});

test("mergeEntries: adapters need the module installed, registrations override, unknown modules only when registered", () => {
  const adapters = [{ id: "a", title: "Alpha", health: () => "adapter" }, { id: "b", title: "Beta" }, { id: "gone", title: "Gone" }];
  const reg = new Map([["a", { id: "a", title: "Alpha (own)", health: () => "own" }], ["z", { id: "z", title: "Zed" }]]);
  const out = R.mergeEntries(adapters, reg, ["a", "b", "z", "other"]);
  assert.deepEqual(out.map(e => e.id), ["a", "b", "z"]);
  assert.equal(out[0].source, "registered"); assert.equal(out[0].health(), "own"); assert.equal(out[0].title, "Alpha (own)");
  assert.equal(out[1].source, "adapter");
  assert.equal(out.find(e => e.id === "gone"), undefined);
  // a registered module that isn't installed still shows (its card says so)
  assert.deepEqual(R.mergeEntries([], [{ id: "q" }], []).map(e => e.id), ["q"]);
});

test("cardModel and docLinks", () => {
  const mod = { id: "m", title: "Mod", version: "1.0.0", active: true, url: "https://github.com/a/m", readme: "README.md", changelog: "https://x/CHANGELOG.md", bugs: "https://github.com/a/m/issues" };
  const c = R.cardModel({ id: "m", source: "adapter", health: () => 1, debugSetting: { namespace: "m", key: "d" } }, mod);
  assert.equal(c.title, "Mod"); assert.equal(c.can.health, true); assert.equal(c.can.debug, true); assert.equal(c.can.bugs, true);
  assert.equal(c.docs.readme, "modules/m/README.md"); assert.equal(c.docs.changelog, "https://x/CHANGELOG.md");
  const off = R.cardModel({ id: "m", source: "adapter", health: () => 1 }, { ...mod, active: false });
  assert.equal(off.can.health, false); assert.equal(off.can.panel, false);
  const missing = R.cardModel({ id: "n", title: "N", source: "registered" }, null);
  assert.equal(missing.installed, false); assert.equal(missing.version, null); assert.equal(missing.can.docs, false);
  assert.deepEqual(R.docLinks({ id: "m", url: "not a url", bugs: "" }, { bugs: "https://b" }), { home: null, readme: null, changelog: null, bugs: "https://b" });
});

test("debugPlan: only registered Boolean settings, state on/off/mixed/none", () => {
  const entries = [{ id: "a", debugSetting: { namespace: "a", key: "d" } }, { id: "b", debugSetting: { namespace: "b", key: "d" } }, { id: "c", debugSetting: { namespace: "c", key: "d" } }, { id: "e" }];
  const defs = new Map([["a.d", { type: Boolean, scope: "world" }], ["b.d", { type: "Boolean", scope: "client" }], ["c.d", { type: String }]]);
  const p = R.debugPlan(entries, defs, { "a.d": true, "b.d": false });
  assert.deepEqual(p.rows.map(r => r.id), ["a", "b"]); assert.equal(p.state, "mixed"); assert.deepEqual(p.missing, ["c"]);
  assert.equal(R.debugPlan(entries, defs, { "a.d": true, "b.d": true }).state, "on");
  assert.equal(R.debugPlan(entries, defs, {}).state, "off");
  assert.equal(R.debugPlan([], defs, {}).state, "none");
});

// ---------------------------------------------------------------- health
test("normalizeReport: sections, plain lines, strings, junk", () => {
  const secs = H.normalizeReport([{ title: "Features", lines: [{ level: "ok", text: "<strong>On</strong> &amp; fine" }, { level: "warning", text: "Hmm" }] }]);
  assert.deepEqual(secs, [{ title: "Features", lines: [{ level: "ok", text: "On & fine" }, { level: "warn", text: "Hmm" }] }]);
  assert.deepEqual(H.normalizeReport(["just text"]), [{ title: "", lines: [{ level: "info", text: "just text" }] }]);
  assert.equal(H.normalizeReport({ lines: [{ status: "error", message: "x" }] })[0].lines[0].level, "bad");
  assert.equal(H.normalizeReport({ sections: [{ title: "T", lines: [] }] })[0].title, "T");
  assert.equal(H.normalizeReport(42)[0].lines[0].level, "info");
  assert.equal(H.normalizeReport(null)[0].lines[0].level, "warn");
});

test("groupHealth: summary, problems first, failed / none / inactive", () => {
  const g = H.groupHealth([
    { id: "fine", title: "Fine", state: "ran", report: [{ title: "", lines: [{ level: "ok", text: "a" }, { level: "ok", text: "b" }] }] },
    { id: "none", title: "None", state: "none" },
    { id: "warny", title: "Warny", state: "ran", report: [{ level: "warn", text: "w" }] },
    { id: "broke", title: "Broke", state: "failed", error: "boom" },
    { id: "sleep", title: "Sleep", state: "inactive" }
  ]);
  assert.deepEqual(g.groups.map(x => x.id), ["broke", "warny", "fine", "none", "sleep"]);
  assert.equal(g.summary.modules, 5); assert.equal(g.summary.ran, 2); assert.equal(g.summary.failed, 1); assert.equal(g.summary.none, 1); assert.equal(g.summary.inactive, 1);
  assert.equal(g.summary.ok, 2); assert.equal(g.summary.warn, 1); assert.equal(g.summary.bad, 1); assert.equal(g.summary.worst, "bad");
  assert.match(g.groups[0].sections[0].lines[0].text, /boom/);
  assert.match(H.summaryText(g.summary), /5 modules · 2 ✓ · 1 ⚠ · 1 ✗ \(1 check failed, 1 without a check, 1 not active\)/);
  assert.equal(H.groupHealth([]).summary.worst, "ok");
});

// ---------------------------------------------------------------- settings
test("buildModuleExport: buckets, skip list, sorted, cloned", () => {
  const obj = { a: 1 };
  const e = S.buildModuleExport("m", [{ key: "z", scope: "world", value: obj }, { key: "a", scope: "client", value: true }, { key: "u", scope: "user", value: "x" }, { key: "hist", scope: "world", value: [1] }], { version: "1.0", skip: ["hist"] });
  assert.deepEqual(e, { module: "m", format: 1, version: "1.0", exported: "", world: { z: { a: 1 } }, client: { a: true, u: "x" } });
  obj.a = 2; assert.equal(e.world.z.a, 1);
});

test("bundle round trip and validation", () => {
  const b = S.buildBundle([{ id: "m", title: "M", version: "1", via: "settings", data: { module: "m", world: { k: 1 } } }, { id: "n", via: "module", data: { x: 1 } }, { id: "skip" }], { version: "0.1.0", exported: "now" });
  assert.equal(b.module, "wanderers-satchel"); assert.deepEqual(Object.keys(b.modules), ["m", "n"]);
  const r = S.readBundle(JSON.stringify(b));
  assert.equal(r.ok, true); assert.deepEqual(r.modules.map(m => [m.id, m.via]), [["m", "settings"], ["n", "module"]]);
  assert.match(S.readBundle("{nope").error, /valid JSON/);
  assert.match(S.readBundle("[]").error, /isn't a settings export/);
  assert.match(S.readBundle({ module: "wayfarers-toolkit", format: 1 }).error, /wayfarers-toolkit/);
  assert.match(S.readBundle({ module: "wanderers-satchel", format: 2, modules: {} }).error, /format/);
  assert.match(S.readBundle({ module: "wanderers-satchel", format: 1 }).error, /no modules/);
});

test("readModuleSettings: change preview, unknown, invalid, skipped, scope fix", () => {
  const defs = new Map([
    ["on", { scope: "world", type: Boolean, name: "On" }],
    ["n", { scope: "world", type: Number, range: { min: 0, max: 10 } }],
    ["c", { scope: "world", type: String, choices: { a: "A", b: "B" } }],
    ["cl", { scope: "client", type: String }],
    ["hist", { scope: "world", type: Array }],
    ["col", { scope: "world", type: { name: "ColorField" } }]
  ]);
  const r = S.readModuleSettings("m", { module: "m", world: { on: true, n: 50, c: "z", gone: 1, hist: [], cl: "x", col: "#ff0000" }, client: {} }, defs, { on: true, n: 3, cl: "y" }, ["hist"]);
  assert.equal(r.ok, true);
  const row = k => r.rows.find(x => x.key === k);
  assert.equal(row("on").changed, false);
  assert.equal(row("n").to, 10); assert.match(row("n").note, /kept within/);
  assert.equal(row("cl").scope, "client"); assert.match(row("cl").note, /applied as a client/);
  assert.equal(row("col").to, "#ff0000");
  assert.deepEqual(r.unknown, ["gone"]); assert.deepEqual(r.skipped, ["hist"]);
  assert.deepEqual(r.invalid.map(i => i.key), ["c"]);
  assert.equal(S.readModuleSettings("m", { module: "other" }, defs).ok, false);
  assert.equal(S.readModuleSettings("m", { world: [] }, defs).ok, false);
  assert.equal(S.readModuleSettings("m", null, defs).ok, false);
});

test("checkValue and helpers", () => {
  assert.equal(S.checkValue({ type: Boolean }, "true").ok, false);
  assert.equal(S.checkValue({ type: Number }, NaN).ok, false);
  assert.equal(S.checkValue({ type: Array }, {}).ok, false);
  assert.equal(S.checkValue({ type: Object }, []).ok, false);
  assert.equal(S.checkValue({ type: undefined }, undefined).ok, false);
  assert.equal(S.preview("x".repeat(100)).length, 60);
  assert.equal(S.fileName("My World!", new Date(2026, 9, 31)), "wanderers-satchel-settings-my-world-2026-10-31.json");
});

// ---------------------------------------------------------------- 0.2.0: core, time limits, import safety
test("features and settings tables are valid for core (stable keys)", () => {
  const f = defineFeatures(FM.FEATURE_LIST);
  assert.deepEqual(f.map(x => x.key), ["feature-updateCheck", "feature-dailyUpdateCheck", "feature-whatsNew", "feature-settingsBackup", "feature-combinedHealth", "feature-sharedSettings", "feature-healthFixes", "feature-debugAll", "feature-sceneButton"]);
  assert.ok(f.every(x => x.default === true));
  const rows = defineSettings(FM.SETTING_ROWS, { reserved: f.map(x => x.key) });
  assert.deepEqual(rows.map(r => r.key), ["debugLog"]);
});

test("healthTimeout: long first run, adaptive later, a module's own limit, clamped", () => {
  assert.equal(H.healthTimeout(), H.FIRST_RUN_MS);
  assert.ok(H.FIRST_RUN_MS >= 60000, "the first run after a load waits at least a minute");
  assert.equal(H.healthTimeout({ first: false, lastMs: 1000 }), H.BASE_MS);
  assert.equal(H.healthTimeout({ first: false, lastMs: 25000 }), 75000);
  assert.equal(H.healthTimeout({ first: false, lastMs: 10 * 60000 }), H.MAX_MS);
  assert.equal(H.healthTimeout({ first: false, lastMs: null }), H.FIRST_RUN_MS);
  assert.equal(H.healthTimeout({ first: false, own: 1000 }), H.MIN_MS);
  assert.equal(H.healthTimeout({ first: false, own: 40000 }), 40000);
  assert.equal(H.healthTimeout({ first: true, own: 40000 }), H.FIRST_RUN_MS);
  assert.equal(H.healthTimeout({ first: true, own: 10 ** 9 }), H.MAX_MS);
});

const wait = ms => new Promise(r => setTimeout(r, ms));
test("runChecks: modules run at once and independently; slow, timeout, late answer, throw", async () => {
  const changes = [];
  const list = [{ id: "fast" }, { id: "slow" }, { id: "hung" }, { id: "late" }, { id: "boom" }];
  const runOne = async e => {
    if (e.id === "fast") return { state: "ran", report: [{ level: "ok", text: "fine" }] };
    if (e.id === "slow") { await wait(60); return { state: "ran", report: [{ level: "ok", text: "slow but fine" }] }; }
    if (e.id === "hung") return new Promise(() => { });
    if (e.id === "late") { await wait(150); return { state: "ran", report: [{ level: "warn", text: "late" }] }; }
    throw new Error("kaboom");
  };
  const limits = { fast: 1000, slow: 1000, hung: 80, late: 80, boom: 1000 };
  const t0 = Date.now();
  const job = H.runChecks(list, runOne, { timeoutFor: e => limits[e.id], slowMs: 30, onChange: (i, r) => changes.push([list[i].id, r.state]) });
  assert.deepEqual(job.results.map(r => r.state), ["pending", "pending", "pending", "pending", "pending"]);
  const done = await job.done;
  assert.ok(Date.now() - t0 < 140, "done waits for the longest limit, not the sum of the checks");
  const st = id => done.find(r => r.id === id);
  assert.equal(st("fast").state, "ran"); assert.equal(st("slow").state, "ran");
  assert.equal(st("hung").state, "timeout"); assert.equal(st("hung").limitMs, 80);
  assert.equal(st("late").state, "timeout");
  assert.equal(st("boom").state, "failed"); assert.match(st("boom").error, /kaboom/);
  assert.ok(changes.some(([id, s]) => id === "slow" && s === "slow"), "a check past slowMs shows still checking");
  const g = H.groupHealth(done);
  assert.equal(g.summary.waiting, 2); assert.equal(g.summary.failed, 1);
  assert.match(g.groups.find(x => x.id === "hung").sections[0].lines[0].text, /No answer yet after/);
  assert.equal(g.groups.find(x => x.id === "hung").worst, "warn");
  assert.match(H.summaryText(g.summary), /2 still checking/);
  await wait(120);
  assert.equal(job.results[3].state, "ran"); assert.equal(job.results[3].late, true);
  assert.match(H.groupHealth(job.results).groups.find(x => x.id === "late").note, /after its time limit/);
  assert.equal(job.results[2].state, "timeout");
});

test("runChecks: empty list is done at once; a non-object result is a failure", async () => {
  assert.deepEqual(await H.runChecks([], () => ({})).done, []);
  const r = await H.runChecks([{ id: "x" }], () => 5, { timeoutFor: () => 1000 }).done;
  assert.equal(r[0].state, "failed");
});

test("groupHealth: pending and slow rows read as info, not problems", () => {
  const g = H.groupHealth([{ id: "a", state: "pending" }, { id: "b", state: "slow" }]);
  assert.deepEqual(g.groups.map(x => x.worst), ["info", "info"]);
  assert.match(g.groups[1].sections[0].lines[0].text, /Still checking/);
  assert.equal(g.summary.worst, "ok"); assert.equal(g.summary.waiting, 2);
});

test("normalizeReport: core's { report } wrapper", () => {
  assert.equal(H.normalizeReport({ report: [{ title: "Core", lines: [{ level: "ok", text: "x" }] }] })[0].title, "Core");
});

test("plainJson: plain data only, size and depth limits, no prototype keys", () => {
  assert.equal(S.plainJson({ a: [1, "x", true, null, { b: 2 }] }), true);
  assert.match(String(S.plainJson(JSON.parse('{"__proto__": {"x": 1}}'))), /isn't allowed/);
  assert.match(String(S.plainJson({ constructor: 1 })), /isn't allowed/);
  let deep = {}; const top = deep; for (let i = 0; i < 20; i++) { deep.n = {}; deep = deep.n; }
  assert.match(String(S.plainJson(top)), /nested too deeply/);
  assert.match(String(S.plainJson({ s: "x".repeat(S.MAX_VALUE_BYTES) })), /too large/);
  assert.match(String(S.plainJson({ d: new Date() })), /plain data/);
  assert.match(String(S.plainJson({ n: Infinity })), /finite/);
});

test("readModuleSettings: Object settings validated (plain JSON, then the module's own check)", () => {
  const defs = new Map([["net", { scope: "world", type: Object }], ["list", { scope: "world", type: Array }], ["col", { scope: "world", type: { name: "ColorField" } }]]);
  const own = { net: v => Array.isArray(v.points) || "should have points" };
  const ok = S.readModuleSettings("m", { world: { net: { points: [] }, list: [1], col: "#fff" } }, defs, {}, [], own);
  assert.deepEqual(ok.rows.map(r => r.key).sort(), ["col", "list", "net"]);
  const bad = S.readModuleSettings("m", { world: { net: { nope: 1 }, list: [JSON.parse('{"__proto__":1}')], col: { constructor: 1 } } }, defs, {}, [], own);
  assert.deepEqual(bad.rows, []);
  assert.deepEqual(bad.invalid.map(i => i.key).sort(), ["col", "list", "net"]);
  assert.match(bad.invalid.find(i => i.key === "net").reason, /should have points/);
});

test("recheck: the write-time check matches the preview", () => {
  assert.equal(S.recheck({ type: Boolean }, "yes").ok, false);
  assert.deepEqual(S.recheck({ type: Number, range: { min: 0, max: 5 } }, 9), { ok: true, value: 5, reason: "kept within 0 to 5" });
  assert.equal(S.recheck({ type: Object }, { a: 1 }, { k: () => "no" }, "k").ok, false);
  assert.equal(S.recheck({ type: Object }, { a: 1 }, {}, "k").ok, true);
  assert.equal(S.recheck({ type: Object }, { constructor: 1 }, {}, "k").ok, false);
  assert.deepEqual(S.recheck({ type: Array }, [1], { k: v => ({ ok: true, value: v.concat(2) }) }, "k"), { ok: true, value: [1, 2] });
});

test("readBundle: drops ids that aren't module ids, limits the file size", () => {
  const r = S.readBundle({ module: "wanderers-satchel", format: 1, modules: { "good-id": { data: {} }, "bad id!": { data: {} }, "constructor": { data: {} } } });
  assert.deepEqual(r.modules.map(m => m.id), ["good-id"]);
  assert.match(S.readBundle(" ".repeat(S.MAX_FILE + 1)).error, /too large/);
});

test("registration: validators and healthTimeoutMs", () => {
  const r = R.normalizeRegistration({ id: "m", validators: { a: () => true, b: 5 }, healthTimeoutMs: 45000 });
  assert.equal(typeof r.entry.validators.a, "function"); assert.equal(r.entry.validators.b, undefined);
  assert.equal(r.entry.healthTimeoutMs, 45000);
  assert.ok(r.warnings.some(w => /validators\.b/.test(w)));
  assert.ok(R.normalizeRegistration({ id: "m", healthTimeoutMs: -1 }).warnings.some(w => /healthTimeoutMs/.test(w)));
  assert.ok(R.normalizeRegistration({ id: "m", validators: [] }).warnings.some(w => /validators should/.test(w)));
});

test("moduleBudget and runOne get the limit: the module's own limit sits just under the Satchel's", async () => {
  assert.equal(H.moduleBudget(90000), 88000);
  assert.equal(H.moduleBudget(5000), 4500);
  assert.equal(H.moduleBudget(300000), 298000);
  assert.equal(H.moduleBudget(500), 1000);
  assert.equal(H.moduleBudget(undefined), 88000);
  const seen = [];
  const job = H.runChecks([{ id: "a" }, { id: "b" }], (e, ctx) => { seen.push([e.id, ctx.limitMs]); return { state: "ran", report: [] }; }, { timeoutFor: e => e.id === "a" ? 90000 : 30000 });
  await job.settled;
  assert.deepEqual(seen, [["a", 90000], ["b", 30000]]);
});

test("runChecks: a module still running at slowMs shows Still checking… in the grouped report, then its answer", async () => {
  let release = () => { };
  const job = H.runChecks([{ id: "tk", title: "Toolkit" }], () => new Promise(r => { release = () => r({ state: "ran", report: [{ title: "A", lines: [{ level: "ok", text: "fine" }] }] }); }), { timeoutFor: () => 1000, slowMs: 20 });
  await new Promise(r => setTimeout(r, 40));
  const g = H.groupHealth(job.results);
  assert.equal(g.groups[0].state, "slow");
  assert.match(g.groups[0].sections[0].lines[0].text, /^Still checking…/);
  release(); await job.settled;
  assert.equal(H.groupHealth(job.results).groups[0].sections[0].lines[0].text, "fine");
});

// ---------------------------------------------------------------- setting names and hints localized (pure: localize passed in)
import { label as settingLabel, localizeDefs } from "../scripts/settings-model.mjs";
test("setting labels: translation keys localized, plain text kept, no localize = as is", () => {
  const dict = { "LOOTLEDGER.Settings.Ratio.Name": "Conversion ratio", "LOOTLEDGER.Settings.Ratio.Hint": "How many…" };
  const loc = (/** @type {string} */ k) => dict[k] ?? k;
  assert.equal(settingLabel("LOOTLEDGER.Settings.Ratio.Name", loc), "Conversion ratio");
  assert.equal(settingLabel("Plain name", loc), "Plain name");
  assert.equal(settingLabel("X.Y", null), "X.Y");
  assert.equal(settingLabel(undefined, loc), "");
  assert.equal(settingLabel("X.Y", () => { throw new Error("no"); }), "X.Y");
  assert.equal(settingLabel("X.Y", () => ""), "X.Y");
  const d = localizeDefs(new Map([["ratio", { scope: "world", type: Number, name: "LOOTLEDGER.Settings.Ratio.Name", hint: "LOOTLEDGER.Settings.Ratio.Hint" }]]), loc);
  assert.deepEqual([d.get("ratio").name, d.get("ratio").hint, d.get("ratio").type], ["Conversion ratio", "How many…", Number]);
});

// ---------------------------------------------------------------- the remembered health filter (localStorage, every access wrapped)
import * as Prefs from "../scripts/prefs.mjs";
test("prefs: filter saved per browser; All removes it; storage that throws or is missing is harmless", () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const set = (/** @type {any} */ v) => Object.defineProperty(globalThis, "localStorage", { value: v, configurable: true, writable: true });
  try {
    const mem = new Map();
    set({ getItem: (/** @type {string} */ k) => mem.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => mem.set(k, v), removeItem: (/** @type {string} */ k) => mem.delete(k) });
    Prefs.saveFilter(new Set(["bad", "warn"]));
    assert.equal(mem.get(Prefs.FILTER_KEY), '["warn","bad"]');
    assert.deepEqual([...Prefs.loadFilter()], ["warn", "bad"]);
    assert.equal(Prefs.hasFilter(), true);
    Prefs.saveFilter(new Set()); assert.equal(mem.has(Prefs.FILTER_KEY), false);
    mem.set(Prefs.FILTER_KEY, "not json"); assert.equal(Prefs.loadFilter().size, 0);
    assert.equal(Prefs.clearFilter(), 1); assert.equal(Prefs.clearFilter(), 0);
    const boom = () => { throw new Error("SecurityError"); };
    set({ getItem: boom, setItem: boom, removeItem: boom });
    assert.equal(Prefs.loadFilter().size, 0); assert.doesNotThrow(() => Prefs.saveFilter(new Set(["ok"]))); assert.equal(Prefs.hasFilter(), false); assert.equal(Prefs.clearFilter(), 0);
    Object.defineProperty(globalThis, "localStorage", { get: boom, configurable: true });
    assert.equal(Prefs.loadFilter().size, 0); assert.doesNotThrow(() => Prefs.saveFilter(new Set(["ok"])));
  } finally {
    if (desc) Object.defineProperty(globalThis, "localStorage", desc); else delete (/** @type {any} */ (globalThis)).localStorage;
  }
});
