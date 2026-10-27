# 版本与分支渠道

JotPatch 的稳定版本使用 `MAJOR.MINOR.PATCH`（例如 `0.1.17`），Git Tag 使用 `v0.1.17`；`dev` 使用 `MAJOR.MINOR.PATCH-dev.N`。以 [`config/version.json`](../config/version.json)为发行渠道源，构建约束由 [`scripts/versioning.mjs`](../scripts/versioning.mjs)校验。

## 当前已核实的版本

截至 **2026-10-27**：

| 对象 | 数值 | 说明 |
| --- | --- | --- |
| v0.1.18 发行来源 | `release/0.1.18-chromium-firefox-zip → main` | 正式 Tag `v0.1.18` 对应发行合并提交 |
| `package.json.version` | `0.1.18` | 稳定发行版 |
| `manifest.version` / `manifest.version_name`（源码） | `0.1.18` / `0.1.18` | 两浏览器发行包 Manifest 均为纯数字 `0.1.18` |
| `config/version.json` | `channel=release`、`baseline=0.1.17`、`nextRelease=0.1.18` | 发行流水线读取版本配置 |

表中为 v0.1.18 的正式发行源码配置；开发分支应在发行后通过独立同步 PR 进入下一轮 `0.1.19-dev.1`。Chrome Manifest 最多四段纯整数，每段 0–65535，不能直接填 `-dev.N`。

## 版本映射

```text
上一轮 dev package.version    0.1.18-dev.1
上一轮 dev manifest.version   0.1.17.1
上一轮 dev manifest.version_name 0.1.18-dev.1

release package.version 0.1.18
release manifest.version 0.1.18
release manifest.version_name 0.1.18  (源文件；发布时可移除)
Git Tag                 v0.1.18
```

发行前 `scripts/package.mjs --channel=dev --build=N` 曾用流水线编号生成 `0.1.17.N` 的 Manifest 版本及 `v0.1.18-dev.N` 安装包名。数字开发版排序低于正式 `0.1.18`，避免测试版阻碍稳定版升级。

## 开发与正式发行

开发时运行 `npm run package:dev` 或 `npm run package:firefox`。正式发行前在 Release PR 中将 `config/version.json.channel` 改为 `release`，并把 `package.json.version`、`manifest.version` 和 `manifest.version_name` 设置为 `nextRelease`。运行 `npm run check`、目标浏览器验收及 `npm run package:release`；版本未对齐时打包脚本应拒绝发布。

稳定版修复一般递增 PATCH（例如 `0.1.17 → 0.1.18`）；新增兼容功能可递增 MINOR；破坏兼容的重大调整需单独评估升级和数据迁移。早期 `0.x` 版本变化按项目实际审批决定，不将 `-dev.N` 当成独立正式版本。

## Firefox 扩展身份和例外来源

Firefox 每次提交新版本时须保持已经 Mozilla 签名的固定 Gecko ID：`{8801fba0-08ef-481b-a4b6-870a061b2878}`。**v0.1.18 发行源码已整合 [Firefox 热修复 PR #24](https://github.com/Housz/JotPatch/pull/24) 的固定身份、工具栏启动和存储兼容修改。** 提交 Mozilla 新版本须核对包内此 ID，不能退回旧的 `jotpatch@housz.dev`。

另一个版本身份例外是 GitHub Release v0.1.17 的签名 Firefox XPI：它基于修复源码 `6757760a`，而原 `v0.1.17` Tag 指向 `34be0692`；因此不能仅凭相同的数字版本断言两者源代码相同。此后版本应使签名 XPI、正式源代码提交和发行包有明确、可查的对应关系。

目前两个浏览器采用**手动下载安装更新**，没有已交付的自托管更新清单或跨浏览器自动更新功能。升级方式见 [用户指南](USER_GUIDE.md)，发布步骤见 [发行指南](RELEASING.md)。
