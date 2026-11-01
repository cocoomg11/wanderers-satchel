/**
 * What happens around module updates (GM only): the daily update check, "What's new" after a version change, and settings backups
 * (before updates, after a version change, by hand). Models in store-model.mjs and notes-model.mjs; the GM-only store in store.mjs.
 *
 * Load order (and its limit): the version-change backup reads every module's settings in Foundry's `setup` hook, the earliest
 * point where settings can be read, and writes the backup in `ready`. A module that changes its settings in its own `ready` hook
 * (where migrations usually run) changes them after that read, so the backup has the old values. Not covered: anything a module
 * changes in its `init` or `setup` hook (or in a `setup` hook that runs before ours), Foundry's own data migration (it runs before
 * any module code), and a module that hands over its settings through its own `exportSettings()` that only answers later. The Satchel
 * cannot run before those; it says so in the README.
 */
import { ID, TITLE, plural } from "./const.mjs";
import * as F from "./features.mjs";
import * as Reg from "./registry.mjs";
import * as Store from "./store.mjs";
import * as SM from "./store-model.mjs";
import * as N from "./notes-model.mjs";
import * as SettingsIO from "./settings-io.mjs";
import { log } from "./core.mjs";

/** localStorage key: when this browser last ran the daily update check (ms). Removed by Remove Satchel data (cache). */
export const CHECKED_KEY = `${ID}.updateCheckedAt`;
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
/** When this browser last checked for updates (0 = never). */
export function lastChecked() { try { return Number(local()?.getItem(CHECKED_KEY)) || 0; } catch { return 0; } }
/** @param {number} at */
export function setChecked(at) { try { local()?.setItem(CHECKED_KEY, String(at)); } catch { /* not remembered: checks again next load */ } }
export function hasChecked() { try { return !!local()?.getItem(CHECKED_KEY); } catch { return false; } }
export function clearChecked() { try { const s = local(); if (!s?.getItem(CHECKED_KEY)) return 0; s.removeItem(CHECKED_KEY); return 1; } catch { return 0; } }
/** The automatic check runs at most once a day per browser. */
export const DAY_MS = 24 * 60 * 60 * 1000;
/** @param {number} at @param {number} now */
export const checkDue = (at, now) => !(at > 0 && now >= at && now - at < DAY_MS);

/** The modules whose versions are followed: every installed entry, plus the Satchel itself. { id: version } */
export function installedVersions() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const e of Reg.entries()) { const m = Reg.moduleInfo(e.id); if (m?.version) out[e.id] = m.version; }
  const self = game.modules.get(ID)?.version; if (self) out[ID] = self;
  return out;
}
/** Active modules' versions only (what a backup holds). */
function activeVersions() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const e of Reg.entries()) { const m = Reg.moduleInfo(e.id); if (m?.active && m.version) out[e.id] = m.version; }
  const self = game.modules.get(ID)?.version; if (self) out[ID] = self;
  return out;
}

const listeners = new Set();
/** Called when notices, backups or the last check change. @param {() => void} fn */
export const onChange = (/** @type {() => void} */ fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => { for (const fn of listeners) { try { fn(); } catch { } } Reg.refreshWindows(); };

// ---------------------------------------------------------------- settings backups
/** @type {string | null} */ let lastError = null;
/** The last backup error (shown on the backups page), or null. */
export const backupError = () => lastError;
/** The stored backups, newest first (GM only; [] otherwise). */
export const backups = () => (game.user?.isGM ? Store.read().snapshots : []);

/**
 * GM: saves a backup of every active module's settings. `bundle`: one already built (the setup-time read), else built now.
 * Returns { ok, snapshot, error }; never throws.
 * @param {"manual" | "update" | "change" | "first"} reason @param {{ bundle?: any, versions?: Record<string, string>, extra?: (s: any) => any }} [o]
 */
export async function takeBackup(reason = "manual", { bundle = null, versions = activeVersions(), extra = s => s } = {}) {
  if (!game.user?.isGM) return { ok: false, snapshot: null, error: "GM only" };
  if (!F.on("settingsBackup") || !F.on("sharedSettings")) return { ok: false, snapshot: null, error: "settings backups are off" };
  try {
    const b = bundle ?? (await SettingsIO.build()).bundle;
    const r = SM.makeSnapshot(b, { reason, versions, now: Date.now() });
    if (!r.ok) { lastError = r.error; changed(); return r; }
    await Store.update(s => extra(SM.addSnapshot(s, r.snapshot)));
    lastError = null; log(`backup (${reason}): ${r.snapshot?.size} characters`);
    changed();
    return r;
  } catch (e) {
    lastError = String(/** @type {any} */ (e)?.message ?? e); console.warn(`${ID} | settings backup`, e); changed();
    return { ok: false, snapshot: null, error: lastError };
  }
}
/** GM: deletes one backup. @param {string} id */
export async function deleteBackup(id) {
  if (!game.user?.isGM) return false;
  await Store.update(s => SM.removeSnapshot(s, id)); changed(); return true;
}
/** One backup's bundle text, or null. @param {string} id */
export const backupText = (/** @type {string} */ id) => backups().find((/** @type {any} */ s) => s.id === id)?.text ?? null;

/**
 * After an update check: when updates are out that were not backed up yet, takes one backup ("update") and remembers which set
 * of updates it covered, so the same updates are not backed up again every day.
 * @param {Map<string, any>} results
 */
export async function backupForUpdates(results) {
  // Automatic, so only on the active GM's client (two GMs checking at once take one backup).
  if (!game.user?.isGM || !Store.isWriter() || !F.on("settingsBackup") || !F.on("sharedSettings")) return null;
  const key = SM.updateSetKey(results); if (!key) return null;
  if (Store.read().updateBackup === key) return null;
  return takeBackup("update", { extra: s => ({ ...s, updateBackup: key }) });
}

// ---------------------------------------------------------------- the version-change backup (setup read, ready write)
/** @type {{ read: Promise<{ bundle: any }>, versions: Record<string, string>, reason: "change" | "first" } | null} */
let pending = null;

/**
 * In Foundry's `setup` hook (GM, active GM's client only): when any followed module's version differs from the one recorded at the
 * last version-change backup (or no backup was ever recorded), reads every module's settings now, before the modules' `ready`
 * hooks run. The backup is written in `ready` (journal writes wait for the world to be ready).
 */
export function onSetup() {
  try {
    if (!game.user?.isGM || !Store.isWriter() || !F.on("settingsBackup") || !F.on("sharedSettings")) return;
    const store = Store.read(); const now = activeVersions();
    const first = !Object.keys(store.backed).length;
    const diff = SM.changes(store.backed, now).some(c => c.kind === "upgrade" || c.kind === "downgrade");
    if (!first && !diff) return;
    // build() reads every module's registered settings synchronously, before its first await, so these are the values as they
    // are at this point of the load.
    pending = { read: SettingsIO.build(), versions: now, reason: first ? "first" : "change" };
  } catch (e) { console.warn(`${ID} | setup backup`, e); }
}

/** In `ready`: writes the setup-time backup, if one was read. */
async function writePending() {
  if (!pending) return;
  const { read, versions, reason } = pending; pending = null;
  const { bundle } = await read;
  const r = await takeBackup(reason, { bundle, versions, extra: s => ({ ...s, backed: { ...versions } }) });
  if (r.ok && reason === "change") ui.notifications.info(`${TITLE}: a module's version changed; its settings from the start of this load were backed up (Satchel › Settings backups).`);
  if (!r.ok && r.error) ui.notifications.warn(`${TITLE}: settings backup not taken (${r.error}).`);
}

// ---------------------------------------------------------------- What's new
/** id → { from, to, state, notes, error } for this page load. */
const notices = new Map();
/** The current notices (a copy). */
export const news = () => new Map(notices);

/** Works out which modules changed since a GM last dismissed their notes, and fetches the notes. GM only. */
export async function scanNews() {
  if (!game.user?.isGM || !F.on("whatsNew")) return;
  const store = Store.read(); const now = installedVersions();
  const list = SM.changes(store.seen, now);
  const fresh = list.filter(c => c.kind === "fresh" || c.kind === "downgrade");
  // Modules seen for the first time (or older than recorded) are written in silently, by one GM.
  if (fresh.length && Store.isWriter()) {
    try { await Store.update(s => ({ ...s, seen: SM.withVersions(s.seen, Object.fromEntries(fresh.map(c => [c.id, c.to]))) })); } catch (e) { console.warn(`${ID} | versions seen`, e); }
  }
  const ups = list.filter(c => c.kind === "upgrade");
  for (const c of ups) notices.set(c.id, { from: c.from, to: c.to, state: "loading", notes: [], error: null });
  if (ups.length) changed();
  await Promise.all(ups.map(async c => {
    const m = c.id === ID ? { id: ID, ...pick(game.modules.get(ID)) } : Reg.moduleInfo(c.id);
    const r = m ? await N.fetchNotes(/** @type {any} */ (m), { from: c.from, to: c.to, fetch: globalThis.fetch?.bind(globalThis) }) : { ok: false, notes: [], error: "not installed" };
    notices.set(c.id, { from: c.from, to: c.to, state: r.ok ? "ok" : "error", notes: r.notes, error: r.error });
  }));
  if (ups.length) { changed(); ui.notifications.info(`${TITLE}: ${plural(ups.length, "module")} updated. What's new is on the Satchel's Overview.`); }
}
/** @param {any} m */
const pick = m => ({ title: m?.title, version: m?.version, changelog: m?.changelog, manifest: m?.manifest, url: m?.url });

/** GM: hides a module's notes until its next version (records the installed version as seen). @param {string} id */
export async function dismiss(id) {
  if (!game.user?.isGM) return;
  const n = notices.get(id); if (!n) return;
  notices.delete(id); changed();
  try { await Store.update(s => ({ ...s, seen: { ...s.seen, [id]: n.to } })); } catch (e) { console.warn(`${ID} | dismiss`, e); ui.notifications.error(`${TITLE}: couldn't remember that (${/** @type {any} */ (e)?.message ?? e}).`); }
}

// ---------------------------------------------------------------- ready
/**
 * In `ready` (GM): the setup-time backup, What's new, and the daily update check. `check` runs the update check (hub.mjs
 * checkUpdates) and resolves to its results. Never throws.
 * @param {(o: { force: boolean }) => Promise<Map<string, any>>} check
 */
export async function onReady(check) {
  if (!game.user?.isGM) return;
  try { await writePending(); } catch (e) { console.warn(`${ID} | backup`, e); }
  try { await scanNews(); } catch (e) { console.warn(`${ID} | what's new`, e); }
  try {
    if (F.on("updateCheck") && F.on("dailyUpdateCheck") && checkDue(lastChecked(), Date.now())) {
      const results = await check({ force: true });
      const n = [...results.values()].filter(r => r?.status === "update").length;
      if (n) ui.notifications.info(`${TITLE}: ${plural(n, "update")} available. Updates are installed from Foundry's Setup screen.`);
    }
  } catch (e) { console.warn(`${ID} | daily update check`, e); }
}
