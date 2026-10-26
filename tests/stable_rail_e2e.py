"""Stable Rail real-pointer acceptance tests (synthetic ChatGPT DOM).

Focuses on usability regressions that v0.1.11's animated fisheye checks missed:
stationary hit targets, local-only trigger, accurate click resolution, fixed
picker transit, sparse one-click, keyboard and no passive scroll interception.
"""
from __future__ import annotations
from browser_e2e import launch_browser
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


def rail_preview(page):
    return page.locator('#jotpatch-root #jp-turn-preview')

def run():
    with sync_playwright() as p:
        browser=launch_browser(p)
        errors=[]
        for height in (640,850):
            context=browser.new_context(viewport={'width':1200,'height':height})
            page=new_site(context,'https://chatgpt.com/c/direct-rail-dense',html(100,260))
            page.on('pageerror',lambda e:errors.append(str(e)))
            seed_dense(page)
            track=page.locator('#jotpatch-root #jp-rail-track')
            expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(60)
            expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(100)
            assert page.locator('#jotpatch-root #jp-rail-detail').count()==0
            before=point_map(page)
            # Real hover of a physically visible note, not an internal method.
            pins=page.locator('#jotpatch-root .rail-pin')
            target=pins.nth(7)
            target.hover(force=True)
            expect(rail_preview(page)).to_be_visible()
            assert rail_preview(page).locator('small,header,[role=heading]').count()==0
            assert 'Stored' in rail_preview(page).inner_text()
            assert '原文便签' not in rail_preview(page).inner_text()
            assert point_map(page)==before
            # Actual physical pointer interaction, not synthetic click or
            # keyboard-only activation. Three near-overlapping note markers
            # must remain independently hittable (same Y, different X lanes).
            for j in range(3):
                key=f'note:r50-n{j}'
                marker=page.locator(f'#jotpatch-root [data-rail-key="{key}"]')
                box=marker.bounding_box()
                x=box['x']+box['width']/2; y=box['y']+box['height']/2
                assert page.evaluate('''({x,y,key}) => {
                  const root=document.querySelector('#jotpatch-root').shadowRoot;
                  return root.elementFromPoint(x,y)?.dataset?.railKey===key;
                }''',{'x':x,'y':y,'key':key}),f'not directly clickable: {key}'
                page.mouse.move(x,y)
                expect(rail_preview(page)).to_contain_text(f'Stored 50/{j}')
                assert rail_preview(page).locator('small').count()==0
                snap(page,f'simple-hover-{height}-{j}.png')
                page.mouse.click(x,y)
                expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
                expect(page.locator('#jotpatch-root .note-editor')).to_contain_text(f'Stored 50/{j}')
                page.evaluate('(id)=>window.__jotpatchStage0.closeCard(id)',f'r50-n{j}')
                expect(page.locator('#jotpatch-root .paper')).to_have_count(0)
            assert point_map(page)==before
            # A crowded gray prompt marker must also remain a direct physical
            # click target rather than accidentally hitting a colored note.
            prompt=page.locator('#jotpatch-root [data-rail-key="turn:data-turn-key:turn-50"]')
            bounds=prompt.bounding_box()
            mx=bounds['x']+bounds['width']/2; my=bounds['y']+bounds['height']/2
            assert page.evaluate('''({x,y})=>document.querySelector('#jotpatch-root').shadowRoot
              .elementFromPoint(x,y)?.dataset?.railKey==='turn:data-turn-key:turn-50' ''',{'x':mx,'y':my})
            page.mouse.move(mx,my)
            expect(rail_preview(page)).to_contain_text('导航比例位置验证')
            assert rail_preview(page).locator('small,header').count()==0
            page.mouse.click(mx,my)
            page.wait_for_function('''()=>{
              const prompt=document.querySelector('[data-turn-key="turn-50"] [data-user-message-bubble]');
              return prompt && prompt.getBoundingClientRect().top>0 && prompt.getBoundingClientRect().top<180;
            }''')
            assert page.locator('#jotpatch-root .paper').count()==0
            assert point_map(page)==before
            print(f'PASS: {height}px dense 100 turns + 60 notes: THREE direct physical clicks, direct gray turn, headerless hover, no picker')
            page.close();context.close()

        context=browser.new_context(viewport={'width':1200,'height':640})
        page=new_site(context,'https://chatgpt.com/c/direct-only-turns',html(100,260))
        page.on('pageerror',lambda e:errors.append(str(e)))
        for index in (15,50,85):
            line=page.locator('#jotpatch-root .rail-turn').nth(index)
            line.focus()
            expect(rail_preview(page)).to_contain_text('轮')
            assert '已发现第' not in rail_preview(page).inner_text()
            assert rail_preview(page).locator('small').count()==0
        assert page.locator('#jotpatch-root #jp-rail-detail').count()==0
        print('PASS: 100 gray bars: prompt-only hover, no auxiliary picker')
        page.close();context.close()

        context=browser.new_context(viewport={'width':1200,'height':850})
        page=new_site(context,'https://chatgpt.com/c/direct-sparse',html(12))
        page.on('pageerror',lambda e:errors.append(str(e)))
        for css,word,title in [('#answer-4-10','first-token-4','TEN'),
            ('#answer-4-50','middle-token-4','FIFTY'),('#answer-4-90','end-token-4','NINETY')]:
            create_note(page,css,word,title)
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        before=point_map(page)
        for marker in page.locator('#jotpatch-root .rail-pin').all():
            marker.hover()
            expect(rail_preview(page)).to_be_visible()
            assert rail_preview(page).locator('small,header').count()==0
            assert point_map(page)==before
        page.evaluate("() => window.__jotpatchStage0.notes.forEach(note=>window.__jotpatchStage0.closeCard(note.id))")
        page.locator('#jotpatch-root .rail-pin').nth(1).click()
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        expect(page.locator('#jotpatch-root .note-editor')).to_contain_text('FIFTY')
        print('PASS: sparse normal mouse one-click, notes open directly, labels are headerless')
        page.close();context.close()

        assert not errors,errors
        browser.close()
        print('PASS: no uncaught JavaScript errors')

if __name__=='__main__':run()
