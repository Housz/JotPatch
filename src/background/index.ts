// Background entry point shared by Chrome (MV3 service worker) and Firefox
// (MV3 event page). Kept free of DOM access so one bundle runs in both.
namespace JP {
  async function activate(tabId: number): Promise<void> {
    await JP.api.scripting.insertCSS({ target: { tabId }, files: [HIGHLIGHT_CSS] });
    await JP.api.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  }

  JP.api?.action?.onClicked?.addListener((tab: any) => {
    if (typeof tab?.id !== 'number') return;
    void activate(tab.id).catch((error: Error) => {
      console.warn('JotPatch cannot run on this page:', error);
    });
  });

  JP.api?.runtime?.onMessage?.addListener((message: any, sender: any, respond: (value: unknown) => void) => {
    if (message?.type !== 'JP_OPEN_SITE_SETUP' || !sender?.tab?.url) return false;
    // Respond synchronously so the same listener shape works in both browsers.
    try {
      const origin = new URL(sender.tab.url).origin;
      buildMatchPattern(origin);
      const url = JP.api.runtime.getURL(`options.html?origin=${encodeURIComponent(origin)}`);
      void JP.api.tabs.create({ url });
      respond({ ok: true });
    } catch {
      respond({ ok: false, error: 'Unsupported page' });
    }
    return false;
  });

  const resync = (): void => {
    void syncSiteScripts().catch((error: Error) => console.warn('JotPatch site sync failed:', error));
  };

  // Registered scripts persist across restarts, but an extension update clears
  // them, and a revoked optional host permission must remove its script.
  JP.api?.runtime?.onInstalled?.addListener(resync);
  JP.api?.runtime?.onStartup?.addListener(resync);
  JP.api?.permissions?.onAdded?.addListener(resync);
  JP.api?.permissions?.onRemoved?.addListener(resync);
}
