namespace JP {
  interface JotPatchWindow extends Window {
    __jotpatchStage0?: JotPatchApp;
  }

  // Re-execution after an extension icon click toggles existing UI rather
  // than injecting duplicate roots or observers.
  const instanceWindow = window as JotPatchWindow;
  if (instanceWindow.__jotpatchStage0) {
    instanceWindow.__jotpatchStage0.toggle();
  } else {
    const app = new JotPatchApp();
    instanceWindow.__jotpatchStage0 = app;
    void app.start();
  }
}
