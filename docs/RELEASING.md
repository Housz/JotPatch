# 发布 JotPatch（维护者操作）

## 分支流

- `main`：正式发布代码；Tag/Release 只从这里产生。
- `dev`：集成分支，所有功能、修复通过 PR 合入；未完成的技术实验继续保留在任务分支。
- `feature/*`、`fix/*`、`experiment/*`、`refactor/*`：个人任务分支。PR **目标必须选 `dev`**。

对功能 PR，推荐 **Create a merge commit** 以保留其他合作者的完整作者/提交记录。尤其 `dev → main` 的发布 PR **禁止 Squash**，必须保留祖先关系。冲突解决由整合者用独立提交记录；非共同完成工作不要滥用 `Co-authored-by`。

## 日常 dev 构建

合并到 `dev` 后，GitHub Actions 执行 `npm run check`，然后按 `GITHUB_RUN_NUMBER` 生成 `JotPatch-v0.1.18-dev.N-chromium.zip` 作为测试 Artifact。这个 ZIP 在根目录直接含 `manifest.json`、`dist/` 等必要文件，**不含源码和 Node 环境**。

本地：

```bash
npm install
npm run check
npm run package:dev
# 产物：build/chromium/ + artifacts/JotPatch-v0.1.18-dev.1-chromium.zip
```

Firefox 开发 ZIP 可通过 `npm run package:firefox` 构建，并在 `about:debugging#/runtime/this-firefox` 中临时加载。GitHub CI 使用 Firefox/Chromium 两个真实浏览器运行回归，Firefox 还通过 Selenium 临时安装和事件页测试。**没有签名的 Firefox ZIP 不等于可持续安装的正式 XPI**。

## 正式发行前

1. 从最新 `dev` 创建 Release PR，目标 `main`。不要在普通 feature PR 中改稳定版本。
2. PR 中锁定待发功能，更新 `config/version.json` 为 `"channel":"release"`，并将 `package.json.version`、`manifest.version`、`manifest.version_name` 都改成 `nextRelease`，例如 `0.1.18`。此外要为该版本准备发行说明，并更新发行工作流里的 `--notes-file` 到对应文件，严禁复用旧版本说明。
3. 执行 `npm run check`、完整 `npm run test:e2e` 和指定浏览器的人工安装烟测；`npm run package:release` 必须通过。
4. 合并前必须确保 `cross-browser-acceptance` 和 `typecheck-and-contracts` 两项 CI 均成功；Firefox Selenium 安装/事件页烟测不能被静态测试代替。真实登录 ChatGPT/Gemini 和商店权限提示若未实测须在发行说明披露。**Merge commit 合入 `main`**，保留原始提交及作者信息。
5. `.github/workflows/release.yml` 在 main 更新时验证发行渠道、版本、构建与包内容，然后**在同一个工作流中**创建指向该 main 提交的注释 Tag（例如 `v0.1.18`）和 GitHub Release（附 Chromium ZIP 与 Firefox 临时开发 ZIP）。如维护者设置 AMO_JWT_ISSUER / AMO_JWT_SECRET，自动通过 Mozilla AMO 签名并额外附上 Firefox signed XPI；签名步骤失败时整体发行失败。无签名凭据则必须在发行说明中明确 Firefox 仅供临时加载测试。GitHub Actions 内使用 GITHUB_TOKEN 推送的 Tag 不会再触发另一个工作流，因此不可把“推送 Tag”与“创建 Release”拆成相互依赖的两个任务。已有同名 Release 时保持幂等，不覆盖历史发行包。也支持对已有 Tag 的单独工作流重试。
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
| Firefox 临时安装、设置页、存储及事件页通信 | 是；失败不发布跨浏览器版本 |
| Firefox 签名 XPI 是否存在 | 若没有，Release 只注明临时安装 Firefox ZIP，不能宣传为普通用户安装版 |
| 当前浏览器平台是否已经实际支持 | 是；未完成的平台暂不发布 |
| 长对话 Lab 实验是否仍默认关闭 | 是，直到决定正式启用 |
