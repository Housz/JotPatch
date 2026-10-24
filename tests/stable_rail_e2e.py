"""Stable Rail real-pointer acceptance tests (synthetic ChatGPT DOM).

Focuses on usability regressions that v0.1.11's animated fisheye checks missed:
stationary hit targets, local-only trigger, accurate click resolution, fixed
picker transit, sparse one-click, keyboard and no passive scroll interception.
"""
from __future__ import annotations
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site
from spatial_rail_e2e import html, create_note, point_map


def snap(page, name):
    folder=os.environ.get('JOTPATCH_QA_SCREENSHOTS')
    if folder:
        dest=Path(folder);dest.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(dest/name),full_page=False)


def seed_dense(page):
    page.evaluate('''() => {
      const index=JP.buildTextIndex(),store={};
      for(let i=0;i<100;i+=5)for(const [j,pos] of [10,50,90].entries()){
        const node=document.querySelector(`#answer-${i}-${pos}`).firstChild;
        const term=[`first-token-${i}`,`middle-token-${i}`,`end-token-${i}`][j];
        const offset=node.data.indexOf(term),range=document.createRange();
        range.setStart(node,offset);range.setEnd(node,offset+term.length);
        const id=`r${i}-n${j}`;
        store[`jotpatch:note:v1:${id}`]={schemaVersion:1,id,
          pageKey:JP.pageKey(location.href),sourceUrl:location.href,sourceTitle:document.title,
          anchor:JP.captureSelection(range,index),conversationTurnId:`data-turn-key:turn-${i}`,
          spatial:{withinTurnProgress:[.1,.5,.9][j],pageProgress:(i+j/3)/100,confidence:'geometry'},
          text:`Stored ${i}/${j}`,appearance:{color:['yellow','pink','green'][j],width:256,height:202,offsetX:0,offsetY:0},
          createdAt:5000+i+j,updatedAt:5000+i+j,revision:0};
      }
      return chrome.storage.local.set(store);
    }''')
    expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(60,timeout=15000)
    expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(100)


def dense_group(page, key='note:r50-n1'):
    groups=page.evaluate('''() => window.__jotpatchStage0.railCrowded.map(g=>({id:g.id,keys:g.keys,center:g.center}))''')
    group=next((g for g in groups if key in g['keys']),None)
    assert group,groups
    return group


def hover_group(page, group):
    track=page.locator('#jotpatch-root #jp-rail-track')
    rect=track.bounding_box()
    page.mouse.move(rect['x']+6,rect['y']+group['center'],steps=5)
    detail=page.locator('#jotpatch-root #jp-rail-detail')
    expect(detail).to_be_visible(timeout=3000)
    return detail


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        for height in (640,850):
            context=browser.new_context(viewport={'width':1200,'height':height})
            page=new_site(context,'https://chatgpt.com/c/stable-rail-dense',html(100,260))
            page.on('pageerror',lambda e:errors.append(str(e)))
            seed_dense(page)
            base=point_map(page)
            group=dense_group(page)
            detail=hover_group(page,group)
            assert point_map(page)==base,'DENSE pointer hover moved navigation targets'
            assert page.locator('#jotpatch-root .rail-track.fisheye').count()==0
            assert 2<=detail.locator('.rail-detail-option').count()<=12
            snap(page,f'stable-rail-{height}-dense.png')
            bound=detail.bounding_box()
            assert bound and bound['x']>=0 and bound['y']>=0 and bound['y']+bound['height']<=height+2,bound
            assert detail.locator('[data-rail-key="note:r50-n1"]').is_visible()
            # Direct pointer transition from rail to picker remains stable.
            detail.locator('[data-rail-key="note:r50-n1"]').hover()
            expect(detail).to_be_visible()
            assert point_map(page)==base
            print(f'PASS: {height}px, 100 turns, 60 notes: stable markers, local picker, mouse crossing')

            # Clicking a crowded target directly cannot silently pick one of its neighbors.
            page.mouse.move(770,24)
            expect(detail).to_be_hidden(timeout=1600)
            # In a true overlap a specific tiny button may be obscured by its
            # neighbor. Click the visible *pixel* in the local group instead.
            trackrect=page.locator('#jotpatch-root #jp-rail-track').bounding_box()
            page.mouse.click(trackrect['x']+6,trackrect['y']+group['center'])
            expect(detail).to_be_visible()
            assert page.locator('#jotpatch-root .paper').count()==0
            detail.locator('[data-rail-key="note:r50-n1"]').click()
            expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
            expect(page.locator('#jotpatch-root .paper .note-editor')).to_contain_text('Stored 50/1')
            assert point_map(page)==base
            print(f'PASS: {height}px, crowded click is disambiguated; exact target selected')

            # Escape and keyboard activation are accessible and deterministic.
            button=page.locator('#jotpatch-root [data-rail-key="note:r50-n1"]')
            button.focus();button.press('Enter')
            expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
            page.mouse.move(770,24)
            detail=hover_group(page,group)
            page.keyboard.press('Escape')
            expect(detail).to_be_hidden()
            assert point_map(page)==base
            print(f'PASS: {height}px, keyboard direct activation and Escape close')
            if height==850:
                detail=hover_group(page,group)
                frozen=point_map(page)
                # Simulate a new earlier message mounted by a React app while
                # the user reads a crowded selector. The active target must
                # not be re-built underneath the pointer.
                page.evaluate('''() => {
                  const article=document.createElement('article');
                  article.dataset.turnKey='turn-loaded-later';
                  article.innerHTML='<div data-user-message-bubble>稍后加载的另一轮问题</div>';
                  document.querySelector('main').appendChild(article);
                }''')
                page.wait_for_timeout(1170)
                expect(detail).to_be_visible()
                assert point_map(page)==frozen
                assert page.locator('#jotpatch-root .rail-turn').count()==100
                page.mouse.move(770,24)
                expect(detail).to_be_hidden(timeout=1800)
                expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(101,timeout=5000)
                print('PASS: virtualized chat mutation is queued during target selection and applied after exit')
            page.close();context.close()

        # Negative test: hundreds of gray bars alone can be very dense but
        # MUST NOT activate any local note selection panel.
        context=browser.new_context(viewport={'width':1200,'height':640})
        page=new_site(context,'https://chatgpt.com/c/stable-only-turns',html(100,260))
        page.on('pageerror',lambda e:errors.append(str(e)))
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(100)
        assert page.evaluate('window.__jotpatchStage0.railCrowded.length')==0
        rail=page.locator('#jotpatch-root #jp-rail-track').bounding_box()
        for fraction in (.12,.50,.88):
            page.mouse.move(rail['x']+rail['width']/2,rail['y']+rail['height']*fraction,steps=4)
            page.wait_for_timeout(290)
            expect(page.locator('#jotpatch-root #jp-rail-detail')).to_be_hidden()
        assert page.locator('#jotpatch-root .paper').count()==0
        print('PASS: gray-only 100-turn navigation has NO unwanted picker in sparse-note areas')
        page.close();context.close()

        # Sparse case: three widely separated note targets should be immediately
        # actionable with normal hover preview and without any auxiliary picker.
        context=browser.new_context(viewport={'width':1200,'height':850})
        page=new_site(context,'https://chatgpt.com/c/stable-sparse',html(12))
        page.on('pageerror',lambda e:errors.append(str(e)))
        for css,word,title in [('#answer-4-10','first-token-4','TEN'),('#answer-4-50','middle-token-4','FIFTY'),('#answer-4-90','end-token-4','NINETY')]:
            create_note(page,css,word,title)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        assert page.evaluate('window.__jotpatchStage0.railCrowded.length')==0
        before=point_map(page)
        for marker in page.locator('#jotpatch-root .rail-pin').all():
            marker.hover()
            expect(page.locator('#jotpatch-root #jp-rail-detail')).to_be_hidden()
            expect(page.locator('#jotpatch-root #jp-turn-preview')).to_be_visible()
            assert point_map(page)==before
        # Text-bound papers may be hidden while the original quote is offscreen.
        # Close via app state instead of asking Playwright to click hidden UI.
        page.evaluate('''() => window.__jotpatchStage0.notes.forEach(note=>window.__jotpatchStage0.closeCard(note.id))''')
        page.locator('#jotpatch-root .rail-pin').nth(1).click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        expect(page.locator('#jotpatch-root .note-editor')).to_contain_text('FIFTY')
        print('PASS: sparse targets retain one-click navigation, readable previews and unchanged positions')
        page.close();context.close()

        assert not errors,errors
        browser.close()
        print('PASS: no uncaught JavaScript exceptions across Stable Rail UX flows')


if __name__=='__main__':run()
