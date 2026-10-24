# JotPatch on Firefox (Stage 0)

This branch ports the Stage 0 Chrome extension to Firefox while keeping a single
TypeScript source tree. Chrome still builds from the repository root exactly as
before; Firefox builds an MV3 add-on into `dist/firefox/`.

## Build and load

```bash
npm install
npm run build:firefox        # tsc + assemble + verify dist/firefox
npx web-ext lint --source-dir dist/firefox --self-hosted   # optional: Mozilla's validator
```

Then in Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…**
3. Select `dist/firefox/manifest.json`.
4. Pin JotPatch from the extensions panel if you want it on the toolbar.

Temporary add-ons are removed when Firefox exits, and their local notes are
deleted with them. For a durable install, package and sign the add-on:

```bash
npx web-ext build --source-dir dist/firefox --artifacts-dir dist/artifacts
# upload dist/artifacts/*.zip to addons.mozilla.org as an unlisted (self-distributed) add-on
```

The manifest already carries the two keys AMO requires: a stable
`browser_specific_settings.gecko.id` (`jotpatch@housz.dev`) and
`data_collection_permissions: { required: ["none"] }`.

## What the port changed

| Concern | Chrome | Firefox | Where |
| --- | --- | --- | --- |
| Background context | MV3 service worker (`background.service_worker`) | MV3 event page (`background.scripts`) | `manifest.json` / `manifest.firefox.json` |
| Extension API handle | `chrome.*` (promise form in MV3) | `browser.*` (promise form) | `src/shared/browser.ts` (`JP.api`) |
| Per-site auto-restore | `chrome.scripting.registerContentScripts` | same API (`browser.scripting`) | `src/shared/sites.ts` |
| Options page key | `options_page` | `options_ui` with `open_in_tab` | manifests |
| Chrome-only keys | `minimum_chrome_version`, `short_name` | removed; replaced by `browser_specific_settings.gecko` | `manifest.firefox.json` |
| Options script | plain `options.js` | compiled `dist/options.js` from `src/options/main.ts` | `options.html` |
| Content-script instance guard | `window.__jotpatchStage0` | `globalThis.__jotpatchStage0` (Gecko content-script sandbox) | `src/content/entry.ts` |

The extension paths (`dist/content.js`, `styles/highlight.css`, `dist/options.js`)
are identical in both packages because `scripts/build-firefox.mjs` mirrors the
repository layout instead of flattening it. That is why no runtime file needs a
browser-specific path.

### Why the site-permission flow also changed

The Chrome build used to register a site script by sending `JP_REGISTER_SITE`
from the options page to the background and resolving the message asynchronously.
Firefox and Chromium disagree about how an async `runtime.onMessage` reply is
signalled (Promise return vs. `return true` + `sendResponse`), so the port removes
that message entirely:

- the options page requests the optional host permission inside the click
  gesture and then calls `syncSiteScripts()` itself;
- the background calls the same idempotent reconciliation on
  `runtime.onInstalled`, `runtime.onStartup`, `permissions.onAdded` and
  `permissions.onRemoved`.

`syncSiteScripts()` derives the desired state from `permissions.getAll()`, not
from a stored allowlist, so an extension update (which clears registered scripts
in Firefox) and a revoked permission both converge without extra bookkeeping.
`persistAcrossSessions: true` is supported since Firefox 105.

The only message left is `JP_OPEN_SITE_SETUP`, which is answered synchronously
in both browsers.

## Firefox-specific behaviour to expect

- **Version floor is Firefox 142.** `data_collection_permissions` (now required
  for AMO submissions) was introduced in Firefox 140, and Firefox for Android 142.
  `optional_host_permissions` alone would need 128.
- **Inline text highlight.** JotPatch uses the CSS Custom Highlight API
  (`CSS.highlights`). It is feature-detected, so it paints from Firefox 140
  upward; markers, the Dock, the list and cards work regardless.
- **Content-script globals.** In Gecko a content script's `globalThis` is a
  sandbox object that inherits from the page `window`. The instance guard uses
  `globalThis`, never a page-visible property, so a reinjection toggles the
  existing UI instead of mounting a second toolbar.
- **Clipboard.** `navigator.clipboard.writeText` is called inside the click
  handler; if Firefox denies it, the card shows the manual-copy hint.
- **`about:` pages and other privileged documents** cannot host content scripts
  in either browser; clicking the toolbar there stays a no-op (logged warning).
- **Highlight CSS.** `::highlight()` rules are injected through
  `scripting.insertCSS`/registered-script CSS, which Firefox supports, but the
  rule only matches once the Custom Highlight API exists.

## Verification performed for this port

- `npm run build:firefox` — TypeScript build plus `scripts/verify-firefox-build.mjs`
  (manifest shape, Firefox-only keys, referenced files, no Chrome-only globals).
- `npx web-ext lint --source-dir dist/firefox --self-hosted` — 0 errors, 0 notices,
  0 warnings.
- `npx web-ext run --source-dir dist/firefox --firefox <path>` — Firefox installs
  the temporary add-on without manifest or background errors.
- `node tests/contracts.test.mjs` and `node tests/firefox-contracts.test.mjs` —
  Chrome and Firefox packaging contracts.
- `JP_E2E_BROWSER=firefox python tests/browser_e2e.py` — the Stage 0 DOM suite
  (selection, duplicate-quote disambiguation, relocation, scroll/Dock, reload,
  missing anchor, URL normalisation) on Gecko with the extension APIs shimmed.

What still needs a human: the permission prompt and the real toolbar click. Use
the checklist below.

## Guided tour with screenshots

`tools/firefox_tour.py` opens a **visible** Firefox window, injects the same
content script into the demo page, and hands control over at each step: you
select text, attach notes, scroll and click the Dock; press Enter in the terminal
and it captures a screenshot.

```bash
python tools/firefox_tour.py              # step-by-step hand-off (default)
python tools/firefox_tour.py --auto       # no pauses, full screenshot set
python tools/firefox_tour.py --out DIR    # choose the screenshot directory
```

Screenshots land in `preview/` (git-ignored) by default. Extension APIs are
shimmed with an in-memory store because the permission prompt cannot be scripted;
the UI code is byte-for-byte the shipped content script. To exercise the real
add-on and its permission prompt, use `about:debugging` plus the checklist above.

## Manual Firefox smoke checklist

1. Load `dist/firefox/manifest.json`; the add-on appears without errors in
   `about:debugging`.
2. `python -m http.server 8000`, open `http://localhost:8000/fixtures/long-page.html`.
3. Click the JotPatch toolbar icon → the toolbar and Dock mount; clicking again
   toggles them.
4. Select a repeated phrase, click **📌 贴便签**, type a note; the marker follows
   the text while scrolling.
5. Open **自动恢复设置**, allow `http://localhost/*`, refresh the page: the note and
   Dock come back without clicking the toolbar.
6. In `about:addons` → JotPatch → **Permissions**, remove the site permission;
   reload the page and confirm JotPatch no longer auto-injects.
7. Restart Firefox and confirm a temporary add-on is gone (and document that a
   signed install is required for persistence).
