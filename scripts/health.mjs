/**
 * Combined health check (feature "combinedHealth"): runs each module's own check, never throws, never changes anything itself (a
 * module's own check may post its own card; see the adapter notes). Grouping and the summary are in health-model.mjs.
 */
import { ID, TITLE, esc } from "./const.mjs";
import * as H from "./health-model.mjs";
import { dependencyLines } from "./adapters-model.mjs";
import * as Reg from "./registry.mjs";

/** Per-module time limit, so one hung check doesn't hold the rest. */
export const HEALTH_TIMEOUT_MS = 20000;

const timeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`no answer within ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t)); };

/** Runs one module's check: { id, title, state, report?, error? }. Adds dependency lines from its manifest. */
export async function checkOne(e) {
  const info = Reg.moduleInfo(e.id);
  const base = { id: e.id, title: e.title || info?.title || e.id };
  if (!info) return { ...base, state: "failed", error: "not installed" };
  if (!info.active) return { ...base, state: "inactive" };
  let deps = [];
  try { deps = dependencyLines(info, id => Reg.moduleInfo(id), game.system?.id ?? null); } catch { }
  const depSection = deps.length ? [{ title: "Dependencies", lines: deps }] : [];
  if (typeof e.health !== "function") return depSection.length ? { ...base, state: "ran", report: depSection, note: "No health check of its own; dependencies only." } : { ...base, state: "none" };
  try {
    const r = await timeout(Promise.resolve().then(() => e.health()), HEALTH_TIMEOUT_MS);
    if (r === null) return depSection.length ? { ...base, state: "ran", report: depSection, note: "No health check of its own; dependencies only." } : { ...base, state: "none" };
    return { ...base, state: "ran", report: [...depSection, ...H.normalizeReport(r)] };
  } catch (err) {
    console.warn(`${ID} | health check ${e.id}`, err);
    return { ...base, state: "failed", error: String(err?.message ?? err) };
  }
}

/** Runs every module's check (one after another, so module cards that post to chat keep their order). */
export async function run(ids = null) {
  const list = Reg.entries().filter(e => !ids || ids.includes(e.id));
  const results = [];
  for (const e of list) results.push(await checkOne(e));
  return H.groupHealth(results);
}

const ICON = { ok: "✓", warn: "⚠", bad: "✗", off: "·", info: "i" };
/** The grouped report as HTML. */
export function html(g) {
  const body = g.groups.map(x => `<section class="ws-health-group ws-${x.worst}"><h3>${esc(x.title)} <span class="ws-counts">${x.counts.ok} ✓ · ${x.counts.warn} ⚠ · ${x.counts.bad} ✗</span></h3>${x.note ? `<p class="hint">${esc(x.note)}</p>` : ""}${x.sections.map(s => `${s.title ? `<h4>${esc(s.title)}</h4>` : ""}<ul class="ws-lines">${s.lines.map(l => `<li class="ws-${l.level}"><span class="ws-icon">${ICON[l.level] ?? ""}</span>${esc(l.text)}</li>`).join("")}</ul>`).join("")}</section>`).join("");
  return `<div class="ws-health"><p class="ws-summary ws-${g.summary.worst}"><strong>${esc(H.summaryText(g.summary))}</strong></p>${body || "<p>No modules to check.</p>"}</div>`;
}

export class HealthApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-health`, classes: ["ws-window"], window: { title: `${TITLE} · Health check`, icon: "fa-solid fa-stethoscope", resizable: true }, position: { width: 600, height: 680 } };
  constructor(opts = {}) { super(opts); this.ids = opts.ids ?? null; }
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "ws-scroll";
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    div.innerHTML = "<p><i class=\"fa-solid fa-spinner fa-spin\"></i> Running checks…</p>";
    const g = await run(this.ids);
    div.innerHTML = `${html(g)}<footer class="ws-footer"><button type="button" data-act="again"><i class="fa-solid fa-rotate"></i> Check again</button><button type="button" data-act="post"><i class="fa-solid fa-comment"></i> Whisper to GMs</button></footer>`;
    div.querySelector("[data-act=again]").addEventListener("click", () => this.render());
    div.querySelector("[data-act=post]").addEventListener("click", () => ChatMessage.create({ content: html(g), whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: { alias: TITLE }, flags: { [ID]: { health: true } } }));
    return div;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }
}
