/**
 * Features and settings, the pure part (tested in Node). One world setting per tool (`feature-<id>`, requires reload): a
 * turned-off tool registers nothing (no hooks, buttons or key bindings) and its API entry is undefined. Setting keys never change.
 */

/** @type {import("../vendor/wanderers-core/features-model.mjs").FeatureInput[]} */
export const FEATURE_LIST = [
  { id: "updateCheck", label: "Update check", hint: "Asks each module's manifest (its latest GitHub release) whether a newer version is out. Answers are kept for this browser session. Off: nothing is fetched." },
  { id: "dailyUpdateCheck", label: "Daily update check", hint: "Once a day, when a GM loads the world, checks every module for updates and says so in a notification when one is out. Off: updates are only checked when you open the Satchel or press Check now.", needs: ["updateCheck"] },
  { id: "whatsNew", label: "What's new", hint: "After a module's version changes, shows the GM that module's release notes (from its changelog, or its GitHub releases) until dismissed." },
  { id: "settingsBackup", label: "Settings backups", hint: "Keeps the last 5 backups of every module's settings in a GM-only journal: one when updates are found, one on the first load after a version change, and any you take by hand. Restore goes through the import preview.", needs: ["sharedSettings"] },
  { id: "combinedHealth", label: "Combined health check", hint: "One button runs every module's own health check and shows the results grouped by module, with a summary on top." },
  { id: "sharedSettings", label: "Settings export / import for all", hint: "Save the settings of every module in the Satchel to one JSON file and load them back, with a preview of what would change." },
  { id: "healthFixes", label: "Health fix buttons", hint: "Health lines that a module can repair itself show a Fix button. Off: the lines show without it.", needs: ["combinedHealth"] },
  { id: "debugAll", label: "Debug logging for all", hint: "One switch that turns each module's own Debug logging setting on or off." },
  { id: "sceneButton", label: "Scene control button", hint: "A Wanderer's Satchel button in the token controls (GM only). Each GM can hide it in their own browser (client setting Scene control button in this browser)." }
];

/** Our own settings besides the feature switches (registered with config: false; shown in the hub). */
/** @type {import("../vendor/wanderers-core/settings-model.mjs").SettingRow[]} */
export const SETTING_ROWS = [
  { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "Writes what Wanderer's Satchel does (health check timings, update checks, imports) to the browser console (F12). Part of Debug logging for all." },
  // 0.6.0: core's "Module data" journal folder (GM-only store journals) is hidden from the Journal sidebar unless this is on, or
  // any other module's own `showModuleData` is. Per browser; switched on the hub's Maintenance page.
  // 0.7.0: the scene control button is also a per-browser choice (the world feature `sceneButton` still turns it off for all).
  { key: "showSceneButton", type: "bool", default: true, client: true, label: "Scene control button in this browser", hint: "Shows the Wanderer's Satchel button in the token controls in this browser (GM only). Needs the Scene control button feature.", onChange: () => { try { /** @type {any} */ (globalThis).ui?.controls?.render?.({ reset: true }); } catch { /* shows after the next reload */ } } },
  { key: "showModuleData", type: "bool", default: false, client: true, label: "Show module data folder", hint: "Shows the \"Module data\" folder (the GM-only journals your modules keep) in the Journal sidebar, in this browser.", onChange: () => { /** @type {any} */ (globalThis).ui?.journal?.render?.(); } }
];
