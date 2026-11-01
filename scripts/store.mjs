/**
 * The GM-only store (Foundry half; shape, normalizer and changes in store-model.mjs), on core's `createStore` (0.6.0). One journal
 * entry, "Wanderer's Satchel (GM only)", with default ownership None and no player owners, holds the last-seen versions, the backup
 * bookkeeping and the settings backups under flags.wanderers-satchel.store. It is found by its marker flag
 * `flags.wanderers-satchel.storeEntry` (exactly as before 0.6.0, so an existing entry is kept as it is), created on the first write
 * (inside core's "Module data" folder) and removed by Remove Satchel data (category "store", `remove()`).
 *
 * Only GMs read or write it. Automatic writes (the first-load records, the version-change backup, filing an older root-level entry
 * into "Module data" once) happen only on the active GM's client (`isWriter()`, Foundry's `game.users.activeGM`, which is also core's
 * default writer); clicks write on the clicking GM's client. Writes are chained so two in a row don't overwrite each other.
 *
 * Not secrecy: a None-ownership journal is still sent to players' clients (checked on 14.369). The README (Data) says so.
 */
import { ID } from "./const.mjs";
import * as M from "./store-model.mjs";
import { createStore } from "../vendor/wanderers-core/foundry/index.mjs";
import { warn } from "./core.mjs";

export const NAME = "Wanderer's Satchel (GM only)";
/** The data flag and the marker flag (unchanged since 0.5.0). */
export const FLAG = "store";
export const ENTRY_FLAG = "storeEntry";
export const ABOUT = "Wanderer's Satchel keeps its GM-only records here: settings backups and the module versions it last showed. Don't share this entry with players. Deleting it loses the backups.";

/** Whether this client is the one that does automatic writes: the active GM. */
export function isWriter() {
  try { const a = game.users?.activeGM; return !!game.user?.isGM && (a ? a.id === game.user.id : true); } catch { return !!game.user?.isGM; }
}

export const Store = createStore(ID, {
  name: NAME, flagKey: FLAG, entryFlag: ENTRY_FLAG, normalize: M.normalizeStore, about: ABOUT,
  log: { warn: (/** @type {any[]} */ ...a) => warn(...a) }, isWriter
});

/** The store's journal entry, or null (players: always null). @returns {any} */
export const entry = () => Store.entry();
/** The normalized store; empty for players and before it exists. */
export const read = () => Store.read();
/**
 * GM: changes the store with `fn(store) → store` (pure), one change at a time. Resolves to the new store.
 * @param {(s: any) => any} fn
 * @returns {Promise<any>}
 */
export const update = fn => Store.update(fn);
/** The writer, at ready: files a root-level entry in "Module data" once. Never throws. */
export const file = () => Store.file();
/** GM (cleanup): deletes the entry (every copy) and the "Module data" folder when nothing else is in it. Resolves to the count. */
export const remove = () => Store.remove();
/** For the health check: { exists, count, name, id, bytes, playersCanSee, keys }. */
export const status = () => Store.status();
