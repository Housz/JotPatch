# JotPatch architecture — v0.1.9

## Product invariants

1. **Page Pin is the default**. Notes are scoped by canonical URL and optionally a text quote. The browser tab ID is never used as the durable note identity.
2. **Paper is the editor**. A fixed, quiet header/footer reserve space for controls, fade when unfocused, and never obscure the contenteditable rich-text area. No text title or repeated source quote.
3. **Notes survive transient interface closure**. Closing a note hides its paper only, not its stored content. When a stored quote cannot be found, it remains recoverable via the Dock.
4. **The browser follow mode (Stage 2) migrates floating cards** between eligible web pages, rather than replacing them with Side Panel. Stage 3 popouts are deferred.
5. **Privacy first**. No cloud services and no mandatory all-sites host permission.

## Extension architecture

```text
Extension Toolbar click         Selected-text context menu          Options page
        |                                |                                  |
        v                                v                                  v
    MV3 service worker  --- activeTab injection ---  storage preferences / site opt-in
        |
        v
    Content Script (one classic JS bundle, Shadow DOM UI)
       |-- AnchorEngine             src/content/anchor.ts
       |     - DOM linear index with bounded traversal
       |     - quote + context + position capture, unambiguous resolution
       |-- PageKey                  src/content/page-key.ts
       |-- ConversationEngine       src/content/conversation.ts
       |-- ConversationIndex        src/content/conversation-index.ts
       |     - ephemeral stable-ID/scroll-hint cache for virtualized turns
       |     - per-site ChatGPT/Gemini DOM adapters, short in-memory turn index
       |     - native navigation detection and turn-to-anchor association
       |-- Markdown boundary        src/content/markdown.ts
       |     - tiny safe Markdown/HTML conversion for rich edit
       |-- NoteRepository           src/content/repository.ts
       |     - individual keys + optional appearance + revision / tombstone
       |-- Page UI orchestrator      src/content/app.ts
       |     - small launcher and selection pin
       |     - multiple independent paper cards, overlays and unified navigation Dock
       |     - light conversation strokes, turn previews and active-turn highlighting
       |     - fixed drag header, bottom formatting footer, top-left-stable resize
       |     - plain Markdown clipboard output, font presets and Ctrl+wheel
       |     - serial saves and external chrome.storage.onChanged observation
       |-- Paper styling            src/content/paper-styles.ts
       |
       v
chrome.storage.local
  jotpatch:note:v1:<uuid>        per-note body, anchor, color and layout
  jotpatch:preferences:v1       selectionTrigger ('always' | 'alt' | 'off')
                                 conversationNavigation (boolean, default true)
```

`tsc --outFile` compiles TS `namespace JP` source files into one classic content script. UI is mounted in a ShadowRoot to reduce host CSS interference. DOM text that users select or enter is assigned using `textContent`, textarea `.value`, or freshly created Text nodes rather than injected as untrusted HTML.

## Anchor and placement semantics

- Text-level Pin captures original `TextAnchor { exact, prefix, suffix, start, end }` and never trusts old pixel coordinates. On reload or SPA route change, `resolveAnchor` checks quote occurrences, surrounding text and ambiguity.
- Page-level Pin has **no** `anchor`: it remains a page-scoped viewport paper without a text marker, but is present in Dock.
- Anchored paper uses a live DOM `Range` and scroll/resize-dependent placement. Prefer a margin next to the source block; if unavailable, place below/above the block so it does not immediately obscure the selected sentence.
- User dragging the whole top strip changes `appearance.offsetX/Y` relative to the resolved base placement, **not** the text anchor; user resizing changes `appearance.width/height`. On changed viewport dimensions cards are clamped back into view.
- When anchor leaves the viewport, its expanded paper/marker is temporarily hidden (not closed) and appears again when original content returns. Dock retains access.
- On generic pages Dock dots are ordered by text-index offset. On ChatGPT/Gemini with conversation navigation enabled, multiple notes associated with the same turn share a single numbered cluster marker; selecting a note still jumps to its exact text. Their **actual click destination remains the exact quote**. Missing quote resolves to gray dot; card remains editable.
- Conversation turns are **runtime-only DOM references and short previews**. Discovered turn IDs and approximate scroll hints are cached in memory without retaining detached DOM elements. A user-initiated history scan can index older loadable turns; it cannot guarantee complete history, and never invokes private APIs. Third-party DOM is not a stable API; unrecognized or virtualized messages gracefully downgrade to note-only navigation. See [Stage 1.5 specification](STAGE1_5_CONVERSATION.md).

## Storage migration and concurrency

Existing Stage 0 notes continue using `schemaVersion:1`, and optional Stage 1 fields carry defaults:

```ts
interface Note {
  id: string;
  pageKey: string;
  text: string;
  anchor?: TextAnchor; // absent means page-level note
  appearance?: {
    color?: 'yellow'|'pink'|'green'|'blue'|'purple'|'gray';
    fontSize?: 'sm'|'md'|'lg'; // optional, defaults md
    width?: number; height?: number; offsetX?: number; offsetY?: number;
  };
  revision?: number;
  deletedAt?: number;
}
```

- Content edits are locally reflected immediately and stored after ~380 ms debounce or on blur. Writes are serialized per note within each tab to prevent local save reorder.
- A saved `revision` is compared against the last observed storage revision prior to updating. Other tabs' changes are observed via `chrome.storage.onChanged`. If edits collide, the current tab stops saving the conflicting note and advises copying its local text.
- This is **optimistic best effort**, not compare-and-swap; a race between two tab writes can still occur. Robust multi-tab atomic editing is future work and must not be claimed solved.
- Delete stores a tombstone (`deletedAt`); undo within ~8 seconds restores the note. Old tombstones can be pruned on loading that page. Closing a popup/card does not delete it.
- The data schema remains forward-extensible for Stage 2 placement ownership (`page`, `follow`) and Stage 3 popout UI without duplicating note identities.

## Permission and event handling

- `activeTab` + `scripting` + `storage` + `contextMenus`; no mandatory `host_permissions`. A toolbar action or user-selected context-menu item grants temporary active-tab access.
- When context menu is clicked on a page where the extension has not been injected, worker ensures the script is loaded and dispatches a message. The script captures an existing DOM `Range` when possible; if only selection text survives, it anchors **only if the text occurs uniquely**. If ambiguous, it asks the user to reselect and does not invent an anchor.
- Users opt in to per-origin host permissions through the extension options page; the worker registers a persistent content script for future page reloads. Revoking permissions unregisters it.
- Settings updates broadcast through `chrome.storage.onChanged` to already-open content scripts and take effect without browser reload.
- Repeated injection is idempotent (no duplicate shadow roots). The toolbar icon shows/hides the small launcher; the launcher has a separate “hide JotPatch” control.

## Tests and next development work

- `npm run check`: TypeScript build and Node contract checks.
- `npm run test:e2e`: Chromium DOM integration (Stage 1 + synthetic ChatGPT/Gemini Stage 1.5).
- `python tests/browser_e2e.py`: Chromium DOM integration with a fake extension store; covers selection and quote restore, multiple notes, color, drag/resize/save, mutation and Dock, selection modes, right-click message handling, page notes, Markdown hotkeys/preview, undo, missing anchor, and options-page preference storage.
- Stage 1.5 separately verifies two ChatGPT markup generations, Gemini, hover previews, active turn, dynamic DOM, unified colored note marker, preferences and long synthetic conversation fixtures.
- Real Chrome/Edge tests remain required for extension install/update, context-menu integration, permission prompts, Chrome worker lifetime, cross-origin frames, and ChatGPT/Gemini UI changes. The DOM harness is not proof of those browser-specific behaviors.
- Stage 2 needs cross-tab placement coordination, origin-authorization strategy, and ownership of a single floating follow note across browser windows. It must not reuse the current page-scoped `openIds` as global state.

See [Stage 1.5.1 reliability / UX investigation](STAGE1_6_FIXES.md) for virtualized history indexing, source-to-prompt targeting, clustered rail design, browser edit engine tradeoffs and test coverage.


## Stage 1.8 导航架构更新

`src/content/rail-layout.ts` 新增不依赖 DOM 的 `layoutConversationRail` 纯布局引擎；轮次与便签标记以真实顺序插入轨道间隙，按便签数量自适应分配空间。密集时局部聚焦而非默认用数字合并。`ConversationIndex` 改为随着用户自然滚动积累稳定轮次 ID，不再自动滚屏或调用内部接口。`Note.conversationTurnId?` 是可选的稳定轮次关联，用于虚拟化后的归属维护，旧数据兼容。详细参见 [STAGE1_8_PASSIVE_RAIL.md](STAGE1_8_PASSIVE_RAIL.md)。


## 0.1.9 密集导航修复

轨道布局始终由 `layoutConversationRail(groups, height)` 生成**固定的概览坐标**。密集时（理想高度超过可用高度），页面用户真实指针移动到某轮后，由 `showRailLens` 在轨道左侧生成独立的本轮目标列表，直接一次点击便签或 Prompt；原 `.rail-turn/.rail-pin` 像素位置不因聚焦而移动。短延迟允许指针越过小间隔，离开轨道与展开层后自动关闭。窗口尺寸改变时关闭旧展开层并重算轨道。

当便签 `anchor` 仍存在、但 DOM 虚拟卸载造成 `liveMatch` 暂时为 null 时，导航按钮仍采用 `NoteAppearance.color`，只添加 `.missing` 虚线边框与状态提示；文本纸张继续遵守 Stage 0.1.7 的被动隐藏规则。原 Note schema、储存 API 与扩展权限没有改动。

新增实际 Playwright 鼠标轨迹回归、不同视口高度多轮悬停、虚拟卸载/重新挂载颜色测试；合成页面测试不能替代登录后的 Chrome/Edge 真机验收。


## v0.1.11 — Spatial Rail

原聚合导航与“轨道旁边弹出 dense lens”是历史实现，当前版本被单轴连续放大替换。新 `rail-layout.ts` 使用轮次内真实比例、PAVA 有序避让、加权高度与 `fisheyePositions` 严格单调映射，保持一张便签一个可点目标。详见 [SPATIAL_RAIL_0_1_11.md](SPATIAL_RAIL_0_1_11.md)。


## v0.1.12 Stable Rail（历史方案）

取消 v0.1.11 的鼠标驱动鱼眼变形及空白轨道最近目标猜测。轨道仍按绝对轮次比例、PAVA 有序避让稳定分配像素坐标；`findCrowdedRailGroups` 只识别局部真正拥挤的**便签**，不使用全局 `dense` 开关作为交互触发。鼠标短暂停留时于左侧生成一个固定位置的局部选择区，原条目 `top` 不改变；只在选择区打开时暂缓 DOM 结构更新，关闭时刷新。见 [STABLE_RAIL_0_1_12.md](STABLE_RAIL_0_1_12.md)。


## v0.1.13 Simple Hover Rail（当前）

取消完整 `jp-rail-detail` 的 DOM、CSS、指针悬停定时器、拥挤组计算、密集按钮点击拦截以及为弹窗冻结结构更新的逻辑。所有 `.rail-pin` 与 `.rail-turn` 按钮始终直接负责 `goTo(note.id)` / `jumpToTurn(turn)`，无需第二次选择。公用 `showRailPreview` 仅渲染安全的 `textContent` 内容正文，没有轮次编号、Pin 状态标题，也不再通过 native `title` 重复渲染提示。保持 aria-label 供读屏与键盘使用。

当前轨道仍保留 `layoutConversationRail` 的固定纵向坐标、PAVA 有序间距与用户阅读时自然积累的轮次索引。`railNoteLanes` 对中心距不足 7px 的相邻便签，在最多三个水平窄通道内错开鼠标命中区域，**不改变原文位置、保存字段或纵向坐标**；仍极度重叠时使用主动展开目录或键盘访问。不要重新引入自动聚合、悬停弹出的选择器、隐式邻近目标猜测或移动式鱼眼放大。

回归见 `tests/stable_rail_e2e.py`：鼠标按像素分别点击 100 轮、60 张便签中的三张相邻笔记及一个灰色轮次横条；还检查无标题摘要、无弹窗 DOM、没有 JS 错误、布局坐标稳定，以及原有浏览器集成回归。


## v0.1.14 Navigation recovery bugfix

新增 `src/content/navigation-recovery.ts` 有界、可取消的用户点击导航状态机。`ConversationIndex` 增加同一物理 Prompt ID 的别名机制与同位置 DOM 过渡去重；`app.ts` 使用稳定结构签名来避免流式回答期间全轨 DOM 替换。便签恢复只在原 `conversationTurnId` 对应的轮次内匹配文本 Range，并在滚动后重新验证。见 [NAVIGATION_BUGFIX_0_1_14.md](NAVIGATION_BUGFIX_0_1_14.md)。


## v0.1.15 experimental Navigation Lab

`src/content/navigation-lab.ts` implements a bounded 1,200-entry in-memory ID/scroll-checkpoint cache and opt-in `recoverConversationTurnLab`. The default remains `recoverConversationTurn` from v0.1.14. The Lab is gated by `Preferences.navigationLab===true` and a recognized ChatGPT site adapter, reset on SPA navigation, and neither persists checkpoints nor calls ChatGPT private endpoints. See [NAVIGATION_LAB_0_1_15.md](NAVIGATION_LAB_0_1_15.md) for synthetic test results and limitations.
