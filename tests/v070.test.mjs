import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../scripts/notes-model.mjs";
import * as HM from "../scripts/hub-model.mjs";
import * as View from "../scripts/hub-view.mjs";

// ---------------------------------------------------------------- 1. What's new: GM summary, developer notes folded

const NOTES = `Two fixes and one new window.

### Added
- **Quest board.** A new window lists the open quests. It also shows rewards and who took them.
  - Details for scripts: \`api.board.open()\`.
- Under the hood: CI now runs the shared checks.

### Fixed
- Prices no longer show twice.

### Tests
- \`tests/board.test.mjs\` covers the board.

**Tests**: \`tests/price.test.mjs\`.

### Untested in Foundry
- Open the board as a GM.

## Not a version heading but level 2
- Kept.`;

test("splitNotes: developer headings, bold labels and 'Under the hood:' bullets go to developer notes", () => {
  const { summary, developer } = N.splitNotes(NOTES);
  assert.match(summary, /Two fixes and one new window\./);
  assert.match(summary, /### Added/); assert.match(summary, /Quest board/); assert.match(summary, /### Fixed/); assert.match(summary, /Prices no longer/);
  assert.match(summary, /Not a version heading/); assert.match(summary, /- Kept\./);
  assert.doesNotMatch(summary, /Under the hood|tests\/|Untested|Open the board as a GM/);
  assert.match(developer, /Under the hood: CI/); assert.match(developer, /### Tests/); assert.match(developer, /\*\*Tests\*\*: `tests\/price/); assert.match(developer, /### Untested in Foundry\n- Open the board/);
});

test("splitNotes: the rule is data (DEV_NOTES), case and marks ignored, ends at the same heading level", () => {
  assert.ok(Object.isFrozen(N.DEV_NOTES) && N.DEV_NOTES.headings.length > 5);
  for (const h of ["Under the hood", "Developers", "For developers", "Developer notes", "Tests", "CI", "Untested in Foundry", "Live test checklist (Untested in Foundry)", "Not yet tested live", "Decisions", "For other modules"]) {
    assert.equal(N.splitNotes(`### ${h}\n- x`).developer, `### ${h}\n- x`, h);
    assert.equal(N.splitNotes(`**${h}**\n- x`).summary, "", `label ${h}`);
  }
  for (const h of ["Added", "Changed", "Fixed", "Security", "Renamed", "Testimonials"]) assert.equal(N.splitNotes(`### ${h}\n- x`).developer, "", h);
  // Nested heading under a developer heading stays there; the next same-level heading ends it.
  const r = N.splitNotes("### Tests\n#### Unit\n- a\n### Changed\n- b");
  assert.equal(r.developer, "### Tests\n#### Unit\n- a"); assert.equal(r.summary, "### Changed\n- b");
  // A label runs to the next label: **Untested in Foundry** then **Fixed**.
  const l = N.splitNotes("**Untested in Foundry** (live)\n- check it\n\n**Fixed**\n- a bug");
  assert.equal(l.summary, "**Fixed**\n- a bug"); assert.match(l.developer, /check it/);
  // Own rules can be passed in.
  assert.equal(N.splitNotes("### Fixed\n- a", { headings: [/^fixed$/i], bullets: [] }).summary, "");
});

test("splitNotes: notes with no developer headings come back unchanged; only developer notes → empty summary", () => {
  const plain = "Small fix.\n\n- The button works again.\n- Typo fixed.";
  assert.deepEqual(N.splitNotes(plain), { summary: plain, developer: "" });
  assert.deepEqual(N.splitNotes(""), { summary: "", developer: "" });
  assert.equal(N.splitNotes("### Changed\n- Under the hood: CI bump.").summary, "");
  // A wrapped "Under the hood" bullet keeps its continuation lines with it.
  const w = N.splitNotes("- Under the hood: a long\n  wrapped line.\n- Visible change.");
  assert.equal(w.summary, "- Visible change."); assert.match(w.developer, /wrapped line/);
});

test("firstSentence / shortSummary: top-level bullets to their first sentence, nested detail left out, wrapped lines joined", () => {
  assert.equal(N.firstSentence("**Board.** A new window. More."), "**Board.**");
  assert.equal(N.firstSentence("Fixed (see e.g. the docs. Really) the thing. Next."), "Fixed (see e.g. the docs. Really) the thing.");
  assert.equal(N.firstSentence("Code `a. B` stays. Next."), "Code `a. B` stays.");
  assert.equal(N.firstSentence("No full stop here"), "No full stop here");
  const long = N.firstSentence(`**Bold ${"word ".repeat(80)}`);
  assert.ok(long.length <= N.SHORT_BULLET_CHARS + 3 && long.endsWith("…")); assert.equal((long.match(/\*\*/g) ?? []).length % 2, 0);
  const s = N.shortSummary("Intro line.\n\n### Added\n- **Board.** Lists quests. Shows rewards.\n  - nested detail\n- One-liner.\n- Wrapped\n  over two lines. Second sentence.");
  assert.equal(s.text, "Intro line.\n\n### Added\n- **Board.**\n- One-liner.\n- Wrapped over two lines.");
  assert.equal(s.shortened, true);
  assert.deepEqual(N.shortSummary("- a.\n- b."), { text: "- a.\n- b.", shortened: false });
});

test("notesHtml: short summary first, Full notes and Developer notes folded (closed), escaped", () => {
  const h = N.notesHtml(NOTES);
  assert.match(h, /<strong>Quest board\.<\/strong><\/li>/);
  assert.doesNotMatch(h.split("<details")[0], /It also shows rewards|Under the hood|tests\//);
  assert.match(h, /<details class="ws-notes-more"><summary>Full notes<\/summary>.*It also shows rewards/s);
  assert.match(h, /<details class="ws-notes-more ws-dev-notes"><summary>Developer notes<\/summary>.*Under the hood/s);
  assert.doesNotMatch(h, /<details[^>]* open/);
  // Nothing to fold: exactly markdownHtml.
  assert.equal(N.notesHtml("- One.\n- Two."), N.markdownHtml("- One.\n- Two."));
  // Only developer notes.
  assert.match(N.notesHtml("### Tests\n- x"), /only developer notes in this version.*<summary>Developer notes/s);
  // Escaping holds in every part.
  const x = N.notesHtml("- <img src=x> one. Two.\n\n### Tests\n- <script>alert(1)</script>");
  assert.doesNotMatch(x, /<img|<script/); assert.match(x, /&lt;script&gt;/);
  assert.equal(N.notesHtml(""), "");
});

test("whatsNewHtml uses the summary with folded developer notes", () => {
  const items = [{ id: "a", title: "A", docs: {} }];
  const list = HM.whatsNewModel(new Map([["a", { from: "1.0.0", to: "1.1.0", state: "ok", notes: [{ version: "1.1.0", title: "1.1.0", body: NOTES }] }]]), items);
  const html = View.whatsNewHtml(list);
  assert.match(html, /<summary>Developer notes<\/summary>/);
  assert.doesNotMatch(html.split("<details")[0], /Under the hood/);
});
