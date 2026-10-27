// Firefox variant of the Chromium manifest. Pure on purpose: packaging and the
// contract tests share this single transformation.
// New globally unique ID: jotpatch@housz.dev is already registered in AMO.
// Never change this ID after the first signed add-on is distributed.
export const FIREFOX_ADDON_ID = '{8801fba0-08ef-481b-a4b6-870a061b2878}';
// Firefox 142 is the floor that understands gecko.data_collection_permissions,
// which AMO now requires for new submissions.
export const FIREFOX_MIN_VERSION = '142.0';

// Keys the Firefox build intentionally drops because Gecko does not implement them.
const CHROMIUM_ONLY_KEYS = ['short_name', 'minimum_chrome_version', 'version_name', 'options_page'];
// Every key we know how to translate (or deliberately drop). Anything else is an
// error rather than a silent feature loss.
const HANDLED_KEYS = ['manifest_version', 'name', 'version', 'version_name', 'description', 'action',
  'background', 'permissions', 'optional_host_permissions', 'options_page', 'icons', ...CHROMIUM_ONLY_KEYS];

export function buildFirefoxManifest(baseManifest, manifestVersion) {
  if (baseManifest?.manifest_version !== 3) throw Error('Firefox packaging needs a Manifest V3 base manifest');
  const unhandled = Object.keys(baseManifest).filter((key) => !HANDLED_KEYS.includes(key));
  if (unhandled.length) throw Error(`Unhandled Chromium manifest keys for Firefox: ${unhandled.join(', ')}`);
  if (!/^\d+(\.\d+){0,3}$/.test(String(manifestVersion))) {
    throw Error(`Firefox needs a numeric manifest version, got ${manifestVersion}`);
  }
  const manifest = {
    manifest_version: 3,
    name: baseManifest.name,
    version: manifestVersion,
    description: baseManifest.description,
    action: baseManifest.action,
    // Firefox MV3 runs background code as an event page, not a service worker.
    background: { scripts: ['dist/background.js'] },
    permissions: baseManifest.permissions,
    optional_host_permissions: baseManifest.optional_host_permissions,
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: baseManifest.icons,
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        data_collection_permissions: { required: ['none'] }
      }
    }
  };
  const problems = verifyFirefoxManifest(manifest);
  if (problems.length) throw Error(`Invalid Firefox manifest: ${problems.join('; ')}`);
  return manifest;
}

export function verifyFirefoxManifest(manifest) {
  const problems = [];
  const expect = (condition, message) => { if (!condition) problems.push(message); };
  expect(manifest?.manifest_version === 3, 'manifest_version must be 3');
  expect(!('service_worker' in (manifest?.background || {})), 'background.service_worker is Chromium-only');
  expect(Array.isArray(manifest?.background?.scripts) && manifest.background.scripts.length === 1,
    'background.scripts must list exactly one event page script');
  for (const key of CHROMIUM_ONLY_KEYS) expect(!(key in (manifest || {})), `${key} is Chromium-only`);
  expect(manifest?.options_ui?.page === 'options.html', 'options_ui.page must point at options.html');
  const gecko = manifest?.browser_specific_settings?.gecko;
  expect(typeof gecko?.id === 'string' && (/^\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}$/i.test(gecko.id) || /^[^@{}\s]+@[^@{}\s]+$/.test(gecko.id)), 'browser_specific_settings.gecko.id must be a GUID or email-style ID');
  expect(Number.parseInt(gecko?.strict_min_version || '0', 10) >= 142,
    'strict_min_version must be >= 142 for data_collection_permissions');
  expect(gecko?.data_collection_permissions?.required?.join(',') === 'none',
    'data_collection_permissions must declare that no data is collected');
  for (const permission of ['activeTab', 'scripting', 'storage']) {
    expect(Array.isArray(manifest?.permissions) && manifest.permissions.includes(permission), `missing permission: ${permission}`);
  }
  expect(!('host_permissions' in (manifest || {})), 'the Firefox build must not request broad host permissions');
  return problems;
}
