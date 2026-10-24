"""JotPatch · 可见的 Gecko 演练（Firefox）

启动一个真正可见的 Firefox 窗口，把 JotPatch 的内容脚本注入本地演示页，
然后在关键步骤停下来把控制权交给你：你来选中文字、贴便签、滚动、点 Dock；
每完成一步回到终端按回车，脚本自动截图存档。

用法:
    python tools/firefox_tour.py                 # 逐步接力（默认，会停下来等你）
    python tools/firefox_tour.py --auto          # 不停顿，自动跑完整套截图
    python tools/firefox_tour.py --out DIR       # 指定截图目录（默认 preview/）
    python tools/firefox_tour.py --headless      # 无窗口 + 自动模式

前提: 先执行 `npm run build`（或 `npm run build:firefox`），并已安装 Python Playwright。
截图里扩展 API 使用轻量存储桩，因为权限弹窗无法脚本化；UI 代码与扩展包完全一致。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONTENT_SCRIPT = ROOT / 'dist' / 'content.js'
HIGHLIGHT_CSS = ROOT / 'styles' / 'highlight.css'
FIXTURE = ROOT / 'fixtures' / 'long-page.html'

# 扩展的 chrome.* / browser.* 只在这里被替换成内存桩，其他代码与扩展一致。
SHIM = r"""
(() => {
  globalThis.chrome = globalThis.chrome || {};
  const STORE = globalThis.__store || (globalThis.__store = {});
  chrome.storage = { local: {
    async get() { return {...STORE}; },
    async set(entries) { Object.assign(STORE, entries); },
    async remove(key) { delete STORE[key]; }
  }};
  chrome.runtime = { sendMessage: async () => ({ok: true}) };
})();
"""

SELECT = """(args) => {
  const el = document.querySelector(args.sel);
  const node = el.firstChild;
  const begin = node.data ? node.data.indexOf(args.phrase) : -1;
  if (begin < 0) throw new Error('未找到要选中的文字: ' + args.phrase);
  const range = document.createRange();
  range.setStart(node, begin);
  range.setEnd(node, begin + args.phrase.length);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
}"""


def fail(message: str) -> None:
    print(f'错误: {message}', file=sys.stderr)
    raise SystemExit(1)


def shot(page, out: Path, name: str) -> None:
    path = out / name
    page.screenshot(path=str(path))
    print(f'  截图已保存: {path.name}')


def step(message: str, auto: bool) -> None:
    print(f'\n【轮到你了】{message}')
    if auto:
        print('  （自动模式：直接继续）')
        return
    try:
        input('  完成后按 Enter 继续 … ')
    except EOFError:
        print('  （当前没有交互终端，按自动模式继续）')


def shot_options(context, out: Path, name: str) -> None:
    page_path = ROOT / 'dist' / 'firefox' / 'options.html'
    if not page_path.exists():
        print('  跳过选项页截图：找不到 dist/firefox/options.html，请先运行 npm run build:firefox')
        return
    options = context.new_page()
    options.set_viewport_size({'width': 760, 'height': 520})
    options.goto(page_path.as_uri() + '?origin=https://chatgpt.com')
    options.wait_for_timeout(400)
    options.screenshot(path=str(out / name))
    print(f'  截图已保存: {name}')
    options.close()


def inject(page) -> None:
    page.evaluate(SHIM)
    page.add_style_tag(path=str(HIGHLIGHT_CSS))
    page.add_script_tag(path=str(CONTENT_SCRIPT))
    page.wait_for_selector('#jotpatch-root #jp-rail', state='attached')


def add_note(page, selector: str, phrase: str, text: str) -> None:
    page.locator(selector).scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    page.evaluate(SELECT, {'sel': selector, 'phrase': phrase})
    page.wait_for_timeout(150)
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    page.locator('#jotpatch-root #jp-editor').fill(text)
    page.wait_for_timeout(500)
    page.locator('#jotpatch-root #jp-card-close').click()
    page.wait_for_timeout(250)


def interactive_tour(page, context, out: Path) -> None:
    print('浏览器窗口已打开：工具条应出现在页面右上角，右侧暂时没有 Dock（还没有便签）。')
    step('看一眼右上角的 📒 JotPatch 工具条，确认页面能正常交互。', False)
    shot(page, out, '01-toolbar.png')

    step('用鼠标选中「第二个背景。我们需要保留原文的位置信息。」这句话，'
         '点选区旁浮现的「📌 贴便签」，在黄色卡片里写一句话（不要点 ×）。', False)
    shot(page, out, '02-note-card.png')

    step('点卡片右上角 × 收起，再在页面别处选中另一句话、贴第二张便签。'
         '贴完后右侧应出现 Dock，正文上应有两个 ✎ 标记。', False)
    shot(page, out, '03-two-notes.png')

    step('上下滚动页面：✎ 标记应跟着原文走，原文滚出视口时标记消失、Dock 保留。', False)
    shot(page, out, '04-scroll-follow.png')

    step('点右侧 Dock 顶部那个数字圆按钮，展开「本页便签」列表。', False)
    shot(page, out, '05-note-list.png')

    step('点列表里的一条，或点 Dock 上的圆点，确认能滚回原文并展开卡片。', False)
    shot(page, out, '06-jump-back.png')

    print('\n【自动部分】另外打开选项页（自动恢复用的按站点授权界面）并截图。')
    shot_options(context, out, '07-options-page.png')

    step('你可以继续在窗口里随便试用；结束后按 Enter 关闭浏览器。', False)


def automatic_tour(page, context, out: Path) -> None:
    page.wait_for_timeout(400)
    shot(page, out, '01-toolbar.png')

    add_note(page, '#anchor-target', '我们需要保留原文的位置信息',
             '思考：这个锚点应当恢复到第二个背景，而不是第一个同名段落。')
    shot(page, out, '02-note-card.png')

    add_note(page, '#top p', '这段在文档前部', '开头先记一句：滚动时标记要跟着原文走。')
    add_note(page, '#long-document section:nth-of-type(8) p', '文本锚定失败',
             '结构变化后重匹配：不确定时宁可标为未定位，也不要贴错段落。')

    page.locator('#anchor-target').scroll_into_view_if_needed()
    page.wait_for_timeout(600)
    shot(page, out, '03-dock-and-markers.png')

    page.locator('#jotpatch-root #jp-list-toggle').click()
    page.wait_for_timeout(300)
    shot(page, out, '04-note-list.png')

    page.locator('#jotpatch-root .rail-pin').first.click()
    page.wait_for_timeout(700)
    shot(page, out, '05-jump-to-source.png')

    shot_options(context, out, '06-options-page.png')


def main() -> None:
    parser = argparse.ArgumentParser(description='在可见的 Firefox 里演练 JotPatch 并截图。')
    parser.add_argument('--auto', action='store_true', help='不停顿，自动跑完整套截图')
    parser.add_argument('--headless', action='store_true', help='无窗口运行（隐含 --auto）')
    parser.add_argument('--out', default=str(ROOT / 'preview'), help='截图输出目录')
    args = parser.parse_args()

    if not CONTENT_SCRIPT.exists():
        fail('找不到 dist/content.js，请先运行 `npm run build` 或 `npm run build:firefox`')

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    auto = args.auto or args.headless
    fixture_html = FIXTURE.read_text(encoding='utf-8')

    print(f'截图目录: {out}')
    if not auto:
        print('提示: 浏览器窗口是独立窗口，请在那边操作，然后回到这个终端按 Enter。')
        print('      按 Ctrl+C 可随时退出。')

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=args.headless)
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
        page = context.new_page()
        try:
            page.set_content(fixture_html)
            inject(page)
            if auto:
                automatic_tour(page, context, out)
            else:
                interactive_tour(page, context, out)

            stored = page.evaluate("() => Object.values(window.__store || {})")
            print(f'\n本次共保存 {len(stored)} 条便签:')
            for note in stored:
                print(' -', note['text'][:30], '｜锚点:', note['anchor']['exact'][:24])
        except KeyboardInterrupt:
            print('\n已取消。')
        finally:
            browser.close()

    print(f'\n完成。截图在: {out}')


if __name__ == '__main__':
    main()
