/**
 * Built-in adapters, the pure part (tested in Node): which settings each known module keeps as records (never exported), how
 * Ringmaker's api.status() reads as health lines, and dependency lines from any module's manifest. Nothing here calls Foundry.
 */

/**
 * Record-type settings per known module: stored data or bookkeeping, not choices, so never exported or imported.
 * Wayfarer's Toolkit: the same list as its own settings export (settings-io-model.mjs SKIP).
 * Red Book: provisional until the module is released.
 */
export const SKIP = {
  "wayfarers-toolkit": ["lootHistoryData", "lastSeenVersion", "setupReminded", "wizardDone", "flightCache", "goldSnapshots"],
  ringmaker: [],
  "loot-ledger": [],
  "red-book": []
};

/** Ringmaker's api.status() → health lines. Reads only what status() returns. */
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
 * Dependency lines from a module's manifest: each required module (relationships.requires, plus a required system when the world's
 * system differs). `mod`: { relationships }; `lookup(id)` → { active, version } | null; `systemId`: the world's system.
 */
export function dependencyLines(mod, lookup, systemId = null) {
  const rel = mod?.relationships ?? {};
  const list = v => v instanceof Set ? [...v] : Array.isArray(v) ? v : v && typeof v[Symbol.iterator] === "function" ? [...v] : [];
  const out = [];
  for (const r of list(rel.requires)) {
    if (!r?.id) continue;
    if ((r.type ?? "module") !== "module") continue;
    const m = lookup?.(r.id);
    out.push(!m ? { level: "bad", text: `Needs the module "${r.id}", which isn't installed.` } : !m.active ? { level: "bad", text: `Needs the module "${r.id}", which isn't active in this world.` } : { level: "ok", text: `Needs "${r.id}": active${m.version ? ` (${m.version})` : ""}.` });
  }
  const systems = list(rel.systems).filter(s => s?.id);
  if (systems.length && systemId && !systems.some(s => s.id === systemId)) out.push({ level: "warn", text: `Made for ${systems.map(s => s.id).join(" / ")}; this world uses ${systemId}.` });
  return out;
}
