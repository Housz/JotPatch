# 版本与分支渠道

JotPatch 使用正式版 `MAJOR.MINOR.PATCH` 与对应的 Git Tag；开发线使用 `MAJOR.MINOR.PATCH-dev.N`。[`config/version.json`](../config/version.json) 控制渠道、基线与目标版本；[`scripts/versioning.mjs`](../scripts/versioning.mjs) 验证构建协议。

## 当前版本状态

| 对象 | 版本或配置 | 意义 |
| --- | --- | --- |
| 最新正式发行 | [v0.1.20](https://github.com/Housz/JotPatch/releases/tag/v0.1.20) | `main` 已发布的 Chromium ZIP 与未签名 Firefox ZIP |
| `dev` 的 `package.json.version` | `0.1.21-dev.1` | 新一轮开发版本 |
| `dev` 的 `manifest.version` | `0.1.20.1` | 浏览器要求的纯数字版本 |
| `dev` 的 `manifest.version_name` | `0.1.21-dev.1` | Chromium 显示版本；Firefox 构建时移除 |
| `config/version.json` | `channel=dev`、`baseline=0.1.20`、`nextRelease=0.1.21`、`devBuild=1` | 当前开发渠道 |

v0.1.19 仅作为中间开发周期存在，**没有正式 Tag 或 Release**；v0.1.20 是从 v0.1.18 直接升级的稳定版本。同步版本配置不会移动旧 Tag 或改写已发布的附件。

## 下一轮开发和正式发行

```text
当前 dev package.version       0.1.21-dev.1
当前 dev manifest.version      0.1.20.1
当前 dev manifest.version_name 0.1.21-dev.1

下次 release package.version       0.1.21
下次 release manifest.version      0.1.21
下次 release manifest.version_name 0.1.21
下次 Git Tag                     v0.1.21
```

在 `dev` 渠道中，`scripts/package.mjs --channel=dev --build=N` 使用 `0.1.20.N` 的数字 Manifest 版本以及 `v0.1.21-dev.N` 的发行包标识。数字开发版低于未来正式 `0.1.21`；Manifest 的每段版本号必须为不超过 65535 的整数。

正式发行时在 Release PR 中切换 `config/version.json.channel` 为 `release`，将 `package.json.version`、`manifest.version`、`manifest.version_name` 同步到 `nextRelease`，运行 [开发测试](DEVELOPMENT.md)并用 Merge commit 合入 `main`。不要为了测试直接修改正式 Tag 或旧 Release。

## Firefox 扩展身份与手动签名

固定 Firefox Gecko ID：`{8801fba0-08ef-481b-a4b6-870a061b2878}`，与最初签名 v0.1.17 一致。[v0.1.20 Release](https://github.com/Housz/JotPatch/releases/tag/v0.1.20) 中的 Firefox ZIP 仍是**未签名的 Mozilla 提交包**，不能用于普通 Firefox 的长期安装。维护者在**已有 AMO Unlisted 项目**取得同 ID、高版本的签名 XPI 后，应另行验收升级路径并上传到同一 Release；普通用户升级不要先卸载旧版。

本项目未配置自动更新或跨浏览器便签同步。历史上 v0.1.17 的签名 XPI 来源于后续 Firefox 热修复代码 `6757760a`，而该版本原始 Tag 指向 `34be0692`；v0.1.18 起已将签名身份和工具栏修复纳入正式源码。详见 [Firefox 指南](FIREFOX.md)及 [发行流程](RELEASING.md)。
