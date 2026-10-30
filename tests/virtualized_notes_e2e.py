"""Regression: virtualized AI messages must not turn missing anchors into floating cards.

Synthetic DOM-only Playwright scenario; does not access authenticated ChatGPT.
"""
from __future__ import annotations
from browser_e2e import launch_browser
from playwright.sync_api import sync_playwright, expect
from browser_e2e import new_page
from conversation_e2e import select_text


def run():
    with sync_playwright() as p:
        browser = launch_browser(p)
        context = browser.new_context(viewport={'width': 1200, 'height': 800})
        markup = '''<html><body><main id="conversation">
          <section id="recent">
            <p id="quote-a">近期对话中的锚点文本 alpha-unique</p>
            <p id="quote-b">近期对话中的锚点文本 beta-unique</p>
            <p id="quote-c">近期对话中的锚点文本 gamma-unique</p>
          </section>
        </main></body></html>'''
        page = new_page(context, markup)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for selector, phrase in [('#quote-a','alpha-unique'),('#quote-b','beta-unique'),('#quote-c','gamma-unique')]:
            select_text(page, selector, phrase)
            page.locator('#jotpatch-root #jp-bubble-pin').click()
            page.locator('#jotpatch-root .paper').last.locator('.note-editor').fill('自己记录的便签 '+phrase)
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(3)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        saved_keys = page.evaluate('''() => Object.keys(window.__jotpatchFakeStore).filter(key=>key.startsWith('jotpatch:note:v1:'))''')
        assert len(saved_keys) == 3
        print('SETUP: three manually expanded anchored papers, three persistent entries')

        # Simulate React virtualization: recent messages are UNMOUNTED while
        # loading an older chunk, without changing the route or stored notes.
        page.evaluate('''() => {
          window.__previousRecent = document.querySelector('#recent');
          window.__previousRecent.remove();
          const older=document.createElement('section');older.id='older';
          older.innerHTML='<p>更早的消息 chunk-4</p><p>更早的消息 chunk-5</p>';
          document.querySelector('#conversation').prepend(older);
          window.scrollTo(0,0);
        }''')
        # Scroll/position callbacks can run BEFORE the 650ms mutation debounce.
        # Detached Range nodes must already be treated as invalid.
        page.evaluate('window.__jotpatchStage0.schedulePosition()')
        page.wait_for_timeout(80)
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(0)
        print('PASS: detached DOM range is rejected before async anchor reindex')
        page.wait_for_timeout(950)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(3)
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(0)
        print('PASS: virtual DOM unload hides all three open papers, not showing fallback floating cards')

        # A different historical chunk must not revive any anchored paper.
        page.evaluate('''() => { const p=document.createElement('p'); p.textContent='加载另一段历史消息'; document.querySelector('#older').append(p); }''')
        page.wait_for_timeout(900)
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(0)
        print('PASS: subsequent message hydration never reopens missing anchors')

        # A regular page-level note is not tied to a Text Range and remains
        # usable while virtualized chat messages mount/unmount.
        page.evaluate("window.__jpSendMessage({type:'JP_OPEN_DOCK'})")
        page.locator('#jotpatch-root #jp-new').click()
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(1)
        print('PASS: page-level note remains visible when text-anchored notes are unresolved')

        # Explicitly clicking a missing pin can still open/edit one lost note,
        # but must not open the other two. The user retains access to content.
        page.locator('#jotpatch-root .rail-pin.missing').first.click()
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(2)
        print('PASS: explicit unresolved-note action opens one paper, not all of them')

        # Source rehydration restores the exact anchors, and changes no storage.
        page.evaluate('''() => { document.querySelector('#older').remove(); document.querySelector('#conversation').append(window.__previousRecent); }''')
        page.wait_for_timeout(950)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(0)
        expect(page.locator('#jotpatch-root .paper:visible')).to_have_count(4)
        new_keys = page.evaluate('''() => Object.keys(window.__jotpatchFakeStore).filter(key=>key.startsWith('jotpatch:note:v1:'))''')
        assert set(saved_keys).issubset(set(new_keys)) and len(new_keys)==4, (saved_keys,new_keys)
        print('PASS: source remount restores exact-match papers without duplicating stored anchored notes')
        assert not errors, errors
        context.close()
        browser.close()


if __name__ == '__main__':
    run()
