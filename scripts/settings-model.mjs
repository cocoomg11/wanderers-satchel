/**
 * One-file settings export / import for every module in the Satchel, pure (tested in Node).
 *
 * Bundle file:
 *   { module: "wanderers-satchel", format: 1, version, exported,
 *     modules: { "<id>": { title, version, via: "module" | "settings", data } } }
 * via "module": `data` came from the module's own exportSettings() and goes back through its own importSettings.read/apply.
 * via "settings": `data` is { module: id, format: 1, version, world: { key: value }, client: { key: value } } (the same shape the
 * Wayfarer's Toolkit settings file uses), read here against the registered settings of that namespace.
 * Record-type settings (histories, caches, "last version seen") are on a per-module skip list and never exported or imported.
 */
import { ID } from "./const.mjs";

export const FORMAT = 1;
export const MODULE_FORMAT = 1;

/** Our own settings that are bookkeeping, never moved between worlds. */
export const OWN_SKIP = [];

const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));

/**
 * One namespace's settings → its export object. `defs`: [{ key, scope, value }]; `skip`: keys left out. Client- and user-scope
 * settings go under "client" (they belong to this browser or this user, not the world).
 */
export function buildModuleExport(id, defs, { version = "", skip = [] } = {}) {
  const out = { module: id, format: MODULE_FORMAT, version: String(version ?? ""), world: {}, client: {} };
  const no = new Set(skip);
  for (const d of [...(defs ?? [])].sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
    if (!d?.key || no.has(d.key)) continue;
    out[d.scope === "world" ? "world" : "client"][d.key] = clone(d.value);
  }
  return out;
}

/** The whole bundle. `parts`: [{ id, title, version, via, data }]. */
export function buildBundle(parts, { version = "", exported = "" } = {}) {
  const modules = {};
  for (const p of parts ?? []) if (p?.id && p.data !== undefined) modules[p.id] = { title: String(p.title ?? p.id), version: String(p.version ?? ""), via: p.via === "module" ? "module" : "settings", data: clone(p.data) };
  return { module: ID, format: FORMAT, version: String(version), exported: String(exported), modules };
}

/** Reads a bundle's text (or object): { ok, error, version, exported, modules: [{ id, title, version, via, data }] }. */
export function readBundle(text) {
  const fail = error => ({ ok: false, error, version: "", exported: "", modules: [] });
  let data = text;
  if (typeof text === "string") { try { data = JSON.parse(text); } catch (e) { return fail(`the file isn't valid JSON (${String(e?.message ?? e)})`); } }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("the file isn't a settings export");
  if (data.module !== ID) return fail(data.module ? `the file is for "${data.module}"; open it from that module's own import instead` : "the file isn't a Wanderer's Satchel settings export");
  if (data.format !== FORMAT) return fail(`unknown file format ${JSON.stringify(data.format ?? null)} (this version reads format ${FORMAT})`);
  if (!data.modules || typeof data.modules !== "object" || Array.isArray(data.modules)) return fail("the file has no modules section");
  const modules = [];
  for (const [id, m] of Object.entries(data.modules)) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    modules.push({ id, title: String(m.title ?? id), version: String(m.version ?? ""), via: m.via === "module" ? "module" : "settings", data: m.data });
  }
  return { ok: true, error: null, version: String(data.version ?? ""), exported: String(data.exported ?? ""), modules };
}

const typeName = t => typeof t === "function" ? t.name : typeof t === "string" ? t : "";
/** Whether a value fits a setting's definition: { ok, value, reason } (numbers clamped to a range; choices checked). */
export function checkValue(def, value) {
  const t = typeName(def?.type);
  if (t === "Boolean") return typeof value === "boolean" ? { ok: true, value } : { ok: false, reason: "should be on or off (true or false)" };
  if (t === "Number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, reason: "should be a number" };
    const r = def.range; const v = r ? Math.min(r.max ?? Infinity, Math.max(r.min ?? -Infinity, value)) : value;
    return { ok: true, value: v, ...(v !== value ? { reason: `kept within ${r.min} to ${r.max}` } : {}) };
  }
  if (t === "String") {
    if (typeof value !== "string") return { ok: false, reason: "should be text" };
    if (def.choices && !Object.prototype.hasOwnProperty.call(def.choices, value)) return { ok: false, reason: `"${value}" isn't one of the choices (${Object.keys(def.choices).join(", ")})` };
    return { ok: true, value };
  }
  if (t === "Array") return Array.isArray(value) ? { ok: true, value } : { ok: false, reason: "should be a list" };
  if (t === "Object") return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false, reason: "should be an object" };
  // A data field (colour, file path…) or anything else: JSON-like values are taken as they are.
  return value === undefined ? { ok: false, reason: "has no value" } : { ok: true, value };
}

/**
 * Reads one module's "settings" data against its registered settings: { ok, error, rows, unknown, skipped, invalid }.
 * rows: [{ key, scope, label, from, to, changed, note }]. `defs`: Map key → { scope, type, choices, range, name };
 * `current`: key → value; `skip`: keys never imported.
 */
export function readModuleSettings(id, data, defs, current = {}, skip = []) {
  const fail = error => ({ ok: false, error, rows: [], unknown: [], skipped: [], invalid: [] });
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("no settings in the file for this module");
  if (data.module !== undefined && data.module !== id) return fail(`the settings are for "${data.module}"`);
  const no = new Set(skip); const rows = [], unknown = [], skipped = [], invalid = [];
  for (const bucket of ["world", "client"]) {
    const src = data[bucket]; if (src == null) continue;
    if (typeof src !== "object" || Array.isArray(src)) return fail(`"${bucket}" should be a list of settings`);
    for (const [key, value] of Object.entries(src)) {
      if (no.has(key)) { skipped.push(key); continue; }
      const def = defs.get(key);
      if (!def) { unknown.push(key); continue; }
      const c = checkValue(def, value);
      if (!c.ok) { invalid.push({ key, reason: c.reason }); continue; }
      const scope = def.scope === "world" ? "world" : "client";
      const from = current[key];
      rows.push({ key, scope, label: def.name || key, from, to: c.value, changed: JSON.stringify(from ?? null) !== JSON.stringify(c.value ?? null), note: [c.reason, scope !== bucket ? `filed under ${bucket}, applied as a ${scope} setting` : ""].filter(Boolean).join("; ") });
    }
  }
  return { ok: true, error: null, rows, unknown, skipped, invalid };
}

/** A value for the preview table, short. */
export function preview(v, max = 60) {
  const s = v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The bundle's file name: wanderers-satchel-settings-<world>-<yyyy-mm-dd>.json. */
export function fileName(world = "", date = new Date()) {
  const d = new Date(date); const day = Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const w = String(world).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ["wanderers-satchel-settings", w, day].filter(Boolean).join("-") + ".json";
}
