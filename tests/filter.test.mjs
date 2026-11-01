import { test } from "node:test";
import assert from "node:assert/strict";
import * as Fm from "../scripts/filter-model.mjs";
import { groupHealth } from "../scripts/health-model.mjs";

const report = () => groupHealth([
  { id: "a", title: "Alpha", state: "ran", report: [{ title: "S", lines: [{ level: "ok", text: "fine" }, { level: "warn", text: "hmm" }, { level: "info", text: "fyi" }] }] },
  { id: "b", title: "Beta", state: "ran", report: [{ title: "S", lines: [{ level: "ok", text: "fine too" }] }] },
  { id: "c", title: "Gamma", state: "ran", report: [{ title: "S", lines: [{ level: "bad", text: "broken" }] }, { title: "T", lines: [{ level: "ok", text: "t ok" }] }] },
  { id: "d", title: "Delta", state: "inactive" },
  { id: "e", title: "Eps", state: "slow" }
]);

test("filter model: normalize, toggle (multi-select), All resets, storage text", () => {
  assert.deepEqual([...Fm.normalizeFilter(["warn", "nope", 3, "bad"])], ["warn", "bad"]);
  assert.equal(Fm.normalizeFilter("warn").size, 0);
  let f = Fm.toggleFilter(new Set(), "warn"); f = Fm.toggleFilter(f, "bad");
  assert.deepEqual([...f].sort(), ["bad", "warn"]);
  assert.deepEqual([...Fm.toggleFilter(f, "warn")], ["bad"]);
  assert.equal(Fm.toggleFilter(f, "all").size, 0);
  assert.deepEqual([...Fm.toggleFilter(f, "zzz")].sort(), ["bad", "warn"]);
  assert.equal(Fm.writeFilter(new Set(["bad", "ok"])), '["ok","bad"]');
  assert.deepEqual([...Fm.readFilter('["bad","ok"]')], ["bad", "ok"]);
  for (const junk of ["", "{", "null", '{"a":1}', 42, null]) assert.equal(Fm.readFilter(junk).size, 0);
});

test("filter model: chips keep the totals; Still checking / Not active only when there is one", () => {
  const g = report();
  const chips = Fm.filterChips(g, new Set(["warn"]));
  assert.deepEqual(chips.map(c => [c.key, c.count, c.pressed, c.show]), [["all", null, false, true], ["ok", 3, false, true], ["warn", 1, true, true], ["bad", 1, false, true], ["pending", 1, false, true], ["off", 1, false, true]]);
  assert.deepEqual(chips.map(c => c.label), ["All", "3 ok", "1 warning", "1 problem", "1 still checking", "1 not active"]);
  const only = groupHealth([{ id: "a", title: "A", state: "ran", report: [{ title: "", lines: [{ level: "ok", text: "x" }] }] }]);
  assert.deepEqual(Fm.filterChips(only, new Set()).filter(c => c.show).map(c => c.key), ["all", "ok", "warn", "bad"]);
  assert.equal(Fm.filterChips(only, new Set()).find(c => c.key === "all").pressed, true);
  assert.equal(Fm.filterChips(only, new Set(["off"])).find(c => c.key === "off").show, true, "a pressed chip stays to be turned off");
});

test("filter model: only matching lines; modules without one hidden and counted", () => {
  const g = report();
  assert.equal(Fm.applyFilter(g, new Set()).groups, g.groups);
  const wb = Fm.applyFilter(g, new Set(["warn", "bad"]));
  assert.deepEqual(wb.groups.map(x => x.id), ["c", "a"]);
  assert.deepEqual(wb.groups.map(x => x.sections.flatMap(s => s.lines.map(l => l.text))), [["broken"], ["hmm"]]);
  assert.equal(wb.hidden, 3); assert.equal(wb.groups[0].counts.ok, 1, "counts unchanged");
  assert.deepEqual(Fm.applyFilter(g, new Set(["pending"])).groups.map(x => x.id), ["e"]);
  assert.deepEqual(Fm.applyFilter(g, new Set(["off"])).groups.map(x => x.id), ["d"]);
  assert.equal(Fm.lineKey("ran", "info"), null);
  assert.equal(Fm.hiddenText(1), "1 module hidden by the filter");
  assert.equal(g.groups.length, 5, "the report itself is untouched");
});

