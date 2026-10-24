// Cross-browser WebExtension entry point.
// Firefox exposes the promise-based `browser` namespace, Chromium the callback-
// and promise-based `chrome` namespace. Every API this extension touches
// (storage, runtime, scripting, permissions, tabs, action) returns a promise in
// both browsers, so one await-based call site works everywhere.
declare const chrome: any;
declare const browser: any;

namespace JP {
  export const api: any =
    (typeof browser !== 'undefined' && browser) ||
    (typeof chrome !== 'undefined' && chrome) ||
    undefined;
}
