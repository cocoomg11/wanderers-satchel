/**
 * The GM-only store (Foundry half; shape, normalizer and changes in store-model.mjs). One journal entry, "Wanderer's Satchel (GM
 * only)", with default ownership None and no player owners, holds the last-seen versions, the backup bookkeeping and the settings
 * backups under flags.wanderers-satchel.store. It is created on the first write (a backup, a "What's new" dismissal, the first
 * version record) and removed by Remove Satchel data (category "store").
 *
 * Only GMs read or write it. Automatic writes (the first-load records and the version-change backup) happen only on the active
 * GM's client (Foundry's `game.users.activeGM`), so two GMs loading at once don't both write; clicks write on the clicking GM's
 * client. Writes are chained so two in a row don't overwrite each other.
 *
 * Whether Foundry withholds a None-ownership journal entry from players' clients is Foundry's behaviour: the README (Data) says so
 * and the live checklist asks to check it.
 */
import { ID } from "./const.mjs";
import * as M from "./store-model.mjs";

export const NAME = "Wanderer's Satchel (GM only)";
const FLAG = "store";

/** The store's journal entry, or null (players: always null). @returns {any} */
export function entry() {
  if (!game.user?.isGM) return null;
  try { return game.journal?.find((/** @type {any} */ j) => j.getFlag?.(ID, "storeEntry") === true) ?? null; } catch { return null; }
}

/** The normalized store; empty for players and before it exists. */
export function read() {
  const j = entry();
  return M.normalizeStore(j ? j.getFlag(ID, FLAG) : null);
}

/** @type {Promise<any> | null} */
let creating = null;
async function ensure() {
  const j = entry(); if (j) return j;
  if (!game.user?.isGM) throw new Error("GM only");
  creating ??= JournalEntry.create({
    name: NAME, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [ID]: { storeEntry: true, [FLAG]: M.normalizeStore(null) } },
    pages: [{ name: "About", type: "text", text: { format: 1, content: "<p>Wanderer's Satchel keeps its GM-only records here: settings backups and the module versions it last showed. Don't share this entry with players. Deleting it loses the backups.</p>" } }]
  }).finally(() => { creating = null; });
  return creating;
}

let chain = Promise.resolve();
/**
 * GM: changes the store with `fn(store) → store` (pure), one change at a time. Resolves to the new store.
 * @param {(s: any) => any} fn
 * @returns {Promise<any>}
 */
export function update(fn) {
  if (!game.user?.isGM) return Promise.reject(new Error("GM only"));
  const run = chain.then(async () => {
    const j = await ensure();
    const next = M.normalizeStore(fn(M.normalizeStore(j.getFlag(ID, FLAG))));
    // A merge update: `snapshots` is a list, so it is replaced whole (a dropped backup is really gone); the version maps only
    // ever gain or change keys.
    await j.update({ [`flags.${ID}.${FLAG}`]: next });
    return next;
  });
  chain = run.catch(e => console.warn(`${ID} | GM-only store`, e));
  return run;
}

/** Whether this client is the one that does automatic writes: the active GM. */
export function isWriter() {
  try { const a = game.users?.activeGM; return !!game.user?.isGM && (a ? a.id === game.user.id : true); } catch { return !!game.user?.isGM; }
}
