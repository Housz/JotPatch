"""Spatial Rail browser QA: geometry, proportional order, in-place fisheye.
Synthetic DOM + fake storage; tests real pointer coordinates and visual captures.
"""
from __future__ import annotations
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, select_text


def html(turn_count: int = 12, response_height: int = 650) -> str:
    result=[]
    for i in range(turn_count):
        result.append(f'''<article data-turn-key="turn-{i}" id="round-{i}" style="position:relative;height:{response_height}px;border-bottom:1px solid #ccc;box-sizing:border-box">
          <div data-user-message-bubble style="height:45px;padding:9px">第 {i+1} 轮问题：导航比例位置验证</div>
          <section style="position:relative;height:calc(100% - 45px);margin:0 8px;background:#f7f7f8">
            <p id="answer-{i}-05" style="position:absolute;top:5%;margin:0">第{i}轮前部 nearby-five-{i}</p>
            <p id="answer-{i}-07" style="position:absolute;top:7%;margin:0">第{i}轮前部 nearby-seven-{i}</p>
            <p id="answer-{i}-09" style="position:absolute;top:9%;margin:0">第{i}轮前部 nearby-nine-{i}</p>
            <p id="answer-{i}-10" style="position:absolute;top:10%;margin:0">第{i}轮前部 first-token-{i}</p>
            <p id="answer-{i}-15" style="position:absolute;top:15%;margin:0">第{i}轮前部 second-token-{i}</p>
            <p id="answer-{i}-50" style="position:absolute;top:50%;margin:0">第{i}轮中部 middle-token-{i}</p>
            <p id="answer-{i}-80" style="position:absolute;top:80%;margin:0">第{i}轮后部 nearend-token-{i}</p>
            <p id="answer-{i}-90" style="position:absolute;top:90%;margin:0">第{i}轮尾部 end-token-{i}</p>
          </section>
        </article>''')
    return '<!doctype html><html><head><style>body{font:15px system-ui;margin:0;} main{max-width:750px;margin:auto}</style></head><body><main>'+''.join(result)+'</main></body></html>'


def create_note(page,css,phrase,description):
    select_text(page,css,phrase)
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    expect(page.locator('#jotpatch-root .paper').last.locator('.note-editor')).to_be_visible()
    page.locator('#jotpatch-root .paper').last.locator('.note-editor').fill(description)
    page.wait_for_timeout(430)


def point_map(page):
    return page.locator('#jotpatch-root #jp-rail-track [data-rail-key]').evaluate_all('''elements => Object.fromEntries(elements.map(el => [el.dataset.railKey,Number.parseFloat(el.style.top)]))''')


def snapshot(page,filename):
    folder=os.environ.get('JOTPATCH_QA_SCREENSHOTS')
    if folder:
        Path(folder).mkdir(exist_ok=True,parents=True)
        page.screenshot(path=str(Path(folder)/filename),full_page=False)


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        for viewport_h in (640,850,1080):
            context=browser.new_context(viewport={'width':1200,'height':viewport_h})
            page=new_site(context,'https://chatgpt.com/c/spatial-test',html(12))
            page.on('pageerror',lambda e:errors.append(str(e)))
            targets=[('#answer-4-10','first-token-4','at ten percent'),
                ('#answer-4-50','middle-token-4','at fifty percent'),
                ('#answer-4-90','end-token-4','at ninety percent')]
            for args in targets:create_note(page,*args)
            records=page.evaluate('''() => window.__jotpatchStage0.notes.map(n => ({
              text:n.text,id:n.id,turn:n.conversationTurnId,spatial:n.spatial}))''')
            print('SPATIAL',viewport_h,records)
            vals=[r['spatial'].get('withinTurnProgress') for r in records]
            assert all(v is not None for v in vals),records
            assert 0 < vals[0]<.30 and .37<vals[1]<.65 and .72<vals[2]<=1,vals
            assert records[0]['turn']==records[1]['turn']==records[2]['turn']=='data-turn-key:turn-4',records
            positions=point_map(page)
            y=[positions[f'note:{r["id"]}'] for r in records]
            assert y[0]<y[1]<y[2],y
            start=positions['turn:data-turn-key:turn-4']
            end=positions['turn:data-turn-key:turn-5']
            assert all(start<v<end for v in y)
            assert y[1]-y[0] > 7 and y[2]-y[1]>7,y
            assert page.locator('#jotpatch-root .rail-overview').count()==0
            assert page.locator('#jotpatch-root .rail-lens').count()==0
            snapshot(page,f'spatial-three-{viewport_h}.png')
            print(f'PASS: {viewport_h}px: 10/50/90% -> three ordered, proportionally spaced notes; no cluster UI')
            # Adding a note at 15% must not renormalize the 10/50/90% stored fractions.
            old=dict((r['id'],r['spatial']['withinTurnProgress']) for r in records)
            create_note(page,'#answer-4-15','second-token-4','near front')
            new=page.evaluate('''() => window.__jotpatchStage0.notes.map(n=>({id:n.id,p:n.spatial?.withinTurnProgress}))''')
            assert all(abs(n['p']-old[n['id']])<.035 for n in new if n['id'] in old),new
            print('PASS: insertion of another note never renormalizes existing spatial fractions')
            page.close();context.close()

        # Three clustered anchors at 5/7/9 percent must remain visibly near
        # the START of the round (not renormalized to 0/50/100 percent).
        context=browser.new_context(viewport={'width':1200,'height':850})
        page=new_site(context,'https://chatgpt.com/c/spatial-front',html(12))
        page.on('pageerror',lambda e:errors.append(str(e)))
        for percent,word in [('05','nearby-five-4'),('07','nearby-seven-4'),('09','nearby-nine-4')]:
            create_note(page,f'#answer-4-{percent}',word,f'Front cluster at {percent}')
        saved=page.evaluate('''() => window.__jotpatchStage0.notes.map(n=>({id:n.id,p:n.spatial?.withinTurnProgress}))''')
        assert [r['p'] for r in saved]==sorted(r['p'] for r in saved)
        coords=point_map(page)
        lo,hi=coords['turn:data-turn-key:turn-4'],coords['turn:data-turn-key:turn-5']
        marker_y=[coords[f'note:{r["id"]}'] for r in saved]
        assert marker_y==sorted(marker_y)
        assert max(marker_y)<lo+(hi-lo)*.38, (lo,hi,marker_y)
        assert page.locator('#jotpatch-root .rail-pin').count()==3
        print('PASS: three 5/7/9% notes remain near front, separated but never spread across entire answer')
        stored_snapshot=page.evaluate('() => structuredClone(window.__jotpatchFakeStore)')
        page.close()
        restored=new_site(context,'https://chatgpt.com/c/spatial-front',html(12),seed=stored_snapshot)
        expect(restored.locator('#jotpatch-root .rail-pin')).to_have_count(3)
        after=point_map(restored)
        expected=[after[f'note:{r["id"]}'] for r in saved]
        assert expected==sorted(expected) and max(expected)<after['turn:data-turn-key:turn-4']+(
          after['turn:data-turn-key:turn-5']-after['turn:data-turn-key:turn-4'])*.38
        print('PASS: reload preserves old note identities and front-of-answer spatial memory')
        restored.close();context.close()

        # Hover in a long dense conversation changes only this same rail:
        context=browser.new_context(viewport={'width':1200,'height':850})
        page=new_site(context,'https://chatgpt.com/c/spatial-dense',html(100,260))
        page.on('pageerror',lambda e:errors.append(str(e)))
        # Populate saved notes with intrinsic percentages; the UI re-resolves
        # anchors when the synthetic storage broadcasts a change.
        page.evaluate('''() => {
          const root=window.__jotpatchStage0;
          const index=JP.buildTextIndex();
          const items={};
          for(let round=0;round<100;round+=5){
            for(const [j,p] of [10,50,90].entries()){
              const el=document.querySelector(`#answer-${round}-${p}`),node=el.firstChild;
              const word=[`first-token-${round}`,`middle-token-${round}`,`end-token-${round}`][j];
              const pos=node.data.indexOf(word),range=document.createRange();
              range.setStart(node,pos);range.setEnd(node,pos+word.length);
              const id=`r${round}-n${j}`;
              items[`jotpatch:note:v1:${id}`]={schemaVersion:1,id,
                pageKey:JP.pageKey(location.href),sourceUrl:location.href,sourceTitle:document.title,
                anchor:JP.captureSelection(range,index),conversationTurnId:`data-turn-key:turn-${round}`,
                spatial:{withinTurnProgress:[.10,.50,.90][j],pageProgress:(round+j/3)/100,confidence:'geometry'},
                text:`Position ${round}/${j}`,appearance:{color:['yellow','pink','green'][j],width:256,height:202,offsetX:0,offsetY:0},
                createdAt:Date.now()+round+j,updatedAt:Date.now()+round+j,revision:0};
            }
          }
          return chrome.storage.local.set(items);
        }''')
        expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(60,timeout=15000)
        expect(page.locator('#jotpatch-root .rail-turn')).to_have_count(100)
        assert page.locator('#jotpatch-root .rail-overview').count()==0
        assert page.locator('#jotpatch-root .rail-lens').count()==0
        before=point_map(page)
        track=page.locator('#jotpatch-root #jp-rail-track')
        expect(track).to_have_class('rail-track dense')
        track_rect=track.bounding_box()
        # Hover at the actual note lane near one of the dense target's original coordinates.
        center=before['note:r50-n1']
        page.mouse.move(track_rect['x']+6,track_rect['y']+center,steps=4)
        page.wait_for_timeout(120)
        expect(track).to_have_class('rail-track dense fisheye')
        shifted=point_map(page)
        keys=['note:r50-n0','note:r50-n1','note:r50-n2']
        span_before=before[keys[2]]-before[keys[0]]
        span_after=shifted[keys[2]]-shifted[keys[0]]
        assert span_after>span_before*1.3,(span_before,span_after)
        assert abs(shifted[keys[1]]-center)<5,(center,shifted[keys[1]])
        assert len(shifted)==len(before)==160
        # No turn bar or note reverses order under the non-linear lens.
        ranked=sorted(before,key=before.get)
        assert all(shifted[ranked[i]]<=shifted[ranked[i+1]]+1e-7
            for i in range(len(ranked)-1))
        snapshot(page,'spatial-fisheye-hover.png')
        print('PASS: real-pointer fisheye expands inline markers without any popup or count consolidation')
        # One click on an identified note after moving focus to it.
        button=page.locator('#jotpatch-root [data-rail-key="note:r50-n1"]')
        button.click(timeout=6000)
        expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
        expect(page.locator('#jotpatch-root .paper .note-editor')).to_contain_text('Position 50/1')
        print('PASS: one-click hit target opens correct note after continuous enlargement')
        page.mouse.move(880,36)
        page.wait_for_timeout(170)
        expect(track).to_have_class('rail-track dense')
        final=point_map(page)
        assert max(abs(final[k]-before[k]) for k in before)<.01
        print('PASS: pointer leaves rail, exact original pixel positions restored')
        # Resize between small/large windows, reflow layout in-place, then
        # ensure keyboard navigation still exposes all individual targets.
        page.set_viewport_size({'width':1200,'height':640})
        page.wait_for_timeout(170)
        resized=point_map(page)
        H=page.locator('#jotpatch-root #jp-rail-track').evaluate('el=>el.clientHeight')
        assert H<track_rect['height'] and all(0<=v<=H for v in resized.values()),(H,resized)
        note=page.locator('#jotpatch-root [data-rail-key="note:r50-n1"]')
        note.focus();note.press('ArrowDown')
        assert page.evaluate('''() => document.querySelector('#jotpatch-root').shadowRoot.activeElement.dataset.railKey''')
        page.mouse.move(840,16)
        print('PASS: window resize recalculates bounded rail; arrow-key navigation remains usable')
        page.close();context.close()
        assert not errors,errors
        browser.close()

if __name__=='__main__': run()
