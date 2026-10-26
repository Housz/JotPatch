namespace JP {
  // A precise page URL (including meaningful query parameters) is the Phase 0 scope.
  // Fragment-only navigations are not distinguished unless they contain a hash route.
  export function pageKey(href: string): string {
    const url = new URL(href);
    // Firefox content-script Xray wrappers can expose URLSearchParams.keys()
    // without an iterable result. forEach is supported by both browser APIs.
    // Gather keys before deleting so mutation does not skip repeated values.
    const trackingKeys: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key)) trackingKeys.push(key);
    });
    for (const key of trackingKeys) url.searchParams.delete(key);
    url.searchParams.sort();
    const hashRoute = /^#(?:\/|!)/.test(url.hash) ? url.hash : '';
    return `${url.origin}${url.pathname}${url.search}${hashRoute}`;
  }
}
