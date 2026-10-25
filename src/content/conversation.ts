namespace JP {
  function compactText(node: Element): string {
    return ((node as HTMLElement).innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110);
  }
  function usable(node: Element): boolean {
    return node.isConnected && !node.closest('nav, aside, [role="dialog"], [aria-hidden="true"], [data-jotpatch-exclude]') &&
      node.getClientRects().length > 0;
  }
  function sourceId(node: Element): string | null {
    const candidates = [node, node.querySelector('[data-message-id], [data-turn-id], [data-turn-key]')];
    for (const candidate of candidates) {
      if (!candidate) continue;
      for (const key of ['data-turn-key', 'data-turn-id', 'data-message-id']) {
        const value = candidate.getAttribute(key);
        if (value && value.length <= 200) return `${key}:${value}`;
      }
    }
    const identifier=node.id;
    // Stable-looking public HTML IDs are a fallback for Gemini user-query.
    // Do not cache arbitrary ephemeral React-generated IDs.
    if(identifier && identifier.length<=160 && /(?:turn|message|query|conversation)/i.test(identifier))
      return `id:${identifier}`;
    return null;
  }
  export function conversationScrollRoot(element: Element): Element {
    let ancestor: Element | null = element.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      if (/(auto|scroll)/.test(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 15) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  export function conversationScrollHint(element: Element): number {
    const root = conversationScrollRoot(element);
    if (root === document.scrollingElement) return root.scrollTop + element.getBoundingClientRect().top;
    return root.scrollTop + element.getBoundingClientRect().top - root.getBoundingClientRect().top;
  }
  export function navigateToPrompt(element: Element): void {
    const root = conversationScrollRoot(element);
    const top = element.getBoundingClientRect().top;
    const rootTop = root === document.scrollingElement ? 0 : root.getBoundingClientRect().top;
    // Align the precise user message bubble near the TOP, not the answer midpoint.
    // Negative scrollTop is valid for reverse-direction scroll containers.
    const desired = root.scrollTop + top - rootTop - 86;
    root.scrollTo({ top: desired, behavior: 'auto' });
  }

  export function collectConversation(url: URL = new URL(location.href)): ConversationSnapshot {
    const adapter = findConversationAdapter(url);
    const site = adapter?.site || null;
    if (!adapter || !document.body) return { site, turns: [], nativeRailPresent: false };
    const seen = new Set<Element>();
    const seenPrompts = new Set<Element>();
    const sameText = new Map<string, ConversationTurn[]>();
    const turns: ConversationTurn[] = [];
    for (const candidate of Array.from(document.querySelectorAll(adapter.selectors))) {
      const wrapper = adapter.canonical(candidate);
      if (seen.has(wrapper)) continue;
      const prompt = adapter.prompt(candidate, wrapper);
      if (!usable(prompt)) continue;
      // Nested or overlapping wrappers can expose the same user bubble through
      // multiple selectors. Count the real prompt once, not each React shell.
      if(seenPrompts.has(prompt))continue;
      const text=compactText(prompt);
      const rect=prompt.getBoundingClientRect();
      // During a React transition, two different shells can briefly paint the
      // SAME question at the SAME visual coordinates. This is not two turns.
      // Equal text at distinct positions is NOT de-duplicated.
      if((sameText.get(text)||[]).some(turn=>turn.element && (()=>{
        const old=turn.element.getBoundingClientRect();
        return Math.abs(old.top-rect.top)<4 && Math.abs(old.left-rect.left)<12;
      })()))continue;
      seen.add(wrapper);seenPrompts.add(prompt);
      const stableId = sourceId(wrapper) || sourceId(candidate) || sourceId(prompt) || undefined;
      const turn={ id: stableId || `ordinal:${turns.length}`, order: turns.length,
        preview: text || '非文本提问', element: prompt, stableId,
        scrollHint: conversationScrollHint(prompt),
        scrollExtent: conversationScrollRoot(prompt).scrollHeight };
      turns.push(turn);
      if(!sameText.has(text))sameText.set(text,[]);
      sameText.get(text)!.push(turn);
      if (turns.length >= 1200) break;
    }
    const used = new Set<string>();
    for (const turn of turns) {
      if (used.has(turn.id)) { turn.stableId = undefined; turn.id = `ordinal:${turn.order}`; }
      used.add(turn.id);
    }
    return { site, turns, nativeRailPresent: adapter.nativeRailPresent?.() || false };
  }

  export function turnForRange(range: Range, turns: ConversationTurn[]): ConversationTurn | null {
    if (!turns.length) return null;
    let previous: ConversationTurn | null = null;
    const point = range.startContainer;
    for (const turn of turns) {
      if (!turn.element || !turn.element.isConnected) continue;
      if (turn.element.contains(point)) return turn;
      const relation = turn.element.compareDocumentPosition(point);
      if (relation & Node.DOCUMENT_POSITION_DISCONNECTED) continue;
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) previous = turn;
      else break;
    }
    return previous;
  }
}
