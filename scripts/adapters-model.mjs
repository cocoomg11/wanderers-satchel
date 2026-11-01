/**
 * Built-in adapters, the pure part (tested in Node): which settings each known module keeps as records (never exported), extra
 * import checks for their structured settings, how Ringmaker's api.status() and Loot Ledger's state read as health lines, and
 * dependency lines from any module's manifest. Nothing here calls Foundry.
 */

/**
 * Record-type settings per known module: stored data, window positions or bookkeeping, not choices, so never exported or
 * imported. Wanderer's Toolkit: its own settings file's skip list plus its per-browser window positions. Red Book: its hidden
 * record settings (0.5.0; Red Book 0.4+ registers itself with the same list, which replaces this adapter once it has). Every module
 * on wanderers-core 0.5.0 may also have the client records `showModuleData` and `windowPlacement` (0.6.0; settings-model.mjs
 * `CORE_RECORDS` adds them to registrations too).
 */
const CORE = ["showModuleData", "windowPlacement"];
export const SKIP = {
  "wayfarers-toolkit": ["lootHistoryData", "lastSeenVersion", "setupReminded", "wizardDone", "flightCache", "goldSnapshots", "pinsNotesShown", "bossLayout", "bossFramePos", "onlineHudPos", "paneWindow", ...CORE],
  ringmaker: [...CORE],
  "loot-ledger": [...CORE],
  "red-book": ["openSession", "boardPins", "onlineHudPos", "onlineHudCollapsed", "migrations", "nextSession", ...CORE]
};

/**
 * The skip list for a module, plus any extra record keys its api lists (the toolkit's `api.settingsRecords()`, 1.27 and later).
 * The static list stays as the fallback; a missing or failing function changes nothing.
 * @param {string} id @param {any} api the module's api (null on a player's client)
 * @returns {string[]}
 */
export function skipFor(id, api) {
  const out = new Set(SKIP[/** @type {keyof typeof SKIP} */ (id)] ?? []);
  if (id === "wayfarers-toolkit" && typeof api?.settingsRecords === "function") {
    try { for (const k of api.settingsRecords() ?? []) if (typeof k === "string" && k) out.add(k); } catch { /* keep the static list */ }
  }
  return [...out];
}

const isObj = (/** @type {unknown} */ v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Extra import checks for known modules' Object settings (run after the Satchel's plain-data check). Each returns true or the
 * reason the value is refused.
 * @type {Record<string, Record<string, (v: any) => true | string>>}
 */
export const VALIDATORS = {
  "wayfarers-toolkit": {
    // The flight network: { version, points: [{ id, name, … }], routes: [{ … }] }. The toolkit cleans it up again when it reads it.
    flightNetwork: v => {
      if (!isObj(v)) return "should be a flight network ({ points, routes })";
      if (!Array.isArray(v.points) || !Array.isArray(v.routes)) return "should have points and routes lists";
      if (v.points.length > 2000 || v.routes.length > 10000) return "has more points or routes than a network can have";
      if (!v.points.every(isObj) || !v.routes.every(isObj)) return "has points or routes that aren't objects";
      return true;
    }
  }
};

/**
 * Ringmaker's api.status() → health lines. Reads only what status() returns.
 * @param {any} st
 */
export function ringmakerLines(st) {
  if (!st || typeof st !== "object") return [{ level: "warn", text: "Ringmaker's status() returned nothing." }];
  const out = [];
  if (!st.image) {
    out.push({ level: "off", text: "No ring image chosen: Ringmaker does nothing until one is set (Ringmaker's settings › Ring image)." });
    return out;
  }
  out.push({ level: "ok", text: `Ring image: ${st.image}` });
  if (st.error) out.push({ level: "bad", text: `The ring image couldn't be loaded: ${st.error}` });
  out.push(st.registered ? { level: "ok", text: "Ring style registered with Foundry's dynamic token rings." } : { level: "bad", text: "The ring style isn't registered (reload; check the console for Ringmaker warnings)." });
  if (st.active === false) out.push({ level: "warn", text: "Another ring style is the active one, so tokens show that instead." });
  else if (st.active) out.push({ level: "ok", text: "Ringmaker's ring is the active ring style." });
  if (st.front && st.shader === false) out.push({ level: "warn", text: "Ring in front of token art is on, but the shader patch isn't in use (Foundry's own shader is drawn instead)." });
  out.push({ level: "info", text: `Rings ${st.mode === "all" ? "every token" : "NPC tokens"}; ring size ${st.size ?? 100}%; target effect ${st.targetEffect ?? "off"}.` });
  return out;
}

/**
 * Loot Ledger's state → health sections. `st` is read in the adapter (read-only, no API call needed):
 *   { api: boolean, system: string, sources: [{ label, size }], packs: { items, converted, tables }: { size } | null,
 *     report: boolean, settings: { convertOnBuild, reviewBoard, qualityColours, randomSuffixes } }
 * @param {any} st
 */
export function lootLedgerSections(st) {
  if (!st || typeof st !== "object") return [{ title: "Loot pools", lines: [{ level: "warn", text: "Loot Ledger's state couldn't be read." }] }];
  const src = [];
  if (st.system && st.system !== "dnd5e") src.push({ level: "bad", text: `Loot Ledger converts items for dnd5e; this world uses ${st.system}.` });
  const sources = Array.isArray(st.sources) ? st.sources : [];
  if (!sources.length) src.push({ level: "bad", text: "No source item compendium from its required module was found: Build loot pools has nothing to read." });
  for (const s of sources) src.push(s.size ? { level: "ok", text: `Source compendium "${s.label}": ${s.size} items indexed.` } : { level: "ok", text: `Source compendium "${s.label}" is there (its index loads when it is first opened).` });
  if (st.api === false) src.push({ level: "warn", text: "Loot Ledger's API isn't set (reload; check the console for Loot Ledger errors)." });
  const built = [];
  const p = st.packs ?? {};
  if (!p.tables && !p.items) built.push({ level: "warn", text: "No loot pools built yet: run Build loot pools (Open control panel)." });
  else {
    built.push(p.items ? { level: "ok", text: `Items compendium built${p.items.size ? ` (${p.items.size} items)` : ""}.` } : { level: "warn", text: "The items compendium is missing: run Build loot pools again." });
    built.push(p.tables ? { level: "ok", text: `Tables compendium built${p.tables.size ? ` (${p.tables.size} tables)` : ""}.` } : { level: "warn", text: "The tables compendium is missing: loot rolls find no table. Run Build loot pools again." });
    if (p.converted) built.push({ level: "info", text: `Converted items compendium: ${p.converted.size ? `${p.converted.size} items` : "there"}.` });
    built.push(st.report ? { level: "ok", text: "Build Report journal found." } : { level: "info", text: "No Build Report journal (it is written by Build loot pools)." });
  }
  const s = st.settings ?? {};
  const opts = [
    ["Convert on build", s.convertOnBuild], ["Review board", s.reviewBoard], ["Quality colours", s.qualityColours], ["Random suffixes", s.randomSuffixes]
  ].filter(([, v]) => typeof v === "boolean").map(([k, v]) => `${k} ${v ? "on" : "off"}`);
  const out = [{ title: "Sources", lines: src }, { title: "Loot pools", lines: built }];
  if (opts.length) out.push({ title: "Options", lines: [{ level: "info", text: `${opts.join(", ")}.` }] });
  return out;
}

/**
 * Dependency lines from a module's manifest: each required module (relationships.requires, plus a required system when the world's
 * system differs). `mod`: { relationships }; `lookup(id)` → { active, version } | null; `systemId`: the world's system.
 * @param {any} mod
 * @param {(id: string) => any} lookup
 * @param {string | null} [systemId]
 */
export function dependencyLines(mod, lookup, systemId = null) {
  const rel = mod?.relationships ?? {};
  const list = (/** @type {any} */ v) => v instanceof Set ? [...v] : Array.isArray(v) ? v : v && typeof v[Symbol.iterator] === "function" ? [...v] : [];
  const out = [];
  for (const r of list(rel.requires)) {
    if (!r?.id) continue;
    if ((r.type ?? "module") !== "module") continue;
    const m = lookup?.(r.id);
    out.push(!m ? { level: "bad", text: `Needs the module "${r.id}", which isn't installed.` } : !m.active ? { level: "bad", text: `Needs the module "${r.id}", which isn't active in this world.` } : { level: "ok", text: `Needs "${r.id}": active${m.version ? ` (${m.version})` : ""}.` });
  }
  const systems = list(rel.systems).filter((/** @type {any} */ s) => s?.id);
  if (systems.length && systemId && !systems.some((/** @type {any} */ s) => s.id === systemId)) out.push({ level: "warn", text: `Made for ${systems.map((/** @type {any} */ s) => s.id).join(" / ")}; this world uses ${systemId}.` });
  return out;
}

/** The ids of a module's required modules (for finding the compendiums they bring). @param {any} mod */
export function requiredIds(mod) {
  const v = mod?.relationships?.requires;
  const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : v && typeof v[Symbol.iterator] === "function" ? [...v] : [];
  return list.filter(r => r?.id && (r.type ?? "module") === "module").map(r => r.id);
}
