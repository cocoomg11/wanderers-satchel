/**
 * The hub window, pure (tested in Node): the page router, keyboard moves in the sidebar, and the view models each page draws
 * (sidebar, overview, module page, import preview). No Foundry calls; hub.mjs gathers the live data and hub-view.mjs turns these
 * models into HTML.
 *
 * Pages: "overview", "module:<id>", "health", "transfer", "maintenance".
 */
import { groupHealth } from "./health-model.mjs";

export const TOOL_PAGES = ["health", "transfer", "maintenance"];
/** Which feature switch a tool page needs (a page whose feature is off falls back to the overview). */
const NEEDS = /** @type {Record<string, string>} */ ({ health: "combinedHealth", transfer: "sharedSettings" });

/**
 * "module:red-book" → { kind: "module", id: "red-book" }; "health" → { kind: "health" }; anything else → { kind: "overview" }.
 * @param {unknown} page
 * @returns {{ kind: string, id?: string }}
 */
export function parsePage(page) {
  const p = typeof page === "string" ? page.trim() : "";
  if (p.startsWith("module:") && p.length > 7) return { kind: "module", id: p.slice(7) };
  if (TOOL_PAGES.includes(p)) return { kind: p };
  return { kind: "overview" };
}

/**
 * A page that can be shown now: a module page only for an id in `ids`, a tool page only when its feature is on; otherwise the
 * overview.
 * @param {unknown} page
 * @param {{ ids?: string[], features?: Record<string, boolean> }} [ctx]
 */
export function resolvePage(page, { ids = [], features = {} } = {}) {
  const p = parsePage(page);
  if (p.kind === "module") return p.id && ids.includes(p.id) ? `module:${p.id}` : "overview";
  if (p.kind === "overview") return "overview";
  const need = NEEDS[p.kind];
  return need && features[need] === false ? "overview" : p.kind;
}

/**
 * The router: { page, previous, go(page) → changed, refresh() → changed }. `ctx()` gives the current ids and features each time,
 * so a module that goes away (unregistered) or a feature turned off sends the window back to the overview.
 * @param {() => { ids?: string[], features?: Record<string, boolean> }} ctx
 * @param {string} [initial]
 */
export function createRouter(ctx, initial = "overview") {
  const r = {
    page: resolvePage(initial, ctx()),
    /** @type {string | null} */
    previous: null,
    /** @param {string} page */
    go(page) {
      const next = resolvePage(page, ctx());
      if (next === r.page) return false;
      r.previous = r.page; r.page = next; return true;
    },
    refresh() { return r.go(r.page); }
  };
  return r;
}

/** The pages in sidebar order (for the arrow keys). @param {{ modules: { page: string }[], tools: { page: string }[] }} nav */
export const navOrder = nav => ["overview", ...nav.modules.map(m => m.page), ...nav.tools.map(t => t.page)];

/**
 * Where a key press moves the sidebar focus: ArrowDown / ArrowUp (wrapping), Home, End. null for other keys.
 * @param {string[]} order
 * @param {string} current
 * @param {string} key
 */
export function moveFocus(order, current, key) {
  if (!order.length) return null;
  const i = Math.max(0, order.indexOf(current));
  switch (key) {
    case "ArrowDown": return order[(i + 1) % order.length];
    case "ArrowUp": return order[(i - 1 + order.length) % order.length];
    case "Home": return order[0];
    case "End": return order[order.length - 1];
    default: return null;
  }
}

/** Status levels → Font Awesome icon and a word for screen readers. */
export const LEVELS = /** @type {Record<string, { icon: string, word: string }>} */ ({
  ok: { icon: "fa-solid fa-circle-check", word: "OK" },
  warn: { icon: "fa-solid fa-triangle-exclamation", word: "Warning" },
  bad: { icon: "fa-solid fa-circle-xmark", word: "Problem" },
  info: { icon: "fa-solid fa-circle-info", word: "Info" },
  off: { icon: "fa-solid fa-circle-minus", word: "Off" },
  pending: { icon: "fa-solid fa-spinner fa-spin", word: "Checking" }
});
/** @param {string} level */
export const levelOf = level => LEVELS[level] ? level : "info";

/** "just now", "4 min ago", "2 h ago". @param {number | null | undefined} at @param {number} now */
export function timeAgo(at, now) {
  if (typeof at !== "number") return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

const plural = (/** @type {number} */ n, /** @type {string} */ one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Per module, the last health result of this page load: Map id → { state, worst, counts, group, at, ms, running }. `latest`: Map
 * id → { result, at } (health.mjs keeps it from every run). A result still running has `running: true`.
 * @param {Map<string, { result: any, at: number }>} latest
 */
export function healthIndex(latest) {
  const out = new Map();
  for (const [id, { result, at }] of latest) {
    const g = groupHealth([result]).groups[0];
    const running = result.state === "pending" || result.state === "slow";
    out.set(id, { state: result.state, worst: g.worst, counts: g.counts, group: g, at, ms: result.ms ?? null, running });
  }
  return out;
}

/**
 * A module's status dot: "off" (hollow) when not active, "pending" while its check runs, the worst level of its last check, or
 * "none" when it hasn't been checked in this page load.
 * @param {{ active: boolean }} mod @param {any} h a healthIndex value
 */
export function dotOf(mod, h) {
  if (!mod.active) return "off";
  if (!h) return "none";
  if (h.running) return "pending";
  return h.worst === "off" ? "none" : h.worst;
}

/**
 * How an update result shows: { level, icon, text, title, banner }. `banner` only for "update"; "ahead", "couldn't check" and the
 * rest are one muted line.
 * @param {any} u a checkUpdate result, or null while checking
 * @param {{ enabled?: boolean, installed?: boolean }} [opts]
 */
export function updateView(u, { enabled = true, installed = true } = {}) {
  if (!installed) return { level: "off", icon: "fa-solid fa-circle-minus", text: "Not installed", title: "", banner: false };
  if (!enabled) return { level: "off", icon: "fa-solid fa-power-off", text: "Update check off", title: "", banner: false };
  if (!u) return { level: "pending", icon: "fa-solid fa-spinner fa-spin", text: "Checking…", title: "", banner: false };
  switch (u.status) {
    case "update": return { level: "warn", icon: "fa-solid fa-arrow-up-from-bracket", text: `${u.latest} available`, title: `Installed ${u.installed ?? "?"}`, banner: true };
    case "current": return { level: "ok", icon: "fa-solid fa-circle-check", text: "Up to date", title: "", banner: false };
    case "ahead": return { level: "info", icon: "fa-solid fa-circle-info", text: `Newer than the latest release (${u.latest})`, title: "", banner: false };
    case "error": return { level: "off", icon: "fa-solid fa-clock", text: "Couldn't check", title: String(u.error ?? ""), banner: false };
    default: return { level: "off", icon: "fa-solid fa-circle-question", text: "Can't check", title: String(u.error ?? ""), banner: false };
  }
}

/**
 * The health badge for one module: { level, text }.
 * @param {{ active: boolean, installed?: boolean }} mod @param {any} h
 */
export function healthBadge(mod, h) {
  if (mod.installed === false) return { level: "bad", text: "Not installed" };
  if (!mod.active) return { level: "off", text: "Not active" };
  if (!h) return { level: "off", text: "Not checked" };
  if (h.running) return { level: "pending", text: h.state === "slow" ? "Still checking…" : "Checking…" };
  if (h.state === "failed") return { level: "bad", text: "Check failed" };
  if (h.state === "timeout") return { level: "warn", text: "No answer yet" };
  if (h.state === "none") return { level: "off", text: "No check" };
  const c = h.counts;
  if (c.bad) return { level: "bad", text: plural(c.bad, "problem") };
  if (c.warn) return { level: "warn", text: plural(c.warn, "warning") };
  return { level: "ok", text: `${c.ok} ok` };
}

/**
 * The sidebar: { modules: [{ id, page, title, dot, issues, active }], tools: [{ page, label, icon }], version, current }.
 * `items`: [{ id, title, active }].
 * @param {{ items: any[], health: Map<string, any>, features: Record<string, boolean>, version: string, page: string }} d
 */
export function navModel({ items, health, features, version, page }) {
  const modules = items.map(m => {
    const h = health.get(m.id);
    const issues = m.active && h && !h.running ? (h.counts.warn + h.counts.bad) + (h.state === "failed" || h.state === "timeout" ? 1 : 0) : 0;
    return { id: m.id, page: `module:${m.id}`, title: m.title, dot: dotOf(m, h), issues, issueLevel: h?.counts?.bad || h?.state === "failed" ? "bad" : "warn", active: !!m.active };
  });
  const tools = [
    features.combinedHealth !== false ? { page: "health", label: "Health check", icon: "fa-solid fa-stethoscope" } : null,
    features.sharedSettings !== false ? { page: "transfer", label: "Settings transfer", icon: "fa-solid fa-right-left" } : null,
    { page: "maintenance", label: "Maintenance", icon: "fa-solid fa-broom" }
  ].filter(x => !!x);
  return { modules, tools: /** @type {{ page: string, label: string, icon: string }[]} */ (tools), version, current: page };
}

/**
 * The overview: { stats: { active, total, updates, health }, rows, tools }.
 * @param {{ items: any[], updates: Map<string, any>, health: Map<string, any>, features: Record<string, boolean>, debug: any, now: number }} d
 */
export function overviewModel({ items, updates, health, features, debug, now }) {
  const active = items.filter(m => m.active).length;
  const upd = features.updateCheck === false ? null : items.filter(m => m.installed !== false).map(m => updates.get(m.id) ?? null);
  const avail = upd ? upd.filter(u => u?.status === "update").length : 0;
  const waiting = upd ? upd.filter(u => !u).length : 0;
  const updStat = !upd ? { level: "off", text: "Check off", hint: "" }
    : avail ? { level: "warn", text: `${avail} available`, hint: waiting ? `${waiting} still checking` : "" }
      : waiting ? { level: "pending", text: "Checking…", hint: "" }
        : { level: "ok", text: "All up to date", hint: upd.some(u => u?.status === "error") ? "some couldn't be checked" : "" };
  const checked = items.filter(m => m.active && health.has(m.id)).map(m => health.get(m.id));
  let hStat;
  if (features.combinedHealth === false) hStat = { level: "off", text: "Check off", hint: "" };
  else if (!checked.length) hStat = { level: "off", text: "Not run yet", hint: "since the page loaded" };
  else if (checked.some(h => h.running)) hStat = { level: "pending", text: "Checking…", hint: "" };
  else {
    const warn = checked.reduce((t, h) => t + h.counts.warn + (h.state === "timeout" ? 1 : 0), 0);
    const bad = checked.reduce((t, h) => t + h.counts.bad + (h.state === "failed" ? 1 : 0), 0);
    const at = Math.max(...checked.map(h => h.at));
    hStat = { level: bad ? "bad" : warn ? "warn" : "ok", text: bad ? plural(bad, "problem") : warn ? plural(warn, "warning") : "All OK", hint: `${timeAgo(at, now)} · ${plural(bad, "problem")}` };
  }
  const rows = items.map(m => {
    const h = health.get(m.id);
    return { id: m.id, page: `module:${m.id}`, title: m.title, version: m.version ?? "", active: !!m.active, dot: dotOf(m, h), update: updateView(updates.get(m.id) ?? null, { enabled: features.updateCheck !== false, installed: m.installed !== false }), health: features.combinedHealth === false ? null : healthBadge(m, h) };
  });
  const tools = {
    transfer: features.sharedSettings !== false,
    debug: features.debugAll !== false && debug?.rows?.length ? { state: debug.state, count: debug.rows.length } : null,
    maintenance: true
  };
  return { stats: { active, total: items.length, updates: updStat, health: hStat }, rows, tools };
}

/**
 * One module's page. `item`: { id, title, version, active, installed, source, provisional, docs, can }; `entry`: the merged entry.
 * @param {{ item: any, entry: any, update: any, health: any, features: Record<string, boolean>, debug: any, extras: { i: number, label: string, icon: string }[], now: number }} d
 */
export function moduleModel({ item, entry, update, health, features, debug, extras, now }) {
  const badges = [
    !item.installed ? { level: "bad", text: "Not installed" } : item.active ? { level: "ok", text: "Active" } : { level: "off", text: "Not active" },
    item.source === "registered" ? { level: "info", text: "Registered", title: "This module registered itself with the Satchel." } : { level: "off", text: item.provisional ? "Built-in adapter, provisional" : "Built-in adapter", title: "Built-in adapter: uses what the module exposes today." }
  ];
  const u = updateView(update, { enabled: features.updateCheck !== false, installed: item.installed });
  const row = debug?.rows?.find((/** @type {any} */ r) => r.id === item.id) ?? null;
  const dbg = features.debugAll === false || !item.active ? null
    : row ? { available: true, on: !!row.on, text: row.on ? "on" : "off" }
      : { available: false, on: false, text: debug?.missing?.includes(item.id) ? "this version has no debug logging setting" : "none" };
  const transfer = features.sharedSettings === false || !item.active ? null
    : { text: typeof entry?.exportSettings === "function" ? "the module's own export" : "read by the Satchel", importText: entry?.importSettings ? "checked by the module's own import when it has one" : "checked by the Satchel" };
  const healthModel = features.combinedHealth === false ? null : {
    available: item.active,
    hint: health ? [health.running ? "running" : timeAgo(health.at, now), typeof health.ms === "number" && !health.running ? `${(health.ms / 1000).toFixed(1)} s` : ""].filter(Boolean).join(" · ") : "",
    group: health?.group ?? null
  };
  return {
    id: item.id, title: item.title, version: item.version ?? "", active: item.active, installed: item.installed,
    badges, update: u, debug: dbg, transfer, health: healthModel, notes: entry?.notes ?? [],
    links: [
      item.can.docs ? { act: "docs", label: "Docs", icon: "fa-solid fa-book" } : null,
      item.docs.changelog ? { act: "changelog", label: "Changelog", icon: "fa-solid fa-list" } : null,
      item.can.bugs ? { act: "bugs", label: "Report issue", icon: "fa-solid fa-bug" } : null
    ].filter(Boolean),
    extras: item.active ? extras : [],
    canPanel: !!item.can.panel
  };
}

/** Tick key for row j of module i. */
export const tickKey = (/** @type {number} */ i, /** @type {number} */ j) => `${i}:${j}`;
/** The ticks an import preview starts with: every changed row of a readable module. @param {any} result */
export function initialTicks(result) {
  const out = new Set();
  (result?.modules ?? []).forEach((/** @type {any} */ m, /** @type {number} */ i) => { if (m.ok) m.rows.forEach((/** @type {any} */ r, /** @type {number} */ j) => { if (r.changed) out.add(tickKey(i, j)); }); });
  return out;
}

/**
 * The import preview: { facts, modules, ticked, reload, button }. `result`: from settings-io readText; `ticks`: Set of tickKey.
 * @param {any} result @param {Set<string>} ticks
 */
export function importModel(result, ticks) {
  let changed = 0, refused = 0, skippedMods = 0, records = 0, ticked = 0, reload = 0;
  const modules = (result?.modules ?? []).map((/** @type {any} */ m, /** @type {number} */ i) => {
    const issues = [];
    if (!m.ok) { skippedMods++; issues.push({ level: "warn", text: `Not imported: ${m.error}.`, keys: [] }); }
    if (m.unknown?.length) issues.push({ level: "info", text: "Not in this version, ignored:", keys: m.unknown });
    if (m.skipped?.length) issues.push({ level: "off", text: "Records never imported:", keys: m.skipped });
    refused += m.invalid?.length ?? 0; records += m.skipped?.length ?? 0;
    const rows = (m.ok ? m.rows : []).map((/** @type {any} */ r, /** @type {number} */ j) => {
      const on = ticks.has(tickKey(i, j)); if (r.changed) changed++;
      if (on) { ticked++; if (r.reload) reload++; }
      return { i, j, key: r.key, label: r.label || r.key, note: r.note || "", from: r.from, to: r.to, changed: !!r.changed, ticked: on, refused: null };
    });
    // Refused values show as red rows that can't be ticked (the reason in place of the value).
    for (const x of m.ok ? m.invalid ?? [] : []) rows.push({ i, j: -1, key: x.key, label: x.key, note: "", from: undefined, to: undefined, changed: false, ticked: false, refused: x.reason });
    const nTicked = rows.filter((/** @type {any} */ r) => r.ticked).length;
    const nRows = rows.filter((/** @type {any} */ r) => !r.refused).length;
    const badges = !m.ok ? [{ level: "warn", text: "Skipped" }]
      : [{ level: "info", text: `${nTicked} of ${nRows} ticked` }, ...(m.invalid?.length ? [{ level: "bad", text: `${m.invalid.length} refused` }] : [])];
    return { i, id: m.id, title: m.title || m.id, version: m.version || "", how: m.how, ok: !!m.ok, badges, issues, rows };
  });
  const facts = [
    { level: "info", text: `${plural(changed, "setting")} would change` },
    refused ? { level: "bad", text: `${plural(refused, "value")} refused` } : null,
    skippedMods ? { level: "warn", text: `${plural(skippedMods, "module")} skipped` } : null,
    records ? { level: "off", text: `${plural(records, "record")} never imported` } : null
  ].filter(Boolean);
  const hint = [`${ticked} ticked`, reload ? `${reload} need${reload === 1 ? "s" : ""} a reload (Foundry will ask)` : ""].filter(Boolean).join(" · ");
  return { facts, modules, ticked, reload, hint, button: ticked ? `Import ${plural(ticked, "setting")}` : "Import" };
}
