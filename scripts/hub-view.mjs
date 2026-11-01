/**
 * The hub window's HTML, pure (tested in Node): one function per part (sidebar, overview, module page, health page, settings
 * transfer, import preview, maintenance) from the view models in hub-model.mjs. Every value is escaped. Clicks are wired through
 * ApplicationV2 `actions` (`data-action`); the transfer tabs use Foundry's own tab markup (`data-action="tab"`, `data-group`,
 * `data-tab`) so `changeTab` works. Colours come from theme-aware status classes (`ws-ok`, `ws-warn`, `ws-bad`, `ws-info`,
 * `ws-off`, `ws-pending`) defined in satchel.css on Foundry's `--color-level-*` variables.
 */
import { esc } from "./const.mjs";
import { LEVELS, levelOf } from "./hub-model.mjs";
import { preview } from "./settings-model.mjs";

/** A status icon with a word for screen readers. @param {string} level */
export const icon = level => { const l = LEVELS[levelOf(level)]; return `<i class="${l.icon} ws-icon ws-${levelOf(level)}" aria-hidden="true"></i><span class="ws-sr">${l.word}:</span>`; };
/** The reusable badge. @param {string} level @param {string} text @param {{ title?: string, icon?: boolean, small?: boolean }} [o] */
export const badge = (level, text, o = {}) => `<span class="ws-badge ws-${levelOf(level)}${o.small ? " ws-badge-sm" : ""}"${o.title ? ` title="${esc(o.title)}"` : ""}>${o.icon ? `<i class="${LEVELS[levelOf(level)].icon}" aria-hidden="true"></i>` : ""}${esc(text)}</span>`;
/** A status dot (hollow when off, none = not checked). @param {string} dot */
const dotHtml = dot => `<span class="ws-dot ws-dot-${esc(dot)}" aria-hidden="true"></span>`;
const dotWord = (/** @type {string} */ d) => ({ ok: "health OK", warn: "warnings", bad: "problems", off: "not active", pending: "checking", none: "not checked" })[d] ?? "";
/** A button. @param {string} action @param {string} label @param {{ icon?: string, data?: Record<string, string>, primary?: boolean, small?: boolean, disabled?: boolean, title?: string, cls?: string }} [o] */
export function button(action, label, o = {}) {
  const data = Object.entries(o.data ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
  const cls = ["ws-btn", o.primary ? "ws-primary" : "", o.small ? "ws-sm" : "", o.cls ?? ""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-action="${esc(action)}"${data}${o.disabled ? " disabled" : ""}${o.title ? ` title="${esc(o.title)}"` : ""}>${o.icon ? `<i class="${esc(o.icon)}" aria-hidden="true"></i>` : ""}<span>${esc(label)}</span></button>`;
}

/**
 * The sidebar. Roving focus: only the current page's link is in the tab order; arrow keys move between links (hub.mjs).
 * @param {ReturnType<typeof import("./hub-model.mjs").navModel>} nav
 */
export function navHtml(nav) {
  const link = (/** @type {string} */ page, /** @type {string} */ inner, /** @type {string} */ label, extra = "") => {
    const on = nav.current === page;
    return `<button type="button" class="ws-nav${on ? " active" : ""}${extra}" data-action="nav" data-page="${esc(page)}" tabindex="${on ? 0 : -1}"${on ? ` aria-current="page"` : ""} aria-label="${esc(label)}">${inner}</button>`;
  };
  const mods = nav.modules.map(m => link(m.page,
    `${dotHtml(m.dot)}<span class="ws-lbl">${esc(m.title)}</span>${m.issues ? badge(m.issueLevel, String(m.issues), { small: true }) : ""}`,
    `${m.title}${dotWord(m.dot) ? `, ${dotWord(m.dot)}` : ""}${m.issues ? `, ${m.issues} to look at` : ""}`, m.active ? "" : " ws-inactive")).join("");
  return `<nav class="ws-side" aria-label="Satchel sections">
    ${link("overview", `<i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span class="ws-lbl">Overview</span>`, "Overview")}
    <h2 class="ws-side-head">Modules</h2>
    ${mods || `<p class="hint ws-side-empty">None installed</p>`}
    <h2 class="ws-side-head">Tools</h2>
    ${nav.tools.map(t => link(t.page, `<i class="${esc(t.icon)}" aria-hidden="true"></i><span class="ws-lbl">${esc(t.label)}</span>`, t.label)).join("")}
    <span class="ws-grow"></span>
    <span class="hint ws-side-version">Satchel <code>${esc(nav.version)}</code></span>
  </nav>`;
}

/** @param {string} title @param {string} [actions] */
const pageHead = (title, actions = "") => `<header class="ws-pagehead"><h2>${esc(title)}</h2>${actions}</header>`;

/**
 * The overview page.
 * @param {ReturnType<typeof import("./hub-model.mjs").overviewModel>} ov
 * @param {{ updateCheck: boolean, combinedHealth: boolean, id: string }} o
 */
export function overviewHtml(ov, o) {
  const s = ov.stats;
  const stat = (/** @type {string} */ k, /** @type {string} */ v, hint = "") => `<div class="ws-stat"><span class="ws-k">${esc(k)}</span><span class="ws-v">${v}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</div>`;
  const statLevel = (/** @type {any} */ x) => `<span class="ws-${levelOf(x.level)}">${icon(x.level)}${esc(x.text)}</span>`;
  const rows = ov.rows.map(r => `<tr class="${r.active ? "" : "ws-inactive"}">
      <th scope="row"><span class="ws-name">${dotHtml(r.dot)}${esc(r.title)}</span></th>
      <td><code>${esc(r.version)}</code></td>
      ${o.updateCheck ? `<td><span class="ws-cell ws-${levelOf(r.update.level)}"${r.update.title ? ` title="${esc(r.update.title)}"` : ""}><i class="${esc(r.update.icon)}" aria-hidden="true"></i><span>${esc(r.update.text)}</span></span></td>` : ""}
      ${o.combinedHealth && r.health ? `<td>${badge(r.health.level, r.health.text)}</td>` : ""}
      <td class="ws-go-cell"><button type="button" class="ws-go" data-action="nav" data-page="${esc(r.page)}" aria-label="Open ${esc(r.title)}" title="Open ${esc(r.title)}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></td>
    </tr>`).join("");
  const table = ov.rows.length ? `<div class="ws-table-box"><table class="ws-table" aria-label="Modules">
      <thead><tr><th scope="col">Module</th><th scope="col">Version</th>${o.updateCheck ? `<th scope="col">Updates</th>` : ""}${o.combinedHealth ? `<th scope="col">Health</th>` : ""}<th scope="col"><span class="ws-sr">Open</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
    : `<p class="ws-panel ws-pad">None of the known modules is installed, and no module has registered with the Satchel.</p>`;
  const t = ov.tools;
  const tools = [
    t.transfer ? `<div class="ws-tool"><h3><i class="fa-solid fa-right-left" aria-hidden="true"></i>Settings transfer</h3><p>One file with every module's settings. You see a preview before anything is written.</p><div class="ws-row">${button("export", "Export", { icon: "fa-solid fa-file-export", small: true })}${button("pickImport", "Import…", { icon: "fa-solid fa-file-import", small: true })}</div></div>` : "",
    t.debug ? `<div class="ws-tool"><h3><i class="fa-solid fa-terminal" aria-hidden="true"></i>Debug logging</h3><p>Turns each module's own debug setting on or off. ${t.debug.count} ${t.debug.count === 1 ? "module has" : "modules have"} one.</p><label class="ws-check"><input type="checkbox" data-change="debugAll" ${t.debug.state === "on" ? "checked" : ""}> On for all <span class="hint">· now ${t.debug.state === "mixed" ? "some on" : esc(t.debug.state)}</span></label></div>` : "",
    `<div class="ws-tool"><h3><i class="fa-solid fa-broom" aria-hidden="true"></i>Maintenance</h3><p>Remove what the Satchel stored: chat cards, cached update answers, its settings.</p><div>${button("nav", "Remove Satchel data…", { small: true, data: { page: "maintenance" } })}</div></div>`
  ].join("");
  const head = pageHead("Overview", [
    o.updateCheck ? button("recheckUpdates", "Check for updates", { icon: "fa-solid fa-rotate" }) : "",
    o.combinedHealth ? button("checkAll", "Check everything", { icon: "fa-solid fa-stethoscope", primary: true }) : ""
  ].join(""));
  return `${head}
    <div class="ws-stats">
      ${stat("Modules", `${s.active} <span class="hint">of ${s.total} active</span>`)}
      ${stat("Updates", statLevel(s.updates), s.updates.hint)}
      ${stat("Last health check", statLevel(s.health), s.health.hint)}
    </div>
    ${table}
    <div class="ws-tools">${tools}</div>
    <p class="hint">Each module keeps its own settings and windows; the Satchel only opens them. Other modules can join with <code>game.modules.get("${esc(o.id)}").api.register({ id })</code>.</p>`;
}

/**
 * One module's page.
 * @param {ReturnType<typeof import("./hub-model.mjs").moduleModel>} m
 */
export function moduleHtml(m) {
  const head = `<header class="ws-mhead"><div class="ws-grow"><h2>${esc(m.title)}</h2><div class="ws-meta"><code>${esc(m.id)}${m.version ? ` · ${esc(m.version)}` : ""}</code>${m.badges.map((/** @type {any} */ b) => badge(b.level, b.text, { title: b.title })).join("")}</div></div>
    ${button("panel", "Open control panel", { icon: "fa-solid fa-sliders", primary: true, data: { id: m.id }, disabled: !m.canPanel, title: m.canPanel ? "" : "The module isn't active in this world." })}</header>`;
  const u = m.update;
  const upd = u.banner ? `<div class="ws-banner ws-warn" role="status"><i class="${esc(u.icon)}" aria-hidden="true"></i><span class="ws-grow"><strong>Update available: <code>${esc(u.text.replace(/ available$/, ""))}</code></strong> <span class="hint">· ${esc(u.title.toLowerCase())}</span></span>${m.links.some((/** @type {any} */ l) => l.act === "changelog") ? button("changelog", "What's new", { small: true, data: { id: m.id } }) : ""}</div>`
    : m.installed && u.level !== "ok" ? `<p class="ws-muted-line ws-${levelOf(u.level)}"${u.title ? ` title="${esc(u.title)}"` : ""}><i class="${esc(u.icon)}" aria-hidden="true"></i> ${esc(u.text)}</p>` : "";
  const h = m.health;
  const healthPanel = !h ? "" : `<section class="ws-panel" aria-label="Health">
      <header class="ws-ph"><h3>Health</h3><span class="hint ws-grow">${esc(h.hint)}</span>${h.available ? button("healthOne", h.group ? "Run again" : "Run check", { icon: "fa-solid fa-stethoscope", small: true, data: { id: m.id } }) : ""}</header>
      <div class="ws-pb ws-health">${!h.available ? `<p class="hint">Not active in this world.</p>` : h.group ? `${h.group.note ? `<p class="hint">${esc(h.group.note)}</p>` : ""}${groupSections(h.group)}` : `<p class="hint">Not checked since the page loaded. <em>Run check</em> runs this module's own check.</p>`}</div>
    </section>`;
  const satchel = m.transfer || m.debug ? `<section class="ws-panel" aria-label="In the Satchel"><header class="ws-ph"><h3>In the Satchel</h3></header><div class="ws-pb ws-kv">
      ${m.transfer ? `<div class="ws-kv-row"><span>Export / import</span><span class="hint">${esc(m.transfer.text)}</span></div>` : ""}
      ${m.debug ? m.debug.available ? `<div class="ws-kv-row"><label for="ws-dbg-${esc(m.id)}">Debug logging</label><input type="checkbox" id="ws-dbg-${esc(m.id)}" data-change="debugOne" data-id="${esc(m.id)}" ${m.debug.on ? "checked" : ""}></div>` : `<div class="ws-kv-row"><span>Debug logging</span><span class="hint">${esc(m.debug.text)}</span></div>` : ""}
    </div></section>` : "";
  const links = m.links.length ? `<section class="ws-panel" aria-label="Links"><header class="ws-ph"><h3>Links</h3></header><div class="ws-pb ws-links">${m.links.map((/** @type {any} */ l) => button(l.act, l.label, { icon: l.icon, small: true, data: { id: m.id }, cls: "ws-link" })).join("")}</div></section>` : "";
  const data = m.extras.length ? `<section class="ws-panel" aria-label="Module data"><header class="ws-ph"><h3>Module data</h3></header><div class="ws-pb"><p class="hint">Opens the module's own window.</p><div class="ws-row">${m.extras.map((/** @type {any} */ x) => button("extra", x.label, { icon: x.icon, small: true, data: { id: m.id, i: String(x.i) } })).join("")}</div></div></section>` : "";
  const notes = m.notes.length ? `<div class="hint">${m.notes.map((/** @type {string} */ n) => `<p>${esc(n)}</p>`).join("")}</div>` : "";
  return `${head}${upd}${notes}<div class="ws-cols">${healthPanel || "<div></div>"}<div class="ws-side-panels">${satchel}${links}${data}</div></div>`;
}

/** A health group's sections (no group header). @param {any} g */
export const groupSections = g => g.sections.map((/** @type {any} */ s) => `${s.title ? `<h4>${esc(s.title)}</h4>` : ""}<ul class="ws-lines">${s.lines.map((/** @type {any} */ l) => `<li>${icon(l.level)}<span>${esc(l.text)}</span></li>`).join("")}</ul>`).join("");

/** The health page frame; hub.mjs fills `.ws-health-box` with health.mjs html() as results come in. */
export const healthPageHtml = () => `${pageHead("Health check", `${button("healthAgain", "Check again", { icon: "fa-solid fa-rotate" })}${button("healthPost", "Whisper to GMs", { icon: "fa-solid fa-comment" })}`)}<div class="ws-health-box" aria-live="polite"></div>`;

/**
 * The settings transfer page (Export / Import tabs, Foundry's tab markup).
 * @param {{ tab: string, error: { name: string, text: string } | null, file: { name: string, size: number } | null, result: any, model: any }} s
 */
export function transferHtml(s) {
  const tab = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ ic) => `<button type="button" class="ws-tab-btn${s.tab === id ? " active" : ""}" data-action="tab" data-group="transfer" data-tab="${id}" role="tab" aria-selected="${s.tab === id}"><i class="${ic}" aria-hidden="true"></i> ${label}</button>`;
  const exp = `<section class="tab ws-tab${s.tab === "export" ? " active" : ""}" data-group="transfer" data-tab="export" role="tabpanel">
      <p>Downloads one JSON file with the settings of every active module in the Satchel (and the Satchel's own). Record-type settings (histories, caches, "last version seen") are never exported.</p>
      <div>${button("export", "Export all settings", { icon: "fa-solid fa-file-export", primary: true })}</div></section>`;
  const err = s.error ? `<div class="ws-notice ws-bad" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span><strong>Last file not read.</strong> ${s.error.name ? `<code>${esc(s.error.name)}</code> wasn't read: ` : ""}${esc(s.error.text)}</span></div>` : "";
  const body = s.result && s.model ? importHtml(s.result, s.model, s.file)
    : `<div class="ws-filebar"><span class="ws-grow">Pick a settings file exported by the Satchel. Nothing is written until you confirm.</span>${button("pickImport", "Choose a file…", { icon: "fa-solid fa-file-import", primary: true })}</div>`;
  const imp = `<section class="tab ws-tab${s.tab === "import" ? " active" : ""}" data-group="transfer" data-tab="import" role="tabpanel">${err}${body}</section>`;
  return `${pageHead("Settings transfer")}<nav class="tabs ws-tabs" data-group="transfer" role="tablist" aria-label="Settings transfer">${tab("export", "Export", "fa-solid fa-file-export")}${tab("import", "Import", "fa-solid fa-file-import")}</nav>${exp}${imp}`;
}

const kb = (/** @type {number} */ n) => n < 1024 ? `${n} B` : `${Math.max(1, Math.round(n / 1024))} KB`;
/**
 * The import preview: file bar, count badges, a block per module, sticky footer.
 * @param {any} r the readText result @param {ReturnType<typeof import("./hub-model.mjs").importModel>} model @param {{ name: string, size: number } | null} file
 * @param {(v: unknown) => string} [show] short value text
 */
export function importHtml(r, model, file, show = v => preview(v)) {
  const bar = `<div class="ws-filebar"><div class="ws-grow">${file ? `<strong><code>${esc(file.name)}</code></strong>` : ""}<div class="hint">${file ? `${kb(file.size)} · ` : ""}exported ${esc(r.exported || "at an unknown time")}${r.version ? ` by Satchel ${esc(r.version)}` : ""} · nothing has been written yet</div></div>${button("pickImport", "Choose another file…", { icon: "fa-solid fa-file-import", small: true })}</div>`;
  const facts = `<div class="ws-facts" data-part="facts">${factsHtml(model)}</div>`;
  const mods = model.modules.map(m => `<section class="ws-mod${m.ok ? "" : " ws-inactive"}" aria-label="${esc(m.title)}">
      <header class="ws-mh"><h3>${esc(m.title)}</h3><span class="hint"><code>${esc(m.id)}</code>${m.version ? ` · file from ${esc(m.version)}` : ""}${m.how === "module" ? " · checked by the module's own import" : ""}</span><span class="ws-grow"></span><span data-part="badges-${m.i}">${m.badges.map((/** @type {any} */ b) => badge(b.level, b.text)).join("")}</span></header>
      ${m.issues.length ? `<ul class="ws-issues">${m.issues.map((/** @type {any} */ x) => `<li>${icon(x.level)}<span>${esc(x.text)}${x.keys.length ? ` ${x.keys.map((/** @type {string} */ k) => `<code>${esc(k)}</code>`).join(", ")}` : ""}</span></li>`).join("")}</ul>` : ""}
      ${m.rows.length ? `<div class="ws-table-box"><table class="ws-table ws-import-table"><thead><tr><th scope="col"><span class="ws-sr">Import</span></th><th scope="col">Setting</th><th scope="col">Now</th><th scope="col">From the file</th></tr></thead><tbody>${m.rows.map((/** @type {any} */ x) => x.refused
        ? `<tr class="ws-refused"><td><input type="checkbox" disabled aria-label="${esc(x.label)}, refused"></td><td><strong>${esc(x.label)}</strong></td><td></td><td><span class="ws-bad">${icon("bad")}${esc(x.refused)}</span></td></tr>`
        : `<tr class="${x.changed ? "" : "ws-dim"}"><td><input type="checkbox" data-change="tick" data-m="${x.i}" data-r="${x.j}" ${x.ticked ? "checked" : ""} aria-label="Import ${esc(x.label)}"></td><td><strong>${esc(x.label)}</strong><div class="hint"><code>${esc(x.key)}</code>${x.note ? ` · ${esc(x.note)}` : ""}</div></td><td><span class="ws-val">${esc(show(x.from))}</span></td><td><span class="ws-val${x.changed ? " ws-val-new" : ""}">${esc(show(x.to))}</span>${x.changed ? "" : ` <span class="hint">unchanged</span>`}</td></tr>`).join("")}</tbody></table></div>` : ""}
    </section>`).join("") || `<p>The file has no modules.</p>`;
  return `${bar}${facts}${mods}<footer class="ws-sticky" data-part="footer">${footerHtml(model)}</footer>`;
}
/** @param {any} model */
export const factsHtml = model => model.facts.map((/** @type {any} */ f) => badge(f.level, f.text)).join("");
/** @param {any} model */
export const footerHtml = model => `<span class="hint">${esc(model.hint)}</span><span class="ws-grow"></span>${button("cancelImport", "Cancel", { icon: "fa-solid fa-xmark" })}${button("doImport", model.button, { icon: "fa-solid fa-file-import", primary: true, disabled: !model.ticked })}`;

/**
 * The maintenance page: Remove Satchel data (dry-run counts, type REMOVE).
 * @param {Record<string, number>} counts @param {[string, string][]} categories @param {string} word
 */
export function maintenanceHtml(counts, categories, word) {
  return `${pageHead("Maintenance")}<section class="ws-panel ws-pad"><form class="ws-cleanup" data-part="cleanup" autocomplete="off">
    <h3><i class="fa-solid fa-broom" aria-hidden="true"></i> Remove Satchel data</h3>
    <p>Removes what the Satchel stored. The counts are what would go now (a dry run); nothing changes until you confirm. Other modules' settings and data are never touched, including debug settings the <em>Debug logging for all</em> switch turned on (turn them off on the overview first if you want).</p>
    ${categories.map(([k, label]) => `<div class="form-group"><label class="ws-check ws-grow"><input type="checkbox" name="${esc(k)}" ${k === "settings" ? "" : "checked"}> ${esc(label)}</label>${badge(counts[k] ? "info" : "off", String(counts[k] ?? 0), { title: "Would be removed now" })}</div>`).join("")}
    <p class="hint">Also left behind, documented in the README: the key binding (if you changed it, Foundry keeps it in its own key binding settings).</p>
    <div class="form-group"><label for="ws-cleanup-confirm">Type <strong>${esc(word)}</strong> to confirm</label><div class="form-fields"><input type="text" id="ws-cleanup-confirm" name="confirm" autocomplete="off"></div></div>
    <p class="ws-notice ws-bad" data-part="cleanup-error" role="alert" hidden></p>
    <footer class="ws-row ws-end">${button("removeData", "Remove", { icon: "fa-solid fa-broom", primary: true })}</footer>
  </form></section>`;
}
