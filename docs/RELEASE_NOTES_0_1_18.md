# JotPatch v0.1.18 — 公式原文便签与 Firefox 稳定性更新

**随地大小贴** · Powered by Housz

本版延续 v0.1.17 的本地便签与 ChatGPT / Gemini 提问导航，重点改进数学公式选区、便签图钉，以及 Firefox 的启动和存储可靠性。

## 下载与安装

| 附件 | 用途 | 安装方式 |
| --- | --- | --- |
| `JotPatch-v0.1.18-chromium.zip` | Chrome / Edge | 解压后，在扩展管理页面启用开发者模式并「加载已解压的扩展程序」。 |
| `JotPatch-v0.1.18-firefox.zip` | Firefox 142+，**未签名** | 供维护者上传 Mozilla AMO **Unlisted / On your own** 取得签名；或用于 `about:debugging` 临时测试。**不能当作永久安装包**。 |

**Firefox 用户升级说明：** v0.1.18 的 Mozilla 签名 XPI 由维护者另行上传到本 Release。只有附件中实际出现 `JotPatch-v0.1.18-firefox-signed.xpi` 后，才可作为普通 Firefox 的安装/升级包。已经安装签名 v0.1.17 的用户请保留原版，直到签名 v0.1.18 可用；升级时直接安装同 ID 的更高版本 XPI，**不要先卸载**，以免影响本地便签数据。

## 新增与修复

- **支持 LaTeX 公式锚定。** 对 KaTeX、带原始 TeX 注释的 MathML 和可识别的公式节点，允许选中整条公式或与普通文字一起选中后创建便签；用已保存的公式内容和上下文定位。重复公式、DOM 重新渲染、页面刷新等情况有专门的跨浏览器回归。
- **浅灰单色图钉。** 便签左上角改用简单的 `📌︎` 文本形态，降低视觉干扰，保留点击解除原文锚定的交互。
- **Firefox 工具栏与编辑修复。** 解决 Firefox 内容脚本中 `URLSearchParams.keys()` 不可迭代导致的启动失败；增加工具栏注入就绪握手与受限页面说明；修复空便签首次编辑产生额外换行的问题。
- **Mozilla 审核与身份。** 移除 AMO 报告的动态 `innerHTML` 安全警告。保留已签名 v0.1.17 的固定 Gecko 扩展 ID `{8801fba0-08ef-481b-a4b6-870a061b2878}`，用于后续原位升级。
- **工程与文档。** 统一 W01–W10 文档写作规则、D01–D12 文档类型和 P0/P1/P2 验收门槛；修正非发行 `main` 提交误触发发布失败的工作流。

## 数据、权限与边界

- 仍使用 `jotpatch:note:v1:*`、`jotpatch:preferences:v1` 和 `Note.schemaVersion: 1`；不需要数据迁移，没有增加默认网站访问权限或远程同步。
- 公式以**整条公式**为最小锚定单元。图片、无法取得可靠文本标识的纯 SVG 公式及超过选区长度限制的内容不保证锚定。
- ChatGPT/Gemini 提问导航仍限于网页已经呈现或曾可靠发现的轮次；Navigation Lab 默认关闭。
- 自动化测试覆盖 Chromium/Firefox 的合成 DOM、Firefox 真实临时扩展安装、工具栏启动及本地保存；**未将这些测试等同于真实登录 ChatGPT/Gemini 或已取得 Mozilla 正式签名**。
- Chrome / Edge 和 Firefox 仍采用**手动下载安装更新**，不同浏览器之间不自动同步便签。

[使用指南](https://github.com/Housz/JotPatch/blob/main/docs/USER_GUIDE.md) · [Firefox 安装与签名说明](https://github.com/Housz/JotPatch/blob/main/docs/FIREFOX.md) · [变更与证据](https://github.com/Housz/JotPatch/pulls?q=is%3Apr+is%3Amerged)
