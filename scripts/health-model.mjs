/**
 * The combined health check, pure (tested in Node): turning whatever each module's check returns into core's report shape
 * ([{ title, lines: [{ level, text }] }], text plain), the time limits, the runner that keeps every module independent, and the
 * grouping under a summary.
 *
 * Time limits (why): a module's first check after a page load can be slow (it may load compendium indexes or documents), so
 * the first run gets a long limit and later runs a limit based on how long that module took last time. Every module runs on its
 * own: one slow or hung check never holds the others up or fails them. A check past SLOW_MS shows "Still checking…"; one past
 * its limit shows "No answer yet" (a warning, not a failure), and if it answers later the answer replaces that line.
 */
import { LEVELS, level, plain, readFix } from "../vendor/wanderers-core/index.mjs";

export { LEVELS, plain };

/** "Still checking…" after this long. */
export const SLOW_MS = 8000;
/** The first check of a module after a page load. */
export const FIRST_RUN_MS = 90000;
/** Later checks: at least this, or three times the module's last time, whichever is longer. */
export const BASE_MS = 30000;
/** Never wait longer than this for one module (also caps a module's own `healthTimeoutMs`). */
export const MAX_MS = 300000;
/** Shortest limit a module may ask for. */
export const MIN_MS = 5000;

/**
 * The limit handed to a module's own check (`health({ timeoutMs })`): the Satchel's limit for it less a small margin, so the
 * module's own "took too long" line (which names the slow part) arrives before the Satchel gives up on the whole module.
 * @param {number} limitMs
 * @returns {number}
 */
export function moduleBudget(limitMs) {
  const v = typeof limitMs === "number" && Number.isFinite(limitMs) ? limitMs : FIRST_RUN_MS;
  return Math.max(1000, Math.round(v - Math.min(2000, v * 0.1)));
}

/**
 * The time limit for one module's check.
 * @param {{ first?: boolean, lastMs?: number | null, own?: number | null }} [o] first: no check of this module has answered since
 *   the page loaded; lastMs: how long its last answer took; own: the module's own limit (registration `healthTimeoutMs`).
 * @returns {number}
 */
export function healthTimeout({ first = true, lastMs = null, own = null } = {}) {
  const clamp = (/** @type {number} */ v) => Math.min(MAX_MS, Math.max(MIN_MS, v));
  if (typeof own === "number" && Number.isFinite(own) && own > 0) return clamp(first ? Math.max(own, FIRST_RUN_MS) : own);
  if (first || !(typeof lastMs === "number" && Number.isFinite(lastMs))) return FIRST_RUN_MS;
  return clamp(Math.max(BASE_MS, lastMs * 3));
}

/**
 * A line's fix action, or null: core's `readFix` (0.6.0; the same rules the Satchel had since 0.5.0, now shared). Understood: a
 * function (label "Fix"); { label?, run, confirm? } (run a function); { label?, action, confirm? } or a plain action id (looked up
 * in the registration's `fixes` when pressed). Labels (60) and confirm texts (500) are plain text. Never throws.
 */
export { readFix };

/** @param {any} l */
const line = l => {
  if (typeof l === "string") return { level: "info", text: plain(l) };
  const fix = readFix(l?.fix);
  return { level: level(l?.level ?? l?.status), text: plain(l?.text ?? l?.message ?? l?.label ?? ""), ...(fix ? { fix } : {}) };
};

/**
 * Whatever a module's health() returned → [{ title, lines }]. Understood: an array of sections ({ title, lines }), one section, a
 * plain array of lines, { sections }, { lines } or { report } (core's collector output wrapped). Anything else gives one "info"
 * line saying the result couldn't be read.
 * @param {any} r
 * @returns {{ title: string, lines: { level: string, text: string }[] }[]}
 */
export function normalizeReport(r) {
  if (r === undefined || r === null) return [{ title: "", lines: [{ level: "warn", text: "The check returned nothing." }] }];
  const sec = (/** @type {any} */ s) => ({ title: plain(s?.title ?? s?.name ?? ""), lines: (Array.isArray(s?.lines) ? s.lines : []).map(line).filter(l => l.text) });
  /** @type {{ title: string, lines: any[] }[]} */
  let out = [{ title: "", lines: [{ level: "info", text: "The check ran, but its result isn't in a form Wanderer's Satchel can read." }] }];
  if (Array.isArray(r)) {
    if (r.every(x => x && typeof x === "object" && Array.isArray(x.lines))) out = r.map(sec);
    else out = [{ title: "", lines: r.map(line).filter(l => l.text) }];
  } else if (typeof r === "object") {
    if (Array.isArray(r.sections)) return normalizeReport(r.sections);
    if (Array.isArray(r.report)) return normalizeReport(r.report);
    if (Array.isArray(r.lines)) out = [sec(r)];
  }
  return keyFixes(out);
}

/**
 * Gives every line with a fix a key ("section:line", from its place in the full report), so a Fix button still finds its line
 * when the filter hides others. Returns the same sections.
 * @param {{ title: string, lines: any[] }[]} sections
 */
export function keyFixes(sections) {
  sections.forEach((s, i) => s.lines.forEach((l, j) => { if (l.fix) l.fix.key = `${i}:${j}`; }));
  return sections;
}

/**
 * The fix of one line in a module's last result (null when gone): `group` is a groupHealth group, `key` the line's fix key.
 * @param {any} group @param {string} key
 */
export function findFix(group, key) {
  for (const s of group?.sections ?? []) for (const l of s.lines ?? []) if (l.fix?.key === key) return { line: l, fix: l.fix };
  return null;
}

/** @param {{ lines: { level: string }[] }[]} sections */
const count = sections => {
  /** @type {Record<string, number>} */
  const c = { ok: 0, warn: 0, bad: 0, off: 0, info: 0 };
  for (const s of sections) for (const l of s.lines) c[l.level] = (c[l.level] ?? 0) + 1;
  return c;
};

const secs = (/** @type {number} */ ms) => `${Math.round(ms / 1000)} s`;

/**
 * Runs every module's check at once, each with its own limits. `runOne(entry, { limitMs })` returns a result
 * ({ state: "ran" | "failed" | "none" | "inactive", report?, error?, note? }); a throw becomes "failed". Returns
 * { results, done, settled }: `results` is a live list (one per entry, in order) whose items change as checks answer; `done`
 * resolves when every check has answered or passed its limit; `settled` when every check has answered (late ones included).
 * `onChange(i, result)` is called on every change. Results carry `ms` (how long the answer took) and `late` (answered after
 * its limit).
 * @param {{ id: string, title?: string }[]} list
 * @param {(entry: any, ctx: { limitMs: number }) => any} runOne
 * @param {{ timeoutFor?: (entry: any) => number, slowMs?: number, onChange?: (i: number, r: any) => void, now?: () => number }} [opts]
 */
export function runChecks(list, runOne, { timeoutFor = () => FIRST_RUN_MS, slowMs = SLOW_MS, onChange = () => { }, now = () => Date.now() } = {}) {
  /** @type {any[]} */
  const results = list.map(e => ({ id: e.id, title: e.title || e.id, state: "pending" }));
  const notify = (/** @type {number} */ i) => { try { onChange(i, results[i]); } catch { } };
  let resolveDone = () => { };
  /** @type {Promise<any[]>} */
  const done = new Promise(r => { resolveDone = () => r(results); });
  let open = list.length;
  const finish = () => { if (--open === 0) resolveDone(); };
  if (!open) resolveDone();
  const settled = Promise.all(list.map((e, i) => {
    const start = now(); const limit = timeoutFor(e);
    let counted = false; const once = () => { if (!counted) { counted = true; finish(); } };
    const slow = setTimeout(() => { if (results[i].state === "pending") { results[i] = { ...results[i], state: "slow", ms: now() - start }; notify(i); } }, Math.min(slowMs, limit));
    const hard = setTimeout(() => {
      if (results[i].state === "pending" || results[i].state === "slow") { results[i] = { ...results[i], state: "timeout", limitMs: limit, ms: now() - start }; notify(i); }
      once();
    }, limit);
    return Promise.resolve().then(() => runOne(e, { limitMs: limit })).catch(err => ({ state: "failed", error: String(err?.message ?? err) })).then(r => {
      clearTimeout(slow); clearTimeout(hard);
      const late = results[i].state === "timeout";
      results[i] = { id: e.id, title: e.title || e.id, ...(r && typeof r === "object" ? r : { state: "failed", error: "the check gave no result" }), ms: now() - start, ...(late ? { late: true } : {}) };
      notify(i); once();
      return results[i];
    });
  }));
  return { results, done, settled };
}

/**
 * Groups results under a summary. `results`: [{ id, title, state: "ran" | "failed" | "none" | "inactive" | "pending" | "slow" |
 * "timeout", report?, error?, note?, limitMs?, late? }]. Returns { summary: { modules, ran, failed, none, inactive, waiting, ok,
 * warn, bad, worst }, groups: [{ id, title, state, sections, counts, worst, note }] }. Groups with problems come first (bad,
 * then warn), then the rest in the order given. `waiting` counts checks still running or past their limit.
 * @param {any[]} [results]
 */
export function groupHealth(results = []) {
  const groups = results.map((r, i) => {
    /** @type {{ title: string, lines: { level: string, text: string }[] }[]} */
    let sections = [];
    const one = (/** @type {string} */ lv, /** @type {string} */ text) => [{ title: "", lines: [{ level: lv, text }] }];
    if (r.state === "ran") sections = normalizeReport(r.report);
    else if (r.state === "failed") sections = one("bad", `The check failed: ${plain(r.error ?? "unknown error")}`);
    else if (r.state === "inactive") sections = one("off", "Installed but not active in this world.");
    else if (r.state === "pending") sections = one("info", "Checking…");
    else if (r.state === "slow") sections = one("info", "Still checking… (the first check after loading can take a while)");
    else if (r.state === "timeout") sections = one("warn", `No answer yet after ${secs(r.limitMs ?? 0)}. It may still finish: the result shows here if it does, or press Check again.`);
    else sections = one("info", "This module has no health check Wanderer's Satchel can run.");
    const counts = count(sections);
    const worst = counts.bad ? "bad" : counts.warn ? "warn" : counts.ok ? "ok" : r.state === "inactive" ? "off" : "info";
    const note = [r.note ?? "", r.late ? `Answered after its time limit (${secs(r.ms ?? 0)}).` : ""].filter(Boolean).join(" ");
    return { id: r.id, title: r.title || r.id, state: r.state, sections, counts, worst, note, order: i };
  });
  /** @type {Record<string, number>} */
  const rank = { bad: 0, warn: 1 };
  groups.sort((a, b) => (rank[a.worst] ?? 2) - (rank[b.worst] ?? 2) || a.order - b.order);
  const total = count(groups.flatMap(g => g.sections));
  const by = (/** @type {string[]} */ ...s) => groups.filter(g => s.includes(g.state)).length;
  const summary = { modules: groups.length, ran: by("ran"), failed: by("failed"), none: by("none"), inactive: by("inactive"), waiting: by("pending", "slow", "timeout"), ...total, worst: total.bad || by("failed") ? "bad" : total.warn ? "warn" : "ok" };
  return { summary, groups: groups.map(({ order, ...g }) => g) };
}

/**
 * The summary as one plain sentence.
 * @param {any} s
 */
export function summaryText(s) {
  const parts = [`${s.modules} module${s.modules === 1 ? "" : "s"}`, `${s.ok} ✓`, `${s.warn} ⚠`, `${s.bad} ✗`];
  const extra = [s.waiting ? `${s.waiting} still checking` : "", s.failed ? `${s.failed} check${s.failed === 1 ? "" : "s"} failed` : "", s.none ? `${s.none} without a check` : "", s.inactive ? `${s.inactive} not active` : ""].filter(Boolean);
  return parts.join(" · ") + (extra.length ? ` (${extra.join(", ")})` : "");
}
