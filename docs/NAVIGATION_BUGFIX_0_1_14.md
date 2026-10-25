# JotPatch v0.1.14 — Navigation reliability bugfix

**Version remains 0.1.14.** This is a focused corrective patch on the existing branding/color release. It is **not** the separate long-conversation research branch or a promise to read all unvisited ChatGPT messages.

## Root causes verified in source

- `ConversationIndex` cached changing ChatGPT message IDs as unrelated logical turns and only de-duplicated *inside one scan*. Some transitions briefly render multiple copies of the same user message. Distinct user turns with identical content must never be merged by text alone.
- Each `MutationObserver` refresh called `renderDock()`, which removed and recreated every navigation button via `track.replaceChildren()`. This caused visible jitter and lost focus while an assistant was streaming output.
- Old `jumpToTurn()` tried one stale `scrollHint` plus five ±viewport offsets, waited a fixed 180ms, and clamped `scrollTop` to ≥0. It could not progressively load distant virtualized history, and negative `scrollTop` is valid in reversed containers.
- `goTo()` did not attempt to load the stored `conversationTurnId` before navigating to a missing quotation. Global quote matching also risked confusing the same text in different Q/A rounds.

## Implemented repair

### Stable turn identities

`ConversationIndex` maintains in-memory aliases for a site ID that changes while the original user message element (or stable wrapper) remains mounted. A completely replaced shell can only be aliased if the prompt text, scroll vicinity **and a known adjacent turn** agree unambiguously. The ID cache does **not** collapse two separate user turns simply because their prompt text matches.

`collectConversation()` identifies nested/overlapping shells containing the exact same visible prompt at the same position and counts them only once, preserving the semantics of separate prompts in different positions. It also stores the scroll extent alongside the scroll hint.

### Stable incremental rail

`renderDock()` generates a structural signature covering ordered turn IDs and note associations. If streaming only changes answer text, the old buttons, coordinates and keyboard focus survive unchanged; lightweight labels/state are updated in place. An explicit historical navigation also defers structural rerendering until it finishes.

### On-demand historical restore

Only a **real click** on a previously indexed but currently unloaded turn begins a bounded navigation task. The engine:

1. Rechecks the latest live DOM for the exact stable ID.
2. Optionally uses the saved pixel hint **only if** its original scroll extent still approximately matches.
3. Otherwise advances through the real scroll container in increments, checking the live stable ID after each step and allowing asynchronous DOM hydration.
4. Does not clamp negative `scrollTop`, and infers reversed visual order when possible.
5. Validates the final Prompt rectangle after aligning to the top of the scroll container.
6. Stops after bounded attempts/time; on failure tries to restore the previous reading anchor/position instead of claiming success.

A new click cancels the old task. A user wheel gesture, touch interaction, page navigation, or leaving the browser tab cancels it as well. The small “正在定位…” toast has a Cancel control. Passive indexing remains passive: no background exploration or private ChatGPT API access.

### Exact quote restoration, scoped to its original turn

An anchored note with `conversationTurnId` first recovers the corresponding user turn. The resolver then searches for `anchor.exact` plus saved context, **restricted to that known turn**, optionally using `spatial.withinTurnProgress` as a hint. After scrolling, it verifies a fresh Range and its actual on-screen rectangle before reporting arrival. If only the round is found, it says so without silently jumping to an identical phrase in another turn. Notes without a known stable round can still be opened manually without inventing an association.

`resolveAnchor` now accepts an optional Range predicate, retaining original backward-compatible semantics for ordinary webpages. The v0.1.7 virtual DOM/unmounted note guard and all existing note data are preserved.

## Validation

```bash
npm run check
python tests/navigation_recovery_e2e.py
python tests/navigation_recovery_e2e.py unreachable
npm run test:e2e
```

Synthetic Chromium cases include: changing live DOM IDs, wholesale React shell replacement, independent identical prompts, 10 streaming edits without rail DOM replacement, far old turn remount, invalidated coordinate hint, manual-wheel cancellation, negative `scrollTop`, failed navigation with reading-position restore, a yellow note with identical quotation in multiple answers, and original note rehydration. Existing UI, editing, settings, ChatGPT/Gemini adapter and virtualized-note tests are retained.

## Deliberate limitations

- The cache only retains **previously discovered** stable turns. It cannot access messages the site refuses to load or that the user has never caused the page to expose.
- Browser websites can change DOM containers and virtualization algorithms without warning. No tests ran inside an authenticated live ChatGPT/Gemini session or proved universal reachability.
- Old notes created before a stable `conversationTurnId` was known may need their original passage visited once before targeted historical recovery is possible.
- This is a bugfix, **not** the separate future research/experiment branch. No new permissions, remote service, transcript storage, or version number change.
