// MV3 service worker: gesture-based activation and optional per-site restore.
declare const chrome: any;

const CONTENT_SCRIPT = 'dist/content.js';
const HIGHLIGHT_CSS = 'styles/highlight.css';

function matchForOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Unsupported origin');
  return `${url.protocol}//${url.hostname}/*`; // Match patterns never contain explicit ports.
}

function registrationId(origin: string): string {
  // Compact stable hash; collisions are possible but exceedingly rare for a tiny allowlist.
  let hash = 2166136261;
  for (const char of origin) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `jotpatch_site_${(hash >>> 0).toString(16)}`;
}

async function registerSite(origin: string): Promise<void> {
  const match = matchForOrigin(origin);
  const allowed = await chrome.permissions.contains({ origins: [match] });
  if (!allowed) throw new Error('Site permission not granted');
  const id = registrationId(match);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!registered.length) {
    await chrome.scripting.registerContentScripts([{
      id, matches: [match], js: [CONTENT_SCRIPT], css: [HIGHLIGHT_CSS],
      runAt: 'document_idle', persistAcrossSessions: true
    }]);
  }
}

async function activate(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({ target: { tabId }, files: [HIGHLIGHT_CSS] });
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}

chrome.action.onClicked.addListener(async (tab: any) => {
  if (typeof tab.id !== 'number') return;
  try {
    await activate(tab.id);
  } catch (error) {
    console.warn('JotPatch cannot run on this page:', error);
  }
});

chrome.runtime.onMessage.addListener((message: any, sender: any, respond: (value: unknown) => void) => {
  if (message?.type === 'JP_OPEN_SITE_SETUP' && sender.tab?.url) {
    try {
      const origin = new URL(sender.tab.url).origin;
      matchForOrigin(origin);
      const url = chrome.runtime.getURL(`options.html?origin=${encodeURIComponent(origin)}`);
      void chrome.tabs.create({ url });
      respond({ ok: true });
    } catch { respond({ ok: false, error: 'Unsupported page' }); }
    return false;
  }
  if (message?.type === 'JP_REGISTER_SITE' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
    void registerSite(message.origin).then(
      () => respond({ ok: true }),
      (error: Error) => respond({ ok: false, error: error.message })
    );
    return true;
  }
  return false;
});

chrome.permissions.onRemoved.addListener(async () => {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  for (const script of scripts as Array<{ id: string; matches?: string[] }>) {
    if (!script.id.startsWith('jotpatch_site_')) continue;
    const origins = script.matches || [];
    const stillAllowed = await chrome.permissions.contains({ origins });
    if (!stillAllowed) await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
  }
});
