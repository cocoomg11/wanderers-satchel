# CLAUDE.md: Wanderer's Satchel

Foundry VTT module (v13/v14, any game system): a GM hub for the user's other modules. A card per module (version, active, update check, open its panel / health / docs / issues), a combined health check, one-file settings export/import for all, one debug-logging switch, a registration API. Every module stays standalone: the Satchel never duplicates their settings or windows. Public repo, MIT.

## File map (`scripts/`)
- `main.mjs` entry: feature settings, the settings menu, key binding (none by default), scene control + Settings sidebar buttons, the API (`game.modules.get("wanderers-satchel").api`, set in `init`), hook `wanderers-satchel.ready` in `ready`.
- `core.mjs` binds the vendored wanderers-core 0.2.0 (`vendor/wanderers-core/`, pin `wanderers-core.lock.json`): `F` (createFeatures), `S` (createSettings: `debugLog`), `log`. `features-model.mjs` (pure) the feature list and settings rows. `features.mjs` thin wrappers (`FEATURES`, `on`, `need`, `registerSettings`).
- `const.mjs` id, title, hook names; re-exports core's `esc`/`plural`/`plain`.
- `registry-model.mjs` (pure) registration reading, adapter/registration merge, card model, doc links, debug plan. `registry.mjs` live registry, `openPanel` fallbacks (entry → first settings menu → SettingsConfig), window refresh.
- `adapters.mjs` built-in adapters (toolkit, Ringmaker, Loot Ledger, Red Book). `apiOf` returns null on non-GM clients. `adapters-model.mjs` (pure) skip lists, import validators (toolkit `flightNetwork`), Ringmaker status → lines, Loot Ledger state → sections, dependency lines.
- `version-model.mjs` (pure) version compare (from core), update source (GitHub manifest → REST latest release, since release asset redirects have no CORS), cache (session storage), timeout, `checkUpdate`.
- `health-model.mjs` (pure) report normaliser, time limits (`healthTimeout`: 90 s first run, then max(30 s, 3 × last), cap 5 min), `runChecks` (all at once, independent; states pending/slow/timeout/ran/failed; late answers replace the timeout), grouping + summary. `health.mjs` live runner + window that redraws as results come in.
- `settings-model.mjs` (pure) bundle around core's settings file (`buildExport`/`readImport` with validators), `plainJson`, `validatorsFor`, `recheck` (write-time check), size limits. `settings-io.mjs` export/import + preview window; only hub entries and the Satchel are read/written.
- `hub.mjs` the hub window, update checks, debug-all. `cleanup.mjs` Remove Satchel data (dry run, type REMOVE).
- `styles/satchel.css`. Tests in `tests/` (no Foundry globals needed; the adapters test sets a fake `game`).

## Key patterns
- **Adapters read code, never guess.** Use only what a module exposes (its `api`, its settings menu, its settings). Each adapter function looks the api up at call time. A registration for the same id replaces the adapter entirely (`mergeEntries`). Adapters show only for installed modules; unknown modules only if they register.
- **Feature registry:** core's `createFeatures` (one world setting per tool, `feature-<id>`, requiresReload, `config: true`). Off = no buttons/hooks; API getters return undefined.
- **GM only:** every window, click handler and API entry that does something checks `game.user.isGM`; adapters never call another module's API on a player's client (Ringmaker, Loot Ledger, Red Book APIs are GM-only). The Satchel writes no documents automatically and uses no socket, so there is no leader (core `createLeader` not used); writes (imports, debug switch, cleanup) are GM clicks.
- **Health time limits** live in `health-model.mjs`; never go back to one fixed short limit (the toolkit's first run after load is slow).
- **Never throws into the hub:** health checks are wrapped and time-limited; update checks return `status: "error"` instead of throwing; settings reads report per module.
- **Settings keys stable** (never rename). Our settings: the feature switches and `debugLog`. Record-type settings of other modules go in `SKIP` (adapters-model.mjs) or the registration's `skipSettings`.
- **Flags/storage:** only `flags.wanderers-satchel.*` (health chat cards) and session-storage keys `wanderers-satchel.update.*`. Cleanup (`cleanup.mjs` `plan`/`remove`/`CATEGORIES`) must cover anything new.
- Windows are ApplicationV2 with HTML built in code, class `ws-window` (no backdrop blur).
- Pure files have no Foundry calls at import time and are tested in Node.

## What the adapters assume (check when those modules change)
- Toolkit: `api.panel(tab)`, `api.healthReport()` (1.27+, core report, no card; falls back to `api.health()`), `api.cleanup.open()`, setting `debugLog`. `api.settingsIO` only on old versions (1.27 drops it). No Session Start / Who's online use.
- Ringmaker 1.4.2: GM-only `api.status()`, `api.removePlan()`; menu "Ringmaker tools"; no `debugLog` yet (row says so).
- Loot Ledger 0.3: no API calls; reads `world.loot-ledger-items` / `-converted-items` / `-tables`, journal flag `flags.loot-ledger.buildReport`, the required module's Item packs, settings `convertOnBuild` `reviewBoard` `qualityColours` `randomSuffixes`.
- Red Book 0.3 (api set in its `ready`): `api.panel(tab)`, `api.health()` (array of lines), `api.cleanup.open()`, setting `debugLog`, records `openSession` `boardPins`. A Red Book `api.register` call replaces the adapter.
- Suggested in those modules (not done here): `debugLog` in Ringmaker / Loot Ledger; Red Book calling `register()` with `healthReport`.

## House practices
- **Release tags** are `vMAJOR.MINOR.PATCH` only (`v0.1.0`). The Release workflow fails early on anything else and sets version/URLs from the tag.
- **Compatibility:** `module.json` `compatibility` minimum 13, verified = newest Foundry checked live (14.369), no maximum. No `relationships`: system-agnostic, and the modules it knows are optional.
- **Docs:** README *Public API and hooks* lists every `api.*` entry and the hook, each stable or experimental. Update it with any API change.
- **End each release with a live checklist** in the changelog: what was not run in Foundry.

## Tests
- `npm test` = `node --test tests/*.test.mjs`; `npm run check` syntax; `npm run lint` (core's ESLint config); `npm run types` (tsc on JSDoc). CI = core's reusable `module-checks.yml@v0.2.0` (pin check, then all four); the Release workflow verifies the pin and runs check + test again.
- Updating core: `node vendor/wanderers-core/vendor.mjs update X.Y.Z` (behind the agent proxy: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`), bump the workflow tag, never hand-edit `vendor/`.
- Tested: version compare, update source, update check (cache, failures, timeout), registration reading, merge, card model, doc links, debug plan, health normalising, time limits, parallel runner (slow/timeout/late/throw), grouping, settings bundle, per-module validation and validators, plain-data check, write-time recheck, adapters against a fake `game` (including no API calls for players).
- Not testable in Node: windows, sidebar/scene buttons, key binding, real fetches (CORS), settings writes, chat cards.

## Release process
1. Bump `version` in `module.json` and the `download` URL (`.../releases/download/vX.Y.Z/module.zip`); manifest URL stays `.../releases/latest/download/module.json`.
2. Add a `CHANGELOG.md` section with an "Untested in Foundry" checklist.
3. Commit and push to main. **Agents never tag or publish.** The user publishes the GitHub release; the Release workflow runs tests, sets version/URLs and uploads `module.json` + `module.zip` (`module.json scripts styles vendor README.md CHANGELOG.md LICENSE`, minus `vendor/wanderers-core/config/` and `vendor.mjs`). A new top-level folder must be added to the zip step.

## Rules
- Public repo: no campaign names, no game-publisher wording in user-facing text, no private details (IPs, domains, local paths).
- Every feature toggleable; strings plain English in code (no lang file).
- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers given by the session.
- Another agent may be committing to main: `git fetch origin main` and rebase before pushing.
