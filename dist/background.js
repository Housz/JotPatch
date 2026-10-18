"use strict";
const CONTENT_SCRIPT = 'dist/content.js';
const HIGHLIGHT_CSS = 'styles/highlight.css';
const SELECTION_MENU = 'jotpatch-pin-selection';
function matchForOrigin(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
        throw new Error('Unsupported origin');
    return `${url.protocol}//${url.hostname}/*`;
}
function registrationId(origin) {
    let hash = 2166136261;
    for (const char of origin) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `jotpatch_site_${(hash >>> 0).toString(16)}`;
}
async function registerSite(origin) {
    const match = matchForOrigin(origin);
    if (!await chrome.permissions.contains({ origins: [match] }))
        throw new Error('Site permission not granted');
    const id = registrationId(match);
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!registered.length) {
        await chrome.scripting.registerContentScripts([{
                id, matches: [match], js: [CONTENT_SCRIPT], css: [HIGHLIGHT_CSS],
                runAt: 'document_idle', persistAcrossSessions: true
            }]);
    }
}
async function send(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
}
async function ensureInjected(tabId) {
    try {
        if (await send(tabId, { type: 'JP_PING' }))
            return;
    }
    catch { /* Not yet injected. */ }
    await chrome.scripting.insertCSS({ target: { tabId }, files: [HIGHLIGHT_CSS] });
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}
chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== 'number')
        return;
    try {
        const active = await send(tab.id, { type: 'JP_PING' }).catch(() => false);
        if (!active) {
            await ensureInjected(tab.id);
            await send(tab.id, { type: 'JP_OPEN_LAUNCHER' });
        }
        else {
            await send(tab.id, { type: 'JP_TOGGLE_LAUNCHER' });
        }
    }
    catch (error) {
        console.warn('JotPatch cannot run on this page:', error);
    }
});
function installContextMenu() {
    // Recreate idempotently on install/update; no background-resident state.
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: SELECTION_MENU, title: '📌 添加 JotPatch 便签', contexts: ['selection'] });
    });
}
chrome.runtime.onInstalled.addListener(installContextMenu);
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== SELECTION_MENU || typeof tab?.id !== 'number')
        return;
    try {
        // For Stage 1 the main document is supported. Context-menu selectionText
        // is only a hint; the content script rejects ambiguous reattachment.
        if (info.frameId && info.frameId !== 0)
            return;
        await ensureInjected(tab.id);
        await send(tab.id, { type: 'JP_CREATE_FROM_CONTEXT', selectionText: info.selectionText || '' });
    }
    catch (error) {
        console.warn('JotPatch context menu failed:', error);
    }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'JP_OPEN_SITE_SETUP' && sender.tab?.url) {
        try {
            const origin = new URL(sender.tab.url).origin;
            matchForOrigin(origin);
            void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html?origin=${encodeURIComponent(origin)}`) });
            respond({ ok: true });
        }
        catch {
            respond({ ok: false, error: 'Unsupported page' });
        }
        return false;
    }
    if (message?.type === 'JP_REGISTER_SITE' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
        void registerSite(message.origin).then(() => respond({ ok: true }), (error) => respond({ ok: false, error: error.message }));
        return true;
    }
    return false;
});
chrome.permissions.onRemoved.addListener(async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    for (const script of scripts) {
        if (!script.id.startsWith('jotpatch_site_'))
            continue;
        const origins = script.matches || [];
        if (!await chrome.permissions.contains({ origins })) {
            await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
        }
    }
});
