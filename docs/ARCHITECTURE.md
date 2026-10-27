# JotPatch 架构与数据边界

JotPatch 是一套 **Chromium / Firefox 共用核心的 WebExtension**。本文以 `dev` 当前实现为准，说明模块职责、数据流、兼容约束与可扩展点；已发布版本和待合并修复请分别核对 [版本说明](VERSIONING.md)与 [Firefox 说明](FIREFOX.md)。

设计采用渐进式模块化：`src/content/app.ts` 仍负责大量页面交互，后续按职责小步拆分，不在普通修复中重写整套运行时。早期设计记录保存在 [v0.1.15 架构归档](LEGACY_ARCHITECTURE_0_1_15.md)。

## 启动与数据流

```text
浏览器工具栏 / 选区右键 / 已授权网站
      ↓
src/background/index.ts
  ├─ Chromium: MV3 service worker
  ├─ Firefox: MV3 event page（打包时转换 Manifest）
  └─ 按需注入 dist/content.js + styles/highlight.css
      ↓
src/content/entry.ts（避免重复实例）
      ↓
src/content/app.ts（Shadow DOM、事件、读写与导航编排）
  ├─ src/adapters/sites/registry.ts + chatgpt.ts / gemini.ts
  ├─ src/content/conversation.ts（网页 Prompt 采集与坐标）
  ├─ src/core/（锚点、索引、恢复、布局、Markdown、存储）
  └─ src/ui/（便签及轨道样式）
      ↓
src/adapters/browsers/webextension.ts
      ↓
扩展 storage.local（仅当前浏览器配置）
```

`options.html`、`options.js` 负责设置与站点授权；站点自动恢复使用可选 HTTP(S) 主机权限，平时点击图标使用 `activeTab`。这些路径不会读取浏览器 Cookie 或向远程服务器同步便签。

## 模块与依赖规则

| 路径 | 责任 | 不应承担的任务 |
| --- | --- | --- |
| `src/core/` | `TextAnchor`、`NoteRepository`、Markdown、轮次身份、导航恢复与轨道布局 | AI 网站选择器、直接 `chrome.*` / `browser.*` 调用 |
| `src/adapters/sites/` | 精确匹配 AI 网站域名，定位用户 Prompt、识别网站自带导航 | 修改便签 Schema、存储和通用布局 |
| `src/adapters/browsers/` | 提供 `extensionApi()` 浏览器 API 入口 | 站点 DOM 逻辑 |
| `src/content/conversation.ts` | 扫描当前已挂载用户提问、判断滚动容器和目标元素 | 扫描未加载聊天历史或调用网站私有 API |
| `src/content/app.ts` | 页面 UI 事件、权限消息响应、便签生命周期和导航调度 | 作为新增站点选择器的存放处 |
| `src/background/index.ts` | 工具栏、右键、按需注入、授权站点脚本注册 | 保存聊天内容到远端 |
| `src/ui/` | Shadow DOM 便签、导航轨道的样式与 UI 工具 | 跨浏览器数据协议 |

## 本地数据与兼容性

以 [`src/core/types.ts`](../src/core/types.ts)和 [`src/core/repository.ts`](../src/core/repository.ts)为权威定义。

| 存储对象 | 标识 / 字段 | 用途 |
| --- | --- | --- |
| 单张便签 | `jotpatch:note:v1:<id>`，`Note.schemaVersion: 1` | 保存 `id`、`pageKey`、`text`、`createdAt`、`updatedAt`、原网址与标题 |
| 原文锚点（可选） | `anchor: {version, type, exact, prefix, suffix, start, end}` | 查找原文并避免相似文本误锚定 |
| 轮次关联（可选） | `conversationTurnId`、`spatial` | 将便签归入正确 AI 提问，保存位置提示 |
| 外观（可选） | `appearance.color/fontSize/width/height/offsetX/offsetY` | 保存颜色、字号、大小和偏移 |
| 修订与删除（可选） | `revision`、`deletedAt` | 处理跨页面保存冲突、删除撤销及短期墓碑 |
| 偏好 | `jotpatch:preferences:v1` | 图钉模式、导航开关、Lab 开关、默认颜色 |

存储由 `StoragePort` 注入 `NoteRepository`。页面只加载当前 `pageKey` 的便签；`pageKey` 使用网址路径、重要查询参数和路由 hash，过滤常见追踪参数。不同浏览器安装、不同扩展 ID 或浏览器配置的本地存储并不自动互通。

删除通过 `deletedAt` 临时墓碑避免旧标签页重放已删除内容；有冲突时暂停本页覆盖保存并提示用户备份。升级必须保持旧数据结构可读取，不得因原文卸载自动删除便签。

## 原文锚定和 AI 对话恢复

1. 用户主动选区时，`src/core/anchor.ts` 通过 `Range` 提取 exact quote、最多 48 字符的前后文和字符偏移。原文选区上限 1600 字，正文索引有 2,000,000 字符上限。
2. 后续恢复优先匹配 exact quote 和上下文；旧字符坐标只是参考。多处匹配不够确定时拒绝自动重连。
3. AI 网页先由站点适配器找出用户 Prompt；`ConversationIndex` 保留曾发现的稳定轮次身份，不将被卸载的旧 DOM 元素当作有效目标。
4. 点击历史 Prompt 时，`navigation-recovery.ts` 在有限时间/步数内按需查找；支持 `AbortSignal` 和用户中止。滚动完成不等于找到了目标。
5. 点击锚定便签时，优先恢复保存的 `conversationTurnId`，再在该轮范围内验证 exact quote。跨轮次出现同一句话不能判为到达。
6. `navigation-lab.ts` 使用可选的内存检查点实验策略，目前默认关闭，且只在 ChatGPT 适配场景开启。

导航轨道由 `src/core/rail-layout.ts` 计算位置：灰色 Prompt 短线与彩色便签标记保持原序，密集时小幅横向避让以便直接点击；不会将目标合并成二次选择器或鱼眼效果。历史方案及实验证据见 [Navigation Lab 记录](NAVIGATION_LAB_0_1_15.md)。

## KaTeX / MathML 原文锚定

普通文本索引不等于浏览器选区的 `Range.toString()`。KaTeX 一个公式往往包含隐藏的辅助 MathML、原始 TeX 注释与供人阅读的 HTML 字形，SVG/辅助文本可能导致原始 `Range` 为空、重复或超长。

`src/core/anchor.ts` 将**可识别公式作为索引中的一个虚拟片段**：从 `annotation[encoding^="application/x-tex"]` 或网页自带 `data-tex`、`data-latex`、`math[alttext]` 读取稳定内容，以 `\\(...\\)` 形式纳入 `anchor.exact`，不解析公式含义，也不写入页面 DOM。定位时映射到整个公式的 DOM 元素边界；原文混合选区与普通文字共用 `TextAnchor` v1、上下文消歧、所属轮次限制和撤销逻辑。重绘后验证新的真实 DOM，未提供可读取数学身份时拒绝猜测。

**当前精度是整条公式**，不是每个上/下标单独锚定。没有 LaTeX/可读 MathML 的图片或纯 SVG 不保证支持。回归材料在 [`fixtures/math-selection.html`](../fixtures/math-selection.html) 与 [`tests/math_selection_e2e.py`](../tests/math_selection_e2e.py)，由合成 DOM 浏览器测试验证；不将此测试称为已覆盖 ChatGPT 的全部线上 DOM 变体。

## 浏览器、站点和构建

ChatGPT 适配器精确匹配 `chatgpt.com` / `chat.openai.com`，Gemini 匹配 `gemini.google.com`。新 AI 站点需独立实现 `ConversationAdapter` 并在 [`tsconfig.content.json`](../tsconfig.content.json)中按顺序注册，不能猜测选择器后直接宣称兼容。

`tsconfig.content.json` 通过 TypeScript `module: "none"` 和 `outFile: "dist/content.js"` 构建共享的 `namespace JP` 经典内容脚本。关键顺序为 **类型 → browser/site registry → 站点适配 → 算法、存储、样式 → `app.ts` → `entry.ts`**。模块系统迁移须单独评审并覆盖双浏览器回归。

Firefox Manifest 由 [`scripts/firefox-manifest.mjs`](../scripts/firefox-manifest.mjs)派生，改用事件页与 `options_ui`；Chromium 使用 service worker。注意 `dev` 的 Firefox ID 与后续签名修复版仍有差异，具体见 [Firefox 发行来源](FIREFOX.md)，不能直接拿旧 `dev` ZIP 替代签名 XPI。

## 已实现与尚未实现

- **已实现**：本页多便签、原文锚点、简化 Markdown、ChatGPT/Gemini 已发现轮次导航、Chromium/Firefox 构建、Navigation Lab 可选实验。
- **待验证**：真实登录 AI 网站持续变更的 DOM、跨浏览器实际权限流程、Firefox 正式持久安装的完整人工矩阵。
- **尚未实现**：跨网页持续跟随悬浮便签、浏览器外独立窗口、账号/云同步；不得把产品方向写成当前功能。

运行与测试层级见 [开发指南](DEVELOPMENT.md)。架构决定随新需求更新本页；原始实验结论保持在带版本的历史报告中。
