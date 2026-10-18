"""Stage 0 browser integration test. Run after `npm run build`.

Tests actual DOM/selection/scroll in Chromium. Chrome extension APIs are shimmed
here so these tests can exercise anchoring deterministically without a permissions
prompt. They do NOT replace a manual MV3 smoke test of extension permissions.
"""
from __future__ import annotations

from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

STORAGE_SHIM = r"""
(() => {
  globalThis.chrome = globalThis.chrome || {};
  const STORE = globalThis.__jotpatchFakeStore || (globalThis.__jotpatchFakeStore = {});
  chrome.storage = {
    local: {
      async get(key) {
        const all = {};
        Object.assign(all, STORE);
        if (key === null) return all;
        if (typeof key === 'string') return { [key]: all[key] };
        return all;
      },
      async set(entries) {
        for (const [key, value] of Object.entries(entries)) {
          STORE[key] = structuredClone(value);
        }
      },
      async remove(key) { delete STORE[key]; }
    }
  };
  chrome.runtime = { sendMessage: async () => ({ok: true}) };
})();
"""


def inject(page):
    page.add_style_tag(path=str(ROOT / 'styles/highlight.css'))
    page.add_script_tag(path=str(ROOT / 'dist/content.js'))
    expect(page.locator('#jotpatch-root #jp-rail')).to_have_count(1)


def select_repeated_quote(page):
    page.locator("#anchor-target").scroll_into_view_if_needed()
    page.evaluate("""() => {
      const element = document.querySelector('#anchor-target');
      const node = element.firstChild;
      const phrase = '我们需要保留原文的位置信息';
      const begin = node.data.indexOf(phrase);
      const range = document.createRange();
      range.setStart(node, begin);
      range.setEnd(node, begin + phrase.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    }""")


def new_page(context, fixture_html, seed=None):
    page = context.new_page()
    page.set_content(fixture_html)
    if seed is not None:
        page.evaluate('data => { window.__jotpatchFakeStore = data; }', seed)
    page.evaluate(STORAGE_SHIM)
    inject(page)
    return page


def run():
    fixture_html = (ROOT / 'fixtures/long-page.html').read_text()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1100, 'height': 750})
        page = new_page(context, fixture_html)
        expect(page.locator('#jotpatch-root #jp-rail')).to_be_hidden()

        select_repeated_quote(page)
        expect(page.locator('#jotpatch-root #jp-bubble')).to_be_visible()
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        expect(page.locator('#jotpatch-root #jp-editor')).to_be_visible()
        page.locator('#jotpatch-root #jp-editor').fill('思考：这个锚点应当恢复到第二个背景。')
        expect(page.locator('#jotpatch-root #jp-save-state')).to_have_text('已保存', timeout=5000)

        matched_id = page.evaluate("""() => {
          const note = Object.values(window.__jotpatchFakeStore)[0];
          const match = JP.resolveAnchor(note.anchor, JP.buildTextIndex());
          return match?.range.startContainer.parentElement.id;
        }""")
        assert matched_id == 'anchor-target', matched_id
        print('PASS: selected duplicate text with correct contextual anchor')

        page.evaluate("""() => {
          const extra = document.createElement('section');
          extra.id = 'inserted-block';
          extra.textContent = 'A new paragraph inserted before the anchor changes all saved offsets.';
          document.querySelector('#long-document').prepend(extra);
        }""")
        page.wait_for_timeout(850)
        matched_after = page.evaluate("""() => {
          const note = Object.values(window.__jotpatchFakeStore)[0];
          return JP.resolveAnchor(note.anchor, JP.buildTextIndex())?.range.startContainer.parentElement.id;
        }""")
        assert matched_after == 'anchor-target', matched_after
        print('PASS: relocated anchor after a DOM insertion')

        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        page.wait_for_timeout(120)
        expect(page.locator('#jotpatch-root .marker')).to_be_hidden()
        expect(page.locator('#jotpatch-root #jp-rail')).to_be_visible()
        page.locator('#jotpatch-root .rail-pin').click()
        page.wait_for_function("""() => {
          const r = document.querySelector('#anchor-target').getBoundingClientRect();
          return r.top > 0 && r.top < innerHeight;
        }""", timeout=7000)
        expect(page.locator('#jotpatch-root #jp-editor')).to_be_visible()
        print('PASS: markers track scrolling and Dock navigates back to source')

        # Simulate a page reload by constructing a fresh document and reusing the
        # saved extension storage snapshot. Browser policy blocks HTTP navigation
        # in this test environment, so actual page reload requires manual smoke test.
        snapshot = page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        page.close()
        page = new_page(context, fixture_html, seed=snapshot)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        page.locator('#jotpatch-root #jp-list-toggle').click()
        page.locator('#jotpatch-root .list button.entry').click()
        expect(page.locator('#jotpatch-root #jp-editor')).to_have_value('思考：这个锚点应当恢复到第二个背景。')
        print('PASS: stored note restores in a fresh browser document')

        page.evaluate("document.querySelector('#anchor-target').remove()")
        page.wait_for_timeout(900)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(1)
        page.locator('#jotpatch-root #jp-list-toggle').click()
        expect(page.locator('#jotpatch-root .list .entry-subtitle')).to_contain_text('未找到')
        print('PASS: deleted source shows missing anchor without losing note')

        # Source URL normalization is separately testable without navigation.
        keys = page.evaluate("""() => [
          JP.pageKey('https://chatgpt.com/c/one?utm_source=mail'),
          JP.pageKey('https://chatgpt.com/c/one'),
          JP.pageKey('https://chatgpt.com/c/two')
        ]""")
        assert keys[0] == keys[1] and keys[1] != keys[2], keys
        print('PASS: normalized URL excludes trackers but isolates conversations')

        # Whole-element selections have element-node rather than Text-node
        # range boundaries; they should still produce an anchor.
        separate = new_page(context, fixture_html)
        separate.locator('#anchor-target').scroll_into_view_if_needed()
        separate.evaluate("""() => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('#anchor-target'));
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          document.querySelector('#anchor-target').dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        }""")
        separate.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(separate.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        print('PASS: element-boundary selection anchors the contained text')
        separate.close()
        context.close()
        browser.close()


if __name__ == '__main__':
    run()
