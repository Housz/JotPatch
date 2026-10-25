# 发布 JotPatch（维护者操作）

## 分支流

- `main`：正式发布代码；Tag/Release 只从这里产生。
- `dev`：集成分支，所有功能、修复通过 PR 合入；未完成的技术实验继续保留在任务分支。
- `feature/*`、`fix/*`、`experiment/*`、`refactor/*`：个人任务分支。PR **目标必须选 `dev`**。

对功能 PR，推荐 **Create a merge commit** 以保留其他合作者的完整作者/提交记录。尤其 `dev → main` 的发布 PR **禁止 Squash**，必须保留祖先关系。冲突解决由整合者用独立提交记录；非共同完成工作不要滥用 `Co-authored-by`。

## 日常 dev 构建

合并到 `dev` 后，GitHub Actions 执行 `npm run check`，然后按 `GITHUB_RUN_NUMBER` 生成 `JotPatch-v0.1.16-dev.N-chromium.zip` 作为测试 Artifact。这个 ZIP 在根目录直接含 `manifest.json`、`dist/` 等必要文件，**不含源码和 Node 环境**。

本地：

```bash
npm install
npm run check
npm run package:dev
# 产物：build/chromium/ + artifacts/JotPatch-v0.1.16-dev.1-chromium.zip
```

Firefox 当前独立于该发行流水线，尚未承诺完成 Firefox 可安装包。等待合作者的分支完成全功能整合和 Firefox 测试后，给 Release 工作流增加 Firefox 打包及签名。

## 正式发行前

1. 从最新 `dev` 创建 Release PR，目标 `main`。不要在普通 feature PR 中改稳定版本。
2. PR 中锁定待发功能，更新 `config/version.json` 为 `"channel":"release"`，并将 `package.json.version`、`manifest.version`、`manifest.version_name` 都改成 `nextRelease`，例如 `0.1.16`。
3. 执行 `npm run check`、完整 `npm run test:e2e` 和指定浏览器的人工安装烟测；`npm run package:release` 必须通过。
4. **Merge commit 合入 `main`**，保留原始提交及作者信息。
5. `.github/workflows/release.yml` 在 main 更新时验证发行渠道、版本、构建与包内容，然后**在同一个工作流中**创建指向该 main 提交的注释 Tag `v0.1.16` 和 GitHub Release（附 Chromium ZIP）。GitHub Actions 内使用 GITHUB_TOKEN 推送的 Tag 不会再触发另一个工作流，因此不可把“推送 Tag”与“创建 Release”拆成相互依赖的两个任务。已有同名 Release 时保持幂等，不覆盖历史发行包。也支持对已有 Tag 的单独工作流重试。
6. 手动完成 Chrome Web Store、Edge Add-ons 的上传审核流程；Firefox 必须以完成 Mozilla 签名的 XPI/AMO 为准，不能把未签名 ZIP 改名成 XPI 后视为正式版。
7. 把修复和版本状态同步回 `dev`（如有临时 hotfix），随后开启下一轮 `-dev.1`。

## 已发行版本紧急 Bug

从 `main` 切 `hotfix/*` 修复并测试，合入 `main`、发布补丁 Tag，然后**合并或 Cherry-pick 同一修复回 `dev`**。不要让下一次发布回滚正式线中的修复。

## 发行审批表

| 检查 | 必须 |
| --- | --- |
| 基线来源可追溯、Commit Author 保留 | 是 |
| Node 构建、类型和契约测试通过 | 是 |
| Chromium 安装与新建、保存、恢复和跳转基本用例 | 是 |
| 版本、扩展权限、Manifest 一致 | 是 |
| ZIP 根目录有 Manifest、无源码/敏感文件 | 是 |
| 当前浏览器平台是否已经实际支持 | 是；未完成的平台暂不发布 |
| 长对话 Lab 实验是否仍默认关闭 | 是，直到决定正式启用 |
