# 使用 AI 助手开发与维护 JotPatch

AI 助手通过 [AGENTS.md](../AGENTS.md) 接收统一工程约束；Claude Code 和 Copilot 的入口分别是 [CLAUDE.md](../CLAUDE.md)和 [.github/copilot-instructions.md](../.github/copilot-instructions.md)。这些入口不维护互相冲突的规则。

**只处理文档时**，使用 [jotpatch-documentation Skill](../.agents/skills/jotpatch-documentation/SKILL.md)，按 [写作规范](WRITING_STYLE.md)与 [D01–D12 分类、P0/P1/P2 验收](DOCUMENTATION_TYPES.md)工作。

## 开始一个开发任务

1. 从 `dev` 的当前源码和 [架构说明](ARCHITECTURE.md)确定事实基线；确认相关功能是否已在 `main` 发行、仍在 PR，或仅属实验。
2. 明确一个可复现的问题、受影响浏览器/网站、不能改变的数据和交互。
3. 先确定最小改动与相关测试，再实现、运行并记录结果。
4. 保留合作者提交作者身份，向 `dev` 提交 PR；维护者批准前不合并 `main` 或发行。

## 可复用任务描述

```text
仓库：Housz/JotPatch，基线：dev 当前提交；任务分支：<branch>，PR base：dev。
任务：<用户可感知的需求或可复现问题>
范围：<core / 网站适配 / 浏览器适配 / UI / 文档>
既有约束：Note Schema v1、本地存储、最小权限、稳定的一步点击导航、Navigation Lab 默认关闭。
验收：<相关 Node / 浏览器合成 DOM / 真实扩展安装 / 真实网站检查>
先核对源码与历史设计，执行最小改动，不捏造测试或发行结果。
完成时提供变更文件、测试证据、未测范围、数据影响和 PR 链接。
```

## 常见场景

- **ChatGPT、Gemini 或新 AI 站点**：站点选择器属于 `src/adapters/sites/`；对新站点采集真实 DOM 和独立回归。未访问的历史轮次不能凭空成为导航索引。
- **Firefox**：对照实际 MV3 事件页、Manifest 和 WebExtension 行为。修复分支通过 CI 并不等于已合入 `dev`；用户分发只能使用 Mozilla 签名的 XPI，且必须核对源码来源。
- **导航与便签**：先验证身份、锚点与虚拟化状态，再排查滚动。失败需可取消、可停止且不误报到达。
- **仅修改文档**：判断 D01–D12，分离 Release、`main`、`dev` 和历史结论，核对相对链接及 README 双语；不触发构建发布或浏览器安装。

## 交付检查

`npm run check` 包含编译和 Node 测试。浏览器级检查应按 [开发指南](DEVELOPMENT.md)运行并逐级记录；Node 通过不能替代 Chromium/Firefox 合成页面、真实安装和登录页面人工验收。只运行文档检查时明确说明浏览器测试未运行。

文档改动应控制在授权范围内，保存原始 Release Notes、历史失败与研究记录。对事实或兼容边界不确定时给出可核验的链接，而不是用笼统免责声明代替调查。
