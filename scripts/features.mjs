/**
 * Features: the registry from wanderers-core (createFeatures), bound to this module in core.mjs. Gate registration with on("<id>").
 */
import { F, S } from "./core.mjs";

export const FEATURES = F.FEATURES;
/** Whether a tool is on in this world. Unknown ids count as on. */
export const on = id => F.on(id);
/** For API entry points: warns and returns false when the tool is off. */
export const need = id => F.need(id);
/** Registers the feature switches (listed in Configure Settings) and our other settings. Call in "init". */
export function registerSettings() { F.register({ config: true }); S.register(); }
