/**
 * Shared constants. No Foundry calls at import time, so every pure file can import this in Node. Text helpers come from the
 * vendored wanderers-core (one copy for every module).
 */
export { esc, plural, plain } from "../vendor/wanderers-core/index.mjs";

export const ID = "wanderers-satchel";
export const TITLE = "Wanderer's Satchel";
/** Hooks we fire (see README, Public API and hooks). */
export const HOOKS = { ready: `${ID}.ready` };
