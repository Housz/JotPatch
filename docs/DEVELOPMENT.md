# 开发环境与本地验证

## 准备

- Node.js **20 或更新**（推荐 22）、npm。
- `npm install` 安装唯一必需的开发依赖 TypeScript；运行时无第三方依赖。
- 浏览器端到端回归可选：Python 3、`pip install playwright` 和 Chromium；Linux 发行版路径通常是 `/usr/bin/chromium`。具体安装由各测试脚本参数和环境决定。

```bash
git clone https://github.com/Housz/JotPatch.git
cd JotPatch
git switch dev
npm install
npm run check
npm run package:dev
```

如本机没有开发专用依赖，请先通过 `npm install`；CI 同样如此。不是 Firefox 开发者时，不需要安装 Firefox SDK。项目不依赖 ChatGPT API Key。

## 开发位置速查

- **原文选区/定位**：`src/core/anchor.ts`、`src/core/page-key.ts`
- **便签数据/偏好**：`src/core/repository.ts`、`src/core/types.ts`
- **Prompt 识别**：`src/adapters/sites/{registry,chatgpt,gemini}.ts`
- **对话扫描与坐标**：`src/content/conversation.ts`
- **历史轮次身份与恢复**：`src/core/conversation-index.ts`、`navigation-recovery.ts`、`navigation-lab.ts`
- **导航标记布局**：`src/core/rail-layout.ts`
- **页面交互/DOM 编排**：`src/content/app.ts`
- **UI 样式**：`src/ui/{palette,elements,paper-styles}.ts`、`options.html`
- **浏览器入口**：`src/adapters/browsers/webextension.ts`、`src/background/index.ts`

添加新文件需要同时检查 `tsconfig.content.json` **显式文件顺序**。不要在 `core` 引入站点选择器/浏览器全局 API。

## 测试流程

```bash
npm run build                # dist/content.js + dist/background.js
npm run check                # build + Node 契约/布局/适配/版本测试
npm run package:dev          # 开发 ZIP 可用于 Chromium 解压加载
npm run test:e2e             # Chromium 集成测试（较慢）
npm run test:lab             # 慢速历史导航模拟，可指定一个场景
```

合成网页测试无法证明真实登录 ChatGPT/Gemini 页面完全兼容。若你修复与虚拟化或浏览器权限有关的问题，需要再做真实浏览器人工验证，记录目标是否确实进入视口，而不只是 scrollTop 值改变。

### 在 Windows / macOS 开发

`npm run check` 和 `npm run package:dev` 使用 Node 构建，跨平台；打包 ZIP 不依赖外部 `zip` 命令。Playwright 使用的 Chromium 执行文件路径可能不同，可以只运行 Node 测试并在 PR 明确说明未执行 E2E；不要把未运行写为通过。

### 调试扩展

1. `npm run build` 后到 Chromium 扩展页面加载**仓库根目录**（或者 `build/chromium`）。
2. 修改内容脚本后，扩展管理页点击**重新加载**，刷新目标网页。
3. `console` 出错请区分网站本身（如 Statsig 请求被客户端拦截）与 JotPatch 栈；收集最短重现信息，不复制用户聊天数据。
4. 若改变存储模型，必须写迁移测试，确保旧 `jotpatch:note:v1:*` 仍可读取或安全升级。

## 开发风格

- 新 PR 范围小且可撤销；尽量不要和功能修复同时升级构建工具。
- 核心导航要求逻辑身份确认、不可达时停止、滚动可取消，不以接近的像素位置当作成功。
- 不要因为虚拟化卸载，就删除或强行弹出历史便签。
- 默认权限最小化；不得上传用户原文，不能通过未公开接口后台扫描会话。
- 新站点适配写 DOM 合成测试并由真实站点验证；Firefox 适配必须完成 Firefox 特有权限与生命周期测试。
