/**
 * The one place that binds wanderers-core (vendored in vendor/wanderers-core, pinned in wanderers-core.lock.json) to this module:
 * the feature registry, the settings table and debug logging. Importing this file calls nothing in Foundry; the objects touch
 * `game` only when used.
 *
 * The Satchel has no socket traffic and fires no broadcast hooks, so core's createLeader isn't used (it writes no documents on
 * its own; every write is a GM click).
 */
import { createFeatures, createSettings, createLogger } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { FEATURE_LIST, SETTING_ROWS } from "./features-model.mjs";

export const F = createFeatures(ID, FEATURE_LIST, { title: TITLE, where: "Configure Settings" });
export const S = createSettings(ID, SETTING_ROWS, { reserved: F.FEATURES.map(f => f.key) });
export const { log, warn, debugOn } = createLogger(ID);
