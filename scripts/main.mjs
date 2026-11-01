/**
 * Wanderer's Satchel entry point: settings, the settings menu, the key binding, the scene control and sidebar buttons, and the API
 * (`game.modules.get("wanderers-satchel").api`). The api exists from our init hook, so other modules can register at any time from
 * then on; `wanderers-satchel.ready` fires once at our ready hook for modules that load before us.
 */
import { ID, TITLE, HOOKS } from "./const.mjs";
import * as F from "./features.mjs";
import * as Reg from "./registry.mjs";
import * as Hub from "./hub.mjs";
import * as Health from "./health.mjs";
import * as SettingsIO from "./settings-io.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as V from "./version-model.mjs";

let isReady = false; let resolveReady; const readyPromise = new Promise(r => { resolveReady = r; });
const gm = () => { if (game.user?.isGM) return true; ui.notifications.warn("GM only."); return false; };

export const API = {
  get version() { return game.modules.get(ID)?.version; },
  /** Adds (or replaces) a module card. Works before and after ready. Returns { ok, error, warnings }. */
  register: opts => Reg.register(opts),
  unregister: id => Reg.unregister(id),
  /** The ids that registered themselves (adapters not included). */
  registrations: () => Reg.registrations(),
  /** Every entry shown in the hub: [{ id, title, source, provisional, … }]. */
  entries: () => Reg.entries().map(e => ({ id: e.id, title: e.title || e.id, source: e.source, provisional: !!e.provisional, health: typeof e.health === "function", exportSettings: typeof e.exportSettings === "function", importSettings: !!e.importSettings, debugSetting: e.debugSetting ?? null })),
  /** GM: opens the hub window. */
  open: () => gm() ? Hub.open() : undefined,
  /** GM: opens one module's control panel (its own window or settings). */
  openPanel: id => gm() ? Reg.openPanel(id) : undefined,
  /** GM: runs the combined health check; { window: true } opens the window, otherwise returns { summary, groups }. */
  health: (opts = {}) => { if (!F.need("combinedHealth") || !gm()) return undefined; return opts.window ? new Health.HealthApp({ ids: opts.ids ?? null }).render({ force: true }) : Health.run(opts.ids ?? null); },
  /** Update check: check({ force }) → Map id → result; compare(a, b) → -1 / 0 / 1 / null. undefined when the feature is off. */
  get updates() { return F.on("updateCheck") ? { check: (o = {}) => Hub.checkUpdates(o), results: () => Hub.updateResults(), compare: V.compareVersions } : undefined; },
  /** Settings for all: build() → bundle object, export() downloads it, import() opens the import window, read(text), apply(picks). */
  get settings() { return F.on("sharedSettings") ? { build: () => SettingsIO.build().then(r => r.bundle), export: () => SettingsIO.exportFile(), import: () => SettingsIO.openImport(), read: t => SettingsIO.readText(t), apply: p => SettingsIO.apply(p) } : undefined; },
  /** Debug logging for all: state() → { rows, state, missing }, set(on). */
  get debug() { return F.on("debugAll") ? { state: () => Hub.debugState(), set: on => Hub.setDebugAll(on) } : undefined; },
  /** Remove Satchel data: plan(), remove(pick), open(). */
  cleanup: { plan: () => Cleanup.plan(), remove: pick => Cleanup.remove(pick), open: () => new Cleanup.CleanupApp().render({ force: true }) },
  get isReady() { return isReady; },
  /** Resolves with the api at our ready hook. */
  whenReady: () => readyPromise,
  features: F
};

/** The settings menu entry: opens (or brings forward) the one hub window instead of a second copy with the same id. */
class HubMenu extends foundry.applications.api.ApplicationV2 {
  render() { Hub.open(); return this; }
}

Hooks.once("init", () => {
  F.registerSettings();
  game.settings.registerMenu(ID, "hub", { name: TITLE, label: "Open the Satchel", hint: "Every one of your modules in one window: versions and updates, each module's own control panel, a combined health check, one-file settings export and import, and Remove Satchel data.", icon: "fa-solid fa-bag-shopping", type: HubMenu, restricted: true });
  try {
    game.keybindings.register(ID, "open", { name: `Open ${TITLE}`, hint: "Opens the Wanderer's Satchel hub (GM only). No key is set by default.", editable: [], restricted: true, onDown: () => { Hub.open(); return true; }, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL });
  } catch (e) { console.warn(`${ID} | key binding not registered`, e); }
  const mod = game.modules.get(ID); if (mod) mod.api = API;

  if (F.on("sceneButton")) Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;
    const tokens = controls.tokens ?? controls.token; if (!tokens?.tools) return;
    tokens.tools.wanderersSatchel = { name: "wanderersSatchel", title: TITLE, icon: "fa-solid fa-bag-shopping", order: 120, button: true, visible: true, onChange: () => Hub.open() };
  });

  // A button in the Settings sidebar tab (GM only), in a small section of its own.
  Hooks.on("renderSettings", (app, html) => {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0]; if (!root || root.querySelector(".ws-sidebar")) return;
    const sec = document.createElement("section"); sec.className = "ws-sidebar flexcol";
    sec.innerHTML = `<h4 class="divider">${TITLE}</h4><button type="button"><i class="fa-solid fa-bag-shopping"></i> Open the Satchel</button>`;
    sec.querySelector("button").addEventListener("click", () => Hub.open());
    const anchor = root.querySelector("section.settings") ?? root.querySelector("section.documentation");
    if (anchor) anchor.after(sec); else root.append(sec);
  });
});

Hooks.once("ready", () => {
  isReady = true;
  Hooks.callAll(HOOKS.ready, API);
  resolveReady(API);
  console.log(`${ID} | ready (v${API.version}; ${Reg.entries().length} modules: ${Reg.entries().map(e => `${e.id}${e.source === "registered" ? "*" : ""}`).join(", ") || "none"})`);
});
