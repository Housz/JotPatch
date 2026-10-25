namespace JP {
  JP.registerConversationAdapter({
    matches(url) { return url.hostname.toLowerCase() === 'chatgpt.com' || url.hostname.toLowerCase() === 'chat.openai.com'; },
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
    },
    nativeRailPresent() {
      const node = document.querySelector('[data-testid="conversation-timeline"], [data-testid="conversation-navigation"], [aria-label="Conversation navigation"], [aria-label="对话导航"]');
      return !!node && node.getClientRects().length > 0;
    }
  });
}
