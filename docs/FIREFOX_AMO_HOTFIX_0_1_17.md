# Firefox 0.1.17 修订包：AMO 提交与工具栏启用

## 发行归属
- 保持扩展的显示版本和 Manifest 数字版本 `0.1.17`，但修订文件名需明确包含 `amofix`，避免与最初 `v0.1.17` Tag 的安装包混淆。
- 最初 Firefox Manifest 的 `jotpatch@housz.dev` 被 AMO 报告为 **Duplicate add-on ID**。该 ID 可能归某个已有 AMO 开发者账号所有，不能靠重传同一个 ZIP 修复。
- 本修订版改用固定 GUID **`{8801fba0-08ef-481b-a4b6-870a061b2878}`**。这是新的插件身份；取得 Mozilla 签名后不得再次修改。
- 如果需要保留旧 ID 的发布和扩展存储，应联系原 ID 的 AMO 所有者，通过现有项目的版本页面提交更新，而不是擅自占用。旧临时插件与新签名版的本地存储不能保证迁移。
- AMO 的两条 `innerHTML` 是审查警告，不是重复 ID 错误来源；修订版通过静态模板构建和 DOM 属性赋值移除了对应赋值。

## 完整真实 Firefox 测试
1. `npm run check` 包含 Manifest/DOM/API 回归。
2. `npm run package:release` 与 `node scripts/package.mjs --channel=release --browser=firefox`。
3. `node scripts/verify-release-package.mjs` 确认两平台代码一致及 ZIP 完整。
4. `npx web-ext lint --source-dir build/firefox --self-hosted`，记录实际 errors/warnings 数量。
5. `python tests/firefox_addon_smoke.py` 在 Firefox 142+ 中以 Selenium **真正安装扩展并操作原生浏览器工具栏图标**，在 HTTP 页面确认 Launcher 显示、第二次点击切换且不重复注入；另验收本地存储、后台事件页通信。
6. Playwright Chromium + Firefox 测试使用模拟站点 DOM，不等于已在真实 ChatGPT/Gemini 登录环境验证。

## 用户临时加载无法启动时
- 先在 `https://example.org` 等普通 HTTP(S) 页面尝试，不要在 Firefox 欢迎页、`about:newtab`、`about:addons`、`about:debugging` 上测试。
- 修订版在受限页点击图标会打开 JotPatch 设置的故障说明；普通网页注入异常也会显示错误提示，而不是控制台静默失败。
- 需要长期安装必须使用 **Mozilla AMO Unlisted 签名**后产生的 `.xpi`，不能将 ZIP 重命名为 XPI。**0.1.17 修订 ZIP 本身仍然只能临时安装**。
- 首次 AMO 账号提交：在开发者后台选择自行分发（On your own / Unlisted）并上传本次修订 ZIP。若 ID 仍冲突，应由账号所有者或 AMO 支持确认归属，不要无休止更换已签名 ID。

## Git 历史与兼容
原始 `v0.1.17` Tag 及先前文件的 SHA-256 保留不变；这次修订在独立修复提交下生成安装包，附到既有 Release 时必须采用不同附件名称并注明修订提交 SHA。便签存储键、权限、应用功能及 `manifest.version` 未改变。
