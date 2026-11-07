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
import * as Life from "./lifecycle.mjs";
import * as Self from "./self.mjs";
import { missingMembers } from "./family-model.mjs";
import { toggleFilter } from "./filter-model.mjs";
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow, resetPlacement } from "../vendor/wanderers-core/foundry/index.mjs";
import { log, S } from "./core.mjs";

const { cache } = Cleanup;
Self.bindUpdates(o => checkUpdates(o), () => new Map(updates));

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
    await Promise.all([...Reg.entries(), { id: ID }].map(async e => {
      const m = Reg.moduleInfo(e.id); if (!m) return;
      updates.set(e.id, await V.checkUpdate(m, { fetch: globalThis.fetch?.bind(globalThis), cache: c, force }));
    }));
    if (force || !Life.lastChecked()) Life.setChecked(Date.now());
    Reg.refreshWindows();
    // Updates found that weren't backed up yet: one settings backup (never fails the check).
    try { await Life.backupForUpdates(updates); } catch (e) { console.warn(`${ID} | backup for updates`, e); }
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

/**
 * Every active module's own "Module data" switch (`<id>.showModuleData`, registered by modules on core 0.5.0), read only:
 * [{ id, title, on }], the Satchel included. A switch that can't be read counts as off.
 */
function dataFolderRows() {
  /** @type {{ id: string, title: string, on: boolean }[]} */ const out = [];
  for (const m of game.modules ?? []) {
    if (!m?.active || !m.id) continue;
    if (!game.settings.settings.has(`${m.id}.showModuleData`)) continue;
    let on = false; try { on = game.settings.get(m.id, "showModuleData") === true; } catch { }
    out.push({ id: m.id, title: m.id === ID ? TITLE : Reg.entry(m.id)?.title || m.title || m.id, on });
  }
  return out;
}

/** The Maintenance page's "Opening the Satchel" panel: this browser's scene button switch and the open key as text. */
function browserState() {
  /** @type {string} */ let key = "";
  try {
    const b = /** @type {any[]} */ (game.keybindings.get(ID, "open") ?? []);
    key = b.map(x => [...(x.modifiers ?? []), String(x.key ?? "").replace(/^Key(?=[A-Z]$)|^Digit(?=\d$)/, "")].join("+")).join(", ");
  } catch { }
  return { sceneButton: F.on("sceneButton") ? S.get("showSceneButton") !== false : null, key };
}

// ---------------------------------------------------------------- the window
const safe = (/** @type {() => unknown} */ fn) => { try { return !!fn(); } catch { return false; } };
const features = () => ({ updateCheck: F.on("updateCheck"), combinedHealth: F.on("combinedHealth"), sharedSettings: F.on("sharedSettings"), debugAll: F.on("debugAll"), settingsBackup: F.on("settingsBackup"), whatsNew: F.on("whatsNew"), healthFixes: F.on("healthFixes") });
const NO_DEBUG = { rows: [], state: "none", missing: [] };

/** The live data every page draws from. */
function snapshot() {
  const list = Reg.entries();
  const items = list.map((/** @type {any} */ e) => Reg.R.cardModel(e, Reg.moduleInfo(e.id), updates.get(e.id) ?? null));
  const f = features();
  return { list, items, health: HM.healthIndex(Health.latest()), features: f, debug: F.on("debugAll") ? debugState() : NO_DEBUG, now: Date.now(), backups: f.settingsBackup && f.sharedSettings ? Life.backups() : [], news: f.whatsNew ? HM.whatsNewModel(Life.news(), [...items, selfItem()]) : [] };
}

/** The Satchel's own card fields for its "What's new" notes. */
const selfItem = () => ({ id: ID, title: TITLE, docs: Reg.R.docLinks(Reg.moduleInfo(ID) ?? { id: ID }) });
/** "checked 2 h ago" for the last update check in this browser. @param {number} now */
const checkedHint = now => { const at = Life.lastChecked(); return at ? `checked ${HM.timeAgoLong(at, now)}` : ""; };

export class HubApp extends RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "hub" }) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-hub`, classes: ["ws-window", "ws-hub", ...UI_CLASSES],
    window: { title: TITLE, icon: "fa-solid fa-bag-shopping", resizable: true },
    position: { width: 1000, height: 720 },
    actions: {
      nav: HubApp.#onNav, panel: HubApp.#onPanel, launch: HubApp.#onLaunch, docs: HubApp.#onLink, changelog: HubApp.#onLink, bugs: HubApp.#onLink, extra: HubApp.#onExtra,
      recheckUpdates: HubApp.#onRecheck, checkAll: HubApp.#onCheckAll, healthOne: HubApp.#onHealthOne, healthAgain: HubApp.#onCheckAll, healthPost: HubApp.#onPost, healthFilter: HubApp.#onFilter,
      export: HubApp.#onExport, pickImport: HubApp.#onPickImport, doImport: HubApp.#onImport, cancelImport: HubApp.#onCancelImport, removeData: HubApp.#onRemove, resetWindows: HubApp.#onResetWindows,
      healthFix: HubApp.#onFix, dismissNews: HubApp.#onDismiss, backupNow: HubApp.#onBackup, backups: HubApp.#onBackups, restoreBackup: HubApp.#onRestore, deleteBackup: HubApp.#onDeleteBackup
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
    /** A backup is being taken (Back up now is disabled). */
    this.busy = false;
    /** The health filter (Set of keys; empty = All), remembered per browser. */
    this.filter = Prefs.loadFilter();
  }
  async close(opts) { this._untrack?.(); this._unlisten?.(); clearTimeout(this._timer); return super.close(opts); }

  /** Shows a page ("overview", "module:<id>", "health", "transfer", "backups", "maintenance"). @param {string} page */
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
    // Focus rule: a keyboard user who opened a page from the sidebar stays on the sidebar (on the link of the page now shown).
    const fromNav = !!(/** @type {HTMLElement | null} */ (document.activeElement))?.closest?.(".wc-side .wc-nav") && content.contains(document.activeElement);
    content.replaceChildren(result);
    if (fromNav) /** @type {HTMLElement | null} */ (content.querySelector(`.wc-side .wc-nav[data-page="${CSS.escape(this.router.page)}"]`) ?? content.querySelector(".wc-side .wc-nav"))?.focus({ preventScroll: true });
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
    el.addEventListener("keyup", (/** @type {KeyboardEvent} */ ev) => this.#onKeyAny(ev));
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
    return { overview: "Overview", health: "Health check", transfer: "Settings transfer", backups: "Settings backups", maintenance: "Maintenance" }[p.kind] ?? "";
  }
  /** @param {any} d */
  #page(d) {
    const p = HM.parsePage(this.router.page);
    switch (p.kind) {
      case "module": {
        const item = d.items.find((/** @type {any} */ x) => x.id === p.id); const entry = d.list.find((/** @type {any} */ x) => x.id === p.id);
        if (!item) return "";
        const extras = (entry.extraActions ?? []).map((/** @type {any} */ x, /** @type {number} */ i) => ({ i, label: x.label, icon: x.icon ?? "fa-solid fa-wand-magic", ok: x.available ? safe(x.available) : true })).filter((/** @type {any} */ x) => x.ok);
        const news = View.whatsNewHtml(d.news.filter((/** @type {any} */ n) => n.id === item.id));
        return View.moduleHtml(HM.moduleModel({ item, entry, update: updates.get(item.id) ?? null, health: d.health.get(item.id) ?? null, features: d.features, debug: d.debug, extras, now: d.now }), { filter: this.filter, fixes: d.features.healthFixes, news });
      }
      case "health": return View.healthPageHtml();
      case "backups": return View.backupsHtml(HM.backupsModel(d.backups, d.now, (/** @type {number} */ at) => new Date(at).toLocaleString()), { error: Life.backupError(), busy: this.busy });
      case "transfer": return View.transferHtml({ tab: this.tabGroups.transfer ?? "export", error: this.imp.error, file: this.imp.file, result: this.imp.result, model: this.imp.result ? HM.importModel(this.imp.result, this.imp.ticks) : null });
      case "maintenance": return View.maintenanceHtml(Cleanup.counts(), /** @type {[string, string][]} */ (Cleanup.CATEGORIES), Cleanup.CONFIRM_WORD, { dataFolder: HM.dataFolderModel(dataFolderRows(), ID), browser: browserState() });
      default: return View.overviewHtml(HM.overviewModel({ items: d.items, updates, health: d.health, features: d.features, debug: d.debug, now: d.now, backups: d.backups }), { updateCheck: d.features.updateCheck, combinedHealth: d.features.combinedHealth, id: ID, checkedHint: checkedHint(d.now), whatsNew: View.whatsNewHtml(d.news), selfUpdate: updates.get(ID) ?? null, family: View.familyHtml(missingMembers(game.modules.keys())) });
    }
  }
  #fillHealth() {
    const box = this.element?.querySelector?.(".ws-health-box");
    if (!box || !this.healthJob) return;
    // Results come in while the GM may be on a filter chip: keep focus on the same chip across the redraw.
    const chip = /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.("[data-action=healthFilter]") ? /** @type {HTMLElement} */ (document.activeElement).dataset.filter : null;
    const g = H.groupHealth(this.healthJob.results);
    box.innerHTML = View.healthHtml(g, { filter: this.filter, summaryTitle: H.summaryText(g.summary), fixes: F.on("healthFixes") });
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
    if (kind === "showSceneButton") {
      // This browser only (client setting); its onChange redraws the scene controls.
      try { await S.set("showSceneButton", t.checked); } catch (e) { console.warn(`${ID} | showSceneButton`, e); }
      return;
    }
    if (kind === "showModuleData") {
      // Our own switch only (client setting, this browser); its onChange redraws the Journal sidebar. Other modules' switches
      // are shown, never written.
      try { await S.set("showModuleData", t.checked); } catch (e) { console.warn(`${ID} | showModuleData`, e); }
      const st = this.element.querySelector("[data-part=folder-state]")?.closest("section");
      if (st) st.outerHTML = View.dataFolderHtml(HM.dataFolderModel(dataFolderRows(), ID));
      return;
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
    const t = /** @type {HTMLElement} */ (ev.target);
    this.#onKeyAny(ev);
    if (!t?.classList?.contains("wc-nav")) return;
    const links = [...this.element.querySelectorAll(".wc-side .wc-nav")].map(x => /** @type {HTMLElement} */ (x));
    const next = HM.moveFocus(links.map(x => x.dataset.page ?? ""), t.dataset.page ?? "", ev.key); if (!next) return;
    ev.preventDefault();
    const to = links.find(x => x.dataset.page === next); if (!to) return;
    for (const x of links) x.tabIndex = x === to ? 0 : -1;
    to.focus();
  }

  /**
   * Every key event in the hub (down and up): Space / Enter on a focusable control are kept from Foundry's keybindings, see
   * `hubKey`. Native buttons (chips, sidebar links, tabs) keep the browser's own single click.
   * @param {KeyboardEvent} ev
   */
  #onKeyAny(ev) {
    const t = /** @type {HTMLElement | null} */ (ev.target); if (!t?.closest) return;
    const ctl = /** @type {HTMLElement | null} */ (t.closest("button, a, input, select, textarea, summary, [role=button], [role=tab], [role=link], [tabindex], [data-action]"));
    if (!ctl || !this.element.contains(ctl)) return;
    const r = HM.hubKey(ev, { tag: ctl.tagName, role: ctl.getAttribute("role"), action: ctl.hasAttribute("data-action") });
    if (r === "click") ctl.click();
  }

  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onNav(_ev, target) {
    if (!game.user?.isGM) return;
    this.go(target.dataset.page ?? "overview");
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onPanel(_ev, target) { if (game.user?.isGM) Reg.openPanel(target.dataset.id); }
  /** The launcher (0.7.0): the module's own window. @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static #onLaunch(_ev, target) { if (game.user?.isGM) Reg.launch(target.dataset.id ?? ""); }
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

  /** Maintenance › Reset window positions: forgets where the hub and the health window were left (this browser). */
  static async #onResetWindows() {
    if (!game.user?.isGM) return;
    await resetPlacement(ID);
    ui.notifications.info(`${TITLE}: window positions reset. Open windows move back the next time they open.`);
  }

  /**
   * A health line's Fix button: finds the line again in that module's latest result, runs its fix, then checks that module again
   * so the line shows the new state.
   * @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target
   */
  static async #onFix(_ev, target) {
    if (!game.user?.isGM || !F.on("healthFixes")) return;
    const id = target.dataset.id ?? ""; const found = Health.fixOf(id, target.dataset.key ?? "");
    if (!found) return ui.notifications.warn(`${TITLE}: that line changed since it was drawn; run the check again.`);
    /** @type {HTMLButtonElement} */ (target).disabled = true;
    const r = await Self.runFix(Health.entryOf(id), found);
    if (r.message) ui.notifications[r.ok ? "info" : "warn"](`${TITLE}: ${r.message}`);
    if (r.ok && F.on("combinedHealth")) {
      if (this.router.page === "health" && this.healthJob) {
        // Re-check that module alone and put its answer into this page's report.
        Health.start([id], (/** @type {number} */ _i, /** @type {any} */ res) => { const at = this.healthJob?.results.findIndex((/** @type {any} */ x) => x.id === id) ?? -1; if (at >= 0) this.healthJob.results[at] = res; this.#fillHealth(); });
      } else Health.start([id]);
    }
    /** @type {HTMLButtonElement} */ (target).disabled = false; this.refresh();
  }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onDismiss(_ev, target) { if (game.user?.isGM) { await Life.dismiss(target.dataset.id ?? ""); this.refresh(); } }
  /** @this {HubApp} */
  static async #onBackup() {
    if (!game.user?.isGM || this.busy) return;
    this.busy = true; this.refresh();
    const r = await Life.takeBackup("manual");
    this.busy = false;
    if (r.ok) ui.notifications.info(`${TITLE}: settings backed up.`); else ui.notifications.error(`${TITLE}: backup not taken (${r.error}).`);
    if (this.router.page === "backups") this.render(); else this.refresh();
  }
  /** @this {HubApp} */
  static #onBackups() { if (game.user?.isGM) this.go("backups"); }
  /** Restore… on the backups page (see restore()). @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onRestore(_ev, target) { if (game.user?.isGM) await this.restore(target.dataset.id ?? ""); }
  /** @this {HubApp} @param {PointerEvent} _ev @param {HTMLElement} target */
  static async #onDeleteBackup(_ev, target) {
    if (!game.user?.isGM) return;
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: `${TITLE}: delete backup` }, content: "<p>Delete this settings backup? It can't be brought back.</p>", rejectClose: false }).catch(() => false);
    if (!yes) return;
    await Life.deleteBackup(target.dataset.id ?? ""); this.render();
  }

  /**
   * Restore: a backup goes into the Settings transfer › Import preview, exactly like a picked file (nothing is written until the
   * GM ticks and confirms there). Returns the readText result, or null.
   * @param {string} id
   */
  async restore(id) {
    if (!game.user?.isGM) return null;
    const b = Life.backups().find((/** @type {any} */ x) => x.id === id);
    if (!b) { ui.notifications.warn(`${TITLE}: that backup is gone.`); return null; }
    const name = `Backup ${new Date(b.at).toLocaleString()}`;
    const r = await SettingsIO.readText(b.text);
    this.tabGroups.transfer = "import";
    if (this.router.page !== "transfer") this.go("transfer");
    if (!r.ok) return this.#fileError(name, `${r.error}.`);
    this.imp = { file: { name, size: b.text.length }, result: r, ticks: HM.initialTicks(r), error: null };
    await this.render({ force: true });
    return r;
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
/** GM: opens the hub on the import preview of one settings backup (api.backups.restore(id)). @param {string} id */
export async function openBackup(id) {
  if (!game.user?.isGM) return ui.notifications.warn("GM only.");
  const app = /** @type {HubApp} */ (await open("backups"));
  return app?.restore?.(id) ?? null;
}
