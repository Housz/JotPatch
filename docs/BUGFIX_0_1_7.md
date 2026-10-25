# 0.1.7 — Virtualized ChatGPT history must never spawn orphaned paper notes

## Report and diagnosis

A user reported that scrolling upward through long ChatGPT conversations sometimes caused many old JotPatch papers to appear simultaneously. The attached console log primarily contained `net::ERR_BLOCKED_BY_CLIENT`, Statsig transport failures, and a page CSP warning, **not a JotPatch stack trace**. Those messages do not establish a causal connection to this bug.

The **source code contains a deterministic logic error**, reproduced in a synthetic Chromium regression. In `positionCard()`, the old visibility test was effectively:

```ts
if (note.anchor && match && offscreen) { card.hidden = true; return; }
card.hidden = false;
```

When an AI app virtualizes its chat history, the previously expanded paper's source text can be *absent* from the mounted DOM. `resolveAnchor()` correctly returns no `match`, but the condition above is then false; JotPatch displays the card at the ordinary page-note fallback position. If several papers were open, they all appear in the viewport. This is a paper presentation error, **not evidence that the extension created duplicate persisted notes**.

## Fix

1. **Never auto-display a text-anchored note without a live match.** Verify Range endpoint connectivity as well as the match itself. For a single-text-node selection, also check that the selected text has not been rewritten in place while the anchor refresh is debouncing.
2. Hide unresolved or off-viewport papers without deleting data. Release hidden editor focus to flush edits normally. A normal **page-level** note is unaffected.
3. Allow an **explicit Dock/list click** on an unresolved note to open that *single* paper for editing even when its source text is not mounted; preserve its original anchor for eventual restoration. A passive scroll/mutation never enables this fallback.
4. When the original text remounts, normal anchoring/highlighting/Dock recovery works without creating a new note or changing schema keys.
5. Avoid O(N²) note searches in per-frame marker positioning by indexing note IDs once per refresh.

This hotfix keeps the Stage 1.6 rule that *manually expanded* papers can reappear with their source passage when the passage returns into view. It does not change the multi-open behavior or silently delete a user's open state.

## Regression reproduction and verification

`python tests/virtualized_notes_e2e.py`

- Create three independent selected-text notes and leave all papers expanded.
- Unmount the entire containing chat-history chunk while mounting unrelated older content.
- Verify all three papers are hidden **before** MutationObserver's 650ms full-text reindex (stale DOM Range check), and remain hidden afterward.
- Mount another older-history chunk; verify no papers appear.
- Create an unanchored page note; it remains visible.
- Explicitly click one unresolved anchor in Dock; verify only that one paper opens.
- Remount the original chat content; verify the anchored papers correctly return and original stored note IDs remain unchanged.

Also run `npm run check` and `npm run test:e2e` to verify editor, conversation rail, settings and storage have no regression.

## Limitations

This regression uses a synthetic Chrome-like DOM and a fake `chrome.storage.local`. It cannot prove behavior for **every** authenticated ChatGPT account, Gemini variant or virtualization implementation. The source guard is deterministic, but real-world visual QA remains essential. It does not improve full-history extraction or performance beyond this specific regression.
