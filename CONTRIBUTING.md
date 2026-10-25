# 贡献与协作（Contributing）

感谢帮助改进 JotPatch。项目采用**一个仓库、两条长期分支**的轻量流程。

## 分支工作流

| 分支 | 用途 | 合入哪里 |
| --- | --- | --- |
| `main` | 稳定发行线、正式 Tag | 仅通过 `dev → main` 的 Release PR 或紧急补丁 |
| `dev` | 所有平台的集成开发线 | —— |
| `feature/<topic>` | 新功能/网站/浏览器适配 | `dev` |
| `fix/<topic>` | Bug 修复 | `dev` |
| `experiment/<topic>` | 尚待实测的技术探索 | 只有验证通过才申请合入 `dev` |
| `refactor/<topic>` | 工程重构 | `dev` |

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feature/claude-adapter
# 开发、测试、提交…
git push -u origin feature/claude-adapter
```

在 GitHub 创建 PR，**base 选 `dev`，不是默认的 `main`**。尚未完成的实验可开 Draft PR，避免强行合入。保护 `main`、`dev` 时至少要求 CI 通过；项目设置由维护者根据团队规模决定，不在未经确认时自行更改。

## PR 的最小要求

- 描述问题/需求、核心变化、影响的浏览器/网站。
- 贴出 `npm run check` 的真实执行结果；浏览器回归跑了什么、没有跑什么。
- 新网站适配：说明真实 DOM 来源和选择器边界，不凭猜测上线。
- 修改存储：说明向后兼容/迁移策略。
- 修改导航：说明虚拟化、取消、失败回滚是否经过测试。
- 无新增无关权限、网络请求、用户正文收集或密钥。
- 新增模块时，更新 `tsconfig`、开发文档和相应测试。

## 作者归属与 Leezh76 Firefox 开发

Firefox 工作现存于 `feature/firefox-port`（Leezh76）。其独立开发分支**尚未整合到当前 `dev`**。整合者应从原始分支以 **Merge commit** 或保留作者身份的 Cherry-pick 合入，不要把源码复制成 Housz 自己的提交。解决冲突的整合修改则由实际作者独立提交。对确实共同开发的改动使用双方认可的 `Co-authored-by`。

`dev → main` 的发行合并**统一采用 Merge commit**，不要 squash 掉多人提交历史。GitHub Contributors 通常根据默认分支的非合并提交作者统计；贡献进入 `dev` 但未进入 `main` 前可能暂不显示在默认统计。

## 工作范围与联系

- Housz：主线核心、产品体验、发行。
- Leezh76：Firefox 适配（正在开发），其他合作者可按任务负责 Claude、DeepSeek 等站点。
- 核心模块变更请让受影响的适配维护者参与 Review。
- 使用 GitHub Issue 讨论任务；不要在代码里留真实对话、Cookie、账号或私有令牌。

新开发者先看 [开发指南](docs/DEVELOPMENT.md) 和 [架构说明](docs/ARCHITECTURE.md)；AI 编码助手先读 [AGENTS.md](AGENTS.md)。
