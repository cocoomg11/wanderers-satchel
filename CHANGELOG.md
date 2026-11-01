# Changelog

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
