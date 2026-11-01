# Wanderer's Satchel

A small GM hub for [Foundry VTT](https://foundryvtt.com) (v13 and v14, any game system) that keeps your other modules in one place: a card per module with its version, whether it's active and whether an update is out, buttons that open each module's own control panel, health check, docs and issue page, plus a combined health check, one-file settings export / import for all of them and one Debug logging switch.

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
3. Each card shows one module. Use **Open control panel** to get to that module's own window, and **Check everything** at the top for one health report.

<!-- screenshot: the hub window with three module cards -->

## How to use

### The hub window

GM only. One card per module the Satchel knows (the [built-in ones](#built-in-modules) when installed, and any module that registered itself):

- **Title, version, state:** installed version, *active* / *not active* in this world, and whether the card comes from a built-in adapter or the module's own registration.
- **Update check:** asks the module's manifest URL for the latest version (for GitHub "latest release" manifests, GitHub's release API). Answers are kept for this browser session (6 hours; a failed check is tried again after 15 minutes). If the check can't reach the server in 8 seconds, or the answer can't be read, the card says *Couldn't check* and nothing else happens. **Check for updates** asks again.
- **Open control panel:** the module's own panel. Without one, its first settings menu; without that, Configure Settings.
- **Health:** that module's check alone (see below).
- **Docs / Changelog / Report issue:** the links from the module's `module.json` (`url`, `readme`, `changelog`, `bugs`). A readme or changelog file inside the module folder opens as served by Foundry.

<!-- screenshot: one card with an update available -->

### Combined health check

**Check everything** runs each module's own health check one after another and shows the results grouped by module, problems first, with a summary on top (✓ / ⚠ / ✗ counts, checks that failed, modules without a check, modules not active). A module's required modules from its manifest are listed too. One check that throws or takes longer than 20 seconds is shown as failed; the rest still run. **Whisper to GMs** posts the report to chat. The check itself changes nothing (a module's own check may post its own card; see Wayfarer's Toolkit below).

<!-- screenshot: the combined health window -->

### Settings export / import for all

**Export all settings** downloads one JSON file with the settings of every active module in the Satchel (and the Satchel's own). A module that has its own export hands it over; for the others the Satchel reads the settings registered in the module's namespace. Record-type settings (histories, caches, "last version seen") are on a skip list and never exported.

**Import settings…** reads such a file and shows, per module, what would change: now vs. from the file, a tick per setting, and warnings for settings this version doesn't have, values that don't fit (wrong type, not one of the choices; numbers are kept within their range) and records that are never imported. A module with its own import checks its part itself. Nothing is written until you press **Import ticked settings**; if a changed setting needs a reload, Foundry asks.

### Debug logging for all

When at least one module has a known Debug logging setting, the hub shows one switch that turns all of them on or off at once (it changes each module's own setting; *some on* when they differ).

### Remove Satchel data

**Remove Satchel data…** counts what the Satchel stored (a dry run), lets you tick what goes and asks you to type REMOVE. See [Data Wanderer's Satchel writes](#data-wanderers-satchel-writes).

## Built-in modules

Built-in adapters use only what each module exposes today. A module that calls `register()` replaces its adapter.

| Module | Control panel | Health | Settings export / import | Debug logging |
| --- | --- | --- | --- | --- |
| Wayfarer's Toolkit (`wayfarers-toolkit`) | its control panel (`api.panel`) | `api.health()` (also whispers the toolkit's own card) | read by the Satchel; import through the toolkit's own checks (`api.settingsIO.read/apply`) when its Settings export / import is on | `debugLog` |
| Ringmaker (`ringmaker`) | Ringmaker tools (settings menu) | from `api.status()` and `api.removePlan()` | read by the Satchel | none |
| Loot Ledger (`loot-ledger`) | Build loot pools (settings menu) | dependencies only | read by the Satchel | none |
| Red Book (`red-book`) | *provisional:* `api.panel` when present, else its settings menu | *provisional:* `api.health()` when present | *provisional:* `api.settingsIO` when present | *provisional:* `debugLog` when registered |

The toolkit card also has **Remove toolkit data…**; Red Book's gets **Remove Red Book data…** once it has `api.cleanup.open()`.

## Settings

World settings (Game Settings › Wanderer's Satchel), each a switch that reloads:

| Setting | Default | Off means |
| --- | --- | --- |
| Feature: Update check | on | nothing is fetched; cards show no update line |
| Feature: Combined health check | on | no Health buttons, no Check everything |
| Feature: Settings export / import for all | on | no Export / Import buttons |
| Feature: Debug logging for all | on | no switch |
| Feature: Scene control button | on | no bag button in the token controls |

## Public API and hooks

`const satchel = game.modules.get("wanderers-satchel").api;` (set in our `init` hook).

| Member | | What it does |
| --- | --- | --- |
| `register({ id, title?, openPanel?, health?, exportSettings?, importSettings?, debugSetting?, docs?, skipSettings? })` | stable | Adds or replaces a card. Returns `{ ok, error, warnings }`. See below. |
| `unregister(id)` | stable | Removes a registration (a built-in adapter shows again). |
| `registrations()` | stable | Ids that registered themselves. |
| `entries()` | experimental | What the hub shows: `[{ id, title, source, provisional, health, exportSettings, importSettings, debugSetting }]`. |
| `open()` | stable | GM: opens the hub. |
| `openPanel(id)` | stable | GM: opens one module's control panel. |
| `health({ ids?, window? })` | stable | GM: runs the combined check; returns `{ summary, groups }`, or opens the window. Undefined when off. |
| `updates` | experimental | `{ check({ force }), results(), compare(a, b) }`. Undefined when off. |
| `settings` | experimental | `{ build(), export(), import(), read(text), apply(picks) }`. Undefined when off. |
| `debug` | experimental | `{ state(), set(on) }`. Undefined when off. |
| `cleanup` | stable | `{ plan(), remove(pick), open() }`. |
| `isReady`, `whenReady()` | stable | Whether our ready hook ran; a promise for the api. |
| `version` | stable | The installed version. |

**Hook** `wanderers-satchel.ready` (stable): fired once, with the api, in our `ready` hook. Registering is safe any time after our `init`, so either register in your own `ready` hook (`game.modules.get("wanderers-satchel")?.api?.register(...)`) or listen to this hook; a registration made before the hub is open just shows when it opens.

Registration fields (all optional except `id`):

- `title`: card title (default: the module's title).
- `openPanel()`: opens your control panel. Return `false` to fall back to your settings menu.
- `health()`: returns your check, any of: `[{ title, lines: [{ level, text }] }]`, one `{ title, lines }`, `{ sections }` or a plain array of lines. `level` is `ok`, `warn`, `bad`, `off` or `info`; `text` may be HTML (shown as plain text). May be async.
- `exportSettings()`: returns your settings as any JSON value; stored as is in the bundle.
- `importSettings: { read(data), apply(rows) }`: `read` returns `{ ok, error, rows: [{ key, label, from, to, changed, note }], unknown, skipped, invalid }` (or `null` to let the Satchel check the values itself); `apply(rows)` writes the ticked rows and returns `{ written, reload }`.
- `debugSetting`: your Boolean debug setting's key, or `{ namespace, key }`.
- `docs: { url, readme, changelog, bugs }`: links that override your `module.json`.
- `skipSettings`: keys of record-type settings never exported or imported.

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

- Its own world settings (the feature switches above), under the `wanderers-satchel` namespace.
- `flags.wanderers-satchel.health` on the health report chat messages it whispers to GMs.
- Update-check answers in the browser's session storage (keys starting `wanderers-satchel.update.`); gone when the browser tab closes.
- What you choose: **Import** writes other modules' settings, and **Debug logging for all** changes each module's own debug setting. Those belong to those modules and are not undone by Remove Satchel data.
- A key binding you set is kept by Foundry with its own key bindings.

## Install

Manifest URL: `https://github.com/cocoomg11/wanderers-satchel/releases/latest/download/module.json`

## License

MIT. See [LICENSE](LICENSE).
