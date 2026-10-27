namespace JP {
  const EXCLUDED = 'script, style, noscript, textarea, select, option, input, button, svg, template, [contenteditable], [hidden], [aria-hidden="true"], [data-jotpatch-exclude]';
  const CONTEXT = 48;
  const MAX_QUOTE = 1600;
  const MAX_INDEX_CHARS = 2_000_000;

  // KaTeX renders one formula as assistive MathML plus visible HTML. A raw
  // Range.toString() may duplicate or omit it; SVG-only math has no text node.
  // Build one stable text token from the page's own TeX annotation instead.
  const MATH_ROOT = '.katex, mjx-container, math';
  function formulaRoot(element: Element): Element | null {
    const nearest = element.closest(MATH_ROOT);
    return nearest?.closest('.katex, mjx-container') || nearest;
  }
  function formulaText(element: Element): string | null {
    const original = element.querySelector('annotation[encoding^="application/x-tex"]')?.textContent
      || element.getAttribute('data-tex') || element.getAttribute('data-latex')
      || element.querySelector('math[alttext]')?.getAttribute('alttext')
      || element.getAttribute('alttext') || element.getAttribute('aria-label');
    const text = original?.trim();
    // Stable, unambiguous delimiters: never insert untrusted LaTeX as HTML.
    return text ? '\\(' + text + '\\)' : null;
  }
  function isFormula(element: Element): boolean {
    return element.matches('.katex, mjx-container') || element.localName === 'math';
  }

  /** True when a selection covers a formula with recoverable markup. */
  export function rangeContainsReadableMath(range: Range): boolean {
    const origin = range.commonAncestorContainer;
    const element = origin.nodeType === Node.ELEMENT_NODE ? origin as Element : origin.parentElement;
    if (!element) return false;
    const ancestor = formulaRoot(element);
    if (ancestor && formulaText(ancestor) && range.intersectsNode(ancestor)) return true;
    for (const candidate of Array.from(element.querySelectorAll(MATH_ROOT))) {
      const root = formulaRoot(candidate);
      if (root && formulaText(root) && range.intersectsNode(root)) return true;
    }
    return false;
  }

  /** Linear text index with single virtual segments for supported math. */
  export function buildTextIndex(root: Node = document.body): TextIndex {
    const nodes: TextIndex['nodes'] = [];
    const math: TextIndex['math'] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (element.closest(EXCLUDED)) return NodeFilter.FILTER_REJECT;
          const parentMath = element.parentElement && formulaRoot(element.parentElement);
          if (parentMath && formulaText(parentMath)) return NodeFilter.FILTER_REJECT;
          return isFormula(element) && formulaText(element)
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        const item = node as Text;
        if (!item.data || !item.parentElement || item.parentElement.closest(EXCLUDED))
          return NodeFilter.FILTER_REJECT;
        const parentMath = formulaRoot(item.parentElement);
        if (parentMath && formulaText(parentMath)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let text = '';
    let truncated = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.nodeType === Node.TEXT_NODE ? (node as Text).data : formulaText(node as Element);
      if (!value) continue;
      if (text.length + value.length > MAX_INDEX_CHARS) { truncated = true; break; }
      const start = text.length;
      text += value;
      if (node.nodeType === Node.TEXT_NODE) nodes.push({node: node as Text, start, end: text.length});
      else math.push({node: node as Element, start, end: text.length});
    }
    return {text, nodes, math, truncated};
  }

  type Segment = {node: Text | Element; start: number; end: number};
  /** Text and formula segments are already ordered within each list.
   *  Merge lazily: sorting the whole page during every candidate probe is
   *  prohibitively expensive in long, virtualized conversations. */
  function* orderedSegments(index: TextIndex): IterableIterator<Segment> {
    let text = 0, math = 0;
    while (text < index.nodes.length || math < index.math.length) {
      if (math >= index.math.length ||
          (text < index.nodes.length && index.nodes[text].start <= index.math[math].start))
        yield index.nodes[text++];
      else yield index.math[math++];
    }
  }

  function boundaryOffset(index: TextIndex, node: Node, offset: number, isEnd: boolean): number | null {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const mathNode = element && formulaRoot(element);
    const segment = mathNode && index.math.find(item => item.node === mathNode);
    // Selecting even part of the rendered formula anchors the whole formula.
    if (segment) return isEnd ? segment.end : segment.start;
    if (node.nodeType === Node.TEXT_NODE) {
      const item = index.nodes.find(entry => entry.node === node);
      if (!item) return null;
      return item.start + Math.max(0, Math.min(offset, item.end - item.start));
    }
    try {
      const point = document.createRange();
      point.setStart(node, offset);
      point.collapse(true);
      for (const entry of orderedSegments(index))
        if (point.comparePoint(entry.node, 0) > 0) return entry.start;
      return index.text.length;
    } catch { return null; }
  }

  export function captureSelection(range: Range, index: TextIndex): TextAnchor | null {
    if (range.collapsed) return null;
    const start = boundaryOffset(index, range.startContainer, range.startOffset, false);
    const end = boundaryOffset(index, range.endContainer, range.endOffset, true);
    if (start === null || end === null || end <= start || end - start > MAX_QUOTE) return null;
    const exact = index.text.slice(start, end);
    if (!exact.trim()) return null;
    return {
      version: 1, type: 'text', exact,
      prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
      suffix: index.text.slice(end, end + CONTEXT), start, end
    };
  }

  function toPoint(index: TextIndex, offset: number, isEnd: boolean): {node: Node; offset: number} | null {
    let last: Segment | null = null;
    for (const entry of orderedSegments(index)) {
      last = entry;
      if (offset < entry.end || (isEnd && offset === entry.end)) {
        if (entry.node.nodeType === Node.TEXT_NODE)
          return {node: entry.node, offset: offset - entry.start};
        const element = entry.node as Element, parent = element.parentNode;
        if (!parent) return null;
        const childIndex = Array.prototype.indexOf.call(parent.childNodes, element) as number;
        if (childIndex < 0) return null;
        if (offset === entry.start) return {node: parent, offset: childIndex};
        if (offset === entry.end) return {node: parent, offset: childIndex + 1};
        // Never turn a substring of a TeX token into the wrong DOM Range.
        return null;
      }
    }
    if (last && offset === last.end) {
      if (last.node.nodeType === Node.TEXT_NODE)
        return {node: last.node, offset: (last.node as Text).length};
      const parent = last.node.parentNode;
      if (parent) return {node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, last.node) + 1};
    }
    return null;
  }

  function makeRange(index: TextIndex, start: number, end: number): Range | null {
    const a = toPoint(index, start, false), b = toPoint(index, end, true);
    if (!a || !b) return null;
    try {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      return range.collapsed ? null : range;
    } catch { return null; }
  }

  /** Test cached Range against the live DOM without indexing on every scroll. */
  export function liveAnchorMatch(match: Match, anchor: TextAnchor, index: TextIndex | null): boolean {
    const range = match.range;
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return false;
    const math = index?.math.filter(item => item.start < match.end && item.end > match.start) || [];
    if (!math.length) return range.toString() === anchor.exact;
    if (!index || index.text.slice(match.start, match.end) !== anchor.exact) return false;
    for (const entry of math) {
      if (!entry.node.isConnected || !range.intersectsNode(entry.node) ||
          formulaText(entry.node) !== index.text.slice(entry.start, entry.end)) return false;
    }
    for (const entry of index.nodes) {
      if (entry.end <= match.start || entry.start >= match.end) continue;
      if (!entry.node.isConnected || entry.node.length !== entry.end - entry.start ||
          entry.node.data !== index.text.slice(entry.start, entry.end)) return false;
    }
    return true;
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
  export function resolveAnchor(anchor: TextAnchor, index: TextIndex,
    allowedRange?: (range: Range)=>boolean): Match | null {
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
      const probe=makeRange(index,start,end);
      if(!probe || (allowedRange && !allowedRange(probe))){from=start+1;continue;}
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
  /** Context-menu fallback only when an exact normalized quote is unique.
   *  LaTeX substrings inside a virtual math token cannot become partial ranges. */
  export function uniqueQuoteRange(exact: string, index: TextIndex): Range | null {
    if (!exact.trim() || exact.length > 1600) return null;
    const first = index.text.indexOf(exact);
    if (first < 0 || index.text.indexOf(exact, first + 1) >= 0) return null;
    // Expose the same safe DOM boundary mapping used by resolveAnchor.
    return makeRange(index, first, first + exact.length);
  }
}
