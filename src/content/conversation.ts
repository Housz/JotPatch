namespace JP {
  export type ConversationSite = 'chatgpt' | 'gemini';

  /** The scroll target MUST be the user prompt, never an article containing the AI reply. */
  export interface ConversationTurn {
    id: string;
    order: number;
    preview: string;
    element: Element | null;
    /** Only turns with a site-provided stable identity are safe to cache across unmounts. */
    stableId?: string;
    /** Approximate document scroll position captured while mounted, not a guaranteed locator. */
    scrollHint?: number;
  }
  export interface ConversationSnapshot {
    site: ConversationSite | null;
    turns: ConversationTurn[];
    nativeRailPresent: boolean;
  }
  interface ConversationAdapter {
    site: ConversationSite;
    selectors: string;
    canonical(node: Element): Element;
    prompt(node: Element, wrapper: Element): Element;
  }
  const CHATGPT: ConversationAdapter = {
    site: 'chatgpt',
    selectors: [
      'article[data-turn="user"]', '[data-turn="user"]',
      '[data-message-author-role="user"]', '[data-user-message-bubble]',
      '[data-testid="user-message"]'
    ].join(','),
    canonical(node) {
      return node.closest('article[data-turn="user"], article[data-testid^="conversation-turn-"], [data-turn-key]') || node;
    },
    prompt(node, wrapper) {
      // The wrapper can contain *both* user and assistant content. Scroll to
      // the prompt bubble itself, not the wrapper midpoint.
      const bubble = wrapper.querySelector('[data-user-message-bubble], [data-testid="user-message"]');
      if (bubble && (bubble.contains(node) || node.contains(bubble))) return bubble!;
      if (node.matches('[data-user-message-bubble], [data-testid="user-message"]')) return node;
      return node.querySelector('[data-user-message-bubble], .user-message-bubble-color, .whitespace-pre-wrap') || node;
    }
  };
  const GEMINI: ConversationAdapter = {
    site: 'gemini',
    selectors: 'user-query, [data-test-id="user-query"], [data-testid="user-query"]',
    canonical(node) { return node.closest('user-query') || node; },
    prompt(node, wrapper) {
      return wrapper.querySelector('.query-text, .user-query-content, .query-content, [data-test-id="query-text"], .query-text-line, .text-query') || node;
    }
  };

  export function conversationSite(url: URL = new URL(location.href)): ConversationSite | null {
    const host = url.hostname.toLowerCase();
    if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
    if (host === 'gemini.google.com') return 'gemini';
    return null;
  }
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
  function nativeRail(): boolean {
    const node = document.querySelector('[data-testid="conversation-timeline"], [data-testid="conversation-navigation"], [aria-label="Conversation navigation"], [aria-label="对话导航"]');
    return !!node && node.getClientRects().length > 0;
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
    const desired = Math.max(0, root.scrollTop + top - rootTop - 86);
    root.scrollTo({ top: desired, behavior: 'auto' });
  }

  export function collectConversation(url: URL = new URL(location.href)): ConversationSnapshot {
    const site = conversationSite(url);
    if (!site || !document.body) return { site, turns: [], nativeRailPresent: false };
    const adapter = site === 'chatgpt' ? CHATGPT : GEMINI;
    const seen = new Set<Element>();
    const turns: ConversationTurn[] = [];
    for (const candidate of Array.from(document.querySelectorAll(adapter.selectors))) {
      const wrapper = adapter.canonical(candidate);
      if (seen.has(wrapper)) continue;
      const prompt = adapter.prompt(candidate, wrapper);
      if (!usable(prompt)) continue;
      seen.add(wrapper);
      const stableId = sourceId(wrapper) || sourceId(candidate) || sourceId(prompt) || undefined;
      turns.push({ id: stableId || `ordinal:${turns.length}`, order: turns.length,
        preview: compactText(prompt) || '非文本提问', element: prompt, stableId,
        scrollHint: conversationScrollHint(prompt) });
      if (turns.length >= 1200) break;
    }
    const used = new Set<string>();
    for (const turn of turns) {
      if (used.has(turn.id)) { turn.stableId = undefined; turn.id = `ordinal:${turn.order}`; }
      used.add(turn.id);
    }
    return { site, turns, nativeRailPresent: site === 'chatgpt' && nativeRail() };
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
