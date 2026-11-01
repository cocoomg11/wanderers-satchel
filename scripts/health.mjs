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

/** Per module, for this page load: how long its last answer took (the next limit is based on it). */
const lastMs = new Map();
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
  return H.runChecks(list, checkOne, { timeoutFor, onChange });
}

/**
 * Runs every module's check and returns { summary, groups } once each has answered or passed its limit. GM only.
 * @param {string[] | null} [ids]
 */
export async function run(ids = null) {
  const r = start(ids); if (!r) return undefined;
  return H.groupHealth(await r.done);
}

/** @type {Record<string, string>} */
const ICON = { ok: "✓", warn: "⚠", bad: "✗", off: "·", info: "i" };
/**
 * The grouped report as HTML (every value escaped).
 * @param {any} g
 */
export function html(g) {
  const body = g.groups.map((/** @type {any} */ x) => `<section class="ws-health-group ws-${x.worst}"><h3>${esc(x.title)} <span class="ws-counts">${x.state === "pending" || x.state === "slow" ? "<i class=\"fa-solid fa-spinner fa-spin\"></i>" : `${x.counts.ok} ✓ · ${x.counts.warn} ⚠ · ${x.counts.bad} ✗`}</span></h3>${x.note ? `<p class="hint">${esc(x.note)}</p>` : ""}${x.sections.map((/** @type {any} */ s) => `${s.title ? `<h4>${esc(s.title)}</h4>` : ""}<ul class="ws-lines">${s.lines.map((/** @type {any} */ l) => `<li class="ws-${l.level}"><span class="ws-icon">${ICON[l.level] ?? ""}</span>${esc(l.text)}</li>`).join("")}</ul>`).join("")}</section>`).join("");
  return `<div class="ws-health"><p class="ws-summary ws-${g.summary.worst}"><strong>${esc(H.summaryText(g.summary))}</strong></p>${body || "<p>No modules to check.</p>"}</div>`;
}

export class HealthApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-health`, classes: ["ws-window"], window: { title: `${TITLE} · Health check`, icon: "fa-solid fa-stethoscope", resizable: true }, position: { width: 600, height: 680 } };
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
