/**
 * The Wanderer's family, pure (tested in Node: tests/v072.test.mjs): every module of the suite the Satchel knows by name, with a
 * one-line description and where to get it. Installed members show in the sidebar and the Overview table (through their adapter
 * or their own registration); members that aren't installed are listed on the Overview with a Get it link (0.7.2). No Foundry calls.
 */

const GH = "https://github.com/cocoomg11";
/** @param {string} id @param {string} title @param {string} description */
const member = (id, title, description) => Object.freeze({ id, title, description, url: `${GH}/${id}`, manifest: `${GH}/${id}/releases/latest/download/module.json` });

/** The family in display order (the Satchel itself is not listed: it is the hub). Ids are the modules' `module.json` ids. */
export const FAMILY = Object.freeze([
  member("wayfarers-toolkit", "Wanderer's Toolkit", "GM kit: quest log, travel and flights, inns, loot rolls, boss frames and a three-coin economy."),
  member("red-book", "Red Book", "Session prep: a live session log, a next-session board and a scene readiness check."),
  member("ringmaker", "Ringmaker", "Your own ring image for Foundry's dynamic token rings."),
  member("loot-ledger", "Loot Ledger", "Priced, rollable loot pools and roll tables built from an item compendium."),
  member("wanderers-guild", "Wanderer's Guild", "Professions, crafting and gathering from tool proficiencies."),
  member("wanderers-path", "Wanderer's Path", "Customizable talent trees and spec boards.")
]);

/** One member by id, or null. @param {string} id */
export const familyOf = id => FAMILY.find(m => m.id === id) ?? null;

/**
 * The Overview's family panel: the members that aren't installed, in family order. `installed`: ids of installed modules (active
 * or not; an installed member shows in the table instead).
 * @param {Iterable<string>} installed
 * @returns {{ id: string, title: string, description: string, url: string, manifest: string }[]}
 */
export function missingMembers(installed) {
  const have = new Set(installed);
  return FAMILY.filter(m => !have.has(m.id)).map(m => ({ ...m }));
}
