/**
 * Remove Satchel data (the hub's Maintenance page, GM only): counts what Wanderer's Satchel stored (a dry run), lets the GM tick what goes and
 * asks to type REMOVE. What the Satchel writes: its own settings (feature switches), `flags.wanderers-satchel` on chat messages (the
 * combined health card), the update-check answers in this browser's session storage and the health check filter in its local
 * storage. Nothing of any other module is touched;
 * debug settings the "Debug logging for all" switch changed belong to those modules and are listed, not reset.
 */
import { ID, TITLE } from "./const.mjs";
import { createCache } from "./version-model.mjs";
import * as Prefs from "./prefs.mjs";
import { CONFIRM_WORD, confirmed, hasFlags } from "../vendor/wanderers-core/index.mjs";

export const CATEGORIES = [
  ["messages", "Satchel flags on chat messages (combined health cards whispered to the GMs; the cards are deleted)"],
  ["cache", "Kept in this browser: update-check answers (session storage) and the health check filter (local storage)"],
  ["settings", "Reset Wanderer's Satchel's settings to their defaults (feature switches and its debug logging; reloads)"]
];

const ours = (/** @type {any} */ d) => hasFlags(d, ID);
const storage = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
export const cache = () => createCache(storage());

/** Counts what each category would remove. Nothing is changed. */
export function plan() {
  /** @type {{ messages: any[], cache: string[], settings: any[] }} */
  const p = { messages: [], cache: [], settings: [] };
  for (const m of game.messages ?? []) if (ours(m)) p.messages.push(m);
  p.cache = [...cache().keys(), ...(Prefs.hasFilter() ? [Prefs.FILTER_KEY] : [])];
  for (const [, c] of game.settings.settings) if (c.namespace === ID) {
    let cur; try { cur = game.settings.get(ID, c.key); } catch { continue; }
    if (JSON.stringify(cur) !== JSON.stringify(c.default)) p.settings.push(c);
  }
  return p;
}

/** Carries out the ticked categories: { [category]: number }. */
/** @param {any} [pick] */
export async function remove(pick = {}) {
  if (!game.user?.isGM) { ui.notifications.warn("GM only."); return null; }
  const p = plan(); const done = {};
  if (pick.messages) { try { await ChatMessage.deleteDocuments(p.messages.map(m => m.id)); done.messages = p.messages.length; } catch (e) { console.warn(`${ID} | remove messages`, e); done.messages = 0; } }
  if (pick.cache) { Prefs.clearFilter(); done.cache = cache().clear() || p.cache.length; }
  if (pick.settings) {
    let n = 0;
    for (const c of p.settings) { try { await game.settings.set(ID, c.key, foundry.utils.deepClone(c.default)); n++; } catch (e) { console.warn(`${ID} | reset ${c.key}`, e); } }
    done.settings = n;
  }
  return done;
}

/**
 * Carries out a Remove Satchel data form (the hub's Maintenance page): checks the confirm word, removes the ticked categories,
 * reports. Returns { ok, error?, done? }; an error is shown inline on the page.
 * @param {{ confirm: string, pick: Record<string, boolean> }} input
 */
export async function submit({ confirm, pick }) {
  if (!game.user?.isGM) return { ok: false, error: "GM only." };
  if (!confirmed(confirm)) return { ok: false, error: `Type ${CONFIRM_WORD} to confirm.` };
  if (!Object.values(pick).some(Boolean)) return { ok: false, error: "Nothing ticked." };
  const done = await remove(pick); if (!done) return { ok: false, error: "Nothing was removed." };
  const label = Object.fromEntries(CATEGORIES);
  ui.notifications.info(`${TITLE} data removed: ${Object.entries(done).map(([k, n]) => `${label[k].replace(/ \(.*\)$/, "")}: ${n}`).join("; ") || "nothing"}.`);
  if (done.settings) foundry.applications.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
  return { ok: true, done };
}

/** The dry-run counts per category. */
export const counts = () => { const p = /** @type {any} */ (plan()); return Object.fromEntries(CATEGORIES.map(([k]) => [k, p[k].length])); };
export { CONFIRM_WORD };
