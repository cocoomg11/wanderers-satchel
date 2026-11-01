/**
 * The registry, pure (tested in Node): reading a registration, merging built-in adapters with registrations, the card model for one
 * module, documentation links and the "Debug logging for all" plan. No Foundry calls.
 *
 * Entry: { id, title, source: "adapter" | "registered", provisional, openPanel?, health?, exportSettings?, importSettings?,
 *          debugSetting?: { namespace, key }, docs?: { url, readme, changelog, bugs }, skipSettings: [key], validators?: { key: fn },
 *          healthTimeoutMs?: number, fixes?: { actionId: fn }, notes: [text] }
 */
import { FIX_ACTION_RE } from "../vendor/wanderers-core/index.mjs";

const FN_FIELDS = ["openPanel", "health", "exportSettings"];
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const DOC_KEYS = ["url", "readme", "changelog", "bugs"];
/** A fix action id (health lines name one with `fix: "id"` or `fix: { label, action: "id" }`): core's `FIX_ACTION_RE` (0.6.0). "satchel:" ids are the Satchel's own. */
export const FIX_ID = FIX_ACTION_RE;

/**
 * Reads what a module passed to api.register(): { ok, entry, error, warnings }. Unknown fields and wrong types are dropped with a
 * warning instead of failing, so a small mistake in one field doesn't hide the module. Only a missing or bad id fails.
 */
export function normalizeRegistration(opts) {
  const warnings = [];
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return { ok: false, entry: null, error: "register() needs an object like { id: \"my-module\" }", warnings };
  const id = typeof opts.id === "string" ? opts.id.trim() : "";
  if (!id || !ID_RE.test(id)) return { ok: false, entry: null, error: `"${String(opts.id ?? "")}" isn't a module id`, warnings };
  /** @type {any} */
  const entry = { id, title: "", source: "registered", provisional: false, skipSettings: [], notes: [] };
  if (opts.title !== undefined) { if (typeof opts.title === "string" && opts.title.trim()) entry.title = opts.title.trim(); else warnings.push("title should be text"); }
  for (const k of FN_FIELDS) {
    if (opts[k] === undefined) continue;
    if (typeof opts[k] === "function") entry[k] = opts[k]; else warnings.push(`${k} should be a function`);
  }
  if (opts.importSettings !== undefined) {
    const i = opts.importSettings;
    if (i && typeof i.read === "function" && typeof i.apply === "function") entry.importSettings = { read: i.read, apply: i.apply };
    else warnings.push("importSettings should be { read(data), apply(rows) }");
  }
  if (opts.debugSetting !== undefined) {
    const d = debugRef(opts.debugSetting, id);
    if (d) entry.debugSetting = d; else warnings.push("debugSetting should be a setting key, or { namespace, key }");
  }
  if (opts.docs !== undefined) {
    if (opts.docs && typeof opts.docs === "object" && !Array.isArray(opts.docs)) {
      const docs = {};
      for (const k of DOC_KEYS) if (typeof opts.docs[k] === "string" && opts.docs[k].trim()) docs[k] = opts.docs[k].trim();
      entry.docs = docs;
    } else warnings.push("docs should be { url, readme, changelog, bugs }");
  }
  if (opts.validators !== undefined) {
    const v = opts.validators;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      /** @type {Record<string, Function>} */
      const out = {};
      for (const [k, fn] of Object.entries(v)) { if (typeof fn === "function") out[k] = fn; else warnings.push(`validators.${k} should be a function`); }
      entry.validators = out;
    } else warnings.push("validators should be { settingKey: (value) => true | reason }");
  }
  if (opts.fixes !== undefined) {
    const v = opts.fixes;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      /** @type {Record<string, Function>} */
      const out = {};
      for (const [k, fn] of Object.entries(v)) {
        if (!FIX_ID.test(k) || k.startsWith("satchel:")) warnings.push(`fixes.${k}: not a usable action id`);
        else if (typeof fn === "function") out[k] = fn; else warnings.push(`fixes.${k} should be a function`);
      }
      entry.fixes = out;
    } else warnings.push("fixes should be { actionId: (ctx) => result }");
  }
  if (opts.healthTimeoutMs !== undefined) {
    if (typeof opts.healthTimeoutMs === "number" && Number.isFinite(opts.healthTimeoutMs) && opts.healthTimeoutMs > 0) entry.healthTimeoutMs = opts.healthTimeoutMs;
    else warnings.push("healthTimeoutMs should be a number of milliseconds");
  }
  if (opts.skipSettings !== undefined) {
    if (Array.isArray(opts.skipSettings)) entry.skipSettings = opts.skipSettings.filter(k => typeof k === "string" && k);
    else warnings.push("skipSettings should be a list of setting keys");
  }
  const known = new Set(["id", "title", ...FN_FIELDS, "importSettings", "debugSetting", "docs", "skipSettings", "validators", "healthTimeoutMs", "fixes"]);
  for (const k of Object.keys(opts)) if (!known.has(k)) warnings.push(`unknown field "${k}" ignored`);
  return { ok: true, entry, error: null, warnings };
}

/** "debugLog" or { namespace, key } → { namespace, key } (a bare key is in the module's own namespace); null when unusable. */
export function debugRef(v, id) {
  if (typeof v === "string" && v.trim()) return { namespace: id, key: v.trim() };
  if (v && typeof v === "object" && typeof v.key === "string" && v.key && (v.namespace === undefined || (typeof v.namespace === "string" && v.namespace))) return { namespace: v.namespace ?? id, key: v.key };
  return null;
}

/**
 * The list the window shows. `adapters`: built-in entries; `registered`: Map or array of registered entries; `installed`: ids of
 * installed modules (active or not). An adapter shows only when its module is installed; a registration replaces the adapter for
 * the same id completely (the module knows its own tools best); a registered module always shows. Sorted by title, then id.
 */
export function mergeEntries(adapters = [], registered = [], installed = []) {
  const have = new Set(installed);
  const out = new Map();
  for (const a of adapters) if (a?.id && have.has(a.id)) out.set(a.id, { ...a, source: "adapter" });
  for (const r of registered instanceof Map ? registered.values() : registered) if (r?.id) out.set(r.id, { ...r, source: "registered" });
  return [...out.values()].sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id) || a.id.localeCompare(b.id));
}

const isAbs = s => /^https?:\/\//i.test(s);
/**
 * Documentation links for a module: { home, readme, changelog, bugs } (each a URL or null). `mod`: the module's manifest data
 * ({ id, url, readme, changelog, bugs }); `docs`: the entry's own links, which win. A relative readme or changelog is a file in the
 * module's folder, which Foundry serves at modules/<id>/<path>.
 */
export function docLinks(mod = {}, docs = {}) {
  const pick = k => docs?.[k] || mod?.[k] || null;
  const local = p => !p ? null : isAbs(p) ? p : `modules/${mod.id}/${String(p).replace(/^\.?\//, "")}`;
  const home = pick("url"); const bugs = pick("bugs");
  return { home: home && isAbs(home) ? home : null, readme: local(pick("readme")), changelog: local(pick("changelog")), bugs: bugs && isAbs(bugs) ? bugs : null };
}

/**
 * One card: what the window draws for a module. `mod`: { id, title, version, active, manifest, url, readme, changelog, bugs } or null
 * when not installed; `update`: a result from checkUpdate or null. Buttons are on only when they can do something.
 * @param {any} entry @param {any} mod @param {any} [update]
 */
export function cardModel(entry, mod, update = null) {
  const installed = !!mod;
  const active = !!mod?.active;
  const docs = docLinks(mod ?? { id: entry.id }, entry.docs);
  return {
    id: entry.id,
    title: entry.title || mod?.title || entry.id,
    version: mod?.version ?? null,
    installed, active,
    source: entry.source, provisional: !!entry.provisional,
    update,
    notes: entry.notes ?? [],
    can: {
      panel: active,
      health: active && typeof entry.health === "function",
      docs: !!(docs.readme || docs.home || docs.changelog),
      bugs: !!docs.bugs,
      export: active,
      debug: active && !!entry.debugSetting
    },
    docs
  };
}

/**
 * "Debug logging for all": which debug settings exist and what they are now. `entries`: merged entries; `defs`: Map
 * "namespace.key" → { type, scope }; `current`: "namespace.key" → value. Returns { rows: [{ id, title, namespace, key, scope, on }],
 * state: "on" | "off" | "mixed" | "none", missing: [id] } — rows only for Boolean settings that are registered.
 */
export function debugPlan(entries = [], defs = new Map(), current = {}) {
  const rows = [], missing = [];
  for (const e of entries) {
    if (!e.debugSetting) continue;
    const k = `${e.debugSetting.namespace}.${e.debugSetting.key}`;
    const d = defs.get(k);
    const t = typeof d?.type === "function" ? d.type.name : d?.type;
    if (!d || t !== "Boolean") { missing.push(e.id); continue; }
    rows.push({ id: e.id, title: e.title || e.id, namespace: e.debugSetting.namespace, key: e.debugSetting.key, scope: d.scope ?? "world", on: !!current[k] });
  }
  const on = rows.filter(r => r.on).length;
  const state = !rows.length ? "none" : on === rows.length ? "on" : on === 0 ? "off" : "mixed";
  return { rows, state, missing };
}
