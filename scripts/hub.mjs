/**
 * The hub window (GM only), a page router with a sidebar: Overview; one page per module (status dot from its last health check,
 * warning count); Tools: Health check, Settings transfer (Export / Import tabs), Maintenance (Remove Satchel data). Pages and their
 * models live in hub-model.mjs (router, view models) and hub-view.mjs (HTML), both pure. HTML is built in code (no templates);
 * clicks go through ApplicationV2 `actions`. Update checks start after the first draw and fill in as they answer; health results
 * from any run (this window, a module page, the separate health window) update the dots as they come in.
 */
import { ID, TITLE, esc, plural } from "./const.mjs";
import * as H from "./health-model.mjs";
import * as F from "./features.mjs";
import * as V from "./version-model.mjs";
import * as Reg from "./registry.mjs";
import * as SettingsIO from "./settings-io.mjs";
import * as Health from "./health.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as HM from "./hub-model.mjs";
import * as View from "./hub-view.mjs";
import * as Prefs from "./prefs.mjs";
import { toggleFilter } from "./filter-model.mjs";
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { log } from "./core.mjs";

const { cache } = Cleanup;

/** @type {Map<string, any>} */
const updates = new Map(); // id → result (this page load); the session cache keeps them across reloads
/** @type {Promise<Map<string, any>> | null} */
let checking = null;

/** Checks every installed module in the list (cached for the session unless `force`). */
export async function checkUpdates({ force = false } = {}) {
  if (!F.on("updateCheck") || !game.user?.isGM) return updates;
  if (checking && !force) return checking;
  const c = cache();
  checking = (async () => {
    await Promise.all(Reg.entries().map(async e => {
      const m = Reg.moduleInfo(e.id); if (!m) return;
      updates.set(e.id, await V.checkUpdate(m, { fetch: globalThis.fetch?.bind(globalThis), cache: c, force }));
    }));
    Reg.refreshWindows();
    return updates;
  })().finally(() => { checking = null; });
  return checking;
}

// ---------------------------------------------------------------- debug logging for all
function debugDefs() {
  const out = new Map();
  for (const [, c] of game.settings.settings) out.set(`${c.namespace}.${c.key}`, { type: c.type, scope: c.scope });
  return out;
}
/** The Satchel's own debug setting, part of "Debug logging for all". */
const SELF = { id: ID, title: TITLE, debugSetting: { namespace: ID, key: "debugLog" } };
/** Debug logging for all: { rows, state, missing } over every active entry with a debug setting, plus the Satchel itself. */
export function debugState() {
  const d = debugDefs(); /** @type {Record<string, unknown>} */ const cur = {};
  const list = [...Reg.entries().filter((/** @type {any} */ e) => game.modules.get(e.id)?.active), SELF];
  for (const e of list) if (e.debugSetting) { const k = `${e.debugSetting.namespace}.${e.debugSetting.key}`; try { cur[k] = game.settings.get(e.debugSetting.namespace, e.debugSetting.key); } catch { } }
  return Reg.R.debugPlan(list, d, cur);
}
/** Turns every module's debug setting on or off. Returns the number changed. */
/** @param {boolean} on */
export async function setDebugAll(on) {
  if (!game.user?.isGM) { ui.notifications.warn("GM only."); return 0; }
  let n = 0;
  for (const r of debugState().rows) {
    if (r.on === !!on) continue;
    try { await game.settings.set(r.namespace, r.key, !!on); n++; } catch (e) { console.warn(`${ID} | debug ${r.id}`, e); }
  }
  Reg.refreshWindows();
  return n;
}

// ---------------------------------------------------------------- the window
const safe = (/** @type {() => unknown} */ fn) => { try { return !!fn(); } catch { return false; } };
const features = () => ({ updateCheck: F.on("updateCheck"), combinedHealth: F.on("combinedHealth"), sharedSettings: F.on("sharedSettings"), debugAll: F.on("debugAll") });
const NO_DEBUG = { rows: [], state: "none", missing: [] };

/** The live data every page draws from. */
function snapshot() {
  const list = Reg.entries();
  const items = list.map((/** @type {any} */ e) => Reg.R.cardModel(e, Reg.moduleInfo(e.id), updates.get(e.id) ?? null));
  return { list, items, health: HM.healthIndex(Health.latest()), features: features(), debug: F.on("debugAll") ? debugState() : NO_DEBUG, now: Date.now() };
}

export class HubApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${ID}-hub`, classes: ["ws-window", "ws-hub", ...UI_CLASSES],
    window: { title: TITLE, icon: "fa-solid fa-bag-shopping", resizable: true },
    position: { width: 1000, height: 720 },
    actions: {
      nav: HubApp.#onNav, panel: HubApp.#onPanel, docs: HubApp.#onLink, changelog: HubApp.#onLink, bugs: HubApp.#onLink, extra: HubApp.#onExtra,
      recheckUpdates: HubApp.#onRecheck, checkAll: HubApp.#onCheckAll, healthOne: HubApp.#onHealthOne, healthAgain: HubApp.#onCheckAll, healthPost: HubApp.#onPost, healthFilter: HubApp.#onFilter,
      export: HubApp.#onExport, pickImport: HubApp.#onPickImport, doImport: HubApp.#onImport, cancelImport: HubApp.#onCancelImport, removeData: HubApp.#onRemove
    }
  };
  /** Foundry's tab groups (Settings transfer: Export / Import). */
  static TABS = { transfer: { tabs: [{ id: "export", label: "Export" }, { id: "import", label: "Import" }], initial: "export" } };

  /** @param {any} [opts] */
  constructor(opts = {}) {
    super(opts);
    this.router = HM.createRouter(() => ({ ids: Reg.entries().map((/** @type {any} */ e) => e.id), features: features() }), opts.page ?? "overview");
    this.tabGroups = { transfer: "export" };
    /** Health page run (started on first visit, Check again restarts). @type {any} */
    this.healthJob = null;
    /** Import state: file, readText result, ticks, last file error. @type {{ file: any, result: any, ticks: Set<string>, error: any }} */
    this.imp = { file: null, result: null, ticks: new Set(), error: null };
    this._untrack = Reg.trackWindow(this);
    this._unlisten = Health.onResult(() => this.refresh());
    /** @type {any} */ this._timer = null;
    /** The health filter (Set of keys; empty = All), remembered per browser. */
    this.filter = Prefs.loadFilter();
  }
  async close(opts) { this._untrack?.(); this._unlisten?.(); clearTimeout(this._timer); return super.close(opts); }

  /** Shows a page ("overview", "module:<id>", "health", "transfer", "maintenance"). @param {string} page */
  go(page) {
    const changed = this.router.go(page);
    if (this.router.page === "health" && !this.healthJob) this.healthJob = Health.start(null, () => this.refresh());
    if (changed && this.rendered) this.render();
    return this.router.page;
  }

  async _renderHTML() {
    const root = document.createElement("div"); root.className = "wc-shell";
    if (!game.user.isGM) { root.textContent = "GM only."; return root; }
    this.router.refresh();
    if (this.router.page === "health" && !this.healthJob) this.healthJob = Health.start(null, () => this.refresh());
    const d = snapshot();
    root.innerHTML = `${this.#nav(d)}<main class="wc-main" tabindex="-1" aria-label="${esc(this.#pageTitle(d))}">${this.#page(d)}</main>`;
    if (d.features.updateCheck && d.list.some((/** @type {any} */ e) => !updates.has(e.id) && Reg.moduleInfo(e.id))) checkUpdates();
    return root;
  }
  /** @param {any} result @param {HTMLElement} content */
  _replaceHTML(result, content) {
    const top = content.querySelector(".wc-main")?.scrollTop ?? 0;
    const same = this._lastPage === this.router.page; this._lastPage = this.router.page;
    content.replaceChildren(result);
    const main = /** @type {HTMLElement | null} */ (content.querySelector(".wc-main"));
    if (main && same) main.scrollTop = top;
    this.#fillHealth();
  }
  /** @param {any} context @param {any} options */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    const el = this.element;
    el.addEventListener("change", (/** @type {Event} */ ev) => this.#onChange(ev));
    el.addEventListener("keydown", (/** @type {KeyboardEvent} */ ev) => this.#onKey(ev));
  }

  /**
   * Redraws in place after new data (update answers, health results, a registration): the sidebar always, the page unless it is
   * Maintenance (a half-typed confirm word is kept). Batched, keeps the scroll position.
   */
  refresh() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this.rendered || !game.user?.isGM) return;
      if (this.router.refresh()) { this.render(); return; }
      const d = snapshot(); const el = this.element;
      const nav = el.querySelector(".wc-side"); const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.(".wc-nav") ? /** @type {HTMLElement} */ (document.activeElement).dataset.page : null;
      if (nav) { nav.outerHTML = this.#nav(d); if (focused) /** @type {HTMLElement | null} */ (el.querySelector(`.wc-nav[data-page="${CSS.escape(focused)}"]`))?.focus(); }
      const main = /** @type {HTMLElement | null} */ (el.querySelector(".wc-main"));
      if (!main) return;
      if (this.router.page === "health") { this.#fillHealth(); return; }
      if (this.router.page === "maintenance" || this.router.page === "transfer") return;
      const top = main.scrollTop; main.innerHTML = this.#page(d); main.scrollTop = top;
    }, 60);
  }

  /** @param {any} d */
  #nav(d) {
    return View.navHtml(HM.navModel({ items: d.items, health: d.health, features: d.features, version: game.modules.get(ID)?.version ?? "", page: this.router.page }));
  }
  /** @param {any} d */
  #pageTitle(d) {
    const p = HM.parsePage(this.router.page);
    if (p.kind === "module") return d.items.find((/** @type {any} */ x) => x.id === p.id)?.title ?? p.id ?? "";
    return { overview: "Overview", health: "Health check", transfer: "Settings transfer", maintenance: "Maintenance" }[p.kind] ?? "";
  }
  /** @param {any} d */
  #page(d) {
    const p = HM.parsePage(this.router.page);
    switch (p.kind) {
      case "module": {
        const item = d.items.find((/** @type {any} */ x) => x.id === p.id); const entry = d.list.find((/** @type {any} */ x) => x.id === p.id);
        if (!item) return "";
        const extras = (entry.extraActions ?? []).map((/** @type {any} */ x, /** @type {number} */ i) => ({ i, label: x.label, icon: x.icon ?? "fa-solid fa-wand-magic", ok: x.available ? safe(x.available) : true })).filter((/** @type {any} */ x) => x.ok);
        return View.moduleHtml(HM.moduleModel({ item, entry, update: updates.get(item.id) ?? null, health: d.health.get(item.id) ?? null, features: d.features, debug: d.debug, extras, now: d.now }), { filter: this.filter });
      }
      case "health": return View.healthPageHtml();
      case "transfer": return View.transferHtml({ tab: this.tabGroups.transfer ?? "export", error: this.imp.error, file: this.imp.file, result: this.imp.result, model: this.imp.result ? HM.importModel(this.imp.result, this.imp.ticks) : null });
      case "maintenance": return View.maintenanceHtml(Cleanup.counts(), /** @type {[string, string][]} */ (Cleanup.CATEGORIES), Cleanup.CONFIRM_WORD);
      default: return View.overviewHtml(HM.overviewModel({ items: d.items, updates, health: d.health, features: d.features, debug: d.debug, now: d.now }), { updateCheck: d.features.updateCheck, combinedHealth: d.features.combinedHealth, id: ID });
    }
  }
  #fillHealth() {
    const box = this.element?.querySelector?.(".ws-health-box");
    if (!box || !this.healthJob) return;
    // Results come in while the GM may be on a filter chip: keep focus on the same chip across the redraw.
    const chip = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.("[data-action=healthFilter]") ? /** @type {HTMLElement} */ (document.activeElement).dataset.filter : null;
    const g = H.groupHealth(this.healthJob.results);
    box.innerHTML = View.healthHtml(g, { filter: this.filter, summaryTitle: H.summaryText(g.summary) });
    if (chip) /** @type {HTMLElement | null} */ (box.querySelector(`[data-action="healthFilter"][data-filter="${CSS.escape(chip)}"]`))?.focus();
  }

  /** Foundry's tab switch, plus aria-selected. @param {string} tab @param {string} group @param {any} [options] */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    for (const b of this.element.querySelectorAll(`[data-action="tab"][data-group="${group}"]`)) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  }

  // ------------------------------------------------------------ events
  /** @param {Event} ev */
  async #onChange(ev) {
    const t = /** @type {HTMLInputElement} */ (ev.target); const kind = t?.dataset?.change; if (!kind || !game.user?.isGM) return;
    if (kind === "debugAll") { const n = await setDebugAll(t.checked); ui.notifications.info(`${TITLE}: debug logging ${t.checked ? "on" : "off"} (${n} changed).`); return; }
    if (kind === "debugOne") {
      const r = debugState().rows.find((/** @type {any} */ x) => x.id === t.dataset.id); if (!r) return;
      try { await game.settings.set(r.namespace, r.key, t.checked); log(`debug ${r.id} ${t.checked}`); } catch (e) { console.warn(`${ID} | debug ${r.id}`, e); }
      this.refresh(); return;
    }
    if (kind === "tick") {
      const k = HM.tickKey(Number(t.dataset.m), Number(t.dataset.r));
      if (t.checked) this.imp.ticks.add(k); else this.imp.ticks.delete(k);
      const model = HM.importModel(this.imp.result, this.imp.ticks); const el = this.element;
      const facts = el.querySelector("[data-part=facts]"); if (facts) facts.innerHTML = View.factsHtml(model);
      const foot = el.querySelector("[data-part=footer]"); if (foot) foot.innerHTML = View.footerHtml(model);
      const m = model.modules[Number(t.dataset.m)]; const b = el.querySelector(`[data-part="badges-${t.dataset.m}"]`);
      if (m && b) b.innerHTML = m.badges.map((/** @type {any} */ x) => View.badge(x.level, x.text)).join("");
    }
  }
  /** Sidebar: arrow keys, Home, End move between links (roving focus). @param {KeyboardEvent} ev */
  #onKey(ev) {
    const t = /** @type {HTMLElement} */ (ev.target); if (!t?.classList?.contains("wc-nav")) return;
    const links = [...this.element.querySelectorAll(".wc-side .wc-nav")].map(x => /** @type {HTMLElement} */ (x));
    const next = HM.moveFocus(links.map(x => x.dataset.page ?? ""), t.dataset.page ?? "", ev.key); if (!next) return;
    ev.preventDefault();
    const to = links.find(x => x.dataset.page === next); if (!to) return;
    for (const x of links) x.tabIndex = x === to ? 0 : -1;
    to.focus();
  }

  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onNav(_ev, target) {
    if (!game.user?.isGM) return;
    this.go(target.dataset.page ?? "overview");
    /** @type {HTMLElement | null} */ (this.element.querySelector(".wc-main"))?.focus({ preventScroll: true });
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onPanel(_ev, target) { if (game.user?.isGM) Reg.openPanel(target.dataset.id); }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onLink(_ev, target) {
    if (!game.user?.isGM) return;
    const id = target.dataset.id ?? ""; const docs = Reg.R.docLinks(Reg.moduleInfo(id) ?? { id }, Reg.entry(id)?.docs);
    const act = target.dataset.action;
    Reg.openLink(act === "bugs" ? docs.bugs : act === "changelog" ? docs.changelog : docs.readme ?? docs.home ?? docs.changelog);
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onExtra(_ev, target) {
    if (!game.user?.isGM) return;
    const x = Reg.entry(target.dataset.id ?? "")?.extraActions?.[Number(target.dataset.i)];
    try { await x?.run?.(); } catch (e) { ui.notifications.error(`${TITLE}: ${e?.message ?? e}`); }
  }
  /** @this {HubApp} */
  static #onRecheck() { if (!game.user?.isGM) return; updates.clear(); this.refresh(); checkUpdates({ force: true }); }
  /** @this {HubApp} */
  static #onCheckAll() {
    if (!game.user?.isGM || !F.on("combinedHealth")) return;
    this.healthJob = Health.start(null, () => this.refresh());
    if (this.router.page === "health") this.#fillHealth(); else this.go("health");
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onHealthOne(_ev, target) { if (game.user?.isGM && F.on("combinedHealth")) { Health.start([target.dataset.id ?? ""]); this.refresh(); } }
  /** @this {HubApp} */
  static #onPost() { if (game.user?.isGM && this.healthJob) Health.post(this.healthJob.results); }
  /**
   * A health filter chip (Health check page and module pages): toggles that level, All clears. Redraws the report in place and
   * keeps keyboard focus on the same chip.
   * @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target
   */
  static #onFilter(_ev, target) {
    if (!game.user?.isGM) return;
    this.filter = toggleFilter(this.filter, target.dataset.filter ?? "all"); Prefs.saveFilter(this.filter);
    const key = target.dataset.filter ?? "all"; const el = this.element;
    if (this.router.page === "health") { this.#fillHealth(); return; }
    { const main = /** @type {HTMLElement | null} */ (el.querySelector(".wc-main")); if (main) { const top = main.scrollTop; main.innerHTML = this.#page(snapshot()); main.scrollTop = top; } }
    /** @type {HTMLElement | null} */ (el.querySelector(`[data-action="healthFilter"][data-filter="${CSS.escape(key)}"]`))?.focus();
  }
  /** @this {HubApp} */
  static #onExport() { if (game.user?.isGM && F.on("sharedSettings")) SettingsIO.exportFile(); }
  /** @this {HubApp} */
  static #onPickImport() { if (game.user?.isGM) this.pickImport(); }
  /** @this {HubApp} */
  static #onCancelImport() { this.imp = { file: null, result: null, ticks: new Set(), error: null }; this.render(); }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onImport(_ev, target) {
    if (!game.user?.isGM || !this.imp.result) return;
    const r = this.imp.result;
    const picks = r.modules.map((/** @type {any} */ m, /** @type {number} */ i) => ({ id: m.id, how: m.how, rows: m.ok ? m.rows.filter((/** @type {any} */ _, /** @type {number} */ j) => this.imp.ticks.has(HM.tickKey(i, j))) : [] }));
    const n = picks.reduce((/** @type {number} */ t, /** @type {any} */ p) => t + p.rows.length, 0);
    if (!n) return ui.notifications.info(`${TITLE}: nothing ticked.`);
    /** @type {HTMLButtonElement} */ (target).disabled = true;
    const res = await SettingsIO.apply(picks);
    this.imp = { file: null, result: null, ticks: new Set(), error: null };
    this.render();
    ui.notifications.info(`${TITLE}: imported ${plural(res.written, "setting")}.`);
    if (res.failed.length) ui.notifications.error(`${TITLE}: ${res.failed.join("; ")}`);
    if (res.reload) foundry.applications.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onRemove(_ev, target) {
    if (!game.user?.isGM) return;
    const form = /** @type {HTMLFormElement | null} */ (target.closest("form")); if (!form) return;
    const el = /** @type {any} */ (form.elements);
    const pick = Object.fromEntries(Cleanup.CATEGORIES.map(([k]) => [k, !!el[k]?.checked]));
    const r = await Cleanup.submit({ confirm: el.confirm?.value ?? "", pick });
    const box = /** @type {HTMLElement | null} */ (form.querySelector("[data-part=cleanup-error]"));
    if (!r.ok) { if (box) { box.textContent = r.error ?? ""; box.hidden = false; } return; }
    this.render();
  }

  /** Settings transfer → Import: pick a file, read it, show the preview here (file errors inline). */
  async pickImport() {
    if (!game.user?.isGM) return null;
    this.tabGroups.transfer = "import";
    if (this.router.page !== "transfer") this.go("transfer"); else this.render();
    const f = await SettingsIO.pickFile(); if (!f) return null;
    if (f.error || f.text == null) return this.#fileError(f.name, f.error ?? "the file couldn't be read.");
    const r = await SettingsIO.readText(f.text);
    if (!r.ok) return this.#fileError(f.name, `${r.error}.`);
    this.imp = { file: { name: f.name, size: f.size }, result: r, ticks: HM.initialTicks(r), error: null };
    this.tabGroups.transfer = "import";
    await this.render({ force: true });
    return r;
  }
  /** @param {string} name @param {string} text */
  #fileError(name, text) {
    this.imp.error = { name, text };
    ui.notifications.error(`${TITLE} settings import: ${text}`);
    this.render();
    return null;
  }
}

/** Opens the hub on a page (default: Overview), or brings it to the front and shows that page. @param {string} [page] */
export function open(page = "overview") {
  if (!game.user?.isGM) return ui.notifications.warn("GM only.");
  const existing = /** @type {HubApp | undefined} */ (foundry.applications.instances?.get?.(`${ID}-hub`));
  if (existing) { existing.go(page); existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  return new HubApp({ page }).render({ force: true });
}
/** GM: opens the hub on Settings transfer → Import and asks for a file (api.settings.import()). */
export async function openImport() {
  if (!game.user?.isGM) return ui.notifications.warn("GM only.");
  const app = /** @type {HubApp} */ (await open("transfer"));
  return app?.pickImport?.() ?? null;
}
export const updateResults = () => new Map(updates);
