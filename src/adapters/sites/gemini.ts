namespace JP {
  JP.registerConversationAdapter({
    matches(url) { return url.hostname.toLowerCase() === 'gemini.google.com'; },
    site: 'gemini',
    selectors: 'user-query, [data-test-id="user-query"], [data-testid="user-query"]',
    canonical(node) { return node.closest('user-query') || node; },
    prompt(node, wrapper) {
      return wrapper.querySelector('.query-text, .user-query-content, .query-content, [data-test-id="query-text"], .query-text-line, .text-query') || node;
    }
  });
}
