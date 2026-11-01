/**
 * The Satchel's own entry in the combined health check (not a sidebar page): its health lines (self-model.mjs) and the fixes
 * behind their Fix buttons. Also `runFix`, which carries out any module's fix from a health line. GM only.
 */
import { ID, TITLE, esc } from "./const.mjs";
import * as F from "./features.mjs";
import * as Store from "./store.mjs";
import * as Life from "./lifecycle.mjs";
import { selfReport, FIX } from "./self-model.mjs";
import { S } from "./core.mjs";

/** @type {(o: { force: boolean }) => Promise<Map<string, any>>} */
let recheck = async () => new Map();
/** @type {() => Map<string, any>} */
let results = () => new Map();
/** Hands in the update check (hub.mjs), so this file doesn't import the hub. @param {typeof recheck} check @param {typeof results} res */
export function bindUpdates(check, res) { recheck = check; results = res; }

function storeStatus() {
  const j = Store.entry(); if (!j) return { exists: false, playersCanSee: [], backups: 0 };
  /** @type {string[]} */ let see = [];
  try { see = game.users.filter((/** @type {any} */ u) => !u.isGM && j.testUserPermission(u, "LIMITED")).map((/** @type {any} */ u) => u.name); } catch { }
  return { exists: true, playersCanSee: see, backups: Store.read().snapshots.length };
}

export const ENTRY = {
  id: ID, title: TITLE, source: "self",
  health: () => {
    if (!game.user?.isGM) throw new Error("GM only");
    const r = results();
    return selfReport({
      store: storeStatus(),
      features: Object.fromEntries(F.FEATURES.map(f => [f.id, F.on(f.id)])),
      debugOn: S.get("debugLog") === true,
      updateErrors: [...r.values()].filter(x => x?.status === "error").length,
      updatesChecked: r.size > 0
    });
  },
  fixes: {
    [FIX.storePrivate]: async () => {
      const j = Store.entry(); if (!j) return "Nothing to fix: there is no journal.";
      const NONE = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
      /** @type {Record<string, number>} */ const ownership = { default: NONE };
      for (const [uid, lvl] of Object.entries(j.ownership ?? {})) if (uid !== "default" && game.users.get(uid)?.isGM) ownership[uid] = /** @type {number} */ (lvl);
      await j.update({ ownership }, { diff: false, recursive: false });
      return "The journal is GM only again.";
    },
    [FIX.debugOff]: async () => { await S.set("debugLog", false); return "Debug logging is off."; },
    [FIX.backupNow]: async () => { const r = await Life.takeBackup("manual"); if (!r.ok) throw new Error(r.error ?? "not taken"); return "Settings backed up."; },
    [FIX.recheck]: async () => { await recheck({ force: true }); return "Checked again."; }
  }
};

/**
 * Carries out a health line's fix: its own `run`, or the action id from the entry's `fixes`. Asks first when the fix has a
 * `confirm` text. Returns { ok, message } for a notification; never throws. The context passed to the fix:
 * { id, line: { level, text }, action }.
 * @param {any} entry @param {{ line: any, fix: any }} found
 */
export async function runFix(entry, found) {
  if (!game.user?.isGM) return { ok: false, message: "GM only." };
  if (!F.on("healthFixes")) return { ok: false, message: "Health fix buttons are off." };
  const { fix, line } = found;
  const fn = typeof fix.run === "function" ? fix.run : fix.action ? entry?.fixes?.[fix.action] : null;
  if (typeof fn !== "function") return { ok: false, message: `${entry?.title ?? "The module"} has no fix "${fix.action ?? fix.label}" any more.` };
  if (fix.confirm) {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: `${TITLE}: ${fix.label}` }, content: `<p>${esc(fix.confirm)}</p>`, rejectClose: false }).catch(() => false);
    if (!yes) return { ok: false, message: "" };
  }
  try {
    const r = await fn({ id: entry.id, line: { level: line.level, text: line.text }, action: fix.action ?? null });
    if (r === false) return { ok: false, message: `${fix.label}: nothing was changed.` };
    return { ok: true, message: typeof r === "string" && r ? r : `${fix.label}: done.` };
  } catch (e) {
    console.warn(`${ID} | fix ${entry?.id}`, e);
    return { ok: false, message: `${fix.label} failed: ${/** @type {any} */ (e)?.message ?? e}` };
  }
}
