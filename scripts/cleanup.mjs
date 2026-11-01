/**
 * Remove Satchel data: a window (GM only) that counts what Wanderer's Satchel stored (a dry run), lets the GM tick what goes and
 * asks to type REMOVE. What the Satchel writes: its own settings (feature switches), `flags.wanderers-satchel` on chat messages (the
 * combined health card) and the update-check answers in this browser's session storage. Nothing of any other module is touched;
 * debug settings the "Debug logging for all" switch changed belong to those modules and are listed, not reset.
 */
import { ID, TITLE, esc } from "./const.mjs";
import { createCache } from "./version-model.mjs";
import { CONFIRM_WORD, confirmed, hasFlags } from "../vendor/wanderers-core/index.mjs";

export const CATEGORIES = [
  ["messages", "Satchel flags on chat messages (combined health cards whispered to the GMs; the cards are deleted)"],
  ["cache", "Update-check answers kept in this browser's session storage"],
  ["settings", "Reset Wanderer's Satchel's settings to their defaults (feature switches and its debug logging; reloads)"]
];

const ours = (/** @type {any} */ d) => hasFlags(d, ID);
const storage = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
export const cache = () => createCache(storage());

/** Counts what each category would remove. Nothing is changed. */
export function plan() {
  /** @type {{ messages: any[], cache: string[], settings: any[] }} */
  const p = { messages: [], cache: [], settings: [] };
  for (const m of game.messages ?? []) if (ours(m)) p.messages.push(m);
  p.cache = cache().keys();
  for (const [, c] of game.settings.settings) if (c.namespace === ID) {
    let cur; try { cur = game.settings.get(ID, c.key); } catch { continue; }
    if (JSON.stringify(cur) !== JSON.stringify(c.default)) p.settings.push(c);
  }
  return p;
}

/** Carries out the ticked categories: { [category]: number }. */
/** @param {any} [pick] */
export async function remove(pick = {}) {
  if (!game.user?.isGM) { ui.notifications.warn("GM only."); return null; }
  const p = plan(); const done = {};
  if (pick.messages) { try { await ChatMessage.deleteDocuments(p.messages.map(m => m.id)); done.messages = p.messages.length; } catch (e) { console.warn(`${ID} | remove messages`, e); done.messages = 0; } }
  if (pick.cache) done.cache = cache().clear() || p.cache.length;
  if (pick.settings) {
    let n = 0;
    for (const c of p.settings) { try { await game.settings.set(ID, c.key, foundry.utils.deepClone(c.default)); n++; } catch (e) { console.warn(`${ID} | reset ${c.key}`, e); } }
    done.settings = n;
  }
  return done;
}

export class CleanupApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-cleanup`, classes: ["ws-window"], tag: "form", form: { closeOnSubmit: false }, window: { title: `${TITLE} · Remove Satchel data`, icon: "fa-solid fa-broom", resizable: true }, position: { width: 520, height: "auto" } };
  async _renderHTML() {
    const div = document.createElement("div");
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    const p = plan();
    div.innerHTML = `<p>Removes what ${TITLE} stored. The counts are what would go now (a dry run); nothing changes until you confirm. Other modules' settings and data are never touched, including debug settings the <em>Debug logging for all</em> switch turned on (turn them off from the hub first if you want).</p>
      ${CATEGORIES.map(([k, label]) => `<div class="form-group"><label><input type="checkbox" name="${k}" ${k === "settings" ? "" : "checked"}> ${esc(label)}</label><span class="hint" style="margin-left:auto;">${/** @type {any} */ (p)[k].length}</span></div>`).join("")}
      <p class="hint">Also left behind, documented in the README: the key binding (if you changed it, Foundry keeps it in its own key binding settings).</p>
      <div class="form-group"><label for="ws-cleanup-confirm">Type <strong>REMOVE</strong> to confirm</label><div class="form-fields"><input type="text" id="ws-cleanup-confirm" name="confirm" autocomplete="off"></div></div>
      <footer class="ws-footer"><button type="button" data-act="cancel"><i class="fa-solid fa-xmark"></i> Cancel</button><button type="submit"><i class="fa-solid fa-broom"></i> Remove</button></footer>`;
    return div;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    const form = this.element;
    form.querySelector("[data-act=cancel]")?.addEventListener("click", ev => { ev.preventDefault(); this.close(); });
    form.onsubmit = async ev => {
      ev.preventDefault();
      if (!confirmed(form.elements.confirm?.value)) return ui.notifications.warn(`${TITLE}: type ${CONFIRM_WORD} to confirm.`);
      const pick = Object.fromEntries(CATEGORIES.map(([k]) => [k, !!form.elements[k]?.checked]));
      if (!Object.values(pick).some(Boolean)) return ui.notifications.info(`${TITLE}: nothing ticked.`);
      const done = await remove(pick); await this.close(); if (!done) return;
      const label = Object.fromEntries(CATEGORIES);
      ui.notifications.info(`${TITLE} data removed: ${Object.entries(done).map(([k, n]) => `${label[k].replace(/ \(.*\)$/, "")}: ${n}`).join("; ") || "nothing"}.`);
      if (done.settings) foundry.applications.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
    };
  }
}
