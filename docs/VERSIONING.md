# 版本号与开发 / 发行渠道

项目使用一个公共发行版本序列：**`vMAJOR.MINOR.PATCH`**（Git Tag / GitHub Release / 稳定应用版本），开发工作则使用 **`MAJOR.MINOR.PATCH-dev.N`**（在 `dev` 上迭代）。Chrome 的 `manifest.version` 只允许最多四段**纯整数**，因此需要额外映射，而不是直接将 `-dev` 写入扩展 `version`。

## v0.1.16 已发行；当前下一轮开发为 v0.1.17

| 类型 | 具体值 | 在哪里使用 |
| --- | --- | --- |
| 开发目标 | `0.1.17-dev.1` | `package.json`、`manifest.version_name`、ZIP 名字 |
| 开发 Numeric ID | `0.1.16.1` | `manifest.version`，浏览器更新排序 |
| 下一次正式发布目标 | `0.1.17` | 计划下一版 Tag `v0.1.17`、正式包 |
| CI 第 N 次 dev 构建 | `0.1.17-dev.N` + `0.1.16.N` | GitHub Actions 编号，自动生成测试包 |

Chrome 按数字逐段比较版本，因此 `0.1.16.N` 严格小于 `0.1.17`，测试版可以升级到同一轮的稳定版。每一段必须在 0–65535，`N` 不得超过 65535。**不要在 `manifest.version` 中写 `0.1.17-dev.1`。**

`config/version.json` 是唯一的渠道控制信息：

```json
{"schema":1,"channel":"dev","baseline":"0.1.16","nextRelease":"0.1.17","devBuild":1}
```

- `baseline`：上一次完成公开发行的版本，本阶段为 GitHub Release `v0.1.16`；商店审核和上架与 GitHub Release 是独立流程。
- `nextRelease`：下一次计划发布的稳定版本。
- `devBuild`：本地构建默认序号；CI 使用 `--build=<GitHub run number>` 自动生成新编号，无需开发者每天改源文件。
- `channel`：`dev` 或 `release`；发布前必须通过 Release PR 明确改为 `release`。

开发阶段可运行 `npm run package:dev`，或 `node scripts/package.mjs --channel=dev --build=123`（先构建）。正式发布前在 Release PR 中将 `channel` 改为 `release`，并同步设置 `package.json.version`、`manifest.version` 为 `nextRelease`、`manifest.version_name` 为同一个稳定版本值。`npm run package:release` 会严格检查这几个值；若仍是 dev 配置，则拒绝发行。

### 什么时候升版本？

- 修复正式版 Bug：PATCH，例如 `0.1.16 → 0.1.17`。
- 向后兼容的新功能或适配：MINOR，例如 `0.1.x → 0.2.0`。
- 大范围不兼容改动：MAJOR，发布前专门审查存储/权限/迁移。
- 早期原型仍使用 `0.x.y`，**不要把 dev Build 编号当成新的独立功能版本**。

每次正式发布后：更新 `dev` 的 `baseline` 为该正式版、`nextRelease` 为下一版，`devBuild` 复位为 1，`channel` 回到 `dev`，创建下一轮开发版本。相同发布版本的各浏览器包应源自同一 Tag，但可以只发布已完成验收的浏览器平台。
