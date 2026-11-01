/**
 * Built-in adapters for the known modules. Each uses only what that module exposes today (its `api`, its registered settings menu,
 * its own settings); anything else is left out rather than guessed. A module that calls api.register() replaces its adapter.
 * Every function looks the module's api up when it is called, so a module that sets its api late still works.
 */
import { SKIP, ringmakerLines } from "./adapters-model.mjs";

const apiOf = id => { try { const m = game.modules.get(id); return m?.active ? m.api ?? null : null; } catch { return null; } };

/** Wayfarer's Toolkit: api.panel(tab), api.health(), api.settingsIO (read/apply), world setting "debugLog". */
const toolkit = {
  id: "wayfarers-toolkit",
  title: "Wayfarer's Toolkit",
  openPanel: tab => apiOf("wayfarers-toolkit")?.panel?.(tab),
  /**
   * The toolkit's api.health() runs its checks and returns the sections, but also whispers its own health card to the GMs. A future
   * api.healthReport() (sections only, no card) is used first when present.
   */
  health: async () => {
    const api = apiOf("wayfarers-toolkit"); if (!api) throw new Error("the toolkit's API isn't available");
    if (typeof api.healthReport === "function") return api.healthReport();
    if (typeof api.health !== "function") throw new Error("the toolkit has no api.health()");
    const sections = await api.health();
    return [...(Array.isArray(sections) ? sections : []), { title: "Note", lines: [{ level: "info", text: "Wayfarer's Toolkit also whispered its own health card to the GMs." }] }];
  },
  // Export: the toolkit's own export() downloads a file, so the Satchel reads the settings itself in the toolkit's file format
  // (the same skip list). Import goes back through the toolkit's own checks: settingsIO.read(object) and settingsIO.apply(rows).
  importSettings: {
    // With the toolkit's own Settings export / import turned off, read() returns null and the Satchel checks the values itself.
    read: data => { const io = apiOf("wayfarers-toolkit")?.settingsIO; return io?.read ? io.read(data) : null; },
    apply: rows => { const io = apiOf("wayfarers-toolkit")?.settingsIO; if (!io) throw new Error("Settings export / import is turned off in the toolkit"); return io.apply(rows); }
  },
  debugSetting: { namespace: "wayfarers-toolkit", key: "debugLog" },
  skipSettings: SKIP["wayfarers-toolkit"],
  extraActions: [
    { label: "Remove toolkit data…", icon: "fa-solid fa-broom", run: () => apiOf("wayfarers-toolkit")?.cleanup?.open?.() }
  ]
};

/** Ringmaker: api.status() for health; its "Ringmaker tools" settings menu as the panel. No debug setting. */
const ringmaker = {
  id: "ringmaker",
  title: "Ringmaker",
  // openPanel left out: the generic fallback opens Ringmaker's registered settings menu ("Ringmaker tools").
  health: async () => {
    const api = apiOf("ringmaker"); if (!api?.status) throw new Error("Ringmaker's API isn't available");
    const lines = ringmakerLines(api.status());
    try { const p = api.removePlan?.(); if (p && typeof p === "object") lines.push({ level: "info", text: `Remove would clean up: ${Object.entries(p).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(", ") || "nothing"}.` }); } catch { }
    return [{ title: "Ring", lines }];
  },
  skipSettings: SKIP.ringmaker
};

/** Loot Ledger: its "Build loot pools" settings menu as the panel; no health check, debug setting or settings import of its own. */
const lootLedger = {
  id: "loot-ledger",
  title: "Loot Ledger",
  skipSettings: SKIP["loot-ledger"]
};

/**
 * Red Book (provisional: the module is still being built). Designed against its planned control panel, health check and settings
 * export; each call is used only when the api actually has it, and falls back to the generic behaviour otherwise.
 */
const redBook = {
  id: "red-book",
  title: "Red Book",
  provisional: true,
  openPanel: tab => { const api = apiOf("red-book"); const fn = api?.panel ?? api?.openPanel; if (typeof fn === "function") return fn.call(api, tab); return false; },
  health: async () => {
    const api = apiOf("red-book"); if (!api) throw new Error("Red Book's API isn't available");
    if (typeof api.healthReport === "function") return api.healthReport();
    if (typeof api.health === "function") return api.health();
    return null;
  },
  importSettings: {
    read: data => { const io = apiOf("red-book")?.settingsIO; if (!io?.read) return null; return io.read(data); },
    apply: rows => { const io = apiOf("red-book")?.settingsIO; if (!io?.apply) throw new Error("Red Book has no settings import"); return io.apply(rows); }
  },
  debugSetting: { namespace: "red-book", key: "debugLog" },
  skipSettings: SKIP["red-book"],
  extraActions: [
    { label: "Remove Red Book data…", icon: "fa-solid fa-broom", available: () => typeof apiOf("red-book")?.cleanup?.open === "function", run: () => apiOf("red-book")?.cleanup?.open?.() }
  ]
};

export const ADAPTERS = [toolkit, ringmaker, lootLedger, redBook];
