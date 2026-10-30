# JotPatch on Firefox: installation, signing and testing

JotPatch uses the same note, anchoring and navigation source as Chrome/Edge, with a Firefox-specific Manifest V3 event page and Mozilla-signed XPI distribution.

## v0.1.20: stable source and manual Firefox signing

[GitHub Release v0.1.20](https://github.com/Housz/JotPatch/releases/tag/v0.1.20) includes both `JotPatch-v0.1.20-chromium.zip` and the **unsigned** `JotPatch-v0.1.20-firefox.zip`, built from the same tested release source. The Firefox ZIP is the submission file for the **existing** Mozilla AMO Unlisted JotPatch add-on, not a permanent-installable package.

The maintainer will obtain a Mozilla-signed `JotPatch-v0.1.20-firefox-signed.xpi` and add it to this GitHub Release after validating the original add-on ID `{8801fba0-08ef-481b-a4b6-870a061b2878}`, version, and in-place upgrade from a previously signed XPI. Until that exact signed v0.1.20 asset is actually available, keep using your existing signed Firefox version; **do not uninstall it to upgrade**.

This release consolidates the previously unreleased v0.1.19 Dock and UI improvements and adds v0.1.20 lightweight current-line editor copy/cut, Shift+Tab-only outdent, and header-only collapsible notes. Chrome/Firefox DOM regression and a real temporarily installed Firefox MV3 add-on were exercised; Mozilla production signing and authenticated ChatGPT/Gemini manual testing remain separate checks.

## Previous unsigned Firefox ZIP (v0.1.18)

The [v0.1.18 GitHub Release](https://github.com/Housz/JotPatch/releases/tag/v0.1.18) is built from the same verified source commit as the Chromium ZIP. It includes `JotPatch-v0.1.18-firefox.zip`, an **unsigned** Firefox 142+ package. The maintainer will upload this ZIP to the existing Mozilla AMO **Unlisted / On your own** add-on, then separately attach the signed `JotPatch-v0.1.18-firefox-signed.xpi` after verification.

**Do not rename ZIP to XPI or install the ZIP as a permanent Firefox extension.** Until the signed v0.1.18 XPI is available, keep the existing signed v0.1.17 XPI installed. The Gecko ID must stay `{8801fba0-08ef-481b-a4b6-870a061b2878}`; manual in-place upgrades preserve the existing extension's storage identity.

v0.1.18 also carries the native toolbar startup fix, reliable first-edit Markdown, AMO-safe templates, LaTeX formula anchoring, and the monochrome paper pin. These were regression-tested against real Chromium/Firefox DOM fixtures and a temporarily installed Firefox MV3 add-on, not every authenticated ChatGPT/Gemini session.

## Previous signed version (v0.1.17)

As checked on **2026-10-27**, [GitHub Release v0.1.17](https://github.com/Housz/JotPatch/releases/tag/v0.1.17) provides:

| Asset | Purpose |
| --- | --- |
| `JotPatch-v0.1.17-chromium.zip` | Unpacked development-mode install for Chrome / Edge |
| `JotPatch-v0.1.17-firefox-signed.xpi` | Mozilla-signed, normal Firefox installation (82,511 bytes) |

For Firefox **142+**, download the signed XPI and keep it intact. Open `about:addons`, use the gear menu's **Install Add-on From File**, select the XPI and confirm installation. You can then pin JotPatch to the toolbar and click it on a regular HTTP(S) page.

Firefox updates are **manual** for this distribution: install a higher-version signed XPI with the **same add-on ID**, rather than uninstalling first. Changing the ID changes the extension's storage identity and does not automatically migrate old notes. No `update_url` is currently configured.

An unsigned Firefox ZIP is for temporary testing in `about:debugging#/runtime/this-firefox`. It disappears after Firefox restarts and must not be presented as a normal installable package. Renaming ZIP to XPI does not produce a Mozilla signature.

## Important v0.1.17 source provenance

The original `v0.1.17` Tag points to stable commit `34be0692`. A subsequent [Firefox repair PR #24](https://github.com/Housz/JotPatch/pull/24) was tested at `6757760a` and supplies the corrected source used for the separately signed Firefox 0.1.17 XPI. The repair covers the AMO duplicate-ID issue, two `innerHTML` lint warnings, native toolbar activation and first-edit Markdown behavior.

**v0.1.18 release source:** the Firefox recovery fixes and signed Gecko ID are incorporated while retaining the original hotfix commit ancestry. The original v0.1.17 Tag still predates the fix; its Chromium ZIP and the subsequently signed Firefox XPI therefore have different source provenance. Future signing must use this fixed Gecko ID.

The signed Firefox add-on ID is `{8801fba0-08ef-481b-a4b6-870a061b2878}`; preserve it in future releases. The uploaded v0.1.17 signed XPI has already been compared with the repaired runtime in the [PR's successful CI](https://github.com/Housz/JotPatch/actions/runs/40354313470). This is build/signature evidence, not a claim that all authenticated websites were manually tested.

## Runtime differences

| Topic | Chrome / Edge | Firefox |
| --- | --- | --- |
| MV3 background | `background.service_worker` | `background.scripts` (event page) |
| Options | `options_page` | `options_ui` |
| Runtime namespace | `chrome` | Promise-based `browser` |
| Asynchronous messages | Callback / `sendResponse` pattern | Listener may return a Promise |
| Signing for normal distribution | Unpacked development install | Mozilla-signed XPI |
| Storage | Local extension storage | Local extension storage; not synchronized with Chromium |

`scripts/firefox-manifest.mjs` transforms the Chromium manifest, sets Gecko metadata and checks an allowlist of supported keys. `src/adapters/browsers/webextension.ts` selects the browser runtime; shared background lifecycle code lives in `src/background/index.ts`. More detail: [architecture (Chinese)](ARCHITECTURE.md).

## Develop and test on the current `dev` branch

```bash
# Run at repository root on dev (Node.js >=20)
npm install
npm run build
npm run package:firefox
node --test tests/firefox.test.mjs tests/cross_browser_runtime.test.mjs
npx web-ext lint --source-dir build/firefox --self-hosted
```

For browser integration fixtures:

```bash
# Requires Python, Playwright and the selected browser runtime
JP_E2E_BROWSER=firefox python tests/browser_e2e.py
JP_E2E_BROWSER=firefox python tests/conversation_e2e.py
JP_E2E_BROWSER=firefox python tests/navigation_recovery_e2e.py
```

To test a **real temporarily installed** Firefox MV3 extension, install Selenium and run the separate smoke script after packaging:

```bash
python tests/firefox_addon_smoke.py
```

The v0.1.18 release baseline includes the toolbar readiness handshake, fixed Gecko ID and native Firefox regression from [PR #24](https://github.com/Housz/JotPatch/pull/24). This does not rewrite the historical v0.1.17 signed package. For new versions, submit the newly verified release ZIP to the existing Mozilla Unlisted add-on.

## Troubleshooting and validation levels

- **Toolbar does nothing:** first try a normal HTTP(S) page. Firefox pages such as `about:newtab`, `about:addons` and `about:debugging` cannot host the content script. Check the extension error console before assuming a permission or UI failure.
- **AMO duplicate ID:** never re-use the old `jotpatch@housz.dev` ID for the repaired signing channel. The signed GUID above identifies the normal installable extension.
- **Data missing after a new install:** compare the add-on ID, browser profile and site URL. Uninstalling or changing identity can make notes unavailable; do not clear the old storage while investigating.
- **Automatic restoration doesn't run:** grant the specific host under JotPatch's settings and refresh; `activeTab` only covers the page activated by the user.

Evidence must be reported separately: TypeScript/Node tests, Chromium/Firefox synthetic DOM browser runs, real Firefox temporary add-on installation, Mozilla lint, official AMO signature and **authenticated ChatGPT/Gemini manual testing**. Passing one level does not establish the others. No remote conversation API, account, or broad default host grant is part of the architecture.

For end-user steps in Chinese, see the [user guide (Chinese)](USER_GUIDE.md); for manual release signing and publication, see [release instructions (Chinese)](RELEASING.md).
