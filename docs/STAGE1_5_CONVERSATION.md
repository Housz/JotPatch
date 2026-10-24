# Stage 1.5 — AI Conversation Rail

## Purpose

Restore the compact question-by-question navigation seen in some versions of the ChatGPT web app, while preserving JotPatch's **precise anchored sticky notes**. Target websites: `chatgpt.com`, legacy `chat.openai.com`, and `gemini.google.com`. Regular web pages keep the original note-only Dock.

## Interaction contract

- **One light gray horizontal stroke per loaded user turn** (user prompt plus corresponding answer, not two strokes). The current turn uses a darker/longer stroke. At 1–2 turns without notes, the rail stays hidden.
- Hover/focus a stroke for a short **question preview**; click to smoothly scroll to the relevant user message. Keyboard focus and labels remain available.
- **Colored note dots** remain separate clickable targets next to their containing turns. Clicking a dot **still navigates to its exact text anchor**, never merely the start of the turn. In ordinary documents, note dots still use approximate full-document position.
- The rail header opens a lightweight list, with *question turns first, notes second*. There is no full transcript viewer, artificial summarization, account integration or search index.
- If an explicitly identifiable native conversation timeline is visible, JotPatch hides **only gray turn lines**, and moves the note-only rail slightly left to reduce overlap. Since the native ChatGPT DOM can change, users can disable the bars directly in Settings if the automatic check is not enough.
- One switch labeled **AI 会话导航** (default on) enables/disables only gray turn lines. Turning it off **never deletes or hides saved note pins**. Selection-popup preferences are preserved.

## Modules

| Module | Responsibility |
|---|---|
| `src/content/conversation.ts` | URL/site detection, conservative site-specific DOM selectors, canonical user-turn extraction, hover text previews, native-rail detection, DOM-order turn-to-note mapping. No persistence. |
| `src/content/app.ts` | Throttled index scans, unified rail rendering, current-turn tracking, independent note/turn click behavior, list & preview UI. |
| `src/content/paper-styles.ts` | Extremely compact horizontal stroke and colored dot styling, accessible hover/focus states. |
| `src/content/repository.ts` | Existing `jotpatch:preferences:v1` with optional `conversationNavigation` boolean; old preferences default to on. |
| `options.html`/`options.js` | Toggle and merging persistence; do not overwrite the selection setting. |

### Navigation data / privacy

`ConversationSnapshot` and `ConversationTurn` live **only in content-script memory**, containing DOM references and at most 110 characters of each visible prompt for transient previews. They are discarded on page navigation. **No transcript or prompt text is persisted** for navigation, and no new permissions or network requests are added.

Notes retain their unchanged schema (`schemaVersion: 1`, URL/pageKey, exact quote + surrounding context + note content and paper geometry). The note rail computes its turn association from the resolved DOM `Range`, so a failed AI adapter cannot corrupt notes.

### Multiple markup generations

The ChatGPT adapter detects traditional user-role message bubbles, `article[data-turn="user"]`, and modern `[data-user-message-bubble]` within `[data-turn-key]`. The Gemini adapter detects `user-query` and a narrow set of observed attribute fallbacks. Candidate nodes are deduplicated at their user-turn wrapper, excluded from hidden/aside/dialog regions, and sorted in DOM order. These are **unofficial markup heuristics**, not guaranteed APIs.

### Long/dynamic conversations

- New DOM elements trigger a **leading-edge ~800ms throttled scan**; text-only changes do not trigger a second conversation scan. The original note anchor refresh remains independent.
- Current-turn detection during scroll uses binary search over ordered DOM elements, requiring logarithmically many layout reads instead of scanning every turn on every frame.
- Visual line hit heights shrink as turn count grows. The expanded list gives exact individual rows, including in long chats.
- Only **currently mounted, visible DOM turns** are navigable. For virtualization and unloaded old pages, there is no private API scrape or forced scroll of the whole conversation. If a turn is detached before clicking, JotPatch explains that it is unavailable and schedules a rescan.
- A new ChatGPT or Gemini DOM redesign may require updating the adapter. When no turns are recognizable, the extension simply falls back to saved note pins.

## Testing

```
npm run check
npm run test:e2e
```

`npm run check` compiles the MV3 extension and runs Node contracts. `npm run test:e2e` runs Stage 1 behavior + synthetic ChatGPT/Gemini browser DOM scenarios through Chromium and Playwright (extra Python packages and `/usr/bin/chromium` required). Tests cover old/new ChatGPT markup, Gemini, hover/click, note pin attached to the right turn, preferences, native timeline, 120-turn document, DOM mutations and persistence.

**Important:** Synthetic DOM integration cannot prove live compatibility with a signed-in ChatGPT or Gemini session. Verify both sites manually before release, especially message/turn identity, virtual scrolling, unrecognized markup, native navigation, and CSS overlap. Some environments block automation against those private websites.

## Not included in Stage 1.5

Full chat indexing across unloaded turns; conversation transcript storage; host-specific private backend requests; moving notes across tabs (Stage 2); standalone popout (Stage 3); additional sites beyond ChatGPT/Gemini. This release intentionally retains the minimal product positioning.
