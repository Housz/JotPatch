"""Stage 1.5 synthetic DOM integration for ChatGPT/Gemini navigation.

This is NOT a claim to have tested authenticated, live production websites;
selectors are tested against multiple representative DOM generations.
"""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_e2e import STORAGE_SHIM

ROOT = Path(__file__).resolve().parents[1]

STYLE = '''
<style>
html,body{margin:0;font-family:Arial,sans-serif}
main{max-width:820px;margin:0 auto;padding:20px}
article, user-query, model-response{display:block;min-height:350px;padding:22px;border-bottom:1px solid #ddd}
[data-user-message-bubble],.query-text{font-size:17px}
</style>
'''


def chatgpt_body(count=7, modern=False):
    blocks=[]
    for i in range(count):
        text=f'提问第{i+1}轮：需要验证对话导航和便签的位置关系 {i}'
        if modern:
            blocks.append(f'<article data-turn-key="turn-{i}" id="gpt-turn-{i}"><div data-user-message-bubble>{text}</div></article>')
        else:
            blocks.append(f'<article data-testid="conversation-turn-{i*2}" data-turn="user" data-turn-id="u-{i}" id="gpt-turn-{i}"><div data-message-author-role="user" data-message-id="user-message-{i}"><div data-user-message-bubble>{text}</div></div></article>')
        blocks.append(f'<article data-testid="conversation-turn-{i*2+1}" data-turn="assistant"><div data-message-author-role="assistant"><p id="answer-{i}">回复第{i+1}轮：可以记录新的观察结论 {i}</p></div></article>')
    return '<!doctype html><html><head>'+STYLE+'</head><body><main id="conversation">'+''.join(blocks)+'</main></body></html>'


def gemini_body(count=6):
    blocks=[]
    for i in range(count):
        blocks.append(f'<user-query id="gem-turn-{i}"><div class="query-text">Gemini 第{i+1}轮提问：导航到精确位置 {i}</div><button>编辑</button></user-query>')
        blocks.append(f'<model-response><div id="gem-answer-{i}">Gemini 第{i+1}轮回答 {i}</div></model-response>')
    return '<!doctype html><html><head>'+STYLE+'</head><body><main class="conversation-container">'+''.join(blocks)+'</main></body></html>'


def new_site(context, url, body, seed=None):
    page=context.new_page()
    # This test runner blocks navigation to real AI hostnames; exercise the
    # adapter against a local synthetic document instead of going on network.
    page.set_content(body)
    if seed is not None:
        page.evaluate('store => {window.__jotpatchFakeStore=store}',seed)
    page.evaluate(STORAGE_SHIM)
    page.add_style_tag(path=str(ROOT/'styles/highlight.css'))
    page.add_script_tag(path=str(ROOT/'dist/content.js'))
    # The production API still uses location.href. The test substitutes only
    # the host adapter argument, not user content, storage or the rail renderer.
    page.evaluate('''(url) => {
      const original = JP.collectConversation;
      JP.collectConversation = () => original(new URL(url));
      JP.conversationSite = () => new URL(url).hostname === 'gemini.google.com' ? 'gemini' :
        new URL(url).hostname === 'chatgpt.com' ? 'chatgpt' : null;
      const app = window.__jotpatchStage0;
      app.refreshConversation();
    }''',url)
    expect(page.locator('#jotpatch-root')).to_have_count(1)
    return page


def select_text(page, css, phrase):
    page.locator(css).scroll_into_view_if_needed()
    page.evaluate('''({css,phrase})=>{
      const element = document.querySelector(css), node=element.firstChild;
      const offset=node.data.indexOf(phrase); if(offset<0) throw Error('quote absent');
      const range=document.createRange(); range.setStart(node,offset);range.setEnd(node,offset+phrase.length);
      getSelection().removeAllRanges();getSelection().addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }''',{'css':css,'phrase':phrase})


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1200,'height':800})
        errors=[]

        page=new_site(context,'https://chatgpt.com/c/jotpatch-test',chatgpt_body())
        page.on('pageerror',lambda e: errors.append(str(e)))
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(0)
        expect(page.locator('#jotpatch-root #jp-rail')).to_be_visible()
        assert '提问第3轮' in page.locator('#jotpatch-root .rail-turn').nth(2).get_attribute('title')
        print('PASS: classic ChatGPT markup → seven question turns, no note required')

        # Hover preview is text-only, keyboard accessible, and does not permanently occupy the rail.
        page.locator('#jotpatch-root .rail-turn').nth(3).hover()
        expect(page.locator('#jotpatch-root #jp-turn-preview')).to_contain_text('第 4 / 7 轮')
        page.locator('#jotpatch-root .rail-turn').nth(3).click()
        page.wait_for_function("document.querySelector('#gpt-turn-3').getBoundingClientRect().top > 0 && document.querySelector('#gpt-turn-3').getBoundingClientRect().top < innerHeight")
        expect(page.locator('#jotpatch-root #jp-turn-preview')).to_be_hidden()
        print('PASS: turn hover preview and click-to-scroll to the matching user question')

        # Attach a note to an assistant reply; the colored pin must share its round's rail position.
        select_text(page,'#answer-3','可以记录新的观察结论')
        page.locator('#jotpatch-root #jp-bubble-pin').click()
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        pin_top=float(page.locator('#jotpatch-root .rail-pin').get_attribute('style').split('top: ')[1].split('%')[0])
        turn_top=float(page.locator('#jotpatch-root .rail-turn').nth(3).get_attribute('style').split('top: ')[1].split('%')[0])
        assert abs(pin_top-turn_top)<2,(pin_top,turn_top)
        page.locator('#jotpatch-root .note-editor').fill('我自己的便签，不应该改为轮次 ID 锚定')
        page.wait_for_timeout(520)
        print('PASS: colored note pin merged beside its round, note uses original text anchor')

        page.locator('#jotpatch-root #jp-list-toggle').click()
        expect(page.locator('#jotpatch-root .turn-entry')).to_have_count(7)
        expect(page.locator('#jotpatch-root .entry').last).to_contain_text('我自己的便签')
        print('PASS: unified expanded list contains turns and anchored notes')

        # Preference update should immediately remove only gray bars, not notes.
        page.evaluate('''() => chrome.storage.local.set({
          'jotpatch:preferences:v1': {selectionTrigger:'always',conversationNavigation:false}
        })''')
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(0)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        page.evaluate('''() => chrome.storage.local.set({
          'jotpatch:preferences:v1': {selectionTrigger:'always',conversationNavigation:true}
        })''')
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
        print('PASS: settings toggle changes conversation bars live, preserves notes')

        # A new user message can appear without an SPA page transition.
        page.evaluate('''() => {
          const a=document.createElement('article');a.id='gpt-turn-new';a.dataset.turn='user';
          a.innerHTML='<div data-message-author-role="user"><div data-user-message-bubble>刚发送的新问题</div></div>';
          document.querySelector('main').append(a);
        }''')
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(8,timeout=4000)
        print('PASS: streaming-era DOM insertion updates turn index without reload')
        snapshot=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        page.close()

        restored=new_site(context,'https://chatgpt.com/c/jotpatch-test',chatgpt_body(),seed=snapshot)
        expect(restored.locator('#jotpatch-root .rail-turn')).to_have_count(7)
        expect(restored.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        print('PASS: stage 1 note schema survives and navigation is reconstructed at reload')
        restored.close()

        modern=new_site(context,'https://chatgpt.com/c/modern-dom',chatgpt_body(4,modern=True))
        expect(modern.locator('#jotpatch-root .rail-turn')).to_have_count(4)
        modern.evaluate('''() => {
          const nav=document.createElement('nav');nav.dataset.testid='conversation-timeline';
          nav.textContent='官方导航';document.body.append(nav);
        }''')
        expect(modern.locator('#jotpatch-root .rail-turn')).to_have_count(0,timeout=4000)
        print('PASS: modern turn-key markup + confidently detected native rail fallback')
        modern.close()

        gemini=new_site(context,'https://gemini.google.com/app/123456',gemini_body())
        gemini.on('pageerror',lambda e: errors.append(str(e)))
        expect(gemini.locator('#jotpatch-root .rail-turn')).to_have_count(6)
        gemini.locator('#jotpatch-root .rail-turn').nth(4).click()
        gemini.wait_for_function("document.querySelector('#gem-turn-4').getBoundingClientRect().top > 0 && document.querySelector('#gem-turn-4').getBoundingClientRect().top < innerHeight")
        print('PASS: Gemini user-query adapter and correct jump')
        gemini.close()

        ordinary=new_site(context,'https://example.com/doc', '<!doctype html><body><main><p>普通网页不应该出现轮次导航。</p></main></body>')
        expect(ordinary.locator('#jotpatch-root #jp-rail')).to_be_hidden()
        print('PASS: generic webpage remains free of conversation navigation')
        ordinary.close()

        short=new_site(context,'https://gemini.google.com/app/short',gemini_body(2))
        expect(short.locator('#jotpatch-root #jp-rail')).to_be_hidden()
        print('PASS: one or two turns do not create a distracting rail')
        short.close()

        # High-turn-count document: no O(N^2) rail construction and each turn remains discoverable.
        long_chat=new_site(context,'https://chatgpt.com/c/very-long',chatgpt_body(120))
        expect(long_chat.locator('#jotpatch-root .rail-turn')).to_have_count(120)
        long_chat.locator('#jotpatch-root #jp-list-toggle').click()
        expect(long_chat.locator('#jotpatch-root .turn-entry')).to_have_count(120)
        assert long_chat.locator('#jotpatch-root .turn-entry').nth(119).inner_text().startswith('120')
        # Dense bars should remain individually selectable at 120 rounds.
        long_chat.locator('#jotpatch-root #jp-list-toggle').click()
        long_chat.locator('#jotpatch-root .rail-turn').nth(80).click()
        long_chat.wait_for_function("document.querySelector('#gpt-turn-80').getBoundingClientRect().top > 0 && document.querySelector('#gpt-turn-80').getBoundingClientRect().top < innerHeight")
        long_chat.close()
        print('PASS: 120 turns remain navigable without persisting conversation text')

        # Changing either option must not erase the other option field.
        html=(ROOT/'options.html').read_text(encoding='utf-8').replace('<script src="options.js"></script>','')
        option=context.new_page();option.set_content(html);option.evaluate(STORAGE_SHIM)
        option.add_script_tag(path=str(ROOT/'options.js'))
        expect(option.locator('input[value="always"]')).to_be_checked()
        option.locator('#conversation-navigation').uncheck()
        expect(option.locator('#conversation-status')).to_contain_text('已保存')
        option.locator('input[value="alt"]').check()
        pref=option.evaluate('''() => window.__jotpatchFakeStore['jotpatch:preferences:v1']''')
        assert pref=={'conversationNavigation':False,'selectionTrigger':'alt'},pref
        option.locator('#conversation-navigation').check()
        pref=option.evaluate('''() => window.__jotpatchFakeStore['jotpatch:preferences:v1']''')
        assert pref['conversationNavigation'] is True and pref['selectionTrigger']=='alt',pref
        option.close()
        print('PASS: selection and conversation preferences survive independent edits')

        assert not errors,errors
        context.close()
        browser.close()

if __name__=='__main__': run()
