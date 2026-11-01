/**
 * Per-browser conveniences in localStorage: the health check filter (one choice shared by the Health check page and every module
 * page). Nothing stored means the default (0.7.0: Warnings + Problems + Still checking); a choice, All included (`[]`), is kept.
 * Every read and write is wrapped: private windows, blocked site data or a full store give the default and the filter still
 * works for the open window. Removed by Remove Satchel data (cleanup.mjs, category "cache").
 */
import { ID } from "./const.mjs";
import { readFilter, writeFilter, defaultFilter } from "./filter-model.mjs";

export const FILTER_KEY = `${ID}.healthFilter`;
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The remembered filter (a Set; empty = All); the default when nothing is stored or storage can't be read. */
export function loadFilter() {
  try { return readFilter(store()?.getItem(FILTER_KEY) ?? ""); } catch { return defaultFilter(); }
}
/** Remembers the filter, All too (stored as `[]`, so the default doesn't come back). @param {Set<string>} filter */
export function saveFilter(filter) {
  try { store()?.setItem(FILTER_KEY, writeFilter(filter)); } catch { /* storage refused: the filter still works for this window */ }
}
/** Whether a filter is stored (for the cleanup counts). */
export function hasFilter() {
  try { return !!store()?.getItem(FILTER_KEY); } catch { return false; }
}
/** Forgets the stored filter. Returns 1 when one was removed. */
export function clearFilter() {
  try { const s = store(); if (!s?.getItem(FILTER_KEY)) return 0; s.removeItem(FILTER_KEY); return 1; } catch { return 0; }
}
