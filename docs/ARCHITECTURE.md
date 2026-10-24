# JotPatch architecture (Stage 0)

## Product constraints

JotPatch is a small, local-first note layer for reading and working on web pages. **Page Pin is the default and defining behavior**: users select text, attach a short note, and find it again from a narrow Dock. The note belongs to its source URL and text anchor, not an ephemeral Chrome tab ID.

The product roadmap has four stages:

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Text-quote anchors, scroll-following markers, Dock, reload/SPA recovery | This prototype |
| 1 | Polished sticky cards, drag/resize, multi-note editing, robust lifecycle | Planned |
| 2 | **Follow mode B**: migrate floating notes among eligible browser pages | Planned; selected approach |
| 3 | Browser-independent popout window | Deferred |

Stage 0 deliberately omits arbitrary pixel anchoring, image anchors, full Markdown, browser-wide Follow and a standalone window. The UI is intentionally a proof of concept, not a full sticky-note app.

## Current MV3 architecture

```text
Toolbar action click                 Extension options (per-site grant)
        |                                         |
        v                                         v
Background: Chrome MV3 service worker / Firefox MV3 event page
        |   ^
        |   +-- permissions.onAdded / onRemoved --> syncSiteScripts()
        |       re-registers or removes optional per-origin content scripts
        |
        | scripting.executeScript / insertCSS
        v
Content script, isolated JS world
  - Page key normalization (`page-key.ts`)
  - Anchor capture + matching (`anchor.ts`)
  - UI layer + text highlights (`app.ts`)
  - Page-local note repository (`repository.ts`)
        |
        v
storage.local  (one key per note, jotpatch:note:v1:<uuid>)
```

Stage 0 compiles multiple TypeScript `namespace JP` files into one *classic* content script (`dist/content.js`), one background bundle (`dist/background.js`) and one options bundle (`dist/options.js`). There are no runtime dependencies and no remote services. `src/shared/browser.ts` resolves the promise-based `browser` namespace (Firefox) or `chrome` (Chromium) once, and `src/shared/sites.ts` owns match patterns, registration ids and reconciliation, so the injected content code is identical in both browsers. Future work should separate the anchor engine from UI components and extend the repository as data volume grows.

### Anchor data model and resolution

- `pageKey`: URL origin + path + meaningful query parameters; strips known tracking parameters, ignores ordinary fragments, retains hash-router paths.
- `TextAnchor`: exact quote, 48 characters of preceding and following text, and offsets into a flattened index of eligible DOM text nodes.
- `buildTextIndex`: excludes script/style/forms/editable content and the extension host; caps work at 2 million characters.
- `resolveAnchor`: find exact quote occurrences; score surrounding context and distance from recorded position; reject weak or ambiguous matches; construct a fresh DOM `Range`.
- `Positioning`: measure the live DOM Range and move a viewport-fixed marker using scroll/resize events; hide the marker when the Range leaves the viewport.
- `Navigation Dock`: position dots by resolved document text order; show unresolved anchors in gray. Click to scroll to a DOM node (including inside scroll containers) then display its card.
- `MutationObserver`: debounce re-indexing of dynamically changed DOM; SPA route detection loads notes from the new URL. The current stage also checks URL changes periodically, avoiding instrumentation of site-owned History methods.

Quotes are **not** matched fuzzily to unrelated content. When confidence is insufficient, a note remains stored and accessible in the Dock, but is marked unresolved rather than silently placed on the wrong paragraph.

### Privacy and permissions

Required: `activeTab`, `scripting`, `storage`. No mandatory broad host permission. Clicking the toolbar injects the content script in the active tab. A user can opt in to *per-origin* site access in the extension options page; after granting it, a registered content script loads when pages on that site open. Revoking a site permission unregisters its script.

The same three permissions and the same optional `http://*/*` / `https://*/*` host patterns work in Chrome and Firefox. `optional_host_permissions` requires Firefox 128+, and the AMO-mandated `data_collection_permissions` declaration requires Firefox 142+, so the Firefox manifest pins that floor through `browser_specific_settings.gecko.strict_min_version`.

The options page requests the permission inside the click gesture, then reconciles registrations itself. The background re-runs the same idempotent reconciliation on `runtime.onInstalled`, `runtime.onStartup`, `permissions.onAdded` and `permissions.onRemoved`, which keeps registrations correct after an extension update (updates clear registered scripts) and after a revocation.

### Cross-browser packaging

Two manifests describe one code base:

| File | Target | Background | Notes |
| --- | --- | --- | --- |
| `manifest.json` | Chrome / Chromium MV3 | `background.service_worker` | Loaded from the repository root |
| `manifest.firefox.json` | Firefox MV3 | `background.scripts` (event page) | Assembled into `dist/firefox/` by `scripts/build-firefox.mjs` |

The Firefox package mirrors the repository layout, so `dist/content.js`, `styles/highlight.css` and `dist/options.js` keep identical paths in both builds and no source file needs a browser-specific path. `scripts/verify-firefox-build.mjs` fails the build if Chromium-only keys (`background.service_worker`, `minimum_chrome_version`, `short_name`, `options_page`) leak into the Firefox package, if a referenced file is missing, or if a bundle calls a Chrome-only global directly.

Firefox-specific adaptations:

- The background runs as an event page instead of a service worker; it holds no in-memory state, so being unloaded between events is harmless.
- `scripting.registerContentScripts` with `persistAcrossSessions: true` exists in Firefox 105+, so per-site restore uses the same code path as Chrome. Registrations are still reconciled from `permissions.getAll()` rather than from stored bookkeeping, so no stale allowlist can drift.
- The content-script instance is stored on `globalThis`, which is Firefox's content-script sandbox global, instead of on the page `window` that Gecko exposes through an Xray wrapper.
- The CSS Custom Highlight API (`CSS.highlights`) is feature-detected; Firefox 140+ paints the inline highlight. Older Firefox still gets markers, the Dock and the card.
- `options_ui` with `open_in_tab` replaces `options_page`, which is a Chromium-only manifest key under MV3.

Notes are saved to `chrome.storage.local`. No account, analytics, network requests, cloud sync, or AI calls. Content scripts run in Chrome's isolated world, but their DOM overlays are not a security boundary; the extension must never execute arbitrary selected HTML.

### Data lifecycle

- Note creation writes to storage before drawing a persisted Dock entry.
- Text editing writes on a 350 ms debounce, flushes on blur and when switching cards, and serializes asynchronous writes for each note.
- Multiple notes use separate storage keys to reduce lost updates on different notes.
- Deletion in Stage 0 is immediate after confirmation (undo belongs to Stage 1).
- Stage 0 does **not** guarantee conflict-free editing of the same note in two tabs. Stage 1 should implement revisioned updates and `chrome.storage.onChanged` instance coordination.
- Position is resolved afresh from the source range, not restored from a screen pixel coordinate.

### Known limitations and Stage 1 hardening

- The selection index is linear and whitespace-sensitive, and contains a conservative 2M-character cutoff. Unusual rich editors, virtualized documents and inaccessible cross-origin iframes may not be anchorable.
- The text index can include hidden nodes in some complex sites; future matching should improve visible-content and structural-block heuristics.
- `TextAnchor` currently captures text from DOM ranges whose end/start are text nodes or ordinary element boundaries. It is not a general DOM/XPath anchor implementation.
- Re-indexing an entire long document after frequent mutations can cost CPU. For AI-streaming sites use incremental indexing, observer gating, and message-block caches in a later stage.
- The Stage 0 toolbar is a debug affordance and may obscure page elements. Stage 1 will minimize it in favor of a compact, contextual control.
- Browser `chrome://` pages and some special documents cannot host content scripts.
- The automatic site-restore permission prompt should be tested with the actual browser UI after installation.

## Acceptance checkpoints

1. Select a repeated phrase in the *second* context and attach a note; no mistaken match to the first occurrence.
2. Insert text before the anchor and verify it still resolves to the intended occurrence.
3. Scroll far away: in-page marker disappears while Dock remains; click Dock to jump back.
4. Reload the page (after opting in to site restoration), and recover the note from local storage.
5. Remove the original paragraph: note survives as unresolved; no false relocation.
6. Compare URLs with query tracking parameters and distinct chat/conversation paths.
7. Revoke optional site access and ensure automatic injection stops without deleting notes.
