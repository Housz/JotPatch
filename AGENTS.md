# JotPatch — instructions for coding agents

**Start here** for Codex, GPT, Claude or other repository-aware coding assistants. Read `README.md`, `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md`, and `CONTRIBUTING.md` before modifying code. `docs/AI_DEVELOPMENT.md` contains an example task prompt.

## Hard rules

1. Work from **`dev`**. New work belongs in short-lived `feature/*`, `fix/*`, `experiment/*` or `refactor/*` branches, PR into `dev`. Never merge into `main` or create a Release without human approval.
2. Preserve original Git authorship (especially Leezh76's `feature/firefox-port` work). Do not copy others' code and re-commit it as your own.
3. Protect existing data: `jotpatch:note:v1:*`, `jotpatch:preferences:v1`, `Note.schemaVersion:1`. No silent migrations or deletions.
4. Protect privacy: no remote chat APIs, automatic full-history scanning, token collection, or new host permissions by default. Long-history recovery is user-initiated, bounded and cancellable.
5. Do not change paper behavior, direct-click rail navigation, or default-off Navigation Lab without specific requirements and tests.
6. Add site-specific selectors only to `src/adapters/sites/`. Generic anchoring/storage/nav algorithms belong to `src/core/`. No `chrome.*`/`browser.*` in `src/core/`; use dependency injection.
7. `tsconfig.content.json` is an **ordered classic-script TypeScript namespace bundle**, not ESM. Site registrations must follow the registry and precede the collector; the app entry must remain last.
8. **Only Chromium ships from this branch today.** Firefox work is on an independent branch; do not present its build as ready or erase its original commits.
9. Do not invent test results. Run `npm run check`; for user-facing changes, run relevant Chromium tests and document any environment block. Always add/adjust tests with behavior changes.
10. Version source is `config/version.json`; `package.json` supports `-dev.N` but `manifest.version` is numeric. Consult `docs/VERSIONING.md`; no spontaneous public version tags.

## Done means

- Small diff, documented rationale, tests and expected behavior, no permission expansion.
- Updated developer/user docs for any changed public workflow.
- A PR into `dev` summarizing tests, known limits and browser/site impact.
