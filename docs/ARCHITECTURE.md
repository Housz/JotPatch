# JotPatch 可扩展架构（dev）

> 当前实现是**渐进式模块化**，并已支持 Chromium/Firefox 两套 ZIP 构建；Firefox ZIP 未经 Mozilla 签名只能临时调试，不能据此认定商店上架完成。记录实际可用边界，避免 AI 编码代理臆造目录或功能。原始 v0.1.15 架构参考 [历史文档](LEGACY_ARCHITECTURE_0_1_15.md)。

## 分层与依赖

```text
Browser WebExtension API (Chrome/Edge service worker; Firefox MV3 event page)
        │
        ▼
src/adapters/browsers/webextension.ts  ← extensionApi()
        │
        ▼
src/content/app.ts   (application orchestration; current large legacy file)
   ├── src/adapters/sites/{registry,chatgpt,gemini}.ts
   │       │
   │       └── src/content/conversation.ts  (site-neutral DOM scan/navigation)
   ├── src/core/ (NoteRepository via injected StoragePort, anchors, markdown,
   │               conversation-index, navigation-recovery, navigation-lab,
   │               rail-layout, shared data types)
   └── src/ui/{palette,elements,paper-styles}.ts

src/background/index.ts          Chromium MV3 service worker / Firefox MV3 event page (shared source)
options.html/options.js          settings; runtime API selection supports both browsers; modularization pending
```

**核心原则：**

1. `src/core` 不应直接访问 `chrome.*` 或 `browser.*`；浏览器存储通过 `StoragePort` 注入，轮次扫描经通用接口获取 DOM 识别结果。
2. `src/adapters/sites/*` 负责**域名判断、用户 Prompt 选择器、容器和官方导航检测**，不保存便签、不发网络请求、不修改 JotPatch 核心布局。
3. `src/adapters/browsers` 只处理浏览器 API 差异；Firefox Manifest 转换在 `scripts/firefox-manifest.mjs`，事件生命周期由 `src/background/index.ts` 的共享实现及跨浏览器 CI 验证。
4. `src/ui` 负责呈现；`src/content/app.ts` 暂时保留大型应用编排和 DOM 事件。**后续小步拆分**，优先按单功能可测职责抽取，不一次重写全部。
5. `src/content/entry.ts` 是唯一启动点，注入重复执行不得创建第二个应用实例。

## 向网站注册新适配器

实现 `ConversationAdapter`，放在 `src/adapters/sites/<site>.ts`：

```ts
namespace JP {
  JP.registerConversationAdapter({
    site: 'claude',
    matches(url) { return url.hostname.toLowerCase() === 'claude.ai'; },
    selectors: '[data-example-user-prompt]', // 示例，请从真实页面取证
    canonical(node) { return node; },
    prompt(node) { return node; },
    nativeRailPresent() { return false; }
  });
}
```

把此文件放入 `tsconfig.content.json` 的 `files` 数组，位置在 `registry.ts` 之后、`src/content/conversation.ts` 之前。**选择器上面的字符串只是示例，不代表 Claude 当前实际 DOM**；新开发者必须采集真实 DOM 并添加测试。不要仅根据相似 hostname 宽松匹配，谨防 `chatgpt.com.evil.example`。

站点适配器目前识别用户提问、获取真正的 Prompt element（而不是包含回复的整段 article）、检测原生导航。未来如果需要站点特有的分页恢复，可给适配器增加**可选能力接口**，不要在 `NavigationLab` 内散落 `if(site ===...)`。当前 Lab 仍只对 ChatGPT 启用。

## 便签数据与稳定性

- 兼容旧数据键 `jotpatch:note:v1:*` 和 `jotpatch:preferences:v1`，`schemaVersion:1`。
- `NoteRepository` 构造参数为 `StoragePort`；单元测试可传 Map 伪存储，不需要网页环境。
- 原文以 quote + prefix/suffix + start/end 寻找锚点；当目标轮次未挂载时先找回所属轮次，再限制在该轮内验证原文；相同文字不代表同一消息。
- 轮次身份使用网页提供的稳定标识；历史记录不应保留被卸载的旧 Element 引用。
- 自动历史恢复必须**由用户导航点击触发**，有步数/时间上限、支持 AbortSignal、手动滚动中止，并防止错误成功。
- 不得通过“自动扫描所有历史”或直接调用未公开 ChatGPT API 作为默认能力；Navigation Lab 是可关闭实验。

## 内容脚本构建方式

本项目目前使用 `tsconfig.content.json` 的 `compilerOptions.module="none"`、`outFile="dist/content.js"`，多个文件共享 `namespace JP`。这是出于经典 content script、无运行时依赖和迁移风险的考虑。文件顺序属于**构建接口的一部分**：

1. `core` 类型（无运行逻辑）；
2. browser/site adapter registry 与站点注册；
3. `conversation.ts`/anchor 等算法、存储、UI 样式；
4. `app.ts` 和**最后的** `entry.ts`。

不要改成随意的 ES imports 后仍使用 `outFile`；需要转换打包工具时先独立 PR 和跨浏览器回归。当前背景脚本及设置脚本仍由独立文件构建或直接引用，Firefox 源码兼容性修复已进入主线；Leezh76 早期 Firefox 分支尚有独立提交，后续整合须保留其原始作者信息。

## 新浏览器适配步骤

1. 复用 `src/core`、站点适配器和 UI；根据 Firefox 实际 MV3 能力适配 `background`、`options`、Manifest。
2. `src/adapters/browsers/webextension.ts` 提供最基本的运行时选择，但**不能单靠这一文件宣称 Firefox 已经完成**。
3. 验证权限请求、选区右键、自动恢复、后台重启、持久化、导航、浏览器退出后数据恢复。
4. `npm run package:firefox` 与 Firefox 跨浏览器 CI 已建立；GitHub Release 可附临时 ZIP。正式持久安装仍依赖 AMO 签名 XPI，未经签名不能宣传为正常安装包。

## 关键测试

`npm run check`：编译/51+ 项 Node 契约、适配器、ZIP/版本测试。`npm run test:e2e`：Chromium 合成 DOM 浏览器回归。`npm run test:lab`：较慢的合成长会话模型，按场景运行。详见 [开发指南](DEVELOPMENT.md)。
