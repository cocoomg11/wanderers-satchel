/**
 * The Satchel's GM-only store, pure (tested in Node): its shape, the one normalizer, and the changes made to it. The Foundry half
 * (store.mjs) keeps it in one journal entry with ownership None (flags.wanderers-satchel.store), the same pattern the toolkit uses.
 *
 * Store (v1):
 *   { v: 1,
 *     seen:   { "<id>": "x.y.z" }   last version each module was shown to a GM ("What's new" dismissed, or recorded on first sight),
 *     backed: { "<id>": "x.y.z" }   version each module had when the last version-change backup was taken,
 *     updateBackup: ""             which set of available updates was last backed up ("id@x.y.z,…"),
 *     snapshots: [{ id, at, reason, versions: { "<id>": "x.y.z" }, size, text }]   settings backups, newest first, at most 5 }
 * A snapshot's `text` is the settings bundle as JSON text (the same file Settings transfer › Export writes), kept as text so
 * Foundry's update merge never touches the setting values inside it.
 */
import { versioned, addCapped, parseVersion, decide } from "../vendor/wanderers-core/index.mjs";

export const STORE_VERSION = 1;
/** Settings backups kept (the oldest drops off). */
export const MAX_SNAPSHOTS = 5;
/** Largest single backup (characters of JSON). A bigger one is refused with a message rather than stored. */
export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
/** Why a backup was taken. */
export const REASONS = /** @type {const} */ ({ manual: "Backed up by hand", update: "Updates found", change: "Version change", first: "First backup" });

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const isObj = (/** @type {unknown} */ v) => !!v && typeof v === "object" && !Array.isArray(v);
/** { id: version } with only readable ids and version text. @param {unknown} v */
export function versionMap(v) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(/** @type {Record<string, unknown>} */ (v))) if (ID_RE.test(k) && typeof x === "string" && x && x.length < 64) out[k] = x;
  return out;
}

/** @param {any} s */
function cleanSnapshot(s) {
  if (!isObj(s) || typeof s.id !== "string" || !s.id || typeof s.text !== "string" || !s.text) return null;
  const at = typeof s.at === "number" && Number.isFinite(s.at) ? s.at : 0;
  const reason = Object.hasOwn(REASONS, s.reason) ? s.reason : "manual";
  return { id: s.id.slice(0, 64), at, reason, versions: versionMap(s.versions), size: s.text.length, text: s.text };
}

const empty = () => ({ v: STORE_VERSION, seen: {}, backed: {}, updateBackup: "", snapshots: [] });

/** The one reader of the stored value: never throws; anything unreadable gives an empty store. */
export const normalizeStore = versioned({
  version: STORE_VERSION,
  empty,
  upgrades: { 0: (/** @type {any} */ old) => ({ ...empty(), ...old }) },
  clean: (/** @type {any} */ s) => ({
    v: STORE_VERSION,
    seen: versionMap(s.seen),
    backed: versionMap(s.backed),
    updateBackup: typeof s.updateBackup === "string" ? s.updateBackup.slice(0, 4000) : "",
    snapshots: (Array.isArray(s.snapshots) ? s.snapshots : []).map(cleanSnapshot).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, MAX_SNAPSHOTS)
  })
});

/**
 * Per module, what happened since the store last saw it: [{ id, kind: "fresh" | "upgrade" | "downgrade" | "same", from, to }].
 * `seen`: the stored map; `installed`: { id: version }. A module with no record is "fresh" (recorded silently).
 * @param {Record<string, string>} seen @param {Record<string, string>} installed
 */
export function changes(seen, installed) {
  return Object.entries(installed).filter(([, v]) => !!parseVersion(v)).map(([id, to]) => {
    const d = decide({ stored: seen[id] ?? "", current: to });
    return { id, kind: d.kind, from: d.from, to };
  });
}

/** The map with every module's installed version written in (for "fresh" records and dismissals). @param {Record<string, string>} map @param {Record<string, string>} versions */
export const withVersions = (map, versions) => ({ ...map, ...versionMap(versions) });

/**
 * A snapshot built from a settings bundle. Returns { ok, snapshot, error }; refused when the bundle is too large.
 * @param {any} bundle @param {{ reason?: string, versions?: Record<string, string>, now?: number }} [o]
 */
export function makeSnapshot(bundle, { reason = "manual", versions = {}, now = Date.now() } = {}) {
  let text = "";
  try { text = JSON.stringify(bundle); } catch (e) { return { ok: false, snapshot: null, error: `the settings couldn't be saved (${/** @type {any} */ (e)?.message ?? e})` }; }
  if (!text) return { ok: false, snapshot: null, error: "there were no settings to save" };
  if (text.length > MAX_SNAPSHOT_BYTES) return { ok: false, snapshot: null, error: `the settings are larger than ${Math.round(MAX_SNAPSHOT_BYTES / 1024)} KB, too large for a backup in the world (use Settings transfer › Export instead)` };
  const snapshot = cleanSnapshot({ id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at: now, reason, versions, text });
  return { ok: true, snapshot, error: null };
}

/** The store with a snapshot added (newest first, capped). @param {any} store @param {any} snap */
export const addSnapshot = (store, snap) => ({ ...store, snapshots: addCapped(store.snapshots, snap, { max: MAX_SNAPSHOTS }) });
/** The store without one snapshot. @param {any} store @param {string} id */
export const removeSnapshot = (store, id) => ({ ...store, snapshots: store.snapshots.filter((/** @type {any} */ s) => s.id !== id) });

/** "id@x.y.z,…" for the updates available in `results` (Map id → result), sorted; "" when none. @param {Map<string, any>} results */
export function updateSetKey(results) {
  return [...results].filter(([, r]) => r?.status === "update" && r.latest).map(([id, r]) => `${id}@${r.latest}`).sort().join(",");
}
