# JotPatch v0.1.16 — 首个正式发行版本

**随地大小贴** · Powered by Housz

JotPatch 是轻量级、以本地保存为主的网页便签扩展，可以把便签钉在选中的网页文字旁，并在长网页和 AI 对话中快速找回内容。

## 主要功能

- 在普通网页的选中文字旁创建彩色便签；也支持无选区的页面便签。
- 便签可拖动、缩放、调节字号与颜色，支持 Markdown 富文本编辑、删除撤销及本地恢复。
- 对 ChatGPT 和 Gemini 提供独立的提问轮次导航和便签定位标记；悬停可查看简洁摘要，点击直接跳转。
- 增强动态加载历史轮次的定位、便签原文恢复、重复轮次去重及流式输出期间的导航稳定性。
- Navigation Lab 长对话实验引擎可从设置中主动启用，**默认关闭**。
- 使用 JotPatch 图标、中文品牌标语“随地大小贴”和可选的随机新建便签颜色。

## 安装包及平台

- **`JotPatch-v0.1.16-chromium.zip`**：面向 Chrome、Edge 等 Chromium 浏览器的**开发者模式可解压安装包**。解压后，打开 `chrome://extensions` 或 `edge://extensions`，启用开发者模式，选择「加载已解压的扩展程序」，定位到包含 `manifest.json` 的文件夹。
- **Firefox 暂未发行**。Firefox 适配仍由 Leezh76 在独立开发分支维护，需要整合与全功能测试后才能发布。
- 当前不是 Chrome Web Store 或 Edge Add-ons 商店安装链接；商店审核和上架尚未完成。

## 数据和兼容性

- 便签使用浏览器扩展本地存储；**没有跨浏览器自动同步**。更新本地加载的扩展时，建议使用原扩展目录覆盖文件、在扩展管理页重新加载，不要先卸载以免影响本地数据。
- 仅在用户主动点击并授权相应站点后启用所需权限。没有引入 ChatGPT 私有接口或后台全文扫描。
- 动态网页会卸载较早的消息；历史恢复为尽力查找、有限次尝试，并不能保证找回网页尚未提供的全部旧消息。

问题反馈及贡献指南见仓库 [README](https://github.com/Housz/JotPatch) 和 [CONTRIBUTING](https://github.com/Housz/JotPatch/blob/main/CONTRIBUTING.md)。
