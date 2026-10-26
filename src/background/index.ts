// MV3 background entry shared by the Chromium service worker and the Firefox
// event page. Browser-facing calls go through JP.extensionApi() rather than
// depending on a specific vendor namespace.
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
/** Firefox can discard dynamic registrations on an add-on update even when
 * host permissions persist. Reconcile registrations on install/startup and on
 * permission changes, using only explicitly granted HTTPS/HTTP sites. */
function supportedGrant(pattern: string): boolean {
  return /^https?:\/\/[a-zA-Z0-9.-]+\/\*$/.test(pattern) && !pattern.includes('..');
}
async function registerMatch(match: string): Promise<void> {
  const id = registrationId(match);
  const registered = await api.scripting.getRegisteredContentScripts({ ids: [id] });
  if (registered.length) return;
  try {
    await api.scripting.registerContentScripts([{
      id, matches: [match], js: [CONTENT_SCRIPT], css: [HIGHLIGHT_CSS],
      runAt: 'document_idle', persistAcrossSessions: true
    }]);
  } catch (error) {
    // The permission event and the settings request can run concurrently.
    const now = await api.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!now.length) throw error;
  }
}
async function registerSite(origin: string): Promise<void> {
  const match = matchForOrigin(origin);
  if (!await api.permissions.contains({ origins: [match] })) throw new Error('Site permission not granted');
  await registerMatch(match);
}
async function reconcileSiteScripts(): Promise<void> {
  const granted: string[] = (await api.permissions.getAll()).origins || [];
  const allowed = new Set(granted.filter(supportedGrant));
  const registered = await api.scripting.getRegisteredContentScripts();
  for (const script of registered as Array<{ id: string; matches?: string[] }>) {
    if (!script.id.startsWith('jotpatch_site_')) continue;
    const match = script.matches?.[0];
    if (!match || !allowed.has(match)) {
      await api.scripting.unregisterContentScripts({ ids: [script.id] });
    }
  }
  for (const match of allowed) await registerMatch(match);
}
async function send(tabId: number, message: unknown): Promise<any> {
  return api.tabs.sendMessage(tabId, message);
}
async function contentReady(tabId: number): Promise<boolean> {
  try { return (await send(tabId, {type:'JP_PING'}))?.ready === true; }
  catch { return false; }
}
async function waitUntilReady(tabId: number): Promise<void> {
  for(let n=0;n<5;n++) {
    if(await contentReady(tabId))return;
    if(n<4)await new Promise<void>(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Content script did not become ready after injection');
}
async function ensureInjected(tabId: number): Promise<void> {
  if(await contentReady(tabId))return;
  await api.scripting.insertCSS({target:{tabId},files:[HIGHLIGHT_CSS]});
  await api.scripting.executeScript({target:{tabId},files:[CONTENT_SCRIPT]});
  await waitUntilReady(tabId);
}
async function showActivationHelp(reason:'restricted'|'failed'): Promise<void> {
  try { await api.tabs.create({url:api.runtime.getURL(`options.html?help=${reason}`)}); }
  catch(error){console.warn('JotPatch could not show setup help:',error);}
}
function supportedPage(url:string|undefined):boolean {
  if(!url)return true;
  try{return ['http:','https:'].includes(new URL(url).protocol);}
  catch{return false;}
}
api.action.onClicked.addListener(async(tab:any)=>{
  if(typeof tab?.id!=='number'){await showActivationHelp('restricted');return;}
  if(!supportedPage(tab.url)){await showActivationHelp('restricted');return;}
  try{
    const ready=await contentReady(tab.id);
    if(!ready)await ensureInjected(tab.id);
    const response=await send(tab.id,{type:ready?'JP_TOGGLE_LAUNCHER':'JP_OPEN_LAUNCHER'});
    if(response?.ok!==true)throw new Error('Content script did not acknowledge launcher');
  }catch(error){
    console.warn('JotPatch could not activate on this page:',error);
    await showActivationHelp('failed');
  }
});

async function installContextMenu(): Promise<void> {
  // Recreate idempotently on install/update; no background-resident state.
  // Firefox's namespace is promise-only, Chromium's removeAll takes a callback.
  if (promiseReplies) await api.contextMenus.removeAll();
  else await new Promise<void>((resolve) => api.contextMenus.removeAll(() => resolve()));
  api.contextMenus.create({ id: SELECTION_MENU, title: '📌 添加 JotPatch 便签', contexts: ['selection'] });
}
function initializeExtension(): void {
  void installContextMenu().catch((error: Error) => console.warn('JotPatch context menu setup failed:', error));
  void reconcileSiteScripts().catch((error: Error) => console.warn('JotPatch site restore failed:', error));
}
api.runtime.onInstalled.addListener(initializeExtension);
api.runtime.onStartup.addListener(() => {
  void reconcileSiteScripts().catch((error: Error) => console.warn('JotPatch site restore failed:', error));
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

api.permissions.onAdded.addListener(() => {
  void reconcileSiteScripts().catch((error: Error) => console.warn('JotPatch site restore failed:', error));
});
api.permissions.onRemoved.addListener(() => {
  void reconcileSiteScripts().catch((error: Error) => console.warn('JotPatch permission cleanup failed:', error));
});
