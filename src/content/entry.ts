namespace JP {
  interface JotPatchWindow extends Window { __jotpatchStage0?: JotPatchApp; }
  const owner = window as JotPatchWindow;
  // Repeated injection (e.g. from right-click menu) never hides existing notes.
  if (!owner.__jotpatchStage0) {
    const app = new JotPatchApp();
    owner.__jotpatchStage0 = app;
    void app.start();
  }
}
