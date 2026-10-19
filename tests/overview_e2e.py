"""Real-pointer overview/hover regressions for v0.1.10.

This tests the *product expectation* rather than calling private TypeScript
methods: even a 12-round chat with 4+ notes must display multicolor summary
stripes, and note-only fallback must work when ChatGPT virtualizes most turns.
Synthetic pages; no authenticated ChatGPT/Gemini content is accessed.
"""
from __future__ import annotations
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site
from rail_navigation_e2e import fixture


def screenshot_path(name: str) -> str | None:
    target = os.environ.get('JOTPATCH_E2E_SCREENSHOTS')
    if not target: return None
    Path(target).mkdir(parents=True, exist_ok=True)
    return str(Path(target) / name)


def seed_notes(page, selector: str, count: int, *, prefix: str = 'paper', uniform=False):
    page.evaluate('''({selector,count,prefix,uniform}) => {
      const paragraph=document.querySelector(selector), text=paragraph.firstChild;
      const words=['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet','kilo','lima'];
      const storage={},index=JP.buildTextIndex(),key=JP.pageKey(location.href);
      for(let i=0;i<count;i++){
        const word=words[i%words.length], offset=text.data.indexOf(word);
        if(offset<0)throw new Error('Test word missing '+word);
        const range=document.createRange();range.setStart(text,offset);range.setEnd(text,offset+word.length);
        const anchor=JP.captureSelection(range,index);
        const colors=['yellow','pink','green','blue','purple','gray'];
        const note={schemaVersion:1,id:`${prefix}-${i}`,pageKey:key,sourceUrl:location.href,
          sourceTitle:document.title,anchor,text:`${prefix}: note ${i} ${word}`,
          appearance:{color:uniform?'yellow':colors[i%colors.length],width:256,height:202,offsetX:0,offsetY:0},
          createdAt:10000+i,updatedAt:10000+i,revision:0};
        storage[`jotpatch:note:v1:${note.id}`]=note;
      }
      return chrome.storage.local.set(storage);
    }''',{'selector':selector,'count':count,'prefix':prefix,'uniform':uniform})


def check_multicolor_overview(page, count: int, *, selectors: int = 1):
    overview=page.locator('#jotpatch-root .rail-overview')
    expect(overview).to_have_count(selectors)
    for i in range(selectors):
        marker=overview.nth(i)
        assert marker.is_visible()
        assert int(marker.get_attribute('data-note-count'))>=count
        assert len(marker.locator('.rail-overview-stripe').all())>=2
        # Distinct real CSS colors: at least three, when seeded palette varies.
        colors=marker.locator('.rail-overview-stripe').evaluate_all(
            'els=>els.map(el=>getComputedStyle(el).backgroundColor)')
        assert len(set(colors))>=3,colors
        assert marker.evaluate('el=>getComputedStyle(el).display')=='flex'
    return overview


def hover_and_click(page, marker, count: int, wanted: int, expected: str, screenshot=None):
    before=marker.evaluate('el=>parseFloat(el.style.top)')
    marker.hover()
    lens=page.locator('#jotpatch-root #jp-rail-lens')
    expect(lens).to_be_visible()
    expect(lens.locator('.rail-lens-note')).to_have_count(count)
    after=marker.evaluate('el=>parseFloat(el.style.top)')
    if screenshot: page.screenshot(path=screenshot)
    assert before==after,('Overview jumped when hovering',before,after)
    lens.locator('.rail-lens-note').nth(wanted).click()
    expect(lens).to_be_hidden()
    expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
    assert expected in page.locator('#jotpatch-root .paper .note-editor').last.inner_text()


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        for height in (640,850,1080):
            ctx=browser.new_context(viewport={'width':1200,'height':height})
            page=new_site(ctx,'https://chatgpt.com/c/four-notes',fixture(12))
            page.on('pageerror',lambda e:errors.append(str(e)))
            seed_notes(page,'#answer-4',4,prefix='local')
            summary=check_multicolor_overview(page,4).first
            if height==850 and screenshot_path('JotPatch-v0.1.10-overview-before-hover.png'):
                page.screenshot(path=screenshot_path('JotPatch-v0.1.10-overview-before-hover.png'))
            expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(0)
            hover_and_click(page,summary,4,2,'local: note 2',screenshot=screenshot_path(f'JotPatch-v0.1.10-hover-{height}px.png'))
            if screenshot_path(f'JotPatch-v0.1.10-overview-{height}px.png'):
                page.screenshot(path=screenshot_path(f'JotPatch-v0.1.10-overview-{height}px.png'))
            print(f'PASS: {height}px / 12 turns / four notes => multicolor overview + direct hover lens')
            page.close()
            ctx.close()

        # The user observed dozens of notes and STILL only individual dots.
        # Reproduce the case when ChatGPT mounts just the latest TWO turns,
        # so the conversation adapter intentionally falls back to page notes.
        ctx=browser.new_context(viewport={'width':1200,'height':850})
        page=new_site(ctx,'https://chatgpt.com/c/two-mounted-turns',fixture(2))
        page.on('pageerror',lambda e:errors.append(str(e)))
        seed_notes(page,'#answer-0',24,prefix='virtual')
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(0)
        summaries=page.locator('#jotpatch-root .rail-overview')
        expect(summaries.first).to_be_visible()
        assert summaries.count()>=1
        counts=[int(v) for v in summaries.evaluate_all('els=>els.map(e=>e.dataset.noteCount)')]
        assert sum(counts)==24,counts
        marker=summaries.first
        hover_and_click(page,marker,counts[0],0,'virtual: note',screenshot=screenshot_path('JotPatch-v0.1.10-fallback-hover.png'))
        print(f'PASS: 2 mounted turns / 24 notes => NOTE-ONLY fallback summaries {counts}')
        page.close()

        # Typical users may create every note in default YELLOW. A compact
        # overview must still appear; a mixture of colors isn't a prerequisite.
        yellow=new_site(ctx,'https://chatgpt.com/c/yellow-notes',fixture(12))
        yellow.on('pageerror',lambda e:errors.append(str(e)))
        seed_notes(yellow,'#answer-4',7,prefix='yellow',uniform=True)
        strips=yellow.locator('#jotpatch-root .rail-overview')
        expect(strips).to_have_count(1)
        expect(strips.first.locator('.rail-overview-stripe')).to_have_count(6)
        assert len(set(strips.first.locator('.rail-overview-stripe').evaluate_all(
            'els=>els.map(el=>getComputedStyle(el).backgroundColor)')))==1
        hover_and_click(yellow,strips.first,7,6,'yellow: note 6')
        print('PASS: 7 same-color yellow notes also render a segmented overview')
        yellow.close()

        # Dozens of notes scattered across many turns must ALSO compress by
        # actual screen-space pressure, even with only one note per round.
        distributed=new_site(ctx,'https://chatgpt.com/c/distributed-notes',fixture(60))
        distributed.on('pageerror',lambda e:errors.append(str(e)))
        distributed.evaluate('''() => {
          const ix=JP.buildTextIndex(),k=JP.pageKey(location.href),store={};
          for(let i=0;i<60;i+=2){
            const node=document.querySelector(`#answer-${i}`).firstChild;
            const start=node.data.indexOf('alpha'),range=document.createRange();
            range.setStart(node,start);range.setEnd(node,start+5);
            const note={schemaVersion:1,id:`distributed-${i}`,pageKey:k,sourceUrl:location.href,
              sourceTitle:document.title,anchor:JP.captureSelection(range,ix),
              conversationTurnId:`data-turn-key:round-${i}`,text:`One note in turn ${i}`,
              appearance:{color:['yellow','green','pink'][i%3],width:256,height:202,offsetX:0,offsetY:0},
              createdAt:2000+i,updatedAt:2000+i,revision:0};
            store[`jotpatch:note:v1:${note.id}`]=note;
          }
          return chrome.storage.local.set(store);
        }''')
        summary=distributed.locator('#jotpatch-root .rail-overview')
        expect(summary.first).to_be_visible()
        assert summary.count()>=4, summary.count()
        source=summary.first
        source.hover()
        lens=distributed.locator('#jotpatch-root #jp-rail-lens')
        expect(lens).to_be_visible()
        count=lens.locator('.rail-lens-note').count()
        assert count>=2
        source_text=lens.locator('.rail-lens-note').first.inner_text()
        lens.locator('.rail-lens-note').first.click()
        expect(distributed.locator('#jotpatch-root .paper')).to_have_count(1)
        assert source_text in distributed.locator('#jotpatch-root .paper .note-editor').last.inner_text()
        print(f'PASS: 60 turns / 30 notes in DIFFERENT turns => {summary.count()} compact overviews; jump verified')
        distributed.close()

        # Ordinary webpages have no conversation adapter at all; 30 notes
        # across the document must be grouped into visible nearby summaries.
        content='<!doctype html><html><body><main>'+''.join(
            f'<p id="p-{i}" style="padding:22px;margin:5px">Paragraph {i}: unique{i} alpha bravo charlie delta echo.</p>'
            for i in range(30))+'</main></body></html>'
        generic=new_site(ctx,'https://example.com/long-document',content)
        generic.on('pageerror',lambda e:errors.append(str(e)))
        generic.evaluate('''() => {
          const index=JP.buildTextIndex(),storage={},key=JP.pageKey(location.href),colors=['yellow','pink','green','blue','purple','gray'];
          for(let i=0;i<30;i++){
            const node=document.querySelector(`#p-${i}`).firstChild,p=node.data.indexOf(`unique${i}`),range=document.createRange();
            range.setStart(node,p);range.setEnd(node,p+(`unique${i}`).length);
            const note={schemaVersion:1,id:`generic-${i}`,pageKey:key,sourceUrl:location.href,
              sourceTitle:document.title,anchor:JP.captureSelection(range,index),text:`Generic note ${i}`,
              appearance:{color:colors[i%6],width:256,height:202,offsetX:0,offsetY:0},
              createdAt:i+1000,updatedAt:i+1000,revision:0};
            storage[`jotpatch:note:v1:${note.id}`]=note;
          }
          return chrome.storage.local.set(storage);
        }''')
        expect(generic.locator('#jotpatch-root .rail-overview').first).to_be_visible()
        assert generic.locator('#jotpatch-root .rail-overview').count()>=3
        first=generic.locator('#jotpatch-root .rail-overview').first
        first.hover()
        expect(generic.locator('#jotpatch-root #jp-rail-lens')).to_be_visible()
        assert generic.locator('#jotpatch-root #jp-rail-lens .rail-lens-note').count()>=2
        print('PASS: generic long webpage / 30 notes => visible colored summaries + hover lens')
        generic.close()
        assert not errors,errors
        ctx.close()
        browser.close()
    print('PASS: no uncaught JS exceptions in all overview scenarios')

if __name__=='__main__': run()
