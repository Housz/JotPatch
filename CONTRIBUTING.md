# 贡献 JotPatch

JotPatch 使用一个仓库、两条长期分支。请先从 [README](README.md) 了解项目，再按 [开发指南](docs/DEVELOPMENT.md)运行适用检查。文档贡献按 [文档类型与验收规范](docs/DOCUMENTATION_TYPES.md) 处理。

## 分支与 PR

| 分支 | 用途 |
| --- | --- |
| `main` | 稳定发行代码、正式 Tag |
| `dev` | 跨浏览器开发集成线 |
| `feature/*`、`fix/*`、`refactor/*` | 功能、修复和小步重构，PR 到 `dev` |
| `experiment/*` | 尚待验证的方案，不直接视为正式功能 |
| `hotfix/*` | 仅在明确的发行故障下从 `main` 派生，修复后同步到 `dev` |

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c docs/describe-change
# 编辑、检查、提交并推送
git push -u origin docs/describe-change
```

创建 PR 时选择 **base: `dev`**。已发行的紧急修复可按 [发行指南](docs/RELEASING.md)走独立 hotfix 流程；正式发行 `dev → main` 必须 Merge commit，不能 Squash 合作者历史。PR 审核通过不意味着自动合并或发布。

## 代码 PR 提交信息

说明实际问题、影响的浏览器和网站、主要改动、向后兼容、数据/权限变化、测试范围及限制。添加站点适配器需提供真实页面 DOM 证据和合成回归；变更导航应覆盖重挂载、取消、不可达及错误原文匹配。不要提交个人对话、Cookie、密钥或未授权日志。

`npm run check` 是基础检查。涉及用户行为时运行相应 E2E；涉及 Firefox 权限/后台生命周期时补充真实安装测试。不能执行的测试请明确记录原因，不写成已通过。

## 文档 PR 提交信息

1. 按 [D01–D12](docs/DOCUMENTATION_TYPES.md)标记文档类型和适用生命周期（现行/版本化/历史）。
2. 对照 [W01–W10](docs/WRITING_STYLE.md)检查自然表达、事实来源与术语；`README.md` 和 `README.en.md` 成对更新。
3. P0（事实/安全/证据）、P1（内容/链接/一致性）必须解决；P2 是人工风格建议。
4. 核对 Markdown 相对链接、版本号、权限、签名 XPI 和真实附件；记录实际执行的检查。纯文档 PR 不修改代码、Manifest、版本、Release、Tag 或已归档实验。
5. 在 PR 中列出修改文件、事实基线、检查结果与未执行的浏览器/商店验收。

可通过 [.agents/skills/jotpatch-documentation/SKILL.md](.agents/skills/jotpatch-documentation/SKILL.md) 进入文档流程。

## 作者与维护者

Housz 维护核心、产品与发行；Leezh76 主要贡献 Firefox 适配。原始提交须保留原作者，冲突解决由实际整合者记录；确实共同完成时才使用双方认可的 `Co-authored-by`。必要时邀请受影响平台的维护者 Review。发现 Bug 可用 GitHub Issue，附可公开的复现步骤并移除敏感内容。

长期分支与发布细则见 [版本规范](docs/VERSIONING.md)及 [发行流程](docs/RELEASING.md)。
