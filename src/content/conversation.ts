namespace JP {
  export type ConversationSite = 'chatgpt' | 'gemini';

  /** DOM references are intentionally runtime-only: conversation text is never persisted. */
  export interface ConversationTurn {
    id: string;
    order: number;
    preview: string;
    element: Element;
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
    textSource(node: Element): Element;
  }

  const CHATGPT: ConversationAdapter = {
    site: 'chatgpt',
    // Support multiple observed generations of markup; these are not official APIs.
    selectors: [
      'article[data-turn="user"]', '[data-turn="user"]',
      '[data-message-author-role="user"]', '[data-user-message-bubble]',
      '[data-testid="user-message"]'
    ].join(','),
    canonical(node) {
      return node.closest('article[data-turn="user"], article[data-testid^="conversation-turn-"], [data-turn-key]') || node;
    },
    textSource(node) {
      return node.querySelector('[data-user-message-bubble], .user-message-bubble-color, [data-message-author-role="user"] .whitespace-pre-wrap, [data-message-author-role="user"], [data-testid="user-message"]') || node;
    }
  };

  const GEMINI: ConversationAdapter = {
    site: 'gemini',
    selectors: 'user-query, [data-test-id="user-query"], [data-testid="user-query"]',
    canonical(node) {
      return node.closest('user-query') || node;
    },
    textSource(node) {
      return node.querySelector('.query-text, .user-query-content, .query-content, [data-test-id="query-text"], .query-text-line, .text-query') || node;
    }
  };

  export function conversationSite(url: URL = new URL(location.href)): ConversationSite | null {
    const host = url.hostname.toLowerCase();
    if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
    if (host === 'gemini.google.com') return 'gemini';
    return null;
  }

  function compactText(node: Element): string {
    // innerText excludes display:none labels where supported and preserves visible lines.
    const readable = (node as HTMLElement).innerText || node.textContent || '';
    return readable.replace(/\s+/g, ' ').trim().slice(0, 110);
  }

  function isCandidateUsable(node: Element): boolean {
    if (!node.isConnected || node.closest('nav, aside, [role="dialog"], [aria-hidden="true"], [data-jotpatch-exclude]')) return false;
    // getClientRects is non-empty for scroll-offscreen nodes, but empty for display:none.
    return node.getClientRects().length > 0;
  }

  function sourceId(node: Element): string | null {
    for (const candidate of [node, node.querySelector('[data-message-id], [data-turn-id], [data-turn-key]')]) {
      if (!candidate) continue;
      for (const attr of ['data-turn-id', 'data-turn-key', 'data-message-id']) {
        const value = candidate.getAttribute(attr);
        if (value && value.length <= 200) return `${attr}:${value}`;
      }
    }
    return null;
  }

  function nativeChatGPTRailPresent(): boolean {
    // Conservative opt-out: only recognize explicitly identified native navigation.
    // A generic <nav> might be the history sidebar and must NOT disable JotPatch.
    const native = document.querySelector(
      '[data-testid="conversation-timeline"], [data-testid="conversation-navigation"], ' +
      '[aria-label="Conversation navigation"], [aria-label="对话导航"]'
    );
    return !!native && native.getClientRects().length > 0;
  }

  export function collectConversation(url: URL = new URL(location.href)): ConversationSnapshot {
    const site = conversationSite(url);
    const empty: ConversationSnapshot = { site, turns: [], nativeRailPresent: false };
    if (!site || !document.body) return empty;
    const adapter = site === 'chatgpt' ? CHATGPT : GEMINI;
    const seen = new Set<Element>();
    const turns: ConversationTurn[] = [];
    for (const candidate of Array.from(document.querySelectorAll(adapter.selectors))) {
      const wrapper = adapter.canonical(candidate);
      if (seen.has(wrapper) || !isCandidateUsable(wrapper)) continue;
      seen.add(wrapper);
      const textTarget = adapter.textSource(wrapper);
      const preview = compactText(textTarget) || '非文本提问';
      const rawId = sourceId(wrapper) || sourceId(candidate);
      // The fallback is intentionally ephemeral; never store it as a note anchor.
      turns.push({ id: rawId || `ordinal:${turns.length}`, order: turns.length, preview, element: wrapper });
      // Protect against pathological site markup with thousands of repeated nodes.
      if (turns.length >= 1200) break;
    }
    // querySelectorAll traverses in document order, even with multiple selector alternatives.
    // Duplicate upstream IDs are not trusted as stable identities.
    const used = new Set<string>();
    for (const turn of turns) {
      if (used.has(turn.id)) turn.id = `ordinal:${turn.order}`;
      used.add(turn.id);
    }
    return { site, turns, nativeRailPresent: site === 'chatgpt' && nativeChatGPTRailPresent() };
  }

  /** Associate notes with the most recent preceding user question, not the quote text. */
  export function turnForRange(range: Range, turns: ConversationTurn[]): ConversationTurn | null {
    if (!turns.length) return null;
    let previous: ConversationTurn | null = null;
    const point = range.startContainer;
    for (const turn of turns) {
      if (turn.element.contains(point)) return turn;
      const relation = turn.element.compareDocumentPosition(point);
      if (relation & Node.DOCUMENT_POSITION_DISCONNECTED) return null;
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) previous = turn;
      else break;
    }
    return previous;
  }
}
