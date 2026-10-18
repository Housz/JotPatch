namespace JP {
  const EXCLUDED = 'script, style, noscript, textarea, select, option, input, button, svg, template, [contenteditable], [hidden], [aria-hidden="true"], [data-jotpatch-exclude]';
  const CONTEXT = 48;
  const MAX_QUOTE = 1600;
  const MAX_INDEX_CHARS = 2_000_000;

  /** Stable-enough Stage 0 linear text index. Never traverses the extension Shadow DOM. */
  export function buildTextIndex(root: Node = document.body): TextIndex {
    const nodes: TextIndex['nodes'] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node as Text;
        if (!text.data || !text.parentElement || text.parentElement.closest(EXCLUDED)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let text = '';
    let truncated = false;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (text.length + node.length > MAX_INDEX_CHARS) {
        truncated = true;
        break;
      }
      const start = text.length;
      text += node.data;
      nodes.push({ node, start, end: text.length });
    }
    return { text, nodes, truncated };
  }

  function boundaryOffset(index: TextIndex, node: Node, offset: number): number | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const item = index.nodes.find((entry) => entry.node === node);
      if (!item) return null;
      return item.start + Math.max(0, Math.min(offset, item.end - item.start));
    }
    // Browsers frequently put selection boundaries on an element rather than
    // its first/last Text child (for example, selecting a whole paragraph).
    try {
      const point = document.createRange();
      point.setStart(node, offset);
      point.collapse(true);
      for (const entry of index.nodes) {
        if (point.comparePoint(entry.node, 0) > 0) return entry.start;
      }
      return index.text.length;
    } catch { return null; }
  }

  export function captureSelection(range: Range, index: TextIndex): TextAnchor | null {
    if (range.collapsed) return null;
    const start = boundaryOffset(index, range.startContainer, range.startOffset);
    const end = boundaryOffset(index, range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start || end - start > MAX_QUOTE) return null;
    const exact = index.text.slice(start, end);
    if (!exact.trim()) return null;
    return {
      version: 1, type: 'text', exact,
      prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
      suffix: index.text.slice(end, end + CONTEXT), start, end
    };
  }

  function toPoint(index: TextIndex, offset: number, isEnd: boolean): { node: Text; offset: number } | null {
    for (const entry of index.nodes) {
      if (offset < entry.end || (isEnd && offset === entry.end)) {
        return { node: entry.node, offset: offset - entry.start };
      }
    }
    const last = index.nodes[index.nodes.length - 1];
    if (last && offset === last.end) return { node: last.node, offset: last.node.length };
    return null;
  }

  function makeRange(index: TextIndex, start: number, end: number): Range | null {
    const a = toPoint(index, start, false);
    const b = toPoint(index, end, true);
    if (!a || !b) return null;
    try {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      return range;
    } catch { return null; }
  }

  function commonSuffix(a: string, b: string): number {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  }
  function commonPrefix(a: string, b: string): number {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  }

  /** Prefer verified quote + context; never trust the old character offset alone. */
  export function resolveAnchor(anchor: TextAnchor, index: TextIndex): Match | null {
    if (!anchor.exact || anchor.exact.length > MAX_QUOTE) return null;
    const candidates: Array<{ start: number; score: number; context: number }> = [];
    let from = 0;
    // Bound pathological cases such as repeated single-character selections.
    while (candidates.length < 201) {
      const start = index.text.indexOf(anchor.exact, from);
      if (start < 0) break;
      const end = start + anchor.exact.length;
      const before = index.text.slice(Math.max(0, start - anchor.prefix.length), start);
      const after = index.text.slice(end, end + anchor.suffix.length);
      const context = commonSuffix(before, anchor.prefix) + commonPrefix(after, anchor.suffix);
      const distance = Math.abs(start - anchor.start);
      candidates.push({ start, context, score: context * 4 - Math.min(12, distance / 1000) });
      from = start + 1;
    }
    if (!candidates.length || candidates.length > 200) return null;
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    const expected = anchor.prefix.length + anchor.suffix.length;
    // A low-context match can be a different occurrence left behind after deletion.
    // Strict enough to avoid silently relinking a removed quote to another
    // identical passage. At least one side of the saved context should survive.
    if (expected >= 12 && winner.context < Math.ceil(expected * 0.35)) return null;
    if (candidates.length > 1 && winner.score - candidates[1].score < 2) return null;
    const range = makeRange(index, winner.start, winner.start + anchor.exact.length);
    if (!range) return null;
    return {
      range, start: winner.start, end: winner.start + anchor.exact.length,
      confidence: winner.start === anchor.start ? 'exact-position' : 'quote-context'
    };
  }
}
