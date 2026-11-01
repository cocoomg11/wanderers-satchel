/**
 * Shared constants. No Foundry calls at import time, so every pure file can import this in Node. Text helpers come from the
 * vendored wanderers-core (one copy for every module).
 */
export { esc, plural, plain } from "../vendor/wanderers-core/index.mjs";

export const ID = "wanderers-satchel";
export const TITLE = "Wanderer's Satchel";
/** Hooks we fire (see README, Public API and hooks). */
export const HOOKS = { ready: `${ID}.ready` };
/**
 * The default key for opening the hub (0.7.0): Shift+G. Not Shift+W/A/S/D (core: token facing), Shift+C (core: chat focus) or
 * Shift+T (core: target); dnd5e uses Shift+B and Shift+E; the toolkit Shift+K (and L), Red Book Shift+R (and Ctrl+Shift+N).
 */
export const OPEN_KEY = Object.freeze({ key: "KeyG", modifiers: Object.freeze(["Shift"]) });
