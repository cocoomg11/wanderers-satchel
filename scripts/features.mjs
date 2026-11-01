/**
 * Features: one world setting per tool. A turned-off tool registers nothing (no hooks, buttons or key bindings) and its API entry is
 * undefined. Gate registration with on("<id>").
 */
import { ID, TITLE } from "./const.mjs";

export const FEATURES = [
  { id: "updateCheck", label: "Update check", hint: "Each module card asks the module's manifest (its latest GitHub release) whether a newer version is out. Answers are kept for this browser session. Off: nothing is fetched." },
  { id: "combinedHealth", label: "Combined health check", hint: "One button runs every module's own health check and shows the results grouped by module, with a summary on top." },
  { id: "sharedSettings", label: "Settings export / import for all", hint: "Save the settings of every module in the Satchel to one JSON file and load them back, with a preview of what would change." },
  { id: "debugAll", label: "Debug logging for all", hint: "One switch that turns each module's own Debug logging setting on or off." },
  { id: "sceneButton", label: "Scene control button", hint: "A Wanderer's Satchel button in the token controls (GM only)." }
].map(f => ({ default: true, key: `feature-${f.id}`, ...f }));

const byId = id => FEATURES.find(f => f.id === id);

/** Whether a tool is on in this world. Unknown ids count as on. */
export function on(id) {
  const f = byId(id); if (!f) return true;
  try { return !!game.settings.get(ID, f.key); } catch { return f.default; }
}

/** For API entry points: warns and returns false when the tool is off. */
export function need(id) {
  if (on(id)) return true;
  try { ui.notifications.warn(`${byId(id)?.label ?? id} is turned off in ${TITLE}'s settings.`); } catch { }
  return false;
}

export function registerSettings() {
  for (const f of FEATURES) game.settings.register(ID, f.key, { name: `Feature: ${f.label}`, hint: f.hint, scope: "world", config: true, type: Boolean, default: f.default, requiresReload: true });
}
