/**
 * Built-in adapters for the known modules. Each uses only what that module exposes (its `api`, its registered settings menu, its
 * own settings, its compendiums); anything else is left out rather than guessed. A module that calls api.register() replaces its
 * adapter completely. Every function looks the module's api up when it is called, so a module that sets its api late (Red Book
 * sets it in its ready hook) still works.
 *
 * GM only: Ringmaker, Loot Ledger and Red Book gate their APIs to GMs, and so does the toolkit's panel and health check. `apiOf`
 * returns null on a player's client, so nothing here ever calls another module's API there (and the Satchel's windows and API
 * entries are GM-only too).
 */
import { SKIP, VALIDATORS, ringmakerLines, lootLedgerSections, requiredIds } from "./adapters-model.mjs";

/** @param {string} id */
const apiOf = id => {
  try { if (!game.user?.isGM) return null; const m = game.modules.get(id); return m?.active ? m.api ?? null : null; } catch { return null; }
};
/** @param {string} ns @param {string} key */
const setting = (ns, key) => { try { return game.settings.get(ns, key); } catch { return undefined; } };

/**
 * Wayfarer's Toolkit. Health: api.healthReport() (1.27 and later: core's report, no chat card); older versions only have
 * api.health(), which also whispers the toolkit's own card. Settings: read and imported by the Satchel (the toolkit dropped its
 * own Settings export / import in 1.27); on an older toolkit that still has api.settingsIO, its own checks are used for import.
 */
const toolkit = {
  id: "wayfarers-toolkit",
  title: "Wayfarer's Toolkit",
  openPanel: (/** @type {string} */ tab) => { const api = apiOf("wayfarers-toolkit"); return typeof api?.panel === "function" ? api.panel(tab) : false; },
  health: async () => {
    const api = apiOf("wayfarers-toolkit"); if (!api) throw new Error("the toolkit's API isn't available");
    if (typeof api.healthReport === "function") return api.healthReport();
    if (typeof api.health !== "function") throw new Error("this toolkit version has no health check API");
    const sections = await api.health();
    return [...(Array.isArray(sections) ? sections : []), { title: "Note", lines: [{ level: "info", text: "This toolkit version also whispered its own health card to the GMs (1.27 and later don't)." }] }];
  },
  importSettings: {
    // An older toolkit's own import, when it is there and on; otherwise null and the Satchel checks the values itself.
    read: (/** @type {any} */ data) => { const io = apiOf("wayfarers-toolkit")?.settingsIO; return typeof io?.read === "function" && typeof io?.apply === "function" ? io.read(data) : null; },
    apply: (/** @type {any[]} */ rows) => { const io = apiOf("wayfarers-toolkit")?.settingsIO; if (typeof io?.apply !== "function") throw new Error("the toolkit's own settings import isn't available any more; import the file again"); return io.apply(rows); }
  },
  debugSetting: { namespace: "wayfarers-toolkit", key: "debugLog" },
  skipSettings: SKIP["wayfarers-toolkit"],
  validators: VALIDATORS["wayfarers-toolkit"],
  extraActions: [
    { label: "Remove toolkit data…", icon: "fa-solid fa-broom", available: () => typeof apiOf("wayfarers-toolkit")?.cleanup?.open === "function", run: () => apiOf("wayfarers-toolkit")?.cleanup?.open?.() }
  ]
};

/**
 * Ringmaker: api.status() for health (GM only since 1.4.2); its "Ringmaker tools" settings menu as the panel. Debug logging: the
 * card lists Ringmaker's `debugLog` setting when it has one (1.4.2 has none, so the row says so).
 */
const ringmaker = {
  id: "ringmaker",
  title: "Ringmaker",
  // openPanel left out: the generic fallback opens Ringmaker's registered settings menu ("Ringmaker tools").
  health: async () => {
    const api = apiOf("ringmaker"); if (typeof api?.status !== "function") throw new Error("Ringmaker's API isn't available");
    const lines = ringmakerLines(api.status());
    try {
      const p = typeof api.removePlan === "function" ? api.removePlan() : null;
      if (p && typeof p === "object") lines.push({ level: "info", text: `Remove would clean up: ${Object.entries(p).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(", ") || "nothing"}.` });
    } catch { }
    return [{ title: "Ring", lines }];
  },
  debugSetting: { namespace: "ringmaker", key: "debugLog" },
  skipSettings: SKIP.ringmaker
};

/** Loot Ledger's state, read without its API: compendiums, its Build Report journal and a few settings. Read-only. */
function lootLedgerState() {
  const LL = "loot-ledger";
  const mod = game.modules.get(LL);
  const need = new Set(requiredIds(mod));
  /** @param {any} p */
  const size = p => { try { return p?.index?.size ?? 0; } catch { return 0; } };
  const sources = [];
  for (const p of game.packs ?? []) {
    const pkg = p?.metadata?.packageName ?? p?.metadata?.package;
    if (need.has(pkg) && (p.documentName ?? p.metadata?.type) === "Item") sources.push({ label: p.metadata?.label ?? p.collection, size: size(p) });
  }
  /** @param {string} name */
  const pack = name => { const p = game.packs?.get?.(`world.${name}`); return p ? { size: size(p) } : null; };
  let report = false;
  try { report = !!game.journal?.find?.((/** @type {any} */ j) => j?.flags?.[LL]?.buildReport); } catch { }
  return {
    api: !!mod?.api,
    system: game.system?.id ?? "",
    sources,
    packs: { items: pack("loot-ledger-items"), converted: pack("loot-ledger-converted-items"), tables: pack("loot-ledger-tables") },
    report,
    settings: { convertOnBuild: setting(LL, "convertOnBuild"), reviewBoard: setting(LL, "reviewBoard"), qualityColours: setting(LL, "qualityColours"), randomSuffixes: setting(LL, "randomSuffixes") }
  };
}

/** Loot Ledger: its "Build loot pools" settings menu as the panel; health from its compendiums and Build Report (no API call). */
const lootLedger = {
  id: "loot-ledger",
  title: "Loot Ledger",
  health: () => { if (!game.user?.isGM) throw new Error("GM only"); return lootLedgerSections(lootLedgerState()); },
  debugSetting: { namespace: "loot-ledger", key: "debugLog" },
  skipSettings: SKIP["loot-ledger"]
};

/**
 * Red Book: api.panel(tab), api.health() (a list of lines; GM only from 0.3.0), api.cleanup.open(), setting `debugLog`. Settings
 * are read and imported by the Satchel. When Red Book registers itself (api.register), its registration replaces this adapter.
 */
const redBook = {
  id: "red-book",
  title: "Red Book",
  openPanel: (/** @type {string} */ tab) => { const api = apiOf("red-book"); return typeof api?.panel === "function" ? api.panel(tab) : false; },
  health: async () => {
    const api = apiOf("red-book"); if (!api) throw new Error("Red Book's API isn't available yet (it is set when Red Book is ready)");
    if (typeof api.healthReport === "function") return api.healthReport();
    if (typeof api.health === "function") {
      const r = await api.health();
      // 0.2/0.3 return a plain list of lines; a list of sections (core's report) is passed on as it is.
      return Array.isArray(r) && r.length && !r.every((/** @type {any} */ x) => Array.isArray(x?.lines)) ? [{ title: "Checks", lines: r }] : r;
    }
    return null;
  },
  debugSetting: { namespace: "red-book", key: "debugLog" },
  skipSettings: SKIP["red-book"],
  extraActions: [
    { label: "Remove Red Book data…", icon: "fa-solid fa-broom", available: () => typeof apiOf("red-book")?.cleanup?.open === "function", run: () => apiOf("red-book")?.cleanup?.open?.() }
  ]
};

export const ADAPTERS = [toolkit, ringmaker, lootLedger, redBook];
