/**
 * The hub window (GM only): one card per module with its version, active state, update check and buttons; the shared jobs on top.
 * HTML is built in code (no templates). Update checks start after the first draw and fill in as they answer.
 */
import { ID, TITLE, esc } from "./const.mjs";
import * as F from "./features.mjs";
import * as V from "./version-model.mjs";
import * as Reg from "./registry.mjs";
import * as SettingsIO from "./settings-io.mjs";
import { HealthApp } from "./health.mjs";
import { CleanupApp, cache } from "./cleanup.mjs";

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
/** @type {Record<string, string>} */
const UPDATE_CLASS = { update: "ws-warn", current: "ws-ok", ahead: "ws-info", error: "ws-bad", unknown: "ws-off" };

/** @param {any} e @param {any} dbg */
function card(e, dbg) {
  const m = Reg.moduleInfo(e.id);
  const c = Reg.R.cardModel(e, m, updates.get(e.id) ?? null);
  const state = !c.installed ? `<span class="ws-tag ws-bad">not installed</span>` : c.active ? `<span class="ws-tag ws-ok">active</span>` : `<span class="ws-tag ws-off">not active</span>`;
  const src = c.source === "registered" ? `<span class="ws-tag" title="This module registered itself with the Satchel.">registered</span>` : `<span class="ws-tag" title="Built-in adapter: uses what the module exposes today.">built-in${c.provisional ? ", provisional" : ""}</span>`;
  const upd = !c.installed ? "" : !F.on("updateCheck") ? "" : `<p class="ws-update ${UPDATE_CLASS[c.update?.status] ?? ""}">${esc(c.update ? V.updateText(c.update) : "Checking for updates…")}</p>`;
  const dbgRow = dbg.rows.find(r => r.id === e.id);
  const btn = (act, icon, label, ok, title = "") => `<button type="button" data-act="${act}" data-id="${esc(e.id)}" ${ok ? "" : "disabled"} ${title ? `title="${esc(title)}"` : ""}><i class="${icon}"></i> ${esc(label)}</button>`;
  const extras = (e.extraActions ?? []).map((x, i) => (x.available ? safe(x.available) : true) && c.active ? `<button type="button" data-act="extra" data-id="${esc(e.id)}" data-i="${i}"><i class="${esc(x.icon ?? "fa-solid fa-wand-magic")}"></i> ${esc(x.label)}</button>` : "").join("");
  return `<article class="ws-card" data-id="${esc(e.id)}">
    <header><h3>${esc(c.title)}</h3><span class="ws-version">${c.version ? esc(c.version) : ""}</span>${state}${src}</header>
    ${upd}
    ${F.on("debugAll") && c.active ? `<p class="hint">Debug logging: ${dbgRow ? (dbgRow.on ? "on" : "off") : dbg.missing.includes(e.id) ? "this version has no debug logging setting" : "none"}</p>` : ""}
    <div class="ws-buttons">
      ${btn("panel", "fa-solid fa-sliders", "Open control panel", c.can.panel)}
      ${F.on("combinedHealth") ? btn("health", "fa-solid fa-stethoscope", "Health", c.can.health || (c.active && !!(m?.relationships?.requires?.size ?? m?.relationships?.requires?.length)), c.can.health ? "" : "This module has no health check; dependencies only.") : ""}
      ${btn("docs", "fa-solid fa-book", "Docs", c.can.docs)}
      ${c.docs.changelog ? btn("changelog", "fa-solid fa-list", "Changelog", true) : ""}
      ${btn("bugs", "fa-solid fa-bug", "Report issue", c.can.bugs)}
      ${extras}
    </div>
  </article>`;
}
const safe = fn => { try { return !!fn(); } catch { return false; } };

export class HubApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-hub`, classes: ["ws-window", "ws-hub"], window: { title: TITLE, icon: "fa-solid fa-bag-shopping", resizable: true }, position: { width: 640, height: 720 } };
  constructor(opts = {}) { super(opts); this._untrack = Reg.trackWindow(this); }
  async close(opts) { this._untrack?.(); return super.close(opts); }
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "ws-scroll";
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    const list = Reg.entries();
    const dbg = F.on("debugAll") ? debugState() : { rows: [], state: "none", missing: [] };
    const jobs = [
      F.on("combinedHealth") ? `<button type="button" data-act="health-all"><i class="fa-solid fa-stethoscope"></i> Check everything</button>` : "",
      F.on("sharedSettings") ? `<button type="button" data-act="export"><i class="fa-solid fa-file-export"></i> Export all settings</button><button type="button" data-act="import"><i class="fa-solid fa-file-import"></i> Import settings…</button>` : "",
      F.on("updateCheck") ? `<button type="button" data-act="recheck"><i class="fa-solid fa-rotate"></i> Check for updates</button>` : "",
      `<button type="button" data-act="cleanup"><i class="fa-solid fa-broom"></i> Remove Satchel data…</button>`
    ].join("");
    const debug = F.on("debugAll") && dbg.rows.length ? `<label class="ws-debug"><input type="checkbox" data-act="debug" ${dbg.state === "on" ? "checked" : ""}> Debug logging for all <span class="hint">(${dbg.state === "mixed" ? "some on" : dbg.state}: ${dbg.rows.map(r => esc(r.title)).join(", ")})</span></label>` : "";
    div.innerHTML = `<section class="ws-jobs">${jobs}${debug}</section>
      ${list.length ? list.map(e => card(e, dbg)).join("") : `<p>None of the known modules is installed, and no module has registered with the Satchel.</p>`}
      <p class="hint">Each module keeps its own settings and windows; the Satchel only opens them. Other modules can join with <code>game.modules.get("${ID}").api.register({ id })</code>.</p>`;
    div.addEventListener("click", ev => this.#onClick(ev));
    div.querySelector("[data-act=debug]")?.addEventListener("change", async ev => {
      const on = !!(/** @type {HTMLInputElement} */ (ev.currentTarget)).checked;
      const n = await setDebugAll(on);
      ui.notifications.info(`${TITLE}: debug logging ${on ? "on" : "off"} (${n} changed).`);
    });
    if (F.on("updateCheck") && list.some(e => !updates.has(e.id) && Reg.moduleInfo(e.id))) checkUpdates();
    return div;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }

  /** @param {any} ev */
  async #onClick(ev) {
    if (!game.user?.isGM) return;
    const b = ev.target.closest("button[data-act]"); if (!b) return;
    const act = b.dataset.act; const id = b.dataset.id;
    const docs = Reg.R.docLinks(id ? Reg.moduleInfo(id) ?? { id } : {}, id ? Reg.entry(id)?.docs : {});
    switch (act) {
      case "panel": return Reg.openPanel(id);
      case "health": return new HealthApp({ ids: [id], id: `${ID}-health-${id}` }).render({ force: true });
      case "health-all": return new HealthApp().render({ force: true });
      case "docs": return Reg.openLink(docs.readme ?? docs.home ?? docs.changelog);
      case "changelog": return Reg.openLink(docs.changelog);
      case "bugs": return Reg.openLink(docs.bugs);
      case "extra": { const x = Reg.entry(id)?.extraActions?.[Number(b.dataset.i)]; try { return await x?.run?.(); } catch (e) { ui.notifications.error(`${TITLE}: ${e?.message ?? e}`); } return; }
      case "export": return SettingsIO.exportFile();
      case "import": return SettingsIO.openImport();
      case "recheck": updates.clear(); this.render(); return checkUpdates({ force: true });
      case "cleanup": return new CleanupApp().render({ force: true });
    }
  }
}

/** Opens the hub (or brings it to the front). */
export function open() {
  if (!game.user?.isGM) return ui.notifications.warn("GM only.");
  const existing = foundry.applications.instances?.get?.(`${ID}-hub`);
  if (existing) { existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  return new HubApp().render({ force: true });
}
export const updateResults = () => new Map(updates);
