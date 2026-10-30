"""v0.1.20 editor line clipboard + header-only paper collapse regression.

Uses real Chromium/Firefox editing events with synthetic page/storage. The
installed Firefox WebExtension lifecycle is also covered by Selenium CI.
"""
from playwright.sync_api import sync_playwright, expect
from browser_e2e import launch_browser, new_page

HTML="""<!doctype html><html lang="zh-CN"><body>
<p id="source">这段文本用于校验编辑器快捷键不会破坏原文锚定。</p>
</body></html>"""


def current_caret(editor, index=0, offset=1):
    editor.evaluate("""(el,config)=>{
      const p=el.querySelectorAll('p')[config.index];
      const target=p.querySelector('strong,em')?.firstChild||p.firstChild;
      if(!target || target.nodeType!==Node.TEXT_NODE)throw Error('No text node');
      const range=document.createRange();
      range.setStart(target,Math.min(target.length,config.offset));
      range.collapse(true);
      const sel=document.getSelection();sel.removeAllRanges();sel.addRange(range);
      el.focus();
    }""",{"index":index,"offset":offset})


def clipboard_event(editor,action):
    return editor.evaluate("""(el,action)=>{
      const data=new DataTransfer();
      const event=new ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true});
      el.dispatchEvent(event);
      return {text:data.getData('text/plain'),prevented:event.defaultPrevented};
    }""",action)


def saved(page):
    return page.evaluate("""() => Object.values(__jotpatchFakeStore)
      .filter(n => n?.schemaVersion===1 && !n.deletedAt)""")


def wait_saved(page,id,text):
    page.wait_for_function("""({id,text}) => Object.values(__jotpatchFakeStore)
      .some(note=>note?.id===id && note.text===text)""",arg={"id":id,"text":text})


def run():
    with sync_playwright() as playwright:
        browser=launch_browser(playwright)
        ctx=browser.new_context(viewport={"width":1100,"height":760})
        page=new_page(ctx,HTML)
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.locator("#jotpatch-root #jp-new").click()
        paper=page.locator("#jotpatch-root .paper").first
        editor=paper.locator(".note-editor")
        folded=paper.locator(".paper-collapse-toggle")
        note_id=paper.get_attribute("data-note-id")
        expect(folded).to_have_attribute("aria-expanded","true")
        expect(editor).to_be_visible()

        editor.fill("需要记住尺寸和正文")
        wait_saved(page,note_id,"需要记住尺寸和正文")
        original=paper.bounding_box()
        assert original and original["height"]>=132
        folded.click()
        expect(folded).to_have_attribute("aria-expanded","false")
        expect(editor).to_be_hidden()
        expect(paper.locator(".paper-foot")).to_be_hidden()
        expect(paper.locator(".resize-handle")).to_be_hidden()
        assert "需要记住尺寸" in paper.locator(".paper-collapse-summary").inner_text()
        collapsed=paper.bounding_box()
        assert collapsed and collapsed["height"]<=32,collapsed
        page.wait_for_function("""id => Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.appearance?.collapsed===true)""",arg=note_id)
        assert [n for n in saved(page) if n["id"]==note_id][0]["appearance"]["height"]==202
        print("PASS: header-only collapse keeps saved full paper height, text and aria-expanded")

        # A collapsed paper is still draggable; collapse is an appearance, not
        # a close or a change to the anchoring/storage identity.
        old_offset=paper.evaluate("el=>el.getBoundingClientRect().left")
        bar=paper.locator(".paper-head")
        rect=bar.bounding_box()
        assert rect
        page.mouse.move(rect["x"]+50,rect["y"]+12)
        page.mouse.down()
        page.mouse.move(rect["x"]+85,rect["y"]+18,steps=4)
        page.mouse.up()
        moved=paper.evaluate("el=>el.getBoundingClientRect().left")
        assert abs(moved-old_offset)>10,(old_offset,moved)
        print("PASS: collapsed header supports ordinary pointer dragging")

        folded.click()
        expect(folded).to_have_attribute("aria-expanded","true")
        expect(editor).to_be_visible()
        expanded=paper.bounding_box()
        assert expanded and expanded["height"]>=original["height"]-1
        assert editor.inner_text()=="需要记住尺寸和正文"
        page.wait_for_function("""id => Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.appearance?.collapsed===false)""",arg=note_id)
        folded.click()
        page.wait_for_function("""id => Object.values(__jotpatchFakeStore)
          .some(n=>n?.id===id && n.appearance?.collapsed===true)""",arg=note_id)
        snapshot=page.evaluate("()=>structuredClone(__jotpatchFakeStore)")
        page.close()
        reload=new_page(ctx,HTML,seed=snapshot)
        badge=reload.locator("#jotpatch-root #jp-loose-toggle")
        expect(badge).to_be_visible()
        badge.click()
        again=reload.locator("#jotpatch-root .paper").first
        expect(again.locator(".paper-collapse-toggle")).to_have_attribute("aria-expanded","false")
        assert again.bounding_box()["height"]<=32
        again.locator(".paper-collapse-toggle").click()
        expect(again.locator(".note-editor")).to_have_text("需要记住尺寸和正文")
        print("PASS: collapsed state and content restore through existing Note schema v1 on reload")

        # Test copy/cut Markdown line without selection; select a caret in bold
        # content and preserve the other paragraphs.
        editor=again.locator(".note-editor")
        editor.evaluate("""el=>{
          JP.renderMarkdown(el,'Alpha\\n**Beta**\\nGamma');
          el.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        wait_saved(reload,note_id,"Alpha\n**Beta**\nGamma")
        current_caret(editor,1,2)
        copied=clipboard_event(editor,"copy")
        assert copied=={"text":"**Beta**\n","prevented":True},copied
        assert editor.locator("strong").count()==1
        current_caret(editor,1,2)
        cut=clipboard_event(editor,"cut")
        assert cut=={"text":"**Beta**\n","prevented":True},cut
        wait_saved(reload,note_id,"Alpha\nGamma")
        print("PASS: empty-selection Ctrl/Cmd+C/X use current Markdown line, cut saves and preserves adjacent lines")

        # Any selected text must retain the browser's ordinary copy/cut
        # semantics and must not be replaced by a whole line.
        editor.evaluate("""el=>{
          const node=el.querySelector('p').firstChild, r=document.createRange();
          r.setStart(node,0);r.setEnd(node,2);
          const sel=document.getSelection();sel.removeAllRanges();sel.addRange(r);
          el.focus();
        }""")
        selected=clipboard_event(editor,"copy")
        assert selected["prevented"] is False,selected
        assert editor.inner_text().startswith("Alpha")
        print("PASS: non-empty text selections retain native browser clipboard handling")

        # Ctrl+Tab is not an indentation shortcut. Even a dispatched event
        # must not be prevented or mutate the existing Markdown.
        current_caret(editor,0,1)
        keyboard=editor.evaluate("""el=>{
          const event=new KeyboardEvent('keydown',{
            key:'Tab',ctrlKey:true,bubbles:true,cancelable:true
          });
          const allowed=el.dispatchEvent(event);
          return {allowed,prevented:event.defaultPrevented};
        }""")
        assert keyboard=={"allowed":True,"prevented":False},keyboard
        assert [n for n in saved(reload) if n["id"]==note_id][0]["text"]=="Alpha\nGamma"
        current_caret(editor,0,0)
        editor.press("Tab")
        editor.press("Shift+Tab")
        wait_saved(reload,note_id,"Alpha\nGamma")
        print("PASS: Tab / Shift+Tab remain, Ctrl+Tab is never intercepted")

        # The native clipboard shortcut should really fire a browser copy
        # event; actual platform clipboard contents are not read by the test.
        current_caret(editor,0,1)
        reload.evaluate("""() => {
          window.__lineCopyObserved=[];
          document.addEventListener('copy', e=>{
            __lineCopyObserved.push({prevented:e.defaultPrevented,
              text:e.clipboardData?.getData('text/plain')||''});
          });
        }""")
        editor.press("Control+c")
        reload.wait_for_function("() => __lineCopyObserved.length>0")
        trace=reload.evaluate("() => __lineCopyObserved.at(-1)")
        assert trace["prevented"] and trace["text"].startswith("Alpha"),trace
        print("PASS: actual Control+C keyboard event uses line clipboard handler in contenteditable")

        assert not errors,errors
        reload.close();ctx.close();browser.close()


if __name__=="__main__":
    run()
