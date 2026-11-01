/**
 * Combined health check (feature "combinedHealth"), GM only: runs every module's own check at once, each with its own time
 * limit (health-model.mjs), never throws, never changes anything itself. The window draws straight away and fills in as each
 * module answers, so one slow module never holds up the others.
 */
import { ID, TITLE, esc } from "./const.mjs";
import * as H from "./health-model.mjs";
import { dependencyLines } from "./adapters-model.mjs";
import * as Reg from "./registry.mjs";
import { log } from "./core.mjs";
import { icon, badge, groupSections } from "./hub-view.mjs";

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
  const list = Reg.entries().filter(e => !ids || ids.includes(e.id)).map(e => ({ ...e, title: e.title || Reg.moduleInfo(e.id)?.title || e.id }));
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

/** The summary as count badges. @param {any} s */
export function summaryHtml(s) {
  const b = (/** @type {string} */ lv, /** @type {string} */ t) => badge(lv, t, { icon: true });
  const extra = [s.waiting ? b("pending", `${s.waiting} still checking`) : "", s.failed ? b("bad", `${s.failed} failed`) : "", s.none ? b("off", `${s.none} without a check`) : "", s.inactive ? b("off", `${s.inactive} not active`) : ""].join("");
  return `<span class="ws-summary-text">${s.modules} module${s.modules === 1 ? "" : "s"}</span>${b("ok", `${s.ok} ok`)}${b("warn", `${s.warn} warning${s.warn === 1 ? "" : "s"}`)}${b("bad", `${s.bad} problem${s.bad === 1 ? "" : "s"}`)}${extra}`;
}

/**
 * The grouped report as HTML (every value escaped).
 * @param {any} g
 */
export function html(g) {
  const body = g.groups.map((/** @type {any} */ x) => `<section class="ws-health-group" aria-label="${esc(x.title)}"><h3>${icon(x.state === "pending" || x.state === "slow" ? "pending" : x.worst)}<span class="ws-grow">${esc(x.title)}</span><span class="ws-counts">${x.state === "pending" || x.state === "slow" ? "" : `${x.counts.ok} ok · ${x.counts.warn} warn · ${x.counts.bad} bad`}</span></h3>${x.note ? `<p class="hint">${esc(x.note)}</p>` : ""}${groupSections(x)}</section>`).join("");
  return `<div class="ws-health"><p class="ws-summary" title="${esc(H.summaryText(g.summary))}">${summaryHtml(g.summary)}</p>${body || "<p>No modules to check.</p>"}</div>`;
}

export class HealthApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-health`, classes: ["ws-window", "ws-health-window"], window: { title: `${TITLE} · Health check`, icon: "fa-solid fa-stethoscope", resizable: true }, position: { width: 600, height: 680 } };
  /** @param {any} [opts] */
  constructor(opts = {}) { super(opts); this.ids = opts.ids ?? null; /** @type {any} */ this.job = null; /** @type {HTMLElement | null} */ this.box = null; }
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "ws-scroll";
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    // A fresh run on each full render (Check again); updates while it runs only redraw the report part.
    this.job = start(this.ids, () => this.#draw());
    div.innerHTML = `<div class="ws-health-box"></div><footer class="ws-footer"><button type="button" data-act="again"><i class="fa-solid fa-rotate"></i> Check again</button><button type="button" data-act="post"><i class="fa-solid fa-comment"></i> Whisper to GMs</button></footer>`;
    this.box = div.querySelector(".ws-health-box");
    div.querySelector("[data-act=again]")?.addEventListener("click", () => this.render());
    div.querySelector("[data-act=post]")?.addEventListener("click", () => {
      if (!game.user.isGM || !this.job) return;
      ChatMessage.create({ content: html(H.groupHealth(this.job.results)), whisper: game.users.filter((/** @type {any} */ u) => u.isGM).map((/** @type {any} */ u) => u.id), speaker: { alias: TITLE }, flags: { [ID]: { health: true } } });
    });
    this.#draw();
    return div;
  }
  #draw() { if (this.box && this.job) this.box.innerHTML = html(H.groupHealth(this.job.results)); }
  /** @param {any} result @param {HTMLElement} content */
  _replaceHTML(result, content) { content.replaceChildren(result); }
}
