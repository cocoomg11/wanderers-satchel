/**
 * The Satchel's own health check, pure (tested in Node): lines from a small state object, each carrying a fix action id where the
 * Satchel can repair it itself (the ids are handled in self.mjs). Shown as its own group in the combined health check.
 *
 * State: { store: { exists, playersCanSee: [name], backups }, features: { id: on }, debugOn, updateErrors: number,
 *          updatesChecked: boolean }
 */

/** The Satchel's own fix action ids ("satchel:" is reserved: registrations can't use it). */
export const FIX = /** @type {const} */ ({ storePrivate: "satchel:storePrivate", debugOff: "satchel:debugOff", backupNow: "satchel:backupNow", recheck: "satchel:recheckUpdates" });

/**
 * @param {any} st
 * @returns {{ title: string, lines: { level: string, text: string, fix?: { label: string, action: string, confirm?: string } }[] }[]}
 */
export function selfReport(st) {
  const f = st?.features ?? {};
  const on = (/** @type {string} */ id) => f[id] !== false;
  const store = [];
  const s = st?.store ?? {};
  if (!s.exists) store.push({ level: "info", text: "No GM-only journal yet. It is made on the first settings backup or the first version recorded." });
  else if (s.playersCanSee?.length) store.push({ level: "bad", text: `The Satchel's GM-only journal can be seen by ${s.playersCanSee.join(", ")}. It holds settings backups.`, fix: { label: "Make GM only", action: FIX.storePrivate, confirm: "Set the journal's ownership back to None for every player?" } });
  else store.push({ level: "ok", text: "The GM-only journal is hidden from players." });
  if (on("settingsBackup") && on("sharedSettings")) {
    store.push(s.backups ? { level: "ok", text: `${s.backups} settings ${s.backups === 1 ? "backup" : "backups"} kept (at most 5).` } : { level: "info", text: "No settings backup yet.", fix: { label: "Back up now", action: FIX.backupNow } });
  }
  const other = [];
  if (on("updateCheck")) {
    if (st?.updateErrors) other.push({ level: "warn", text: `${st.updateErrors} ${st.updateErrors === 1 ? "module" : "modules"} couldn't be checked for updates (no answer, or an answer that couldn't be read).`, fix: { label: "Check again", action: FIX.recheck } });
    else if (st?.updatesChecked) other.push({ level: "ok", text: "Update check answered for every module." });
  }
  if (st?.debugOn) other.push({ level: "info", text: "The Satchel's debug logging is on (it writes to the browser console).", fix: { label: "Turn off", action: FIX.debugOff } });
  const out = [{ title: "Storage", lines: store }];
  if (other.length) out.push({ title: "Satchel", lines: other });
  return out;
}
