namespace JP {
  interface JotPatchGlobal {
    __jotpatchStage0?: JotPatchApp;
  }

  // `globalThis` is this extension's content-script global in both Chrome's
  // isolated world and Firefox's content-script sandbox, so the instance survives
  // a reinjection without writing a property onto the page's own window.
  const host = globalThis as unknown as JotPatchGlobal;

  // Re-execution after an extension icon click toggles existing UI rather than
  // injecting duplicate roots or observers.
  if (host.__jotpatchStage0) {
    host.__jotpatchStage0.toggle();
  } else if (!document.getElementById('jotpatch-root')) {
    // Defensive: a stray host element from another sandbox must not produce a
    // second toolbar or a second MutationObserver.
    const app = new JotPatchApp();
    host.__jotpatchStage0 = app;
    void app.start();
  }
}
