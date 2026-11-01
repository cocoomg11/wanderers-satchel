/**
 * The hub window's HTML, pure (tested in Node): one function per part (sidebar, overview, module page, health page and report,
 * settings transfer, import preview, maintenance) from the view models in hub-model.mjs. Every value is escaped. Clicks are wired
 * through ApplicationV2 `actions` (`data-action`); the transfer tabs use Foundry's own tab markup (`data-action="tab"`,
 * `data-group`, `data-tab`) so `changeTab` works. The look is wanderers-core's shared stylesheet (`wc-*` classes and tokens,
 * vendor/wanderers-core/styles/wanderers-ui.css) plus satchel.css for what only the Satchel has (`ws-*`).
 */
import { esc, plural } from "./const.mjs";
import { UI_CLASSES, TONES, tone, icon as coreIcon, badge as coreBadge, dot, statusLine, navItem } from "../vendor/wanderers-core/index.mjs";
import { preview } from "./settings-model.mjs";
import { filterChips, applyFilter, hiddenText, okFold, showAllText, allOkText } from "./filter-model.mjs";
import { notesHtml } from "./notes-model.mjs";

/** The root classes for markup outside a Satchel window (the chat card). */
export const ROOT = UI_CLASSES.join(" ");
/** A status icon with a word for screen readers. @param {string} level */
export const icon = (/** @type {string} */ level) => coreIcon(level);
/** The reusable badge. @param {string} level @param {string} text @param {{ title?: string, icon?: boolean, small?: boolean }} [o] */
export const badge = (/** @type {string} */ level, /** @type {string} */ text, /** @type {{ title?: string, icon?: boolean, small?: boolean }} */ o = {}) => coreBadge(level, text, o);
const dotWord = (/** @type {string} */ d) => ({ ok: "health OK", warn: "warnings", bad: "problems", off: "not active", pending: "checking", none: "not checked" })[d] ?? "";
/** A button. @param {string} action @param {string} label @param {{ icon?: string, data?: Record<string, string>, primary?: boolean, danger?: boolean, small?: boolean, disabled?: boolean, title?: string, cls?: string }} [o] */
export function button(action, label, o = {}) {
  const data = Object.entries(o.data ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
  const cls = ["wc-btn", o.primary ? "wc-btn-primary" : "", o.danger ? "wc-btn-danger" : "", o.small ? "wc-btn-sm" : "", o.cls ?? ""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-action="${esc(action)}"${data}${o.disabled ? " disabled" : ""}${o.title ? ` title="${esc(o.title)}"` : ""}>${o.icon ? `<i class="${esc(o.icon)}" aria-hidden="true"></i>` : ""}<span>${esc(label)}</span></button>`;
}

/**
 * The sidebar. Roving focus: only the current page's link is in the tab order; arrow keys move between links (hub.mjs).
 * @param {ReturnType<typeof import("./hub-model.mjs").navModel>} nav
 */
export function navHtml(nav) {
  const link = (/** @type {any} */ o) => navItem({ ...o, active: nav.current === o.page, tabindex: nav.current === o.page ? 0 : -1 });
  const mods = nav.modules.map(m => link({
    page: m.page, label: m.title, dot: m.dot, muted: !m.active,
    badge: m.issues ? { tone: m.issueLevel, text: String(m.issues) } : undefined,
    aria: `${m.title}${dotWord(m.dot) ? `, ${dotWord(m.dot)}` : ""}${m.issues ? `, ${m.issues} to look at` : ""}`
  })).join("");
  return `<nav class="wc-side" aria-label="Satchel sections">
    ${link({ page: "overview", label: "Overview", icon: "fa-solid fa-table-cells-large", aria: "Overview" })}
    <h2 class="wc-side-head">Modules</h2>
    ${mods || `<p class="wc-hint ws-side-empty">None installed</p>`}
    <h2 class="wc-side-head">Tools</h2>
    ${nav.tools.map(t => link({ page: t.page, label: t.label, icon: t.icon, aria: t.label })).join("")}
    <span class="wc-side-foot">Satchel <code>${esc(nav.version)}</code></span>
  </nav>`;
}

/** @param {string} title @param {string} [actions] */
const pageHead = (title, actions = "") => `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>${esc(title)}</h2></div>${actions}</header>`;

/**
 * The overview page.
 * @param {ReturnType<typeof import("./hub-model.mjs").overviewModel>} ov
 * @param {{ updateCheck: boolean, combinedHealth: boolean, id: string, checkedHint?: string, whatsNew?: string, selfUpdate?: any }} o
 *   whatsNew: the "What's new" cards (whatsNewHtml), shown above the tiles; selfUpdate: the Satchel's own update result
 */
export function overviewHtml(ov, o) {
  const s = ov.stats;
  const stat = (/** @type {string} */ k, /** @type {string} */ v, hint = "") => `<div class="wc-stat"><span class="wc-stat-k">${esc(k)}</span><span class="wc-stat-v">${v}</span>${hint ? `<span class="wc-hint">${esc(hint)}</span>` : ""}</div>`;
  const statLevel = (/** @type {any} */ x) => `<span class="ws-stat-level wc-${tone(x.level)}">${icon(x.level)}${esc(x.text)}</span>`;
  const rows = ov.rows.map(r => `<tr class="${r.active ? "" : "ws-inactive"}">
      <th scope="row"><span class="ws-name">${dot(r.dot)}${esc(r.title)}</span></th>
      <td><code>${esc(r.version)}</code></td>
      ${o.updateCheck ? `<td><span class="ws-cell wc-${tone(r.update.level)}"${r.update.title ? ` title="${esc(r.update.title)}"` : ""}><i class="${esc(r.update.icon)}" aria-hidden="true"></i><span>${esc(r.update.text)}</span></span></td>` : ""}
      ${o.combinedHealth && r.health ? `<td>${badge(r.health.level, r.health.text)}</td>` : ""}
      <td class="ws-launch-cell">${r.launcher ? launchButton(r.id, r.title, r.launcher, { small: true }) : ""}</td>
      <td class="ws-go-cell"><button type="button" class="wc-btn wc-btn-ghost wc-btn-icon ws-go" data-action="nav" data-page="${esc(r.page)}" aria-label="${esc(r.title)}: details" title="${esc(r.title)}: details"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></td>
    </tr>`).join("");
  const table = ov.rows.length ? `<div class="wc-table-box"><table class="wc-table ws-wide" aria-label="Modules">
      <thead><tr><th scope="col">Module</th><th scope="col">Version</th>${o.updateCheck ? `<th scope="col">Updates</th>` : ""}${o.combinedHealth ? `<th scope="col">Health</th>` : ""}<th scope="col"><span class="wc-sr">Open the module's window</span></th><th scope="col"><span class="wc-sr">Details</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
    : `<p class="wc-panel ws-pad">None of the known modules is installed, and no module has registered with the Satchel.</p>`;
  const t = ov.tools;
  const tools = [
    t.transfer ? `<div class="ws-tool"><h3><i class="fa-solid fa-right-left" aria-hidden="true"></i>Settings transfer</h3><p>One file with every module's settings. You see a preview before anything is written.</p><div class="wc-row">${button("export", "Export", { icon: "fa-solid fa-file-export", small: true })}${button("pickImport", "Import…", { icon: "fa-solid fa-file-import", small: true })}</div></div>` : "",
    t.debug ? `<div class="ws-tool"><h3><i class="fa-solid fa-terminal" aria-hidden="true"></i>Debug logging</h3><p>Turns each module's own debug setting on or off. ${t.debug.count} ${t.debug.count === 1 ? "module has" : "modules have"} one.</p><label class="ws-check"><input type="checkbox" data-change="debugAll" ${t.debug.state === "on" ? "checked" : ""}> On for all <span class="wc-hint">· now ${t.debug.state === "mixed" ? "some on" : esc(t.debug.state)}</span></label></div>` : "",
    t.backups ? `<div class="ws-tool"><h3><i class="fa-solid fa-box-archive" aria-hidden="true"></i>Settings backups</h3><p>${esc(t.backups.text)}</p><div class="wc-row">${button("backupNow", "Back up now", { icon: "fa-solid fa-box-archive", small: true })}${button("backups", "Backups…", { small: true })}</div></div>` : "",
    `<div class="ws-tool"><h3><i class="fa-solid fa-broom" aria-hidden="true"></i>Maintenance</h3><p>Remove what the Satchel stored: chat cards, cached update answers, its settings.</p><div>${button("nav", "Remove Satchel data…", { small: true, data: { page: "maintenance" } })}</div></div>`
  ].join("");
  const head = pageHead("Overview", [
    o.updateCheck ? button("recheckUpdates", "Check now", { icon: "fa-solid fa-rotate", title: o.checkedHint ? `Check for updates now (${o.checkedHint})` : "Check for updates now" }) : "",
    o.combinedHealth ? button("checkAll", "Check everything", { icon: "fa-solid fa-stethoscope", primary: true }) : ""
  ].join(""));
  const self = o.updateCheck && o.selfUpdate?.status === "update" ? `<div class="wc-banner wc-warn" role="status"><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i><span class="wc-banner-text"><strong>Wanderer's Satchel: update available <code>${esc(o.selfUpdate.installed ?? "?")}</code> → <code>${esc(o.selfUpdate.latest)}</code></strong> <span class="wc-hint">· update it in Foundry's Setup screen (Add-on Modules › Update).</span></span></div>` : "";
  return `${head}${self}${o.whatsNew ?? ""}
    <div class="wc-stats">
      ${stat("Modules", `${s.active} <span class="wc-hint">of ${s.total} active</span>`)}
      ${stat("Updates", statLevel(s.updates), [s.updates.hint, o.checkedHint ?? ""].filter(Boolean).join(" · "))}
      ${stat("Last health check", statLevel(s.health), s.health.hint)}
    </div>
    ${table}
    <div class="ws-tools">${tools}</div>
    <p class="wc-hint">Each module keeps its own settings and windows; the Satchel only opens them. Other modules can join with <code>game.modules.get("${esc(o.id)}").api.register({ id })</code>.</p>`;
}

/**
 * One module's page.
 * @param {ReturnType<typeof import("./hub-model.mjs").moduleModel>} m
 */
export function moduleHtml(m, { filter = new Set(), fixes = false, news = "" } = {}) {
  const head = `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>${esc(m.title)}</h2><div class="wc-pagehead-meta"><code>${esc(m.id)}${m.version ? ` · ${esc(m.version)}` : ""}</code>${m.badges.map((/** @type {any} */ b) => badge(b.level, b.text, { title: b.title })).join("")}</div></div>
    <div class="wc-row">${m.launcher ? launchButton(m.id, m.title, m.launcher, { primary: true }) : ""}${button("panel", m.launcher ? "Settings" : "Open control panel", { icon: "fa-solid fa-sliders", primary: !m.launcher, data: { id: m.id }, disabled: !m.canPanel, title: m.canPanel ? (m.launcher ? "Opens the module's control panel or settings" : "") : "The module isn't active in this world." })}</div></header>`;
  const u = m.update;
  const upd = u.banner ? `<div class="wc-banner wc-warn" role="status"><i class="${esc(u.icon)}" aria-hidden="true"></i><span class="wc-banner-text"><strong>Update available <code>${esc(u.from)}</code> → <code>${esc(u.to)}</code></strong> <span class="wc-hint">· ${esc(u.title)}</span></span>${m.links.some((/** @type {any} */ l) => l.act === "changelog") ? button("changelog", "Changelog", { small: true, data: { id: m.id } }) : ""}${m.canBackup ? button("backupNow", "Back up settings", { small: true, icon: "fa-solid fa-box-archive" }) : ""}</div>`
    : m.installed && u.level !== "ok" ? `<p class="ws-muted-line wc-${tone(u.level)}"${u.title ? ` title="${esc(u.title)}"` : ""}><i class="${esc(u.icon)}" aria-hidden="true"></i> ${esc(u.text)}</p>` : "";
  const h = m.health;
  const panel = (/** @type {string} */ title, /** @type {string} */ body, headExtra = "", bodyCls = "") => `<section class="wc-panel" aria-label="${esc(title)}"><header class="wc-panel-head"><h3>${esc(title)}</h3>${headExtra}</header><div class="wc-panel-body${bodyCls}">${body}</div></section>`;
  let healthBody = "";
  if (h) {
    if (!h.available) healthBody = `<p class="wc-hint">Not active in this world.</p>`;
    else if (!h.group) healthBody = `<p class="wc-hint">Not checked since the page loaded. <em>Run check</em> runs this module's own check.</p>`;
    else {
      const one = { groups: [h.group] }; const f = applyFilter(one, filter); const fold = okFold(one, filter);
      const lines = f.groups.length ? `${h.group.note && !f.on ? `<p class="wc-hint">${esc(h.group.note)}</p>` : ""}${groupSections(f.groups[0], { fixes })}` : fold.allOk ? allOkHtml(fold.total) : `<p class="wc-hint">No lines match the filter.</p>`;
      healthBody = `${filterBar(filterChips(one, filter), `${m.title} health lines`, { hiddenOk: fold.hiddenOk })}${lines}`;
    }
  }
  const healthPanel = !h ? "" : panel("Health", healthBody, `<span class="wc-hint">${esc(h.hint)}</span>${h.available ? button("healthOne", h.group ? "Run again" : "Run check", { icon: "fa-solid fa-stethoscope", small: true, data: { id: m.id } }) : ""}`, " ws-health");
  const satchel = m.transfer || m.debug ? panel("In the Satchel", `
      ${m.transfer ? `<div class="ws-kv-row"><span>Export / import</span><span class="wc-hint">${esc(m.transfer.text)}</span></div>` : ""}
      ${m.debug ? m.debug.available ? `<div class="ws-kv-row"><label for="ws-dbg-${esc(m.id)}">Debug logging</label><input type="checkbox" id="ws-dbg-${esc(m.id)}" data-change="debugOne" data-id="${esc(m.id)}" ${m.debug.on ? "checked" : ""}></div>` : `<div class="ws-kv-row"><span>Debug logging</span><span class="wc-hint">${esc(m.debug.text)}</span></div>` : ""}`) : "";
  const links = m.links.length ? panel("Links", `<div class="wc-row">${m.links.map((/** @type {any} */ l) => button(l.act, l.label, { icon: l.icon, small: true, data: { id: m.id } })).join("")}</div>`) : "";
  const data = m.extras.length ? panel("Module data", `<p class="wc-hint">Opens the module's own window.</p><div class="wc-row">${m.extras.map((/** @type {any} */ x) => button("extra", x.label, { icon: x.icon, small: true, data: { id: m.id, i: String(x.i) } })).join("")}</div>`) : "";
  const notes = m.notes.length ? `<div class="wc-hint ws-notes">${m.notes.map((/** @type {string} */ n) => `<p>${esc(n)}</p>`).join("")}</div>` : "";
  return `${head}${upd}${news}${notes}<div class="wc-cols">${healthPanel || "<div></div>"}<div class="ws-side-panels">${satchel}${links}${data}</div></div>`;
}

/**
 * A launcher button (0.7.0): opens the module's own window (the hub's `launch` action). The label is the module's `openLabel`
 * ("Open" by default); the accessible name says which module.
 * @param {string} id @param {string} title @param {{ label: string }} l @param {{ primary?: boolean, small?: boolean }} [o]
 */
export function launchButton(id, title, l, o = {}) {
  const cls = ["wc-btn", o.primary ? "wc-btn-primary" : "", o.small ? "wc-btn-sm" : "", "ws-launch"].filter(Boolean).join(" ");
  const name = l.label === "Open" ? `Open ${title}` : `${title}: ${l.label}`;
  return `<button type="button" class="${cls}" data-action="launch" data-id="${esc(id)}" aria-label="${esc(name)}" title="${esc(name)}"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i><span>${esc(l.label)}</span></button>`;
}

/** A health group's sections (no group header). @param {any} g */
export const groupSections = (/** @type {any} */ g, { fixes = false } = {}) => g.sections.map((/** @type {any} */ s) => `${s.title ? `<h4>${esc(s.title)}</h4>` : ""}<ul class="wc-lines">${s.lines.map((/** @type {any} */ l) => statusLine(l.level, l.text, fixes && l.fix?.key ? { html: fixButton(g.id, l.fix) } : {})).join("")}</ul>`).join("");
/** A health line's Fix button (the hub's `healthFix` action finds the line again by module id and key). @param {string} id @param {any} fix */
export const fixButton = (id, fix) => button("healthFix", fix.label || "Fix", { icon: "fa-solid fa-screwdriver-wrench", small: true, cls: "ws-fix", data: { id, key: fix.key }, title: fix.confirm ? `${fix.label || "Fix"} (asks first)` : "" });

/**
 * The filter chips: toggle buttons (`aria-pressed`) wired to the hub's `healthFilter` action. "All" clears the filter.
 * @param {ReturnType<typeof filterChips>} chips @param {string} label what the group of buttons filters (for screen readers)
 */
export function filterBar(chips, label, { hiddenOk = 0 } = {}) {
  const on = chips.some(c => c.key !== "all" && c.pressed);
  const showAll = hiddenOk > 0 ? `<button type="button" class="wc-badge wc-none ws-filter ws-show-all" data-action="healthFilter" data-filter="all" title="Show every line, OK ones too">${esc(showAllText(hiddenOk))}</button>` : "";
  return `<div class="ws-filters${on ? " ws-filtering" : ""}" role="group" aria-label="Filter ${esc(label)}">${chips.filter(c => c.show).map(c => `<button type="button" class="wc-badge wc-${c.tone} ws-filter" data-action="healthFilter" data-filter="${c.key}" aria-pressed="${c.pressed}">${c.key === "all" ? "" : `<i class="${TONES[c.tone].icon}" aria-hidden="true"></i>`}${esc(c.label)}</button>`).join("")}${showAll}</div>`;
}
/** The one line shown instead of a report the filter leaves empty because everything is OK (0.7.0). @param {number} n */
export const allOkHtml = n => `<ul class="wc-lines ws-all-ok" role="status">${statusLine("ok", allOkText(n))}</ul>`;

/** The summary as count badges (the chat card and the separate window: no buttons). @param {any} s */
export function summaryHtml(s) {
  const b = (/** @type {string} */ lv, /** @type {string} */ t) => badge(lv, t, { icon: true });
  const extra = [s.waiting ? b("pending", `${s.waiting} still checking`) : "", s.failed ? b("bad", `${s.failed} failed`) : "", s.none ? b("off", `${s.none} without a check`) : "", s.inactive ? b("off", `${s.inactive} not active`) : ""].join("");
  return `<span class="ws-summary-text">${plural(s.modules, "module")}</span>${b("ok", `${s.ok} ok`)}${b("warn", plural(s.warn, "warning"))}${b("bad", plural(s.bad, "problem"))}${extra}`;
}

/** One module's header in the report: title (wraps as words) and its counts (never wrap; move to their own line when narrow). @param {any} x */
const groupHead = (/** @type {any} */ x) => {
  const busy = x.state === "pending" || x.state === "slow";
  return `<header class="ws-group-head"><h3>${icon(busy ? "pending" : x.worst)}<span class="ws-group-title">${esc(x.title)}</span></h3>${busy ? "" : `<span class="ws-counts">${x.counts.ok} ok · ${x.counts.warn} warn · ${x.counts.bad} bad</span>`}</header>`;
};

/**
 * The grouped report as HTML (every value escaped). `filter`: the chips become toggle filters and only matching lines show
 * (modules without one are hidden and counted). `card`: the whispered chat card (static badges, wrapped in the shared look's
 * root classes so it is styled outside any Satchel window).
 * @param {any} g the groupHealth result
 * @param {{ filter?: Set<string> | null, card?: boolean, summaryTitle?: string, fixes?: boolean }} [o] filter: null for static badges;
 *   fixes: Fix buttons on lines that have one (the hub only; never on the chat card)
 */
export function healthHtml(g, { filter = null, card = false, summaryTitle = "", fixes = false } = {}) {
  const f = filter ? applyFilter(g, filter) : { groups: g.groups, hidden: 0, on: false };
  const fold = filter ? okFold(g, filter) : { hiddenOk: 0, allOk: false, total: 0 };
  const body = fold.allOk && !f.groups.length ? allOkHtml(fold.total) : f.groups.map((/** @type {any} */ x) => `<section class="ws-health-group" aria-label="${esc(x.title)}">${groupHead(x)}${x.note ? `<p class="wc-hint">${esc(x.note)}</p>` : ""}${groupSections(x, { fixes: fixes && !card })}</section>`).join("");
  const summary = filter
    ? `<div class="ws-summary"${summaryTitle ? ` title="${esc(summaryTitle)}"` : ""}><span class="ws-summary-text">${plural(g.summary.modules, "module")}</span>${filterBar(filterChips(g, filter), "health lines", { hiddenOk: fold.hiddenOk })}</div>`
    : `<p class="ws-summary"${summaryTitle ? ` title="${esc(summaryTitle)}"` : ""}>${summaryHtml(g.summary)}</p>`;
  const hidden = f.hidden && !(fold.allOk && !f.groups.length) ? `<p class="wc-hint ws-hidden-note" role="status">${esc(hiddenText(f.hidden))}${f.groups.length ? "" : ". Choose All to see every line."}</p>` : "";
  const empty = g.groups.length ? "" : "<p>No modules to check.</p>";
  const inner = `<div class="ws-health">${summary}${hidden}${body}${empty}</div>`;
  return card ? `<div class="${ROOT} ws-card">${inner}</div>` : inner;
}

/** The health page frame; hub.mjs fills `.ws-health-box` with healthHtml() as results come in. */
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
  const err = s.error ? `<div class="wc-alert wc-bad" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span class="wc-alert-title">Last file not read.</span><p>${s.error.name ? `<code>${esc(s.error.name)}</code> wasn't read: ` : ""}${esc(s.error.text)}</p></div>` : "";
  const body = s.result && s.model ? importHtml(s.result, s.model, s.file)
    : `<div class="ws-filebar"><span class="wc-grow">Pick a settings file exported by the Satchel. Nothing is written until you confirm.</span>${button("pickImport", "Choose a file…", { icon: "fa-solid fa-file-import", primary: true })}</div>`;
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
  const bar = `<div class="ws-filebar"><div class="wc-grow">${file ? `<strong><code>${esc(file.name)}</code></strong>` : ""}<div class="wc-hint">${file ? `${kb(file.size)} · ` : ""}exported ${esc(r.exported || "at an unknown time")}${r.version ? ` by Satchel ${esc(r.version)}` : ""} · nothing has been written yet</div></div>${button("pickImport", "Choose another file…", { icon: "fa-solid fa-file-import", small: true })}</div>`;
  const facts = `<div class="ws-facts" data-part="facts">${factsHtml(model)}</div>`;
  const mods = model.modules.map(m => `<section class="wc-panel ws-mod${m.ok ? "" : " ws-inactive"}" aria-label="${esc(m.title)}">
      <header class="ws-mh"><h3>${esc(m.title)}</h3><span class="wc-hint"><code>${esc(m.id)}</code>${m.version ? ` · file from ${esc(m.version)}` : ""}${m.how === "module" ? " · checked by the module's own import" : ""}</span><span class="wc-grow"></span><span data-part="badges-${m.i}">${m.badges.map((/** @type {any} */ b) => badge(b.level, b.text)).join("")}</span></header>
      ${m.issues.length ? `<ul class="wc-lines ws-issues">${m.issues.map((/** @type {any} */ x) => statusLine(x.level, x.text, { html: x.keys.length ? ` ${x.keys.map((/** @type {string} */ k) => `<code>${esc(k)}</code>`).join(", ")}` : "" })).join("")}</ul>` : ""}
      ${m.rows.length ? `<div class="wc-table-box"><table class="wc-table ws-wide ws-import-table"><thead><tr><th scope="col"><span class="wc-sr">Import</span></th><th scope="col">Setting</th><th scope="col">Now</th><th scope="col">From the file</th></tr></thead><tbody>${m.rows.map((/** @type {any} */ x) => x.refused
        ? `<tr class="ws-refused"><td><input type="checkbox" disabled aria-label="${esc(x.label)}, refused"></td><td><strong>${esc(x.label)}</strong></td><td></td><td><span class="wc-bad">${icon("bad")}${esc(x.refused)}</span></td></tr>`
        : `<tr class="${x.changed ? "" : "ws-dim"}"><td><input type="checkbox" data-change="tick" data-m="${x.i}" data-r="${x.j}" ${x.ticked ? "checked" : ""} aria-label="Import ${esc(x.label)}"></td><td><strong${x.hint ? ` title="${esc(x.hint)}"` : ""}>${esc(x.label)}</strong><div class="wc-hint"><code>${esc(x.key)}</code>${x.note ? ` · ${esc(x.note)}` : ""}</div></td><td><span class="wc-val">${esc(show(x.from))}</span></td><td><span class="wc-val${x.changed ? " wc-val-new" : ""}">${esc(show(x.to))}</span>${x.changed ? "" : ` <span class="wc-hint">unchanged</span>`}</td></tr>`).join("")}</tbody></table></div>` : ""}
    </section>`).join("") || `<p>The file has no modules.</p>`;
  return `${bar}${facts}${mods}<footer class="ws-sticky" data-part="footer">${footerHtml(model)}</footer>`;
}
/** @param {any} model */
export const factsHtml = model => model.facts.map((/** @type {any} */ f) => badge(f.level, f.text)).join("");
/** @param {any} model */
export const footerHtml = model => `<span class="wc-hint">${esc(model.hint)}</span><span class="wc-grow"></span>${button("cancelImport", "Cancel", { icon: "fa-solid fa-xmark" })}${button("doImport", model.button, { icon: "fa-solid fa-file-import", primary: true, disabled: !model.ticked })}`;

/**
 * The maintenance page: Remove Satchel data (dry-run counts, type REMOVE).
 * @param {Record<string, number>} counts @param {[string, string][]} categories @param {string} word
 */
/**
 * The Maintenance page: the "Module data folder" switch (this browser), window positions, and Remove Satchel data.
 * @param {Record<string, number>} counts @param {[string, string][]} categories @param {string} word
 * @param {{ dataFolder?: ReturnType<typeof import("./hub-model.mjs").dataFolderModel> | null, browser?: { sceneButton: boolean | null, key: string } | null }} [o]
 *   browser (0.7.0): the "Opening the Satchel" panel: the scene button switch (null when the feature is off) and the key text
 */
export function maintenanceHtml(counts, categories, word, { dataFolder = null, browser = null } = {}) {
  return `${pageHead("Maintenance")}${browser ? browserHtml(browser) : ""}${dataFolder ? dataFolderHtml(dataFolder) : ""}${windowsHtml()}<section class="wc-panel ws-pad"><form class="ws-cleanup" data-part="cleanup" autocomplete="off">
    <h3><i class="fa-solid fa-broom" aria-hidden="true"></i> Remove Satchel data</h3>
    <p>Removes what the Satchel stored. The counts are what would go now (a dry run); nothing changes until you confirm. Other modules' settings and data are never touched, including debug settings the <em>Debug logging for all</em> switch turned on (turn them off on the overview first if you want).</p>
    ${categories.map(([k, label]) => `<div class="form-group"><label class="ws-check wc-grow"><input type="checkbox" name="${esc(k)}" ${k === "settings" || k === "store" ? "" : "checked"}> ${esc(label)}</label>${badge(counts[k] ? "info" : "off", String(counts[k] ?? 0), { title: "Would be removed now" })}</div>`).join("")}
    <p class="wc-hint">Also left behind, documented in the README: the key binding (if you changed it, Foundry keeps it in its own key binding settings).</p>
    <div class="form-group"><label for="ws-cleanup-confirm">Type <strong>${esc(word)}</strong> to confirm</label><div class="form-fields"><input type="text" id="ws-cleanup-confirm" name="confirm" autocomplete="off"></div></div>
    <p class="wc-banner wc-bad" data-part="cleanup-error" role="alert" hidden></p>
    <footer class="wc-row wc-end">${button("removeData", "Remove", { icon: "fa-solid fa-broom", danger: true })}</footer>
  </form></section>`;
}

/**
 * The "Module data folder" panel: the Satchel's own switch, and the other modules' switches as read-only lines (any one that is on
 * shows the folder for all of them).
 * @param {ReturnType<typeof import("./hub-model.mjs").dataFolderModel>} m
 */
export function dataFolderHtml(m) {
  const others = m.others.length
    ? `<ul class="wc-lines ws-folder-switches" aria-label="Other modules' switches">${m.others.map(r => statusLine(r.on ? "info" : "off", `${r.title}: ${r.on ? "on" : "off"}`)).join("")}</ul>`
    : `<p class="wc-hint">No other active module has its own switch.</p>`;
  const state = m.shown
    ? (m.own ? "The folder is shown in this browser." : `The folder is shown in this browser because ${m.othersOn.join(", ")} ${m.othersOn.length === 1 ? "has its" : "have their"} switch on. Turn ${m.othersOn.length === 1 ? "it" : "them"} off in ${m.othersOn.length === 1 ? "that module's" : "those modules'"} own settings to hide it.`)
    : "The folder is hidden in this browser.";
  return `<section class="wc-panel ws-pad ws-maint" aria-labelledby="ws-folder-h"><h3 id="ws-folder-h"><i class="fa-solid fa-folder-closed" aria-hidden="true"></i> Module data folder</h3>
    <p>Your modules keep their GM-only journals together in one Journal folder, <em>Module data</em>, hidden from the Journal sidebar. This tidies the sidebar only: it hides nothing from players (the journals are GM only either way).</p>
    <label class="ws-check"><input type="checkbox" data-change="showModuleData" ${m.own ? "checked" : ""}> Show module data folder <span class="wc-hint">· the Satchel's switch, this browser</span></label>
    <p class="wc-hint">Each module has a switch of its own (in its settings), and the folder shows when any one is on. Theirs, as set in this browser:</p>
    ${others}
    <p class="wc-hint" data-part="folder-state">${esc(state)}</p>
  </section>`;
}

/**
 * The "Opening the Satchel" panel (0.7.0): this browser's scene control button switch (client setting `showSceneButton`) and the
 * key binding in use. `sceneButton`: null when the world's Scene control button feature is off.
 * @param {{ sceneButton: boolean | null, key: string }} b
 */
export function browserHtml(b) {
  const sw = b.sceneButton === null ? `<p class="wc-hint">The token controls button is off for this world (feature <em>Scene control button</em>).</p>`
    : `<label class="ws-check"><input type="checkbox" data-change="showSceneButton" ${b.sceneButton ? "checked" : ""}> Button in the token controls <span class="wc-hint">· this browser</span></label>`;
  return `<section class="wc-panel ws-pad ws-maint" aria-labelledby="ws-open-h"><h3 id="ws-open-h"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Opening the Satchel</h3>
    ${sw}
    <p class="wc-hint">Key: <kbd>${esc(b.key || "none")}</kbd> · change it in Configure Controls (<em>Open Wanderer's Satchel</em>).</p>
  </section>`;
}

/** The "Window positions" panel: forget where the Satchel's windows were left. */
export function windowsHtml() {
  return `<section class="wc-panel ws-pad ws-maint" aria-labelledby="ws-windows-h"><h3 id="ws-windows-h"><i class="fa-solid fa-window-restore" aria-hidden="true"></i> Window positions</h3>
    <p>The hub and the health check window open where you last left them, in this browser.</p>
    <footer class="wc-row wc-end">${button("resetWindows", "Reset window positions", { icon: "fa-solid fa-arrows-to-dot", title: "Open windows stay put until closed; next time they open at the default place and size." })}</footer>
  </section>`;
}

/**
 * The "What's new" cards (Overview and the module's own page): per module its release notes for the versions since a GM last saw
 * it, as safe HTML (notes-model notesHtml: a GM-facing summary, developer sections folded), with Dismiss. Empty string when there are none.
 * @param {ReturnType<typeof import("./hub-model.mjs").whatsNewModel>} list
 */
export function whatsNewHtml(list) {
  if (!list.length) return "";
  return `<div class="ws-news-list">${list.map(n => {
    const range = n.from ? `<code>${esc(n.from)}</code> → <code>${esc(n.to)}</code>` : `<code>${esc(n.to)}</code>`;
    const body = n.state === "loading" ? `<p class="wc-hint">${icon("pending")}Reading the release notes…</p>`
      : n.state === "error" ? `<p class="wc-hint">The release notes couldn't be read (${esc(n.error ?? "unknown error")}).${n.changelog ? " The Changelog button opens them." : ""}</p>`
        : !n.notes.length ? `<p class="wc-hint">No release notes for ${n.from ? "these versions" : "this version"}.</p>`
          : n.notes.map((/** @type {any} */ x) => `<section class="ws-news-version"><h4>${esc(x.title && x.title !== x.version ? x.title : x.version)}</h4><div class="ws-news-body">${notesHtml(x.body) || `<p class="wc-hint">(no notes)</p>`}</div></section>`).join("");
    return `<section class="wc-panel ws-news" aria-label="What's new in ${esc(n.title)}"><header class="wc-panel-head"><h3><i class="fa-solid fa-gift" aria-hidden="true"></i> What's new in ${esc(n.title)} <span class="wc-hint">${range}</span></h3><span class="wc-grow"></span>${n.changelog ? button("changelog", "Changelog", { small: true, data: { id: n.id } }) : ""}${button("dismissNews", "Dismiss", { small: true, icon: "fa-solid fa-check", data: { id: n.id } })}</header><div class="wc-panel-body ws-news-scroll">${body}</div></section>`;
  }).join("")}</div>`;
}

/**
 * The Settings backups page: the list (newest first) with Restore (opens the import preview) and Delete, and Back up now.
 * @param {ReturnType<typeof import("./hub-model.mjs").backupsModel>} list @param {{ error?: string | null, busy?: boolean }} [o]
 */
export function backupsHtml(list, { error = null, busy = false } = {}) {
  const rows = list.map(b => `<tr><th scope="row">${esc(b.when)}<div class="wc-hint">${esc(b.ago)}</div></th><td>${esc(b.text)}<div class="wc-hint">${esc(b.versions)}</div></td><td class="ws-actions-cell"><div class="wc-row wc-end">${button("restoreBackup", "Restore…", { icon: "fa-solid fa-clock-rotate-left", small: true, data: { id: b.id }, title: "Opens the import preview: nothing is written until you confirm there." })}${button("deleteBackup", "Delete", { icon: "fa-solid fa-trash", small: true, data: { id: b.id } })}</div></td></tr>`).join("");
  const table = list.length ? `<div class="wc-table-box"><table class="wc-table ws-wide" aria-label="Settings backups"><thead><tr><th scope="col">Taken</th><th scope="col">What</th><th scope="col"><span class="wc-sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="wc-panel ws-pad">No backups yet.</p>`;
  const err = error ? `<div class="wc-alert wc-bad" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span class="wc-alert-title">Backup not taken.</span><p>${esc(error)}</p></div>` : "";
  return `${pageHead("Settings backups", button("backupNow", "Back up now", { icon: "fa-solid fa-box-archive", primary: true, disabled: busy }))}
    <p class="wc-hint">The settings of every active module in the Satchel (the same file as Settings transfer › Export), kept in a GM-only journal in this world. The last 5 are kept. A backup is taken when the update check finds new versions, on the first load after a module's version changed, and when you press Back up now. <em>Restore…</em> opens the import preview with that backup: you tick what goes back.</p>
    ${err}${table}`;
}
