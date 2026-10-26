"""Navigation Lab: synthetic-only long chat load models (NOT authenticated ChatGPT).

Each scenario runs as a standalone process to avoid Chromium context leakage.
  python tests/navigation_lab_e2e.py options|fixed|paging|reverse|cancel|unreachable
"""
from __future__ import annotations
from browser_e2e import launch_browser
import sys
import json
import time
import os
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, chatgpt_body, ROOT, select_text
from navigation_recovery_e2e import virtual_page, discover_old_turns
from browser_e2e import STORAGE_SHIM


def enable_lab(page):
    page.evaluate("""() => chrome.storage.local.set({
      'jotpatch:preferences:v1':{selectionTrigger:'always',conversationNavigation:true,
        defaultNoteColorMode:'yellow',navigationLab:true}
    })""")
    page.wait_for_function('() => window.__jotpatchStage0.navigationLab===true')


def result(page):
    return page.evaluate('''() => {
       const app=window.__jotpatchStage0;
       return {enabled:app.navigationLab, busy:app.navigationBusy, metrics:app.labLastMetrics,
               indexCount:app.navigationLabIndex.size(),
               stored:Object.keys(window.__jotpatchFakeStore).filter(x=>x.includes('checkpoint'))};
    }''')


def options(context):
    page=context.new_page()
    markup=(ROOT/'options.html').read_text(encoding='utf8').replace('<script src="options.js"></script>','')
    page.set_content(markup)
    page.evaluate(STORAGE_SHIM)
    page.add_script_tag(path=str(ROOT/'options.js'))
    toggle=page.locator('#navigation-lab')
    expect(toggle).not_to_be_checked()
    page.locator('input[value="random"][name="defaultNoteColorMode"]').check()
    toggle.check()
    page.wait_for_function("() => window.__jotpatchFakeStore['jotpatch:preferences:v1']?.navigationLab===true")
    stored=page.evaluate("window.__jotpatchFakeStore['jotpatch:preferences:v1']")
    assert stored['defaultNoteColorMode']=='random',stored
    toggle.uncheck()
    page.wait_for_function("() => window.__jotpatchFakeStore['jotpatch:preferences:v1']?.navigationLab===false")
    stored=page.evaluate("window.__jotpatchFakeStore['jotpatch:preferences:v1']")
    assert stored['defaultNoteColorMode']=='random' and stored['navigationLab'] is False
    assert 'Powered by Housz' in page.inner_text('body')
    print('PASS: lab opt-in, preference serialization, release branding, opt-out')
    screenshot=os.environ.get('JOTPATCH_LAB_SETTINGS_SCREENSHOT')
    if screenshot:page.screenshot(path=screenshot)
    page.close()


def fixed(context):
    page=virtual_page(context)
    discover_old_turns(page)
    enable_lab(page)
    # Build trusted checkpoints by visiting a known old window during normal
    # user scroll. Then revisit latest before clicking the stale old bar.
    page.evaluate("document.querySelector('#scroller').scrollTo({top:150})")
    page.wait_for_timeout(1050)
    page.evaluate("document.querySelector('#scroller').scrollTo({top:7900})")
    page.wait_for_timeout(1050)
    assert result(page)['indexCount']>5,result(page)
    start=time.perf_counter()
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('''() => {
      const box=document.querySelector('[data-turn-key="turn-0"] [data-user-message-bubble]')?.getBoundingClientRect();
      const pane=document.querySelector('#scroller').getBoundingClientRect();
      return box && box.top>=pane.top && box.top<pane.top+210 && !window.__jotpatchStage0.navigationBusy;
    }''',timeout=16000)
    info=result(page)
    assert info['metrics']['outcome']=='arrived',info
    assert info['metrics']['strategy'] in ('checkpoint','progressive'),info
    assert not info['stored'],info
    print('PASS fixed-height virtualization:',info['metrics'],'wallMs',round((time.perf_counter()-start)*1000))
    page.close()


def paging_html(total=32):
    blocks=''.join(f'''<article data-turn-key="turn-{i}" style="height:310px;padding:8px;box-sizing:border-box;border-bottom:1px solid #ddd">
      <div data-user-message-bubble>分页查询第 {i} 轮 · 唯一ID turn-{i}</div>
      <div style="height:230px">回答内容 {i}</div></article>''' for i in range(total))
    return '''<html><head><style>body{margin:0;font-family:Arial}#scroller{height:540px;width:720px;margin:14px auto;overflow-y:auto;border:1px solid #bbb}main{width:100%}article{width:100%}</style></head>
      <body><div id="scroller"><main id="history">'''+blocks+'</main></div></body></html>'


def paging_page(context, mode='lab'):
    page=new_site(context,'https://chatgpt.com/c/lab-paged',paging_html())
    # Capture the full logical history *once*, then the app's in-memory index
    # retains it when old chunks are removed by virtualized React.
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(32)
    page.evaluate('''() => {
      const history=document.querySelector('#history');
      const all=[...history.children]; window.__pages=all;
      history.replaceChildren(...all.slice(28));
      const panel=document.querySelector('#scroller');panel.scrollTop=panel.scrollHeight;
      let next=28, busy=false, batches=0;
      panel.addEventListener('scroll',()=>{
        if(panel.scrollTop>65 || busy || next<=0)return;
        busy=true;
        setTimeout(()=>{
          const start=Math.max(0,next-4),oldHeight=panel.scrollHeight;
          history.prepend(...all.slice(start,next));next=start;
          const delta=panel.scrollHeight-oldHeight;
          panel.scrollTop+=delta;
          batches++; window.__pagesLoaded=batches;
          busy=false;
        },640);
      });
      window.__pagesLoaded=0;
    }''')
    page.wait_for_timeout(1000)
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(32)
    if mode=='lab':enable_lab(page)
    else:assert result(page)['enabled'] is False
    return page


def paging(context,mode='lab'):
    page=paging_page(context,mode)
    started=time.perf_counter()
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('''() => {
      const app=window.__jotpatchStage0;
      const target=document.querySelector('[data-turn-key="turn-0"] [data-user-message-bubble]');
      if(!target||app.navigationBusy)return false;
      const box=target.getBoundingClientRect(),root=document.querySelector('#scroller').getBoundingClientRect();
      return box.top>root.top-20 && box.top<root.bottom;
    }''',timeout=38000)
    elapsed=round((time.perf_counter()-started)*1000)
    loaded=page.evaluate('window.__pagesLoaded')
    assert loaded==7,(loaded,elapsed)
    info=result(page)
    if mode=='lab':assert info['metrics']['outcome']=='arrived',info
    print('PASS slow paginated history:',json.dumps({'mode':mode,'wallMs':elapsed,'pages':loaded,'labMetrics':info['metrics']},ensure_ascii=False))
    page.close()
    return elapsed


def reverse(context):
    page=context.new_page()
    page.set_content('''<style>#pane{height:250px;width:640px;overflow-y:auto;display:flex;flex-direction:column-reverse;border:1px solid #555}
      article{flex:0 0 165px;border-bottom:1px solid #ccc;box-sizing:border-box}</style>
      <div id="pane"></div>''')
    page.add_script_tag(path=str(ROOT/'dist/content.js'))
    # Direct simulation of the navigation API over a reverse-flex container.
    # Real DOM is fully mounted, but only the narrow visible interval is
    # reported as loaded to simulate virtualization.
    page.evaluate('''() => {
      const pane=document.querySelector('#pane');
      for(let i=0;i<18;i++){
        const item=document.createElement('article');item.dataset.i=String(i);
        item.textContent='Reverse message '+i;pane.appendChild(item);
      }
      window.__labCtrl=new AbortController();
      window.__labIndex=new JP.NavigationLabIndex();
      window.__labTurns=()=>[...pane.children].map((element,i)=>{
        const b=element.getBoundingClientRect(),p=pane.getBoundingClientRect();
        const mounted=b.bottom>p.top-300 && b.top<p.bottom+300;
        return {id:'r-'+i,stableId:'r-'+i,order:i,preview:'',element:mounted?element:null};
      });
      window.__startReverse=()=>JP.recoverConversationTurnLab({
        targetId:'r-17',getRoot:()=>pane,getTurns:window.__labTurns,
        signal:window.__labCtrl.signal,checkpoints:window.__labIndex,
        maxSteps:55,maxMilliseconds:13000
      }).then(r=>{window.__reverseResult={outcome:r.outcome,steps:r.steps,top:pane.scrollTop};});
    }''')
    page.evaluate('window.__startReverse()')
    page.wait_for_function('() => !!window.__reverseResult',timeout=16000)
    info=page.evaluate('window.__reverseResult')
    assert info['outcome']=='arrived' and info['top']<0,info
    print('PASS negative scrollTop + reverse flex:',info)
    page.close()


def cancelled(context):
    page=paging_page(context)
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('() => window.__jotpatchStage0.navigationBusy',timeout=3000)
    page.mouse.wheel(0,250)
    page.wait_for_function('() => !window.__jotpatchStage0.navigationBusy',timeout=3000)
    before=page.evaluate("document.querySelector('#scroller').scrollTop")
    page.wait_for_timeout(1100)
    after=page.evaluate("document.querySelector('#scroller').scrollTop")
    assert abs(after-before)<700,(before,after)
    print('PASS manual wheel cancels experimental navigation')
    page.close()


def unreachable(context):
    page=paging_page(context)
    # Keep the target permanently absent, but leave it in the cached index.
    page.evaluate('''() => {
      window.__pages[0]?.remove();
      document.querySelector('#scroller').addEventListener('scroll',()=>{
        document.querySelector('[data-turn-key="turn-0"]')?.remove();
      });
      const original=JP.recoverConversationTurnLab;
      JP.recoverConversationTurnLab=(args)=>original({...args,maxSteps:26,maxMilliseconds:4500});
    }''')
    before=page.evaluate("""() => ({
      scroll:document.querySelector('#scroller').scrollTop,
      promptY:document.querySelector('[data-turn-key="turn-31"] [data-user-message-bubble]').getBoundingClientRect().top,
      extent:document.querySelector('#scroller').scrollHeight
    })""")
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('() => !window.__jotpatchStage0.navigationBusy',timeout=12000)
    text=page.locator('#jotpatch-root #jp-toast-text').inner_text()
    assert '暂时无法定位' in text,text
    after=page.evaluate("""() => ({
      scroll:document.querySelector('#scroller').scrollTop,
      promptY:document.querySelector('[data-turn-key="turn-31"] [data-user-message-bubble]').getBoundingClientRect().top,
      extent:document.querySelector('#scroller').scrollHeight
    })""")
    # In a lazy-paged scroller absolute scrollTop changes when older content
    # is prepended; the reading prompt's on-screen Y is what should be stable.
    assert abs(before['promptY']-after['promptY'])<90,(before,after)
    assert result(page)['metrics']['outcome']=='unreachable'
    print('PASS bounded unreachable, reading prompt visually restored:',result(page)['metrics'],before,after)
    page.close()





def stale_checkpoint(context):
    page=virtual_page(context)
    discover_old_turns(page)
    enable_lab(page)
    page.evaluate("document.querySelector('#scroller').scrollTo({top:150})")
    page.wait_for_timeout(950)
    page.evaluate("document.querySelector('#scroller').scrollTo({top:7900})")
    page.wait_for_timeout(1000)
    page.evaluate('''() => {
       document.querySelector('#virtual-root').style.height='10600px';
       const index=window.__jotpatchStage0.navigationLabIndex;
       window.__oldCheckpointExtent=index.lookup('data-turn-key:turn-0').extent;
       window.__newExtent=document.querySelector('#scroller').scrollHeight;
    }''')
    assert page.evaluate('window.__newExtent/window.__oldCheckpointExtent')>1.2
    page.locator('#jotpatch-root .rail-turn').first.click()
    page.wait_for_function('''() => {
      const prompt=document.querySelector('[data-turn-key="turn-0"] [data-user-message-bubble]');
      return prompt && !window.__jotpatchStage0.navigationBusy;
    }''',timeout=19000)
    info=result(page)['metrics'];assert info['strategy']=='progressive' and info['outcome']=='arrived',info
    print('PASS stale checkpoint rejected after scroll-extent growth, progressive fallback:',info)
    page.close()


def note_recovery(context):
    page=virtual_page(context)
    enable_lab(page)
    page.evaluate("document.querySelector('#scroller').scrollTo({top:800})")
    page.wait_for_timeout(950)
    select_text(page,'#answer-2','common-marker')
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    page.locator('#jotpatch-root .paper').last.locator('.note-editor').fill('实验版两阶段便签恢复')
    page.wait_for_timeout(480)
    assert page.evaluate('window.__jotpatchStage0.notes[0].conversationTurnId')=='data-turn-key:turn-2'
    page.locator('#jotpatch-root .paper .close').last.click()
    discover_old_turns(page)
    expect(page.locator('#jotpatch-root .rail-pin.missing')).to_have_count(1)
    page.locator('#jotpatch-root .rail-pin').first.click()
    page.wait_for_function('''() => {
       const app=window.__jotpatchStage0,match=app.matches.get(app.notes[0].id);
       return !app.navigationBusy && match && match.range.startContainer.parentElement
         .closest('[data-turn-key]')?.dataset.turnKey==='turn-2';
    }''',timeout=18000)
    expect(page.locator('#jotpatch-root .paper .note-editor')).to_contain_text('实验版两阶段便签恢复')
    assert result(page)['metrics']['outcome']=='arrived',result(page)
    print('PASS: lab restores exact quote INSIDE saved turn, despite duplicate quotes:',result(page)['metrics'])
    page.close()


def replaced_root(context):
    page=context.new_page()
    page.set_content('''<style>#scroller{width:630px;height:420px;overflow-y:auto;border:1px solid #ccc}
       #holder{height:5600px;position:relative}.unit{position:absolute;height:280px;width:100%}</style>
       <div id="scroller"><main id="holder"></main></div>''')
    page.add_script_tag(path=str(ROOT/'dist/content.js'))
    page.evaluate('''() => {
      let swapped=0,scrollEvents=0;
      const root=()=>document.querySelector('#scroller');
      function render(){
        const scroll=root(),holder=scroll.querySelector('#holder'),position=Math.floor(scroll.scrollTop/280);
        holder.replaceChildren();
        for(let i=Math.max(0,position-2);i<Math.min(20,position+4);i++){
          const element=document.createElement('article');element.className='unit';
          element.dataset.turnKey='old-'+i;element.textContent='Question '+i;
          element.style.top=(i*280)+'px';holder.appendChild(element);
        }
      }
      function scrolling(){
        scrollEvents++;render();
        if(scrollEvents!==2)return;
        const old=root(),next=old.cloneNode(false);
        const top=old.scrollTop;
        next.append(...old.childNodes);old.replaceWith(next);
        next.addEventListener('scroll',scrolling);
        next.scrollTop=top;
        swapped++;
        render();
      }
      const scroll=root();scroll.addEventListener('scroll',scrolling);
      scroll.scrollTop=scroll.scrollHeight-scroll.clientHeight;render();
      window.__swapped=()=>swapped;
      window.__getTurns=()=>Array.from({length:20},(_,i)=>({
        id:'old-'+i,stableId:'old-'+i,order:i,preview:'',
        element:document.querySelector(`[data-turn-key="old-${i}"]`)
      }));
      window.__labRun=()=>JP.recoverConversationTurnLab({
        targetId:'old-0',getRoot:root,getTurns:window.__getTurns,
        signal:new AbortController().signal,checkpoints:new JP.NavigationLabIndex(),
        maxMilliseconds:14000,maxSteps:90
      }).then(info=>{window.__resultRoot={outcome:info.outcome,steps:info.steps,scroll:root().scrollTop};});
    }''')
    page.evaluate('window.__labRun()')
    page.wait_for_function('() => !!window.__resultRoot',timeout=17000)
    info=page.evaluate('window.__resultRoot')
    swapped=page.evaluate('window.__swapped()')
    assert info['outcome']=='arrived' and swapped>=1,(info,swapped)
    print('PASS: React-like replaced scroll root recovered correctly:',info,'swaps',swapped)
    page.close()


def run(case):
    with sync_playwright() as p:
        browser=launch_browser(p)
        context=browser.new_context(viewport={'width':1200,'height':800})
        errors=[]
        try:
            if case=='options':options(context)
            elif case=='fixed':fixed(context)
            elif case=='stale':stale_checkpoint(context)
            elif case in ('paging','baseline'):paging(context,'lab' if case=='paging' else 'baseline')
            elif case=='reverse':reverse(context)
            elif case=='notes':note_recovery(context)
            elif case=='replace-root':replaced_root(context)
            elif case=='cancel':cancelled(context)
            elif case=='unreachable':unreachable(context)
            else:raise ValueError('unknown case '+case)
        finally:
            context.close();browser.close()
        assert not errors,errors

if __name__=='__main__':run(sys.argv[1] if len(sys.argv)>1 else 'fixed')
