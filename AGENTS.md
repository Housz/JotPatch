# JotPatch — 工程与文档协作规则

这是 JotPatch 开发者及 AI 助手的首要入口。开发前先读 [开发指南](docs/DEVELOPMENT.md)、[架构说明](docs/ARCHITECTURE.md)和 [贡献规范](CONTRIBUTING.md)；编辑文档则从 [JotPatch documentation Skill](.agents/skills/jotpatch-documentation/SKILL.md) 开始，按需阅读 [W01–W10](docs/WRITING_STYLE.md) 和 [D01–D12/P0–P2](docs/DOCUMENTATION_TYPES.md)。

## 代码与协作红线

1. **从 `dev` 开发**：功能、修复和实验使用独立任务分支，PR 默认合入 `dev`。未经维护者授权，不合并 `main`、打 Tag 或创建 Release。
2. **保护贡献历史**：保留 Leezh76 等合作者的原始提交作者身份。多人发布合并使用 Merge commit，不用复制他人代码伪造作者。
3. **保护本地便签**：保持 `jotpatch:note:v1:*`、`jotpatch:preferences:v1`、`Note.schemaVersion: 1` 兼容；不做未评估的删除或迁移。
4. **保护隐私与权限**：不自动扫描完整聊天、不上传对话和便签、不采集令牌、不默认增加主机权限或调用 AI 网站未公开 API。
5. **保留产品交互**：便签原文锚定、导航轨道直接点击、已发现轮次的有界恢复与默认关闭的 Navigation Lab 是既有设计；改变前须有具体需求和回归。
6. **遵守模块边界**：站点选择器仅在 `src/adapters/sites/`；通用数据/导航逻辑在 `src/core/`；浏览器 API 经适配层使用。共享改动考虑 Chromium 和 Firefox。
7. **遵守打包顺序**：`tsconfig.content.json` 是 TypeScript `namespace JP` 的有序经典脚本打包；新增适配器必须先注册、后扫描，`entry.ts` 最后。
8. **明确测试等级**：实际运行 `npm run check`，用户行为变更执行相关 Chromium/Firefox 回归；权限、生命周期变更需真实扩展安装烟测。合成 DOM、真实安装、真实登录网站不得互相替代。
9. **区分发行物**：Chromium ZIP 可解压开发安装；Firefox 普通用户使用 Mozilla 签名 XPI。签名状态以实际附件为准；修复 PR 通过不等于已合并。
10. **版本与发行**：以 `config/version.json` 为版本渠道控制源，遵守 [版本规则](docs/VERSIONING.md)和 [发行流程](docs/RELEASING.md)。

## 文档和验收

文档按 D01–D12 分类，先核对 Release、`main`、`dev` 和未合并 PR 的事实身份，再撰写。维护 `README.md` 时同步 `README.en.md`；保留旧版 Release Notes、原始故障和实验记录，不因润色改写证据。按 P0/P1/P2 分类问题；技术文档需记录真正执行的检查及未验证项。

**完成条件**：变更范围明确、可回退；无无关权限/数据结构变化；更新必要用户/开发文档；报告测试命令与结果、影响浏览器及已知限制；提交 PR 至 `dev`，由维护者决定是否合并。

具体 AI 使用示例见 [AI 开发说明](docs/AI_DEVELOPMENT.md)。
