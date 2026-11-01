/**
 * The combined health check, pure (tested in Node): turning whatever each module's check returns into one shape, and grouping the
 * results under a summary. Lines are { level: "ok" | "warn" | "bad" | "off" | "info", text } where text is plain text.
 */

export const LEVELS = ["ok", "warn", "bad", "off", "info"];
const LEVEL_ALIAS = { error: "bad", fail: "bad", failed: "bad", warning: "warn", good: "ok", pass: "ok", disabled: "off", note: "info" };
const level = l => { const s = String(l ?? "").toLowerCase(); return LEVELS.includes(s) ? s : LEVEL_ALIAS[s] ?? "info"; };
/** Plain text from a bit of HTML (module checks often return HTML lines). */
export const plain = s => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const line = l => typeof l === "string" ? { level: "info", text: plain(l) } : { level: level(l?.level ?? l?.status), text: plain(l?.text ?? l?.message ?? l?.label ?? "") };

/**
 * Whatever a module's health() returned → [{ title, lines }]. Understood: an array of sections ({ title, lines }), one section, a
 * plain array of lines, { sections }, or { lines }. Anything else gives one "info" line saying the result couldn't be read.
 */
export function normalizeReport(r) {
  if (r === undefined || r === null) return [{ title: "", lines: [{ level: "warn", text: "The check returned nothing." }] }];
  const sec = s => ({ title: plain(s?.title ?? s?.name ?? ""), lines: (Array.isArray(s?.lines) ? s.lines : []).map(line).filter(l => l.text) });
  if (Array.isArray(r)) {
    if (r.every(x => x && typeof x === "object" && Array.isArray(x.lines))) return r.map(sec);
    return [{ title: "", lines: r.map(line).filter(l => l.text) }];
  }
  if (typeof r === "object") {
    if (Array.isArray(r.sections)) return normalizeReport(r.sections);
    if (Array.isArray(r.lines)) return [sec(r)];
  }
  return [{ title: "", lines: [{ level: "info", text: "The check ran, but its result isn't in a form Wanderer's Satchel can read." }] }];
}

const count = sections => {
  const c = { ok: 0, warn: 0, bad: 0, off: 0, info: 0 };
  for (const s of sections) for (const l of s.lines) c[l.level] = (c[l.level] ?? 0) + 1;
  return c;
};

/**
 * Groups results under a summary. `results`: [{ id, title, state: "ran" | "failed" | "none" | "inactive", report?, error?, note? }].
 * Returns { summary: { modules, ran, failed, none, inactive, ok, warn, bad, worst }, groups: [{ id, title, state, sections, counts,
 * worst, note }] }. Groups with problems come first (bad, then warn), then the rest in the order given.
 */
export function groupHealth(results = []) {
  const groups = results.map((r, i) => {
    let sections = [];
    if (r.state === "ran") sections = normalizeReport(r.report);
    else if (r.state === "failed") sections = [{ title: "", lines: [{ level: "bad", text: `The check failed: ${plain(r.error ?? "unknown error")}` }] }];
    else if (r.state === "inactive") sections = [{ title: "", lines: [{ level: "off", text: "Installed but not active in this world." }] }];
    else sections = [{ title: "", lines: [{ level: "info", text: "This module has no health check Wanderer's Satchel can run." }] }];
    const counts = count(sections);
    const worst = counts.bad ? "bad" : counts.warn ? "warn" : counts.ok ? "ok" : r.state === "inactive" ? "off" : "info";
    return { id: r.id, title: r.title || r.id, state: r.state, sections, counts, worst, note: r.note ?? "", order: i };
  });
  const rank = { bad: 0, warn: 1 };
  groups.sort((a, b) => (rank[a.worst] ?? 2) - (rank[b.worst] ?? 2) || a.order - b.order);
  const total = count(groups.flatMap(g => g.sections));
  const by = s => groups.filter(g => g.state === s).length;
  const summary = { modules: groups.length, ran: by("ran"), failed: by("failed"), none: by("none"), inactive: by("inactive"), ...total, worst: total.bad || by("failed") ? "bad" : total.warn ? "warn" : "ok" };
  for (const g of groups) delete g.order;
  return { summary, groups };
}

/** The summary as one plain sentence. */
export function summaryText(s) {
  const parts = [`${s.modules} module${s.modules === 1 ? "" : "s"}`, `${s.ok} ✓`, `${s.warn} ⚠`, `${s.bad} ✗`];
  const extra = [s.failed ? `${s.failed} check${s.failed === 1 ? "" : "s"} failed` : "", s.none ? `${s.none} without a check` : "", s.inactive ? `${s.inactive} not active` : ""].filter(Boolean);
  return parts.join(" · ") + (extra.length ? ` (${extra.join(", ")})` : "");
}
