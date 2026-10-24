# JotPatch 📌

*Pin your thoughts right where they happen.*

JotPatch is a lightweight, local-first browser extension for leaving notes beside selected text on webpages. It ships for **Chrome (Manifest V3)** and **Firefox (Manifest V3)** from one TypeScript source tree. **The page/text Pin is the default**; a narrow Dock gets you back to the original passage in long documents and AI conversations.

## Stage 0: text-anchor proof of concept

✅ Select webpage text → **📌 贴便签** → type a short note.  
✅ Markers follow their source text as the page scrolls.  
✅ Dock dots jump back to the source; the list shows all page notes.  
✅ Notes persist in local browser extension storage and can be restored after a reload.  
✅ Duplicate quotes are disambiguated by neighboring context; missing source text is shown as unresolved.  
✅ Optional **per-site** permission for automatic restore (no blanket all-site permission at install).

This is **not yet the finished sticky-note UI**. The selected **Follow mode B** (moving a floating note between webpages) belongs to Stage 2. The independent popout window is deferred to Stage 3.

## Install and try

Install Node.js 20+, then run `npm install` and `npm run build` in the repository directory.

### Chrome

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the **repository root** (not `dist`).
2. Open a regular `https://` webpage or the local demo page served over HTTP. Click the JotPatch toolbar icon once to activate on the current tab.
3. Select some normal webpage text. Click the nearby **📌 贴便签** button; enter a thought in the small editor.
4. Scroll: the colored marker follows the passage and disappears when it scrolls off screen. The right-side Dock remains; click a dot to return to the text.
5. For automatic restore after navigating away or restarting Chrome, choose **自动恢复设置** in JotPatch, then grant access **only to the site you want**. Refresh that page. Without a site grant, use the toolbar icon again to re-open your saved notes manually.

### Firefox

1. Run `npm run build:firefox` (this also runs `npm run build` and assembles `dist/firefox/`).
2. Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, and select `dist/firefox/manifest.json`.
3. Click the JotPatch icon in the toolbar (it may live in the overflow **»** panel first), then follow the same steps 2–5 as for Chrome. The options page opens in a normal tab and asks for the same per-site permission.
4. To make the add-on survive a browser restart, package and sign it: `npx web-ext build --source-dir dist/firefox` then submit the artifact on addons.mozilla.org as a self-distributed (unlisted) add-on. Temporary add-ons are removed when Firefox exits, and their local notes go with them.

See [docs/FIREFOX.md](docs/FIREFOX.md) for the port details, API mapping, and the Firefox-specific caveats.

**Demo page:** after building, serve the repository root via `python -m http.server 8000`, then open `http://localhost:8000/fixtures/long-page.html` and click JotPatch. The demo contains duplicate phrases and enough content to test the Dock.

## Development and tests

- `npm run build`: compile classic MV3 content, background and options scripts with TypeScript; verify emitted assets.
- `npm run build:firefox`: build, then assemble and verify the loadable Firefox package in `dist/firefox/`.
- `npm run check`: build both packages and run the dependency-free Node contract tests.
- `npx web-ext lint --source-dir dist/firefox --self-hosted`: run Mozilla's own add-on validator over the Firefox package.
- `npm run tour` (or `python tools/firefox_tour.py`): open a visible Firefox window with the content script injected, walk through the UI step by step with hand-offs, and save screenshots to `preview/`; add `-- --auto` to skip the pauses.
- `npm run test:e2e`: run DOM integration tests in Chromium (requires Python Playwright and `/usr/bin/chromium`; set `JP_E2E_BROWSER=firefox` to run the same scenarios on Gecko with Playwright's bundled Firefox). Tests use a storage shim and do not replace a manual extension permission smoke test.

## Architecture and constraints

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Persistent notes are stored in extension local storage, one key per note. No telemetry, login, server, or data upload. Uninstalling the extension may delete this local data; backup/export and deletion undo are planned for a later stage.

Stage 0 limitations: only standard DOM text selections; some SPA/virtualized content can be temporarily unresolvable; edit conflicts between tabs are not solved. Firefox temporary add-ons do not outlive the browser session. This branch is a feasibility prototype rather than a production release.
