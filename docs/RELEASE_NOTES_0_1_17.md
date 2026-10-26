# JotPatch v0.1.17 — Chromium & Firefox cross-browser build

**随地大小贴** · Powered by Housz

这一版在 v0.1.16 的便签、ChatGPT/Gemini 轮次导航、原文锚点恢复和默认关闭的 Navigation Lab 基础上，补充了 Firefox MV3 事件页适配、跨浏览器测试及打包工具。

## 下载和安装

| 文件 | 适用浏览器 | 安装说明 |
| --- | --- | --- |
| `JotPatch-v0.1.17-chromium.zip` | Chrome、Edge 等 Chromium 浏览器 | 解压，启用开发者模式，通过「加载已解压的扩展程序」加载包含 `manifest.json` 的目录 |
| `JotPatch-v0.1.17-firefox.zip` | Firefox 142+ | **仅开发/测试临时安装**：在 `about:debugging#/runtime/this-firefox` 选择「Load Temporary Add-on」，打开解压目录内的 `manifest.json` |
| `JotPatch-v0.1.17-firefox-signed.xpi`（仅在 Release 附件实际存在时） | Firefox 142+ | **Mozilla 签名版**：可直接在发行版 Firefox 中正常安装 |

**重要：** 没有 Mozilla 签名的 Firefox ZIP 并不是面向普通用户的可持续安装包。Firefox 正式版通常拒绝安装未签名扩展。临时加载的扩展在浏览器重启后会被移除，相关扩展存储可能随之不可用。如果 Release 没有 `firefox-signed.xpi`，请把 Firefox ZIP 仅用于测试；签名需要维护者在 AMO 配置签名凭据。不要将 ZIP 手动改名为 XPI 冒充签名版。

## 新增与修复

- Firefox 使用自身的 MV3 事件页后台与扩展 API，Chromium 保持服务工作线程。
- Firefox 用户授权的站点在启动/更新及权限变动时同步动态内容脚本注册，减少恢复失效。
- 内容脚本实例保护兼容 Gecko 隔离全局，不会因重新注入创建第二套界面。
- 两种浏览器使用相同的核心便签、Markdown、导航和 UI 编译产物，仅 Manifest 与运行时环境不同。
- 增加 Firefox/Chromium 消息、存储、权限、事件页模拟测试，以及跨浏览器真实 DOM 回归和 Firefox 实际临时安装烟测。

## 数据、隐私和已知限制

- 便签仍保存在各浏览器的扩展本地存储中，Chrome 与 Firefox **不会自动同步**。
- 保留 `jotpatch:note:v1:*`、`jotpatch:preferences:v1` 和旧数据结构；没有新增浏览器权限。
- AI 网站自己的 DOM 与虚拟滚动策略可能变动。长对话自动恢复是按需的、有界查找，无法保证网站从未提供过的历史内容。
- CI 中的合成 ChatGPT/Gemini DOM 测试，不等同于已经对每个真实登录状态进行人工验收。Firefox 真实扩展烟测涵盖临时安装、选项页、存储及后台消息。
- Chrome Web Store / Edge Add-ons / Firefox AMO 上架审核由各商店独立进行；GitHub Release 不能替代商店上架。

使用指南：[`docs/USER_GUIDE.md`](https://github.com/Housz/JotPatch/blob/main/docs/USER_GUIDE.md) · Firefox 指南：[`docs/FIREFOX.md`](https://github.com/Housz/JotPatch/blob/main/docs/FIREFOX.md)。
