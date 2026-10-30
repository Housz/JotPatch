# 版本与分支渠道

JotPatch 使用正式版 `MAJOR.MINOR.PATCH` 与对应 Git Tag；开发线使用 `MAJOR.MINOR.PATCH-dev.N`。以 [`config/version.json`](../config/version.json) 为版本渠道控制文件，具体规则由 [`scripts/versioning.mjs`](../scripts/versioning.mjs) 校验。

## 正式版 v0.1.20

| 对象 | 值 | 说明 |
| --- | --- | --- |
| 最新正式发行 | [v0.1.20](https://github.com/Housz/JotPatch/releases/tag/v0.1.20) | `main` 正式代码、Git Tag 和两浏览器 ZIP |
| `package.json.version` | `0.1.20` | 正式 npm 包版本 |
| `manifest.version` | `0.1.20` | Chromium / Firefox 发行包所用数字版本 |
| `config/version.json` | `channel=release`、`baseline=0.1.18`、`nextRelease=0.1.20` | 正式版构建渠道 |

**v0.1.19 从未正式发布**，只是经 PR 合并的开发阶段。v0.1.20 包含该阶段的统一 Dock、透明度、便签层级改进，以及新一轮编辑器快捷键和折叠功能。完成 v0.1.20 发行后，将通过单独同步 PR 为 `dev` 设定 `0.1.21-dev.1`；这不会修改已发布的 v0.1.20 Tag 或 ZIP。

## 开发版、构建与升级序

`dev` 版本的 `package.json.version`、`manifest.version`、`manifest.version_name` 与 `config/version.json` 必须一致。此前 v0.1.20 的开发渠道使用：

```text
package.version       0.1.20-dev.1
manifest.version      0.1.18.1
manifest.version_name 0.1.20-dev.1
```

该数字版本依赖 `baseline`，不会在开发版抢先超过 v0.1.20 正式版。下一开发周期 `0.1.21-dev.1` 应使用 `baseline=0.1.20`、`nextRelease=0.1.21`、`manifest.version=0.1.20.1`。任何版本升级都不自动改变用户本地存储键或扩展身份。

## Firefox 版本身份及手动签名

Firefox 保持 `{8801fba0-08ef-481b-a4b6-870a061b2878}`。v0.1.20 的 Firefox ZIP 是**尚未签名的 Mozilla 提交包**；不能直接作为普通 Firefox 长期安装版。维护者需在现有 Unlisted 项目签名并将 XPI 另行上传至 [v0.1.20 Release](https://github.com/Housz/JotPatch/releases/tag/v0.1.20)。已安装签名 XPI 的用户直接覆盖更新，不应先卸载。

历史上 v0.1.17 的修复版 Firefox XPI 基于 `6757760a`，而原 Git Tag 对应 `34be0692`；v0.1.18 起已整合相同的固定 Firefox ID，避免发行分支恢复旧扩展身份。详见 [Firefox 指南](FIREFOX.md)和 [发行流程](RELEASING.md)。
