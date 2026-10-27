"""LaTeX-aware selections on real Chromium/Firefox DOM (mocked extension storage).

Run after npm run build:
  JP_CHROMIUM_BIN=playwright python tests/math_selection_e2e.py
  JP_E2E_BROWSER=firefox python tests/math_selection_e2e.py
No logged-in ChatGPT session or private API is involved.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_e2e import new_page, launch_browser

ROOT = Path(__file__).resolve().parents[1]

def select(page, css: str, mode='whole'):
    page.locator(css).scroll_into_view_if_needed()
    page.evaluate("""({css, mode}) => {
      const el=document.querySelector(css), range=document.createRange();
      if(mode==='whole')range.selectNode(el);
      if(mode==='visible') {
        const node=el.querySelector('.katex-html').firstChild;
        range.setStart(node,0);range.setEnd(node,Math.min(2,node.length));
      }
      if(mode==='mixed') {
        range.setStart(el.firstChild,0);
        range.setEnd(el.lastChild,el.lastChild.length);
      }
      getSelection().removeAllRanges();getSelection().addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }""", {'css':css,'mode':mode})

def anchor_notes(page):
    return page.evaluate("""() => Object.values(globalThis.__jotpatchFakeStore)
        .filter(n => n && n.schemaVersion === 1 && n.anchor)""")

def add_note(page):
    expect(page.locator('#jotpatch-root #jp-bubble')).to_be_visible()
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    expect(page.locator('#jotpatch-root .paper')).to_have_count(len(anchor_notes(page)))
    return anchor_notes(page)[-1]

def run():
    fixture=(ROOT/'fixtures/math-selection.html').read_text(encoding='utf-8')
    with sync_playwright() as pw:
        browser=launch_browser(pw)
        context=browser.new_context(viewport={'width':1240,'height':800})
        page=new_page(context,fixture)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        tokens=page.evaluate("""() => JP.buildTextIndex().math.map(item =>
            ({text:JP.buildTextIndex().text.slice(item.start,item.end),tag:item.node.tagName}))""")
        assert len(tokens)==6,tokens
        assert any(r['text']==r'\(x^2+y^2=z^2\)' for r in tokens),tokens
        print('PASS: KaTeX/MathML and source attributes are indexed once, not duplicated')

        select(page,'#pure .katex')
        note=add_note(page)
        assert note['anchor']['exact']==r'\(x^2+y^2=z^2\)',note
        pin=page.locator('#jotpatch-root .paper').last.locator('.paper-pin')
        expect(pin).to_be_visible()
        assert pin.locator('svg').count()==0
        assert '📌' in pin.inner_text(),pin.inner_text()
        glyph=pin.locator('.paper-pin-symbol')
        assert glyph.evaluate("(el)=>getComputedStyle(el).filter")=='grayscale(1)'
        print('PASS: pure formula selection saves canonical TeX; monochrome 📌 replaces distorted SVG')

        select(page,'#mixed','mixed')
        mixed=add_note(page)
        assert mixed['anchor']['exact']==r'这里有公式 \(E=mc^2\) 和普通说明。',mixed
        print('PASS: text + rendered formula selection creates a single verified anchor')

        # The browser can report much more text than the formula actually means.
        page.evaluate("""() => {
          document.querySelector('#huge-visible').textContent='x'.repeat(1900);
        }""")
        select(page,'#huge-raw','mixed')
        huge=add_note(page)
        assert huge['anchor']['exact']==r'文本 \(a+b\) 结尾。',huge
        print('PASS: raw KaTeX text over 1600 chars does not suppress a short canonical selection')

        select(page,'#svg-math .katex')
        svg=add_note(page)
        assert svg['anchor']['exact']==r'\(\int_0^1 x^2 dx\)',svg
        print('PASS: formula with SVG glyphs and data-tex remains anchorable')

        select(page,'#duplicate-a .katex')
        first=add_note(page)
        assert first['anchor']['exact']==r'\(x^2+y^2=z^2\)'
        assert '第一处假设' in first['anchor']['prefix']
        print('PASS: duplicate TeX is disambiguated by surrounding text context')

        # React-style replacement: re-render the same formula with new nodes.
        page.evaluate("""() => {
          const target=document.querySelector('#duplicate-a .katex');
          target.outerHTML=target.outerHTML;
        }""")
        page.wait_for_timeout(920)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(0)
        assert not errors,errors
        print('PASS: re-rendered formula reattaches to the correct passage and has no page errors')

        snapshot=page.evaluate('() => structuredClone(globalThis.__jotpatchFakeStore)')
        page.close()
        page=new_page(context,fixture,seed=snapshot)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(0)
        assert len(anchor_notes(page))==5
        print('PASS: stored LaTeX anchors restore after reload without a schema migration')
        page.close()
        context.close()
        browser.close()

if __name__=='__main__':
    run()
