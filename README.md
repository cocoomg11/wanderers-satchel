# Wanderer's Satchel

A GM hub for [Foundry VTT](https://foundryvtt.com) (v13 and v14, any game system) that keeps your other modules in one window:

- an **overview** of every module (version, whether it's active, whether an update is out, its last health check), with **What's new** after a module updates;
- a **page per module** with buttons that open its own control panel, health check, docs and issue page;
- a **combined health check** with filters for warnings and problems;
- **settings transfer**: one file with every module's settings, with a preview before anything is written, and **settings backups** kept in the world around updates;
- **Fix** buttons on health lines a module can repair itself;
- **maintenance** (one Debug logging switch, removing the Satchel's own data).

It looks like the rest of Foundry (light or dark theme) through a shared stylesheet from [wanderers-core](https://github.com/cocoomg11/wanderers-core).

The Satchel only opens and reads; every module keeps its own settings and windows and works the same without it. Other modules can join through a [registration API](#public-api-and-hooks).

What changed in each version: [CHANGELOG](CHANGELOG.md).

## Contents

- [Quick start](#quick-start)
- [How to use](#how-to-use)
  - [The hub window](#the-hub-window)
  - [Combined health check](#combined-health-check)
  - [Updates, What's new and settings backups](#updates-whats-new-and-settings-backups)
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

GM only. A window (about 1000 px wide, resizable) with a sidebar on the left and the page on the right. The Settings menu, the key binding (*Open Wanderer's Satchel* in Configure Controls; no key by default), the token-controls button and the Settings sidebar button all open it on **Overview**. It opens where you last left it, at the same size (per browser; the health check window too); *Maintenance › Reset window positions* forgets that. In a narrow window the sidebar becomes a strip of links above the page.

**Sidebar:** *Overview*; *Modules*, one link per module the Satchel knows (the [built-in ones](#built-in-modules) when installed, and any module that registered itself) with a status dot (the worst result of its last health check since the page loaded; hollow when not active or not checked yet) and a count of its warnings and problems; *Tools*: Health check, Settings transfer, Maintenance; the Satchel's version at the bottom. Inactive modules are dimmed. The arrow keys, Home and End move between links; Enter opens one.

**Overview:** *What's new* cards when a module was updated (see below), three tiles (modules active, updates available, last health check), a table of modules (version, update state such as *Update available 1.2.0 → 1.3.0*, health badge; each row opens that module's page; in a narrow window the table scrolls sideways in its own box), and cards for Settings transfer (Export, Import…), Settings backups, Debug logging for all and Maintenance. **Check now** (updates) and **Check everything** (health) are at the top.

**A module's page:** title, id, version, *Active* / *Not active*, and whether it comes from a built-in adapter or the module's own registration; **Open control panel** (the module's own panel; without one, its first settings menu; without that, Configure Settings). An update banner (*Update available x → y*) shows only when a newer version is out, with *Changelog* when the module has one and *Back up settings*; *newer than the latest release* and *Couldn't check* are one muted line. Below: that module's own health report (**Run check** / **Run again** checks it alone), *In the Satchel* (how its settings are exported and imported, its own Debug logging switch), *Links* (Docs, Changelog, Report issue from its `module.json`; a readme or changelog file in the module folder opens as served by Foundry) and *Module data* (the module's own extra actions, such as **Remove toolkit data…**).

**Update check:** asks the module's manifest URL for the latest version (for GitHub "latest release" manifests, GitHub's release API; a module without a manifest URL whose project URL is a GitHub repository is checked against that repository's latest release). Answers are kept for this browser session (6 hours; a failed check is tried again after 15 minutes). If the check can't reach the server in 8 seconds, or the answer can't be read, it says *Couldn't check* and nothing else happens. **Check now** asks again. The Satchel checks itself too. It never installs anything: updates are done in Foundry's Setup screen.

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

**Fix buttons** (switch *Health fix buttons*): a line a module can repair itself has a **Fix** button (with the module's own label, such as *Rebuild index*). It may ask first. After it runs, that module is checked again. The Satchel's own group in the report checks its GM-only journal (Fix: *Make GM only* when a player can see it), its backups, failed update checks and its debug logging.

**Whisper to GMs** posts the whole report as it stands to chat (not filtered, no Fix buttons). The check itself changes nothing; only a Fix button you press does.

<!-- screenshot: the health check page -->

### Updates, What's new and settings backups

**Daily update check** (switch *Daily update check*): once a day per browser, when a GM loads the world, every module is checked and a notification says how many updates are out (nothing when none, or when a check fails). Without it, updates are checked when the hub opens.

**What's new** (switch *What's new*): when a module's installed version is newer than the one a GM last saw, a card on the Overview (and on that module's page) shows its release notes for every version in between (at most 10). They come from the module's changelog file when its `module.json` names one in its folder (Foundry serves it, so it is the installed version's file), otherwise from the module's GitHub releases. The notes are shown as simple formatted text: headings, lists, bold, italics, code and http(s) links; anything else, including HTML, shows as plain text. **Dismiss** hides the card until the next version, for every GM. A module seen for the first time, or one that went back to an older version, is recorded without a card.

**Settings backups** (switch *Settings backups*; *Settings backups* page under Tools): a backup is the same file as Settings transfer › Export, kept in the world in a GM-only journal (*Wanderer's Satchel (GM only)*, ownership None). The last 5 are kept. One is taken:

- when the update check finds updates (once for each new set of updates, so not every day);
- on the first load after any module's version changed, and on the first load with Satchel 0.5.0 or later;
- when you press **Back up now** (Overview card, update banner, backups page) or call `api.backups.take()`.

**Restore…** opens the Settings transfer › Import preview with that backup; you tick what goes back and nothing is written before you confirm. Automatic backups are taken on the active GM's client only.

*Load order:* the backup after a version change reads every module's settings in Foundry's `setup` hook (the earliest point settings can be read) and is written in `ready`, so it holds the settings from before the migrations modules usually run in their own `ready` hook. It cannot hold what a module changes in its `init` or `setup` hook (or a `setup` hook that runs before the Satchel's), Foundry's own data migration, or the part of a module that exports its settings through its own `exportSettings()` (it registers later); those are in the next backup.

### Settings export / import for all

The *Settings transfer* page has two tabs. **Export** (*Export all settings*) downloads one JSON file with the settings of every active module in the Satchel (and the Satchel's own). A module that has its own export hands it over; for the others the Satchel reads the settings registered in the module's namespace. Record-type settings (histories, caches, "last version seen") are on a skip list and never exported.

**Import** (*Choose a file…*) reads such a file and shows, on the same page, what would change: count badges on top (settings that would change, values refused, modules skipped, records never imported), then per module the file's version, how many rows are ticked, a list of issues (settings this version doesn't have, records that are never imported, why a module is skipped), and a row per setting with now vs. from the file and a tick. Values that don't fit (wrong type, not one of the choices, a failed shape check) are red rows that can't be ticked; numbers are kept within their range. A module with its own import checks its part itself. A file that can't be read (over 5 MB, not valid JSON, not a Satchel file) is reported on the page, not only as a notification. Nothing is written until you press **Import N settings** in the footer, which also says how many ticked settings need a reload (Foundry asks).

What an import will never do: read a file over 5 MB; write to a module the Satchel doesn't show in this world (or one that isn't active); write a record setting; write a list or object setting that isn't plain data (no oversized or deeply nested values, no special keys like `__proto__`) or that fails that module's own shape check (for example the toolkit's flight network). Every value is checked again at the moment it is written.

The toolkit's flight network setting holds only the version players see; the full network is kept elsewhere by the toolkit, so importing a settings file does not bring back points that are still locked.

### Debug logging for all

When at least one module has a known Debug logging setting, the Overview shows one switch that turns all of them on or off at once (it changes each module's own setting; *some on* when they differ). Each module's page has its own switch.

### Maintenance

**Module data folder.** Your modules (on wanderers-core 0.5.0) keep their GM-only journals together in one Journal folder, *Module data*, which is hidden from the Journal sidebar. **Show module data folder** shows it in this browser. Each module has a switch of its own, and the folder shows when any one of them is on, so the page also lists the other modules' switches as set in this browser (read only: change them in that module's settings). This only tidies the sidebar; it hides nothing from players.

**Window positions.** **Reset window positions** forgets where the hub and the health check window were left in this browser; they open at the default place and size next time.

### Remove Satchel data

The *Maintenance* page (also **Remove Satchel data…** on the Overview) counts what the Satchel stored (a dry run), lets you tick what goes and asks you to type REMOVE; a missing confirm word or nothing ticked is said on the page. The GM-only journal (with the settings backups) is a category of its own, not ticked by default. See [Data Wanderer's Satchel writes](#data-wanderers-satchel-writes).

## Built-in modules

Built-in adapters use only what each module exposes. A module that calls `register()` replaces its adapter.

| Module | Control panel | Health | Settings export / import | Debug logging |
| --- | --- | --- | --- | --- |
| Wanderer's Toolkit (`wayfarers-toolkit`) | its control panel (`api.panel`) | `api.healthReport()` (1.27 and later); older versions `api.health()`, which also whispers the toolkit's own card | read and checked by the Satchel (an older toolkit's own `api.settingsIO` import is used when it is there) | `debugLog` |
| Ringmaker (`ringmaker`) | Ringmaker tools (settings menu) | from `api.status()` and `api.removePlan()` | read by the Satchel | `debugLog` when Ringmaker has one; the module page says when it doesn't |
| Loot Ledger (`loot-ledger`) | Build loot pools (settings menu) | its source compendiums, built item and table compendiums, Build Report journal and main options (read without its API), plus dependencies | read by the Satchel | `debugLog` when Loot Ledger has one; the module page says when it doesn't |
| Red Book (`red-book`) | its control panel (`api.panel`) | `api.health()` | read by the Satchel (its records are skipped) | `debugLog` |

Red Book 0.4 and later register themselves, which replaces its row above with Red Book's own registration. Ringmaker 1.5 and later have a `debugLog` setting.

The toolkit's page also has **Remove toolkit data…** and Red Book's **Remove Red Book data…** (each module's own window).

**GM only.** Ringmaker, Loot Ledger and Red Book only answer GMs, and so do the toolkit's panel and health check. The Satchel calls them only on a GM's client: on a player's client its windows, buttons and API entries do nothing, and the adapters never call another module's API there.

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
| Feature: Scene control button | on | no bag button in the token controls |

Also **Debug logging** (`debugLog`, world, off): writes health check timings, update checks and imports to the browser console. It isn't in Configure Settings; **Debug logging for all** in the hub switches it with the others.

Per browser (client settings, not in Configure Settings): **Show module data folder** (`showModuleData`, off; on the Maintenance page) and the remembered window positions (`windowPlacement`, wanderers-core's). Neither is ever exported or imported, for the Satchel or for any other module: every module's `showModuleData` and `windowPlacement` are left out of Settings transfer and the backups.

## Public API and hooks

`const satchel = game.modules.get("wanderers-satchel").api;` (set in our `init` hook). Entries marked GM do nothing on a player's client (a "GM only" notice and `undefined`).

| Member | | What it does |
| --- | --- | --- |
| `register({ id, title?, openPanel?, health?, healthTimeoutMs?, exportSettings?, importSettings?, debugSetting?, docs?, skipSettings?, validators?, fixes? })` | stable | Adds or replaces a module (sidebar link and page). Returns `{ ok, error, warnings }`. See below. |
| `unregister(id)` | stable | Removes a registration (a built-in adapter shows again). |
| `registrations()` | stable | Ids that registered themselves. |
| `entries()` | experimental | GM (0.5.0; players got it before): what the hub shows: `[{ id, title, source, provisional, health, exportSettings, importSettings, debugSetting, fixes }]` (`fixes`: the action ids). |
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
- `openPanel()`: opens your control panel. Return `false` to fall back to your settings menu.
- `health({ timeoutMs })`: called with the time your check has (the Satchel's limit for it less a small margin), so your own per-part limits can match; ignore it if you don't need it. Returns your check, any of: `[{ title, lines: [{ level, text }] }]` (wanderers-core's health report), one `{ title, lines }`, `{ sections }`, `{ report }` or a plain array of lines. `level` is `ok`, `warn`, `bad`, `off` or `info`; `text` may be HTML (shown as plain text). May be async. Called only on a GM's client, so it may be GM-only.
- `healthTimeoutMs`: how long your check may take after the first one (5 000 to 300 000; the first check after a load always gets at least 90 s). Without it the Satchel adapts to how long your last check took.
- `exportSettings()`: returns your settings as any JSON value; stored as is in the bundle.
- `importSettings: { read(data), apply(rows) }`: `read` returns `{ ok, error, rows: [{ key, label, from, to, changed, note }], unknown, skipped, invalid }` (or `null` to let the Satchel check the values itself); `apply(rows)` writes the ticked rows and returns `{ written, reload }`.
- `debugSetting`: your Boolean debug setting's key, or `{ namespace, key }`.
- `docs: { url, readme, changelog, bugs }`: links that override your `module.json`.
- `skipSettings`: keys of record-type settings never exported or imported. `showModuleData` and `windowPlacement` (wanderers-core 0.5.0 client records) are always left out, listed or not.
- `fixes: { actionId: (ctx) => result }`: actions your health lines can point to (see below). Ids are letters, digits and `_ . : -`, at most 64; ids starting `satchel:` are the Satchel's own.
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

## Data Wanderer's Satchel writes

- Its own world settings (the feature switches above and Debug logging) and two client settings (`showModuleData`, `windowPlacement`), under the `wanderers-satchel` namespace.
- `flags.wanderers-satchel.health` on the health report chat messages it whispers to GMs.
- One journal entry, *Wanderer's Satchel (GM only)* (ownership None; `flags.wanderers-satchel.storeEntry`, `flags.wanderers-satchel.store` and, once filed, `flags.wanderers-satchel.dataFolderFiled`), in the shared *Module data* folder: the settings backups (at most 5, each at most 1 MB), the module versions last shown in What's new and the bookkeeping for automatic backups. It is made by the first automatic write on the active GM's client (or the first backup or dismissal); an entry made before 0.6.0 is moved into *Module data* once by the active GM (move it elsewhere afterwards and it stays there). **Not secrecy:** ownership None keeps it out of players' sidebars and windows, but Foundry still sends the journal to players' clients (checked on Foundry 14), so a player with the browser console can read it. Don't keep anything secret in module settings. The Satchel's health check warns when a player can see it in the sidebar. Deleting it loses the backups.
- The *Module data* journal folder (wanderers-core's, shared with your other modules), when the first store journal is filed. Remove Satchel data deletes it only when nothing else is in it.
- Update-check answers in the browser's session storage (keys starting `wanderers-satchel.update.`); gone when the browser tab closes.
- The health check filter in the browser's local storage (`wanderers-satchel.healthFilter`; only while a filter other than All is chosen), and when this browser last ran the daily update check (`wanderers-satchel.updateCheckedAt`).
- What you choose: **Import** writes other modules' settings, and **Debug logging for all** changes each module's own debug setting. Those belong to those modules and are not undone by Remove Satchel data.
- A key binding you set is kept by Foundry with its own key bindings.

## Built with wanderers-core

The Satchel bundles a pinned copy of [wanderers-core](https://github.com/cocoomg11/wanderers-core) (0.5.0) in `vendor/wanderers-core/`: the feature registry, settings table, debug logging, health levels and the health fix reader, the settings file format and its checks, version compare, the REMOVE confirmation, the GM-only store journal and the *Module data* folder, remembered window placement, the open key binding and the shared window look (`vendor/wanderers-core/styles/wanderers-ui.css`, loaded before the Satchel's own stylesheet) come from there. Nothing is installed separately. The Satchel sends nothing over Foundry's socket.

## Install

Manifest URL: `https://github.com/cocoomg11/wanderers-satchel/releases/latest/download/module.json`

## License

MIT. See [LICENSE](LICENSE).
