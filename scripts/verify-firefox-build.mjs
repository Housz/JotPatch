// Verify the Firefox package the same way a reviewer would: manifest shape,
// Firefox-only keys, referenced files, and absence of Chrome-only globals.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = 'dist/firefox';
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
const problems = [];
const expect = (condition, message) => { if (!condition) problems.push(message); };

expect(manifest.manifest_version === 3, 'Firefox package must be Manifest V3');
expect(manifest.background?.scripts?.length === 1, 'Firefox background must use background.scripts (no service workers)');
expect(!('service_worker' in (manifest.background || {})), 'background.service_worker is unsupported in Firefox');
for (const chromeOnly of ['minimum_chrome_version', 'short_name', 'options_page']) {
  expect(!(chromeOnly in manifest), `${chromeOnly} is Chromium-only and must not ship in the Firefox package`);
}
expect(manifest.permissions?.join(',') === 'activeTab,scripting,storage', 'Unexpected permission list in the Firefox package');
expect(manifest.optional_host_permissions?.join(',') === 'http://*/*,https://*/*',
  'Optional host permissions must stay opt-in and cover only http/https');
expect(!('host_permissions' in manifest), 'The Firefox build must not request broad host access at install time');
expect(manifest.options_ui?.page === 'options.html', 'Firefox must expose the options page through options_ui');

const gecko = manifest.browser_specific_settings?.gecko;
expect(typeof gecko?.id === 'string' && gecko.id.includes('@'), 'Firefox needs a stable gecko extension id');
expect(Number.parseInt(gecko?.strict_min_version || '0', 10) >= 142,
  'strict_min_version must be >= 142 for data_collection_permissions');
expect(gecko?.data_collection_permissions?.required?.join(',') === 'none',
  'Firefox must declare that it collects no data (AMO requirement)');

for (const file of [manifest.background?.scripts?.[0], manifest.options_ui?.page].filter(Boolean)) {
  const path = resolve(ROOT, file);
  expect(existsSync(path) && statSync(path).size > 0, `Missing or empty packaged file: ${file}`);
}
for (const file of ['dist/content.js', 'dist/background.js', 'dist/options.js', 'styles/highlight.css']) {
  const path = resolve(ROOT, file);
  expect(existsSync(path) && statSync(path).size > 100, `Missing or truncated packaged asset: ${file}`);
}
for (const file of ['dist/content.js', 'dist/background.js', 'dist/options.js']) {
  const code = readFileSync(resolve(ROOT, file), 'utf8');
  expect(code.includes('typeof browser'), `${file} must resolve the browser namespace at runtime`);
  expect(!/\bchrome\.(storage|runtime|scripting|permissions|action|tabs)\b/.test(code),
    `${file} must not call Chrome-only globals directly`);
}

if (problems.length) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log('JotPatch Firefox build verified: dist/firefox is a loadable MV3 add-on.');
