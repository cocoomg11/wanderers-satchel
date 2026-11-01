/**
 * The live registry: registrations from other modules (queued before our api exists, see main.mjs), merged with the built-in
 * adapters, plus the generic actions every card has (open the module's settings menu, docs links). GM-facing; nothing here writes
 * documents.
 */
import { ID, TITLE } from "./const.mjs";
import * as R from "./registry-model.mjs";
import { ADAPTERS } from "./adapters.mjs";

/** @type {Map<string, any>} */
const registered = new Map();

/** api.register(opts): { ok, error, warnings }. A second registration for the same id replaces the first. */
export function register(opts) {
  const r = R.normalizeRegistration(opts);
  if (!r.ok) { console.warn(`${ID} | register: ${r.error}`); return { ok: false, error: r.error, warnings: r.warnings }; }
  if (r.warnings.length) console.warn(`${ID} | register "${r.entry.id}": ${r.warnings.join("; ")}`);
  registered.set(r.entry.id, r.entry);
  refreshWindows();
  return { ok: true, error: null, warnings: r.warnings };
}

/** Removes a registration (the built-in adapter, if any, shows again). */
export function unregister(id) { const had = registered.delete(id); if (had) refreshWindows(); return had; }

/** Installed module data for one id, as plain fields, or null. */
export function moduleInfo(id) {
  const m = game.modules.get(id); if (!m) return null;
  return { id, title: m.title, version: m.version, active: !!m.active, manifest: m.manifest, url: m.url, readme: m.readme, changelog: m.changelog, bugs: m.bugs, relationships: m.relationships };
}

/** Every entry the window shows (registrations override adapters; adapters only for installed modules). Never includes us. */
export function entries() {
  const installed = [...game.modules.keys()];
  return R.mergeEntries(ADAPTERS, /** @type {any} */ (registered), installed).filter(e => e.id !== ID);
}
/** @param {string} id @returns {any} */
export const entry = id => entries().find(e => e.id === id) ?? null;
export const registrations = () => [...registered.keys()];

/** The module's own registered settings menus (game.settings.menus is keyed "namespace.key"). */
export function menusOf(id) {
  const out = [];
  try { for (const [k, m] of game.settings.menus) if ((m?.namespace ?? k.split(".")[0]) === id) out.push(m); } catch { }
  return out;
}

/**
 * Opens a module's control panel: the entry's openPanel() when it has one (a false return means "nothing to open" and falls
 * through), else the module's first registered settings menu, else Configure Settings on the module's tab.
 */
export async function openPanel(id) {
  const e = entry(id);
  if (!game.modules.get(id)?.active) return ui.notifications.warn(`${TITLE}: ${e?.title ?? id} isn't active in this world.`);
  if (typeof e?.openPanel === "function") {
    try { const r = await e.openPanel(); if (r !== false) return r; } catch (err) { console.warn(`${ID} | open panel ${id}`, err); ui.notifications.error(`${TITLE}: couldn't open ${e.title || id}'s panel (${err?.message ?? err}).`); return; }
  }
  const menu = menusOf(id)[0];
  if (menu?.type) { try { return new menu.type().render({ force: true }); } catch (err) { console.warn(`${ID} | open menu ${id}`, err); } }
  try {
    const SC = foundry.applications.settings?.SettingsConfig;
    return new SC({ initialCategory: id }).render({ force: true });
  } catch (err) { console.warn(`${ID} | settings ${id}`, err); }
}

/** Opens a link: http(s) in a new browser tab; a file in a module folder too (Foundry serves it as it is). */
export function openLink(url) {
  if (!url) return;
  try { window.open(url, "_blank", "noopener"); } catch { }
}

const apps = new Set();
export const trackWindow = app => { apps.add(app); return () => apps.delete(app); };
export function refreshWindows() { for (const a of apps) { try { if (a.rendered) a.render(); } catch { } } }

export { R };
