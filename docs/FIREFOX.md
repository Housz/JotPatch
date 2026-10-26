# JotPatch on Firefox (MV3 event page)

Firefox shares the whole `src/` tree with Chromium. The differences are the
manifest, the background execution model, and two namespace quirks. Everything
else — anchoring, storage, rail, papers, conversation adapters — is the same code
that ships to Chromium.

Per [AGENTS.md](../AGENTS.md), **Chromium remains the shipping target**; the
Firefox package is a build path under test, not a release artifact.

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

- Full feature regression on Firefox has only been run on the earlier Stage-0
  branch; the current `dev` feature set (conversation rail, papers, Navigation
  Lab, virtualized notes) still needs a manual Firefox pass.
- Firefox needs 142+ for `gecko.data_collection_permissions` (AMO requirement);
  `CSS.highlights` text highlighting also needs a recent Firefox.
- `web-ext lint` reports **0 errors / 0 notices / 2 warnings**; both warnings are
  `UNSAFE_VAR_ASSIGNMENT` on `innerHTML` inside the shared paper UI bundle, and
  are present for Chromium too. Fixing them is a UI-layer refactor, out of scope
  for the packaging port.
- Firefox temporary add-ons cannot outlive the browser session, so persistence
  requires a signed build.

## Verification performed for this branch

```bash
npm run build                              # tsc + verify-build
node scripts/package.mjs --channel=dev --browser=firefox
node tests/firefox.test.mjs                # Firefox manifest/packaging contracts
node tests/contracts.test.mjs              # Chromium contracts still pass
npx web-ext lint --source-dir build/firefox --self-hosted
```

Expected: packaging writes `build/firefox/` plus
`artifacts/JotPatch-v0.1.17-dev.1-firefox.zip`; lint reports 0 errors.

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
