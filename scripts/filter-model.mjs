/**
 * The health check filter, pure (tested in Node): the summary chips (OK, Warnings, Problems, Still checking, Not active) are
 * toggle filters, several at once; "All" clears them. While a filter is on, only matching lines show and a module with no
 * matching line is hidden. The counts on the chips stay the totals. The choice is remembered per browser (prefs.mjs keeps it in
 * localStorage through `readFilter` / `writeFilter`); everything here works on plain values.
 */
import { plural } from "./const.mjs";

/** The filter keys in chip order, with their tone and label. */
export const FILTERS = /** @type {const} */ ([
  { key: "ok", tone: "ok", one: "ok", many: "ok" },
  { key: "warn", tone: "warn", one: "warning", many: "warnings" },
  { key: "bad", tone: "bad", one: "problem", many: "problems" },
  { key: "pending", tone: "pending", one: "still checking", many: "still checking" },
  { key: "off", tone: "off", one: "not active", many: "not active" }
]);
/** @type {Set<string>} */
const KEYS = new Set(FILTERS.map(f => f.key));

/**
 * A filter from anything (a stored value, a click): a Set of known keys. Unknown keys and non-arrays give an empty Set (= All).
 * @param {unknown} v
 * @returns {Set<string>}
 */
export function normalizeFilter(v) {
  const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : [];
  return new Set(list.filter(k => typeof k === "string" && KEYS.has(k)));
}

/**
 * The filter after a chip click: "all" clears it; a key is added or removed. Returns a new Set.
 * @param {Set<string>} filter
 * @param {string} key
 */
export function toggleFilter(filter, key) {
  if (key === "all") return new Set();
  const next = normalizeFilter(filter);
  if (!KEYS.has(key)) return next;
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** The stored text of a filter (a JSON array in chip order). @param {Set<string>} filter */
export const writeFilter = filter => JSON.stringify(FILTERS.map(f => f.key).filter(k => filter.has(k)));
/** A filter from stored text; anything unreadable is All. @param {unknown} text */
export function readFilter(text) {
  if (typeof text !== "string" || !text) return new Set();
  try { return normalizeFilter(JSON.parse(text)); } catch { return new Set(); }
}

/**
 * Which filter a line belongs to: a module still being checked → "pending", a module not active → "off", otherwise the line's
 * level when it is ok / warn / bad. Info and off lines of a module that ran match no filter (they show only under All).
 * @param {string} state the group's state
 * @param {string} level the line's level
 * @returns {string | null}
 */
export function lineKey(state, level) {
  if (state === "pending" || state === "slow") return "pending";
  if (state === "inactive") return "off";
  return level === "ok" || level === "warn" || level === "bad" ? level : null;
}

/**
 * The chips for a grouped report (or one group): [{ key, tone, label, count, pressed, show }], "all" first. Counts are the
 * totals whatever the filter. Still checking and Not active show only when there is one, or while they are pressed (so they can
 * be turned off again).
 * @param {{ groups: any[] }} g
 * @param {Set<string>} filter
 */
export function filterChips(g, filter) {
  /** @type {Record<string, number>} */
  const n = { ok: 0, warn: 0, bad: 0, pending: 0, off: 0 };
  for (const x of g.groups) {
    if (x.state === "pending" || x.state === "slow") { n.pending++; continue; }
    if (x.state === "inactive") { n.off++; continue; }
    n.ok += x.counts?.ok ?? 0; n.warn += x.counts?.warn ?? 0; n.bad += x.counts?.bad ?? 0;
  }
  const chips = FILTERS.map(f => ({
    key: f.key, tone: f.tone, count: n[f.key], label: f.key === "ok" ? `${n.ok} ok` : plural(n[f.key], f.one, f.many),
    pressed: filter.has(f.key), show: f.key === "pending" || f.key === "off" ? n[f.key] > 0 || filter.has(f.key) : true
  }));
  return [{ key: "all", tone: "none", count: null, label: "All", pressed: filter.size === 0, show: true }, ...chips];
}

/**
 * The report with the filter applied: { groups, hidden, on }. Each kept group keeps only its matching lines (sections left with
 * none are dropped); a group with no matching line is left out and counted in `hidden`. The groups' own counts are unchanged.
 * An empty filter returns the groups as they are.
 * @param {{ groups: any[] }} g
 * @param {Set<string>} filter
 */
export function applyFilter(g, filter) {
  if (!filter.size) return { groups: g.groups, hidden: 0, on: false };
  const groups = []; let hidden = 0;
  for (const x of g.groups) {
    const sections = x.sections
      .map((/** @type {any} */ s) => ({ ...s, lines: s.lines.filter((/** @type {any} */ l) => filter.has(lineKey(x.state, l.level) ?? "")) }))
      .filter((/** @type {any} */ s) => s.lines.length);
    if (sections.length) groups.push({ ...x, sections, note: "" }); else hidden++;
  }
  return { groups, hidden, on: true };
}

/** "2 modules hidden by the filter". @param {number} n */
export const hiddenText = n => `${plural(n, "module")} hidden by the filter`;
