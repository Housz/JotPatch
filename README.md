# JotPatch

**随地大小贴** · Powered by Housz · [English](README.en.md)

JotPatch 是一款轻量浏览器便签扩展。阅读网页或 ChatGPT、Gemini 对话时，可以把想法写在原文附近，之后从右侧导航轨道返回对应位置。便签保存在当前浏览器的扩展本地存储中。

## 下载与安装

从 [最新 GitHub Release](https://github.com/Housz/JotPatch/releases/latest) 选择浏览器对应的文件。本次正式发行版本为 **v0.1.20**（上一正式版本是 v0.1.18，v0.1.19 仅为开发版本）。

| 浏览器 | 当前文件 | 首次安装 |
| --- | --- | --- |
| Chrome / Edge | `JotPatch-v0.1.20-chromium.zip` | 解压；在扩展管理页开启开发者模式，选择「加载已解压的扩展程序」 |
| Firefox 142+ | `JotPatch-v0.1.20-firefox.zip` | **未签名**：用于 Mozilla Unlisted 提交和 `about:debugging` 临时测试。普通用户安装请使用经 Mozilla 签名的同版本 XPI（签名完成后由维护者另行上传） |

**v0.1.20 的 Firefox ZIP 尚未签名**，不能作为普通 Firefox 的长期安装包。已经使用 v0.1.17 签名 XPI 的用户请保留现有安装，直到 Release 新增 v0.1.20 签名 XPI 后再覆盖升级。**本项目暂时使用手动更新**；不需要卸载旧扩展。Firefox 的安装、签名及版本来源见 [Firefox 说明](docs/FIREFOX.md)。

## 开始使用

1. 打开普通 HTTP(S) 网页，点击浏览器工具栏中的 JotPatch 图标。
2. 选中文字，点击旁边的 📌 创建原文便签；没有选区时可点右侧 Dock 的 `+` 新建本页悬浮便签。
3. 直接输入内容；顶栏拖动、复制 Markdown，底栏加粗、斜体或添加列表；`···` 可更换颜色、字号或删除。
4. 在 ChatGPT、Gemini 页面，灰色短横条代表已发现的用户提问，彩色标记代表便签。悬停查看摘要，点击直接跳转。
5. 如需刷新网页后自动恢复，在设置中的「自动恢复」为对应网站单独授权。

[完整使用方法与数据注意事项](docs/USER_GUIDE.md)

## 功能与边界

- 同一网页可存放多张便签，自动保存为本地 Markdown；支持轻量的原文锚定、拖动、缩放、颜色及删除撤销。**v0.1.18** 新增可读取 KaTeX/MathML 公式的整条公式锚定，并改进浅灰单色图钉。
- AI 会话导航仅索引已观察到的轮次；遇到动态卸载的历史内容，用户点击时才进行有界恢复。
- **Navigation Lab** 是仅适用于 ChatGPT 的实验性导航选项，默认关闭。
- Chrome/Edge 与 Firefox 的存储互相独立；目前没有账户、云同步、跨网页持续跟随或自动备份。
- 浏览器内部页面、未获授权的网站和无法访问的跨域内容不属于常规支持范围。真实登录 ChatGPT/Gemini 的兼容性可能随网站 DOM 更新变化。

## 参与开发

当前采用 `main` 正式发行线、`dev` 集成开发线。**v0.1.20** 已整合一体化 Dock、悬浮便签显隐、透明度、顶栏折叠及无选区复制/剪切当前行；编辑器只使用 `Tab` 缩进、`Shift+Tab` 缩回，`Ctrl+Tab` 留给浏览器。当前 `dev` 开发版本为 **`0.1.21-dev.1`**，正式版本仍为 `v0.1.20`，已发布的两个 ZIP 保持不变。

```bash
# Node.js >=20；在仓库根目录和 dev 分支执行
npm install
npm run check
npm run package:dev
```

阅读 [贡献规范](CONTRIBUTING.md)、[开发指南](docs/DEVELOPMENT.md)、[架构说明](docs/ARCHITECTURE.md)和 [发行流程](docs/RELEASING.md)。文档贡献遵循 [W01–W10](docs/WRITING_STYLE.md)、[D01–D12/P0–P2](docs/DOCUMENTATION_TYPES.md)，Agent 可从 [文档 Skill](.agents/skills/jotpatch-documentation/SKILL.md)进入。

研究与旧版设计记录见 [产品历史](docs/PRODUCT_HISTORY.md)及 [Navigation Lab 实验](docs/NAVIGATION_LAB_0_1_15.md)。许可文件尚未在仓库明确提供；外部再分发及授权条件需由维护者确认。
