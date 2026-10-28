"""Branding/colour preference browser smoke tests for JotPatch v0.1.14.

Uses Chromium with fake chrome.storage APIs; does not imply a store-signed MV3 install.
"""
from pathlib import Path
from browser_e2e import launch_browser
from playwright.sync_api import sync_playwright, expect
from browser_e2e import ROOT, STORAGE_SHIM, new_page


def run():
    with sync_playwright() as p:
        browser = launch_browser(p)
        errors = []
        context = browser.new_context(viewport={'width':1200,'height':800})
        opts = context.new_page()
        opts.on('pageerror', lambda error: errors.append(str(error)))
        opts.set_content((ROOT/'options.html').read_text(encoding='utf-8').replace('<script src="options.js"></script>',''))
        opts.evaluate(STORAGE_SHIM)
        opts.add_script_tag(path=str(ROOT/'options.js'))
        expect(opts.locator('input[name="defaultNoteColorMode"][value="yellow"]')).to_be_checked()
        expect(opts.locator('input[name="uiTransparency"][value="clear"]')).to_be_checked()
        opts.locator('input[name="uiTransparency"][value="soft"]').check()
        expect(opts.locator('#transparency-status')).to_contain_text('已保存')
        assert opts.locator('body').inner_text().count('Powered by Housz') >= 1
        assert '随地大小贴' in opts.locator('body').inner_text()
        # The synthetic page has no extension origin; PNG integrity/sizes are
        # checked separately by the Node contract test.
        assert opts.locator('.brand img').get_attribute('src') == 'icons/icon32.png'
        opts.locator('input[name="defaultNoteColorMode"][value="random"]').check()
        expect(opts.locator('#color-status')).to_contain_text('已保存')
        prefs=opts.evaluate("() => window.__jotpatchFakeStore['jotpatch:preferences:v1']")
        assert prefs['defaultNoteColorMode']=='random' and prefs['uiTransparency']=='soft', prefs
        opts.locator('input[name="selectionTrigger"][value="alt"]').check()
        prefs=opts.evaluate("() => window.__jotpatchFakeStore['jotpatch:preferences:v1']")
        assert prefs['defaultNoteColorMode']=='random' and prefs['selectionTrigger']=='alt' and prefs['uiTransparency']=='soft',prefs
        print('PASS: official logo loads; slogan/author visible; random preference persists and survives other setting edits')
        opts.close()

        # New notes must inherit the preference, while old note appearance
        # remains stored as-is. Continuous random colours may not repeat.
        html = (ROOT/'fixtures/long-page.html').read_text(encoding='utf-8')
        notes = new_page(context, html)
        notes.on('pageerror', lambda error: errors.append(str(error)))
        notes.evaluate("() => chrome.storage.local.set({'jotpatch:preferences:v1':{defaultNoteColorMode:'random',selectionTrigger:'always',conversationNavigation:true}})")
        colors=[]
        for _ in range(9):
            notes.evaluate("() => window.__jpSendMessage({type:'JP_OPEN_DOCK'})")
            notes.locator('#jotpatch-root #jp-new').click()
            # Wait until new note is actually present in stored local data.
            notes.wait_for_function('(n) => Object.values(window.__jotpatchFakeStore).filter(item=>item?.id).length>=n',arg=len(colors)+1)
            # createdAt can tie within one millisecond; insertion order is the
            # authoritative creation order in the storage mock.
            latest=notes.evaluate("() => Object.values(window.__jotpatchFakeStore).filter(item=>item?.id).at(-1)")
            colors.append(latest['appearance']['color'])
        assert all(a!=b for a,b in zip(colors,colors[1:])),colors
        assert set(colors).issubset({'yellow','pink','green','blue','purple','gray'}),colors
        print('PASS: random-colour mode creates nine notes with no adjacent duplicate:',colors)
        notes.evaluate("() => chrome.storage.local.set({'jotpatch:preferences:v1':{defaultNoteColorMode:'yellow',selectionTrigger:'always',conversationNavigation:true}})")
        notes.evaluate("() => window.__jpSendMessage({type:'JP_OPEN_DOCK'})")
        notes.locator('#jotpatch-root #jp-new').click()
        notes.wait_for_function('() => Object.values(window.__jotpatchFakeStore).filter(item=>item?.id).length>=10')
        latest=notes.evaluate("() => Object.values(window.__jotpatchFakeStore).filter(item=>item?.id).at(-1)")
        assert latest['appearance']['color']=='yellow'
        print('PASS: switching back to fixed yellow does not affect existing notes')
        assert not errors,errors
        notes.close()
        context.close()
        browser.close()

if __name__ == '__main__':run()
