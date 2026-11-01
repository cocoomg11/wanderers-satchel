/**
 * Features and settings, the pure part (tested in Node). One world setting per tool (`feature-<id>`, requires reload): a
 * turned-off tool registers nothing (no hooks, buttons or key bindings) and its API entry is undefined. Setting keys never change.
 */

/** @type {import("../vendor/wanderers-core/features-model.mjs").FeatureInput[]} */
export const FEATURE_LIST = [
  { id: "updateCheck", label: "Update check", hint: "Each module card asks the module's manifest (its latest GitHub release) whether a newer version is out. Answers are kept for this browser session. Off: nothing is fetched." },
  { id: "combinedHealth", label: "Combined health check", hint: "One button runs every module's own health check and shows the results grouped by module, with a summary on top." },
  { id: "sharedSettings", label: "Settings export / import for all", hint: "Save the settings of every module in the Satchel to one JSON file and load them back, with a preview of what would change." },
  { id: "debugAll", label: "Debug logging for all", hint: "One switch that turns each module's own Debug logging setting on or off." },
  { id: "sceneButton", label: "Scene control button", hint: "A Wanderer's Satchel button in the token controls (GM only)." }
];

/** Our own settings besides the feature switches (registered with config: false; shown in the hub). */
/** @type {import("../vendor/wanderers-core/settings-model.mjs").SettingRow[]} */
export const SETTING_ROWS = [
  { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "Writes what Wanderer's Satchel does (health check timings, update checks, imports) to the browser console (F12). Part of Debug logging for all." }
];
