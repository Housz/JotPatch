import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

test('MV3 uses opt-in site permission rather than mandatory all-URL access', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.ok(!manifest.host_permissions?.includes('<all_urls>'));
});

test('built service worker and content script match manifest paths', () => {
  assert.ok(statSync(manifest.background.service_worker).size > 100);
  assert.ok(statSync('dist/content.js').size > 100);
  assert.ok(statSync('styles/highlight.css').size > 0);
});

test('content bundle includes capture/restore and unresolved-anchor paths', () => {
  const script = readFileSync('dist/content.js', 'utf8');
  for (const item of ['captureSelection', 'resolveAnchor', 'pageKey', 'jp-rail', 'jp-bubble-pin', 'jotpatch:note:v1:']) {
    assert.ok(script.includes(item), `Missing runtime capability: ${item}`);
  }
});
