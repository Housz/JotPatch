# JotPatch v0.1.20 — 统一 Dock、轻量编辑与便签折叠

**随地大小贴** · Powered by Housz

本版从正式 v0.1.18 直接升级到 **v0.1.20**。v0.1.19 只作为开发版本存在，没有发行 Tag；本次整合了 v0.1.19 开发阶段的 Dock/UI 改造，以及 v0.1.20 的编辑器与折叠功能。

## 下载与手动升级

| 文件 | 使用方式 |
| --- | --- |
| `JotPatch-v0.1.20-chromium.zip` | Chrome / Edge：解压 ZIP，再在扩展管理页通过开发者模式加载；已有用户请按相同扩展身份更新文件，**不要先卸载** |
| `JotPatch-v0.1.20-firefox.zip` | **未签名**：维护者用来提交原有 Mozilla AMO Unlisted 附加组件新版本，或在 `about:debugging` 临时加载测试 |
| `JotPatch-v0.1.20-firefox-signed.xpi` | **需维护者手工签名后另行上传**。只有实际出现在 Release 附件中且经 Mozilla 签名的 XPI 才用于 Firefox 普通用户的持久安装／升级 |

Firefox 扩展 ID 保持 `{8801fba0-08ef-481b-a4b6-870a061b2878}`，已安装签名 v0.1.17 的用户直接安装同 ID 的更新版 XPI；不先卸载，以免使原有本地便签不可用。当前不包含自动更新或跨浏览器同步。

## 新功能及改进

- **一体化轻量 Dock（Issue #34）**：移除独立的右上角快捷区；Dock 统一容纳本页悬浮便签新建、导航与设置。无内容时自动收缩，AI 会话仍点击灰色轮次标记直接导航。
- **便签与列表操作**：上方 `≡` 打开精简导航列表，没有冗余品牌标题与页脚；底部数字按钮仅对**本页悬浮便签**执行成组显示／隐藏，不影响原文锚定的便签。
- **三档背景透明度（Issue #33）**：清晰、柔和、轻透；文字与按钮仍保持可读，编辑时纸张恢复实色，不增加背景模糊。
- **标题栏置顶与菜单可靠性（Issues #39、#40）**：点击或拖动下层便签标题时自动置顶，最小尺寸便签的 `···` 菜单不被纸张裁切，必要时向上展开。
- **编辑器缩进（Issue #38）**：`Tab` 缩进两格，**`Shift+Tab` 缩回**；`Ctrl+Tab` 保留为浏览器标签切换快捷键。
- **轻量编辑快捷键（Issue #43）**：没有选中文本时，`Ctrl/Cmd+C` 复制当前 Markdown 行，`Ctrl/Cmd+X` 剪切当前行；有选区时继续使用浏览器原生复制／剪切。保留 `Ctrl/Cmd+B/I` 加粗和斜体，不增加代码编辑器框架。
- **纸张折叠（Issue #44）**：顶栏的 `▴ / ▾` 控制每张便签折叠为仅剩顶栏；展开恢复原有尺寸。折叠状态可随刷新保存，仍可拖动且不会移除锚点或文字。

## 存储、权限、兼容性

- 继续使用 `Note.schemaVersion: 1`、`jotpatch:note:v1:*` 和 `jotpatch:preferences:v1`；新增的 `appearance.collapsed` 为**可选**布尔外观字段，旧版便签默认展开。
- 不上传网页文本、聊天记录或便签，不新增默认主机权限、账号或云同步。
- Markdown 编辑器仍是轻量排版编辑：不包含语法补全、多光标、复杂 Markdown 列表缩进或完整 IDE 快捷键。
- 支持 KaTeX/MathML 中具有可靠公式标识的原文锚定；图片或不含可读公式信息的纯 SVG 不保证支持。
- 浏览器原生快捷键依平台不同，`Ctrl+Tab` 不由扩展接管。

## 验收范围

发行前须在对应 Release 合并提交上通过 `npm run check`、Chromium 与 Firefox 的合成 DOM 行为测试、密集导航恢复测试、Firefox 原生临时扩展安装及 `web-ext lint`。这**不是**已在所有真实登录的 ChatGPT/Gemini 会话验证，也**不是** Mozilla 已完成 XPI 签名的声明。

[用户指南](https://github.com/Housz/JotPatch/blob/main/docs/USER_GUIDE.md) · [Firefox 安装说明](https://github.com/Housz/JotPatch/blob/main/docs/FIREFOX.md) · [v0.1.20 交互设计](https://github.com/Housz/JotPatch/blob/main/docs/EDITOR_FOLD_0_1_20.md)
