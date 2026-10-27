# 版本与分支渠道

JotPatch 的稳定版本使用 `MAJOR.MINOR.PATCH`，Git Tag 为 `vMAJOR.MINOR.PATCH`；`dev` 的开发版本使用 `MAJOR.MINOR.PATCH-dev.N`。以 [`config/version.json`](../config/version.json)为渠道配置，校验规则见 [`scripts/versioning.mjs`](../scripts/versioning.mjs)。

## 当前版本（2026-10-27）

| 对象 | 版本或配置 | 意义 |
| --- | --- | --- |
| 最新正式发行 | [v0.1.18](https://github.com/Housz/JotPatch/releases/tag/v0.1.18) | `main` 上已发布的两浏览器 ZIP |
| `dev` 的 `package.json.version` | `0.1.19-dev.1` | 下一轮开发版本 |
| `dev` 的 `manifest.version` | `0.1.18.1` | 纯数字 WebExtension 版本 |
| `dev` 的 `manifest.version_name` | `0.1.19-dev.1` | Chromium 显示版本；Firefox Manifest 转换时删除 |
| `config/version.json` | `channel=dev`、`baseline=0.1.18`、`nextRelease=0.1.19`、`devBuild=1` | 开发渠道配置 |

`v0.1.18` 对应合并源码 `aca4797cc9240b26329525edcca52b0f667e6879`，该 Tag 及附件不会因启动下一轮 `dev` 而修改。

## 开发与发行映射

```text
当前 dev package.version       0.1.19-dev.1
当前 dev manifest.version      0.1.18.1
当前 dev manifest.version_name 0.1.19-dev.1

下次 release package.version       0.1.19
下次 release manifest.version      0.1.19
下次 release manifest.version_name 0.1.19
下次正式 Git Tag                 v0.1.19
```

`scripts/package.mjs --channel=dev --build=N` 会生成 `0.1.18.N` 的数字 Manifest 版本与 `v0.1.19-dev.N` 包名。数字版本用于浏览器升级排序，开发版仍低于未来的 `0.1.19` 正式版。Chrome 扩展 Manifest 版本最多四段，每段为 0–65535 的整数；不能把 `-dev.N` 写入 `manifest.version`。

准备正式发布时，在从 `dev` 派生的 Release PR 中将渠道切换到 `release`，同步 `package.json.version`、`manifest.version` 和 `manifest.version_name` 到 `nextRelease`。运行 `npm run check`、必要浏览器回归和 `npm run package:release`。未经审批不直接改 `main`、Tag 或已有 Release。

## Firefox 扩展身份与手动更新

Firefox 正式签名扩展保持 ID `{8801fba0-08ef-481b-a4b6-870a061b2878}`，与 v0.1.17 已签名 XPI 相同。`v0.1.18` Firefox ZIP 已发布，但还需要维护者在 Mozilla Unlisted 项目中**手动签名**并将 XPI 单独附加到 [v0.1.18 Release](https://github.com/Housz/JotPatch/releases/tag/v0.1.18)。未签名 ZIP 不能作为普通 Firefox 的持久安装包。此流程没有实现自动更新或跨浏览器便签同步。

历史上，v0.1.17 的 Firefox 签名 XPI 来自后续热修复提交 `6757760a`，原 v0.1.17 Tag 来自 `34be0692`。v0.1.18 已通过 [Firefox 修复整合](https://github.com/Housz/JotPatch/pull/30) 将同一固定扩展 ID 和启动修复纳入正式源码。发行与数据安全细节见 [发行指南](RELEASING.md)和 [用户指南](USER_GUIDE.md)。
