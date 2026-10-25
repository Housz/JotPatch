# 用 GPT / Codex / Claude / Copilot 参与 JotPatch 开发

这个仓库有统一的机器可读入口：[AGENTS.md](../AGENTS.md)。Claude Code 还可读取 [CLAUDE.md](../CLAUDE.md)，Copilot 可读取 [.github/copilot-instructions.md](../.github/copilot-instructions.md)。三个入口只引用同一套规则，避免产生互相矛盾的“AI 宪法”。

## 推荐给 AI 编码助手的任务模板

```text
你正在 Housz/JotPatch 的 [feature/xxx] 分支工作，PR 目标是 dev。
先读 AGENTS.md、docs/ARCHITECTURE.md、docs/DEVELOPMENT.md、CONTRIBUTING.md。
任务：<一条具体的用户可见需求/bug>
范围：<站点适配/核心/浏览器适配/界面中的哪一个>
不可更改：既有存储键、最小权限、用户数据本地性、v0.1.15 Lab 默认关闭。
先提出一段测试方案，再实现最小改动、补充测试并实际运行 npm run check。
浏览器测试未运行或失败时必须明确说明；不要创造通过报告。
如果涉及他人贡献，请保留原作者提交历史，不要重新署名。
最后输出：修改文件、变更摘要、测试证据、已知限制、PR 链接（若创建）。
```

## 场景任务举例

- **Claude 站点适配**：先取真实 Claude 网页 DOM 样本，`src/adapters/sites/claude.ts` 注册，新增真实/合成测试；不要改 `src/core/` 的通用扫描机制。添加到 `tsconfig.content.json` 中 registry 之后。
- **Firefox 浏览器适配**：从 Leezh76 的原始分支保留作者身份合并；适配 Manifest、后台生命周期、设置页 API 以及持久权限流程，再独立测试；不要把 Chromium ZIP 说成 Firefox 正式安装包。
- **长对话定位**：先复现目标未挂载、滚动容器替换或反向滚动的具体问题；新策略应可取消、有界停止、验证消息身份，不在未验证时默认启用。
- **便签 UI**：避免移动用户正在瞄准的目标；测试真实鼠标命中、存储持久化、删除/撤销和虚拟化失焦场景。

## 提交前最低自查

确认未泄露敏感数据、没有新增所有站点的默认权限、核心不调用 `chrome.*`、没有破坏命名空间编译顺序；运行 `npm run check` 并记录终端结果。架构重构应执行关键 Chromium E2E。收到不明确的需求时先记录假设，但优先交付可测试的最小切片。
