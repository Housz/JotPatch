"""v0.1.14 bugfix: stable turn identity, streaming DOM, old message recovery.

Synthetic Chromium fixtures reproduce mounted/unmounted behavior, not a real
authenticated ChatGPT session. The fixture's #scroll is a real scroll container.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, select_text, chatgpt_body


def virtualization_html():
    return '''<!doctype html><html><head><style>
    body{font-family:Arial;margin:0}
    #scroller{height:520px;width:750px;overflow-y:auto;margin:12px auto;border:1px solid #bbb}
    #virtual-root{height:8400px;position:relative}
    .turn{position:absolute;left:0;width:100%;height:420px;box-sizing:border-box;border-bottom:1px solid #ccc;padding:12px}
    [data-user-message-bubble]{height:65px;background:#f2eee6;padding:10px}
    .answer{padding:40px 12px;height:270px;line-height:1.7}
    </style></head><body><div id="scroller"><main id="virtual-root"></main></div></body></html>'''


def virtual_page(ctx, seed=None):
    page=ctx.new_page()
    page.set_content(virtualization_html())
    from browser_e2e import STORAGE_SHIM, ROOT
    page.evaluate(STORAGE_SHIM if seed is None else STORAGE_SHIM.replace("window.__jotpatchFakeStore = {}",f'window.__jotpatchFakeStore = {seed}'))
    page.evaluate('''() => {
      const root=document.querySelector('#virtual-root'),view=document.querySelector('#scroller');
      function render(){
        const first=Math.floor(view.scrollTop/420),start=Math.max(0,first-2),end=Math.min(20,first+4);
        root.replaceChildren();
        for(let i=start;i<end;i++){
          const article=document.createElement('article');article.dataset.turnKey=`turn-${i}`;
          article.className='turn';article.style.top=`${i*420}px`;
          const prompt=document.createElement('div');prompt.setAttribute('data-user-message-bubble','');
          prompt.textContent=`用户提问 ${i}: 需要找回的旧轮次 turn-${i}`;
          const answer=document.createElement('p');answer.className='answer';answer.id=`answer-${i}`;
          answer.textContent=`第 ${i} 轮回答的定位上下文。 common-marker 用于验证不能跳错其他轮次。`;
          article.append(prompt,answer);root.append(article);
        }
      }
      view.addEventListener('scroll',render);
      view.scrollTop=view.scrollHeight-view.clientHeight;render();
      window.__renderVirtual=render;
    }''')
    page.add_style_tag(path=str(ROOT/'styles/highlight.css'))
    page.add_script_tag(path=str(ROOT/'dist/content.js'))
    page.evaluate('''() => {
      const original=JP.collectConversation;
      JP.collectConversation=()=>original(new URL('https://chatgpt.com/c/nav-bugfix'));
      JP.conversationSite=()=> 'chatgpt';
      window.__jotpatchStage0.refreshConversation();
    }''')
    return page


def discover_old_turns(page):
    # USER-driven scrolling discovers every window; then return to the latest.
    for top in list(range(0,8400,1150))+[8400]:
        page.evaluate("position=>document.querySelector('#scroller').scrollTo({top:position})",top)
        page.wait_for_timeout(900)
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(20,timeout=7000)
    assert page.evaluate("document.querySelector('[data-turn-key=\"turn-0\"]')===null")


def test_identity_and_streaming(ctx, errors):
    page=new_site(ctx,'https://chatgpt.com/c/stream-identity',chatgpt_body(7,modern=True))
    page.on('pageerror',lambda error:errors.append(str(error)))
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
    page.evaluate('''() => {window.__initialRailButtons=[...document.querySelector('#jotpatch-root').shadowRoot.querySelectorAll('.rail-turn')];window.__initialRailY=window.__initialRailButtons.map(node=>node.style.top);}''')
    # Same mounted DOM prompt, different temporary/final site ID.
    page.evaluate('''() => document.querySelector('[data-turn-key="turn-6"]').setAttribute('data-turn-key','modern-6-final')''')
    page.wait_for_timeout(950)
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
    # Simulate 10 streaming chunks: no structural reason to replace any bar.
    for i in range(10):
        page.evaluate('''i=>document.querySelector('#answer-6').append(` 生成中的内容${i}`)''',i)
        page.wait_for_timeout(125)
    page.wait_for_timeout(1200)
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(7)
    assert page.evaluate('''() => {
      const now=[...document.querySelector('#jotpatch-root').shadowRoot.querySelectorAll('.rail-turn')];
      return now.every((node,i)=>node===window.__initialRailButtons[i]&&node.style.top===window.__initialRailY[i]);
    }'''), 'streaming content replaced bar DOM nodes or duplicated a turn'
    print('PASS: streaming content and changing stable attribute never duplicate or replace gray bar nodes')
    page.close()

    same='''<main><article data-turn-key="same-a"><div data-user-message-bubble>完全相同的提问</div></article>
    <article data-turn-key="same-b"><div data-user-message-bubble>完全相同的提问</div></article>
    <article data-turn-key="same-c"><div data-user-message-bubble>另一个提问</div></article></main>'''
    identical=new_site(ctx,'https://chatgpt.com/c/identical-distinct',same)
    expect(identical.locator('#jotpatch-root .rail-turn')).to_have_count(3)
    print('PASS: two distinct user questions with identical text remain two separate turns')
    identical.close()

    replaced=new_site(ctx,'https://chatgpt.com/c/transition',chatgpt_body(5,modern=True))
    before=replaced.locator('#jotpatch-root .rail-turn').count()
    replaced.evaluate('''() => {
      const old=document.querySelector('[data-turn-key="turn-4"]');
      const node=old.cloneNode(true);node.setAttribute('data-turn-key','final-4');old.replaceWith(node);
    }''')
    replaced.wait_for_timeout(1150)
    expect(replaced.locator('#jotpatch-root .rail-turn')).to_have_count(before)
    print('PASS: React shell replacement under stable neighboring question does not duplicate latest turn')
    replaced.close()


def test_old_turn_and_cancellation(ctx,errors):
    page=virtual_page(ctx)
    page.on('pageerror',lambda error:errors.append(str(error)))
    discover_old_turns(page)
    first=page.locator('#jotpatch-root .rail-turn').first
    first.click()
    page.wait_for_function('''() => {
      const prompt=document.querySelector('[data-turn-key="turn-0"] [data-user-message-bubble]');
      if(!prompt)return false;
      const root=document.querySelector('#scroller').getBoundingClientRect();
      const rect=prompt.getBoundingClientRect();
      return rect.top>=root.top && rect.top<root.top+190;
    }''',timeout=18000)
    print('PASS: click an UNMOUNTED old round -> progressively restore exact prompt and align its top')
    # Return to latest; force stale hint/extent so fast coordinates are rejected.
    page.evaluate('''() => document.querySelector('#scroller').scrollTo({top:7900})''')
    page.wait_for_timeout(1020)
    page.evaluate('''() => {
      const t=window.__jotpatchStage0.conversation.turns.find(t=>t.id==='data-turn-key:turn-0');
      t.scrollHint=987654;t.scrollExtent=1;
    }''')
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('''() => !!document.querySelector('[data-turn-key="turn-0"]')''',timeout=18000)
    print('PASS: stale scroll hint falls back to bounded incremental walking')
    # User input cancels an active navigation task. Scroll must not be hijacked.
    page.evaluate("document.querySelector('#scroller').scrollTo({top:7900})")
    page.wait_for_timeout(1000)
    page.locator('#jotpatch-root .rail-turn').first.click()
    assert page.evaluate('window.__jotpatchStage0.navigationBusy'), 'navigation did not start before wheel interruption'
    page.mouse.wheel(0,300)
    page.wait_for_timeout(450)
    assert not page.evaluate('window.__jotpatchStage0.navigationBusy'), 'manual wheel did not cancel navigation'
    print('PASS: manual wheel cancels historical navigation')
    page.close()


def test_unreachable_target_restores_reading(ctx,errors):
    page=virtual_page(ctx)
    page.on('pageerror',lambda error:errors.append(str(error)))
    discover_old_turns(page)
    # Simulate a site that refuses to remount a previously observed message.
    # Scrolls still work, but the exact ID is permanently absent from the DOM.
    page.evaluate('''() => {
      const panel=document.querySelector('#scroller');
      panel.addEventListener('scroll',()=>document.querySelector('[data-turn-key="turn-0"]')?.remove());
    }''')
    start=page.evaluate("document.querySelector('#scroller').scrollTop")
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('''() => !window.__jotpatchStage0.navigationBusy''',timeout=17000)
    expect(page.locator('#jotpatch-root #jp-toast-text')).to_contain_text('暂时无法定位')
    after=page.evaluate("document.querySelector('#scroller').scrollTop")
    assert abs(start-after)<65,(start,after)
    print('PASS: unreachable old turn stops and restores original scroll; never claims success')
    page.close()


def test_note_recovery(ctx,errors):
    page=virtual_page(ctx)
    page.on('pageerror',lambda error:errors.append(str(error)))
    # Visit old turn, create a real anchored note and store its turn identity.
    page.evaluate("document.querySelector('#scroller').scrollTo({top:800})")
    page.wait_for_timeout(1100)
    select_text(page,'#answer-2','common-marker')
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    note=page.locator('#jotpatch-root .paper').last
    note.locator('.note-editor').fill('需要精确恢复的旧便签')
    page.wait_for_timeout(600)
    assert page.evaluate('''() => window.__jotpatchStage0.notes[0].conversationTurnId''')=='data-turn-key:turn-2'
    page.locator('#jotpatch-root .paper .close').last.click()
    # Accumulate full navigation index, then move the note far outside DOM.
    discover_old_turns(page)
    expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(1)
    page.locator('#jotpatch-root .rail-pin').first.click()
    page.wait_for_function('''() => {
      const mark=document.querySelector('#answer-2');
      if(!mark)return false;
      const pane=document.querySelector('#scroller').getBoundingClientRect();
      const rect=mark.getBoundingClientRect();
      return rect.top>=pane.top && rect.top<pane.bottom;
    }''',timeout=18000)
    expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
    expect(page.locator('#jotpatch-root .paper .note-editor')).to_contain_text('需要精确恢复的旧便签')
    assert page.evaluate('''() => window.__jotpatchStage0.matches.get(window.__jotpatchStage0.notes[0].id)
      ?.range.startContainer.parentElement?.closest('[data-turn-key]')?.dataset.turnKey==='turn-2' ''')
    print('PASS: click unloaded note -> restore its OWN round then exact quote, not another common-marker')
    page.close()


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        for test in (test_identity_and_streaming,test_old_turn_and_cancellation,test_note_recovery):
            # A separate context prevents stale streaming fixtures from
            # affecting the next virtual-scroller test.
            context=browser.new_context(viewport={'width':1200,'height':800})
            print('START',test.__name__,flush=True)
            test(context,errors)
            context.close()
        # column-reverse containers legitimately use negative scrollTop.
        ctx=browser.new_context();reverse=ctx.new_page()
        reverse.set_content('''<style>#pane{height:170px;width:220px;overflow-y:auto;display:flex;flex-direction:column-reverse}
          article{flex:0 0 135px}</style><div id=pane><article>A</article><article>B</article>
          <article>C</article><article id="old">D</article></div>''')
        from browser_e2e import ROOT
        reverse.add_script_tag(path=str(ROOT/'dist/content.js'))
        reverse.evaluate("JP.navigateToPrompt(document.querySelector('#old'))")
        assert reverse.evaluate("document.querySelector('#pane').scrollTop")<0
        print('PASS: reverse-flex scroll containers keep valid negative scrollTop')
        ctx.close()
        assert not errors,errors
        browser.close()
        print('PASS: all navigation bugfix scenarios, no page-level JS exceptions')

def run_unreachable():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':1200,'height':800})
        errors=[]
        test_unreachable_target_restores_reading(ctx,errors)
        assert not errors,errors
        ctx.close();browser.close()

if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='unreachable':run_unreachable()
    else:run()

