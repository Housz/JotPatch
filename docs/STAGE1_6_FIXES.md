# JotPatch 0.1.6 — Navigation reliability and paper editing

## Research: ChatGPT long conversations (October 2026)

User-observed behavior: a chat with many prompts may initially expose only the most recent prompts in its DOM; scrolling upward causes old content to appear. A July 2026 report from the OpenAI Developer Community documented virtualization/recycling in long chatgpt.com threads (large `scrollHeight` with only a few assistant turns mounted at once):

https://community.openai.com/t/long-thread-virtualization-empty-assistant-blocks-slow-load-chatgpt-com-web/1386500

This is not necessarily how **every** ChatGPT account/layout works. The current extension cannot inspect the user's signed-in session from the test environment. DOM structure and native scroll container can change by rollout.

Stage 1.5 had two independent faults:

1. **Prompt targeting:** `canonical()` deliberately selected a larger article/turn wrapper, then `scrollIntoView({block:'center'})` often aligned the center of this wrapper, including assistant responses, not the user prompt. **Fix:** separate `canonical wrapper` (identity/deduplication) from `prompt element` (precise scroll destination). Scroll the nearest real scroll container so the user prompt is near its top, not the answer midpoint.
2. **Incomplete historical navigation:** scanning `document.querySelectorAll` only indexes mounted prompts. No CSS selector can reveal nodes that do not exist in the DOM. **Fix:** cache the stable ID, short prompt preview and scroll hint of discovered turns in memory. Add a **user-triggered** reversible upward scan, and reverify identity after scrolling toward a historical cached item. Wrong or missing matches fail visibly instead of navigating to another question.

### Choosing a full-conversation access strategy

| Strategy | Benefit | Limitation / decision |
| --- | --- | --- |
| Read visible/mounted DOM | Stable permission model, no account/API access | Does not guarantee full conversation; **default** |
| Remember discovered turns during normal scrolling | Cumulative navigation for stable message IDs | In-memory only, unmounted rows need rehydration; **implemented** |
| User-triggered historical scan | Can discover all *loadable* older turns when site scroll behavior permits | Moves scroll temporarily, costs time, depends on stable DOM IDs; **implemented as experimental** |
| ChatGPT internal app state or nonpublic backend endpoints | Sometimes capable of returning more data | Version-/session-specific, privacy and maintainability risk; **not implemented** |
| ChatGPT official account export | Complete offline archival mechanism for eligible accounts | Not suitable for instant per-page navigation, can take time; **not integrated** |

Official export reference: https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data

**No promise of 100% indexing.** Some messages are never mountable by scrolling; an unstable/reused message ID cannot safely anchor a cached row; virtualization may change scroll heights while we scan. Do not label a discovered count as the total number of conversation turns.

### Scanning UX and safety

- In the expanded AI rail list, choose **扫描较早轮次**. User action explicitly initiates a bounded scroll walk (up to 160 steps, ~160 ms per step). The list has a **停止扫描** control.
- Scan progressively updates an in-memory `ConversationIndex`. Each cached record contains only a site-provided stable ID, up to 110 characters of prompt preview, and an approximate scroll coordinate. Detached DOM nodes are **not retained** in the cache.
- The extension restores the original scroll position after finishing or cancellation, then refreshes the currently mounted index. The process can still briefly shift a long conversation and is not run automatically at page load.
- Clicking an unmounted indexed row first scrolls to the approximate position, waits for the host to rehydrate, then verifies the actual prompt ID. Five bounded nearby attempts are allowed; unresolved rows **do not silently navigate**.
- No private ChatGPT endpoints, fetch interception, transcript persistence, account data reads or new host permissions have been introduced.

## Unified rail: clustered notes

One gray line per discovered question turn. One **colored cluster/count** per turn containing 2+ notes, in a separate clickable lane. Clicking the cluster opens a compact list of the actual notes; clicking one navigates to its **exact text anchor**, not merely the parent question.

Single notes stay one dot. Notes not confidently associated with a live turn remain independent navigation targets. On ordinary webpages, JotPatch continues to use the note-only Dock. The sidebar is optional and respects native navigation detection.

## Paper editor: simple WYSIWYG and Markdown portability

- Fixed **28px header** for whole-strip dragging; right side: **Copy Markdown**, jump to source, more, close. No top-left grip.
- Fixed **27px footer** for bold, italic, unordered list and ordered list. Both bands reserve actual space; no controls overlap text. Chrome fades when unfocused, paper remains.
- Inside: editable rich text (`contenteditable`) with four supported formatting types. Ctrl/⌘+B and Ctrl/⌘+I work while editing. Existing notes' Markdown is rendered directly as formatted content, without switching between raw source and preview.
- Saved `note.text` **remains Markdown source** (`**bold**`, `*italic*`, `- item`, `1. item`); Copy writes this exact canonical Markdown to clipboard.
- Pasted HTML is never trusted: paste inserts only the `text/plain` flavor. The serialized Markdown parser supports the four promised formats, **not nested lists, tables, images or complex HTML**.
- Color and **small/medium/large font presets** live in the `···` menu. Hovering a note with Ctrl+wheel changes its text font preset; the `wheel` event is cancelled (`passive:false`) to prevent zooming the underlying page on Chromium.
- Right-bottom resize keeps the **top-left** of the actual note card stationary by compensating any source-relative layout reflow. The card's width and height remain stored in `appearance`.
- Menus close when the user clicks elsewhere or presses Escape. Focusing a partially overlapped note raises its z-index.

We use Chromium native editing commands for selection/undo in this small prototype. `document.execCommand` is deprecated; the next editor hardening pass may replace it with a maintained editor engine if actual Chromium interoperability and composition/IME testing warrant the dependency cost. Do not imply all edge-case input/undo paths are production-certified.

## Data model / compatibility

No schema migration: existing `Note.schemaVersion:1` and the same `jotpatch:note:v1:<uuid>` keys. New optional `appearance.fontSize:'sm'|'md'|'lg'` defaults to `md`. Existing Stage 0, Stage 1 and Stage 1.5 notes can still be read. No hosted backend or telemetry.

## QA

- `npm run check`: TypeScript bundles + Node contracts.
- `npm run test:e2e`: synthetic Chromium/Playwright navigation, editor, notes, resizing, history virtualization tests.
- Confirm in actual authenticated **ChatGPT and Gemini** on Chrome/Edge before considering it fully supported: live DOM changes, account-specific virtual scroll, site permission prompts, right-click menu, IME composition, clipboard permissions and Ctrl+wheel zoom behavior.
