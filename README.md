# JotPatch 📌

*Pin your thoughts right where they happen.*

JotPatch is a lightweight, local-first Chrome extension for leaving notes beside selected text on webpages. **The page/text Pin is the default**; a narrow Dock gets you back to the original passage in long documents and AI conversations.

## Stage 0: text-anchor proof of concept

✅ Select webpage text → **📌 贴便签** → type a short note.  
✅ Markers follow their source text as the page scrolls.  
✅ Dock dots jump back to the source; the list shows all page notes.  
✅ Notes persist in local Chrome extension storage and can be restored after a reload.  
✅ Duplicate quotes are disambiguated by neighboring context; missing source text is shown as unresolved.  
✅ Optional **per-site** permission for automatic restore (no blanket all-site permission at install).

This is **not yet the finished sticky-note UI**. The selected **Follow mode B** (moving a floating note between webpages) belongs to Stage 2. The independent popout window is deferred to Stage 3.

## Install and try

1. Download/clone the `stage-0/anchoring-prototype` branch.
2. Install Node.js 20+ and run `npm install` followed by `npm run build` in the repository directory.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the **repository root** (not `dist`).
4. Open a regular `https://` webpage or the local demo page served over HTTP. Click the JotPatch toolbar icon once to activate on the current tab.
5. Select some normal webpage text. Click the nearby **📌 贴便签** button; enter a thought in the small editor.
6. Scroll: the colored marker follows the passage and disappears when it scrolls off screen. The right-side Dock remains; click a dot to return to the text.
7. For automatic restore after navigating away or restarting Chrome, choose **自动恢复设置** in JotPatch, then grant access **only to the site you want**. Refresh that page. Without a site grant, use the toolbar icon again to re-open your saved notes manually.

**Demo page:** after building, serve the repository root via `python -m http.server 8000`, then open `http://localhost:8000/fixtures/long-page.html` and click JotPatch. The demo contains duplicate phrases and enough content to test the Dock.

## Development and tests

- `npm run build`: compile classic MV3 content/background scripts with TypeScript; verify emitted assets.
- `npm run check`: build and run dependency-free Node contract tests.
- `npm run test:e2e`: run DOM integration tests in Chromium (requires Python Playwright and `/usr/bin/chromium`; tests use a storage shim, and do not replace a manual extension permission smoke test).

## Architecture and constraints

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Persistent notes are stored in `chrome.storage.local`, one key per note. No telemetry, login, server, or data upload. Uninstalling the extension may delete this local data; backup/export and deletion undo are planned for a later stage.

Stage 0 limitations: only standard DOM text selections; some SPA/virtualized content can be temporarily unresolvable; edit conflicts between tabs are not solved. This branch is a feasibility prototype rather than a production release.
