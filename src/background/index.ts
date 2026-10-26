// MV3 background entry shared by the Chromium service worker and the Firefox
// event page. Every browser-window concern goes through JP.extensionApi(), so
// this file stays free of bare chrome.*/browser.* references.
const api = JP.extensionApi();

// Firefox exposes the promise-based `browser` namespace; Chromium exposes
// `chrome` and needs sendResponse + `return true` for asynchronous replies.
// Detecting the namespace keeps both message styles correct instead of assuming
// one convention works everywhere.
const promiseReplies = typeof (globalThis as unknown as { browser?: unknown }).browser !== 'undefined';

const CONTENT_SCRIPT = 'dist/content.js';
const HIGHLIGHT_CSS = 'styles/highlight.css';
const SELECTION_MENU = 'jotpatch-pin-selection';

function matchForOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Unsupported origin');
  return `${url.protocol}//${url.hostname}/*`;
}
function registrationId(origin: string): string {
  let hash = 2166136261;
  for (const char of origin) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `jotpatch_site_${(hash >>> 0).toString(16)}`;
}
async function registerSite(origin: string): Promise<void> {
  const match = matchForOrigin(origin);
  if (!await api.permissions.contains({ origins: [match] })) throw new Error('Site permission not granted');
  const id = registrationId(match);
  const registered = await api.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!registered.length) {
    await api.scripting.registerContentScripts([{
      id, matches: [match], js: [CONTENT_SCRIPT], css: [HIGHLIGHT_CSS],
      runAt: 'document_idle', persistAcrossSessions: true
    }]);
  }
}
async function send(tabId: number, message: unknown): Promise<unknown> {
  return api.tabs.sendMessage(tabId, message);
}
async function ensureInjected(tabId: number): Promise<void> {
  try {
    if (await send(tabId, { type: 'JP_PING' })) return;
  } catch { /* Not yet injected. */ }
  await api.scripting.insertCSS({ target: { tabId }, files: [HIGHLIGHT_CSS] });
  await api.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}

api.action.onClicked.addListener(async (tab: any) => {
  if (typeof tab?.id !== 'number') return;
  try {
    const active = await send(tab.id, { type: 'JP_PING' }).catch(() => false);
    if (!active) {
      await ensureInjected(tab.id);
      await send(tab.id, { type: 'JP_OPEN_LAUNCHER' });
    } else {
      await send(tab.id, { type: 'JP_TOGGLE_LAUNCHER' });
    }
  } catch (error) { console.warn('JotPatch cannot run on this page:', error); }
});

async function installContextMenu(): Promise<void> {
  // Recreate idempotently on install/update; no background-resident state.
  // Firefox's namespace is promise-only, Chromium's removeAll takes a callback.
  if (promiseReplies) await api.contextMenus.removeAll();
  else await new Promise<void>((resolve) => api.contextMenus.removeAll(() => resolve()));
  api.contextMenus.create({ id: SELECTION_MENU, title: '📌 添加 JotPatch 便签', contexts: ['selection'] });
}
api.runtime.onInstalled.addListener(() => {
  void installContextMenu().catch((error: Error) => console.warn('JotPatch context menu setup failed:', error));
});
api.contextMenus.onClicked.addListener(async (info: any, tab: any) => {
  if (info.menuItemId !== SELECTION_MENU || typeof tab?.id !== 'number') return;
  try {
    // For Stage 1 the main document is supported. Context-menu selectionText
    // is only a hint; the content script rejects ambiguous reattachment.
    if (info.frameId && info.frameId !== 0) return;
    await ensureInjected(tab.id);
    await send(tab.id, { type: 'JP_CREATE_FROM_CONTEXT', selectionText: info.selectionText || '' });
  } catch (error) { console.warn('JotPatch context menu failed:', error); }
});

api.runtime.onMessage.addListener((message: any, sender: any, respond: (value: unknown) => void) => {
  if (message?.type === 'JP_OPEN_SITE_SETUP' && sender.tab?.url) {
    // Synchronous reply: sendResponse works in both namespaces.
    try {
      const origin = new URL(sender.tab.url).origin;
      matchForOrigin(origin);
      void api.tabs.create({ url: api.runtime.getURL(`options.html?origin=${encodeURIComponent(origin)}`) });
      respond({ ok: true });
    } catch { respond({ ok: false, error: 'Unsupported page' }); }
    return false;
  }
  if (message?.type === 'JP_REGISTER_SITE' && sender.url?.startsWith(api.runtime.getURL(''))) {
    const pending = registerSite(message.origin).then(
      () => ({ ok: true }),
      (error: Error) => ({ ok: false, error: error.message })
    );
    // Firefox resolves the sender's promise from the listener's own promise;
    // Chromium needs the explicit async-reply sentinel.
    if (promiseReplies) return pending;
    void pending.then(respond);
    return true;
  }
  return false;
});

api.permissions.onRemoved.addListener(async () => {
  const scripts = await api.scripting.getRegisteredContentScripts();
  for (const script of scripts as Array<{ id: string; matches?: string[] }>) {
    if (!script.id.startsWith('jotpatch_site_')) continue;
    const origins = script.matches || [];
    if (!await api.permissions.contains({ origins })) {
      await api.scripting.unregisterContentScripts({ ids: [script.id] });
    }
  }
});
