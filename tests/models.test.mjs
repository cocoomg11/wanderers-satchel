import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "../scripts/version-model.mjs";
import * as R from "../scripts/registry-model.mjs";
import * as H from "../scripts/health-model.mjs";
import * as S from "../scripts/settings-model.mjs";

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
  assert.deepEqual(e, { module: "m", format: 1, version: "1.0", world: { z: { a: 1 } }, client: { a: true, u: "x" } });
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
