# JotPatch 开发与验证

从 `dev` 分支开发新功能；`main` 是正式发行线。本文适用于 Node.js **20+**（推荐 22）及当前 `dev` 配置，所有示例在仓库根目录执行。

## 环境与首次运行

```bash
git clone https://github.com/Housz/JotPatch.git
cd JotPatch
git switch dev
npm install
npm run check
npm run package:dev
```

运行时不依赖远程 AI API Key，开发依赖主要是 TypeScript。浏览器 E2E 另需 Python 3、Playwright 和对应浏览器；Firefox 真实安装烟测另需 Selenium、Firefox 和 geckodriver。请分别记录安装和环境问题。

## 常用命令

| 命令 | 实际作用 |
| --- | --- |
| `npm run build` | 编译 `dist/content.js`、`dist/background.js` 并校验构建文件 |
| `npm run check` | 构建 + `node --test tests/*.test.mjs`，包含文档链接与架构/合约测试 |
| `npm run package:dev` | 在当前 dev 渠道生成 Chromium 开发 ZIP |
| `npm run package:firefox` | 生成 Firefox 开发 ZIP 及 `build/firefox/` 目录 |
| `npm run test:e2e` | 运行 Chromium 合成页面的多项集成回归 |
| `npm run test:lab` | 运行较慢的 Navigation Lab 合成历史恢复场景 |
| `npm run package:release` | 仅在经审批、版本文件匹配的 `release` 渠道生成 Chromium 正式 ZIP |

使用 `npm run package:release` 前，必须按 [版本规则](VERSIONING.md) 将 `config/version.json`、`package.json` 和 Manifest 同步到正式版本；当前 `dev` 配置本就应拒绝错误发行。

Firefox 的衍生 Manifest、临时安装和验证差异见 [Firefox 指南](FIREFOX.md)。

## 实现位置

| 任务 | 主要文件 |
| --- | --- |
| 原文选择与恢复 | `src/core/anchor.ts`、`src/core/page-key.ts` |
| 本地 Note Schema 与读写 | `src/core/types.ts`、`src/core/repository.ts` |
| Prompt 扫描和站点适配 | `src/content/conversation.ts`、`src/adapters/sites/*` |
| 历史身份与按需恢复 | `src/core/conversation-index.ts`、`navigation-recovery.ts`、`navigation-lab.ts` |
| 导航布局 | `src/core/rail-layout.ts` |
| 页面交互与便签 UI | `src/content/app.ts`、`src/ui/*` |
| 浏览器 API、后台、设置 | `src/adapters/browsers/webextension.ts`、`src/background/index.ts`、`options.html` / `options.js` |
| 版本与发布 | `config/version.json`、`scripts/versioning.mjs`、`scripts/package.mjs` |

新增站点适配器时，先从真实站点记录 DOM 结构及稳定选择器，放入 `src/adapters/sites/<site>.ts`，并把新文件置于 `tsconfig.content.json` 的 registry 之后、`src/content/conversation.ts` 之前。添加针对重复 Prompt、虚拟化和非目标网站的测试。不要在 `core` 中硬编码站点域名。

## 测试等级与准入

1. **静态/Node**：`npm run check` 证明 TypeScript、单元、合同及文档链接测试在该代码提交下通过。
2. **合成浏览器页面**：`npm run test:e2e` 和 CI 中的 Chromium/Firefox Playwright 测试检验已构造的 DOM 场景，不含真实登录站点的网络行为。
3. **真实扩展安装**：Firefox 专项使用 `python tests/firefox_addon_smoke.py`，验证实际 MV3 安装、设置、本地存储、事件页/工具栏等；须匹配所测试的分支与 Manifest。
4. **真实登录站点人工验收**：对于 ChatGPT/Gemini DOM、长历史恢复、浏览器站点授权、升级或重启的数据场景，单独记录浏览器版本、复现步骤和结果。
5. **签名/发行**：AMO 签名 XPI、GitHub Release 附件及对应来源提交分别核对，不能由 lint 或模拟安装推定。

当前 [CI 工作流](../.github/workflows/check.yml)在 PR 和 push 上运行 `typecheck-and-contracts` 与 `cross-browser-acceptance`，包括 Node、双浏览器合成页面、Firefox 临时安装和 Mozilla lint。新增用户可见行为后需要在实际变更提交上核对 CI 结果，不能沿用旧提交的通过结论。

## 调试与边界

- 修改内容脚本后，在浏览器扩展管理页重新加载扩展，并刷新目标网页；避免把旧注入脚本当成新版本。
- 如果用户在原文卸载后看到便签隐藏，先核对 `Range` 是否仍连接、`conversationTurnId` 是否匹配，不要把 DOM 重挂载误作创建新便签。
- 导航跳转失败时记录逻辑身份、滚动容器和目标 DOM 是否实际可见；不要仅检查 `scrollTop`。
- 浏览器控制台中的网站遥测错误不自动归因于 JotPatch。日志和测试页面不要保留真实聊天内容、账号或令牌。
- 跨浏览器变更不要增加未经批准的权限、云同步或未公开 AI 网站接口。

## v0.1.19 统一 Dock 回归

`tests/unified_dock_e2e.py` 是使用真实浏览器 DOM 和模拟 WebExtension 存储的交互回归；Firefox 原生工具栏到内容脚本的消息链仍由 Selenium `tests/firefox_addon_smoke.py` 验证。

```bash
npm run check
JP_CHROMIUM_BIN=playwright python tests/unified_dock_e2e.py
JP_E2E_BROWSER=firefox python tests/unified_dock_e2e.py
JP_E2E_BROWSER=firefox python tests/dock_polish_e2e.py
# 已完成 Firefox 包构建且安装 Selenium / geckodriver 后：
python tests/firefox_addon_smoke.py
```

重点覆盖首次进入空页面能新建便签、悬浮便签分组显隐、精简列表、Esc/页面点击关闭、工具栏显隐、选中文字 📌、本地数据刷新恢复、长 ChatGPT 对话横条直接点击与原生导航回退。另有 `tests/dock_polish_e2e.py` 验证标题栏置顶、菜单不裁剪、Tab 缩进和透明度即时变化。合成 DOM 不等于真实登录网页人工验收。具体范围见 [设计与验收记录](UNIFIED_DOCK_0_1_19.md)。

## v0.1.20 编辑器与折叠验收

Issue [#43](https://github.com/Housz/JotPatch/issues/43) 和 [#44](https://github.com/Housz/JotPatch/issues/44) 在 `0.1.20-dev.1` 下开发，不更改 Note Schema v1 和 Firefox 固定 ID。

```bash
npm run check
JP_CHROMIUM_BIN=playwright python tests/editor_fold_e2e.py
JP_E2E_BROWSER=firefox python tests/editor_fold_e2e.py
# Firefox 真正安装/设置与折叠恢复另由 Selenium 执行：
python tests/firefox_addon_smoke.py
```

`tests/editor_fold_e2e.py` 检查顶栏折叠后精确高度、拖动、原尺寸恢复、Storage 本地持久化、无选区复制剪切当前 Markdown 行、选区复制不被覆盖，以及 `Ctrl+Tab` 不受扩展干扰。工作流仍覆盖既有导航/LaTeX/长对话回归。合成 DOM 与真实登录 ChatGPT/Gemini 人工验收应分别记录，参见 [v0.1.20 说明](EDITOR_FOLD_0_1_20.md)。

## 只修改文档

从 [Agent Skill](../.agents/skills/jotpatch-documentation/SKILL.md)进入 [写作规则](WRITING_STYLE.md)、[文档类型与验收](DOCUMENTATION_TYPES.md)，按 D01–D12 确定内容归属。保留历史实验与发行证据，不因重写 README 顺便修改源码、Manifest、签名或 Tag。

最小文档检查是 Markdown 相对链接、事实与版本对照、README 双语一致性以及 `node --test tests/documentation.test.mjs`。如执行 `npm run check`，报告实际结果；未运行 E2E、真实 Firefox 或登录站点测试时直接注明。PR 仍应指向 `dev`，合并由维护者决定。

PR 说明与归属要求见 [贡献规范](../CONTRIBUTING.md)。
