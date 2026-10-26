# JotPatch

**随地大小贴** · Powered by Housz

JotPatch 为网页原文添加可编辑的彩色便签，支持 ChatGPT / Gemini 对话导航和长对话的按需定位。便签默认保存在浏览器本地，不上传对话文本。

本仓库正在从单人原型过渡到多人开发，采用 **`main` 正式发行、`dev` 集成开发、短期任务分支** 的协作模型。

## 立即使用

**v0.1.17** 使用统一源码构建 Chromium 与 Firefox 两个版本。Chromium ZIP 可解压后在 Chrome/Edge 开发者模式安装；Firefox ZIP 可在 `about:debugging` 中临时安装测试。**Firefox 普通用户长期安装需要 Mozilla 签名的 XPI**（仅在 Release 附有 `-firefox-signed.xpi` 时提供），不能将无签名 ZIP 当成已上架的 Firefox 正式扩展。两个浏览器使用相同便签与导航核心，存储彼此独立。

1. Chromium 从 [GitHub Releases](https://github.com/Housz/JotPatch/releases) 下载 ZIP。**原始 v0.1.17 Firefox ZIP 存在启动兼容问题与 AMO ID 冲突，不能用于正式分发；应改用 [Firefox 0.1.17 修订包说明](docs/FIREFOX_AMO_HOTFIX_0_1_17.md) 获取最新验收的修订 ZIP。** 解压后确认根目录包含 `manifest.json`，详见 [Firefox 指南](docs/FIREFOX.md)。
2. 在 `chrome://extensions` 或 `edge://extensions` 开启开发者模式，**加载已解压的扩展程序**。
3. 打开网页，点击 JotPatch 扩展图标激活；选中文字后点击 📌，或右键添加便签。
4. AI 聊天页面右侧的灰色横线用于定位问题、彩色标记用于定位便签。鼠标悬停显示摘要，点击直接导航。
5. 在设置页调整选区图钉、默认便签颜色和导航开关。Navigation Lab 默认关闭。

详细说明：[使用指南](docs/USER_GUIDE.md) · [安装与数据安全](docs/USER_GUIDE.md#数据与升级)

## 开发者：五分钟上手

```bash
# Node.js 20+
npm install
npm run check          # 构建 + 全部 Node 测试
npm run package:dev    # 生成可安装的 Chromium 开发 ZIP
npm run package:firefox  # 生成 Firefox（MV3 事件页）开发 ZIP
```

构建结果分别在 `dist/`（编译脚本）、`build/chromium/` 或 `build/firefox/`（可解压安装目录）、`artifacts/`（ZIP）。Firefox 包可在 `about:debugging#/runtime/this-firefox` 以临时扩展加载。浏览器集成测试需要 Python、Playwright 和 Chromium，见 [开发指南](docs/DEVELOPMENT.md) 与 [Firefox 移植说明](docs/FIREFOX.md)。

**新功能 / 修复从 `dev` 分支创建任务分支，PR 的目标分支选 `dev`。不要直接提交到 `main`。**

## 代码结构

```text
src/core/                  数据类型、便签/锚点/存储、导航引擎（无站点选择器）
src/adapters/sites/        ChatGPT / Gemini DOM 适配器注册；未来 Claude / DeepSeek
src/adapters/browsers/     WebExtension 运行时边界（Chrome `chrome` / Firefox `browser`）
src/content/               网页扫描与应用编排、入口
src/ui/                    便签、Dock 的 UI 样式
src/background/            MV3 事件与权限入口（Chromium 服务工作线程 / Firefox 事件页）
config/version.json        版本/渠道配置
scripts/                   构建校验、版本与归档打包
tests/                     合约、架构、浏览器集成测试
```

当前采用 TypeScript `namespace JP` 和 `tsconfig.content.json` 中**显式文件顺序**打包为经典内容脚本，保持原有 MV3 兼容行为。本轮**未引入新运行时框架，也未改动便签存储键或访问权限**。了解设计边界和如何新增适配器：[架构说明](docs/ARCHITECTURE.md)。

## 文档索引

| 角色 | 从这里开始 |
| --- | --- |
| 用户 | [使用指南](docs/USER_GUIDE.md) |
| 第一次参与开发 | [开发环境与测试](docs/DEVELOPMENT.md) |
| 新合作者 | [贡献与协作规则](CONTRIBUTING.md) |
| 浏览器/AI 平台适配开发者 | [架构与扩展点](docs/ARCHITECTURE.md) |
| 发布负责人 | [版本规则](docs/VERSIONING.md) → [发行流程](docs/RELEASING.md) |
| GPT / Codex / Claude / Copilot | [AGENTS.md](AGENTS.md) → [AI 开发说明](docs/AI_DEVELOPMENT.md) |
| 研究与历史 | [v0.1.15 Navigation Lab](docs/NAVIGATION_LAB_0_1_15.md) · [既有产品演进记录](docs/PRODUCT_HISTORY.md) |

## 当前支持范围

- **Chromium**：Chrome/Edge，已提供编译和安装包构建路径。
- **Firefox**：MV3 事件页构建路径已并入 `dev`（`npm run package:firefox` → `build/firefox/`）。Manifest、权限与消息通道已按 Gecko 适配；与当前 `dev` 功能等价的完整浏览器回归仍未完成，因此暂不作为正式发行目标。
- **AI 适配**：ChatGPT、Gemini 已接入注册表；未来的 Claude、DeepSeek 需要各自新增适配器和测试，不应直接在 `core` 里加选择器。
- **Navigation Lab**：v0.1.15 的长会话实验功能仍**默认关闭**，用户主动启用才生效，不保证可找回网页从未加载过的全部历史。

许可与外部分发条款尚待项目维护者确定；不要据此假定已获得第三方商业再分发授权。
