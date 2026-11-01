/**
 * Per-browser conveniences in localStorage: the health check filter (one choice shared by the Health check page and every module
 * page). Every read and write is wrapped: private windows, blocked site data or a full store give the default (All) and the
 * filter still works for the open window. Removed by Remove Satchel data (cleanup.mjs, category "cache").
 */
import { ID } from "./const.mjs";
import { readFilter, writeFilter } from "./filter-model.mjs";

export const FILTER_KEY = `${ID}.healthFilter`;
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The remembered filter (a Set; empty = All). */
export function loadFilter() {
  try { return readFilter(store()?.getItem(FILTER_KEY) ?? ""); } catch { return new Set(); }
}
/** Remembers the filter (All removes the key). @param {Set<string>} filter */
export function saveFilter(filter) {
  try {
    const s = store(); if (!s) return;
    if (filter.size) s.setItem(FILTER_KEY, writeFilter(filter)); else s.removeItem(FILTER_KEY);
  } catch { /* storage refused: the filter still works for this window */ }
}
/** Whether a filter is stored (for the cleanup counts). */
export function hasFilter() {
  try { return !!store()?.getItem(FILTER_KEY); } catch { return false; }
}
/** Forgets the stored filter. Returns 1 when one was removed. */
export function clearFilter() {
  try { const s = store(); if (!s?.getItem(FILTER_KEY)) return 0; s.removeItem(FILTER_KEY); return 1; } catch { return 0; }
}
