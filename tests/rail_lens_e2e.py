"""Real-pointer dense-lens and virtualization regressions for v0.1.9.

Runs on synthetic markup, never a user's authenticated chat session.
Specifically tests the user-visible behavior omitted by v0.1.8's private-method test.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright, expect
from conversation_e2e import new_site, select_text
from rail_navigation_e2e import fixture


def seed_eight_notes(page, turn=35):
    page.evaluate('''(turn) => {
      const text=document.querySelector(`#answer-${turn}`).firstChild;
      const words=['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'];
      const index=JP.buildTextIndex(), items={},key=JP.pageKey(location.href);
      for(let i=0;i<words.length;i++) {
        const word=words[i],p=text.data.indexOf(word),range=document.createRange();
        range.setStart(text,p);range.setEnd(text,p+word.length);
        const anchor=JP.captureSelection(range,index);
        const color=['yellow','pink','green','blue','purple','gray'][i%6];
        const note={schemaVersion:1,id:`lens-note-${i}`,pageKey:key,
          sourceUrl:location.href,sourceTitle:document.title,anchor,
          conversationTurnId:`data-turn-key:round-${turn}`,
          text:`Note ${i} ${word}`,appearance:{color,width:256,height:202,offsetX:0,offsetY:0},
          createdAt:Date.now()+i,updatedAt:Date.now()+i,revision:0};
        items[`jotpatch:note:v1:${note.id}`]=note;
      }
      return chrome.storage.local.set(items);
    }''',turn)
    expect(page.locator('#jotpatch-root .rail-pin')).to_have_count(8)


def move_to_turn(page, turn=35):
    track=page.locator('#jotpatch-root #jp-rail-track')
    rect=track.bounding_box()
    bar=page.locator('#jotpatch-root .rail-turn').nth(turn).bounding_box()
    page.mouse.move(rect['x']+rect['width']-4,bar['y']+bar['height']/2,steps=3)


def test_dense(ctx, errors, height):
    page=new_site(ctx, 'https://chatgpt.com/c/jotpatch-lens',fixture(100))
    page.on('pageerror',lambda error: errors.append(str(error)))
    seed_eight_notes(page)
    expect(page.locator('#jotpatch-root #jp-rail-track')).to_have_class('rail-track dense')
    note_buttons=page.locator('#jotpatch-root .rail-pin')
    before=note_buttons.evaluate_all('els=>els.map(e=>parseFloat(e.style.top))')
    lens=page.locator('#jotpatch-root #jp-rail-lens')
    for cycle in range(4):
        move_to_turn(page)
        expect(lens).to_be_visible()
        expect(lens.locator('.rail-lens-note')).to_have_count(8)
        after=note_buttons.evaluate_all('els=>els.map(e=>parseFloat(e.style.top))')
        assert before==after,('overview markers moved on real pointer hover',cycle,before,after)
        bounds=lens.bounding_box()
        assert bounds['y']>=0 and bounds['y']+bounds['height']<=height+1,bounds
        # Travel from the rail into the overlay and hover the actual colored item.
        lens.locator('.rail-lens-note').nth(3).hover()
        expect(lens).to_be_visible()
        # Leaving both track and lens should clear hover-only UI.
        page.mouse.move(760,24)
        expect(lens).to_be_hidden(timeout=1800)
    print(f'PASS: {height}px viewport, 100 turns, 8 notes, real mouse hover/lens/exit x4')

    # No extra click: the expanded item directly jumps to a distinct note.
    move_to_turn(page)
    expect(lens).to_be_visible()
    lens.locator('.rail-lens-note').nth(6).click()
    expect(lens).to_be_hidden()
    card=page.locator('#jotpatch-root .paper')
    expect(card).to_have_count(1)
    expect(card.locator('.note-editor')).to_contain_text('Note 6 golf')
    print('PASS: expanded note immediately opens correct paper in ONE click')
    page.close()


def test_unresolved_colors(ctx, errors):
    page=new_site(ctx,'https://chatgpt.com/c/jotpatch-unmounted',fixture(13))
    page.on('pageerror',lambda error: errors.append(str(error)))
    select_text(page,'#answer-5','alpha')
    page.locator('#jotpatch-root #jp-bubble-pin').click()
    page.locator('#jotpatch-root .paper').last.locator('.note-editor').fill('便签颜色不能因原文卸载而变灰')
    paper=page.locator('#jotpatch-root .paper').last
    paper.locator('.menu-trigger').click()
    paper.locator('.colors button[aria-label="颜色：green"]').click()
    paper.locator('.menu-trigger').click()
    page.locator('#jotpatch-root .paper .close').click()
    expect(page.locator('#jotpatch-root .paper')).to_have_count(0)
    button=page.locator('#jotpatch-root .rail-pin').first
    expect(button).to_have_count(1)
    expected=button.evaluate('el=>getComputedStyle(el).backgroundColor')
    assert expected=='rgb(223, 241, 221)',expected
    page.evaluate("() => document.querySelector('#answer-5').remove()")
    expect(button).to_have_class('rail-pin missing', timeout=5000)
    actual=button.evaluate('el=>getComputedStyle(el).backgroundColor')
    assert actual==expected, ('color turned gray when virtualized',expected,actual)
    assert 'dashed' in button.evaluate('el=>getComputedStyle(el).borderTopStyle')
    print('PASS: virtualized source remains GREEN; dashed border signals unresolved anchor')
    button.hover()
    expect(page.locator('#jotpatch-root #jp-turn-preview')).to_contain_text('原文暂未加载')
    button.click()
    expect(page.locator('#jotpatch-root .paper')).to_have_count(1)
    expect(page.locator('#jotpatch-root .note-editor')).to_contain_text('便签颜色不能因原文卸载而变灰')
    # Mounted source returns, without modifying note color.
    page.evaluate('''() => {
      const p=document.createElement('p');p.id='answer-5';p.textContent='answer-5: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
      document.querySelector('[data-turn-key="round-5"]').append(p);
    }''')
    expect(button).not_to_have_class('rail-pin missing',timeout=5000)
    assert button.evaluate('el=>getComputedStyle(el).backgroundColor')==expected
    assert page.locator('#jotpatch-root .rail-pin').count()==1
    print('PASS: source unmount/remount preserves color, content, single note and edit access')
    page.close()


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        for height in (850,640):
            ctx=browser.new_context(viewport={'width':1200,'height':height})
            test_dense(ctx,errors,height)
            ctx.close()
        ctx=browser.new_context(viewport={'width':1200,'height':850})
        test_unresolved_colors(ctx,errors)
        assert not errors, errors
        ctx.close();browser.close()
    print('PASS: no uncaught page JS errors across all dense/virtualization scenarios')

if __name__=='__main__':run()
