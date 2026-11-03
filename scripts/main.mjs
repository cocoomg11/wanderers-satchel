/**
 * Wanderer's Satchel entry point: settings, the settings menu, the key binding, the scene control and sidebar buttons, and the API
 * (`game.modules.get("wanderers-satchel").api`). The api exists from our init hook, so other modules can register at any time from
 * then on; `wanderers-satchel.ready` fires once at our ready hook for modules that load before us.
 */
import { ID, TITLE, HOOKS, OPEN_KEY } from "./const.mjs";
import * as F from "./features.mjs";
import * as Reg from "./registry.mjs";
import * as Hub from "./hub.mjs";
import * as Health from "./health.mjs";
import * as SettingsIO from "./settings-io.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as V from "./version-model.mjs";
import * as Life from "./lifecycle.mjs";
import { CORE_VERSION } from "../vendor/wanderers-core/index.mjs";
import { registerOpenKeybinding, registerWindowPlacement, hideDataFolder } from "../vendor/wanderers-core/foundry/index.mjs";
import { S } from "./core.mjs";
import { shouldResetKeybinding, storedBinding } from "./keybind-model.mjs";

let isReady = false; let resolveReady = (/** @type {any} */ _api) => { }; const readyPromise = new Promise(r => { resolveReady = r; });
/** GM check for API entries that do something: a player gets a notice and undefined. */
const gm = () => { if (game.user?.isGM) return true; ui.notifications?.warn(`${TITLE}: GM only.`); return false; };
/** @template T @param {() => T} fn @returns {T | undefined} */
const gmOnly = fn => gm() ? fn() : undefined;

export const API = {
  get version() { return game.modules.get(ID)?.version; },
  /** Adds (or replaces) a module card. Works before and after ready. Returns { ok, error, warnings }. */
  register: (/** @type {any} */ opts) => Reg.register(opts),
  unregister: (/** @type {string} */ id) => Reg.unregister(id),
  /** The ids that registered themselves (adapters not included). */
  registrations: () => Reg.registrations(),
  /** GM: every entry shown in the hub: [{ id, title, source, provisional, … }]. A player gets undefined (0.5.0). */
  entries: () => gmOnly(() => Reg.entries().map((/** @type {any} */ e) => ({ id: e.id, title: e.title || e.id, source: e.source, provisional: !!e.provisional, open: typeof e.open === "function", health: typeof e.health === "function", exportSettings: typeof e.exportSettings === "function", importSettings: !!e.importSettings, debugSetting: e.debugSetting ?? null, fixes: Object.keys(e.fixes ?? {}) }))),
  /** GM: opens the hub window. */
  open: () => gm() ? Hub.open() : undefined,
  /** GM: opens one module's control panel (its own window or settings). */
  openPanel: (/** @type {string} */ id) => gm() ? Reg.openPanel(id) : undefined,
  /** GM: runs the combined health check; { window: true } opens the window, otherwise returns { summary, groups }. */
  health: (/** @type {any} */ opts = {}) => { if (!F.need("combinedHealth") || !gm()) return undefined; return opts.window ? new Health.HealthApp({ ids: opts.ids ?? null }).render({ force: true }) : Health.run(opts.ids ?? null); },
  /** Update check (GM): check({ force }) → Map id → result; compare(a, b) → -1 / 0 / 1 / null. undefined when the feature is off. */
  get updates() { return F.on("updateCheck") ? { check: (/** @type {any} */ o = {}) => gmOnly(() => Hub.checkUpdates(o)), results: () => gmOnly(() => Hub.updateResults()), compare: V.compareVersions } : undefined; },
  /** Settings for all (GM): build() → bundle object, export() downloads it, import() opens the import window, read(text), apply(picks). */
  get settings() { return F.on("sharedSettings") ? { build: () => gmOnly(() => SettingsIO.build().then(r => r.bundle)), export: () => gmOnly(() => SettingsIO.exportFile()), import: () => gmOnly(() => Hub.openImport()), read: (/** @type {string} */ t) => gmOnly(() => SettingsIO.readText(t)), apply: (/** @type {any[]} */ p) => gmOnly(() => SettingsIO.apply(p)) } : undefined; },
  /** Settings backups (GM): list() → [{ id, at, reason, versions, size }], take() → { ok, error }, restore(id) opens the import preview. */
  get backups() {
    return F.on("settingsBackup") && F.on("sharedSettings") ? {
      list: () => gmOnly(() => Life.backups().map((/** @type {any} */ b) => ({ id: b.id, at: b.at, reason: b.reason, versions: { ...b.versions }, size: b.size }))),
      take: () => gmOnly(() => Life.takeBackup("manual").then(r => ({ ok: r.ok, error: r.error }))),
      restore: (/** @type {string} */ id) => gmOnly(() => Hub.openBackup(id))
    } : undefined;
  },
  /** Debug logging for all (GM): state() → { rows, state, missing }, set(on). */
  get debug() { return F.on("debugAll") ? { state: () => gmOnly(() => Hub.debugState()), set: (/** @type {boolean} */ on) => gmOnly(() => Hub.setDebugAll(on)) } : undefined; },
  /** Remove Satchel data (GM): plan(), remove(pick), open(). */
  cleanup: { plan: () => gmOnly(() => Cleanup.plan()), remove: (/** @type {any} */ pick) => gmOnly(() => Cleanup.remove(pick)), open: () => gmOnly(() => Hub.open("maintenance")) },
  get isReady() { return isReady; },
  /** Resolves with the api at our ready hook. */
  whenReady: () => readyPromise,
  /** The feature switches: { on(id), list() }. */
  features: { on: (/** @type {string} */ id) => F.on(id), list: () => F.FEATURES.map(f => ({ id: f.id, label: f.label, on: F.on(f.id) })) }
};

/** The settings menu entry: opens (or brings forward) the one hub window instead of a second copy with the same id. */
class HubMenu extends foundry.applications.api.ApplicationV2 {
  render() { Hub.open(); return this; }
}

Hooks.once("init", () => {
  F.registerSettings();
  game.settings.registerMenu(ID, "hub", { name: TITLE, label: "Open the Satchel", hint: "Every one of your modules in one window: versions and updates, each module's own control panel, a combined health check, one-file settings export and import, and Remove Satchel data.", icon: "fa-solid fa-bag-shopping", type: HubMenu, restricted: true });
  // Core's open key binding (0.6.0): the same action id as before ("open"), so a key a GM chose is kept. 0.7.0: default Shift+G
  // (OPEN_KEY; core uses Shift+W/A/S/D, Shift+C and Shift+T, dnd5e Shift+B and Shift+E, the toolkit Shift+K, Red Book Shift+R).
  try {
    registerOpenKeybinding({ moduleId: ID, action: "open", name: `Open ${TITLE}`, hint: "Opens the Wanderer's Satchel hub (GM only). Default Shift+G.", gmOnly: true, editable: [{ key: OPEN_KEY.key, modifiers: [...OPEN_KEY.modifiers] }], onDown: () => { Hub.open(); }, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL });
  } catch (e) { console.warn(`${ID} | key binding not registered`, e); }
  // Core's remembered window placement (hub, health window): one hidden client setting, `windowPlacement`.
  registerWindowPlacement(ID);
  // Core's "Module data" journal folder is hidden from the Journal sidebar unless our switch (or any module's own) is on.
  hideDataFolder(ID, { shown: () => S.get("showModuleData") === true });
  const mod = game.modules.get(ID); if (mod) mod.api = API;

  // v13/v14 shape (getSceneControlButtons(controls: Record<string, SceneControl>)): a button tool (button: true, onChange(event,
  // active)) in the token controls. Hidden in this browser when the client setting showSceneButton is off (Maintenance page; its onChange re-prepares the
  // controls with ui.controls.render({ reset: true })).
  if (F.on("sceneButton")) Hooks.on("getSceneControlButtons", (/** @type {any} */ controls) => {
    if (!game.user?.isGM || S.get("showSceneButton") === false) return;
    const tokens = controls.tokens ?? controls.token; if (!tokens?.tools) return;
    tokens.tools.wanderersSatchel = { name: "wanderersSatchel", title: TITLE, icon: "fa-solid fa-bag-shopping", order: 120, button: true, visible: true, onChange: () => Hub.open() };
  });

  // A button in the Settings sidebar tab (GM only), in a small section of its own.
  Hooks.on("renderSettings", (/** @type {any} */ app, /** @type {any} */ html) => {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0]; if (!root || root.querySelector(".ws-sidebar")) return;
    const sec = document.createElement("section"); sec.className = "ws-sidebar flexcol";
    sec.innerHTML = `<h4 class="divider">${TITLE}</h4><button type="button"><i class="fa-solid fa-bag-shopping"></i> Open the Satchel</button>`;
    sec.querySelector("button")?.addEventListener("click", () => Hub.open());
    const anchor = root.querySelector("section.settings") ?? root.querySelector("section.documentation");
    if (anchor) anchor.after(sec); else root.append(sec);
  });
});

// Version-change backup: settings are read in setup (before other modules' ready hooks, where migrations usually run), written in
// ready. See lifecycle.mjs for what this order can't cover.
Hooks.once("setup", () => Life.onSetup());

/** 0.7.1: once per browser, a stored empty binding for our open action (left by 0.6) is reset to the default Shift+G. */
async function repairKeybinding() {
  try {
    if (!game.user?.isGM) return;
    const stored = storedBinding(game.settings.get("core", "keybindings"), `${ID}.open`);
    if (!shouldResetKeybinding(stored, S.get("keybindMigrated") === true)) { if (S.get("keybindMigrated") !== true) await S.set("keybindMigrated", true); return; }
    await game.keybindings.set(ID, "open", [{ key: OPEN_KEY.key, modifiers: [...OPEN_KEY.modifiers] }]);
    await S.set("keybindMigrated", true);
  } catch (e) { console.warn(`${ID} | key binding repair`, e); }
}

Hooks.once("ready", () => {
  isReady = true;
  repairKeybinding();
  // After every module had its ready hook (registrations included): the backup write, What's new, the daily update check.
  if (game.user?.isGM) setTimeout(() => { Life.onReady(o => Hub.checkUpdates(o)).catch(e => console.warn(`${ID} | ready`, e)); }, 0);
  Hooks.callAll(HOOKS.ready, API);
  resolveReady(API);
  console.log(`${ID} | ready (v${API.version}; core ${CORE_VERSION}; ${Reg.entries().length} modules: ${Reg.entries().map((/** @type {any} */ e) => `${e.id}${e.source === "registered" ? "*" : ""}`).join(", ") || "none"})`);
});
