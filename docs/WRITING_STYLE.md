# JotPatch 文档写作规范

本规范用于新增和正在修改的文档。分支、代码、隐私与发行边界以 [AGENTS.md](../AGENTS.md) 和 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准；不同文档的内容和验收门槛见 [文档类型与验收规范](DOCUMENTATION_TYPES.md)。历史实验、已发布版本说明与原始失败记录不因语言润色而改写。

目标是让读者迅速找到正确的说明和下一步操作，而不是让所有文档一味缩短。

## 写作前确认

- **读者与任务**：是首次安装的用户、开发者、维护者，还是核对研究证据的人？读完要做什么？
- **事实基线**：明确是 GitHub Release、`main` 正式代码、`dev` 开发代码、未合并 PR，还是历史实验。以相应提交、Manifest、测试或 Release 附件为依据。
- **内容归属**：README 放入口，用户指南写操作，架构写机制，测试记录写证据，版本说明写该版变化。已有权威页应链接而不是全文复制。

## 通用规则（W01–W10）

| 编号 | 规则 | 实施要求 |
| --- | --- | --- |
| W01 | 读者优先 | 开头明确用途、结论或读者可执行的任务。 |
| W02 | 具体、简洁 | 用明确主语、操作和结果，删去没有事实价值的形容和自证。 |
| W03 | 自然表达 | 中文写自然的技术语言；英语使用自然表达，避免直译与生硬术语。 |
| W04 | 术语统一 | 同一状态、UI 操作、字段和技术名保持一致；初次出现时解释必要缩写。 |
| W05 | 限制适量 | 按需要说明条件、失败和未覆盖项；不在每段重复免责声明。 |
| W06 | 事实可追溯 | 功能、浏览器版本、权限、测试数量、包及签名状态须有源码或记录。 |
| W07 | 证据分层 | 区分源码存在、Node 测试、合成 DOM 浏览器测试、真实扩展安装、真实登录网站验收及推断。 |
| W08 | 内容各归其位 | 安装在指南，架构在设计文档，实验在专题记录，发布变化在 Release Notes。 |
| W09 | 双语语义一致 | 维护 `README.md` 与 `README.en.md` 时同步版本、浏览器范围、权限、使用步骤、限制和链接；不强求逐句直译。 |
| W10 | 最小变更 | 文档任务不自动授权修改源码、扩展版本、Manifest、签名、Tag、Release 或历史证据。 |

否定句不是禁词。避免「不代表、不能证明」机械重复，但在数据丢失、未签名安装、测试边界和历史事实处保留必要限定。

## JotPatch 术语及事实边界

- **原文锚定便签**：有 `TextAnchor` 的便签，保存选中的 exact quote 与上下文；**本页悬浮便签**不要求原文锚点。不要把「本页」写成「跨网页跟随」。
- **导航轨道（Rail / Dock）**：灰色标记对应已发现的用户提问（Prompt），彩色标记对应便签。点击直接导航；不要描述已废弃的鱼眼和二级目标列表。
- **历史恢复**：只对用户点击的已发现目标尝试有界恢复。滚动坐标仅是线索，不是目标已找到的证明。
- **Navigation Lab**：可选的长对话实验，默认关闭；不能把合成测试成绩写成真实 ChatGPT 长会话的普遍成功率。
- **扩展本地存储**：`jotpatch:note:v1:*`、`jotpatch:preferences:v1` 和 `schemaVersion: 1` 是兼容约束；浏览器之间不自动同步。
- **Chromium ZIP 与 Firefox XPI**：Chrome/Edge 的解压安装 ZIP、Firefox 临时调试 ZIP、Mozilla 签名的正式 XPI 是不同分发物；`web-ext lint` 通过不是签名完成。
- **发行身份**：区分 Release Tag 所指提交、未合并修复分支及签名附件的构建来源。同一数字版本不自动说明它们来源相同。
- **权限与隐私**：`activeTab`、`scripting`、`storage`、`contextMenus` 是声明权限；站点自动恢复使用可选主机授权。文档不能暗示已默认访问所有网站或上传用户对话。
- **证据等级**：CI 合成站点页面、Firefox 临时安装、Mozilla 签名 XPI、普通 Firefox 持久安装和真实登录 ChatGPT/Gemini 人工验收必须分别陈述。

## 操作说明和排版

使用**前提 → 步骤 → 预期结果 → 失败处理**顺序，按钮名称与 `options.html`、实际浏览器 UI 对照。命令标明执行环境和分支，路径使用仓库相对路径；链接优先指向承担相应职责的文档。README 下载入口使用 [最新 Release](https://github.com/Housz/JotPatch/releases/latest)，具体版本文件须以附件列表为准。

`README.en.md` 对应中文 `README.md`，双语共用功能、版本、权限和安装事实；英文链接到中文用户指南时注明 `Chinese`。历史英文实验报告不因本规范自动翻译。截图如果是合成测试，应标明测试页面，避免包含聊天正文、账号或令牌。

## 自检

1. 开头有没有说明任务？内容是否放在正确文档？
2. 版本、签名、权限、功能及测试结论能否定位源码、GitHub CI 或 Release？
3. 是否混淆 ZIP 与 XPI、历史轮次恢复与全文索引、合成页面与真实登录网站？
4. 双语 README 的关键事实、术语、步骤和链接是否一致？
5. 按 [D01–D12](DOCUMENTATION_TYPES.md) 记录真实执行的检查及尚未执行的检查。

方法参考：[Google developer documentation style guide](https://developers.google.com/style) · [Microsoft Style Guide](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) · [Diátaxis](https://diataxis.fr/)。

移植与改编来源：[XiaomiWatch2HRV 的写作规范](https://github.com/fcwrwen/XiaomiWatch2HRV/blob/main/docs/development/writing-style.md)。