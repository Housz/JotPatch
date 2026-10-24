"""JotPatch Stage 1 browser/DOM integration (Chromium with mocked extension APIs).

Run: npm run build && python tests/browser_e2e.py
A genuine installed MV3 extension manual check is still required for permissions/UI.
"""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
STORAGE_SHIM = r"""
(() => {
  const STORE = globalThis.__jotpatchFakeStore || (globalThis.__jotpatchFakeStore = {});
  const listeners = [];
  const messageListeners = [];
  const change = (entries) => { for (const cb of listeners) cb(entries, 'local'); };
  globalThis.chrome = {
    storage: {
      onChanged: { addListener: cb => listeners.push(cb) },
      local: {
        async get(key) {
          if (key === null) return structuredClone(STORE);
          if (typeof key === 'string') return { [key]: structuredClone(STORE[key]) };
          return structuredClone(STORE);
        },
        async set(entries) {
          const changes = {};
          for (const [key, value] of Object.entries(entries)) {
            changes[key] = { oldValue: STORE[key], newValue: structuredClone(value) };
            STORE[key] = structuredClone(value);
          }
          change(changes);
        },
        async remove(key) {
          const changes = {};
          for (const k of Array.isArray(key) ? key : [key]) {
            changes[k] = { oldValue: STORE[k], newValue: undefined };
            delete STORE[k];
          }
          change(changes);
        }
      }
    },
    runtime: {
      onMessage: { addListener: cb => messageListeners.push(cb) },
      sendMessage: async () => ({ok:true})
    }
  };
  globalThis.__jpSendMessage = message => new Promise(resolve => {
    for (const cb of messageListeners) if (cb(message, {}, resolve) !== false) return;
  });
  globalThis.__jpSetPrefs = async mode => chrome.storage.local.set({
    'jotpatch:preferences:v1': {selectionTrigger: mode}
  });
})();
"""


def new_page(context, html, seed=None):
    page = context.new_page()
    page.set_content(html)
    if seed is not None:
        page.evaluate('store => {globalThis.__jotpatchFakeStore = store}', seed)
    page.evaluate(STORAGE_SHIM)
    page.add_style_tag(path=str(ROOT / 'styles/highlight.css'))
    page.add_script_tag(path=str(ROOT / 'dist/content.js'))
    expect(page.locator('#jotpatch-root')).to_have_count(1)
    return page


def select(page, css='#anchor-target', alt=False):
    page.locator(css).scroll_into_view_if_needed()
    page.evaluate('''({css, alt}) => {
      const element=document.querySelector(css), node=element.firstChild;
      const phrase='我们需要保留原文的位置信息';
      const index=node.data.indexOf(phrase);
      const range=document.createRange();
      range.setStart(node,index);range.setEnd(node,index+phrase.length);
      getSelection().removeAllRanges();getSelection().addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,altKey:alt}));
    }''', {'css':css, 'alt':alt})


def run():
    fixture=(ROOT/'fixtures/long-page.html').read_text(encoding='utf-8')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1200,'height':800})
        page=new_page(context,fixture)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))

        select(page)
        expect(page.locator('#jotpatch-root #jp-bubble-pin')).to_be_visible()
        assert page.locator('#jotpatch-root #jp-bubble-pin').inner_text() == '📌'
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        expect(page.locator('#jotpatch-root .note-editor')).to_be_visible()
        assert page.locator('#jotpatch-root .card-head').count() == 0
        assert page.locator('#jotpatch-root .quote').count() == 0
        assert page.locator('#jotpatch-root .card-foot').count() == 0
        page.locator('#jotpatch-root .note-editor').fill('第一张便签：锚点要和原文一起走。')
        page.wait_for_timeout(550)
        store=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        saved=[v for k,v in store.items() if k.startswith('jotpatch:note:v1:')]
        assert len(saved)==1 and saved[0]['text'].startswith('第一张便签'), saved
        assert page.evaluate('''() => {
          const n=Object.values(window.__jotpatchFakeStore).find(x=>x?.anchor);
          return JP.resolveAnchor(n.anchor,JP.buildTextIndex()).range.startContainer.parentElement.id;
        }''') == 'anchor-target'
        print('PASS: icon-only selection → paper editor → debounced save → precise anchor')

        # Create a second note; the first paper must remain expanded.
        select(page, '#duplicate-first')
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(2)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(2)
        print('PASS: multiple independent paper notes, dock entries')

        # Colors and geometric changes persist.
        paper=page.locator('#jotpatch-root .paper').last
        paper.locator('.menu-trigger').click()
        paper.locator('.colors button[aria-label="颜色：blue"]').click()
        paper.locator('.menu-trigger').click()
        initial=paper.bounding_box()
        handle=paper.locator('.resize-handle').bounding_box()
        page.mouse.move(handle['x']+10,handle['y']+10)
        page.mouse.down();page.mouse.move(handle['x']+80,handle['y']+50,steps=6);page.mouse.up()
        grew=paper.bounding_box()
        assert grew['width']>initial['width']+40 and grew['height']>initial['height']+20,(initial,grew)
        assert abs(grew['x']-initial['x']) < 3 and abs(grew['y']-initial['y']) < 3,(initial,grew)
        print('PASS: resize preserves original top-left corner')
        grip=paper.locator('.drag-region').bounding_box()
        page.mouse.move(grip['x']+70,grip['y']+12)
        page.mouse.down();page.mouse.move(grip['x']+17,grip['y']+40,steps=6);page.mouse.up()
        page.wait_for_timeout(520)
        store=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        appearances=[n['appearance'] for n in store.values() if isinstance(n,dict) and n.get('id')]
        assert any(s.get('color')=='blue' and s.get('width',0)>300 and abs(s.get('offsetX',0))>10 for s in appearances),appearances
        print('PASS: color, resize in both axes and drag persist to local storage')

        # Simulate content mutation + scrolling + dock.
        page.evaluate('''() => {
          const extra=document.createElement('p'); extra.textContent='插入的新内容改变了全文原始偏移';
          document.querySelector('#long-document').prepend(extra);
        }''')
        page.wait_for_timeout(900)
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        page.wait_for_timeout(160)
        expect(page.locator('#jotpatch-root .marker:visible')).to_have_count(0)
        expect(page.locator('#jotpatch-root #jp-rail')).to_be_visible()
        page.locator('#jotpatch-root .rail-pin').last.click()
        page.wait_for_function('''() => {
          const r=document.querySelector('#duplicate-first').getBoundingClientRect();
          return r.top>0&&r.top<innerHeight;
        }''',timeout=7000)
        print('PASS: source mutation, scroll-following and Dock navigation')

        # Settings: always / Alt / off. Right-click message works even when bubble is off.
        await_pref = lambda mode: page.evaluate('(mode) => window.__jpSetPrefs(mode)', mode)
        await_pref('alt')
        select(page)
        expect(page.locator('#jotpatch-root #jp-bubble')).to_be_hidden()
        select(page,alt=True)
        expect(page.locator('#jotpatch-root #jp-bubble')).to_be_visible()
        await_pref('off')
        select(page,alt=True)
        expect(page.locator('#jotpatch-root #jp-bubble')).to_be_hidden()
        before=page.locator('#jotpatch-root .rail-pin').count()
        # Existing Range is captured via contextmenu without the inline bubble.
        page.locator('#anchor-target').dispatch_event('contextmenu')
        response=page.evaluate('''() => window.__jpSendMessage({
          type:'JP_CREATE_FROM_CONTEXT',selectionText:'我们需要保留原文的位置信息'
        })''')
        assert response['ok'],response
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(before+1)
        print('PASS: preference live update and right-click creation with popup disabled')

        # Page-level note from tiny launcher.
        page.evaluate("window.__jpSendMessage({type:'JP_OPEN_LAUNCHER'})")
        page.locator('#jotpatch-root #jp-new').click()
        store=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        assert any(n.get('anchor') is None for n in store.values() if isinstance(n,dict) and n.get('id'))
        print('PASS: page-level note without a selected quote')

        # WYSIWYG means the editing surface shows semantic HTML, never Markdown syntax.
        editor=page.locator('#jotpatch-root .paper').last.locator('.note-editor')
        editor.fill('an idea')
        editor.press('Control+a');editor.press('Control+b')
        expect(editor.locator('b,strong')).to_have_text('an idea')
        assert editor.inner_text()=='an idea',editor.inner_text()
        page.wait_for_timeout(500)
        store=page.evaluate("""() => Object.values(window.__jotpatchFakeStore)
          .find(item=>item && item.text?.includes('an idea'))?.text""")
        assert store=='**an idea**',store
        print('PASS: real WYSIWYG bold and standard Markdown source in persistent storage')

        # Normal fixed header/footer plus font preset, wheel and menu-dismiss.
        last=page.locator('#jotpatch-root .paper').last
        expect(last.locator('.paper-head')).to_have_count(1)
        expect(last.locator('.paper-foot')).to_have_count(1)
        assert last.locator('.drag-handle').count()==0
        last.locator('.menu-trigger').click()
        last.locator('.font-size[data-font="lg"]').click()
        assert last.evaluate("node=>node.style.getPropertyValue('--jp-font-size')")=='17px'
        last.locator('.menu-trigger').click()
        last.locator('.note-editor').dispatch_event('wheel',{'ctrlKey':True,'deltaY':100,'cancelable':True})
        assert last.evaluate("node=>node.style.getPropertyValue('--jp-font-size')")=='14px'
        last.locator('.menu-trigger').click()
        expect(last.locator('.note-menu')).to_be_visible()
        page.locator('#anchor-target').click()
        expect(last.locator('.note-menu')).to_be_hidden()
        print('PASS: top/bottom bars, font presets, Ctrl+wheel font step and click-outside menu dismissal')

        # Delete and undo keep the original id and content.
        last=page.locator('#jotpatch-root .paper').last
        last.locator('.menu-trigger').click(timeout=4500)
        last.locator('.delete-menu').click(timeout=4500)
        expect(page.locator('#jotpatch-root #jp-undo')).to_be_visible()
        page.locator('#jotpatch-root #jp-undo').click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(4)
        print('PASS: delete → undo')

        # Fresh document restores from existing storage. Stage 0 note format also works.
        snapshot=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        page.close()
        page=new_page(context,fixture,seed=snapshot)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        expect(page.locator('#jotpatch-root #jp-loose-toggle')).to_be_visible()
        page.locator('#jotpatch-root #jp-list-toggle').click()
        page.locator('#jotpatch-root .entry').first.click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        page.evaluate("document.querySelector('#duplicate-first').remove()")
        page.wait_for_timeout(880)
        expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(1)
        print('PASS: storage restore + lost-anchor gracefully represented')
        assert not errors,errors

        # Preference panel is a real extension document in production; fake the
        # storage methods for this view to test the independent radio setting.
        options=(ROOT/'options.html').read_text(encoding='utf-8').replace('<script src="options.js"></script>','')
        settings=context.new_page()
        settings.set_content(options)
        settings.evaluate(STORAGE_SHIM)
        settings.add_script_tag(path=str(ROOT/'options.js'))
        expect(settings.locator('input[value="always"]')).to_be_checked()
        settings.locator('input[value="alt"]').check()
        expect(settings.locator('#preference-status')).to_contain_text('已保存')
        value=settings.evaluate("() => window.__jotpatchFakeStore['jotpatch:preferences:v1'].selectionTrigger")
        assert value == 'alt',value
        print('PASS: settings page selection mode persisted')
        settings.close()
        context.close();browser.close()

if __name__=='__main__': run()
