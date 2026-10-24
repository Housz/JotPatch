# JotPatch v0.1.15 — Long Conversation Navigation Lab

**Experimental, opt-in only.** The production v0.1.14 navigator remains the default.
This work is based on `fix/0.1.14-navigation-reliability` in the **separate**
`experiment/long-conversation-navigation-lab` branch. No changes are applied
to the v0.1.14 release branch.

## Context / external evidence

- OpenAI's August 21, 2026 release notes document a material change on ChatGPT
  web: older/longer chat messages now load in smaller sections instead of the
  full conversation at once:
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- A user report dated August 21, 2026 describes a rollout in which scrolling
  upwards progressively loaded older messages and scrollbar length reflected
  only the currently loaded conversation. This is an anecdotal observation,
  **not** documentation of a stable app API:
  https://community.openai.com/t/long-conversation-navigation-regressed-table-of-contents-disappeared-and-older-messages-only-load-progressively/1391666

We have no authenticated browser session or stable public conversation API
that guarantees historical message availability. All implementation claims
below are based on source inspection and local Chromium simulations, not a
claim of validated production ChatGPT functionality.

## Research questions

1. Can a previously seen old turn be restored more reliably using a bounded
   cache of scroll checkpoints without consulting private endpoints?
2. Does the restoration strategy survive a **fixed-height DOM window** and a
   **top-boundary incremental fetch** site with a changing scroll height?
3. Can it handle negative `scrollTop`, a replaced scroll container, cancellation
   and unreachable targets without hijacking page interaction?
4. Is there a defensible speed improvement over the existing v0.1.14 method?

## Design: production fallback + opt-in strategy

- Settings → **AI 会话导航 → Navigation Lab (实验性)**. Default OFF. The preference
  is persisted in the existing `jotpatch:preferences:v1` record without
  removing existing fields. Toggling off aborts any running navigation.
- Only recognized ChatGPT host adapters use the Lab strategy. Gemini and all
  other sites continue to use v0.1.14 navigation even when the Lab switch is
  enabled. The user can revert instantly.
- Normally **no extra scrolling happens**. On natural scroll/DOM discovery,
  the Lab caches a bounded record of previously mounted user-turn IDs and
  absolute document positions. Its cache is **in memory only** and reset on
  conversation SPA route change. It includes `id`, `top`, `extent`, `observedAt`;
  it does *not* store prompt text, answer text, full transcripts or HTML.
- On a user-initiated jump to an unmounted previously visited turn:
  1. Check for the exact logical turn ID in mounted DOM.
  2. If a checkpoint exists and scroll extent differs by <=18%, try a fast
     coordinate jump. Never count coordinates alone as arrival.
  3. If the target is not mounted or the checkpoint is stale, walk toward the
     target in measured viewport increments. Determine direction from logical
     order and observed visual direction, not by assuming nonnegative scroll.
  4. At lazy-loading boundaries, wait with adaptive patience; use freshly
     mounted turns and exact ID to decide whether progress occurred.
  5. Re-resolve the current DOM and scroll root during search, including after
     React replaces its scroll container. Stop after max 140 steps or 32s by
     default, or immediately upon user cancellation.
  6. The original v0.1.14 application verifies final prompt/quote visibility,
     attempts to restore the reading position if the target is unreachable,
     and still handles two-stage anchored-note recovery.
- No offscreen tabs, intercepted responses, internal ChatGPT API calls,
  remote telemetry, or new extension permissions were introduced.

## Reproducible results / limitations

Environment: local headless Chromium on synthetic HTML, deterministic load
fixture, viewport 1200x800. `npm run check`: **32/32 Node tests**.

| Synthetic scenario | Verified outcome | Observed performance |
|---|---|---|
| 20-turn stable-height virtual list; known checkpoint | Exact old prompt remount and alignment | Checkpoint search ~141 ms (one run) |
| Same list, old extent intentionally changed | Fast checkpoint rejected; progressive fallback finds target | 16 steps, ~1.9s (one run) |
| Top-boundary progressive pagination, 7 batches with 640ms artificial delay | Exact oldest target arrived; no external API | Lab 8.40s / 8.41s across two runs |
| **Same synthetic pagination fixture**, Lab OFF (v0.1.14 baseline) | Exact oldest target arrived | 9.63s / 9.64s across two runs |
| Reverse-flex negative scrollTop | Exact target identity recovered with negative scroll | 11 steps (one run) |
| Scroll container replaced mid-search | Newly mounted root followed; exact target found | 13 steps (one run) |
| User manually uses wheel during navigation | Abort signal terminates background search | Passed |
| Oldest target made permanently unreachable | Bounded failure with no false success, restores original *visible prompt position* | ~4.6s with test budget |
| Quote reappears in many answers | Restores note's saved round, then exact quote inside that round | Passed |
| Lab default OFF, options toggles among existing preferences | No loss of the default color mode or other settings | Passed |

**Measurement caveat:** Even the repeated Lab/baseline measurements are of a
single deterministic synthetic pagination design, not a general speed study.
Different wait policies, ChatGPT builds, network behavior, and actual scrolling
and virtualization mechanisms can reverse the comparison. Lab should remain
OFF by default until tested in real authenticated long conversations. The
number of steps and timing are optional in-memory development diagnostics,
never persistent conversation analytics.

## Failure boundaries

- A message never visited and never indexed is **not discoverable** purely from
  a stored navigation ID. The Lab does not claim to index all historical turns.
- A previously seen turn may be impossible to mount if ChatGPT itself no
  longer loads it using normal scrolling; Lab returns an unreachable result.
- Scroll hints are only approximations. A changed scroll extent invalidates
  cached coordinates; a successful scroll operation is NOT a successful search.
- The user remains in control. Wheel/touch/keyboard interaction and page
  navigation cancel active searches, and the visible cancellation button
  remains available.
- For extremely large conversations, even 32 seconds / 140 steps may not
  suffice; that is an explicit bounded-design choice rather than a crash.

## Verification commands

```bash
npm run check
npm run test:e2e  # production regressions, no lab stress modes
npm run test:lab -- paging  # run ONE browser scenario per invocation; choose a case below
```

Individual isolated runs (**required** on resource-limited CI; do not concatenate them into one long shell command):

```bash
python tests/navigation_lab_e2e.py options
python tests/navigation_lab_e2e.py fixed
python tests/navigation_lab_e2e.py stale
python tests/navigation_lab_e2e.py paging
python tests/navigation_lab_e2e.py baseline
python tests/navigation_lab_e2e.py reverse
python tests/navigation_lab_e2e.py replace-root
python tests/navigation_lab_e2e.py cancel
python tests/navigation_lab_e2e.py unreachable
python tests/navigation_lab_e2e.py notes
```

## Next experiments (not implemented here)

- Validate on *actual authenticated ChatGPT long conversations*, including
  varying account rollouts and native Table of Contents behavior.
- Measure user-visible task success and navigation time on real content; do
  not promote based on synthetic benchmark speed alone.
- Inspect whether an official, stable per-turn navigation interface exists.
  Do not depend on unversioned private APIs without a separate design review.
- Compare event-driven mutation waiting with bounded polling on platforms
  with significantly different rendering latency.

### Test-runner limitation

All ten Lab cases passed when launched independently. In this sandbox, attempts
to run the *entire* Chromium matrix sequentially in one long command sometimes
stalled when launching the fourth browser, after the first three passed. The
Playwright driver later emitted a pipe error on timeout. This is a runner
limitation; it has not been diagnosed as a product runtime failure, and the
report **does not claim** that a single combined browser-matrix execution
succeeded. Run one case per process; the default `npm run test:lab` executes
only the fixed-height case, and `npm run test:lab -- paging` selects a case.
