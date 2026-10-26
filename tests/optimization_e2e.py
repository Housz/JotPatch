"""Stage 1.6 tests: accurate prompt targeting, virtualized history, clustered notes, WYSIWYG.
Synthetic DOM, not an authenticated ChatGPT/Gemini integration test.
"""
from __future__ import annotations
from browser_e2e import launch_browser
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, select_text
from browser_e2e import STORAGE_SHIM, ROOT


def bundled_answer_page():
    cards=[]
    for i in range(7):
        cards.append(f'''<article data-turn-key="stable-{i}" id="bundle-{i}" style="min-height:700px;padding:12px;border-bottom:1px solid #aaa">
        <div data-user-message-bubble id="prompt-{i}" style="height:70px">提问 {i}：用户问题应该精确对齐顶部</div>
        <div class="assistant" style="height:550px;margin-top:30px"><p id="reply-{i}">回答 {i}：这个内容有四个可选择的片段 alpha beta gamma delta</p></div></article>''')
    return '<html><body><main style="width:750px;margin:auto">'+''.join(cards)+'</main></body></html>'


def virtualized_page(context):
    page=context.new_page()
    page.set_content('''<html><head><style>
      body{margin:0;font-family:Arial}#viewport{width:780px;height:560px;overflow-y:auto;margin:30px auto;border:1px solid #aaa}
      #virtual-root{position:relative;height:4800px}.turn{position:absolute;width:94%;height:310px;padding:8px;box-sizing:border-box}
      [data-user-message-bubble]{font-size:18px;padding:12px;background:#eee}
    </style></head><body><div id="viewport"><main id="virtual-root"></main></div></body></html>''')
    page.evaluate(STORAGE_SHIM)
    page.evaluate('''() => {
      const viewport=document.querySelector('#viewport'),root=document.querySelector('#virtual-root');
      function render(){
        const n=Math.floor(viewport.scrollTop/320), start=Math.max(0,n-2),end=Math.min(15,n+5);
        root.replaceChildren();
        for(let i=start;i<end;i++){
          const article=document.createElement('article');article.className='turn';article.dataset.turnKey=`virtual-${i}`;
          article.style.top=`${320*i}px`;
          const user=document.createElement('div');user.setAttribute('data-user-message-bubble','');
          user.textContent=`虚拟会话第 ${i+1} 轮独立问题 unique-${i}`;
          const assistant=document.createElement('div');assistant.textContent=`第 ${i+1} 轮回答`;
          article.append(user,assistant);root.appendChild(article);
        }
      }
      viewport.addEventListener('scroll',render);
      viewport.scrollTop=4800-560;render();
      window.__renderVirtual=render;
    }''')
    page.add_style_tag(path=str(ROOT/'styles/highlight.css'))
    page.add_script_tag(path=str(ROOT/'dist/content.js'))
    page.evaluate('''() => {
      const original=JP.collectConversation;
      JP.collectConversation=()=>original(new URL('https://chatgpt.com/c/virtual-test'));
      JP.conversationSite=()=> 'chatgpt';
      window.__jotpatchStage0.refreshConversation();
    }''')
    return page


def run():
    with sync_playwright() as p:
        browser=launch_browser(p)
        context=browser.new_context(viewport={'width':1200,'height':800})
        errors=[]
        page=new_site(context,'https://chatgpt.com/c/user-bubble-target',bundled_answer_page())
        page.on('pageerror',lambda error: errors.append(str(error)))
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
        page.locator('#jotpatch-root .rail-turn').nth(3).click()
        prompt=page.locator('#prompt-3').bounding_box()
        article=page.locator('#bundle-3').bounding_box()
        assert 65<prompt['y']<110,(prompt,article)
        assert article['y']<=prompt['y'],(article,prompt)
        print('PASS: clicking turn bar aligns exact prompt bubble near top, not a combined answer wrapper')

        # Same-round notes must be independently visible and directly clickable,
        # with a preview on hover; no extra count-marker popover interaction.
        for token in ['alpha','beta','gamma']:
            select_text(page,'#reply-3',token)
            page.locator('#jotpatch-root #jp-bubble-pin').click()
            paper=page.locator('#jotpatch-root .paper').last
            paper.locator('.note-editor').fill('便签-'+token)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        assert page.locator('#jotpatch-root .rail-note-cluster').count()==0
        tops=page.locator('#jotpatch-root .rail-pin').evaluate_all('els=>els.map(el=>parseFloat(el.style.top))')
        assert tops==sorted(tops) and len(set(tops))==3,tops
        turn_top=page.locator('#jotpatch-root .rail-turn').nth(3).evaluate('el=>parseFloat(el.style.top)')
        next_top=page.locator('#jotpatch-root .rail-turn').nth(4).evaluate('el=>parseFloat(el.style.top)')
        assert all(turn_top<t<next_top for t in tops),(turn_top,tops,next_top)
        page.locator('#jotpatch-root .rail-pin').nth(1).hover()
        expect(page.locator('#jotpatch-root #jp-turn-preview')).to_contain_text('便签-beta')
        page.locator('#jotpatch-root .rail-pin').nth(1).click()
        expect(page.locator('#jotpatch-root #jp-note-popover')).to_have_count(0)
        print('PASS: three independently clickable note markers in one round, hover previews content')

        # Inline rich editing and canonical Markdown clipboard content. Lists are
        # formatted in the editor and written as markdown, not raw HTML.
        editor=page.locator('#jotpatch-root .paper').last.locator('.note-editor')
        editor.fill('second idea');editor.press('Control+a');editor.press('Control+i')
        expect(editor.locator('i,em')).to_have_text('second idea')
        editor.fill('list entry')
        editor.focus()
        page.locator('#jotpatch-root .paper').last.locator('.bullet').click(timeout=3500)
        expect(editor.locator('ul li')).to_have_text('list entry')
        page.wait_for_timeout(550)
        md=page.evaluate('''() => Object.values(window.__jotpatchFakeStore)
            .filter(item=>item && item.text?.includes('list entry')).map(item=>item.text)''')
        assert len(md)==1 and md[0].startswith('- ') and 'list entry' in md[0],md
        # Copy must be Markdown source, even though the editor is rich text.
        page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{
          configurable:true,value:{writeText:async (value)=>{window.__lastCopied=value;}}
        })""")
        page.locator('#jotpatch-root .paper').last.locator('.copy').click()
        copied=page.evaluate('() => window.__lastCopied')
        assert copied.startswith('- ') and 'list entry' in copied,copied
        print('PASS: inline italic/list WYSIWYG and copy exports standard Markdown source')

        # Clipboard HTML is deliberately discarded, retaining plain text only.
        result=editor.evaluate("""node=>{
          const data=new DataTransfer();data.setData('text/html','<img src=x onerror=alert(1)>');
          data.setData('text/plain',' harmless ');
          node.focus();
          const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
          const dispatched=node.dispatchEvent(event);
          return {dispatched,imgs:node.querySelectorAll('img').length};
        }""")
        assert result['imgs']==0,result
        print('PASS: rich HTML paste cannot inject tags into note editor')

        page.close()

        virtual=virtualized_page(context)
        virtual.on('pageerror',lambda error: errors.append(str(error)))
        count=virtual.locator('#jotpatch-root .rail-turn').count()
        assert 3<=count<15,count
        initial_scroll=virtual.evaluate("document.querySelector('#viewport').scrollTop")
        virtual.locator('#jotpatch-root #jp-list-toggle').click()
        assert virtual.locator('#jotpatch-root .scan-history').count()==0
        assert virtual.evaluate("document.querySelector('#viewport').scrollTop")==initial_scroll
        virtual.locator('#jotpatch-root #jp-list-toggle').click()
        assert virtual.evaluate("document.querySelector('#viewport').scrollTop")==initial_scroll
        # Only simulated USER scrolls discover earlier turns. No page auto scroll.
        for y in [3200,2400,1600,800,0]:
            virtual.evaluate("y=>document.querySelector('#viewport').scrollTo({top:y})",y)
            virtual.wait_for_timeout(1020)
        expect(virtual.locator('#jotpatch-root .rail-turn')).to_have_count(15,timeout=5000)
        virtual.locator('#jotpatch-root .rail-turn').first.click()
        virtual.wait_for_function("document.querySelector('[data-turn-key=\"virtual-0\"] [data-user-message-bubble]')!==null")
        print('PASS: natural scrolling passively discovers virtualized history; the menu never scrolls the page')
        virtual.close()

        assert not errors,errors
        context.close();browser.close()

if __name__=='__main__':run()
