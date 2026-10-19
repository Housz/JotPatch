"""Stage 1.6 tests: accurate prompt targeting, virtualized history, clustered notes, WYSIWYG.
Synthetic DOM, not an authenticated ChatGPT/Gemini integration test.
"""
from __future__ import annotations
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
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
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

        # Three different text anchors in the same AI answer have ONE rail marker,
        # with an accessible popover listing each exact note.
        for token in ['alpha','beta','gamma']:
            select_text(page,'#reply-3',token)
            page.locator('#jotpatch-root #jp-bubble-pin').click()
            paper=page.locator('#jotpatch-root .paper').last
            paper.locator('.note-editor').fill('便签-'+token)
        expect(page.locator('#jotpatch-root .rail-note-cluster')).to_have_count(1)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(1)
        assert page.locator('#jotpatch-root .rail-note-cluster').inner_text()=='3'
        page.locator('#jotpatch-root .rail-note-cluster').click()
        expect(page.locator('#jotpatch-root .cluster-item')).to_have_count(3)
        page.locator('#jotpatch-root .cluster-item').nth(1).click()
        expect(page.locator('#jotpatch-root #jp-note-popover')).to_be_hidden()
        print('PASS: multiple notes in one AI round merge into an accessible count marker, each still has precise anchor')

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
        virtual.locator('#jotpatch-root .scan-history').click()
        virtual.wait_for_function("!window.__jotpatchStage0.scanningHistory",timeout=16000)
        expect(virtual.locator('#jotpatch-root .rail-turn')).to_have_count(15,timeout=6000)
        assert abs(virtual.evaluate("document.querySelector('#viewport').scrollTop")-initial_scroll)<15
        virtual.locator('#jotpatch-root #jp-list-toggle').click() # close list
        virtual.locator('#jotpatch-root .rail-turn').first.click()
        virtual.wait_for_function('''() => {
          const node=document.querySelector('[data-turn-key="virtual-0"] [data-user-message-bubble]');
          if(!node)return false;
          const rect=node.getBoundingClientRect(), viewport=document.querySelector('#viewport').getBoundingClientRect();
          return rect.top>viewport.top && rect.top<viewport.top+200;
        }''',timeout=8500)
        print('PASS: optional scan discovers virtualized history, restores scroll and rehydrates old prompt when clicked')
        virtual.close()

        assert not errors,errors
        context.close();browser.close()

if __name__=='__main__':run()
