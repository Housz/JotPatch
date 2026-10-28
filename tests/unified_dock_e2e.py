"""v0.1.19 unified Dock behavior on actual Chromium / Firefox DOM.

Build before running:
    npm run build
    JP_CHROMIUM_BIN=playwright python tests/unified_dock_e2e.py
    JP_E2E_BROWSER=firefox python tests/unified_dock_e2e.py

Uses fake extension storage; real Firefox installed-extension toolbar interaction
is checked separately by tests/firefox_addon_smoke.py.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright, expect
from browser_e2e import new_page, launch_browser
from conversation_e2e import chatgpt_body, new_site

HTML = """<!doctype html><html lang="zh-CN">
<head><style>body{margin:0;font:18px/1.6 sans-serif}
main{max-width:840px;margin:44px auto}p{padding:18px;border:1px solid #ddd}</style></head>
<body><main><p id="quote">这段普通网页文字应当能够直接选中并添加原文便签。</p></main></body>
</html>"""


def notes(page):
    return page.evaluate("""() => Object.values(globalThis.__jotpatchFakeStore)
      .filter(item => item && item.schemaVersion===1 && item.id && !item.deletedAt)""")


def run():
    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(viewport={'width': 1200, 'height': 800})
        page = new_page(context, HTML)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        rail = page.locator('#jotpatch-root #jp-rail')
        new_button = page.locator('#jotpatch-root #jp-new')
        list_button = page.locator('#jotpatch-root #jp-list-toggle')
        settings = page.locator('#jotpatch-root #jp-settings')
        panel = page.locator('#jotpatch-root #jp-list')

        expect(rail).to_be_visible()
        expect(rail).to_have_class('rail compact no-notes')
        expect(new_button).to_be_visible()
        expect(settings).to_be_visible()
        expect(list_button).to_be_hidden()
        expect(page.locator('#jotpatch-root #jp-rail-track')).to_be_hidden()
        assert page.locator('#jotpatch-root #jp-launcher').count() == 0
        assert page.locator('#jotpatch-root #jp-hide').count() == 0
        assert page.locator('#jotpatch-root .rail-turn').count() == 0
        for item in [new_button, settings]:
            box = item.bounding_box()
            assert box and box['width'] >= 27 and box['height'] >= 27, box
        dims = rail.bounding_box()
        assert dims and 68 < dims['height'] < 92, dims
        assert dims['x'] > 0.9 * 1200, dims
        alpha = rail.evaluate(r"""node=>{
          const bg=getComputedStyle(node).backgroundColor;
          const parts=bg.match(/[\d.]+/g).map(Number);
          return parts.length===4?parts[3]:1;
        }""")
        assert .65 < alpha < 1, alpha
        print('PASS: empty page exposes compact, translucent, accessible creation/settings Dock')

        # Settings remains its own explicit action and is not an accidental note.
        page.evaluate("""() => {
          globalThis.__jpOutgoing=[];
          chrome.runtime.sendMessage=async msg => {__jpOutgoing.push(msg);return {ok:true};};
        }""")
        settings.click()
        assert page.evaluate("() => __jpOutgoing.at(-1)?.type") == 'JP_OPEN_SITE_SETUP'
        assert len(notes(page)) == 0
        print('PASS: settings action routes through the existing permission-safe runtime message')

        # First note must be possible without any selection or prompt.
        new_button.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        expect(rail).to_be_visible()
        expect(list_button).to_be_visible()
        expect(rail).to_have_class('rail compact')
        expect(page.locator('#jotpatch-root #jp-rail-track')).to_be_hidden()
        assert len(notes(page)) == 1
        assert notes(page)[0].get('anchor') is None
        list_button.click()
        expect(panel).to_be_visible()
        expect(page.locator('#jotpatch-root .note-entry')).to_have_count(1)
        expect(list_button).to_have_attribute('aria-expanded','true')
        compact_dock=rail.bounding_box()
        compact_panel=panel.bounding_box()
        assert compact_dock and compact_panel
        assert abs((compact_panel['y']+compact_panel['height']/2)-
                   (compact_dock['y']+compact_dock['height']/2)) < 45
        panel.locator('.list-header button').click()
        expect(panel).to_be_hidden()
        expect(list_button).to_have_attribute('aria-expanded','false')
        print('PASS: first page note appears in compact Dock list without a redundant loose count')

        # Keyboard access; Escape closes the panel and returns focus to its control.
        list_button.focus()
        list_button.press('Enter')
        expect(panel).to_be_visible()
        page.keyboard.press('Escape')
        expect(panel).to_be_hidden()
        assert list_button.evaluate('(node)=>node.getRootNode().activeElement===node')
        list_button.click()
        expect(panel).to_be_visible()
        page.locator('#quote').click()
        expect(panel).to_be_hidden()
        print('PASS: keyboard, Escape/focus return, and outside-click list dismissal')

        # Edit, autosave, then hide/reveal the whole extension without removing DOM.
        editor = page.locator('#jotpatch-root .paper .note-editor').first
        editor.fill('统一 Dock 数据保留测试')
        page.wait_for_function("""() => Object.values(__jotpatchFakeStore)
          .some(n => n?.text==='统一 Dock 数据保留测试')""")
        page.evaluate("() => __jpSendMessage({type:'JP_TOGGLE_UI'})")
        expect(page.locator('#jotpatch-root')).to_be_hidden()
        assert page.locator('#jotpatch-root').evaluate('(el)=>getComputedStyle(el).display') == 'none'
        expect(page.locator('#jotpatch-root #jp-rail')).to_be_hidden()
        expect(page.locator('#jotpatch-root .paper')).to_be_hidden()
        assert page.locator('#jotpatch-root .paper').count() == 1
        assert len(notes(page)) == 1
        page.evaluate("() => __jpSendMessage({type:'JP_TOGGLE_UI'})")
        expect(rail).to_be_visible()
        expect(editor).to_be_visible()
        assert len(notes(page)) == 1
        for _ in range(2):
            page.evaluate("() => __jpSendMessage({type:'JP_OPEN_DOCK'})")
        assert page.locator('#jotpatch-root').count() == 1
        assert page.locator('#jotpatch-root #jp-new').count() == 1
        print('PASS: toolbar show/hide controls all UI and never loses notes or reinjects duplicate root')

        # Selected text uses its original contextual 📌, not the page-note +.
        page.evaluate("""() => {
          const el=document.querySelector('#quote'), node=el.firstChild, range=document.createRange();
          const start=node.data.indexOf('直接选中');
          range.setStart(node,start);
          range.setEnd(node,start+'直接选中'.length);
          getSelection().removeAllRanges();getSelection().addRange(range);
          el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        }""")
        expect(page.locator('#jotpatch-root #jp-bubble-pin')).to_be_visible()
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(2)
        assert len(notes(page)) == 2
        assert any((n.get('anchor') or {}).get('exact')=='直接选中' for n in notes(page))
        expect(rail).to_be_visible()
        print('PASS: selected-text 📌 still makes an anchored note independently of Dock +')

        # Updating the browser viewport should keep controls on-screen.
        page.set_viewport_size({'width': 360, 'height': 520})
        expect(new_button).to_be_visible()
        expect(settings).to_be_visible()
        x = rail.bounding_box()
        assert x and x['x'] >= 0 and x['x']+x['width']<=361, x
        print('PASS: compact Dock actions remain usable in narrow browser windows')

        snapshot = page.evaluate("() => structuredClone(globalThis.__jotpatchFakeStore)")
        page.close()
        restored = new_page(context, HTML, seed=snapshot)
        expect(restored.locator('#jotpatch-root #jp-rail')).to_be_visible()
        expect(restored.locator('#jotpatch-root #jp-list-toggle')).to_be_visible()
        assert len(notes(restored)) == 2
        restored.close()
        print('PASS: reload preserves both page and anchored notes using existing storage keys')

        # Long ChatGPT synthetic DOM: Dock becomes a normal track, keeps every
        # gray Prompt bar and colored note marker independently clickable.
        chat = new_site(context, 'https://chatgpt.com/c/unified-dock', chatgpt_body(14))
        chat.on('pageerror', lambda error: errors.append(str(error)))
        chat_rail = chat.locator('#jotpatch-root #jp-rail')
        expect(chat_rail).to_be_visible()
        assert 'compact' not in chat_rail.get_attribute('class')
        expect(chat.locator('#jotpatch-root .rail-turn')).to_have_count(14)
        expect(chat.locator('#jotpatch-root #jp-new')).to_be_visible()
        expect(chat.locator('#jotpatch-root #jp-settings')).to_be_visible()
        chat_list = chat.locator('#jotpatch-root #jp-list-toggle')
        chat_list.click()
        expect(chat.locator('#jotpatch-root .turn-entry')).to_have_count(14)
        dock_rect=chat_rail.bounding_box()
        list_rect=chat.locator('#jotpatch-root #jp-list').bounding_box()
        assert dock_rect and list_rect and list_rect['x']+list_rect['width']<=dock_rect['x']+2, (dock_rect,list_rect)
        chat_list.click()
        expect(chat.locator('#jotpatch-root #jp-list')).to_be_hidden()
        chat.locator('#jotpatch-root .rail-turn').nth(7).click()
        chat.wait_for_function("""() => {
          const box=document.querySelector('#gpt-turn-7').getBoundingClientRect();
          return box.top>=0 && box.top<innerHeight;
        }""")
        print('PASS: long-chat unified Dock preserves direct-click turn navigation and list geometry')

        # A native website navigation is not replaced by empty JotPatch bars.
        chat.evaluate("""() => {
          const nav=document.createElement('nav'); nav.dataset.testid='conversation-timeline';
          nav.textContent='Site timeline';document.body.appendChild(nav);
        }""")
        expect(chat.locator('#jotpatch-root .rail-turn')).to_have_count(0,timeout=5000)
        assert 'compact' in chat_rail.get_attribute('class')
        expect(chat.locator('#jotpatch-root #jp-new')).to_be_visible()
        expect(chat.locator('#jotpatch-root #jp-settings')).to_be_visible()
        assert not errors,errors
        chat.close()
        context.close()
        browser.close()
        print('PASS: native navigation fallback keeps the compact Dock and no page JS errors')


if __name__=='__main__':
    run()
