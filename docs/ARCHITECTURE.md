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
Chrome action click                  Extension Options (site grant)
       |                                         |
       v                                         v
MV3 service worker  --------- optional per-origin script registration
       |
       | chrome.scripting.executeScript / insertCSS
       v
Content script, isolated JS world
  - Page key normalization (`page-key.ts`)
  - Anchor capture + matching (`anchor.ts`)
  - UI layer + text highlights (`app.ts`)
  - Page-local note repository (`repository.ts`)
       |
       v
chrome.storage.local  (one key per note, jotpatch:note:v1:<uuid>)
```

Stage 0 compiles multiple TypeScript `namespace JP` files into one *classic* content script (`dist/content.js`) and a separate service worker (`dist/background.js`). There are no runtime dependencies and no remote services. Future work should separate the anchor engine from UI components and extend the repository as data volume grows.

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

Required: `activeTab`, `scripting`, `storage`. No mandatory broad host permission. Clicking the toolbar injects the content script in the active tab. A user can opt in to *per-origin* site access in the extension options page; after granting it, a registered content script loads when pages on that site open. Disabling a site permission unregisters its script.

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
