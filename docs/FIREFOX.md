# JotPatch on Firefox (MV3 event page)

Firefox shares the whole `src/` tree with Chromium. The differences are the
manifest, the background execution model, and two namespace quirks. Everything
else — anchoring, storage, rail, papers, conversation adapters — is the same code
that ships to Chromium.

This port now shares the entire runtime with Chromium. For v0.1.17, the
Firefox ZIP is a **temporary developer/test installation package**. A release
Firefox XPI must first be signed by Mozilla/AMO before it can be installed
normally. Presence of a ZIP on GitHub Releases is not equivalent to AMO signing.

## Build, package, load

```bash
npm install
npm run build            # dist/content.js + dist/background.js
npm run package:firefox  # build/firefox/ + artifacts/JotPatch-*-firefox.zip
```

Then in Firefox:

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Pick `build/firefox/manifest.json` (or the ZIP in `artifacts/`)
4. Pin JotPatch from the extensions panel so the toolbar icon is clickable

Temporary add-ons disappear when Firefox exits, and their local notes go with
them. For a durable install, submit the ZIP to addons.mozilla.org as an
unlisted (self-distributed) add-on and install the signed `.xpi`:
`npx web-ext build --source-dir build/firefox` produces an equivalent archive.

## What the Firefox build changes

| Concern | Chromium | Firefox | Where |
| --- | --- | --- | --- |
| Background | `background.service_worker` | `background.scripts` (event page) | `scripts/firefox-manifest.mjs` |
| Options page key | `options_page` | `options_ui` + `open_in_tab` | same |
| Chrome-only keys | `short_name`, `minimum_chrome_version`, `version_name` | dropped | same |
| Add-on metadata | — | `browser_specific_settings.gecko` | same |
| Runtime handle | `chrome.*` | `browser.*` (promise-based) | `src/adapters/browsers/webextension.ts` |
| Async `onMessage` reply | `sendResponse` + `return true` | listener returns a Promise | `src/background/index.ts` |
| `contextMenus.removeAll` | callback | promise only | `src/background/index.ts` |
| Options page | — | resolves `browser`/`chrome` at load | `options.js` |

`src/background/index.ts` now reaches the runtime only through
`JP.extensionApi()`, so it contains no direct `chrome.*`/`browser.*` calls; the
`tests/firefox.test.mjs` contract enforces that on the built bundle.

`scripts/firefox-manifest.mjs` keeps an explicit allowlist of manifest keys. A
new Chromium-only key added to `manifest.json` fails the Firefox package with
`Unhandled Chromium manifest keys …` instead of silently disappearing from the
Gecko build.

## Known gaps before Firefox can be called release-ready

- Firefox real-DOM Playwright regression is run for note creation, chat navigation,
  virtualization, colour settings and historical navigation on synthetic fixture
  pages. These do not replace a manual check in an authenticated ChatGPT/Gemini.
- Actual installed Firefox MV3 smoke in GitHub CI verifies temporary extension
  installation, options page, real local preference storage and event-page message
  round-trip. It does not automate every browser permission prompt or site grant.
- Firefox needs 142+ for `gecko.data_collection_permissions` (AMO requirement);
  `CSS.highlights` text highlighting also needs a recent Firefox.
- `web-ext lint` is an automated CI gate; any warnings must be recorded in the
  CI log. DOM implementation can surface warnings for HTML assignment even
  when the editor content is escaped/sanitized. Do not describe warnings as
  resolved unless the validator actually reports zero.
- Firefox temporary add-ons cannot outlive the browser session, so persistence
  requires a signed build.

## Regression and installation testing

```bash
npm run build                              # tsc + verify-build
node scripts/package.mjs --channel=dev --browser=firefox
node tests/firefox.test.mjs                # Firefox manifest/packaging contracts
node tests/contracts.test.mjs              # Chromium contracts still pass
npx web-ext lint --source-dir build/firefox --self-hosted
JP_E2E_BROWSER=firefox python tests/browser_e2e.py
JP_E2E_BROWSER=firefox python tests/conversation_e2e.py
JP_E2E_BROWSER=firefox python tests/navigation_recovery_e2e.py
FIREFOX_BIN=/path/to/firefox python tests/firefox_addon_smoke.py  # Selenium, real temporary add-on
```

Development packaging writes `build/firefox/` and the `-dev.N-firefox.zip`
archive. Release packaging writes `JotPatch-v0.1.17-firefox.zip` for temporary
debugging, and optionally `JotPatch-v0.1.17-firefox-signed.xpi` when AMO signing
credentials are available. A signed XPI is not produced by renaming a ZIP.

## Manual Firefox smoke checklist

1. Load `build/firefox/manifest.json`; the add-on appears without errors.
2. Open any `https://` page, click the toolbar icon: the launcher mounts; a
   second click toggles it.
3. Select text → **📌** → type a note; the paper follows the passage on scroll.
4. Right-click a selection → **📌 添加 JotPatch 便签** creates a note
   (contextMenus path).
5. Options → allow one site → refresh: notes restore without clicking the icon.
6. `about:addons` → JotPatch → Permissions → remove the site grant → refresh:
   auto-injection stops.
7. Restart Firefox: the temporary add-on and its notes are gone (expected).
