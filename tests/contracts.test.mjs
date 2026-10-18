import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const content = readFileSync('dist/content.js', 'utf8');
const background = readFileSync('dist/background.js', 'utf8');

test('Manifest V3 grants only gesture-scoped injection and context-menu access', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'contextMenus']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
});

test('extension assets compile and match manifest paths', () => {
  for (const filename of [manifest.background.service_worker, 'dist/content.js', 'styles/highlight.css']) {
    assert.ok(statSync(filename).size > 100, `${filename} missing`);
  }
});

test('anchor matching, page keys, unresolved states, persisted note fields are retained', () => {
  for (const item of ['captureSelection', 'resolveAnchor', 'uniqueQuoteRange', 'pageKey', 'jp-rail',
    'jotpatch:note:v1:', 'offsetX', 'offsetY', 'resize-handle', 'JP_CREATE_FROM_CONTEXT']) {
    assert.ok(content.includes(item), `${item} missing from content script`);
  }
});

test('selection bubble has no label, no quote/title/footer, and no permanent toolbar', () => {
  const source = readFileSync('src/content/app.ts', 'utf8');
  assert.match(source, /id="jp-bubble-pin"[^>]*>📌<\/button>/);
  assert.doesNotMatch(source, /📌 原文便签|class="card-head"|class="card-foot"|id="jp-quote"/);
  assert.match(readFileSync('src/content/paper-styles.ts', 'utf8'), /\.paper\{--paper/);
});

test('right-click action and selection-trigger preference are included', () => {
  assert.ok(background.includes('chrome.contextMenus.onClicked.addListener'));
  assert.ok(background.includes('chrome.contextMenus.create'));
  assert.ok(content.includes("selectionTrigger === 'off'"));
  assert.ok(content.includes("selectionTrigger === 'alt'"));
  assert.ok(readFileSync('options.html', 'utf8').includes('value="alt"'));
});
