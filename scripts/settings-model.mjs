/**
 * One-file settings export / import for every module in the Satchel, pure (tested in Node). Each module's part is core's settings
 * file (wanderers-core buildExport / readImport, format 1); this file adds the bundle around them and the import safety checks.
 *
 * Bundle file:
 *   { module: "wanderers-satchel", format: 1, version, exported,
 *     modules: { "<id>": { title, version, via: "module" | "settings", data } } }
 * via "module": `data` came from the module's own exportSettings() and goes back through its own importSettings.read/apply.
 * via "settings": `data` is core's file { module: id, format: 1, version, exported, world: { key: value }, client: { key: value } },
 * read here against the registered settings of that namespace.
 * Record-type settings (histories, caches, "last version seen") are on a per-module skip list and never exported or imported.
 *
 * Import safety: the file is size-limited; only modules the Satchel shows (and the Satchel itself) are read; every value goes
 * through core's type check, and every Object and Array setting through a validator (plain JSON only, size and depth limits, no
 * prototype keys) plus the module's own validator when one is known. Values are checked again when they are written.
 */
import { buildExport, readImport, checkValue as coreCheck, preview as corePreview, isoDay, slug, jsonBytes } from "../vendor/wanderers-core/index.mjs";
import { ID } from "./const.mjs";

export const FORMAT = 1;

/**
 * A setting's name or hint as people read it: modules register them as translation keys ("MYMOD.Settings.Ratio.Name") or plain
 * text. `localize` is Foundry's `game.i18n.localize` on a live client (passed in, so this stays pure); a key without a translation
 * comes back unchanged, and anything that isn't text gives "".
 * @param {unknown} text
 * @param {((key: string) => string) | null} [localize]
 */
export function label(text, localize = null) {
  if (typeof text !== "string" || !text) return "";
  if (typeof localize !== "function") return text;
  try { const t = localize(text); return typeof t === "string" && t ? t : text; } catch { return text; }
}

/**
 * The registered settings with their names and hints localized (a new Map; the other fields as they are).
 * @param {Map<string, any>} defs
 * @param {((key: string) => string) | null} [localize]
 */
export function localizeDefs(defs, localize = null) {
  const out = new Map();
  for (const [k, d] of defs) out.set(k, { ...d, name: label(d?.name, localize), hint: label(d?.hint, localize) });
  return out;
}
/** Largest bundle file read (characters). */
export const MAX_FILE = 5 * 1024 * 1024;
/** Largest single Object/Array setting value accepted (bytes of JSON) and its deepest nesting. */
export const MAX_VALUE_BYTES = 512 * 1024;
export const MAX_VALUE_DEPTH = 12;
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Client records every module on wanderers-core 0.5.0 may register: core's remembered window placement (`windowPlacement`) and
 * the "Module data" folder switch (`showModuleData`). Per browser, never moved between worlds: left out of every module's export
 * and import, whatever its adapter or registration lists (0.6.0).
 */
export const CORE_RECORDS = ["showModuleData", "windowPlacement"];
/** Our own settings that are bookkeeping, never moved between worlds. */
export const OWN_SKIP = [...CORE_RECORDS];
/**
 * The keys left out of an entry's settings export and import: its own skip list plus `CORE_RECORDS`.
 * @param {{ skipSettings?: string[] } | null | undefined} entry
 * @returns {string[]}
 */
export const skipList = entry => [...new Set([...(Array.isArray(entry?.skipSettings) ? entry.skipSettings : []), ...CORE_RECORDS])];

const clone = (/** @type {unknown} */ v) => v === undefined ? null : JSON.parse(JSON.stringify(v));

/**
 * One namespace's settings → its export object (core's settings file). `defs`: [{ key, scope, value }]; `skip`: keys left out.
 * @param {string} id
 * @param {{ key: string, scope?: string, value?: unknown }[]} defs
 * @param {{ version?: string, exported?: string, skip?: Iterable<string> }} [opts]
 */
export function buildModuleExport(id, defs, { version = "", exported = "", skip = [] } = {}) {
  return buildExport(id, defs, { version: String(version ?? ""), exported, skip });
}

/**
 * The whole bundle. `parts`: [{ id, title, version, via, data }].
 * @param {any[]} parts
 * @param {{ version?: string, exported?: string }} [opts]
 */
export function buildBundle(parts, { version = "", exported = "" } = {}) {
  /** @type {Record<string, any>} */
  const modules = {};
  for (const p of parts ?? []) if (p?.id && p.data !== undefined) modules[p.id] = { title: String(p.title ?? p.id), version: String(p.version ?? ""), via: p.via === "module" ? "module" : "settings", data: clone(p.data) };
  return { module: ID, format: FORMAT, version: String(version), exported: String(exported), modules };
}

/**
 * Reads a bundle's text (or object): { ok, error, version, exported, modules: [{ id, title, version, via, data }] }. Module ids
 * that aren't module ids are dropped.
 * @param {unknown} text
 */
export function readBundle(text) {
  const fail = (/** @type {string} */ error) => ({ ok: false, error, version: "", exported: "", modules: /** @type {any[]} */ ([]) });
  /** @type {any} */
  let data = text;
  if (typeof text === "string") {
    if (text.length > MAX_FILE) return fail(`the file is too large (over ${Math.round(MAX_FILE / 1024 / 1024)} MB)`);
    try { data = JSON.parse(text); } catch (e) { return fail(`the file isn't valid JSON (${String(e?.message ?? e)})`); }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("the file isn't a settings export");
  if (data.module !== ID) return fail(data.module ? `the file is for "${String(data.module).slice(0, 80)}"; open it from that module's own import instead` : "the file isn't a Wanderer's Satchel settings export");
  if (data.format !== FORMAT) return fail(`unknown file format ${JSON.stringify(data.format ?? null)} (this version reads format ${FORMAT})`);
  if (!data.modules || typeof data.modules !== "object" || Array.isArray(data.modules)) return fail("the file has no modules section");
  const modules = [];
  for (const [id, m] of Object.entries(data.modules)) {
    if (!ID_RE.test(id) || BAD_KEYS.has(id)) continue;
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    modules.push({ id, title: String(m.title ?? id).slice(0, 200), version: String(m.version ?? "").slice(0, 40), via: m.via === "module" ? "module" : "settings", data: m.data });
  }
  return { ok: true, error: null, version: String(data.version ?? "").slice(0, 40), exported: String(data.exported ?? "").slice(0, 40), modules };
}

/**
 * Whether a value is plain JSON (objects, lists, text, finite numbers, true/false, null), within the size and depth limits and
 * without prototype keys: true, or the reason it isn't.
 * @param {unknown} value
 * @returns {true | string}
 */
export function plainJson(value) {
  if (jsonBytes(value) > MAX_VALUE_BYTES) return `is too large (over ${Math.round(MAX_VALUE_BYTES / 1024)} KB)`;
  /** @returns {true | string} */
  const walk = (/** @type {unknown} */ v, /** @type {number} */ d) => {
    if (d > MAX_VALUE_DEPTH) return "is nested too deeply";
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v) ? true : "has a number that isn't finite";
    if (Array.isArray(v)) { for (const x of v) { const r = walk(x, d + 1); if (r !== true) return r; } return true; }
    if (typeof v === "object") {
      const p = Object.getPrototypeOf(v); if (p !== Object.prototype && p !== null) return "isn't plain data";
      for (const k of Object.keys(v)) { if (BAD_KEYS.has(k)) return `has a key that isn't allowed ("${k}")`; const r = walk(/** @type {any} */ (v)[k], d + 1); if (r !== true) return r; }
      return true;
    }
    return "isn't plain data";
  };
  return walk(value, 0);
}

const typeName = (/** @type {unknown} */ t) => typeof t === "function" ? t.name : typeof t === "string" ? t : "";

/**
 * The validators for one module's import: every Object and Array setting gets `plainJson`, then the module's own validator for
 * that key when there is one (from an adapter or a registration). Keys without either are left to core's type check.
 * @param {Map<string, any>} defs
 * @param {Record<string, Function>} [own]
 * @returns {Record<string, (value: unknown, def: any) => any>}
 */
export function validatorsFor(defs, own = {}) {
  /** @type {Record<string, (value: unknown, def: any) => any>} */
  const out = {};
  for (const [key, def] of defs) {
    const t = typeName(def?.type);
    const mine = Object.hasOwn(own ?? {}, key) && typeof own[key] === "function" ? own[key] : null;
    const structured = t === "Object" || t === "Array" || (t !== "Boolean" && t !== "Number" && t !== "String");
    if (!structured && !mine) continue;
    out[key] = (value, d) => {
      if (structured && (value !== null && typeof value === "object")) { const p = plainJson(value); if (p !== true) return p; }
      return mine ? mine(value, d) : true;
    };
  }
  return out;
}

/**
 * Reads one module's "settings" data against its registered settings (core readImport): { ok, error, rows, unknown, skipped,
 * invalid }. rows: [{ key, scope, label, from, to, changed, note }]. `defs`: Map key → { scope, type, choices, range, name };
 * `current`: key → value; `skip`: keys never imported; `validators`: the module's own per-key checks.
 * @param {string} id
 * @param {unknown} data
 * @param {Map<string, any>} defs
 * @param {Record<string, unknown>} [current]
 * @param {Iterable<string>} [skip]
 * @param {Record<string, Function>} [validators]
 */
export function readModuleSettings(id, data, defs, current = {}, skip = [], validators = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "no settings in the file for this module", version: "", rows: [], unknown: [], skipped: [], invalid: [] };
  return readImport(id, data, defs, current, { skip, requireModule: false, label: id, validators: validatorsFor(defs, validators) });
}

/**
 * Checks one row again just before it is written (the same rules as the preview): { ok, value, reason }.
 * @param {any} def the registered setting
 * @param {unknown} value
 * @param {Record<string, Function>} [own] the module's own validators
 * @param {string} [key]
 */
export function recheck(def, value, own = {}, key = "") {
  const c = coreCheck(def, value); if (!c.ok) return c;
  const v = validatorsFor(new Map([[key, def]]), own)[key];
  if (!v) return c;
  let r; try { r = v(c.value, def); } catch (e) { return { ok: false, reason: `couldn't be checked (${String(e?.message ?? e)})` }; }
  if (r === true) return c;
  if (r && typeof r === "object" && r.ok === true) return { ok: true, value: r.value };
  return { ok: false, reason: typeof r === "string" ? r : "has the wrong shape" };
}

export const checkValue = coreCheck;
/** A value for the preview table, short. */
export const preview = (/** @type {unknown} */ v, max = 60) => corePreview(v, max);

/**
 * The bundle's file name: wanderers-satchel-settings-<world>-<yyyy-mm-dd>.json.
 * @param {string} [world]
 * @param {Date | number | string} [date]
 */
export function fileName(world = "", date = new Date()) {
  return ["wanderers-satchel-settings", slug(world), isoDay(date)].filter(Boolean).join("-") + ".json";
}
