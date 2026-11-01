/**
 * "What's new", pure (tested in Node): where a module's release notes come from, reading a CHANGELOG into one section per
 * version, picking the versions between the one last seen and the one installed, and turning that small bit of Markdown into
 * safe HTML. The fetch is passed in.
 *
 * Sources, in order: the module's own changelog file when its module.json names one inside the module folder (Foundry serves it
 * from the same origin, so no CORS question, and it is the notes of the version that is installed), or a raw.githubusercontent.com
 * changelog URL; otherwise its GitHub releases (the REST API allows browser reads), each release body being that version's notes.
 *
 * Safe HTML: every character of the notes is escaped first; only then are a few Markdown forms turned into tags the code writes
 * itself (headings, lists, bold, italics, code, http(s) links). Nothing from the notes can add a tag, an attribute or a script.
 */
import { esc, parseVersion, compareVersions } from "../vendor/wanderers-core/index.mjs";
import { repoOf, withTimeout, TIMEOUT_MS } from "./version-model.mjs";

export { repoOf };

/** Most characters of notes shown per version, and most versions shown at once (the newest). */
export const MAX_NOTES_CHARS = 20000;
export const MAX_VERSIONS = 10;

const isAbs = (/** @type {string} */ s) => /^https?:\/\//i.test(s);
const RAW = /^https:\/\/raw\.githubusercontent\.com\//i;
/**
 * Where to read a module's notes: { kind: "changelog", url } | { kind: "github", url, repo } | null.
 * `changelog` in the manifest may be a path in the module folder ("CHANGELOG.md"), served by Foundry at modules/<id>/<path>.
 * @param {{ id: string, changelog?: string | null, manifest?: string | null, url?: string | null }} mod
 */
export function notesSource(mod) {
  const c = typeof mod?.changelog === "string" ? mod.changelog.trim() : "";
  if (c && !isAbs(c) && !c.includes("..") && /\.(md|markdown|txt)$/i.test(c)) return { kind: "changelog", url: `modules/${mod.id}/${c.replace(/^\.?\//, "")}` };
  if (c && RAW.test(c)) return { kind: "changelog", url: c };
  // A changelog served from the module's own folder by its full URL.
  if (c && isAbs(c) && typeof globalThis.location?.origin === "string" && c.startsWith(`${globalThis.location.origin}/modules/${mod.id}/`)) return { kind: "changelog", url: c };
  const repo = repoOf(mod);
  if (repo) return { kind: "github", repo, url: `https://api.github.com/repos/${repo}/releases?per_page=30` };
  return null;
}

/** The version a changelog heading names ("## 1.2.0", "## [1.2.0] - 2026-01-01", "## v1.2.0 (unreleased)"), or null. @param {string} h */
export function headingVersion(h) {
  const m = /^\s*\[?v?(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)\]?(?=$|[\s:(—–-])/.exec(h);
  return m && parseVersion(m[1]) ? m[1] : null;
}

/**
 * A CHANGELOG's sections: [{ version, title, body }], in file order. A section starts at a level-2 heading that names a version
 * (level 1 when the file has no level-2 version heading); its body runs to the next such heading.
 * @param {string} text
 */
export function parseChangelog(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const at = (/** @type {number} */ level) => lines.map((l, i) => {
    const m = new RegExp(`^#{${level}}\\s+(.*)$`).exec(l); const v = m ? headingVersion(m[1]) : null;
    return v ? { i, version: v, title: m?.[1].trim() ?? "" } : null;
  }).filter(x => !!x);
  let heads = at(2); if (!heads.length) heads = at(1);
  return heads.map((h, k) => ({ version: h.version, title: h.title, body: lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length).join("\n").trim() }));
}

/**
 * The notes newer than `from` (exclusive; null = only `to`) up to `to` (inclusive), newest first, at most MAX_VERSIONS.
 * @param {{ version: string, title?: string, body: string }[]} sections
 * @param {string | null} from @param {string} to
 */
export function between(sections, from, to) {
  const seen = new Set();
  return sections
    .filter(s => {
      const v = String(s.version).replace(/^v(?=\d)/i, "");
      if (seen.has(v)) return false; seen.add(v);
      const upTo = (compareVersions(v, to) ?? 1) <= 0;
      return upTo && (from ? compareVersions(v, from) === 1 : compareVersions(v, to) === 0);
    })
    .sort((a, b) => compareVersions(b.version, a.version) ?? 0)
    .slice(0, MAX_VERSIONS);
}

/** GitHub releases (the REST list) as sections: drafts left out, the tag's version, the body as notes. @param {unknown} list */
export function releaseSections(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r === "object" && !r.draft && typeof r.tag_name === "string" && parseVersion(r.tag_name))
    .map(r => ({ version: String(r.tag_name).replace(/^v(?=\d)/i, ""), title: typeof r.name === "string" && r.name ? r.name : String(r.tag_name), body: typeof r.body === "string" ? r.body : "" }));
}

/**
 * Fetches a module's notes for the versions after `from` up to `to`. Never throws: { ok, source, notes: [{ version, title, body }],
 * error }. An empty `notes` with ok true means the source has nothing for those versions.
 * @param {{ id: string, changelog?: string | null, manifest?: string | null, url?: string | null }} mod
 * @param {{ from: string | null, to: string, fetch?: any, timeoutMs?: number }} o
 */
export async function fetchNotes(mod, { from, to, fetch, timeoutMs = TIMEOUT_MS }) {
  const src = notesSource(mod);
  if (!src) return { ok: false, source: null, notes: [], error: "the module names no changelog and has no GitHub releases" };
  try {
    if (typeof fetch !== "function") throw new Error("no way to fetch here");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const res = await withTimeout(fetch(src.url, { headers: { Accept: src.kind === "github" ? "application/vnd.github+json" : "text/plain, text/markdown, */*" }, cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) }), timeoutMs, () => ctl?.abort());
    if (!res || !res.ok) throw new Error(`the server answered ${res?.status ?? "nothing"}`);
    const sections = src.kind === "github" ? releaseSections(await withTimeout(Promise.resolve(res.json()), timeoutMs, () => ctl?.abort())) : parseChangelog(await withTimeout(Promise.resolve(res.text()), timeoutMs, () => ctl?.abort()));
    return { ok: true, source: src.kind, notes: between(sections, from, to), error: null };
  } catch (e) {
    return { ok: false, source: src.kind, notes: [], error: String(/** @type {any} */ (e)?.name === "AbortError" ? "no answer in time" : /** @type {any} */ (e)?.message ?? e) };
  }
}

/** Inline Markdown on text that is already escaped: `code`, **bold**, *italics* / _italics_, [text](http(s) link). @param {string} s */
function inline(s) {
  /** @type {string[]} */
  const codes = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\uE000${codes.length - 1}\uE001`; });
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
  return t.replace(/\uE000(\d+)\uE001/g, (_, i) => codes[Number(i)] ?? "");
}

/**
 * A small, safe Markdown subset as HTML: headings (shown as h4/h5), bullet and numbered lists (two levels), task boxes (as plain
 * bullets), paragraphs, inline code, bold, italics and http(s) links. Images, raw HTML and anything else stay visible as text.
 * The input is cut at MAX_NOTES_CHARS.
 * @param {string} md
 */
export function markdownHtml(md) {
  let src = String(md ?? "").replace(/\r\n?/g, "\n");
  const cut = src.length > MAX_NOTES_CHARS; if (cut) src = src.slice(0, MAX_NOTES_CHARS);
  const out = []; /** @type {string[]} */ let para = []; /** @type {number[]} */ const lists = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(esc(para.join(" ")))}</p>`); para = []; } };
  const closeTo = (/** @type {number} */ depth) => { while (lists.length > depth) { out.push("</li></ul>"); lists.pop(); } };
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\t/g, "  ");
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (h) { flush(); closeTo(0); out.push(`<${h[1].length <= 3 ? "h4" : "h5"}>${inline(esc(h[2].replace(/\s+#+\s*$/, "")))}</${h[1].length <= 3 ? "h4" : "h5"}>`); continue; }
    if (li) {
      flush();
      const depth = li[1].length >= 2 && lists.length ? 2 : 1;
      const top = lists[lists.length - 1] ?? 0;
      if (depth > top) { out.push("<ul><li>"); lists.push(depth); }
      else { closeTo(lists.indexOf(depth) + 1); out.push("</li><li>"); }
      out.push(inline(esc(li[2])));
      continue;
    }
    if (lists.length && /^\s{2,}\S/.test(line)) { out.push(` ${inline(esc(line.trim()))}`); continue; }
    closeTo(0); para.push(line.trim());
  }
  flush(); closeTo(0);
  const html = out.join("");
  return cut ? `${html}<p class="wc-hint">(Cut short. The full notes are in the module's changelog.)</p>` : html;
}

/**
 * Developer-facing parts of release notes (0.7.0), as data so the rule is easy to read and to test. A section whose heading (any
 * level, `## Tests`) or bold label line (`**Tests**`, `**Tests**: …`, `**Untested in Foundry** (…)`) matches `headings` goes to the
 * developer notes, with everything under it up to the next heading of the same or a higher level (a label runs to the next label
 * or heading). A bullet whose text starts with one of `bullets` followed by ":" (`- Under the hood: …`) goes there too, with its
 * indented lines. Everything else is the GM-facing summary. Matching ignores case, bold/italic/code marks and trailing
 * punctuation.
 */
export const DEV_NOTES = Object.freeze({
  headings: Object.freeze([
    /^under the hood\b/i, /^(for )?developers?\b/i, /^developer notes\b/i, /^for other modules\b/i, /^internals?\b/i, /^technical\b/i,
    /^tests?\b/i, /^testing\b/i, /^ci\b/i, /^untested\b/i, /^live (test )?checklist\b/i, /^not (yet )?tested\b/i, /^decisions\b/i,
    /^migration\b/i, /^load order\b/i
  ]),
  bullets: Object.freeze([/^under the hood$/i, /^(for )?developers?$/i, /^tests?$/i, /^ci$/i, /^internals?$/i, /^technical$/i, /^untested( in foundry)?$/i])
});

/** Heading or label text without Markdown marks: "**Untested in Foundry** (live)" → "Untested in Foundry (live)". @param {string} s */
const bare = s => String(s ?? "").replace(/[*_`]/g, "").trim();
/** @param {string} text @param {readonly RegExp[]} rules */
const matches = (text, rules) => rules.some(r => r.test(bare(text)));
/** A bold label line ("**Fixed**", "**Tests**: …", "**Untested in Foundry** (…)"): its label, else null. @param {string} line */
const labelOf = line => { const m = /^\*\*([^*]+?)\*\*(?=\s*$|\s*[:(]|:)/.exec(line); return m ? m[1] : null; };

/**
 * One version's notes split into what a GM reads and what a developer reads: { summary, developer } (both Markdown, trimmed;
 * either may be empty). See DEV_NOTES. Notes without developer headings come back unchanged as the summary.
 * @param {string} md
 * @param {{ headings: readonly RegExp[], bullets: readonly RegExp[] }} [rules]
 */
export function splitNotes(md, rules = DEV_NOTES) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {string[]} */ const user = []; /** @type {string[]} */ const dev = [];
  /** @type {number | null} level of the developer heading we are under */ let devLevel = null;
  let labelDev = false; let bulletDev = false;
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length; bulletDev = false; labelDev = false;
      if (devLevel !== null && level <= devLevel) devLevel = null;
      if (devLevel === null && matches(h[2].replace(/\s+#+\s*$/, ""), rules.headings)) devLevel = level;
      (devLevel !== null ? dev : user).push(line); continue;
    }
    const label = labelOf(line);
    if (label !== null) { bulletDev = false; labelDev = matches(label, rules.headings); (devLevel !== null || labelDev ? dev : user).push(line); continue; }
    const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (li) {
      if (!li[1].length) { const lead = /^(?:\*\*|__)?([^:*_]{1,40}?)(?:\*\*|__)?\s*:/.exec(li[2]); bulletDev = !!lead && matches(lead[1], rules.bullets); }
    } else if (line.trim() && !/^\s{2,}\S/.test(line)) bulletDev = false;
    (devLevel !== null || labelDev || bulletDev ? dev : user).push(line);
  }
  const tidy = (/** @type {string[]} */ a) => a.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // A summary left with nothing but headings (every bullet under them was developer notes) is empty.
  const summary = tidy(user);
  return { summary: summary.split("\n").every(l => !l.trim() || /^#{1,6}\s/.test(l) || labelOf(l) !== null) ? "" : summary, developer: tidy(dev) };
}

/** Longest a shortened bullet gets (characters of Markdown) before it is cut at a word. */
export const SHORT_BULLET_CHARS = 220;

/**
 * The first sentence of a bullet's text: up to the first ". " (or "! ", "? ") outside `code` and (brackets) that is followed by a
 * capital, a mark or a digit; at most SHORT_BULLET_CHARS, cut at a word with "…". Text without such an end is kept whole (up to the
 * limit).
 * @param {string} text
 */
export function firstSentence(text) {
  const t = String(text ?? "").trim();
  let code = false; let depth = 0; let end = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "`") code = !code;
    else if (code) continue;
    else if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth) depth--;
    else if (!depth && (c === "." || c === "!" || c === "?") && !/\b(e\.g|i\.e|etc|vs)$/i.test(t.slice(Math.max(0, i - 4), i))) {
      // Closing marks right after the stop belong to the sentence ("**Board.** Next" ends after "**").
      const close = /^(\*\*|__|\*|_)?/.exec(t.slice(i + 1))?.[0] ?? "";
      if (/^\s+[A-Z*_`"\d]/.test(t.slice(i + 1 + close.length, i + 4 + close.length))) { end = i + 1 + close.length; break; }
    }
  }
  let out = t.slice(0, end);
  if (out.length > SHORT_BULLET_CHARS) {
    out = out.slice(0, SHORT_BULLET_CHARS).replace(/\s+\S*$/, "");
    // Don't leave a code span or bold mark open.
    if ((out.match(/`/g) ?? []).length % 2) out = out.replace(/`[^`]*$/, "");
    if ((out.match(/\*\*/g) ?? []).length % 2) out += "**";
    out = `${out.replace(/[\s,;:(]+$/, "")}…`;
  }
  return out;
}

/**
 * The GM-facing summary made short: top-level bullets cut to their first sentence (firstSentence), their nested bullets and
 * continuation lines left out, everything else (intro lines, headings, labels) kept. { text, shortened }: `shortened` says whether
 * anything was left out (the full summary is then worth offering).
 * @param {string} md a summary from splitNotes
 */
export function shortSummary(md) {
  /** @type {string[]} */ const out = []; let shortened = false;
  /** @type {string | null} the open top-level bullet's text (wrapped lines joined) */ let bullet = null; let nested = false;
  const close = () => { if (bullet === null) return; const s = firstSentence(bullet); if (s !== bullet.trim()) shortened = true; out.push(`- ${s}`); bullet = null; nested = false; };
  for (const line of String(md ?? "").split("\n")) {
    const li = /^([-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (li) { close(); bullet = li[2]; continue; }
    if (bullet !== null && /^\s+\S/.test(line)) {
      // A nested bullet (and what follows it) is detail: left out. A wrapped line of the bullet itself joins it.
      if (/^\s+(?:[-*+]|\d+[.)])\s/.test(line)) nested = true;
      if (nested) shortened = true; else bullet += ` ${line.trim()}`;
      continue;
    }
    close(); out.push(line);
  }
  close();
  return { text: out.join("\n").trim(), shortened };
}

/**
 * The notes of one version as HTML for the GM (0.7.0): a short summary (top-level bullets to their first sentence), then, folded
 * in closed <details>: "Full notes" (the whole GM-facing part, when the summary left something out) and "Developer notes" (the
 * sections splitNotes moved out). Everything escaped as markdownHtml does. Notes without developer headings and with short bullets
 * read exactly as before.
 * @param {string} md
 */
export function notesHtml(md) {
  const { summary, developer } = splitNotes(md);
  const short = shortSummary(summary);
  const top = short.text ? markdownHtml(short.text) : developer ? `<p class="wc-hint">Nothing you would notice at the table: only developer notes in this version.</p>` : "";
  const full = short.shortened ? `<details class="ws-notes-more"><summary>Full notes</summary>${markdownHtml(summary)}</details>` : "";
  const fold = developer ? `<details class="ws-notes-more ws-dev-notes"><summary>Developer notes</summary>${markdownHtml(developer)}</details>` : "";
  return top + full + fold;
}
