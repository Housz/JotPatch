"""JotPatch v0.1.19 post-Dock interaction and visual regression (Chromium/Firefox).

The supplied pages use synthetic content and fake storage. A real installed
Firefox toolbar/storage smoke runs separately through firefox_addon_smoke.py.
"""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_e2e import launch_browser, new_page, ROOT, STORAGE_SHIM

HTML="""<!doctype html><html><head><style>body{font:17px/1.65 system-ui;margin:40px}
p{max-width:750px}main{max-width:900px;margin:auto}</style></head>
<body><main><p id="quote">一个可被锚定的测试段落，保证悬浮按钮不会误伤原文。</p></main></body></html>"""


def saved(page):
    return page.evaluate("""() => Object.values(window.__jotpatchFakeStore)
      .filter(n=>n?.schemaVersion===1 && !n.deletedAt)""")


def expect_saved(page,count):
    page.wait_for_function("""count=>Object.values(window.__jotpatchFakeStore)
      .filter(n=>n?.schemaVersion===1 && !n.deletedAt).length===count""",count)


def select_quote(page):
    page.evaluate("""() => {
      const node=document.querySelector('#quote').firstChild;
      const text='可被锚定';
      const start=node.data.indexOf(text);
      const range=document.createRange();
      range.setStart(node,start);range.setEnd(node,start+text.length);
      getSelection().removeAllRanges();getSelection().addRange(range);
      node.parentElement.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }""")


def select_lines(editor):
    editor.evaluate("""editor=>{
      JP.renderMarkdown(editor,'**第一行**\\n第二行');
      const rows=editor.querySelectorAll('p');
      const r=document.createRange();
      r.setStart(rows[0].querySelector('strong').firstChild,0);
      r.setEnd(rows[1].firstChild,rows[1].firstChild.length);
      const sel=document.getSelection();sel.removeAllRanges();sel.addRange(r);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
    }""")


def run():
    with sync_playwright() as p:
        browser=launch_browser(p)
        context=browser.new_context(viewport={'width':1200,'height':780})
        page=new_page(context,HTML)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        root=page.locator('#jotpatch-root')
        new=page.locator('#jotpatch-root #jp-new')
        badge=page.locator('#jotpatch-root #jp-loose-toggle')
        top=page.locator('#jotpatch-root #jp-list-toggle')
        listing=page.locator('#jotpatch-root #jp-list')

        new.click();new.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(2)
        expect_saved(page,2)
        expect(badge).to_have_text('2')
        expect(badge).to_have_attribute('aria-pressed','true')
        assert 'has-loose' in page.locator('#jotpatch-root #jp-rail').get_attribute('class')
        top.click()
        expect(listing).to_be_visible()
        expect(page.locator('#jotpatch-root .note-entry')).to_have_count(2)
        assert listing.locator('.list-header,.list-footer').count()==0
        assert 'Powered by Housz' not in listing.inner_text()
        assert 'JotPatch' not in listing.inner_text()
        top.click()
        expect(listing).to_be_hidden()

        badge.click()
        expect(badge).to_have_attribute('aria-pressed','false')
        expect(page.locator('#jotpatch-root .paper')).to_have_count(0)
        expect_saved(page,2)
        top.click()
        expect(page.locator('#jotpatch-root .note-entry')).to_have_count(2)
        page.locator('#jotpatch-root .note-entry').first.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        badge.click()
        expect(badge).to_have_attribute('aria-pressed','true')
        expect(page.locator('#jotpatch-root .paper')).to_have_count(2)
        badge.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(0)
        assert len(saved(page))==2
        print('PASS: bottom numeric badge toggles ONLY page-floating papers; top list is compact and independent')

        select_quote(page)
        expect(page.locator('#jotpatch-root #jp-bubble-pin')).to_be_visible()
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        assert len([n for n in saved(page) if n.get('anchor')])==1
        expect(badge).to_have_text('2')
        badge.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(3)
        badge.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        assert page.locator('#jotpatch-root .paper').first.get_attribute('data-note-id')==[n['id'] for n in saved(page) if n.get('anchor')][0]
        print('PASS: floating group toggle never hides or counts a text-anchored note')

        # Reopen all float papers and explicitly verify pointer-based stacking.
        badge.click()
        floating=[n['id'] for n in saved(page) if not n.get('anchor')]
        first=page.locator('#jotpatch-root .paper[data-note-id="'+floating[0]+'"]')
        second=page.locator('#jotpatch-root .paper[data-note-id="'+floating[1]+'"]')
        first.evaluate("el=>{el.style.left='40px';el.style.top='80px'}")
        second.evaluate("el=>{el.style.left='380px';el.style.top='80px'}")
        before=(int(first.get_attribute('style').split('z-index: ')[1].split(';')[0]),
                int(second.get_attribute('style').split('z-index: ')[1].split(';')[0]))
        first.locator('.paper-head').click(position={'x':65,'y':12})
        after=(int(first.evaluate('el=>el.style.zIndex')),int(second.evaluate('el=>el.style.zIndex')))
        assert after[0]>after[1],(before,after)
        second.locator('.paper-head').click(position={'x':65,'y':12})
        assert int(second.evaluate('el=>el.style.zIndex'))>int(first.evaluate('el=>el.style.zIndex'))
        print('PASS: pointer down on lower note HEADER brings it to front, not just its editor')

        # A minimum-size note must show every menu item even at viewport bottom.
        # This uses genuine pointer hit testing, not force-click/DOM injection.
        first.evaluate("""el=>{
          el.style.width='180px';el.style.height='132px';el.style.left='55px';
          el.style.top=(innerHeight-145)+'px';
        }""")
        first.locator('.menu-trigger').click()
        menu=first.locator('.note-menu')
        expect(menu).to_be_visible()
        rect=menu.bounding_box(); paper_rect=first.bounding_box()
        assert rect and paper_rect and rect['height']>paper_rect['height']
        assert rect['y']>=0 and rect['y']+rect['height']<=781,(rect,paper_rect)
        assert rect['y']<paper_rect['y'],(rect,paper_rect)
        menu.locator('.colors button').nth(2).click()
        assert first.evaluate("el=>el.style.getPropertyValue('--paper')") == '#DFF1DD'
        first.locator('.menu-trigger').click()
        menu.locator('.delete-menu').click(trial=True)
        first.locator('.menu-trigger').click()
        print('PASS: small paper menu flips above the viewport edge and is actually clickable')

        # Indent/outdent a single caret and selected paragraphs while preserving
        # formatting and auto-saving the canonical Markdown source.
        editor=first.locator('.note-editor')
        editor.fill('')
        editor.press('Tab')
        editor.type('abc')
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text.startsWith('  abc'))""",floating[0])
        editor.press('Shift+Tab')
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text==='abc')""",floating[0])
        print('PASS: physical Tab inserts spaces, Shift+Tab outdents, and Markdown autosaves')

        select_lines(editor)
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text==='**第一行**\\n第二行')""",floating[0])
        editor.press('Tab')
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text==='  **第一行**\\n  第二行')""",floating[0])
        assert editor.locator('strong').count()==1
        editor.press('Shift+Tab')
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text==='**第一行**\\n第二行')""",floating[0])
        select_lines(editor)
        editor.press('Tab')
        editor.evaluate("""el=>el.dispatchEvent(new KeyboardEvent('keydown',{
          key:'Tab',ctrlKey:true,bubbles:true,cancelable:true
        }))""")
        page.wait_for_function("""id=>Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.text==='**第一行**\\n第二行')""",floating[0])
        print('PASS: selected lines indent/outdent and Ctrl+Tab event handler retain bold Markdown')

        # Preferences update live. Transparency only affects surfaces; editing
        # and caret text remain opaque. No GPU backdrop blur is introduced.
        page.locator('#quote').click()
        initial=first.evaluate("""el=>getComputedStyle(el).backgroundColor""")
        original_text=editor.evaluate("el=>getComputedStyle(el).color")
        page.evaluate("""() => chrome.storage.local.set({'jotpatch:preferences:v1':{
          selectionTrigger:'always',uiTransparency:'light',conversationNavigation:true
        }})""")
        page.wait_for_function("""() => document.querySelector('#jotpatch-root')
          .style.getPropertyValue('--jp-paper-amount')==='86%'""")
        light=first.evaluate("""el=>getComputedStyle(el).backgroundColor""")
        assert light!=initial,(initial,light)
        assert editor.evaluate("el=>getComputedStyle(el).color")==original_text
        assert first.evaluate("el=>getComputedStyle(el).backdropFilter") in ('none','')
        editor.focus()
        opaque=first.evaluate("el=>getComputedStyle(el).backgroundColor")
        assert opaque!=light,(opaque,light)
        print('PASS: live three-preset transparency changes paper backgrounds, not text, and restores clarity on focus')

        assert not errors,errors
        page.close();context.close();browser.close()


if __name__=='__main__':
    run()
