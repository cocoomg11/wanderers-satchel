# Wanderer's Satchel

An optional GM hub for [Foundry VTT](https://foundryvtt.com): one window for your Wanderer's modules, with an update check, a combined health check and one-file settings backup.

## Requirements

- Foundry VTT v13 or v14 (verified on v14).
- Any game system.
- GM only: players see nothing of the Satchel.
- Optional: the other Wanderer's modules (see [The Wanderer's family](#the-wanderers-family)). The Satchel lists whichever are installed.

## Install

In Foundry: **Add-on Modules › Install Module**, paste this manifest URL and click Install, then enable **Wanderer's Satchel** in your world:

```
https://github.com/cocoomg11/wanderers-satchel/releases/latest/download/module.json
```

## The Wanderer's family

Seven free modules that work on their own and fit together. Each one switches on only what you use.

| Module | What it does |
|---|---|
| [Wanderer's Toolkit](https://github.com/cocoomg11/wayfarers-toolkit) | GM kit for D&D 5e: quest log, travel and flights, inns, loot rolls, boss frames, a three-coin economy. |
| [Red Book](https://github.com/cocoomg11/red-book) | Session prep: a live session log, next-session board, scene readiness check, Session Start. |
| [Wanderer's Satchel](https://github.com/cocoomg11/wanderers-satchel) | Optional hub: one window for the family, update check, combined health check, settings backup. |
| [Ringmaker](https://github.com/cocoomg11/ringmaker) | Your own ring image for Foundry's dynamic token rings. Any game system. |
| [Loot Ledger](https://github.com/cocoomg11/loot-ledger) | Priced, rollable loot pools and roll tables for D&D 5e, built from a classic-MMO item compendium. |
| [Wanderer's Guild](https://github.com/cocoomg11/wanderers-guild) | Professions, crafting and gathering from tool proficiencies. |
| [Wanderer's Path](https://github.com/cocoomg11/wanderers-path) | Customizable talent trees and spec boards. |

They share one look that follows Foundry's light and dark themes. None of them needs the others.

**Which modules the Satchel finds by itself.** Every module in the table is recognised as soon as it is installed (active or not). Red Book and Wanderer's Guild also register themselves, which replaces the built-in support with their own. The Overview lists the family modules that aren't installed under the module table, each with a one-line description, its manifest URL and a **Get it** link to its page (0.7.2). Any other module can join through the [registration API](#public-api-and-hooks). Ringmaker, Loot Ledger, Red Book and Wanderer's Guild only answer GMs, and so do the Toolkit's panel and health check, so the Satchel calls them only on a GM's client.

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [How to use](#how-to-use): [The hub window](#the-hub-window) · [Combined health check](#combined-health-check) · [Updates, What's new and settings backups](#updates-whats-new-and-settings-backups) · [Settings export / import for all](#settings-export--import-for-all) · [Debug logging for all](#debug-logging-for-all) · [Maintenance](#maintenance)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)
- [Removing its data](#removing-its-data)
- [For developers](#for-developers)
- [License](#license)

## What it does

- an **overview** of every module (version, whether it's active, whether an update is out, its last health check), with **What's new** after a module updates;
- a **page per module** with buttons that open its own control panel, health check, docs and issue page;
- a **combined health check** with filters for warnings and problems;
- **settings transfer**: one file with every module's settings, with a preview before anything is written, and **settings backups** kept in the world around updates;
- **Fix** buttons on health lines a module can repair itself;
- **maintenance** (one Debug logging switch, removing the Satchel's own data).

The Satchel only opens and reads; every module keeps its own settings and windows and works the same without it. What changed in each version: [CHANGELOG](CHANGELOG.md).

## Quick start

1. Install and enable the module in your world (see [Install](#install)).
2. Open it: **Game Settings › Wanderer's Satchel › Open the Satchel**, the bag button in the token controls, or the button in the Settings sidebar tab. Or press **Shift+G** (change it under **Configure Controls**, *Open Wanderer's Satchel*).
3. The **Overview** lists every module. Each row's **Open** button (named after the window, such as *Control panel* or *Tools window*) opens that module's own main window; the sidebar (or the row's arrow) opens its page in the Satchel. **Check everything** runs one health report for all.

<!-- screenshot: the hub window, overview -->

## How to use

### The hub window

GM only. A window (about 1000 px wide, resizable) with a sidebar on the left and the page on the right. The Settings menu, the key binding (*Open Wanderer's Satchel* in Configure Controls; **Shift+G** by default since 0.7.0), the token-controls button and the Settings sidebar button all open it on **Overview**. It opens where you last left it, at the same size (per browser; the health check window too); *Maintenance › Reset window positions* forgets that. In a narrow window the sidebar becomes a strip of links above the page.

**Sidebar:** *Overview*; *Modules*, one link per module the Satchel knows (the ones it recognises when installed (see [The Wanderer's family](#the-wanderers-family)), and any module that registered itself) with a status dot (the worst result of its last health check since the page loaded; hollow when not active or not checked yet) and a count of its warnings and problems; *Tools*: Health check, Settings transfer, Maintenance; the Satchel's version at the bottom. Inactive modules are dimmed. The arrow keys, Home and End move between links; Enter opens one.

**Overview:** *What's new* cards when a module was updated (see below), three tiles (modules active, updates available, last health check), a table of modules (version, update state such as *Update available 1.2.0 → 1.3.0*, health badge, an **Open** button for modules that have a main window, and an arrow to that module's page; in a narrow window the table scrolls sideways in its own box), and cards for Settings transfer (Export, Import…), Settings backups, Debug logging for all and Maintenance. **Check now** (updates) and **Check everything** (health) are at the top.

**A module's page:** title, id, version, *Active* / *Not active*, and whether it comes from a built-in adapter or the module's own registration; **Open** (the module's main window, when it has one; see *Registration fields*) and **Settings** / **Open control panel** (the module's own panel; without one, its first settings menu; without that, Configure Settings). An update banner (*Update available x → y*) shows only when a newer version is out, with *Changelog* when the module has one and *Back up settings*; *newer than the latest release* and *Couldn't check* are one muted line. Below: that module's own health report (**Run check** / **Run again** checks it alone), *In the Satchel* (how its settings are exported and imported, its own Debug logging switch), *Links* (Docs, Changelog, Report issue from its `module.json`; a readme or changelog file in the module folder opens as served by Foundry) and *Module data* (the module's own extra actions, such as **Remove toolkit data…**).

**Update check:** asks the module's manifest URL for the latest version (for GitHub "latest release" manifests, GitHub's release API; a module without a manifest URL whose project URL is a GitHub repository is checked against that repository's latest release). Answers are kept for this browser session (6 hours; a failed check is tried again after 15 minutes). If the check can't reach the server in 8 seconds, or the answer can't be read, it says *Couldn't check* and nothing else happens. **Check now** asks again. The Satchel checks itself too. It never installs anything: updates are done in Foundry's Setup screen.

<!-- screenshot: the overview, dark theme -->
<!-- screenshot: a module page, light theme -->

### Combined health check

**Check everything** (or the *Health check* page) starts every module's own health check at once and shows the results grouped by module, problems first, with a summary on top (ok / warning / problem counts, checks still running, checks that failed, modules without a check, modules not active). A module's required modules from its manifest are listed too. The page shows straight away and fills in as each module answers, and the sidebar dots follow. 

Each module has its own time limit, so one slow module never holds up or fails the others:

- After 8 seconds a module still working shows *Still checking…*.
- The first check of a module after the page loads may take up to 90 seconds (a module's first check can be slow while it loads its data). Later checks get 30 seconds, or three times as long as that module took last time, whichever is longer (at most 5 minutes).
- A module past its limit shows *No answer yet* as a warning, not a failure. If it answers later, its result replaces that line. **Check again** starts over.
- A check that throws is shown as failed; the rest still run.

**Filter:** the count chips above the report (OK, Warnings, Problems, and Still checking / Not active when there are any) are toggle buttons. Press one or several (for example Warnings and Problems) to see only those lines; **All** shows everything again. Modules with no matching line are hidden, and the page says how many. The counts on the chips are always the totals. Each module page's health panel has the same chips. The choice is remembered in this browser and shared by the Health check page and the module pages; in a private window it lasts until the hub closes. Until you choose, the report opens on **Warnings, Problems and Still checking** with the OK lines hidden behind a **Show all (N OK)** chip; when nothing needs a look it is one line, *All N checks OK*, with the same chip.

**Fix buttons** (switch *Health fix buttons*): a line a module can repair itself has a **Fix** button (with the module's own label, such as *Rebuild index*). It may ask first. After it runs, that module is checked again. The Satchel's own group in the report checks its GM-only journal (Fix: *Make GM only* when a player can see it), its backups, failed update checks and its debug logging.

**Whisper to GMs** posts the whole report as it stands to chat (not filtered, no Fix buttons). The check itself changes nothing; only a Fix button you press does.

<!-- screenshot: the health check page -->

### Updates, What's new and settings backups

**Daily update check** (switch *Daily update check*): once a day per browser, when a GM loads the world, every module is checked and a notification says how many updates are out (nothing when none, or when a check fails). Without it, updates are checked when the hub opens.

**What's new** (switch *What's new*): when a module's installed version is newer than the one a GM last saw, a card on the Overview (and on that module's page) shows its release notes for every version in between (at most 10). They come from the module's changelog file when its `module.json` names one in its folder (Foundry serves it, so it is the installed version's file), otherwise from the module's GitHub releases. The notes are shown as simple formatted text: headings, lists, bold, italics, code and http(s) links; anything else, including HTML, shows as plain text. **Dismiss** hides the card until the next version, for every GM. A module seen for the first time, or one that went back to an older version, is recorded without a card.

**Settings backups** (switch *Settings backups*; *Settings backups* page under Tools): a backup is the same file as Settings transfer › Export, kept in the world in a GM-only journal (*Wanderer's Satchel (GM only)*). The last 5 are kept. One is taken:

- when the update check finds updates (once for each new set of updates, so not every day);
- on the first load after any module's version changed, and on the first load with Satchel 0.5.0 or later;
- when you press **Back up now** (Overview card, update banner, backups page) or call `api.backups.take()`.

**Restore…** opens the Settings transfer › Import preview with that backup; you tick what goes back and nothing is written before you confirm. Automatic backups are taken on the active GM's client only.

**What a backup after an update holds.** It holds your settings as they were before the modules' own upgrade steps ran. Changes a module makes very early while loading, Foundry's own data upgrade, and settings from a module that exports through its own export code show up in the next backup instead.

### Settings export / import for all

The *Settings transfer* page has two tabs. **Export** (*Export all settings*) downloads one JSON file with the settings of every active module in the Satchel (and the Satchel's own). A module that has its own export hands it over; for the others the Satchel reads the settings registered in the module's namespace. Record-type settings (histories, caches, "last version seen") are on a skip list and never exported.

**Import** (*Choose a file…*) reads such a file and shows, on the same page, what would change: count badges on top (settings that would change, values refused, modules skipped, records never imported), then per module the file's version, how many rows are ticked, a list of issues (settings this version doesn't have, records that are never imported, why a module is skipped), and a row per setting with now vs. from the file and a tick. Values that don't fit (wrong type, not one of the choices, a failed shape check) are red rows that can't be ticked; numbers are kept within their range. A module with its own import checks its part itself. A file that can't be read (over 5 MB, not valid JSON, not a Satchel file) is reported on the page, not only as a notification. Nothing is written until you press **Import N settings** in the footer, which also says how many ticked settings need a reload (Foundry asks).

What an import will never do: read a file over 5 MB; write to a module the Satchel doesn't show in this world (or one that isn't active); write a record setting; write a list or object setting that isn't plain data (no oversized or deeply nested values, no special keys like `__proto__`) or that fails that module's own shape check (for example the toolkit's flight network). Every value is checked again at the moment it is written.

The toolkit's flight network setting holds only the version players see; the full network is kept elsewhere by the toolkit, so importing a settings file does not bring back points that are still locked.

### Debug logging for all

When at least one module has a known Debug logging setting, the Overview shows one switch that turns all of them on or off at once (it changes each module's own setting; *some on* when they differ). Each module's page has its own switch.

### Maintenance

**Module data folder.** Wanderer's modules keep their GM-only journals together in one journal folder, *Module data*, which is hidden from the Journal sidebar. **Show module data folder** shows it in this browser. Each module has a switch of its own, and the folder shows when any one of them is on, so the page also lists the other modules' switches as set in this browser (read only: change them in that module's settings). This only tidies the sidebar. It hides nothing from players.

**Opening the Satchel** (0.7.0). **Button in the token controls** shows or hides the bag button in this browser (the world switch *Scene control button* turns it off for everyone). The panel also shows the key in use (default **Shift+G**; change it in Configure Controls).

**Window positions.** **Reset window positions** forgets where the hub and the health check window were left in this browser; they open at the default place and size next time.

## Settings

World settings (Game Settings › Wanderer's Satchel). The feature switches each reload:

| Setting | Default | Off means |
| --- | --- | --- |
| Feature: Update check | on | nothing is fetched; no update column or banner |
| Feature: Daily update check | on | updates are checked only when the hub opens or on Check now (also off when Update check is off) |
| Feature: What's new | on | no release notes cards; versions seen are not recorded |
| Feature: Settings backups | on | no backups, no Settings backups page (also off when Settings export / import is off) |
| Feature: Combined health check | on | no Health check page, health column or Check everything |
| Feature: Settings export / import for all | on | no Settings transfer page |
| Feature: Health fix buttons | on | health lines show without Fix buttons |
| Feature: Debug logging for all | on | no switch |
| Feature: Scene control button | on | no bag button in the token controls for anyone (each GM can also hide it in their own browser, see below) |

Also **Debug logging** (world, off): writes health check timings, update checks and imports to the browser console. It isn't in Configure Settings; **Debug logging for all** in the hub switches it with the others.

Per browser (not in Configure Settings): **Button in the token controls** (on; Maintenance › Opening the Satchel; 0.7.0), **Show module data folder** (off; on the Maintenance page) and the remembered window positions, and a bookkeeping flag (`keybindMigrated`, 0.7.1: set once a stale empty Open key binding was reset to Shift+G). The last two are never exported or imported, for the Satchel or for any other module.

## Troubleshooting

- **A module is missing from the sidebar.** The Satchel shows the modules it recognises when they are installed, and any other module only if it registers itself. Check that the module is installed and active.
- **The Satchel buttons do nothing for a player.** The Satchel is GM only.
- **An update check says "Couldn't check".** The server didn't answer within 8 seconds, or the answer couldn't be read. Nothing else happens. **Check now** asks again. The Satchel never installs anything: updates are done in Foundry's Setup screen.
- **A module shows "Still checking…" or "No answer yet".** That module's health check is slow. "No answer yet" is a warning, not a failure, and the result replaces it if the module answers later. **Check again** starts over.
- **An import file is refused.** Files over 5 MB, files that are not valid JSON and files that are not from the Satchel are reported on the Import page. Nothing is written until you press **Import N settings**.
- **A player can see the settings backups journal.** The Satchel's health check warns about it, with a **Fix** button (*Make GM only*). Foundry still sends the journal to players' browsers, so don't keep secrets in module settings.
- **Something odd.** Switch **Debug logging for all** on and look at the browser console.

## Removing its data

The *Maintenance* page (also **Remove Satchel data…** on the Overview) counts what the Satchel stored (a dry run), lets you tick what goes and asks you to type REMOVE; a missing confirm word or nothing ticked is said on the page. The GM-only journal (with the settings backups) is a category of its own, not ticked by default. What it stores is listed below.

The Satchel keeps these things:

- Its own settings (the feature switches and Debug logging) and three per-browser settings: whether the token controls button and the Module data folder are shown, and where the windows were left.
- The health report chat cards it whispers to GMs.
- A hidden GM journal, *Wanderer's Satchel (GM only)*, in the shared *Module data* folder. It holds the settings backups (at most 5, each at most 1 MB), the module versions last shown in What's new and the bookkeeping for automatic backups. It is made by the first automatic write on the active GM's client (or the first backup or dismissal). **Not secrecy:** it is kept out of players' sidebars and windows, but Foundry still sends it to players' browsers (checked on Foundry 14). Deleting it loses the backups.
- The shared *Module data* folder, when the first journal is filed. Remove Satchel data deletes it only when nothing else is in it.
- In the browser (gone when you clear site data): the latest update-check answers (until the tab closes), the health check filter, and when this browser last ran the daily update check.
- What you choose: **Import** writes other modules' settings, and **Debug logging for all** changes each module's own debug setting. Those belong to those modules and are not undone by Remove Satchel data.
- A key binding you set is kept by Foundry with its own key bindings.

## For developers

### Public API and hooks

`const satchel = game.modules.get("wanderers-satchel").api;` (set in our `init` hook). Entries marked GM do nothing on a player's client (a "GM only" notice and `undefined`).

| Member | | What it does |
| --- | --- | --- |
| `register({ id, title?, open?, openLabel?, openPanel?, health?, healthTimeoutMs?, exportSettings?, importSettings?, debugSetting?, docs?, skipSettings?, validators?, fixes? })` | stable | Adds or replaces a module (sidebar link and page). Returns `{ ok, error, warnings }`. See below. |
| `unregister(id)` | stable | Removes a registration (a built-in adapter shows again). |
| `registrations()` | stable | Ids that registered themselves. |
| `entries()` | experimental | GM (0.5.0; players got it before): what the hub shows: `[{ id, title, source, provisional, open, health, exportSettings, importSettings, debugSetting, fixes }]` (`fixes`: the action ids). |
| `open()` | stable | GM: opens the hub on Overview. |
| `openPanel(id)` | stable | GM: opens one module's control panel. |
| `health({ ids?, window? })` | stable | GM: runs the combined check; returns `{ summary, groups }`, or opens the window. Undefined when off. |
| `updates` | experimental | GM: `{ check({ force }), results(), compare(a, b) }`. Undefined when off. |
| `settings` | experimental | GM: `{ build(), export(), import(), read(text), apply(picks) }`; `import()` opens the hub on Settings transfer › Import and asks for a file. `apply` checks every row again (skip list, type, shape). Undefined when off. |
| `backups` | experimental | GM: `{ list(), take(), restore(id) }`: `list()` → `[{ id, at, reason, versions, size }]` newest first; `take()` → `{ ok, error }`; `restore(id)` opens the import preview with that backup. Undefined when Settings backups (or Settings export / import) is off. |
| `debug` | experimental | GM: `{ state(), set(on) }`. Undefined when off. |
| `cleanup` | stable | GM: `{ plan(), remove(pick), open() }`; `open()` shows the hub's Maintenance page. |
| `features` | experimental | `{ on(id), list() }`: the feature switches. |
| `isReady`, `whenReady()` | stable | Whether our ready hook ran; a promise for the api. |
| `version` | stable | The installed version. |

**Hook** `wanderers-satchel.ready` (stable): fired once, with the api, in our `ready` hook. Registering is safe any time after our `init`, so either register in your own `ready` hook (`game.modules.get("wanderers-satchel")?.api?.register(...)`) or listen to this hook; a registration made before the hub is open just shows when it opens.

Registration fields (all optional except `id`):

- `title`: the title in the sidebar and on its page (default: the module's title).
- `open()` (0.7.0): opens your module's main window. The Satchel shows an **Open** button for your module on the Overview and at the top of your page, so the GM can open every tool from one place. Return `false` to fall back to `openPanel`. Without it, the Satchel uses `game.modules.get(id).api.open()` when that is a function; with neither, no Open button is shown. Called on a GM's client only.
- `openLabel` (0.7.0): the Open button's text (default *Open*, at most 40 characters), e.g. `"Quest board"`.
- `openPanel()`: opens your control panel (the page's *Settings* button when you have `open`). Return `false` to fall back to your settings menu.
- `health({ timeoutMs })`: called with the time your check has (the Satchel's limit for it less a small margin), so your own per-part limits can match; ignore it if you don't need it. Returns your check, any of: `[{ title, lines: [{ level, text }] }]` (wanderers-core's health report), one `{ title, lines }`, `{ sections }`, `{ report }` or a plain array of lines. `level` is `ok`, `warn`, `bad`, `off` or `info`; `text` may be HTML (shown as plain text). May be async. Called only on a GM's client, so it may be GM-only.
- `healthTimeoutMs`: how long your check may take after the first one (5 000 to 300 000; the first check after a load always gets at least 90 s). Without it the Satchel adapts to how long your last check took.
- `exportSettings()`: returns your settings as any JSON value; stored as is in the bundle.
- `importSettings: { read(data), apply(rows) }`: `read` returns `{ ok, error, rows: [{ key, label, from, to, changed, note }], unknown, skipped, invalid }` (or `null` to let the Satchel check the values itself); `apply(rows)` writes the ticked rows and returns `{ written, reload }`.
- `debugSetting`: your Boolean debug setting's key, or `{ namespace, key }`.
- `docs: { url, readme, changelog, bugs }`: links that override your `module.json`.
- `skipSettings`: keys of record-type settings never exported or imported. `showModuleData` and `windowPlacement` (wanderers-core 0.5.0 client records) are always left out, listed or not.
- `fixes: { actionId: (ctx) => result }`: actions your health lines can point to (see below). Ids are letters, digits and `_ . : -`, at most 64; ids starting `satchel:` are the Satchel's own.
- `validators: { key: (value, def) => true | "reason" | { ok: true, value } }`: extra import checks for your Object and Array settings, run after the Satchel's plain-data check (the same contract as wanderers-core's `readImport` validators). `open`, `openPanel`, `health`, `importSettings` and `exportSettings` are only called on a GM's client.

```js
Hooks.once("ready", () => {
  game.modules.get("wanderers-satchel")?.api?.register({
    id: "my-module",
    open: () => MyModule.openWindow(),
    openLabel: "My window",
    openPanel: () => MyModule.openPanel(),
    health: () => MyModule.healthSections(),
    debugSetting: "debug",
    skipSettings: ["history"]
  });
});
```

### Health lines with a fix

Any line your `health()` returns may carry a `fix`. Lines without one are shown as before, so this is opt-in and older modules need no change.

- `fix: "rebuildIndex"`: an action id from your registration's `fixes` (button label *Fix*).
- `fix: { label: "Rebuild index", action: "rebuildIndex", confirm?: "Rebuild the index now?" }`: the same, with your own label and an optional question the GM answers first.
- `fix: { label, run: (ctx) => result, confirm? }` or `fix: () => result`: a function on the line itself. Prefer `action` ids when your check's result is kept or passed around.

The fix is called on a GM's client only, with `{ id, line: { level, text }, action }`. It may be async. Return a short text to show it as the notification (otherwise *<label>: done.*), `false` for "nothing was changed", or throw to show the error. After it returns, the Satchel runs your health check again. Labels and confirm texts are plain text.

```js
satchel.register({
  id: "my-module",
  health: () => [{ title: "Index", lines: [
    indexOk() ? { level: "ok", text: "Index up to date." }
              : { level: "warn", text: "The index is out of date.", fix: { label: "Rebuild index", action: "rebuildIndex" } }
  ] }],
  fixes: { rebuildIndex: async () => { await MyModule.rebuildIndex(); return "Index rebuilt."; } }
});
```

### Built-in adapters

Built-in adapters use only what each module exposes. A module that calls `register()` replaces its adapter.

| Module | Control panel | Health | Settings export / import | Debug logging |
| --- | --- | --- | --- | --- |
| Wanderer's Toolkit (`wayfarers-toolkit`) | its control panel (`api.panel`) | `api.healthReport()` (1.27 and later); older versions `api.health()`, which also whispers the toolkit's own card | read and checked by the Satchel (an older toolkit's own `api.settingsIO` import is used when it is there) | `debugLog` |
| Ringmaker (`ringmaker`) | Ringmaker tools (settings menu) | from `api.status()` and `api.removePlan()` | read by the Satchel | `debugLog` when Ringmaker has one; the module page says when it doesn't |
| Loot Ledger (`loot-ledger`) | Build loot pools (settings menu) | its source compendiums, built item and table compendiums, Build Report journal and main options (read without its API), plus dependencies | read by the Satchel | `debugLog` when Loot Ledger has one; the module page says when it doesn't |
| Red Book (`red-book`) | its control panel (`api.panel`) | `api.health()` | read by the Satchel (its records are skipped) | `debugLog` |

Red Book 0.4 and later register themselves, which replaces its row above with Red Book's own registration. Ringmaker 1.5 and later have a `debugLog` setting. The toolkit's page also has **Remove toolkit data…** and Red Book's has **Remove Red Book data…** (each module's own window). On a player's client the adapters never call another module's API.

### Stored data

| Where | Key |
|---|---|
| World and client settings | `wanderers-satchel.*` (feature switches, `debugLog`; client `showModuleData`, `windowPlacement`) |
| Health report chat cards | `flags.wanderers-satchel.health` |
| GM-only journal (ownership None) in *Module data* | `flags.wanderers-satchel.storeEntry`, `flags.wanderers-satchel.store`, `flags.wanderers-satchel.dataFolderFiled` |
| Session storage | `wanderers-satchel.update.*` |
| Local storage | `wanderers-satchel.healthFilter`, `wanderers-satchel.updateCheckedAt` |

Every module's `showModuleData` and `windowPlacement` client records are left out of Settings transfer and the backups.

### Built with wanderers-core

The Satchel bundles a pinned copy of [wanderers-core](https://github.com/cocoomg11/wanderers-core) (0.5.1) in `vendor/wanderers-core/`: the feature registry, settings table, debug logging, health levels and the health fix reader, the settings file format and its checks, version compare, the REMOVE confirmation, the GM-only store journal and the *Module data* folder, remembered window placement, the open key binding and the shared window look (`vendor/wanderers-core/styles/wanderers-ui.css`, loaded before the Satchel's own stylesheet) come from there. Nothing is installed separately. The Satchel sends nothing over Foundry's socket.

## License

MIT. See [LICENSE](LICENSE).
