import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
const gecko = manifest.browser_specific_settings.gecko;

test('Firefox package uses an event page and carries no Chromium-only manifest keys', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background.scripts, ['dist/background.js']);
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.minimum_chrome_version, undefined);
  assert.equal(manifest.short_name, undefined);
  assert.equal(manifest.options_page, undefined);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.options_ui.page, 'options.html');
});

test('Firefox metadata pins a stable add-on id and a modern gecko floor', () => {
  assert.match(gecko.id, /^[^@]+@[^@]+$/);
  assert.ok(Number.parseInt(gecko.strict_min_version, 10) >= 142, gecko.strict_min_version);
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
});

test('packaged bundles resolve the browser namespace instead of Chrome-only globals', () => {
  for (const file of ['dist/content.js', 'dist/background.js', 'dist/options.js']) {
    const path = `dist/firefox/${file}`;
    const code = readFileSync(path, 'utf8');
    assert.ok(statSync(path).size > 100, file);
    assert.ok(code.includes('typeof browser'), `${file} lacks the browser/chrome compat check`);
    assert.ok(!/\bchrome\.(storage|runtime|scripting|permissions|action|tabs)\b/.test(code),
      `${file} calls a Chrome-only global directly`);
  }
});

test('Firefox content bundle keeps capture, restore, dock and storage contracts', () => {
  const script = readFileSync('dist/firefox/dist/content.js', 'utf8');
  for (const item of ['captureSelection', 'resolveAnchor', 'pageKey', 'jp-rail', 'jp-bubble-pin', 'jotpatch:note:v1:']) {
    assert.ok(script.includes(item), `Missing runtime capability: ${item}`);
  }
});

test('Firefox background bundle reconciles site scripts through the granted permissions', () => {
  const script = readFileSync('dist/firefox/dist/background.js', 'utf8');
  for (const item of ['syncSiteScripts', 'registerContentScripts', 'getRegisteredContentScripts',
    'unregisterContentScripts', 'persistAcrossSessions', 'permissions']) {
    assert.ok(script.includes(item), `Missing site-registration capability: ${item}`);
  }
});
