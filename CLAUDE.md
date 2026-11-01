# CLAUDE.md: Wanderer's Satchel

Foundry VTT module (v13/v14, any game system): a GM hub for the user's other modules. A card per module (version, active, update check, open its panel / health / docs / issues), a combined health check, one-file settings export/import for all, one debug-logging switch, a registration API. Every module stays standalone: the Satchel never duplicates their settings or windows. Public repo, MIT.

## File map (`scripts/`)
- `main.mjs` entry: feature settings, the settings menu, key binding (none by default), scene control + Settings sidebar buttons, the API (`game.modules.get("wanderers-satchel").api`, set in `init`), hook `wanderers-satchel.ready` in `ready`.
- `const.mjs` id, title, hook names, `esc`/`plural`. `features.mjs` feature registry (`FEATURES`, `on`, `need`).
- `registry-model.mjs` (pure) registration reading, adapter/registration merge, card model, doc links, debug plan. `registry.mjs` live registry, `openPanel` fallbacks (entry → first settings menu → SettingsConfig), window refresh.
- `adapters.mjs` built-in adapters (toolkit, Ringmaker, Loot Ledger, Red Book provisional). `adapters-model.mjs` (pure) skip lists, Ringmaker status → health lines, dependency lines.
- `version-model.mjs` (pure) version compare, update source (GitHub manifest → REST latest release, since release asset redirects have no CORS), cache (session storage), timeout, `checkUpdate`.
- `health-model.mjs` (pure) report normaliser, grouping + summary. `health.mjs` runner (per-module timeout) + window.
- `settings-model.mjs` (pure) bundle + per-module file format and validation. `settings-io.mjs` export/import + preview window.
- `hub.mjs` the hub window, update checks, debug-all. `cleanup.mjs` Remove Satchel data (dry run, type REMOVE).
- `styles/satchel.css`. Tests in `tests/` (no Foundry globals needed; the adapters test sets a fake `game`).

## Key patterns
- **Adapters read code, never guess.** Use only what a module exposes (its `api`, its settings menu, its settings). Each adapter function looks the api up at call time. A registration for the same id replaces the adapter entirely (`mergeEntries`). Adapters show only for installed modules; unknown modules only if they register.
- **Feature registry:** one world setting per tool (`feature-<id>`, requiresReload). Off = no buttons/hooks; API getters return undefined.
- **GM only:** every window and API entry that does something checks `game.user.isGM`. The Satchel writes no documents automatically, so there is no active-GM logic; writes (imports, debug switch, cleanup) are GM clicks.
- **Never throws into the hub:** health checks are wrapped and time-limited; update checks return `status: "error"` instead of throwing; settings reads report per module.
- **Settings keys stable** (never rename). Our only settings are the feature switches. Record-type settings of other modules go in `SKIP` (adapters-model.mjs) or the registration's `skipSettings`.
- **Flags/storage:** only `flags.wanderers-satchel.*` (health chat cards) and session-storage keys `wanderers-satchel.update.*`. Cleanup (`cleanup.mjs` `plan`/`remove`/`CATEGORIES`) must cover anything new.
- Windows are ApplicationV2 with HTML built in code, class `ws-window` (no backdrop blur).
- Pure files have no Foundry calls at import time and are tested in Node.

## Suggested small changes in the other modules (not done here)
- Toolkit: `api.healthReport()` returning `run(api)` sections without posting the card (adapter already prefers it).
- Ringmaker / Loot Ledger: a `debugLog` setting, or `api.register` call with `openPanel`.
- Red Book: confirm `api.panel(tab)`, `api.health()` / `healthReport()`, `api.settingsIO.{read,apply}`, `api.cleanup.open()`, setting `debugLog` (the provisional adapter expects these names), or have Red Book register itself.

## House practices
- **Release tags** are `vMAJOR.MINOR.PATCH` only (`v0.1.0`). The Release workflow fails early on anything else and sets version/URLs from the tag.
- **Compatibility:** `module.json` `compatibility` minimum 13, verified = newest Foundry checked live (14.369), no maximum. No `relationships`: system-agnostic, and the modules it knows are optional.
- **Docs:** README *Public API and hooks* lists every `api.*` entry and the hook, each stable or experimental. Update it with any API change.
- **End each release with a live checklist** in the changelog: what was not run in Foundry.

## Tests
- `npm test` = `node --test tests/*.test.mjs`; `npm run check` syntax-checks scripts and tests. CI runs both (`test.yml`); the Release workflow runs them again.
- Tested: version compare, update source, update check (cache, failures, timeout), registration reading, merge, card model, doc links, debug plan, health normalising and grouping, settings bundle and per-module validation, adapters against a fake `game`.
- Not testable in Node: windows, sidebar/scene buttons, key binding, real fetches (CORS), settings writes, chat cards.

## Release process
1. Bump `version` in `module.json` and the `download` URL (`.../releases/download/vX.Y.Z/module.zip`); manifest URL stays `.../releases/latest/download/module.json`.
2. Add a `CHANGELOG.md` section with an "Untested in Foundry" checklist.
3. Commit and push to main. **Agents never tag or publish.** The user publishes the GitHub release; the Release workflow runs tests, sets version/URLs and uploads `module.json` + `module.zip` (`module.json scripts styles README.md CHANGELOG.md LICENSE`). A new top-level folder must be added to the zip step.

## Rules
- Public repo: no campaign names, no game-publisher wording in user-facing text, no private details (IPs, domains, local paths).
- Every feature toggleable; strings plain English in code (no lang file).
- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers given by the session.
- Another agent may be committing to main: `git fetch origin main` and rebase before pushing.
