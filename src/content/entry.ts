namespace JP {
  // In Firefox a content script runs in its own isolated global. Store the
  // instance on that global, not on the page's Window/Xray wrapper.
  const owner = globalThis as typeof globalThis & { __jotpatchStage0?: JotPatchApp };
  // Repeated injection (e.g. from right-click menu) must not create a second UI.
  if (!owner.__jotpatchStage0) {
    const app = new JotPatchApp();
    owner.__jotpatchStage0 = app;
    void app.start();
  }
}
