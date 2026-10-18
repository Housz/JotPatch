# Stage 1 interaction specification

## Design thesis: the paper *is* the editor

Windows Sticky Notes inspired; **not** a framed dialog. Default pastel paper 256×202 CSS pixels, minimum 180×132, flat radius 5px, nearly invisible border, restrained shadow. The writing field fills the entire paper surface. There is **no title, no quoted excerpt, no persistent header/footer**; the selected original remains highlighted in its source paragraph.

### Controls and placement

- **Top-left** `⠿` (only prominent on hover/focus): pointer drag moves the entire paper. This changes its offset from the same original quote; it does not reanchor to another paragraph.
- **Top-right** `↗` return to anchor, `···` more/colors/delete, `×` hide paper. All are understated when not interacting.
- **Bottom** B, I, ≡, 1., copy are overlay icons with no footer background; appear on hover/focus.
- **Bottom-right** a subtle angled corner: drag to resize both dimensions of the paper, not the textarea alone.
- **More** provides 6 soft colors, copy text and delete. Delete exposes 8-second undo in a toast; never confuses hiding with deletion.
- **Markdown** is source while actively typing; when blurred, a safe tiny subset renders bold, italic, bullet, or numbered lists. Click preview to resume editing.

### Selected text

Three modes in Options:

- **Always** (default): after a valid mouse/keyboard selection outside form fields, show only `📌` close to selected text; no label.
- **Alt/Option**: only show when Alt/Option is held at mouseup (or while keyboard selection completes). The icon stays clickable after releasing the key.
- **Off**: never inject the contextual bubble; right-click selection retains `📌 添加 JotPatch 便签`.

The right-click action obtains the current selection Range when available; if it is lost, only a **unique exact quote** may be anchored. Ambiguous selections show guidance rather than linking to a possibly incorrect paragraph.

### Page notes and navigation

- Toolbar click opens a **very small launcher** (not a permanent header): `+` for page-level note, `⚙` for settings, `−` for hide everything. Another toolbar click toggles this launcher.
- A note without a selected Range is **pinned to the current page**, not to a guessed paragraph. It has no in-text marker, but remains in the Dock and floats in the viewport.
- Anchored notes keep their in-text marker and are organized by position in the narrow right Dock. Dock markers jump to source, then open the corresponding paper. Missing anchor indicators are gray and editable.
- Multiple papers may be expanded at once. The active paper comes to front; no categories, notebooks or global search.
- Stage 2 Follow mode B will let users transport one floating paper across eligible pages. This is not shipped in Stage 1; Stage 3 independent window remains deferred.

### Known limitations

Page rearrangements may move cards due to live re-positioning. Unusual CSS stacking contexts, dynamic document virtualization and restricted browser pages are imperfect. Initial Chrome/Edge site permissions can only be verified with actual installed-extension testing. Markdown subset intentionally does not include tables, fenced code or attachments.
