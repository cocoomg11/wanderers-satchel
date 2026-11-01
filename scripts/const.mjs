/**
 * Shared constants and tiny helpers. No Foundry calls at import time, so every pure file can import this in Node.
 */
export const ID = "wanderers-satchel";
export const TITLE = "Wanderer's Satchel";
/** Hooks we fire (see README, Public API and hooks). */
export const HOOKS = { ready: `${ID}.ready` };

export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
