"""Stage 1.8 navigation tests on synthetic ChatGPT DOM + mocked Chrome storage.

Tests the new timeline's hit targets, density focus lens, pinned/floating
semantics, hierarchical list and passive history. Not an authenticated test.
"""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, select_text
from browser_e2e import ROOT


def fixture(count=12):
    content=[]
    for i in range(count):
        content.append(f'''<article data-turn-key="round-{i}" style="min-height:180px;border-bottom:1px solid #ddd;padding:8px">
          <div data-user-message-bubble>提问 {i} 第 {i+1} 轮</div>
          <p id="answer-{i}" style="padding:8px">answer-{i}: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima</p>
        </article>''')
    return '''<!DOCTYPE html><html><head><style>body{font:16px Arial} main{max-width:760px;margin:auto}article{box-sizing:border-box}</style></head><body>''' + '<main>' + ''.join(content) + '</main></body></html>'


def top_px(locator):
    return locator.evaluate('el=>parseFloat(el.style.top)')


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':1200,'height':850})
        errors=[]
        page=new_site(ctx,'https://chatgpt.com/c/jotpatch-rail',fixture())
        page.on('pageerror',lambda error:errors.append(str(error)))
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(12)
        # The header icon is geometrically centered in the rail itself.
        rail=page.locator('#jotpatch-root #jp-rail').bounding_box()
        head=page.locator('#jotpatch-root #jp-list-toggle').bounding_box()
        assert abs((head['x']+head['width']/2)-(rail['x']+rail['width']/2))<=1.1,(rail,head)
        print('PASS: rail top button centered across rail width')

        for i,token in enumerate(['alpha','bravo','charlie','delta','echo']):
            select_text(page,'#answer-4',token)
            page.locator('#jotpatch-root #jp-bubble-pin').click()
            page.locator('#jotpatch-root .paper').last.locator('.note-editor').fill('单独便签 '+token)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(5)
        assert page.locator('#jotpatch-root .rail-note-cluster').count()==0
        positions=[top_px(item) for item in page.locator('#jotpatch-root .rail-pin').all()]
        assert positions==sorted(positions) and len(set(positions))==5,positions
        before=top_px(page.locator('#jotpatch-root .rail-turn').nth(4))
        after=top_px(page.locator('#jotpatch-root .rail-turn').nth(5))
        assert all(before<y<after for y in positions),(before,positions,after)
        page.locator('#jotpatch-root .rail-pin').nth(2).hover()
        expect(page.locator('#jotpatch-root #jp-turn-preview')).to_contain_text('单独便签 charlie')
        page.locator('#jotpatch-root .rail-pin').nth(2).click()
        print('PASS: five notes in one round have independent hit targets and immediate previews')

        page.locator('#jotpatch-root #jp-list-toggle').click()
        expect(page.locator('#jotpatch-root .note-entry.nested')).to_have_count(5)
        expect(page.locator('#jotpatch-root .note-entry .entry-pin')).to_have_count(5)
        assert page.locator('#jotpatch-root .note-entry').filter(has_text='已关联原文').count()==0
        assert page.locator('#jotpatch-root .scan-history').count()==0
        page.locator('#jotpatch-root .list-header button').click()
        print('PASS: notes nested under their conversation turn without a redundant status row or history scan')

        paper=page.locator('#jotpatch-root .paper').last
        anchor_count=page.locator('#jotpatch-root .paper-pin:not([hidden])').count()
        assert anchor_count==5,anchor_count
        paper.locator('.menu-trigger').click()
        expect(paper.locator('.note-mode')).to_contain_text('贴在原文')
        paper.locator('.menu-trigger').click()
        top=paper.bounding_box()
        paper.locator('.paper-pin').click()
        after_rect=paper.bounding_box()
        assert abs(top['x']-after_rect['x'])<5 and abs(top['y']-after_rect['y'])<5,(top,after_rect)
        expect(paper.locator('.paper-pin')).to_be_hidden()
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(4)
        expect(page.locator('#jotpatch-root #jp-loose-toggle')).to_be_visible()
        paper.locator('.menu-trigger').click()
        expect(paper.locator('.note-mode')).to_contain_text('本页悬浮')
        paper.locator('.menu-trigger').click()
        page.locator('#jotpatch-root #jp-undo').click()
        expect(paper.locator('.paper-pin')).to_be_visible()
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(5)
        print('PASS: one-way unpin preserves screen position, shows distinct menu state and supports undo')
        page.close()

        # Dense timeline: 100 turns, eight individual markers in one round.
        dense=new_site(ctx,'https://chatgpt.com/c/jotpatch-dense',fixture(100))
        dense.on('pageerror',lambda error:errors.append(str(error)))
        dense.evaluate('''() => {
          const text=document.querySelector('#answer-35').firstChild, words=['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'];
          const index=JP.buildTextIndex();
          const items={};
          const page=JP.pageKey(location.href);
          for(let i=0;i<words.length;i++){
            const word=words[i],from=text.data.indexOf(word),r=document.createRange();
            r.setStart(text,from);r.setEnd(text,from+word.length);
            const anchor=JP.captureSelection(r,index);
            const note={schemaVersion:1,id:`density-note-${i}`,pageKey:page,
              sourceUrl:location.href,sourceTitle:document.title,anchor,
              conversationTurnId:'data-turn-key:round-35',text:`备注${i+1} ${word}`,
              appearance:{color:['yellow','pink','green','blue','purple','gray'][i%6],width:256,height:202,offsetX:0,offsetY:0},
              createdAt:Date.now()+i,updatedAt:Date.now()+i,revision:0};
            items[`jotpatch:note:v1:${note.id}`]=note;
          }
          return chrome.storage.local.set(items);
        }''')
        expect(dense.locator('#jotpatch-root .rail-pin')).to_have_count(8)
        track=dense.locator('#jotpatch-root #jp-rail-track')
        expect(track).to_have_class('rail-track dense')
        baseline=dense.locator('#jotpatch-root .rail-pin').evaluate_all('els=>els.map(e=>parseFloat(e.style.top))')
        rail_rect=track.bounding_box()
        round_y=dense.locator('#jotpatch-root .rail-turn').nth(35).bounding_box()
        # REAL mouse hover, not an invocation of an internal TS private method.
        dense.mouse.move(rail_rect['x']+rail_rect['width']-4,round_y['y']+round_y['height']/2,steps=3)
        expect(dense.locator('#jotpatch-root #jp-rail-lens')).to_be_visible()
        expect(dense.locator('#jotpatch-root #jp-rail-lens .rail-lens-note')).to_have_count(8)
        expect(track).to_have_class('rail-track dense focused')
        after=dense.locator('#jotpatch-root .rail-pin').evaluate_all('els=>els.map(e=>parseFloat(e.style.top))')
        assert baseline==after,(baseline,after)
        lens=dense.locator('#jotpatch-root #jp-rail-lens')
        assert lens.bounding_box()['width'] >= 120
        # Click a *particular* note directly in the expanded lens.
        lens.locator('.rail-lens-note').nth(5).click()
        expect(lens).to_be_hidden()
        expect(dense.locator('#jotpatch-root .paper')).to_have_count(1)
        assert dense.locator('#jotpatch-root .rail-note-cluster').count()==0
        print('PASS: REAL pointer hover expands eight direct targets while stable overview never reflows')
        dense.screenshot(path='/mnt/data/JotPatch-stage18-dense-qa.png')
        dense.close()

        assert not errors,errors
        ctx.close();browser.close()

if __name__=='__main__':run()
