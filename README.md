# Wanderer's Satchel

A GM hub for [Foundry VTT](https://foundryvtt.com) (v13 and v14, any game system) that keeps your other modules in one window:

- an **overview** of every module (version, whether it's active, whether an update is out, its last health check);
- a **page per module** with buttons that open its own control panel, health check, docs and issue page;
- a **combined health check** with filters for warnings and problems;
- **settings transfer**: one file with every module's settings, with a preview before anything is written;
- **maintenance** (one Debug logging switch, removing the Satchel's own data).

It looks like the rest of Foundry (light or dark theme) through a shared stylesheet from [wanderers-core](https://github.com/cocoomg11/wanderers-core).

The Satchel only opens and reads; every module keeps its own settings and windows and works the same without it. Other modules can join through a [registration API](#public-api-and-hooks).

What changed in each version: [CHANGELOG](CHANGELOG.md).

## Contents

- [Quick start](#quick-start)
- [How to use](#how-to-use)
  - [The hub window](#the-hub-window)
  - [Combined health check](#combined-health-check)
  - [Settings export / import for all](#settings-export--import-for-all)
  - [Debug logging for all](#debug-logging-for-all)
  - [Remove Satchel data](#remove-satchel-data)
- [Built-in modules](#built-in-modules)
- [Settings](#settings)
- [Public API and hooks](#public-api-and-hooks)
- [Data Wanderer's Satchel writes](#data-wanderers-satchel-writes)
- [Install](#install)
- [License](#license)

## Quick start

1. Install and enable the module in your world (GM).
2. Open it: **Game Settings › Wanderer's Satchel › Open the Satchel**, the bag button in the token controls, or the button in the Settings sidebar tab. You can also give it a key under **Configure Controls** (none is set by default).
3. The **Overview** lists every module. Pick one in the sidebar (or its row) for its page and **Open control panel** to get to that module's own window; **Check everything** runs one health report for all.

<!-- screenshot: the hub window, overview -->

## How to use

### The hub window

GM only. A window (about 1000 px wide, resizable) with a sidebar on the left and the page on the right. The Settings menu, the key binding, the token-controls button and the Settings sidebar button all open it on **Overview**. In a narrow window the sidebar becomes a strip of links above the page.

**Sidebar:** *Overview*; *Modules*, one link per module the Satchel knows (the [built-in ones](#built-in-modules) when installed, and any module that registered itself) with a status dot (the worst result of its last health check since the page loaded; hollow when not active or not checked yet) and a count of its warnings and problems; *Tools*: Health check, Settings transfer, Maintenance; the Satchel's version at the bottom. Inactive modules are dimmed. The arrow keys, Home and End move between links; Enter opens one.

**Overview:** three tiles (modules active, updates available, last health check), a table of modules (version, update state, health badge; each row opens that module's page; in a narrow window the table scrolls sideways in its own box), and cards for Settings transfer (Export, Import…), Debug logging for all and Maintenance. **Check for updates** and **Check everything** are at the top.

**A module's page:** title, id, version, *Active* / *Not active*, and whether it comes from a built-in adapter or the module's own registration; **Open control panel** (the module's own panel; without one, its first settings menu; without that, Configure Settings). An update banner shows only when a newer version is out (with *What's new* when the module has a changelog); *newer than the latest release* and *Couldn't check* are one muted line. Below: that module's own health report (**Run check** / **Run again** checks it alone), *In the Satchel* (how its settings are exported and imported, its own Debug logging switch), *Links* (Docs, Changelog, Report issue from its `module.json`; a readme or changelog file in the module folder opens as served by Foundry) and *Module data* (the module's own extra actions, such as **Remove toolkit data…**).

**Update check:** asks the module's manifest URL for the latest version (for GitHub "latest release" manifests, GitHub's release API). Answers are kept for this browser session (6 hours; a failed check is tried again after 15 minutes). If the check can't reach the server in 8 seconds, or the answer can't be read, it says *Couldn't check* and nothing else happens. **Check for updates** asks again.

<!-- screenshot: the overview, dark theme -->
<!-- screenshot: a module page, light theme -->

### Combined health check

**Check everything** (or the *Health check* page) starts every module's own health check at once and shows the results grouped by module, problems first, with a summary on top (ok / warning / problem counts, checks still running, checks that failed, modules without a check, modules not active). A module's required modules from its manifest are listed too. The page shows straight away and fills in as each module answers, and the sidebar dots follow. `api.health({ window: true })` opens the same report in a window of its own.

Each module has its own time limit, so one slow module never holds up or fails the others:

- After 8 seconds a module still working shows *Still checking…*.
- The first check of a module after the page loads may take up to 90 seconds (a module's first check can be slow while it loads its data). Later checks get 30 seconds, or three times as long as that module took last time, whichever is longer (at most 5 minutes).
- A module past its limit shows *No answer yet* as a warning, not a failure. If it answers later, its result replaces that line. **Check again** starts over.
- A check that throws is shown as failed; the rest still run.

**Filter:** the count chips above the report (OK, Warnings, Problems, and Still checking / Not active when there are any) are toggle buttons. Press one or several (for example Warnings and Problems) to see only those lines; **All** shows everything again. Modules with no matching line are hidden, and the page says how many. The counts on the chips are always the totals. Each module page's health panel has the same chips. The choice is remembered in this browser (local storage) and shared by the Health check page and the module pages; in a private window it lasts until the hub closes.

**Whisper to GMs** posts the whole report as it stands to chat (not filtered). The check itself changes nothing.

<!-- screenshot: the health check page -->

### Settings export / import for all

The *Settings transfer* page has two tabs. **Export** (*Export all settings*) downloads one JSON file with the settings of every active module in the Satchel (and the Satchel's own). A module that has its own export hands it over; for the others the Satchel reads the settings registered in the module's namespace. Record-type settings (histories, caches, "last version seen") are on a skip list and never exported.

**Import** (*Choose a file…*) reads such a file and shows, on the same page, what would change: count badges on top (settings that would change, values refused, modules skipped, records never imported), then per module the file's version, how many rows are ticked, a list of issues (settings this version doesn't have, records that are never imported, why a module is skipped), and a row per setting with now vs. from the file and a tick. Values that don't fit (wrong type, not one of the choices, a failed shape check) are red rows that can't be ticked; numbers are kept within their range. A module with its own import checks its part itself. A file that can't be read (over 5 MB, not valid JSON, not a Satchel file) is reported on the page, not only as a notification. Nothing is written until you press **Import N settings** in the footer, which also says how many ticked settings need a reload (Foundry asks).

What an import will never do: read a file over 5 MB; write to a module the Satchel doesn't show in this world (or one that isn't active); write a record setting; write a list or object setting that isn't plain data (no oversized or deeply nested values, no special keys like `__proto__`) or that fails that module's own shape check (for example the toolkit's flight network). Every value is checked again at the moment it is written.

The toolkit's flight network setting holds only the version players see; the full network is kept elsewhere by the toolkit, so importing a settings file does not bring back points that are still locked.

### Debug logging for all

When at least one module has a known Debug logging setting, the Overview shows one switch that turns all of them on or off at once (it changes each module's own setting; *some on* when they differ). Each module's page has its own switch.

### Remove Satchel data

The *Maintenance* page (also **Remove Satchel data…** on the Overview) counts what the Satchel stored (a dry run), lets you tick what goes and asks you to type REMOVE; a missing confirm word or nothing ticked is said on the page. See [Data Wanderer's Satchel writes](#data-wanderers-satchel-writes).

## Built-in modules

Built-in adapters use only what each module exposes. A module that calls `register()` replaces its adapter.

| Module | Control panel | Health | Settings export / import | Debug logging |
| --- | --- | --- | --- | --- |
| Wayfarer's Toolkit (`wayfarers-toolkit`) | its control panel (`api.panel`) | `api.healthReport()` (1.27 and later); older versions `api.health()`, which also whispers the toolkit's own card | read and checked by the Satchel (an older toolkit's own `api.settingsIO` import is used when it is there) | `debugLog` |
| Ringmaker (`ringmaker`) | Ringmaker tools (settings menu) | from `api.status()` and `api.removePlan()` | read by the Satchel | `debugLog` when Ringmaker has one; the module page says when it doesn't |
| Loot Ledger (`loot-ledger`) | Build loot pools (settings menu) | its source compendiums, built item and table compendiums, Build Report journal and main options (read without its API), plus dependencies | read by the Satchel | `debugLog` when Loot Ledger has one; the module page says when it doesn't |
| Red Book (`red-book`) | its control panel (`api.panel`) | `api.health()` | read by the Satchel (its records are skipped) | `debugLog` |

The toolkit's page also has **Remove toolkit data…** and Red Book's **Remove Red Book data…** (each module's own window).

**GM only.** Ringmaker, Loot Ledger and Red Book only answer GMs, and so do the toolkit's panel and health check. The Satchel calls them only on a GM's client: on a player's client its windows, buttons and API entries do nothing, and the adapters never call another module's API there.

## Settings

World settings (Game Settings › Wanderer's Satchel). The feature switches each reload:

| Setting | Default | Off means |
| --- | --- | --- |
| Feature: Update check | on | nothing is fetched; no update column or banner |
| Feature: Combined health check | on | no Health check page, health column or Check everything |
| Feature: Settings export / import for all | on | no Settings transfer page |
| Feature: Debug logging for all | on | no switch |
| Feature: Scene control button | on | no bag button in the token controls |

Also **Debug logging** (`debugLog`, world, off): writes health check timings, update checks and imports to the browser console. It isn't in Configure Settings; **Debug logging for all** in the hub switches it with the others.

## Public API and hooks

`const satchel = game.modules.get("wanderers-satchel").api;` (set in our `init` hook). Entries marked GM do nothing on a player's client (a "GM only" notice and `undefined`).

| Member | | What it does |
| --- | --- | --- |
| `register({ id, title?, openPanel?, health?, healthTimeoutMs?, exportSettings?, importSettings?, debugSetting?, docs?, skipSettings?, validators? })` | stable | Adds or replaces a module (sidebar link and page). Returns `{ ok, error, warnings }`. See below. |
| `unregister(id)` | stable | Removes a registration (a built-in adapter shows again). |
| `registrations()` | stable | Ids that registered themselves. |
| `entries()` | experimental | What the hub shows: `[{ id, title, source, provisional, health, exportSettings, importSettings, debugSetting }]`. |
| `open()` | stable | GM: opens the hub on Overview. |
| `openPanel(id)` | stable | GM: opens one module's control panel. |
| `health({ ids?, window? })` | stable | GM: runs the combined check; returns `{ summary, groups }`, or opens the window. Undefined when off. |
| `updates` | experimental | GM: `{ check({ force }), results(), compare(a, b) }`. Undefined when off. |
| `settings` | experimental | GM: `{ build(), export(), import(), read(text), apply(picks) }`; `import()` opens the hub on Settings transfer › Import and asks for a file. `apply` checks every row again (skip list, type, shape). Undefined when off. |
| `debug` | experimental | GM: `{ state(), set(on) }`. Undefined when off. |
| `cleanup` | stable | GM: `{ plan(), remove(pick), open() }`; `open()` shows the hub's Maintenance page. |
| `features` | experimental | `{ on(id), list() }`: the feature switches. |
| `isReady`, `whenReady()` | stable | Whether our ready hook ran; a promise for the api. |
| `version` | stable | The installed version. |

**Hook** `wanderers-satchel.ready` (stable): fired once, with the api, in our `ready` hook. Registering is safe any time after our `init`, so either register in your own `ready` hook (`game.modules.get("wanderers-satchel")?.api?.register(...)`) or listen to this hook; a registration made before the hub is open just shows when it opens.

Registration fields (all optional except `id`):

- `title`: the title in the sidebar and on its page (default: the module's title).
- `openPanel()`: opens your control panel. Return `false` to fall back to your settings menu.
- `health({ timeoutMs })`: called with the time your check has (the Satchel's limit for it less a small margin), so your own per-part limits can match; ignore it if you don't need it. Returns your check, any of: `[{ title, lines: [{ level, text }] }]` (wanderers-core's health report), one `{ title, lines }`, `{ sections }`, `{ report }` or a plain array of lines. `level` is `ok`, `warn`, `bad`, `off` or `info`; `text` may be HTML (shown as plain text). May be async. Called only on a GM's client, so it may be GM-only.
- `healthTimeoutMs`: how long your check may take after the first one (5 000 to 300 000; the first check after a load always gets at least 90 s). Without it the Satchel adapts to how long your last check took.
- `exportSettings()`: returns your settings as any JSON value; stored as is in the bundle.
- `importSettings: { read(data), apply(rows) }`: `read` returns `{ ok, error, rows: [{ key, label, from, to, changed, note }], unknown, skipped, invalid }` (or `null` to let the Satchel check the values itself); `apply(rows)` writes the ticked rows and returns `{ written, reload }`.
- `debugSetting`: your Boolean debug setting's key, or `{ namespace, key }`.
- `docs: { url, readme, changelog, bugs }`: links that override your `module.json`.
- `skipSettings`: keys of record-type settings never exported or imported.
- `validators: { key: (value, def) => true | "reason" | { ok: true, value } }`: extra import checks for your Object and Array settings, run after the Satchel's plain-data check (the same contract as wanderers-core's `readImport` validators). `openPanel`, `health`, `importSettings` and `exportSettings` are only called on a GM's client.

```js
Hooks.once("ready", () => {
  game.modules.get("wanderers-satchel")?.api?.register({
    id: "my-module",
    openPanel: () => MyModule.openPanel(),
    health: () => MyModule.healthSections(),
    debugSetting: "debug",
    skipSettings: ["history"]
  });
});
```

## Data Wanderer's Satchel writes

- Its own world settings (the feature switches above and Debug logging), under the `wanderers-satchel` namespace.
- `flags.wanderers-satchel.health` on the health report chat messages it whispers to GMs.
- Update-check answers in the browser's session storage (keys starting `wanderers-satchel.update.`); gone when the browser tab closes.
- The health check filter in the browser's local storage (`wanderers-satchel.healthFilter`; only while a filter other than All is chosen).
- What you choose: **Import** writes other modules' settings, and **Debug logging for all** changes each module's own debug setting. Those belong to those modules and are not undone by Remove Satchel data.
- A key binding you set is kept by Foundry with its own key bindings.

## Built with wanderers-core

The Satchel bundles a pinned copy of [wanderers-core](https://github.com/cocoomg11/wanderers-core) (0.3.1) in `vendor/wanderers-core/`: the feature registry, settings table, debug logging, health levels, the settings file format and its checks, version compare, the REMOVE confirmation and the shared window look (`vendor/wanderers-core/styles/wanderers-ui.css`, loaded before the Satchel's own stylesheet) come from there. Nothing is installed separately. The Satchel sends nothing over Foundry's socket.

## Install

Manifest URL: `https://github.com/cocoomg11/wanderers-satchel/releases/latest/download/module.json`

## License

MIT. See [LICENSE](LICENSE).
