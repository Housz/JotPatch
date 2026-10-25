namespace JP {
  // A precise page URL (including meaningful query parameters) is the Phase 0 scope.
  // Fragment-only navigations are not distinguished unless they contain a hash route.
  export function pageKey(href: string): string {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    const hashRoute = /^#(?:\/|!)/.test(url.hash) ? url.hash : '';
    return `${url.origin}${url.pathname}${url.search}${hashRoute}`;
  }
}
