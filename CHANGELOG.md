# Changelog

## 0.2.0

Built on the shared wanderers-core 0.2.0 library, a health check that no longer gives up on a slow module, better module cards, and safer imports.

### Changed

- **Check everything no longer fails a slow module.** Every module's check now starts at once and runs on its own, and the window fills in as each one answers. A check still going after 8 seconds shows *Still checking…*. The first check after loading the world may take up to 90 seconds (before: 20 seconds, which the toolkit's first check could miss); later checks get 30 seconds or three times as long as that module took last time. A check past its limit shows *No answer yet* as a warning instead of a failure, and its result still appears if it comes in later.
- **Wayfarer's Toolkit card:** uses the toolkit's new quiet health report (1.27 and later: no extra chat card). Older toolkits still work through the old check. Settings import no longer depends on the toolkit's own Settings export / import, which 1.27 removes; the Satchel checks the toolkit's settings itself (an older toolkit's own import is still used when it's there). The Satchel never used Session Start or Who's online and doesn't now.
- **Red Book card:** no longer provisional. Uses Red Book's control panel, health check, Remove Red Book data and Debug logging setting; Red Book's two record settings are never exported. If Red Book registers itself with the Satchel later, its own registration takes over.
- **Record settings skipped:** Red Book's window position (`onlineHudPos`) and its run-once record (`migrations`) are never exported. The toolkit's own list of record settings (`api.settingsRecords()`, 1.27 and later) is skipped too, on top of the built-in list. The toolkit's flight network setting now holds only the players' view, so an import doesn't restore locked points.
- **Ringmaker card:** a Debug logging row (it says when your Ringmaker version has no such setting).
- **Loot Ledger card:** a real health check instead of "dependencies only": the source item compendium, the built item and table compendiums, the Build Report journal, the world's game system and the main options. It reads them directly, without calling Loot Ledger.
- **Debug logging for all** now includes the Satchel's own new Debug logging setting (health check timings, update checks, imports in the browser console).
- Feature switches, debug logging, version compare and the settings file format now come from the bundled wanderers-core library. Setting keys are unchanged, so nothing you set is lost.

### Security

- Everything that does something is GM only, and the Satchel only calls the other modules' APIs on a GM's client (Ringmaker, Loot Ledger and Red Book now answer GMs only). Players never see the hub, its buttons or anything GM-only.
- Settings import: files over 5 MB are refused; only modules shown in the hub (and the Satchel) are read or written; record settings are never written; list and object settings must be plain data within size and depth limits with no special keys, and pass the module's own shape check where one is known (the toolkit's flight network). Every value is checked again when it is written, including rows passed to `api.settings.apply()`.
- The Satchel sends nothing over Foundry's socket and reads no sender from any message.

### For other modules

- `register()` takes `healthTimeoutMs` (your check's own time limit) and `validators` (extra import checks for your Object and Array settings). `api.features` is now `{ on(id), list() }`.
- `health()` and the other registration functions are only called on a GM's client.

### Untested in Foundry

Not run in a live world yet; check:

- [ ] **Fresh load, Check everything:** reload the world, open the hub and press Check everything at once. The window opens straight away; the toolkit shows *Still checking…* if it takes over 8 seconds and then its result (no "no answer within 20 s"). Note how long the toolkit's first check takes (Debug logging on: the console shows `health wayfarers-toolkit: … ms`). Press Check again: faster, same result.
- [ ] A slow or hung check (for example a world macro registering `{ id: "test-slow", health: () => new Promise(() => {}) }`) shows *No answer yet* after 90 s as a warning, and every other module's result is shown long before that.
- [ ] Wayfarer's Toolkit 1.27 card: health sections show, no toolkit chat card is whispered; with an older toolkit the old check and the note about its card show. Open control panel and Remove toolkit data… work. No mention of Settings export / import, Session Start or Who's online.
- [ ] Ringmaker card: health lines; *Debug logging: this version has no debug logging setting* with 1.4.2.
- [ ] Loot Ledger card: Health shows Sources (source compendium and its item count), Loot pools (built compendiums, Build Report) and Options; before a build, the "No loot pools built yet" warning; *Debug logging* row text.
- [ ] Red Book 0.3 card: no "provisional" tag; Open control panel, Health (lines under "Checks"), Remove Red Book data… and its Debug logging in Debug logging for all.
- [ ] Debug logging for all switches the toolkit, Red Book and the Satchel together; *some on* when they differ.
- [ ] Export all settings, then Import: preview per module; the toolkit part is checked by the Satchel (1.27); ticked rows apply; reload asked when needed. A file with a changed flight network that isn't a network shows it under "values that don't fit". Colour settings (Ringmaker background) round-trip.
- [ ] Network off: update check shows *Couldn't check* on every card; Check everything still runs.
- [ ] Player client: no scene control button, no Settings sidebar button, the key binding does nothing, `game.modules.get("wanderers-satchel").api.open()` / `.health()` / `.settings.export()` give "GM only"; no Ringmaker / Loot Ledger / Red Book "GM only" notices appear on a player's screen.
- [ ] Remove Satchel data still counts and removes the health cards, session cache and settings (including Debug logging).
- [ ] The release zip contains `vendor/wanderers-core/` without `config/` and `vendor.mjs`, and the module loads from it (no 404 in the console).

## 0.1.0

First release.

- **Hub window** (GM): a card per module with installed version, active state, update check (session cache, 8 s time limit, "Couldn't check" when it fails) and buttons for the module's control panel, its health check, docs, changelog and issue page. Opened from Game Settings, the token controls, the Settings sidebar tab, a key binding (none set by default) or `api.open()`.
- **Combined health check**: every module's own check, grouped by module, problems first, with a summary.
- **Settings export / import for all**: one JSON file; each module's own export / import where it has one, else the settings in its namespace, with a change preview and a skip list for record-type settings.
- **Debug logging for all**: one switch for every module's debug setting.
- **Registration API** `api.register({ id, … })` and hook `wanderers-satchel.ready`.
- **Built-in adapters** for Wayfarer's Toolkit, Ringmaker, Loot Ledger and Red Book (provisional).
- **Remove Satchel data** with a dry run.
- Every feature can be switched off.

### Untested in Foundry

Not run in a live world yet; check:

- [ ] The hub opens from Game Settings, the token controls bag button, the Settings sidebar button and a key you set; players see none of them.
- [ ] Cards for each installed module, correct versions and active state; a deactivated module shows *not active*.
- [ ] Update check: GitHub API answers in the browser (no CORS error), "Update available" for an older install, "Couldn't check" with the network off; answers kept after a reload in the same tab.
- [ ] Open control panel: toolkit panel; Ringmaker tools and Build loot pools menus; a module with no menu opens Configure Settings on its tab (`initialCategory` value unverified).
- [ ] Docs / Changelog / Report issue open the right pages; a relative readme opens from the module folder.
- [ ] Check everything: toolkit sections (and its own card whispered), Ringmaker lines, Loot Ledger dependency line, failure in one module doesn't stop the rest; Whisper to GMs.
- [ ] Export all settings downloads one file; Import shows the preview, toolkit part checked by the toolkit's own import (with its Settings export / import on, and off), applies ticked rows, asks to reload when needed. Colour settings (Ringmaker background) round-trip.
- [ ] Debug logging for all turns the toolkit's `debugLog` on and off.
- [ ] Remove Satchel data: counts, REMOVE confirm, health cards deleted, session cache cleared, settings reset.
- [ ] `api.register()` from a world macro replaces an adapter's card; `wanderers-satchel.ready` fires once.
- [ ] Settings sidebar button position in v13 and v14 (section selectors unverified).
