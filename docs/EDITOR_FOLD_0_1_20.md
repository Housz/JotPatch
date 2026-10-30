# JotPatch v0.1.20 — 轻量编辑与便签折叠设计

## 事实基线

本版相对于上一正式 [v0.1.18](https://github.com/Housz/JotPatch/releases/tag/v0.1.18) 发布；v0.1.19 只有开发分支集成而未打 Tag。**v0.1.20** 包含此前验证的一体化 Dock 和本轮轻量编辑与折叠功能。正式 Firefox XPI 仍需 Mozilla 在现有 Unlisted 项目手动签名。

## #43 编辑器常用操作

参考 [VS Code 的默认快捷键清单](https://code.visualstudio.com/docs/reference/default-keybindings)，选择与便签 Markdown 编辑真实相关、且不会压过浏览器行为的最小集合：

| 快捷键 | 行为 | JotPatch 中的边界 |
| --- | --- | --- |
| `Tab` | 当前行或选中行插入两格缩进 | 仅在便签正文获得焦点时生效 |
| **`Shift+Tab`** | 缩回一档缩进 | 不使用 `Ctrl+Tab` |
| `Ctrl/Cmd+C`，无选区 | 复制当前 Markdown 行并附一个换行符 | 使用同步 ClipboardEvent，不请求剪贴板权限 |
| `Ctrl/Cmd+X`，无选区 | 剪切当前 Markdown 行 | 剪切后发出 input 事件，按原有存储协议保存 |
| `Ctrl/Cmd+C/X`，有选区 | 浏览器原生选中文本复制/剪切 | 不改写用户选区 |
| `Ctrl/Cmd+B` / `Ctrl/Cmd+I` | 加粗 / 斜体 | 延续已有 WYSIWYG/Markdown 行为 |

**不实现**多光标、代码补全、语法分析、命令面板、复杂键位映射。用户没有明确要求的重型编辑器特性不应引入依赖或覆盖系统浏览器快捷键。特别是 `Ctrl+Tab` 应由浏览器处理标签切换，不能再作为缩回快捷键。

折叠或剪切不会上传用户文字；Markdown 的序列化仍由 `src/core/markdown.ts` 负责。复制/剪切整行在原生 ClipboardEvent 中同步运行，已经选中的文字始终走浏览器默认处理。

## #44 便签顶栏折叠

- 顶栏的 `▴` 折叠按钮切换成 `▾`，折叠后仅保留 **30px 纸张顶栏**、一行摘要和原有可用操作；正文、底部工具栏、调整大小手柄及更多菜单不显示。
- 展开后恢复原有宽高和纸张内容；折叠只修改可选的 `appearance.collapsed`，绝不把存储的 `appearance.height` 改成 30px。旧便签无 `collapsed` 字段，默认展开。
- 折叠时编辑框失焦并触发保存，已输入文字不会丢失。按钮提供 `aria-expanded` 和文本名称。折叠后的标题栏仍可拖动且仍能置顶；原文锚点与页面关联保持不变。
- 当前实现是每张便签单独折叠，不自动折叠其他便签；与 Dock 下方的“显示 / 隐藏全部本页悬浮便签”是**两个不同的状态**。

## 验收证据

`tests/editor_fold_e2e.py` 在 Chromium 和 Firefox 合成网页真实 DOM 中测试：展开／折叠、鼠标拖动、完整高度恢复、刷新后 Storage 恢复、Markdown 粗体保留、复制剪切整行、有选区原生剪贴板、`Ctrl+Tab` 不拦截。Selenium `tests/firefox_addon_smoke.py` 检查**真实临时安装 Firefox MV3 扩展**的折叠、持久化和再次打开。

节点与协议由 `npm run check` 验证。Mozilla lint 与 Firefox 签名是不同验收阶段；v0.1.20 的 Firefox ZIP 仍需后续手动提交 Mozilla **现有 Unlisted 项目**获得签名 XPI，才能作为普通用户持久安装／升级包。真实登录 ChatGPT/Gemini 的人工回归不由合成 DOM 测试代替。
