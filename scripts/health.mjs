/**
 * Combined health check (feature "combinedHealth"), GM only: runs every module's own check at once, each with its own time
 * limit (health-model.mjs), never throws, never changes anything itself. The window draws straight away and fills in as each
 * module answers, so one slow module never holds up the others.
 */
import { ID, TITLE } from "./const.mjs";
import * as H from "./health-model.mjs";
import { dependencyLines } from "./adapters-model.mjs";
import * as Reg from "./registry.mjs";
import * as Self from "./self.mjs";
import { log } from "./core.mjs";
import * as View from "./hub-view.mjs";
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow } from "../vendor/wanderers-core/foundry/index.mjs";

/** Per module, for this page load: how long its last answer took (the next limit is based on it). */
const lastMs = new Map();
/** Per module, its latest result from any run in this page load: id → { result, at }. The hub draws its status dots from it. */
const latestResults = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();
/** Called (with no arguments) whenever any module's result changes. Returns the unsubscribe function. @param {() => void} fn */
export const onResult = fn => { listeners.add(fn); return () => listeners.delete(fn); };
/** A copy of the latest results: Map id → { result, at }. */
export const latest = () => new Map(latestResults);
/** For tests and the README: the limits in use. */
export const LIMITS = { slowMs: H.SLOW_MS, firstRunMs: H.FIRST_RUN_MS, baseMs: H.BASE_MS, maxMs: H.MAX_MS };

const timeoutFor = (/** @type {any} */ e) => H.healthTimeout({ first: !lastMs.has(e.id), lastMs: lastMs.get(e.id) ?? null, own: e.healthTimeoutMs ?? null });

/**
 * Runs one module's check (the runner adds the time limit): { state, report?, error?, note? }. Adds dependency lines from the
 * module's manifest. Only on a GM client: the known modules' health APIs are GM-only. The module's check gets
 * `{ timeoutMs }` (H.moduleBudget of the Satchel's limit) so its own per-part limits agree with the Satchel's.
 * @param {any} e
 * @param {{ limitMs?: number }} [ctx]
 */
export async function checkOne(e, { limitMs = H.FIRST_RUN_MS } = {}) {
  const info = Reg.moduleInfo(e.id);
  if (!info) return { state: "failed", error: "not installed" };
  if (!info.active) return { state: "inactive" };
  let deps = [];
  try { deps = dependencyLines(info, id => Reg.moduleInfo(id), game.system?.id ?? null); } catch { }
  const depSection = deps.length ? [{ title: "Dependencies", lines: deps }] : [];
  const depsOnly = () => depSection.length ? { state: "ran", report: depSection, note: "No health check of its own; dependencies only." } : { state: "none" };
  if (typeof e.health !== "function") return depsOnly();
  const t0 = Date.now();
  try {
    const r = await e.health({ timeoutMs: H.moduleBudget(limitMs) });
    lastMs.set(e.id, Date.now() - t0);
    log(`health ${e.id}: ${Date.now() - t0} ms`);
    if (r === null) return depsOnly();
    return { state: "ran", report: [...depSection, ...H.normalizeReport(r)] };
  } catch (err) {
    lastMs.set(e.id, Date.now() - t0);
    console.warn(`${ID} | health check ${e.id}`, err);
    return { state: "failed", error: String(err?.message ?? err) };
  }
}

/**
 * Starts every module's check: { results, done, settled } (see health-model runChecks). GM only; a player gets nothing.
 * @param {string[] | null} [ids]
 * @param {(i: number, r: any) => void} [onChange]
 */
export function start(ids = null, onChange) {
  if (!game.user?.isGM) return null;
  // The Satchel's own check comes last (its storage, backups, update check).
  const list = [...Reg.entries(), Self.ENTRY].filter(e => !ids || ids.includes(e.id)).map(e => ({ ...e, title: e.title || Reg.moduleInfo(e.id)?.title || e.id }));
  const changed = (/** @type {number} */ i, /** @type {any} */ r) => {
    latestResults.set(r.id, { result: r, at: Date.now() });
    try { onChange?.(i, r); } catch { }
    for (const fn of listeners) { try { fn(); } catch { } }
  };
  return H.runChecks(list, checkOne, { timeoutFor, onChange: changed });
}

/**
 * Runs every module's check and returns { summary, groups } once each has answered or passed its limit. GM only.
 * @param {string[] | null} [ids]
 */
export async function run(ids = null) {
  const r = start(ids); if (!r) return undefined;
  return H.groupHealth(await r.done);
}

/**
 * The grouped report as HTML (every value escaped): static count badges, for the separate window and the chat card.
 * @param {any} g
 * @param {{ card?: boolean, filter?: Set<string> | null }} [o]
 */
export const html = (g, o = {}) => View.healthHtml(g, { ...o, summaryTitle: H.summaryText(g.summary) });

/** The entry behind a health group (a module's, or the Satchel's own). @param {string} id */
export const entryOf = (/** @type {string} */ id) => id === ID ? Self.ENTRY : Reg.entry(id);
/**
 * The fix on one line of a module's latest result, or null when that result or line is gone (a newer check replaced it).
 * @param {string} id @param {string} key
 */
export function fixOf(id, key) {
  const l = latestResults.get(id); if (!l) return null;
  return H.findFix(H.groupHealth([l.result]).groups[0], key);
}

/** Whispers the report to every GM as a chat card (wrapped in the shared look's root classes). @param {any} results */
export function post(results) {
  if (!game.user?.isGM) return;
  return ChatMessage.create({ content: html(H.groupHealth(results), { card: true }), whisper: game.users.filter((/** @type {any} */ u) => u.isGM).map((/** @type {any} */ u) => u.id), speaker: { alias: TITLE }, flags: { [ID]: { health: true } } });
}

export class HealthApp extends RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "health" }) {
  static DEFAULT_OPTIONS = { id: `${ID}-health`, classes: ["ws-window", "ws-health-window", ...UI_CLASSES], window: { title: `${TITLE} · Health check`, icon: "fa-solid fa-stethoscope", resizable: true }, position: { width: 600, height: 680 } };
  /** @param {any} [opts] */
  constructor(opts = {}) { super(opts); this.ids = opts.ids ?? null; /** @type {any} */ this.job = null; /** @type {HTMLElement | null} */ this.box = null; }
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "ws-scroll";
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    // A fresh run on each full render (Check again); updates while it runs only redraw the report part.
    this.job = start(this.ids, () => this.#draw());
    div.innerHTML = `<div class="ws-health-box" aria-live="polite"></div><footer class="wc-row wc-end ws-footer"><button type="button" class="wc-btn" data-act="again"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Check again</button><button type="button" class="wc-btn" data-act="post"><i class="fa-solid fa-comment" aria-hidden="true"></i> Whisper to GMs</button></footer>`;
    this.box = div.querySelector(".ws-health-box");
    div.querySelector("[data-act=again]")?.addEventListener("click", () => this.render());
    div.querySelector("[data-act=post]")?.addEventListener("click", () => { if (game.user.isGM && this.job) post(this.job.results); });
    this.#draw();
    return div;
  }
  #draw() { if (this.box && this.job) this.box.innerHTML = html(H.groupHealth(this.job.results)); }
  /** @param {any} result @param {HTMLElement} content */
  _replaceHTML(result, content) { content.replaceChildren(result); }
}
