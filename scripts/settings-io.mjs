/**
 * Settings export / import for every module in the Satchel (feature "sharedSettings"), GM only. Export writes one JSON file;
 * import reads it; the hub's Settings transfer page shows what would change per module with a tick per setting, and apply()
 * writes only after the GM confirms.
 *
 * Per module: an entry with exportSettings() exports through it ("module"); otherwise the Satchel reads the module's registered
 * settings in its namespace ("settings", minus the entry's skip list). On import, an entry with importSettings { read, apply }
 * reads and writes through the module's own checks; otherwise the Satchel checks each value against the registered setting.
 */
import { ID, TITLE, plural } from "./const.mjs";
import * as M from "./settings-model.mjs";
import * as Reg from "./registry.mjs";
import { getSetting as get, settingDefs } from "../vendor/wanderers-core/foundry/index.mjs";
import { log } from "./core.mjs";

/**
 * A namespace's registered settings: Map key → { scope, type, choices, range, name, requiresReload, default }.
 * @param {string} ns
 */
export function defs(ns) {
  const out = new Map();
  for (const [k, c] of settingDefs(ns)) out.set(k, { scope: c.scope, type: c.type, choices: c.choices, range: c.range, name: c.name, requiresReload: !!c.requiresReload, default: c.default });
  return out;
}

/**
 * The entry a bundle part may be read into or written to: one the hub shows (and is active), or the Satchel itself. Anything else
 * (a module the Satchel doesn't know, an id typed into the file) is never touched.
 * @param {string} id
 */
function target(id) {
  if (id === ID) return { id: ID, title: TITLE, skipSettings: M.OWN_SKIP };
  return Reg.entry(id);
}

/** The modules the bundle covers: every active entry, plus the Satchel itself. */
function targets() {
  const list = Reg.entries().filter(e => game.modules.get(e.id)?.active);
  return [...list, { id: ID, title: TITLE, skipSettings: M.OWN_SKIP }];
}

/** Builds the bundle object (no download). GM only. */
export async function build() {
  if (!game.user?.isGM) throw new Error("GM only.");
  const parts = [], problems = [];
  for (const e of targets()) {
    const version = game.modules.get(e.id)?.version ?? "";
    try {
      if (typeof e.exportSettings === "function") { parts.push({ id: e.id, title: e.title || e.id, version, via: "module", data: await e.exportSettings() }); continue; }
      const d = defs(e.id); if (!d.size) continue;
      const list = [...d].map(([key, x]) => ({ key, scope: x.scope, value: get(e.id, key) }));
      parts.push({ id: e.id, title: e.title || e.id, version, via: "settings", data: M.buildModuleExport(e.id, list, { version, exported: new Date().toISOString(), skip: e.skipSettings ?? [] }) });
    } catch (err) { console.warn(`${ID} | export ${e.id}`, err); problems.push(`${e.title || e.id}: ${err?.message ?? err}`); }
  }
  return { bundle: M.buildBundle(parts, { version: game.modules.get(ID)?.version ?? "", exported: new Date().toISOString() }), problems };
}

/** GM: downloads the bundle file. Returns the bundle. */
export async function exportFile() {
  if (!game.user.isGM) return ui.notifications.warn("GM only.");
  const { bundle, problems } = await build();
  const text = JSON.stringify(bundle, null, 2); const name = M.fileName(game.world?.id ?? "");
  const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  if (save) save(text, "application/json", name);
  else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  ui.notifications.info(`${TITLE}: exported the settings of ${plural(Object.keys(bundle.modules).length, "module")}.`);
  if (problems.length) ui.notifications.warn(`${TITLE}: left out ${problems.join("; ")}.`);
  return bundle;
}

/**
 * Reads a bundle's text against this world, nothing changed: { ok, error, version, modules: [{ id, title, version, via, how,
 * ok, error, rows, unknown, skipped, invalid }] }. `how`: "module" (the module's own import) or "satchel".
 */
export async function readText(text) {
  if (!game.user?.isGM) return { ok: false, error: "GM only", modules: [] };
  const b = M.readBundle(text);
  if (!b.ok) return { ok: false, error: b.error, modules: [] };
  const out = [];
  for (const m of b.modules) {
    const e = target(m.id);
    const base = { id: m.id, title: e?.title || m.title, version: m.version, via: m.via, how: "satchel", rows: [], unknown: [], skipped: [], invalid: [] };
    if (!e) { out.push({ ...base, ok: false, error: "not a module Wanderer's Satchel shows in this world, so it is never imported" }); continue; }
    if (!game.modules.get(m.id)?.active) { out.push({ ...base, ok: false, error: "not active in this world" }); continue; }
    try {
      /** @type {any} */
      let r = null;
      if (e?.importSettings) { r = await e.importSettings.read(m.data); if (r) base.how = "module"; }
      if (!r && m.via === "module") { out.push({ ...base, ok: false, error: "exported by the module itself, and it has no import the Satchel can use" }); continue; }
      if (!r) {
        const d = defs(m.id); const cur = Object.fromEntries([...d.keys()].map(k => [k, get(m.id, k)]));
        r = M.readModuleSettings(m.id, m.data, d, cur, e?.skipSettings ?? [], e?.validators ?? {});
      }
      const d = defs(m.id);
      const rows = (r.rows ?? []).map((/** @type {any} */ x) => ({ ...x, reload: !!d.get(x?.key)?.requiresReload }));
      out.push({ ...base, ok: !!r.ok, error: r.ok ? null : r.error ?? "couldn't read", rows, unknown: r.unknown ?? [], skipped: r.skipped ?? [], invalid: r.invalid ?? [] });
    } catch (err) { out.push({ ...base, ok: false, error: String(err?.message ?? err) }); }
  }
  return { ok: true, error: null, version: b.version, exported: b.exported, modules: out };
}

/**
 * GM: writes the picked rows. `picks`: [{ id, how, rows }]. Returns { written, reload, failed: [text] }. Every row is checked
 * again here (the same rules as the preview, the skip list included), so rows passed straight to api.settings.apply() can't write
 * a value the preview would have refused, or into a module the Satchel doesn't show.
 * @param {any[]} picks
 */
export async function apply(picks) {
  if (!game.user?.isGM) throw new Error("GM only.");
  let written = 0, reload = false; const failed = [];
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p || typeof p.id !== "string" || !Array.isArray(p.rows) || !p.rows.length) continue;
    const e = target(p.id);
    if (!e) { failed.push(`${p.id}: not a module Wanderer's Satchel shows`); continue; }
    if (!game.modules.get(p.id)?.active) { failed.push(`${p.id}: not active in this world`); continue; }
    try {
      if (p.how === "module" && e.importSettings) {
        const r = await e.importSettings.apply(p.rows);
        written += r?.written ?? p.rows.length; reload ||= !!r?.reload; continue;
      }
      const d = defs(p.id); const skip = new Set(e.skipSettings ?? []);
      for (const r of p.rows) {
        if (!r || typeof r.key !== "string" || skip.has(r.key) || !d.has(r.key)) { if (r?.key) failed.push(`${p.id}.${r.key}: not imported`); continue; }
        const c = M.recheck(d.get(r.key), r.to, e.validators ?? {}, r.key);
        if (!c.ok) { failed.push(`${p.id}.${r.key}: ${c.reason}`); continue; }
        await game.settings.set(p.id, r.key, c.value); written++;
        log(`import ${p.id}.${r.key}`);
        if (d.get(r.key).requiresReload) reload = true;
      }
    } catch (err) { console.warn(`${ID} | import ${p.id}`, err); failed.push(`${p.id}: ${err?.message ?? err}`); }
  }
  return { written, reload, failed };
}

/**
 * Asks the browser for a file: null when cancelled, else { name, size, text } or { name, size, error } (too large, unreadable).
 * The hub shows the error inline on the Settings transfer page.
 * @returns {Promise<{ name: string, size: number, text?: string, error?: string } | null>}
 */
export function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const f = input.files?.[0]; if (!f) return resolve(null);
      const base = { name: f.name, size: f.size };
      if (f.size > M.MAX_FILE) return resolve({ ...base, error: `the file is too large (over ${Math.round(M.MAX_FILE / 1024 / 1024)} MB). Settings files are usually under 100 KB; check you picked a settings export, not a world backup.` });
      try { resolve({ ...base, text: await f.text() }); } catch (err) { resolve({ ...base, error: `the file couldn't be read (${err?.message ?? err}).` }); }
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
