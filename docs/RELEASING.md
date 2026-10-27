# JotPatch 发行与签名流程

本文供维护者发布新版本。**正式发布必须由维护者批准**；文档 PR、测试通过、打包完成和商店签名是不同状态，不会自动相互授权。

## 发行模型

- `dev`：功能与修复集成线，任务分支通过 PR 合入。
- `main`：正式发布线，从 `dev` 创建 Release PR，使用 **Merge commit** 保留原始作者和祖先历史，不能 Squash。
- `hotfix/*`：已发行版本的独立紧急修复，完成测试后整合同一修复到 `main` 和 `dev`，避免下一版回归。

详细版本校验见 [版本规则](VERSIONING.md)，贡献和作者归属见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 1. 锁定发行源码和版本

从最新 `dev` 创建 Release PR 到 `main`，将 `config/version.json` 切换为 `channel=release`，同步 `package.json.version`、`manifest.version` 与 `manifest.version_name` 到新正式版本，例如 `0.1.19`。

准备匹配版本的 `docs/RELEASE_NOTES_0_1_19.md`（下一版目标，尚未创建）；当前 [`.github/workflows/release.yml`](../.github/workflows/release.yml)按版本数字读取 `docs/RELEASE_NOTES_<underscored-version>.md`，不要复用旧版说明或假设有另一处 `--notes-file` 手工参数。

Firefox 签名使用固定 Gecko ID `{8801fba0-08ef-481b-a4b6-870a061b2878}`。**v0.1.18 正式发行已经整合 [Firefox 修复来源](https://github.com/Housz/JotPatch/pull/30)，后续正式发行仍需验证 Firefox ZIP 中的 ID、启动行为和本地存储升级路径。**

## 2. 验证待发代码

```bash
# 在经审批的 release 版本分支根目录运行
npm install
npm run check
npm run test:e2e
npm run package:release
node scripts/package.mjs --channel=release --browser=firefox
node scripts/verify-release-package.mjs
npx web-ext lint --source-dir build/firefox --self-hosted
```

Release PR 还需核对 GitHub CI 的 `typecheck-and-contracts` 和 `cross-browser-acceptance` 成功，安排相关浏览器的实际安装/权限测试。真实登录 ChatGPT/Gemini、Firefox 持久安装和浏览器重启如果没有执行，应在验收及发行说明中明确。构建、合成页面、临时安装、Mozilla lint、正式签名各有不同的证据粒度。

## 3. 合并并生成 GitHub Release

审批通过后，以 Merge commit 将 Release PR 合并至 `main`。[发行工作流](../.github/workflows/release.yml)检查 `release` 渠道、源码版本、包的文件清单和跨浏览器代码一致性，在**同一次**工作流中创建 Tag 和 GitHub Release。

发布的基础附件为同一源码版本的 Chromium ZIP 与 Firefox ZIP。Firefox ZIP 用于开发者临时调试；普通用户安装必须使用 Mozilla **签名的 XPI**。本次采用手工签名流程：流水线仅发布 ZIP，**不读取 AMO API 密钥、不自动签名或上传 XPI**。

Tag 和 Release 不等价于 `main` 合并成功；合并后必须实际核对 Tag 指向、CI、Release 状态及附件。对已有 Tag、Release 或历史产物，不覆盖同名附件或悄悄移动提交。

## 4. 手工 Mozilla Unlisted 签名（当前采用）

1. 从通过验证的**明确提交**构建 Firefox 发行 ZIP，核对 `manifest.version` 和固定 Gecko ID。
2. 在 Mozilla AMO Developer Hub **已有的 JotPatch 附加组件**下提交新版本，选择 **On your own / Unlisted**，而不是新建不同 ID 的项目。
3. 等待 Mozilla 实际批准并获得签名 XPI。核对签名 XPI 的版本、ID、运行时代码和待发源码一致性。
4. 在普通 Firefox 中检查 XPI 的正常安装、工具栏首次激活、便签保存、刷新恢复以及重启后扩展仍存在。已安装旧版的升级测试要避免先卸载。
5. 把已经验收的签名 XPI 添加到该版本的 GitHub Release，注明安装方式与已知限制。手动上传是当前默认流程；自动签名仅是可选扩展。

当前 GitHub Actions 的正式发布步骤不执行 Mozilla 自动签名；维护者从新版本 Firefox ZIP 手工获取 XPI 后，再单独核对并上传到同一 GitHub Release。**不要将签名凭据写进源码、PR 或公开日志。**

## 5. 手动更新与升级

- Chrome/Edge：用户重新下载 Chromium ZIP，保留原解压扩展身份并重新加载。不是 Chrome Web Store 自动更新。
- Firefox：用户下载**版本更高且固定 ID 不变**的签名 XPI，通过 `about:addons` 从文件安装覆盖升级。当前没有 `update_url` 自动更新机制。
- 既有用户应尽量升级原安装而非卸载；升级前记录存储兼容性与权限差异。不同浏览器的数据不会自动迁移。
- Chrome Web Store、Edge Add-ons 和 Mozilla AMO 的审核/签名状态是独立流程；本项目当前以 GitHub Releases 作为公开下载入口。

## v0.1.17 的已知发行来源差异

截至 2026-10-27，Release v0.1.17 提供 `JotPatch-v0.1.17-chromium.zip` 和 `JotPatch-v0.1.17-firefox-signed.xpi`。Firefox 签名 XPI 是后续修复 `6757760a` 的文件，而原 Tag 指向 `34be0692`。该历史差异须保留可追溯说明；未来版本优先保证签名包和正式源码同源。详见 [Firefox 指南](FIREFOX.md)。

## 发行核对表

| 验收 | 必须核对的证据 |
| --- | --- |
| 版本与源码 | `config/version.json`、Manifest、`package.json`、Tag 的提交 SHA |
| 数据与权限 | Note Schema v1、最小权限、无意外主机权限 |
| 自动化质量 | Node/合约、适用 Chromium 和 Firefox 合成 DOM、浏览器原生安装 |
| Firefox 安装包 | Mozilla 实际签名 XPI、固定 Gecko ID、正确版本和安装测试 |
| 真实网站 | 已运行的 ChatGPT/Gemini 人工验收及未运行的部分 |
| 历史与作者 | 不覆盖旧 Tag/附件，保留合作者提交身份 |
| 文档 | [发行说明类型 D10](DOCUMENTATION_TYPES.md)、用户指南及中英文 README 内容一致 |

发布后同步正式修复回 `dev`，更新 `baseline` 并开始下一轮 `-dev.1`；避免后续正式版恢复已修复的 Firefox 故障。
