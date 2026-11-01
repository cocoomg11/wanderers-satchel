# Changelog

## 0.4.1

Two keyboard fixes from a live check, wanderers-core 0.3.1, and clearer descriptions.

### Changed

- **wanderers-core 0.3.1** (shared look revision 2). The Satchel's own copy of the short-window fix is removed; core's stylesheet does it now.
- **Descriptions.** The module description and the README intro say what the Satchel does today: overview, a page per module, combined health check with filters, settings transfer, maintenance, native Foundry look.

### Fixed

- **Space on a health filter chip paused the game.** Space did not toggle the chip and reached Foundry's own Space key (pause). Space and Enter now both toggle the chip and are kept from Foundry's keybindings; holding the key does not flicker it.
- **Focus was lost after opening a page with Enter in the sidebar.** Focus fell to the page body. It now stays on the sidebar link of the page you opened, so the arrow keys keep working.

### Untested in Foundry

- Tab to a filter chip (Health check page and a module page) and press Space: the chip toggles once and the game does not pause. Same with Enter. Holding Space does not flicker the chip. Mouse click still works. In Firefox and Chrome.
- Space or Enter on a chip while results are still coming in: focus stays on the chip.
- Arrow to a sidebar link and press Enter: the page opens and focus stays on that link (also for a module page, Health check, Settings transfer, Maintenance); arrows still move between links; clicking a link with the mouse also leaves it focused.
- No 404 for `vendor/wanderers-core/styles/wanderers-ui.css`; the hub at 640x720 and 1000x450 still shows the module table at full height (now core's rule); both themes.
- The module list in Foundry's Manage Modules shows the new description.

## 0.4.0

A filter for the health check, three fixes from a live retest, and the shared look of wanderers-core.

### Added

- **Health check filter.** On the Health check page the count chips (OK, Warnings, Problems, Still checking, Not active) are toggle buttons: press one or several (Warnings + Problems), **All** resets. Only matching lines show; modules with no matching line are hidden and the page says how many ("2 modules hidden by the filter"). The counts stay the totals. Each module page's health panel has the same chips. The choice is remembered per browser (local storage; everything still works when the browser refuses storage). Remove Satchel data forgets it (*Kept in this browser*).

### Changed

- **Shared look from wanderers-core 0.3.0.** The hub and the health window use core's stylesheet and classes (sidebar, page head, tiles, panels, banners, alerts, tables, buttons, badges, dots, status lines; Foundry's own colours in both themes). The Satchel's own stylesheet now holds only what the Satchel alone has. Remove Satchel data's **Remove** button is styled as a danger button.
- The whispered health card is wrapped in the same look, so its badges and lines match the hub.

### Fixed

- **Short or narrow hub hid the module table.** At 640×720 or 1000×450 the table box shrank to a few pixels instead of the page scrolling. The page's blocks now keep their height. (Same fix in wanderers-core 0.3.1; the Satchel carries its own rule until it moves to that.)
- **Whisper to GMs card heading** wrapped the module name a few letters per line in the chat sidebar (the chat's large heading size plus the counts squeezing it). The heading is smaller, the counts never wrap and sit on their own line in chat, and the name wraps as words.
- **Settings import preview showed translation keys** for some modules' settings (for example `LOOTLEDGER.Settings.Ratio.Name`). Other modules' setting names and hints are now localized wherever the Satchel shows them; the hint shows when you point at a setting's name.

### Untested in Foundry

- The hub and the health window in the dark and the light theme, and with a window's own theme override: tiles, badges, dots, banners, alerts, tables, buttons and focus outlines look at least as good as 0.3.0; no 404 for `vendor/wanderers-core/styles/wanderers-ui.css` in the console.
- The hub at 640×720 and 1000×450: the module table, panels and import blocks keep their height and the page scrolls; at 720 px or narrower the sidebar is a strip and the tiles and tool cards stack.
- Filter chips: pressing, multi-select, All, the hidden-modules line, keyboard (Tab to a chip, Space / Enter toggles, focus stays on it while results come in); the same chips on a module page; the choice survives a reload; a private window works without remembering.
- Remove Satchel data with *Kept in this browser* ticked clears the remembered filter and the count includes it.
- Whisper to GMs at the chat sidebar's normal width (about 300 px): heading on one or two lines as words, counts on their own line, badges small; in both themes.
- Import preview with Loot Ledger installed: its setting names show localized.
- With another module on core 0.3.1 (revision 2) loaded too: the Satchel's windows keep their look.

## 0.3.0

A new hub layout: a sidebar with pages instead of one long list of cards. Includes the 0.2.1 fixes below (0.2.1 was not released on its own).

### Changed

- **Sidebar and pages.** The hub window (about 1000 px wide, resizable) has a sidebar: *Overview*, a link per module with a status dot (worst result of its last health check; hollow when not active or not checked) and its warning count, and *Tools*: Health check, Settings transfer, Maintenance. Inactive modules are dimmed. Arrow keys, Home and End move between links. In a narrow window the sidebar becomes a strip above the page and the module table scrolls sideways in its own box.
- **Overview:** tiles for active modules, updates available and the last health check; a module table (version, update state, health badge, a link to its page); cards for Settings transfer, Debug logging for all and Maintenance.
- **Module page:** title, id, version and badges, **Open control panel**, an update banner only when there is an update (*newer than the latest release* and *Couldn't check* are one muted line), that module's own health report (run it alone from here), *In the Satchel* (export / import, its own Debug logging switch), Links, and *Module data* (its own actions such as Remove toolkit data…).
- **Health check, settings import and Remove Satchel data now open inside the hub** (Health check, Settings transfer and Maintenance pages) instead of separate windows. `api.health({ window: true })` still opens a health window of its own. `api.settings.import()` opens Settings transfer › Import and asks for a file; `api.cleanup.open()` opens Maintenance. Otherwise the API is unchanged.
- **Settings transfer** has Export and Import tabs. The import preview shows count badges, a block per module (file's version, ticked / refused badges, an issue list), red rows that can't be ticked for refused values, value chips, and a footer that stays in view with the tick count, how many need a reload and **Import N settings**. A file over 5 MB or one that can't be read is reported on the page, not only as a notification.
- **Status colours follow Foundry's theme** (its success / warning / error / info colours, darker on the light theme) with Font Awesome icons and a word for screen readers instead of the ✓ ⚠ ✗ characters. The whispered health card uses the same icons.
- Every click goes through the window's actions; icon-only buttons have labels; keyboard focus is visible.

### Untested in Foundry

- The whole new hub: every page in the dark and the light theme (status colours readable on parchment), resizing to a narrow window (sidebar strip, table scrolling), the sidebar keys.
- Dots and counts filling in while **Check everything** runs, after **Run check** on a module page, and after `api.health({ window: true })`.
- Settings transfer: Export; Import with a good file, a file over 5 MB, a non-JSON file, a file with refused values (red rows can't be ticked); ticking updates the badges and footer; **Import N settings** writes and asks for a reload when needed.
- Maintenance: wrong confirm word and nothing ticked show on the page; Remove works and the counts reset.
- The Settings menu, key binding, token-controls button and Settings sidebar button open the hub on Overview; with the hub open on another page they bring it to Overview.
- Feature switches off (Update check, Combined health check, Settings export / import, Debug logging for all): the matching page, column or card goes away, and a page that was open goes back to Overview.
- Whisper to GMs from the Health check page: the card looks right in chat.

## 0.2.1 (not released separately; part of 0.3.0)

### Fixed

- **"Still checking…" never showed for Wayfarer's Toolkit** and its first check ended as a 20 second timeout warning: the Satchel allowed 90 seconds, but the toolkit used its own 20 second limit per part. The Satchel now passes its time limit to each module's check (`health({ timeoutMs })`, a couple of seconds under its own limit), and the toolkit adapter hands it to `api.healthReport({ timeoutMs })` (toolkit 1.27.1 and later use it; older ones ignore it). Red Book's adapter does the same if Red Book offers `healthReport`. The old adapter fallbacks are unchanged.
- Checked live on 0.2.0: with a slow check the window does show *Still checking…* after 8 seconds and then the answer; only the toolkit's shorter limit was in the way.

### Untested in Foundry

- The combined health check right after a world load with toolkit 1.27.1 (expected: no Boss loot timeout, the toolkit answers in a few seconds).
- A registered module whose `health()` reads `timeoutMs`.

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
