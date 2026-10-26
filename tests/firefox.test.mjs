import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {buildFirefoxManifest, verifyFirefoxManifest, FIREFOX_MIN_VERSION} from '../scripts/firefox-manifest.mjs';

const base = JSON.parse(readFileSync('manifest.json', 'utf8'));

test('Firefox manifest swaps the service worker for an event page and keeps the permission contract', () => {
  const manifest = buildFirefoxManifest(base, '0.1.17');
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background, {scripts: ['dist/background.js']});
  for (const key of ['short_name', 'minimum_chrome_version', 'version_name', 'options_page']) {
    assert.equal(manifest[key], undefined, `${key} must not ship to Gecko`);
  }
  assert.deepEqual(manifest.permissions, base.permissions);
  assert.deepEqual(manifest.optional_host_permissions, base.optional_host_permissions);
  assert.deepEqual(manifest.icons, base.icons);
  assert.deepEqual(manifest.options_ui, {page: 'options.html', open_in_tab: true});
  assert.equal(manifest.version, '0.1.17');
  assert.deepEqual(verifyFirefoxManifest(manifest), []);
});

test('Firefox metadata pins a stable add-on id, the gecko floor and the no-data declaration', () => {
  const gecko = buildFirefoxManifest(base, '0.1.17').browser_specific_settings.gecko;
  assert.equal(gecko.id, '{8801fba0-08ef-481b-a4b6-870a061b2878}');
  assert.equal(gecko.strict_min_version, FIREFOX_MIN_VERSION);
  assert.ok(Number.parseInt(gecko.strict_min_version, 10) >= 142, gecko.strict_min_version);
  assert.deepEqual(gecko.data_collection_permissions, {required: ['none']});
});

test('Firefox packaging refuses unhandled manifest keys instead of silently dropping features', () => {
  assert.throws(() => buildFirefoxManifest({...base, commands: {}}, '0.1.17'),
    /Unhandled Chromium manifest keys for Firefox: commands/);
  assert.throws(() => buildFirefoxManifest(base, '0.1.17-dev.1'), /numeric manifest version/);
});

test('background bundle reaches the runtime only through the browser seam', () => {
  const script = readFileSync('dist/background.js', 'utf8');
  assert.ok(statSync('dist/background.js').size > 500);
  assert.ok(script.includes('extensionApi'), 'background must resolve the runtime through extensionApi()');
  assert.doesNotMatch(script, /\bchrome\.(action|contextMenus|permissions|runtime|scripting|tabs|storage)\b/);
  for (const capability of ['registerContentScripts', 'getRegisteredContentScripts', 'unregisterContentScripts',
    'contextMenus', 'persistAcrossSessions']) {
    assert.ok(script.includes(capability), `missing capability: ${capability}`);
  }
});

test('options page resolves the browser namespace instead of hard-coding chrome', () => {
  const script = readFileSync('options.js', 'utf8');
  assert.match(script, /globalThis\.browser\?\.storage \? globalThis\.browser : globalThis\.chrome/);
  assert.doesNotMatch(script, /\bchrome\.(storage|permissions|runtime)\b/);
});

test('Chromium packaging still ships its own manifest untouched', () => {
  assert.equal(base.background.service_worker, 'dist/background.js');
  assert.equal(base.minimum_chrome_version, '116');
  assert.equal(base.options_page, 'options.html');
});

test('Firefox AMO warnings: do not construct notes with innerHTML assignments',()=>{
  const app=readFileSync('src/content/app.ts','utf8');
  assert.doesNotMatch(app,/\.innerHTML\s*=/);
  assert.match(app,/createContextualFragment\(markup\)/);
  assert.match(app,/createContextualFragment\(paperMarkup\)/);
});
