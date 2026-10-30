# JotPatch

**随地大小贴** · Powered by Housz · [简体中文](README.md)

JotPatch is a lightweight browser sticky-note extension. Attach notes near selected text while reading websites or conversations on ChatGPT and Gemini, then use a compact navigation rail to return to the relevant passage. Notes stay in your browser's local extension storage.

## Download and install

Choose the file for your browser from the [latest GitHub Release](https://github.com/Housz/JotPatch/releases/latest). The current release is **v0.1.18**.

| Browser | Current download | First installation |
| --- | --- | --- |
| Chrome / Edge | `JotPatch-v0.1.18-chromium.zip` | Extract the ZIP, enable Developer mode in your extensions page, then select **Load unpacked** |
| Firefox 142+ | `JotPatch-v0.1.18-firefox.zip` | **Unsigned:** for submission to Mozilla Unlisted signing or temporary `about:debugging` tests only. Regular users need the separately signed v0.1.18 XPI once it is attached to the Release |

The **v0.1.18 Firefox ZIP is not signed yet** and is not a persistent installation package. Users of the signed v0.1.17 XPI should keep it installed until the signed v0.1.18 XPI appears in the Release assets. **Updates remain manual:** install the newer version without first uninstalling the extension. See [Firefox installation and release details](docs/FIREFOX.md).

## Quick start

1. Open a regular HTTP(S) page and click the JotPatch toolbar icon.
2. Select text and click the nearby 📌 to create an anchored note. Without a selection, use `+` in the small launcher to create a page note.
3. Type directly. Drag the top bar, copy Markdown, or use the bottom bar for bold, italic and lists; `···` contains color, font-size and delete controls.
4. On ChatGPT and Gemini, gray bars indicate discovered user prompts and colored markers indicate notes. Hover for a preview and click a marker to navigate.
5. For automatic restoration after a page refresh, grant permission to that specific website under **「自动恢复」 (Automatic restoration)** in JotPatch settings.

[Full user guide (Chinese)](docs/USER_GUIDE.md)

## Features and limits

- Multiple notes per page, locally saved as Markdown; text anchoring, moving, resizing, colors and undo for deletion. **v0.1.18** adds whole-formula anchoring for readable KaTeX/MathML and a muted monochrome paper pin.
- Conversation navigation remembers turns the page has actually exposed. A bounded historical recovery starts only after you click an indexed target.
- **Navigation Lab** is an opt-in, ChatGPT-only experimental navigation strategy, disabled by default.
- Chrome/Edge and Firefox have separate local storage. There is no account, cloud sync, persistent cross-page floating mode or automatic backup.
- Internal browser pages, unapproved sites and inaccessible cross-origin content are outside the normal scope. Compatibility with authenticated ChatGPT/Gemini sessions can change as those sites update their DOM.

## Contributing

The `main` branch tracks stable releases and `dev` is the integration branch. The latest stable release is **`v0.1.18`**. The current `dev` development version is **`0.1.20-dev.1`**, targeting `v0.1.20` (v0.1.19 was never released). In addition to the unified Dock, it offers **header-only collapsible notes** and **copy/cut current Markdown line with no selection**. `Tab` indents, `Shift+Tab` outdents, and `Ctrl+Tab` remains a browser shortcut. The published v0.1.18 UI is unchanged.

```bash
# Node.js >=20; run at repository root on dev
npm install
npm run check
npm run package:dev
```

See [contribution rules (Chinese)](CONTRIBUTING.md), [development guide (Chinese)](docs/DEVELOPMENT.md), [architecture (Chinese)](docs/ARCHITECTURE.md) and [release process (Chinese)](docs/RELEASING.md). Documentation follows [W01–W10 (Chinese)](docs/WRITING_STYLE.md), [D01–D12 / P0–P2 (Chinese)](docs/DOCUMENTATION_TYPES.md), and the [documentation Agent Skill](.agents/skills/jotpatch-documentation/SKILL.md).

Historical context: [product history (Chinese)](docs/PRODUCT_HISTORY.md) and [Navigation Lab research](docs/NAVIGATION_LAB_0_1_15.md). No explicit license file is currently present in the repository; ask the maintainer about redistribution or licensing rights.
